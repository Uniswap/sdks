import { describe, expect, it } from 'bun:test'

import type { FeedEvent, SourceEmission, TickIdentity } from '../types'

import { createInternalStore } from './store'

function identity(blockNumber: bigint): TickIdentity {
  return {
    chainId: 1,
    blockNumber,
    parentBlockHash: `0x${blockNumber.toString(16).padStart(64, '0')}` as `0x${string}`,
    timestamp: blockNumber,
  }
}

function emission(value: number, blockNumber: bigint, phase?: string): SourceEmission<number> {
  return { value, phase, identity: identity(blockNumber) }
}

function tick(value: number, blockNumber: bigint, phase?: string): FeedEvent<number> {
  return { type: 'tick', emission: emission(value, blockNumber, phase) }
}

function phase(to: string, from: string | undefined, blockNumber: bigint): FeedEvent<number> {
  return { type: 'phase', from, to, identity: identity(blockNumber) }
}

function stale(value: boolean): FeedEvent<number> {
  return { type: 'stale', stale: value }
}

function log(): FeedEvent<number> {
  return {
    type: 'log',
    log: { txHash: '0xabc', logIndex: 0, blockNumber: 1n, address: '0x0', eventName: 'X', args: {} },
  }
}

/** Swap out queueMicrotask so async rethrows don't blow up the test runner. Returns a restore fn. */
function silenceMicrotasks(): () => void {
  const original = globalThis.queueMicrotask
  globalThis.queueMicrotask = () => {}
  return () => {
    globalThis.queueMicrotask = original
  }
}

describe('createInternalStore', () => {
  describe('snapshot referential stability', () => {
    it('returns the same snapshot reference when nothing is published', () => {
      const store = createInternalStore<number>({ bufferSize: 5 })
      expect(store.getSnapshot()).toBe(store.getSnapshot())
    })

    it('does not create a new snapshot for publish([])', () => {
      const store = createInternalStore<number>({ bufferSize: 5 })
      const before = store.getSnapshot()
      store.publish([])
      expect(store.getSnapshot()).toBe(before)
    })

    it('creates a new snapshot reference after a tick', () => {
      const store = createInternalStore<number>({ bufferSize: 5 })
      const before = store.getSnapshot()
      store.publish([tick(1, 1n)])
      const after = store.getSnapshot()
      expect(after).not.toBe(before)
      expect(after.current?.value).toBe(1)
      expect(after.lastTick?.blockNumber).toBe(1n)
    })

    it('does not create a new snapshot when only non-state events are published', () => {
      const restore = silenceMicrotasks()
      const store = createInternalStore<number>({ bufferSize: 5 })
      const before = store.getSnapshot()
      store.publish([log()])
      expect(store.getSnapshot()).toBe(before)
      restore()
    })

    it('uses a fresh buffer array for each changed snapshot', () => {
      const store = createInternalStore<number>({ bufferSize: 5 })
      store.publish([tick(1, 1n)])
      const first = store.getSnapshot()
      store.publish([tick(2, 2n)])
      const second = store.getSnapshot()
      expect(second.buffer).not.toBe(first.buffer)
      expect(first.buffer.length).toBe(1)
      expect(second.buffer.length).toBe(2)
    })
  })

  describe('state application', () => {
    it('applies phase and stale to the snapshot', () => {
      const store = createInternalStore<number>({ bufferSize: 5 })
      store.publish([phase('open', undefined, 1n), stale(true)])
      const snap = store.getSnapshot()
      expect(snap.phase).toBe('open')
      expect(snap.stale).toBe(true)
    })

    it('applies ALL events before notifying any listener', () => {
      const store = createInternalStore<number>({ bufferSize: 5 })
      const seen: number[] = []
      store.subscribe(() => {
        // On every notification the snapshot must already reflect the final applied state.
        seen.push(store.getSnapshot().current?.value ?? -1)
      })
      store.publish([tick(1, 1n), tick(2, 2n)])
      expect(seen).toEqual([2, 2])
    })
  })

  describe('rolling buffer', () => {
    it('caps the buffer at bufferSize, dropping oldest, preserving order', () => {
      const store = createInternalStore<number>({ bufferSize: 3 })
      store.publish([tick(1, 1n), tick(2, 2n), tick(3, 3n), tick(4, 4n), tick(5, 5n), tick(6, 6n)])
      const snap = store.getSnapshot()
      expect(snap.buffer.map((e) => e.value)).toEqual([4, 5, 6])
    })

    it('appends only on tick events', () => {
      const restore = silenceMicrotasks()
      const store = createInternalStore<number>({ bufferSize: 5 })
      store.publish([tick(1, 1n), phase('a', undefined, 1n), stale(true), log()])
      expect(store.getSnapshot().buffer.map((e) => e.value)).toEqual([1])
      restore()
    })
  })

  describe('fan-out', () => {
    it('delivers events to each listener once, in event order', () => {
      const store = createInternalStore<number>({ bufferSize: 5 })
      const seen: string[] = []
      store.subscribe((e) => seen.push(e.type))
      store.publish([tick(1, 1n), phase('open', undefined, 1n), stale(true)])
      expect(seen).toEqual(['tick', 'phase', 'stale'])
    })

    it('delivers to multiple listeners', () => {
      const store = createInternalStore<number>({ bufferSize: 5 })
      const a: number[] = []
      const b: number[] = []
      store.subscribe((e) => {
        if (e.type === 'tick') a.push(e.emission.value)
      })
      store.subscribe((e) => {
        if (e.type === 'tick') b.push(e.emission.value)
      })
      store.publish([tick(1, 1n), tick(2, 2n)])
      expect(a).toEqual([1, 2])
      expect(b).toEqual([1, 2])
    })
  })

  describe('subscribe / unsubscribe', () => {
    it('stops delivering after unsubscribe', () => {
      const store = createInternalStore<number>({ bufferSize: 5 })
      const seen: number[] = []
      const unsub = store.subscribe((e) => {
        if (e.type === 'tick') seen.push(e.emission.value)
      })
      store.publish([tick(1, 1n)])
      unsub()
      store.publish([tick(2, 2n)])
      expect(seen).toEqual([1])
    })

    it('has an idempotent unsubscribe', () => {
      const store = createInternalStore<number>({ bufferSize: 5 })
      const counts: number[] = []
      store.onSubscriberChange((c) => counts.push(c))
      const unsub = store.subscribe(() => {})
      expect(store.subscriberCount).toBe(1)
      unsub()
      unsub()
      expect(store.subscriberCount).toBe(0)
      // 0->1 then 1->0 only; the second unsub must not fire another change.
      expect(counts).toEqual([1, 0])
    })
  })

  describe('subscriber-count callbacks', () => {
    it('fires on every count change', () => {
      const store = createInternalStore<number>({ bufferSize: 5 })
      const counts: number[] = []
      store.onSubscriberChange((c) => counts.push(c))
      const u1 = store.subscribe(() => {})
      const u2 = store.subscribe(() => {})
      u1()
      u2()
      expect(counts).toEqual([1, 2, 1, 0])
    })
  })

  describe('listener exception isolation', () => {
    it('continues notifying other listeners when one throws', () => {
      const restore = silenceMicrotasks()
      const store = createInternalStore<number>({ bufferSize: 5 })
      const seen: number[] = []
      store.subscribe(() => {
        throw new Error('bad consumer')
      })
      store.subscribe((e) => {
        if (e.type === 'tick') seen.push(e.emission.value)
      })
      store.publish([tick(7, 1n)])
      expect(seen).toEqual([7])
      restore()
    })

    it('rethrows the exception asynchronously via queueMicrotask', () => {
      const store = createInternalStore<number>({ bufferSize: 5 })
      const boom = new Error('boom')
      store.subscribe(() => {
        throw boom
      })
      const scheduled: Array<() => void> = []
      const original = globalThis.queueMicrotask
      globalThis.queueMicrotask = (cb: () => void) => {
        scheduled.push(cb)
      }
      try {
        store.publish([tick(1, 1n)])
      } finally {
        globalThis.queueMicrotask = original
      }
      expect(scheduled).toHaveLength(1)
      expect(() => scheduled[0]!()).toThrow(boom)
    })
  })
})
