import type { Hex, Log, PublicClient } from 'viem'
import { formatLog } from 'viem'

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  CHUNK_REGROWTH_SUCCESSES,
  DESCENT_TIMEOUT_FALLBACK,
  MAX_BACKOFF_TOTAL_MS,
  MAX_CONSECUTIVE_MIN_FAILURES,
  MAX_REQUESTS_PER_SCAN,
  MAX_SCAN_WINDOW,
  MIN_CHUNK,
  SCAN_CHUNK_CONCURRENCY,
} from '../constants'
import type { BlockRange, LogQuery } from '../types'

import { maxBig, mergeRanges, minBig } from './ranges'
import { classifyRpcError, parseDeclaredCap } from './rpc'
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
// catch below classifies (`internal/rpc.ts#classifyRpcError`) and, on a
// transport/unavailable failure at a wide window, drops straight to
// `DESCENT_TIMEOUT_FALLBACK` rather than halving — one expensive failure buys
// the whole descent. A caller who already knows the cap skips all of it with
// `logChunkBlocks`.
//
// SOME PROVIDERS DO SAY (R2). blastapi, drpc, alchemy and quicknode all state
// the window that would have worked, in the error text, and
// `internal/rpc.ts#parseDeclaredCap` reads it. When a cap is declared the loop
// below skips the search entirely: it jumps the window straight to the stated
// cap, or — when that cap is below MIN_CHUNK, i.e. below anything this scanner
// will ever ask for — gives the sub-range up on the first error instead of
// spending a retry budget and a backoff escalation rediscovering the same
// sentence. A message it does not recognize changes nothing; every bound below
// still applies.
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
 *    (`internal/rpc.ts#parseDeclaredCap`). A scan may not exceed it, which is the whole point: see
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
 * one router (`search/discovery.ts` threads `PoolIndex`'s), and mutating it is safe under the
 * concurrent scans a single wave issues: both fields are monotone — the hint only rises, the cap
 * only falls — so interleaved writes converge on the same value whatever order they land in, and a
 * lost update costs one probe. Omitted, every line below behaves exactly as it did before this
 * option existed.
 *
 * `opts.maxRequests` narrows {@link MAX_REQUESTS_PER_SCAN} for THIS scan (never widens it), for a
 * caller whose scan is one of several competing for a latency budget and is not the one the caller
 * is waiting on. Running out of it is not an error and needs no new report surface: the scan stops
 * where it is and the blocks it never reached are simply absent from `covered`, which is already how
 * partial discovery is expressed everywhere else. See `constants.ts#FEE_DISCOVERY_MAX_REQUESTS` for
 * the case that motivated it — a full-history scan in an early wave starving every later one.
 */
export async function scanLogs(
  client: Pick<PublicClient, 'request'>,
  query: LogQuery,
  range: BlockRange,
  opts: {
    signal?: AbortSignal
    sleep?: (ms: number) => Promise<void>
    semaphore?: Semaphore | undefined
    initialChunk?: bigint | undefined
    widthMemory?: ScanWidthMemory | undefined
    maxRequests?: number | undefined
  },
): Promise<{ logs: Log[]; covered: BlockRange[]; complete: boolean; requests: number }> {
  const { fromBlock, toBlock } = range
  const logs: Log[] = []
  const coveredRaw: BlockRange[] = []
  const sleep = opts.sleep ?? ((ms: number): Promise<void> => delay(ms, opts.signal))
  const memory = opts.widthMemory
  // The widest window this scan may ever ask for: the caller's override when they know their
  // provider's cap, otherwise the empirical ceiling — narrowed further by any cap the endpoint has
  // DECLARED (this scan, or an earlier one through `opts.widthMemory`). Never exceeded, by the first
  // request or by any regrowth doubling after it.
  //
  // MUTABLE, WHICH IS THE POINT (see the declared-cap branch below). Clamping the ceiling — rather
  // than only the current width — is what stops the regrowth ratchet from doubling past a ceiling
  // the endpoint has already named, failing, and re-establishing, forever: at `chunkSize >= ceiling`
  // the doubling is a no-op, so `widthEstablished` survives it and the batching below stays whole.
  let ceiling = minBig(opts.initialChunk ?? MAX_SCAN_WINDOW, memory?.declaredScanCap ?? MAX_SCAN_WINDOW)

  // The request budget for THIS scan: {@link MAX_REQUESTS_PER_SCAN}, or a caller's tighter one. Only
  // ever narrows — a caller may buy less of the endpoint's time than the global ceiling allows, never
  // more, so the ceiling stays the one thing every scan in the package is bounded by.
  const requestBudget = Math.max(1, Math.min(opts.maxRequests ?? MAX_REQUESTS_PER_SCAN, MAX_REQUESTS_PER_SCAN))

  let cursor = toBlock
  // Start at the whole range when it fits under the ceiling — asking for 16M blocks of a 5,000-block
  // re-scan would be a guaranteed-wasted probe on any endpoint that validates the span it was handed.
  // A `learnedScanWidth` from an earlier scan narrows the start the same way, and for the same
  // reason: it is the widest window this endpoint is known to serve, so anything above it is a probe
  // whose answer is already in hand. It is only a hint — the halving below still corrects it
  // downward and the regrowth ratchet still climbs back to `ceiling` — so a stale one costs a probe,
  // never coverage.
  // `maxBig(..., 1n)` only guards an inverted range, whose loop below never runs anyway.
  let chunkSize = minBig(minBig(maxBig(toBlock - fromBlock + 1n, 1n), ceiling), memory?.learnedScanWidth ?? ceiling)
  let requests = 0
  // Failures at MIN_CHUNK on the *current* sub-range: drives when to give that sub-range up.
  let consecutiveMinFailures = 0
  // Failures at MIN_CHUNK since the last success *anywhere*: drives the backoff exponent. Kept
  // apart from the counter above because giving a sub-range up is not progress — the endpoint is
  // still the same endpoint, and moving on to older blocks must not reset the escalation.
  let minFailuresSinceSuccess = 0
  let consecutiveSuccesses = 0
  let backoffSpentMs = 0
  // P1: whether the LAST chunk asked for at the current `chunkSize` was served. False at the start
  // (nothing is known yet) and reset by every failure and by every regrowth that actually changes the
  // width — so it is exactly "this width is known-good right now", which is the only state under
  // which asking for several of them at once is not a gamble.
  let widthEstablished = false

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

    // --- how many chunks go out together (P1) --------------------------------------------------
    // One, until a chunk at this exact width has been served. After that, up to
    // SCAN_CHUNK_CONCURRENCY — bounded further by two things that are not about concurrency at all:
    // the request budget (a batch may not overshoot it, so `MAX_REQUESTS_PER_SCAN` stays an exact
    // count rather than an approximate one), and the regrowth boundary. The latter is what keeps the
    // ratchet's cadence identical to the sequential one: below the ceiling the window must still
    // double after exactly CHUNK_REGROWTH_SUCCESSES clean chunks, so a batch stops short of that
    // count rather than sailing past it. AT the ceiling, doubling is a no-op — there is no boundary
    // to respect and no reason to break the batch up.
    const budgetLeft = requestBudget - requests
    const regrowthRoom =
      chunkSize >= ceiling ? SCAN_CHUNK_CONCURRENCY : CHUNK_REGROWTH_SUCCESSES - consecutiveSuccesses
    const batchLimit = widthEstablished
      ? Math.max(1, Math.min(SCAN_CHUNK_CONCURRENCY, regrowthRoom, budgetLeft))
      : 1

    // Consecutive same-width sub-ranges walking backward from `cursor`, recent-first — the exact
    // sequence the sequential loop would have visited, planned up front instead of one at a time.
    const batch: BlockRange[] = []
    for (let planCursor = cursor; batch.length < batchLimit && planCursor >= fromBlock; ) {
      const start = maxBig(fromBlock, planCursor - chunkSize + 1n)
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
      // A for-of push, NOT `logs.push(...result.map(...))`. Spreading an array into an argument list
      // materializes one call argument per element, and V8 throws `RangeError: Maximum call stack
      // size exceeded` somewhere north of ~125k arguments — so on Node (this package declares
      // `engines.node >= 18`) a single wide window over a busy contract could blow up the scan on
      // SUCCESS, after the request was paid for. Bun's JSC tolerates far larger spreads, which is
      // exactly why the unit suite could never catch it. Wide windows make the log counts that reach
      // that limit routine rather than theoretical.
      for (const log of (settled[i] as { ok: true; result: Log[] }).result) logs.push(formatLog(log as never) as Log)
      coveredRaw.push(batch[i]!)
    }

    if (okCount > 0) {
      cursor = batch[okCount - 1]!.fromBlock - 1n
      consecutiveMinFailures = 0
      minFailuresSinceSuccess = 0
      consecutiveSuccesses += okCount
      widthEstablished = true
      // A window this endpoint DEMONSTRABLY serves, remembered for the next scan's starting guess.
      // A running MAXIMUM, not the last value: `chunkSize` is also narrowed by a short range (a
      // 5,000-block delta re-scan asks for 5,000 blocks and is served), and recording that as what
      // the endpoint "can do" would ratchet the hint down towards nothing over a warm router's life.
      if (memory && chunkSize > (memory.learnedScanWidth ?? 0n)) memory.learnedScanWidth = chunkSize
    }

    if (stopAt === -1) {
      if (consecutiveSuccesses >= CHUNK_REGROWTH_SUCCESSES) {
        // Probe for a wider window. If the earlier failure was transient this restores full speed;
        // if the cap is real the next request fails and halves straight back, costing one request.
        // A width that actually changed is a width nothing has served yet, so the probe goes out
        // alone (P1) exactly as the very first chunk of the scan did.
        const grown = minBig(chunkSize * 2n, ceiling)
        if (grown !== chunkSize) widthEstablished = false
        chunkSize = grown
        consecutiveSuccesses = 0
      }
      continue
    }

    // An ABORT stopped the batch, not the endpoint. The prefix above is kept (those chunks really were
    // served), and everything else is simply not evidence: no halving, no backoff, no give-up — the
    // width that was working is still the width that was working, and the endpoint did nothing wrong.
    // The loop's own top-of-iteration check ends the scan on the next pass.
    if ('skipped' in settled[stopAt]!) continue

    // --- a chunk failed: the sequential descent takes over from here ----------------------------
    // `cursor`/`chunkStart` name the sub-range the FIRST failure was for, which is precisely the one
    // a sequential walk would have been sitting on when it saw this error — everything below is the
    // pre-P1 error path, unchanged, operating on exactly the state it always did.
    const err = (settled[stopAt] as { ok: false; err: unknown }).err
    const chunkStart = batch[stopAt]!.fromBlock
    cursor = batch[stopAt]!.toBlock
    consecutiveSuccesses = 0
    widthEstablished = false

    // --- the declared-cap fast path (R2) -------------------------------------------------
    // Some providers state the window they WOULD have served, right there in the error (see
    // `internal/rpc.ts#parseDeclaredCap` and the live captures it is built from). When they do,
    // the bisection below is searching for an answer already in hand.
    const { capBlocks, capKind } = parseDeclaredCap(err)
    if (capBlocks !== undefined && capBlocks < chunkSize) {
      // A SPAN cap is a POLICY, not a data point, so it lowers the CEILING and not merely the current
      // width — and that distinction is worth more than every probe the fast path skips. Left as only
      // a width, the ratchet doubles straight back past the stated cap after CHUNK_REGROWTH_SUCCESSES
      // clean chunks, fails, un-establishes the width, and sends the next chunk out alone: measured
      // against quicknode's Base endpoint, that cycle spends three sequential round trips per four
      // chunks of real work and never stops. Clamped, `grown === chunkSize` at the ceiling,
      // `widthEstablished` survives, and the walk runs at a full SCAN_CHUNK_CONCURRENCY-wide batch per
      // round trip — 1.39x on a six-scan adjacency fan-out, live.
      //
      // A `'density'` CAP MUST NOT CLAMP, and getting this wrong would be far more expensive than
      // never having read the message at all. Alchemy answers a too-wide WETH adjacency query with
      // "you can make eth_getLogs requests with up to a 10,000 block range … or you can request any
      // block range with a cap of 10K logs … this block range should work: [8,000,000 blocks]" — a
      // stated 10,000 alongside a demonstration that it will serve 8M for this very query. Clamping
      // there pins every mainnet scan 800x too narrow for the rest of its life. The WIDTH jump below
      // still applies to both kinds (it is only this attempt's guess, and the regrowth ratchet climbs
      // back out of it, which is exactly the recovery a density observation needs); only the durable
      // ceiling is withheld. See `internal/rpc.ts#DeclaredCap.capKind`.
      //
      // Only ever NARROWS (`minBig`), so a provider that declares different span caps for different
      // queries leaves this scan at the tightest one it was actually told about, and an
      // `initialChunk` override is never widened by anything a provider says.
      if (capKind === 'span') {
        ceiling = minBig(ceiling, capBlocks)
        if (memory) memory.declaredScanCap = minBig(memory.declaredScanCap ?? capBlocks, capBlocks)
      }
      if (capBlocks < MIN_CHUNK) {
        // The endpoint's own ceiling is BELOW the smallest window this scanner will ask for, so no
        // amount of halving, retrying or backing off can reach it — MIN_CHUNK is the floor, and the
        // provider has just said the floor is too high. Give the sub-range up on the spot: leave it
        // out of `covered` (partial discovery, reported honestly, exactly as an exhausted retry
        // budget would) and move on to older blocks. Without this, a 10-block-cap endpoint costs
        // MAX_CONSECUTIVE_MIN_FAILURES requests AND a full backoff escalation per sub-range to
        // rediscover the same sentence, burning the request budget and up to MAX_BACKOFF_TOTAL_MS
        // of deliberate sleeping on a scan that was never going to cover anything.
        cursor = chunkStart - 1n
        consecutiveMinFailures = 0
        continue
      }
      // A real, serveable cap: jump straight to it instead of halving toward it. No backoff — this
      // is an endpoint capping, not an endpoint failing, which is the same reason the blind-halving
      // branch below does not sleep either.
      chunkSize = capBlocks
      consecutiveMinFailures = 0
      continue
    }

    // --- the expensive-refusal fast path (S1) ---------------------------------------------
    // Halving assumes a refusal is free. It is, for a provider that VALIDATES the span — and it is
    // not, for one that executed the query before refusing (a result-size cap) or simply hung until
    // viem gave up (a timeout, which viem has already retried 3 times at ~10s before this catch even
    // runs). On those, thirteen halvings from MAX_SCAN_WINDOW is minutes of no progress. So when the
    // failure classifies as transport/unavailable — precisely those two shapes — collapse the window
    // to DESCENT_TIMEOUT_FALLBACK in one step. Guarded by `>` so it can fire at most once per
    // descent and can only ever NARROW: below that width, ordinary halving takes over and every
    // termination guarantee is exactly as it was.
    if (chunkSize > DESCENT_TIMEOUT_FALLBACK) {
      const kind = classifyRpcError(err)
      if (kind === 'transport' || kind === 'unavailable') {
        chunkSize = DESCENT_TIMEOUT_FALLBACK
        consecutiveMinFailures = 0
        continue
      }
    }

    if (chunkSize <= MIN_CHUNK) {
      consecutiveMinFailures++
      minFailuresSinceSuccess++
      if (consecutiveMinFailures >= MAX_CONSECUTIVE_MIN_FAILURES) {
        // Give up this sub-range: leave it out of `covered` and move on to older blocks.
        cursor = chunkStart - 1n
        consecutiveMinFailures = 0
      }
      // else: retry the same window (transient failure) — cursor/chunkSize unchanged.
      //
      // Either way the next request goes to an endpoint that just failed at the smallest window
      // this scanner will ask for, so it waits first — moving on to an older sub-range is not a
      // reason to stop backing off, the endpoint is the thing that is unwell, not the range.
      // Waiting stops once MAX_BACKOFF_TOTAL_MS is spent: an endpoint still failing after a solid
      // minute of deliberate quiet is not going to be nursed back by more of it, and the request
      // budget — not the sleeping — is what stops the scan.
      const wait = Math.min(
        BACKOFF_BASE_MS * 2 ** (minFailuresSinceSuccess - 1),
        BACKOFF_MAX_MS,
        MAX_BACKOFF_TOTAL_MS - backoffSpentMs,
      )
      if (wait > 0) {
        backoffSpentMs += wait
        await sleep(wait)
      }
    } else {
      chunkSize = maxBig(chunkSize / 2n, MIN_CHUNK)
      consecutiveMinFailures = 0
      // retry the same cursor with the smaller window — a cap, not an outage: no backoff.
    }
  }

  const covered = mergeRanges(coveredRaw)
  const complete = covered.length === 1 && covered[0]!.fromBlock === fromBlock && covered[0]!.toBlock === toBlock

  // `requests` is what actually reached the wire (skipped-on-abort chunks are handed back above), so
  // a caller spreading one budget across several scans can subtract it and get an exact remainder
  // rather than an estimate — see `search/discovery.ts#discoverFeeTiers`.
  return { logs, covered, complete, requests }
}
