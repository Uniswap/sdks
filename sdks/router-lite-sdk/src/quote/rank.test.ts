import { expect, test } from 'bun:test'

import { v3Ref, v4Ref } from '../internal/testing'
import type { PoolKey, PoolRef, QuotedRoute, RankedRoute, RouteLeg } from '../types'

import { rankRoutes } from './rank'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const

// Hooked but NOT returns-delta: 0x00c0 sets BEFORE_SWAP (bit 7) | AFTER_SWAP (bit 6) and neither
// swap RETURNS_DELTA bit (3, 2) — so `hookedRoute` is "complex" (the margin's subject) while
// staying VERIFIABLE (never partitioned). The delta-hooked fixtures below carry the partition.
const HOOKS = `0x${'0'.repeat(36)}00c0` as const
// A returns-delta hook — the live Arbitrum echo hook (…4088, BEFORE_SWAP_RETURNS_DELTA set).
const DELTA_HOOKS = '0x063386E9845E5d5aC7AFfBB538fcA57F59764088' as const

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
  const ranked = rankRoutes([hookedRoute(10_005n), simpleRoute(10_000n)], 'quote')
  // Promotion marks the winner (`promotedOverComplex`), which means the leading element is a fresh
  // object (a spread copy), not the exact `simpleRoute(10_000n)` reference — so identity is asserted
  // on the unmodified nested `route`/`quote`, and the marker itself is asserted directly.
  expect(ranked[0]!.route).toBe(simpleRoute(10_000n).route) // within 5 bps → simple wins
  expect(ranked[0]!.quote).toBe(simpleRoute(10_000n).quote)
  expect((ranked[0] as RankedRoute).promotedOverComplex).toBe(true)

  const notPromoted = rankRoutes([hookedRoute(10_010n), simpleRoute(10_000n)], 'quote')
  expect(notPromoted[0]!.quote.amountOut).toBe(10_010n)
  expect((notPromoted[0] as RankedRoute).promotedOverComplex).toBeUndefined()
})

test('rankRoutes ignores gasEstimate entirely — it reports gas, it never ranks on it', () => {
  // Same amountOut, wildly different gas: the tie must break on `compareRoutes`' declared
  // tie-breakers (transitions, hops, routeId) and be INDIFFERENT to which route is cheaper to run.
  // A gas-aware ranking would need a gas price and an output-token price, neither of which this
  // package has any business inventing.
  const cheap = { ...simpleRoute(10_000n), quote: { ...simpleRoute(10_000n).quote, gasEstimate: 40_000n } }
  const dear = { ...hookedRoute(10_000n), quote: { ...hookedRoute(10_000n).quote, gasEstimate: 900_000n } }
  const withGas = rankRoutes([dear, cheap], 'quote').map((r) => r.quote.amountOut)
  const withoutGas = rankRoutes([hookedRoute(10_000n), simpleRoute(10_000n)], 'quote').map((r) => r.quote.amountOut)
  expect(withGas).toEqual(withoutGas)
  // And the reverse input order lands the same way, so the assertion above is not just stability.
  expect(rankRoutes([cheap, dear], 'quote').map((r) => r.quote.gasEstimate)).toEqual(rankRoutes([dear, cheap], 'quote').map((r) => r.quote.gasEstimate))
  // A route with a HIGHER amountOut and worse gas still leads: amountOut is the only price axis.
  const richButDear = { ...simpleRoute(10_100n), quote: { ...simpleRoute(10_100n).quote, gasEstimate: 2_000_000n } }
  expect(rankRoutes([cheap, richButDear], 'quote')[0]!.quote.amountOut).toBe(10_100n)
})

test('rankRoutes is idempotent: re-ranking its own output never carries a stale promotion marker', () => {
  // The engine re-ranks the ACCUMULATED composed set on every cycle, so a route promoted in one
  // cycle is an input to the next still wearing the marker. The marker is not decorative —
  // `assertResultCoherent` reads it as the licence for a `best` outpriced by its own `alternatives`,
  // and the CLI prints it as the explanation — so one that outlives the promotion it describes is a
  // false explanation for whatever ordering happens to be current.
  const once = rankRoutes([hookedRoute(10_005n), simpleRoute(10_000n)], 'quote')
  expect((once[0] as RankedRoute).promotedOverComplex).toBe(true)
  expect(rankRoutes(once, 'quote')).toEqual(once)

  // And the case the marker must NOT survive: the promoted route is re-ranked against a field where
  // it no longer wins anything (nothing complex is ahead of it, so no promotion happens at all).
  const promoted = once[0]!
  const reranked = rankRoutes([promoted, simpleRoute(9_000n)], 'quote')
  expect(reranked[0]!.quote.amountOut).toBe(10_000n)
  expect((reranked[0] as RankedRoute).promotedOverComplex).toBeUndefined()
})

test('rankRoutes orders by amountOut desc, then fewer protocol transitions, then fewer hops, then routeId', () => {
  const higher = simpleRoute(500n)
  const lower = hookedRoute(100n) // amountOut lower, and complex — but amountOut alone should decide here
  const ranked = rankRoutes([lower, higher], 'quote')
  expect(ranked[0]).toBe(higher)
  expect(ranked[1]).toBe(lower)
})

// ---------------------------------------------------------------------------
// The unverifiable-quote partition (quote mode) — a returns-delta hook's quote
// is the hook's claim, not pool math, and never outranks a verifiable route.
// Live shape: Arbitrum echo hooks answering amountIn as amountOut (raw 100e18
// "into" a 6-decimal token), outranking the real ~186k route on amountOut alone.
// ---------------------------------------------------------------------------

const deltaRouteCache = new Map<bigint, QuotedRoute>()
function deltaRoute(amountOut: bigint, hooks: `0x${string}` = DELTA_HOOKS): QuotedRoute {
  const cacheable = hooks === DELTA_HOOKS
  let route = cacheable ? deltaRouteCache.get(amountOut) : undefined
  if (!route) {
    const poolKey: PoolKey = { currency0: USDC, currency1: WETH, fee: 0, tickSpacing: 10, hooks }
    const pool: PoolRef = v4Ref(poolKey)
    const leg: RouteLeg = { pool, currencyIn: USDC, currencyOut: WETH }
    route = { route: { legs: [leg] }, quote: { amountIn: 1n, amountOut, intermediateAmounts: [] } }
    if (cacheable) deltaRouteCache.set(amountOut, route)
  }
  return route
}

test('quote mode: a delta-hooked route with a higher amountOut NEVER leads over a verifiable route', () => {
  // The echo shape itself: the delta route "quotes" absurdly above the honest one.
  const ranked = rankRoutes([deltaRoute(100_000_000_000_000n), simpleRoute(10_000n)], 'quote')
  expect(ranked[0]!.route).toBe(simpleRoute(10_000n).route)
  expect(ranked[0]!.quoteUnverifiable).toBeUndefined()
  // No promotion happened — this is the hard gate, not the margin, and it must not borrow the
  // margin's marker (`assertResultCoherent` licences this inversion off the ALTERNATIVE's marker).
  expect(ranked[0]!.promotedOverComplex).toBeUndefined()
  // The delta route is still in the list, marked — demoted, never hidden.
  expect(ranked[1]!.route).toBe(deltaRoute(100_000_000_000_000n).route)
  expect(ranked[1]!.quoteUnverifiable).toBe(true)
})

test('quote mode: delta-hooked routes keep their own relative order below the verifiable block', () => {
  const echoA = deltaRoute(100_000n)
  const echoB = deltaRoute(90_000n, '0xF5044a46d9E8749E30132d137Bb434342e6f0088') // the live …0088 sibling
  const ranked = rankRoutes([echoB, simpleRoute(500n), echoA, simpleRoute(400n)], 'quote')
  expect(ranked.map((r) => r.quote.amountOut)).toEqual([500n, 400n, 100_000n, 90_000n])
  expect(ranked.map((r) => r.quoteUnverifiable)).toEqual([undefined, undefined, true, true])
})

test('quote mode, only-delta world: an unverifiable route may lead — a price is better than nothing — and is marked', () => {
  const ranked = rankRoutes([deltaRoute(90_000n, '0xF5044a46d9E8749E30132d137Bb434342e6f0088'), deltaRoute(100_000n)], 'quote')
  expect(ranked[0]!.quote.amountOut).toBe(100_000n)
  expect(ranked[0]!.quoteUnverifiable).toBe(true)
  expect(ranked[0]!.promotedOverComplex).toBeUndefined()
  expect(ranked[1]!.quoteUnverifiable).toBe(true)
})

test('swap mode: ordering is untouched — preflight is the authority — but the marker is still stamped', () => {
  const ranked = rankRoutes([simpleRoute(10_000n), deltaRoute(100_000_000_000_000n)], 'swap')
  // amountOut alone decides, exactly as before this change: the echo route leads the ranked list
  // (and would then fail its preflight, which is the swap path's own guard).
  expect(ranked[0]!.route).toBe(deltaRoute(100_000_000_000_000n).route)
  expect(ranked[0]!.quoteUnverifiable).toBe(true)
  expect(ranked[1]!.route).toBe(simpleRoute(10_000n).route)
})

test('the partition and the margin compose: the margin still promotes within the verifiable block', () => {
  // Verifiable-complex leader (hooked, non-delta) 2bps over a simple route, plus an echo route far
  // above both: the echo is partitioned below, THEN the margin promotes the simple route — the
  // exact two-override order `rankRoutes` documents.
  const ranked = rankRoutes([deltaRoute(100_000_000n), hookedRoute(10_002n), simpleRoute(10_000n)], 'quote')
  expect(ranked[0]!.route).toBe(simpleRoute(10_000n).route)
  expect(ranked[0]!.promotedOverComplex).toBe(true)
  expect(ranked[1]!.route).toBe(hookedRoute(10_002n).route)
  expect(ranked[2]!.quoteUnverifiable).toBe(true)
})

test('quoteUnverifiable is recomputed, not trusted: a stale marker on an unhooked route is stripped, idempotently', () => {
  // A hand-built input wearing the marker on a route whose legs do not justify it (the structural
  // fact lives in the hook address bits, so the marker can always be re-derived).
  const lying = { ...simpleRoute(10_000n), quoteUnverifiable: true as const }
  const ranked = rankRoutes([lying, deltaRoute(20_000n)], 'quote')
  expect(ranked[0]!.route).toBe(simpleRoute(10_000n).route)
  expect(ranked[0]!.quoteUnverifiable).toBeUndefined()
  expect(ranked[1]!.quoteUnverifiable).toBe(true)
  // Idempotent with the new marker in play, in both modes.
  expect(rankRoutes(ranked, 'quote')).toEqual(ranked)
  const swapRanked = rankRoutes([simpleRoute(10_000n), deltaRoute(20_000n)], 'swap')
  expect(rankRoutes(swapRanked, 'swap')).toEqual(swapRanked)
})
