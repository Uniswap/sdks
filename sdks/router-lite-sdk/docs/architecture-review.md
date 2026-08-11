# Router Lite SDK — Architecture Review

> ***HISTORICAL — this reviews the pre-refactor wave engine (`search/waves.ts`), which no longer exists.***
> ***It is kept unedited as an input to the event-core redesign it produced; for current behavior see the package `README.md`. Index: [`docs/README.md`](./README.md).***

*2026-08-10 · reviewed from first principles: full read of the search core, five parallel deep-dives (CLI, tests, integration/canary/scripts, internal plumbing, protocols/encode/manifest), live runs against mainnet and Base.*

## Verdict

This is a genuinely well-architected package, and most of what looks like complexity is earned. The load-bearing decisions are right:

- **The type ladder is real.** `PoolHint → PoolRef → RouteCandidate → QuotedRoute → ExecutionPlan → EncodedTx` flows one way; discovery never sees quotes, the compiler never sees RPC. The plan→encode split proved itself when ur-2.1 landed as a 100-line codec touching neither the compiler nor the walker.
- **Evidence discipline is the package's best idea.** Revert ≠ transport failure ≠ node-state miss ≠ head regression, threaded through quoting stats, execution status, and the report's independent completeness axes — so a 429-storm can never masquerade as a confident `no-route`. This is the core correctness property of a "run anywhere on any RPC" router and it is enforced, not aspired to.
- **Policy/mechanism separation is structural.** `waves.ts` owns every decision (which scan runs where, what budget, what window); `discovery.ts`/`leader.ts`/`report.ts` are stage primitives holding no policy; `adjacencyPlan.ts` and `logScanPolicy.ts` are pure and table-tested.
- **The encode oracle strategy is about as strong as an offline encoder can get**: differential byte-identity vs the pinned universal-router-sdk with exactly-once normalized divergences, frozen goldens shared across command sets, live on-chain struct-slot probes that break oracle circularity, and fork execution.
- **It works, fast.** Live: warm Base quote 984ms (first lead at 124ms), cold mainnet quote 613ms via speculative probes with zero log scans, verified mainnet swap with calldata in 1.5s (two-hop beat direct). The wave-0 fast path does what the README promises.

The critiques below are therefore not "this is a mess" — they are "the next factor of simplification is architectural, not local." Three themes recur: **timer heuristics compensating for batch-staged control flow**, **selection heuristics compensating for tiny caps**, and **invariants held by discipline instead of construction**.

---

## 1. The wave engine has outgrown its control-flow model (biggest refactor)

`searchWaves` is a staged batch pipeline: run a wave to completion, evaluate, yield, repeat. Every recent performance fix has been a patch against that model's grain, and each patch shipped a new mechanism:

| Patch | Mechanism it added | Where |
|---|---|---|
| Quote while scans run | `quoteWhileDiscovering` polling every `QUOTE_INTERLEAVE_MS` (5s) | `search/waves.ts:1139` |
| Wave 0 answers before the pair scan | wave0a/wave0b split + `WAVE0_PAIR_SCAN_GRACE_MS` (500ms) + detached scan with its own `AbortController`, forwarded signal, unsubscribe-on-both-exits, cancel-in-`finally` | `waves.ts:1275-1303, 1704-1712` |
| Streaming consumers learn of the first price | the `onFirstRoute` callback side-channel, added because the yield *sequence* is a contract (facade stop-loops, yield-count tests, replay goldens all pin it) | `waves.ts:297-333` |
| Suppress no-op yields | `signatureOf` string fingerprinting | `waves.ts:1624` |
| Wave 3 | now just "retry wave 2's scans" since merged adjacency (C5-C) — a stage that exists because stages are the only unit of retry | `waves.ts:1596-1609` |

Each one is individually well-reasoned (the comments prove it), but together they are the signature of a **batch engine emulating a streaming engine with timers**. The two magic milliseconds (`QUOTE_INTERLEAVE_MS`, `WAVE0_PAIR_SCAN_GRACE_MS`) are exactly the "random heuristics" you asked about — and they are not tunable facts about chains or providers; they are compensations for the control flow.

**Proposed end state: an event-driven search core.** One continuous loop with two sources and one sink:

- *Discovery tasks* (hint validation, speculative probes, pair scan, fee scan, adjacency scans) run as prioritized concurrent tasks that write pools into the index as chunks land (this already happens via `onLogs` ingestion — the write side is done).
- *A quoting pump* wakes whenever the index gains candidates for this request (a simple dirty flag / async queue — no timer), quotes the delta through the existing dedup (`state.seen`), and re-ranks.
- *The consumer surface* is a typed event stream: `{kind:'route-improved'} | {kind:'discovery-progress'} | {kind:'final'}`. `getSwap` = "first actionable event"; `swaps()` = the stream; the CLI's `--watch` renders it directly.

What falls out structurally rather than by care: both timer constants; the 0a/0b split and its grace; the detached-scan lifetime machinery (the scan is just a task the search owns; ending the search cancels tasks); `onFirstRoute` (it's an event); `signatureOf` (emit on improvement by construction); wave 3 (retry is a property of an unfinished scan task, not a stage). The wave *priorities* survive as task ordering — which is the part that was ever policy. The laziness contract survives too: don't start lower-priority discovery tasks until the consumer pulls past the current frontier.

This is a big change, and the current engine is correct and heavily tested — the migration argument is not correctness, it's that the next ten performance fixes get cheaper instead of more exotic. The behavioral test suite (which drives `searchWaves` through fakes and asserts outcomes) survives largely intact; the yield-count pins and replay goldens are the casualties, and the goldens are already half-quarantined for exactly this coupling (see the test report).

## 2. Measure, don't select: the cap-compensation complex (second refactor)

A cluster of mechanisms exists to answer one question: *which 3 of a pair's 13 pools get quoted?*

- `MAX_POOLS_PER_LEG = 3` / `MAX_POOLS_DIRECT = 6` force selection before measurement
- `comparePoolPriority`'s 6-key heuristic order (`candidates.ts:133`)
- the reserved-newest-slot rule (`selectPools`, `candidates.ts:188`)
- `quoteEvidence` feedback plumbing (`waves.ts:549`, `candidates.ts:61`)
- `probeContendedCoreLegs` — a two-stage, dimensionally-corrected evidence pass pulled a wave early, gated on contention (`waves.ts:1460-1486`)
- discovery-probe success/failure recording so evidence exists at all (`runDiscoveryProbes`)

That machinery is the scar tissue of a real bug (the warm-index 5.6x mis-route: newest-first selection is *liquidity-hostile* on dense pairs) — but the fix kept the tiny cap and taught the heuristic to be smarter. First-principles alternative: **the cap predates Multicall3 aggregation**. With `aggregate3`, quoting a pair's pools costs ~one inner call each, chunked 50 to a round trip; quoting all 13 direct pools instead of 6 is noise. The real combinatorial threat is only the two-hop cross product (in × out per intermediate), and that is tamed by *composition*, not selection: quote every candidate in-leg and out-leg **once as single legs** (cheap, batched, deduped), then build the cross product only from legs that actually answered, ranked by measured output. Selection by heuristic then only survives where measurement is genuinely impossible (bounding `MAX_INTERMEDIATES` over thousands of eligible nodes — and even that could be evidence-first: intermediates whose in-leg answered well).

Payoff: delete `quoteEvidence` threading, `probeContendedCoreLegs`, the reserved-slot rule, and most of `comparePoolPriority` — the warm-vs-cold divergence class disappears because warm and cold both *measure*. Cost: a bounded increase in inner calls on dense pairs, which the report already knows how to count.

Related, smaller: **round-1 segment dedup is missing.** Candidates sharing the same first segment at the same `amountIn` (two v2-leg candidates sharing leg 1; mixed-protocol candidates sharing a v3 first leg) issue byte-identical `eth_call`s in one round (`quote/quote.ts:269-279`). Memoize `QuoteCall` by `(segment routeId, amountIn)` within a round.

## 3. EngineState is a blackboard; make the accounting transactional

`EngineState` (`waves.ts:419-561`) is ~20 mutable fields written by free functions across four files. The conservation invariants — `attempted === succeeded + failed + transportFailed`, `unattempted ≤ candidatesGenerated`, the three-channel counting rules, the `seen`/`probed`/`transportRetried` release protocol — hold because every call site repeats the same increment pairs, guarded by essays ("AND DELIBERATELY NO `unattempted` LINE HERE…", "DO NOT REORDER") and checked after the fact by `assertResultCoherent` in tests. That's discipline, not construction.

Two structural options, either sufficient:
- **One tally owner**: a `QuoteAccounting` object with methods like `recordRound(channel, submitted, stats, outcome)` — the only code allowed to touch the counters, so a fourth quoting channel *cannot* get the accounting wrong.
- **Event fold**: stages emit typed facts (`quoted`, `probe-failed`, `scan-covered`…); `buildReport` folds them. Conservation becomes a property of the fold, `assertResultCoherent` becomes mostly redundant, and record/replay gets a natural, request-shape-independent format for free.

The same applies one level up: `verifyLeader`'s "CRITICAL INVARIANT — DO NOT REORDER" header (`leader.ts:23-48`) protects an ordering the types can't see. Encoding the readiness-before-preflight rule in the shape of the code (e.g. a `ReadinessGate` the simulate step requires as input) turns a comment into a compile error.

## 4. Deepen ProtocolModule the last 10%

The module interface is genuinely deep (8 members hiding CREATE2 derivation vs quoter encoding vs event parsing), but three protocol facts still leak into consumers (full inventory in the code-quality report):

- *Currency form* — "v4 holds native, v2/v3 hold wrapped" is decided in `plan/compile.ts:112,192`. → `ProtocolModule.holdsNative` (or `nativeForm()`).
- *Segmentation* — "v2 legs quote solo" is restated in `internal/segment.ts:33` and enforced again in `v2.ts:172`. → `ProtocolModule.maxLegsPerSegment`.
- *Custody spelling* — v4's `settleFrom`/`takeTo` vs `payer`/`recipient` exists only to be adapted away by `plan/operations.ts#payerOf/recipientOf`. Unify the field names; `compileOperation` then collapses to a `kind` tag and `protocolOf` (its reverse map) disappears.

None is urgent; together they make "add protocol #4" a modules-only change, which is the test of the seam.

## 5. Interfaces: one door too tight, one too wide

- **`/` (stable) is exemplary** — `createRouter`, the result unions, the error classes. Keep.
- **`/experimental` exports ~30 symbols**, including plumbing with no routing story (`mapConcurrent`, `ethCall`, `classifyRpcError`, `intersectRanges`, `sortAddresses`…). Every export is a future compatibility conversation. Most exist for the CLI/scripts — that's a *workspace* need, not a consumer need; a package-internal blessed path (or just accepting deep imports from co-located tooling) would let `/experimental` shrink to the genuinely experimental (PoolIndex lifecycle, protocol modules, encoders).
- The engine↔facade contract (`InternalResult` → `classifySwap`) plus runtime `assertResultCoherent` is belt-and-braces because the types can't state the invariants ("`ready` implies tx present", "`inconclusive` names a reported axis"). The event-stream refactor (§1) is the chance to have the engine emit the public vocabulary directly and delete the mapping layer.

## 6. PoolIndex and the persistence story

- The in-memory design (adjacency maps + coverage ranges + negative cache + LRU-ish `maxPools` eviction with discredit-aware ordering) is sound and now observable (`stats`, `clearIndex`, injection). Good.
- **The snapshot format is the bottleneck now**: the CLI pays **1.8s to parse 633k pools of tagged JSON on every invocation** — the single largest fixed cost in a warm quote (the search itself was 984ms). A columnar or length-prefixed binary snapshot (or SQLite-style paging so `pair()`/`neighbors()` load lazily) would cut warm-start dominance; even keeping JSON, splitting pools from coverage and lazy-parsing per-pair gets most of it.
- The pool-list *merge* semantics currently live in `cli/poolList.ts` with a phase-2 note saying they belong in the SDK. Agreed — "hydrate an index from a published list, coverage optional" is a routing-SDK capability (edge workers want it more than the CLI does), and moving it deletes the CLI's one deep import (`assertSnapshotShape`).

## 7. Heuristics inventory — dispositions

Of ~30 constants, most are **derived** (uint128/uint48 caps, `MAX_QUOTE_CANDIDATES`) or **measured with receipts** (`MAX_SCAN_WINDOW`, `SCAN_CHUNK_CONCURRENCY`, `DEFAULT_CONCURRENCY`, grace/backoff). The genuinely arbitrary, load-bearing list is short:

| Constant | Disposition |
|---|---|
| `QUOTE_INTERLEAVE_MS`, `WAVE0_PAIR_SCAN_GRACE_MS` | **Eliminated by §1** (structural, not tunable) |
| `MAX_POOLS_PER_LEG`, `MAX_POOLS_DIRECT`, reserved-newest slot | **Mostly eliminated by §2**; `MAX_POOLS_DIRECT`'s "1 v2 + 4 v3 + 1 v4" story should be derived from the modules' standard-config exports if it stays |
| `MAX_INTERMEDIATES = 8` | The one cap with **no rationale at all** — measure it (how often does intermediate #7/#8 carry the winner across the replay corpus?) or document it |
| `FEE_DISCOVERY_MAX_REQUESTS = 128` | Unit is wrong for the goal — its own docstring prices it in *seconds of budget*; express it as a budget fraction |
| `PREFLIGHT_TOP_K = 3`, `SIMPLICITY_MARGIN_BPS = 5` | Genuine policy; document the reasoning (the margin's gas-risk core is underivable in an RPC-only package — say so) |
| rpcErrors' declared-cap regexes + `capKind: span/density` | Irreducible residue of provider prose, but the classifier/parser disagreement must be unified structurally ("parsed cap ⇒ unavailable"), and the density discriminator could become behavioral ("same cap seen twice ⇒ span") — see code-quality report |
| `MIN_CHUNK`, backoff shape, `NEGATIVE_CACHE_BLOCKS`, `maxPlausibleHeadRegression` | Honest policy; keep |

A one-line basis tag per constant (`derived | measured(date, endpoint) | policy`) at the top of `constants.ts` would do more than further tuning.

## 8. Performance posture — what's already right, and the two real gaps

Right: single round-trip wave-0 (probes + hints + readiness concurrent, pinned block dispatched before validation), aggregate3 quoting, merged adjacency (12→4 query chains), scan-width memory shared through the index across searches *and processes*, coverage-cache incremental re-scan, quote-as-you-ingest.

Gaps worth designing for (both acknowledged in comments as known trades):
1. **Serial preflight per improving wave** (the "KNOWN DEVIATION" in `waves.ts:188-197`). In the event model (§1), verification is just another task racing discovery — the trade stops being structural.
2. **Concurrent searches on one router share everything but are never tested together** (the test report's top gap). The semaphore, watermark, and index are all cross-search state; a keystroke-per-quote host is the realistic consumer. Add the test before adding any more cross-search state.

## 9. The sibling workspaces

The four-worlds layout (`src`/`cli`/`integration`/`canary` + `scripts`) is right, and the anti-collusion discipline in the fork harness (independent ABIs, math, and addresses so the SDK can't validate itself) is exemplary. Three structural notes:

- `cli/` has quietly become the repo's internal library (scripts import nine of its modules). Fine — but name the seam (`cli/lib/` or `tooling/`) so a "CLI internal" change is visibly a scripts change.
- `cli/poolList.ts` is two modules in one file: the ~300-line publisher pipeline (curation, envelope, live verify) belongs in `scripts/`, leaving the CLI the consumer half.
- `canary/simulate.ts` and `cli/simulate.ts` are a documented mirror-copy that has already drifted (one has the `limits.minAmountOut` fix, one doesn't — a live correctness difference). The pure core (payload builder, evaluator, `traderInputCurrency`) uses only type imports and can be one shared module; only the router-constructing wrappers need to live per-world.

## 10. Suggested sequencing

1. **Now, cheap**: round-1 segment dedup; unify custody field names; `holdsNative`/`maxLegsPerSegment`; extract the shared simulate core (fixes the live canary drift); pool-list merge → SDK; concurrent-searches test; constants basis-tags.
2. **Next**: pool-index snapshot format (kills the 1.8s CLI tax); transactional quote accounting (unlocks safe engine surgery); trim `/experimental`.
3. **The big one, when appetite exists**: the event-driven search core (§1) folding in measure-don't-select (§2). Do it behind the existing behavioral test suite; regenerate goldens from the event log, which also fixes the quarantined-session brittleness.
