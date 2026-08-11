import type { Address, Log, PublicClient } from 'viem'

import { toGraphNode } from '../internal/currency'
import { scanLogs } from '../internal/logScan'
import type { ScanWidthMemory } from '../internal/logScan'
import { intersectAll, intersectRanges, maxBig, mergeRanges, subtractRanges } from '../internal/ranges'
import type { Semaphore } from '../internal/rpc'
import { deploymentBlockOf, wave0PairScanBlocks } from '../manifest'
import type { PoolIndex } from '../pools/poolIndex'
import type { AdjacencyShape } from '../protocols/adjacency'
import type { FeeDiscovery, ProtocolModule } from '../protocols/types'
import type { BlockRange, ChainManifest, LogQuery, Protocol, QuoteRequest } from '../types'
import { PROTOCOLS } from '../types'

import { planAdjacencyScans, scopeKey } from './adjacencyPlan'
import type { ScopeDemand } from './adjacencyPlan'
import { createNotifier } from './notify'
import type { Notifier } from './notify'
import { applyCoverage } from './state'
import type { SearchState } from './state'

// ---------------------------------------------------------------------------
// THE COVERAGE WORKER (spec §3.3) — the engine's one convergence process over
// knowledge. Scanning is declarative state plus one idempotent converge loop;
// there is no "scan wave" and no "retry wave", because those were the same
// operation run twice.
//
//   DEMAND is a pure function of (scopes, gate state). The scopes are fixed for
//   a search: adjacency for both endpoints per enabled protocol, the v4
//   exact-pair scope, and each fee-factory scope. Pre-gate, demand is the
//   exact-pair scope's recent week alone (`wave0PairScanBlocks`) — the bounded
//   latency guarantee for the new-asset case, and the reason a hinted search
//   issues no unbounded scan at all. `demandFull()` opens every scope's whole
//   `[deployBlock, head]`.
//
//   HAVE is the shared index coverage cache, minus the ranges THIS search has
//   already covered ({@link CoverageWorker.attempted}, private to the worker).
//   `uncovered` re-opens its tail on every read (the standing reorg overlap),
//   so without that private set every later pass would re-buy the last 32
//   blocks of everything the previous one just covered.
//
//   CONVERGE is one loop: compute `uncovered = demand − have`, plan merged
//   requests over it (`adjacencyPlan.ts`), walk them HEAD-BACKWARD, ingest
//   chunk by chunk, record coverage — and pass again WHILE THE PREVIOUS PASS
//   MADE PROGRESS. The while-progress rule is the whole retry policy: every
//   scope converges concurrently, metered by the shared semaphore and
//   `scanLogs`' own per-scan request budget, so no scope can starve another by
//   running ahead of it in a serial order.
//
//   REPORTING is judged against the LIMIT demand (the deployment floors), never
//   against what the gate has opened so far: `complete` = covered to the floor;
//   `failed` = a pass covered nothing it asked for. A pre-gate settle is neither
//   — it is just settled-for-now, and `demandFull()` re-arms the same launched
//   `run()` through an internal notifier.
//
// Nothing here throws for a provider failure: `scanLogs` returns what it managed
// to cover, and a scope that covered nothing is recorded as `failed`.
// ---------------------------------------------------------------------------

/** The protocol modules this chain's manifest actually configures, in `PROTOCOLS` order. */
function enabledModules(ctx: { modules: Record<Protocol, ProtocolModule>; manifest: ChainManifest }): ProtocolModule[] {
  return PROTOCOLS.map((p) => ctx.modules[p]).filter((m) => m.enabled(ctx.manifest))
}

export type CoverageCtx = {
  index: PoolIndex
  modules: Record<Protocol, ProtocolModule>
  manifest: ChainManifest
  client: Pick<PublicClient, 'request'>
  /** The search's pinned block — the ceiling of every scope's demand (`state.block.number`). */
  head: bigint
  semaphore?: Semaphore | undefined
  logChunkBlocks?: bigint | undefined
  scanSleep?: ((ms: number) => Promise<void>) | undefined
  /** Poked per ingested chunk and per coverage/fee write. Coalescing makes over-poking free;
   * under-poking stalls the search, because the pump only re-plans between wakes. */
  wake: Notifier
}

// ---------------------------------------------------------------------------
// The I/O primitives — everything that actually issues an `eth_getLogs` and
// folds the answer back into the index.
// ---------------------------------------------------------------------------

/**
 * The scan half of a caller's context: what to talk to, what to fold into, and where to report
 * having learned something.
 *
 * `progress(gained)` is called ONCE PER INGESTED CHUNK (with the number of pool records that chunk
 * upserted) and once after each coverage or fee write (with 0). A nonzero `gained` is new knowledge:
 * the worker turns it into `state.indexVersion++` — the pump early-exits on an unchanged version, so
 * a missing bump makes it skip the very pools this scan just paid for.
 */
type ScanEnv = {
  index: PoolIndex
  modules: Record<Protocol, ProtocolModule>
  manifest: ChainManifest
  client: Pick<PublicClient, 'request'>
  head: bigint
  semaphore?: Semaphore | undefined
  logChunkBlocks?: bigint | undefined
  scanSleep?: ((ms: number) => Promise<void>) | undefined
  signal?: AbortSignal | undefined
  progress: (gained: number) => void
}

/**
 * The options half of every `scanLogs` call in this file — the router's global semaphore and
 * `logChunkBlocks` override, merged with the caller's signal, so every scan a search issues shares
 * one options shape.
 *
 * `semaphore`/`initialChunk`/`sleep`/`widthMemory` are declared `| undefined` on `scanLogs`' own
 * opts, so passing possibly-absent values straight through (rather than the `signal`-style
 * conditional spread) is not an `exactOptionalPropertyTypes` violation — both sides agree an
 * explicit `undefined` is a legal, meaningful "no override".
 */
function scanOpts(env: ScanEnv): {
  signal?: AbortSignal
  semaphore?: Semaphore | undefined
  initialChunk?: bigint | undefined
  widthMemory?: ScanWidthMemory | undefined
  sleep?: ((ms: number) => Promise<void>) | undefined
} {
  return {
    ...(env.signal !== undefined && { signal: env.signal }),
    semaphore: env.semaphore,
    initialChunk: env.logChunkBlocks,
    // The retry-backoff clock, when the caller injected one (`SearchContext.scanSleep`). Absent —
    // which is every real search — `scanLogs` uses its own `delay`, unchanged.
    sleep: env.scanSleep,
    // The index's own scan-width memory, by reference (`PoolIndex.scanWidth`). This is the seam that
    // makes the width descent a per-endpoint cost instead of a per-scan one: a cold search runs
    // several scans — merged adjacency pairs, the exact-pair scan, each fee factory — and each of
    // them used to halve its way down from `MAX_SCAN_WINDOW` to rediscover the same provider cap the
    // previous one had just found. Threaded from the INDEX rather than from the context because the
    // index is what already outlives the search (and what `cli/` snapshots to disk), so the memory
    // reaches the next search and the next process for free.
    widthMemory: env.index.scanWidth(),
  }
}

/**
 * Uncovered ranges, MOST RECENT FIRST (spec §3). No scan order can rank pools by quality — creation
 * events do not encode current liquidity — so the one ordering that buys anything is temporal: the
 * head end is mandatory for every search anyway, warm incremental searches only ever need the
 * head-adjacent delta, and brand-new pools are the single scan-discoverable class with a temporal
 * prior. `scanLogs`' own chunk walk is already head-backward within one range; this is the ordering
 * ACROSS ranges, and it is the only thing this module decides about walk order.
 */
function headBackward(ranges: BlockRange[]): BlockRange[] {
  return [...ranges].sort((a, b) => (a.toBlock > b.toBlock ? -1 : a.toBlock < b.toBlock ? 1 : 0))
}

function ingestLogs(env: ScanEnv, module_: ProtocolModule, logs: Log[]): void {
  let gained = 0
  for (const log of logs) {
    const record = module_.parsePoolLog(log, env.manifest)
    if (record) {
      env.index.upsert(record)
      gained++
    }
  }
  env.progress(gained)
}

/**
 * Routes a merged response's logs back to the protocol that emitted them.
 *
 * A merged scan's answer MIXES PROTOCOLS — one request can carry v2 `PairCreated` and v3
 * `PoolCreated` logs interleaved — so ingestion dispatches on the emitter address, which is the one
 * field that distinguishes them without decoding. Every `parsePoolLog` already guards its own
 * emitter, so handing a log to the wrong module is safe (it returns `null`); dispatching is about
 * not doing three decodes per log, and about a log from an address no enabled module claims being
 * dropped rather than tried three times.
 */
function ingestMerged(env: ScanEnv, byEmitter: Map<string, ProtocolModule>, logs: Log[]): void {
  let gained = 0
  for (const log of logs) {
    const module_ = typeof log?.address === 'string' ? byEmitter.get(log.address.toLowerCase()) : undefined
    if (!module_) continue
    const record = module_.parsePoolLog(log, env.manifest)
    if (record) {
      env.index.upsert(record)
      gained++
    }
  }
  env.progress(gained)
}

/**
 * The v4 exact-pair `Initialize` scan's plan, which lives in its own pair-scoped coverage namespace.
 *
 * The scope is the whole point: "every pool holding exactly (A,B)" is strictly narrower than "every
 * pool touching A", so this scan can neither claim adjacency coverage (a later adjacency pass would
 * then skip real work) nor be bounded by it. Its own key is what makes it *incremental* — a warm
 * router re-running the same request re-scans only the block delta plus the reorg overlap, instead
 * of the entire v4 history every single time.
 */
type ExactPairPlan = { module_: ProtocolModule; query: LogQuery; scope: string; deployBlock: bigint }

function exactPairPlan(env: ScanEnv, req: Pick<QuoteRequest, 'tokenIn' | 'tokenOut'>): ExactPairPlan | undefined {
  const module_ = env.modules.v4
  const v4 = env.manifest.v4
  if (!v4 || !module_.enabled(env.manifest) || !module_.exactPair) return undefined
  return {
    module_,
    query: module_.exactPair(req.tokenIn, req.tokenOut, env.manifest),
    scope: env.index.pairScope(req.tokenIn, req.tokenOut),
    deployBlock: v4.deploymentBlock,
  }
}

/**
 * Walks `ranges` with the exact-pair query, recording coverage as it goes and returning what it
 * covered.
 *
 * Ingested chunk by chunk (`onLogs`) rather than in one pass over `scan.logs` at the end: the pools
 * a long scan finds are worth having in the index the moment they are known, because the pump runs
 * alongside and can only price what the index holds. `upsert` is idempotent, so nothing here depends
 * on a chunk being delivered exactly once.
 */
async function runPairScan(env: ScanEnv, plan: ExactPairPlan, ranges: BlockRange[]): Promise<BlockRange[]> {
  const covered: BlockRange[] = []
  for (const range of headBackward(ranges)) {
    if (env.signal?.aborted) break
    const scan = await scanLogs(env.client, plan.query, range, {
      ...scanOpts(env),
      onLogs: (logs) => ingestLogs(env, plan.module_, logs),
    })
    for (const c of scan.covered) env.index.addCoverage('v4', plan.scope, c)
    covered.push(...scan.covered)
    if (scan.covered.length > 0) env.progress(0)
  }
  return mergeRanges(covered)
}

/**
 * Scans every enabled protocol's creation events for pools touching the demanded endpoints, over the
 * ranges those scopes still want, and returns what each scope may claim.
 *
 * ONE REQUEST CHAIN ANSWERS SEVERAL (protocol, endpoint) SCOPES AT ONCE (C5-C). `eth_getLogs` takes
 * an address array and OR-matches an array within one topic position, so v2's and v3's factories —
 * whose creation events index the pair at the same two topic slots — and both of the trade's
 * endpoints ride in a single filter. What used to be twelve chains (3 protocols x 2 endpoints x 2
 * token slots) is four: [v2+v3, both endpoints, slot A], [v2+v3, both endpoints, slot B], and the
 * same pair for v4, whose currencies sit one slot deeper behind the pool-id topic.
 *
 * FOUR IS THE SAME-FLOOR COUNT; A COLD MAINNET SEARCH PAYS SIX. Where v2 and v3 deployed apart, the
 * stretch below v3's block is a segment only v2 may be asked about, so the slot-1 group emits two
 * scan pairs rather than one (mainnet's gap is ~2.4M blocks). That is the planner refusing to floor
 * a merge at the later deployment — see `adjacencyPlan.ts` for why the alternative silently loses
 * pools. A chain whose factories launched together never pays it, and a warm search pays it only for
 * the blocks still uncovered.
 *
 * Measured live on mainnet: v2+v3 merged is one 49ms request against 134ms for the two it replaces,
 * returning exactly the union of their logs (29 + 3 = 32, checked for set equality — the check the
 * canary suite now repeats against every provider).
 *
 * WHICH SCOPES SHARE WHICH REQUEST OVER WHICH BLOCKS IS NOT DECIDED HERE. `adjacencyPlan.ts` owns
 * that, and it is pure: differing deployment floors (v2 predates v3) and differing cache states (one
 * endpoint warm, one cold) mean a merge is only legal over the blocks every constituent still wants,
 * with the remainders scanned narrower. This function does the I/O and the bookkeeping.
 *
 * The plan's scans run concurrently — a pass costs one scan chain's latency, not twelve. The
 * uncovered RANGES within one query stay sequential, because each is handed to `scanLogs` in turn
 * and that call adapts its window to the provider's cap as it goes; the CHUNKS inside one such call
 * are not (P1 — `scanLogs` dispatches up to `SCAN_CHUNK_CONCURRENCY` of them at once once it has
 * learned a width the endpoint will serve), so this fan-out multiplies with that one under the
 * router's shared semaphore. See `constants.ts#SCAN_CHUNK_CONCURRENCY`.
 *
 * NO RUNTIME FALLBACK TO PER-PROTOCOL QUERIES, DELIBERATELY. Address arrays and OR-topics are core
 * `eth_getLogs`, not an extension, and a runtime "did this provider mishandle the merge?" check is
 * unanswerable in general — the wrong answer is a SILENTLY SMALLER log set, which looks exactly like
 * a chain with fewer pools. So the check lives where it can be conclusive: the canary suite's
 * merged-vs-union set-equality row, run against every real provider the repo is pointed at. If a
 * provider ever fails it, the escape hatch to add is a manifest/router flag that stops the planner
 * from merging (the planner would emit one scan per scope — the same construction with one-element
 * arrays), not a heuristic in this path.
 */
async function runAdjacencyScans(
  env: ScanEnv,
  demands: ScopeDemand[],
  byEmitter: Map<string, ProtocolModule>,
): Promise<Map<string, BlockRange[]>> {
  const opts = scanOpts(env)
  const covered = new Map<string, BlockRange[]>()
  await Promise.all(
    planAdjacencyScans(demands).map(async (scan) => {
      const ranges = headBackward(scan.ranges)
      const perQuery = await Promise.all(
        scan.queries.map(async (query) => {
          const acc: BlockRange[] = []
          for (const range of ranges) {
            if (env.signal?.aborted) break
            // Chunk-by-chunk ingestion (see `runPairScan`): an adjacency scan is the longest thing
            // the engine does, and holding its pools back until the last chunk landed is what made a
            // cut-short pass worth nothing at all.
            const result = await scanLogs(env.client, query, range, { ...opts, onLogs: (logs) => ingestMerged(env, byEmitter, logs) })
            acc.push(...result.covered)
          }
          return mergeRanges(acc)
        }),
      )
      // A range is covered for these scopes only where BOTH topic-slot filters covered it — a pool
      // whose creation event put the endpoint in the other slot would be missed otherwise.
      const shared = intersectAll(perQuery)
      if (shared.length === 0) return
      for (const scope of scan.covers) {
        const key = scopeKey(scope)
        covered.set(key, [...(covered.get(key) ?? []), ...shared])
      }
    }),
  )
  return covered
}

/**
 * Scans a factory's own fee-enablement history and caches the tiers on the index. A module's
 * `hypotheses` can only enumerate the tiers it knows statically (v3's four genesis tiers), so a
 * governance-enabled tier is invisible to the whole search until this runs — and it is exactly the
 * kind of tier a long-tail pair is deployed on. The scan is topic-narrow, factory-wide, and keyed in
 * the coverage cache by the factory address, so a second search at a later block re-scans only the
 * block delta (plus the standing reorg overlap), never the full history.
 *
 * A GROWN FEE SET IS NEW KNOWLEDGE, exactly like a new pool: it makes new pool identities derivable,
 * so it reports `progress` and the worker bumps `indexVersion` for it. `addEnabledFees` returns
 * void, so growth is detected by comparing the set's size across the call.
 *
 * There is no per-call request budget here: every scope converges concurrently, metered by the
 * shared semaphore and `scanLogs`' own per-scan budget, so a full-history fee scan cannot starve
 * the adjacency scans by running ahead of them in a serial order.
 */
async function runFeeScan(
  env: ScanEnv,
  module_: ProtocolModule,
  feeDiscovery: FeeDiscovery,
  ranges: BlockRange[],
): Promise<BlockRange[]> {
  const query = feeDiscovery.query(env.manifest)
  const factory = query.address
  const opts = scanOpts(env)
  const covered: BlockRange[] = []
  for (const range of headBackward(ranges)) {
    if (env.signal?.aborted) break
    const scan = await scanLogs(env.client, query, range, opts)
    const before = env.index.enabledFees(module_.id, factory).length
    env.index.addEnabledFees(module_.id, factory, feeDiscovery.feesFromLogs(scan.logs, env.manifest))
    const grew = env.index.enabledFees(module_.id, factory).length > before
    for (const c of scan.covered) env.index.addCoverage(module_.id, factory, c)
    covered.push(...scan.covered)
    if (grew || scan.covered.length > 0) env.progress(grew ? 1 : 0)
  }
  return mergeRanges(covered)
}

// ---------------------------------------------------------------------------
// The worker
// ---------------------------------------------------------------------------

/**
 * One coverage scope: what the index's coverage cache is keyed at, plus everything needed to scan
 * it. The three kinds differ only in how they are scanned; demand, bookkeeping and settlement treat
 * them identically, which is what makes "all scopes converge concurrently" a shape rather than a
 * schedule.
 */
type WorkerScope = { protocol: Protocol; scope: string; floor: bigint } & (
  | { kind: 'adjacency'; endpoint: Address; shape: AdjacencyShape; module_: ProtocolModule }
  | { kind: 'pair'; plan: ExactPairPlan }
  | { kind: 'fee'; module_: ProtocolModule; feeDiscovery: FeeDiscovery }
)

/** The same key space `adjacencyPlan.ts#scopeKey` uses, widened to the pair and fee scopes. */
function coverageKey(s: WorkerScope): string {
  return `${s.protocol}:${s.scope.toLowerCase()}`
}

/** Resolves when `signal` aborts — the other half of every wait this worker does. */
function aborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise<void>((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

export class CoverageWorker {
  private readonly ctx: CoverageCtx
  private readonly state: SearchState
  private readonly env: ScanEnv
  /** Fixed for the search: the manifest, the enabled modules and the trade's endpoints do not move. */
  private readonly scopes: WorkerScope[]
  /** Blocks THIS search has actually covered, per scope — never blocks it merely asked about, so a
   * range a pass failed on is still retried by the next one. */
  private readonly attempted = new Map<string, BlockRange[]>()
  /** The eager half of the gate. The full half is `state.gateOpened`, so demand really is a function
   * of state rather than of two flags that could disagree. */
  private eager = false
  /** Verdicts already applied, so a worker that settles twice (pre-gate, then post-gate) appends one
   * outcome per real transition rather than one per settle. `applyCoverage` is idempotent for the
   * STATE either way; this is about the outcome log golden replays are built from. */
  private readonly reported = new Set<string>()
  /** Poked when demand widens — the only thing that re-arms a settled `run()`. Its own private
   * notifier, NOT the search's `wake`: this is the worker's internal demand-widened channel, and
   * poking the search for it would cost a full loop cycle per widening for nothing. */
  private readonly widened: Notifier
  /**
   * Bumped by every widening. A pass SNAPSHOTS it and a zero-progress pass compares before it
   * reports: demand that widened while the pass was in flight makes that pass's verdict describe a
   * question nobody is asking any more, and settling on it would mark every newly-demanded scope
   * `failed` without ever having asked the provider about it.
   */
  private demandEpoch = 0

  constructor(ctx: CoverageCtx, state: SearchState, req: Pick<QuoteRequest, 'tokenIn' | 'tokenOut'>) {
    this.ctx = ctx
    this.state = state
    this.env = {
      index: ctx.index,
      modules: ctx.modules,
      manifest: ctx.manifest,
      client: ctx.client,
      head: ctx.head,
      semaphore: ctx.semaphore,
      logChunkBlocks: ctx.logChunkBlocks,
      scanSleep: ctx.scanSleep,
      // NEW KNOWLEDGE MOVES BOTH OF THE PUMP'S CURSORS. `indexVersion` is what makes it re-plan (it
      // early-exits on an unchanged one), and `wake` is what gives it the chance to; a poke with
      // nothing behind it costs one O(1) cycle, a missing poke costs the pools this scan just paid
      // for.
      progress: (gained: number) => {
        if (gained > 0) state.indexVersion++
        ctx.wake.poke()
      },
    }
    this.widened = createNotifier()
    this.scopes = this.buildScopes(req)
  }

  /** The exact-pair scope's recent week only. Idempotent; the first call arms the pre-gate demand. */
  demandEager(): void {
    if (this.eager) return
    this.eager = true
    this.demandEpoch++
    this.widened.poke()
  }

  /**
   * THE GATE: every scope's full `[deployBlock, head]`. Idempotent, and it re-arms a `run()` that
   * already settled against the narrower demand — convergence is against CURRENT demand, not the
   * demand at launch.
   */
  demandFull(): void {
    if (this.state.gateOpened) return
    this.state.gateOpened = true
    this.demandEpoch++
    this.widened.poke()
  }

  /** True when everything the CURRENT demand asks for is covered. Pre-gate that is a real answer, not
   * a completeness claim: the limit demand is what the report is judged against. */
  converged(): boolean {
    return this.scopes.every((s) => this.wanted(s, this.demandOf(s)).length === 0)
  }

  /**
   * The source. One launched loop: pass while the previous pass made progress; when a pass makes
   * none — because everything demanded is covered, or because the provider starved what is left —
   * report, then settle. It resolves only when no further demand can arrive (the gate has opened) or
   * the signal aborts; otherwise it waits for `demandEager`/`demandFull` to widen demand and passes
   * again.
   *
   * TERMINATION is structural: `attempted` only grows and is bounded by `[floor, head]`, and a pass
   * counts as progress only when it covered blocks not already in it — so the number of passes is
   * bounded by the number of distinct block ranges the provider can hand over (plus one per
   * widening, which happens at most twice).
   *
   * THE SIGNAL ARRIVES WITH THE LAUNCH, NOT WITH CONSTRUCTION: the worker is built when the search
   * builds its state and launched by the `SourceSet` that owns its lifetime, so `env.signal` is set
   * here. Without this every `env.signal?.aborted` break below, and `scanOpts`' pass-through into
   * `scanLogs`, is dead code — an abandoned iterator would keep the whole walk going.
   */
  async run(signal: AbortSignal): Promise<void> {
    this.env.signal = signal
    const abort = aborted(signal)
    while (!signal.aborted && !this.state.aborted) {
      const epoch = this.demandEpoch
      if (await this.pass()) continue
      if (signal.aborted || this.state.aborted) return
      // Demand widened mid-pass: pass again against the wider demand rather than settling on a
      // verdict about the narrower one. Checked AFTER the abort guard, so an aborted search still
      // reports nothing.
      if (this.demandEpoch !== epoch) continue
      this.report()
      // Once the gate is open, demand can never widen again — nothing could wake this loop, so the
      // source is genuinely finished.
      if (this.state.gateOpened) return
      await Promise.race([this.widened.next(), abort])
    }
  }

  // -------------------------------------------------------------------------
  // Demand
  // -------------------------------------------------------------------------

  private buildScopes(req: Pick<QuoteRequest, 'tokenIn' | 'tokenOut'>): WorkerScope[] {
    const manifest = this.ctx.manifest
    const endpoints = [
      ...new Set([toGraphNode(req.tokenIn, manifest.wrappedNative), toGraphNode(req.tokenOut, manifest.wrappedNative)]),
    ]
    const scopes: WorkerScope[] = []
    for (const module_ of enabledModules(this.env)) {
      const floor = deploymentBlockOf(manifest, module_.id)
      if (floor === undefined) continue
      const shape = module_.adjacencyShape(manifest)
      if (shape) {
        for (const endpoint of endpoints) {
          scopes.push({ kind: 'adjacency', protocol: module_.id, scope: endpoint, floor, endpoint, shape, module_ })
        }
      }
      const feeDiscovery = module_.feeDiscovery
      if (feeDiscovery) {
        scopes.push({ kind: 'fee', protocol: module_.id, scope: feeDiscovery.query(manifest).address, floor, module_, feeDiscovery })
      }
    }
    const plan = exactPairPlan(this.env, req)
    if (plan) scopes.push({ kind: 'pair', protocol: 'v4', scope: plan.scope, floor: plan.deployBlock, plan })
    return scopes
  }

  /** Demand: a pure function of (scope, gate state). */
  private demandOf(s: WorkerScope): BlockRange[] {
    if (this.state.gateOpened) return this.limitOf(s)
    if (!this.eager || s.kind !== 'pair') return []
    // Today's `WAVE0_RECENT_WINDOW_SECONDS`, surviving as this eager slice: how far back one week of
    // this chain's own blocks reaches (`manifest.ts#wave0PairScanBlocks`).
    const window = wave0PairScanBlocks(this.ctx.manifest)
    return [{ fromBlock: maxBig(s.floor, this.ctx.head - window + 1n), toBlock: this.ctx.head }]
  }

  /** The limit demand — the deployment floors, which is what completeness is judged against. */
  private limitOf(s: WorkerScope): BlockRange[] {
    return [{ fromBlock: s.floor, toBlock: this.ctx.head }]
  }

  /** `demand − index coverage − what this search already covered`. */
  private wanted(s: WorkerScope, demand: BlockRange[]): BlockRange[] {
    if (demand.length === 0) return []
    const uncovered = this.ctx.index.uncovered(s.protocol, s.scope, s.floor, this.ctx.head)
    return subtractRanges(intersectRanges(uncovered, demand), this.attempted.get(coverageKey(s)) ?? [])
  }

  // -------------------------------------------------------------------------
  // One pass
  // -------------------------------------------------------------------------

  /** Every scope's scans, concurrently — the semaphore is the meter, not a wave order. */
  private async pass(): Promise<boolean> {
    const passes = await Promise.all([this.adjacencyPass(), this.pairPass(), this.feePass()])
    return passes.some((progressed) => progressed)
  }

  /**
   * Records what a scope covered and answers whether any of it was NEW. Only covered blocks go in,
   * which is what leaves a failed range on the books for the next pass.
   */
  private record(s: WorkerScope, got: BlockRange[]): boolean {
    if (got.length === 0) return false
    const key = coverageKey(s)
    const previous = this.attempted.get(key) ?? []
    this.attempted.set(key, mergeRanges([...previous, ...got]))
    return subtractRanges(got, previous).length > 0
  }

  private async adjacencyPass(): Promise<boolean> {
    const scopes = this.scopes.filter((s): s is WorkerScope & { kind: 'adjacency' } => s.kind === 'adjacency')
    if (scopes.length === 0) return false

    const byEmitter = new Map<string, ProtocolModule>()
    const demands: ScopeDemand[] = scopes.map((s) => {
      byEmitter.set(s.shape.emitter.toLowerCase(), s.module_)
      return { protocol: s.protocol, endpoint: s.endpoint, shape: s.shape, uncovered: this.wanted(s, this.demandOf(s)) }
    })
    if (demands.every((d) => d.uncovered.length === 0)) return false

    const covered = await runAdjacencyScans(this.env, demands, byEmitter)

    let progressed = false
    for (const s of scopes) {
      // The CROSS PRODUCT, not just the scopes that asked: a merged query built for {(v2,A),(v3,B)}
      // really does match every (v2,B) and (v3,A) log in its range, so claiming those too is honest
      // bookkeeping rather than a widening (see `adjacencyPlan.ts`).
      const got = mergeRanges(covered.get(coverageKey(s)) ?? [])
      for (const range of got) this.ctx.index.addCoverage(s.protocol, s.scope, range)
      if (this.record(s, got)) progressed = true
    }
    if (progressed) this.env.progress(0)
    return progressed
  }

  private async pairPass(): Promise<boolean> {
    const scope = this.scopes.find((s): s is WorkerScope & { kind: 'pair' } => s.kind === 'pair')
    if (!scope) return false
    const ranges = this.wanted(scope, this.demandOf(scope))
    if (ranges.length === 0) return false
    return this.record(scope, await runPairScan(this.env, scope.plan, ranges))
  }

  private async feePass(): Promise<boolean> {
    const scopes = this.scopes.filter((s): s is WorkerScope & { kind: 'fee' } => s.kind === 'fee')
    const passes = await Promise.all(
      scopes.map(async (s) => {
        const ranges = this.wanted(s, this.demandOf(s))
        if (ranges.length === 0) return false
        return this.record(s, await runFeeScan(this.env, s.module_, s.feeDiscovery, ranges))
      }),
    )
    return passes.some((progressed) => progressed)
  }

  // -------------------------------------------------------------------------
  // Settlement
  // -------------------------------------------------------------------------

  /**
   * What the settled worker can honestly say, judged against the LIMIT demand (spec §3.3):
   *
   *   * `complete` — this scope is covered to its deployment floor. Reported per (protocol,
   *     endpoint), because that is the granularity the report reads: `discoveryStatus` calls a
   *     protocol complete only once BOTH of the trade's endpoints are in the set. The pair and fee
   *     scopes have no endpoint of their own and so complete nothing on their own.
   *   * `failed` — this scope still wanted blocks under the CURRENT demand and the pass covered
   *     none of them. That is a source failure, and it is protocol-wide (`state.discovery[p].failed`)
   *     for the adjacency and pair scopes, which are the scopes whose gaps can hide pools this trade
   *     needs.
   *
   * A STARVED FEE SCOPE IS DELIBERATELY NOT A DISCOVERY FAILURE. Fee-enablement history only widens
   * the HYPOTHESIS set (extra derivable v3 tiers); it never carries a creation event, so a pool on a
   * governance-enabled tier is still surfaced by the adjacency/pair scans whenever it exists — and
   * marking `discovery[p].failed` for a wholesale-refused fee scan would demote a search whose
   * creation-event coverage is genuinely complete from an authoritative verdict to a permanent
   * `inconclusive`. When the provider starves everything, the adjacency scopes starve too and carry
   * the axis; when it starves only the topic-narrow fee scan, exhaustiveness is honestly intact.
   *
   * A pre-gate settle is NEITHER verdict: the eager slice being covered is not completeness (the
   * limit demand is untouched), and a scope with no demand yet was not starved. It is just
   * settled-for-now, waiting for the gate.
   *
   * An abort is reported on its own axis and must never be blamed on the provider, so a search that
   * pulled the plug reports nothing here (`run` returns before this on an aborted signal).
   */
  private report(): void {
    for (const s of this.scopes) {
      const key = coverageKey(s)
      if (this.wanted(s, this.limitOf(s)).length === 0) {
        if (s.kind !== 'adjacency' || this.reported.has(`complete:${key}`)) continue
        this.reported.add(`complete:${key}`)
        applyCoverage(this.state, s.protocol, s.endpoint.toLowerCase(), { kind: 'complete' })
      } else if (s.kind !== 'fee' && this.wanted(s, this.demandOf(s)).length > 0 && !this.reported.has(`failed:${key}`)) {
        this.reported.add(`failed:${key}`)
        applyCoverage(this.state, s.protocol, s.scope.toLowerCase(), { kind: 'failed' })
      }
    }
  }
}

