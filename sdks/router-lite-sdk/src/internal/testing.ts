import type { Address, TypedDataDomain } from 'viem'
import { zeroHash } from 'viem'

import { PREFLIGHT_TOP_K } from '../constants'
import { WAVE_COUNT } from '../search/waves'
import type { BlockRef, Protocol, QuoteResult, ReasonCode, SearchReport, SwapResult } from '../types'
import { protocolRecord } from '../types'

/**
 * The {@link PoolRef} constructors, re-exported under their test-facing names. A `PoolRef` carries
 * derived fields (`id`, `currencies`) that no test should ever spell out by hand, so test literals
 * go through these — a future change to the shape then touches `protocols/poolRef.ts` and nothing
 * else. `v4Ref` takes only the key: a v4 pool's id IS the hash of its key.
 */
export { v2PoolRef as v2Ref, v3PoolRef as v3Ref, v4PoolRef as v4Ref } from '../protocols/poolRef'

const ZERO_BLOCK: BlockRef = {
  number: 0n,
  hash: zeroHash,
  timestamp: 0n,
}

/**
 * An all-zero, all-disabled {@link SearchReport} — the starting point for tests that need a report
 * but aren't exercising discovery/quoting behavior themselves.
 */
export function emptyReport(): SearchReport {
  return {
    block: ZERO_BLOCK,
    discovery: protocolRecord<SearchReport['discovery'][Protocol]>(() => ({ status: 'disabled', coveredRanges: [] })),
    enumeration: {
      exhaustiveWithinMaxHops: false,
      intermediatesDiscovered: 0,
      intermediatesSelected: 0,
      candidatesGenerated: 0,
      poolsPruned: 0,
      candidatesPruned: 0,
      intermediatesPruned: 0,
    },
    quoting: { attempted: 0, succeeded: 0, failed: 0, transportFailed: 0, unattempted: 0 },
    aborted: false,
    verificationDegraded: false,
    headRegressed: false,
    verification: { preflightAttempted: 0, preflightBudgetExhausted: false },
  }
}

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
// (`internal/rpc.ts#classifyRpcError`) is tested against the shapes it will
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

/**
 * The `ReasonCode`s legal on an `inconclusive` result (C4-P5, F5) — the mirror image of `no-route`'s
 * whitelist (`no-viable-route`/`no-route-verified`) below: those two claim the search COMPLETED,
 * which directly contradicts every incompleteness axis `inconclusive` requires, so they may never
 * appear here and everything else may.
 */
const INCONCLUSIVE_REASON_CODES: ReadonlySet<ReasonCode> = new Set([
  'rpc-unavailable',
  'rpc-degraded',
  'aborted',
  'discovery-incomplete',
  'quotes-unattempted',
])

/**
 * The honesty invariants, mechanically enforced everywhere: every result carries its search report
 * and its `alternatives` (an empty array is an answer, not an absent field); a `ready` result really
 * was verified at the reported block, and says so on the very route it leads with, as does
 * `needs-action` on its own; `needs-action` always carries both requirements and a tx; `no-route`
 * never follows an incomplete or aborted search — nor one that lost calls to the transport, nor one
 * that ran against a head the router had already been past, both of which are evidence about the
 * provider and none about the chain; `inconclusive` always has a set
 * incompleteness axis, never carries calldata for a route it does not also name, and never leads
 * with a route the chain authoritatively rejected; a quote's routes carry nothing beyond the quote
 * and its ranking, and a quote whose `best` is outpriced by one of its own `alternatives` says on
 * the route WHY (`promotedOverComplex`) rather than looking like a broken sort;
 * and quoting stats always add up. Every test in Tasks 12, 17, 18, and the fork/canary suites that
 * produces a result MUST pass it through this — a classification bug then fails tests that were
 * checking something else entirely.
 */
export function assertResultCoherent(r: QuoteResult | SwapResult): void {
  // Status-agnostic fields, checked status-agnostically: no variant may omit them.
  if (!Array.isArray(r.alternatives)) throw new Error(`${r.status} without an alternatives array`)
  if (r.status === 'quote') {
    // Quoting verifies nothing, so a quote's routes are plain `QuotedRoute`s. The engine's own
    // routes travel with `execution`/`revertData`; handing one straight through would ship keys the
    // declared type says do not exist (and that a caller would then start depending on).
    // `promotedOverComplex` is declared ON `QuotedRoute` and so is not one of them — it is a fact
    // about the ranking, which quoting does perform, and the check below is why it has to survive.
    for (const route of [r.best, ...r.alternatives]) {
      const extra = Object.keys(route).filter((k) => k !== 'route' && k !== 'quote' && k !== 'promotedOverComplex')
      if (extra.length > 0) throw new Error(`quote result carries non-quote route fields: ${extra.join(', ')}`)
    }
    // THE RANKING INVARIANT, AND THE ONE SANCTIONED EXCEPTION TO IT. A quote's `best` is the top of a
    // list ordered by `amountOut` descending, so a listed alternative pricing ABOVE it is either a
    // sort bug or `rankRoutes`' simplicity margin (`SIMPLICITY_MARGIN_BPS`) — and those two are
    // indistinguishable to a caller unless the promotion says so on the route itself. Live on Base
    // this shipped as the second: `best` at 1,906.256081 USDC above `alternatives[0]` at
    // 1,906.567949 from a hooked v4 pool, correct ranking rendered as a broken one, because
    // `toQuoted` had rebuilt `best` without its marker. An inversion is legal; an UNMARKED
    // inversion is the bug, and it is checked here rather than in one test so that every result any
    // suite produces has to be honest about it.
    //
    // Only the QUOTE union is checked. A swap's leader may legitimately price below an alternative
    // with no promotion involved at all — `verifyLeader` walks the ranked list and stops at the
    // first candidate that SIMULATES, so any higher-priced candidate it passed over is sitting in
    // `alternatives` as `'failed'`/`'unverified'`, which is verification demoting a route rather
    // than ranking mis-ordering one.
    const outpriced = r.alternatives.find((alt) => alt.quote.amountOut > r.best.quote.amountOut)
    if (outpriced !== undefined && r.best.promotedOverComplex !== true) {
      throw new Error(
        `quote best (${r.best.quote.amountOut}) is outpriced by an alternative (${outpriced.quote.amountOut}) ` +
          'without promotedOverComplex to explain it',
      )
    }
  }
  if (r.status === 'ready') {
    if (!r.tx || r.execution.verifiedAtBlock.number !== r.search.block.number)
      throw new Error('ready without at-block verification')
    // `ready` is a promise about *this* route's simulation, so the route itself must say it was
    // verified — a `ready` leading an `unverified`/`failed` route is the exact lie the status denies.
    if (r.best.execution !== 'verified') throw new Error(`ready whose best route is ${r.best.execution}`)
    // C4-P7: `limits` echoes the compiled plan's own on-chain assertions — a `ready` result without
    // it is calldata the caller cannot cross-check against anything.
    if (!r.limits) throw new Error('ready without compiled limits')
  }
  if (r.status === 'needs-action') {
    if (r.requirements.length === 0 || !r.tx) throw new Error('needs-action without requirements+tx')
    // The twin of `ready`'s check: the route this status leads with is the one whose execution was
    // short-circuited by those requirements, and it must say so rather than claim (say) `'verified'`.
    if (r.best.execution !== 'needs-action') throw new Error(`needs-action whose best route is ${r.best.execution}`)
    // `needs-action` is a promise that this list is what stands between the trader and the swap. A
    // readiness read that never landed makes the list incomplete, so the promise cannot be made.
    if (r.search.verificationDegraded) throw new Error('needs-action off degraded verification')
    if (!r.limits) throw new Error('needs-action without compiled limits')
  }
  if (r.status === 'no-route') {
    for (const [p, d] of Object.entries(r.search.discovery))
      if (d.status !== 'complete' && d.status !== 'disabled')
        throw new Error(`no-route with ${p} discovery ${d.status}`)
    if (r.search.aborted) throw new Error('no-route despite abort')
    // The FW2 invariant: a quote that never got an answer, or a verification that could not be
    // carried out, is evidence about the provider and none about the chain. Either one forfeits the
    // right to an authoritative "there is no route".
    if (r.search.quoting.transportFailed > 0) throw new Error('no-route despite transport-failed quotes')
    if (r.search.verificationDegraded) throw new Error('no-route despite degraded verification')
    // The quiet sibling of the two above (C4-H1): nothing failed, but the whole search ran against a
    // head this router had already been past, so none of its answers describe the current chain.
    if (r.search.headRegressed) throw new Error('no-route despite a regressed head')
    // A completed search only ever names one of the two "nothing verified" codes (C4-P5) — never an
    // incompleteness code, which would contradict every check just above.
    if (r.reason.code !== 'no-viable-route' && r.reason.code !== 'no-route-verified')
      throw new Error(`no-route with unexpected reason code '${r.reason.code}'`)
  }
  if (r.status === 'inconclusive') {
    const incomplete =
      r.search.aborted ||
      Object.values(r.search.discovery).some((d) => d.status === 'partial' || d.status === 'failed') ||
      r.search.quoting.unattempted > 0 ||
      r.search.quoting.transportFailed > 0 ||
      r.search.verificationDegraded ||
      r.search.headRegressed
    if (!incomplete) throw new Error('inconclusive with no incompleteness axis set')
    // Carrying what the search *did* find is the point of this status (an aborted search hands back
    // its leader and calldata rather than discarding them) — but calldata for an unnamed route is
    // not salvage, it is a dangling reference. `'tx' in r` is the QuoteResult/SwapResult seam, not a
    // per-variant probe: quotes have no transactions at all.
    if ('tx' in r && r.tx !== undefined && r.best === undefined) throw new Error('inconclusive with a tx but no best route')
    // A route the chain rejected is never offered as the lead, whatever else the search failed to
    // finish: `execution: 'failed'` is authoritative on its own, so such a candidate belongs in
    // `alternatives` (with its `revertData`) exactly as it would on the completed `no-route` path.
    // `'best' in r` is the QuoteResult/SwapResult seam (a quote's `inconclusive` has no leader to
    // carry at all — see `types.ts`); the inner `in` is because a quote route has no `execution`.
    if ('best' in r && r.best !== undefined && 'execution' in r.best && r.best.execution === 'failed')
      throw new Error('inconclusive led by a route that authoritatively failed preflight')
    // C4-P5: `reason.code` is not free-form — each incompleteness code names a specific axis, and the
    // axis it names must actually be set. A mismatch here is a classifier bug (the wrong code for the
    // wrong reason), not a legitimate result shape.
    const { code } = r.reason
    if (code === 'aborted' && !r.search.aborted) throw new Error(`reason code 'aborted' without search.aborted set`)
    if (
      code === 'rpc-degraded' &&
      !(r.search.quoting.transportFailed > 0 || r.search.verificationDegraded || r.search.headRegressed)
    ) {
      throw new Error(`reason code 'rpc-degraded' without a transport/verification/head-regression axis set`)
    }
    if (
      code === 'discovery-incomplete' &&
      !Object.values(r.search.discovery).some((d) => d.status === 'partial' || d.status === 'failed')
    ) {
      throw new Error(`reason code 'discovery-incomplete' without any protocol's discovery partial/failed`)
    }
    if (code === 'quotes-unattempted' && !(r.search.quoting.unattempted > 0))
      throw new Error(`reason code 'quotes-unattempted' without unattempted quotes`)
    // `rpc-unavailable` is only ever built from `buildOutageReport` (`router.ts`), whose all-zero
    // report never pinned a real block — a total outage before the first RPC, not just an incomplete
    // search.
    if (code === 'rpc-unavailable' && r.search.block.number !== 0n)
      throw new Error(`reason code 'rpc-unavailable' with a non-zero pinned block`)
    // F5: the mirror of `no-route`'s whitelist above. Without this, a classifier bug that leaked
    // `no-viable-route`/`no-route-verified` onto an `inconclusive` result passed every per-code axis
    // check above (neither code has one) and was invisible here.
    if (!INCONCLUSIVE_REASON_CODES.has(code)) throw new Error(`inconclusive with unexpected reason code '${code}'`)
  }
  const q = r.search.quoting
  if (q.attempted !== q.succeeded + q.failed + q.transportFailed) throw new Error('quoting stats do not add up')

  // THE CONSERVATION INVARIANT — every candidate the enumeration built is accounted for by exactly
  // one quoting outcome, and nothing is accounted for that was never built.
  //
  // WHY IT IS TWO BOUNDS AND NOT ONE EQUALITY, WHICH IS THE WHOLE SUBTLETY. The tempting statement is
  // `candidatesGenerated === attempted + unattempted`, and it is FALSE by design: three channels feed
  // `quoting` and only two of them feed `candidatesGenerated` (see `types.ts#SearchReport.quoting`).
  // `search/waves.ts#runDiscoveryProbes` quotes single-leg, HALF-PAIR existence checks — `tokenIn ->
  // core`, `neighbor -> tokenOut` — which are not routes, can never become routes, and are counted in
  // `attempted`/`succeeded`/`failed`/`transportFailed` ONLY. So the exact identity is
  //
  //     candidatesGenerated === attempted + unattempted - (discovery-probe calls)
  //
  // and the report deliberately carries no discovery-probe term (it is not a candidate count, and
  // adding one to the public surface to make an assertion tidy would be the tail wagging the dog).
  // What survives the elimination of that unknown non-negative term is the pair of bounds below, and
  // between them they pin every accounting site that exists:
  //
  //   * `unattempted <= candidatesGenerated` — an unattempted quote IS a generated candidate that
  //     never got dispatched, so the two route-bearing channels can only ever move `unattempted` up
  //     in lockstep with `candidatesGenerated`. This is also what keeps `runDiscoveryProbes` honest
  //     about staying OUT of `unattempted`: the moment a half-pair probe skipped by an abort were
  //     counted there, `unattempted` could exceed a `candidatesGenerated` that never saw it, and the
  //     `'quotes-unattempted'` reason code would start claiming candidates that do not exist.
  //   * `candidatesGenerated <= attempted + unattempted` — the leak-catcher, and the one the
  //     `runRouteProbes` bug tripped: that function counted `candidatesGenerated += fresh.length` and
  //     then only `attempted`, so an abort that skipped queued probes (`quote/quote.ts` returns
  //     `attempted < probes.length` on `AbortedCallError`) silently dropped the difference — a report
  //     claiming N candidates and accounting for fewer than N outcomes, with no field saying where
  //     the rest went. Equality holds exactly when no discovery probe was dispatched.
  const cg = r.search.enumeration.candidatesGenerated
  if (q.unattempted > cg) {
    throw new Error(`unattempted quotes (${q.unattempted}) exceed candidatesGenerated (${cg}) — unattempted counts candidates`)
  }
  if (cg > q.attempted + q.unattempted) {
    throw new Error(
      `candidatesGenerated (${cg}) exceeds attempted + unattempted (${q.attempted} + ${q.unattempted}) — ` +
        `${cg - q.attempted - q.unattempted} generated candidate(s) are unaccounted for`,
    )
  }

  // C4-P7: `verifyLeader` spends at most `PREFLIGHT_TOP_K` real simulations per wave, and the engine
  // runs at most `WAVE_COUNT` waves — so a per-search cumulative total above that product is not a
  // report of legitimate work, it is a bug in how `preflightAttempted` is accumulated (e.g. double
  // counting across waves, or a stray increment outside `verifyLeader`'s own budgeted loop).
  const v = r.search.verification
  if (v.preflightAttempted > PREFLIGHT_TOP_K * WAVE_COUNT) {
    throw new Error(
      `preflightAttempted (${v.preflightAttempted}) exceeds PREFLIGHT_TOP_K * WAVE_COUNT (${PREFLIGHT_TOP_K * WAVE_COUNT})`,
    )
  }
  if (v.preflightAttempted < 0) throw new Error('preflightAttempted must not be negative')
}
