import type { AbiEvent, Address, Log } from 'viem'
import { toEventSelector } from 'viem'

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  DEFAULT_BUFFER_SIZE,
  DEFAULT_MAX_CATCHUP_BLOCKS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_TRAILING_LOG_WINDOW,
  FALLBACK_POLL_INTERVAL_MS,
  STALE_AFTER_CONSECUTIVE_FAILURES,
} from './constants'
import { BlockfeedError } from './errors'
import { planCallBatch } from './internal/callBatch'
import type { LogBook } from './internal/logWindow'
import { decodeFeedLogs, emptyLogBook, planLogWindow, reconcileLogs } from './internal/logWindow'
import type { Scheduler } from './internal/scheduler'
import { realScheduler } from './internal/scheduler'
import type { InternalStore } from './internal/store'
import { createInternalStore } from './internal/store'
import { readTick } from './internal/tickReader'
import type {
  BlockfeedClient,
  CallResult,
  DecodedFeedLog,
  FeedEvent,
  FeedStore,
  LogFilter,
  Source,
  SourceEmission,
  TickData,
  TickIdentity,
} from './types'

export interface BlockFeedOptions {
  /**
   * The viem `PublicClient` (or a structural subset). NOTE: each tick attempt issues its reads through
   * this client, so any retry policy configured on its transport (viem's `http`/`fallback` defaults
   * retry failing requests) stacks INSIDE a single tick attempt — before the engine's own
   * backoff/stale machine ever sees a failure. Tune the transport's `retryCount` if you want the
   * engine's backoff to react promptly rather than after the transport exhausts its own retries.
   */
  client: BlockfeedClient
  /**
   * Chain id. Optional: defaults to `client.chain?.id` (a real viem client always carries it).
   * Throws synchronously at construction if neither is present. The engine never fetches it, so
   * construction stays synchronous.
   */
  chainId?: number
  /** HTTP poll cadence. Default `DEFAULT_POLL_INTERVAL_MS[chainId] ?? FALLBACK_POLL_INTERVAL_MS`. */
  pollIntervalMs?: number
  /** Trailing log window K (blocks re-scanned each tick). Default `DEFAULT_TRAILING_LOG_WINDOW`. */
  trailingLogWindow?: number
  /**
   * Upper bound on the trailing window's always-on catch-up growth after a stall. Default
   * `DEFAULT_MAX_CATCHUP_BLOCKS`. A long stall recovers at most this many recent blocks of logs; the
   * un-scanned remainder surfaces as a `gap`.
   */
  maxCatchupBlocks?: number
  /** Per-store rolling buffer length. Default `DEFAULT_BUFFER_SIZE`. */
  bufferSize?: number
  /** Injectable time source (tests). Default `realScheduler`. */
  scheduler?: Scheduler
}

export interface BlockFeed {
  watch<T>(source: Source<T>): FeedStore<T>
  /**
   * Remove a watched entry by key: its store stops updating and no further events are published to
   * its subscribers. Intended for keys you own (unwatching a key another consumer subscribed to
   * silently stops their store too). A no-op for an unknown key.
   */
  unwatch(key: string): void
  stop(): void
}

/** Per-source engine state. `T` is erased to `unknown` inside the engine; sources are opaque here. */
interface EngineEntry {
  source: Source<unknown>
  store: InternalStore<unknown>
  /** Threaded `prev`, updated after each non-suppressed derive. */
  prev: SourceEmission<unknown> | undefined
  logBook: LogBook
}

/** Per-source log reconciliation output for one tick (what `fetchAndReconcileLogs` hands to derive). */
interface EntryLogs {
  newLogs: DecodedFeedLog[]
  retractions: DecodedFeedLog[]
}

/**
 * Create the block heartbeat engine for one `(chainId, client)` pair. The returned {@link BlockFeed}
 * owns a single atomic read loop shared by every watched source; the loop runs only while at least one
 * store has a subscriber (refcounted), one tick at a time (no overlap), with exponential backoff on
 * failure. See the package design doc §4.1–§4.4, §7–§8 for the intent behind each rule.
 */
export function createBlockFeed(opts: BlockFeedOptions): BlockFeed {
  const { client } = opts
  const resolvedChainId = opts.chainId ?? client.chain?.id
  if (resolvedChainId === undefined) {
    throw new BlockfeedError('BlockFeedOptions.chainId is required when the client carries no chain.id')
  }
  // Declared `number` (not the narrowed union) so nested closures see the resolved id.
  const chainId: number = resolvedChainId
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS[chainId] ?? FALLBACK_POLL_INTERVAL_MS
  const trailingLogWindow = opts.trailingLogWindow ?? DEFAULT_TRAILING_LOG_WINDOW
  const maxCatchupBlocks = opts.maxCatchupBlocks ?? DEFAULT_MAX_CATCHUP_BLOCKS
  const bufferSize = opts.bufferSize ?? DEFAULT_BUFFER_SIZE
  const scheduler = opts.scheduler ?? realScheduler
  // v1 rule: only a direct WebSocket transport uses the push trigger. `transport` is declared on
  // BlockfeedClient, so no cast is needed; a non-viem structural client omits it (HTTP semantics).
  const isWs = client.transport?.type === 'webSocket'

  const entries = new Map<string, EngineEntry>()
  const subscriberCounts = new Map<string, number>()
  let totalSubscribers = 0

  let running = false
  let stopped = false

  // Overlap guard: at most one tick in flight. A trigger that arrives mid-tick sets `pendingTrigger`
  // so exactly one more tick runs immediately after the current one settles.
  let ticking = false
  let pendingTrigger = false

  let timerHandle: unknown
  let wsUnwatch: (() => void) | undefined

  let prevIdentity: Omit<TickIdentity, 'chainId'> | undefined
  let lastProcessedBlock: bigint | undefined

  let consecutiveFailures = 0
  let staleActive = false

  function canSchedule(): boolean {
    return running && !stopped
  }

  function clearTimer(): void {
    if (timerHandle !== undefined) {
      scheduler.clearTimeout(timerHandle)
      timerHandle = undefined
    }
  }

  function clearWs(): void {
    if (wsUnwatch) {
      wsUnwatch()
      wsUnwatch = undefined
    }
  }

  function scheduleNextSuccess(): void {
    if (isWs || !canSchedule()) return // WS ticks are driven by block notifications, not a timer.
    clearTimer()
    timerHandle = scheduler.setTimeout(() => {
      timerHandle = undefined
      void runTick()
    }, pollIntervalMs)
  }

  function handleTickFailure(): void {
    consecutiveFailures += 1
    if (consecutiveFailures >= STALE_AFTER_CONSECUTIVE_FAILURES && !staleActive) {
      staleActive = true
      for (const entry of entries.values()) entry.store.publish([{ type: 'stale', stale: true }])
    }
    if (!canSchedule()) return
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** consecutiveFailures, BACKOFF_MAX_MS)
    clearTimer()
    timerHandle = scheduler.setTimeout(() => {
      timerHandle = undefined
      void runTick()
    }, delay)
  }

  function onTickSuccess(): void {
    consecutiveFailures = 0
    if (staleActive) {
      staleActive = false
      for (const entry of entries.values()) entry.store.publish([{ type: 'stale', stale: false }])
    }
  }

  /**
   * Fetch the union `getLogs` for the window ({@link planLogWindow} computes the bounds + any gap), then
   * split/reconcile into each source's own book. Returns per-source new-logs/retractions keyed by entry
   * (the engine threads them into `deriveAndPublish`); the source books are the only state mutated here.
   *
   * The unified gap rule publishes a `gap` to every source with filters whenever a span went un-scanned
   * (a stall longer than the catch-up ceiling, or a plain tick that skipped blocks). See
   * {@link planLogWindow} for the always-on window math.
   */
  async function fetchAndReconcileLogs(
    active: EngineEntry[],
    identity: Omit<TickIdentity, 'chainId'>
  ): Promise<Map<EngineEntry, EntryLogs>> {
    const logsByEntry = new Map<EngineEntry, EntryLogs>()
    const filtersByEntry = new Map<EngineEntry, LogFilter[]>()
    const addresses = new Map<string, Address>()
    const events = new Map<string, AbiEvent>()
    for (const entry of active) {
      const filters = entry.source.logFilters ? entry.source.logFilters(entry.prev) : []
      filtersByEntry.set(entry, filters)
      for (const filter of filters) {
        addresses.set(filter.address.toLowerCase(), filter.address)
        events.set(toEventSelector(filter.event), filter.event)
      }
    }
    if (addresses.size === 0) return logsByEntry

    const { fromBlock, toBlock, gap } = planLogWindow({
      head: identity.blockNumber,
      lastProcessedBlock,
      bookWindow: trailingLogWindow,
      maxCatchupBlocks,
    })

    // Gap fan-out: publish the un-scanned span to every source that has filters.
    if (gap !== undefined) {
      const gapEvent: FeedEvent<unknown> = { type: 'gap', fromBlock: gap.fromBlock, toBlock: gap.toBlock }
      for (const entry of active) {
        if ((filtersByEntry.get(entry) ?? []).length > 0) entry.store.publish([gapEvent])
      }
    }

    // `getLogs` is cast through `unknown`: BlockfeedClient is a structural subset of viem's PublicClient
    // whose overloaded getLogs signature does not accept our erased filter shape without this bridge.
    const rawLogs = (await (client.getLogs as unknown as (args: unknown) => Promise<Log[]>)({
      address: [...addresses.values()],
      events: [...events.values()],
      fromBlock,
      toBlock,
    })) as Log[]

    for (const entry of active) {
      const filters = filtersByEntry.get(entry) ?? []
      if (filters.length === 0) continue
      const decoded = decodeFeedLogs(filters, rawLogs)
      // A racing getLogs can return logs past the tick's block; exclude anything outside [from, to].
      const windowed = decoded.filter((log) => log.blockNumber >= fromBlock && log.blockNumber <= toBlock)
      const reconciled = reconcileLogs({ book: entry.logBook, observed: windowed, fromBlock, toBlock })
      entry.logBook = reconciled.book
      logsByEntry.set(entry, { newLogs: reconciled.newLogs, retractions: reconciled.retractions })
    }
    return logsByEntry
  }

  function deriveAndPublish(
    entry: EngineEntry,
    identity: TickIdentity,
    results: Record<string, CallResult>,
    entryLogs: EntryLogs
  ): void {
    const { newLogs, retractions } = entryLogs

    // Log/retraction events are NEVER suppressed: `reconcileLogs` already recorded these logs in the
    // source's book, so if we don't emit them now they are lost forever. Build them up front, before
    // derive runs, so they survive an `undefined` emission or a throw. Order: logs → retractions.
    const logEvents: FeedEvent<unknown>[] = []
    for (const log of newLogs) logEvents.push({ type: 'log', log })
    for (const log of retractions) logEvents.push({ type: 'retraction', log })

    const tick: TickData = { identity, results, logs: newLogs, retractions }

    let emission: SourceEmission<unknown> | undefined
    let derived = false
    let errorEvent: FeedEvent<unknown> | undefined
    try {
      emission = entry.source.derive(tick, entry.prev)
      derived = true
    } catch (err) {
      // Source-level isolation: keep prev, don't publish a tick. Surface the error to THIS store only
      // (scope 'source') AND rethrow async to the host. Still fall through so the tick's
      // logs/retractions are published (never suppressed).
      errorEvent = { type: 'error', scope: 'source', error: err, identity }
      queueMicrotask(() => {
        throw err
      })
    }

    // Derive threw, or returned `undefined` (nothing to say): no tick event and prev does not advance,
    // but the tick's error/logs/retractions still ship.
    if (!derived || emission === undefined) {
      const events = errorEvent ? [errorEvent, ...logEvents] : logEvents
      if (events.length > 0) entry.store.publish(events)
      return
    }

    const prev = entry.prev
    const events: FeedEvent<unknown>[] = [...logEvents]

    const valueEquals = entry.source.valueEquals ?? Object.is
    const valueChanged = prev === undefined || !valueEquals(prev.value, emission.value)
    // Suppression: unchanged value → no tick event (and none enters the buffer), but prev still
    // advances and log/retraction events are never suppressed. Order within a source's batch:
    // logs → retractions → tick.
    if (valueChanged) events.push({ type: 'tick', emission })

    entry.prev = emission
    if (events.length > 0) entry.store.publish(events)
  }

  /** Publish a tick-scope diagnostic error to every active store (shared read/getLogs failure). */
  function publishTickError(active: EngineEntry[], error: unknown, identity: TickIdentity | undefined): void {
    const event: FeedEvent<unknown> = { type: 'error', scope: 'tick', error, identity }
    for (const entry of active) entry.store.publish([event])
  }

  async function doTick(): Promise<void> {
    clearTimer()
    // Only sources with a live subscriber participate this tick. A zero-subscriber (orphan) entry
    // registered via `watch()` would otherwise inflate every multicall forever. Skipped entries keep
    // their `prev`, `logBook`, and store state frozen and resume participating when resubscribed.
    const active = [...entries.values()].filter((entry) => entry.store.subscriberCount > 0)

    // (a) Gather each source's calls; dedupe identical cross-source calls into shared slots.
    const batch = planCallBatch(
      active.map((entry) => ({ requester: entry, sourceKey: entry.source.key, calls: entry.source.calls(entry.prev) }))
    )

    // (b) Atomic read.
    let result
    try {
      result = await readTick(client, batch.keyed)
    } catch (err) {
      // Shared failure: no trustworthy identity yet. Fan the diagnostic out to every active store.
      publishTickError(active, err, undefined)
      handleTickFailure()
      return
    }

    const identity = result.identity
    // (c) Same identity ⇒ nothing moved: skip logs + derive. Never skip after a failure
    // (`consecutiveFailures > 0` iff the previous tick failed — cleared only by a full success).
    const identityUnchanged =
      prevIdentity !== undefined &&
      prevIdentity.blockNumber === identity.blockNumber &&
      prevIdentity.parentBlockHash === identity.parentBlockHash
    const skip = identityUnchanged && consecutiveFailures === 0

    if (skip) {
      // A successful read with an unchanged identity still clears failure/backoff/stale state.
      onTickSuccess()
      prevIdentity = identity
      scheduleNextSuccess()
      return
    }

    // Map deduped slot results back to every requester's own un-namespaced call keys.
    const resultsByEntry = batch.distribute(result.results)

    // (d) One union getLogs → per-source reconciliation (also publishes any `gap` for the un-scanned span).
    let logsByEntry: Map<EngineEntry, EntryLogs>
    try {
      logsByEntry = await fetchAndReconcileLogs(active, identity)
    } catch (err) {
      // getLogs failed after a good atomic read: the tick's identity IS known — carry it.
      publishTickError(active, err, { chainId, ...identity })
      handleTickFailure()
      return
    }

    // A2: only now — after BOTH the atomic read AND the logs stage succeeded — is the tick a success.
    // Clearing failure/backoff/stale before the logs fetch would mask a persistent getLogs outage.
    onTickSuccess()

    // (e) Derive + publish, one source at a time (source-level errors isolated).
    const fullIdentity: TickIdentity = { chainId, ...identity }
    const noLogs: EntryLogs = { newLogs: [], retractions: [] }
    for (const entry of active) {
      deriveAndPublish(entry, fullIdentity, resultsByEntry.get(entry) ?? {}, logsByEntry.get(entry) ?? noLogs)
    }

    prevIdentity = identity
    lastProcessedBlock = identity.blockNumber
    scheduleNextSuccess()
  }

  async function runTick(): Promise<void> {
    if (stopped || !running) return
    if (ticking) {
      pendingTrigger = true
      return
    }
    ticking = true
    try {
      await doTick()
    } finally {
      ticking = false
      if (pendingTrigger && running && !stopped) {
        pendingTrigger = false
        void runTick()
      }
    }
  }

  function startHeartbeat(): void {
    if (running || stopped) return
    running = true
    consecutiveFailures = 0
    prevIdentity = undefined // Force the first tick to derive (don't skip against stale identity).
    if (isWs) {
      // The block-notification registration must be synchronous so no pushed block is missed.
      wsUnwatch = (client.watchBlockNumber as unknown as (args: { onBlockNumber: () => void }) => () => void)({
        onBlockNumber: () => {
          void runTick()
        },
      })
    }
    // Defer the first tick to a microtask so every source subscribed in the same synchronous frame
    // (the page-mount pattern) is registered before `doTick` snapshots the active set — they all
    // share tick 1. No-op if the heartbeat was stopped in the interim (e.g. a synchronous
    // unsubscribe). Not the Scheduler: this is microtask ordering, not a timing policy.
    queueMicrotask(() => {
      if (running && !stopped) void runTick()
    })
  }

  function stopHeartbeat(): void {
    running = false
    clearTimer()
    clearWs()
  }

  function handleSubscriberChange(key: string, count: number): void {
    // Ignore callbacks from a store whose entry was unwatched (its count no longer refcounts).
    if (!entries.has(key)) return
    const prev = subscriberCounts.get(key) ?? 0
    totalSubscribers += count - prev
    subscriberCounts.set(key, count)
    if (stopped) return
    if (totalSubscribers > 0 && !running) startHeartbeat()
    else if (totalSubscribers <= 0 && running) stopHeartbeat()
  }

  return {
    watch<T>(source: Source<T>): FeedStore<T> {
      if (stopped) throw new BlockfeedError('Cannot watch on a stopped BlockFeed')
      const existing = entries.get(source.key)
      // First registered source object wins; equal keys share the one store.
      if (existing) return existing.store as unknown as FeedStore<T>

      const store = createInternalStore<T>({ bufferSize })
      const entry: EngineEntry = {
        source: source as unknown as Source<unknown>,
        store: store as unknown as InternalStore<unknown>,
        prev: undefined,
        logBook: emptyLogBook,
      }
      entries.set(source.key, entry)
      // A8: a store created while the feed is already stale must reflect that immediately, not report
      // stale:false until the next failure. (No-op fan-out — the snapshot flips to stale regardless.)
      if (staleActive) store.publish([{ type: 'stale', stale: true }])
      store.onSubscriberChange((count) => handleSubscriberChange(source.key, count))
      return store
    },
    unwatch(key: string): void {
      const entry = entries.get(key)
      if (!entry) return
      entries.delete(key)
      // Drop its subscriber count from the heartbeat refcount; stop the loop if it was the last.
      const count = subscriberCounts.get(key) ?? 0
      subscriberCounts.delete(key)
      totalSubscribers -= count
      if (!stopped && totalSubscribers <= 0 && running) stopHeartbeat()
    },
    stop(): void {
      stopped = true
      running = false
      clearTimer()
      clearWs()
    },
  }
}
