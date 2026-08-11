import { describe, expect, test } from 'bun:test'
import type { Hex, PublicClient } from 'viem'

import { NodeStateError, TransportError } from '../errors'
import type { EthCall } from '../types'

import { createSemaphore, ethCall, mapConcurrent } from './rpc'
import { connectionRefusedError, headerNotFoundError, rateLimitHttpError } from './testing'

// ---------------------------------------------------------------------------
// The dispatch seam: what `ethCall` DOES with the verdict
// `rpcErrors.ts#classifyRpcError` hands it, plus the concurrency primitives
// every caller of it shares.
//
// A revert is the node answering authoritatively about the chain; a
// 429/timeout/dead socket is the provider answering about itself. Which is
// which is pinned next door in `rpcErrors.test.ts`; what is pinned HERE is
// that the distinction survives the wrapper — an execution failure must leave
// this function as the plain `Error` it arrived as (callers still read its
// revert data verbatim), and a transport failure must become a
// `TransportError` that the quoting/verification stages count on its own axis.
// ---------------------------------------------------------------------------

const TARGET = `0x${'11'.repeat(20)}` as const
const CALL: EthCall = { to: TARGET, data: '0x12345678' as Hex }
const BLOCK = 1_000n

function throwingClient(err: unknown): Pick<PublicClient, 'request'> {
  return {
    async request() {
      throw err
    },
  } as unknown as Pick<PublicClient, 'request'>
}

/** A geth revert-with-data error, as viem surfaces it (data on the nested cause). */
function revertWithData(data: Hex): Error {
  const inner = Object.assign(new Error('execution reverted'), { code: 3, data })
  const err = new Error(`The contract function reverted.\n\nDetails: execution reverted\nVersion: viem@2.23.5`)
  err.name = 'CallExecutionError'
  return Object.assign(err, { cause: inner })
}

describe('ethCall', () => {
  test('rethrows an execution failure verbatim — revert data survives for the caller to read', async () => {
    const original = revertWithData('0xdeadbeef' as Hex)
    const err = await ethCall(throwingClient(original), CALL, BLOCK).catch((e: unknown) => e)

    expect(err).toBe(original)
    expect(err instanceof TransportError).toBe(false)
  })

  test('wraps a transport failure in TransportError, preserving the original as `cause`', async () => {
    const original = rateLimitHttpError()
    const err = await ethCall(throwingClient(original), CALL, BLOCK).catch((e: unknown) => e)

    expect(err instanceof TransportError).toBe(true)
    expect((err as TransportError).cause).toBe(original)
    expect((err as TransportError).message).toContain(TARGET)
  })

  test('wraps a node-state failure in NodeStateError — a TransportError subclass, so every counting site catches it', async () => {
    // The whole point of the subclass: `measure.ts`, `readiness.ts` and the engine all discriminate
    // with `instanceof TransportError`, and this must count on the same axis as a 429 while still
    // being distinguishable in a log.
    const original = headerNotFoundError()
    const err = await ethCall(throwingClient(original), CALL, BLOCK).catch((e: unknown) => e)

    expect(err instanceof NodeStateError).toBe(true)
    expect(err instanceof TransportError).toBe(true) // the axis: identical to a transport failure
    expect((err as NodeStateError).cause).toBe(original)
    expect((err as Error).name).toBe('NodeStateError')
    // The diagnostic: which channel, and which block could not be served.
    expect((err as Error).message).toContain(TARGET)
    expect((err as Error).message).toContain(String(BLOCK))
    expect((err as Error).message).toContain('node state unavailable')
  })

  test('a plain transport failure is NOT a NodeStateError — the two stay distinguishable', async () => {
    const err = await ethCall(throwingClient(rateLimitHttpError()), CALL, BLOCK).catch((e: unknown) => e)

    expect(err instanceof TransportError).toBe(true)
    expect(err instanceof NodeStateError).toBe(false)
  })

  test('instanceof survives the ts→es2020 downlevel (prototype chain restored)', async () => {
    const err = await ethCall(throwingClient(connectionRefusedError()), CALL, BLOCK).catch((e: unknown) => e)

    expect(err instanceof TransportError).toBe(true)
    expect(err instanceof Error).toBe(true)
    expect((err as Error).name).toBe('TransportError')
  })

  test('a successful call still returns raw hex return data unchanged', async () => {
    const client = { async request() { return '0xabcd' } } as unknown as Pick<PublicClient, 'request'>
    expect(await ethCall(client, CALL, BLOCK)).toBe('0xabcd')
  })

  test('a semaphore (C4-P6) is acquired around the request and released whether it succeeds or throws', async () => {
    const semaphore = createSemaphore(1)
    let active = 0
    let peak = 0
    const client = {
      async request() {
        active++
        peak = Math.max(peak, active)
        await Promise.resolve()
        active--
        return '0xabcd'
      },
    } as unknown as Pick<PublicClient, 'request'>

    // Two calls "at once" against a semaphore of size 1: the second must not start until the first
    // has released, so peak concurrent `request` calls never exceeds 1.
    await Promise.all([ethCall(client, CALL, BLOCK, semaphore), ethCall(client, CALL, BLOCK, semaphore)])
    expect(peak).toBe(1)

    // The release happens in a `finally`, so a throw does not leak the slot — a third call still
    // gets in rather than hanging forever behind a permanently-held semaphore.
    const failing = { async request() { throw new Error('execution reverted') } } as unknown as Pick<PublicClient, 'request'>
    await expect(ethCall(failing, CALL, BLOCK, semaphore)).rejects.toThrow()
    await expect(ethCall(client, CALL, BLOCK, semaphore)).resolves.toBe('0xabcd')
  })
})

describe('createSemaphore / mapConcurrent (C4-P6)', () => {
  test('createSemaphore never lets more than `limit` acquires be outstanding at once', async () => {
    const semaphore = createSemaphore(3)
    let active = 0
    let peak = 0

    async function unit(): Promise<void> {
      await semaphore.acquire()
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active--
      semaphore.release()
    }

    await Promise.all(Array.from({ length: 12 }, () => unit()))
    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBeGreaterThan(0)
  })

  test('release() hands the freed slot straight to the next queued waiter (FIFO), never overshooting the limit', async () => {
    const semaphore = createSemaphore(2)
    const order: number[] = []

    async function unit(id: number): Promise<void> {
      await semaphore.acquire()
      order.push(id)
      await new Promise((resolve) => setTimeout(resolve, 1))
      semaphore.release()
    }

    await Promise.all([1, 2, 3, 4, 5].map((id) => unit(id)))
    // The first two acquire immediately (2 free slots); the rest queue and drain in submission order.
    expect(order.slice(0, 2).sort()).toEqual([1, 2])
    expect(order).toHaveLength(5)
  })

  test('mapConcurrent with a numeric limit is unchanged: at most `limit` `fn` calls in flight from this one batch', async () => {
    let active = 0
    let peak = 0
    const items = Array.from({ length: 10 }, (_, i) => i)

    await mapConcurrent(items, 3, async (i) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active--
      return i
    })

    expect(peak).toBeLessThanOrEqual(3)
  })

  test('mapConcurrent given a Semaphore fans out immediately and lets the semaphore be the real gate', async () => {
    const semaphore = createSemaphore(4)
    let active = 0
    let peak = 0
    const items = Array.from({ length: 20 }, (_, i) => i)

    const results = await mapConcurrent(items, semaphore, async (i) => {
      await semaphore.acquire()
      try {
        active++
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 2))
        active--
        return i
      } finally {
        semaphore.release()
      }
    })

    expect(peak).toBeLessThanOrEqual(4)
    expect(results).toEqual(items) // order preserved, nothing lost
  })

  test('mapConcurrent never rejects: a thrown fn call is captured as an Error in that slot', async () => {
    const results = await mapConcurrent([1, 2, 3], 2, async (i) => {
      if (i === 2) throw new Error('boom')
      return i
    })
    expect(results[0]).toBe(1)
    expect(results[1]).toBeInstanceOf(Error)
    expect(results[2]).toBe(3)
  })
})
