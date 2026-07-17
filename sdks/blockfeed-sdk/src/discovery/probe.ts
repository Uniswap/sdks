import type { Currency } from '@uniswap/sdk-core'
import type { Address } from 'viem'
import { getAddress } from 'viem'

import { QUOTER_V2_ABI, V2_PAIR_ABI, V4_QUOTER_ABI } from '../abis'
import { getChainAddresses } from '../addresses'
import type { BlockfeedClient, PoolKeyStruct } from '../types'

import type { CandidatePool } from './types'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address
/** v4 quoter's `exactAmount` is `uint128`; a probe that would overflow it is treated as unquotable. */
const MAX_UINT128 = (1n << 128n) - 1n

/**
 * The result of two-way probe-quoting a single candidate at a fixed notional:
 * - `buyOut` — units of `base` received for spending `notional` of `quote` (the buy leg, quote→base);
 * - `roundTripOut` — units of `quote` received for selling that `buyOut` of `base` straight back
 *   (the round-trip leg, base→quote).
 *
 * Either value is `0n` when its probe reverted, quoted zero, or could not be issued (e.g. a v4
 * amount exceeding `uint128`, or a round-trip whose `buyOut` was already zero).
 */
export interface ProbeResult {
  candidate: CandidatePool
  buyOut: bigint
  roundTripOut: bigint
}

/** viem `multicall({ allowFailure: true })` per-call outcome. */
type RawMulticallResult = { status: 'success'; result: unknown } | { status: 'failure'; error: Error }

/** A single contract read shaped for viem `multicall`. */
interface RawContract {
  address: Address
  abi: unknown
  functionName: string
  args: readonly unknown[]
}

function eqAddr(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** Address a currency presents in a v4 PoolKey: `address(0)` for native, else its wrapped token. */
function v4Address(c: Currency): Address {
  return (c.isNative ? ZERO_ADDRESS : getAddress(c.wrapped.address)) as Address
}

/** Whether a leg currency corresponds to a v4 PoolKey currency address, honoring native/WETH duality. */
function matchesV4Currency(c: Currency, addr: Address, weth: Address): boolean {
  if (eqAddr(v4Address(c), addr)) return true
  // native/WETH interop: a native-denominated pool (addr 0x0) accepts WETH, and a WETH pool accepts native.
  if (eqAddr(addr, ZERO_ADDRESS) && !c.isNative && eqAddr(c.wrapped.address, weth)) return true
  if (eqAddr(addr, weth) && c.isNative) return true
  return false
}

/** Uniswap v2 constant-product output with the 0.3% fee (integer floor), matching the on-chain router. */
function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n
  const amountInWithFee = amountIn * 997n
  return (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee)
}

/** First element of a viem multi-return tuple as a bigint (both quoters return `amountOut` first). */
function firstAsBigInt(result: unknown): bigint {
  const v = (result as readonly unknown[])[0]
  return typeof v === 'bigint' ? v : 0n
}

/** A v3 QuoterV2 `quoteExactInputSingle` read for one directional leg. */
function quoterV2Call(
  quoter: Address,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  fee: number
): RawContract {
  return {
    address: quoter,
    abi: QUOTER_V2_ABI,
    functionName: 'quoteExactInputSingle',
    args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
  }
}

/** A v4 Quoter `quoteExactInputSingle` read for one directional leg. */
function v4QuoterCall(quoter: Address, poolKey: PoolKeyStruct, zeroForOne: boolean, exactAmount: bigint): RawContract {
  return {
    address: quoter,
    abi: V4_QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: [{ poolKey, zeroForOne, exactAmount, hookData: '0x' }],
  }
}

/**
 * Per-candidate plan: how to issue the buy leg, derive its output, then issue and derive the
 * round-trip leg. v3/v4 legs are on-chain quoter reads; v2 legs are pure TS reserve math (its only
 * on-chain read is `getReserves`, folded into round 1).
 */
interface ProbePlan {
  candidate: CandidatePool
  /** Round-1 call, or `undefined` when this candidate cannot be probed at all (buyOut → 0n). */
  buyCall?: RawContract
  /** Turn the round-1 result (or `undefined` when no call was issued) into `buyOut`. */
  computeBuyOut(r: RawMulticallResult | undefined): bigint
  /** Round-2 call for the given `buyOut`, or `undefined` to compute the round trip purely in TS. */
  buildSellCall(buyOut: bigint): RawContract | undefined
  /** Turn `buyOut` + the round-2 result (or `undefined`) into `roundTripOut`. */
  computeRoundTrip(buyOut: bigint, r: RawMulticallResult | undefined): bigint
}

function buildPlan(
  candidate: CandidatePool,
  base: Currency,
  quote: Currency,
  notional: bigint,
  addrs: { quoterV2: Address; v4Quoter: Address; weth: Address }
): ProbePlan {
  const ref = candidate.ref
  const baseAddr = getAddress(base.wrapped.address)
  const quoteAddr = getAddress(quote.wrapped.address)

  if (ref.protocol === 'v2') {
    // token0 is the lower wrapped address; buy is quote→base so reserveIn is quote's, reserveOut base's.
    const baseIsToken0 = BigInt(baseAddr) < BigInt(quoteAddr)
    let reserveBase = 0n
    let reserveQuote = 0n
    return {
      candidate,
      buyCall: { address: ref.pair, abi: V2_PAIR_ABI, functionName: 'getReserves', args: [] },
      computeBuyOut(r) {
        if (!r || r.status !== 'success') return 0n
        const tuple = r.result as readonly unknown[]
        const reserve0 = tuple[0] as bigint
        const reserve1 = tuple[1] as bigint
        reserveBase = baseIsToken0 ? reserve0 : reserve1
        reserveQuote = baseIsToken0 ? reserve1 : reserve0
        return getAmountOut(notional, reserveQuote, reserveBase)
      },
      buildSellCall() {
        return undefined // v2 round-trip is pure TS math against the reserves fetched in round 1
      },
      computeRoundTrip(buyOut) {
        return getAmountOut(buyOut, reserveBase, reserveQuote)
      },
    }
  }

  if (ref.protocol === 'v3') {
    const fee = candidate.v3Fee
    if (fee === undefined) {
      // A v3 candidate with no fee tier cannot be quoted; score it out rather than guessing.
      return {
        candidate,
        computeBuyOut: () => 0n,
        buildSellCall: () => undefined,
        computeRoundTrip: () => 0n,
      }
    }
    return {
      candidate,
      buyCall: quoterV2Call(addrs.quoterV2, quoteAddr, baseAddr, notional, fee),
      computeBuyOut: (r) => (r && r.status === 'success' ? firstAsBigInt(r.result) : 0n),
      buildSellCall: (buyOut) =>
        buyOut > 0n ? quoterV2Call(addrs.quoterV2, baseAddr, quoteAddr, buyOut, fee) : undefined,
      computeRoundTrip: (buyOut, r) => (buyOut > 0n && r && r.status === 'success' ? firstAsBigInt(r.result) : 0n),
    }
  }

  // v4: direction is set by which PoolKey currency the input token matches (native/WETH aware).
  const poolKey = ref.poolKey
  const quoteIsCurrency0 = matchesV4Currency(quote, poolKey.currency0, addrs.weth)
  const quoteIsCurrency1 = matchesV4Currency(quote, poolKey.currency1, addrs.weth)
  if (!quoteIsCurrency0 && !quoteIsCurrency1) {
    // A10 (defensive): `quote` is neither pool currency — quoting either direction would price the wrong
    // pair. Score it out (no buy call) rather than guess a direction.
    return {
      candidate,
      computeBuyOut: () => 0n,
      buildSellCall: () => undefined,
      computeRoundTrip: () => 0n,
    }
  }
  const buyZeroForOne = quoteIsCurrency0 // buy spends quote (tokenIn); zeroForOne iff quote is currency0
  return {
    candidate,
    buyCall: notional <= MAX_UINT128 ? v4QuoterCall(addrs.v4Quoter, poolKey, buyZeroForOne, notional) : undefined,
    computeBuyOut: (r) => (r && r.status === 'success' ? firstAsBigInt(r.result) : 0n),
    buildSellCall: (buyOut) =>
      buyOut > 0n && buyOut <= MAX_UINT128
        ? v4QuoterCall(addrs.v4Quoter, poolKey, !buyZeroForOne, buyOut)
        : undefined,
    computeRoundTrip: (buyOut, r) =>
      buyOut > 0n && buyOut <= MAX_UINT128 && r && r.status === 'success' ? firstAsBigInt(r.result) : 0n,
  }
}

/**
 * Probe-quote every candidate in BOTH directions at a fixed `notional` (in raw `quote` units),
 * returning one {@link ProbeResult} per input candidate in the same order.
 *
 * Two sequential `multicall({ allowFailure: true })` rounds, because the round-trip's input is the
 * buy's output:
 *  1. **Buy** — quote→base at `notional`: v3 via QuoterV2, v4 via V4Quoter, v2 via `getReserves`
 *     (the AMM math is done in TS). Quoter functions are non-`view` but Multicall3 simulates them
 *     under `eth_call`, so each round is a single RPC round-trip.
 *  2. **Round-trip** — base→quote at each candidate's `buyOut`: the same quoters in reverse; v2 stays
 *     pure TS math against the round-1 reserves. Candidates whose buy quoted zero skip this round.
 *
 * A reverted or zero probe yields `0n` for that leg (excluded from ranking downstream). This function
 * issues no reads and returns all-zero results when `candidates` is empty.
 */
export async function probeCandidates(
  client: BlockfeedClient,
  chainId: number,
  candidates: CandidatePool[],
  base: Currency,
  quote: Currency,
  notional: bigint
): Promise<ProbeResult[]> {
  if (candidates.length === 0) return []
  const { quoterV2, v4Quoter, weth } = getChainAddresses(chainId)
  const plans = candidates.map((c) => buildPlan(c, base, quote, notional, { quoterV2, v4Quoter, weth }))

  // --- Round 1: buy probes (quote→base) + v2 getReserves, in one multicall. ---
  const buyCalls: RawContract[] = []
  const buyCallPlanIdx: number[] = []
  plans.forEach((p, i) => {
    if (p.buyCall) {
      buyCalls.push(p.buyCall)
      buyCallPlanIdx.push(i)
    }
  })
  const buyRaw = buyCalls.length
    ? ((await client.multicall({ contracts: buyCalls, allowFailure: true } as never)) as RawMulticallResult[])
    : []
  const buyResultByPlan: Array<RawMulticallResult | undefined> = new Array(plans.length).fill(undefined)
  buyCallPlanIdx.forEach((planIdx, k) => {
    buyResultByPlan[planIdx] = buyRaw[k]
  })
  const buyOuts = plans.map((p, i) => p.computeBuyOut(buyResultByPlan[i]))

  // --- Round 2: round-trip probes (base→quote at each buyOut), in one multicall. ---
  const sellCalls: RawContract[] = []
  const sellCallPlanIdx: number[] = []
  plans.forEach((p, i) => {
    const call = p.buildSellCall(buyOuts[i]!)
    if (call) {
      sellCalls.push(call)
      sellCallPlanIdx.push(i)
    }
  })
  const sellRaw = sellCalls.length
    ? ((await client.multicall({ contracts: sellCalls, allowFailure: true } as never)) as RawMulticallResult[])
    : []
  const sellResultByPlan: Array<RawMulticallResult | undefined> = new Array(plans.length).fill(undefined)
  sellCallPlanIdx.forEach((planIdx, k) => {
    sellResultByPlan[planIdx] = sellRaw[k]
  })

  return plans.map((p, i) => ({
    candidate: p.candidate,
    buyOut: buyOuts[i]!,
    roundTripOut: p.computeRoundTrip(buyOuts[i]!, sellResultByPlan[i]),
  }))
}
