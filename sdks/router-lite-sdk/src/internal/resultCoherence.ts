import { zeroHash } from 'viem'

import { PREFLIGHT_TOP_K } from '../constants'
import { WAVE_COUNT } from '../search/waves'
import type { BlockRef, Protocol, QuoteResult, ReasonCode, SearchReport, SwapResult } from '../types'
import { protocolRecord, zeroQuoting, zeroReportEnumeration, zeroVerification } from '../types'

// ---------------------------------------------------------------------------
// `emptyReport`/`assertResultCoherent` live in their own module, split out of the test-fixture grab
// bag `internal/testing.ts`, because they are the two symbols of that file blessed onto
// `experimental/index.ts` (see that file's "BLESSED FOR canary/ AND cli/" block) — a caller building
// its own fixtures needs the SDK's own honesty check, not a re-derived approximation of it.
// `internal/testing.ts` is deliberately excluded from every build (`build.surface.test.ts` pins
// this: nothing the package exports may reach it), so blessing a symbol defined there would have
// pulled its ENTIRE grab bag — `StubViolationError`, `serveAggregate3`, the Permit2 EIP-712
// restatement, every provider-failure fixture — into the published `dist/`. This module carries only
// the two blessed functions and their private helpers, so the dist closure reaches exactly those.
// `internal/testing.ts` re-exports both from here, so every existing internal suite that imports
// them from `./testing`/`../internal/testing` keeps working unchanged.
// ---------------------------------------------------------------------------

const ZERO_BLOCK: BlockRef = {
  number: 0n,
  hash: zeroHash,
  timestamp: 0n,
}

/**
 * An all-zero, all-disabled {@link SearchReport} — the starting point for tests that need a report
 * but aren't exercising discovery/quoting behavior themselves.
 */
export function emptyReport(): SearchReport {
  return {
    block: ZERO_BLOCK,
    discovery: protocolRecord<SearchReport['discovery'][Protocol]>(() => ({ status: 'disabled', coveredRanges: [], demandFloor: 0n })),
    enumeration: zeroReportEnumeration(),
    quoting: zeroQuoting(),
    aborted: false,
    verificationDegraded: false,
    headRegressed: false,
    verification: zeroVerification(),
  }
}

/**
 * The `ReasonCode`s legal on an `inconclusive` result (C4-P5, F5) — the mirror image of `no-route`'s
 * whitelist (`no-viable-route`/`no-route-verified`) below: those two claim the search COMPLETED,
 * which directly contradicts every incompleteness axis `inconclusive` requires, so they may never
 * appear here and everything else may.
 */
const INCONCLUSIVE_REASON_CODES: ReadonlySet<ReasonCode> = new Set([
  'rpc-unavailable',
  'rpc-degraded',
  'aborted',
  'discovery-incomplete',
  'quotes-unattempted',
])

/**
 * The honesty invariants, mechanically enforced everywhere: every result carries its search report
 * and its `alternatives` (an empty array is an answer, not an absent field); a `ready` result really
 * was verified at the reported block, and says so on the very route it leads with, as does
 * `needs-action` on its own; `needs-action` always carries both requirements and a tx; `no-route`
 * never follows an incomplete or aborted search — nor one that lost calls to the transport, nor one
 * that ran against a head the router had already been past, both of which are evidence about the
 * provider and none about the chain; `inconclusive` always has a set
 * incompleteness axis, never carries calldata for a route it does not also name, and never leads
 * with a route the chain authoritatively rejected; a quote's routes carry nothing beyond the quote
 * and its ranking, and a quote whose `best` is outpriced by one of its own `alternatives` says on
 * the route WHY (`promotedOverComplex`) rather than looking like a broken sort;
 * a route reports a quoter `gasEstimate` only if a quoter actually measured one (never a v2-only
 * route); and quoting stats always add up. Every test in Tasks 12, 17, 18, and the fork/canary suites that
 * produces a result MUST pass it through this — a classification bug then fails tests that were
 * checking something else entirely.
 */
export function assertResultCoherent(r: QuoteResult | SwapResult): void {
  // Status-agnostic fields, checked status-agnostically: no variant may omit them.
  if (!Array.isArray(r.alternatives)) throw new Error(`${r.status} without an alternatives array`)
  // GAS IS REPORTED, NEVER RANKED, AND NEVER INVENTED. `RouteQuote.gasEstimate` is a reading taken by
  // a quoter that actually simulated the swap, so a route made only of v2 legs — priced by local
  // constant-product arithmetic over `getReserves()`, with no on-chain simulation anywhere — cannot
  // have one. This is the shape of the field checked status-agnostically, on every route of every
  // result any suite produces: an estimate appearing on a v2-only route would mean something
  // downstream started synthesizing a number, which is precisely the failure the absence rule exists
  // to prevent (a synthesized figure is indistinguishable from a measured one once it is on the
  // object). Nothing here checks the VALUE against ranking, because ranking never reads it —
  // `rankRoutes` orders on `amountOut` alone (`quote/quote.ts`, and its own test asserts the
  // indifference directly).
  const leader = 'best' in r ? r.best : undefined
  for (const route of [...(leader ? [leader] : []), ...r.alternatives]) {
    if (route.quote.gasEstimate === undefined) continue
    if (route.route.legs.every((leg) => leg.pool.protocol === 'v2')) {
      throw new Error(
        `a v2-only route reports gasEstimate ${route.quote.gasEstimate} — v2 quotes are local reserve math and measure no gas`,
      )
    }
  }
  if (r.status === 'quote') {
    // Quoting verifies nothing, so a quote's routes are plain `QuotedRoute`s. The engine's own
    // routes travel with `execution`/`revertData`; handing one straight through would ship keys the
    // declared type says do not exist (and that a caller would then start depending on).
    // `promotedOverComplex` is declared ON `QuotedRoute` and so is not one of them — it is a fact
    // about the ranking, which quoting does perform, and the check below is why it has to survive.
    for (const route of [r.best, ...r.alternatives]) {
      const extra = Object.keys(route).filter((k) => k !== 'route' && k !== 'quote' && k !== 'promotedOverComplex')
      if (extra.length > 0) throw new Error(`quote result carries non-quote route fields: ${extra.join(', ')}`)
    }
    // THE RANKING INVARIANT, AND THE ONE SANCTIONED EXCEPTION TO IT. A quote's `best` is the top of a
    // list ordered by `amountOut` descending, so a listed alternative pricing ABOVE it is either a
    // sort bug or `rankRoutes`' simplicity margin (`SIMPLICITY_MARGIN_BPS`) — and those two are
    // indistinguishable to a caller unless the promotion says so on the route itself. Live on Base
    // this shipped as the second: `best` at 1,906.256081 USDC above `alternatives[0]` at
    // 1,906.567949 from a hooked v4 pool, correct ranking rendered as a broken one, because
    // `toQuoted` had rebuilt `best` without its marker. An inversion is legal; an UNMARKED
    // inversion is the bug, and it is checked here rather than in one test so that every result any
    // suite produces has to be honest about it.
    //
    // Only the QUOTE union is checked. A swap's leader may legitimately price below an alternative
    // with no promotion involved at all — `verifyLeader` walks the ranked list and stops at the
    // first candidate that SIMULATES, so any higher-priced candidate it passed over is sitting in
    // `alternatives` as `'failed'`/`'unverified'`, which is verification demoting a route rather
    // than ranking mis-ordering one.
    const outpriced = r.alternatives.find((alt) => alt.quote.amountOut > r.best.quote.amountOut)
    if (outpriced !== undefined && r.best.promotedOverComplex !== true) {
      throw new Error(
        `quote best (${r.best.quote.amountOut}) is outpriced by an alternative (${outpriced.quote.amountOut}) ` +
          'without promotedOverComplex to explain it',
      )
    }
    // AND THE SAME CHECK IN THE OTHER DIRECTION: a marker with no promotion left to explain. The
    // marker is not decorative — it is the licence the check above grants, and the CLI prints it as
    // the reason a caller is not looking at the highest number found — so one that outlived its
    // promotion is a false explanation, and it is exactly what a re-rank produces if `rankRoutes` is
    // ever allowed to carry an input marker through to its output (`quote/quote.ts` strips it for
    // this reason).
    //
    // THE BOUND IS `>=`, NOT `>`, AND THAT IS NOT SLOPPINESS. A promotion needs the simpler candidate
    // to be within `SIMPLICITY_MARGIN_BPS` of the complex leader — which includes pricing EXACTLY
    // EQUAL to it, with `compareRoutes`' transition/hop/routeId tie-breaks deciding who led. So a
    // legitimately-marked `best` is guaranteed an alternative pricing at or above it (the complex
    // route it was promoted over), and nothing stronger: demanding a strict inversion would reject
    // a correct result on every tie.
    if (r.best.promotedOverComplex === true && !r.alternatives.some((alt) => alt.quote.amountOut >= r.best.quote.amountOut)) {
      throw new Error(
        `quote best (${r.best.quote.amountOut}) claims promotedOverComplex, but no alternative prices at or above ` +
          'it — the marker outlived the promotion it describes',
      )
    }
  }
  if (r.status === 'ready') {
    if (!r.tx || r.execution.verifiedAtBlock.number !== r.search.block.number)
      throw new Error('ready without at-block verification')
    // `ready` is a promise about *this* route's simulation, so the route itself must say it was
    // verified — a `ready` leading an `unverified`/`failed` route is the exact lie the status denies.
    if (r.best.execution !== 'verified') throw new Error(`ready whose best route is ${r.best.execution}`)
    // C4-P7: `limits` echoes the compiled plan's own on-chain assertions — a `ready` result without
    // it is calldata the caller cannot cross-check against anything.
    if (!r.limits) throw new Error('ready without compiled limits')
  }
  if (r.status === 'needs-action') {
    if (r.requirements.length === 0 || !r.tx) throw new Error('needs-action without requirements+tx')
    // The twin of `ready`'s check: the route this status leads with is the one whose execution was
    // short-circuited by those requirements, and it must say so rather than claim (say) `'verified'`.
    if (r.best.execution !== 'needs-action') throw new Error(`needs-action whose best route is ${r.best.execution}`)
    // `needs-action` is a promise that this list is what stands between the trader and the swap. A
    // readiness read that never landed makes the list incomplete, so the promise cannot be made.
    if (r.search.verificationDegraded) throw new Error('needs-action off degraded verification')
    if (!r.limits) throw new Error('needs-action without compiled limits')
  }
  // A QUOTE's `no-route`/`inconclusive` carries an EMPTY `alternatives` (`types.ts#QuoteResult`, in
  // prose only — both unions share one field, so no type can say it). Quoting has no verification
  // step that could demote a leader into the list: either something priced, and the result is
  // `quote` however incomplete the search that found it, or nothing did and there are no runners-up.
  // A populated one is therefore a result that lists routes under a status claiming none were found
  // — visible to callers, and exactly the contradiction the `quote` arm's own checks would have
  // caught had the leader still been there.
  //
  // The quote/swap seam is the ROUTE SHAPE, the same discriminator the `'quote'` arm above uses: a
  // swap's `alternatives` are `RankedRoute`s and always carry `execution` (a quote's never do).
  if ((r.status === 'no-route' || r.status === 'inconclusive') && r.alternatives.some((alt) => !('execution' in alt))) {
    throw new Error(`${r.status} quote result with ${r.alternatives.length} alternative(s) — quoting demotes nothing`)
  }
  if (r.status === 'no-route') {
    for (const [p, d] of Object.entries(r.search.discovery))
      if (d.status !== 'complete' && d.status !== 'disabled')
        throw new Error(`no-route with ${p} discovery ${d.status}`)
    if (r.search.aborted) throw new Error('no-route despite abort')
    // The FW2 invariant: a quote that never got an answer, or a verification that could not be
    // carried out, is evidence about the provider and none about the chain. Either one forfeits the
    // right to an authoritative "there is no route".
    if (r.search.quoting.transportFailed > 0) throw new Error('no-route despite transport-failed quotes')
    if (r.search.verificationDegraded) throw new Error('no-route despite degraded verification')
    // The quiet sibling of the two above (C4-H1): nothing failed, but the whole search ran against a
    // head this router had already been past, so none of its answers describe the current chain.
    if (r.search.headRegressed) throw new Error('no-route despite a regressed head')
    // A completed search only ever names one of the two "nothing verified" codes (C4-P5) — never an
    // incompleteness code, which would contradict every check just above.
    if (r.reason.code !== 'no-viable-route' && r.reason.code !== 'no-route-verified')
      throw new Error(`no-route with unexpected reason code '${r.reason.code}'`)
  }
  if (r.status === 'inconclusive') {
    const incomplete =
      r.search.aborted ||
      Object.values(r.search.discovery).some((d) => d.status === 'partial' || d.status === 'failed') ||
      r.search.quoting.unattempted > 0 ||
      r.search.quoting.transportFailed > 0 ||
      r.search.verificationDegraded ||
      r.search.headRegressed
    if (!incomplete) throw new Error('inconclusive with no incompleteness axis set')
    // Carrying what the search *did* find is the point of this status (an aborted search hands back
    // its leader and calldata rather than discarding them) — but calldata for an unnamed route is
    // not salvage, it is a dangling reference. `'tx' in r` is the QuoteResult/SwapResult seam, not a
    // per-variant probe: quotes have no transactions at all.
    if ('tx' in r && r.tx !== undefined && r.best === undefined) throw new Error('inconclusive with a tx but no best route')
    // A route the chain rejected is never offered as the lead, whatever else the search failed to
    // finish: `execution: 'failed'` is authoritative on its own, so such a candidate belongs in
    // `alternatives` (with its `revertData`) exactly as it would on the completed `no-route` path.
    // `'best' in r` is the QuoteResult/SwapResult seam (a quote's `inconclusive` has no leader to
    // carry at all — see `types.ts`); the inner `in` is because a quote route has no `execution`.
    if ('best' in r && r.best !== undefined && 'execution' in r.best && r.best.execution === 'failed')
      throw new Error('inconclusive led by a route that authoritatively failed preflight')
    // C4-P5: `reason.code` is not free-form — each incompleteness code names a specific axis, and the
    // axis it names must actually be set. A mismatch here is a classifier bug (the wrong code for the
    // wrong reason), not a legitimate result shape.
    const { code } = r.reason
    if (code === 'aborted' && !r.search.aborted) throw new Error(`reason code 'aborted' without search.aborted set`)
    if (
      code === 'rpc-degraded' &&
      !(r.search.quoting.transportFailed > 0 || r.search.verificationDegraded || r.search.headRegressed)
    ) {
      throw new Error(`reason code 'rpc-degraded' without a transport/verification/head-regression axis set`)
    }
    if (
      code === 'discovery-incomplete' &&
      !Object.values(r.search.discovery).some((d) => d.status === 'partial' || d.status === 'failed')
    ) {
      throw new Error(`reason code 'discovery-incomplete' without any protocol's discovery partial/failed`)
    }
    if (code === 'quotes-unattempted' && !(r.search.quoting.unattempted > 0))
      throw new Error(`reason code 'quotes-unattempted' without unattempted quotes`)
    // `rpc-unavailable` is only ever built from `buildOutageReport` (`router.ts`), whose all-zero
    // report never pinned a real block — a total outage before the first RPC, not just an incomplete
    // search.
    if (code === 'rpc-unavailable' && r.search.block.number !== 0n)
      throw new Error(`reason code 'rpc-unavailable' with a non-zero pinned block`)
    // F5: the mirror of `no-route`'s whitelist above. Without this, a classifier bug that leaked
    // `no-viable-route`/`no-route-verified` onto an `inconclusive` result passed every per-code axis
    // check above (neither code has one) and was invisible here.
    if (!INCONCLUSIVE_REASON_CODES.has(code)) throw new Error(`inconclusive with unexpected reason code '${code}'`)
  }
  const q = r.search.quoting
  if (q.attempted !== q.succeeded + q.failed + q.transportFailed) throw new Error('quoting stats do not add up')

  // THE CONSERVATION INVARIANT — a leg that settled was a leg that was dispatched.
  //
  // A BOUND, NOT AN EQUALITY, and the gap is the transport-retry rule: `attempted` counts DISPATCHES
  // and `legsMeasured` counts KEYS that reached a terminal state, so a leg lost in the transport and
  // re-dispatched once is two attempts against one settled key (`search/state.ts#applyMeasurement`).
  // The bound is what catches the leak in the other direction — a settled key nothing ever asked for,
  // which is what a counter incremented outside the single `apply*` switch would look like from here.
  const legs = r.search.enumeration.legsMeasured
  if (legs > q.attempted) {
    throw new Error(`legsMeasured (${legs}) exceeds attempted (${q.attempted}) — a leg cannot settle without being dispatched`)
  }

  // C4-P7: `verifyLeader` spends at most `PREFLIGHT_TOP_K` real simulations per evaluated STAGE, and
  // the engine runs at most `WAVE_COUNT` stages (five since C5-B split wave 0 into 0a/0b, which is
  // why this reads stages rather than waves) — so a per-search cumulative total above that product
  // is not a report of legitimate work, it is a bug in how `preflightAttempted` is accumulated (e.g.
  // double counting across stages, or a stray increment outside `verifyLeader`'s own budgeted loop).
  const v = r.search.verification
  if (v.preflightAttempted > PREFLIGHT_TOP_K * WAVE_COUNT) {
    throw new Error(
      `preflightAttempted (${v.preflightAttempted}) exceeds PREFLIGHT_TOP_K * WAVE_COUNT (${PREFLIGHT_TOP_K * WAVE_COUNT})`,
    )
  }
  if (v.preflightAttempted < 0) throw new Error('preflightAttempted must not be negative')
}
