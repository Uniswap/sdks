import { expect, test } from 'bun:test'
import type { Hex } from 'viem'

import { AMOUNT_IN, PERMIT2, TOKEN_A, UNIVERSAL_ROUTER } from './internal/routerFixture'
import { assertResultCoherent, emptyReport } from './internal/testing'
import { classifyQuote, classifySwap } from './router'
import type { EncodedTx, ExecutionRequirement, RankedRoute, SearchReport } from './types'

// ---------------------------------------------------------------------------
// CLASSIFICATION, AS PURE FUNCTIONS. `classifyQuote`/`classifySwap` turn what a
// search computed — a leader, its alternatives, a compiled tx, a report — into
// the public result, and every test here calls them DIRECTLY with a hand-built
// input. No client, no router, no RPC.
//
// That is the whole reason they are their own file rather than a block inside
// `router.test.ts`: the inputs these describe (a leader the chain rejected while
// the search was aborted, a `requirements` list with no compiled tx, a promotion
// marker that outlived its promotion) are shapes a real search reaches rarely and
// through long choreography, and stating them as literals is the only way to
// state them exhaustively. What each one asserts is one branch of the classifier
// plus `assertResultCoherent`'s verdict on its output — the honesty invariants
// every result the package returns is held to.
// ---------------------------------------------------------------------------

test('classifySwap: requirements present but no candidate ever compiled falls through to terminal classification, never asserting a missing tx (C1 regression)', () => {
  // The exact repro shape: a `best` exists (something was quoted and ranked), top-level
  // `requirements` is non-empty (readiness found something missing), but nothing ever compiled
  // into an executable plan, so `tx` is `undefined`. Before the fix, the `needs-action` branch
  // asserted `e.tx!` unconditionally and produced a result with `tx: undefined`, which
  // `assertResultCoherent` rejects.
  const fakeBest: RankedRoute = {
    route: { legs: [] },
    quote: { amountIn: 1n, amountOut: 1n, intermediateAmounts: [] },
    execution: 'failed',
  }
  const requirement: ExecutionRequirement = { kind: 'erc20-approval', token: TOKEN_A, spender: PERMIT2, minimumAmount: 1n }

  const completeReport = emptyReport() // aborted:false, all `disabled`, unattempted:0 -> isSearchComplete = true
  const complete = classifySwap({ best: fakeBest, alternatives: [], requirements: [requirement], report: completeReport })
  expect(complete.status).toBe('no-route')
  if (complete.status === 'no-route') expect(complete.alternatives).toContainEqual(fakeBest)
  assertResultCoherent(complete)

  const incompleteReport = { ...emptyReport(), discovery: { ...emptyReport().discovery, v2: { status: 'partial' as const, coveredRanges: [], demandFloor: 0n } } }
  const incomplete = classifySwap({ best: fakeBest, alternatives: [], requirements: [requirement], report: incompleteReport })
  expect(incomplete.status).toBe('inconclusive')
  // This candidate is `execution: 'failed'` — the chain rejected it — so it is demoted into
  // `alternatives` on the incomplete path too, exactly as on the completed `no-route` path above. An
  // authoritative revert does not become provisional because some other part of the search was cut
  // short, so `inconclusive` never *leads* with it.
  if (incomplete.status === 'inconclusive') {
    expect(incomplete.best).toBeUndefined()
    expect(incomplete.tx).toBeUndefined()
  }
  expect(incomplete.alternatives).toContainEqual(fakeBest)
  assertResultCoherent(incomplete)
})

function rankedRoute(out: bigint, execution: RankedRoute['execution'], revertData?: Hex): RankedRoute {
  return {
    route: { legs: [] },
    quote: { amountIn: AMOUNT_IN, amountOut: out, intermediateAmounts: [] },
    execution,
    ...(revertData !== undefined && { revertData }),
  }
}

test('classifyQuote: a leader outpriced by its own alternative keeps the marker that explains it (live Base regression)', () => {
  // The defect, exactly as it shipped. On Base, `rl quote eth usdc 1` ranked a hooked v4 pool top at
  // 1,906.567949 USDC and `rankRoutes`' 5-bps simplicity margin (1.6 bps here) promoted a plain v3
  // pool at 1,906.256081 ahead of it — correct, spec'd behaviour, and marked `promotedOverComplex`
  // precisely so a caller can tell it apart from a broken sort. `toQuoted` then rebuilt every quote
  // route from `{ route, quote }`, and the marker was the collateral: what reached `QuoteResult`
  // (and the CLI panel, and any SDK consumer) was a `best` beaten by its own `alternatives[0]` with
  // nothing anywhere to explain it. The marker is a fact about RANKING, which quoting performs; only
  // `execution`/`revertData` are facts about verification, and only those two may be stripped.
  const promoted: RankedRoute = { ...rankedRoute(1_906_256_081n, 'unverified'), promotedOverComplex: true }
  const outpricing: RankedRoute = rankedRoute(1_906_567_949n, 'unverified')

  const r = classifyQuote({ best: promoted, alternatives: [outpricing], report: emptyReport() })
  expect(r.status).toBe('quote')
  if (r.status !== 'quote') return
  expect(r.best.promotedOverComplex).toBe(true)
  // Still stripped: the verification fields say nothing a quote is entitled to claim.
  expect(Object.keys(r.best).sort()).toEqual(['promotedOverComplex', 'quote', 'route'])
  expect(Object.keys(r.alternatives[0]!).sort()).toEqual(['quote', 'route'])
  assertResultCoherent(r)
})

test('assertResultCoherent: an UNMARKED quote inversion is the bug, and it is rejected', () => {
  // The systemic half of the fix. An alternative pricing above `best` is legal — but only while the
  // route says why. Drop the marker (which is precisely what `toQuoted` used to do) and the same
  // result is indistinguishable from a sort bug, so it must not pass.
  const best = rankedRoute(1_906_256_081n, 'unverified')
  const outpricing = rankedRoute(1_906_567_949n, 'unverified')
  const unmarked = classifyQuote({ best, alternatives: [outpricing], report: emptyReport() })
  expect(() => assertResultCoherent(unmarked)).toThrow(/outpriced by an alternative/)

  // And an ordinary, correctly-ordered quote is untouched by the check.
  const ordered = classifyQuote({ best: outpricing, alternatives: [best], report: emptyReport() })
  expect(() => assertResultCoherent(ordered)).not.toThrow()
})

test('assertResultCoherent: a marker that OUTLIVED its promotion is the bug too, in the other direction', () => {
  // The stale half. The engine re-ranks the accumulated composed set every cycle, so a marker set
  // in one cycle is an input to the next — and if it survives a re-rank that promoted nothing, it is a
  // false explanation attached to a leader that simply won outright. (`rankRoutes` strips input
  // markers precisely so this cannot happen; this is the assertion that would catch it if that ever
  // regressed.)
  const stale: RankedRoute = { ...rankedRoute(1_906_567_949n, 'unverified'), promotedOverComplex: true }
  const lower = rankedRoute(1_000_000_000n, 'unverified')
  const r = classifyQuote({ best: stale, alternatives: [lower], report: emptyReport() })
  expect(() => assertResultCoherent(r)).toThrow(/marker outlived the promotion/)

  // The bound is `>=`, not `>`: a promotion over a route pricing EXACTLY equal is legal (the margin
  // is inclusive, and `compareRoutes`' tie-breaks decide who led), so an equal-priced alternative
  // must satisfy the check.
  const tied = classifyQuote({
    best: { ...rankedRoute(1_906_567_949n, 'unverified'), promotedOverComplex: true },
    alternatives: [rankedRoute(1_906_567_949n, 'unverified')],
    report: emptyReport(),
  })
  expect(() => assertResultCoherent(tied)).not.toThrow()
})

test('classifySwap: promotedOverComplex survives onto the public SwapResult.best untouched (C4-P7)', () => {
  // `rankRoutes` (quote/rank.ts) is what actually sets this marker; this test pins the OTHER half of
  // the contract — that `classifySwap` is a pure passthrough for it, just as `classifyQuote`'s
  // `toQuoted` now is (it strips only the two verification fields). A `RankedRoute`
  // already carrying the marker (as if `rankRoutes` had promoted it) must reach `SwapResult.best`
  // exactly as-is for both statuses that lead with `best`.
  const promoted: RankedRoute = { ...rankedRoute(100n, 'verified'), promotedOverComplex: true }
  const tx: EncodedTx = { to: UNIVERSAL_ROUTER, data: '0xfeedface', value: 0n }
  const limits = { minAmountOut: 99n, deadline: 9_999_999_999n }

  const ready = classifySwap({ best: promoted, alternatives: [], tx, limits, report: emptyReport() })
  expect(ready.status).toBe('ready')
  if (ready.status === 'ready') expect(ready.best.promotedOverComplex).toBe(true)
  assertResultCoherent(ready)

  const needsActionBest: RankedRoute = { ...rankedRoute(100n, 'needs-action'), promotedOverComplex: true }
  const requirement: ExecutionRequirement = { kind: 'erc20-approval', token: TOKEN_A, spender: PERMIT2, minimumAmount: 1n }
  const needsAction = classifySwap({
    best: needsActionBest,
    alternatives: [],
    tx,
    limits,
    requirements: [requirement],
    report: emptyReport(),
  })
  expect(needsAction.status).toBe('needs-action')
  if (needsAction.status === 'needs-action') expect(needsAction.best.promotedOverComplex).toBe(true)
  assertResultCoherent(needsAction)
})

test('classifySwap: `needs-action` is gated on the ROUTE\'s discriminant, not on the requirement count', () => {
  // The two used to be read as interchangeable, and they are only interchangeable because of the
  // order of `verifyLeader`'s body (`search/verifier.ts`, "DO NOT REORDER"). This is the shape that
  // tells them apart: a full requirement list, a compiled tx, a clean report — and a leader the
  // engine did NOT gate on those requirements. `needs-action` would be a promise about a route
  // nothing gated, and `assertResultCoherent` rejects exactly that result ("needs-action whose best
  // route is unverified"), so the classifier must not produce it in the first place.
  const requirement: ExecutionRequirement = { kind: 'erc20-approval', token: TOKEN_A, spender: PERMIT2, minimumAmount: 1n }
  const tx: EncodedTx = { to: UNIVERSAL_ROUTER, data: '0xfeedface', value: 0n }
  const limits = { minAmountOut: 99n, deadline: 9_999_999_999n }
  const abortedReport: SearchReport = { ...emptyReport(), aborted: true }

  const r = classifySwap({
    best: rankedRoute(100n, 'unverified'),
    alternatives: [],
    tx,
    limits,
    requirements: [requirement],
    report: abortedReport,
  })

  expect(r.status).toBe('inconclusive')
  assertResultCoherent(r)

  // And the positive control: same everything, leader marked `needs-action` by the engine.
  const gated = classifySwap({
    best: rankedRoute(100n, 'needs-action'),
    alternatives: [],
    tx,
    limits,
    requirements: [requirement],
    report: emptyReport(),
  })
  expect(gated.status).toBe('needs-action')
  assertResultCoherent(gated)
})

test('classifySwap: an aborted search hands back everything it computed — best, tx, and alternatives (FW5/P1 regression)', () => {
  // The `AbortSignal.timeout(900)` shape the README recommends: the search priced routes and even
  // compiled the leader's calldata, then the deadline fired. Nobody simulated the leader, so it
  // cannot be promised `ready` — but nothing ruled it out either, and discarding the priced routes
  // and the encoded tx (as this branch used to) leaves the caller a bare reason string.
  const best = rankedRoute(900n, 'unverified')
  const alternatives = [rankedRoute(800n, 'unverified'), rankedRoute(700n, 'failed', '0xdeadbeef')]
  const tx: EncodedTx = { to: UNIVERSAL_ROUTER, data: '0xfeedface', value: 0n }
  const abortedReport: SearchReport = { ...emptyReport(), aborted: true }

  const r = classifySwap({ best, alternatives, tx, report: abortedReport })

  expect(r.status).toBe('inconclusive')
  if (r.status === 'inconclusive') {
    expect(r.reason.code).toBe('aborted')
    expect(r.best).toBe(best)
    expect(r.tx).toBe(tx)
  }
  // `alternatives` and `search` are status-agnostic: reachable with no narrowing at all. A candidate
  // that reverted keeps its verbatim `revertData`, which `RankedRoute` declares.
  expect(r.alternatives).toEqual(alternatives)
  expect(r.alternatives[1]!.revertData).toBe('0xdeadbeef')
  expect(r.search.aborted).toBe(true)
  assertResultCoherent(r)
})

test('classifySwap: an aborted search whose leader REVERTED demotes it to an alternative — no best, no tx (FINDING 1)', () => {
  // The sibling of the test above, and the one line between "we could not verify this" and "we are
  // handing you calldata the chain already rejected". `execution: 'failed'` is the node answering
  // authoritatively about this block; an abort elsewhere in the search does not soften it.
  const failed = rankedRoute(900n, 'failed', '0xdeadbeef')
  const alternatives = [rankedRoute(800n, 'failed', '0xfeed')]
  const tx: EncodedTx = { to: UNIVERSAL_ROUTER, data: '0xfeedface', value: 0n }
  const abortedReport: SearchReport = { ...emptyReport(), aborted: true }

  const r = classifySwap({ best: failed, alternatives, tx, report: abortedReport })

  expect(r.status).toBe('inconclusive')
  if (r.status === 'inconclusive') {
    expect(r.best).toBeUndefined() // never a lead the chain rejected...
    expect(r.tx).toBeUndefined() // ...and never its calldata
  }
  // The ranking survives the demotion: the nominal leader is still the head of the list.
  expect(r.alternatives).toEqual([failed, ...alternatives])
  assertResultCoherent(r)
})

test('classifySwap: partial discovery (no best) classifies inconclusive/discovery-incomplete (C4-P5)', () => {
  // Every other axis is clean (not aborted, nothing unattempted, no transport/verification/head
  // trouble) — the ONLY thing standing between this search and a completed verdict is one protocol's
  // discovery never finishing. `inconclusiveReason` must name that axis specifically, not fall back
  // to a generic code.
  const report: SearchReport = { ...emptyReport(), discovery: { ...emptyReport().discovery, v2: { status: 'partial', coveredRanges: [], demandFloor: 0n } } }

  const r = classifySwap({ alternatives: [], report })

  expect(r.status).toBe('inconclusive')
  if (r.status === 'inconclusive') {
    expect(r.reason.code).toBe('discovery-incomplete')
    expect(r.reason.detail).toContain('v2:partial')
  }
  assertResultCoherent(r)
})

test('classifySwap: unattempted quote candidates (no best) classify inconclusive/quotes-unattempted (C4-P5)', () => {
  // Discovery is complete (every protocol `disabled` in `emptyReport`), nothing aborted, nothing
  // degraded — the search was simply cut off with candidates still unquoted, which is its own
  // incompleteness axis and must not be folded into a generic "did not complete" message.
  // `unattempted` sits outside the `attempted` sum and outside `legsMeasured`: these are legs that
  // were planned and never dispatched, so nothing settled for them.
  const report: SearchReport = {
    ...emptyReport(),
    quoting: { ...emptyReport().quoting, unattempted: 3 },
  }

  const r = classifySwap({ alternatives: [], report })

  expect(r.status).toBe('inconclusive')
  if (r.status === 'inconclusive') {
    expect(r.reason.code).toBe('quotes-unattempted')
    expect(r.reason.detail).toContain('3')
  }
  assertResultCoherent(r)
})
