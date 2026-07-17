import type { AbiEvent, Address, Log, PublicClient } from 'viem'
import { toEventSelector } from 'viem'

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  DEFAULT_BUFFER_SIZE,
  DEFAULT_MAX_CALLS_PER_CHUNK,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_TRAILING_LOG_WINDOW,
  FALLBACK_POLL_INTERVAL_MS,
  STALE_AFTER_CONSECUTIVE_FAILURES,
} from './constants'
import { BlockfeedError } from './errors'
import type { LogBook } from './internal/logWindow'
import { decodeFeedLogs, emptyLogBook, reconcileLogs } from './internal/logWindow'
import type { Scheduler } from './internal/scheduler'
import { realScheduler } from './internal/scheduler'
import type { InternalStore } from './internal/store'
import { createInternalStore } from './internal/store'
import { readTick } from './internal/tickReader'
import type {
  CallResult,
  DecodedFeedLog,
  FeedEvent,
  FeedLogRef,
  FeedStore,
  LogFilter,
  Source,
  SourceEmission,
  SpeculativeCall,
  TickData,
  TickIdentity,
} from './types'

export { realScheduler } from './internal/scheduler'
export type { Scheduler } from './internal/scheduler'

export interface BlockFeedOptions {
  client: PublicClient
  /** Explicit; the engine never fetches it, so construction stays synchronous. */
  chainId: number
  /** HTTP poll cadence. Default `DEFAULT_POLL_INTERVAL_MS[chainId] ?? FALLBACK_POLL_INTERVAL_MS`. */
  pollIntervalMs?: number
  /** Trailing log window K (blocks re-scanned each tick). Default `DEFAULT_TRAILING_LOG_WINDOW`. */
  trailingLogWindow?: number
  /** Per-store rolling buffer length. Default `DEFAULT_BUFFER_SIZE`. */
  bufferSize?: number
  /** Max calls per multicall chunk. Default `DEFAULT_MAX_CALLS_PER_CHUNK`. */
  maxCallsPerChunk?: number
  /** Injectable time source (tests). Default `realScheduler`. */
  scheduler?: Scheduler
}

export interface BlockFeed {
  watch<T>(source: Source<T>): FeedStore<T>
  pause(): void
  resume(opts?: { logWindowOverride?: number }): void
  stop(): void
  readonly running: boolean
}

/** Per-source engine state. `T` is erased to `unknown` inside the engine; sources are opaque here. */
interface EngineEntry {
  source: Source<unknown>
  store: InternalStore<unknown>
  /** Threaded `ctx.prev`, updated after each non-suppressed derive. */
  prev: SourceEmission<unknown> | undefined
  logBook: LogBook
  // Per-tick scratch (reset each tick before use):
  tickResults: Record<string, CallResult>
  newLogs: DecodedFeedLog[]
  retractions: FeedLogRef[]
  filters: LogFilter[]
}

interface TickOptions {
  isResume?: boolean
  logWindowOverride?: number
}

/** Stable string identity for a call, for cross-source batch dedupe. */
function callFingerprint(callDescriptor: SpeculativeCall): string {
  const args = JSON.stringify(callDescriptor.args, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v))
  return `${callDescriptor.address.toLowerCase()}::${callDescriptor.functionName}::${args}`
}

/**
 * Create the block heartbeat engine for one `(chainId, client)` pair. The returned {@link BlockFeed}
 * owns a single atomic read loop shared by every watched source; the loop runs only while at least one
 * store has a subscriber (refcounted), one tick at a time (no overlap), with exponential backoff on
 * failure. See the package design doc §4.1–§4.4, §7–§8 for the intent behind each rule.
 */
export function createBlockFeed(opts: BlockFeedOptions): BlockFeed {
  const { client, chainId } = opts
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS[chainId] ?? FALLBACK_POLL_INTERVAL_MS
  const trailingLogWindow = opts.trailingLogWindow ?? DEFAULT_TRAILING_LOG_WINDOW
  const bufferSize = opts.bufferSize ?? DEFAULT_BUFFER_SIZE
  const maxCallsPerChunk = opts.maxCallsPerChunk ?? DEFAULT_MAX_CALLS_PER_CHUNK
  const scheduler = opts.scheduler ?? realScheduler
  // v1 rule: only a direct WebSocket transport uses the push trigger.
  const isWs = (client as { transport?: { type?: string } }).transport?.type === 'webSocket'

  const entries = new Map<string, EngineEntry>()
  const subscriberCounts = new Map<string, number>()
  let totalSubscribers = 0

  let running = false
  let stopped = false
  let paused = false

  // Overlap guard: at most one tick in flight. A trigger that arrives mid-tick sets `pendingTrigger`
  // so exactly one more tick runs immediately after the current one settles.
  let ticking = false
  let pendingTrigger = false
  // A6: the options of the coalesced follow-up tick. A resume trigger must not be lost behind a plain
  // poll/WS trigger, so resume options win over (and are never overwritten by) a plain trigger.
  let pendingOptions: TickOptions | undefined

  let timerHandle: unknown
  let wsUnwatch: (() => void) | undefined

  let prevIdentity: Omit<TickIdentity, 'chainId'> | undefined
  let prevTickFailed = false
  let lastProcessedBlock: bigint | undefined

  let consecutiveFailures = 0
  let staleActive = false

  function canSchedule(): boolean {
    return running && !paused && !stopped
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
    prevTickFailed = true
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
    prevTickFailed = false
    if (staleActive) {
      staleActive = false
      for (const entry of entries.values()) entry.store.publish([{ type: 'stale', stale: false }])
    }
  }

  /**
   * Fetch the union `getLogs` for the window, then split/reconcile into each source's own book.
   *
   * Window math (design doc §4.3, unified gap semantics):
   * - `bookK = trailingLogWindow` is the coverage each source's book was last built with; scanning below
   *   `lastProcessedBlock − (bookK − 1)` would re-observe logs the book never recorded and re-deliver them
   *   as new (the resume-duplication bug). The book's lower edge is therefore a hard floor on `fromBlock`.
   * - `tickK = logWindowOverride ?? trailingLogWindow` is this tick's requested look-back.
   * - `fromBlock = max(head − (tickK − 1), lastProcessedBlock − (bookK − 1), 0)`.
   * - Gap: whenever `lastProcessedBlock !== undefined && fromBlock > lastProcessedBlock + 1`, the span
   *   `[lastProcessedBlock + 1, fromBlock − 1]` was NOT re-scanned — publish a `gap` to every source with
   *   filters. This holds independent of whether an override was passed (an honest resume-without-override
   *   after a long pause, or a plain tick that skipped blocks, both surface the gap).
   */
  async function fetchAndReconcileLogs(
    active: EngineEntry[],
    identity: Omit<TickIdentity, 'chainId'>,
    overrideK: number | undefined
  ): Promise<void> {
    const bookLookback = BigInt(Math.max(0, trailingLogWindow - 1))
    const tickLookback = BigInt(Math.max(0, (overrideK ?? trailingLogWindow) - 1))
    const addresses = new Map<string, Address>()
    const events = new Map<string, AbiEvent>()
    for (const entry of active) {
      const filters = entry.source.logFilters ? entry.source.logFilters({ prev: entry.prev }) : []
      entry.filters = filters
      entry.newLogs = []
      entry.retractions = []
      for (const filter of filters) {
        addresses.set(filter.address.toLowerCase(), filter.address)
        events.set(toEventSelector(filter.event), filter.event)
      }
    }
    if (addresses.size === 0) return

    let fromBlock = identity.blockNumber - tickLookback
    if (lastProcessedBlock !== undefined) {
      const bookFloor = lastProcessedBlock - bookLookback
      if (bookFloor > fromBlock) fromBlock = bookFloor
    }
    if (fromBlock < 0n) fromBlock = 0n
    const toBlock = identity.blockNumber

    // Unified gap rule: any block strictly between lastProcessedBlock and fromBlock went un-scanned.
    if (lastProcessedBlock !== undefined && fromBlock > lastProcessedBlock + 1n) {
      const gap: FeedEvent<unknown> = { type: 'gap', fromBlock: lastProcessedBlock + 1n, toBlock: fromBlock - 1n }
      for (const entry of active) {
        if (entry.filters.length > 0) entry.store.publish([gap])
      }
    }

    const rawLogs = (await (client.getLogs as unknown as (args: unknown) => Promise<Log[]>)({
      address: [...addresses.values()],
      events: [...events.values()],
      fromBlock,
      toBlock,
    })) as Log[]

    for (const entry of active) {
      if (entry.filters.length === 0) continue
      const decoded = decodeFeedLogs(entry.filters, rawLogs)
      // A racing getLogs can return logs past the tick's block; exclude anything outside [from, to].
      const windowed = decoded.filter((log) => log.blockNumber >= fromBlock && log.blockNumber <= toBlock)
      const reconciled = reconcileLogs({ book: entry.logBook, observed: windowed, fromBlock, toBlock })
      entry.logBook = reconciled.book
      entry.newLogs = reconciled.newLogs
      entry.retractions = reconciled.retractions
    }
  }

  function deriveAndPublish(entry: EngineEntry, identity: TickIdentity): void {
    const tick: TickData = {
      identity,
      results: entry.tickResults,
      logs: entry.newLogs,
      retractions: entry.retractions,
    }

    // Log/retraction events are NEVER suppressed: `reconcileLogs` already recorded these logs in the
    // source's book, so if we don't emit them now they are lost forever. Build them up front, before
    // derive runs, so they survive an `undefined` emission or a throw. Order: logs → retractions.
    const logEvents: FeedEvent<unknown>[] = []
    for (const log of entry.newLogs) logEvents.push({ type: 'log', log })
    for (const ref of entry.retractions) logEvents.push({ type: 'retraction', ref })

    let emission: SourceEmission<unknown> | undefined
    let derived = false
    try {
      emission = entry.source.derive(tick, { prev: entry.prev })
      derived = true
    } catch (err) {
      // Source-level isolation: keep prev, don't publish phase/tick, rethrow async to the host.
      // Still fall through so the tick's logs/retractions are published (never suppressed).
      queueMicrotask(() => {
        throw err
      })
    }

    // Derive threw, or returned `undefined` (nothing to say): no phase/tick event and prev does not
    // advance, but the tick's logs/retractions still ship.
    if (!derived || emission === undefined) {
      if (logEvents.length > 0) entry.store.publish(logEvents)
      return
    }

    const prev = entry.prev
    const events: FeedEvent<unknown>[] = []

    // Order within a source's batch: phase → logs → retractions → tick.
    if (emission.phase !== undefined && emission.phase !== prev?.phase) {
      events.push({ type: 'phase', from: prev?.phase, to: emission.phase, identity })
    }
    events.push(...logEvents)

    const valueEquals = entry.source.valueEquals ?? Object.is
    const valueChanged = prev === undefined || !valueEquals(prev.value, emission.value)
    // Suppression: unchanged value + unchanged phase → no tick event (and none enters the buffer),
    // but prev still advances and log/retraction events are never suppressed.
    if (valueChanged) events.push({ type: 'tick', emission })

    entry.prev = emission
    if (events.length > 0) entry.store.publish(events)
  }

  async function doTick(options: TickOptions | undefined): Promise<void> {
    clearTimer()
    // Only sources with a live subscriber participate this tick. A zero-subscriber (orphan) entry
    // registered via `watch()` would otherwise inflate every multicall forever. Skipped entries keep
    // their `prev`, `logBook`, and store state frozen and resume participating when resubscribed.
    const active = [...entries.values()].filter((entry) => entry.store.subscriberCount > 0)

    // (a) Gather each source's calls, namespace keys, and dedupe identical calls into shared slots.
    const keyed: Record<string, SpeculativeCall> = {}
    const fingerprintToSlot = new Map<string, string>()
    const slotRequesters = new Map<string, Array<{ entry: EngineEntry; callKey: string }>>()
    for (const entry of active) {
      entry.tickResults = {}
      const calls = entry.source.calls({ prev: entry.prev })
      for (const [callKey, descriptor] of Object.entries(calls)) {
        const fingerprint = callFingerprint(descriptor)
        let slotKey = fingerprintToSlot.get(fingerprint)
        if (slotKey === undefined) {
          slotKey = `${entry.source.key}:${callKey}`
          fingerprintToSlot.set(fingerprint, slotKey)
          keyed[slotKey] = {
            address: descriptor.address,
            abi: descriptor.abi,
            functionName: descriptor.functionName,
            args: descriptor.args,
            allowFailure: descriptor.allowFailure === true,
          }
          slotRequesters.set(slotKey, [])
        } else {
          // Shared slot tolerates failure only if EVERY requester tolerates it (AND).
          const slot = keyed[slotKey] as SpeculativeCall
          slot.allowFailure = slot.allowFailure === true && descriptor.allowFailure === true
        }
        slotRequesters.get(slotKey)!.push({ entry, callKey })
      }
    }

    // (b) Atomic read.
    let result
    try {
      result = await readTick(client, { keyed }, { maxCallsPerChunk })
    } catch {
      handleTickFailure()
      return
    }

    const identity = result.identity
    const isResume = options?.isResume === true
    // (c) Same identity ⇒ nothing moved: skip logs + derive. Never skip on resume or after a failure.
    const identityUnchanged =
      prevIdentity !== undefined &&
      prevIdentity.blockNumber === identity.blockNumber &&
      prevIdentity.parentBlockHash === identity.parentBlockHash
    const skip = identityUnchanged && !isResume && !prevTickFailed

    if (skip) {
      // A successful read with an unchanged identity still clears failure/backoff/stale state.
      onTickSuccess()
      prevIdentity = identity
      scheduleNextSuccess()
      return
    }

    // Map deduped slot results back to every requester's own un-namespaced call key.
    for (const [slotKey, requesters] of slotRequesters) {
      const res = result.results[slotKey]
      if (res === undefined) continue
      for (const { entry, callKey } of requesters) entry.tickResults[callKey] = res
    }

    // (d) One union getLogs → per-source reconciliation (also publishes any `gap` for the un-scanned span).
    try {
      await fetchAndReconcileLogs(active, identity, isResume ? options?.logWindowOverride : undefined)
    } catch {
      handleTickFailure()
      return
    }

    // A2: only now — after BOTH the atomic read AND the logs stage succeeded — is the tick a success.
    // Clearing failure/backoff/stale before the logs fetch would mask a persistent getLogs outage.
    onTickSuccess()

    // (e) Derive + publish, one source at a time (source-level errors isolated).
    const fullIdentity: TickIdentity = { chainId, ...identity }
    for (const entry of active) deriveAndPublish(entry, fullIdentity)

    prevIdentity = identity
    prevTickFailed = false
    lastProcessedBlock = identity.blockNumber
    scheduleNextSuccess()
  }

  async function runTick(options?: TickOptions): Promise<void> {
    if (stopped || !running || paused) return
    if (ticking) {
      pendingTrigger = true
      // Resume options win; once a resume is pending a plain trigger must not clobber it.
      if (options?.isResume) pendingOptions = options
      else if (pendingOptions?.isResume !== true) pendingOptions = options
      return
    }
    ticking = true
    try {
      await doTick(options)
    } finally {
      ticking = false
      if (pendingTrigger && running && !paused && !stopped) {
        pendingTrigger = false
        const next = pendingOptions
        pendingOptions = undefined
        void runTick(next)
      }
    }
  }

  function startHeartbeat(): void {
    if (running || stopped) return
    running = true
    // A4: do NOT reset `paused`. A feed paused before its first subscriber (mount-while-hidden) must
    // stay paused when the heartbeat starts; the deferred first tick below is guarded on `!paused`.
    consecutiveFailures = 0
    prevIdentity = undefined // Force the first tick to derive (don't skip against stale identity).
    prevTickFailed = false
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
    // share tick 1. No-op if the heartbeat was stopped/paused in the interim (e.g. a synchronous
    // unsubscribe). Not the Scheduler: this is microtask ordering, not a timing policy.
    queueMicrotask(() => {
      if (running && !paused && !stopped) void runTick()
    })
  }

  function stopHeartbeat(): void {
    running = false
    clearTimer()
    clearWs()
  }

  function handleSubscriberChange(key: string, count: number): void {
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
        tickResults: {},
        newLogs: [],
        retractions: [],
        filters: [],
      }
      entries.set(source.key, entry)
      // A8: a store created while the feed is already stale must reflect that immediately, not report
      // stale:false until the next failure. (No-op fan-out — the snapshot flips to stale regardless.)
      if (staleActive) store.publish([{ type: 'stale', stale: true }])
      store.onSubscriberChange((count) => handleSubscriberChange(source.key, count))
      return store
    },
    pause(): void {
      if (stopped) return
      paused = true
      clearTimer()
    },
    resume(resumeOpts?: { logWindowOverride?: number }): void {
      if (stopped) return
      // A4: clear `paused` even when not running so a later subscribe starts live (never stuck paused).
      paused = false
      if (!running) return
      void runTick({ isResume: true, logWindowOverride: resumeOpts?.logWindowOverride })
    },
    stop(): void {
      stopped = true
      running = false
      paused = false
      clearTimer()
      clearWs()
    },
    get running(): boolean {
      return running
    },
  }
}
