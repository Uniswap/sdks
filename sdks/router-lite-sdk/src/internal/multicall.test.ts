import { afterEach, expect, test } from 'bun:test'
import type { Address, Hex, PublicClient } from 'viem'
import { decodeFunctionData, toHex } from 'viem'

import { AbortedCallError, NodeStateError, TransportError } from '../errors'
import type { EthCall } from '../types'

import { MULTICALL3_ABI } from './abis'
import { aggregateCalls, InnerCallFailure, MULTICALL3_ADDRESS, MULTICALL_CHUNK } from './multicall'
import { createSemaphore } from './rpc'
import { headerNotFoundError, rateLimitHttpError, recordStubViolation, serveAggregate3, takeStubViolations } from './testing'

// ---------------------------------------------------------------------------
// The stub decodes each aggregate3's Call3[] exactly as the deployed contract
// would see it, and serves each inner call from a per-target table — so every
// assertion below is about the real encoded conversation, not about a mock of
// this module's own internals. Anything the stub is not scripted for is a loud
// stub error, never a silent default.
// ---------------------------------------------------------------------------

afterEach(() => {
  expect(takeStubViolations(), 'the aggregate3 stub was asked something no test scripted').toEqual([])
})

const TARGET_A = `0x${'aa'.repeat(20)}` as Address
const TARGET_B = `0x${'bb'.repeat(20)}` as Address
const BLOCK = 123n

type InnerScript = Record<
  string,
  { success: true; returnData: Hex } | { success: false; returnData: Hex } | 'throw-outer'
>

type StubOptions = {
  /** Consulted per OUTER call, in order; past the end every outer call is served. */
  outerOutcomes?: ('serve' | Error | { garbage: Hex })[]
  /** Serve direct (non-aggregate3) eth_calls from this table; absent → loud stub error. */
  direct?: Record<string, Hex | Error>
  onOuterCall?: (to: string, innerCount: number, blockTag: string) => void
}

function innerKey(target: string, callData: string): string {
  return `${target.toLowerCase()}:${callData}`
}

function stubMulticallClient(script: InnerScript, opts: StubOptions = {}): {
  client: Pick<PublicClient, 'request'>
  outerCalls: { to: string; targets: string[] }[]
} {
  const outerCalls: { to: string; targets: string[] }[] = []
  let outerIndex = 0
  const client = {
    async request(args: any) {
      if (args.method !== 'eth_call') recordStubViolation(`stub: unexpected method ${args.method}`)
      const [{ to, data }, blockTag] = args.params
      let isAggregate = false
      try {
        isAggregate = decodeFunctionData({ abi: MULTICALL3_ABI, data }).functionName === 'aggregate3'
      } catch {
        // not an aggregate3 call — fall through to the direct table
      }
      if (isAggregate) {
        const outcome = opts.outerOutcomes?.[outerIndex++] ?? 'serve'
        // The envelope is decoded (and its Call3 fields verified) even when the outcome is a
        // failure, so `outerCalls` records what a 429'd chunk was CARRYING — which is what the
        // chunk-correlation assertions are about.
        const served = serveAggregate3({
          data,
          blockTag,
          expectBlockNumber: BLOCK,
          onEnvelope: (inner) => {
            outerCalls.push({ to: (to as string).toLowerCase(), targets: inner.map((c) => c.target) })
            opts.onOuterCall?.((to as string).toLowerCase(), inner.length, blockTag)
          },
          serve: (target, callData) => {
            const entry = script[innerKey(target, callData)]
            if (entry === undefined) recordStubViolation(`stub: no inner script for ${innerKey(target, callData)}`)
            if (entry === 'throw-outer') throw new Error('stub: inner entry demanded an outer failure')
            if (!entry.success) throw Object.assign(new Error('execution reverted'), { data: entry.returnData })
            return entry.returnData
          },
        })
        if (outcome instanceof Error) throw outcome
        if (outcome !== 'serve') return outcome.garbage
        return served
      }
      const entry = opts.direct?.[innerKey(to as string, data as string)]
      if (entry === undefined) recordStubViolation(`stub: unexpected direct eth_call to ${to}`)
      if (entry instanceof Error) throw entry
      return entry
    },
  } as unknown as Pick<PublicClient, 'request'>
  return { client, outerCalls }
}

function call(i: number, target: Address = TARGET_A): EthCall {
  return { to: target, data: toHex(`call-${i}`) }
}

function ok(value: number): { success: true; returnData: Hex } {
  return { success: true, returnData: toHex(`result-${value}`) }
}

test('one chunk: results come back in input order, raw return data verbatim, at the given multicall address', async () => {
  const calls = [call(0), call(1, TARGET_B), call(2)]
  const script: InnerScript = {}
  calls.forEach((c, i) => (script[innerKey(c.to, c.data)] = ok(i)))
  const { client, outerCalls } = stubMulticallClient(script)

  const results = await aggregateCalls({ client, multicall3: MULTICALL3_ADDRESS, calls, blockNumber: BLOCK })

  expect(results).toEqual([toHex('result-0'), toHex('result-1'), toHex('result-2')])
  expect(outerCalls).toHaveLength(1)
  expect(outerCalls[0]!.to).toBe(MULTICALL3_ADDRESS.toLowerCase())
  expect(outerCalls[0]!.targets).toEqual([TARGET_A, TARGET_B, TARGET_A].map((t) => t.toLowerCase()))
})

test(`chunking: ${MULTICALL_CHUNK + 1} calls become exactly two aggregate3 calls, order preserved across the seam`, async () => {
  const calls = Array.from({ length: MULTICALL_CHUNK + 1 }, (_, i) => call(i))
  const script: InnerScript = {}
  calls.forEach((c, i) => (script[innerKey(c.to, c.data)] = ok(i)))
  const { client, outerCalls } = stubMulticallClient(script)

  const results = await aggregateCalls({ client, multicall3: MULTICALL3_ADDRESS, calls, blockNumber: BLOCK })

  expect(outerCalls).toHaveLength(2)
  expect(outerCalls.map((c) => c.targets.length).sort((a, b) => a - b)).toEqual([1, MULTICALL_CHUNK])
  expect(results).toHaveLength(MULTICALL_CHUNK + 1)
  results.forEach((r, i) => expect(r).toBe(toHex(`result-${i}`)))
})

test('inner failures map to InnerCallFailure: revert data verbatim, bare 0x normalized to undefined — execution channel by construction', async () => {
  const calls = [call(0), call(1), call(2)]
  const revertData = '0xf29b7f9800000000000000000000000000000000000000000000000000000000000001' as Hex
  const { client } = stubMulticallClient({
    [innerKey(calls[0]!.to, calls[0]!.data)]: ok(0),
    [innerKey(calls[1]!.to, calls[1]!.data)]: { success: false, returnData: revertData },
    [innerKey(calls[2]!.to, calls[2]!.data)]: { success: false, returnData: '0x' },
  })

  const results = await aggregateCalls({ client, multicall3: MULTICALL3_ADDRESS, calls, blockNumber: BLOCK })

  expect(results[0]).toBe(toHex('result-0'))
  const withData = results[1] as InnerCallFailure
  expect(withData).toBeInstanceOf(InnerCallFailure)
  expect(withData.revertData).toBe(revertData)
  // Never the transport channel: an inner failure must not be countable as rpc degradation.
  expect(withData).not.toBeInstanceOf(TransportError)
  const bare = results[2] as InnerCallFailure
  expect(bare).toBeInstanceOf(InnerCallFailure)
  expect(bare.revertData).toBeUndefined()
})

test('an inner SUCCESS with empty return data stays a plain 0x Hex — the v2 empty-code shape is the caller-side decode failure it always was', async () => {
  const calls = [call(0)]
  const { client } = stubMulticallClient({ [innerKey(calls[0]!.to, calls[0]!.data)]: { success: true, returnData: '0x' } })
  const results = await aggregateCalls({ client, multicall3: MULTICALL3_ADDRESS, calls, blockNumber: BLOCK })
  expect(results[0]).toBe('0x')
})

test('an outer transport failure coarsens to every slot of THAT chunk only — other chunks unaffected', async () => {
  const calls = Array.from({ length: MULTICALL_CHUNK + 2 }, (_, i) => call(i))
  const script: InnerScript = {}
  calls.forEach((c, i) => (script[innerKey(c.to, c.data)] = ok(i)))
  // Chunks run under a shared semaphore(1) so their order is deterministic: chunk 0 (calls 0..49)
  // gets the 429, chunk 1 (calls 50..51) is served.
  const { client } = stubMulticallClient(script, { outerOutcomes: [rateLimitHttpError(), 'serve'] })

  const results = await aggregateCalls({
    client,
    multicall3: MULTICALL3_ADDRESS,
    calls,
    blockNumber: BLOCK,
    semaphore: createSemaphore(1),
  })

  for (let i = 0; i < MULTICALL_CHUNK; i++) {
    expect(results[i]).toBeInstanceOf(TransportError)
    expect(results[i]).not.toBeInstanceOf(InnerCallFailure)
  }
  expect(results[MULTICALL_CHUNK]).toBe(toHex(`result-${MULTICALL_CHUNK}`))
  expect(results[MULTICALL_CHUNK + 1]).toBe(toHex(`result-${MULTICALL_CHUNK + 1}`))
})

test('a node-state outer failure stays a NodeStateError (TransportError subclass), preserving the diagnostic', async () => {
  const calls = [call(0)]
  const script: InnerScript = { [innerKey(calls[0]!.to, calls[0]!.data)]: ok(0) }
  const { client } = stubMulticallClient(script, { outerOutcomes: [headerNotFoundError()] })

  const results = await aggregateCalls({ client, multicall3: MULTICALL3_ADDRESS, calls, blockNumber: BLOCK })

  expect(results[0]).toBeInstanceOf(NodeStateError)
})

test('an execution-shaped OUTER failure is NOT believed as N on-chain reverts: coarsened to TransportError', async () => {
  // aggregate3 with allowFailure never reverts for an inner call's sake, so an outer revert is an
  // aggregator anomaly. Fanning it out as InnerCallFailures would fabricate negative-cacheable
  // evidence about every route in the chunk — C4-H1 with a new spelling.
  const calls = [call(0), call(1)]
  const script: InnerScript = {}
  calls.forEach((c, i) => (script[innerKey(c.to, c.data)] = ok(i)))
  const outerRevert = Object.assign(new Error('execution reverted'), { data: '0xdeadbeef' })
  const { client } = stubMulticallClient(script, { outerOutcomes: [outerRevert] })

  const results = await aggregateCalls({ client, multicall3: MULTICALL3_ADDRESS, calls, blockNumber: BLOCK })

  for (const r of results) {
    expect(r).toBeInstanceOf(TransportError)
    expect(r).not.toBeInstanceOf(InnerCallFailure)
    expect((r as TransportError).cause).toBe(outerRevert)
  }
})

test('outer return data that does not decode as Result[] is the same coarsening, never a crash', async () => {
  const calls = [call(0)]
  const script: InnerScript = { [innerKey(calls[0]!.to, calls[0]!.data)]: ok(0) }
  const { client } = stubMulticallClient(script, { outerOutcomes: [{ garbage: '0x1234' }] })

  const results = await aggregateCalls({ client, multicall3: MULTICALL3_ADDRESS, calls, blockNumber: BLOCK })

  expect(results[0]).toBeInstanceOf(TransportError)
})

test('an abort with the permit in hand skips the chunk: AbortedCallError in every slot, nothing sent', async () => {
  const calls = [call(0), call(1)]
  const script: InnerScript = {}
  calls.forEach((c, i) => (script[innerKey(c.to, c.data)] = ok(i)))
  const { client, outerCalls } = stubMulticallClient(script)
  const controller = new AbortController()
  controller.abort()

  const results = await aggregateCalls({
    client,
    multicall3: MULTICALL3_ADDRESS,
    calls,
    blockNumber: BLOCK,
    semaphore: createSemaphore(1),
    signal: controller.signal,
  })

  expect(outerCalls).toHaveLength(0)
  for (const r of results) {
    expect(r).toBeInstanceOf(AbortedCallError)
    // Emphatically not a TransportError: nothing was asked of the provider.
    expect(r).not.toBeInstanceOf(TransportError)
  }
})

test('an abort landing mid-round strands only the chunks still queued behind the permit', async () => {
  const calls = Array.from({ length: MULTICALL_CHUNK + 1 }, (_, i) => call(i))
  const script: InnerScript = {}
  calls.forEach((c, i) => (script[innerKey(c.to, c.data)] = ok(i)))
  const controller = new AbortController()
  // The deadline fires the instant the first outer call is served; the second chunk is queued on the
  // single permit and must never go to the wire.
  const { client, outerCalls } = stubMulticallClient(script, { onOuterCall: () => controller.abort() })

  const results = await aggregateCalls({
    client,
    multicall3: MULTICALL3_ADDRESS,
    calls,
    blockNumber: BLOCK,
    semaphore: createSemaphore(1),
    signal: controller.signal,
  })

  expect(outerCalls).toHaveLength(1)
  const sent = outerCalls[0]!.targets.length
  const skipped = calls.length - sent
  expect(results.filter((r) => typeof r === 'string')).toHaveLength(sent)
  expect(results.filter((r) => r instanceof AbortedCallError)).toHaveLength(skipped)
})

test('calls carrying `from` or `value` are never aggregated — dispatched individually, results interleaved in order', async () => {
  const plain0 = call(0)
  const withFrom: EthCall = { to: TARGET_B, data: toHex('sender-sensitive'), from: `0x${'11'.repeat(20)}` as Address }
  const plain1 = call(1)
  const withValue: EthCall = { to: TARGET_B, data: toHex('value-bearing'), value: 7n }
  const { client, outerCalls } = stubMulticallClient(
    { [innerKey(plain0.to, plain0.data)]: ok(0), [innerKey(plain1.to, plain1.data)]: ok(1) },
    {
      direct: {
        [innerKey(withFrom.to, withFrom.data)]: toHex('direct-from'),
        [innerKey(withValue.to, withValue.data)]: Object.assign(new Error('execution reverted'), { data: '0xbead' }),
      },
    },
  )

  const results = await aggregateCalls({
    client,
    multicall3: MULTICALL3_ADDRESS,
    calls: [plain0, withFrom, plain1, withValue],
    blockNumber: BLOCK,
  })

  // The aggregate3 carried exactly the two plain calls; the sender/value-bearing ones went direct.
  expect(outerCalls).toHaveLength(1)
  expect(outerCalls[0]!.targets).toEqual([TARGET_A, TARGET_A].map((t) => t.toLowerCase()))
  expect(results[0]).toBe(toHex('result-0'))
  expect(results[1]).toBe(toHex('direct-from'))
  expect(results[2]).toBe(toHex('result-1'))
  // A direct dispatch's revert is the per-call path's error shape, not an InnerCallFailure.
  expect(results[3]).toBeInstanceOf(Error)
  expect(results[3]).not.toBeInstanceOf(InnerCallFailure)
  expect(results[3]).not.toBeInstanceOf(TransportError)
})

test('the outer call is block-pinned to the same block the per-call path would use', async () => {
  const calls = [call(0)]
  const script: InnerScript = { [innerKey(calls[0]!.to, calls[0]!.data)]: ok(0) }
  let seenBlockTag: string | undefined
  const { client } = stubMulticallClient(script, { onOuterCall: (_to, _n, blockTag) => (seenBlockTag = blockTag) })

  await aggregateCalls({ client, multicall3: MULTICALL3_ADDRESS, calls, blockNumber: BLOCK })

  expect(seenBlockTag).toBe(`0x${BLOCK.toString(16)}`)
})
