import type { Address, Hex, PublicClient } from 'viem'

import {
  DEFAULT_CONCURRENCY,
  FEE_DISCOVERY_MAX_REQUESTS,
  MAX_INTERMEDIATES,
  MAX_POOLS_PER_LEG,
  maxPlausibleHeadRegression,
  QUOTE_INTERLEAVE_MS,
  WAVE0_PAIR_SCAN_GRACE_MS,
} from '../constants'
import { RpcUnavailableError } from '../errors'
import { toGraphNode } from '../internal/currency'
import { ethCall, mapConcurrent } from '../internal/rpc'
import type { Semaphore } from '../internal/rpc'
import { reorgOverlapBlocksOf, requireExecution, wave0PairScanBlocks } from '../manifest'
import type { PoolIndex } from '../pools/poolIndex'
import { routeId } from '../protocols'
import type { ProtocolModule, QuoteProbe } from '../protocols/types'
import { probeQuotes, quoteCandidates, rankRoutes } from '../quote/quote'
import type { QuoteStats } from '../quote/quote'
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

import { generateRoutes } from './candidates'
import { enabledModules, node } from './context'
import { completeExactPairScan, discoverFeeTiers, scanAdjacency, scanExactPairRecent } from './discovery'
import { evaluate } from './leader'

// ---------------------------------------------------------------------------
// The wave engine — the only module that owns *policy*: what to look at first,
// when to stop looking, and when the caller deserves to hear about it.
//
// Everything below it (discovery, quoting, compiling, encoding, verifying) is
// a stage primitive that holds no policy at all, so this file is where the
// search's shape lives:
//
//   wave 0a hints (validated) + cached pools + speculative direct probes from
//           every enabled module + the CONTENTION-GATED core half-pair probes
//           (`probeContendedCoreLegs` — wave 1's `tokenIn -> core` /
//           `core -> tokenOut` evidence pass, pulled a wave early for exactly
//           the cores whose legs already face per-pair slot pressure in the
//           index this search woke up with, because wave 0a's closing
//           enumeration is the first one an anytime consumer ever sees)
//           + (swaps) the route-independent readiness reads — all
//           concurrently, because a launcher-hinted brand-new asset should be
//           routable without a single historical log scan. EVERYTHING HERE
//           SETTLES IN ONE OR TWO ROUND TRIPS.
//   wave 0b the RECENT-WINDOW v4 exact-pair Initialize scan — DISPATCHED by
//           wave 0a (so its round trips overlap 0a's) and waited on there only
//           for a BOUNDED grace, then AWAITED in full here, so the quotes above
//           are never gated on a log query for longer than that grace. See
//           WAVE 0 ANSWERS BEFORE THE PAIR SCAN LANDS below.
//   wave 1  core intermediates: probe both legs of tokenIn -> core -> tokenOut
//   wave 2  adjacency for BOTH endpoints, in four merged `eth_getLogs` chains
//           rather than twelve (C5-C — address arrays and OR-topics; see
//           `discovery.ts#scanAdjacency`), plus the exact pair's remaining
//           history; then exact-pair probes from each discovered neighbor to
//           the other endpoint
//   wave 3  a retry of that adjacency for whatever wave 2 did not manage to
//           cover (free when it covered everything), then the full bounded
//           cross product over everything the index now knows
//
// The engine's stages live in three sibling files, each with its own header:
// `discovery.ts` (log-scan orchestration), `leader.ts` (compile/encode/
// simulate, and the ordering invariant that makes needs-action-vs-verified
// gating sound), `report.ts` (SearchReport assembly). What all three share is
// `context.ts` (the three one-line accessors onto `SearchContext`) and
// `internal/ranges.ts` (the set arithmetic).
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
// WAVE 0 ANSWERS BEFORE THE PAIR SCAN LANDS (C5-B). Wave 0 used to await its
// probes and its exact-pair log scan under one `Promise.all`, which made the
// first-actionable answer — one `aggregate3` round trip — hostage to a log
// query. On a healthy keyed endpoint that costs nothing (the scan is ~0.3s and
// the probes are slower); on a timeout-shaped one the scan spends its whole
// retry ladder, ~40s, while a hinted or direct-pair price sat finished in
// `state.quoted` the entire time. That is precisely the case wave 0 exists for
// — a launcher handing us a brand-new pool on a provider having a bad minute —
// and the old shape defeated it exactly when it mattered.
//
// So the scan is DISPATCHED in wave 0a, waited on there for a BOUNDED GRACE
// (`WAVE0_PAIR_SCAN_GRACE_MS`, 500ms), and AWAITED IN FULL in wave 0b. The
// grace is not a hedge — it is what keeps the fix from trading one failure for
// another. A bare split bounds the degraded provider perfectly and quietly
// wrecks the healthy one, because span-capped is the COMMON endpoint: a scan
// that is many chunked requests is never finished when the probes are, so an
// actionable wave 0a excludes its pools essentially always (23 of 32 recorded
// log queries went unrequested on the hermetic Base corpus). Half a second
// covers the single-request keyed-endpoint case (~0.3-0.9s measured) and is
// all a timeout-shaped endpoint can ever take from the caller.
//
// Four properties make the arrangement sound:
//
//  - No wall clock is lost when both are fast. The scan's first request goes
//    out before 0a awaits anything, so the two overlap exactly as they did
//    under the `Promise.all`; the grace then usually finds it already settled,
//    and 0b awaits a promise that is already done.
//  - Nothing 0b discovers is lost. `runPairScan` writes to the shared index,
//    and 0b closes with the same `quoteWhileDiscovering` + `quoteEnumerated`
//    pair the scan-bound waves use, so a pool only the scan can find is priced
//    before wave 1 — and priced AS IT ARRIVES, not only at the end.
//  - The report cannot overclaim. The pair scan never writes
//    `ProtocolDiscovery.complete` (it is pair-scoped, not endpoint-scoped —
//    see `discovery.ts#exactPairPlan`), so a consumer that stops at 0a reads
//    `v4: partial` exactly as it did when the scan ran inside wave 0.
//  - The extra yield is an improvement event, not a new kind of event.
//    `signatureOf` still suppresses a stage that changed nothing, so 0b yields
//    only when the scan actually found something better.
//
// TWO COSTS, BOTH PAID KNOWINGLY. The first is a scan nobody is waiting for: a
// consumer that takes 0a's answer and walks away leaves the dispatched scan in
// flight. It is cancelled — see `startRecentPairScan` and `searchWaves`'
// `finally` — rather than left to hold a Node event loop open behind a CLI that
// has already printed its answer.
//
// The second is that a PROMISE-shaped caller whose wave 0a is already actionable
// (a validated hint, or a direct pair the speculative probes hit) can resolve
// without the pair scan's pools in its enumeration, where before it waited for
// them however long they took. The grace is what makes that a narrow case rather
// than the default: it only happens on a provider that cannot finish this window
// in half a second. And it stays bounded in the way that matters — a wave 0a
// with NO answer (the brand-new-asset case the recent-window scan exists for) is
// not actionable, so the search runs on into 0b and the scan still decides it,
// and the iterator shapes (`quotes()`/`swaps()`) always see the merged result.
//
// Speculative probes come in two flavors, and conflating them would be a
// correctness bug: a *route probe* (wave 0a) quotes tokenIn -> tokenOut and its
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
// wave 0b's yield, which is the opposite of what wave 0 is for. The remaining
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
   * The chain's Multicall3 deployment, PROBED (the router's once-per-lifetime `eth_getCode` check —
   * `router.ts#resolveMulticall3` — found real code there; never the canonical address on faith).
   * Threaded into every `quoteCandidates`/`probeQuotes` call this search makes, which then run each
   * quoting round as a few chunked `aggregate3` calls instead of one `eth_call` per candidate — see
   * `internal/multicall.ts` for the measured why. Absent (no deployment on this chain, a probe that
   * has not answered, or a one-off engine run below the facade), quoting is per-call, exactly as
   * before aggregation existed. Deliberately NOT used by hint validation (`resolveHints`: v3 hints
   * are one cheap call each, capped at `MAX_HINTS_PER_REQUEST`), readiness, or preflight — preflight
   * simulates a real transaction whose `from`/`value` are the whole point, the very shape
   * `aggregateCalls` refuses to aggregate.
   */
  multicall3?: Address | undefined
  /**
   * The router's `logChunkBlocks` option (C4-P6), threaded into every `scanLogs` call as its
   * `initialChunk` — the CEILING on the `eth_getLogs` window (starting width and regrowth alike),
   * provider-shaped rather than universal (see `constants.ts#MAX_SCAN_WINDOW`). Absent for a one-off
   * engine run, `scanLogs` falls back to `MAX_SCAN_WINDOW` itself.
   */
  logChunkBlocks?: bigint | undefined
  /**
   * Fired ONCE per search, with the leading route, the moment this search first has a price at all
   * — which is up to a whole wave earlier than the first yield.
   *
   * WHY THE ENGINE PUSHES THIS RATHER THAN YIELDING IT. Wave 0a runs its speculative route probes
   * CONCURRENTLY with everything else it awaits (hints, readiness, the contended-core evidence pass
   * — see {@link wave0a}), and the probes are one round trip while a two-stage evidence pass is
   * three: on a warm mainnet index the probes answer well before the stage they sit in closes.
   * Everything in that gap is time a streaming consumer spends with a printable answer already
   * sitting in `state.quoted` and no way to learn of it. Yielding an extra early event instead would
   * have said the same thing at the cost of changing the generator's yield SEQUENCE, which is a
   * contract three other things rest on: the facade's "stop at the first actionable event" loops
   * (`router.ts`), the yield-count assertions in `waves.test.ts`, and the recorded-replay goldens. A
   * callback adds a strictly new channel and moves none of them.
   *
   * THE GAP IT COVERS GOT SMALLER, AND THAT IS THE POINT (C5-B). It used to also span the wave-0
   * exact-pair log scan — many round trips, and on a degraded provider tens of seconds — because the
   * wave awaited the scan before yielding. The scan is wave 0b's now, so the first YIELD lands
   * roughly where this callback does. The callback is not thereby redundant: it still fires from the
   * quoting call itself, ahead of the enumeration, compilation and (for a swap) preflight simulation
   * that stand between a price existing and a stage closing.
   *
   * IT IS A NOTIFICATION, NOT A RESULT. What it carries is the current leader of `rankRoutes` over
   * everything priced so far — a real, quoted route, but one no later wave is bound by: a better
   * route almost always follows, and for a SWAP nothing here has been compiled, simulated, or
   * checked against the trader's readiness, so it is a lead rather than something to execute. The
   * yielded results remain the only thing this engine promises anything about.
   *
   * A THROWN CALLBACK NEVER FAILS THE SEARCH — it is swallowed (see {@link recordQuoted}), the same
   * posture as every other business outcome in this file. A host's rendering bug must not be able to
   * take down a search that is otherwise going fine.
   *
   * No timing is passed: the only clock that means anything to a consumer is its OWN (a CLI measures
   * from the moment it dispatched the search, which is not the moment `searchWaves` started), so the
   * callback hands over the route and lets the caller time it.
   */
  onFirstRoute?: ((route: QuotedRoute) => void) | undefined
  /**
   * Overrides the `eth_getLogs` retry backoff timer (`internal/logScan.ts`'s own `opts.sleep`),
   * threaded into every scan this search issues.
   *
   * A SEAM, AND ONLY A SEAM — the same role, and the same justification, as {@link quoteInterleaveMs}
   * below and as `scanLogs`' `opts.sleep` for a direct caller. The minimum-window retry ladder is
   * defined in wall-clock time (`BACKOFF_BASE_MS` doubling to `BACKOFF_MAX_MS`, bounded by
   * `MAX_BACKOFF_TOTAL_MS`), so a unit test of a FAILING endpoint has no way to observe the
   * give-up-and-report-partial behaviour without actually sleeping through the escalation: one such
   * test in `waves.test.ts` spent 1.75 real seconds proving that discovery reports `failed`. Nothing
   * in `router.ts` sets it, so every real search sleeps exactly as before.
   */
  scanSleep?: ((ms: number) => Promise<void>) | undefined
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
  /**
   * A pinned-block fetch DISPATCHED BEFORE this context existed, so its round trip overlaps
   * manifest validation and the multicall3 probe instead of starting after them (C5-A). `router.ts`
   * fires {@link fetchBlock} the moment a request comes in — using the same `client`/`head`/
   * `semaphore` this context carries, just read a few lines earlier off the same closure — and hands
   * the resulting promise in here rather than letting `searchWaves` call `fetchBlock` itself. Absent
   * for a one-off engine run (unit tests below the facade, `experimental` callers): `searchWaves`
   * then falls back to fetching fresh, exactly as it always has, so nothing below the facade has to
   * know this seam exists. Whichever way the block arrives, the head-watermark read/write and the
   * regression self-heal in {@link fetchBlock} run identically — this field only changes WHEN the
   * request goes out, never what happens with the answer.
   */
  pinnedBlock?: Promise<{ block: BlockRef; regressed: boolean }>
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
  /** The leading route's {@link CompiledRoute}, spread into the two fields the public result shape
   * declares. Present or absent together, by construction: they are read out of one record. */
  tx?: EncodedTx
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

/**
 * What one compile+encode produced for a route: the calldata, and the two numbers that calldata
 * asserts (`deliverOutput.minAmountOut`, and the deadline handed to the encoder).
 *
 * ONE RECORD RATHER THAN TWO PARALLEL MAPS, and that is the whole point of the type. These used to
 * be `txById` and `limitsById`, written on adjacent lines of `compileAndEncode` and read on adjacent
 * lines of `evaluate`, with three separate comments (here, in `leader.ts`, and in `router.ts`'s
 * `classifySwap`) each promising the reader that the two could never describe different plans for
 * the same routeId. A promise restated in three modules is a promise nothing enforces; a single
 * record makes it unstateable instead — there is no write that sets one without the other, and no
 * read that can find one without the other.
 */
export type CompiledRoute = { tx: EncodedTx; limits: CompiledLimits }

export type EngineState = {
  block: BlockRef
  /** routeId -> successfully quoted route, accumulated across waves. */
  quoted: Map<string, QuotedRoute>
  /** Whether {@link SearchContext.onFirstRoute} has already fired. "Once per search" is a property
   * of the SEARCH, not of the wave or the call that happened to price the first route, so the latch
   * lives here with the rest of the search's memory. */
  announcedFirstRoute: boolean
  /**
   * routeIds ever submitted for quoting — a route is never quoted twice in one search.
   *
   * WITH ONE EXCEPTION, AND IT IS THE POINT OF {@link transportRetried}: a candidate whose quote was
   * lost in the TRANSPORT channel is REMOVED from this set once the round settles, so a later wave
   * (or a later `quoteWhileDiscovering` pass) may submit it again. Membership therefore means "this
   * route has been asked about and the chain answered", not "an `eth_call` was addressed to it".
   *
   * WHY IT HAS TO. Aggregation made transport failure CHUNK-CORRELATED: one outer 429 marks up to
   * `MULTICALL_CHUNK` (50) candidates transport-failed at once (`internal/multicall.ts` coarsens an
   * outer failure across the whole chunk, deliberately). Every one of them was already in `seen`, so
   * before this they were never re-quoted for the rest of the search — a single provider hiccup
   * silently removed fifty routes from consideration, and the search went on to rank whatever
   * survived. The failure is invisible in the result: the report says `transportFailed: 50` and
   * `rpc-degraded`, which is honest about the round and says nothing about the fifty routes that
   * were never revisited even though three more waves ran.
   */
  seen: Set<string>
  /**
   * routeIds already given their one second chance after a transport failure.
   *
   * ONE RETRY, NOT UNLIMITED, because the retry is driven by re-enumeration and re-enumeration is
   * frequent: waves 1-3 each re-enumerate, and `quoteWhileDiscovering` re-enumerates every
   * `QUOTE_INTERLEAVE_MS` for the whole of a scan-bound wave. Against an endpoint that is 429ing
   * every `eth_call` — precisely the endpoint that produces these failures — an unbounded rule turns
   * each interleave pass into a fresh retry of everything, which is a retry storm aimed at a
   * provider that is already refusing. Capped at one, the worst case is that a search dispatches
   * each candidate twice.
   */
  transportRetried: Set<string>
  /** Discovery-probe ids already fired (probe results are pool evidence, not routes). Cleared for a
   * transport-failed probe on the same one-shot terms as {@link seen} — see {@link retryTransportFailures}. */
  probed: Set<string>
  execution: Map<string, ExecutionState>
  /** routeId -> everything `search/leader.ts#compileAndEncode` produced for it. */
  compiledById: Map<string, CompiledRoute>
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
  /**
   * Adjacency ranges this search has already covered, keyed by
   * `adjacencyPlan.ts#scopeKey` — the same handoff `pairScanned` is, for the same reason.
   *
   * `PoolIndex.uncovered` re-opens the tail of whatever it has covered on every read (the standing
   * reorg overlap), so without this wave 3 would re-request the last 32 blocks of everything wave 2
   * had just covered — in every single search. Only ranges actually COVERED go in, so a range a
   * wave failed on is still retried by the next one.
   */
  adjacencyScanned: Map<string, BlockRange[]>
  /**
   * Wave 0's recent-window exact-pair scan, DISPATCHED by wave 0a and AWAITED by wave 0b — the one
   * piece of engine work whose start and its await live in different stages, which is the whole of
   * the C5-B split (see this file's header).
   *
   * It lives on the state rather than in a closure because the two stages are separate entries in
   * {@link WAVES}, and it carries its own `cancel` because it can outlive the search: a consumer
   * that takes wave 0a's answer and stops pulling never reaches wave 0b, so nothing would otherwise
   * ever stop the scan. `searchWaves` cancels it in a `finally`, which covers the abandoned
   * iterator, the abort, and the ordinary completed search alike (cancelling a settled scan is a
   * no-op).
   *
   * Absent only before wave 0a has run — every search sets it, including one on a chain with no v4
   * deployment, where the scan is an immediately-resolved no-op (`exactPairPlan` returns undefined).
   */
  pairScan?: { done: Promise<void>; cancel: () => void }
  /** Graph nodes that have proven useful as intermediates, in priority order. */
  intermediatePriority: string[]
  /** Best single-leg quoted `amountOut` per `pool.id`, THIS search only — the feedback that lets
   * enumeration's per-pair selection prefer pools the search has already seen answer well over
   * pools that are merely newest (see `GenerateRoutesArgs.quoteEvidence` for why this is the one
   * signal that separates a dense pair's liquid pool from its junk, and why the values are only
   * comparable within one search). Written by {@link recordQuoteEvidence}; read by
   * {@link quoteEnumerated}. */
  quoteEvidence: Map<string, bigint>
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
    announcedFirstRoute: false,
    seen: new Set(),
    transportRetried: new Set(),
    probed: new Set(),
    execution: new Map(),
    compiledById: new Map(),
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
    adjacencyScanned: new Map(),
    intermediatePriority: [],
    quoteEvidence: new Map(),
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

/**
 * Feeds a quoting round's SINGLE-LEG results back into enumeration's per-pair selection
 * (`EngineState.quoteEvidence`). Single-leg only, and that is a correctness line, not a shortcut: a
 * multi-leg quote's `amountOut` is the product of every leg, so crediting it to any one pool would
 * rank that pool on its neighbors' behavior. Every channel that quotes single legs feeds this —
 * direct-pair candidates and wave-0/fee route probes via their callers below, and the half-pair
 * discovery probes via {@link runDiscoveryProbes} — because the half-pair probes are precisely the
 * calls that price a contended leg's standard-tier pools before enumeration must choose which 3
 * survive (`MAX_POOLS_PER_LEG`).
 */
function recordQuoteEvidence(run: Run, quoted: QuotedRoute[]): void {
  for (const q of quoted) {
    if (q.route.legs.length !== 1) continue
    const id = q.route.legs[0]!.pool.id
    const best = run.state.quoteEvidence.get(id)
    if (best === undefined || q.quote.amountOut > best) run.state.quoteEvidence.set(id, q.quote.amountOut)
  }
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
 *    `internal/rpcErrors.ts#revertDataOf`) is already filtered to failures whose revert carried NO data —
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

/**
 * Returns candidates the TRANSPORT lost to the pool a later pass may draw from — the one consumer of
 * `QuoteCandidatesResult.transportFailures`.
 *
 * A 429, a dropped socket, a node that could not serve the pinned block: none of them is evidence
 * about the route, which is why they are already kept out of the negative cache
 * (`quote/quote.ts` excludes them from `amountIndependentFailures` at the source). But keeping a
 * route out of the negative cache is worth nothing if it stays in `state.seen`, because `seen` is
 * what the next wave's enumeration filters against: the candidate is never submitted again, and the
 * search simply proceeds without it. Aggregation raised the stakes from one candidate per hiccup to
 * a whole `MULTICALL_CHUNK` (see {@link EngineState.seen}).
 *
 * THE ACCOUNTING, WHICH IS WHY THIS IS SAFE TO DO AT ALL. A retried candidate is counted AGAIN in
 * `enumeration.candidatesGenerated`, because both counters move together in the callers below:
 * every dispatching site does `candidatesGenerated += fresh.length` and
 * `attempted + unattempted += fresh.length` (the latter as `stats.attempted` plus the
 * `fresh.length - stats.attempted` shortfall), so the two increments are EQUAL, per call,
 * unconditionally. Both conservation bounds `internal/testing.ts#assertResultCoherent` enforces are
 * preserved by that equality rather than by argument:
 *
 *   * `unattempted <= candidatesGenerated` — per call, `unattempted` moves by at most what
 *     `candidatesGenerated` moves by.
 *   * `candidatesGenerated <= attempted + unattempted` — per call, exactly equal; a retry adds one
 *     more equal pair.
 *
 * So `candidatesGenerated` reads as "candidate quote DISPATCHES generated", which is what it has
 * always literally counted; before retries existed the distinction could not arise. The alternative
 * — a separate ever-generated set, so the count stays one-per-distinct-route — was rejected: it
 * breaks the per-call equality, and then `unattempted <= candidatesGenerated` has to be argued from
 * the fact that a retried candidate was necessarily `attempted` in the round that released it, which
 * is a proof rather than a construction, and the kind of proof a fourth quoting channel would
 * silently invalidate.
 */
function retryTransportFailures(run: Run, transportFailures: RouteCandidate[], from: 'seen' | 'probed'): void {
  const { state } = run
  for (const candidate of transportFailures) {
    const id = routeId(candidate)
    if (state.transportRetried.has(id)) continue
    state.transportRetried.add(id)
    if (from === 'seen') state.seen.delete(id)
    else state.probed.delete(`probe:${id}`)
  }
}

// ---------------------------------------------------------------------------
// Quoting steps
// ---------------------------------------------------------------------------

/**
 * Folds one `quoteCandidates`/`probeQuotes` call's outcome counters into the running report.
 *
 * THE FOUR COUNTERS HERE ARE THE ONES THAT MEAN THE SAME THING IN EVERY CHANNEL — each is a call
 * that went out and came back a particular way, which is true whether the caller was quoting a
 * route or probing for a pool. `unattempted` is deliberately NOT one of them: it is a shortfall the
 * CALLER computes (`fresh.length - stats.attempted`) against a denominator only the caller knows,
 * and one of the three call sites correctly reports none at all. See the two `unattempted` lines
 * below, and the comment where the third would have been.
 */
function tallyQuoting(state: EngineState, stats: QuoteStats): void {
  state.quoting.attempted += stats.attempted
  state.quoting.succeeded += stats.succeeded
  state.quoting.failed += stats.failed
  state.quoting.transportFailed += stats.transportFailed
}

/**
 * Merges one quoting call's survivors into the search's running set — and, the first time that set
 * becomes non-empty, hands the leader to {@link SearchContext.onFirstRoute}.
 *
 * THE NOTIFICATION LIVES HERE BECAUSE THE WRITE DOES. `state.quoted` is written by exactly two
 * callers (`quoteNew` and `runRouteProbes` — a discovery probe's amount is not a price for anything
 * the caller asked about, so `runDiscoveryProbes` deliberately writes nothing), and putting the
 * latch anywhere else would mean two places agreeing about when "the first route" happened. Both
 * lines now go through this function, so a third quoting channel added later gets the notification
 * for free rather than silently missing it.
 *
 * The leader is `rankRoutes`' own top pick over everything priced so far, not `quoted[0]` — the
 * caller is being handed the route it would lead with, and picking the first element of whatever
 * batch happened to land would hand over a worse one with no way to tell.
 */
function recordQuoted(run: Run, quoted: QuotedRoute[]): void {
  const { ctx, state } = run
  for (const q of quoted) state.quoted.set(routeId(q.route), q)

  if (state.announcedFirstRoute || ctx.onFirstRoute === undefined || state.quoted.size === 0) return
  state.announcedFirstRoute = true
  const leader = rankRoutes([...state.quoted.values()])[0]!
  try {
    ctx.onFirstRoute(leader)
  } catch {
    // A host's notification handler is not allowed to fail a search (see `onFirstRoute`'s doc): the
    // search has a real price in hand and every consumer downstream still deserves to receive it.
  }
}

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
  const { quoted, stats, amountIndependentFailures, transportFailures } = await quoteCandidates({
    client: run.ctx.client,
    modules: run.ctx.modules,
    manifest: run.ctx.manifest,
    candidates: fresh,
    amountIn: run.req.amountIn,
    blockNumber: state.block.number,
    semaphore: run.ctx.semaphore,
    multicall3: run.ctx.multicall3,
    ...(run.req.signal !== undefined && { signal: run.req.signal }),
  })

  tallyQuoting(state, stats)
  state.quoting.unattempted += fresh.length - stats.attempted
  retryTransportFailures(run, transportFailures, 'seen')
  recordSuccess(run, quoted)
  recordQuoteEvidence(run, quoted)
  recordFailures(run, amountIndependentFailures)
  recordQuoted(run, quoted)
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
  const { quoted, stats, amountIndependentFailures, transportFailures } = await probeQuotes({
    client: run.ctx.client,
    probes: fresh,
    amountIn: run.req.amountIn,
    blockNumber: state.block.number,
    semaphore: run.ctx.semaphore,
    multicall3: run.ctx.multicall3,
    ...(run.req.signal !== undefined && { signal: run.req.signal }),
  })

  tallyQuoting(state, stats)
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
  retryTransportFailures(run, transportFailures, 'seen')
  recordSuccess(run, quoted)
  recordQuoteEvidence(run, quoted)
  recordFailures(run, amountIndependentFailures)
  // THE EARLIEST POINT IN A SEARCH THAT A PRICE EXISTS, in the ordinary (unhinted, cached-index)
  // case: wave 0a's route probes are one round trip, and nothing slower is allowed to gate them —
  // the log scan they used to share a `Promise.all` with is wave 0b's now (C5-B). `recordQuoted` is
  // what turns that into something a streaming consumer can see before the stage even closes.
  recordQuoted(run, quoted)
}

/**
 * Probes single legs to learn whether their pools exist AND how well they answer. The returned
 * amounts are for one leg at the full input amount, which is not a quote for anything the caller
 * asked about, so they never become a route, a `state.quoted` entry, or a `candidatesGenerated` —
 * but they are NOT discarded: a successful probe marks its pool successful in the index
 * (`markSuccess`) and feeds `recordQuoteEvidence`, exactly the per-pair signal enumeration's leg
 * selection ranks by.
 *
 * THE DISCARD USED TO BE TOTAL, AND IT WAS THE WARM-INDEX ROUTE-QUALITY BUG. Half-pair core probes
 * are the one channel that prices a contended leg's standard-tier pools (`tokenIn -> core`,
 * `core -> tokenOut`) regardless of how dense the index already is — on a warm 655k-pool mainnet
 * index they had ALREADY quoted the liquid XPR/WETH v3 0.3% pool at 5.6x the best route the search
 * went on to return, and threw the answer away: `rememberPool` alone is a no-op on a pool the index
 * already knows, so warm enumeration kept handing every `MAX_POOLS_PER_LEG` slot to
 * newest-`createdAtBlock` junk and the liquid pool was never quoted as a route at all. A cold
 * search only ever dodged this by arrival order (these same probes ran while the index was sparse,
 * and the success marks they'd have earned as wave-1 route quotes held the slots once density
 * arrived). Recording the success is also what makes the hint story symmetric: failures were
 * already recorded below, so a discredited-but-genuine hinted pool on an intermediate pair could
 * accumulate failure history here but never earn back its rank.
 *
 * They are still `eth_call` quotes that succeeded or reverted, so they count in the report's
 * quoting stats.
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

  const { quoted, stats, amountIndependentFailures, transportFailures } = await probeQuotes({
    client: run.ctx.client,
    probes: fresh,
    amountIn: run.req.amountIn,
    blockNumber: state.block.number,
    semaphore: run.ctx.semaphore,
    multicall3: run.ctx.multicall3,
    ...(run.req.signal !== undefined && { signal: run.req.signal }),
  })

  tallyQuoting(state, stats)
  // A half-pair probe lost to the transport is released for one retry exactly as a route candidate
  // is — and here the accounting question does not even arise, since this channel claims no
  // `candidatesGenerated` and no `unattempted` (see the note directly below). Without it a chunk-wide
  // 429 permanently costs the evidence pass the very leg-selection signal it exists to produce.
  retryTransportFailures(run, transportFailures, 'probed')
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
  recordQuoteEvidence(run, quoted)
  for (const q of quoted) {
    // Every probe here is single-leg by construction, so — unlike `recordFailures`' two-leg
    // attribution gap — the success is unambiguously this one pool's.
    for (const leg of q.route.legs) {
      rememberPool(run, { pool: leg.pool, source: 'factory' })
      run.ctx.index.markSuccess(leg.pool, run.state.block.number)
    }
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
    quoteEvidence: state.quoteEvidence,
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
 * Picks the endpoint the search treats as the interesting one. Order (spec): explicit `focusToken`
 * → the endpoint that appears in a hint → the endpoint with fewer cached adjacent pools → the
 * endpoint with the newer hinted pool → `tokenIn`.
 *
 * WHAT IT STILL DECIDES, NOW THAT ONE REQUEST SCANS BOTH ENDPOINTS (C5-C). Both endpoints' adjacency
 * rides in wave 2's merged filters, so this no longer picks which endpoint gets scanned FIRST —
 * there is no longer a first. It picks the neighborhood wave 2 then probes OUTWARD from
 * (`pickNeighbors(run, focus, ...)`, each new neighbor probed against the other endpoint), which for
 * a fresh launch is what keeps the second wave's probe budget aimed at the new asset's few pools
 * rather than at WETH's thousands.
 *
 * The result is *always one of the two endpoints*. `focusToken` names an endpoint to prefer, not an
 * arbitrary token to probe from instead: honoring a non-endpoint focus would aim the whole
 * neighbor cross-product at a token neither side of the trade touches. A focus that is neither
 * endpoint is ignored, and the normal ordering decides.
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
 * Fires wave 0's recent-window exact-pair scan and hands back a handle wave 0b can await — the one
 * scan in the engine that is started in one stage and awaited in the next (C5-B, see this file's
 * header for why).
 *
 * THE WINDOW IS THE WAVE ENGINE'S DECISION, and it is the one that makes wave 0 a latency budget
 * rather than a completeness one. The pair scan reaches back roughly a week of this chain's own
 * blocks and no further; wave 2 finishes the history. DERIVED FROM THE MANIFEST, not a constant
 * (C4-P1): the policy is "roughly the last week", and only this chain's block time turns that into
 * a block count. A fixed block count would mean a week on mainnet and a day on Base for the same
 * code — see `constants.ts#WAVE0_RECENT_WINDOW_SECONDS`.
 *
 * IT CARRIES ITS OWN ABORT CONTROLLER because its lifetime is no longer the stage's. The consumer
 * this whole split exists for — `getSwap`/`getQuote`, which stop at the first actionable result —
 * takes wave 0a's answer and never pulls wave 0b, so without a cancel the scan would keep issuing
 * `eth_getLogs` (and, on the endpoint shape that motivated C5-B, keep sleeping through a ~40s retry
 * ladder) against a search nobody is waiting for: semaphore permits spent for a caller that has
 * gone, and a Node event loop held open behind a CLI that has already printed its answer — the same
 * failure mode `settleOrAfter` exists to avoid one stage over. The controller FORWARDS `req.signal`
 * rather than replacing it, so the caller's own abort still stops the scan exactly as it always did;
 * this is strictly an additional way to stop, never a way to keep going.
 *
 * The no-op rejection handler is the twin of that: with nothing awaiting `done` on the fast path, a
 * scan that threw would surface as an unhandled rejection. Wave 0b awaits the ORIGINAL promise, so
 * the failure is still raised — and still fails the search — for the consumer that gets that far.
 */
function startRecentPairScan(run: Run): { done: Promise<void>; cancel: () => void } {
  const controller = new AbortController()
  const outer = run.req.signal
  const forward = (): void => controller.abort()

  if (outer?.aborted) controller.abort()
  else outer?.addEventListener('abort', forward, { once: true })

  // Unsubscribed on BOTH exits, not just the scan's own: `req.signal` is frequently one long-lived
  // budget signal shared across many searches on a router, and the pathological case this whole
  // function exists for — a scan that is wedged and never settles — is exactly the one where the
  // `finally` below never runs. Leaving the listener behind there would accumulate one per search on
  // a signal that outlives all of them.
  const release = (): void => outer?.removeEventListener('abort', forward)

  const done = scanExactPairRecent(run, {
    window: wave0PairScanBlocks(run.ctx.manifest),
    signal: controller.signal,
  }).finally(release)
  done.catch(() => {})

  return {
    done,
    cancel: () => {
      controller.abort()
      release()
    },
  }
}

/**
 * Wave 0a — everything that can answer in a round trip or two: hints, cached pools, speculative
 * direct probes, the contention-gated core evidence pass, and (for swaps) the route-independent
 * readiness reads, all in flight at once, because a launcher-hinted brand-new asset should be
 * routable without a single historical log scan.
 *
 * WHAT IS NOT HERE IS THE POINT. The exact-pair log scan is DISPATCHED here — first, before this
 * stage awaits anything, so its round trips overlap the probes' exactly as they did when both sat
 * under one `Promise.all` — waited on for a BOUNDED grace at the end, and AWAITED IN FULL in wave
 * 0b. Nothing this stage yields is gated on a log query for longer than that grace (C5-B; see this
 * file's header and `constants.ts#WAVE0_PAIR_SCAN_GRACE_MS` for the measurements).
 */
async function wave0a(run: Run): Promise<void> {
  const { ctx, req, state } = run

  // FIRST, and before any `await`: the scan's first request goes out while this stage's own probes
  // are still being assembled, which is what keeps the split free on a healthy endpoint.
  state.pairScan = startRecentPairScan(run)

  const probes = enabledModules(ctx).flatMap((m) => m.speculativeDirect(req.tokenIn, req.tokenOut, req.amountIn, ctx.manifest))

  // Cores are first-class intermediates from the very first enumeration, not from wave 1. Free (no
  // RPC), and load-bearing on a warm index: wave 0a's closing `quoteEnumerated` is the anytime
  // contract's FIRST answer, and on a dense cached index `orderIntermediates`' fallback ranking
  // (newest-touching-pool) is exactly the recency heuristic that mis-ranks dense graphs.
  for (const core of coresOf(run)) {
    const key = core.toLowerCase()
    if (!state.intermediatePriority.includes(key)) state.intermediatePriority.push(key)
  }

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

  // Readiness deliberately FIRST, so the one element this destructuring names can never be silently
  // renumbered by a probe added to the batch (which is exactly how `probeContendedCoreLegs`'s
  // insertion briefly handed `readinessResult` a probe pass's `undefined`).
  //
  // AND THIS BATCH IS WHAT THE `leader.ts` INVARIANT MEANS BY "ONCE, IN WAVE 0, CONCURRENTLY": the
  // readiness reads are awaited here, in the FIRST stage, so every `evaluate` the generator runs —
  // wave 0a's included — already has `state.requirements` in hand. Splitting the wave moved the pair
  // scan out; it did not move this.
  const [readinessResult] = await Promise.all([readiness, resolveHints(run), runRouteProbes(run, probes), probeContendedCoreLegs(run)])
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

  // THE GRACE, AND WHY THE SPLIT ALONE WAS NOT THE WHOLE ANSWER. Dropping the scan from this stage
  // outright bounded the degraded case perfectly and quietly wrecked the healthy one: SPAN-CAPPED is
  // the common provider, not the exceptional one, so a scan that is many chunked requests — and
  // therefore never finished by the time the probes are — excluded its pools from the only
  // enumeration a promise-shaped caller ever sees, essentially always (23 of 32 recorded log queries
  // went unrequested on the hermetic Base corpus). Waiting a BOUNDED moment recovers the
  // single-request keyed-endpoint case at a cost the timeout-shaped endpoint can no longer inflate:
  // see `constants.ts#WAVE0_PAIR_SCAN_GRACE_MS` for the measurements behind the number.
  //
  // `settleOrAfter`, not a bare race: it clears its own timer, so a fast scan does not leave a
  // half-second handle holding a Node event loop open behind an answer that has already been given.
  // It also swallows the scan's rejection — deliberately. This is a scheduling wait, not the await
  // that owns the failure; wave 0b awaits the same promise and rethrows there, so a scan that throws
  // still fails the search, exactly once, for the consumer that gets that far.
  await settleOrAfter(state.pairScan.done, WAVE0_PAIR_SCAN_GRACE_MS)

  await quoteEnumerated(run)
}

/**
 * Wave 0b — the recent-window exact-pair scan wave 0a dispatched, awaited and folded in.
 *
 * SCAN-BOUND, SO IT QUOTES AS IT GOES, exactly like waves 1-3 (this file's header, property 4). The
 * scan is the only thing in this stage and the only thing in wave 0 that a capped or timing-out
 * endpoint can stretch past the caller's budget, so an abort landing inside it must strand at most
 * one interleave's worth of discovery rather than every pool the scan surfaced.
 *
 * A `undefined` handle means wave 0a never ran (nothing else can produce one), so there is nothing
 * to await; a chain with no v4 deployment still sets the handle, around an already-resolved no-op.
 */
async function wave0b(run: Run): Promise<void> {
  const pairScan = run.state.pairScan
  if (pairScan === undefined) return
  await quoteWhileDiscovering(run, pairScan.done)
  await quoteEnumerated(run)
}

/** The manifest's core intermediates (wrapped native when it declares none), minus any that IS an
 * endpoint of this request — an endpoint can never be its own intermediate. */
function coresOf(run: Run): Address[] {
  const { ctx, req } = run
  const endpoints = new Set([node(req.tokenIn, ctx.manifest), node(req.tokenOut, ctx.manifest)])
  return (ctx.manifest.coreIntermediates ?? [ctx.manifest.wrappedNative]).filter((t) => !endpoints.has(t.toLowerCase() as Address))
}

/**
 * Wave 0's warm-index evidence pass: the core half-pair probes (`tokenIn -> core`,
 * `core -> tokenOut`), issued a wave early for exactly the cores whose legs ALREADY face per-pair
 * slot pressure in the index this search woke up with.
 *
 * WHY A WAVE EARLY: wave 0a's closing `quoteEnumerated` is the first improvement the engine yields,
 * and an anytime consumer (`getQuote`, the CLI without `--watch`) rightly stops there. On a cold
 * index that enumeration has nothing to mis-rank — the index is empty or near it — but on a warm
 * dense index it is the whole game, and without evidence its contended-leg selection falls back to
 * newest-`createdAtBlock` junk (see `GenerateRoutesArgs.quoteEvidence`). Wave 1's probes produced
 * exactly the missing evidence one wave after the only enumeration that consumer will ever see —
 * measured live, the warm-cache XPR/USDC quote kept returning the 5.6x-worse junk route even with
 * evidence-ranked selection in place, because the evidence arrived after the answer.
 *
 * WHY GATED ON CONTENTION, PER CORE: a cold or sparse index (`pair(...)` at or under
 * `MAX_POOLS_PER_LEG` on both legs) enumerates every pool it knows, so evidence cannot change the
 * outcome and the probes would be pure added wave-0 cost on exactly the latency-critical path —
 * ungated, a majors quote would pay ~2 x |cores| x |protocol tiers| extra `eth_call`s for nothing.
 * Gated, the sparse case costs zero new requests, and the dense case pays two concurrent
 * `aggregate3` rounds' worth of calls it would have paid in wave 1 anyway (`state.probed` dedup
 * makes the full search's total identical).
 *
 * WHY TWO STAGES, NOT ONE BATCH: evidence is only as honest as the amount it was measured at, and
 * `req.amountIn` is denominated in TOKEN IN — for the `core -> tokenOut` leg it is dimensionally
 * the wrong number, wrong by whatever the price and decimal gap between tokenIn and the core is.
 * Measured live (XPR at 4 decimals -> WETH at 18): the out-leg probes quoted WETH -> USDC with 10^6
 * wei of WETH — dust — where a 0.01%-fee v4 pool out-ranks the deep v3 0.05% pool that wins at the
 * route's realized intermediate amount (~10^14 wei), and the warm best came out 0.3% under cold's.
 * So the in-legs are probed first at the request amount (their true input), and the out-legs at the
 * best realized intermediate output stage 1 observed — the same number the leading route's second
 * leg will actually be fed. A core whose stage 1 produced nothing falls back to `req.amountIn`,
 * which is the pre-existing behavior of the wave-1 probes and still ranks a pair's pools under
 * SOME consistent amount. The price is one extra sequential round trip, paid only under contention.
 *
 * THAT ROUND TRIP USED TO BE FREE AND IS NOT ANY MORE (C5-B). Wave 0 awaited a log scan, so these
 * two probe rounds hid entirely underneath it; wave 0a awaits nothing slower, so under contention
 * they ARE the stage's critical path. The trade is unchanged in kind and still worth making: the
 * dense-index enumeration these probes feed is the first — and, for an anytime consumer, the only —
 * answer the search produces, and a first answer 5.6x off the achievable price is not a latency win.
 * They remain gated on contention precisely so the sparse/cold case, where evidence cannot change
 * the outcome, pays nothing at all.
 */
async function probeContendedCoreLegs(run: Run): Promise<void> {
  const { ctx, req, state } = run
  const contended = coresOf(run).filter(
    (core) =>
      ctx.index.pair(req.tokenIn, core).length > MAX_POOLS_PER_LEG ||
      ctx.index.pair(core, req.tokenOut).length > MAX_POOLS_PER_LEG,
  )
  if (contended.length === 0) return

  // Stage 1: tokenIn -> core, at the request amount — exactly the input any in-leg would see.
  const inProbes = contended.flatMap((core) =>
    enabledModules(ctx).flatMap((m) => m.speculativeDirect(req.tokenIn, core, req.amountIn, ctx.manifest)),
  )
  await runDiscoveryProbes(run, inProbes)

  // Stage 2: core -> tokenOut, at the best realized intermediate amount stage 1 observed for that
  // core (see the docstring for why req.amountIn would be the wrong number here).
  const outProbes = contended.flatMap((core) => {
    let realized: bigint | undefined
    for (const rec of ctx.index.pair(req.tokenIn, core)) {
      const out = state.quoteEvidence.get(rec.pool.id)
      if (out !== undefined && (realized === undefined || out > realized)) realized = out
    }
    return enabledModules(ctx).flatMap((m) => m.speculativeDirect(core, req.tokenOut, realized ?? req.amountIn, ctx.manifest))
  })
  await runDiscoveryProbes(run, outProbes)
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
  const cores = coresOf(run)

  // Idempotent with wave 0's push (which see) — kept so this wave stays self-sufficient about the
  // cores whose legs it is about to probe.
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

/** Adjacency (both endpoints, merged), then exact-pair probes from each new neighbor to the other endpoint. */
async function wave2(run: Run): Promise<void> {
  const { ctx, req, state } = run
  const focus = selectFocus(req, ctx.index, ctx.manifest.wrappedNative)
  state.focus = focus
  const other = otherEndpoint(run, focus)

  // BOTH ENDPOINTS, IN THE SAME REQUESTS (C5-C). The endpoint sits in ONE topic slot, and a topic
  // slot OR-matches an array, so "pools touching tokenIn or tokenOut" is the same request count as
  // "pools touching tokenIn" — four chains for the whole search where the focus endpoint alone used
  // to cost six. Splitting the two endpoints across waves 2 and 3 bought wave 2 nothing once they
  // stopped being separate requests, and cost wave 3 a full second scan chain. Wave 3 still calls
  // `scanAdjacency` for the other endpoint: with everything covered it is free (`state
  // .adjacencyScanned` keeps it from re-asking the reorg tail), and where wave 2 was cut short —
  // aborted, budget-exhausted, a provider hole — it is the retry.
  //
  // Wave 2 is already scan-bound, so the exact pair's remaining history rides along with the
  // adjacency scans rather than adding a wave of its own — and, being the wave most likely to
  // outlive the caller's budget, it is the one `quoteWhileDiscovering` exists for.
  await quoteWhileDiscovering(run, Promise.all([scanAdjacency(run, [focus, other]), completeExactPairScan(run)]))

  const endpoints = [node(req.tokenIn, ctx.manifest), node(req.tokenOut, ctx.manifest)]
  const neighbors = pickNeighbors(run, focus, endpoints, MAX_INTERMEDIATES)
  const probes = neighbors.flatMap((neighbor) =>
    enabledModules(ctx).flatMap((m) => m.speculativeDirect(neighbor, other, req.amountIn, ctx.manifest)),
  )

  await runDiscoveryProbes(run, probes)
  await quoteEnumerated(run)
}

/**
 * The other endpoint's adjacency — a RETRY since C5-C, wave 2's merged scans having asked for it
 * already — then the complete bounded cross product over both neighborhoods.
 *
 * It stays a real call rather than becoming a no-op: everything wave 2 covered is subtracted here
 * (`EngineState.adjacencyScanned`), so a wave 2 that finished costs this wave nothing at all, while a
 * wave 2 that was aborted, ran out of request budget, or hit a provider hole leaves exactly the
 * blocks it missed for this wave to ask about again.
 */
async function wave3(run: Run): Promise<void> {
  const focus = run.state.focus ?? selectFocus(run.req, run.ctx.index, run.ctx.manifest.wrappedNative)
  await quoteWhileDiscovering(run, scanAdjacency(run, [otherEndpoint(run, focus), focus]))
  await quoteEnumerated(run)
}

// FIVE STAGES, FOUR WAVES. `wave0a`/`wave0b` are two entries because the generator's evaluate-and-
// yield step lives BETWEEN entries — that is the only reason they are split, and it is the whole
// C5-B fix: wave 0a's answer reaches the caller without waiting on wave 0b's log scan. They remain
// one wave conceptually (one latency budget, one recent-window look at the pair), and nothing
// downstream numbers them: the CLI's `wave N` counts YIELDS, not entries here.
const WAVES: ((run: Run) => Promise<void>)[] = [wave0a, wave0b, wave1, wave2, wave3]

/** The number of stages the engine runs, exported so callers reasoning about a per-search cumulative
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
 * Runs the bounded wave search, yielding the current best after every STAGE that improves it (or
 * changes its requirements/verification status) and always yielding a final `done: true` result
 * carrying the complete {@link SearchReport}.
 *
 * The generator is lazy: a stage runs only when the consumer pulls. A caller that stops at the first
 * actionable result never pays for the later waves' log scans, and abandoning the iterator early
 * keeps everything the shared `PoolIndex` learned along the way.
 *
 * STAGES, NOT WAVES, IS THE HONEST WORD FOR WHAT THIS LOOP ITERATES (C5-B): wave 0 is two entries in
 * {@link WAVES}, so that its probe half can be evaluated and yielded without waiting on its log-scan
 * half. Nothing about the yield CONTRACT changes — `signatureOf` still suppresses a stage that
 * changed nothing observable, so the extra entry produces an extra yield only when wave 0b's scan
 * actually improved on wave 0a's answer, which is an improvement event like any other.
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
  // `ctx.pinnedBlock`, when present, is a fetch `router.ts` already dispatched before this context
  // existed (C5-A) — awaited here instead of re-issued, so its round trip is the one that overlapped
  // manifest validation and the multicall3 probe rather than a fresh one starting after them. A
  // one-off engine run below the facade carries no such promise and gets the exact fetch this always
  // issued.
  const { block, regressed } = await (ctx.pinnedBlock ?? fetchBlock(
    ctx.client,
    maxPlausibleHeadRegression(reorgOverlapBlocksOf(ctx.manifest)),
    ctx.head,
    ctx.semaphore,
  ))
  // The one seam where `req` and `kind` — two independently-typed parameters of this exported
  // function's public (ctx, req, kind) surface — are asserted to be the correlated pair `Run`'s
  // variants require. Every caller in this codebase passes them paired (`getQuote`/`quotes` always
  // with `'quote'` + `QuoteRequest`, `getSwap`/`swaps` always with `'swap'` + `SwapRequest`), so this
  // is the single, deliberate cast that replaces the `req as SwapRequest` casts that used to be
  // scattered through every function below that needed the swap-only fields.
  const run = { ctx, req, kind, state: initialState(block, regressed) } as Run

  let lastSignature: string | undefined

  try {
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
  } finally {
    // THE ONE THING THAT CAN OUTLIVE THIS GENERATOR (C5-B): wave 0a DISPATCHES the recent-window
    // pair scan and wave 0b awaits it, so a consumer that takes wave 0a's answer and stops pulling —
    // which is exactly what `getQuote`/`getSwap` do, and exactly what the split is for — leaves that
    // scan in flight with nothing left to await it. Cancelling here covers every exit this generator
    // has (abandoned mid-iteration, aborted, or finished normally) with one line, and cancelling a
    // scan that already settled is a no-op, so the ordinary path pays nothing for it.
    run.state.pairScan?.cancel()
  }
}
