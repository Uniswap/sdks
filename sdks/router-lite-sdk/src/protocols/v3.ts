import type { Address, Hex, Log } from 'viem'
import {
  decodeEventLog,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  encodePacked,
  getCreate2Address,
  isAddressEqual,
  keccak256,
  zeroAddress,
} from 'viem'

import { MAX_PLAUSIBLE_AMOUNT_OUT } from '../constants'
import { ImplausibleQuoteError, RouterConfigError, UnsupportedRouteError } from '../errors'
import { QUOTER_V2_ABI, V3_FACTORY_ABI } from '../internal/abis'
import { sortAddresses } from '../internal/currency'
import { narrowTopics } from '../internal/logScan'
import type { ChainManifest, CurrencyRef, DecodedQuote, EthCall, ExecutionOperation, QuoteCall, RouteLeg } from '../types'

import { v3PoolRef, type V3PoolRef } from './poolRef'
import type { ProtocolModule } from './types'

// ---------------------------------------------------------------------------
// v3 module — QuoterV2 speculative quoting.
//
// Unlike v2, a v3 pool address depends on the fee tier as well as the token
// pair, so `hypotheses` emits one identity per fee in `STANDARD_V3_FEES`
// (plus any `extraFees` a caller passes) — the QuoterV2 call issued against
// each one at measurement time doubles as the existence probe (a revert
// means no pool at that fee, not just an empty-reserves pool). Non-standard
// fee tiers (enabled later via governance) are folded in by `mergeEnabledFees`
// from scanned `FeeAmountEnabled` logs; that discovery loop lives in
// `search/coverage.ts`, not here — this module only exposes the pure merge
// function.
// ---------------------------------------------------------------------------

/** The four fee tiers enabled at v3 factory genesis, in hundredths of a bip. */
const STANDARD_V3_FEES: readonly number[] = [100, 500, 3000, 10000]

/**
 * keccak256 of the UniswapV3Pool creation code — the CREATE2 init code hash shared by the mainnet v3
 * factory deployment and every canonical EVM fork of it. The DEFAULT, not a law of nature: a chain
 * that deployed DIFFERENT POOL BYTECODE overrides it via `ChainManifest.v3.poolInitCodeHash`,
 * without which every speculative probe here targets an address no pool lives at — a quoter revert
 * per fee tier, indistinguishable from "this pair has no v3 pool", so the search reports a confident
 * `no-route`.
 *
 * THE OVERRIDE IS FOR A DIFFERENT BYTECODE, NOT A DIFFERENT DERIVATION (R7). It substitutes one
 * input to the standard EVM formula `keccak256(0xff ++ factory ++ salt ++ initCodeHash)[12:]`; it
 * cannot express a chain that computes the address by a different rule. zkSync-class chains do
 * exactly that — a different prefix, a different preimage, and a bytecode HASH rather than the
 * creation code — so no value of this field makes speculative v3 addressing work there. Such chains
 * are OUT OF SCOPE for this package's speculative path today; supporting one means teaching
 * `computeV3PoolAddress` a second algorithm, not setting a different hash. (v3 hints are unaffected
 * either way: `validateHint` asks the factory's own `getPool` mapping rather than deriving.)
 */
export const V3_POOL_INIT_CODE_HASH: Hex = '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54'

function requireV3(m: ChainManifest): NonNullable<ChainManifest['v3']> {
  if (!m.v3) throw new RouterConfigError('v3 module invoked against a manifest with no v3 bundle')
  return m.v3
}

/** `PoolCreated`'s topic0, derived from the ABI rather than written down — the drift guard in
 * `v3.test.ts` pins the value this produces. */
const POOL_CREATED_TOPIC0 = encodeEventTopics({ abi: V3_FACTORY_ABI, eventName: 'PoolCreated' })[0]

/** 'native' normalizes to the wrapped address on-chain; concrete addresses pass through. */
function resolveAddress(c: CurrencyRef, wrappedNative: Address): Address {
  return c === 'native' ? wrappedNative : c
}

/**
 * Computes the deterministic UniswapV3Pool address for (a, b, fee) via CREATE2 — matches
 * `@uniswap/v3-sdk`'s `Pool.getAddress` without importing it (this module is RPC-only, no
 * ethers dependency at runtime).
 *
 * The salt is `keccak256(abi.encode(token0, token1, fee))` — Uniswap's `PoolAddress.sol` uses
 * the *padded* ABI encoding here, not `abi.encodePacked`. Using `encodePacked` (as v2's pair-salt
 * correctly does, since `UniswapV2Pair`'s salt genuinely is packed) silently computes the wrong
 * address for every v3 pool: packed and padded encodings of `(address, address, uint24)` collide
 * on layout for two `address` words but diverge on the `uint24` word (packed = 3 bytes, padded =
 * 32-byte left-padded), so this only shows up once the resulting address is checked on-chain.
 *
 * `initCodeHash` defaults to {@link V3_POOL_INIT_CODE_HASH}; callers inside this module always pass
 * the manifest's, so the default only applies to a manifest that did not state one.
 */
export function computeV3PoolAddress(
  factory: Address,
  a: Address,
  b: Address,
  fee: number,
  initCodeHash: Hex = V3_POOL_INIT_CODE_HASH,
): Address {
  const [token0, token1] = sortAddresses(a, b)
  const salt = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint24' }], [token0, token1, fee]))
  return getCreate2Address({ from: factory, salt, bytecodeHash: initCodeHash })
}

/**
 * Packs a v3 route into the QuoterV2/SwapRouter path format: `token(20) | fee(3) | token(20) ...`,
 * one fee-and-token segment per leg. Native currencies are not valid path elements on-chain, so
 * the first leg's `currencyIn` — the only place nativeness can appear, since every leg after the
 * first starts from the previous leg's (always concrete) output token — is resolved to
 * `wrappedNative` when it is `'native'`, exactly as `v3-sdk`'s `encodeRouteToPath` resolves
 * `route.input.wrapped`. Resolving to `pool.token0` unconditionally (as an earlier version of
 * this function did) is wrong whenever the wrapped-native address sorts to `token1`.
 */
export function encodeV3Path(legs: RouteLeg[], wrappedNative: Address): Hex {
  if (legs.length === 0) throw new UnsupportedRouteError('encodeV3Path requires at least one leg')
  const types: ('address' | 'uint24')[] = []
  const values: (Address | number)[] = []
  let currentToken: Address | undefined
  for (const leg of legs) {
    if (leg.pool.protocol !== 'v3') throw new UnsupportedRouteError(`encodeV3Path received a ${leg.pool.protocol} leg`)
    const { pool } = leg
    const inToken = currentToken ?? resolveLegToken(leg.currencyIn, wrappedNative)
    const outToken = isAddressEqual(inToken, pool.token0) ? pool.token1 : pool.token0
    types.push('address', 'uint24')
    values.push(inToken, pool.fee)
    currentToken = outToken
  }
  types.push('address')
  values.push(currentToken!)
  return encodePacked(types, values)
}

/** Resolves the wrapped on-chain address for a leg's declared input currency; 'native' maps to `wrappedNative`. */
function resolveLegToken(currencyIn: CurrencyRef, wrappedNative: Address): Address {
  return currencyIn === 'native' ? wrappedNative : currencyIn
}

function quoterQuote(quoter: Address, path: Hex, amountIn: bigint): QuoteCall {
  return {
    call: { to: quoter, data: encodeFunctionData({ abi: QUOTER_V2_ABI, functionName: 'quoteExactInput', args: [path, amountIn] }) },
    decode(returnData: Hex): DecodedQuote {
      const result = decodeFunctionResult({ abi: QUOTER_V2_ABI, functionName: 'quoteExactInput', data: returnData })
      // The plausibility gate, mirroring v4's (see MAX_PLAUSIBLE_AMOUNT_OUT): QuoterV2's amountOut
      // is a genuine uint256, but nothing at or above 2^127 can be an honest quote either — and it
      // could never be re-encoded as a downstream v4 leg's uint128 input anyway. Thrown at the
      // decode seam so the leg settles as 'reverted' evidence instead of a ranking-poisoning price.
      if (result[0] >= MAX_PLAUSIBLE_AMOUNT_OUT) throw new ImplausibleQuoteError(result[0])
      // `result[3]` is QuoterV2's own `gasEstimate` word — reported verbatim, never used to rank.
      // See `RouteQuote.gasEstimate` for what it does and does not measure (and for why it moves
      // between call envelopes).
      return { amountOut: result[0], gasEstimate: result[3] }
    },
  }
}

/** v3's per-fee derivable identities for (a, b): the CREATE2 address at each tier. Pure — no RPC. */
function v3Hypotheses(a: CurrencyRef, b: CurrencyRef, m: ChainManifest, fees: readonly number[]): V3PoolRef[] {
  const { v3 } = m
  if (!v3) return []
  const aAddr = resolveAddress(a, m.wrappedNative)
  const bAddr = resolveAddress(b, m.wrappedNative)
  const [token0, token1] = sortAddresses(aAddr, bAddr)
  return fees.map((fee) => v3PoolRef(computeV3PoolAddress(v3.factory, aAddr, bAddr, fee, v3.poolInitCodeHash), token0, token1, fee))
}

export const v3Module = {
  id: 'v3',

  enabled(m) {
    return !!m.v3
  },

  hypotheses(a, b, m, extraFees = []) {
    // Deduped by fee: a caller's extraFees (typically `mergeEnabledFees`'s output) already includes
    // every enabled tier, standard ones too — without this, an overlap yields two PoolRefs with the
    // same id for one real pool.
    const fees = [...new Set([...STANDARD_V3_FEES, ...extraFees])]
    return v3Hypotheses(a, b, m, fees)
  },

  adjacencyShape(m) {
    if (!m.v3) return undefined
    // `PoolCreated(token0 indexed, token1 indexed, fee indexed, tickSpacing, pool)` — the pair sits
    // at topics 1/2, exactly where v2's `PairCreated` puts it, so one `eth_getLogs` over
    // `[v2Factory, v3Factory]` with `topics[0] = [PairCreated, PoolCreated]` answers both at once
    // (`protocols/adjacency.ts`).
    return { emitter: m.v3.factory, topic0: POOL_CREATED_TOPIC0, slot: 1, topicAddress: (endpoint) => endpoint }
  },

  feeDiscovery: {
    query(m) {
      const { factory } = requireV3(m)
      return { address: factory, topics: narrowTopics(encodeEventTopics({ abi: V3_FACTORY_ABI, eventName: 'FeeAmountEnabled' })) }
    },

    feesFromLogs(logs: Log[], m) {
      if (!m.v3) return []
      // `.toLowerCase()` on purpose, for the same reason as `parsePoolLog`'s guard below: these logs
      // come off the wire (or out of a caller's batch) and a malformed `address` must be filtered
      // out, not thrown over.
      const fromFactory = logs.filter((log) => log.address.toLowerCase() === m.v3!.factory.toLowerCase())
      return mergeEnabledFees(fromFactory)
    },
  },

  parsePoolLog(log: Log, m) {
    // Validate that m.v3 exists and the log is from the configured v3 factory. `log` is
    // caller-supplied via `router.ingestLogs`/`ingestReceipt`, so its declared shape is an
    // assertion, not a guarantee — a `null` entry or an object with no `address` must be skipped
    // like any other non-matching log, never crash the batch (C4-H4).
    // `.toLowerCase()` HERE ON PURPOSE, NOT `isAddressEqual` (R3, C4-H4): `log.address` is
    // caller-supplied through `ingestLogs`/`ingestReceipt`. `isAddressEqual` throws on a malformed
    // operand, which would let one junk entry abort the whole batch instead of being skipped.
    if (!m.v3 || typeof log?.address !== 'string' || log.address.toLowerCase() !== m.v3.factory.toLowerCase()) {
      return null
    }
    try {
      const decoded = decodeEventLog({ abi: V3_FACTORY_ABI, eventName: 'PoolCreated', topics: log.topics, data: log.data })
      const { token0, token1, fee, pool: address } = decoded.args
      const pool = v3PoolRef(address, token0, token1, fee)
      return { pool, createdAtBlock: log.blockNumber ?? undefined, source: 'event' }
    } catch {
      // Not a PoolCreated log (wrong topic0/shape) — not this module's event.
      return null
    }
  },

  async validateHint(hint, call: (c: EthCall) => Promise<Hex>, m) {
    if (hint.protocol !== 'v3') return null
    const { factory } = requireV3(m)
    // The fee tier isn't recoverable from (token0, token1) alone the way v2's CREATE2 address
    // is fully determined by the pair — a local CREATE2 computation would still need to trust
    // that no other init-code-hash pool exists at that salt, so this hint is verified against
    // the factory's own `getPool` mapping rather than by CREATE2 alone.
    const data = encodeFunctionData({ abi: V3_FACTORY_ABI, functionName: 'getPool', args: [hint.token0, hint.token1, hint.fee] })
    let returnData: Hex
    try {
      returnData = await call({ to: factory, data })
    } catch {
      return null
    }
    let address: Address
    try {
      // A single-output function's result decodes to the bare value, not a 1-tuple.
      address = decodeFunctionResult({ abi: V3_FACTORY_ABI, functionName: 'getPool', data: returnData })
    } catch {
      return null
    }
    // The factory's `getPool` returns address(0) for "no such pool". `zeroAddress` rather than the
    // literal (R5): the literal was the only spelling of it left in this package, and a literal is
    // the one form of this check that can be typo'd into never matching.
    if (isAddressEqual(address, zeroAddress)) return null
    // `.toLowerCase()` on purpose (R3): `hint.pool` is the caller's unvalidated assertion and a bad
    // hint must be IGNORED (`null`), never thrown over — see `v2Module.validateHint`.
    if (hint.pool && hint.pool.toLowerCase() !== address.toLowerCase()) return null
    const [token0, token1] = sortAddresses(hint.token0, hint.token1)
    const pool = v3PoolRef(address, token0, token1, hint.fee)
    return { pool, source: 'hint' }
  },

  encodeQuote(legs, amountIn, m) {
    if (legs.length === 0) throw new UnsupportedRouteError('v3 segments require at least one leg')
    for (const leg of legs) {
      if (leg.pool.protocol !== 'v3') throw new UnsupportedRouteError(`v3 encodeQuote received a ${leg.pool.protocol} leg`)
    }
    const { v3QuoterV2 } = requireV3(m)
    const path = encodeV3Path(legs, m.wrappedNative)
    return quoterQuote(v3QuoterV2, path, amountIn)
  },

  compileOperation(legs, custody): ExecutionOperation {
    return { kind: 'v3-swap', legs, payer: custody.payer, recipient: custody.recipient }
  },
} satisfies ProtocolModule

/**
 * Parses `FeeAmountEnabled` logs into their fee values, deduped and sorted ascending. Pure — the
 * coverage worker (`search/coverage.ts`) owns the scan/cache loop; this is only the merge.
 */
export function mergeEnabledFees(feeEvents: Log[]): number[] {
  const fees = new Set<number>()
  for (const log of feeEvents) {
    try {
      const decoded = decodeEventLog({ abi: V3_FACTORY_ABI, eventName: 'FeeAmountEnabled', topics: log.topics, data: log.data })
      fees.add(decoded.args.fee)
    } catch {
      // Not a FeeAmountEnabled log (wrong topic0/shape) — skip.
    }
  }
  return [...fees].sort((a, b) => a - b)
}
