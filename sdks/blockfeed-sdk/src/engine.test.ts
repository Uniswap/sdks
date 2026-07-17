import { afterEach, describe, expect, it } from 'bun:test'
import type { AbiEvent, Log, PublicClient } from 'viem'
import { parseAbiItem, toEventSelector } from 'viem'

import { BACKOFF_BASE_MS } from './constants'
import { createBlockFeed } from './engine'
import type { Scheduler } from './internal/scheduler'
import type { FeedEvent, Source, SpeculativeCall } from './types'

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type RawResult = { status: 'success'; result: unknown } | { status: 'failure'; error: Error }
const ok = (result: unknown): RawResult => ({ status: 'success', result })
const fail = (message: string): RawResult => ({ status: 'failure', error: new Error(message) })

/** Real-macrotask flush so all pending microtasks/promises settle (engine's injected scheduler is fake). */
const flush = (): Promise<void> => new Promise((r) => globalThis.setTimeout(r, 0))

/** Manual-clock scheduler: `advance(ms)` fires due timers in fire-time order, flushing between each. */
function createFakeScheduler() {
  let now = 0
  let seq = 0
  const timers = new Map<number, { fireAt: number; cb: () => void }>()
  const scheduler: Scheduler = {
    setTimeout(cb, ms) {
      const id = ++seq
      timers.set(id, { fireAt: now + ms, cb })
      return id
    },
    clearTimeout(handle) {
      if (typeof handle === 'number') timers.delete(handle)
    },
  }
  async function advance(ms: number): Promise<void> {
    now += ms
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.fireAt <= now)
        .sort((a, b) => a[1].fireAt - b[1].fireAt)
      if (due.length === 0) break
      const [id, t] = due[0]!
      timers.delete(id)
      t.cb()
      await flush()
    }
  }
  return {
    scheduler,
    advance,
    pendingDelays: () => [...timers.values()].map((t) => t.fireAt - now).sort((a, b) => a - b),
    timerCount: () => timers.size,
  }
}

interface FakeBlock {
  number: bigint
  hash: `0x${string}`
  ts: bigint
}

interface FakeClientOpts {
  ws?: boolean
  block?: () => FakeBlock
  resolveCall?: (c: { address: string; functionName: string; args: readonly unknown[] }) => RawResult
  logs?: () => Log[]
  failMulticall?: () => boolean
}

function createFakeClient(opts: FakeClientOpts = {}) {
  const block = opts.block ?? (() => ({ number: 100n, hash: `0x${'ab'.repeat(32)}`, ts: 1700n }))
  const state = {
    multicallCount: 0,
    getLogsCount: 0,
    contractsSeen: [] as Array<Array<{ address: string; functionName: string; args: readonly unknown[] }>>,
    getLogsParams: [] as Array<{ fromBlock: bigint; toBlock: bigint }>,
    watchCount: 0,
    unwatchCount: 0,
    push: undefined as undefined | ((b: bigint) => void),
  }
  const client = {
    transport: { type: opts.ws ? 'webSocket' : 'http' },
    multicall: async ({ contracts }: { contracts: Array<{ functionName: string }> }) => {
      state.multicallCount += 1
      state.contractsSeen.push(contracts as never)
      if (opts.failMulticall?.()) throw new Error('rpc down')
      const b = block()
      return contracts.map((c) => {
        if (c.functionName === 'getBlockNumber') return ok(b.number)
        if (c.functionName === 'getLastBlockHash') return ok(b.hash)
        if (c.functionName === 'getCurrentBlockTimestamp') return ok(b.ts)
        return opts.resolveCall ? opts.resolveCall(c as never) : ok(0n)
      })
    },
    getLogs: async (params: { fromBlock: bigint; toBlock: bigint }) => {
      state.getLogsCount += 1
      state.getLogsParams.push(params)
      return opts.logs ? opts.logs() : []
    },
    watchBlockNumber: ({ onBlockNumber }: { onBlockNumber: (b: bigint) => void }) => {
      state.watchCount += 1
      state.push = onBlockNumber
      return () => {
        state.unwatchCount += 1
        state.push = undefined
      }
    },
  }
  return { client: client as unknown as PublicClient, state }
}

const ADDR = '0x000000000004444c5dc75cB358380D2e3dE08A90'
const call = (functionName: string, allowFailure?: boolean): SpeculativeCall => ({
  address: ADDR,
  abi: [],
  functionName,
  args: [],
  allowFailure,
})

function source<T>(over: { key: string; derive: Source<T>['derive'] } & Partial<Source<T>>): Source<T> {
  return {
    key: over.key,
    calls: over.calls ?? (() => ({})),
    logFilters: over.logFilters,
    derive: over.derive,
    valueEquals: over.valueEquals,
  }
}

const BID_EVENT = parseAbiItem('event Bid(address indexed bidder, uint256 amount)') as AbiEvent
function bidLog(blockNumber: bigint, logIndex: number): Log {
  return {
    address: ADDR,
    topics: [toEventSelector(BID_EVENT), `0x000000000000000000000000${'11'.repeat(20)}`],
    data: `0x${(123n).toString(16).padStart(64, '0')}`,
    blockNumber,
    transactionHash: `0xdead${logIndex}`,
    logIndex,
    removed: false,
  } as unknown as Log
}

// ---------------------------------------------------------------------------
// queueMicrotask capture (for derive-throw isolation)
// ---------------------------------------------------------------------------

let restoreMicrotask: (() => void) | undefined
afterEach(() => {
  restoreMicrotask?.()
  restoreMicrotask = undefined
})
function captureMicrotasks(): Array<() => void> {
  const original = globalThis.queueMicrotask
  const scheduled: Array<() => void> = []
  globalThis.queueMicrotask = (cb: () => void) => scheduled.push(cb)
  restoreMicrotask = () => {
    globalThis.queueMicrotask = original
  }
  return scheduled
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createBlockFeed', () => {
  it('(a) refcounts: starts on first subscriber, stops on last unsubscribe', async () => {
    const { client, state } = createFakeClient({ resolveCall: () => ok(1n) })
    const { scheduler, advance, timerCount } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(source({ key: 's', derive: (t) => ({ value: 1, identity: t.identity }) }))

    expect(feed.running).toBe(false)
    expect(state.multicallCount).toBe(0)

    const unsub = store.subscribe(() => {})
    await flush()
    expect(feed.running).toBe(true)
    expect(state.multicallCount).toBe(1)

    unsub()
    expect(feed.running).toBe(false)
    expect(timerCount()).toBe(0)
    const before = state.multicallCount
    await advance(5000)
    expect(state.multicallCount).toBe(before)
  })

  it('(b) two sources sharing one identical call → one batch slot, both derive', async () => {
    const { client, state } = createFakeClient({ resolveCall: (c) => (c.functionName === 'foo' ? ok(42n) : ok(0n)) })
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })

    const shared = () => ({ x: call('foo') })
    const a = source<bigint>({ key: 'a', calls: shared, derive: (t) => ({ value: (t.results['x'] as { result: bigint }).result, identity: t.identity }) })
    const b = source<bigint>({ key: 'b', calls: shared, derive: (t) => ({ value: (t.results['x'] as { result: bigint }).result, identity: t.identity }) })
    const sa = feed.watch(a)
    const sb = feed.watch(b)
    // Both subscribe in the same synchronous frame; the deferred first tick sees both.
    sa.subscribe(() => {})
    sb.subscribe(() => {})
    await flush()

    // Only ONE 'foo' contract in the batch despite two sources requesting it.
    const fooSlots = state.contractsSeen[0]!.filter((c) => c.functionName === 'foo')
    expect(fooSlots.length).toBe(1)
    expect(sa.getSnapshot().current?.value).toBe(42n)
    expect(sb.getSnapshot().current?.value).toBe(42n)
  })

  it('(c) suppression: identical value across ticks → one tick event, buffer length 1', async () => {
    const { client, state } = createFakeClient({
      // Block number advances each tick (identity changes → derive runs), value stays constant.
      block: () => ({ number: BigInt(100 + state.multicallCount), hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
    })
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(source({ key: 's', derive: (t) => ({ value: 5, identity: t.identity }) }))
    const ticks: FeedEvent<number>[] = []
    store.subscribe((e) => {
      if (e.type === 'tick') ticks.push(e)
    })
    await flush()
    await advance(1000)

    expect(ticks.length).toBe(1)
    expect(store.getSnapshot().buffer.length).toBe(1)
  })

  it('(d) phase change emits phase event before the tick event', async () => {
    const { client, state } = createFakeClient({
      block: () => ({ number: BigInt(100 + state.multicallCount), hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
    })
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(
      source<number>({
        key: 's',
        derive: (t, ctx) => {
          const value = (ctx.prev?.value ?? 0) + 1
          return { value, phase: value === 1 ? 'a' : 'b', identity: t.identity }
        },
      })
    )
    let seen: string[] = []
    store.subscribe((e) => seen.push(e.type))
    await flush() // tick 1: phase a + tick
    seen = []
    await advance(1000) // tick 2: phase a→b + tick

    expect(seen).toEqual(['phase', 'tick'])
  })

  it('(e) log events are ordered before the tick event within a tick', async () => {
    const { client } = createFakeClient({ logs: () => [bidLog(100n, 0)] })
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(
      source<number>({
        key: 's',
        logFilters: () => [{ address: ADDR, event: BID_EVENT }],
        derive: (t) => ({ value: 1, identity: t.identity }),
      })
    )
    const seen: string[] = []
    store.subscribe((e) => seen.push(e.type))
    await flush()

    expect(seen).toEqual(['log', 'tick'])
  })

  it('(f) backoff schedule + stale at 3 failures, recovery clears', async () => {
    let failures = 0
    const { client } = createFakeClient({ failMulticall: () => failures++ < 3, resolveCall: () => ok(1n) })
    const { scheduler, advance, pendingDelays } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(source({ key: 's', derive: (t) => ({ value: 1, identity: t.identity }) }))
    store.subscribe(() => {})

    await flush() // failure 1 → backoff 2^1
    expect(pendingDelays()).toEqual([BACKOFF_BASE_MS * 2])
    expect(store.getSnapshot().stale).toBe(false)

    await advance(BACKOFF_BASE_MS * 2) // failure 2 → backoff 2^2
    expect(pendingDelays()).toEqual([BACKOFF_BASE_MS * 4])
    expect(store.getSnapshot().stale).toBe(false)

    await advance(BACKOFF_BASE_MS * 4) // failure 3 → backoff 2^3 + stale
    expect(pendingDelays()).toEqual([BACKOFF_BASE_MS * 8])
    expect(store.getSnapshot().stale).toBe(true)

    await advance(BACKOFF_BASE_MS * 8) // success → recover, normal cadence
    expect(store.getSnapshot().stale).toBe(false)
    expect(store.getSnapshot().current?.value).toBe(1)
    expect(pendingDelays()).toEqual([1000])
  })

  it('(g) identical identity skips derive and the log fetch', async () => {
    const { client, state } = createFakeClient({ logs: () => [] }) // constant block 100 / same hash
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    let deriveCalls = 0
    const store = feed.watch(
      source({
        key: 's',
        logFilters: () => [{ address: ADDR, event: BID_EVENT }],
        derive: (t) => {
          deriveCalls += 1
          return { value: 1, identity: t.identity }
        },
      })
    )
    store.subscribe(() => {})
    await flush() // tick 1
    expect(deriveCalls).toBe(1)
    expect(state.getLogsCount).toBe(1)

    await advance(1000) // tick 2, same identity → skip
    expect(state.multicallCount).toBe(2)
    expect(deriveCalls).toBe(1)
    expect(state.getLogsCount).toBe(1)
  })

  it('(h) WS trigger path runs a tick on start and on each pushed block number', async () => {
    const { client, state } = createFakeClient({ ws: true, resolveCall: () => ok(1n) })
    const { scheduler, timerCount } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, scheduler })
    const store = feed.watch(source({ key: 's', derive: (t) => ({ value: 1, identity: t.identity }) }))
    store.subscribe(() => {})
    await flush()

    expect(state.watchCount).toBe(1)
    expect(state.multicallCount).toBe(1) // immediate first tick
    expect(timerCount()).toBe(0) // no HTTP poll timer in WS mode

    state.push!(101n)
    await flush()
    expect(state.multicallCount).toBe(2)

    state.push!(102n)
    await flush()
    expect(state.multicallCount).toBe(3)

    feed.stop()
    expect(state.unwatchCount).toBe(1)
  })

  it('(i) pause/resume publishes a gap event when the pause outran the override window', async () => {
    let blockNo = 100n
    const { client } = createFakeClient({ block: () => ({ number: blockNo, hash: `0x${'ab'.repeat(32)}`, ts: 1700n }) })
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(
      source<bigint>({
        key: 's',
        logFilters: () => [{ address: ADDR, event: BID_EVENT }],
        derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }),
      })
    )
    const events: FeedEvent<bigint>[] = []
    store.subscribe((e) => events.push(e))
    await flush() // tick at block 100 → lastProcessed = 100

    feed.pause()
    blockNo = 110n
    events.length = 0
    feed.resume({ logWindowOverride: 3 })
    await flush()

    const gap = events.find((e) => e.type === 'gap')
    expect(gap).toBeDefined()
    if (gap && gap.type === 'gap') {
      expect(gap.fromBlock).toBe(101n)
      expect(gap.toBlock).toBe(107n) // 110 - 3
    }
  })

  it('(j) a throwing derive isolates that source; others still emit', async () => {
    const { client } = createFakeClient({ resolveCall: () => ok(1n) })
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })

    const bad = feed.watch(
      source({
        key: 'bad',
        derive: () => {
          throw new Error('derive boom')
        },
      })
    )
    const good = feed.watch(source({ key: 'good', derive: (t) => ({ value: 7, identity: t.identity }) }))
    // Both subscribe in the same frame → they share tick 1 (the deferred first tick).
    bad.subscribe(() => {})
    good.subscribe(() => {})
    // Capture AFTER subscribing: the deferred first-tick microtask was already queued via the real
    // queueMicrotask, so it still runs on flush; only the derive-throw rethrow is captured here.
    const scheduled = captureMicrotasks()
    await flush()

    expect(good.getSnapshot().current?.value).toBe(7)
    expect(bad.getSnapshot().current).toBeUndefined()
    expect(scheduled.length).toBe(1)
    expect(() => scheduled[0]!()).toThrow('derive boom')
  })

  it('(k) log events are delivered even when derive returns undefined; not re-delivered next tick', async () => {
    let blockNo = 100n
    const { client } = createFakeClient({
      block: () => ({ number: blockNo, hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
      logs: () => [bidLog(100n, 0)],
    })
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(
      source<number>({
        key: 's',
        logFilters: () => [{ address: ADDR, event: BID_EVENT }],
        derive: () => undefined, // never emits — but the log must still flow
      })
    )
    const seen: FeedEvent<number>[] = []
    store.subscribe((e) => seen.push(e))
    await flush() // tick 1 at block 100: one new log, undefined emission

    expect(seen.map((e) => e.type)).toEqual(['log']) // log delivered, no tick event
    expect(store.getSnapshot().current).toBeUndefined()

    seen.length = 0
    blockNo = 101n // identity advances → tick 2 runs and re-scans the window
    await advance(1000)
    // The block-100 log is already recorded in the source's book → not re-delivered.
    expect(seen.filter((e) => e.type === 'log').length).toBe(0)
  })

  it('(l) log events are delivered even when derive throws; not re-delivered next tick', async () => {
    let blockNo = 100n
    const { client } = createFakeClient({
      block: () => ({ number: blockNo, hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
      logs: () => [bidLog(100n, 0)],
    })
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(
      source<number>({
        key: 's',
        logFilters: () => [{ address: ADDR, event: BID_EVENT }],
        derive: () => {
          throw new Error('derive boom')
        },
      })
    )
    const seen: FeedEvent<number>[] = []
    store.subscribe((e) => seen.push(e))
    // Capture after subscribing so the deferred first tick still runs; only the rethrow is captured.
    const scheduled = captureMicrotasks()
    await flush() // tick 1: throw isolated, but log still ships

    expect(seen.map((e) => e.type)).toEqual(['log'])
    expect(store.getSnapshot().current).toBeUndefined()
    expect(scheduled.length).toBe(1) // throw rethrown async
    expect(() => scheduled[0]!()).toThrow('derive boom')

    seen.length = 0
    blockNo = 101n
    await advance(1000)
    // Book dedupe intact: the log recorded on tick 1 does not re-emit.
    expect(seen.filter((e) => e.type === 'log').length).toBe(0)
  })

  it('(m) a zero-subscriber source stops participating in ticks', async () => {
    const { client, state } = createFakeClient({
      block: () => ({ number: BigInt(100 + state.multicallCount), hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
      resolveCall: () => ok(1n),
    })
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const sa = feed.watch(
      source<bigint>({ key: 'a', calls: () => ({ x: call('afoo') }), derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }) })
    )
    const sb = feed.watch(
      source<bigint>({ key: 'b', calls: () => ({ y: call('bfoo') }), derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }) })
    )
    sa.subscribe(() => {})
    const unsubB = sb.subscribe(() => {})
    await flush() // tick 1: both participate (same-frame subscribe)

    expect(state.contractsSeen.at(-1)!.some((c) => c.functionName === 'bfoo')).toBe(true)
    const bFrozen = sb.getSnapshot().current?.value

    unsubB() // b now has zero subscribers; a keeps the feed running
    await advance(1000) // tick 2

    const lastBatch = state.contractsSeen.at(-1)!
    expect(lastBatch.some((c) => c.functionName === 'bfoo')).toBe(false) // b contributes no calls
    expect(lastBatch.some((c) => c.functionName === 'afoo')).toBe(true) // a still participates
    expect(sb.getSnapshot().current?.value).toBe(bFrozen) // b's snapshot stops advancing
  })

  it('(n) resubscribing resumes participation on the following tick', async () => {
    const { client, state } = createFakeClient({
      block: () => ({ number: BigInt(100 + state.multicallCount), hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
      resolveCall: () => ok(1n),
    })
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const sa = feed.watch(
      source<bigint>({ key: 'a', calls: () => ({ x: call('afoo') }), derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }) })
    )
    const sb = feed.watch(
      source<bigint>({ key: 'b', calls: () => ({ y: call('bfoo') }), derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }) })
    )
    sa.subscribe(() => {})
    const unsubB = sb.subscribe(() => {})
    await flush() // tick 1: both participate (same-frame subscribe)

    unsubB()
    await advance(1000) // tick 2: b skipped
    expect(state.contractsSeen.at(-1)!.some((c) => c.functionName === 'bfoo')).toBe(false)

    sb.subscribe(() => {}) // resubscribe (feed already running via a)
    await advance(1000) // tick 3: b resumes
    expect(state.contractsSeen.at(-1)!.some((c) => c.functionName === 'bfoo')).toBe(true)
    expect(sb.getSnapshot().current?.value).toBeDefined()
  })

  it('(o) two stores subscribed in the same frame both join tick 1 (single multicall)', async () => {
    const { client, state } = createFakeClient({ resolveCall: () => ok(1n) })
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const sa = feed.watch(
      source<bigint>({ key: 'a', calls: () => ({ x: call('afoo') }), derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }) })
    )
    const sb = feed.watch(
      source<bigint>({ key: 'b', calls: () => ({ y: call('bfoo') }), derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }) })
    )
    // Page-mount pattern: both stores subscribe synchronously before any tick runs.
    sa.subscribe(() => {})
    sb.subscribe(() => {})
    await flush()

    // Exactly one tick ran, and its single multicall batch carries BOTH sources' calls.
    expect(state.multicallCount).toBe(1)
    const batch = state.contractsSeen[0]!
    expect(batch.some((c) => c.functionName === 'afoo')).toBe(true)
    expect(batch.some((c) => c.functionName === 'bfoo')).toBe(true)
    expect(sa.getSnapshot().current).toBeDefined()
    expect(sb.getSnapshot().current).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // A1 — window continuity + unified gap rule
  // -------------------------------------------------------------------------

  it('(A1-i) short pause + large override → no duplicate log, no gap (book floor clamps fromBlock)', async () => {
    let blockNo = 100n
    const { client, state } = createFakeClient({
      block: () => ({ number: blockNo, hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
      logs: () => [bidLog(100n, 0)], // the block-100 log is present in every scan
    })
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(
      source<bigint>({
        key: 's',
        logFilters: () => [{ address: ADDR, event: BID_EVENT }],
        derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }),
      })
    )
    const events: FeedEvent<bigint>[] = []
    store.subscribe((e) => events.push(e))
    await flush() // tick 1 @ block 100 → log delivered, lastProcessed = 100

    expect(events.filter((e) => e.type === 'log').length).toBe(1)
    feed.pause()
    blockNo = 101n // SHORT pause: head advanced only 1 block
    events.length = 0
    feed.resume({ logWindowOverride: 20 })
    await flush()

    // fromBlock = max(101-19, 100-2, 0) = 98 → block-100 log already in book, not re-delivered; 98 <= 101 → no gap.
    expect(events.filter((e) => e.type === 'log').length).toBe(0)
    expect(events.find((e) => e.type === 'gap')).toBeUndefined()
    const last = state.getLogsParams.at(-1)!
    expect(last.fromBlock).toBe(98n)
    expect(last.toBlock).toBe(101n)
  })

  it('(A1-ii) long pause + override → gap with exact bounds and no duplicate of the pre-pause log', async () => {
    let blockNo = 100n
    const { client } = createFakeClient({
      block: () => ({ number: blockNo, hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
      logs: () => (blockNo === 100n ? [bidLog(100n, 0)] : []),
    })
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(
      source<bigint>({
        key: 's',
        logFilters: () => [{ address: ADDR, event: BID_EVENT }],
        derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }),
      })
    )
    const events: FeedEvent<bigint>[] = []
    store.subscribe((e) => events.push(e))
    await flush() // tick 1 @ 100 → log(100) delivered, lastProcessed = 100

    feed.pause()
    blockNo = 110n
    events.length = 0
    feed.resume({ logWindowOverride: 3 })
    await flush()

    const gap = events.find((e) => e.type === 'gap')
    expect(gap).toBeDefined()
    if (gap && gap.type === 'gap') {
      expect(gap.fromBlock).toBe(101n)
      expect(gap.toBlock).toBe(107n) // fromBlock(108) - 1
    }
    // block-100 log fell below the [108,110] window: evicted, never re-delivered, never retracted.
    expect(events.filter((e) => e.type === 'log').length).toBe(0)
    expect(events.filter((e) => e.type === 'retraction').length).toBe(0)
  })

  it('(A1-iii) resume WITHOUT override after a long pause still publishes a gap', async () => {
    let blockNo = 100n
    const { client } = createFakeClient({
      block: () => ({ number: blockNo, hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
    })
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(
      source<bigint>({
        key: 's',
        logFilters: () => [{ address: ADDR, event: BID_EVENT }],
        derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }),
      })
    )
    const events: FeedEvent<bigint>[] = []
    store.subscribe((e) => events.push(e))
    await flush() // lastProcessed = 100

    feed.pause()
    blockNo = 110n
    events.length = 0
    feed.resume() // no override → tickK = trailingLogWindow = 3
    await flush()

    const gap = events.find((e) => e.type === 'gap')
    expect(gap).toBeDefined()
    if (gap && gap.type === 'gap') {
      expect(gap.fromBlock).toBe(101n) // lastProcessed + 1
      expect(gap.toBlock).toBe(107n) // fromBlock(108) - 1
    }
  })

  it('(A1-iv) override 0 and override 1 are consistent: window [head,head], gap ends at head-1', async () => {
    const run = async (override: number): Promise<{ fromBlock: bigint; toBlock: bigint }> => {
      let blockNo = 100n
      const { client } = createFakeClient({
        block: () => ({ number: blockNo, hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
      })
      const { scheduler } = createFakeScheduler()
      const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
      const store = feed.watch(
        source<bigint>({
          key: 's',
          logFilters: () => [{ address: ADDR, event: BID_EVENT }],
          derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }),
        })
      )
      const events: FeedEvent<bigint>[] = []
      store.subscribe((e) => events.push(e))
      await flush() // lastProcessed = 100
      feed.pause()
      blockNo = 110n
      events.length = 0
      feed.resume({ logWindowOverride: override })
      await flush()
      const gap = events.find((e) => e.type === 'gap')
      if (!gap || gap.type !== 'gap') throw new Error('expected gap')
      return { fromBlock: gap.fromBlock, toBlock: gap.toBlock }
    }
    const g0 = await run(0)
    const g1 = await run(1)
    // Both collapse the scan window to [110,110]; gap covers [101,109].
    expect(g0).toEqual({ fromBlock: 101n, toBlock: 109n })
    expect(g1).toEqual({ fromBlock: 101n, toBlock: 109n })
  })

  // -------------------------------------------------------------------------
  // A2 — stale/backoff state machine runs AFTER the logs stage
  // -------------------------------------------------------------------------

  it('(A2) persistent getLogs failure (multicall healthy) still climbs to stale at 3 and recovers', async () => {
    let logsFail = 4
    const { client } = createFakeClient({
      // Block advances each tick so identity changes and the logs stage is always reached.
      block: (): FakeBlock => ({ number: 100n + BigInt(logsFail), hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
      logs: () => {
        if (logsFail-- > 1) throw new Error('getLogs down')
        return []
      },
    })
    const { scheduler, advance, pendingDelays } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(
      source({ key: 's', logFilters: () => [{ address: ADDR, event: BID_EVENT }], derive: (t) => ({ value: 1, identity: t.identity }) })
    )
    store.subscribe(() => {})

    await flush() // failure 1 (getLogs threw) → backoff 2^1, NOT reset by the healthy multicall
    expect(pendingDelays()).toEqual([BACKOFF_BASE_MS * 2])
    expect(store.getSnapshot().stale).toBe(false)

    await advance(BACKOFF_BASE_MS * 2) // failure 2
    expect(pendingDelays()).toEqual([BACKOFF_BASE_MS * 4])
    expect(store.getSnapshot().stale).toBe(false)

    await advance(BACKOFF_BASE_MS * 4) // failure 3 → stale
    expect(store.getSnapshot().stale).toBe(true)

    await advance(BACKOFF_BASE_MS * 8) // success → recover
    expect(store.getSnapshot().stale).toBe(false)
    expect(pendingDelays()).toEqual([1000])
  })

  // -------------------------------------------------------------------------
  // A4 — pause preservation across mount
  // -------------------------------------------------------------------------

  it('(A4) pause before the first subscribe → no tick runs when a subscriber arrives', async () => {
    const { client, state } = createFakeClient({ resolveCall: () => ok(1n) })
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(source({ key: 's', derive: (t) => ({ value: 1, identity: t.identity }) }))

    feed.pause() // paused while not yet running
    store.subscribe(() => {})
    await flush()

    expect(feed.running).toBe(true) // heartbeat started (refcount) …
    expect(state.multicallCount).toBe(0) // … but stayed paused: no tick
  })

  it('(A4) resume before subscribe clears pause so the first subscribe starts live', async () => {
    const { client, state } = createFakeClient({ resolveCall: () => ok(1n) })
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(source({ key: 's', derive: (t) => ({ value: 1, identity: t.identity }) }))

    feed.pause()
    feed.resume() // not running yet → just clears paused
    store.subscribe(() => {})
    await flush()

    expect(state.multicallCount).toBe(1) // tick ran
  })

  // -------------------------------------------------------------------------
  // A6 — resume options survive an in-flight tick
  // -------------------------------------------------------------------------

  it('(A6) resume during an in-flight tick still produces the gap', async () => {
    const gates: Array<() => void> = []
    let blockNo = 100n
    const st = { multicallCount: 0, getLogsParams: [] as Array<{ fromBlock: bigint; toBlock: bigint }> }
    const client = {
      transport: { type: 'http' },
      multicall: async ({ contracts }: { contracts: Array<{ functionName: string }> }) => {
        const idx = st.multicallCount++
        const b = blockNo // capture at call time, before the gate
        await new Promise<void>((r) => {
          gates[idx] = r
        })
        return contracts.map((c) => {
          if (c.functionName === 'getBlockNumber') return ok(b)
          if (c.functionName === 'getLastBlockHash') return ok(`0x${'ab'.repeat(32)}`)
          if (c.functionName === 'getCurrentBlockTimestamp') return ok(1700n)
          return ok(0n)
        })
      },
      getLogs: async (p: { fromBlock: bigint; toBlock: bigint }) => {
        st.getLogsParams.push(p)
        return []
      },
      watchBlockNumber: () => () => {},
    } as unknown as PublicClient
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(
      source<bigint>({
        key: 's',
        logFilters: () => [{ address: ADDR, event: BID_EVENT }],
        derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }),
      })
    )
    const events: FeedEvent<bigint>[] = []
    store.subscribe((e) => events.push(e))
    await flush() // tick 1 is now suspended at its multicall gate (block captured = 100)

    feed.resume({ logWindowOverride: 3 }) // lands mid-tick → coalesced with resume options preserved
    blockNo = 110n // tick 2 will capture this
    gates[0]!() // release tick 1 → lastProcessed = 100, follow-up (resume) tick spawned
    await flush() // tick 2 now suspended at its own gate
    gates[1]!() // release tick 2 @ block 110, resume override 3
    await flush()

    const gap = events.find((e) => e.type === 'gap')
    expect(gap).toBeDefined()
    if (gap && gap.type === 'gap') {
      expect(gap.fromBlock).toBe(101n)
      expect(gap.toBlock).toBe(107n)
    }
  })

  // -------------------------------------------------------------------------
  // A8 — a store created while stale reports stale immediately
  // -------------------------------------------------------------------------

  it('(A8) a source watched while the feed is already stale reports stale:true immediately', async () => {
    const { client } = createFakeClient({ failMulticall: () => true })
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const first = feed.watch(source({ key: 'a', derive: (t) => ({ value: 1, identity: t.identity }) }))
    first.subscribe(() => {})

    await flush() // failure 1
    await advance(BACKOFF_BASE_MS * 2) // failure 2
    await advance(BACKOFF_BASE_MS * 4) // failure 3 → staleActive
    expect(first.getSnapshot().stale).toBe(true)

    const late = feed.watch(source({ key: 'b', derive: (t) => ({ value: 2, identity: t.identity }) }))
    expect(late.getSnapshot().stale).toBe(true) // A8: not stale:false
  })

  // -------------------------------------------------------------------------
  // B1 — same-height reorg re-emits
  // -------------------------------------------------------------------------

  it('(B1) same blockNumber but different parentBlockHash → derive re-runs and a tick emits', async () => {
    let hash = 'aa'
    const { client } = createFakeClient({
      block: () => ({ number: 100n, hash: `0x${hash.repeat(32)}`, ts: 1700n }),
    })
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    let deriveCalls = 0
    const store = feed.watch(
      source<number>({
        key: 's',
        derive: (t) => {
          deriveCalls += 1
          return { value: deriveCalls, identity: t.identity }
        },
      })
    )
    const ticks: FeedEvent<number>[] = []
    store.subscribe((e) => {
      if (e.type === 'tick') ticks.push(e)
    })
    await flush() // tick 1
    expect(deriveCalls).toBe(1)

    hash = 'bb' // same height, forked parent hash
    ticks.length = 0
    await advance(1000) // tick 2: identity changed via hash → NOT skipped
    expect(deriveCalls).toBe(2)
    expect(ticks.length).toBe(1)
  })

  // -------------------------------------------------------------------------
  // B2 — retraction flows through the engine
  // -------------------------------------------------------------------------

  it('(B2) event order within a tick is phase → log → retraction → tick', async () => {
    let hash = 'aa'
    const { client } = createFakeClient({
      block: () => ({ number: 100n, hash: `0x${hash.repeat(32)}`, ts: 1700n }),
      // tick 1: log at index 0. tick 2 (reorg): index 0 gone, index 1 appears.
      logs: () => (hash === 'aa' ? [bidLog(100n, 0)] : [bidLog(100n, 1)]),
    })
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(
      source<number>({
        key: 's',
        logFilters: () => [{ address: ADDR, event: BID_EVENT }],
        derive: (t, ctx) => {
          const value = (ctx.prev?.value ?? 0) + 1
          return { value, phase: value === 1 ? 'a' : 'b', identity: t.identity }
        },
      })
    )
    const seen: string[] = []
    store.subscribe((e) => seen.push(e.type))
    await flush() // tick 1

    hash = 'bb'
    seen.length = 0
    await advance(1000) // tick 2: phase a→b, new log(index1), retraction of log(index0), tick
    expect(seen).toEqual(['phase', 'log', 'retraction', 'tick'])
  })

  it('(B2) a retraction is emitted even when derive returns undefined', async () => {
    let hash = 'aa'
    const { client } = createFakeClient({
      block: () => ({ number: 100n, hash: `0x${hash.repeat(32)}`, ts: 1700n }),
      logs: () => (hash === 'aa' ? [bidLog(100n, 0)] : []),
    })
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(
      source<number>({
        key: 's',
        logFilters: () => [{ address: ADDR, event: BID_EVENT }],
        derive: () => undefined, // never emits a value
      })
    )
    const seen: FeedEvent<number>[] = []
    store.subscribe((e) => seen.push(e))
    await flush() // tick 1: log delivered

    hash = 'bb'
    seen.length = 0
    await advance(1000) // tick 2: log(100) gone → retraction survives the undefined derive
    expect(seen.map((e) => e.type)).toEqual(['retraction'])
  })

  // -------------------------------------------------------------------------
  // B3 — trailing-window K mapping onto getLogs params
  // -------------------------------------------------------------------------

  it('(B3) getLogs window params follow K across two ticks', async () => {
    const { client, state } = createFakeClient({
      block: () => ({ number: BigInt(100 + state.multicallCount), hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
    })
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, trailingLogWindow: 3, scheduler })
    const store = feed.watch(
      source({ key: 's', logFilters: () => [{ address: ADDR, event: BID_EVENT }], derive: (t) => ({ value: 1, identity: t.identity }) })
    )
    store.subscribe(() => {})
    await flush() // tick 1 @ head 101: fromBlock = max(101-2,0) = 99
    await advance(1000) // tick 2 @ head 102: fromBlock = max(102-2, 101-2, 0) = 100

    expect(state.getLogsParams.map((p) => ({ fromBlock: p.fromBlock, toBlock: p.toBlock }))).toEqual([
      { fromBlock: 99n, toBlock: 101n },
      { fromBlock: 100n, toBlock: 102n },
    ])
  })

  // -------------------------------------------------------------------------
  // B4 — WS failure/backoff + overlap coalescing
  // -------------------------------------------------------------------------

  it('(B4) WS mode: failing multicall backs off and marks stale at 3, then recovers', async () => {
    let failures = 3
    const { client, state } = createFakeClient({
      ws: true,
      failMulticall: () => failures-- > 0,
      resolveCall: () => ok(1n),
    })
    const { scheduler, advance, pendingDelays } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, scheduler })
    const store = feed.watch(source({ key: 's', derive: (t) => ({ value: 1, identity: t.identity }) }))
    store.subscribe(() => {})

    await flush() // failure 1 → backoff timer even in WS mode
    expect(pendingDelays()).toEqual([BACKOFF_BASE_MS * 2])
    await advance(BACKOFF_BASE_MS * 2) // failure 2
    await advance(BACKOFF_BASE_MS * 4) // failure 3 → stale
    expect(store.getSnapshot().stale).toBe(true)
    await advance(BACKOFF_BASE_MS * 8) // success → recovery
    expect(store.getSnapshot().stale).toBe(false)

    // Once recovered, a pushed block still drives a tick.
    const before = state.multicallCount
    state.push!(200n)
    await flush()
    expect(state.multicallCount).toBe(before + 1)
  })

  it('(B4) overlap guard: multiple pushes during an in-flight tick coalesce to exactly one follow-up', async () => {
    const gates: Array<() => void> = []
    const st = { multicallCount: 0, push: undefined as undefined | ((b: bigint) => void) }
    const client = {
      transport: { type: 'webSocket' },
      multicall: async ({ contracts }: { contracts: Array<{ functionName: string }> }) => {
        const idx = st.multicallCount++
        // Only gate the FIRST tick; later ticks resolve immediately.
        if (idx === 0) await new Promise<void>((r) => (gates[idx] = r))
        return contracts.map((c) => {
          if (c.functionName === 'getBlockNumber') return ok(BigInt(100 + idx))
          if (c.functionName === 'getLastBlockHash') return ok(`0x${'ab'.repeat(32)}`)
          if (c.functionName === 'getCurrentBlockTimestamp') return ok(1700n)
          return ok(1n)
        })
      },
      getLogs: async () => [],
      watchBlockNumber: ({ onBlockNumber }: { onBlockNumber: (b: bigint) => void }) => {
        st.push = onBlockNumber
        return () => {}
      },
    } as unknown as PublicClient
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, scheduler })
    const store = feed.watch(source({ key: 's', derive: (t) => ({ value: 1, identity: t.identity }) }))
    store.subscribe(() => {})
    await flush() // tick 1 suspended at its gate

    st.push!(101n) // arrives mid-tick → pendingTrigger
    st.push!(102n) // arrives mid-tick → coalesced (no second follow-up)
    gates[0]!() // release tick 1 → exactly one coalesced follow-up runs
    await flush()

    expect(st.multicallCount).toBe(2) // tick 1 + one coalesced follow-up, not 3
  })

  // -------------------------------------------------------------------------
  // B5 — chunk pass-through + shared-slot allowFailure AND-merge
  // -------------------------------------------------------------------------

  it('(B5) maxCallsPerChunk splits one tick across multiple multicall invocations', async () => {
    const { client, state } = createFakeClient({ resolveCall: () => ok(1n) })
    const { scheduler } = createFakeScheduler()
    // 3 identity + 5 keyed = 8 calls; chunk size 4 → 2 invocations in a single tick.
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, maxCallsPerChunk: 4, scheduler })
    const store = feed.watch(
      source({
        key: 's',
        calls: () => ({ a: call('fa'), b: call('fb'), c: call('fc'), d: call('fd'), e: call('fe') }),
        derive: (t) => ({ value: 1, identity: t.identity }),
      })
    )
    store.subscribe(() => {})
    await flush()

    expect(state.multicallCount).toBe(2) // one tick, two chunked multicall invocations
    expect(state.contractsSeen.length).toBe(2)
  })

  it('(B5) a shared slot is strict if ANY requester is strict (allowFailure AND-merge)', async () => {
    const { client } = createFakeClient({
      resolveCall: (c) => (c.functionName === 'foo' ? fail('reverted') : ok(1n)),
    })
    const { scheduler, pendingDelays } = createFakeScheduler()
    // pollInterval 5000 so a success (5000) is distinguishable from a backoff (1000).
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 5000, scheduler })
    // Both sources request an identical `foo` read (same fingerprint) → one shared slot.
    const tolerant = source<bigint>({
      key: 'tolerant',
      calls: () => ({ x: call('foo', true) }),
      derive: (t) => ({ value: (t.results['x'] as { result?: bigint }).result ?? 0n, identity: t.identity }),
    })
    const strict = source<bigint>({
      key: 'strict',
      calls: () => ({ x: call('foo', false) }),
      derive: (t) => ({ value: (t.results['x'] as { result?: bigint }).result ?? 0n, identity: t.identity }),
    })
    const st = feed.watch(strict)
    const to = feed.watch(tolerant)
    st.subscribe(() => {})
    to.subscribe(() => {})
    await flush()

    // Merged slot is strict → the reverting 'foo' fails the whole tick (backoff, not the 5000 cadence).
    expect(pendingDelays()).toEqual([BACKOFF_BASE_MS * 2])
    expect(st.getSnapshot().current).toBeUndefined()
    expect(to.getSnapshot().current).toBeUndefined()
  })
})
