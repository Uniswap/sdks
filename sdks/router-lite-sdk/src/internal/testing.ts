import type { Address, Hex, TypedDataDomain } from 'viem'
import { decodeFunctionData, encodeFunctionResult } from 'viem'

import { MULTICALL3_ABI } from './abis'

/**
 * The {@link PoolRef} constructors, re-exported under their test-facing names. A `PoolRef` carries
 * derived fields (`id`, `currencies`) that no test should ever spell out by hand, so test literals
 * go through these — a future change to the shape then touches `protocols/poolRef.ts` and nothing
 * else. `v4Ref` takes only the key: a v4 pool's id IS the hash of its key.
 */
export { v2PoolRef as v2Ref, v3PoolRef as v3Ref, v4PoolRef as v4Ref } from '../protocols/poolRef'

// `emptyReport`/`assertResultCoherent` live in `./resultCoherence`, not here, and are re-exported
// below for the many existing suites that import them from this file: they are the two symbols of
// this grab bag blessed onto `experimental/index.ts`, and this file is deliberately excluded from
// every build (`build.surface.test.ts` pins it), so they could not stay defined here without pulling
// the whole grab bag into `dist/` the moment `experimental/index.ts` re-exported them. See
// `resultCoherence.ts`'s own header for the full story.
export { assertResultCoherent, emptyReport } from './resultCoherence'

// ---------------------------------------------------------------------------
// Permit2 EIP-712 (R6).
//
// Restated here rather than imported from `@uniswap/permit2-sdk` for the same
// reason `integration/worldBuilder.ts` restates the pool math: a signature a
// test produces must be independent of any Uniswap library, or a wrong
// typed-data shape would be validated against an equally wrong one.
//
// INDEPENDENT, BUT NO LONGER UNCHECKED. It used to live as a literal inside
// `integration/readiness.fork.test.ts`, where nothing compared it to anything —
// a hand-transcription of a struct hash that, if wrong, produces a signature
// the real Permit2 rejects only on a fork run someone remembers to do.
// `permit2Types.parity.test.ts` asserts both of these against
// `AllowanceTransfer.getPermitData(...)` on every unit run, so the restatement
// is verified rather than merely intentional; the fork test imports these,
// signs with them, and the chain checks the result.
// ---------------------------------------------------------------------------

/**
 * Permit2's `PermitSingle` EIP-712 type set. Field order is load-bearing — it is hashed into the
 * struct type string — as are the `uint160`/`uint48` widths, which are Permit2's own packing, not
 * the `uint256`s an ERC-20 permit uses.
 */
export const PERMIT2_TYPES = {
  PermitDetails: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint160' },
    { name: 'expiration', type: 'uint48' },
    { name: 'nonce', type: 'uint48' },
  ],
  PermitSingle: [
    { name: 'details', type: 'PermitDetails' },
    { name: 'spender', type: 'address' },
    { name: 'sigDeadline', type: 'uint256' },
  ],
} as const

/**
 * Permit2's EIP-712 domain. NOTE THE ABSENCE OF `version` — Permit2's `DOMAIN_SEPARATOR` is built
 * from `(name, chainId, verifyingContract)` only, and adding the `version: '1'` that most EIP-712
 * domains carry changes the separator and produces a signature the contract rejects.
 */
export function permit2Domain(permit2: Address, chainId: number): TypedDataDomain {
  return { name: 'Permit2', chainId, verifyingContract: permit2 }
}

// ---------------------------------------------------------------------------
// Provider-failure shapes, as real transports actually throw them.
//
// These exist so the transport-vs-execution classifier
// (`internal/rpcErrors.ts#classifyRpcError`) is tested against the shapes it will
// really meet — a viem `HttpRequestError` carrying `status: 429`, a JSON-RPC
// rate-limit object nested as a `cause`, an undici `fetch failed` wrapping an
// `ECONNREFUSED` errno — rather than against a hand-rolled `Error('429')` that
// would keep passing even if the classifier only ever looked at message text.
//
// WHERE A FIXTURE'S DOCSTRING SAYS THE NESTING IS THE POINT, THE NESTING IS
// LOAD-BEARING: the evidence appears at the depth being claimed and NOWHERE
// ELSE, so a classifier that stopped walking the `cause` chain fails the test
// instead of passing off a duplicate copy of the same fact at depth 0.
// ---------------------------------------------------------------------------

/** A viem `HttpRequestError` for an HTTP 429, verbose message and `status` field included. */
export function rateLimitHttpError(): Error {
  const err = new Error(
    'HTTP request failed.\n\nStatus: 429\nURL: https://rpc.example.com/v2/key\nRequest body: {"method":"eth_call"}\n\nDetails: Too Many Requests\nVersion: viem@2.23.5',
  )
  err.name = 'HttpRequestError'
  return Object.assign(err, { status: 429, shortMessage: 'HTTP request failed.', details: 'Too Many Requests' })
}

/**
 * A JSON-RPC rate-limit error (`-32005`) as a provider returns it, nested the way viem wraps it.
 *
 * The code lives ONLY on the nested cause — viem's outer `RpcRequestError` message says nothing
 * about rate limits, and its own `code` is deliberately absent here so this fixture actually tests
 * the `cause` walk rather than a top-level copy of the same number.
 */
export function rateLimitRpcError(): Error {
  const err = new Error('RPC Request failed.\n\nURL: https://rpc.example.com/v2/key\n\nVersion: viem@2.23.5')
  err.name = 'RpcRequestError'
  return Object.assign(err, { cause: { code: -32005, message: 'daily request count exceeded' } })
}

/**
 * The C4-H1 shape: a load balancer routed this block-pinned `eth_call` to a node that does not have
 * the pinned block's state. geth's catch-all `-32000` with a node-state message — no revert data, no
 * transport signal, nothing that says "reverted" — which is exactly why it used to fall through to
 * the classifier's `execution` default and be counted as an on-chain refusal.
 */
export function headerNotFoundError(): Error {
  const err = new Error('RPC Request failed.\n\nURL: https://rpc.example.com/v2/key\n\nVersion: viem@2.23.5')
  err.name = 'RpcRequestError'
  return Object.assign(err, { cause: { code: -32000, message: 'header not found' } })
}

/** Alchemy's lagging-replica dialect, verbatim: the node names the head it actually has. */
export function nonexistentBlockError(): Error {
  return Object.assign(new Error('Nonexistent block: requested 21000002, latest 21000000'), { code: -32000 })
}

/**
 * Classification evidence at cause depth 2, and only there: both outer frames are bland. A
 * classifier that inspected only the error it was handed (or only one level of `cause`) sees nothing
 * at all and falls through to the `execution` default — silently turning a dropped socket into a
 * phantom on-chain refusal.
 */
export function deeplyNestedSocketError(): Error {
  const root = Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' })
  const middle = Object.assign(new Error('request failed'), { cause: root })
  return Object.assign(new Error('request failed'), { cause: middle })
}

/**
 * Revert data at `cause.data.data` — geth's error object, one level in — with nothing at depth 0.
 *
 * The nested message is deliberately node-state text, so the `data.data` walk is LOAD-BEARING rather
 * than vacuous: without it this classifies `unavailable` (the message tier), not `execution` by
 * default, and a classifier that stopped collecting nested revert data fails instead of coasting on
 * the fallthrough. It is also the real precedence claim — structured revert evidence outranks every
 * message dialect, however the node phrased itself around it.
 */
export function nestedRevertDataError(): Error {
  const inner = { data: { data: '0x08c379a0deadbeef' }, message: 'header not found' }
  return Object.assign(new Error('request failed'), { cause: inner })
}

/** An error whose `cause` is itself. Real (a retry wrapper that re-wraps its own error), and fatal
 * to any classifier that walks the chain without a depth bound. */
export function selfReferentialError(): Error {
  const err: Error & { cause?: unknown } = new Error('request failed')
  err.cause = err
  return err
}

/** A viem `TimeoutError` — the node never answered at all. */
export function timeoutError(): Error {
  const err = new Error('The request took too long to respond.\n\nURL: https://rpc.example.com/v2/key\n\nVersion: viem@2.23.5')
  err.name = 'TimeoutError'
  return err
}

/** An undici `fetch failed` wrapping a Node `ECONNREFUSED` errno, exactly as it arrives in practice. */
export function connectionRefusedError(): Error {
  const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8545'), { code: 'ECONNREFUSED' })
  return Object.assign(new TypeError('fetch failed'), { cause })
}

/**
 * viem's `ProviderDisconnectedError` — EIP-1193 code 4900, "disconnected from all chains".
 *
 * The two fixtures below only arise behind an injected/EIP-1193 transport (a wallet provider rather
 * than an HTTP URL), which is why they were absent from `TRANSPORT_ERROR_NAMES` until now. Neither
 * message carries a transport word and neither code is in `TRANSPORT_RPC_CODES`, so the CLASS NAME
 * is the entire signal: without the name in the set, both classify `execution` and a disconnected
 * wallet provider reports every candidate as an on-chain refusal.
 */
export function providerDisconnectedError(): Error {
  const err = new Error('The Provider is disconnected from all chains.\n\nVersion: viem@2.47.2')
  err.name = 'ProviderDisconnectedError'
  return Object.assign(err, { code: 4900, shortMessage: 'The Provider is disconnected from all chains.' })
}

/** viem's `ChainDisconnectedError` — EIP-1193 code 4901. See {@link providerDisconnectedError}. */
export function chainDisconnectedError(): Error {
  const err = new Error('The Provider is not connected to the requested chain.\n\nVersion: viem@2.47.2')
  err.name = 'ChainDisconnectedError'
  return Object.assign(err, { code: 4901, shortMessage: 'The Provider is not connected to the requested chain.' })
}

// ---------------------------------------------------------------------------
// The shared `aggregate3` envelope stub.
//
// FOUR TEST FILES GREW THEIR OWN, AND THEY DRIFTED. Some asserted
// `allowFailure` and the block tag and were loud about an unscripted inner
// call; others asserted neither and served an unscripted call as a clean
// revert, or asserted nothing at all. Every one of those is the same
// four-line decode of the same Call3[], and each divergence is a class of bug
// one file catches and the others wave through — which is the worst possible
// place for a fixture to disagree with itself, because the thing they are all
// fixtures FOR is a single shared function.
//
// So the envelope handling lives here once: decode, verify the two fields that
// change what the results MEAN, hand each inner call to the caller's own
// registry, and re-encode. What stays per-file is the registry — the answers
// are what each suite is actually about.
//
// A THROW IS NOT LOUD ENOUGH ON ITS OWN, which is why {@link takeStubViolations}
// exists. `internal/multicall.ts` catches everything an outer `eth_call` raises
// and coarsens it to a `TransportError` per slot (deliberately: an aggregator
// anomaly is not evidence about any inner call). So a stub that merely throws
// on a wiring mistake reports it as a plausible provider hiccup, and the test
// goes on to assert a tally that happens to be self-consistent. Violations are
// therefore recorded out-of-band as well, and drained by an `afterEach` in each
// file, which is what turns "the round asked something no test scripted" into a
// test failure rather than a transport statistic.
// ---------------------------------------------------------------------------

/**
 * A `NotEnoughLiquidity(bytes32 poolId)`-shaped custom-error revert — real revert data, so unlike a
 * data-less revert it must NEVER be treated as amount-independent (C4-H3). The exact bytes do not
 * matter to the classifier; only that `data` is non-empty and stays byte-identical across the suites
 * that assert on it.
 */
export const NOT_ENOUGH_LIQUIDITY_DATA: Hex = '0xf29b7f9800000000000000000000000000000000000000000000000000000000000001'

const stubViolationLog: string[] = []

/**
 * A breach of the stub's contract, as opposed to a scripted revert.
 *
 * IT IS A CLASS AND NOT A PLAIN `Error` BECAUSE {@link serveAggregate3} CATCHES. A `serve` callback
 * signals a scripted revert by throwing (that is the deployed contract's allowFailure behavior), so
 * the envelope loop has to catch — and a violation thrown from the same callback would be caught by
 * the same `catch` and turned into a tidy failed `Result`, which is EXACTLY the unscripted-reads-as-
 * reverted bug the loudness exists to kill, reintroduced one layer up. The class is what lets the
 * loop tell "this call is scripted to revert" from "this call is not scripted at all" and rethrow
 * only the second.
 */
class StubViolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StubViolationError'
    Object.setPrototypeOf(this, StubViolationError.prototype)
  }
}

/**
 * Records a stub-contract breach and throws it. `never`-returning so a call site reads as the
 * terminator it is. See the section header for why recording is not redundant with throwing.
 */
export function recordStubViolation(message: string): never {
  stubViolationLog.push(message)
  throw new StubViolationError(message)
}

/** Drains the recorded breaches. Call from an `afterEach` and assert it is empty. */
export function takeStubViolations(): string[] {
  return stubViolationLog.splice(0, stubViolationLog.length)
}

type ServeAggregate3Args = {
  /** The `eth_call` payload: `params[0].data`. Must decode as `aggregate3`. */
  data: Hex
  /** The `eth_call` block tag: `params[1]`. */
  blockTag: unknown
  /**
   * The block the round is pinned to. A round that pinned `latest`, or the wrong block, prices
   * against state no other call in the search saw — and every tally downstream would still add up.
   * `undefined` skips the check, for the (rare) stub that legitimately does not know it.
   */
  expectBlockNumber?: bigint | undefined
  /**
   * Answers one inner call. Return the raw success data; THROW to make it a failed `Result` — the
   * deployed contract's own `allowFailure` behavior, with a thrown error's `data` (when it has one)
   * becoming the failed slot's `returnData`, exactly as a real revert's bytes do.
   */
  serve: (target: string, callData: Hex) => Hex
  /** Called once per envelope, before anything is served, with what it carried. */
  onEnvelope?: (inner: readonly { target: string; callData: Hex }[]) => void
}

/**
 * Serves one `aggregate3` envelope the way the deployed contract does, verifying the two things
 * about it that change what its results mean:
 *
 *  - `allowFailure` on every `Call3`. False makes ONE inner revert take down the whole envelope, so
 *    every per-call revert a suite scripts would arrive as an outer transport failure instead —
 *    which several of these suites assert the tallies of.
 *  - the outer call's block tag, against the block the round was asked for.
 *
 * Both are {@link recordStubViolation}s rather than plain throws, per the section header.
 */
export function serveAggregate3(args: ServeAggregate3Args): Hex {
  const { data, blockTag, expectBlockNumber, serve, onEnvelope } = args
  const decoded = decodeFunctionData({ abi: MULTICALL3_ABI, data })
  if (decoded.functionName !== 'aggregate3') recordStubViolation(`aggregate3 stub: unexpected function ${decoded.functionName}`)
  const inner = decoded.args[0] as readonly { target: Address; allowFailure: boolean; callData: Hex }[]

  if (expectBlockNumber !== undefined) {
    const expected = `0x${expectBlockNumber.toString(16)}`
    if (blockTag !== expected) {
      recordStubViolation(`aggregate3 stub: envelope sent at blockTag ${String(blockTag)}, expected ${expected}`)
    }
  }
  onEnvelope?.(inner.map((c) => ({ target: c.target.toLowerCase(), callData: c.callData })))

  const results = inner.map((c) => {
    if (!c.allowFailure) recordStubViolation('aggregate3 stub: envelope arrived without allowFailure')
    try {
      return { success: true as const, returnData: evenBytes(serve(c.target.toLowerCase(), c.callData)) }
    } catch (err) {
      // A violation is not a revert — see {@link StubViolationError}.
      if (err instanceof StubViolationError) throw err
      const revertData = (err as { data?: unknown }).data
      return { success: false as const, returnData: typeof revertData === 'string' ? evenBytes(revertData as Hex) : '0x' }
    }
  })
  return encodeFunctionResult({ abi: MULTICALL3_ABI, functionName: 'aggregate3', result: results })
}

/**
 * Left-pads an odd-nibbled hex string to whole bytes.
 *
 * Some suites answer quotes with a bare `toHex(amountOut)`, which is odd-nibbled for most values —
 * fine verbatim over the wire, but an ABI `bytes` must be whole bytes, and viem would RIGHT-pad an
 * odd value (turning `0x1f4` into `0x1f40`: 500 into 8000). Left-padding preserves a
 * `BigInt(returnData)` decode exactly.
 */
function evenBytes(h: Hex): Hex {
  return h.length % 2 === 0 ? h : (`0x0${h.slice(2)}` as Hex)
}
