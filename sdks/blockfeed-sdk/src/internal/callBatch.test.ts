import { describe, expect, it } from 'bun:test'

import type { ContractCall } from '../types'

import { planCallBatch } from './callBatch'
import { ok } from './testing'

const ADDR = '0x000000000004444c5dc75cB358380D2e3dE08A90'
const call = (functionName: string, args: readonly unknown[] = [], allowFailure?: boolean): ContractCall => ({
  address: ADDR,
  abi: [],
  functionName,
  args,
  allowFailure,
})

describe('planCallBatch', () => {
  it('dedupes identical cross-source calls into ONE slot and fans the result back to every requester', () => {
    const { keyed, distribute } = planCallBatch([
      { requester: 'a', sourceKey: 'a', calls: { x: call('foo') } },
      { requester: 'b', sourceKey: 'b', calls: { y: call('foo') } },
    ])

    // One shared slot despite two requesters (same fingerprint), keyed by the FIRST requester's key.
    expect(Object.keys(keyed)).toEqual(['a:x'])

    const byRequester = distribute({ 'a:x': ok(42n) })
    expect(byRequester.get('a')).toEqual({ x: ok(42n) })
    expect(byRequester.get('b')).toEqual({ y: ok(42n) }) // mapped back to b's OWN call key
  })

  it('keeps distinct calls in distinct slots', () => {
    const { keyed } = planCallBatch([
      { requester: 'a', sourceKey: 'a', calls: { x: call('foo'), y: call('bar') } },
    ])
    expect(new Set(Object.keys(keyed))).toEqual(new Set(['a:x', 'a:y']))
  })

  it('treats calls with differing args as distinct fingerprints', () => {
    const { keyed } = planCallBatch([
      { requester: 'a', sourceKey: 'a', calls: { x: call('foo', [1n]) } },
      { requester: 'b', sourceKey: 'b', calls: { y: call('foo', [2n]) } },
    ])
    expect(Object.keys(keyed).length).toBe(2)
  })

  it('AND-merge: a shared slot is strict if ANY requester is strict', () => {
    const tolerantFirst = planCallBatch([
      { requester: 'tol', sourceKey: 'tol', calls: { x: call('foo', [], true) } },
      { requester: 'strict', sourceKey: 'strict', calls: { x: call('foo', [], false) } },
    ])
    expect(tolerantFirst.keyed['tol:x']!.allowFailure).toBe(false)

    // Order-independent: strict requester first yields the same merged strictness.
    const strictFirst = planCallBatch([
      { requester: 'strict', sourceKey: 'strict', calls: { x: call('foo', [], false) } },
      { requester: 'tol', sourceKey: 'tol', calls: { x: call('foo', [], true) } },
    ])
    expect(strictFirst.keyed['strict:x']!.allowFailure).toBe(false)
  })

  it('AND-merge: a shared slot stays tolerant only when EVERY requester tolerates failure', () => {
    const { keyed } = planCallBatch([
      { requester: 'a', sourceKey: 'a', calls: { x: call('foo', [], true) } },
      { requester: 'b', sourceKey: 'b', calls: { y: call('foo', [], true) } },
    ])
    expect(keyed['a:x']!.allowFailure).toBe(true)
  })

  it('distribute seeds every requester (even zero-call ones) with a results map', () => {
    const { distribute } = planCallBatch([
      { requester: 'a', sourceKey: 'a', calls: { x: call('foo') } },
      { requester: 'nocalls', sourceKey: 'nocalls', calls: {} },
    ])
    const byRequester = distribute({ 'a:x': ok(1n) })
    expect(byRequester.get('nocalls')).toEqual({})
    expect(byRequester.get('a')).toEqual({ x: ok(1n) })
  })

  it('distribute skips slots absent from the results map', () => {
    const { distribute } = planCallBatch([{ requester: 'a', sourceKey: 'a', calls: { x: call('foo') } }])
    expect(distribute({}).get('a')).toEqual({})
  })
})
