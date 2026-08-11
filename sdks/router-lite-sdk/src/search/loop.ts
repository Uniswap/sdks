import type { Address, Hex, PublicClient } from 'viem'

import { MAX_INTERMEDIATES, maxPlausibleHeadRegression } from '../constants'
import { RpcUnavailableError } from '../errors'
import type { Semaphore } from '../internal/rpc'
import { reorgOverlapBlocksOf, requireExecution } from '../manifest'
import type { PoolIndex } from '../pools/poolIndex'
import { routeId } from '../protocols'
import type { ProtocolModule } from '../protocols/types'
import type { BlockRef, ChainManifest, Protocol, QuoteRequest, RankedRoute, SearchReport, SwapRequest } from '../types'
import { checkReadiness } from '../verify/readiness'

import { CoverageWorker } from './coverage'
import { createNotifier, SourceSet } from './notify'
import { composeRoutes, orderedIntermediates, pump, pumpDry } from './pump'
import type { PumpCtx } from './pump'
import { buildReport } from './report'
import { applyAbort, applyReadiness, createState } from './state'
import type { SearchState } from './state'
import { pickLeader, Verifier, withExecution } from './verifier'

// ---------------------------------------------------------------------------
// THE SOLVER LOOP (spec §3.1) — the module that SEQUENCES the event-driven
// search and owns nothing else. Pricing lives in `pump.ts`, scanning in
// `coverage.ts`, simulation in `verifier.ts`, state in `state.ts`, report
// assembly in `report.ts`; this file decides only WHEN each of them runs.
//
// One cycle per wake: pump → consider → emit → terminate-or-widen. The
// notifier is the only wake mechanism (chunk arrivals, source settlements,
// preflight settlements, the caller's abort); it coalesces, and the pump
// early-exits when nothing moved, so a storm of wakes costs one O(1) pass.
//
// TWO ORDERING DECISIONS ARE LOAD-BEARING:
//
//  1. `verifier.consider()` runs every cycle BEFORE the termination check. A
//     preflight that settles as a transport loss leaves untried candidates on
//     the table; the consider that follows its wake is what dispatches the
//     next one, and a termination check that ran first would end the search
//     over a leader nobody has finished judging.
//  2. The gate opens only when the search is QUIET — pump dry AND readiness
//     settled AND the verifier idle — not merely when the pump is dry. "Cheap
//     information exhausted" (spec §2.3) includes the answers already in
//     flight: a hinted swap's preflight is one round trip from resolving, and
//     opening every scope's full history under it would bill the caller for
//     scans its answer never needed. This is the structural form of the
//     README's launcher promise — a hinted `getSwap` issues ZERO unbounded
//     log scans — and the loop.test.ts contract test counts the wire to hold
//     it.
//
// Pull-drivenness is the laziness contract: the generator suspends at every
// `yield`, so a consumer that stops pulling stops the frontier from widening
// (the gate check sits AFTER the yield in cycle order), and abandoning the
// iterator runs `finally`, which aborts every source.
//
// Nothing here throws for a business outcome. The single throw is
// `RpcUnavailableError` from the pinned-block fetch, before any source is
// launched; the facade maps it.
// ---------------------------------------------------------------------------

/** The client surface the engine needs: `request`, and nothing else. Every read the engine makes —
 * block header, pinned `eth_call`, `eth_getLogs` — goes through it, so a caller can satisfy the
 * whole engine with one function, and a test can observe every RPC in one place. */
type SearchClient = Pick<PublicClient, 'request'>

/**
 * The highest `latest` block any search on this router has pinned, carried ACROSS searches by the
 * router instance (see `createRouter`). One mutable cell, deliberately: the router's `PoolIndex`
 * caches negative quotes and scan coverage keyed by block, so "the head went backwards" is a fact
 * about the *router's* history, not about any single search.
 *
 * It exists because the load balancer in front of a multi-node provider is free to answer
 * `eth_getBlockByNumber` from node A and the pinned `eth_call`s from node B two blocks behind. The
 * node-state classifier catches the loud version of that (node B refuses the call); this catches the
 * quiet one (node B answers a *different*, older head, so nothing errors at all and the search
 * silently prices against stale state or re-searches a block it has already been past).
 *
 * It is a maximum, but not an unfalsifiable one: see `fetchBlock`'s self-heal, without which a single
 * bogus high answer would brick every later search on this router.
 */
export type HeadWatermark = { lastPinnedBlock?: bigint }

/**
 * Everything one search reads from its surroundings. The facade (`router.ts#buildContext`) builds
 * one per search; a one-off engine run (unit tests, `experimental` callers) can build it from a
 * client and a manifest alone.
 */
export type SearchContext = {
  client: SearchClient
  manifest: ChainManifest
  modules: Record<Protocol, ProtocolModule>
  index: PoolIndex
  /** Request-scoped poolId -> hookData, built by the caller from `req.hints`; the index never stores it. */
  hookData: Map<string, Hex>
  /** Cross-search head watermark, owned by the router instance. Absent for a one-off engine run
   * (unit tests, `experimental` callers): with no history to compare against, no head can regress. */
  head?: HeadWatermark
  /** The router's global request semaphore (C4-P6), threaded into every RPC this search issues so
   * the real peak in-flight `client.request` count is bounded ACROSS sources, not per batch. Absent
   * for a one-off engine run below the facade: every call then goes ungated. */
  semaphore?: Semaphore | undefined
  /** The chain's PROBED Multicall3 deployment (`router.ts#resolveMulticall3`), threaded into the
   * pump's measurement rounds. Absent, quoting is one `eth_call` per leg. */
  multicall3?: Address | undefined
  /** The router's `logChunkBlocks` option: the ceiling on every `eth_getLogs` window this search
   * issues (see `internal/logScan.ts`). Absent, `scanLogs` uses `MAX_SCAN_WINDOW`. */
  logChunkBlocks?: bigint | undefined
  /** Overrides the `eth_getLogs` retry-backoff timer — a test seam and only a seam (the escalation
   * is wall-clock-defined); nothing in `router.ts` sets it. */
  scanSleep?: ((ms: number) => Promise<void>) | undefined
  /**
   * A pinned-block fetch DISPATCHED BEFORE this context existed, so its round trip overlaps manifest
   * validation and the multicall3 probe instead of starting after them (C5-A). Absent for a one-off
   * engine run: the loop then calls {@link fetchBlock} itself, identically.
   */
  pinnedBlock?: Promise<{ block: BlockRef; regressed: boolean }>
  /**
   * Appends every applied outcome to `state.outcomeLog` (`search/state.ts`) — the recording half of
   * the outcome-log golden format (`internal/outcomeLog.ts`). Off by default and never set by
   * `router.ts`: a live search pays nothing for it, and the recorder is the only caller that asks.
   */
  recording?: boolean | undefined
}

// ---------------------------------------------------------------------------
// The pinned block
// ---------------------------------------------------------------------------

/**
 * One `eth_getBlockByNumber('latest')`. This is the engine's only throw — a transport failure or a
 * null/absent response both surface as {@link RpcUnavailableError}, never a plain `Error`, so the
 * facade can catch this specific failure by identity instead of guessing at every possible thrown
 * shape.
 *
 * Gated by the router's global semaphore (C4-P6, F2), same as every other `client.request` this
 * engine issues — a leaf request with nothing nested inside it, so acquiring here carries no
 * lock-ordering risk. Without this, every search's head fetch would sidestep `concurrency` entirely:
 * N concurrent searches on one router make N (or N*2, across `fetchBlock`'s refetch) head requests
 * that never touch the bound at all, on top of whatever it was actually limiting.
 */
async function requestHead(client: SearchClient, semaphore?: Semaphore): Promise<BlockRef> {
  let raw: { number: Hex; hash: Hex; timestamp: Hex } | null
  await semaphore?.acquire()
  try {
    raw = (await client.request({ method: 'eth_getBlockByNumber', params: ['latest', false] } as any)) as {
      number: Hex
      hash: Hex
      timestamp: Hex
    } | null
  } catch (err) {
    throw new RpcUnavailableError('failed to fetch the pinned block for this search', { cause: err })
  } finally {
    semaphore?.release()
  }
  if (!raw) throw new RpcUnavailableError('eth_getBlockByNumber returned null for "latest"')
  return { number: BigInt(raw.number), hash: raw.hash, timestamp: BigInt(raw.timestamp) }
}

/**
 * Fetches the pinned block once; every read, quote, and simulation in the search runs at it.
 *
 * HEAD-REGRESSION GUARD. If the head this call returns is BELOW one an earlier search on the same
 * router already pinned, the block is refetched exactly once — a single round trip is enough to shake
 * off a load balancer that happened to route one request to a lagging replica, which is by far the
 * likeliest cause. If the second answer is still behind, the search proceeds AT THAT BLOCK (pinning a
 * head the node cannot serve would only trade a reported degradation for a stream of `header not
 * found`s) and reports `headRegressed`, which the facade reads as an incompleteness axis: the search
 * ran against a head the router has already been past, so it is never entitled to a `no-route`.
 *
 * Clamping forward instead — pinning `lastPinnedBlock` and searching there — was rejected: it asserts
 * a block the answering node may not have, and turns an honest "ask again" into calls that fail one
 * by one for a reason the report can no longer name.
 *
 * THE WATERMARK SELF-HEALS, because a monotone maximum is otherwise a permanent trap: one bogus high
 * head (a provider glitch answering `0x3b9ac9ff`) would sit above every real head forever, and this
 * router could never again report an authoritative `no-route` — at two head round trips per search.
 * So a regression FURTHER than {@link maxPlausibleHeadRegression} behind, observed TWICE IN A ROW,
 * is read as evidence against the watermark rather than against the chain: no real reorg or replica
 * lag runs that deep, and two independent answers agreeing on a head hundreds of blocks below it mean
 * the recorded one never existed. The watermark is reset to the head both answers agree is current,
 * and the search proceeds normally — nothing regressed; the router's memory was simply wrong.
 *
 * A regression WITHIN that bound is the ordinary lagging-replica case and keeps the strict behavior:
 * report it, leave the watermark where it is.
 *
 * `maxRegression` is passed in, not read off a constant (C4-P1): it is four times the CHAIN's reorg
 * overlap, and "four reorg depths" means a different number of blocks per chain. The caller supplies
 * `maxPlausibleHeadRegression(reorgOverlapBlocksOf(ctx.manifest))`.
 *
 * The refetch is also fault-isolated. It is a diagnostic, and a diagnostic that can fail the whole
 * search is worse than the ambiguity it resolves: if it throws, the first (already usable) block is
 * pinned and the regression is reported, rather than an `RpcUnavailableError` escalating a degraded
 * search into a total `rpc-unavailable` outage.
 */
export async function fetchBlock(
  client: SearchClient,
  maxRegression: bigint,
  head?: HeadWatermark,
  semaphore?: Semaphore,
): Promise<{ block: BlockRef; regressed: boolean }> {
  const first = await requestHead(client, semaphore)

  const watermark = head?.lastPinnedBlock
  // WHAT MAKES THE WATERMARK A RUNNING MAXIMUM is that every write to it below sits behind a
  // comparison against it: the two `regressed` paths return without touching it at all, so a lagging
  // answer can never lower the bar for the searches that follow. (The single downward write is the
  // self-heal, which is a correction of a value that was never real — not an advance.)
  if (head === undefined || watermark === undefined || first.number >= watermark) {
    if (head !== undefined) head.lastPinnedBlock = first.number
    return { block: first, regressed: false }
  }

  let second: BlockRef
  try {
    second = await requestHead(client, semaphore)
  } catch {
    // The refetch is a diagnostic; it must never be able to turn a usable search into an outage.
    return { block: first, regressed: true }
  }

  if (second.number >= watermark) {
    head.lastPinnedBlock = second.number
    return { block: second, regressed: false }
  }

  // Both answers are behind the watermark. Implausibly far behind, twice over, indicts the watermark.
  if (watermark - first.number > maxRegression && watermark - second.number > maxRegression) {
    head.lastPinnedBlock = second.number
    return { block: second, regressed: false }
  }

  return { block: second, regressed: true }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * What the loop tells its consumer. Internal — the facade shapes these into the public
 * `SearchEvent` union, folding each into a public result AT RECEIPT (spec §5's carve-out: `state`
 * rides along LIVE, never snapshotted, and an in-flight preflight settling after `final` may still
 * write through `applyPreflight` — so nothing may hold `state` and read it later).
 *
 *  - `lead`: the leader's observable identity changed — routeId, amountOut, execution status, or
 *    tx presence. `ranked` is leader-first: `pickLeader`'s verdict (which keeps a verified route in
 *    front of an unverified out-pricer) is applied HERE, so consumers never re-derive it.
 *  - `progress`: something report-relevant moved without a new lead; at most one per wake cycle.
 *  - `final`: exactly once, always last.
 *
 * `report` is the cycle's own `buildReport` fold, taken at the moment of emission — the loop folds
 * one per cycle anyway (it is what `progress` coalescing compares), so the event carries that exact
 * fold and a consumer never re-derives a report the emission decision did not see.
 */
export type EngineEvent =
  | { type: 'lead'; ranked: RankedRoute[]; state: SearchState; report: SearchReport }
  | { type: 'progress'; state: SearchState; report: SearchReport }
  | { type: 'final'; ranked: RankedRoute[]; state: SearchState; report: SearchReport }

/** The leader's observable identity — the four fields whose change means "new lead". */
function leadSignature(state: SearchState, best: RankedRoute): string {
  const id = routeId(best.route)
  return [id, best.quote.amountOut, best.execution, state.compiledById.has(id)].join('|')
}

/** The report's observable identity, for `progress` coalescing: the cycle's fold, stringified with
 * bigints spelled out. The same fold rides out on the emitted event, so "report-relevant" can never
 * drift from what a consumer actually receives. */
function reportSignature(report: SearchReport): string {
  return JSON.stringify(report, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value))
}

// ---------------------------------------------------------------------------
// The intermediates frontier
// ---------------------------------------------------------------------------

/**
 * Grows `state.intermediates.selected` by one batch (`MAX_INTERMEDIATES`) from the pump's discovered
 * ordering — hinted → cores → newest-touching-pool — and refreshes `discovered` from the same walk,
 * so the selected/discovered ratio always describes one look at the index.
 *
 * Returns whether the frontier's OBSERVABLE STATE moved — a selection, or a `discovered` shift —
 * and the caller pokes on either. A selection makes new legs due, which is the obvious wake; the
 * shift arm exists for the quieter hazard: the shared index can SHRINK under this search (a
 * concurrent search's upserts evicting never-quoted pools under `maxPools`) without touching this
 * search's `indexVersion`, so the pump stays clean and the termination check keeps reading the last
 * planning pass's `discovered` — stale-high. That check runs BEFORE this refresh in the cycle, so a
 * refresh-down that selected nothing must still wake the loop once, or a search whose sources have
 * all settled parks one comparison short of `final`, forever.
 *
 * Called once BEFORE the first pump cycle (the seed — a cold two-hop must not wait for a dry cycle
 * to learn that cores exist) and once per quiet dry cycle thereafter.
 */
function advanceIntermediates(state: SearchState, ctx: PumpCtx, req: QuoteRequest): boolean {
  const ordered = orderedIntermediates(ctx, req)
  const shifted = state.intermediates.discovered !== ordered.length
  state.intermediates.discovered = ordered.length
  const have = new Set(state.intermediates.selected)
  const batch = ordered.filter((node) => !have.has(node)).slice(0, MAX_INTERMEDIATES)
  if (batch.length === 0) return shifted
  state.intermediates.selected.push(...batch)
  state.intermediates.notch++
  return true
}

// ---------------------------------------------------------------------------
// Readiness — the whole bounded prelude, launched as a source (swaps only;
// quote searches never run readiness or verification)
// ---------------------------------------------------------------------------

/** `checkReadiness` never throws for a business outcome (a failed READ widens the requirement set or
 * degrades the result); anything it does throw is a bug, which the SourceSet records in `failures()`
 * without taking the search down. THE BUG STILL DEGRADES THE REPORT: a readiness source that died
 * settles as an empty, known-incomplete requirement list (`degraded: true` — readinessDegraded +
 * verificationDegraded), because a search whose funding-state reads never landed must not classify
 * as authoritative however the reads were lost. Without that write the failure would be invisible:
 * `state.requirements` would stay unset, the verifier would never run, and the report would show a
 * clean search that simply never verified anything. */
function launchReadiness(sources: SourceSet, state: SearchState, ctx: SearchContext, req: SwapRequest, block: BlockRef): void {
  sources.launch('readiness', async () => {
    try {
      // Safe to require here: `validateSwapRequest` already rejected a swap request against an
      // execution-less manifest, synchronously, before this search started (C4-P3).
      const execution = requireExecution(ctx.manifest)
      const outcome = await checkReadiness({
        client: ctx.client,
        trader: req.trader,
        currencyIn: req.tokenIn,
        amountIn: req.amountIn,
        permit2: execution.permit2,
        router: execution.address,
        ...(req.permit !== undefined && { permit: req.permit }),
        blockNumber: block.number,
        blockTimestamp: block.timestamp,
        semaphore: ctx.semaphore,
      })
      applyReadiness(state, outcome)
    } catch (err) {
      applyReadiness(state, { requirements: [], degraded: true })
      throw err // still a recorded source failure — it is a bug, but no longer a silent one
    }
  })
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

/**
 * The event-driven search: one loop, two convergence processes (pump, coverage worker), a verifier,
 * and the intermediates frontier, sequenced by wakes. See the module header for the two ordering
 * decisions; see the spec (§3.1) for the model.
 *
 * `req` and `kind` are a correlated pair — every caller passes them paired (`'swap'` always with
 * a `SwapRequest`), and the single cast below is the one seam where that correlation is asserted.
 */
export async function* search(
  ctx: SearchContext,
  req: QuoteRequest | SwapRequest,
  kind: 'quote' | 'swap',
): AsyncGenerator<EngineEvent> {
  // `ctx.pinnedBlock`, when present, is a fetch the facade already dispatched before this context
  // existed (C5-A). RpcUnavailableError propagates from here and nowhere else.
  const { block, regressed } = await (ctx.pinnedBlock ??
    fetchBlock(ctx.client, maxPlausibleHeadRegression(reorgOverlapBlocksOf(ctx.manifest)), ctx.head, ctx.semaphore))

  const state = createState(block, regressed, ctx.recording)
  const wake = createNotifier()
  const sources = new SourceSet(wake)
  const pumpCtx: PumpCtx = {
    index: ctx.index,
    modules: ctx.modules,
    manifest: ctx.manifest,
    hookData: ctx.hookData,
    hints: req.hints ?? [],
    client: ctx.client,
    semaphore: ctx.semaphore,
    multicall3: ctx.multicall3,
    signal: sources.signal,
    // The waker turns each measurement round detached and envelope-granular (see `pump.ts`): a
    // 250-leg round's first envelope recomposes — and can lead — while the other envelopes are
    // still in flight. `pumpDry` counts in-flight keys, so the gate and the termination check
    // below still wait for the round's last answer.
    wake,
  }
  const worker = new CoverageWorker(
    {
      index: ctx.index,
      modules: ctx.modules,
      manifest: ctx.manifest,
      client: ctx.client,
      head: block.number,
      semaphore: ctx.semaphore,
      logChunkBlocks: ctx.logChunkBlocks,
      scanSleep: ctx.scanSleep,
      wake,
    },
    state,
    req,
  )
  const verifier =
    kind === 'swap'
      ? new Verifier({
          state,
          ctx: { client: ctx.client, manifest: ctx.manifest, modules: ctx.modules, semaphore: ctx.semaphore },
          req: req as SwapRequest,
          wake,
        })
      : undefined

  // The seed: the first batch of intermediates is selected BEFORE the first pump cycle, so a cold
  // two-hop prices in the very first rounds instead of waiting for a dry cycle to discover cores.
  advanceIntermediates(state, pumpCtx, req)

  if (verifier !== undefined) launchReadiness(sources, state, ctx, req as SwapRequest, block)
  worker.demandEager() // the bounded latency guarantee for the new-asset case
  sources.launch('coverage', (signal) => worker.run(signal)) // launched EXACTLY ONCE per search

  // Readiness has settled once its outcome landed (the normal path) or its source failed (a bug,
  // recorded in `failures()`); either way the gate must not wait on it forever.
  const readinessSettled = (): boolean =>
    verifier === undefined || state.requirements !== undefined || sources.failures().some((f) => f.name === 'readiness')

  let lastLead: string | undefined
  let lastReport = reportSignature(buildReport(state, ctx, req))
  // The caller's abort must reach a loop parked on `wake.next()`; observed at the loop top as today.
  const onAbort = (): void => wake.poke()
  req.signal?.addEventListener('abort', onAbort, { once: true })
  wake.poke() // the first cycle needs no external event: the hints and the index are already here

  try {
    while (true) {
      await wake.next()
      if (req.signal?.aborted === true && !state.aborted) applyAbort(state)

      const dispatched = await pump(state, pumpCtx, req)
      const quoted = composeRoutes(state, pumpCtx, req)
      if (verifier !== undefined && state.requirements !== undefined) verifier.consider(quoted)

      const evaluated = quoted.map((q) => withExecution(state, q))
      const best = evaluated.length > 0 ? pickLeader(evaluated, verifier?.leaderId()) : undefined
      const ranked = best === undefined ? [] : [best, ...evaluated.filter((e) => e !== best)]

      // `pumpDry`'s second parameter is unused today (blessed signature): dryness is the pump's
      // own verdict (its cursor, plus no round in flight), and the ctx rides along for the day
      // planning needs it.
      const dry = pumpDry(state, pumpCtx)
      // One fold per cycle, AFTER the pump/verifier writes above: it decides `progress` coalescing
      // and rides out on whichever event this cycle emits.
      const report = buildReport(state, ctx, req)

      // The worker's converged-or-settled is carried by `sources.settled()`: `run()` resolves only
      // once the gate is open and a pass made no progress — converged, or starved with the failure
      // already reported on the discovery axis. A failed scope therefore terminates, never spins.
      // Judged BEFORE this cycle's lead/progress emission, so a terminal cycle emits exactly one
      // event — the `final`, which carries the full ranked list anyway.
      //
      // AN ABORT DRAINS THE IN-FLIGHT ROUND FIRST. A detached measurement round's answers may be
      // mid-application when the abort's poke wakes this loop; terminating on `aborted` alone
      // would emit a final missing prices the wire already paid for — the exact best-so-far the
      // abort contract promises to keep (and what the awaited round delivered structurally, by
      // blocking this check until it had applied everything). Draining costs what the old await
      // cost: the round was never cancelled by `req.signal` either way (`sources` abort only in
      // `finally`), so the batches keep applying and poking until `inFlightKeys` empties.
      if (
        (state.aborted && state.inFlightKeys.size === 0) ||
        (sources.settled() &&
          dry &&
          (verifier?.idle() ?? true) &&
          state.intermediates.selected.length >= state.intermediates.discovered)
      ) {
        yield { type: 'final', ranked, state, report }
        return
      }

      // At most one event per cycle: a new lead, else a progress if the report moved.
      const lead = best === undefined ? undefined : leadSignature(state, best)
      if (lead !== undefined && lead !== lastLead) {
        lastLead = lead
        lastReport = reportSignature(report)
        yield { type: 'lead', ranked, state, report }
      } else {
        const signature = reportSignature(report)
        if (signature !== lastReport) {
          lastReport = signature
          yield { type: 'progress', state, report }
        }
      }

      // The gate and the frontier advance only when the search is QUIET (see the module header's
      // ordering decision 2): dry alone is not "cheap information exhausted" while readiness or a
      // preflight is still answering.
      if (dry && readinessSettled() && (verifier?.idle() ?? true)) {
        worker.demandFull() // the gate — the ONLY writer of state.gateOpened, idempotent
        // Poked on a selection AND on a bare `discovered` refresh: the termination check above read
        // the pre-refresh value, and if the eligible set shrank under this search (cross-search
        // eviction) that read was stale-high with nothing else left to wake the loop — see
        // {@link advanceIntermediates}. A spurious poke coalesces and costs one O(1) cycle.
        if (advanceIntermediates(state, pumpCtx, req)) wake.poke()
      }
      if (dispatched) wake.poke() // this round's outcomes may have made new legs due
    }
  } finally {
    req.signal?.removeEventListener('abort', onAbort)
    // Covers abandonment, abort, and completion alike. §5 carve-out, documented: an in-flight
    // preflight is NOT cancelled here — `preflightTx` takes no AbortSignal and `Verifier.consider()`
    // has no signal seam, so threading `sources.signal` in would widen two blessed contracts for
    // one bounded `eth_call`. Its settlement writes only through `applyPreflight` and pokes a
    // notifier nobody is awaiting any more — harmless after `final`. On iterator ABANDONMENT, a
    // detached measurement round settles the same inert way (this abort turns its unsent calls
    // into 'unattempted' outcomes, applied through `applyMeasurement` into a state nobody reads
    // again — see `pump.ts`); on a caller's abort or normal termination it cannot, because the
    // termination check above drained `inFlightKeys` first.
    sources.abortAll()
  }
}
