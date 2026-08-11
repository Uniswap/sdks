import { SIMPLICITY_MARGIN_BPS } from '../constants'
import { hasReturnsDeltaHook, isHooked, routeId } from '../protocols'
import type { QuotedRoute, RouteCandidate } from '../types'

// ---------------------------------------------------------------------------
// Ranking — the one place a set of priced routes is put in order. The pump
// composes exact quotes (`search/pump.ts#composeRoutes`); this module decides
// which of them leads, on `amountOut` and the declared tie-breakers alone,
// with two sanctioned overrides: the unverifiable-quote partition (quote mode
// only, a hard gate) and the simplicity margin.
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

/** The structural fact `quoteUnverifiable` states: some leg's quote is a returns-delta hook's claim
 * (see `types.ts#QuotedRoute.quoteUnverifiable` for the full why). */
function isQuoteUnverifiable(route: RouteCandidate): boolean {
  return route.legs.some((leg) => hasReturnsDeltaHook(leg.pool))
}

/**
 * One candidate with its two markers made honest for THIS ranking — the normalize step
 * {@link rankRoutes} runs over its whole input before sorting.
 *
 * THE PROMOTION MARKER IS A RANKING'S OUTPUT, NEVER ITS INPUT. The engine re-ranks the accumulated
 * composed set on EVERY cycle, so a route promoted in one cycle comes back into the next still
 * carrying the marker. Once a later measurement outprices the complex leader outright, or the
 * leader itself has been demoted, the promotion is no longer happening — but the marker would ride
 * along unchanged, and it is not decorative: `assertResultCoherent` reads it as the licence for a
 * `best` outpriced by its own `alternatives`, and the CLI prints it as the explanation. Stripping
 * it here makes ranking idempotent: `rankRoutes(rankRoutes(x))` deep-equals `rankRoutes(x)`, and
 * the marker on the way out always describes the promotion that just happened.
 *
 * `quoteUnverifiable` is the opposite kind of fact — structural, derived from the legs alone — so
 * it is RECOMPUTED rather than stripped: stamped where the legs say so, corrected on the
 * (hand-built-input) route whose legs say otherwise, and both idempotently.
 *
 * RETURNS THE INPUT ITSELF when neither marker needs to change, which is the overwhelmingly common
 * case: callers (and tests) rely on an untouched route staying referentially identical.
 */
function freshMarkers(candidate: QuotedRoute): QuotedRoute {
  const unverifiable = isQuoteUnverifiable(candidate.route)
  const stale = candidate.promotedOverComplex !== undefined || (candidate.quoteUnverifiable === true && !unverifiable)
  const missing = unverifiable && candidate.quoteUnverifiable === undefined
  if (!stale && !missing) return candidate
  const { promotedOverComplex: _stale, quoteUnverifiable: _recomputed, ...rest } = candidate
  return unverifiable ? { ...rest, quoteUnverifiable: true as const } : rest
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
 * then lexicographic `routeId` (full determinism on ties). Then applies the two overrides, in
 * order:
 *
 * THE UNVERIFIABLE-QUOTE PARTITION (`kind: 'quote'` only, and a HARD GATE, not a margin). A route
 * with any returns-delta-hooked leg (`quoteUnverifiable` — the hook's claim, not pool math; see
 * `types.ts`) never outranks the best route without one: the sorted list is partitioned so every
 * verifiable route precedes every unverifiable one, each block keeping its own sorted order. The
 * unverifiable routes STAY in the ranked list — a caller can still see them, marked — they just
 * cannot lead while anything verifiable priced. If ONLY unverifiable routes priced, they lead (a
 * price is better than nothing), still marked. Swap mode never partitions: preflight simulates the
 * real trade, so an echo hook fails there on its own and the verifier's walk order stays exactly
 * what `amountOut` says.
 *
 * THE SIMPLICITY MARGIN — while the leader is "complex" (mixed-protocol or hooked v4), the best
 * simpler (non-complex) candidate is promoted ahead of it as long as its `amountOut` is within
 * `SIMPLICITY_MARGIN_BPS` of the leader's (`simpler.amountOut * 10000 >= leader.amountOut *
 * (10000 - marginBps)`) — a complex route must beat a simple one by *more* than the margin to keep
 * the top spot. Since a promoted candidate is by definition non-complex, this resolves in at most
 * one promotion. It runs AFTER the partition and cannot un-do it: a non-complex candidate is
 * unhooked, hence verifiable, so the promotion always moves a route within the verifiable block.
 *
 * A PROMOTION IS MARKED, NOT JUST APPLIED (C4-P7). The promoted candidate carries
 * `promotedOverComplex: true` (declared on `QuotedRoute`, which every real caller sees this route
 * as — `search/verifier.ts#withExecution` spreads this object verbatim) so a caller reading only
 * `best`/`alternatives` can tell "the higher-`amountOut` route lost to a simpler one" apart from
 * "this was simply the best route found", rather than having to re-run `compareRoutes`/`isComplex`
 * against the whole ranked list to notice the override happened at all. `quoteUnverifiable` is
 * stamped here too — on every route whose legs carry the structural fact, in BOTH modes, so the
 * partition (and the CLI's caveat) always has the route's own explanation on the route itself.
 */
export function rankRoutes(quoted: QuotedRoute[], kind: 'quote' | 'swap'): QuotedRoute[] {
  // NORMALIZE → SORT → PARTITION → PROMOTE. Each step is one statement below, in that order; the
  // markers are made honest before anything reads them (see {@link freshMarkers}).
  const sorted = quoted.map(freshMarkers).sort(compareRoutes)
  if (sorted.length <= 1) return sorted

  // The partition. Stable within each block (`filter` keeps the sort's order), and a no-op when the
  // list is all-verifiable (the common case, kept referentially identical) or all-unverifiable (the
  // "a price is better than nothing" case — the marked routes lead because there is nothing else).
  const verifiable = sorted.filter((candidate) => candidate.quoteUnverifiable !== true)
  const partitioned =
    kind === 'quote' && verifiable.length > 0 && verifiable.length < sorted.length
      ? [...verifiable, ...sorted.filter((candidate) => candidate.quoteUnverifiable === true)]
      : sorted

  const leader = partitioned[0]!
  if (!isComplex(leader.route)) return partitioned

  const leaderOut = leader.quote.amountOut
  const marginFactor = 10_000n - BigInt(SIMPLICITY_MARGIN_BPS)
  const promoteIdx = partitioned.findIndex(
    (candidate, idx) => idx > 0 && !isComplex(candidate.route) && candidate.quote.amountOut * 10_000n >= leaderOut * marginFactor,
  )
  if (promoteIdx === -1) return partitioned

  const promoted = { ...partitioned[promoteIdx]!, promotedOverComplex: true as const }
  const rest = partitioned.filter((_, idx) => idx !== promoteIdx)
  return [promoted, ...rest]
}
