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
    now: () => now,
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
    const { client, state } = createFakeClient({
      // Block advances each tick so the tick after both subscribe still derives (identity changed).
      block: () => ({ number: BigInt(100 + state.multicallCount), hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
      resolveCall: (c) => (c.functionName === 'foo' ? ok(42n) : ok(0n)),
    })
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })

    const shared = () => ({ x: call('foo') })
    const a = source<bigint>({ key: 'a', calls: shared, derive: (t) => ({ value: (t.results['x'] as { result: bigint }).result, identity: t.identity }) })
    const b = source<bigint>({ key: 'b', calls: shared, derive: (t) => ({ value: (t.results['x'] as { result: bigint }).result, identity: t.identity }) })
    const sa = feed.watch(a)
    const sb = feed.watch(b)
    sa.subscribe(() => {})
    sb.subscribe(() => {})
    await flush() // tick 1: only `a` is active (b subscribed mid-tick, joins next tick)
    await advance(1000) // tick 2: both `a` and `b` participate

    // Only ONE 'foo' contract in the batch despite two sources requesting it.
    const fooSlots = state.contractsSeen.at(-1)!.filter((c) => c.functionName === 'foo')
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
    const scheduled = captureMicrotasks()
    const { client, state } = createFakeClient({
      block: () => ({ number: BigInt(100 + state.multicallCount), hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
      resolveCall: () => ok(1n),
    })
    const { scheduler, advance } = createFakeScheduler()
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
    // Subscribe `good` first so tick 1 covers it; `bad` joins on tick 2 and throws exactly once.
    good.subscribe(() => {})
    bad.subscribe(() => {})
    await flush() // tick 1: only `good` active
    await advance(1000) // tick 2: both active → bad throws once

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
    const scheduled = captureMicrotasks()
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
    await flush() // tick 1: only `a` active (b subscribed mid-tick)
    await advance(1000) // tick 2: both participate

    expect(state.contractsSeen.at(-1)!.some((c) => c.functionName === 'bfoo')).toBe(true)
    const bFrozen = sb.getSnapshot().current?.value

    unsubB() // b now has zero subscribers; a keeps the feed running
    await advance(1000) // tick 3

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
    await flush() // tick 1: only `a` active (b subscribed mid-tick)
    await advance(1000) // tick 2: both participate
    expect(state.contractsSeen.at(-1)!.some((c) => c.functionName === 'bfoo')).toBe(true)

    unsubB()
    await advance(1000) // tick 3: b skipped
    expect(state.contractsSeen.at(-1)!.some((c) => c.functionName === 'bfoo')).toBe(false)

    sb.subscribe(() => {}) // resubscribe (feed already running via a)
    await advance(1000) // tick 4: b resumes
    expect(state.contractsSeen.at(-1)!.some((c) => c.functionName === 'bfoo')).toBe(true)
    expect(sb.getSnapshot().current?.value).toBeDefined()
  })
})
