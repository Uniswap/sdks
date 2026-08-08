import type { Log } from 'viem'

import { scanLogs } from '../internal/logScan'
import type { ScanWidthMemory } from '../internal/logScan'
import { intersectAll, intersectRanges, maxBig, mergeRanges, subtractRanges } from '../internal/ranges'
import type { Semaphore } from '../internal/rpc'
import type { ProtocolModule } from '../protocols/types'
import type { BlockRange, CurrencyRef, LogQuery } from '../types'

import { deploymentBlockOf, enabledModules, node } from './context'
import type { Run } from './waves'

// ---------------------------------------------------------------------------
// Discovery: the engine's scan orchestration — what to ask the log stream for,
// over which block ranges, and what to fold back into the index and the run's
// coverage bookkeeping.
//
// No policy lives here, and that is now structural rather than aspirational.
// Which scan runs in which wave, how far back wave 0's pair scan reaches, and
// how many requests a fee-tier scan may spend are all DECIDED in `waves.ts`
// and arrive here as parameters (`{ window }`, `{ maxRequests }`); these
// functions only know how to carry a scan out incrementally, honour a bound
// they were handed, and record honestly what they covered. They take the whole
// `Run` because a scan writes to the shared index AND to the run's
// per-protocol discovery state, which the report then reads.
//
// Every scan here is bounded by the index's coverage cache (`uncovered`), so a
// warm router re-scans only the block delta plus the standing reorg overlap.
// Nothing throws for a provider failure: `scanLogs` returns what it managed to
// cover, and an endpoint that covered nothing is recorded as `failed` rather
// than raised.
//
// Scanning, and only scanning. The three shared context accessors this file
// used to host for lack of anywhere better (`deploymentBlockOf`,
// `enabledModules`, `node`) are in `context.ts` now.
// ---------------------------------------------------------------------------

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
  sleep?: ((ms: number) => Promise<void>) | undefined
} {
  return {
    ...(run.req.signal !== undefined && { signal: run.req.signal }),
    semaphore: run.ctx.semaphore,
    initialChunk: run.ctx.logChunkBlocks,
    // The retry-backoff clock, when the caller injected one (`SearchContext.scanSleep`). Absent —
    // which is every real search — `scanLogs` uses its own `delay`, unchanged.
    sleep: run.ctx.scanSleep,
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
 * A leading slice of that scan: the most recent `window` blocks of the pair's history only,
 * clamped to the v4 deployment block. Whatever is left is completed by {@link completeExactPairScan}.
 *
 * `window` is a PARAMETER, not a constant read here: how far back a wave is willing to look is the
 * wave engine's call, and only it knows which wave is running and what latency that wave owes the
 * caller. See `waves.ts#wave0`'s call site for the window it passes and why.
 */
export async function scanExactPairRecent(run: Run, opts: { window: bigint }): Promise<void> {
  const plan = exactPairPlan(run)
  if (!plan) return
  const head = run.state.block.number
  const windowStart = maxBig(plan.deployBlock, head - opts.window + 1n)
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
 *
 * `maxRequests` is a PARAMETER, for the same reason {@link scanExactPairRecent}'s window is: this
 * is a full-history scan, and whether a full history is affordable depends entirely on which wave is
 * paying for it and what else that wave still owes the caller. See `waves.ts#wave1`'s call site for
 * the budget it passes and why there is one at all.
 */
export async function discoverFeeTiers(run: Run, module_: ProtocolModule, opts: { maxRequests: number }): Promise<void> {
  const { ctx, req, state } = run
  const feeDiscovery = module_.feeDiscovery
  const deployBlock = deploymentBlockOf(ctx.manifest, module_.id)
  if (!feeDiscovery || deployBlock === undefined) return

  const query = feeDiscovery.query(ctx.manifest)
  const factory = query.address
  const ranges = ctx.index.uncovered(module_.id, factory, deployBlock, state.block.number)

  // HOW THE HANDED-DOWN BUDGET IS HONOURED: it spans THIS CALL, not each range, which is the
  // difference between a bound and a multiplier. A warm index's `uncovered` is two ranges (the
  // unscanned gap, plus the re-opened reorg tail), so a per-range budget quietly bought twice what
  // the caller asked for — and on the warm Base run that was the whole 60s, with the adjacency
  // waves starved exactly as if there had been no bound at all.
  //
  // The shortfall is carried, not lost: coverage is keyed by factory, so the next search resumes
  // from where this one stopped instead of re-walking, and `speculativeDirect` probes the standard
  // tiers on every search regardless of what this has reached.
  const scanOptions = scanOpts(run)
  let spent = 0
  for (const range of ranges) {
    if (req.signal?.aborted) return
    const remaining = opts.maxRequests - spent
    if (remaining <= 0) return
    const scan = await scanLogs(ctx.client, query, range, { ...scanOptions, maxRequests: remaining })
    spent += scan.requests
    ctx.index.addEnabledFees(module_.id, factory, feeDiscovery.feesFromLogs(scan.logs, ctx.manifest))
    for (const covered of scan.covered) ctx.index.addCoverage(module_.id, factory, covered)
  }
}
