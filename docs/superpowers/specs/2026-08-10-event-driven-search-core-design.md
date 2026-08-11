# Event-Driven Search Core — Design

*2026-08-10 · router-lite-sdk · follows the findings in `sdks/router-lite-sdk/docs/architecture-review.md` and `code-quality-review.md`.*

## 1. Motivation

The current engine (`search/waves.ts`) is a staged batch pipeline. Every recent performance fix patched against that model's grain, and each patch shipped new machinery: `quoteWhileDiscovering` polling on a 5s timer, the wave-0a/0b split with a 500ms grace, a detached scan with its own AbortController and unsubscribe bookkeeping, the `onFirstRoute` callback side-channel, `signatureOf` yield suppression. Separately, per-pair pool *selection* (3-of-N by heuristic) forced a compensation complex — `quoteEvidence`, `probeContendedCoreLegs`, the reserved-newest-slot rule — after the warm-index 5.6x mis-route. And the engine's accounting invariants are held by call-site discipline defended by "DO NOT REORDER" comments.

This redesign replaces the staged pipeline with a data-arrival-driven core in which those mechanisms are unnecessary rather than forbidden.

## 2. Decisions already made (with the maintainer)

1. **Hard cut.** No compatibility layer, no parallel API. Breaking changes to the iterator surface, `SearchReport`, and internal exports are acceptable; the package is pre-1.0.
2. **Measure, don't select, is folded in** — the pricing pump is designed around leg-level measurement from day one.
3. **Gated cost model.** Cheap information first; unbounded history scans start only when cheap information is exhausted and the consumer still wants more. A hinted `getSwap` must still issue zero unbounded log scans.

## 3. The model

The search is an **anytime algorithm**: at every moment there is a current best answer plus an honesty report, monotonically improving as knowledge arrives. It is built from **one loop, two convergence processes, a verifier, and a set of frontiers**. There are no waves, tiers, stages, task objects, or timers.

| Piece | Converges toward | Dedup lives in |
|---|---|---|
| Pricing pump | every measurable leg of every relevant pair priced at the pinned block | the per-search measurement map |
| Coverage worker | every demanded log scope covered | the shared index coverage cache (cross-search, cross-process) |
| Verifier | the current leader simulated, or gated on readiness | compiled-route memo + per-candidate simulation results |

Duplicate work is impossible by construction, not by discipline: a leg is measured once because the measurement map is the work queue's own key; a block range is scanned once because coverage is the demand computation's input; a route compiles once because the memo is keyed by routeId.

**Frontiers** are the search space's genuine monotone dials, and there is exactly one advance rule: *when the pump is dry and the consumer is still pulling, every frontier advances one notch.* ("Still pulling" is structural: the loop body only runs between pulls of the generator.) The search therefore **converges to exhaustive in the limit**: given a consumer that keeps pulling, coverage reaches the deployment floors, every eligible intermediate is eventually selected, and `exhaustiveWithinMaxHops: true` is actually reachable.

One dimension is a frontier in v1; coverage deliberately is not:

- **Intermediates (a frontier).** The selected set grows by a batch per notch (seed and batch = today's `MAX_INTERMEDIATES`, 8) instead of being capped forever. Ordering stays hinted → cores → newest-touching-pool: a measurement-based ordering is dimensionally impossible up front (`m_X` values are denominated in different tokens across intermediates, so in-leg outputs cannot rank X against Y — only out-legs, in tokenOut, are comparable, and by then the cost is paid).
- **Coverage (a gate plus a walk order, not a frontier).** No scan order can rank pools by quality in either direction — creation events do not encode current liquidity; *measurement* finds the best pools, and scan order affects only when a pool becomes known. Of the three classes only scans can contribute (unknown intermediates, hooked/nonstandard-tier pools, brand-new pools), only the third has a temporal prior, and it is recent; the other two are order-indifferent in expectation. So coverage needs exactly: one **gate** (pump dry → demand every scope's full range, once), and a **head-backward walk order** inside the worker — the head end is mandatory anyway, warm incremental searches only ever need the head-adjacent delta, and the one class with a prior lives there. Granularity comes from **chunk arrival** (the existing `onLogs` seam pokes `wake` per chunk), which is strictly more continuous than any notch schedule: pools flow into the pump as each chunk lands, and prices improve at measurement-round cadence throughout. A value-ordered horizon schedule was considered and rejected as ceremony — pacing over a dimension with almost no value ordering, whose cost control budgets and aborts already provide.

Improvement therefore has three nested, all data-driven cadences: leads at measurement-round cadence (~one multicall round trip), knowledge at scan-chunk cadence, and the search space at dry-cycle (frontier) cadence.

**Extensibility (explicitly not in v1).** The frontier model makes two future features one-notch additions instead of redesigns: *verification depth* (when everything is dry and a `swaps()` consumer still pulls, verify runners-up within the preflight budget, filling in `alternatives[].execution`) and *max-hops* (a third hop as a frontier notch, with dominance composition chaining). Both are noted so the loop's shape is not accidentally specialized against them; neither is specced.

### 3.1 The solver loop

One module, `search/loop.ts`, exporting an async generator that replaces `searchWaves`:

```
async function* search(ctx, req, kind): AsyncGenerator<EngineEvent> {
  const block = await ctx.pinnedBlock            // dispatch/validation overlap unchanged
  const state = createState(block)               // single-writer state, §3.5
  const wake = createNotifier()                  // the one new primitive
  const sources = new SourceSet(wake)            // tracked promises + one AbortController

  sources.launch(readiness(...))                 // the whole bounded prelude (swaps; §3.2 —
                                                 // hints are hypotheses, not a source)
  coverage.demandEager()                         // pair scope, recent week — the bounded
                                                 // latency guarantee for the new-asset case
  sources.launch(coverageWorker(...))            // converges toward current demand,
                                                 // walking uncovered ranges head-backward
  try {
    while (true) {
      await wake.next()                          // coalescing: N pokes before await = 1 wake
      await pump(state, ctx, req, wake)          // §3.2 (early-exits if index unchanged)
      maybeVerify(state, ctx, req, wake)         // swaps only, §3.4
      yield* emitChanges(state)                  // lead / progress, coalesced per cycle
      if (state.aborted || allConverged(state, sources, frontiers)) { yield finalEvent(state); return }
      if (pumpDry(state)) {
        coverage.demandFull()                    // the gate — idempotent after first call
        frontiers.advance()                      // intermediates batch; no-op at the limit
      }
      // "consumer still pulling" is structural, not a condition: the loop body only runs
      // between pulls of the generator, so a consumer that stopped never widens anything.
    }
  } finally {
    sources.abortAll()                           // covers abandonment, abort, completion
  }
}
```

Rules that keep the loop from re-accreting `waves.ts`'s fate:

- The loop **sequences only**. Pricing, coverage, verification, state mutation, event derivation, and report assembly live in sibling modules. The loop body stays under ~80 lines.
- The **notifier** is the only wake mechanism: poked by source progress (the existing `onLogs` chunk seam), source settlement, measurement-round settlement, preflight settlement, and abort. It coalesces (many pokes before the next `await` produce one wake), and the pump early-exits when the index version has not moved since its last cycle — so a storm of chunk arrivals costs one planning pass, and a wake with no new knowledge costs O(1). No timers exist anywhere in the engine.
- **Pull-drivenness is the laziness contract.** The generator suspends at `yield`; a consumer that stops pulling stops the frontier from widening. In-flight work is cancelled by `finally` when the consumer abandons the iterator.

### 3.2 The pricing pump

The pump converges measurements toward: *every measurable leg of every relevant pair, priced at the pinned block, at the amount the leg would actually see.*

**Relevant pairs.** The direct pair (in, out), plus (in, X) and (X, out) for each selected intermediate X. Intermediates = hinted tokens, then manifest cores, then discovered neighbor-intersection nodes (newest-touching-pool first), selected up to the intermediates frontier's current notch and reported via `intermediatesPruned` (which now reads "not selected *yet*" — the frontier reaches everything eligible in the limit). This ordering is the one surviving selection heuristic; per-pair pool selection does not survive.

**Measurable legs.** For a relevant pair: every pool the index knows on it, plus **hypotheses** — pool identities derivable without discovery: v2/v3 CREATE2 addresses at standard and fee-scan-discovered tiers, v4 standard configs, **and the request's hints**. A hint is a caller-supplied hypothesis: its identity derives locally (`validateHint`'s pure half), its existence is proven or refuted by measurement, and refutation feeds the existing discredit history — so `resolveHints` disappears as a source and hint provenance rides on the hypothesis (`ingestPool` keeps standalone validation for the public API). Non-hint hypotheses reuse the modules' existing `speculativeDirect` enumeration (renamed `hypotheses`). A successful measurement upserts the pool; a data-less revert negative-caches it — the existing rules, now on one channel. Speculative direct probes, discovery probes, core-leg probes, fee-widened probes, and hint validation cease to exist as separate channels: **everything is a measurement.**

**Amounts.** Direct and in-legs measure at `amountIn`. Out-legs for X measure at `m_X` = the best realized in-leg output observed for X; out-legs with no `m_X` yet are deferred until an in-leg for X answers. (This deferral replaces `probeContendedCoreLegs`' two-stage dance — it is the natural behavior of a data-driven pump.) If `m_X` improves (a new best in-leg), X's out-leg measurements are invalidated for composition and re-measured at the new amount; churn is bounded by how often the best in-leg improves.

**Rounds.** Each pump cycle collects all due, unmeasured legs, dedupes by (pool, direction, amount), and dispatches one batched round through the existing multicall machinery under the router's semaphore. Failure handling is today's rules verbatim: transport losses release the leg for exactly one retry; data-less reverts negative-cache; reverts with data fail the leg without caching. A per-pair measurement ceiling (`MEASUREMENT_PAIR_CEILING = 128` — an abuse backstop against pool-spam pairs, not a selection cap; two orders of magnitude above today's caps) is reported via `pairCeilingHit` if it ever bites.

**Composition.** AMM legs are monotone (more in → never less out). Therefore, through any intermediate X, *(best in-leg) composed with (best out-leg measured at that in-leg's realized output) dominates every other (in, out) combination through X.* The pump composes:

- direct routes — each direct pool's own measurement;
- two-hop routes through each X — (best-in_X, out_j) for every out-leg measured at `m_X`.

Every composed quote is an **exact chained on-chain number**: the out-leg was measured at precisely that route's realized intermediate amount. Dominated combinations (non-best in-legs) are not priced and not reported as priced — they are provably inferior. `intermediateAmounts` carries `[m_X]`; `gasEstimate` is the sum of leg estimates, absent if any leg lacks one (v2 legs never carry one — rule unchanged). Same-protocol two-hops are also priced per-leg rather than as one whole-path quoter call: one extra inner call, in exchange for one uniform quoting shape and cross-candidate dedup.

**Ranking** is unchanged: `rankRoutes`, tie-breaks, and the simplicity margin apply to the composed set as-is.

### 3.3 The coverage worker

Scanning is declarative state plus one convergence worker. There is no "scan wave" and no "retry wave" — those were the same idempotent operation run twice.

- **Demand**: per scope this trade needs — adjacency for both endpoints per enabled protocol, the exact-pair scope, the fee-factory scope. Pre-gate, demand is the exact-pair scope's recent week only (today's `WAVE0_RECENT_WINDOW_SECONDS`, surviving as this eager slice); the gate opens every scope's full range `[deployBlock, head]`. Demand is a pure function of (scopes, gate state).
- **Have**: the shared index coverage cache.
- **Converge**: loop — compute `uncovered = demand − have`, plan merged requests over it (the existing `adjacencyPlan` merging logic, unchanged), execute via `scanLogs` (unchanged, including width memory, declared-cap handling, and backoff), ingest logs chunk-by-chunk poking `wake`, record coverage — and pass again **while the previous pass made progress**. Uncovered ranges are walked **head-backward** (see §3 for why: the head end is mandatory, warm searches live there, and new pools are the one scan-discoverable class with a temporal prior). Settle when converged, when a pass covers nothing new (→ discovery `failed`, today's semantics), or when aborted. The gate widening demand re-wakes a settled worker — convergence is against current demand, not the demand at launch. Within a search the worker tracks ranges it already attempted, so later passes ask only true gaps and never re-ask the reorg tail (today's `adjacencyScanned` bookkeeping, now private to the worker).

The while-progress rule replaces both the fixed retry count (wave 3) and `FEE_DISCOVERY_MAX_REQUESTS`: the fee scan no longer runs *ahead* of adjacency in a serial order it could starve — all scopes converge concurrently, metered by the shared semaphore and `scanLogs`' own per-scan request budget.

Report derivation is direct, judged against the **limit demand** (deployment floors), never against what the gate has opened so far: `complete` = covered to the floor for both endpoints; `partial` = gaps remain (including "the walk simply hasn't reached that far yet"); `failed` = a zero-progress pass occurred; coverage bars read the index exactly as today (cumulative, endpoint-intersected, floored denominators — monotone by construction).

### 3.4 The verifier

Semantics unchanged, structure simplified. For swaps, when ranking produces a new leader: compile + encode (memoized `CompiledRoute` per routeId), then the readiness gate, then preflight — as a concurrent activity that pokes `wake` on settlement, so verification races discovery instead of serializing per wave. At most one preflight is in flight; a leader change during flight queues the new leader next. On revert: mark `failed` with verbatim `revertData`, fall through to the next unfailed candidate. `PREFLIGHT_TOP_K` becomes a **per-search** simulation budget (a plain counter; slight behavior change from per-wave, noted in §7). The readiness ordering invariant becomes structural: the verify function takes the settled readiness outcome as a parameter, so it cannot run before readiness resolves. All `readinessDegraded` rules (no `needs-action` from incomplete reads; no blaming reverts on the route when funding state is unknown) transfer verbatim.

### 3.5 Single-writer state and the outcome log

All search state lives in one `SearchState`; every mutation goes through typed `apply*` functions in `search/state.ts` (`applyMeasurement`, `applyCoverage`, `applyReadiness`, `applyPreflight`, `applySourceSettled`, `applyAbort`). Counters move only there, so the conservation invariants (`attempted = succeeded + failed + transportFailed`; `unattempted ≤ planned`) hold by construction. `buildReport(state)` stays a pure function. The report's *vocabulary* — independent completeness axes, transport-vs-revert separation, conservative-in-one-direction coverage — is retained exactly; it is the part of the current design worth keeping verbatim.

When recording is enabled, each applied outcome appends to an **outcome log**. Golden tests become recorded outcome logs replayed through `apply` + composition + `buildReport` — independent of RPC request shapes, which is the coupling that quarantined two of today's five golden sessions. RPC-level replay (`internal/replay.ts`) survives only for provider-conformance tests, which are genuinely about wire shapes.

## 4. Public API (hard cut)

```ts
interface Router {
  getQuote(req: QuoteRequest): Promise<QuoteResult>       // unchanged
  getSwap(req: SwapRequest): Promise<SwapResult>          // unchanged
  quotes(req: QuoteRequest): AsyncIterable<SearchEvent<QuoteResult>>
  swaps(req: SwapRequest): AsyncIterable<SearchEvent<SwapResult>>
  // ingestPool / ingestLogs / ingestReceipt / stats / clearIndex unchanged
}

type SearchEvent<R> =
  | { type: 'lead'; result: R }                 // improved best — full interim result
  | { type: 'progress'; search: SearchReport }  // an axis moved; no new lead
  | { type: 'final'; result: R }                // exactly once, always last
```

- `lead` fires when the best route's identity, amountOut, execution status, or tx changes (the natural successor to `signatureOf`); it carries a full result so consumers need no delta logic.
- `progress` is coalesced to at most one per wake cycle, emitted when the report moved without a new lead.
- `getQuote`/`getSwap` consume their own event stream and stop at the first actionable `lead` (`quote` / `ready` / `needs-action`) or `final`. The classify layer shrinks: the engine emits public result shapes directly.
- **Deleted**: `IterateOptions`, `onFirstRoute` (the first `lead` is that callback).

**`SearchReport` changes** (breaking): `quoting` counters count leg measurements on one channel (the probe-inclusive three-channel caveat disappears); `enumeration` keeps `intermediatesDiscovered/Selected/Pruned` and `exhaustiveWithinMaxHops`, drops `poolsPruned`/`candidatesPruned`/`candidatesGenerated` (their caps no longer exist), and gains `legsMeasured` and `pairCeilingHit: boolean`. All other fields (block, discovery, aborted, verificationDegraded, headRegressed, verification) are unchanged.

## 5. Errors and abort

Unchanged taxonomy: business outcomes are data through `apply`, never throws; transport ≠ revert ≠ node-state ≠ head-regression keep their separate axes; `RpcUnavailableError` escapes only from the pinned-block fetch. Lifetime management collapses to one rule: the generator's `finally` aborts the `SourceSet`. Nothing can outlive a search. `req.signal` is observed at the loop top and inside sources exactly as today.

## 6. Deletions and survivals

**Deleted** (machinery whose reason has ceased): `searchWaves` + `WAVES`/`WAVE_COUNT`, `quoteWhileDiscovering`, `settleOrAfter`, `startRecentPairScan`, `signatureOf`, `onFirstRoute`/`IterateOptions`, `probeContendedCoreLegs`, `quoteEvidence` threading, `resolveHints` as an engine source (hints are hypotheses; `ingestPool` keeps standalone validation), `selectPools`/`comparePoolPriority`/`pickNewest` (per-pair selection + reserved slot), the `probed` set and three-channel quoting, whole-path two-hop quoting in `quote.ts`, and the constants `QUOTE_INTERLEAVE_MS`, `WAVE0_PAIR_SCAN_GRACE_MS`, `FEE_DISCOVERY_MAX_REQUESTS`, `MAX_POOLS_PER_LEG`, `MAX_POOLS_DIRECT`, `MAX_QUOTE_CANDIDATES`. `MAX_INTERMEDIATES` survives with changed meaning: the intermediates frontier's seed and batch size, no longer a permanent cap.

**Unchanged**: `PoolIndex` (including coverage cache, negative cache, discredit rules, eviction, snapshots), protocol modules (one rename: `speculativeDirect` → `hypotheses`), `internal/` (rpc, rpcErrors, logScan, logScanPolicy, multicall, ranges, currency), `plan/`, `encode/`, `verify/` internals, `manifest.ts`, request validation, once-cells, head watermark, `rankRoutes` + simplicity margin, hint-discredit and negative-cache rules, transport-retry-once rule.

**Added**: `search/loop.ts`, `search/pump.ts`, `search/coverage.ts`, `search/state.ts`, the notifier primitive, `MEASUREMENT_PAIR_CEILING`, the `SearchEvent` union, the outcome-log golden format.

## 7. Behavior changes beyond the API

1. Two-hop coverage improves: the 3×3 heuristic cross-product becomes exhaustive-by-dominance measurement; warm and cold searches converge to the same answer by construction. A consumer that keeps pulling now converges to exhaustive (the intermediates frontier passes today's cap of 8; coverage walks to the deployment floors), where today's search is bounded forever.
2. RPC volume shifts: more inner calls on dense pairs (all pools measured, batched), fewer on fan-out (leg dedup replaces per-candidate rounds); once the gate opens, all scopes' scans run concurrently rather than in wave order — the semaphore is the meter.
3. `PREFLIGHT_TOP_K` becomes per-search rather than per-wave (strictly fewer simulations in deep searches).
4. `intermediateAmounts` is per-leg realized amounts for all two-hops (previously empty for whole-path same-protocol quotes); `gasEstimate` for same-protocol two-hops is a two-leg sum (envelope-noise caveats already documented on the field).
5. Event cadence replaces wave cadence; consumers see more, smaller improvements.

## 8. Testing

- **Ports**: all suites below the engine are untouched; facade validation/boundary tests are untouched; `waves.test.ts` scenarios re-target `search()` with wave-count assertions replaced by event-sequence assertions (the fake clients survive).
- **New property tests** (fast-check): composition dominance (composed best ≥ every measured combination), measurement dedup (no duplicate (pool, direction, amount) calls in a search), `m_X` invalidation convergence, counter conservation as a fold property, and frontier monotonicity (the selected-intermediates set and covered ranges only grow within a search; a consumer that stops pulling freezes both).
- **Contract assertions**: a hinted swap issues zero unbounded-scope `eth_getLogs` (the README launcher promise, now one test); abandoning the iterator aborts all in-flight sources; two concurrent searches on one router stay coherent.
- **Goldens**: regenerated in the outcome-log format; the two quarantined sessions re-recorded into it. `scripts/recordSession.ts` gains the outcome-log emitter; RPC replay remains for provider conformance.
- **Live validation**: `scripts/compare.ts` vs the Trading API on the pair matrix before/after; canary and fork suites updated at their public-API touchpoints.

## 9. Implementation sequencing

1. `search/state.ts` (apply functions, report fold) + tests — standalone, no behavior change yet.
2. `search/pump.ts` (due-leg planning, measurement rounds, composition) + property tests — pure planning separated from dispatch.
3. `search/coverage.ts` — refactor of `discovery.ts` into the demand/converge worker.
4. `search/loop.ts` + notifier; facade re-pointed; `getQuote`/`getSwap` on the event stream.
5. Public event API; CLI `--watch`/report rendering; canary/CLI simulate touchpoints.
6. Deletions (§6) and constants cleanup.
7. Outcome-log goldens + recorder; re-record quarantined sessions.
8. README + docs updates (mental model, event API, report field changes).

Each step lands green: steps 1–3 are additive; step 4 is the cutover behind the ported behavioral suite.

## 10. Risks

- **Dense-pair RPC growth**: measured-not-selected means more inner calls where pairs have many pools. Mitigated by multicall chunking, the semaphore, the pair ceiling backstop, and the report making the cost visible. Validate with `compare.ts` request counts before/after.
- **Out-leg latency**: out-legs wait for an in-leg round (as today's chained round 2 did) — no regression, but worth confirming on the latency matrix.
- **Dominance edge cases**: near liquidity cliffs a non-best in-leg could theoretically compose better. The dominance argument covers monotone legs; fee-on-transfer and hooked pools are monotone in practice but adversarial hooks are not — the verifier (preflight) remains the authority before any `ready`, and alternatives are exact quotes. Accepted.
- **Migration blast radius**: contained by sequencing (§9) and by the behavioral suite porting before the cutover.
