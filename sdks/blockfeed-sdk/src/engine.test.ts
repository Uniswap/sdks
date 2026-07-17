import { afterEach, describe, expect, it } from 'bun:test'
import type { AbiEvent, Log } from 'viem'
import { parseAbiItem, toEventSelector } from 'viem'

import { BACKOFF_BASE_MS } from './constants'
import { createBlockFeed } from './engine'
import { createFakeClient, createFakeScheduler, fail, flush, ok } from './internal/testing'
import type { ContractCall, FeedEvent, Source } from './types'

// ---------------------------------------------------------------------------
// Fakes: engine client + scheduler live in ./internal/testing (shared, typed as BlockfeedClient).
// ---------------------------------------------------------------------------

const ADDR = '0x000000000004444c5dc75cB358380D2e3dE08A90'
const call = (functionName: string, allowFailure?: boolean): ContractCall => ({
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

    // No subscriber yet → the heartbeat has not run.
    expect(state.multicallCount).toBe(0)
    expect(timerCount()).toBe(0)

    const unsub = store.subscribe(() => {})
    await flush()
    // First subscriber started the heartbeat: one tick ran and a poll timer is pending.
    expect(state.multicallCount).toBe(1)
    expect(timerCount()).toBe(1)

    unsub()
    // Last unsubscribe stopped the heartbeat: no pending timer, no further ticks.
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

  it('(d) a changed value emits exactly one tick event (no separate phase event)', async () => {
    const { client, state } = createFakeClient({
      block: () => ({ number: BigInt(100 + state.multicallCount), hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
    })
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(
      source<number>({
        key: 's',
        derive: (t, prev) => ({ value: (prev?.value ?? 0) + 1, identity: t.identity }),
      })
    )
    let seen: string[] = []
    store.subscribe((e) => seen.push(e.type))
    await flush() // tick 1: value 1
    seen = []
    await advance(1000) // tick 2: value 2 (changed) → exactly one tick event, no phase event

    expect(seen).toEqual(['tick'])
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
    await flush() // tick 1: throw isolated (error event), but log still ships

    expect(seen.map((e) => e.type)).toEqual(['error', 'log'])
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
  // Unwatch (N6)
  // -------------------------------------------------------------------------

  it('(unwatch) removes a source: its calls disappear from the next batch and it stops emitting', async () => {
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
    sb.subscribe(() => {})
    await flush() // tick 1: both participate
    expect(state.contractsSeen.at(-1)!.some((c) => c.functionName === 'bfoo')).toBe(true)

    feed.unwatch('b') // remove b's entry entirely
    await advance(1000) // tick 2: a still running (its own subscriber), b gone

    const lastBatch = state.contractsSeen.at(-1)!
    expect(lastBatch.some((c) => c.functionName === 'bfoo')).toBe(false) // no leak: b's calls are gone
    expect(lastBatch.some((c) => c.functionName === 'afoo')).toBe(true)
  })

  it('(unwatch) unwatching the last subscribed source stops the heartbeat', async () => {
    const { client, state } = createFakeClient({ resolveCall: () => ok(1n) })
    const { scheduler, advance, timerCount } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(source({ key: 's', derive: (t) => ({ value: 1, identity: t.identity }) }))
    store.subscribe(() => {})
    await flush()
    expect(timerCount()).toBe(1)

    feed.unwatch('s')
    expect(timerCount()).toBe(0) // heartbeat stopped
    const before = state.multicallCount
    await advance(5000)
    expect(state.multicallCount).toBe(before)
  })

  it('(unwatch) removes the entry\'s count from totals immediately, even with a live subscriber', async () => {
    const { client, state } = createFakeClient({ resolveCall: () => ok(1n) })
    const { scheduler, advance, timerCount } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(source({ key: 's', derive: (t) => ({ value: 1, identity: t.identity }) }))
    // A live subscriber remains through the unwatch (we never unsubscribe it).
    store.subscribe(() => {})
    await flush()
    expect(timerCount()).toBe(1)

    // Unwatch drops this entry's whole count from the refcount right now → heartbeat stops despite the
    // still-live subscriber (unwatch semantics: the key's feed is torn down).
    feed.unwatch('s')
    expect(timerCount()).toBe(0)
    const before = state.multicallCount
    await advance(5000)
    expect(state.multicallCount).toBe(before)
  })

  it('(unwatch→rewatch) an orphaned old store\'s unsubscribe does not stop the new entry\'s heartbeat', async () => {
    const { client, state } = createFakeClient({ resolveCall: () => ok(1n) })
    const { scheduler, advance, timerCount } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })

    // Watch key 'k', give it a live subscriber, then unwatch WITHOUT unsubscribing (store is orphaned).
    const store1 = feed.watch(source({ key: 'k', derive: (t) => ({ value: 1, identity: t.identity }) }))
    const unsub1 = store1.subscribe(() => {})
    await flush()
    expect(timerCount()).toBe(1)
    feed.unwatch('k')
    expect(timerCount()).toBe(0) // heartbeat stopped by the unwatch

    // Re-watch the SAME key: a brand-new entry/store owns 'k' now. Subscribe → heartbeat restarts.
    const store2 = feed.watch(source({ key: 'k', derive: (t) => ({ value: 2, identity: t.identity }) }))
    expect(store2).not.toBe(store1) // a genuinely new store, not the orphan
    store2.subscribe(() => {})
    await flush()
    expect(timerCount()).toBe(1) // new entry's heartbeat is running

    // The ORPHANED store1's subscriber now unsubscribes. Its refcount transition targets a stale entry
    // and must be ignored: the new entry keeps its live subscriber, so the heartbeat must NOT stop.
    unsub1()
    expect(timerCount()).toBe(1) // still running — no cross-talk into store2's refcount slot
    const before = state.multicallCount
    await advance(1000)
    expect(state.multicallCount).toBe(before + 1) // ticks keep coming for the new entry
  })

  // -------------------------------------------------------------------------
  // Always-on catch-up window + unified gap rule (guarantees formerly asserted via pause/resume)
  // -------------------------------------------------------------------------

  it('(catch-up-i) a quick restart re-delivers no duplicate log and publishes no gap (book floor)', async () => {
    let blockNo = 100n
    const { client, state } = createFakeClient({
      block: () => ({ number: blockNo, hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
      logs: () => [bidLog(100n, 0)], // the block-100 log is present in every scan
    })
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const src = source<bigint>({
      key: 's',
      logFilters: () => [{ address: ADDR, event: BID_EVENT }],
      derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }),
    })
    const store = feed.watch(src)
    const events: FeedEvent<bigint>[] = []
    const unsub = store.subscribe((e) => events.push(e))
    await flush() // tick 1 @ block 100 → log delivered, lastProcessed = 100
    expect(events.filter((e) => e.type === 'log').length).toBe(1)

    unsub() // heartbeat stops (SHORT stall)
    blockNo = 101n // head advanced only 1 block during the stall
    events.length = 0
    store.subscribe((e) => events.push(e)) // restart
    await flush()

    // fromBlock = max(101-2, 100-2, 0) = 99 → block-100 log already in book, not re-delivered; no gap.
    expect(events.filter((e) => e.type === 'log').length).toBe(0)
    expect(events.find((e) => e.type === 'gap')).toBeUndefined()
    const last = state.getLogsParams.at(-1)!
    expect(last.fromBlock).toBe(99n)
    expect(last.toBlock).toBe(101n)
  })

  it('(catch-up-ii) a stall within maxCatchupBlocks recovers the intervening logs with no gap', async () => {
    let blockNo = 100n
    const { client, state } = createFakeClient({
      block: () => ({ number: blockNo, hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
      // A log lands at block 105 during the stall; it must be recovered on restart.
      logs: () => (blockNo >= 105n ? [bidLog(105n, 0)] : []),
    })
    const { scheduler } = createFakeScheduler()
    // maxCatchupBlocks default is 20; the 10-block stall fits inside it.
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(
      source<bigint>({
        key: 's',
        logFilters: () => [{ address: ADDR, event: BID_EVENT }],
        derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }),
      })
    )
    const events: FeedEvent<bigint>[] = []
    const unsub = store.subscribe((e) => events.push(e))
    await flush() // tick 1 @ 100 → lastProcessed = 100

    unsub()
    blockNo = 110n // 10-block stall (≤ 20)
    events.length = 0
    store.subscribe((e) => events.push(e))
    await flush()

    // tickWindow = min(max(3,10),20) = 10 → fromBlock = 110-9 = 101 == lastProcessed+1 → NO gap,
    // and the block-105 log is recovered.
    expect(events.find((e) => e.type === 'gap')).toBeUndefined()
    expect(events.filter((e) => e.type === 'log').length).toBe(1)
    const last = state.getLogsParams.at(-1)!
    expect(last.fromBlock).toBe(101n)
    expect(last.toBlock).toBe(110n)
  })

  it('(catch-up-iii) a stall beyond maxCatchupBlocks publishes a bounded gap', async () => {
    let blockNo = 100n
    const { client, state } = createFakeClient({
      block: () => ({ number: blockNo, hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
      logs: () => (blockNo === 100n ? [bidLog(100n, 0)] : []),
    })
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, maxCatchupBlocks: 5, scheduler })
    const store = feed.watch(
      source<bigint>({
        key: 's',
        logFilters: () => [{ address: ADDR, event: BID_EVENT }],
        derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }),
      })
    )
    const events: FeedEvent<bigint>[] = []
    const unsub = store.subscribe((e) => events.push(e))
    await flush() // tick 1 @ 100 → log(100), lastProcessed = 100

    unsub()
    blockNo = 120n // 20-block stall, beyond maxCatchupBlocks=5
    events.length = 0
    store.subscribe((e) => events.push(e))
    await flush()

    // tickWindow = min(max(3,20),5) = 5 → fromBlock = 120-4 = 116; gap = [101, 115].
    const gap = events.find((e) => e.type === 'gap')
    expect(gap).toBeDefined()
    if (gap && gap.type === 'gap') {
      expect(gap.fromBlock).toBe(101n)
      expect(gap.toBlock).toBe(115n)
    }
    // block-100 log fell below the [116,120] window: evicted, never re-delivered, never retracted.
    expect(events.filter((e) => e.type === 'log').length).toBe(0)
    expect(events.filter((e) => e.type === 'retraction').length).toBe(0)
    const last = state.getLogsParams.at(-1)!
    expect(last.fromBlock).toBe(116n)
    expect(last.toBlock).toBe(120n)
  })

  it('(catch-up-iv / T1) a plain poll tick that skips beyond maxCatchupBlocks publishes a gap', async () => {
    let blockNo = 100n
    const { client, state } = createFakeClient({
      block: () => ({ number: blockNo, hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
    })
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, maxCatchupBlocks: 3, scheduler })
    const store = feed.watch(
      source<bigint>({
        key: 's',
        logFilters: () => [{ address: ADDR, event: BID_EVENT }],
        derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }),
      })
    )
    const events: FeedEvent<bigint>[] = []
    store.subscribe((e) => events.push(e))
    await flush() // tick 1 @ head 100 → lastProcessed = 100
    events.length = 0

    blockNo = 110n // head jumped 10 blocks by the next poll (> maxCatchupBlocks=3)
    await advance(1000) // tick 2 @ head 110, PLAIN poll: tickWindow=3 → fromBlock = 108

    const gap = events.find((e) => e.type === 'gap')
    expect(gap).toBeDefined()
    if (gap && gap.type === 'gap') {
      expect(gap.fromBlock).toBe(101n)
      expect(gap.toBlock).toBe(107n)
    }
    const last = state.getLogsParams.at(-1)!
    expect(last.fromBlock).toBe(108n)
    expect(last.toBlock).toBe(110n)
  })

  it('(catch-up-v / T4) zero-clamp: head below the look-back floors getLogs fromBlock at 0', async () => {
    const { client, state } = createFakeClient({
      block: () => ({ number: 1n, hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
    })
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, trailingLogWindow: 10, scheduler })
    const store = feed.watch(
      source<bigint>({
        key: 's',
        logFilters: () => [{ address: ADDR, event: BID_EVENT }],
        derive: (t) => ({ value: t.identity.blockNumber, identity: t.identity }),
      })
    )
    store.subscribe(() => {})
    await flush() // head 1, K=10 → fromBlock = max(1-9, 0) = 0

    const last = state.getLogsParams.at(-1)!
    expect(last.fromBlock).toBe(0n)
    expect(last.toBlock).toBe(1n)
  })

  // -------------------------------------------------------------------------
  // A2 — stale/backoff state machine runs AFTER the logs stage
  // -------------------------------------------------------------------------

  it('(A2) persistent getLogs failure (multicall healthy) still climbs to stale at 3 and recovers', async () => {
    let logsFail = 4
    const { client } = createFakeClient({
      // Block advances each tick so identity changes and the logs stage is always reached.
      block: () => ({ number: 100n + BigInt(logsFail), hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
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

  it('(B2) event order within a tick is log → retraction → tick', async () => {
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
        derive: (t, prev) => ({ value: (prev?.value ?? 0) + 1, identity: t.identity }),
      })
    )
    const seen: string[] = []
    store.subscribe((e) => seen.push(e.type))
    await flush() // tick 1

    hash = 'bb'
    seen.length = 0
    await advance(1000) // tick 2: new log(index1), retraction of log(index0), tick
    expect(seen).toEqual(['log', 'retraction', 'tick'])
  })

  it('(B2) a retraction carries the full retracted log and survives an undefined derive', async () => {
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
    const retraction = seen[0]!
    if (retraction.type !== 'retraction') throw new Error('unreachable')
    // The retraction carries the full log, not just a ref.
    expect(retraction.log.eventName).toBe('Bid')
    expect(retraction.log.logIndex).toBe(0)
    expect(retraction.log.blockNumber).toBe(100n)
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
    // Distinct block per tick so identity always changes (no skip); gate ONLY the first tick.
    const { client, state } = createFakeClient({
      ws: true,
      block: () => ({ number: 100n + BigInt(state.multicallCount), hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
      resolveCall: () => ok(1n),
      gate: (idx) => (idx === 0 ? new Promise<void>((r) => (gates[idx] = r)) : Promise.resolve()),
    })
    const { scheduler } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, scheduler })
    const store = feed.watch(source({ key: 's', derive: (t) => ({ value: 1, identity: t.identity }) }))
    store.subscribe(() => {})
    await flush() // tick 1 suspended at its gate

    state.push!(101n) // arrives mid-tick → pendingTrigger
    state.push!(102n) // arrives mid-tick → coalesced (no second follow-up)
    gates[0]!() // release tick 1 → exactly one coalesced follow-up runs
    await flush()

    expect(state.multicallCount).toBe(2) // tick 1 + one coalesced follow-up, not 3
  })

  // -------------------------------------------------------------------------
  // chainId derivation + shared-slot allowFailure AND-merge
  // -------------------------------------------------------------------------

  it('(chainId) defaults to client.chain.id and throws when neither is provided', async () => {
    const { client, state } = createFakeClient({ resolveCall: () => ok(1n) })
    const { scheduler } = createFakeScheduler()
    // No chainId option: falls back to the client's chain.id (createFakeClient sets it).
    const feed = createBlockFeed({ client, pollIntervalMs: 1000, scheduler })
    const store = feed.watch(source({ key: 's', derive: (t) => ({ value: t.identity.chainId, identity: t.identity }) }))
    store.subscribe(() => {})
    await flush()
    expect(state.multicallCount).toBe(1)
    expect(store.getSnapshot().current?.value).toBe(client.chain!.id)

    // A client with no chain and no explicit chainId throws synchronously.
    const { client: bare } = createFakeClient({ chainId: null })
    expect(() => createBlockFeed({ client: bare, scheduler })).toThrow()
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

  // -------------------------------------------------------------------------
  // Error diagnostics (M2)
  // -------------------------------------------------------------------------

  it('(M2) a tick-level failure publishes a scope:tick error to EVERY active store, cleared on recovery', async () => {
    let failures = 1
    const { client } = createFakeClient({
      block: () => ({ number: BigInt(100 + failures), hash: `0x${'ab'.repeat(32)}`, ts: 1700n }),
      failMulticall: () => failures-- > 0,
      resolveCall: () => ok(1n),
    })
    const { scheduler, advance } = createFakeScheduler()
    const feed = createBlockFeed({ client, chainId: 1, pollIntervalMs: 1000, scheduler })
    const a = feed.watch(source({ key: 'a', derive: (t) => ({ value: 1, identity: t.identity }) }))
    const b = feed.watch(source({ key: 'b', derive: (t) => ({ value: 2, identity: t.identity }) }))
    a.subscribe(() => {})
    b.subscribe(() => {})
    await flush() // tick 1: multicall throws → scope:tick error to both stores

    expect(a.getSnapshot().lastError?.scope).toBe('tick')
    expect(b.getSnapshot().lastError?.scope).toBe('tick')

    await advance(BACKOFF_BASE_MS * 2) // backoff retry succeeds → tick emits → clears lastError
    expect(a.getSnapshot().lastError).toBeUndefined()
    expect(b.getSnapshot().lastError).toBeUndefined()
    expect(a.getSnapshot().current?.value).toBe(1)
  })

  it('(M2) a throwing derive publishes a scope:source error to that store only', async () => {
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
    bad.subscribe(() => {})
    good.subscribe(() => {})
    const scheduled = captureMicrotasks() // swallow the async rethrow
    await flush()

    expect(bad.getSnapshot().lastError?.scope).toBe('source')
    expect(good.getSnapshot().lastError).toBeUndefined() // isolated to the throwing source
    expect(scheduled.length).toBe(1) // rethrow preserved
    expect(() => scheduled[0]!()).toThrow('derive boom')
  })
})
