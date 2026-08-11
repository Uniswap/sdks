import { expect, test } from 'bun:test'

import { v3Ref, v4Ref } from '../internal/testing'
import type { PoolKey, PoolRef, QuotedRoute, RankedRoute, RouteLeg } from '../types'

import { rankRoutes } from './rank'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const

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

test('rankRoutes ignores gasEstimate entirely — it reports gas, it never ranks on it', () => {
  // Same amountOut, wildly different gas: the tie must break on `compareRoutes`' declared
  // tie-breakers (transitions, hops, routeId) and be INDIFFERENT to which route is cheaper to run.
  // A gas-aware ranking would need a gas price and an output-token price, neither of which this
  // package has any business inventing.
  const cheap = { ...simpleRoute(10_000n), quote: { ...simpleRoute(10_000n).quote, gasEstimate: 40_000n } }
  const dear = { ...hookedRoute(10_000n), quote: { ...hookedRoute(10_000n).quote, gasEstimate: 900_000n } }
  const withGas = rankRoutes([dear, cheap]).map((r) => r.quote.amountOut)
  const withoutGas = rankRoutes([hookedRoute(10_000n), simpleRoute(10_000n)]).map((r) => r.quote.amountOut)
  expect(withGas).toEqual(withoutGas)
  // And the reverse input order lands the same way, so the assertion above is not just stability.
  expect(rankRoutes([cheap, dear]).map((r) => r.quote.gasEstimate)).toEqual(rankRoutes([dear, cheap]).map((r) => r.quote.gasEstimate))
  // A route with a HIGHER amountOut and worse gas still leads: amountOut is the only price axis.
  const richButDear = { ...simpleRoute(10_100n), quote: { ...simpleRoute(10_100n).quote, gasEstimate: 2_000_000n } }
  expect(rankRoutes([cheap, richButDear])[0]!.quote.amountOut).toBe(10_100n)
})

test('rankRoutes is idempotent: re-ranking its own output never carries a stale promotion marker', () => {
  // The engine re-ranks the ACCUMULATED composed set on every cycle, so a route promoted in one
  // cycle is an input to the next still wearing the marker. The marker is not decorative —
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
