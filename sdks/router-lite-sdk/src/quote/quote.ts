import type { Address, PublicClient } from 'viem'

import { SIMPLICITY_MARGIN_BPS } from '../constants'
import { AbortedCallError, TransportError } from '../errors'
import type { Semaphore } from '../internal/rpc'
import type { Segment } from '../internal/segment'
import { segmentCandidate } from '../internal/segment'
import { isHooked, routeId } from '../protocols'
import type { ProtocolModule, QuoteProbe } from '../protocols/types'
import type { ChainManifest, DecodedQuote, Protocol, QuotedRoute, RouteCandidate, RouteQuote } from '../types'

import { encodeOr, isAmountIndependentFailure, runQuoteRound } from './measure'

// ---------------------------------------------------------------------------
// Quoting engine — segments each candidate into contiguous same-protocol
// runs, quotes them in at most two rounds (max hops = 2 ⇒ max two segments,
// even for a v2+v2 candidate where each leg is forced solo), and ranks the
// results.
//
// Segmentation lives in `internal/segment` and is shared verbatim with the
// ExecutionPlan compiler, so quote boundaries and custody boundaries can never
// drift apart. A candidate has exactly one segment (single-protocol whole
// path, including a solo v2 leg) or exactly two (a protocol boundary crossing,
// or two solo v2 legs back to back).
//
// THE ROUND MACHINERY ITSELF LIVES IN `measure.ts` (`runQuoteRound`,
// `encodeOr`, `isAmountIndependentFailure`) — this file consumes it, as does
// the measurement-first engine, so both dispatch through one implementation.
//
// `RouteQuote.intermediateAmounts` records realized amounts at *segment*
// boundaries, not per-leg: a two-leg v3 (or v4) whole-path segment is one
// `eth_call` and only its final output is ever observed on-chain, so there is
// no intermediate amount to record for the leg inside it. A two-segment
// candidate has exactly one boundary (between segment 1 and segment 2), so
// `intermediateAmounts` is `[]` for a one-segment candidate and a single
// realized amount (segment 1's output, fed as segment 2's `amountIn`) for a
// two-segment candidate.
// ---------------------------------------------------------------------------

/**
 * The gas figure for a whole route: the SUM of its segments' quoter estimates, or `undefined` if any
 * segment did not report one (a v2 segment never does — `protocols/v2.ts`). Summing is the whole
 * reason this is a fold rather than a read of the last segment: a two-round route really is two
 * on-chain swaps, and reporting only the second's cost would under-count by an entire leg. See
 * {@link RouteQuote.gasEstimate} for what the sum does and does not cover.
 */
function sumGasEstimates(segments: DecodedQuote[]): bigint | undefined {
  let total = 0n
  for (const segment of segments) {
    if (segment.gasEstimate === undefined) return undefined
    total += segment.gasEstimate
  }
  return total
}

/**
 * The `RouteQuote` for a candidate priced by `segments` (in order) — the single place a quote object
 * is built, so `amountOut` always comes from the LAST segment and `gasEstimate` always follows
 * {@link sumGasEstimates}' all-or-nothing rule, on all three tally paths.
 */
function routeQuote(amountIn: bigint, intermediateAmounts: bigint[], segments: DecodedQuote[]): RouteQuote {
  const gasEstimate = sumGasEstimates(segments)
  return {
    amountIn,
    amountOut: segments[segments.length - 1]!.amountOut,
    intermediateAmounts,
    ...(gasEstimate !== undefined && { gasEstimate }),
  }
}

/**
 * Per-round quoting tally. `failed` is on-chain evidence (the quote reverted ⇒ that route cannot
 * price at this block); `transportFailed` is evidence about the *provider* (429/timeout/dropped
 * socket, or a node that could not serve the pinned block — `NodeStateError` extends
 * `TransportError`, so it lands in this tally too) and says nothing about the route. They are
 * counted apart because conflating them is what let a partial RPC outage look like a completed
 * search that found nothing.
 *
 * Invariant: `attempted === succeeded + failed + transportFailed`.
 */
export type QuoteStats = { attempted: number; succeeded: number; failed: number; transportFailed: number }

function emptyStats(): QuoteStats {
  return { attempted: 0, succeeded: 0, failed: 0, transportFailed: 0 }
}

export type QuoteCandidatesArgs = {
  client: Pick<PublicClient, 'request'>
  modules: Record<Protocol, ProtocolModule>
  manifest: ChainManifest
  candidates: RouteCandidate[]
  amountIn: bigint
  blockNumber: bigint
  signal?: AbortSignal
  /** The router's global request semaphore (C4-P6), threaded down to every `ethCall` this batch
   * issues. Optional so direct unit tests of this function need not construct one — omitted, each
   * `ethCall` goes ungated, exactly as before this option existed; every real search always supplies
   * `ctx.semaphore` (see `search/waves.ts`). */
  semaphore?: Semaphore | undefined
  /** The chain's PROBED Multicall3 deployment, when the router found one (`resolveMulticall3`) —
   * routes each quoting round through `aggregate3` instead of one `ethCall` per candidate. Optional
   * on the same terms as `semaphore`: omitted (unit tests, chains with no deployment), the per-call
   * path runs unchanged. See {@link runQuoteRound}. */
  multicall3?: Address | undefined
}

export type QuoteCandidatesResult = {
  quoted: QuotedRoute[]
  stats: QuoteStats
  /**
   * Candidates that failed only in the transport channel — a 429, a timeout, a dropped socket, a
   * node that could not serve the pinned block. Nothing was learned about these routes, so they are
   * handed back rather than merely counted.
   *
   * TWO THINGS THE CALLER DOES WITH THEM, and the second is the one that took a while to arrive.
   * They are already excluded from `amountIndependentFailures` here, so a caller that only ever
   * negative-caches that list cannot record a 429 as "this pool does not quote at this block". But
   * NOT negative-caching a route is worth nothing if the search never asks about it again, and
   * `search/waves.ts` filters every later enumeration against `state.seen` — into which the
   * candidate went before this call. So the engine also uses this list to RELEASE those routeIds
   * (once each; see `waves.ts#retryTransportFailures`) so a later wave or interleave pass re-quotes
   * them.
   *
   * Aggregation is what made that second use mandatory rather than tidy. `internal/multicall.ts`
   * replicates an outer failure across the whole chunk, so ONE 429 marks up to `MULTICALL_CHUNK`
   * (50) candidates transport-failed at once — fifty routes dropped from the rest of the search on
   * one provider hiccup, with the report saying only `transportFailed: 50` and `rpc-degraded`.
   */
  transportFailures: RouteCandidate[]
  /**
   * Execution-channel failures (a real revert, not a transport failure) whose revert carried NO
   * data — the amount-independent, pool-absent shape (see {@link revertDataOf}). This is the ONLY
   * subset of `failed` the caller may negative-cache: a revert WITH data (`NotEnoughLiquidity`, a
   * hook rejection, a zero-output rounding revert) can depend on `amountIn` or on which request is
   * asking, and negative-caching it would poison every other concurrent request at this block for a
   * pool that is perfectly healthy at their amount (C4-H3).
   */
  amountIndependentFailures: RouteCandidate[]
}

/**
 * Quotes every candidate at `blockNumber`, splitting each into segments and running at most two
 * rounds: round 1 quotes every candidate's first segment (batched, bounded concurrency); round 2
 * quotes the second segment (if any) of candidates whose first segment succeeded, using the
 * round-1 realized output as its `amountIn`. A segment that reverts or fails to decode drops its
 * candidate entirely (never partially quoted) and is counted as a failure.
 *
 * A segment whose `eth_call` failed in the *transport* channel (429, timeout, dropped socket — see
 * {@link TransportError}) also drops its candidate, but is counted as `transportFailed` rather than
 * `failed`: nothing was learned about that route, so it must never contribute to an authoritative
 * "no route exists".
 *
 * `signal` is checked between rounds AND, per call, once a semaphore permit is in hand
 * (`internal/rpc.ts#ethCall`). Either way the effect on `stats` is the same and is the point:
 * candidates whose `eth_call` was never sent are dropped from `quoted` but are *not* counted in
 * `stats` at all — neither attempted, succeeded, nor failed — keeping the
 * `attempted === succeeded + failed + transportFailed` invariant intact. It is the caller's job to
 * report them as unattempted (see `SearchReport.quoting.unattempted`), which `search/waves.ts`
 * already does by differencing the candidates it submitted against `stats.attempted`.
 *
 * The per-call check is what stops an aborted search from finishing a whole quoting round anyway: a
 * round dispatches every candidate at once and lets the router's semaphore meter them, so before it
 * existed an abort landing mid-round still put every queued `eth_call` on the wire — 14 seconds past
 * a 60s budget, measured (see {@link AbortedCallError}).
 */
export async function quoteCandidates(args: QuoteCandidatesArgs): Promise<QuoteCandidatesResult> {
  const { client, modules, manifest, candidates, amountIn, blockNumber, signal, semaphore, multicall3 } = args

  if (signal?.aborted) return { quoted: [], stats: emptyStats(), transportFailures: [], amountIndependentFailures: [] }

  const segmented = candidates.map((candidate) => ({ candidate, segments: segmentCandidate(candidate) }))

  const round1Results = await runQuoteRound({
    client,
    calls: segmented.map(({ segments }) => {
      const first = segments[0]!
      return encodeOr(() => modules[first.protocol].encodeQuote(first.legs, amountIn, manifest))
    }),
    blockNumber,
    semaphore,
    signal,
    multicall3,
  })

  const quoted: QuotedRoute[] = []
  const transportFailures: RouteCandidate[] = []
  const amountIndependentFailures: RouteCandidate[] = []
  let attempted = 0
  let succeeded = 0
  let failed = 0
  let transportFailed = 0
  const pendingRound2: { candidate: RouteCandidate; segments: Segment[]; round1: DecodedQuote }[] = []

  segmented.forEach(({ candidate, segments }, i) => {
    const result = round1Results[i]!
    // Never sent (the signal fired while it queued for a semaphore permit): not attempted, not
    // failed, not transport-lost — exactly the treatment a candidate dropped between rounds already
    // gets, and the caller turns the shortfall into `SearchReport.quoting.unattempted`.
    if (result instanceof AbortedCallError) return
    if (result instanceof Error) {
      attempted++
      if (result instanceof TransportError) {
        transportFailed++
        transportFailures.push(candidate)
      } else {
        failed++
        if (isAmountIndependentFailure(result)) amountIndependentFailures.push(candidate)
      }
      return
    }
    if (segments.length === 1) {
      attempted++
      succeeded++
      quoted.push({ route: candidate, quote: routeQuote(amountIn, [], [result]) })
      return
    }
    pendingRound2.push({ candidate, segments, round1: result })
  })

  if (pendingRound2.length === 0)
    return { quoted, stats: { attempted, succeeded, failed, transportFailed }, transportFailures, amountIndependentFailures }
  if (signal?.aborted)
    return { quoted, stats: { attempted, succeeded, failed, transportFailed }, transportFailures, amountIndependentFailures }

  const round2Results = await runQuoteRound({
    client,
    calls: pendingRound2.map(({ segments, round1 }) => {
      const second = segments[1]!
      return encodeOr(() => modules[second.protocol].encodeQuote(second.legs, round1.amountOut, manifest))
    }),
    blockNumber,
    semaphore,
    signal,
    multicall3,
  })

  pendingRound2.forEach(({ candidate, round1 }, i) => {
    const result = round2Results[i]!
    if (result instanceof AbortedCallError) return
    attempted++
    if (result instanceof Error) {
      if (result instanceof TransportError) {
        transportFailed++
        transportFailures.push(candidate)
      } else {
        failed++
        if (isAmountIndependentFailure(result)) amountIndependentFailures.push(candidate)
      }
      return
    }
    succeeded++
    // Two segments, so two quoter estimates to add up (and one v2 segment anywhere is what makes the
    // route's estimate absent) — see `routeQuote`/`sumGasEstimates`.
    quoted.push({ route: candidate, quote: routeQuote(amountIn, [round1.amountOut], [round1, result]) })
  })

  return { quoted, stats: { attempted, succeeded, failed, transportFailed }, transportFailures, amountIndependentFailures }
}

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
 * `promotedOverComplex: true` (declared on `RankedRoute`, which every real caller sees this route
 * as — `search/leader.ts#withExecution` spreads this object verbatim) so a caller reading only
 * `best`/`alternatives` can tell "the higher-`amountOut` route lost to a simpler one" apart from
 * "this was simply the best route found", rather than having to re-run `compareRoutes`/`isComplex`
 * against the whole ranked list to notice the override happened at all.
 */
export function rankRoutes(quoted: QuotedRoute[]): QuotedRoute[] {
  // THE MARKER IS THIS CALL'S OUTPUT, NEVER ITS INPUT. `search/leader.ts` re-ranks the accumulated
  // quote set on EVERY wave, so a route promoted in wave 1 comes back into wave 2 still carrying the
  // marker. Once wave 2 has priced a route that outprices the complex leader outright, or the leader
  // itself has been demoted, the promotion is no longer happening — but the marker would ride along
  // unchanged, and it is not decorative: `assertResultCoherent` reads it as the licence for a `best`
  // outpriced by its own `alternatives`, and the CLI prints it as the explanation. Stripping it up
  // front makes this function idempotent: `rankRoutes(rankRoutes(x))` deep-equals `rankRoutes(x)`,
  // and the marker on the way out always describes the promotion that just happened.
  // Copying only the routes that actually carry a stale marker keeps every other route referentially
  // identical to its input, which callers (and tests) rely on.
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

type ProbeQuotesArgs = {
  client: Pick<PublicClient, 'request'>
  probes: QuoteProbe[]
  amountIn: bigint
  blockNumber: bigint
  signal?: AbortSignal
  /** See {@link QuoteCandidatesArgs.semaphore}. */
  semaphore?: Semaphore | undefined
  /** See {@link QuoteCandidatesArgs.multicall3}. v2 `getReserves` probes ride along with the quoter
   * probes in the same chunks — they are the cheapest calls in the round, so excluding them would
   * spend outer calls to save inner gas nothing is short of. */
  multicall3?: Address | undefined
}

/**
 * Runs wave-0 speculative probes (single-segment, single-leg quotes used before pool discovery
 * has confirmed anything) with the same bounded-concurrency call machinery as `quoteCandidates`.
 * A reverting probe just means "no pool there" — it is dropped silently (counted as a failure, not
 * surfaced as an error) rather than treated as an RPC problem. A probe that failed in the transport
 * channel, on the other hand, means "we never found out", and is counted as `transportFailed`.
 */
export async function probeQuotes(args: ProbeQuotesArgs): Promise<QuoteCandidatesResult> {
  const { client, probes, amountIn, blockNumber, signal, semaphore, multicall3 } = args

  if (signal?.aborted) return { quoted: [], stats: emptyStats(), transportFailures: [], amountIndependentFailures: [] }

  const results = await runQuoteRound({
    client,
    calls: probes.map((probe) => probe.quote),
    blockNumber,
    semaphore,
    signal,
    multicall3,
  })

  const quoted: QuotedRoute[] = []
  const transportFailures: RouteCandidate[] = []
  const amountIndependentFailures: RouteCandidate[] = []
  let succeeded = 0
  let failed = 0
  let transportFailed = 0
  let attempted = 0
  probes.forEach((probe, i) => {
    const result = results[i]!
    // Never sent — see `quoteCandidates`' round-1 tally. `attempted` is counted here rather than
    // taken as `probes.length` precisely so a skipped probe leaves the
    // `attempted === succeeded + failed + transportFailed` invariant intact.
    if (result instanceof AbortedCallError) return
    attempted++
    if (result instanceof Error) {
      if (result instanceof TransportError) {
        transportFailed++
        transportFailures.push(probe.candidate)
      } else {
        failed++
        if (isAmountIndependentFailure(result)) amountIndependentFailures.push(probe.candidate)
      }
      return
    }
    succeeded++
    quoted.push({ route: probe.candidate, quote: routeQuote(amountIn, [], [result]) })
  })

  return { quoted, stats: { attempted, succeeded, failed, transportFailed }, transportFailures, amountIndependentFailures }
}
