import type { Address, Log } from 'viem'

import { FEE_DISCOVERY_MAX_REQUESTS } from '../constants'
import { toGraphNode } from '../internal/currency'
import { scanLogs } from '../internal/logScan'
import type { ScanWidthMemory } from '../internal/logScan'
import { intersectAll, intersectRanges, maxBig, mergeRanges, subtractRanges } from '../internal/ranges'
import type { Semaphore } from '../internal/rpc'
import { wave0PairScanBlocks } from '../manifest'
import type { ProtocolModule } from '../protocols/types'
import type { BlockRange, ChainManifest, CurrencyRef, LogQuery, Protocol } from '../types'
import { PROTOCOLS } from '../types'

import type { Run, SearchContext } from './waves'

// ---------------------------------------------------------------------------
// Discovery: the engine's scan orchestration — what to ask the log stream for,
// over which block ranges, and what to fold back into the index and the run's
// coverage bookkeeping.
//
// No policy lives here. Which scan runs in which wave (and therefore what the
// caller waits for) is decided in `waves.ts`; these functions only know how to
// carry a scan out incrementally and record honestly what it covered. They
// take the whole `Run` because a scan writes to the shared index AND to the
// run's per-protocol discovery state, which the report then reads.
//
// Every scan here is bounded by the index's coverage cache (`uncovered`), so a
// warm router re-scans only the block delta plus the standing reorg overlap.
// Nothing throws for a provider failure: `scanLogs` returns what it managed to
// cover, and an endpoint that covered nothing is recorded as `failed` rather
// than raised.
//
// The three one-line context accessors below (`deploymentBlockOf`,
// `enabledModules`, `node`) live here because scanning is their heaviest user
// and because a scan module may not import values from `waves.ts` without
// making the engine's module graph cyclic — `waves.ts` and `report.ts` import
// them from here, and the only thing this file takes from `waves.ts` is types.
// ---------------------------------------------------------------------------

export function deploymentBlockOf(m: ChainManifest, p: Protocol): bigint | undefined {
  if (p === 'v2') return m.v2?.deploymentBlock
  if (p === 'v3') return m.v3?.deploymentBlock
  return m.v4?.deploymentBlock
}

export function enabledModules(ctx: SearchContext): ProtocolModule[] {
  return PROTOCOLS.map((p) => ctx.modules[p]).filter((m) => m.enabled(ctx.manifest))
}

export function node(c: CurrencyRef, m: ChainManifest): Address {
  return toGraphNode(c, m.wrappedNative)
}

export function ingestLogs(run: Run, module_: ProtocolModule, logs: Log[]): void {
  for (const log of logs) {
    const record = module_.parsePoolLog(log, run.ctx.manifest)
    if (record) run.ctx.index.upsert(record)
  }
}

/**
 * The v4 exact-pair `Initialize` scan, which lives in its own pair-scoped coverage namespace.
 *
 * The scope is the whole point: "every pool holding exactly (A,B)" is strictly narrower than "every
 * pool touching A", so this scan can neither claim adjacency coverage (a later adjacency wave would
 * then skip real work) nor be bounded by it. Its own key is what makes it *incremental* — a warm
 * router re-running the same request re-scans only the block delta plus the reorg overlap, instead
 * of the entire v4 history every single time.
 */
export type ExactPairPlan = { module_: ProtocolModule; query: LogQuery; scope: string; deployBlock: bigint }

export function exactPairPlan(run: Run): ExactPairPlan | undefined {
  const { ctx, req } = run
  const module_ = ctx.modules.v4
  const v4 = ctx.manifest.v4
  if (!v4 || !module_.enabled(ctx.manifest) || !module_.exactPair) return undefined
  return {
    module_,
    query: module_.exactPair(req.tokenIn, req.tokenOut, ctx.manifest),
    scope: ctx.index.pairScope(req.tokenIn, req.tokenOut),
    deployBlock: v4.deploymentBlock,
  }
}

/**
 * The concurrency-throttling half of every `scanLogs` call in this file — the router's global
 * semaphore and `logChunkBlocks` override, threaded from `ctx` (C4-P6) — merged with `signal` so
 * every scan a search issues shares the exact same options shape. `semaphore`/`initialChunk` are
 * declared `| undefined` on `scanLogs`'s own opts, so passing `ctx`'s possibly-absent values through
 * directly (rather than the `signal`-style conditional spread) is not an `exactOptionalPropertyTypes`
 * violation — both sides agree an explicit `undefined` is a legal, meaningful "no override".
 */
function scanOpts(run: Run): {
  signal?: AbortSignal
  semaphore?: Semaphore | undefined
  initialChunk?: bigint | undefined
  widthMemory?: ScanWidthMemory | undefined
} {
  return {
    ...(run.req.signal !== undefined && { signal: run.req.signal }),
    semaphore: run.ctx.semaphore,
    initialChunk: run.ctx.logChunkBlocks,
    // The index's own scan-width memory, by reference (`PoolIndex.scanWidth`). This is the seam that
    // makes the width descent a per-endpoint cost instead of a per-scan one: a cold search here runs
    // SEVEN scans — three protocols x two topic-slot adjacency queries, plus the v4 exact-pair scan —
    // and each of them used to halve its way down from `MAX_SCAN_WINDOW` to rediscover the same
    // provider cap the previous one had just found. Threaded from the INDEX rather than from a field
    // on `SearchContext` because the index is what already outlives the search (and what `cli/`
    // snapshots to disk), so the memory reaches the next search and the next process for free.
    widthMemory: run.ctx.index.scanWidth(),
  }
}

export async function runPairScan(run: Run, plan: ExactPairPlan, ranges: BlockRange[]): Promise<void> {
  const { ctx, req, state } = run
  for (const range of ranges) {
    if (req.signal?.aborted) return
    state.pairScanned.push(range)
    // Ingested chunk by chunk (`onLogs`) rather than in one pass over `scan.logs` at the end: the
    // pools a long scan finds are worth having in the index the moment they are known, because
    // `waves.ts#quoteWhileDiscovering` is running alongside and can only price what the index holds.
    // `upsert` is idempotent, so nothing here depends on a chunk being delivered exactly once.
    const scan = await scanLogs(ctx.client, plan.query, range, {
      ...scanOpts(run),
      onLogs: (logs) => ingestLogs(run, plan.module_, logs),
    })
    for (const covered of scan.covered) ctx.index.addCoverage('v4', plan.scope, covered)
  }
}

/**
 * Wave 0's slice of that scan: the most recent {@link wave0PairScanBlocks} only. Wave 0 is a latency
 * budget, and on a cold mainnet index the full v4 history is millions of blocks — hundreds of
 * sequential chunked `eth_getLogs` before anything could be yielded, which is not what "hints and
 * probes in one round trip" means. The recent window is precisely the case wave 0 exists for: a
 * pool created minutes ago, with the caller waiting. The rest is completed below.
 *
 * The window is DERIVED FROM THE MANIFEST, not a constant (C4-P1): the policy is "roughly the last
 * week", and only this chain's block time turns that into a block count. A fixed block count would
 * mean a week on mainnet and a day on Base for the same code — see
 * `constants.ts#WAVE0_RECENT_WINDOW_SECONDS`.
 */
export async function scanExactPairRecent(run: Run): Promise<void> {
  const plan = exactPairPlan(run)
  if (!plan) return
  const head = run.state.block.number
  const windowStart = maxBig(plan.deployBlock, head - wave0PairScanBlocks(run.ctx.manifest) + 1n)
  const uncovered = run.ctx.index.uncovered('v4', plan.scope, plan.deployBlock, head)
  await runPairScan(run, plan, intersectRanges(uncovered, [{ fromBlock: windowStart, toBlock: head }]))
}

/** The pair's remaining history, completed in the scan-bound waves alongside adjacency. */
export async function completeExactPairScan(run: Run): Promise<void> {
  const plan = exactPairPlan(run)
  if (!plan) return
  const uncovered = run.ctx.index.uncovered('v4', plan.scope, plan.deployBlock, run.state.block.number)
  await runPairScan(run, plan, subtractRanges(uncovered, run.state.pairScanned))
}

/**
 * Scans every enabled protocol's creation events for pools touching `endpoint`, over the ranges the
 * index has not already covered, and folds both the pools and the coverage back in.
 *
 * Protocols and topic-position queries are independent scans against independent contracts, so they
 * all run concurrently — an adjacency wave costs one scan chain's latency, not six. The uncovered
 * RANGES within one query stay sequential here, because each is handed to `scanLogs` in turn and
 * that call adapts its window to the provider's cap as it goes; the CHUNKS inside one such call are
 * not (P1 — `scanLogs` dispatches up to `SCAN_CHUNK_CONCURRENCY` of them at once once it has learned
 * a width the endpoint will serve), so this fan-out multiplies with that one under the router's
 * shared semaphore. See `constants.ts#SCAN_CHUNK_CONCURRENCY` for why that product is deliberately
 * kept near the semaphore's own size rather than far above it.
 */
export async function scanAdjacency(run: Run, endpoint: CurrencyRef): Promise<void> {
  const { ctx, req, state } = run
  const endpointNode = node(endpoint, ctx.manifest)
  const opts = scanOpts(run)

  await Promise.all(
    enabledModules(ctx).map(async (module_) => {
      const deployBlock = deploymentBlockOf(ctx.manifest, module_.id)
      if (deployBlock === undefined) return
      const queries = module_.adjacency(endpointNode, ctx.manifest)
      if (queries.length === 0) return

      const discovery = state.discovery[module_.id]
      const ranges = ctx.index.uncovered(module_.id, endpointNode, deployBlock, state.block.number)
      if (ranges.length === 0) {
        discovery.complete.add(endpointNode)
        return
      }

      let complete = true
      const perQuery = await Promise.all(
        queries.map(async (query) => {
          const covered: BlockRange[] = []
          for (const range of ranges) {
            if (req.signal?.aborted) {
              complete = false
              break
            }
            // Chunk-by-chunk ingestion (see `runPairScan`): an adjacency scan is the longest thing
            // the engine does, and holding its pools back until the last chunk landed is what made a
            // budget-expired wave 2 worth nothing at all.
            const scan = await scanLogs(ctx.client, query, range, { ...opts, onLogs: (logs) => ingestLogs(run, module_, logs) })
            covered.push(...scan.covered)
            if (!scan.complete) complete = false
          }
          return mergeRanges(covered)
        }),
      )

      const shared = intersectAll(perQuery)
      for (const range of shared) ctx.index.addCoverage(module_.id, endpointNode, range)
      discovery.covered.push(...shared)
      // Covering nothing at all is a source failure — unless the caller pulled the plug, which is
      // reported on its own axis (`aborted`) and must not be blamed on the provider.
      if (shared.length === 0 && !req.signal?.aborted) discovery.failed = true
      if (complete) discovery.complete.add(endpointNode)
    }),
  )
}

/**
 * Scans a factory's own fee-enablement history once and caches the tiers on the index. A module's
 * `speculativeDirect` can only probe the tiers it knows statically (v3's four genesis tiers), so a
 * governance-enabled tier is invisible to the whole search until this runs — and it is exactly the
 * kind of tier a long-tail pair is deployed on. The scan is topic-narrow, factory-wide, and keyed in
 * the coverage cache by the factory address, so a second search at a later block re-scans only the
 * block delta (plus the standing reorg overlap), never the full history.
 */
export async function discoverFeeTiers(run: Run, module_: ProtocolModule): Promise<void> {
  const { ctx, req, state } = run
  const feeDiscovery = module_.feeDiscovery
  const deployBlock = deploymentBlockOf(ctx.manifest, module_.id)
  if (!feeDiscovery || deployBlock === undefined) return

  const query = feeDiscovery.query(ctx.manifest)
  const factory = query.address
  const ranges = ctx.index.uncovered(module_.id, factory, deployBlock, state.block.number)

  // BUDGETED, unlike every other scan in this file, because of where it runs rather than what it
  // costs. It is a FULL-HISTORY scan sitting in wave 1 — ahead of the adjacency scans in waves 2 and
  // 3, which are the ones the search reports coverage for and the ones a two-hop route depends on —
  // and a wave awaits everything in it. On a provider that serves wide windows the whole history is
  // a few requests and the budget never binds; on one that caps `eth_getLogs` at 10,000 blocks it is
  // thousands, and un-budgeted it consumed every remaining millisecond of a `--budget 60s` search,
  // so neither adjacency wave ever started and all three protocols reported "nothing covered yet".
  // See `constants.ts#FEE_DISCOVERY_MAX_REQUESTS` for the measurements and for why the bound is on
  // requests rather than on a recent block window (fee enablements are OLD — Base's newest is 29.8M
  // blocks back — so there is no window that is both small and where the answers are).
  //
  // The shortfall is carried, not lost: coverage is keyed by factory, so the next search resumes
  // from where this one stopped instead of re-walking, and `speculativeDirect` probes the standard
  // tiers on every search regardless of what this has reached.
  //
  // The budget spans THIS CALL, not each range, which is the difference between a bound and a
  // multiplier: a warm index's `uncovered` is two ranges (the unscanned gap, plus the re-opened
  // reorg tail), so a per-range budget quietly bought twice what it said — and on the warm Base run
  // that was the whole 60s again, with the adjacency waves starved exactly as before.
  const opts = scanOpts(run)
  let spent = 0
  for (const range of ranges) {
    if (req.signal?.aborted) return
    const remaining = FEE_DISCOVERY_MAX_REQUESTS - spent
    if (remaining <= 0) return
    const scan = await scanLogs(ctx.client, query, range, { ...opts, maxRequests: remaining })
    spent += scan.requests
    ctx.index.addEnabledFees(module_.id, factory, feeDiscovery.feesFromLogs(scan.logs, ctx.manifest))
    for (const covered of scan.covered) ctx.index.addCoverage(module_.id, factory, covered)
  }
}
