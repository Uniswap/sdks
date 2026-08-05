import { describe, expect, test } from 'bun:test'
import * as viem from 'viem'
import type { Hex, PublicClient } from 'viem'

import { NodeStateError, TransportError } from '../errors'
import type { EthCall } from '../types'

import providerErrors from './__fixtures__/providerErrors.json'
import { classifyRpcError, createSemaphore, ethCall, mapConcurrent, parseDeclaredCap, revertDataOf } from './rpc'
import {
  chainDisconnectedError,
  connectionRefusedError,
  deeplyNestedSocketError,
  headerNotFoundError,
  nestedRevertDataError,
  nonexistentBlockError,
  providerDisconnectedError,
  rateLimitHttpError,
  rateLimitRpcError,
  selfReferentialError,
  timeoutError,
} from './testing'

// ---------------------------------------------------------------------------
// The transport-vs-execution seam. A revert is the node answering
// authoritatively about the chain; a 429/timeout/dead socket is the provider
// answering about itself. Conflating them is what let a partial provider
// outage be reported as a *confident* `no-route` (FW2), so both directions are
// pinned here: an execution failure must stay a plain `Error` (callers still
// read its revert data verbatim), and a transport failure must become a
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

describe('classifyRpcError — execution failures (authoritative on-chain answers)', () => {
  test('a revert carrying data is execution, however it is nested', () => {
    expect(classifyRpcError(revertWithData('0x08c379a0' as Hex))).toBe('execution')
    expect(classifyRpcError(Object.assign(new Error('execution reverted'), { data: '0xdeadbeef' }))).toBe('execution')
    expect(classifyRpcError({ code: 3, data: '0xdeadbeef', message: 'execution reverted' })).toBe('execution')
  })

  // C4-T1 redundancy pass: an independent angle on revert-data precedence from the test above, which
  // only pits revert data against MESSAGE-tier prose. This pits it against STRUCTURED transport
  // evidence living on the very same error object — an HTTP 429 status and the `HttpRequestError`
  // name both sit in the tier `classifyRpcError` checks before the message tier, so this is the one
  // fixture that would catch a mutant reordering the structured-evidence checks (revert data vs.
  // status/name) rather than only the structured-vs-message ordering the test above already covers.
  test('a revert carrying data beats STRUCTURED transport evidence (HTTP 429 status, HttpRequestError name) on the same error', () => {
    const err = Object.assign(new Error('HTTP request failed.\n\nStatus: 429'), { name: 'HttpRequestError', status: 429, data: '0xdeadbeef' })
    expect(classifyRpcError(err)).toBe('execution')
  })

  test('a bare "execution reverted" with no data is execution — the pool-absent case every probe relies on', () => {
    expect(classifyRpcError(new Error('execution reverted'))).toBe('execution')
    expect(classifyRpcError({ code: -32000, message: 'execution reverted' })).toBe('execution')
  })

  test('other EVM rejections are execution', () => {
    expect(classifyRpcError(new Error('invalid opcode: INVALID'))).toBe('execution')
    expect(classifyRpcError(new Error('out of gas'))).toBe('execution')
    expect(classifyRpcError(new Error('VM Exception while processing transaction: revert'))).toBe('execution')
  })

  test('an unrecognized shape defaults to execution, keeping "candidate dies, others unaffected"', () => {
    // A node that answered at all, in a dialect we do not know, is far likelier reporting a revert
    // than a dead transport — and the default must not turn every odd error into an inconclusive
    // search. (Test-harness guards like `stubClient: no stub registered` land here too.)
    expect(classifyRpcError(new Error('something entirely unfamiliar'))).toBe('execution')
    expect(classifyRpcError(undefined)).toBe('execution')
  })

  test('a number that merely looks like an HTTP status is not a transport failure', () => {
    // Regression: a bare `\b50[0234]\b` / `\b429\b` message token read "amount 504 too low" as a
    // provider outage. Numeric status is only trusted from the structured `status`/`code` fields.
    expect(classifyRpcError(new Error('amount 504 too low'))).toBe('execution')
    expect(classifyRpcError(new Error('MinAmountOut(429)'))).toBe('execution')
  })

  test('revert text wins over transport text in the same message', () => {
    // viem's verbose errors quote the URL and request body; a revert whose message happens to
    // mention the network must not be read as a network failure.
    expect(
      classifyRpcError(new Error('The contract function reverted.\n\nURL: https://rpc.example.com/socket\n\nDetails: execution reverted')),
    ).toBe('execution')
  })
})

describe('classifyRpcError — transport failures (no answer about the chain at all)', () => {
  test('a viem HttpRequestError with status 429 is transport', () => {
    expect(classifyRpcError(rateLimitHttpError())).toBe('transport')
  })

  test('a JSON-RPC rate-limit error (-32005) is transport, raw or viem-wrapped', () => {
    expect(classifyRpcError(rateLimitRpcError())).toBe('transport')
    expect(classifyRpcError({ code: -32005, message: 'daily request count exceeded' })).toBe('transport')
  })

  test('a timeout is transport', () => {
    expect(classifyRpcError(timeoutError())).toBe('transport')
    expect(classifyRpcError(new Error('request timed out after 10000ms'))).toBe('transport')
  })

  test('a socket/DNS failure is transport, including through a fetch `cause` chain', () => {
    expect(classifyRpcError(connectionRefusedError())).toBe('transport')
    expect(classifyRpcError(Object.assign(new Error('getaddrinfo ENOTFOUND rpc.example.com'), { code: 'ENOTFOUND' }))).toBe('transport')
  })

  test('HTTP 5xx status lines are transport', () => {
    expect(classifyRpcError(Object.assign(new Error('HTTP request failed.'), { name: 'HttpRequestError', status: 503 }))).toBe('transport')
    expect(classifyRpcError(new Error('502 Bad Gateway'))).toBe('transport')
  })

  test('-32000 is NOT treated as transport: it is geth\'s catch-all and usually carries a revert', () => {
    expect(classifyRpcError({ code: -32000, message: 'execution reverted' })).toBe('execution')
  })

  test('-32002 (resource unavailable) is transport', () => {
    expect(classifyRpcError({ code: -32002, message: 'resource unavailable' })).toBe('transport')
  })

  test('an undici UND_ERR_* string code is transport', () => {
    expect(classifyRpcError(Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }))).toBe('transport')
  })

  test('every viem transport error CLASS is transport by name alone, with no other signal present', () => {
    // These had no coverage at all: a name silently dropped from `TRANSPORT_ERROR_NAMES` would have
    // gone unnoticed, and none of these messages carries a transport word to fall back on.
    //
    // `'RequestTimeoutError'` USED TO BE IN THIS LIST AND IS GONE (R5). viem has never exported a
    // class by that name — its timeout class is plain `TimeoutError` — so the assertion passed for
    // the wrong reason: it proved a *string* was in the set, not that any error viem throws is
    // classified. A test may only pin names the dependency actually ships, which is what the
    // sibling test below now enforces against viem's real exports.
    for (const name of ['SocketClosedError', 'WebSocketRequestError', 'ResourceUnavailableRpcError']) {
      const err = new Error('the provider stopped talking')
      err.name = name
      expect(classifyRpcError(err)).toBe('transport')
    }
  })

  test('every name in TRANSPORT_ERROR_NAMES is a class viem really exports', () => {
    // The guard that would have caught `RequestTimeoutError` the day it was written. Each name is
    // resolved against viem's own export map, so a typo (or a class renamed in a viem upgrade)
    // fails here rather than degrading silently into a name that matches nothing forever.
    for (const name of ['HttpRequestError', 'TimeoutError', 'SocketClosedError', 'WebSocketRequestError',
      'LimitExceededRpcError', 'ResourceUnavailableRpcError', 'ProviderDisconnectedError', 'ChainDisconnectedError']) {
      expect(typeof (viem as Record<string, unknown>)[name]).toBe('function')
    }
    expect((viem as Record<string, unknown>).RequestTimeoutError).toBeUndefined()
  })

  test('an EIP-1193 provider/chain disconnect is transport — the name is the only signal (R5)', () => {
    // 4900/4901 are not in `TRANSPORT_RPC_CODES` and neither message carries a transport word, so
    // these classify on `TRANSPORT_ERROR_NAMES` alone. A disconnected injected provider must not
    // read as "the chain refused this call".
    for (const makeError of [providerDisconnectedError, chainDisconnectedError]) {
      expect(classifyRpcError(makeError())).toBe('transport')
    }
  })

  test('RpcRequestError is deliberately NOT transport — it wraps reverts too', () => {
    // viem puts `RpcRequestError` around every JSON-RPC error response, `execution reverted`
    // included. Adding it to the set would launder every revert into "the node never answered".
    const err = new Error('RPC Request failed.\n\nDetails: execution reverted')
    err.name = 'RpcRequestError'
    expect(classifyRpcError(err)).toBe('execution')
  })
})

// ---------------------------------------------------------------------------
// C4-H1: NODE-STATE ERRORS ARE NOT CHAIN ANSWERS.
//
// Every string below is a node saying "I cannot serve this request at this
// block" — a pruned/reorged-away state, a lagging replica behind a load
// balancer, a result cap. None of them mentions a revert, which is exactly why
// they all used to land on the classifier's `execution` default: a search whose
// pinned `eth_call`s were served by a node two blocks behind counted 48
// candidates as on-chain refusals and reported a CONFIDENT `no-route` from a
// search that never touched chain state.
// ---------------------------------------------------------------------------

describe('classifyRpcError — node-state availability (the node could not serve this block)', () => {
  const NODE_STATE_MESSAGES = [
    'header not found',
    'missing trie node 0x4f2b1c9e8a7d6b5c4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d (path ) state 0x...',
    'block not found',
    'unknown block',
    'state at block 21000000 is not available',
    'state for block 21000000 unavailable',
    'Nonexistent block: requested 21000002, latest 21000000',
    'requested block is not available on this node',
    'exceeded maximum block range: 10000',
    'query returned more than 10000 results',
    'response size exceeded the configured limit',
  ]

  for (const message of NODE_STATE_MESSAGES) {
    test(`"${message.slice(0, 40)}" is unavailable, never execution`, () => {
      // Bare, and wrapped in geth's catch-all `-32000` the way a provider actually returns it —
      // `-32000` is not a transport code (it usually carries a revert), so the message tier is the
      // only thing standing between this and a fabricated on-chain refusal.
      expect(classifyRpcError(new Error(message))).toBe('unavailable')
      expect(classifyRpcError({ code: -32000, message })).toBe('unavailable')
    })
  }

  test('the fixtures a provider really produces classify unavailable through their cause chains', () => {
    expect(classifyRpcError(headerNotFoundError())).toBe('unavailable')
    expect(classifyRpcError(nonexistentBlockError())).toBe('unavailable')
  })

  test('a real revert still beats node-state text: structured revert evidence outranks every message tier', () => {
    // The one direction that would be a regression: a revert whose data is present is authoritative
    // no matter what its prose says.
    expect(classifyRpcError({ code: 3, data: '0xdeadbeef', message: 'header not found' })).toBe('execution')
    expect(classifyRpcError(Object.assign(new Error('unknown block'), { data: '0xdeadbeef' }))).toBe('execution')
  })

  test('an ordinary revert is untouched by the new tier', () => {
    expect(classifyRpcError(new Error('execution reverted'))).toBe('execution')
    expect(classifyRpcError(new Error('execution reverted: STF'))).toBe('execution')
  })

  test('ORDERING PIN: node-state text outranks revert TEXT in the same message (no revert data present)', () => {
    // The tier order inside `classifyRpcError` is the whole fix, and swapping these two lines is a
    // mutant nothing else catches: a node that answers "header not found" while some wrapper prose
    // says "execution reverted" never executed anything, and calling it a revert is exactly the
    // laundering C4-H1 is about. (With real revert DATA the answer flips back to `execution` — that
    // is the structured tier above the message tier, pinned in the test below.)
    expect(classifyRpcError(new Error('execution reverted\n\nDetails: header not found'))).toBe('unavailable')
    expect(classifyRpcError({ code: -32000, message: 'missing trie node 0xabc: execution reverted' })).toBe('unavailable')
  })

  test('an anchored "unknown block" does not fire on unrelated prose', () => {
    expect(classifyRpcError(new Error('unknown blockNumber field in request'))).toBe('execution')
    expect(classifyRpcError(new Error('unknown block 0x1234'))).toBe('unavailable')
  })
})

// ---------------------------------------------------------------------------
// Fact collection walks the WHOLE cause chain. viem nests 2-3 deep and every
// provider wrapper adds a frame; a classifier that only reads the error it was
// handed sees a bland `Error('request failed')` and defaults to `execution`,
// which is a phantom on-chain answer.
// ---------------------------------------------------------------------------

describe('classifyRpcError — evidence depth', () => {
  test('evidence at cause depth 2 (both outer frames bland) still classifies transport', () => {
    expect(classifyRpcError(deeplyNestedSocketError())).toBe('transport')
  })

  test('revert data nested as `cause.data.data` classifies execution, over node-state text at the same depth', () => {
    // Load-bearing in both directions: drop the `data.data` collection and this becomes `unavailable`
    // (the nested message is node-state text), rather than quietly landing on the `execution` default
    // and passing anyway.
    expect(classifyRpcError(nestedRevertDataError())).toBe('execution')
    expect(classifyRpcError({ cause: { message: 'header not found', data: { data: '0xdeadbeef' } } })).toBe('execution')
  })

  test('node-state text at cause depth 1 classifies unavailable', () => {
    expect(classifyRpcError(Object.assign(new Error('request failed'), { cause: new Error('missing trie node') }))).toBe('unavailable')
  })

  test('a self-referential cause terminates instead of spinning', () => {
    expect(classifyRpcError(selfReferentialError())).toBe('execution')
  })
})

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
    // The whole point of the subclass: `quote.ts`, `readiness.ts` and `waves.ts` all discriminate
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

// ---------------------------------------------------------------------------
// R1: `revertDataOf` and `classifyRpcError` share ONE cause-chain walker.
//
// These two used to be separate walks with subtly different shape rules, and a
// third (weaker) walk lived in `verify/preflight.ts`. The tests below pin the
// two properties that made the divergence a live bug rather than a tidiness
// complaint: the nested geth shape must yield its bytes, and a zero-length
// '0x' must never be mistaken for payload (it is what `quote/quote.ts`'s
// amount-independence rule keys off, so a false positive there suppresses a
// cacheable "pool absent" fact).
// ---------------------------------------------------------------------------

describe('revertDataOf — the shared walker', () => {
  test('reads the geth-shaped payload at cause.data.data', () => {
    expect(revertDataOf(nestedRevertDataError())).toBe('0x08c379a0deadbeef')
  })

  test('reads a top-level payload, and prefers it over a nested one on the same node', () => {
    expect(revertDataOf({ data: '0x1111', cause: { data: { data: '0x2222' } } })).toBe('0x1111')
  })

  test('walks past bland frames to a payload deeper in the chain', () => {
    const inner = { data: { data: '0xfeed' } }
    expect(revertDataOf(Object.assign(new Error('a'), { cause: Object.assign(new Error('b'), { cause: inner }) }))).toBe('0xfeed')
  })

  test("a zero-length '0x' is NOT data, at either depth", () => {
    expect(revertDataOf({ data: '0x' })).toBeUndefined()
    expect(revertDataOf({ cause: { data: { data: '0x' } } })).toBeUndefined()
  })

  test('agrees with classifyRpcError: whenever there are bytes, the call executed', () => {
    for (const err of [nestedRevertDataError(), { data: '0x1234' }, { cause: { data: { data: '0xabcd' } } }]) {
      expect(revertDataOf(err)).toBeDefined()
      expect(classifyRpcError(err)).toBe('execution')
    }
  })

  test('is depth-bounded exactly as classification is — a self-referential cause terminates', () => {
    expect(revertDataOf(selfReferentialError())).toBeUndefined()
  })

  test('a bare string error, null and undefined carry no data', () => {
    expect(revertDataOf('execution reverted')).toBeUndefined()
    expect(revertDataOf(null)).toBeUndefined()
    expect(revertDataOf(undefined)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// R2: reading a provider's DECLARED `eth_getLogs` cap.
//
// Every message below is a verbatim live capture from
// `__fixtures__/providerErrors.json` — not a hand-written approximation — so
// these tests fail if a provider's real phrasing drifts away from what the
// parser understands, which is the only drift that matters. The fixture is
// loaded as JSON rather than restated here for exactly that reason: the
// canary re-captures it against live endpoints (`canary/providers.test.ts`),
// and a re-capture that changes the wording must show up as a failure here.
// ---------------------------------------------------------------------------

describe('parseDeclaredCap — providers that state the window they would serve', () => {
  /** A viem-shaped error carrying a captured provider message, as `scanLogs` would catch it. */
  function capturedError(endpoint: keyof typeof providerErrors): Error {
    const err = new Error(providerErrors[endpoint].message)
    err.name = 'HttpRequestError'
    return err
  }

  test('blastapi: "up to a 10 block range" yields cap 10 and the suggested hex range', () => {
    const declared = parseDeclaredCap(capturedError('eth-mainnet.public.blastapi.io'))
    expect(declared.capBlocks).toBe(10n)
    expect(declared.retryRange).toEqual({ fromBlock: 0x187e655n, toBlock: 0x187e65en })
  })

  test('drpc: a result cap with a suggested range yields that range and its width as the cap', () => {
    // No "N block range" phrase at all here — the cap is DERIVED from the span the provider
    // volunteered, which is the only thing in the message that describes a window.
    const declared = parseDeclaredCap(capturedError('eth.drpc.org'))
    expect(declared.retryRange).toEqual({ fromBlock: 25_683_953n, toBlock: 25_685_027n })
    expect(declared.capBlocks).toBe(25_685_027n - 25_683_953n + 1n)
  })

  test('publicnode: an auth complaint declares nothing — the caller keeps its blind bisection', () => {
    // The third capture is a 403 about archive access. It is the control: a message with no window
    // in it must not produce one, or the scanner would jump to a fabricated cap.
    expect(parseDeclaredCap(capturedError('ethereum.publicnode.com'))).toEqual({})
  })

  test('alchemy-style phrasing without the "up to a" prefix still parses', () => {
    expect(parseDeclaredCap(new Error('Log response size exceeded. You can make eth_getLogs requests with a 10 block range.')).capBlocks).toBe(10n)
  })

  test('digit separators are tolerated in both shapes', () => {
    expect(parseDeclaredCap(new Error('up to a 10,000 block range')).capBlocks).toBe(10_000n)
    expect(parseDeclaredCap(new Error('retry with the range 1,000-2,000')).retryRange).toEqual({ fromBlock: 1_000n, toBlock: 2_000n })
  })

  test('the cap is read off a NESTED cause, not just the error handed over', () => {
    // viem wraps the provider's text one or two levels down as often as not; the parser rides the
    // same `cause` walker classification does, so depth costs it nothing.
    const inner = { message: 'You can make eth_getLogs requests with up to a 10 block range.' }
    expect(parseDeclaredCap(Object.assign(new Error('HTTP request failed.'), { cause: inner })).capBlocks).toBe(10n)
  })

  test('an ordinary failure declares nothing', () => {
    for (const err of [new Error('query returned more than 10000 results'), rateLimitHttpError(), timeoutError(), undefined, null, 'boom']) {
      expect(parseDeclaredCap(err)).toEqual({})
    }
  })

  test('the JSON viem echoes into its messages is not mistaken for a suggested range', () => {
    // Every capture embeds `Request body: {"method":"eth_getLogs","params":[{...}]}`, and a topics
    // filter embeds `["0x…","0x…"]`. Both are bracketed hex-adjacent text; neither is a suggestion.
    const err = new Error('HTTP request failed.\n\nRequest body: {"method":"eth_getLogs","params":[{"topics":["0xabc","0xdef"],"fromBlock":"0x1"}]}')
    expect(parseDeclaredCap(err)).toEqual({})
  })

  test('an inverted range is discarded rather than turned into a negative width', () => {
    expect(parseDeclaredCap(new Error('retry with the range 2000-1000'))).toEqual({})
  })
})
