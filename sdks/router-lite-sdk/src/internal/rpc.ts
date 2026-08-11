import type { Address, Hex, PublicClient } from 'viem'

import { AbortedCallError, NodeStateError, TransportError } from '../errors'
import type { EthCall } from '../types'

import { classifyRpcError } from './rpcErrors'

// ---------------------------------------------------------------------------
// RPC dispatch — raw `eth_call` over `client.request` (not viem's `call()`
// public action), the router's global request semaphore, and
// bounded-concurrency mapping.
//
// A raw `request()` call is used instead of viem's `call()` action so this
// stays block-pinned and free of viem's own batching/multicall behavior —
// the quoting engine (Task 12) is entirely in control of how many in-flight
// calls exist and against which block, and tests only need to stub `request`
// rather than a full `PublicClient`.
//
// WHAT A FAILURE MEANS is not decided here. `ethCall` asks
// `rpcErrors.ts#classifyRpcError` which channel a call failed in and wraps
// accordingly; the dialects, the cause-chain walk and the declared-cap parser
// all live in that file, which knows nothing about transports in return.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Global request semaphore (C4-P6).
//
// `mapConcurrent`'s `limit` used to be the ONLY concurrency bound in this package, and it is
// per-CALL — every `mapConcurrent(items, MAX_CONCURRENT_CALLS, fn)` batch gets its own fresh
// budget. That is fine in isolation, but wave 0 fires several such batches at once (hint
// validation, route probes, and — for swaps — the readiness reads, all under one `Promise.all` in
// `search/waves.ts#wave0a`), so the REAL peak in-flight `client.request` count is the SUM of every
// concurrently-running batch's own limit, not any single one of them (measured at ~44 for a
// realistic wave 0, more than double the doc comment's claimed bound). A {@link Semaphore} fixes
// that by being a bound the ROUTER holds once (`createSemaphore` in `router.ts#createRouter`) and
// threads into every function that actually issues a `client.request`.
//
// THE FULL GATED SET (F3) — every one of these acquires/releases the SAME router-instance
// semaphore around its own `client.request`, and nothing else in this package talks to the
// transport at all:
//
//   - `ethCall` (this file) — every `eth_call`: quoting (`quote.ts`'s `quoteCandidates`/
//     `probeQuotes`), readiness's three ERC-20/Permit2 reads (`verify/readiness.ts#readErc20State`),
//     and hint validation (`search/waves.ts#resolveHints`).
//   - `scanLogs` (`internal/logScan.ts`) — every `eth_getLogs`: adjacency/fee-tier/exact-pair
//     discovery (`search/coverage.ts`).
//   - `preflightTx` (`verify/preflight.ts`) — the leader's simulation `eth_call`
//     (`search/leader.ts#verifyLeader`); raw, not through `ethCall`, because it simulates a real
//     transaction rather than decoding a quoter's return data.
//   - `getNativeBalance` (`verify/readiness.ts`) — the native-`currencyIn` `eth_getBalance` read;
//     raw for the same reason (`eth_getBalance` has no revert/quote semantics to classify).
//   - `ethCallLatest` (`router.ts`) — `ingestPool`'s hint-validation `eth_call` at `'latest'`; raw
//     because ingestion has no pinned search block of its own to reuse.
//   - `requestHead` (`search/waves.ts`) — the pinned-block `eth_getBlockByNumber` fetch AND its
//     head-regression refetch (`fetchBlock`); a leaf request with nothing nested inside it, so
//     gating it carries no lock-ordering risk.
//
// THE ONE DELIBERATE CARVE-OUT: `manifest.ts#validateManifest`'s `getChainId`/`eth_getCode` calls
// are NOT gated. They run at most once per router's lifetime (`router.ts#ensureManifestValidated`
// caches the result, success or config-error, forever) rather than once per search, so they cannot
// contribute to a sustained concurrency peak the way a per-search read could — see that function's
// own docs for the caching contract this carve-out depends on.
//
// THE RULE FOR ANYTHING ADDED LATER: any new function that calls `client.request` directly (rather
// than going through one of the six above) MUST accept a `Semaphore` and acquire/release it around
// that call, or it silently escapes `concurrency` exactly as `requestHead` did before F2 — a router
// with N concurrent searches making N (or more) ungated requests of its own, undercounted by every
// caller who set `concurrency` expecting it to be the real ceiling.
// ---------------------------------------------------------------------------

/** A tiny counting semaphore: at most `limit` holders of `acquire()` may be unresolved at once. */
export type Semaphore = { acquire(): Promise<void>; release(): void }

/**
 * Builds a {@link Semaphore} bounding at most `limit` concurrent holders. `acquire()` resolves
 * immediately while under the limit; once at capacity it queues (FIFO) until a `release()` frees a
 * slot. `release()` hands the freed slot directly to the next queued waiter rather than letting it
 * race a fresh `acquire()` in, so the bound is exact — `active` never exceeds `limit` even under
 * heavy contention.
 */
export function createSemaphore(limit: number): Semaphore {
  let active = 0
  const queue: (() => void)[] = []

  return {
    acquire(): Promise<void> {
      if (active < limit) {
        active++
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => {
        queue.push(() => {
          active++
          resolve()
        })
      })
    },
    release(): void {
      active--
      const next = queue.shift()
      if (next) next()
    },
  }
}

/**
 * Issues one block-pinned `eth_call` and returns the raw hex return data. Failures propagate as a
 * thrown error, classified into channels first: a transport failure is wrapped in
 * {@link TransportError} and a node-state failure in {@link NodeStateError} (a subclass of it, so
 * every `instanceof TransportError` counting site catches both) — original preserved as `cause` in
 * either case — while an execution failure — a revert, with or without data — is rethrown untouched,
 * verbatim, so callers that read revert data still see exactly what the node returned.
 *
 * The revert itself is still never *interpreted* here; that's the caller's job (see
 * {@link mapConcurrent}, which is what actually keeps a batch of these from rejecting as a whole,
 * and captures both kinds as `Error` slots for the caller to discriminate with `instanceof`).
 *
 * `semaphore` (C4-P6), when supplied, is acquired around the actual `client.request` call below and
 * released whether it succeeds, reverts, or fails in the transport — this is one of the exactly two
 * places (the other is `scanLogs`'s `eth_getLogs`) a real request goes out, so gating here is what
 * makes the router's `concurrency` option a genuine cross-batch bound rather than a per-call one.
 * Omitted (as every unit test below the router facade does) it is simply not gated, unchanged from
 * before this option existed.
 *
 * `signal`, when supplied, is checked ONCE THE PERMIT IS IN HAND, and that placement is the whole
 * point rather than defensive padding — see {@link AbortedCallError} for the measurement. The
 * semaphore is a plain FIFO queue with no abort awareness, so a batch queued behind a busy router
 * resolves one waiter per freed permit long after the caller's deadline passed; checking here makes
 * the abort bite at the last possible moment before the wire, exactly as `logScan.ts#fetchChunk`
 * does for `eth_getLogs`. A skipped call raises {@link AbortedCallError}, which is deliberately not
 * a {@link TransportError}: nothing was asked of the provider, so nothing may be blamed on it.
 */
export async function ethCall(
  client: Pick<PublicClient, 'request'>,
  call: EthCall,
  blockNumber: bigint,
  semaphore?: Semaphore,
  signal?: AbortSignal,
): Promise<Hex> {
  const transaction: { to: Address; data: Hex; from?: Address; value?: Hex } = { to: call.to, data: call.data }
  if (call.from !== undefined) transaction.from = call.from
  if (call.value !== undefined) transaction.value = `0x${call.value.toString(16)}`
  const blockTag = `0x${blockNumber.toString(16)}` as Hex

  if (signal?.aborted) throw new AbortedCallError(`eth_call to ${call.to} was never sent — the search was aborted first`)
  await semaphore?.acquire()
  try {
    if (signal?.aborted) throw new AbortedCallError(`eth_call to ${call.to} was never sent — the search was aborted first`)
    // The typed `PublicRpcSchema` declares `eth_call`'s transaction/block params in viem's internal
    // (bigint-quantity) shape, not the hex-quantity wire shape this function builds — viem's own
    // `call()` action re-formats to hex before calling `request()` too (see
    // `actions/public/call.js`), so this cast just skips re-deriving that formatter here.
    return (await client.request({ method: 'eth_call', params: [transaction, blockTag] } as any)) as Hex
  } catch (err) {
    // Our own skip, raised inside the `try` so the `finally` releases the permit. It must leave here
    // as itself: `classifyRpcError` reads error TEXT, and "aborted" is exactly the vocabulary a real
    // transport failure uses — misclassifying a call we chose not to make as a provider failure is
    // the one outcome {@link AbortedCallError} exists to prevent.
    if (err instanceof AbortedCallError) throw err
    const kind = classifyRpcError(err)
    if (kind === 'transport') {
      throw new TransportError(`eth_call to ${call.to} failed in the transport, not on-chain`, { cause: err })
    }
    if (kind === 'unavailable') {
      throw new NodeStateError(
        `eth_call to ${call.to} could not be served at block ${blockNumber} (node state unavailable) — not an on-chain answer`,
        { cause: err },
      )
    }
    throw err
  } finally {
    semaphore?.release()
  }
}

/**
 * Maps `fn` over `items`, preserving input order in the output. Never rejects: a thrown/rejected
 * `fn` call is captured as an `Error` in that item's slot rather than aborting the whole batch, so
 * one bad candidate can never take down the others.
 *
 * `limit` is either a plain number — at most `limit` `fn` calls in flight from THIS batch alone,
 * the original (pre-C4-P6) behavior, still the right choice for a caller with no shared semaphore
 * to hand in — or a {@link Semaphore}: every item is then dispatched at once (no batch-local cap of
 * its own), trusting that `fn`'s own `client.request` calls (via `ethCall`/`scanLogs`, which accept
 * this very semaphore) will throttle themselves against the REAL, cross-batch bound. Layering a
 * second, batch-local cap on top in that case would not be wrong, only redundant — and, if this
 * function's own workers additionally held the shared semaphore around the whole `fn` call, actively
 * harmful: a nested acquire against the same semaphore an inner `ethCall` also acquires halves the
 * effective concurrency (or deadlocks it at `limit === 1`) for no benefit. So it does not.
 */
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number | Semaphore,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<R | Error>> {
  const results: Array<R | Error> = new Array(items.length)

  async function run(item: T, i: number): Promise<void> {
    try {
      results[i] = await fn(item, i)
    } catch (err) {
      results[i] = err instanceof Error ? err : new Error(String(err))
    }
  }

  if (typeof limit !== 'number') {
    await Promise.all(items.map((item, i) => run(item, i)))
    return results
  }

  let next = 0
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      await run(items[i]!, i)
    }
  }

  const workerCount = Math.max(0, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}
