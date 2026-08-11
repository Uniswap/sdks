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
  /**
   * Fail the OUTER call as a function of what the envelope is CARRYING, rather than by position —
   * the only way to script a node whose behaviour depends on batch size or contents, which is
   * exactly what bisection exists to survive. Returning `undefined` serves the envelope normally.
   */
  outerFailsWhen?: (inner: { target: string; callData: string }[]) => Error | undefined
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
        let carried: { target: string; callData: string }[] = []
        // The envelope is decoded (and its Call3 fields verified) even when the outcome is a
        // failure, so `outerCalls` records what a 429'd chunk was CARRYING — which is what the
        // chunk-correlation assertions are about.
        const served = serveAggregate3({
          data,
          blockTag,
          expectBlockNumber: BLOCK,
          onEnvelope: (inner) => {
            carried = inner.map((c) => ({ target: c.target, callData: c.callData }))
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
        const contentFailure = opts.outerFailsWhen?.(carried)
        if (contentFailure !== undefined) throw contentFailure
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

test('an execution-shaped OUTER failure is NOT believed as N on-chain reverts: bisected, then coarsened to TransportError', async () => {
  // aggregate3 with allowFailure never reverts for an inner call's sake, so an outer revert is an
  // aggregator anomaly. Fanning it out as InnerCallFailures would fabricate negative-cacheable
  // evidence about every route in the chunk — C4-H1 with a new spelling.
  //
  // Since C4-T14 the chunk is re-asked in halves first (`shouldBisect`), so a failure that really is
  // about the whole envelope has to persist all the way down to size 1 before anything is written
  // off. Here every envelope fails, so it does — and the write-off is the same one it always was.
  const calls = [call(0), call(1)]
  const script: InnerScript = {}
  calls.forEach((c, i) => (script[innerKey(c.to, c.data)] = ok(i)))
  const outerRevert = Object.assign(new Error('execution reverted'), { data: '0xdeadbeef' })
  const { client, outerCalls } = stubMulticallClient(script, { outerFailsWhen: () => outerRevert })

  const results = await aggregateCalls({ client, multicall3: MULTICALL3_ADDRESS, calls, blockNumber: BLOCK })

  for (const r of results) {
    expect(r).toBeInstanceOf(TransportError)
    expect(r).not.toBeInstanceOf(InnerCallFailure)
    expect((r as TransportError).cause).toBe(outerRevert)
  }
  // The full binary tree, and no more: the root plus one envelope per call. This is what pins
  // TERMINATION — an off-by-one in the split (a half that never shrinks) would hang the test rather
  // than fail it, so the count is the assertion that says the recursion bottomed out.
  expect(outerCalls).toHaveLength(2 * calls.length - 1)
})

test('a node gas cap: the chunk is halved until the batch fits, and every call still gets its real answer', async () => {
  // THE FIX'S REASON FOR EXISTING (C4-T14, found by `integration/swap.fork.test.ts`). A node applies
  // a gas cap to the OUTER eth_call, so an envelope carrying too many expensive quoter simulations
  // dies as a whole — deterministically, which is why the engine's ordinary retry cannot help: it
  // re-sends the identical oversized batch. Modelled here as "more than two inner calls is too
  // many"; the real one was ~39 v3/v4 quotes against anvil's cap.
  //
  // The anvil/revm spelling is used verbatim, including viem's wrapper text, because that shape is
  // classified TRANSPORT (its "An internal error was received." trips the transport message tier) —
  // so this test also pins that bisection keys on `isRequestTooLarge`'s shape read rather than on
  // the channel, which is the whole reason the predicate is separate from `classifyRpcError`.
  const calls = Array.from({ length: 7 }, (_, i) => call(i))
  const script: InnerScript = {}
  calls.forEach((c, i) => (script[innerKey(c.to, c.data)] = ok(i)))
  const outOfGas = Object.assign(new Error('An internal error was received.\n\nDetails: EVM error OutOfGas'), {
    name: 'InternalRpcError',
    code: -32603,
  })
  const { client, outerCalls } = stubMulticallClient(script, {
    outerFailsWhen: (inner) => (inner.length > 2 ? outOfGas : undefined),
  })

  const results = await aggregateCalls({ client, multicall3: MULTICALL3_ADDRESS, calls, blockNumber: BLOCK })

  // Nothing is lost. Before the fix all seven came back as TransportError and the search reported
  // `rpc-degraded` over a round the node was perfectly able to answer.
  results.forEach((r, i) => expect(r).toBe(toHex(`result-${i}`)))
  // It really did have to split — and every envelope that finally landed was within the cap.
  expect(outerCalls.length).toBeGreaterThan(1)
  for (const { targets } of outerCalls.filter((_, i) => i > 0)) expect(targets.length).toBeLessThanOrEqual(4)
})

test('bisection isolates ONE poison call: it alone is written off, the rest of the chunk keeps its answers', async () => {
  // The other half of what halving buys. A single inner call that makes the envelope fail (a quote
  // so expensive it alone exhausts the cap) used to cost every candidate in the chunk. Now the
  // damage is bounded to the call that caused it, and the search stays complete over the others —
  // the difference between one unmeasured leg and a whole `rpc-degraded` round.
  const calls = Array.from({ length: 8 }, (_, i) => call(i))
  const script: InnerScript = {}
  calls.forEach((c, i) => (script[innerKey(c.to, c.data)] = ok(i)))
  const poison = calls[3]!.data
  const outerRevert = Object.assign(new Error('execution reverted'), { data: '0xdeadbeef' })
  const { client } = stubMulticallClient(script, {
    outerFailsWhen: (inner) => (inner.some((c) => c.callData === poison) ? outerRevert : undefined),
  })

  const results = await aggregateCalls({ client, multicall3: MULTICALL3_ADDRESS, calls, blockNumber: BLOCK })

  results.forEach((r, i) => {
    if (i === 3) {
      expect(r).toBeInstanceOf(TransportError)
      // Still never an InnerCallFailure: the envelope failed, so nothing on-chain was learned about
      // this call either, and it must not become negative-cacheable evidence.
      expect(r).not.toBeInstanceOf(InnerCallFailure)
    } else {
      expect(r).toBe(toHex(`result-${i}`))
    }
  })
})

test('a TRANSPORT outer failure is never bisected: one envelope on the wire, not two', async () => {
  // The guard rail on the whole idea. A 429 means the provider is already under more load than it
  // wants; answering it by turning one request into two, then four, is the opposite of the fix.
  // Only DETERMINISTIC envelope failures are re-asked — a transport failure keeps the write-off, and
  // the request count is what proves it rather than the result shape (which is the same either way).
  const calls = Array.from({ length: 6 }, (_, i) => call(i))
  const script: InnerScript = {}
  calls.forEach((c, i) => (script[innerKey(c.to, c.data)] = ok(i)))
  const throttled = rateLimitHttpError()
  const { client, outerCalls } = stubMulticallClient(script, { outerFailsWhen: () => throttled })

  const results = await aggregateCalls({ client, multicall3: MULTICALL3_ADDRESS, calls, blockNumber: BLOCK })

  for (const r of results) expect(r).toBeInstanceOf(TransportError)
  expect(outerCalls).toHaveLength(1)
})

test('an ABORTED chunk is never bisected either: the caller already gave up', async () => {
  // Same reasoning as `ethCall` checking the signal with the permit in hand. An abort is not a
  // statement about the envelope's size, and bisecting one would put requests on the wire that the
  // search has already stopped waiting for.
  const calls = Array.from({ length: 4 }, (_, i) => call(i))
  const script: InnerScript = {}
  calls.forEach((c, i) => (script[innerKey(c.to, c.data)] = ok(i)))
  const controller = new AbortController()
  controller.abort()
  const { client, outerCalls } = stubMulticallClient(script)

  const results = await aggregateCalls({
    client,
    multicall3: MULTICALL3_ADDRESS,
    calls,
    blockNumber: BLOCK,
    signal: controller.signal,
  })

  for (const r of results) expect(r).toBeInstanceOf(AbortedCallError)
  expect(outerCalls).toHaveLength(0)
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
