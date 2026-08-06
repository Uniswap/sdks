import { describe, expect, test } from 'bun:test'
import * as viem from 'viem'
import type { Hex } from 'viem'

import providerErrors from './__fixtures__/providerErrors.json'
import { classifyRpcError, parseDeclaredCap, revertDataOf } from './rpcErrors'
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
// The transport-vs-execution seam, at the parser. A revert is the node
// answering authoritatively about the chain; a 429/timeout/dead socket is the
// provider answering about itself. Conflating them is what let a partial
// provider outage be reported as a *confident* `no-route` (FW2), so every
// dialect this package has met is pinned below in both directions — plus the
// two other readings taken off the same cause-chain walk: the revert bytes
// (`revertDataOf`) and the window a provider declares it would have served
// (`parseDeclaredCap`).
//
// What `ethCall` then DOES with a verdict — the `TransportError`/
// `NodeStateError` wrapping the quoting and verification stages count on — is
// pinned next door in `rpc.test.ts`.
// ---------------------------------------------------------------------------

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
    // drpc's wording for the same result cap as the two above, verbatim from the live capture. It
    // matched no dialect until `providerConformance.test.ts` rebuilt that capture faithfully (no
    // hand-pinned `HttpRequestError`, no status) and caught it defaulting to `execution` — an EVM
    // verdict invented for an `eth_getLogs` the EVM never saw. `-32602` cannot be the discriminator:
    // publicnode's archive-paywall capture carries the same code for an unrelated failure.
    'query exceeds max results 20000, retry with the range 25683953-25685027',
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

  // -------------------------------------------------------------------------
  // quicknode's span cap, both transports (live captures).
  //
  // The BATCHED shape is the one this fixes and the one that mattered: HTTP
  // 200, no status, no viem transport class, `-32614` on the cause, and a
  // sentence that matched none of the three message dialects — so it defaulted
  // to `execution`, i.e. "the EVM rejected this", about a request no EVM ever
  // saw. Two independent rules now catch it (the code and the phrasing), which
  // is deliberate: either alone would be enough, and a provider that drops one
  // of the two must not silently fall back to the default.
  // -------------------------------------------------------------------------
  test('quicknode -32614 with no HTTP status classifies unavailable, not execution', () => {
    const batched = Object.assign(new Error('RPC Request failed.'), {
      name: 'RpcRequestError',
      cause: { code: -32614, message: 'eth_getLogs is limited to a 10,000 range' },
    })
    expect(classifyRpcError(batched)).toBe('unavailable')
  })

  test('the code alone is enough, and the phrasing alone is enough', () => {
    expect(classifyRpcError({ code: -32614, message: 'nope' })).toBe('unavailable')
    expect(classifyRpcError(new Error('eth_getLogs is limited to a 10,000 range'))).toBe('unavailable')
  })

  test('the unbatched capture stays transport (HTTP 413) — both are "no evidence about the chain"', () => {
    // Not `unavailable`, and that is correct rather than a gap: the structured HTTP-status tier runs
    // first and 413 IS a transport-level refusal. `logScan`'s expensive-refusal fast path and every
    // report axis treat the two identically; only a diagnostic can tell them apart.
    const unbatched = Object.assign(new Error(providerErrors['base-mainnet.quiknode.pro (unbatched)'].message), {
      name: 'HttpRequestError',
      status: 413,
    })
    expect(classifyRpcError(unbatched)).toBe('transport')
  })

  test('"limited to" prose without a numbered range is NOT node-state', () => {
    expect(classifyRpcError(new Error('this key is limited to the free tier'))).toBe('execution')
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

  // -------------------------------------------------------------------------
  // quicknode says it WITHOUT the word "block" — the miss that cost Base.
  //
  // "eth_getLogs is limited to a 10,000 range" states the cap as plainly as
  // blastapi's "up to a 10 block range" does, and the original pattern (which
  // required the literal `block range`) matched neither shape it arrives in.
  // Both are captured live, from the same request, through the two transports
  // that deliver it differently.
  // -------------------------------------------------------------------------
  const QUICKNODE_CAPTURES = [
    'base-mainnet.quiknode.pro (unbatched)', // an HTTP 413 whose body carries the JSON-RPC error
    'base-mainnet.quiknode.pro (batched)', //   an HTTP 200 with the text on the RpcRequestError
  ] as const
  for (const endpoint of QUICKNODE_CAPTURES) {
    test(`quicknode Base, ${endpoint}: the stated 10,000 is read as the cap`, () => {
      const declared = parseDeclaredCap(capturedError(endpoint))
      expect(declared.capBlocks).toBe(10_000n)
      // No range is suggested in either shape, and none may be invented: `logScan` uses only a
      // declared WIDTH, but a fabricated `retryRange` would still be a lie in a diagnostic.
      expect(declared.retryRange).toBeUndefined()
    })
  }

  const LIMITED_TO_PHRASINGS: [string, bigint][] = [
    ['eth_getLogs is limited to a 10,000 range', 10_000n],
    ['eth_getLogs is limited to a 10000 range', 10_000n],
    ['is limited to an 800 range', 800n],
    ['limited to a 2,000 block range', 2_000n],
  ]
  for (const [message, expected] of LIMITED_TO_PHRASINGS) {
    test(`"${message}" parses as ${expected}`, () => {
      expect(parseDeclaredCap(new Error(message)).capBlocks).toBe(expected)
    })
  }

  // -------------------------------------------------------------------------
  // capKind: a stated block count is not always a POLICY.
  //
  // This is the distinction that keeps `logScan`'s ceiling clamp from being a
  // catastrophe on the provider it was NOT developed against. Both endpoints
  // below say "10,000"; only one of them means it.
  // -------------------------------------------------------------------------
  test('quicknode states a bare span policy: capKind is "span"', () => {
    for (const endpoint of QUICKNODE_CAPTURES) {
      const declared = parseDeclaredCap(capturedError(endpoint))
      expect(declared.capBlocks).toBe(10_000n)
      expect(declared.capKind).toBe('span')
    }
  })

  test('alchemy states 10,000 AND offers an 8M-block retry range: capKind is "density"', () => {
    // The regression this exists for, in one assertion. Alchemy's response-size refusal names a
    // 10,000-block range as one of two modes and then suggests ~8,000,000 blocks for the SAME query.
    // Treating that 10,000 as a ceiling pins every mainnet scan 800x too narrow, permanently, on an
    // endpoint that serves 13M-block windows.
    const declared = parseDeclaredCap(capturedError('eth-mainnet.g.alchemy.com'))
    expect(declared.capBlocks).toBe(10_000n)
    expect(declared.capKind).toBe('density')
    expect(declared.retryRange).toEqual({ fromBlock: 0x93e08cn, toBlock: 0x10df28an })
    // ...and the range it suggested really is enormously wider than the number it quoted.
    const suggested = declared.retryRange!.toBlock - declared.retryRange!.fromBlock + 1n
    expect(suggested).toBeGreaterThan(declared.capBlocks! * 100n)
  })

  test('drpc and blastapi — anything volunteering a retry range — are "density" too', () => {
    // Conservative by construction: a suggested range describes THIS query's data, so the doubt goes
    // to `density`. Misfiling a policy as density costs one probe per regrowth cycle; misfiling
    // density as policy costs the whole scan, permanently.
    expect(parseDeclaredCap(capturedError('eth.drpc.org')).capKind).toBe('density')
    expect(parseDeclaredCap(capturedError('eth-mainnet.public.blastapi.io')).capKind).toBe('density')
  })

  test('response-size language alone makes a cap "density", with no retry range in sight', () => {
    expect(parseDeclaredCap(new Error('Log response size exceeded. Use up to a 10,000 block range.')).capKind).toBe('density')
    expect(parseDeclaredCap(new Error('query returned more than 10000 results; use a 500 block range')).capKind).toBe('density')
    expect(parseDeclaredCap(new Error('eth_getLogs is limited to a 10,000 range')).capKind).toBe('span')
  })

  test('capKind is absent when no cap was declared at all', () => {
    expect(parseDeclaredCap(new Error('boom')).capKind).toBeUndefined()
    expect(parseDeclaredCap(capturedError('ethereum.publicnode.com')).capKind).toBeUndefined()
  })

  test('"limited to" without a number and a range is not a declared cap', () => {
    // The pattern is anchored on BOTH a digit run and the word `range`, so ordinary prose that
    // merely says something is limited cannot fabricate a window for the scanner to jump to.
    for (const m of ['this account is limited to the free tier', 'limited to 5 requests per second', 'range limited']) {
      expect(parseDeclaredCap(new Error(m)).capBlocks).toBeUndefined()
    }
  })
})

// ---------------------------------------------------------------------------
// R1 follow-up: the one shape where `hasRevertData` and `revertData` disagree.
//
// `collectFacts` treats a zero-length `'0x'` as revert EVIDENCE at the nested
// `data.data` position (geth's error object, where it genuinely means "reverted,
// no reason") but not at the top level. `revertData` applies the `.length > 2`
// rule uniformly at both. The asymmetry is inherited from the pre-R1 code and
// deliberately preserved rather than tidied — but "deliberately preserved" is
// only true if something notices when it changes, hence these.
// ---------------------------------------------------------------------------

describe("the zero-length '0x' asymmetry between classification and extraction", () => {
  test("nested `cause.data.data === '0x'` IS revert evidence, and yields no payload", () => {
    // A transport-worded message is the discriminator: without `hasRevertData` this would fall to
    // the message tier and classify `transport`. It classifies `execution`, so the bare '0x' at the
    // nested position is doing the work — and `revertDataOf` still reports nothing to decode.
    const err = { cause: { data: { data: '0x' }, message: 'connection reset' } }
    expect(classifyRpcError(err)).toBe('execution')
    expect(revertDataOf(err)).toBeUndefined()
  })

  test("top-level `data === '0x'` is NOT revert evidence — the message tier decides", () => {
    // The other side of the asymmetry. Same bare '0x', top-level position, same transport wording:
    // classification falls through to the message tier and reads `transport`.
    const err = { data: '0x', message: 'connection reset' }
    expect(classifyRpcError(err)).toBe('transport')
    expect(revertDataOf(err)).toBeUndefined()
  })

  test('non-empty payload is revert evidence at EITHER position — no asymmetry there', () => {
    for (const err of [{ data: '0x1234', message: 'connection reset' }, { cause: { data: { data: '0x1234' }, message: 'connection reset' } }]) {
      expect(classifyRpcError(err)).toBe('execution')
      expect(revertDataOf(err)).toBe('0x1234')
    }
  })
})
