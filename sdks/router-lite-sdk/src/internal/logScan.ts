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
// SOME PROVIDERS DO SAY (R2). blastapi, drpc and alchemy all state the window
// that would have worked, in the error text, and
// `internal/rpc.ts#parseDeclaredCap` reads it. When a cap is declared the loop
// below skips the search entirely: it jumps the window straight to the stated
// cap, or — when that cap is below MIN_CHUNK, i.e. below anything this scanner
// will ever ask for — gives the sub-range up on the first error instead of
// spending a retry budget and a backoff escalation rediscovering the same
// sentence. A message it does not recognize changes nothing; every bound below
// still applies.
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
 * quoting/verification.
 *
 * `opts.initialChunk` (`createRouter`'s `logChunkBlocks`) is a CEILING OVERRIDE, not a mandatory
 * start: it replaces {@link MAX_SCAN_WINDOW} as the widest window this scan may ever ask for, and the
 * first request spans `min(remaining range, override ?? MAX_SCAN_WINDOW)`. A caller fronting a
 * known-capped provider (Ankr's public endpoint caps `eth_getLogs` around 3k blocks) pins it there
 * and skips the bisection down; a caller who does not know starts at the empirical ceiling and lets
 * the endpoint's refusals find the real width (see this file's header).
 */
export async function scanLogs(
  client: Pick<PublicClient, 'request'>,
  query: LogQuery,
  range: BlockRange,
  opts: { signal?: AbortSignal; sleep?: (ms: number) => Promise<void>; semaphore?: Semaphore | undefined; initialChunk?: bigint | undefined },
): Promise<{ logs: Log[]; covered: BlockRange[]; complete: boolean }> {
  const { fromBlock, toBlock } = range
  const logs: Log[] = []
  const coveredRaw: BlockRange[] = []
  const sleep = opts.sleep ?? ((ms: number): Promise<void> => delay(ms, opts.signal))
  // The widest window this scan may ever ask for: the caller's override when they know their
  // provider's cap, otherwise the empirical ceiling. Never exceeded, by the first request or by any
  // regrowth doubling after it.
  const ceiling = opts.initialChunk ?? MAX_SCAN_WINDOW

  let cursor = toBlock
  // Start at the whole range when it fits under the ceiling — asking for 16M blocks of a 5,000-block
  // re-scan would be a guaranteed-wasted probe on any endpoint that validates the span it was handed.
  // `maxBig(..., 1n)` only guards an inverted range, whose loop below never runs anyway.
  let chunkSize = minBig(maxBig(toBlock - fromBlock + 1n, 1n), ceiling)
  let requests = 0
  // Failures at MIN_CHUNK on the *current* sub-range: drives when to give that sub-range up.
  let consecutiveMinFailures = 0
  // Failures at MIN_CHUNK since the last success *anywhere*: drives the backoff exponent. Kept
  // apart from the counter above because giving a sub-range up is not progress — the endpoint is
  // still the same endpoint, and moving on to older blocks must not reset the escalation.
  let minFailuresSinceSuccess = 0
  let consecutiveSuccesses = 0
  let backoffSpentMs = 0

  while (cursor >= fromBlock) {
    if (opts.signal?.aborted) break
    if (requests >= MAX_REQUESTS_PER_SCAN) break

    const chunkStart = maxBig(fromBlock, cursor - chunkSize + 1n)
    requests++
    try {
      let result: Log[]
      await opts.semaphore?.acquire()
      try {
        result = (await client.request({
          method: 'eth_getLogs',
          params: [
            {
              address: query.address,
              topics: query.topics,
              fromBlock: `0x${chunkStart.toString(16)}` as Hex,
              toBlock: `0x${cursor.toString(16)}` as Hex,
            },
          ],
        } as any)) as Log[]
      } finally {
        opts.semaphore?.release()
      }
      // A for-of push, NOT `logs.push(...result.map(...))`. Spreading an array into an argument list
      // materializes one call argument per element, and V8 throws `RangeError: Maximum call stack
      // size exceeded` somewhere north of ~125k arguments — so on Node (this package declares
      // `engines.node >= 18`) a single wide window over a busy contract could blow up the scan on
      // SUCCESS, after the request was paid for. Bun's JSC tolerates far larger spreads, which is
      // exactly why the unit suite could never catch it. Wide windows make the log counts that reach
      // that limit routine rather than theoretical.
      for (const log of result) logs.push(formatLog(log as never) as Log)
      coveredRaw.push({ fromBlock: chunkStart, toBlock: cursor })
      cursor = chunkStart - 1n
      consecutiveMinFailures = 0
      minFailuresSinceSuccess = 0
      consecutiveSuccesses++
      if (consecutiveSuccesses >= CHUNK_REGROWTH_SUCCESSES) {
        // Probe for a wider window. If the earlier failure was transient this restores full speed;
        // if the cap is real the next request fails and halves straight back, costing one request.
        const grown = chunkSize * 2n
        chunkSize = minBig(grown, ceiling)
        consecutiveSuccesses = 0
      }
    } catch (err) {
      consecutiveSuccesses = 0

      // --- the declared-cap fast path (R2) -------------------------------------------------
      // Some providers state the window they WOULD have served, right there in the error (see
      // `internal/rpc.ts#parseDeclaredCap` and the live captures it is built from). When they do,
      // the bisection below is searching for an answer already in hand.
      const { capBlocks } = parseDeclaredCap(err)
      if (capBlocks !== undefined && capBlocks < chunkSize) {
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
  }

  const covered = mergeRanges(coveredRaw)
  const complete = covered.length === 1 && covered[0]!.fromBlock === fromBlock && covered[0]!.toBlock === toBlock

  return { logs, covered, complete }
}
