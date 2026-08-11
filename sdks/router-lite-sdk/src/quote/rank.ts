import { SIMPLICITY_MARGIN_BPS } from '../constants'
import { isHooked, routeId } from '../protocols'
import type { QuotedRoute, RouteCandidate } from '../types'

// ---------------------------------------------------------------------------
// Ranking — the one place a set of priced routes is put in order. The pump
// composes exact quotes (`search/pump.ts#composeRoutes`); this module decides
// which of them leads, on `amountOut` and the declared tie-breakers alone,
// with exactly one sanctioned override: the simplicity margin.
//
// Gas is REPORTED, NEVER RANKED (`types.ts#RouteQuote.gasEstimate`): a
// gas-aware ranking would need a gas price and an output-token price to mean
// anything, and both are the caller's to know.
// ---------------------------------------------------------------------------

/** Number of adjacent-leg protocol changes in a route (0 for a single-protocol route of any length). */
function protocolTransitions(route: RouteCandidate): number {
  let transitions = 0
  for (let i = 1; i < route.legs.length; i++) {
    if (route.legs[i]!.pool.protocol !== route.legs[i - 1]!.pool.protocol) transitions++
  }
  return transitions
}

/** A route is "complex" if it crosses a protocol boundary, or any of its v4 legs carries hooks. */
function isComplex(route: RouteCandidate): boolean {
  const protocols = new Set(route.legs.map((leg) => leg.pool.protocol))
  if (protocols.size > 1) return true
  return route.legs.some((leg) => isHooked(leg.pool))
}

function compareRoutes(a: QuotedRoute, b: QuotedRoute): number {
  if (a.quote.amountOut !== b.quote.amountOut) return a.quote.amountOut > b.quote.amountOut ? -1 : 1
  const transitionsDelta = protocolTransitions(a.route) - protocolTransitions(b.route)
  if (transitionsDelta !== 0) return transitionsDelta
  const hopsDelta = a.route.legs.length - b.route.legs.length
  if (hopsDelta !== 0) return hopsDelta
  const aId = routeId(a.route)
  const bId = routeId(b.route)
  return aId < bId ? -1 : aId > bId ? 1 : 0
}

/**
 * Ranks quoted routes: `amountOut` descending, then fewer protocol transitions, then fewer hops,
 * then lexicographic `routeId` (full determinism on ties). Then applies the simplicity margin —
 * while the leader is "complex" (mixed-protocol or hooked v4), the best simpler (non-complex)
 * candidate is promoted ahead of it as long as its `amountOut` is within `SIMPLICITY_MARGIN_BPS`
 * of the leader's (`simpler.amountOut * 10000 >= leader.amountOut * (10000 - marginBps)`) — a
 * complex route must beat a simple one by *more* than the margin to keep the top spot. Since a
 * promoted candidate is by definition non-complex, this resolves in at most one promotion.
 *
 * A PROMOTION IS MARKED, NOT JUST APPLIED (C4-P7). The promoted candidate carries
 * `promotedOverComplex: true` (declared on `QuotedRoute`, which every real caller sees this route
 * as — `search/verifier.ts#withExecution` spreads this object verbatim) so a caller reading only
 * `best`/`alternatives` can tell "the higher-`amountOut` route lost to a simpler one" apart from
 * "this was simply the best route found", rather than having to re-run `compareRoutes`/`isComplex`
 * against the whole ranked list to notice the override happened at all.
 */
export function rankRoutes(quoted: QuotedRoute[]): QuotedRoute[] {
  // THE MARKER IS THIS CALL'S OUTPUT, NEVER ITS INPUT. The engine re-ranks the accumulated
  // composed set on EVERY cycle, so a route promoted in one cycle comes back into the next still
  // carrying the marker. Once a later measurement outprices the complex leader outright, or the
  // leader itself has been demoted, the promotion is no longer happening — but the marker would
  // ride along unchanged, and it is not decorative: `assertResultCoherent` reads it as the licence
  // for a `best` outpriced by its own `alternatives`, and the CLI prints it as the explanation.
  // Stripping it up front makes this function idempotent: `rankRoutes(rankRoutes(x))` deep-equals
  // `rankRoutes(x)`, and the marker on the way out always describes the promotion that just
  // happened. Copying only the routes that actually carry a stale marker keeps every other route
  // referentially identical to its input, which callers (and tests) rely on.
  const sorted = [...quoted]
    .map((candidate) => {
      if (candidate.promotedOverComplex === undefined) return candidate
      const { promotedOverComplex: _stale, ...rest } = candidate
      return rest
    })
    .sort(compareRoutes)
  if (sorted.length <= 1) return sorted

  const leader = sorted[0]!
  if (!isComplex(leader.route)) return sorted

  const leaderOut = leader.quote.amountOut
  const marginFactor = 10_000n - BigInt(SIMPLICITY_MARGIN_BPS)
  const promoteIdx = sorted.findIndex(
    (candidate, idx) => idx > 0 && !isComplex(candidate.route) && candidate.quote.amountOut * 10_000n >= leaderOut * marginFactor,
  )
  if (promoteIdx === -1) return sorted

  const promoted = { ...sorted[promoteIdx]!, promotedOverComplex: true as const }
  const rest = sorted.filter((_, idx) => idx !== promoteIdx)
  return [promoted, ...rest]
}
