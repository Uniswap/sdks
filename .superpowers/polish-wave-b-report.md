# Polish wave B — test-suite polish (router-lite-sdk)

Status: **complete**, all 14 items landed. Gates green.

Commits (branch `feat/router-lite-sdk-v2`):

| hash | subject |
| --- | --- |
| `5d3da822` | test(router-lite-sdk): fresh-eyes test polish — shared worlds, tighter bounds, new failure modes |
| `00d410fc` | test(router-lite-sdk): re-record the browser bundle baseline (48,428 -> 48,800 B gzipped) |

Grouping: the whole wave is one commit (the consolidation, the split and the assertion work all touch
the same three or four files, so hunk-splitting them would have produced commits that are not
independently reviewable anyway), with the baseline re-record as its own commit because its
justification is a measurement, not a test change.

## Items

| # | item | status |
| --- | --- | --- |
| 1 | shared constant-product test world (`src/search/testWorld.ts`) | done |
| 2 | `quotes()` streams: two pools of different quality, strictly improving leads | done |
| 3 | concurrency test: `peak === CONCURRENCY` | done (verified 10x) |
| 4 | hung sentinel 5,000ms -> 2,000ms; hang-detector comment on `ticks(100)` | done (both detectors) |
| 5 | NEW measure test: partial envelope failure, middle 50 coarsened | done |
| 6 | NEW multicall test: result-count mismatch, no bisection | done |
| 7 | NEW verifier test: re-consider of the unchanged in-flight leader | done |
| 8 | NEW verifier test: stale `leaderId` absent from `evaluated` | done |
| 9 | NEW notify test: `launch()` after `abortAll()` | done |
| 10 | `sawSecondBatch` vacuity guard on the frontier property | done |
| 11 | drop `expect(PREFLIGHT_TOP_K).toBe(3)`; size `ranked` from the constant | done |
| 12 | split `router.test.ts` into classify + degraded suites | done |
| 13 | abort-walk bounds derived from `SCAN_CHUNK_CONCURRENCY` | done |
| 14 | re-record the bundle baseline | done |

Nothing skipped.

## 1 — shared test world

`src/search/testWorld.ts`, build-excluded alongside `internal/testing.ts` (three build tsconfigs +
`build.surface.test.ts`'s test-only list, which is now a named array). Owns: `Fate` (the SUPERSET —
`price`/`gas`, `revert`, `revert-data`, `transport`), `World`, `cpOut`, `fatePrice`, `idData`,
`fromIdData`, `newPool`, `addr`, `unused`, `disabledModule`. Per-file fake MODULES kept in place.

`fromIdData` was a bonus: `loop.test.ts` had the same decode inline in its client.

`newPool`'s counter is module-level and shared across suites, based at `0x10_0000` — above every
hand-picked `addr(...)` literal in the suites, and monotone, so relative pool-address order (the only
thing a ranking tie-break can see) is unchanged.

Lines: the three suites lost **123 lines** and gained 25 attributable to the port (net **-98**); the
shared module is 129 lines, **56 of them code** — so the duplicated *code* went from ~150 lines across
three copies to 56 in one, and the rest of the new file is the header explaining what deliberately
stays per-file. Within the predicted 100-120.

`loop.test.ts`'s `worldQuote` decode was retightened while porting: with the superset `Fate` it now
treats "no price" as the data-less revert shape explicitly, instead of `fatePrice(...)!` silently
returning `undefined` for an arm the file never scripts.

## 12 — the router split

`router.test.ts` 3,057 -> **2,286** lines, plus:

* `src/router.classify.test.ts` (276) — the pure classifier/coherence block.
* `src/router.degraded.test.ts` (469) — the RPC-degradation narratives.
* `src/internal/routerFixture.ts` (215) — **deviation from the brief, stated deliberately.** The brief
  said "move to `internal/testing.ts` only if both files need them". `stubClient` + `ClientScript` +
  `baseManifest` + `directProbes` + `v2Return`/`v4Return`/`entryFor` + the fake chain's constants are
  ~180 lines that `router.test.ts` and `router.degraded.test.ts` both need; dropping that lump into
  `internal/testing.ts` (imported by a dozen unrelated suites) would have made the grab bag a router
  fixture file. It went into its own build-excluded module instead, mirroring the `testWorld.ts`
  precedent set by item 1. `poisonedClient`, `expectPassesValidation`, `pairCreatedLog` and
  `countingClient` stayed in `router.test.ts` — only it needs them.

Pure moves: **114 tests before, 114 after**, zero assertion changes in the moved blocks. Both new files
carry a header saying what question they answer; `router.test.ts`'s header now points at them.

## 2 — the `quotes()` stream test

Two findings while rewriting it, both of which the old single-pool test could not have surfaced:

1. A world with a direct pool and one two-hop still produced **one** lead — the improvement landed on
   the cycle that terminated the search, and a terminal cycle emits its `final` *instead of* a lead.
2. So the fixture now stages three routes of increasing quality and **holds the oldest scan chunk**
   (the one carrying the best route's pairs) for a few macrotasks. The MID two-hop then leads while
   that chunk is still in flight, and the stream carries a strictly improving leader.

Name lost `coalesced` (nothing here asserts progress cadence); the per-event coherence checks are
unchanged.

## 3 / 4 / 13 — bounds

* `peak` is now `toBe(CONCURRENCY)`. Deterministic as the review predicted: 10 runs of the full
  `router.test.ts`, 10/10 green.
* the sentinel is 2,000ms with the reason recorded (bun's default per-test timeout is 5,000ms, so the
  old sentinel raced the runner and a parked search reported as an anonymous timeout).
* both abort-walk bounds are `< 8 * SCAN_CHUNK_CONCURRENCY` (32) instead of `< totalChunks / 2` (393),
  with the derivation written down: the walk advances at most `SCAN_CHUNK_CONCURRENCY` chunks per
  macrotask, and half a window also passes for an abort that merely halved the walk.
* both `ticks(100)` sites now say they are hang detectors and to be RAISED, not deleted, if the loop
  legitimately grows the number of turns a search takes.

## 10 / 11 — vacuity and constant-derivation

* The frontier property gets `sawSecondBatch` plus a seeded `examples` entry sized from
  `INTERMEDIATES_BATCH`, so the multi-batch world is unconditional rather than a lucky sample — a
  failure of the guard is now the engine refusing to advance, never a thin generator run.
* `verifier.test.ts` grew `rankedSet(n)`; all four budget tests size their candidate lists from
  `PREFLIGHT_TOP_K` (and index by it), and the `toBe(3)` pin is gone.

## 5-9 — new coverage

* **measure**: 120 legs = 3 envelopes, `outerOutcomes: ['serve', rateLimit, 'serve']`. Exactly indices
  50-99 come back `transport`; every other slot holds its own price (`k{i}` prices at `2i`, so a
  one-slot shift fails rather than tallying plausibly).
* **multicall**: a well-formed `Result[]` one entry short of the chunk — no error to classify — coarsens
  the whole chunk to `TransportError`, keeps the `2 results for 3 calls` diagnostic in `cause`, and puts
  exactly **one** envelope on the wire (no bisection: the mismatch is found on the decode path, past
  `shouldBisect`). The stub's `{ garbage: Hex }` outer outcome was renamed `{ raw: Hex }`, since it now
  also carries well-formed bytes.
* **verifier**: three `consider()` calls on the unchanged in-flight leader -> one simulation, nothing
  queued behind it, `idle()` after it settles; `pickLeader` with a stale `leaderId` absent from
  `evaluated` falls through to the next-best unfailed candidate (not `evaluated[0]`, which is `failed`).
* **notify**: `launch()` after `abortAll()` hands the late source a signal that is already `aborted`,
  and the set still counts it settled and pokes.

## 14 — baseline

Measured on this tree, pinned toolchain (bun 1.3.14, viem 2.47.2):
**154,357 B minified / 48,800 B gzipped** (was 153,725 / 48,428 — 101% of the old baseline).

`BASELINE_GZIP_BYTES = 48_800`, docstring rewritten so the movement is attributed (all three readings
were taken on the same bun and viem: +3,628 B for the event-driven core, +372 B for the performance and
abort work after it), and both README number sites moved (`~154 kB minified, ~49 kB gzipped`, and the
`154,357 B / 48,800 B` reading with its +4.0 kB breakdown). `SIZE_BUDGET` untouched at 1.5x.

## Test summary

* `bun run build` — clean (three tsconfigs; `dist/` carries no test-only module).
* `bun test` — **1,451 pass / 67 skip / 0 fail** across 72 files (25,104 expect calls). The wave adds
  exactly the five new tests of items 5-9 and removes none; the `router.test.ts` split moved tests
  without changing their count (114 before, 114 after across the three files).
* `bun run typecheck:all` — clean (base, tests, integration, canary, cli, scripts).
* `bun run lint` — clean.
* Stability: the 11 touched suites run 5x, **265 pass / 0 fail** every time; `router.test.ts` alone 10x
  green (for the `peak === CONCURRENCY` tightening).
