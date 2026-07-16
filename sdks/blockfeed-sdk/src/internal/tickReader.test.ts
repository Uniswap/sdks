import { describe, expect, it } from 'bun:test'

import { MULTICALL3_ADDRESS } from '../constants'
import { TickFailedError } from '../errors'
import type { SpeculativeCall } from '../types'

import { MULTICALL3_HELPER_ABI, readTick } from './tickReader'

type RawResult = { status: 'success'; result: unknown } | { status: 'failure'; error: Error }

interface RawContract {
  address: string
  abi: unknown
  functionName: string
  args: readonly unknown[]
}

/** Fake `Pick<PublicClient, 'multicall'>` capturing every contracts array it is handed. */
function fakeClient(handler: (contracts: RawContract[]) => RawResult[]) {
  const calls: RawContract[][] = []
  const client = {
    multicall: async ({ contracts }: { contracts: RawContract[] }): Promise<RawResult[]> => {
      calls.push(contracts)
      return handler(contracts)
    },
  } as never
  return { client, calls }
}

const ok = (result: unknown): RawResult => ({ status: 'success', result })
const fail = (message: string): RawResult => ({ status: 'failure', error: new Error(message) })

// Canned identity triple returned in call order: getBlockNumber, getLastBlockHash, getCurrentBlockTimestamp.
const IDENTITY_OK: RawResult[] = [ok(100n), ok('0xabc123'), ok(1700000000n)]

const speculativeCall = (fn: string, allowFailure?: boolean): SpeculativeCall => ({
  address: '0x000000000004444c5dc75cB358380D2e3dE08A90',
  abi: [],
  functionName: fn,
  args: [],
  allowFailure,
})

describe('readTick', () => {
  it('(a) issues the three identity calls first and lands their values in identity', async () => {
    const { client, calls } = fakeClient(() => IDENTITY_OK)
    const result = await readTick(client, { keyed: {} })

    // Identity calls are first, at Multicall3, in the fixed order.
    const first3 = calls[0]!.slice(0, 3)
    expect(first3.map((c) => c.functionName)).toEqual([
      'getBlockNumber',
      'getLastBlockHash',
      'getCurrentBlockTimestamp',
    ])
    expect(first3.every((c) => c.address === MULTICALL3_ADDRESS)).toBe(true)
    expect(first3.every((c) => c.abi === MULTICALL3_HELPER_ABI)).toBe(true)

    expect(result.identity).toEqual({
      blockNumber: 100n,
      parentBlockHash: '0xabc123',
      timestamp: 1700000000n,
    })
    // identity is Omit<TickIdentity, 'chainId'> — no chainId here.
    expect('chainId' in result.identity).toBe(false)
  })

  it('(b) maps keyed results back by key regardless of input ordering', async () => {
    const { client, calls } = fakeClient((contracts) => [
      ...IDENTITY_OK,
      // remaining follow sorted-key order: apple, zebra
      ...contracts.slice(3).map((c) => ok(`ran:${c.functionName}`)),
    ])
    const result = await readTick(client, {
      keyed: {
        zebra: speculativeCall('zFn'),
        apple: speculativeCall('aFn'),
      },
    })

    // Keyed calls are appended sorted by key.
    expect(calls[0]!.slice(3).map((c) => c.functionName)).toEqual(['aFn', 'zFn'])
    expect(result.results['apple']).toEqual({ status: 'success', result: 'ran:aFn' })
    expect(result.results['zebra']).toEqual({ status: 'success', result: 'ran:zFn' })
  })

  it('(c) records a tolerated (allowFailure) keyed failure as a failure CallResult', async () => {
    const { client } = fakeClient(() => [...IDENTITY_OK, fail('reverted')])
    const result = await readTick(client, { keyed: { soft: speculativeCall('sFn', true) } })

    const r = result.results['soft']!
    expect(r.status).toBe('failure')
    if (r.status === 'failure') expect(r.error.message).toBe('reverted')
  })

  it('(d) throws TickFailedError naming the keys for a non-tolerated keyed failure', async () => {
    const { client } = fakeClient(() => [...IDENTITY_OK, ok('fine'), fail('boom')])
    const promise = readTick(client, {
      keyed: {
        good: speculativeCall('gFn', true),
        hard: speculativeCall('hFn', false),
      },
    })
    await expect(promise).rejects.toBeInstanceOf(TickFailedError)
    try {
      await promise
    } catch (e) {
      expect((e as TickFailedError).failedKeys).toContain('hard')
    }
  })

  it('(e) chunks at maxCallsPerChunk=5 with 7 keyed calls into two invocations, identity only in the first', async () => {
    const { client, calls } = fakeClient((contracts) => contracts.map((c) => ok(c.functionName)))
    const keyed: Record<string, SpeculativeCall> = {}
    for (let i = 0; i < 7; i++) keyed[`k${i}`] = speculativeCall(`fn${i}`, true)

    await readTick(client, { keyed }, { maxCallsPerChunk: 5 })

    expect(calls.length).toBe(2)
    // Chunk 1: 3 identity + 2 keyed = 5 calls.
    expect(calls[0]!.length).toBe(5)
    expect(calls[0]!.slice(0, 3).map((c) => c.functionName)).toEqual([
      'getBlockNumber',
      'getLastBlockHash',
      'getCurrentBlockTimestamp',
    ])
    // Chunk 2: remaining 5 keyed, no identity calls.
    expect(calls[1]!.length).toBe(5)
    const identityFns = new Set(['getBlockNumber', 'getLastBlockHash', 'getCurrentBlockTimestamp'])
    expect(calls[1]!.some((c) => identityFns.has(c.functionName))).toBe(false)
  })

  it('(f) throws TickFailedError when an identity call fails', async () => {
    const { client } = fakeClient(() => [ok(100n), fail('no hash'), ok(1700000000n)])
    await expect(readTick(client, { keyed: {} })).rejects.toBeInstanceOf(TickFailedError)
  })
})
