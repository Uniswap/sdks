import { expect, test } from 'bun:test'
import type { Hex, PublicClient } from 'viem'
import { encodeAbiParameters, zeroAddress } from 'viem'

import { createSemaphore } from '../internal/rpc'
import { rateLimitHttpError, rateLimitRpcError, v3Ref, v4Ref } from '../internal/testing'
import { MAINNET_MANIFEST } from '../manifest'
import type { ProtocolModule } from '../protocols/types'
import { v2Module } from '../protocols/v2'
import { v3Module } from '../protocols/v3'
import { v4Module } from '../protocols/v4'
import type { ChainManifest, EthCall, PoolKey, PoolRef, Protocol, QuotedRoute, RankedRoute, RouteCandidate, RouteLeg } from '../types'

import { probeQuotes, quoteCandidates, rankRoutes } from './quote'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F' as const

const manifest: ChainManifest = MAINNET_MANIFEST
const modules: Record<Protocol, ProtocolModule> = { v2: v2Module, v3: v3Module, v4: v4Module }

// ---------------------------------------------------------------------------
// Stub client — keyed by (to, data), the full identity of an eth_call, so two
// calls that happen to share calldata (e.g. two different pools' no-arg
// `getReserves()`) never collide.
// ---------------------------------------------------------------------------

type StubEntry = Hex | 'revert' | 'revert-with-data' | 'rate-limit'

/** A `NotEnoughLiquidity(bytes32 poolId)`-shaped custom-error revert: real revert data, so — unlike
 * a plain empty revert — it must never be treated as amount-independent (C4-H3). The exact bytes
 * don't matter to the classifier; only that `data` is non-empty. */
const NOT_ENOUGH_LIQUIDITY_DATA: Hex = '0xf29b7f9800000000000000000000000000000000000000000000000000000000000001'

function callKey(to: string, data: string): string {
  return `${to.toLowerCase()}:${data}`
}

function stubClient(returns: Record<string, StubEntry>): Pick<PublicClient, 'request'> {
  return {
    async request(args: any) {
      const [{ to, data }] = args.params
      const key = callKey(to, data)
      const entry = returns[key]
      if (entry === undefined) throw new Error(`stubClient: no stub registered for ${key}`)
      if (entry === 'revert') throw new Error('execution reverted')
      // Real revert data (e.g. a decoded custom error) attached, the way a node actually returns it.
      if (entry === 'revert-with-data') throw Object.assign(new Error('execution reverted'), { data: NOT_ENOUGH_LIQUIDITY_DATA })
      // A 429 is not a revert: it is the provider talking about itself (see `internal/rpc.ts`).
      if (entry === 'rate-limit') throw rateLimitHttpError()
      return entry
    },
  } as unknown as Pick<PublicClient, 'request'>
}

function entryFor(call: EthCall, value: StubEntry): Record<string, StubEntry> {
  return { [callKey(call.to, call.data)]: value }
}

const V4_QUOTER_RETURN_TYPES = [{ type: 'uint256' }, { type: 'uint256' }] as const
const QUOTER_V2_RETURN_TYPES = [{ type: 'uint256' }, { type: 'uint160[]' }, { type: 'uint32[]' }, { type: 'uint256' }] as const

function v4Return(amountOut: bigint): Hex {
  return encodeAbiParameters(V4_QUOTER_RETURN_TYPES, [amountOut, 0n])
}

function v3Return(amountOut: bigint): Hex {
  return encodeAbiParameters(QUOTER_V2_RETURN_TYPES, [amountOut, [], [], 0n])
}

function v2Return(reserveIn: bigint, reserveOut: bigint, zeroForOne: boolean): Hex {
  const [reserve0, reserve1] = zeroForOne ? [reserveIn, reserveOut] : [reserveOut, reserveIn]
  return encodeAbiParameters([{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }], [reserve0, reserve1, 0])
}

// ---------------------------------------------------------------------------
// Fixture routes
// ---------------------------------------------------------------------------

const v4UsdcWethKey: PoolKey = { currency0: USDC, currency1: WETH, fee: 3000, tickSpacing: 60, hooks: zeroAddress }
const v4UsdcWethPool: PoolRef = v4Ref(v4UsdcWethKey)
const v4Leg: RouteLeg = { pool: v4UsdcWethPool, currencyIn: USDC, currencyOut: WETH }

const v3WethDaiPool: PoolRef = v3Ref('0x0000000000000000000000000000000000a001', DAI, WETH, 3000)
const v3Leg: RouteLeg = { pool: v3WethDaiPool, currencyIn: WETH, currencyOut: DAI }

/** v4 (USDC -> WETH) chained into v3 (WETH -> DAI): a genuinely mixed-protocol two-hop. */
const mixedV4toV3: RouteCandidate = { legs: [v4Leg, v3Leg] }

test('mixed two-hop chains realized output into round 2', async () => {
  const round1Call = v4Module.encodeQuote([v4Leg], 100n, manifest).call
  const round2Call = v3Module.encodeQuote([v3Leg], 500n, manifest).call
  const client = stubClient({
    ...entryFor(round1Call, v4Return(500n)),
    ...entryFor(round2Call, v3Return(900n)),
  })

  const { quoted, stats } = await quoteCandidates({
    client,
    modules,
    manifest,
    candidates: [mixedV4toV3],
    amountIn: 100n,
    blockNumber: 1n,
  })

  expect(quoted).toHaveLength(1)
  expect(quoted[0]!.quote.amountOut).toBe(900n)
  expect(quoted[0]!.quote.intermediateAmounts).toEqual([500n])
  expect(stats).toEqual({ attempted: 1, succeeded: 1, failed: 0, transportFailed: 0 })
})

test('reverting candidate is dropped and counted, others survive', async () => {
  const badPool: PoolRef = v3Ref('0x0000000000000000000000000000000000a002', USDC, WETH, 500)
  const badLeg: RouteLeg = { pool: badPool, currencyIn: USDC, currencyOut: WETH }
  const bad: RouteCandidate = { legs: [badLeg] }

  const goodPool: PoolRef = v4Ref(v4UsdcWethKey)
  const goodLeg: RouteLeg = { pool: goodPool, currencyIn: USDC, currencyOut: WETH }
  const good: RouteCandidate = { legs: [goodLeg] }

  const badCall = v3Module.encodeQuote([badLeg], 1n, manifest).call
  const goodCall = v4Module.encodeQuote([goodLeg], 1n, manifest).call
  const revertFirstStub = stubClient({
    ...entryFor(badCall, 'revert'),
    ...entryFor(goodCall, v4Return(42n)),
  })

  const { quoted, stats } = await quoteCandidates({
    client: revertFirstStub,
    modules,
    manifest,
    candidates: [bad, good],
    amountIn: 1n,
    blockNumber: 1n,
  })

  expect(quoted).toHaveLength(1)
  expect(quoted[0]!.route).toBe(good)
  expect(stats).toMatchObject({ attempted: 2, failed: 1, succeeded: 1 })
})

test('same-protocol two-leg candidate quotes as a single whole-path segment (one round)', async () => {
  const v3DaiWethLeg: RouteLeg = { pool: v3WethDaiPool, currencyIn: DAI, currencyOut: WETH }
  const v3WethUsdcPool: PoolRef = v3Ref('0x0000000000000000000000000000000000a003', USDC, WETH, 500)
  const v3WethUsdcLeg: RouteLeg = { pool: v3WethUsdcPool, currencyIn: WETH, currencyOut: USDC }
  const wholePath: RouteCandidate = { legs: [v3DaiWethLeg, v3WethUsdcLeg] }

  const call = v3Module.encodeQuote([v3DaiWethLeg, v3WethUsdcLeg], 10n, manifest).call
  const client = stubClient(entryFor(call, v3Return(777n)))

  const { quoted, stats } = await quoteCandidates({ client, modules, manifest, candidates: [wholePath], amountIn: 10n, blockNumber: 1n })

  expect(quoted).toHaveLength(1)
  expect(quoted[0]!.quote.amountOut).toBe(777n)
  expect(quoted[0]!.quote.intermediateAmounts).toEqual([]) // whole-path segment: no observed boundary
  expect(stats).toEqual({ attempted: 1, succeeded: 1, failed: 0, transportFailed: 0 })
})

test('v2+v2 two-hop chains through two solo segments (v2 legs never batch)', async () => {
  const [probe1] = v2Module.speculativeDirect(USDC, WETH, 50n, manifest)
  const [probe2] = v2Module.speculativeDirect(WETH, DAI, 25n, manifest)
  const leg1 = probe1!.candidate.legs[0]!
  const leg2 = probe2!.candidate.legs[0]!
  const v2v2: RouteCandidate = { legs: [leg1, leg2] }

  const round1Call = v2Module.encodeQuote([leg1], 50n, manifest).call
  const round2Call = v2Module.encodeQuote([leg2], 25n, manifest).call
  const client = stubClient({
    ...entryFor(round1Call, v2Return(1_000_000n, 500_000n, true)),
    ...entryFor(round2Call, v2Return(2_000_000n, 1_000_000n, true)),
  })

  const { quoted, stats } = await quoteCandidates({ client, modules, manifest, candidates: [v2v2], amountIn: 50n, blockNumber: 1n })

  expect(quoted).toHaveLength(1)
  expect(quoted[0]!.quote.intermediateAmounts).toHaveLength(1) // one segment boundary (leg1 -> leg2)
  expect(stats).toEqual({ attempted: 1, succeeded: 1, failed: 0, transportFailed: 0 })
})

test('abort between rounds drops pending round-2 candidates without counting them', async () => {
  const round1Call = v4Module.encodeQuote([v4Leg], 100n, manifest).call
  const round2Call = v3Module.encodeQuote([v3Leg], 500n, manifest).call
  const controller = new AbortController()
  const client = {
    async request(args: any) {
      controller.abort() // simulate the caller aborting while round 1 is in flight
      const [{ to, data }] = args.params
      const key = callKey(to, data)
      if (key === callKey(round1Call.to, round1Call.data)) return v4Return(500n)
      if (key === callKey(round2Call.to, round2Call.data)) return v3Return(900n)
      throw new Error(`unexpected call ${key}`)
    },
  } as unknown as Pick<PublicClient, 'request'>

  const { quoted, stats } = await quoteCandidates({
    client,
    modules,
    manifest,
    candidates: [mixedV4toV3],
    amountIn: 100n,
    blockNumber: 1n,
    signal: controller.signal,
  })

  expect(quoted).toHaveLength(0)
  // Round 1 succeeded but round 2 never ran — the candidate is neither attempted, succeeded, nor
  // failed; it is left for the caller to report as unattempted (SearchReport.quoting.unattempted).
  expect(stats).toEqual({ attempted: 0, succeeded: 0, failed: 0, transportFailed: 0 })
})

test('probeQuotes drops reverting probes silently and returns quoted routes for the rest', async () => {
  const amountIn = 10n ** 6n
  const [goodProbe] = v2Module.speculativeDirect(USDC, WETH, amountIn, manifest)
  const [badProbe] = v2Module.speculativeDirect(WETH, DAI, amountIn, manifest)

  const client = stubClient({
    ...entryFor(goodProbe!.quote.call, v2Return(2_000_000n * 10n ** 6n, 1_000n * 10n ** 18n, true)),
    ...entryFor(badProbe!.quote.call, 'revert'),
  })

  const { quoted, stats } = await probeQuotes({ client, probes: [badProbe!, goodProbe!], amountIn, blockNumber: 1n })

  expect(quoted).toHaveLength(1)
  expect(quoted[0]!.route).toBe(goodProbe!.candidate)
  expect(quoted[0]!.quote.intermediateAmounts).toEqual([])
  expect(stats).toEqual({ attempted: 2, succeeded: 1, failed: 1, transportFailed: 0 })
})

// ---------------------------------------------------------------------------
// Transport failures are a separate tally (FW2). A revert says "this route
// cannot price at this block" — real evidence about the chain. A 429 says
// nothing whatsoever, so counting it as `failed` is what let 99 dropped calls
// read as a completed search that found nothing.
// ---------------------------------------------------------------------------

test('a rate-limited candidate counts transportFailed (not failed) and is handed back for the negative cache to skip', async () => {
  const ratePool: PoolRef = v3Ref('0x0000000000000000000000000000000000a003', USDC, WETH, 500)
  const rateLeg: RouteLeg = { pool: ratePool, currencyIn: USDC, currencyOut: WETH }
  const rateLimited: RouteCandidate = { legs: [rateLeg] }

  const revertPool: PoolRef = v3Ref('0x0000000000000000000000000000000000a004', USDC, WETH, 100)
  const revertLeg: RouteLeg = { pool: revertPool, currencyIn: USDC, currencyOut: WETH }
  const reverting: RouteCandidate = { legs: [revertLeg] }

  const good: RouteCandidate = { legs: [{ pool: v4UsdcWethPool, currencyIn: USDC, currencyOut: WETH }] }

  const client = stubClient({
    ...entryFor(v3Module.encodeQuote([rateLeg], 1n, manifest).call, 'rate-limit'),
    ...entryFor(v3Module.encodeQuote([revertLeg], 1n, manifest).call, 'revert'),
    ...entryFor(v4Module.encodeQuote(good.legs, 1n, manifest).call, v4Return(42n)),
  })

  const { quoted, stats, transportFailures } = await quoteCandidates({
    client,
    modules,
    manifest,
    candidates: [rateLimited, reverting, good],
    amountIn: 1n,
    blockNumber: 1n,
  })

  expect(quoted).toHaveLength(1)
  expect(quoted[0]!.route).toBe(good)
  expect(stats).toEqual({ attempted: 3, succeeded: 1, failed: 1, transportFailed: 1 })
  // Invariant the report's honesty rests on.
  expect(stats.attempted).toBe(stats.succeeded + stats.failed + stats.transportFailed)
  // Only the rate-limited one — a reverting pool IS legitimately negative-cacheable.
  expect(transportFailures).toEqual([rateLimited])
})

test('a round-2 transport failure counts transportFailed, not failed', async () => {
  const client = stubClient({
    ...entryFor(v4Module.encodeQuote([v4Leg], 100n, manifest).call, v4Return(500n)),
    ...entryFor(v3Module.encodeQuote([v3Leg], 500n, manifest).call, 'rate-limit'),
  })

  const { quoted, stats, transportFailures } = await quoteCandidates({
    client,
    modules,
    manifest,
    candidates: [mixedV4toV3],
    amountIn: 100n,
    blockNumber: 1n,
  })

  expect(quoted).toHaveLength(0)
  expect(stats).toEqual({ attempted: 1, succeeded: 0, failed: 0, transportFailed: 1 })
  expect(transportFailures).toEqual([mixedV4toV3])
})

// ---------------------------------------------------------------------------
// C4-H3: only a data-less revert is amount-independent, and therefore safe to hand back for the
// negative cache to remember across requests. A revert WITH data — NotEnoughLiquidity, a hook
// rejection, a zero-output rounding revert — can depend on amountIn/context and must never be
// reported as amount-independent, or a poisoned mark would leak across concurrent requests.
// ---------------------------------------------------------------------------

test('quoteCandidates: a data-less revert is amount-independent, a data-carrying revert is not', async () => {
  const emptyRevertPool: PoolRef = v3Ref('0x0000000000000000000000000000000000a005', USDC, WETH, 500)
  const emptyRevertLeg: RouteLeg = { pool: emptyRevertPool, currencyIn: USDC, currencyOut: WETH }
  const emptyRevert: RouteCandidate = { legs: [emptyRevertLeg] }

  const dataRevertPool: PoolRef = v3Ref('0x0000000000000000000000000000000000a006', USDC, WETH, 100)
  const dataRevertLeg: RouteLeg = { pool: dataRevertPool, currencyIn: USDC, currencyOut: WETH }
  const dataRevert: RouteCandidate = { legs: [dataRevertLeg] }

  const client = stubClient({
    ...entryFor(v3Module.encodeQuote([emptyRevertLeg], 1n, manifest).call, 'revert'),
    ...entryFor(v3Module.encodeQuote([dataRevertLeg], 1n, manifest).call, 'revert-with-data'),
  })

  const { stats, amountIndependentFailures } = await quoteCandidates({
    client,
    modules,
    manifest,
    candidates: [emptyRevert, dataRevert],
    amountIn: 1n,
    blockNumber: 1n,
  })

  expect(stats).toMatchObject({ attempted: 2, succeeded: 0, failed: 2, transportFailed: 0 })
  expect(amountIndependentFailures).toEqual([emptyRevert])
})

test('probeQuotes: a data-less revert is amount-independent, a data-carrying revert is not', async () => {
  const amountIn = 10n ** 6n
  const [emptyProbe] = v2Module.speculativeDirect(USDC, WETH, amountIn, manifest)
  const [dataProbe] = v2Module.speculativeDirect(WETH, DAI, amountIn, manifest)

  const client = stubClient({
    ...entryFor(emptyProbe!.quote.call, 'revert'),
    ...entryFor(dataProbe!.quote.call, 'revert-with-data'),
  })

  const { stats, amountIndependentFailures } = await probeQuotes({
    client,
    probes: [emptyProbe!, dataProbe!],
    amountIn,
    blockNumber: 1n,
  })

  expect(stats).toMatchObject({ attempted: 2, succeeded: 0, failed: 2, transportFailed: 0 })
  expect(amountIndependentFailures).toEqual([emptyProbe!.candidate])
})

test('probeQuotes separates a rate-limited probe from a reverting one', async () => {
  const amountIn = 10n ** 6n
  const [goodProbe] = v2Module.speculativeDirect(USDC, WETH, amountIn, manifest)
  const [revertProbe] = v2Module.speculativeDirect(WETH, DAI, amountIn, manifest)
  const [rateProbe] = v2Module.speculativeDirect(USDC, DAI, amountIn, manifest)

  const client = {
    async request(args: any) {
      const [{ to, data }] = args.params
      const key = callKey(to, data)
      if (key === callKey(rateProbe!.quote.call.to, rateProbe!.quote.call.data)) throw rateLimitRpcError()
      if (key === callKey(revertProbe!.quote.call.to, revertProbe!.quote.call.data)) throw new Error('execution reverted')
      return v2Return(2_000_000n * 10n ** 6n, 1_000n * 10n ** 18n, true)
    },
  } as unknown as Pick<PublicClient, 'request'>

  const { quoted, stats, transportFailures } = await probeQuotes({
    client,
    probes: [rateProbe!, revertProbe!, goodProbe!],
    amountIn,
    blockNumber: 1n,
  })

  expect(quoted).toHaveLength(1)
  expect(quoted[0]!.route).toBe(goodProbe!.candidate)
  expect(stats).toEqual({ attempted: 3, succeeded: 1, failed: 1, transportFailed: 1 })
  expect(transportFailures).toEqual([rateProbe!.candidate])
})

// ---------------------------------------------------------------------------
// rankRoutes
// ---------------------------------------------------------------------------

const HOOKS = `0x${'0'.repeat(36)}dead` as const

/** Memoized so repeated calls with the same amountOut return the *same* object — tests assert
 * reference identity (`toBe`) on the promoted/leader route, matching the brief's literal test. */
const hookedRouteCache = new Map<bigint, QuotedRoute>()
function hookedRoute(amountOut: bigint): QuotedRoute {
  let route = hookedRouteCache.get(amountOut)
  if (!route) {
    const poolKey: PoolKey = { currency0: USDC, currency1: WETH, fee: 3000, tickSpacing: 60, hooks: HOOKS }
    const pool: PoolRef = v4Ref(poolKey)
    const leg: RouteLeg = { pool, currencyIn: USDC, currencyOut: WETH }
    route = { route: { legs: [leg] }, quote: { amountIn: 1n, amountOut, intermediateAmounts: [] } }
    hookedRouteCache.set(amountOut, route)
  }
  return route
}

const simpleRouteCache = new Map<bigint, QuotedRoute>()
function simpleRoute(amountOut: bigint): QuotedRoute {
  let route = simpleRouteCache.get(amountOut)
  if (!route) {
    const pool: PoolRef = v3Ref('0x0000000000000000000000000000000000a004', USDC, WETH, 3000)
    const leg: RouteLeg = { pool, currencyIn: USDC, currencyOut: WETH }
    route = { route: { legs: [leg] }, quote: { amountIn: 1n, amountOut, intermediateAmounts: [] } }
    simpleRouteCache.set(amountOut, route)
  }
  return route
}

test('simplicity margin: hooked route must beat simple by >5bps', () => {
  const ranked = rankRoutes([hookedRoute(10_005n), simpleRoute(10_000n)])
  // Promotion marks the winner (`promotedOverComplex`), which means the leading element is a fresh
  // object (a spread copy), not the exact `simpleRoute(10_000n)` reference — so identity is asserted
  // on the unmodified nested `route`/`quote`, and the marker itself is asserted directly.
  expect(ranked[0]!.route).toBe(simpleRoute(10_000n).route) // within 5 bps → simple wins
  expect(ranked[0]!.quote).toBe(simpleRoute(10_000n).quote)
  expect((ranked[0] as RankedRoute).promotedOverComplex).toBe(true)

  const notPromoted = rankRoutes([hookedRoute(10_010n), simpleRoute(10_000n)])
  expect(notPromoted[0]!.quote.amountOut).toBe(10_010n)
  expect((notPromoted[0] as RankedRoute).promotedOverComplex).toBeUndefined()
})

test('rankRoutes is idempotent: re-ranking its own output never carries a stale promotion marker', () => {
  // `search/leader.ts` re-ranks the ACCUMULATED quote set on every wave, so a route promoted in one
  // wave is an input to the next still wearing the marker. The marker is not decorative —
  // `assertResultCoherent` reads it as the licence for a `best` outpriced by its own `alternatives`,
  // and the CLI prints it as the explanation — so one that outlives the promotion it describes is a
  // false explanation for whatever ordering happens to be current.
  const once = rankRoutes([hookedRoute(10_005n), simpleRoute(10_000n)])
  expect((once[0] as RankedRoute).promotedOverComplex).toBe(true)
  expect(rankRoutes(once)).toEqual(once)

  // And the case the marker must NOT survive: the promoted route is re-ranked against a field where
  // it no longer wins anything (nothing complex is ahead of it, so no promotion happens at all).
  const promoted = once[0]!
  const reranked = rankRoutes([promoted, simpleRoute(9_000n)])
  expect(reranked[0]!.quote.amountOut).toBe(10_000n)
  expect((reranked[0] as RankedRoute).promotedOverComplex).toBeUndefined()
})

test('rankRoutes orders by amountOut desc, then fewer protocol transitions, then fewer hops, then routeId', () => {
  const higher = simpleRoute(500n)
  const lower = hookedRoute(100n) // amountOut lower, and complex — but amountOut alone should decide here
  const ranked = rankRoutes([lower, higher])
  expect(ranked[0]).toBe(higher)
  expect(ranked[1]).toBe(lower)
})

test('an abort mid-round skips the calls still queued for a permit — never sent, never counted, never blamed on the provider', async () => {
  // Before `quoteWhileDiscovering`, a quoting round only ever started at a wave boundary, so an
  // abort landing inside one was rare. Now that scan-bound waves quote as they go it is the common
  // case, and it was expensive: `mapConcurrent` dispatches every candidate at once and lets the
  // router's semaphore meter them, but `createSemaphore` is a plain FIFO queue with no abort
  // awareness — so every queued `eth_call` still went to the wire once a permit freed, 14 seconds
  // past a `--budget 60s` search, measured live on Base. `ethCall` now re-checks the signal with the
  // permit in hand, exactly as `logScan.ts#fetchChunk` already did for `eth_getLogs`.
  const amountIn = 10n ** 6n
  const [first] = v2Module.speculativeDirect(USDC, WETH, amountIn, manifest)
  const [second] = v2Module.speculativeDirect(WETH, DAI, amountIn, manifest)
  const [third] = v2Module.speculativeDirect(USDC, DAI, amountIn, manifest)

  const controller = new AbortController()
  const reserves = v2Return(2_000_000n * 10n ** 6n, 1_000n * 10n ** 18n, true)
  const served: string[] = []
  const base = stubClient({
    ...entryFor(first!.quote.call, reserves),
    ...entryFor(second!.quote.call, reserves),
    ...entryFor(third!.quote.call, reserves),
  })
  const client: Pick<PublicClient, 'request'> = {
    async request(args: never) {
      const [{ to }] = (args as unknown as { params: [{ to: string }] }).params
      served.push(to.toLowerCase())
      // The budget expiring the instant the first call is served: everything still queued behind the
      // single permit is now work nobody asked for.
      controller.abort()
      return base.request(args)
    },
  } as Pick<PublicClient, 'request'>

  const { quoted, stats } = await probeQuotes({
    client,
    probes: [first!, second!, third!],
    amountIn,
    blockNumber: 1n,
    semaphore: createSemaphore(1),
    signal: controller.signal,
  })

  expect(served).toHaveLength(1)
  expect(quoted).toHaveLength(1)
  // Not attempted, not failed, and emphatically not `transportFailed` — nothing was asked of the
  // provider, so the search must not report itself rpc-degraded over its own deadline.
  expect(stats).toEqual({ attempted: 1, succeeded: 1, failed: 0, transportFailed: 0 })
})
