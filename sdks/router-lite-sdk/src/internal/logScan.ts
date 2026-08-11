import type { Hex, Log, PublicClient } from 'viem'
import { formatLog } from 'viem'

import { MAX_REQUESTS_PER_SCAN, MIN_CHUNK } from '../constants'
import type { BlockRange, LogQuery, MergedLogQuery } from '../types'

import { batchLimit, initialPolicy, nextStep, refusalFactsOf } from './logScanPolicy'
import { maxBig, mergeRanges, minBig } from './ranges'
import type { Semaphore } from './rpc'

// viem types each topic slot as `Hex | Hex[] | null` to allow OR-matching on
// array-typed indexed params. None of the creation-event topics this package
// builds index an array type, so a slot is never actually a `Hex[]` at
// runtime; this narrows the type to match `LogQuery` without weakening it to
// `unknown`/`any`. Shared by every protocol module that builds a `LogQuery`
// from `encodeEventTopics`.
export function narrowTopics(topics: (Hex | Hex[] | null)[]): (Hex | null)[] {
  return topics.map((t) => (Array.isArray(t) ? (t[0] ?? null) : t))
}

// ---------------------------------------------------------------------------
// Recent-first log scanner with adaptive range bisection.
//
// Providers cap `eth_getLogs` by result count or block span, and the cap is
// usually discovered empirically (rarely advertised up front). This walks
// backward from `toBlock` in windows, halving the window on any error and
// giving up a sub-range only after repeated failures at the smallest allowed
// window — recording exactly what was (and wasn't) covered so callers can
// decide whether a partial scan is good enough.
//
// THE WIDTH POLICY IS A PURE REDUCER, NOT PART OF THIS LOOP. Every decision
// about how wide the next request should be — the wide-start descent, the
// declared-cap and expensive-refusal fast paths, halving, regrowth, the
// minimum-window retry/backoff/give-up ladder — lives in
// `./logScanPolicy.ts#nextStep` as a `(state, outcome) -> (state', action)`
// transition function with its own table-driven tests. `scanLogs` below owns
// only the I/O around it: dispatching batches, the semaphore and abort, the
// request-budget accounting, coverage bookkeeping, `onLogs`, and reading /
// writing `opts.widthMemory` at the edges. The paragraphs that follow describe
// the machine's WHY at the scan level; the per-transition rationale sits on
// the reducer's branches.
//
// IT STARTS WIDE, ON PURPOSE (S1). The first window of every scan is
// `min(remaining range, ceiling)`, where the ceiling is `MAX_SCAN_WINDOW`
// (16M blocks — the widest single request measured served) unless the caller
// pinned a lower one via `opts.initialChunk`. The alternative — a conservative
// fixed start that is ALSO the regrowth ceiling, which is what this used to be
// — cannot discover anything: it asks for 10k, is served 10k, and concludes
// nothing, while a per-request latency that is overhead-dominated rather than
// width-dominated (456ms for 10k blocks, 89ms for 1M, measured live) makes
// every one of those extra round trips pure loss. Being refused is how the
// endpoint's real cap gets learned.
//
// NOT EVERY REFUSAL IS CHEAP, WHICH IS WHY THE DESCENT IS NOT PURELY log2. A
// provider that VALIDATES the span rejects an over-wide window without doing
// any work, and for those a 13-step halving ladder costs 13 round trips of
// nothing. A provider that instead EXECUTES the query and then refuses (a
// result-size cap) — or one that simply hangs until it times out, which this
// repo has captured drpc doing on archive reads — bills real time for every
// step, and viem retries a timeout three times at ~10s before the error even
// reaches this loop: a naive ladder there is minutes of zero progress. So the
// policy classifies (`internal/rpcErrors.ts#classifyRpcError`) and, on a
// transport/unavailable failure at a wide window, drops straight to
// `DESCENT_TIMEOUT_FALLBACK` rather than halving — one expensive failure buys
// the whole descent. A caller who already knows the cap skips all of it with
// `logChunkBlocks`.
//
// SOME PROVIDERS DO SAY (R2). blastapi, drpc, alchemy and quicknode all state
// the window that would have worked, in the error text, and
// `internal/rpcErrors.ts#parseDeclaredCap` reads it. When a cap is declared the policy
// skips the search entirely: it jumps the window straight to the stated
// cap, or — when that cap is below MIN_CHUNK, i.e. below anything this scanner
// will ever ask for — gives the sub-range up on the first error instead of
// spending a retry budget and a backoff escalation rediscovering the same
// sentence, and remembers NOTHING from it (a cap under the floor is not a
// ceiling; see the reducer's give-up branch for what remembering one cost).
// A message it does not recognize changes nothing; every bound below still
// applies.
//
// A DECLARED CAP LOWERS THE CEILING, NOT JUST THE WIDTH, and on a hard-capped
// endpoint that is worth more than the probes it skips. A cap is a policy: it
// will still be true in four chunks' time, so the regrowth ratchet must not
// double past it. Left un-clamped it does — probe, fail, halve, re-establish,
// forever — and because a width that CHANGED is a width nothing has served yet,
// each cycle also forces the next chunk out ALONE, collapsing the batching
// below to three sequential round trips per four chunks of real work.
// Quicknode's Base endpoint (10,000-block cap, 48M blocks of v3 history) is the
// endpoint that made this visible: clamping the ceiling is 1.39x on a six-scan
// adjacency fan-out, measured live, on top of the 1.28x from settling at the
// stated 10,000 rather than at the 7,812 blind halving lands on.
//
// AND IT IS REMEMBERED (see {@link ScanWidthMemory}). The descent is a search
// for a fact about the ENDPOINT, and one cold Base search runs seven scans that
// each used to re-derive it from scratch. `opts.widthMemory` carries the answer
// between calls — a start hint, plus the declared ceiling — so the search is
// paid for once per endpoint rather than once per scan, and (via
// `PoolIndex.toSnapshot`) once per machine rather than once per process.
//
// Three things keep that adaptation from becoming its own failure mode, since
// nothing above this bounds a scan's cost and the zero-config path passes no
// `AbortSignal`:
//
//   * The window GROWS BACK. Halving alone is a one-way ratchet: a single
//     transient error three requests into a multi-million-block range would
//     otherwise pin the whole remaining walk at a tiny window (tens of
//     thousands of sequential requests for a scan that should cost a handful).
//     After `CHUNK_REGROWTH_SUCCESSES` clean chunks the window doubles, capped
//     at the scan's ceiling (`opts.initialChunk ?? MAX_SCAN_WINDOW`) — which is
//     also what makes the wide start recoverable rather than one-way: the
//     ratchet climbs back toward the widest width this endpoint has actually
//     served for this query. Where the cap is real rather than transient the
//     probe fails and re-halves at once, so the steady-state cost is one wasted
//     request per `CHUNK_REGROWTH_SUCCESSES + 1` — bounded, and the price of
//     never being permanently crippled by one bad response.
//   * Every attempt is BUDGETED. `MAX_REQUESTS_PER_SCAN` counts successes and
//     failures alike; when it is spent the scan stops and returns what it
//     covered. `complete` is then false and the sub-ranges it never reached are
//     simply absent from `covered`, which is exactly how the caller's coverage
//     cache and the `SearchReport` already describe a partial scan — an
//     exhausted budget needs no new report surface, it *is* incomplete
//     discovery.
//   * Retries at the minimum window BACK OFF (exponential, capped per retry AND
//     in total). That path only runs when the endpoint is failing rather than
//     capping — usually a rate limit — and retrying a rate limit immediately is
//     how one becomes a tight loop aimed at the endpoint that is already
//     throttling. The per-scan sleep budget matters as much as the per-retry
//     cap: a full request budget's worth of maximum-length backoffs would be
//     over two hours of sleeping, which would make the request budget's
//     termination guarantee worthless.
//
// ONCE A WIDTH IS ESTABLISHED, CHUNKS GO OUT IN PARALLEL (P1). Everything above
// describes a SEARCH — for the width this endpoint will serve for this query —
// and a search has to be sequential, because each answer is what picks the next
// question. The WALK that follows it does not: the remaining sub-ranges are
// disjoint, their results are merged by `mergeRanges` (order-independent) and
// concatenated recent-first regardless of when they land, so nothing about the
// coverage math or the log ordering cares which order the wire delivers them
// in. Measured, that walk was the real bound on a cold drain — 7 of the router's
// 20 semaphore permits in use at the peak, because the per-query loop only ever
// had one request outstanding. So: the first chunk at any given width goes out
// ALONE, and only after it is SERVED does the loop start dispatching up to
// {@link SCAN_CHUNK_CONCURRENCY} same-width chunks together. The moment one of
// them fails, the batch's tail is discarded, the failure is handed to exactly
// the sequential descent below that would have received it, and the width is
// un-established again — so a capping or failing endpoint sees the identical
// one-at-a-time behaviour it always did, and only an endpoint that is actually
// serving gets asked for more than one thing at a time.
//
// Together these bound the WORK a scan can do, not the TIME it takes: 4,000
// sequential requests against an endpoint that takes a second to fail each one
// still runs for the better part of an hour before returning its partial
// answer. A caller with a latency budget must pass an `AbortSignal` — that is
// the only wall-clock bound there is, here or anywhere else in this package.
//
// The request is issued as a RAW `eth_getLogs` rather than through viem's
// `getLogs` action, and that is not a stylistic choice: viem's action derives
// the `topics` array exclusively from an `event`/`events` ABI argument and
// SILENTLY DROPS a caller-supplied `topics` field (it is not even in its
// parameter type). Handing it one of this package's `LogQuery` filters would
// therefore send `topics: []` — an unfiltered "every log this contract ever
// emitted" query. Discovery would still be correct (`parsePoolLog` rejects
// what it does not recognize), but every scan would pull the PoolManager's
// entire Swap/ModifyLiquidity stream instead of a handful of creation events,
// and the bisection below would spend the whole range fighting result caps.
// Raw logs come back with hex-encoded numbers, so `formatLog` normalizes them
// into the `Log` shape the protocol modules expect (`blockNumber` as bigint).
// ---------------------------------------------------------------------------

/**
 * Delay that an abort cuts short, used for the retry backoff.
 *
 * Exported for its own unit test rather than reached through `scanLogs`: the abort path is the half
 * that matters (it is what keeps a pending backoff from holding a Node event loop open for up to
 * {@link BACKOFF_MAX_MS} after the caller walked away) and the half a test with an injected `sleep`
 * never exercises. Resolves rather than rejects on abort — the scan loop re-checks the signal itself,
 * and a rejection here would be indistinguishable from a provider failure.
 */
/**
 * What one endpoint has taught this process about how wide an `eth_getLogs` window it will serve —
 * the memory that turns the descent below from a per-CALL cost into a per-ENDPOINT one.
 *
 * WHY IT EXISTS. The descent is a SEARCH, and every `scanLogs` call used to run its own from
 * scratch: a single cold Base search issues seven of them (three protocols x two topic-slot queries,
 * plus the v4 exact-pair scan), so an endpoint capping at 10k blocks was rediscovered seven times per
 * search and again on every later search and every later CLI invocation. The answer does not change
 * between calls, so it should not be paid for between calls.
 *
 * TWO FIELDS, BECAUSE THEY ARE NOT THE SAME CLAIM, and conflating them would be a correctness bug:
 *
 *  - `learnedScanWidth` is descriptive — the widest window this endpoint has actually SERVED. It is
 *    a starting HINT and nothing more: a scan that begins there still halves down if it is now too
 *    wide, and still regrows toward its ceiling if it is now too narrow. Being wrong costs a probe.
 *  - `declaredScanCap` is prescriptive — a ceiling the endpoint STATED in an error
 *    (`internal/rpcErrors.ts#parseDeclaredCap`). A scan may not exceed it, which is the whole point: see
 *    the ceiling discussion in this file's header for why a known ceiling is worth far more than the
 *    probes it saves.
 *
 * ONLY `learnedScanWidth` IS SAFE TO PERSIST ACROSS PROCESSES, and `pools/poolIndex.ts` persists
 * exactly that one. A snapshot is keyed by CHAIN, not by endpoint (two providers serving the same
 * chain share a cache file, deliberately — see `cli/cache.ts`), so a stored `declaredScanCap` of
 * 10,000 learned from quicknode would silently cap an alchemy run that serves 13M-block windows, at
 * 1,300x the requests, with nothing anywhere saying why. A stored `learnedScanWidth` of 10,000 in
 * that same situation costs the regrowth ratchet a handful of doublings to climb back out of, which
 * is a hint being wrong — the failure mode it is allowed to have.
 *
 * MERGED QUERIES SHARE THIS MEMORY, AND THAT IS THE CONSERVATIVE DIRECTION (C5-C). Both fields are
 * per ENDPOINT/PROVIDER, not per query: they answer "how wide a window will this provider serve",
 * and providers cap on RESULT COUNT as often as on span. A merged adjacency filter (v2's factory AND
 * v3's, both of the trade's endpoints — `protocols/adjacency.ts`) returns the UNION of what its
 * constituents would have returned, so it hits a result-count cap at a narrower span than any one of
 * them would have. The learned width therefore settles at the narrowest span any query in the search
 * needed, and every other query starts there.
 *
 * That is a small over-chunking of the narrow queries, never a correctness problem: `learnedScanWidth`
 * is a HINT, the regrowth ratchet climbs back out of it within a few doublings, and the alternative —
 * a width memory keyed by query shape — would re-pay the descent per shape and lose far more than
 * the over-chunking costs. Erring narrow is also the only direction that cannot fail: a width that is
 * too wide costs a refusal plus a halving, a width that is too narrow costs some extra requests.
 *
 * The one thing that narrowing DOES spend is budget headroom: `MAX_REQUESTS_PER_SCAN` bounds requests,
 * not blocks, so a merged chain settling at roughly a third of the width buys roughly a third of the
 * range per scan — against a result-count-capping provider a merged chain can reach its budget on a
 * history a per-protocol one would have finished. It is still a large net win (a third of the range
 * per chain, but a third as many chains, and one round trip where there were three), and the
 * shortfall reports itself the way every other bounded scan does: uncovered blocks and `partial`
 * discovery, carried to the next search rather than lost.
 */
export type ScanWidthMemory = {
  /** Widest window this endpoint has been observed to serve. A start hint; never a bound. */
  learnedScanWidth?: bigint
  /** A ceiling the endpoint declared in an error. A bound; never persisted (see above). */
  declaredScanCap?: bigint
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Scans `range` for logs matching `query`, recent-first (from `toBlock` backward),
 * bisecting the request window on provider errors and reporting exactly which
 * sub-ranges were successfully covered.
 *
 * Never throws on provider errors — a chunk that keeps failing at the minimum
 * window size is given up on (left out of `covered`) so the caller always gets
 * back whatever was found plus an honest coverage report, rather than an
 * exception that discards partial progress. Bounded the same way: a scan that
 * exhausts {@link MAX_REQUESTS_PER_SCAN} stops where it is and reports the
 * blocks it never reached as uncovered, so no scan can run unbounded against a
 * misbehaving endpoint.
 *
 * `opts.sleep` overrides the retry backoff timer (tests inject a recorder so
 * they do not wall-clock wait); production leaves it unset and gets
 * {@link delay}.
 *
 * `opts.semaphore` (C4-P6), when supplied, is acquired around each `eth_getLogs` `client.request`
 * below and released as soon as it settles — the other of the exactly two places (with `ethCall`)
 * a real request goes out, so the router's `concurrency` bound covers log scanning too, not just
 * quoting/verification. It is acquired PER CHUNK, not per scan, which is what keeps that bound exact
 * now that one scan can have up to {@link SCAN_CHUNK_CONCURRENCY} chunks in flight at once (P1).
 *
 * ONE SCAN IS NOT ONE REQUEST AT A TIME (P1). After a chunk at the current width has been served,
 * subsequent same-width chunks are dispatched in batches of up to {@link SCAN_CHUNK_CONCURRENCY}.
 * Nothing observable changes: `logs` still comes back recent-first (the batch is planned recent-first
 * and its results are appended in that order, not in completion order), `covered` is merged and so
 * order-independent, every dispatched request still counts against
 * {@link MAX_REQUESTS_PER_SCAN}, the abort is still honored between batches, and a failure anywhere
 * in a batch drops the batch's tail and hands the failure to the same sequential descent that would
 * have received it — so a failed chunk still covers exactly nothing. See this file's header.
 *
 * `opts.initialChunk` (`createRouter`'s `logChunkBlocks`) is a CEILING OVERRIDE, not a mandatory
 * start: it replaces {@link MAX_SCAN_WINDOW} as the widest window this scan may ever ask for, and the
 * first request spans `min(remaining range, override ?? MAX_SCAN_WINDOW)`. A caller fronting a
 * known-capped provider (Ankr's public endpoint caps `eth_getLogs` around 3k blocks) pins it there
 * and skips the bisection down; a caller who does not know starts at the empirical ceiling and lets
 * the endpoint's refusals find the real width (see this file's header).
 *
 * `opts.widthMemory` ({@link ScanWidthMemory}), when supplied, is READ for this scan's starting
 * width and ceiling and WRITTEN with whatever this scan learns — the seam that makes the descent a
 * per-endpoint cost rather than a per-call one. It is a plain mutable object shared by every scan on
 * one router (`search/coverage.ts` threads `PoolIndex`'s), and mutating it is safe under the
 * concurrent scans a single coverage pass issues: both fields are monotone — the hint only rises, the cap
 * only falls — so interleaved writes converge on the same value whatever order they land in, and a
 * lost update costs one probe. Omitted, every line below behaves exactly as it did before this
 * option existed.
 *
 * `opts.onLogs`, when supplied, is handed each chunk's logs AS THAT CHUNK IS SERVED — the seam that
 * makes a long scan incremental for its caller instead of all-or-nothing. It is purely additive
 * (`logs` still accumulates and is still returned whole) and it is best-effort: it must not throw,
 * and nothing about the scan's coverage, budget or descent depends on it. Its reason for existing is
 * `search/coverage.ts`, which used to ingest a scan's pools only once the entire multi-million-block
 * range had come back — long after a budgeted caller could do anything with them.
 *
 * `opts.maxRequests` narrows {@link MAX_REQUESTS_PER_SCAN} for THIS scan (never widens it), for a
 * caller whose scan is one of several competing for a latency budget and is not the one the caller
 * is waiting on. Running out of it is not an error and needs no new report surface: the scan stops
 * where it is and the blocks it never reached are simply absent from `covered`, which is already how
 * partial discovery is expressed everywhere else — the seam for a caller that must stop one scan
 * from starving whatever else shares its latency budget.
 */
export async function scanLogs(
  client: Pick<PublicClient, 'request'>,
  query: LogQuery | MergedLogQuery,
  range: BlockRange,
  opts: {
    signal?: AbortSignal
    /** `| undefined` like the four below it, so a caller threading a possibly-absent seam through
     * (`search/coverage.ts#scanOpts`) need not spread it conditionally: an explicit `undefined`
     * means "no override" here exactly as it does for `semaphore` and `initialChunk`. */
    sleep?: ((ms: number) => Promise<void>) | undefined
    semaphore?: Semaphore | undefined
    initialChunk?: bigint | undefined
    widthMemory?: ScanWidthMemory | undefined
    maxRequests?: number | undefined
    onLogs?: ((logs: Log[]) => void) | undefined
  },
): Promise<{ logs: Log[]; covered: BlockRange[]; complete: boolean; requests: number }> {
  const { fromBlock, toBlock } = range
  const logs: Log[] = []
  const coveredRaw: BlockRange[] = []
  const sleep = opts.sleep ?? ((ms: number): Promise<void> => delay(ms, opts.signal))
  const memory = opts.widthMemory

  // The request budget for THIS scan: {@link MAX_REQUESTS_PER_SCAN}, or a caller's tighter one. Only
  // ever narrows — a caller may buy less of the endpoint's time than the global ceiling allows, never
  // more, so the ceiling stays the one thing every scan in the package is bounded by.
  const requestBudget = Math.max(1, Math.min(opts.maxRequests ?? MAX_REQUESTS_PER_SCAN, MAX_REQUESTS_PER_SCAN))

  let cursor = toBlock
  let requests = 0
  // The width-policy machine's whole belief state (see `./logScanPolicy.ts`). `opts.widthMemory` is
  // READ exactly here — the start hint and any declared ceiling seed the initial state — and WRITTEN
  // back at the two loop edges below, so the reducer itself never sees the shared object.
  let policy = initialPolicy({
    rangeSpan: toBlock - fromBlock + 1n,
    ceilingOverride: opts.initialChunk,
    declaredScanCap: memory?.declaredScanCap,
    learnedScanWidth: memory?.learnedScanWidth,
  })

  /**
   * One `eth_getLogs` for `chunk`, under the router's semaphore. Failures are RETURNED, never thrown,
   * so `Promise.all` over a batch always settles and one bad chunk cannot discard its siblings'
   * results.
   *
   * THE ABORT CHECK AFTER `acquire()` IS THE POINT, NOT DEFENSIVE PADDING. `createSemaphore` is a
   * plain FIFO queue with no abort awareness: when a batch queues behind a busy router, each waiter
   * resolves whenever a permit frees, with no idea that the signal fired while it sat there. Without
   * this check, aborting a search with (say) three scans x four chunks queued means twelve full
   * `eth_getLogs` go out AFTER the caller walked away — the exact opposite of what an `AbortSignal`
   * is for, and worse the more concurrency P1 added. Checking once the permit is in hand costs
   * nothing and makes the abort bite at the last possible moment before the wire.
   *
   * A skipped chunk is its OWN outcome, not a failure: it neither covers anything nor is evidence
   * about the endpoint, so it must not reach the descent's halving/backoff logic (see the batch
   * handling below).
   */
  const fetchChunk = async (
    chunk: BlockRange,
  ): Promise<{ ok: true; result: Log[] } | { ok: false; err: unknown } | { skipped: true }> => {
    if (opts.signal?.aborted) return { skipped: true }
    try {
      await opts.semaphore?.acquire()
      try {
        if (opts.signal?.aborted) return { skipped: true }
        const result = (await client.request({
          method: 'eth_getLogs',
          params: [
            {
              address: query.address,
              topics: query.topics,
              fromBlock: `0x${chunk.fromBlock.toString(16)}` as Hex,
              toBlock: `0x${chunk.toBlock.toString(16)}` as Hex,
            },
          ],
        } as any)) as Log[]
        return { ok: true, result }
      } finally {
        opts.semaphore?.release()
      }
    } catch (err) {
      return { ok: false, err }
    }
  }

  while (cursor >= fromBlock) {
    if (opts.signal?.aborted) break
    if (requests >= requestBudget) break

    // How many chunks go out together (P1) is the policy's call (`logScanPolicy.ts#batchLimit` —
    // never past a regrowth boundary, width-established-then-parallel); the loop only supplies the
    // budget headroom, so a batch can never overshoot `MAX_REQUESTS_PER_SCAN` and the count stays
    // exact rather than approximate. `width` is pinned here because the batch is dispatched at THIS
    // width — the policy may have moved on by the time the memory hint is recorded below.
    const limit = batchLimit(policy, requestBudget - requests)
    const width = policy.chunkSize

    // Consecutive same-width sub-ranges walking backward from `cursor`, recent-first — the exact
    // sequence the sequential loop would have visited, planned up front instead of one at a time.
    const batch: BlockRange[] = []
    for (let planCursor = cursor; batch.length < limit && planCursor >= fromBlock; ) {
      const start = maxBig(fromBlock, planCursor - width + 1n)
      batch.push({ fromBlock: start, toBlock: planCursor })
      planCursor = start - 1n
    }
    // Every dispatched request counts against the budget, served or refused — the same accounting
    // the sequential path did, just paid for the whole batch before it goes out.
    requests += batch.length

    const settled = await Promise.all(batch.map(fetchChunk))

    // The batch is honored as a CONTIGUOUS PREFIX. Chunks up to the first non-success are exactly what
    // a sequential walk would have collected and are kept; that chunk and everything behind it are
    // dropped, because the sequential path is about to re-derive the width for that sub-range and
    // whatever it settles on decides how the rest of the range is asked for. Keeping the tail's
    // successes instead would mean claiming coverage out of order and returning duplicate logs once
    // the resumed walk re-covered it, to save at most SCAN_CHUNK_CONCURRENCY - 1 requests in a case
    // that only arises when a KNOWN-GOOD width has just stopped working.
    const stopAt = settled.findIndex((s) => !('ok' in s && s.ok))
    const okCount = stopAt === -1 ? settled.length : stopAt
    // An aborted chunk was never sent, so it never cost a request. Handing the budget back keeps
    // `requests` an exact count of what actually went to the wire rather than of what was planned.
    const skipped = settled.filter((s) => 'skipped' in s).length
    requests -= skipped

    for (let i = 0; i < okCount; i++) {
      // A for-of push, NOT `logs.push(...chunkLogs)`. Spreading an array into an argument list
      // materializes one call argument per element, and V8 throws `RangeError: Maximum call stack
      // size exceeded` somewhere north of ~125k arguments — so on Node (this package declares
      // `engines.node >= 18`) a single wide window over a busy contract could blow up the scan on
      // SUCCESS, after the request was paid for. Bun's JSC tolerates far larger spreads, which is
      // exactly why the unit suite could never catch it. Wide windows make the log counts that reach
      // that limit routine rather than theoretical. (`.map` below is fine — it is not a spread.)
      const chunkLogs = (settled[i] as { ok: true; result: Log[] }).result.map((log) => formatLog(log as never) as Log)
      for (const log of chunkLogs) logs.push(log)
      coveredRaw.push(batch[i]!)
      // `opts.onLogs` gets this chunk NOW, rather than the caller getting everything at the end.
      // A multi-million-block scan is minutes long, and until this existed nothing downstream — not
      // the pool index, not the pump — learned a single pool until the LAST chunk landed. That made
      // a scan an all-or-nothing purchase: aborted at 90%, it returned its logs but far too late
      // for the search to price any of them. It is best-effort and purely
      // additive: `logs` still accumulates and is still returned in full, so a caller that ignores
      // this sees no difference whatsoever.
      if (chunkLogs.length > 0) opts.onLogs?.(chunkLogs)
    }

    if (okCount > 0) {
      cursor = batch[okCount - 1]!.fromBlock - 1n
      // A window this endpoint DEMONSTRABLY serves, remembered for the next scan's starting guess.
      // A running MAXIMUM, not the last value: the width is also narrowed by a short range (a
      // 5,000-block delta re-scan asks for 5,000 blocks and is served), and recording that as what
      // the endpoint "can do" would ratchet the hint down towards nothing over a warm router's life.
      // `width` rather than `policy.chunkSize`, deliberately: the reduction below may regrow the
      // width, and a grown width is a PROBE nothing has served yet.
      //
      // AND NOTHING BELOW `MIN_CHUNK` IS A CAPACITY OBSERVATION AT ALL. `initialPolicy` opens a
      // scan at the whole range when the range is narrow, so a 32-block reorg re-scan asks for 32
      // blocks and is served — which says nothing whatever about how wide a window this endpoint
      // will serve, only that 32 was all anyone wanted. Recorded anyway it became a persisted
      // `learnedScanWidth` of 32, and the next full-history scan opened there: served every time,
      // never corrected, the entire request budget spent walking millions of blocks 32 at a time.
      // `MIN_CHUNK` is the narrowest window this scanner ever asks for, so it is exactly the line
      // below which a served width carries no information (see `logScanPolicy.ts#initialPolicy`,
      // which floors the hint on the way back in, and `pools/poolIndex.ts`, which refuses to load a
      // sub-floor one).
      if (memory && width >= MIN_CHUNK && width > (memory.learnedScanWidth ?? 0n)) memory.learnedScanWidth = width
      // The served prefix reaches the machine BEFORE the failure that cut the batch short (if any):
      // a success resets the backoff escalation, and the descent must see that reset.
      policy = nextStep(policy, { kind: 'served', chunks: okCount }).policy
    }

    if (stopAt === -1) continue

    // An ABORT stopped the batch, not the endpoint. The prefix above is kept (those chunks really were
    // served), and everything else is simply not evidence: no halving, no backoff, no give-up — the
    // width that was working is still the width that was working, and the endpoint did nothing wrong
    // (the `skipped` transition is the identity). The loop's own top-of-iteration check ends the scan
    // on the next pass.
    if ('skipped' in settled[stopAt]!) {
      policy = nextStep(policy, { kind: 'skipped' }).policy
      continue
    }

    // --- a chunk failed: the pure descent decides what happens next -----------------------------
    // `cursor`/`chunkStart` name the sub-range the FIRST failure was for, which is precisely the one
    // a sequential walk would have been sitting on when it saw this error — the reducer receives
    // exactly the state that walk would have had.
    const err = (settled[stopAt] as { ok: false; err: unknown }).err
    const chunkStart = batch[stopAt]!.fromBlock
    cursor = batch[stopAt]!.toBlock

    const ceilingBefore = policy.ceiling
    const step = nextStep(policy, { kind: 'refused', facts: refusalFactsOf(err) })
    policy = step.policy

    // A ceiling the reducer just lowered is a span cap the endpoint DECLARED — the span-clamp is the
    // only transition that lowers it — so it is mirrored into the shared memory here, at the loop
    // edge, keeping the reducer pure. Monotone (`minBig`) for the same reason the clamp itself is:
    // interleaved scans converge on the tightest cap whatever order their writes land in. What
    // cannot arrive here is a ceiling below MIN_CHUNK: the reducer refuses to adopt one, precisely
    // because THIS line would persist it and `initialPolicy` would then open every later scan at a
    // width the endpoint serves and the caller cannot afford.
    if (memory && policy.ceiling < ceilingBefore) {
      memory.declaredScanCap = minBig(memory.declaredScanCap ?? policy.ceiling, policy.ceiling)
    }

    // Give up this sub-range: leave it out of `covered` and move on to older blocks. Every other
    // action retries the same sub-range — the loop re-plans from the unchanged cursor at whatever
    // width the reducer settled on.
    if (step.action.kind === 'giveUpSubrange') cursor = chunkStart - 1n
    // The backoff (minimum-window failures only) is decided by the reducer and slept here — the
    // clock is I/O. A 0 means the per-scan sleep budget is spent; the request budget, not the
    // sleeping, is what ends the scan.
    const backoffMs = 'backoffMs' in step.action ? step.action.backoffMs : 0
    if (backoffMs > 0) await sleep(backoffMs)
  }

  const covered = mergeRanges(coveredRaw)
  const complete = covered.length === 1 && covered[0]!.fromBlock === fromBlock && covered[0]!.toBlock === toBlock

  // `requests` is what actually reached the wire (skipped-on-abort chunks are handed back above), so
  // a caller spreading one budget across several scans can subtract it and get an exact remainder
  // rather than an estimate — see `search/coverage.ts#discoverFeeTiers`.
  return { logs, covered, complete, requests }
}
