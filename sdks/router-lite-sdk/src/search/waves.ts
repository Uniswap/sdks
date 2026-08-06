import type { Address, Hex, PublicClient } from 'viem'

import {
  DEFAULT_CONCURRENCY,
  FEE_DISCOVERY_MAX_REQUESTS,
  MAX_INTERMEDIATES,
  maxPlausibleHeadRegression,
  QUOTE_INTERLEAVE_MS,
} from '../constants'
import { RpcUnavailableError } from '../errors'
import { toGraphNode } from '../internal/currency'
import { ethCall, mapConcurrent } from '../internal/rpc'
import type { Semaphore } from '../internal/rpc'
import { reorgOverlapBlocksOf, requireExecution, wave0PairScanBlocks } from '../manifest'
import type { PoolIndex } from '../pools/poolIndex'
import type { ProtocolModule, QuoteProbe } from '../protocols/types'
import { probeQuotes, quoteCandidates } from '../quote/quote'
import type {
  BlockRange,
  BlockRef,
  ChainManifest,
  CompiledLimits,
  CurrencyRef,
  EncodedTx,
  EthCall,
  ExecutionRequirement,
  Protocol,
  PoolRecord,
  QuoteRequest,
  QuotedRoute,
  RankedRoute,
  RouteCandidate,
  SearchReport,
  SwapRequest,
} from '../types'
import { protocolRecord, zeroQuoting, zeroVerification } from '../types'
import { checkReadiness } from '../verify/readiness'

import { generateRoutes, routeId } from './candidates'
import {
  completeExactPairScan,
  discoverFeeTiers,
  enabledModules,
  node,
  scanAdjacency,
  scanExactPairRecent,
} from './discovery'
import { evaluate } from './leader'

// ---------------------------------------------------------------------------
// The wave engine — the only module that owns *policy*: what to look at first,
// when to stop looking, and when the caller deserves to hear about it.
//
// Everything below it (discovery, quoting, compiling, encoding, verifying) is
// a stage primitive that holds no policy at all, so this file is where the
// search's shape lives:
//
//   wave 0  hints (validated) + cached pools + speculative direct probes from
//           every enabled module + a RECENT-WINDOW v4 exact-pair Initialize
//           scan + (swaps) the route-independent readiness reads — all
//           concurrently, because a launcher-hinted brand-new asset should be
//           routable without a single historical log scan
//   wave 1  core intermediates: probe both legs of tokenIn -> core -> tokenOut
//   wave 2  focus-endpoint adjacency (see `selectFocus`), then exact-pair
//           probes from each discovered neighbor to the other endpoint
//   wave 3  the other endpoint's adjacency, then the full bounded cross
//           product over everything the index now knows
//
// The engine's stages live in three sibling files, each with its own header:
// `discovery.ts` (log-scan orchestration + the shared context accessors),
// `leader.ts` (compile/encode/simulate, and the ordering invariant that makes
// needs-action-vs-verified gating sound), `report.ts` (SearchReport assembly);
// the set arithmetic every one of them shares is `internal/ranges.ts`.
//
// Four properties hold across every wave:
//
//  1. A route is quoted at most once per search. Waves overlap heavily by
//     design (each one re-enumerates over a bigger index), so dedup by
//     `routeId` is what keeps the RPC cost of a later wave proportional to
//     what it actually *discovered*.
//  2. The generator is lazy. Waves 1-3 only run when the consumer pulls the
//     next value, so a promise-shaped caller that stops at the first
//     actionable result (`getSwap`) never pays for the adjacency scans, while
//     an iterator-shaped caller that keeps pulling gets the improving best
//     until the bounded search completes.
//  3. Nothing here throws for a business outcome. An unquoteable pool, an
//     uncompilable route, a reverting simulation, a provider that caps
//     `eth_getLogs` — all of them are recorded (in the index, in the route's
//     `execution` status, in the `SearchReport`) and the search continues.
//  4. A SCAN-BOUND WAVE QUOTES AS IT GOES, not only once its scans return
//     (`quoteWhileDiscovering`). Waves 1-3 each pass their discovery phase
//     through it, so the candidates a scan surfaces are priced every
//     `QUOTE_INTERLEAVE_MS` rather than in one closing batch that an abort
//     fired mid-scan will refuse outright. Without it a wave whose scans
//     outlast the caller's budget converts its whole runtime into pools and
//     none of it into prices — see that function's header for the live numbers.
//
// Speculative probes come in two flavors, and conflating them would be a
// correctness bug: a *route probe* (wave 0) quotes tokenIn -> tokenOut and its
// result is a real quoted route; a *discovery probe* (waves 1-2) quotes one
// leg of a prospective two-hop and is only evidence that the pool exists — its
// amount is meaningless for the trade, so the pool is upserted into the index
// and the amount is discarded. The real two-hop quote comes later, chained,
// from `quoteCandidates`.
//
// WAVE 0 IS A LATENCY BUDGET, NOT A COMPLETENESS BUDGET. Its exact-pair log
// scan reaches back only `wave0PairScanBlocks(manifest)` — one week of this
// chain's own blocks — from the pinned head; on a
// cold mainnet index the full v4 history is millions of blocks, and scanning
// it inline would put hundreds of sequential chunked `eth_getLogs` in front of
// the first yield, which is the opposite of what wave 0 is for. The remaining
// history is completed in wave 2, which is scan-bound anyway. That split is
// safe *only* because completeness is reported separately: discovery never
// reads `complete` until the adjacency scans that subsume the pair scan have
// finished, so a consumer that abandons the iterator after wave 0 sees
// `partial` and can never mistake a windowed look for an exhaustive one.
//
// KNOWN DEVIATION FROM THE SPEC'S ARCHITECTURE SKETCH: the spec has the
// leader's preflight "pipelining against the next wave's scans". It does not,
// here. Laziness won that trade: a wave only runs when the consumer pulls, so
// the engine cannot start wave N+1's scans while it verifies wave N's leader
// without doing work the consumer may never ask for — which is precisely the
// cost that lets `getSwap` resolve a hinted route with zero log scans. The
// consequence is one preflight round trip of serial latency per improving
// wave. Reclaiming it means speculatively starting the next wave and
// discarding it on early exit, which is a different (and strictly more
// expensive) default than the one the hint fast path is built around.
//
// CLASSIFICATION CONTRACT FOR THE FACADE (Task 18): a completed search whose
// every attempted leader *reverted* in preflight is `no-route`, not
// `inconclusive` — a route that cannot execute is not a route, and its failed
// candidates are still handed back in `alternatives` with
// `execution: 'failed'` so the caller can see what was tried. `inconclusive`
// is reserved for the incompleteness axes the report actually tracks
// (aborted, partial/failed discovery, unattempted quotes, transport-failed
// quotes, degraded verification), which is what keeps `assertResultCoherent`
// satisfiable: every `inconclusive` names a reported axis. It does not,
// however, throw away what the search found: the facade hands the leader and
// its compiled `tx` back on that path too, so an aborted or degraded search is
// a *verdict* nobody could reach, never a result nobody gets.
//
// A REVERT AND A 429 ARE NOT THE SAME EVIDENCE, and this is the one place the
// difference decides a caller-visible verdict. A revert is the node answering
// authoritatively about the chain; a transport failure (`TransportError`) is
// the provider answering about itself. Folding them together — which the
// engine used to do, at both RPC seams — made a provider that 429s `eth_call`
// while serving every other method look exactly like a chain with no liquidity:
// a *confident* `no-route`, quoting stats of "99 attempted, 0 succeeded, 99
// failed", every protocol's discovery `complete`. Hence `quoting.failed` vs
// `quoting.transportFailed`, and `execution: 'failed'` vs `'unverified'` +
// `verificationDegraded`.
//
// NEITHER OF THOSE IS "THIS NODE DOES NOT HAVE THE PINNED BLOCK" (C4-H1). The
// everyday version of that is not an outage at all: a load balancer answers
// `eth_getBlockByNumber` from one node and the block-pinned `eth_call`s from
// another a couple of blocks behind. Loudly, it errors — `header not found`,
// `missing trie node`, `state at block N is not available` — which
// `classifyRpcError` reports as `unavailable` and `ethCall` raises as a
// `NodeStateError` (a `TransportError` subclass, so every tally above already
// includes it). Quietly, it does not error at all: the lagging node simply
// answers about an older head, which is what `fetchBlock`'s head-regression
// guard and the report's `headRegressed` axis exist to catch.
// ---------------------------------------------------------------------------

/** The client surface the engine needs: `request`, and nothing else. Every read the engine makes —
 * block header, pinned `eth_call`, `eth_getLogs` — goes through it, so a caller can satisfy the
 * whole engine with one function, and a test can observe every RPC in one place. */
export type SearchClient = Pick<PublicClient, 'request'>

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
  /**
   * The router's global request semaphore (C4-P6), built once per router instance
   * (`createRouter({ concurrency })`, default {@link DEFAULT_CONCURRENCY}) and threaded into every
   * `ethCall`/`scanLogs` call this search issues — hint resolution, route/discovery probes,
   * readiness, and preflight all share it, so the real peak in-flight `client.request` count is
   * bounded ACROSS them, not per batch (see `internal/rpc.ts`'s header). Absent for a one-off engine
   * run (unit tests below the router facade): every RPC call below then goes ungated, exactly as
   * before this option existed.
   */
  semaphore?: Semaphore | undefined
  /**
   * The router's `logChunkBlocks` option (C4-P6), threaded into every `scanLogs` call as its
   * `initialChunk` — the CEILING on the `eth_getLogs` window (starting width and regrowth alike),
   * provider-shaped rather than universal (see `constants.ts#MAX_SCAN_WINDOW`). Absent for a one-off
   * engine run, `scanLogs` falls back to `MAX_SCAN_WINDOW` itself.
   */
  logChunkBlocks?: bigint | undefined
  /**
   * How often a scan-bound wave pauses to quote what it has discovered so far
   * ({@link quoteWhileDiscovering}); {@link QUOTE_INTERLEAVE_MS} when absent, which is every real
   * router (`createRouter` does not expose it and nothing in `router.ts` sets it).
   *
   * It exists as a seam, and only as one: the behaviour it controls is defined by wall-clock time,
   * so a unit test that could not shorten it would have to spend five real seconds per assertion to
   * observe a single pass. Exactly the role `scanLogs`'s `opts.sleep` plays for the retry backoff.
   */
  quoteInterleaveMs?: number | undefined
}

// The engine's routes are plain {@link RankedRoute}s: `execution`, plus the raw `revertData` of a
// simulation that reverted, both of which the public result union declares. (There used to be an
// `EvaluatedRoute = RankedRoute & { revertData?: Hex }` alias here, for a `revertData` the public
// type did not admit to carrying — the field is declared on `RankedRoute` now, so the alias would be
// an exact synonym for it.)

export type InternalResult = {
  best?: RankedRoute
  alternatives: RankedRoute[]
  requirements?: ExecutionRequirement[]
  tx?: EncodedTx
  /** The leading route's compiled `deliverOutput.minAmountOut`/deadline (C4-P7), alongside `tx`
   * whenever `tx` is — set by `search/leader.ts#compileAndEncode` at the same time as `tx`, never
   * independently, so the two can never disagree about which plan they describe. */
  limits?: CompiledLimits
  /** Why no candidate could be compiled into an executable plan, when that is what went wrong — see
   * {@link EngineState.firstCompileError}. The facade appends it to a `no-route` reason so the
   * caller sees the cause rather than only the verdict. */
  compileError?: string
  report: SearchReport
  done: boolean
}

// ---------------------------------------------------------------------------
// Engine state
// ---------------------------------------------------------------------------

export type ProtocolDiscovery = {
  /** Graph-node endpoints whose adjacency came back fully covered. Completeness is judged against
   * the *trade's* two endpoints by name, never against a count of whatever happened to be scanned. */
  complete: Set<string>
  /** A scan that asked for a non-empty range and got nothing back at all. */
  failed: boolean
  covered: BlockRange[]
}

export type ExecutionState = { status: RankedRoute['execution']; revertData?: Hex }

export type EngineState = {
  block: BlockRef
  /** routeId -> successfully quoted route, accumulated across waves. */
  quoted: Map<string, QuotedRoute>
  /** routeIds ever submitted for quoting — a route is never quoted twice in one search. */
  seen: Set<string>
  /** Discovery-probe ids already fired (probe results are pool evidence, not routes). */
  probed: Set<string>
  execution: Map<string, ExecutionState>
  txById: Map<string, EncodedTx>
  /** The plan's own `deliverOutput.minAmountOut` and the deadline handed to the encoder, keyed
   * alongside `txById` — set at the same time as the matching `txById` entry
   * (`search/leader.ts#compileAndEncode`), never independently, so the two can never describe
   * different plans for the same routeId. */
  limitsById: Map<string, CompiledLimits>
  /**
   * The first reason a candidate could not be turned into an executable plan, verbatim.
   *
   * "Every candidate failed to compile" is a real, reachable search outcome — a recipient that
   * collides with one of the route's own pools, a quote whose slippage floor overruns `uint128`, a
   * route shape outside the closed supported set — and it classifies as `no-route`, whose bare
   * reason ("no candidate route verified successfully") tells the caller nothing it can act on. The
   * message is captured once, from the first such failure, and appended to that reason by the
   * facade. First rather than last: it is the leader's failure, the one the caller most likely
   * caused, and later candidates tend to fail for the same reason anyway.
   */
  firstCompileError?: string
  requirements?: ExecutionRequirement[]
  /** Structurally the report's own block, and typed as it so it can never drift: `buildReport`
   * copies this straight into `SearchReport.quoting`, and the five counters' meanings (including the
   * `attempted === succeeded + failed + transportFailed` invariant, and `unattempted` sitting outside
   * that sum) are documented once, there. */
  quoting: SearchReport['quoting']
  /** Set when verification could not be *carried out* — a preflight simulation, or one of the
   * read-only readiness checks, failed in the transport channel. The route stays `unverified`, and
   * the search can no longer be classified as an authoritative `no-route` (nor promised as
   * `ready`/`needs-action` off incomplete readiness) — see the facade's `isSearchComplete`. */
  verificationDegraded: boolean
  /** The narrower half of the above: `state.requirements` is known-incomplete because a readiness
   * read never landed. Kept apart from `verificationDegraded` because it changes two *decisions*
   * (never promise `needs-action`; never blame a preflight revert on the route when the trader's
   * funding state is unknown), not just the report. */
  readinessDegraded: boolean
  /**
   * NOT `SearchReport['enumeration']`, on purpose: that type renames these pruning counters
   * (`poolsPruned`/…) and adds `exhaustiveWithinMaxHops`, which is a verdict `buildReport` derives
   * from four separate axes rather than anything the engine accumulates.
   */
  enumeration: {
    candidatesGenerated: number
    prunedPools: number
    prunedCandidates: number
    prunedIntermediates: number
    /** Eligible two-hop intermediates the last `generateRoutes` call SAW, before `MAX_INTERMEDIATES`.
     * Threaded from the enumeration rather than re-walked at report time so it and
     * `intermediatesSelected` — which the report prints as the single ratio `selected/discovered` —
     * always describe the same index at the same instant. */
    intermediatesDiscovered: number
    /** The real selected-intermediates count from the last `generateRoutes` call — never re-derived
     * downstream from a discovered-count + cap. */
    intermediatesSelected: number
  }
  discovery: Record<Protocol, ProtocolDiscovery>
  /** Exact-pair ranges this search already asked for, so wave 2 never re-requests wave 0's window
   * (the coverage cache always re-opens its tail for reorgs, which would otherwise cost a second
   * identical scan of the same 32 blocks in every single search). */
  pairScanned: BlockRange[]
  /** Graph nodes that have proven useful as intermediates, in priority order. */
  intermediatePriority: string[]
  focus?: CurrencyRef
  aborted: boolean
  /** Set when the `latest` block this search pinned is BELOW one an earlier search on the same
   * router already pinned, and a single refetch did not resolve it (see {@link HeadWatermark}). The
   * whole search then ran against a head the router has already been past — a lagging replica, or a
   * deep reorg — so it is an incompleteness axis exactly like `aborted`: never a `no-route`. */
  headRegressed: boolean
  /** Preflight-simulation budget, across the whole search (C4-P7) — see `SearchReport.verification`
   * for what each field means and why. Recomputed (not accumulated) every wave for
   * `preflightBudgetExhausted`; `preflightAttempted` accumulates. Set by `search/leader.ts#verifyLeader`. */
  verification: SearchReport['verification']
}

export type Run = { ctx: SearchContext; state: EngineState } & (
  | { kind: 'quote'; req: QuoteRequest }
  | { kind: 'swap'; req: SwapRequest }
)

/** Exported for direct unit testing of `evaluate`'s report-ordering invariants in isolation — not
 * part of the `Router`/`searchWaves` surface (mirrors this file's `selectFocus` export for the same
 * reason). A test that seeds `state.quoted` by hand and calls `evaluate(run, true)` directly can
 * reproduce a specific wave's evaluation (e.g. "the last wave, with nothing evaluated before it")
 * without engineering a multi-wave discovery scenario just to control WHEN a fact becomes true. */
export function initialState(block: BlockRef, headRegressed: boolean): EngineState {
  return {
    block,
    headRegressed,
    quoted: new Map(),
    seen: new Set(),
    probed: new Set(),
    execution: new Map(),
    txById: new Map(),
    limitsById: new Map(),
    quoting: zeroQuoting(),
    verificationDegraded: false,
    readinessDegraded: false,
    enumeration: {
      candidatesGenerated: 0,
      prunedPools: 0,
      prunedCandidates: 0,
      prunedIntermediates: 0,
      intermediatesDiscovered: 0,
      intermediatesSelected: 0,
    },
    discovery: protocolRecord<ProtocolDiscovery>(() => ({ complete: new Set(), failed: false, covered: [] })),
    pairScanned: [],
    intermediatePriority: [],
    aborted: false,
    verification: zeroVerification(),
  }
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/**
 * One `eth_getBlockByNumber('latest')`. This is the engine's only throw (see the module header) — a
 * transport failure or a null/absent response both surface as {@link RpcUnavailableError}, never a
 * plain `Error`, so the facade can catch this specific failure by identity instead of guessing at
 * every possible thrown shape.
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
async function fetchBlock(
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

/** True if any leg of the candidate is a pool already known to be unquoteable *at this block*. */
function isNegativeCandidate(run: Run, candidate: RouteCandidate): boolean {
  return candidate.legs.some((leg) => run.ctx.index.isNegative(leg.pool, run.state.block.number))
}

/** Records a pool the search learned about outside the log stream (a probe that quoted). Existing
 * records are left alone so a `hint` provenance is never downgraded by a later speculative hit. */
function rememberPool(run: Run, record: PoolRecord): void {
  const [c0, c1] = record.pool.currencies
  const known = run.ctx.index.pair(c0, c1).some((r) => r.pool.id === record.pool.id)
  if (!known) run.ctx.index.upsert(record)
}

function recordSuccess(run: Run, quoted: QuotedRoute[]): void {
  for (const q of quoted) {
    for (const leg of q.route.legs) {
      rememberPool(run, { pool: leg.pool, source: 'factory' })
      run.ctx.index.markSuccess(leg.pool, run.state.block.number)
    }
    if (q.route.legs.length === 2) {
      const mid = node(q.route.legs[0]!.currencyOut, run.ctx.manifest)
      if (!run.state.intermediatePriority.includes(mid)) run.state.intermediatePriority.unshift(mid)
    }
  }
}

/**
 * Marks the pools of failed *single-leg, amount-independent* candidates negative for this block.
 * Both qualifiers gate the mark, and both are load-bearing (C4-H3):
 *
 *  - single-leg: a failed two-leg candidate says nothing about which of its pools was at fault, so
 *    nothing is marked — a negative cache that poisons innocent pools would be worse than no cache.
 *  - amount-independent: `amountIndependentFailures` (from `quoteCandidates`/`probeQuotes`, via
 *    `internal/rpc.ts#revertDataOf`) is already filtered to failures whose revert carried NO data —
 *    the pool-absent shape (v2 `getReserves()` at a nonexistent address; a v3/v4 quoter reverting
 *    with no payload because there is no pool at that key). A revert WITH data
 *    (`NotEnoughLiquidity`, a hook rejection, a zero-output rounding revert) can depend on `amountIn`
 *    or on which trader is asking, and the negative cache is shared across every concurrent request
 *    at this block: marking an amount-dependent revert negative would let a 1-wei quote that rounds
 *    to zero output poison a pool for a concurrent 100 ETH quote that would have priced it fine, a
 *    cross-request correctness bug with no exception or bad result on either side to notice it by.
 *    The false-negative this trades away is narrow and self-healing: an exotic pool whose data-less
 *    revert happens to be amount-dependent anyway is skipped for at most `NEGATIVE_CACHE_BLOCKS`
 *    blocks, never longer.
 *
 * A candidate that failed only in the transport channel never reaches this function at all — it is
 * excluded from `amountIndependentFailures` at the source (`quoteCandidates`/`probeQuotes`), since a
 * 429 is not evidence that the pool cannot quote and caching it as one would let a provider hiccup
 * suppress a real pool for the rest of the block.
 *
 * KNOWN GAP, DELIBERATE. A two-leg candidate whose FIRST SEGMENT is a single leg does identify a
 * failing pool — but `quoteCandidates` reports failures per *candidate*, not per segment, so that
 * attribution is not available here and is not reconstructed by guessing. The consequence is that a
 * pool only ever reachable inside a two-hop candidate is never negative-cached and never
 * accumulates the failure history that {@link isDiscredited} reads. Single-leg quoting — wave 0/1's
 * route probes, the direct-pair candidates, and (since C4-H4 round 2) the discovery probes below —
 * is the channel that covers the pools this actually matters for.
 */
function recordFailures(run: Run, amountIndependentFailures: RouteCandidate[]): void {
  for (const candidate of amountIndependentFailures) {
    if (candidate.legs.length !== 1) continue
    run.ctx.index.markNegative(candidate.legs[0]!.pool, run.state.block.number)
  }
}

// ---------------------------------------------------------------------------
// Quoting steps
// ---------------------------------------------------------------------------

/** Quotes candidates never quoted before in this search, merging survivors into the running set. */
async function quoteNew(run: Run, candidates: RouteCandidate[]): Promise<void> {
  const { state } = run
  const fresh = candidates.filter((c) => {
    const id = routeId(c)
    if (state.seen.has(id)) return false
    if (isNegativeCandidate(run, c)) return false
    state.seen.add(id)
    return true
  })
  if (fresh.length === 0) return

  state.enumeration.candidatesGenerated += fresh.length
  const { quoted, stats, amountIndependentFailures } = await quoteCandidates({
    client: run.ctx.client,
    modules: run.ctx.modules,
    manifest: run.ctx.manifest,
    candidates: fresh,
    amountIn: run.req.amountIn,
    blockNumber: state.block.number,
    semaphore: run.ctx.semaphore,
    ...(run.req.signal !== undefined && { signal: run.req.signal }),
  })

  state.quoting.attempted += stats.attempted
  state.quoting.succeeded += stats.succeeded
  state.quoting.failed += stats.failed
  state.quoting.transportFailed += stats.transportFailed
  state.quoting.unattempted += fresh.length - stats.attempted
  recordSuccess(run, quoted)
  recordFailures(run, amountIndependentFailures)
  for (const q of quoted) state.quoted.set(routeId(q.route), q)
}

/** Wave 0's direct probes: the quote call *is* the existence check, and a hit is a real route. */
async function runRouteProbes(run: Run, probes: QuoteProbe[]): Promise<void> {
  const { state } = run
  const fresh = probes.filter((p) => {
    const id = routeId(p.candidate)
    if (state.seen.has(id)) return false
    if (isNegativeCandidate(run, p.candidate)) return false
    state.seen.add(id)
    return true
  })
  if (fresh.length === 0) return

  state.enumeration.candidatesGenerated += fresh.length
  const { quoted, stats, amountIndependentFailures } = await probeQuotes({
    client: run.ctx.client,
    probes: fresh,
    amountIn: run.req.amountIn,
    blockNumber: state.block.number,
    semaphore: run.ctx.semaphore,
    ...(run.req.signal !== undefined && { signal: run.req.signal }),
  })

  state.quoting.attempted += stats.attempted
  state.quoting.succeeded += stats.succeeded
  state.quoting.failed += stats.failed
  state.quoting.transportFailed += stats.transportFailed
  // Mirrors `quoteNew`, and for the identical reason: `probeQuotes` genuinely returns
  // `attempted < probes.length` — an abort that lands while a probe is queued for a semaphore permit
  // raises `AbortedCallError`, which is deliberately counted in NO stats bucket (`quote/quote.ts`)
  // so the `attempted === succeeded + failed + transportFailed` invariant survives; turning that
  // shortfall into `unattempted` is the CALLER's job. This channel feeds `candidatesGenerated` above
  // on exactly the same terms `quoteNew` does (`types.ts#SearchReport.quoting`, channel 1), and
  // omitting this line meant a report that claimed N candidates and accounted for fewer than N
  // outcomes, with nothing anywhere saying where the rest went — the conservation invariant
  // `internal/testing.ts#assertResultCoherent` now enforces.
  state.quoting.unattempted += fresh.length - stats.attempted
  recordSuccess(run, quoted)
  recordFailures(run, amountIndependentFailures)
  for (const q of quoted) state.quoted.set(routeId(q.route), q)
}

/**
 * Probes single legs purely to learn whether their pools exist. The returned amounts are for one
 * leg at the full input amount, which is not a quote for anything the caller asked about, so they
 * are discarded — only the pool identities survive, into the index.
 *
 * They are still `eth_call` quotes that succeeded or reverted, so they count in the report's
 * quoting stats; what they never do is become a route or a `candidatesGenerated`.
 *
 * A PROBE'S FAILURE IS EVIDENCE TOO, AND IT IS THE EVIDENCE THAT MATTERS MOST (C4-H4 round 2). This
 * is the only place a *half-pair* leg is quoted on its own — `tokenIn -> core`, `neighbor ->
 * tokenOut` — which is exactly the shape a hinted pool takes when it is bought an intermediate slot
 * rather than a direct-pair slot. Recording nothing here meant a fabricated hint on an intermediate
 * pair could never accumulate the failure history {@link isDiscredited} reads, so the demotion
 * could not fire for the attack it exists to stop. The failures fed in are the same
 * amount-independent, pool-absent subset `recordFailures` accepts everywhere else (a data-less
 * revert), and every probe here is single-leg by construction, so nothing about that contract is
 * relaxed to make this work.
 */
async function runDiscoveryProbes(run: Run, probes: QuoteProbe[]): Promise<void> {
  const { state } = run
  const fresh = probes.filter((p) => {
    const id = `probe:${routeId(p.candidate)}`
    if (state.probed.has(id) || state.seen.has(routeId(p.candidate))) return false
    state.probed.add(id)
    return true
  })
  if (fresh.length === 0) return

  const { quoted, stats, amountIndependentFailures } = await probeQuotes({
    client: run.ctx.client,
    probes: fresh,
    amountIn: run.req.amountIn,
    blockNumber: state.block.number,
    semaphore: run.ctx.semaphore,
    ...(run.req.signal !== undefined && { signal: run.req.signal }),
  })

  state.quoting.attempted += stats.attempted
  state.quoting.succeeded += stats.succeeded
  state.quoting.failed += stats.failed
  state.quoting.transportFailed += stats.transportFailed
  // AND DELIBERATELY NO `unattempted` LINE HERE — this is NOT the `runRouteProbes` hole repeated.
  // That one was a leak: it claimed `candidatesGenerated` it then failed to account for. This
  // function claims none (see the docstring above), so there is nothing to conserve, and
  // `unattempted` is defined as a CANDIDATE count — "quote candidates that were never dispatched"
  // (`types.ts#SearchReport.quoting`), which is also exactly what the `'quotes-unattempted'` reason
  // code promises a caller. A half-pair leg is not a candidate and can never become one, so counting
  // a skipped one here would make `unattempted` exceed `candidatesGenerated` and have the reason code
  // name candidates that do not exist. Nothing is lost by the omission: a probe is only ever skipped
  // by an abort, and `state.aborted` already reports that axis.
  recordFailures(run, amountIndependentFailures)
  for (const q of quoted) {
    for (const leg of q.route.legs) rememberPool(run, { pool: leg.pool, source: 'factory' })
  }
}

/** Enumerates over everything the index currently knows and quotes whatever is new. */
async function quoteEnumerated(run: Run): Promise<void> {
  const { ctx, req, state } = run
  const { candidates, pruned, intermediatesDiscovered, intermediatesSelected } = generateRoutes({
    tokenIn: req.tokenIn,
    tokenOut: req.tokenOut,
    index: ctx.index,
    hookData: ctx.hookData,
    wrappedNative: ctx.manifest.wrappedNative,
    successfulIntermediates: state.intermediatePriority,
  })
  // Last enumeration wins: each wave re-enumerates over a strictly larger index, so the most
  // recent call is the one that describes what the finished search actually pruned.
  state.enumeration.prunedPools = pruned.pools
  state.enumeration.prunedCandidates = pruned.candidates
  state.enumeration.prunedIntermediates = pruned.intermediates
  state.enumeration.intermediatesDiscovered = intermediatesDiscovered
  state.enumeration.intermediatesSelected = intermediatesSelected
  // C4-H5 follow-up: being selected as a candidate leg is evidence a pool is worth keeping under
  // `maxPools`, whether or not the quote that follows succeeds — see `PoolIndex.touchAll`'s docstring.
  // Cheap: `candidates`/their legs are already in hand from `generateRoutes` above.
  ctx.index.touchAll(
    candidates.flatMap((c) => c.legs.map((l) => l.pool)),
    state.block.number,
  )
  await quoteNew(run, candidates)
}

/**
 * Resolves when `until` settles or `ms` elapses, whichever is first — and never leaves a timer
 * holding a Node event loop open past that point, which is the only reason it is not a bare
 * `Promise.race`: a race abandons the losing timer, and this package's own `--budget` overshoot bug
 * (`cli/commands/context.ts`) is what a stray timer looks like from the outside.
 *
 * The rejection handler exists so polling a discovery promise that fails never registers as an
 * unhandled rejection; the failure itself is re-awaited (and rethrown) by the caller below.
 */
function settleOrAfter(until: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    const finish = (): void => {
      clearTimeout(timer)
      resolve()
    }
    void until.then(finish, finish)
  })
}

/**
 * Runs a wave's discovery while quoting whatever the index learns ALONG THE WAY, instead of only
 * once the last scan has landed.
 *
 * WHY THIS EXISTS (the sequel to `constants.ts#FEE_DISCOVERY_MAX_REQUESTS`). A wave used to be
 * strictly "scan, then enumerate, then quote", and on an endpoint that caps `eth_getLogs` the scan
 * half can outlast the caller's whole budget. When it does, the enumerate-and-quote half runs
 * against an already-aborted signal: `quoteCandidates` refuses to issue calls (correctly — an abort
 * is a stop request), so every candidate the wave's scans had just discovered is counted
 * `unattempted` and the wave converts a minute of real time into exactly zero price information.
 * Measured live on Base: `49 candidates · 10 attempted · 39 never attempted`, with the 39 being
 * precisely what wave 2 had gone looking for. Quoting every {@link QUOTE_INTERLEAVE_MS} bounds what
 * an abort can strand to one interval's worth of discovery instead of a whole wave's.
 *
 * IT CHANGES WHEN QUOTES HAPPEN, NOT WHAT IS TRUE ABOUT THEM. Every accounting rule the report rests
 * on is preserved by construction rather than by care:
 *
 *  - A route is still quoted at most once per search: `quoteNew` adds each candidate's `routeId` to
 *    `state.seen` synchronously, before it awaits anything, so a pass and the wave's own closing
 *    `quoteEnumerated` cannot both submit the same candidate however they interleave.
 *  - `enumeration` is still last-enumeration-wins: the wave's closing `quoteEnumerated` runs after
 *    this returns, so the counters describe the largest index the wave ever saw, exactly as before.
 *  - `quoting.unattempted` stays honest in both directions. Candidates a pass priced are `attempted`;
 *    candidates discovered after the last pass and stranded by the abort are still generated, still
 *    counted, and still reported as never attempted — the number gets smaller because the work got
 *    done, not because the accounting looked away.
 *  - Only one pass is ever in flight (each is awaited before the next timer starts), so the extra
 *    `eth_call`s share the router's semaphore with the scans rather than doubling the peak.
 *
 * Reading the index while the scans write to it is safe for the reason it is not worth guarding:
 * `generateRoutes` is synchronous and `ingestLogs`' upserts are synchronous, so neither can observe
 * the other mid-update on a single-threaded runtime.
 *
 * `discovery`'s own rejection is not swallowed — it is rethrown by the final `await`, so a wave that
 * genuinely fails still fails, and it fails after the pump has stopped rather than alongside it.
 */
async function quoteWhileDiscovering(run: Run, discovery: Promise<unknown>): Promise<void> {
  const interval = run.ctx.quoteInterleaveMs ?? QUOTE_INTERLEAVE_MS
  let discovering = true
  const tracked = discovery.finally(() => {
    discovering = false
  })

  while (discovering) {
    await settleOrAfter(tracked, interval)
    // An aborted search stops here rather than enumerating into a `quoteCandidates` that will refuse
    // the calls: the closing `quoteEnumerated` below is what records those candidates as never
    // attempted, and doing it twice would double-count nothing but would burn a `generateRoutes`.
    if (!discovering || run.req.signal?.aborted) break
    await quoteEnumerated(run)
  }

  await tracked
}

// ---------------------------------------------------------------------------
// Focus selection
// ---------------------------------------------------------------------------

function touchingRecords(index: PoolIndex, endpoint: CurrencyRef): PoolRecord[] {
  return [...index.neighbors(endpoint).values()].flat()
}

function hasHintedPool(index: PoolIndex, endpoint: CurrencyRef): boolean {
  return touchingRecords(index, endpoint).some((r) => r.source === 'hint')
}

/** Identity comparison for currencies when no wrappedNative is available to normalize the family. */
function normalizeRef(c: CurrencyRef): string {
  return c === 'native' ? 'native' : c.toLowerCase()
}

function newestHintedBlock(index: PoolIndex, endpoint: CurrencyRef): bigint | undefined {
  let best: bigint | undefined
  for (const r of touchingRecords(index, endpoint)) {
    if (r.source !== 'hint' || r.createdAtBlock === undefined) continue
    if (best === undefined || r.createdAtBlock > best) best = r.createdAtBlock
  }
  return best
}

/**
 * Picks the endpoint whose adjacency wave 2 scans. Order (spec): explicit `focusToken` → the
 * endpoint that appears in a hint → the endpoint with fewer cached adjacent pools → the endpoint
 * with the newer hinted pool → `tokenIn`. For a fresh launch this makes the two-hop search
 * complete relative to the new asset's adjacency without ever pulling WETH's or USDC's.
 *
 * The result is *always one of the two endpoints*. `focusToken` names which endpoint to scan first,
 * not an arbitrary token to scan instead: honoring a non-endpoint focus would leave one endpoint's
 * adjacency never scanned while the report still claimed complete discovery, turning a search that
 * never looked into an authoritative "no route exists". A focus that is neither endpoint is
 * ignored, and the normal ordering decides.
 */
export function selectFocus(req: QuoteRequest, index: PoolIndex, wrappedNative?: Address): CurrencyRef {
  const { tokenIn, tokenOut } = req

  if (req.focusToken !== undefined) {
    const focusNode = wrappedNative ? toGraphNode(req.focusToken, wrappedNative) : normalizeRef(req.focusToken)
    const inNode = wrappedNative ? toGraphNode(tokenIn, wrappedNative) : normalizeRef(tokenIn)
    const outNode = wrappedNative ? toGraphNode(tokenOut, wrappedNative) : normalizeRef(tokenOut)
    if (focusNode === inNode) return tokenIn
    if (focusNode === outNode) return tokenOut
  }

  const inHinted = hasHintedPool(index, tokenIn)
  const outHinted = hasHintedPool(index, tokenOut)
  if (inHinted !== outHinted) return inHinted ? tokenIn : tokenOut

  const inNeighbors = index.neighbors(tokenIn).size
  const outNeighbors = index.neighbors(tokenOut).size
  if (inNeighbors !== outNeighbors) return inNeighbors < outNeighbors ? tokenIn : tokenOut

  const inNewest = newestHintedBlock(index, tokenIn)
  const outNewest = newestHintedBlock(index, tokenOut)
  if (inNewest !== outNewest) {
    if (inNewest === undefined) return tokenOut
    if (outNewest === undefined) return tokenIn
    return inNewest > outNewest ? tokenIn : tokenOut
  }

  return tokenIn
}

function otherEndpoint(run: Run, focus: CurrencyRef): CurrencyRef {
  const { req, ctx } = run
  return node(focus, ctx.manifest) === node(req.tokenIn, ctx.manifest) ? req.tokenOut : req.tokenIn
}

/** The most promising known neighbors of `endpoint` (newest pool first, then stable), capped. */
function pickNeighbors(run: Run, endpoint: CurrencyRef, exclude: Address[], cap: number): Address[] {
  const excluded = new Set(exclude.map((a) => a.toLowerCase()))
  const scored: { node: Address; newest: bigint }[] = []
  for (const [neighbor, records] of run.ctx.index.neighbors(endpoint)) {
    if (excluded.has(neighbor.toLowerCase())) continue
    let newest = 0n
    for (const r of records) if (r.createdAtBlock !== undefined && r.createdAtBlock > newest) newest = r.createdAtBlock
    scored.push({ node: neighbor as Address, newest })
  }
  scored.sort((a, b) => (a.newest !== b.newest ? (a.newest > b.newest ? -1 : 1) : a.node < b.node ? -1 : a.node > b.node ? 1 : 0))
  return scored.slice(0, cap).map((s) => s.node)
}

// ---------------------------------------------------------------------------
// Waves
// ---------------------------------------------------------------------------

/**
 * Hints, cached pools, speculative direct probes, the v4 exact-pair scan, and (for swaps) the
 * route-independent readiness reads — all in flight at once. The exact-pair scan is a log query and
 * therefore the slow one, so it must never gate the probes; everything is folded in before the
 * wave's candidates are enumerated and ranked.
 */
async function wave0(run: Run): Promise<void> {
  const { ctx, req, state } = run

  const probes = enabledModules(ctx).flatMap((m) => m.speculativeDirect(req.tokenIn, req.tokenOut, req.amountIn, ctx.manifest))

  const readiness =
    run.kind === 'swap'
      ? checkReadiness({
          client: ctx.client,
          trader: run.req.trader,
          currencyIn: req.tokenIn,
          amountIn: req.amountIn,
          // Safe to require here: `validateSwapRequest` already rejected a swap request against an
          // execution-less manifest, synchronously, before this search ever started (C4-P3).
          permit2: requireExecution(ctx.manifest).permit2,
          router: requireExecution(ctx.manifest).address,
          ...(run.req.permit !== undefined && { permit: run.req.permit }),
          blockNumber: state.block.number,
          blockTimestamp: state.block.timestamp,
          semaphore: ctx.semaphore,
        })
      : Promise.resolve(undefined)

  const [, , , readinessResult] = await Promise.all([
    resolveHints(run),
    // THE WINDOW IS THIS WAVE'S DECISION, and it is the one that makes wave 0 a latency budget
    // rather than a completeness one (see this file's header). The pair scan reaches back roughly a
    // week of this chain's own blocks and no further; wave 2 finishes the history.
    //
    // DERIVED FROM THE MANIFEST, not a constant (C4-P1): the policy is "roughly the last week", and
    // only this chain's block time turns that into a block count. A fixed block count would mean a
    // week on mainnet and a day on Base for the same code — see
    // `constants.ts#WAVE0_RECENT_WINDOW_SECONDS`.
    scanExactPairRecent(run, { window: wave0PairScanBlocks(ctx.manifest) }),
    runRouteProbes(run, probes),
    readiness,
  ])
  if (readinessResult !== undefined) {
    state.requirements = readinessResult.requirements
    // A requirement set assembled from reads that did not all land is not a to-do list anyone should
    // act on, so it is never promised as `needs-action` (see `verifyLeader`) and the search reports
    // degraded verification — readiness IS verification, just the read-only half of it.
    if (readinessResult.degraded) {
      state.readinessDegraded = true
      state.verificationDegraded = true
    }
  }

  await quoteEnumerated(run)
}

/** Validates caller hints into pool records. A hint is an assertion, never trusted as identity: the
 * module recomputes the pool (locally, or with one pinned call) and a mismatch simply drops it. */
async function resolveHints(run: Run): Promise<void> {
  const { ctx, req, state } = run
  const hints = req.hints ?? []
  if (hints.length === 0) return

  const call = (c: EthCall): Promise<Hex> => ethCall(ctx.client, c, state.block.number, ctx.semaphore)
  const results = await mapConcurrent(hints, ctx.semaphore ?? DEFAULT_CONCURRENCY, async (hint) => {
    const module_ = ctx.modules[hint.protocol]
    if (!module_.enabled(ctx.manifest)) return null
    return module_.validateHint(hint, call, ctx.manifest)
  })
  for (const result of results) {
    if (result instanceof Error || result === null) continue
    ctx.index.upsert(result)
  }
}

/**
 * Core intermediates: probe both legs of tokenIn -> core -> tokenOut for every enabled protocol,
 * concurrently with the fee-tier discovery scan whose results then widen the *direct* pair probes
 * to every tier the factory has ever enabled (wave 0 could only reach the standard ones).
 */
async function wave1(run: Run): Promise<void> {
  const { ctx, req, state } = run
  const wrapped = ctx.manifest.wrappedNative
  const endpoints = new Set([node(req.tokenIn, ctx.manifest), node(req.tokenOut, ctx.manifest)])
  const cores = (ctx.manifest.coreIntermediates ?? [wrapped]).filter((t) => !endpoints.has(t.toLowerCase() as Address))

  for (const core of cores) {
    const key = core.toLowerCase()
    if (!state.intermediatePriority.includes(key)) state.intermediatePriority.push(key)
  }

  const probes: QuoteProbe[] = []
  for (const core of cores) {
    for (const module_ of enabledModules(ctx)) {
      probes.push(...module_.speculativeDirect(req.tokenIn, core, req.amountIn, ctx.manifest))
      probes.push(...module_.speculativeDirect(core, req.tokenOut, req.amountIn, ctx.manifest))
    }
  }

  const feeModules = enabledModules(ctx).filter((m) => m.feeDiscovery !== undefined)
  // THE BUDGET IS THIS WAVE'S DECISION, because it is a fact about WHERE the scan sits, not about
  // what the scan is. `discoverFeeTiers` is a FULL-HISTORY scan running here in wave 1 — ahead of
  // the adjacency scans in waves 2 and 3, which are the ones the search reports coverage for and the
  // ones a two-hop route depends on — and a wave awaits everything in it. On a provider that serves
  // wide windows the whole history is a few requests and the budget never binds; on one that caps
  // `eth_getLogs` at 10,000 blocks it is thousands, and un-budgeted it consumed every remaining
  // millisecond of a `--budget 60s` search, so neither adjacency wave ever started and all three
  // protocols reported "nothing covered yet". See `constants.ts#FEE_DISCOVERY_MAX_REQUESTS` for the
  // measurements and for why the bound is on requests rather than on a recent block window (fee
  // enablements are OLD — Base's newest is 29.8M blocks back — so there is no window that is both
  // small and where the answers are).
  //
  // Bounded or not, on a capped endpoint it is still seconds — long enough for an abort to land
  // inside it, so it gets the same quote-as-you-go treatment as the adjacency waves below.
  await quoteWhileDiscovering(
    run,
    Promise.all([
      runDiscoveryProbes(run, probes),
      ...feeModules.map((m) => discoverFeeTiers(run, m, { maxRequests: FEE_DISCOVERY_MAX_REQUESTS })),
    ]),
  )

  // Nonstandard tiers can carry the whole trade, so these are route probes, not discovery probes.
  // Tiers already probed in wave 0 dedupe by routeId and cost nothing.
  const feeProbes = feeModules.flatMap((m) => {
    const fees = ctx.index.enabledFees(m.id, m.feeDiscovery!.query(ctx.manifest).address)
    return fees.length === 0 ? [] : m.feeDiscovery!.probes(req.tokenIn, req.tokenOut, req.amountIn, fees, ctx.manifest)
  })
  await runRouteProbes(run, feeProbes)

  await quoteEnumerated(run)
}

/** Focus-endpoint adjacency, then exact-pair probes from each new neighbor to the other endpoint. */
async function wave2(run: Run): Promise<void> {
  const { ctx, req, state } = run
  const focus = selectFocus(req, ctx.index, ctx.manifest.wrappedNative)
  state.focus = focus

  // Wave 2 is already scan-bound, so the exact pair's remaining history rides along with the focus
  // adjacency rather than adding a wave of its own — and, being the wave most likely to outlive the
  // caller's budget, it is the one `quoteWhileDiscovering` exists for.
  await quoteWhileDiscovering(run, Promise.all([scanAdjacency(run, focus), completeExactPairScan(run)]))

  const other = otherEndpoint(run, focus)
  const endpoints = [node(req.tokenIn, ctx.manifest), node(req.tokenOut, ctx.manifest)]
  const neighbors = pickNeighbors(run, focus, endpoints, MAX_INTERMEDIATES)
  const probes = neighbors.flatMap((neighbor) =>
    enabledModules(ctx).flatMap((m) => m.speculativeDirect(neighbor, other, req.amountIn, ctx.manifest)),
  )

  await runDiscoveryProbes(run, probes)
  await quoteEnumerated(run)
}

/** The other endpoint's adjacency, then the complete bounded cross product over both neighborhoods. */
async function wave3(run: Run): Promise<void> {
  const focus = run.state.focus ?? selectFocus(run.req, run.ctx.index, run.ctx.manifest.wrappedNative)
  await quoteWhileDiscovering(run, scanAdjacency(run, otherEndpoint(run, focus)))
  await quoteEnumerated(run)
}

const WAVES: ((run: Run) => Promise<void>)[] = [wave0, wave1, wave2, wave3]

/** The number of waves the engine runs, exported so callers reasoning about a per-search cumulative
 * count (e.g. `internal/testing.ts#assertResultCoherent`'s `preflightAttempted` sanity bound) have an
 * honest ceiling to check against instead of a hand-copied literal that could drift from `WAVES`. */
export const WAVE_COUNT = WAVES.length

/** Identity of what the caller would observe, so a wave that changed nothing stays silent. */
function signatureOf(result: InternalResult): string {
  const best = result.best
  return [
    best ? routeId(best.route) : '-',
    best?.quote.amountOut ?? '-',
    best?.execution ?? '-',
    result.requirements?.length ?? '-',
    result.tx?.data ?? '-',
  ].join('|')
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/**
 * Runs the bounded wave search, yielding the current best after every wave that improves it (or
 * changes its requirements/verification status) and always yielding a final `done: true` result
 * carrying the complete {@link SearchReport}.
 *
 * The generator is lazy: a wave runs only when the consumer pulls. A caller that stops at the first
 * actionable result never pays for the later waves' log scans, and abandoning the iterator early
 * keeps everything the shared `PoolIndex` learned along the way.
 *
 * `signal` is honored between waves and passed down into the log scanner and the quoting engine;
 * an abort finalizes immediately with `report.aborted = true`, `done: true`, and the best route
 * found so far — abort is a stop request, not an error.
 */
export async function* searchWaves(
  ctx: SearchContext,
  req: QuoteRequest | SwapRequest,
  kind: 'quote' | 'swap',
): AsyncGenerator<InternalResult> {
  const { block, regressed } = await fetchBlock(
    ctx.client,
    maxPlausibleHeadRegression(reorgOverlapBlocksOf(ctx.manifest)),
    ctx.head,
    ctx.semaphore,
  )
  // The one seam where `req` and `kind` — two independently-typed parameters of this exported
  // function's public (ctx, req, kind) surface — are asserted to be the correlated pair `Run`'s
  // variants require. Every caller in this codebase passes them paired (`getQuote`/`quotes` always
  // with `'quote'` + `QuoteRequest`, `getSwap`/`swaps` always with `'swap'` + `SwapRequest`), so this
  // is the single, deliberate cast that replaces the `req as SwapRequest` casts that used to be
  // scattered through every function below that needed the swap-only fields.
  const run = { ctx, req, kind, state: initialState(block, regressed) } as Run

  let lastSignature: string | undefined

  for (let i = 0; i < WAVES.length; i++) {
    if (req.signal?.aborted) {
      run.state.aborted = true
      yield await evaluate(run, true)
      return
    }

    await WAVES[i]!(run)
    if (req.signal?.aborted) run.state.aborted = true

    const done = run.state.aborted || i === WAVES.length - 1
    const result = await evaluate(run, done)
    const signature = signatureOf(result)
    if (done || signature !== lastSignature) {
      lastSignature = signature
      yield result
    }
    if (done) return
  }
}
