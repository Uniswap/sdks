# Event-Driven Search Core — Branch Review

*2026-08-11 · the capstone evaluation of the `feat/router-lite-sdk-v2` event-core refactor
(spec: `docs/superpowers/specs/2026-08-10-event-driven-search-core-design.md`; plan ledger:
`.superpowers/sdd/2026-08-10-event-driven-search-core/progress.md`). Three parts: a fresh-eyes
coherence review of the whole branch, a live performance evaluation against the pre-refactor
baseline (Task 0), and a test-suite verdict. Ends with the residual-risk list.*

Branch shape: `cf71a5be..HEAD`, 137 files, +17,906 / −20,046 (net **−2,140 lines** while adding
the event API, the outcome-log golden format, and ~80 new tests). The wave engine
(`waves.ts`, 1,713 lines + 2,319 test lines), `discovery.ts`, `leader.ts`, and their
compensation machinery are gone; the replacement core is `loop.ts` (497) + `pump.ts` (579) +
`coverage.ts` (~660) + `verifier.ts` (371) + `state.ts` (258) + `notify.ts` (92).

---

## Part 1 — Coherence review

**Verdict: the tree reads as if the event core were the original design.** The new modules were
read end-to-end (`loop`, `pump`, `coverage`, `verifier`, `state`, `notify`, `router`, plus
`quote/measure`, `quote/rank`, `internal/outcomeLog`) looking for wave-era residue, shim
leftovers, and accidental complexity. What the read found:

- **No wave vocabulary survives in the engine.** No stage/tier/timer machinery, no
  `signatureOf`/`onFirstRoute` remnants, no "DO NOT REORDER" discipline comments — the two
  genuinely load-bearing orderings (consider-before-terminate, gate-on-quiet) are stated once in
  `loop.ts`'s header with their failure modes, and both are test-pinned. Stale references from the
  transition (`quoteCandidates` in `errors.ts`, `comparePoolPriority` in `poolIndex.test.ts`)
  were already cleaned in Tasks 11/14; a grep confirms zero hits.
- **The layering holds.** The loop sequences and owns nothing else; every state write goes
  through `apply*` (one exception per its own documented contract: `indexVersion`,
  `pairCeilingHit`, `gateOpened`, `intermediates`, owned by their writers and declared out of the
  outcome log's scope in `state.ts` — an honest boundary, not an omission). Dedup lives in data
  (measurement ledger, coverage cache, compile memo), not in call-site discipline.
- **Comment regime**: dense but earning its keep — the norm is "why, with the failure mode named"
  (e.g. the watermark self-heal, the `exactOptionalPropertyTypes` notes, `rankRoutes`' stale-marker
  strip). Nothing read as drift against the code it annotates.

### Findings fixed on this branch (commit `553e41d5`)

1. **`coverage.ts#makeLatch` duplicated `createNotifier` byte for byte.** The comment justified a
   *private channel*, which is right — but not a private copy of the implementation. The worker's
   `widened` latch now calls `createNotifier()`; 30 lines of duplicate primitive deleted. (The one
   place a change to notifier semantics could have silently forked.)
2. **`pump.test.ts` `sawSurvivorFallback` docstring over-claimed** ("the BEST in-leg reverted")
   relative to its guard (some in-leg died while another survived). The honest weaker claim is now
   stated, with why the stronger one is undecidable from the world spec (a reverted leg has no
   hypothetical price). Ledger item, Task 14.
3. **`integration/worldBuilder.ts` `createV3Pool` liquidity headroom trap** documented on
   `V3PoolOptions`: `liquidity` is a request, not a setting — the position managers mint whatever L
   the ~2%-headroom amounts support, so tests must never recompute exact outputs from the
   requested L. Ledger item, Task 14.
4. **`docs/architecture-review.md` and `docs/code-quality-review.md` are now committed.** The
   design spec cites both as its inputs; leaving them untracked would strand the spec's provenance
   the day the working tree moved on. Committed verbatim with this review. Ledger item, Task 15.

### Ledger triage — every residual marked "→ Task 16", with a verdict

| # | item | verdict |
|---|---|---|
| 1 | `maxPools` eviction can yield an authoritative `no-route` (Task 10, Important) | **Filed** — concrete design below |
| 2 | `ready` with `verificationDegraded: true` (Task 9) | **Accepted** — rationale below |
| 3 | Three borderline `basis:` tags (Task 11) | **Accepted** — `policy` is correct for all three |
| 4 | Inner-call OOG ≙ pool-absent negative-cache channel (Task 14) | **Filed** — pre-existing, narrowed |
| 5 | Unrecognized-dialect bisection amplification (Task 14) | **Accepted** — bounded and gated |
| 6 | `sawSurvivorFallback` docstring vacuity (Task 14) | **Fixed** (`553e41d5`) |
| 7 | `worldBuilder` liquidity trap (Task 14) | **Fixed** (`553e41d5`) |
| 8 | Untracked `docs/{architecture,code-quality}-review.md` (Task 15) | **Fixed** — committed with this doc |

**1. `maxPools` eviction → authoritative `no-route` (filed, with design).** A scan-ingested pool
is LRU-touched at its *creation* block — instantly coldest — and a concurrent search's upserts can
evict it in the window between ingestion and this search's planning `touchAll`. Coverage was
honestly recorded, so `isSearchComplete` passes and the verdict is an authoritative `no-route`
for a pair that has real liquidity. Reproduced deliberately in `router.test.ts`'s
eviction-pressure test (cap of 2). Scope limits: it needs `maxPools` set (default unbounded) plus
concurrent searches, and hypothesis-derivable pools (v2/v3 standard+fee-scan tiers, v4 standard
configs, hints) are re-derived and measured regardless of eviction — the exposed class is
scan-only pools (hooked v4, nonstandard configs).
**Design filed:** give `PoolIndex` an eviction observation seam — a monotone `evictionEpoch`
plus the evicted pool's two graph nodes pushed to a bounded recent-evictions ring. The loop
snapshots the epoch at launch; on each cycle where the epoch moved, any evicted node-pair
intersecting {inNode, outNode} ∪ selected intermediates (with the pool's legs never settled in
this search's ledger) applies a new `applyCoverage`-style outcome that demotes the affected
protocol's discovery to `partial` (one direction only: eviction can demote `complete`, never
mint it). `classify*` then answers `inconclusive`/`discovery-incomplete` instead of `no-route`.
Zero cost when `maxPools` is unset (no evictions → no epoch movement). The alternative in the
ledger — pinned-head touching of scan-ingested pools matching a live search — was **rejected**:
a full-history scan ingests tens of thousands of endpoint-adjacent pools, and touching them all
at head would evict every genuinely hot pool the LRU exists to keep.

**2. `ready` + `verificationDegraded` (accepted).** When a transport-lost leader is passed over
and the runner-up verifies, the result is `ready` with the degraded flag still set — now
test-pinned. This is the right reading of both fields: `ready` is a claim about *this candidate*
(the chain simulated it at this block — true), `verificationDegraded` is a claim about *the
search* (not every verification landed, so a better route may have been missed — also true).
Downgrading to `inconclusive` would discard a chain-verified answer because of a transport blip
on a *different* candidate; clearing the flag would hide that the ranking above the answer is
incomplete. The asymmetry with `needs-action` (which *does* gate on the flag) is principled:
`needs-action` promises its requirement list is exhaustive, and a degraded readiness read breaks
exactly that promise.

**3. Constants `basis:` tags (accepted).** `DEFAULT_CONCURRENCY` (20), `DESCENT_TIMEOUT_FALLBACK`
(100,000n), `SCAN_CHUNK_CONCURRENCY` (4) all carry `basis: policy`. Each is a judgment call
*informed* by measurement (the ~44-peak observation, the drpc timeout ladder, the 13-permit gap)
but not *derived* from a protocol fact or another constant — a different maintainer could
defensibly pick 16, 50,000n, or 6. `policy` is the honest tag; each docstring already carries its
measured motivation, which is the part a future editor needs.

**4. Inner-call OOG negative-cache channel (filed).** An inner quoter call that runs out of gas
inside a *served* `aggregate3` envelope returns the same data-less failure shape as a pool that
does not exist, and is negative-cached for the block. Pre-existing behavior (the per-call path
has an analogous ambiguity), significantly narrowed by Task 14's envelope bisection (a chunk-level
OOG now bisects instead of failing its whole envelope). Residual exposure: a single
pathologically-heavy inner call. Filed with the obvious probe: on a data-less inner failure in a
multi-call envelope, optionally re-ask that call solo before caching — one extra `eth_call` on a
rare path, but it changes the negative cache from "envelope said no" to "the chain said no".

**5. Unrecognized-dialect bisection (accepted).** An outer envelope failure whose error dialect
nothing recognizes bisects down to size 1 — worst case ~792 envelopes for a full round, but only
on a provider that is *already* failing every envelope in an unrecognized way, bounded by the
round cap, and gated behind `isRequestTooLarge`'s recognized-dialect fast paths. The alternative
(guessing at unrecognized errors) reintroduces exactly the silent-loss class the bisection fix
closed. Add dialects as they are observed; nothing structural to change.

---

## Part 2 — Performance evaluation

Same matrix as Task 0 (`scratch/event-core-baseline.md`), 3 runs each, medians. Live runs
2026-08-11 (~10:40 UTC), mainnet ~#25,731,220, Base ~#49,827,715, via `chainz exec`. One
semantic note first, because it moves two rows: **`getQuote` now returns at the first actionable
lead** (the spec's anytime contract, Task 14's product call); the wave engine's default drained
to on-chain confirmation. The CLI's `--watch` drains the bounded search, which is the
convergence-comparable mode.

| command | before: total / lead / confirmed | after: total / lead / confirmed | routes priced (before → after) |
|---|---|---|---|
| 2a warm quote (Base eth/usdc) | 867 / 129 / 698 ms | **1,900 / 1,900 / n·a ms** | 30 of 67 → 32 routes (49 of 252 legs; pair ceiling hit) |
| 2b cold quote `--no-cache` (mainnet) | 595 / 92 / 595 ms | **152 / 152 / n·a ms** | 9 of 9 → 9 routes (33 of 36 legs) |
| 2c swap (mainnet, 0.5 eth) | 474 / 93 / 416 ms | **464 / 248 / 368 ms** | 122 of 130 → 54 routes (105 of 160 legs) |
| 2d long-tail BRETT→usdc (Base) | 601 / 128 / 601 ms | **799 / 799 / n·a ms** (converged: two-hop lead by 2.1 s, best by 5.2 s under `--watch`) | 20 of 42 → 6 routes at lead (12 of 48 legs); 183 routes / 285 of 2,607 legs converged |
| compare.ts (eth/usdc, usdc/wbtc) | failed at arg parsing | **runs**: first-actionable median 267 ms, final = 10 s budget | parity column skipped — no `UNISWAP_API_KEY` in this environment |

Transport health: **0 legs lost to RPC in every run** (24 searches' reports all read
`0 lost to RPC`) — the 50-transport-loss Base run flagged in Task 12 did not reproduce; watch it
in CI/canary rather than holding the branch.

### Regressions > 20%, investigated

All three latency regressions share one cause, and it is the spec's central, deliberate trade
(**measure, don't select** — §2.2, behavior change §7.2, risk §10.1), not a defect:

- **2a warm dense pair: 867 ms → ~1.9 s.** The wave engine's warm path hand-picked 3-of-N pools
  per pair (30 legs); the pump's first round measures *everything derivable* on the pair — 252
  legs (128-capped direct pair + hypotheses + 8 intermediates' in-legs), i.e. ~6 concurrent
  50-call `aggregate3` envelopes whose inner calls are dominated by v4 hooked-quoter simulations.
  The first lead can only follow the first round, so it pays the whole round (~1.7–2.0 s on
  Base's public endpoint). What that buys: the 5.6x warm-index mis-route class is structurally
  gone (its compensation complex — `quoteEvidence`, `probeContendedCoreLegs`, the
  reserved-newest-slot rule — is deleted), and the warm answer is the cold answer by
  construction. RPC volume: ~6 envelopes vs ~67 per-call quotes — fewer round trips, more inner
  compute, exactly the §7.2 shift. **Future-work item filed** (residual list): split round one
  into index-known legs (fast, small) and hypothesis probes (slow, large) to restore a
  ~100–300 ms warm first lead without reintroducing selection.
- **2c swap lead: 93 → 248 ms** (same cause, milder — mainnet's direct pair is thinner). The
  numbers that matter both **improved**: verified-confirmed 416 → 368 ms and total 474 → 464 ms,
  and the cached lead now *holds* through verification in all three runs where the baseline's
  lead was overtaken every run.
- **2d long-tail total: 601 → 799 ms** at the new first-lead semantics (direct-only lead, 0.9%
  below the converged best); the baseline's 601 ms bought a search that was *finished* — capped
  forever at 8 intermediates and 42 candidate routes. The new engine at the same ~600 ms mark has
  the same-quality direct lead; by 2.1 s it has the two-hop; given its budget it explored **123
  of 123 intermediates and 2,607 legs** — a search space the old engine could not reach at any
  budget. This is the anytime contract working as specced, not a slowdown of equivalent work.

### Correctness parity

The Trading API column could not be exercised: `UNISWAP_API_KEY` is unset in this environment
(the baseline never reached parity either — its run died at arg parsing). In lieu: compare.ts's
lite-side answers agree with the independent CLI runs at adjacent blocks (eth/usdc 1,884.635 vs
1,884.197/1,884.184 across three entry points; usdc/wbtc 0.000015 WBTC ≈ market), and best-route
identity was stable across every repeated run. Parity re-run with a key is in the residual list.

### Qualitative wins

- **Two-hop coverage is real now**: cold mainnet explores 3 intermediates where the baseline
  explored 0 (`explored 0 of 0`); the swap search explores 8 of 12; BRETT converges to 123 of
  123. Composed two-hops are exact chained numbers with `intermediateAmounts` populated.
- **Warm/cold convergence by construction** — pinned by the Task 10 keeper test and visible live:
  warm and cold searches produce the same leader for the same pair.
- **Cold latency collapsed** (595 → 152 ms): the eager pair-scope slice plus hypotheses-as-
  measurements put the first round on the wire immediately.
- **The report got more honest**: leg-level counters on one channel, `pairCeilingHit` visible
  (and firing on real Base pairs), breadth (`explored X of Y`) named per search.
- **Suite wall-time**: 18.8 s → 1.9 s (the wave engine's timer-driven tests died with the timers).

---

## Part 3 — Test-suite verdict

| | baseline (Task 0) | now |
|---|---|---|
| pass | 1,352 | **1,430** |
| skip | 69 | **67** |
| fail | 0 | **0** |
| tests / files | 1,421 / 66 | **1,497 / 69** |
| `expect()` calls | 4,592 | **~23,500** |
| wall time | 18.78 s | **1.9 s** |

**What was dropped, and why (Task 10's inventory).** The four deleted engine suites held 95
scenarios: **16 ported** to the new engine, **56 already existed** as equivalent-or-stronger
tests on the new modules, **18 dropped** — every dropped row names a deleted *mechanism*
(`onFirstRoute` ×2, `selectFocus`/`focusToken` ×2, leg-slot/evidence selection and caps ×6,
`generateRoutes` pruning counters ×4, `FEE_DISCOVERY_MAX_REQUESTS` ×3, `MAX_QUOTE_CANDIDATES`
×1). No behavior the product still has lost its test. The 69→67 skip delta is the two wave-era
quarantined RPC-replay goldens superseded by outcome-log goldens (Task 13); remaining skips are
live/fork-gated suites without their environment.

**Review-gap list coverage** (the gaps `code-quality-review.md` and the spec §8 called out):
- *Concurrent searches*: `router.test.ts` — two searches, different pairs, one router; plus the
  eviction-pressure variant (`maxPools` cap of 2, one search's scans evicting the other's
  intermediates) that surfaced residual #1.
- *`subtractRanges` property*: `internal/ranges.test.ts` — membership = `from` AND NOT `remove`,
  no input aliasing; with merge/intersect property twins.
- *Property suite* (fast-check, 5 files): composition dominance under partial failure (with a
  non-vacuity guard), measurement dedup across a whole search (≤2 per key, =2 only for
  transport-fated legs), `m_X` invalidation convergence, counter conservation as a fold, frontier
  monotonicity (grow-only; stops-pulling freezes).
- *Contract tests*: hinted swap issues zero unbounded `eth_getLogs` (counted on the wire,
  fee-discovery scope included); iterator abandonment aborts all sources; the outcome-log golden
  corpus replays through the real `apply*`/compose/report/classify path.
- *Fork suite*: 35/35 live (Task 14), including the OOG-bisection engine bug it caught.

---

## Residual risks

1. **`maxPools` eviction → authoritative `no-route`** — filed with the eviction-epoch design
   (Part 1, item 1). Until then: hosts setting `maxPools` under concurrent search load should
   treat `no-route` on scan-only pool classes as retryable. *Owner: next engine task.*
2. **Warm dense-pair first-lead latency (~1.9 s on Base eth/usdc)** — the measure-don't-select
   round-one cost; optimization filed (split index-known legs from hypothesis probes in round
   one). *Not a defect; spec risk §10.1 accepted and now quantified.*
3. **Trading-API parity unexercised on this branch** — run
   `UNISWAP_API_KEY=… chainz exec 1 -- bun scripts/compare.ts --pair eth/usdc --pair usdc/wbtc`
   before release; the harness itself is verified working.
4. **Inner-OOG negative-cache channel** — filed (Part 1, item 4); rare, block-scoped, bisection-
   narrowed.
5. **Unrecognized-dialect bisection amplification** — accepted; bounded by the round cap and only
   on already-failing providers. Add dialects as observed.
6. **`cli/stream.ts` `lastProgress` never resets on a lead** — correct-by-design (a progress line
   identical to the last is suppressed even across an intervening lead; the lead line itself
   carries the news), noted here so the next reader doesn't "fix" it.
7. **Transport-loss pressure under real providers** — Task 12 once observed 50 losses in one Base
   search; this evaluation observed zero across 24 searches. Keep the canary suite's eye on it.
8. **In-flight preflight outliving the search** — not a risk but a blessed carve-out (spec §5,
   amended): bounded to one inert `eth_call`; the facade's fold-at-receipt rule is what keeps it
   inert. Listed so nobody rediscovers it as a leak.
