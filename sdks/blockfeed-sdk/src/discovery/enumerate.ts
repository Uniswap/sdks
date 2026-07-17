import type { Currency } from '@uniswap/sdk-core'
import type { Address, Log } from 'viem'
import { getAddress, zeroAddress } from 'viem'

import { STATE_VIEW_ABI, V2_FACTORY_ABI, V3_FACTORY_ABI, V3_POOL_ABI, V4_POOL_MANAGER_INITIALIZE_EVENT } from '../abis'
import { getChainAddresses } from '../addresses'
import { BlockfeedError } from '../errors'
import { eqAddress, v4Representations } from '../internal/currency'
import { type RawContract, multicallAllowFailure } from '../internal/multicall'
import { poolIdFromPoolKey, poolRefIdentifier } from '../math/poolId'
import type { BlockfeedClient, PoolKeyStruct } from '../types'

import type { CandidatePool, DiscoveryOptions } from './types'

/** v3 canonical fee tiers, queried on the factory for every pair. */
const V3_FEE_TIERS = [100, 500, 3000, 10000] as const

/** Max recursive halvings of a v4 log range before giving up on a provider that keeps erroring. */
const MAX_BISECT_DEPTH = 8

/**
 * Cartesian product of both sides' representations, each sorted into `(currency0, currency1)` with
 * native `address(0)` first (numeric address order), deduped. One pair normally; two when a side is
 * WETH/native (its extra representation adds one mirrored query).
 */
function v4QueryPairs(repsA: Address[], repsB: Address[]): Array<{ currency0: Address; currency1: Address }> {
  const seen = new Set<string>()
  const pairs: Array<{ currency0: Address; currency1: Address }> = []
  for (const a of repsA) {
    for (const b of repsB) {
      if (eqAddress(a, b)) continue // a pool cannot pair a currency with itself
      const [currency0, currency1] = BigInt(a) < BigInt(b) ? [a, b] : [b, a]
      const key = `${currency0.toLowerCase()}-${currency1.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push({ currency0, currency1 })
    }
  }
  return pairs
}

/**
 * `getLogs` the v4 `Initialize` event over `[from, to]`, bisecting the range on any provider error
 * (block-span caps, timeouts) and concatenating the halves. Past {@link MAX_BISECT_DEPTH} — or a
 * single-block range that still errors — the failure is rethrown as {@link BlockfeedError}.
 */
async function getInitializeLogsBisected(
  client: BlockfeedClient,
  poolManager: Address,
  args: { currency0: Address; currency1: Address },
  from: bigint,
  to: bigint,
  depth: number
): Promise<Log[]> {
  try {
    // `getLogs` is cast through `unknown`: BlockfeedClient is a structural subset of viem's PublicClient
    // whose overloaded getLogs signature does not accept this bare filter shape without the bridge.
    return (await (client.getLogs as unknown as (a: unknown) => Promise<Log[]>)({
      address: poolManager,
      event: V4_POOL_MANAGER_INITIALIZE_EVENT,
      args,
      fromBlock: from,
      toBlock: to,
    })) as Log[]
  } catch (err) {
    if (depth >= MAX_BISECT_DEPTH || from >= to) {
      throw new BlockfeedError(
        `v4 Initialize getLogs failed for range [${from}, ${to}] after bisecting to depth ${depth}`,
        err
      )
    }
    const mid = from + (to - from) / 2n
    const left = await getInitializeLogsBisected(client, poolManager, args, from, mid, depth + 1)
    const right = await getInitializeLogsBisected(client, poolManager, args, mid + 1n, to, depth + 1)
    return [...left, ...right]
  }
}

/**
 * Enumerate every pool that MIGHT price `tokenA`/`tokenB` on `chainId`, before any executable
 * evaluation (that is discovery's next stage). This is holistic across protocols:
 *
 * - **v2** (only when a `v2Factory` is configured for the chain): `getPair(a, b)`; a zero address
 *   means no pair.
 * - **v3**: `getPool(a, b, fee)` for every fee in `[100, 500, 3000, 10000]`.
 * - **v4**: an `eth_getLogs` scan of the PoolManager's indexed `Initialize` event surfaces every
 *   pool containing the pair — nonstandard fees, exotic tick spacings, hooked pools — each log
 *   carrying the full PoolKey. When a side is WETH/native, a mirrored query with `address(0)`
 *   substituted is also issued and results are deduped by poolId. Pools with non-zero `hooks` are
 *   dropped unless the hook is in `hookAllowlist`.
 *
 * v2/v3 factory reads batch into one `multicall`; a second `multicall` backfills in-range liquidity
 * (v3 `liquidity()`, v4 `StateView.getLiquidity(poolId)`) with `allowFailure`, so a failed read
 * yields a kept candidate with `inRangeLiquidity: undefined`. v2 candidates carry no liquidity.
 * Candidates carry the caller's own `tokenA`/`tokenB` currencies and are returned sorted by
 * `(protocol, identifier)`.
 */
export async function enumerateCandidates(
  client: BlockfeedClient,
  chainId: number,
  tokenA: Currency,
  tokenB: Currency,
  opts: Pick<DiscoveryOptions, 'hookAllowlist' | 'fromBlockOverride'>
): Promise<CandidatePool[]> {
  const { v2Factory, v3Factory, v4PoolManager, v4StateView, v4PoolManagerDeployBlock, weth } =
    getChainAddresses(chainId)
  const hookAllowlist = (opts.hookAllowlist ?? []).map((h) => h.toLowerCase())

  // v2/v3 speak only ERC20; native ETH is represented by its wrapped token address there.
  const addrA = getAddress(tokenA.wrapped.address)
  const addrB = getAddress(tokenB.wrapped.address)

  const candidates: CandidatePool[] = []
  // Candidates needing a follow-up liquidity read, paired 1:1 with `liquidityCalls` (same order).
  const liquidityCalls: RawContract[] = []
  const liquidityTargets: CandidatePool[] = []

  // --- Round 1: factory lookups (v2 getPair + v3 getPool per fee tier) in one multicall. ---
  const factoryCalls: RawContract[] = []
  const factoryMeta: Array<{ kind: 'v2' } | { kind: 'v3'; fee: number }> = []
  if (v2Factory) {
    factoryCalls.push({ address: v2Factory, abi: V2_FACTORY_ABI, functionName: 'getPair', args: [addrA, addrB] })
    factoryMeta.push({ kind: 'v2' })
  }
  for (const fee of V3_FEE_TIERS) {
    factoryCalls.push({ address: v3Factory, abi: V3_FACTORY_ABI, functionName: 'getPool', args: [addrA, addrB, fee] })
    factoryMeta.push({ kind: 'v3', fee })
  }

  const factoryResults = await multicallAllowFailure(client, factoryCalls)

  factoryResults.forEach((res, i) => {
    if (res.status !== 'success') return
    const addr = res.result as string
    if (!addr || eqAddress(addr, zeroAddress)) return
    const poolAddr = getAddress(addr)
    const meta = factoryMeta[i]
    if (meta?.kind === 'v2') {
      candidates.push({ ref: { protocol: 'v2', pair: poolAddr }, currencyA: tokenA, currencyB: tokenB })
      return
    }
    const candidate: CandidatePool = {
      ref: { protocol: 'v3', pool: poolAddr },
      currencyA: tokenA,
      currencyB: tokenB,
      v3Fee: meta?.kind === 'v3' ? meta.fee : undefined,
    }
    candidates.push(candidate)
    liquidityCalls.push({ address: poolAddr, abi: V3_POOL_ABI, functionName: 'liquidity', args: [] })
    liquidityTargets.push(candidate)
  })

  // --- v4: Initialize log scan (one or two queries), hook-filtered, deduped by poolId. ---
  const queryPairs = v4QueryPairs(v4Representations(tokenA, weth), v4Representations(tokenB, weth))
  const fromBlock = opts.fromBlockOverride ?? v4PoolManagerDeployBlock
  const tip = await client.getBlockNumber()
  const seenPoolIds = new Set<string>()

  if (tip >= fromBlock) {
    for (const args of queryPairs) {
      const logs = await getInitializeLogsBisected(client, v4PoolManager, args, fromBlock, tip, 0)
      for (const log of logs) {
        const a = (log as unknown as { args?: Record<string, unknown> }).args
        if (!a) continue
        const poolKey: PoolKeyStruct = {
          currency0: getAddress(a.currency0 as string),
          currency1: getAddress(a.currency1 as string),
          fee: Number(a.fee),
          tickSpacing: Number(a.tickSpacing),
          hooks: getAddress(a.hooks as string),
        }
        // Hookless by default; a hooked pool survives only if its hook is explicitly allowlisted.
        if (!eqAddress(poolKey.hooks, zeroAddress) && !hookAllowlist.includes(poolKey.hooks.toLowerCase())) continue
        const poolId = poolIdFromPoolKey(poolKey)
        const poolIdKey = poolId.toLowerCase()
        if (seenPoolIds.has(poolIdKey)) continue
        seenPoolIds.add(poolIdKey)
        const candidate: CandidatePool = {
          ref: { protocol: 'v4', poolKey },
          currencyA: tokenA,
          currencyB: tokenB,
        }
        candidates.push(candidate)
        liquidityCalls.push({ address: v4StateView, abi: STATE_VIEW_ABI, functionName: 'getLiquidity', args: [poolId] })
        liquidityTargets.push(candidate)
      }
    }
  }

  // --- Round 2: backfill in-range liquidity for all v3 + v4 candidates in one multicall. ---
  if (liquidityCalls.length) {
    const liqResults = await multicallAllowFailure(client, liquidityCalls)
    liqResults.forEach((res, i) => {
      const target = liquidityTargets[i]
      if (target && res.status === 'success') target.inRangeLiquidity = res.result as bigint
    })
  }

  candidates.sort((x, y) => {
    if (x.ref.protocol !== y.ref.protocol) return x.ref.protocol < y.ref.protocol ? -1 : 1
    const ix = poolRefIdentifier(x.ref)
    const iy = poolRefIdentifier(y.ref)
    return ix < iy ? -1 : ix > iy ? 1 : 0
  })

  return candidates
}
