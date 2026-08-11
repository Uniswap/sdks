# Event-Driven Search Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace router-lite-sdk's staged wave engine with the event-driven solver loop specced in `docs/superpowers/specs/2026-08-10-event-driven-search-core-design.md` — a hard cut, landing as clean as if it were the original design.

**Architecture:** One solver loop (async generator) awaits a coalescing notifier and, per wake: runs a measurement-first pricing pump, triggers leader verification, emits typed events, and (when the pump is dry) opens the coverage gate / advances the intermediates frontier. Two convergence processes (pump over measurements, coverage worker over scan demand) and a verifier do all the work; a single-writer `SearchState` makes accounting invariants structural.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), bun test + fast-check, viem-only runtime dependency. Package: `sdks/router-lite-sdk`.

## Global Constraints

- **The spec is the authority.** Every implementer MUST read `docs/superpowers/specs/2026-08-10-event-driven-search-core-design.md` in full before writing code. Where this plan and the spec disagree, the spec wins; flag the disagreement in the task report.
- **Hard cut.** No compatibility shims, no `@deprecated` re-exports, no dead code left behind "just in case". Deleted machinery is deleted. The final tree must read as if the event core were the original design.
- **Standing directive (maintainer):** keep looking for collapse/simplification opportunities onto the new model as you go. If a mechanism you're porting exists only to serve wave-era structure, propose deleting it in your task report instead of porting it. Simplifications that are safe and in-scope: do them; bigger ones: flag them for the orchestrator.
- **Comment regime (new/edited files):** short invariant-at-the-branch comments only. No change-history narration, no review-code tags (C4-*, C5-*, R*, F*), no ALL-CAPS thesis paragraphs, no cross-file audits. Rationale that needs an essay goes in the module header, once, ≤15 lines.
- **Evidence taxonomy is untouchable:** revert ≠ transport failure ≠ node-state miss ≠ head regression, threaded exactly as today (`TransportError`, `AbortedCallError`, `revertDataOf`, `verificationDegraded`, `headRegressed`). Business outcomes are data, never throws; only the pinned-block fetch may raise `RpcUnavailableError`.
- **No timers anywhere in the engine.** The notifier is the only wake mechanism.
- **Unchanged modules (do not edit except where a task names them):** `pools/poolIndex.ts`, `internal/` (rpc, rpcErrors, logScan, logScanPolicy, multicall, ranges, currency, segment, abis), `plan/`, `encode/`, `verify/readiness.ts`, `verify/preflight.ts`, `manifest.ts`, request validation in `router.ts`.
- Run `bun test` (hermetic) green before every commit; `bun run typecheck:all && bun run lint` green at every task boundary.
- Commit messages: conventional commits, scope `router-lite-sdk`.
- All commands run from `sdks/router-lite-sdk/` unless stated. Live-RPC commands use `chainz exec <chainId> -- <cmd>`.

---

### Task 0: Baseline capture

**Files:**
- Create: `scratch/event-core-baseline.md` (repo-root `scratch/` — gitignored working notes; do NOT commit)

**Interfaces:** Produces the baseline numbers Task 16 compares against.

- [ ] **Step 1:** Run `bun test 2>&1 | tail -5` and record pass/skip counts and duration.
- [ ] **Step 2:** Record live latency + request behavior (3 runs each, note medians):
  - `chainz exec 8453 -- bun cli/rl.ts quote eth usdc 1` (warm cache)
  - `chainz exec 1 -- bun cli/rl.ts quote eth usdc 1 --no-cache --budget 30s` (cold)
  - `chainz exec 1 -- bun cli/rl.ts swap eth usdc 0.5 --trader 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --budget 20s`
  - `chainz exec 8453 -- bun cli/rl.ts quote 0x532f27101965dd16442E59d40670FaF5eBB142E4 usdc 1000 --budget 45s` (long-tail two-hop)
  Record: total ms, first-lead ms, routes priced, "routes checked" line, coverage bars.
- [ ] **Step 3:** Run `chainz exec 1 -- bun scripts/compare.ts --pair eth:usdc --pair usdc:wbtc 2>&1 | tail -30` and record the parity/latency summary (if the script requires a trading-api key that is absent, record that and skip).
- [ ] **Step 4:** Write all numbers to `scratch/event-core-baseline.md`. No commit.

---

### Task 1: Notifier and SourceSet primitives

**Files:**
- Create: `src/search/notify.ts`
- Test: `src/search/notify.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Notifier = { poke(): void; next(): Promise<void> }
  export function createNotifier(): Notifier
  export class SourceSet {
    constructor(wake: Notifier)
    readonly signal: AbortSignal                  // every launched source must honor it
    launch(name: string, run: (signal: AbortSignal) => Promise<void>): void
    settled(): boolean                            // true when every launched source has settled
    failures(): { name: string; error: unknown }[] // rejections, recorded not rethrown
    abortAll(): void
  }
  ```

**Semantics (exact):**
- `poke()` before anyone awaits `next()` sets a latch; the next `next()` resolves immediately and clears it. N pokes = one wake (coalescing). `poke()` while a `next()` is pending resolves it. Multiple concurrent `next()` awaiters all resolve on one poke (the loop is the only awaiter in production; tests may use more).
- `SourceSet.launch` starts the promise immediately, pokes `wake` when it settles (fulfilled or rejected), records rejections in `failures()` — a source rejection never becomes an unhandled rejection and never throws out of the set.
- `abortAll()` aborts the shared signal; idempotent.

- [ ] **Step 1:** Write failing tests in `src/search/notify.test.ts` covering, at minimum: poke-before-next resolves immediately; N pokes coalesce to one wake; poke-during-pending resolves the pending `next()`; a launched source that resolves pokes the notifier and flips `settled()`; a rejecting source lands in `failures()` with no unhandled rejection (use `process.on('unhandledRejection')` capture within the test); `abortAll()` delivers an aborted signal to a running source.
- [ ] **Step 2:** `bun test src/search/notify.test.ts` → expect failures (module missing).
- [ ] **Step 3:** Implement `src/search/notify.ts` (~60 lines).
- [ ] **Step 4:** `bun test src/search/notify.test.ts` → green. `bun run typecheck`.
- [ ] **Step 5:** Commit: `feat(router-lite-sdk): notifier + source-set primitives for the event core`

---

### Task 2: Pool hypotheses on ProtocolModule

**Files:**
- Modify: `src/protocols/types.ts`, `src/protocols/v2.ts`, `src/protocols/v3.ts`, `src/protocols/v4.ts`
- Test: extend `src/protocols/v2.test.ts`, `v3.test.ts`, `v4.test.ts`

**Read first:** `src/protocols/types.ts` (ProtocolModule), each module's `speculativeDirect`, `src/protocols/poolRef.ts`.

**Interfaces:**
- Produces, on `ProtocolModule`:
  ```ts
  /** Pool identities derivable for (a, b) without discovery: v2's pair address,
   *  v3's CREATE2 address per standard + `extraFees` tier, v4's standard configs.
   *  Pure — no RPC, no index. Existence is the pump's job to prove by measurement. */
  hypotheses(a: CurrencyRef, b: CurrencyRef, manifest: ChainManifest, extraFees?: number[]): PoolRef[]
  ```
- `speculativeDirect` remains untouched until Task 11 deletes it (the old engine still runs until Task 9).

**Notes:** Implementation is a refactor of each module's existing `speculativeDirect` identity-derivation half — derive the same `PoolRef`s it builds today (via `v2PoolRef`/`v3PoolRef`/`v4PoolRef`), without encoding quote calls. `extraFees` covers fee-scan-discovered tiers (v3; v4 ignores it; v2 has no fees). A pair containing `'native'` follows each module's existing rules (v2/v3 wrap; v4 uses address(0) in the key).

- [ ] **Step 1:** Write failing tests: for a known mainnet pair, `v3Module.hypotheses(WETH, USDC, MAINNET_MANIFEST)` returns exactly the 4 standard-tier PoolRefs with the same ids `speculativeDirect`'s candidates carry today (assert set equality of `pool.id`s against the existing method's output); `extraFees: [123]` adds exactly one more; v2 returns 1; v4 returns the standard configs; native handling matches per protocol.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. **Step 4:** `bun test src/protocols` → green; typecheck.
- [ ] **Step 5:** Commit: `feat(router-lite-sdk): pure pool-hypothesis enumeration on ProtocolModule`

---

### Task 3: SearchState, apply functions, report fold

**Files:**
- Create: `src/search/state.ts`
- Modify: `src/search/report.ts` (re-point its inputs from `Run` to `{ state, ctx, req }`; keep coverage-intersection logic verbatim)
- Modify: `src/types.ts` (SearchReport field changes — see below)
- Test: `src/search/state.test.ts`

**Read first:** spec §3.5 and §4; `src/search/waves.ts` `EngineState` (the fields being replaced); `src/search/report.ts`; `src/types.ts` `SearchReport`.

**Interfaces:**
- `src/types.ts` — **breaking `SearchReport` changes** (public):
  ```ts
  // quoting: same five counters, now counting leg measurements on ONE channel.
  // enumeration becomes:
  enumeration: {
    exhaustiveWithinMaxHops: boolean
    intermediatesDiscovered: number
    intermediatesSelected: number
    intermediatesPruned: number       // "not selected YET" — frontier reaches all in the limit
    legsMeasured: number
    pairCeilingHit: boolean
  }
  // delete: poolsPruned, candidatesPruned, candidatesGenerated. Everything else unchanged.
  ```
  Update `zeroReportEnumeration()` accordingly. Add constant `MEASUREMENT_PAIR_CEILING = 128` to `src/constants.ts` (doc: abuse backstop against pool-spam pairs, not a selection cap).
- `src/search/state.ts` produces:
  ```ts
  export type LegDirection = { currencyIn: CurrencyRef; currencyOut: CurrencyRef }
  export type Measurement = LegDirection & {
    pool: PoolRef; amountIn: bigint; amountOut: bigint; gasEstimate?: bigint
  }
  export function legKey(poolId: string, currencyInNode: string, amountIn: bigint): string
  export type SearchState = {
    block: BlockRef
    headRegressed: boolean
    aborted: boolean
    indexVersion: number                        // pump early-exit cursor
    gateOpened: boolean
    measurements: Map<string, Measurement>      // legKey -> success
    measuredKeys: Set<string>                   // every settled legKey (success or revert)
    inFlightKeys: Set<string>
    transportRetried: Set<string>               // one-shot re-release, rule unchanged
    mX: Map<string, { amount: bigint; fromPoolId: string }>  // graph node -> best in-leg
    intermediates: { selected: string[]; discovered: number; notch: number }
    quoting: SearchReport['quoting']
    legsMeasured: number
    pairCeilingHit: boolean
    requirements?: ExecutionRequirement[] | undefined
    readinessDegraded: boolean
    verificationDegraded: boolean
    execution: Map<string, { status: RankedRoute['execution']; revertData?: Hex }>
    compiledById: Map<string, { tx: EncodedTx; limits: CompiledLimits }>
    firstCompileError?: string | undefined
    verification: SearchReport['verification']
    discovery: Record<Protocol, { complete: Set<string>; failed: boolean }>
    outcomeLog?: OutcomeEntry[] | undefined     // present only when recording (Task 13 consumes)
  }
  export function createState(block: BlockRef, headRegressed: boolean, recording?: boolean): SearchState
  // The ONLY functions allowed to mutate SearchState:
  export type MeasurementOutcome =
    | { kind: 'success'; m: Measurement }
    | { kind: 'reverted'; key: string; pool: PoolRef; amountIndependent: boolean }
    | { kind: 'transport'; key: string; candidateRetry: boolean }
    | { kind: 'unattempted'; key: string }      // abort landed before dispatch
  export function applyMeasurement(s: SearchState, o: MeasurementOutcome): void
  export function applyCoverage(s: SearchState, p: Protocol, endpoint: string, o:
    { kind: 'complete' } | { kind: 'failed' }): void
  export function applyReadiness(s: SearchState, r: { requirements: ExecutionRequirement[]; degraded: boolean }): void
  export function applyPreflight(s: SearchState, routeId: string, o:
    { kind: 'verified' } | { kind: 'needs-action' } | { kind: 'reverted'; revertData?: Hex }
    | { kind: 'transport' } | { kind: 'unverified' }): void
  export function applyAbort(s: SearchState): void
  ```
  Every `apply*` appends to `outcomeLog` when present. `applyMeasurement` owns ALL quoting-counter movement: success → attempted+succeeded; reverted → attempted+failed; transport → attempted+transportFailed (and releases the key for one retry iff `!transportRetried.has(key)`); unattempted → unattempted. `legsMeasured` increments on every settled key. The invariant `attempted === succeeded + failed + transportFailed` must be unviolable by construction (single switch).
- `src/search/report.ts` produces: `buildReport(state, ctx, req): SearchReport` (same coverage-bar and status logic as today, reading `state.discovery` and the intermediates fields; `exhaustiveWithinMaxHops` = discovery complete on all enabled protocols ∧ `intermediatesPruned === 0` ∧ `!pairCeilingHit` ∧ `!aborted` ∧ no unattempted/transport losses — port today's derivation).

- [ ] **Step 1:** Write failing tests: unit tests per `apply*` (counter movement, transport one-shot release, outcomeLog append when recording), plus a fast-check property: for any generated sequence of `MeasurementOutcome`s, `attempted === succeeded + failed + transportFailed` and `unattempted ≤ legsPlanned` and counters are monotone.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement `state.ts`; update `types.ts` + `constants.ts`; re-point `report.ts` (keep the old `Run`-based signature compiling by adapting `waves.ts`'s call site minimally — the old engine must stay green until Task 9).
- [ ] **Step 4:** `bun test src/search/state.test.ts src/search` → green (some existing report/waves tests will need the enumeration-field rename — update those assertions now, they are part of this task). Typecheck.
- [ ] **Step 5:** Commit: `feat(router-lite-sdk): single-writer SearchState with structural accounting + SearchReport field cut`

---

### Task 4: Leg measurement executor

**Files:**
- Create: `src/quote/measure.ts`
- Test: `src/quote/measure.test.ts`

**Read first:** `src/quote/quote.ts` (`runQuoteRound`, `isAmountIndependentFailure`, stats tallying), `src/internal/multicall.ts`, `src/internal/rpc.ts`.

**Interfaces:**
- Produces:
  ```ts
  export type LegRequest = {
    key: string                      // state.ts legKey — caller-computed, round-deduped by caller
    pool: PoolRef
    currencyIn: CurrencyRef; currencyOut: CurrencyRef
    amountIn: bigint
  }
  export type LegOutcome =
    | { key: string; kind: 'success'; amountOut: bigint; gasEstimate?: bigint }
    | { key: string; kind: 'reverted'; amountIndependent: boolean }
    | { key: string; kind: 'transport' }
    | { key: string; kind: 'unattempted' }
  export async function measureLegs(args: {
    client: Pick<PublicClient, 'request'>
    modules: Record<Protocol, ProtocolModule>
    manifest: ChainManifest
    legs: LegRequest[]
    blockNumber: bigint
    semaphore?: Semaphore | undefined
    multicall3?: Address | undefined
    signal?: AbortSignal | undefined
  }): Promise<LegOutcome[]>
  ```
- One outcome per input leg, in order. Encoding via `modules[pool.protocol].encodeQuote([leg], amountIn, manifest)`; an encode throw is that leg's `reverted` slot with `amountIndependent` per `revertDataOf`-style inspection (reuse `encodeOr` semantics). Dispatch through the existing `runQuoteRound` machinery — extract/reuse it rather than duplicating (move `runQuoteRound` + `isAmountIndependentFailure` into `measure.ts` and have `quote.ts` import them from there until Task 11 deletes the old callers).

- [ ] **Step 1:** Write failing tests using the existing stub patterns from `src/quote/quote.test.ts` (per-call path and `serveAggregate3` multicall path): success decode; pool-absent data-less revert → `amountIndependent: true`; data-carrying revert → `false`; outer 429 on the multicall path coarsens the chunk to `transport`; abort while queued → `unattempted`; both dispatch paths produce identical outcome vocabularies for the same world.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement. **Step 4:** `bun test src/quote` → green (existing quote.test.ts must stay green — the old engine still uses `quoteCandidates`). Typecheck.
- [ ] **Step 5:** Commit: `feat(router-lite-sdk): leg-level measurement executor over the multicall round machinery`

---

### Task 5: The pricing pump

**Files:**
- Create: `src/search/pump.ts`
- Test: `src/search/pump.test.ts`

**Read first:** spec §3.2 (the whole section, including dominance); `src/search/candidates.ts` (being replaced — steal `materializeLeg` semantics and the neighbor-intersection walk); `src/internal/currency.ts` (`toGraphNode`); `src/pools/poolIndex.ts` (`pair`, `neighbors`, `isNegative`, `markSuccess`, `markNegative`, `upsert`, `touchAll`).

**Interfaces:**
- Produces:
  ```ts
  export type PumpCtx = {
    index: PoolIndex
    modules: Record<Protocol, ProtocolModule>
    manifest: ChainManifest
    hookData: Map<string, Hex>
    hints: PoolHint[]                      // req.hints — hypotheses with 'hint' provenance
    client: Pick<PublicClient, 'request'>
    semaphore?: Semaphore | undefined
    multicall3?: Address | undefined
    signal?: AbortSignal | undefined
  }
  /** One pump cycle: plan due legs over current knowledge, measure them, apply outcomes,
   *  recompose. Returns true if anything was measured (i.e. not dry). Early-exits (returns
   *  false) when index.version and state's own inputs are unchanged since the last cycle. */
  export async function pump(state: SearchState, ctx: PumpCtx, req: QuoteRequest): Promise<boolean>
  export function pumpDry(state: SearchState, ctx: PumpCtx): boolean
  /** Pure: compose ranked QuotedRoutes from state.measurements (spec §3.2 composition). */
  export function composeRoutes(state: SearchState, ctx: PumpCtx, req: QuoteRequest): QuotedRoute[]
  ```
- **Planning (pure, internal but exported for tests as `planDueLegs`):**
  1. Relevant intermediates: hinted nodes, then manifest cores, then neighbor-intersection nodes (newest-touching-pool first), sliced to `state.intermediates.selected` (the frontier owns growth; the pump only reads the selected list, and refreshes `discovered`).
  2. For the direct pair and each selected X: measurable set = `index.pair(...)` pools ∪ `modules[*].hypotheses(...)` (with fee-scan `extraFees` from `index.enabledFees`) ∪ hint-derived PoolRefs for that pair — deduped by `pool.id`, minus pools negative at this block, capped at `MEASUREMENT_PAIR_CEILING` (set `pairCeilingHit`).
  3. Direct + in-legs due at `req.amountIn`. Out-legs for X due at `state.mX.get(X).amount`; **no `mX` → deferred** (not planned).
  4. Due = keys not in `measurements`/`measuredKeys`/`inFlightKeys` (transport-released keys are re-due once).
- **Apply half:** feed `measureLegs` outcomes through `applyMeasurement`; on success also `index.upsert` (hypothesis proven; hint provenance preserved via `source: 'hint'` for hint-derived refs — existing upsert no-downgrade rules apply) + `index.markSuccess`; on amount-independent revert `index.markNegative` (single-leg by construction, so today's two-leg attribution caveat vanishes). Update `mX` when an in-leg for X improves; **when `mX` changes, delete X's out-leg measurements** (they were measured at a stale amount) so the next cycle re-plans them.
- **Composition (`composeRoutes`):** direct routes from direct measurements; per X with `mX`: `best-in(X)` leg + one route per measured out-leg at `mX.amount`, `intermediateAmounts: [mX.amount]`, `gasEstimate` = sum-or-absent. Legs materialized with the currency-form rules of today's `materializeLeg` (hookData stamped on v4 legs from `ctx.hookData`). Rank with the existing `rankRoutes`. A route with any leg negative-at-block is excluded (same as today's `isNegativeCandidate`).

- [ ] **Step 1:** Write failing unit tests for `planDueLegs` (pure): dedup across pairs sharing pools; out-leg deferral without `mX`; re-plan after `mX` invalidation; ceiling sets `pairCeilingHit`; hint-derived hypotheses present with hint provenance; negative pools excluded.
- [ ] **Step 2:** Write failing fast-check properties: **(a) dominance** — for a generated world of monotone fake pools, the best composed route's `amountOut` ≥ the true best two-hop found by brute-force chained evaluation over ALL (in, out) pairs (equality when out-pool ranking is amount-stable, which generated constant-product pools are); **(b) dedup** — a full multi-cycle pump run against a scripted client never issues two identical (pool, direction, amount) quote calls; **(c) conservation** — quoting counters satisfy the invariant after arbitrary interleavings of success/revert/transport outcomes.
- [ ] **Step 3:** Run → fail. **Step 4:** Implement `pump.ts` (~250 lines target).
- [ ] **Step 5:** `bun test src/search/pump.test.ts` → green; full `bun test src` still green. Typecheck.
- [ ] **Step 6:** Commit: `feat(router-lite-sdk): measurement-first pricing pump with dominance composition`

---

### Task 6: Coverage worker

**Files:**
- Create: `src/search/coverage.ts` (refactor of `src/search/discovery.ts` — discovery.ts is deleted in this task; its ingestion helpers move here)
- Modify: `src/search/waves.ts` call sites minimally so the old engine still compiles (temporary; deleted Task 9)
- Test: `src/search/coverage.test.ts` (port + rewrite of `src/search/discovery.test.ts`)

**Read first:** spec §3.3; `src/search/discovery.ts`; `src/search/adjacencyPlan.ts` (unchanged, reused); `src/internal/logScan.ts` opts.

**Interfaces:**
- Produces:
  ```ts
  export type CoverageCtx = {
    index: PoolIndex; modules: Record<Protocol, ProtocolModule>; manifest: ChainManifest
    client: Pick<PublicClient, 'request'>
    head: bigint                            // pinned block number
    semaphore?: Semaphore | undefined; logChunkBlocks?: bigint | undefined
    scanSleep?: ((ms: number) => Promise<void>) | undefined
    wake: Notifier                          // poked per ingested chunk
  }
  export class CoverageWorker {
    constructor(ctx: CoverageCtx, state: SearchState, req: QuoteRequest)
    demandEager(): void      // exact-pair scope, recent week (wave0PairScanBlocks) — idempotent
    demandFull(): void       // every scope's [deployBlock, head] — idempotent; re-wakes if settled
    run(signal: AbortSignal): Promise<void>   // the source: converge-while-progress, then resolve
    converged(): boolean     // current demand fully covered
  }
  ```
- **Semantics:** demand is a pure function of (scopes, gate state). `run` loops: compute `uncovered = demand − index coverage − ranges this worker already attempted this search`; if empty and no wider demand pending → resolve; plan merged scans via `planAdjacencyScans` (adjacency scopes) + direct queries (pair scope, fee scope); execute via `scanLogs` walking ranges **head-backward** (order ranges descending by `toBlock`; within `scanLogs` the existing chunk walk is fine); ingest chunk-by-chunk (existing merged-emitter routing) and poke `wake`; record coverage; call `applyCoverage(state, protocol, endpoint, ...)` per scope when its full limit demand is covered (`complete`) or when a pass covered nothing it asked for (`failed`) — judged against limit demand exactly as spec §3.3's report paragraph states. Pass again while the previous pass made progress. `demandFull()` after resolution re-arms `run`'s internal loop via an internal notifier (or `run` is only launched once and awaits an internal demand-widened promise — implementer's choice, but `run` must be a single launched source whose promise settles only when no further demand can arrive, i.e. after the gate has opened and convergence/zero-progress is reached).
- Fee-scope results feed `index.addEnabledFees` exactly as today.

- [ ] **Step 1:** Port `discovery.test.ts` scenarios to failing `coverage.test.ts` tests: warm re-scan covers only the delta+reorg tail; a scope failing wholesale reports `failed`; merged queries answer multiple scopes; per-search attempted-range tracking prevents re-asking the tail; head-backward order (assert the first `eth_getLogs` range abuts the head); eager demand scans only the week window; `demandFull` after settle re-wakes and completes; a zero-progress second pass settles as failed rather than spinning.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement; delete `discovery.ts`, moving `ingestLogs`/`ingestMerged` here; patch `waves.ts` imports (minimal, temporary).
- [ ] **Step 4:** `bun test src/search` green; typecheck. **Step 5:** Commit: `feat(router-lite-sdk): coverage worker — demand/converge with head-backward walk (replaces discovery.ts)`

---

### Task 7: Verifier

**Files:**
- Create: `src/search/verifier.ts` (from `src/search/leader.ts` — leader.ts deleted here; `compileAndEncode`, `isIntegerOutOfRange`, `withExecution`, `pickLeader` move over)
- Modify: `src/search/waves.ts` imports (temporary)
- Test: `src/search/verifier.test.ts` (port of `leader.test.ts`)

**Read first:** spec §3.4; `src/search/leader.ts` in full.

**Interfaces:**
- Produces:
  ```ts
  export class Verifier {
    constructor(args: {
      state: SearchState
      ctx: { client: Pick<PublicClient,'request'>; manifest: ChainManifest; modules: Record<Protocol, ProtocolModule>; semaphore?: Semaphore | undefined }
      req: SwapRequest
      wake: Notifier
    })
    /** Called by the loop after each recompose. Readiness must be settled first (the loop
     *  guarantees it; this class also asserts it). At most one preflight in flight; a leader
     *  change during flight queues the new leader. Budget: PREFLIGHT_TOP_K simulations per
     *  SEARCH (state.verification.preflightAttempted). Sets preflightBudgetExhausted per the
     *  existing rule (untried candidates that are neither failed nor verified remain). */
    consider(ranked: QuotedRoute[]): void
    idle(): boolean
  }
  ```
- Preflight outcomes go through `applyPreflight` (which owns the status map + `verificationDegraded`). All of today's rules transfer verbatim: requirements → `needs-action` short-circuit (tx still compiled); `readinessDegraded` → `unverified`, never `needs-action`, and a revert is not blamed on the route; transport → `unverified` + degraded; revert → `failed` with verbatim `revertData`; compile failure → `failed` at zero budget cost, `firstCompileError` captured.

- [ ] **Step 1:** Port `leader.test.ts` to failing `verifier.test.ts` (same scenarios, new driving surface: construct state, call `consider`, await wake pokes). Add: leader-change-during-flight verifies the new leader next; per-search budget (a 4th distinct reverting leader is not simulated).
- [ ] **Step 2:** Run → fail. **Step 3:** Implement; delete `leader.ts`; patch `waves.ts` (temporary shim usage is fine).
- [ ] **Step 4:** `bun test src/search` green; typecheck. **Step 5:** Commit: `feat(router-lite-sdk): leader verifier — concurrent, readiness-gated, per-search budget (replaces leader.ts)`

---

### Task 8: The solver loop

**Files:**
- Create: `src/search/loop.ts`
- Test: `src/search/loop.test.ts`

**Read first:** spec §3.1 + §3 frontiers; `src/search/waves.ts` (`SearchContext`, `fetchBlock`, readiness dispatch in `wave0a`) — the context type and `fetchBlock` MOVE here (loop.ts owns them now); `src/router.ts` `startSearch`.

**Interfaces:**
- Produces:
  ```ts
  export type EngineEvent =
    | { type: 'lead'; ranked: RankedRoute[]; state: SearchState }   // internal; facade shapes results
    | { type: 'progress'; state: SearchState }
    | { type: 'final'; ranked: RankedRoute[]; state: SearchState }
  export type SearchContext = { /* moved from waves.ts: client, manifest, modules, index,
    hookData, head?, semaphore?, multicall3?, logChunkBlocks?, scanSleep?, pinnedBlock? */ }
  export async function* search(ctx: SearchContext, req: QuoteRequest | SwapRequest,
    kind: 'quote' | 'swap'): AsyncGenerator<EngineEvent>
  export { fetchBlock, type HeadWatermark }   // moved verbatim from waves.ts
  ```
- **Loop body (spec §3.1 skeleton, exactly):** pin block (via `ctx.pinnedBlock ?? fetchBlock(...)`); `createState`; notifier; SourceSet; launch readiness (swap only — outcome through `applyReadiness`); construct CoverageWorker, `demandEager()`, launch `run`; then the while loop: `wake.next()` → `pump()` → `verifier.consider(composed)` (swap, readiness settled) → emit `lead` when the leader signature (routeId, amountOut, execution status, tx presence) changed, else `progress` when report-relevant state moved → termination check (`aborted || (sources.settled && worker.converged && pumpDry && verifier.idle && intermediates at eligible limit)`) → dry? `worker.demandFull()` once + advance intermediates notch (+`MAX_INTERMEDIATES` more, no-op at eligible limit). `finally { sources.abortAll() }`. Abort observed at loop top → `applyAbort`, emit final, return.
- Intermediates frontier lives here (~15 lines): `state.intermediates.selected` grows by `MAX_INTERMEDIATES` per advance from the pump's discovered ordering.
- **The loop body must stay ≤ ~80 lines.** Everything else lives in the sibling modules.

- [ ] **Step 1:** Write failing tests (reuse `waves.test.ts`'s scripted-client patterns; do NOT port the whole file yet — Task 10 does): hinted swap resolves with zero `eth_getLogs` for unbounded scopes (count getLogs, allow only the eager pair-window ones); a consumer that stops pulling after the first lead never opens the gate (assert no adjacency getLogs); abandoning the iterator aborts in-flight scans; abort between wakes → final with `aborted: true` and best-so-far; a pool only the eager pair scan can find still routes; events: first `lead` precedes gate opening on a hinted pair; `final` exactly once and last.
- [ ] **Step 2:** Run → fail. **Step 3:** Implement `loop.ts`; move `fetchBlock`/`HeadWatermark`/`SearchContext` here, leaving `waves.ts` re-importing them (temporary — waves.ts dies next task).
- [ ] **Step 4:** `bun test src/search` green; typecheck. **Step 5:** Commit: `feat(router-lite-sdk): the solver loop — wake, pump, verify, emit, gate`

---

### Task 9: Facade hard cut — events API, classification, waves.ts deletion

**Files:**
- Modify: `src/types.ts` (add `SearchEvent`), `src/router.ts`, `src/index.ts`
- Delete: `src/search/waves.ts`, `src/search/candidates.ts`, `src/search/context.ts` (fold its three accessors into loop/coverage), `src/search/hookData.ts` stays (validation still used)
- Modify: `src/quote/quote.ts` — delete `quoteCandidates`/`probeQuotes`/segmentation-based quoting; keep `rankRoutes` + `QuoteStats` type if still referenced (move `rankRoutes` to `src/quote/rank.ts` if quote.ts empties; delete `src/internal/segment.ts` only if plan/compile does not use it — it DOES (`plan/compile.ts` imports `segmentCandidate`), so segment.ts stays)
- Test: `src/router.test.ts` updates; `src/types.test.ts`; surface tests

**Read first:** spec §4; `src/router.ts` (`classifyQuote`/`classifySwap`, `startSearch`, the four entry points); `src/index.surface.test.ts`, `src/build.surface.test.ts`.

**Interfaces:**
- `src/types.ts`:
  ```ts
  export type SearchEvent<R> =
    | { type: 'lead'; result: R }
    | { type: 'progress'; search: SearchReport }
    | { type: 'final'; result: R }
  ```
- `src/router.ts`: `quotes(req): AsyncIterable<SearchEvent<QuoteResult>>`; `swaps(req): AsyncIterable<SearchEvent<SwapResult>>`; `getQuote`/`getSwap` consume the engine stream and stop at first actionable `lead` (`status === 'quote'` / `'ready'` / `'needs-action'`) or `final`. Delete `IterateOptions` and `onFirstRoute` plumbing. `classifyQuote`/`classifySwap` re-point at `EngineEvent` (ranked + state → public result; same status semantics as today, including the demote-failed-leader-on-inconclusive rule and `isSearchComplete`). `rpcUnavailable` path unchanged.
- `src/index.ts`: export `SearchEvent`; remove `IterateOptions`.

- [ ] **Step 1:** Update `router.test.ts`'s iterator tests to the event vocabulary (failing first), keeping every classification scenario; update surface tests' expected export lists.
- [ ] **Step 2:** Implement the cut; delete the dead files; fix `src/experimental/index.ts` (remove `generateRoutes`, `GenerateRoutesArgs/Result`; add `search` + `SearchContext` + `EngineEvent`? NO — keep experimental minimal: export the new `PoolIndex`-related and protocol symbols it already has, drop what died; do not add engine internals).
- [ ] **Step 3:** `bun test src` fully green EXCEPT `replay.golden.test.ts` (quarantine ALL sessions with a pointer to Task 13 — the old RPC-recorded sessions cannot replay a hard-cut engine; this is expected and temporary) and any waves-specific tests already deleted. Typecheck + lint green.
- [ ] **Step 4:** Commit: `feat(router-lite-sdk)!: event-stream public API on the solver loop; delete the wave engine`

---

### Task 10: Engine behavioral suite port

**Files:**
- Modify/Create: `src/search/loop.test.ts` (grow), `src/router.test.ts` (grow)
- Delete: `src/search/waves.test.ts`, `src/search/candidates.test.ts`, `src/search/discovery.test.ts`, `src/search/leader.test.ts` (whatever remains)

**Read first:** the deleted test files — every scenario name; the review's coverage-gap list in `sdks/router-lite-sdk/docs/code-quality-review.md` §5.

**Requirement:** every *behavioral* scenario from the old engine suite must exist against the new engine (same fake-world setup, event-based assertions) or be explicitly listed in the commit message as intentionally dropped with a reason (e.g. tests of deleted mechanisms: interleave timing, wave counting, signatureOf, evidence-slot selection). Non-negotiable keepers: hint-without-scan fast path; junk-hint discredit across two blocks + restore-by-creation-log; negative-cache block scoping and data-carrying-revert exclusion; transport-vs-revert classification through to results; head regression + watermark self-heal; abort at every seam; warm-index re-scan delta; needs-action gating incl. degraded readiness; preflight fall-through + budget reporting; requirements-before-simulation; focus/endpoint coverage semantics; concurrency bound as a real global bound.
**New tests (from spec §8):** two concurrent searches on one router (different pairs, same head — both coherent, shared index consistent after); frontier monotonicity property; measurement-dedup property at the loop level (scripted client asserts no duplicate quote calls across a whole search).

- [ ] **Step 1:** Inventory old scenarios → checklist in the task report. **Step 2:** Port batch-by-batch, running `bun test src/search src/router.test.ts` per batch. **Step 3:** Add the new tests. **Step 4:** Full `bun test src` green (replay goldens still quarantined); typecheck.
- [ ] **Step 5:** Commit: `test(router-lite-sdk): port engine behavioral suite to the solver loop + concurrency/frontier coverage`

---

### Task 11: Deletions, constants cleanup, module-graph hygiene

**Files:**
- Modify: `src/constants.ts`, `src/protocols/*` (delete `speculativeDirect`, `QuoteProbe`), `src/protocols/types.ts`, `src/experimental/index.ts`, `src/internal/resultCoherence.ts` (shrink to surviving invariants: result-shape coherence, report-axis coherence; drop the three-channel conservation notes — conservation is now a state.ts property test)
- Test: `src/build.surface.test.ts`, `src/experimental/surface.test.ts`, `src/internal/moduleGraph.ts` closure

**Deletions checklist (grep must come back empty):** `QUOTE_INTERLEAVE_MS`, `WAVE0_PAIR_SCAN_GRACE_MS`, `FEE_DISCOVERY_MAX_REQUESTS`, `MAX_POOLS_PER_LEG`, `MAX_POOLS_DIRECT`, `MAX_QUOTE_CANDIDATES`, `speculativeDirect`, `QuoteProbe`, `quoteEvidence`, `probeContendedCoreLegs`, `signatureOf`, `onFirstRoute`, `IterateOptions`, `settleOrAfter`, `startRecentPairScan`, `quoteWhileDiscovering`, `WAVE_COUNT`, `selectFocus` (focus selection: the loop has no focus — both endpoints scan merged; if `selectFocus` still has a consumer, that consumer is a bug to fix, not a reason to keep it).
- `MAX_INTERMEDIATES` doc updated: frontier seed/batch. `MEASUREMENT_PAIR_CEILING` documented. Add the basis-tag line (`derived | measured(date) | policy`) to each surviving constant's first doc line — one line each, no essays.

- [ ] **Step 1:** Delete + fix compile errors outward. **Step 2:** `grep -rn` each deleted symbol under `src cli scripts integration canary` → zero hits (CLI/scripts hits get fixed in Tasks 12; if any exist here, stub minimally and note for Task 12). **Step 3:** `bun test src` green, typecheck:all for `src` targets, lint. **Step 4:** Commit: `refactor(router-lite-sdk)!: delete wave-era machinery and constants; basis-tag surviving constants`

---

### Task 12: CLI hard cut

**Files:**
- Modify: `cli/waves.ts` (rename to `cli/stream.ts`), `cli/report.ts`, `cli/commands/quote.ts`, `cli/commands/swap.ts`, `cli/commands/discover.ts`, `cli/commands/context.ts`, `cli/testing.ts`
- Test: `cli/*.test.ts` affected suites

**Read first:** `cli/waves.ts` (iterateWaves), `cli/report.ts` (timeline + confidence panel), spec §4.

**Requirements:**
- Consume `SearchEvent`s directly: `lead` drives the timeline's improvement lines and the first-lead marker (the `firstRouteReporter`/onFirstRoute plumbing dies); `progress` drives live coverage updates under `--watch`; `final` closes.
- `--json` NDJSON: one line per event (`{event: 'lead'|'progress'|'final', ...}`) — document the new shape in `cli/README.md`.
- Report rendering: drop `poolsPruned`/`candidatesPruned`-based lines; "routes checked" becomes "legs measured" (`legsMeasured` = N priced / failed / lost); breadth line reads the intermediates frontier (`selected of discovered (+growing)` when not at limit); keep coverage bars unchanged.
- While here, fix the two CLI bugs from the review (they touch these exact lines): `discover` counterparty via `counterpartOf` result (`cli/commands/discover.ts:164`), and re-class the three `UsageError` misuses in `cli/simulate.ts` (routing outcomes → skipped-with-note; endpoint fact → `RpcError`).

- [ ] **Step 1:** Update failing CLI tests to the event vocabulary; add a `discover eth` counterparty regression test and a simulate exit-class test. **Step 2:** Implement. **Step 3:** `bun test cli` green; `bun run typecheck:cli`; smoke live: `chainz exec 8453 -- bun cli/rl.ts quote eth usdc 1` and `--watch` variant render sensibly. **Step 4:** Commit: `feat(router-lite-sdk)!: cli consumes the event stream; fix discover counterparty + simulate exit classes`

---

### Task 13: Outcome-log goldens and recorder

**Files:**
- Create: `src/internal/outcomeLog.ts` (serialize/parse, schema version), `src/outcome.golden.test.ts`
- Modify: `scripts/recordSession.ts` (emit outcome logs alongside), `src/replay.golden.test.ts` → DELETE together with `src/internal/replay.ts` RPC-session goldens IF provider-conformance does not depend on replay.ts (it does not — it uses fixtures); keep `replay.ts` only if `providerConformance`/`recordSession` still import it (check; trim to what is used).
- Fixtures: `src/internal/__fixtures__/outcomes/*.json` (new), delete `__fixtures__/sessions/*` that cannot serve the new engine.

**Requirements:**
- Golden = recorded `outcomeLog` (from `SearchState.outcomeLog`) + the request + manifest id + final result snapshot. Replaying = folding the log through `apply*` + `composeRoutes` + `buildReport` and deep-comparing result + report. Schema-pinned like today's `replay.golden.test.ts` schema test (port that pattern).
- Record hermetic goldens from the loop.test.ts fake worlds (deterministic, no network) — minimum: hinted-new-asset swap, warm two-hop quote, no-route completed search, rpc-degraded search.
- Record live goldens where endpoints allow: `chainz exec 1` and `chainz exec 8453` for eth/usdc quote + a two-hop. The old quarantined sessions' *scenarios* (atokens two-hop, no-route) get live re-records if the endpoint serves them; otherwise hermetic equivalents stand in and the commit message says so.

- [ ] **Step 1:** Failing schema + fold tests. **Step 2:** Implement outcomeLog.ts + recorder wiring. **Step 3:** Generate hermetic fixtures; attempt live records. **Step 4:** `bun test src` FULLY green — no quarantines remain. **Step 5:** Commit: `test(router-lite-sdk): outcome-log goldens replace RPC-session replay goldens`

---

### Task 14: Deep test-suite pass (all layers)

**Files:** anything under `src`, `cli`, `integration`, `canary`, `scripts` test surfaces.

**Requirements — audit every layer and leave it useful:**
1. `bun test` (src + cli) green, no skips except documented env-gated ones; count roughly ≥ baseline minus intentionally-deleted mechanism tests (report the delta with reasons).
2. Meta-tests: surface tests match the new exports; `build.surface` closure clean; `manifest.parity`, `permit2Types.parity` untouched-green; `resultCoherence` invariants updated (Task 11) and exercised.
3. Property-test additions from the reviews that are cheap and orthogonal: `subtractRanges` membership property (`src/internal/ranges.test.ts`); `canonicalParams` idempotence/equivalence IF `replay.ts` survives Task 13, else skip.
4. `integration/`: update the two deep imports flagged in the review (`assertResultCoherent` via `/experimental`), fix `e2e.ts` stale comment; `bun run typecheck:integration` green; if anvil + `ROUTER_LITE_FORK=1` available locally, run `ROUTER_LITE_FORK=1 bun test integration 2>&1 | tail -20` and report (fork suite exercises getSwap — API unchanged — expect green; fix what isn't).
5. `canary/`: typecheck green; back-port `limits.minAmountOut` into `canary/simulate.ts` (review B2) since its file is being touched for the events API anyway; do NOT run live canary.
6. `scripts/`: typecheck green; `recordSession`/`compare` compile against the new API (compare.ts consumes `quotes()` events now).
7. Full `bun run typecheck:all && bun run lint` green.

- [ ] Steps: audit → fix → run each gate → commit: `test(router-lite-sdk): deep suite pass — all layers green on the event core`

---

### Task 15: Documentation

**Files:**
- Modify: `sdks/router-lite-sdk/README.md` (Mental model, Quickstart iterator example, SearchReport field docs, event API section, delete onFirstRoute/IterateOptions mentions, update the Development section's architecture pointers), `cli/README.md` (NDJSON shape), module headers of new files (≤15-line essays max).

- [ ] **Step 1:** Rewrite affected README sections; verify every code sample in the README typechecks (paste into a scratch .ts against the built types or src). **Step 2:** Sweep `grep -rn "wave" README.md src cli --include='*.md'` for stale mental-model references. **Step 3:** Commit: `docs(router-lite-sdk): event-core mental model, event API, report field changes`

---

### Task 16: Full branch review — coherence and performance

**Files:**
- Create: `sdks/router-lite-sdk/docs/event-core-review.md`

**Requirements:**
1. **Coherence review:** fresh-eyes review of the full branch diff (`git diff main...HEAD -- sdks/router-lite-sdk`) against the spec: is the tree as clean as if this were the original design? Any wave-era residue, stale comments, shim leftovers, accidental complexity in loop/pump/coverage? Findings get fixed, not just listed.
2. **Performance evaluation:** re-run the Task 0 matrix (same commands, 3 runs each) and `compare.ts`; produce a before/after table: total latency, first-lead latency, routes/legs priced, RPC request counts (use `--verbose`/report counters), correctness parity vs Trading API. Investigate and explain any regression >20% on any metric; fix if the cause is a defect.
3. **Test-suite verdict:** counts per layer, coverage of the review-gap list, what was dropped and why.
4. Write `docs/event-core-review.md` with all three sections + a residual-risk list.

- [ ] Steps: review → fix findings → measure → write doc → final `bun test && bun run typecheck:all && bun run lint` → commit: `docs(router-lite-sdk): event-core branch review — coherence + performance evaluation`

---

## Self-Review (performed at plan-write time)

- **Spec coverage:** §3.1 loop → Task 8; §3.2 pump/hypotheses → Tasks 2, 4, 5; §3.3 coverage → Task 6; §3.4 verifier → Task 7; §3.5 state/outcome log → Tasks 3, 13; §4 API/report → Tasks 3, 9, 12; §5 abort → Tasks 1, 8; §6 deletions → Tasks 9, 11; §7 behavior changes → asserted in Tasks 10, 16; §8 testing → Tasks 5, 10, 13, 14; §9 sequencing → this plan's order; §10 risks → Task 16 measures them.
- **Known intentional deviations:** none. `segment.ts` survives (plan/compile uses it); `hookData.ts` survives (request validation uses it).
- **Type consistency:** `SearchState`/`apply*` names match across Tasks 3, 5, 6, 7, 8, 13; `LegRequest/LegOutcome` across 4, 5; `EngineEvent` across 8, 9; `hypotheses` across 2, 5, 11.
