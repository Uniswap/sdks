import type { Address, Hex, Log, PublicClient, TransactionReceipt } from 'viem'
import { isAddress, isAddressEqual, zeroHash } from 'viem'

import {
  DEFAULT_CONCURRENCY,
  isUnusableCustodyAddress,
  MAX_AMOUNT_IN,
  MAX_CONCURRENCY,
  MAX_DEADLINE_SECONDS,
  MAX_HINTS_PER_REQUEST,
  MAX_PERMIT2_UINT48,
  MAX_PERMIT2_UINT160,
  maxPlausibleHeadRegression,
  MIN_CHUNK,
} from './constants'
import { RouterConfigError, RpcUnavailableError } from './errors'
import { sameFamily } from './internal/currency'
import { MULTICALL3_ADDRESS } from './internal/multicall'
import { createSemaphore } from './internal/rpc'
import { assertChainData, assertWrappedNativeConsistency, requireExecution, reorgOverlapBlocksOf, validateManifest } from './manifest'
import { PoolIndex } from './pools/poolIndex'
import type { PoolIndexStats } from './pools/poolIndex'
import { PROTOCOL_MODULES } from './protocols'
import { deploymentBlockOf } from './search/context'
import { assertHintAddresses, buildHookData } from './search/hookData'
import type { HeadWatermark, InternalResult, SearchContext } from './search/waves'
import { fetchBlock, searchWaves } from './search/waves'
import type {
  BlockRef,
  ChainManifest,
  EthCall,
  PoolHint,
  PoolRecord,
  Protocol,
  QuoteRequest,
  QuoteResult,
  QuotedRoute,
  Reason,
  SearchReport,
  SwapRequest,
  SwapResult,
  UniversalRouterDeployment,
} from './types'
import { protocolRecord, PROTOCOLS, zeroQuoting, zeroReportEnumeration, zeroVerification } from './types'

// ---------------------------------------------------------------------------
// The public router facade — the only layer callers touch. Its whole job is
// three things the wave engine (Task 17) deliberately does not do:
//
//  1. Reject malformed requests before any RPC (`RouterConfigError`), and
//     validate the manifest against the connected client exactly once.
//  2. Decide *when* a lazy `searchWaves` generator has said enough: a promise
//     caller (`getQuote`/`getSwap`) stops at the first actionable event, an
//     iterator caller (`quotes`/`swaps`) is handed every event.
//  3. Map the engine's internal vocabulary (`InternalResult`, whose `best` is
//     only ever a hint about *ranking*) onto the public result union, whose
//     variants are promises about *what the caller may safely do*.
//
// One `PoolIndex` is held per router instance — it is the thing that makes a
// second search over the same pair cheap (cached pools, cached scan
// coverage). `hookData` is the opposite: it can depend on the trade's amount
// and direction, so it is never stored on the index, only ever built fresh,
// per call, from that call's own `req.hints`.
//
// C4-H5: THAT INDEX HAS NO LIFETIME OF ITS OWN SHORT OF THE PROCESS. Every
// pool/adjacency/coverage entry it ever learns is permanent for as long as the
// router instance is (see `pools/poolIndex.ts`'s header for the measured
// cost), and until now there was no way to observe that growth, bound it, or
// hand a pre-warmed index to a router that did not build it. `stats()`,
// `clearIndex()`, `CreateRouterOptions.index` (injection), and
// `CreateRouterOptions.maxPools` (bounded mode) exist to give a long-running
// host those three levers without changing anything about a caller who never
// touches them — the zero-config path stays exactly as unbounded as before.
// ---------------------------------------------------------------------------

/**
 * Identical in shape to `PoolIndex.stats()` (see `pools/poolIndex.ts` for what each field means) —
 * named separately because `PoolIndex` itself is an `experimental`-only export, while `RouterStats`
 * is the type callers see directly off the stable `router.stats()`.
 */
export type RouterStats = PoolIndexStats

export type CreateRouterOptions = {
  client: PublicClient
  manifest: ChainManifest
  /**
   * Inject a pre-built `PoolIndex` instead of letting `createRouter` allocate a fresh, empty one —
   * for a host that owns an index's lifetime independently of any one router instance: build it via
   * one router's `ingestLogs`/`ingestReceipt`/searches, then hand it to a freshly created router
   * (perhaps after a deploy, or a config change that only affects unrelated fields) with zero
   * re-scanning — the "warm handoff" case. Validated once, synchronously, before any RPC, on two
   * fields — both chain facts the index was BUILT with and cannot be re-derived from afterward:
   * `index.wrappedNative` must equal `manifest.wrappedNative` (an index built against a
   * different wrapped-native address would silently collapse native-family adjacency onto the wrong
   * graph node for every search that follows), and `index.reorgOverlapBlocks` must equal the
   * manifest's (C4-P1 — an index whose coverage cache maintained a 32-block tip cannot be trusted by
   * a router that believes the chain rewinds deeper than that, and the disagreement is invisible at
   * every later call site). Either mismatch throws `RouterConfigError` immediately.
   * `PoolIndex` is exported from `@uniswap/router-lite-sdk/experimental`. Ignored together with
   * `maxPools` below when supplied — an injected index keeps whatever bound (if any) it was
   * constructed with; this router does not second-guess it.
   */
  index?: PoolIndex
  /**
   * Bound the index THIS ROUTER allocates to at most this many distinct pools (default: unbounded,
   * matching every version before this option existed). When set, a pool inserted beyond the cap
   * evicts the least-recently-TOUCHED pool first (touch = an upsert, a successful quote, a failed
   * quote, OR being selected as a route leg during candidate enumeration — a pool alive only as a
   * two-hop intermediate is touched too, not just ones a quote resolves) — except a pool touched at
   * the same block as the one that pushed the index over the cap, which is never evicted no matter
   * how far over that leaves it; see `pools/poolIndex.ts`'s `evictIfNeeded` for the exact rule. A
   * discredited hint (one the chain has already contradicted `HINT_DISCREDIT_FAILURE_BLOCKS` times —
   * see `isDiscredited`) is the LAST thing evicted, not an ordinary candidate: its record is tiny and
   * its accumulated failure history is the one thing worth paying to keep, since evicting it would let
   * a caller resubmit the same junk hint and get it back at full, un-discredited rank. Bounding memory
   * this way means a long-tail pair that was useful once and never again eventually stops being free
   * to remember — see the README's "PoolIndex lifecycle" section for the tradeoff. Ignored when
   * `index` is supplied.
   */
  maxPools?: number
  /**
   * Bounds how many `client.request` calls this router may have in flight AT ONCE, across every
   * concurrent operation sharing it (C4-P6). Default: {@link DEFAULT_CONCURRENCY} (20). Must be an
   * integer in `[1, MAX_CONCURRENCY]` (1,024) — validated synchronously, before any RPC (F1):
   * `concurrency <= 0` (zero, negative, or `NaN`) would hang this router's very first RPC call
   * forever, with no escape, rather than fail with a named `RouterConfigError`.
   *
   * THIS IS A GLOBAL BOUND, NOT A PER-BATCH ONE. Wave 0 fires hint validation, route/discovery
   * probes, and (for swaps) the readiness reads all concurrently (see `search/waves.ts#wave0a`) — a
   * router with no shared bound sees a real peak equal to the SUM of every concurrently-running
   * batch's own limit, not any single one of them (measured at ~44 in-flight calls for a realistic
   * wave 0 before this option existed). One semaphore, built once per router instance and threaded
   * into every function that actually issues a `client.request` — `ethCall`, `scanLogs`,
   * `preflightTx`, readiness's native-balance read, `ingestPool`'s hint validation, and the pinned-
   * block fetch (`requestHead`/`fetchBlock`) — see `internal/rpc.ts`'s header for the complete,
   * enumerated set and the one deliberate carve-out (`manifest.ts#validateManifest`'s `getChainId`/
   * `eth_getCode`, which run at most once per router's lifetime, not per search, and so are never
   * gated). Every one of those competes for the same `concurrency` slots, which is what makes the
   * bound real instead of per-batch.
   *
   * Raise it for a provider with deep connection headroom that would rather trade concurrency for
   * latency; lower it fronting a stricter/shared-quota endpoint. The zero-config default (20) fits
   * comfortably under every major public endpoint's connection-pool ceiling.
   */
  concurrency?: number
  /**
   * The chain id the caller has ALREADY observed from this very `client`, so `validateManifest` does
   * not have to ask for it again.
   *
   * IT REPLACES THE READ, NOT THE CHECK. `manifest.chainId` is still cross-checked, still before any
   * other RPC this router makes, and still raises the same `RouterConfigError` on a mismatch; the
   * `eth_getCode` read and the immutable-fingerprint check behind it (`manifest.ts#
   * assertImmutablesEmbedded`) are untouched, so a manifest pointed at the wrong deployment is caught
   * exactly as before. What is skipped is one `eth_chainId` round trip whose answer the caller is
   * already holding.
   *
   * WHO MAY PASS IT: a host that probed THIS client for THIS value — a CLI that autodetects the
   * chain before choosing a manifest is the motivating case, and it costs a full round trip on the
   * critical path of every invocation (~0.9s on a real mainnet endpoint). A caller that passes a
   * chain id it got from anywhere else — a config file, an env var, `manifest.chainId` itself — has
   * turned the cross-check into a tautology and is defeating the one thing it exists to catch. It is
   * therefore opt-in and absent by default: no existing caller's validation weakens.
   *
   * Validated synchronously, before any RPC (F1), as a positive integer — the same posture as
   * `concurrency` above, and for a related reason: a `NaN`/fractional value here would fail the
   * `!==` comparison and report a "chainId mismatch" naming a number that was never a chain id.
   */
  assumeChainId?: number
  /**
   * CAPS the block span of an `eth_getLogs` window — the widest this router will ever ask any log
   * scan for, as both the starting window and the regrowth ceiling (see
   * `internal/logScan.ts#scanLogs`) (C4-P6). Default: {@link MAX_SCAN_WINDOW} (16,000,000n), the
   * widest single request measured served; a scan then starts at `min(remaining range, ceiling)` and
   * BISECTS DOWN on refusal, so a generous endpoint serves a cold mainnet history scan in ~2 requests
   * instead of the ~2,600 a fixed 10,000-block window used to cost.
   *
   * Pass it when you KNOW your provider's cap and would rather not pay the descent: Ankr's public
   * endpoint caps `eth_getLogs` around 3,000 blocks, so `logChunkBlocks: 3_000n` pins the ceiling
   * there and every scan starts at a width that clears. Leave it unset and the scanner discovers the
   * cap itself, at a cost of a few rejections per scan — bounded by ~log2 of the range, skipped
   * entirely for providers that state their cap in the error, and collapsed to a single narrowing for
   * providers whose refusals are expensive rather than instant (`constants.ts#DESCENT_TIMEOUT_FALLBACK`).
   */
  logChunkBlocks?: bigint
}

/**
 * Per-search options for the two ITERATOR shapes (`quotes`/`swaps`) — the callbacks a streaming
 * consumer needs and a promise-shaped one cannot use.
 *
 * Deliberately not a field on `QuoteRequest`/`SwapRequest`: a request is a description of a trade
 * (serializable, loggable, comparable), and a function on it would make it none of those.
 * Deliberately not on `CreateRouterOptions` either: a router is long-lived and shared, while these
 * are about ONE search's progress.
 */
export type IterateOptions = {
  /**
   * Fires once, with the leading route, as soon as the search has priced anything at all — up to a
   * whole wave before the first yield carries it (see `search/waves.ts#SearchContext.onFirstRoute`
   * for the measurements and for why this is a callback rather than an extra yielded event).
   *
   * FOR A QUOTE this route IS the leader of the `status: 'quote'` result that follows, arriving
   * early. FOR A SWAP it is only a priced lead: nothing has been compiled, simulated, or checked
   * against the trader's readiness yet, so it must never be treated as `ready`/`needs-action` — which
   * is why this is named for the route and not for the verdict. Either way a later wave may improve
   * on it; the yielded results stay the only authority.
   *
   * Only offered on the iterator shapes: `getQuote`/`getSwap` resolve with their answer at the same
   * moment they would have called this, so there is nothing to learn earlier.
   */
  onFirstRoute?: (route: QuotedRoute) => void
}

export interface Router {
  getQuote(req: QuoteRequest): Promise<QuoteResult>
  getSwap(req: SwapRequest): Promise<SwapResult>
  quotes(req: QuoteRequest, opts?: IterateOptions): AsyncIterable<QuoteResult>
  swaps(req: SwapRequest, opts?: IterateOptions): AsyncIterable<SwapResult>
  /** Validates `hint` (recomputing/looking up its identity) and upserts it into the router's index. */
  ingestPool(hint: PoolHint): Promise<void>
  /** Routes every log through every enabled module's `parsePoolLog`; non-matching and malformed logs
   * are ignored (one bad entry never fails the batch). Trusts the caller's log provenance. */
  ingestLogs(logs: Log[]): void
  ingestReceipt(receipt: Pick<TransactionReceipt, 'logs'>): void
  /** A sizes-only snapshot of what this router's `PoolIndex` currently holds (pool/adjacency/
   * coverage/negative-cache counts) — for monitoring an unbounded (or `maxPools`-bounded) index's
   * memory footprint over the life of a long-running instance. Safe to log on an interval: every
   * field is a count, never the pools/routes themselves. */
  stats(): RouterStats
  /**
   * Swaps in a fresh, empty `PoolIndex` — every piece of `PoolIndex` state is dropped: every learned
   * pool and its adjacency edges, every scan-coverage range, every hint-discredit (failure) counter,
   * the negative-quote cache, AND the per-factory `enabledFees` cache. Nothing about the index
   * survives.
   *
   * THE ONE THING THAT IS NOT INDEX STATE, AND SURVIVES: the router's cross-search head watermark
   * (`HeadWatermark` — see its docstring in `search/waves.ts`) lives beside the index, not inside it,
   * so `clearIndex` does not touch it. The next search still compares its pinned block against every
   * `latest` this router has ever seen, exactly as if the index had not been cleared — clearing memory
   * of *pools* is not the same claim as clearing memory of *how far the chain has moved*, and conflating
   * the two would let a clear silently defeat the head-regression guard the watermark exists for.
   *
   * SAFE MID-SEARCH. `buildContext` copies the CURRENT index reference into a `SearchContext` at the
   * moment a search starts (see below), so a `quotes`/`swaps` generator already draining an older
   * index keeps using that exact instance to completion — `clearIndex` only changes what the NEXT
   * call to `getQuote`/`getSwap`/`quotes`/`swaps` sees, never a search already in flight.
   *
   * Intended for a long-running host on a memory budget (an alternative or complement to
   * `maxPools`'s incremental eviction: a full reset instead of a bound), or ahead of a deliberate
   * re-warm — call `ingestLogs`/`ingestReceipt` with a fresh receipt batch right after.
   */
  clearIndex(): void
}

// ---------------------------------------------------------------------------
// Request validation — synchronous, before any RPC.
// ---------------------------------------------------------------------------

/**
 * Rejects an address that cannot serve as a trader/recipient.
 *
 * SHAPE FIRST (R3). `Address` is a compile-time claim about a value a stranger may have composed:
 * `'0xnope'` type-checks and, before this check existed, sailed through every lowercased string
 * comparison here to fail much later as a raw viem `InvalidAddressError` thrown from inside an
 * encoder or from `eth_call` param formatting — a mid-search stack trace instead of a named,
 * pre-RPC complaint about the field the caller got wrong. `strict: false` checks the 20-byte hex
 * shape without demanding EIP-55 checksum casing, which callers legitimately do not have (every
 * JSON-RPC response is lowercase, and every comparison in this package is case-insensitive).
 *
 * Then IDENTITY, via the shared predicate in `constants.ts` — the zero address and the Universal
 * Router's own recipient sentinels (`msg.sender` / `address(this)`), any of which as a literal
 * recipient would silently misdirect funds. `plan/compile.ts` rejects the same set with its own
 * error class; only the predicate is shared. The shape check above is what makes the identity check
 * safe to write with `isAddressEqual`, which throws on malformed input.
 */
function assertUsableAddress(addr: Address, label: string): void {
  if (typeof addr !== 'string' || !isAddress(addr, { strict: false })) {
    throw new RouterConfigError(`${label} is not a valid address, got ${String(addr)}`)
  }
  if (isUnusableCustodyAddress(addr)) {
    throw new RouterConfigError(`${label} must not be the zero address or a Universal Router recipient sentinel, got ${addr}`)
  }
}

/**
 * Rejects a `tokenIn`/`tokenOut` that is neither the `'native'` literal nor a syntactically valid
 * address (R3). Same reasoning as {@link assertUsableAddress}'s shape check, but these two fields do
 * NOT get its identity check: the zero address is a legitimate token reference in some manifests'
 * vocabulary, and a token that happens to equal a UR sentinel is a routing dead end rather than a
 * fund-loss hazard — the search will simply find nothing.
 */
function assertCurrencyRef(currency: QuoteRequest['tokenIn'], label: string): void {
  if (currency === 'native') return
  if (typeof currency !== 'string' || !isAddress(currency, { strict: false })) {
    throw new RouterConfigError(`${label} must be 'native' or a valid address, got ${String(currency)}`)
  }
}

function validateQuoteRequest(req: QuoteRequest, manifest: ChainManifest): void {
  // Shape before semantics: `sameFamily` below lowercases and compares, which quietly "succeeds" on
  // garbage, and every downstream consumer (CREATE2 derivation, `eth_call` params, the encoder)
  // assumes these are real addresses.
  assertCurrencyRef(req.tokenIn, 'tokenIn')
  assertCurrencyRef(req.tokenOut, 'tokenOut')
  if (sameFamily(req.tokenIn, req.tokenOut, manifest.wrappedNative)) {
    throw new RouterConfigError(
      `tokenIn and tokenOut are the same currency family (${String(req.tokenIn)} / ${String(req.tokenOut)}); there is nothing to route`,
    )
  }
  if (req.amountIn <= 0n) {
    throw new RouterConfigError(`amountIn must be positive, got ${req.amountIn}`)
  }
  // The v4 quoter and the Universal Router's v4 swap params both take `uint128` amounts, so anything
  // at or above 2^128 is un-encodable for v4 no matter what the search finds — see MAX_AMOUNT_IN.
  if (req.amountIn >= MAX_AMOUNT_IN) {
    throw new RouterConfigError(`amountIn must be below 2^128 (the v4 quoter's uint128 ceiling), got ${req.amountIn}`)
  }
  // Every hint is validated and then written into a PoolIndex that outlives the request; v3 hints
  // additionally cost an `eth_call` each. Both are caller-driven fan-out, so both are capped.
  if (req.hints !== undefined && req.hints.length > MAX_HINTS_PER_REQUEST) {
    throw new RouterConfigError(`a request may carry at most ${MAX_HINTS_PER_REQUEST} hints, got ${req.hints.length}`)
  }
  // Hint field validation is where a hint's caller-supplied values are checked — the addresses
  // (R3) and then the opaque `hookData` bytes (size + hex shape) — and it runs here,
  // synchronously, pre-RPC, rather than only inside `buildContext`, where a malformed hint would
  // surface after the manifest round trip instead of before it.
  assertHintAddresses(req.hints)
  buildHookData(req.hints)
}

/**
 * Rejects a recipient that is one of the addresses the plan itself is *about*.
 *
 * None of these is caught by the sentinel/zero check: they are all real, live addresses, and a plan
 * delivering to one is a plan that burns the trade's output. `tokenIn`/`tokenOut` are the ERC-20
 * contracts themselves (tokens sent to their own contract are unrecoverable in the general case);
 * `execution.address` is the Universal Router, which holds no funds between transactions and whose
 * balance is sweepable by anyone; `permit2` is the same story; `wrappedNative` is the WETH contract,
 * where an ERC-20 transfer is simply a donation. Every one of them is an address a caller can arrive
 * at by copy-pasting the wrong field out of a config, which is exactly why it is worth naming them
 * in the error rather than letting the swap succeed into a black hole.
 *
 * Takes the already-validated `execution` bundle rather than the whole `manifest` — this is a
 * swap-only check (only ever reached after `validateSwapRequest` has confirmed `execution` is
 * present via `requireExecution`), so the caller narrows once and this function never has to
 * re-check (or `!`-assert) an optional field.
 */
function assertRecipientNotAContract(recipient: Address, req: SwapRequest, execution: UniversalRouterDeployment): void {
  const named: [Address, string][] = [
    [execution.address, 'the Universal Router'],
    [execution.permit2, 'Permit2'],
    [execution.wrappedNative, 'the wrapped-native token'],
  ]
  if (req.tokenIn !== 'native') named.push([req.tokenIn, 'tokenIn'])
  if (req.tokenOut !== 'native') named.push([req.tokenOut, 'tokenOut'])

  // `isAddressEqual`, not lowercased strings: it cannot be defeated by a checksum-vs-lowercase
  // spelling difference. It DOES throw on a malformed address, so each side is shape-checked first
  // — the recipient by `assertUsableAddress` above, and the entries below here, because nothing
  // else validates a caller-assembled manifest's address fields and a raw viem `InvalidAddressError`
  // out of a swap request is a worse answer than naming the field.
  for (const [addr, label] of named) {
    if (typeof addr !== 'string' || !isAddress(addr, { strict: false })) {
      throw new RouterConfigError(`${label} (${String(addr)}) is not a valid address`)
    }
    if (isAddressEqual(addr, recipient)) {
      throw new RouterConfigError(`recipient must not be ${label} (${addr}); the swap output would be unrecoverable`)
    }
  }
}

function validateSwapRequest(req: SwapRequest, manifest: ChainManifest): void {
  validateQuoteRequest(req, manifest)
  // C4-P3: `execution` is optional (quote-only manifests never set it), so a swap request against
  // one must be rejected here — synchronously, before any RPC, same posture as every other check in
  // this function — rather than failing deep inside the search the first time compile/encode reaches
  // for a Universal Router deployment that was never there.
  const execution = requireExecution(manifest)
  if (!req.trader) {
    throw new RouterConfigError('swap requests require a trader address')
  }
  assertUsableAddress(req.trader, 'trader')
  if (req.recipient !== undefined) {
    assertUsableAddress(req.recipient, 'recipient')
    assertRecipientNotAContract(req.recipient, req, execution)
  }

  if (req.slippageBps !== undefined && (!Number.isInteger(req.slippageBps) || req.slippageBps < 0 || req.slippageBps > 10_000)) {
    throw new RouterConfigError(`slippageBps must be an integer in [0, 10000], got ${req.slippageBps}`)
  }

  // Mirrors `slippageBps`, and for the same reason: it is a plain `number` reaching a `BigInt()`
  // conversion in `search/verifier.ts`, where a fractional value is a bare `RangeError` thrown from
  // the middle of a search rather than a rejected request. The ceiling is separate from the shape
  // check — see MAX_DEADLINE_SECONDS on why an unbounded deadline is its own hazard.
  if (
    req.deadlineSeconds !== undefined &&
    (!Number.isInteger(req.deadlineSeconds) || req.deadlineSeconds <= 0 || req.deadlineSeconds > MAX_DEADLINE_SECONDS)
  ) {
    throw new RouterConfigError(`deadlineSeconds must be an integer in [1, ${MAX_DEADLINE_SECONDS}], got ${req.deadlineSeconds}`)
  }

  if (req.permit) {
    if (req.tokenIn === 'native') {
      throw new RouterConfigError('a Permit2 permit cannot be attached to a native-value input')
    }
    // `tokenIn` is shape-validated above and known non-'native' in this branch. BOTH of the permit's
    // own address fields are caller-supplied and shape-checked here, before any comparison reads
    // them. `spender` is not compared in this function at all — it is compared in
    // `verify/readiness.ts#isPermitValid` and `encode/ur20.ts` — and that is precisely why it needs
    // checking HERE: those two are downstream of the request, one of them (`checkReadiness`) is
    // documented never to throw, and neither can report a `RouterConfigError` about a request field.
    if (typeof req.permit.details.token !== 'string' || !isAddress(req.permit.details.token, { strict: false })) {
      throw new RouterConfigError(`permit.details.token is not a valid address, got ${String(req.permit.details.token)}`)
    }
    if (typeof req.permit.spender !== 'string' || !isAddress(req.permit.spender, { strict: false })) {
      throw new RouterConfigError(`permit.spender is not a valid address, got ${String(req.permit.spender)}`)
    }
    if (!isAddressEqual(req.permit.details.token, req.tokenIn)) {
      throw new RouterConfigError(`permit token ${req.permit.details.token} does not match tokenIn ${req.tokenIn}`)
    }
    // And the NUMERIC half, for exactly the reason `slippageBps`/`deadlineSeconds` above are checked:
    // `expiration` and `nonce` are plain `number`s that reach `BigInt(...)` downstream
    // (`verify/readiness.ts#isPermitValid`), where a fractional or non-finite value is a bare
    // `RangeError` thrown from the middle of wave 0 — inside a `Promise.all` neither `getSwap` nor
    // `swaps` catches, out of a function documented never to throw for a business outcome. The
    // ranges are Permit2's own: `expiration`/`nonce` are `uint48`, `amount` is `uint160`, and
    // `sigDeadline` is a `uint256` this package holds as a `bigint`. A value outside them cannot be
    // signed or encoded at all, so rejecting it here makes it a request error — which is what it is
    // — rather than an encoder throw much later.
    const { amount, expiration, nonce } = req.permit.details
    for (const [field, value] of [
      ['expiration', expiration],
      ['nonce', nonce],
    ] as const) {
      if (!Number.isInteger(value) || value < 0 || value >= MAX_PERMIT2_UINT48) {
        throw new RouterConfigError(`permit.details.${field} must be an integer in [0, ${MAX_PERMIT2_UINT48}), got ${String(value)}`)
      }
    }
    if (typeof amount !== 'bigint' || amount < 0n || amount >= MAX_PERMIT2_UINT160) {
      throw new RouterConfigError(`permit.details.amount must be a bigint in [0, 2^160), got ${String(amount)}`)
    }
    if (typeof req.permit.sigDeadline !== 'bigint' || req.permit.sigDeadline < 0n) {
      throw new RouterConfigError(`permit.sigDeadline must be a non-negative bigint, got ${String(req.permit.sigDeadline)}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Classification — InternalResult -> public result. Every branch here mirrors
// the wave engine's classification contract (see `search/waves.ts` header):
// a completed search whose leader *reverted* in verification is `no-route` (its
// failed candidates, including the nominal `best`, are returned as
// `alternatives` so the caller can see what was tried); `inconclusive` is
// reserved for the incompleteness axes the report tracks (aborted,
// partial/failed discovery, unattempted quotes, transport-failed quotes,
// degraded verification) so `assertResultCoherent` stays satisfiable.
//
// A DEGRADED VERDICT IS NOT A DISCARDED SEARCH. `inconclusive` says "this
// could not be promised", never "nothing was learned": every branch below
// hands back the `alternatives` it priced, and the `inconclusive` branch also
// hands back the leading route and its compiled `tx` when the search got that
// far and nothing ruled the route out. A caller whose
// `AbortSignal.timeout(900)` fires after twelve routes were priced and one was
// encoded still gets all twelve and the calldata — alongside the reason nobody
// could verify them, rather than nothing at all. What it never gets is a lead
// the chain already rejected: a candidate that *reverted* in preflight is
// demoted into `alternatives` on the `inconclusive` path exactly as it is on
// the completed `no-route` path, because a revert is evidence about the chain
// and stays valid however incomplete the rest of the search was.
//
// A dropped call is never a verdict: a search that lost `eth_call`s to 429s /
// timeouts / dead sockets is `inconclusive` with reason `rpc-degraded`, however
// complete its discovery looks — see `isSearchComplete`.
//
// `ready`/`needs-action` additionally require `tx` to actually be present:
// `verifyLeader` only ever marks a route `verified`/`needs-action` *after*
// compiling+encoding it, so `tx` is present whenever those statuses hold in
// practice — but "every candidate failed to compile" (a request whose
// slippage/permit/recipient survived up-front validation yet still can't be
// turned into an executable plan for anything the search found) is a real,
// reachable shape of `InternalResult`, and it must fall through to the
// terminal no-route/inconclusive classification rather than assert a `tx`
// that was never produced.
// ---------------------------------------------------------------------------

/** Total outage: not even the pinned block could be fetched, so nothing was searched at all. */
const RPC_UNAVAILABLE_DETAIL = 'not even the pinned block could be fetched for this search'
/** Partial outage: the search ran, but some of its calls never got an answer (429/timeout/socket, or
 * a node that could not serve the pinned block), or it ran against a head the router had already been
 * past —
 * distinct from `rpc-unavailable` because the caller *did* get real partial results, and a retry (or
 * a healthier endpoint) may well resolve the same request. */
const RPC_DEGRADED_DETAIL =
  "some RPC calls were 429'd, timed out, or lost, or the pinned head regressed; the search ran but cannot be promised complete"

/** The completed-search, nothing-ever-priced `Reason` shared by `classifyQuote` and `classifySwap`. */
const NO_VIABLE_ROUTE_REASON: Reason = { code: 'no-viable-route', detail: 'search complete: no viable route found' }

/**
 * Whether the search is entitled to an authoritative verdict. Beyond the classic axes (aborted,
 * unattempted quotes, incomplete discovery), a search that lost calls to the *transport* — quotes
 * that never got an answer, or a verification that could not be carried out — is not complete no
 * matter how complete its discovery looks: a provider 429ing `eth_call` while serving every other
 * method would otherwise be indistinguishable from a chain with no liquidity.
 *
 * `headRegressed` is the same idea for the quiet failure mode where nothing errors at all: the
 * search pinned a head the router has already been past (a lagging replica behind a load balancer),
 * so every answer it got was about a chain state it had already moved beyond.
 *
 * DELIBERATELY MISSING FROM THIS LIST: `report.verification.preflightBudgetExhausted` (C4-P7). A
 * search whose leader reverted through its whole `PREFLIGHT_TOP_K` budget with untried candidates
 * still on the table is NOT made `inconclusive` by that fact alone, and this is a considered decision,
 * not an oversight — three things point the same way:
 *
 *  1. A revert is real, on-chain evidence about the chain (`waves.ts`'s header: "a revert fails that
 *     candidate"), and the whole classification contract already treats "every attempted candidate
 *     reverted" as `no-route`, not `inconclusive` — a route that cannot execute is not a route,
 *     however many OTHER candidates were never simulated.
 *  2. `alternatives` already makes the exhaustion inferable: every attempted-and-failed candidate is
 *     right there, with its `revertData`, so a caller who cares whether the budget was the limiting
 *     factor can see exactly how many candidates were tried and that more existed
 *     (`alternatives.length` vs `report.verification.preflightAttempted`) — the
 *     report already carries the evidence a stricter classification would merely be restating as a
 *     verdict.
 *  3. Folding it in here would make `no-route` depend on `PREFLIGHT_TOP_K`, a policy constant with no
 *     claim on what "no route" means — raising or lowering the budget would silently flip search
 *     results between `no-route` and `inconclusive` for chains whose candidates all genuinely do not
 *     execute, which is exactly the kind of policy-into-verdict leak `SearchReport`'s independent axes
 *     exist to prevent (see this file's header).
 *
 * So `preflightBudgetExhausted` is reported, not consumed here — visible for a caller/telemetry
 * consumer who wants to reason about it, without being allowed to downgrade an otherwise-authoritative
 * `no-route` into a retry-shaped `inconclusive`.
 */
function isSearchComplete(report: SearchReport): boolean {
  return (
    !report.aborted &&
    report.quoting.unattempted === 0 &&
    report.quoting.transportFailed === 0 &&
    !report.verificationDegraded &&
    !report.headRegressed &&
    Object.values(report.discovery).every((d) => d.status === 'complete' || d.status === 'disabled')
  )
}

/**
 * Builds the `Reason` for an `inconclusive` result — always one of the incompleteness codes
 * (`rpc-degraded` / `aborted` / `discovery-incomplete` / `quotes-unattempted`), never one of the
 * `no-route`-only codes (`no-viable-route` / `no-route-verified`): only called when
 * `isSearchComplete(report)` is false, so exactly one of the axes below is guaranteed to hold.
 */
function inconclusiveReason(report: SearchReport): Reason {
  // Degradation is reported ahead of `aborted`: when the provider is dropping calls it is the root
  // cause the caller must act on (and may well be what made a deadline-driven abort fire at all),
  // whereas an abort on its own is the caller's own doing.
  if (report.quoting.transportFailed > 0 || report.verificationDegraded || report.headRegressed) {
    return { code: 'rpc-degraded', detail: RPC_DEGRADED_DETAIL }
  }
  if (report.aborted) return { code: 'aborted', detail: 'search was aborted before completion' }
  const incompleteProtocols = (Object.entries(report.discovery) as [Protocol, SearchReport['discovery'][Protocol]][])
    .filter(([, d]) => d.status === 'partial' || d.status === 'failed')
    .map(([p, d]) => `${p}:${d.status}`)
  if (incompleteProtocols.length > 0) {
    return { code: 'discovery-incomplete', detail: `discovery incomplete (${incompleteProtocols.join(', ')})` }
  }
  if (report.quoting.unattempted > 0) {
    return { code: 'quotes-unattempted', detail: `${report.quoting.unattempted} quote candidate(s) never attempted` }
  }
  /* istanbul ignore next -- unreachable: `isSearchComplete` is the exact negation of the four checks
   * above (transport/verification/head degradation, aborted, discovery partial/failed, unattempted
   * quotes), so a report that fails it always matches one of them; every call site here only calls
   * `inconclusiveReason` when `isSearchComplete(report)` is false. */
  throw new Error('unreachable: inconclusiveReason called for a report with no incompleteness axis set')
}

/**
 * Drops everything a {@link RankedRoute} carries beyond the quote itself.
 *
 * The engine's routes always travel with their execution state (`execution`, and the raw
 * `revertData` of a reverted simulation) because the swap path needs it. A quote never verified
 * anything, so a `QuoteResult` promises plain {@link QuotedRoute}s — and handing the engine's richer
 * object straight through would ship `execution: 'unverified'` on a field whose type says no such
 * key exists, which is exactly the sort of undeclared extra a caller ends up depending on.
 *
 * `promotedOverComplex` IS NOT ONE OF THOSE EXTRAS, and dropping it was a reporting bug with teeth.
 * It is a fact about the RANKING, which quoting most certainly does perform — it is the only reason
 * `best` may price below a route sitting in `alternatives`. Rebuilt from `{ route, quote }` alone,
 * every quote consumer (the CLI panel included) saw a leader outpriced by its own runner-up with
 * nothing anywhere naming the simplicity margin as the cause. It travels; only the two verification
 * fields are stripped.
 */
function toQuoted({ route, quote, promotedOverComplex }: QuotedRoute): QuotedRoute {
  return { route, quote, ...(promotedOverComplex !== undefined && { promotedOverComplex }) }
}

/** Exported for direct unit testing of the quote-side classification mapping — the twin of
 * `classifySwap`'s export below, and the seam where `toQuoted` decides what a quote consumer is
 * allowed to see. Not part of the `Router` surface. */
export function classifyQuote(e: InternalResult): QuoteResult {
  // Below the `quote` branch, `e.alternatives` is always empty — the engine ranks a non-empty set or
  // hands back nothing at all, and quoting has no verification step that could demote a leader into
  // the runners-up. The mapping runs on every path anyway because it is the same two lines, and
  // because a quote's `alternatives` must be plain `QuotedRoute`s whatever its status.
  const alternatives = e.alternatives.map(toQuoted)
  if (e.best) {
    return { status: 'quote', best: toQuoted(e.best), alternatives, search: e.report }
  }
  return isSearchComplete(e.report)
    ? { status: 'no-route', reason: NO_VIABLE_ROUTE_REASON, alternatives, search: e.report }
    : { status: 'inconclusive', reason: inconclusiveReason(e.report), alternatives, search: e.report }
}

/** Exported for direct unit testing of the classification mapping in isolation — not part of the
 * `Router` surface (mirrors `search/waves.ts` exporting `selectFocus` for the same reason). */
export function classifySwap(e: InternalResult): SwapResult {
  // BOTH LEADING STATUSES GATE ON THE ROUTE'S OWN `execution` DISCRIMINANT, which is the fact each
  // one is a claim about: `verified` means the chain simulated this candidate at this block,
  // `needs-action` means the verifier short-circuited the simulation because the trader is not
  // ready. `needs-action` used to be inferred from `requirements.length > 0` instead — a PROXY that
  // agrees with the discriminant only because of the order of the verifier's walk
  // (`search/verifier.ts`, whose header states that ordering as an invariant). Reading the
  // discriminant asks the question directly, and `assertResultCoherent`'s
  // "`needs-action` whose best route is X" check stops being a rule this function could break.
  //
  // `verificationDegraded` still guards `needs-action` independently. `needs-action` promises that
  // this list is exactly what stands between the trader and the swap; when a readiness read never
  // landed the list is known-incomplete and the promise cannot be made — the caller would be sent to
  // approve things while the real blocker stayed invisible. (`verifier.ts` already declines to mark
  // the route `needs-action` in that case, so this is belt-and-braces, not the only line of defence.)
  //
  // EVERY FIELD IS CHECKED RATHER THAN ASSERTED. The three `!` assertions this function used to
  // carry were true, but each of them was this module betting on an invariant another module owns,
  // and a `!` is silent when one of those moves. A missing field now falls through to the terminal
  // classification below, which is the same conservative direction the C1 regression (`e.tx!` on a
  // result with no tx) had to be fixed in.
  const { best, tx, limits, requirements } = e
  if (
    best?.execution === 'needs-action' &&
    tx !== undefined &&
    limits !== undefined &&
    requirements !== undefined &&
    requirements.length > 0 &&
    !e.report.verificationDegraded
  ) {
    return {
      status: 'needs-action',
      best,
      tx,
      requirements,
      limits,
      alternatives: e.alternatives,
      search: e.report,
    }
  }
  if (best?.execution === 'verified' && tx !== undefined && limits !== undefined) {
    return {
      status: 'ready',
      best,
      tx,
      execution: { verifiedAtBlock: e.report.block },
      limits,
      alternatives: e.alternatives,
      search: e.report,
    }
  }

  const complete = isSearchComplete(e.report)
  if (!best) {
    return complete
      ? { status: 'no-route', reason: NO_VIABLE_ROUTE_REASON, alternatives: e.alternatives, search: e.report }
      : { status: 'inconclusive', reason: inconclusiveReason(e.report), alternatives: e.alternatives, search: e.report }
  }

  // A best exists but never resolved to `ready`/`needs-action` above: either every attempted
  // leader failed preflight, or nothing ever compiled into an executable plan. Per the engine's
  // classification contract, a *completed* search in this state is `no-route`, not `inconclusive`
  // — a route that cannot execute is not a route — and every candidate that was tried (including
  // the nominal `best`) is handed back as `alternatives` so the caller can see what was attempted.
  if (complete) {
    return {
      status: 'no-route',
      // "Nothing verified" has two very different causes, and the caller can only act on one of
      // them: the chain rejected every simulation (nothing to do but try a different trade), or
      // nothing could be *compiled* in the first place — which is usually something about the
      // request itself (a recipient colliding with the route's own pool, an amount that will not
      // fit the encoder). When the engine knows the latter, it says so rather than making the
      // caller guess from a verdict that fits both.
      reason: {
        code: 'no-route-verified',
        detail: `no candidate route verified successfully${e.compileError !== undefined ? ` (${e.compileError})` : ''}`,
      },
      alternatives: [best, ...e.alternatives],
      search: e.report,
    }
  }

  // The same demotion applies when the search did NOT complete. `execution: 'failed'` is the chain
  // answering authoritatively — this candidate reverted in simulation at this block — and that
  // answer does not become provisional just because some *other* part of the search was cut short.
  // Leading with it would hand back known-broken calldata under a status that says "nobody could
  // verify this", so the leader is demoted into `alternatives` (where its `revertData` explains
  // itself) and no `tx` is offered. The nominal ranking is unchanged: it is still the head of the
  // list, just not a lead.
  if (best.execution === 'failed') {
    return {
      status: 'inconclusive',
      reason: inconclusiveReason(e.report),
      alternatives: [best, ...e.alternatives],
      search: e.report,
    }
  }

  // An incomplete search that found a route nobody could rule out: `unverified` (a simulation lost
  // in the transport, or one that never got to run before the abort) or `needs-action` off a
  // known-incomplete requirement list. It keeps its place as `best`, with the `tx` when one was
  // compiled. The verdict is still `inconclusive` — nobody verified it, and under
  // `verificationDegraded` nobody could even enumerate what is missing, so no `needs-action` errand
  // is promised — but the caller gets the route, the calldata, and the runners-up to decide with,
  // instead of a bare reason string.
  return {
    status: 'inconclusive',
    reason: inconclusiveReason(e.report),
    best,
    ...(tx !== undefined && { tx }),
    alternatives: e.alternatives,
    search: e.report,
  }
}

const ZERO_BLOCK: BlockRef = { number: 0n, hash: zeroHash, timestamp: 0n }

/**
 * Builds the all-zero {@link SearchReport} that backs an `inconclusive`/`rpc-unavailable` result.
 * Unlike a plain "everything disabled" report, every protocol the manifest actually *configures* is
 * reported `failed` (not `disabled`) — `disabled` means "this router was never asked to look here",
 * which is false: the search meant to look everywhere the manifest enables and could not reach any
 * of it. That failed-discovery axis is also what keeps `assertResultCoherent`'s "inconclusive
 * always has an incompleteness axis set" invariant satisfied without misrepresenting `aborted`
 * (the search was never running long enough to be stopped, so `aborted` stays `false`).
 */
function buildOutageReport(manifest: ChainManifest): SearchReport {
  const discovery = protocolRecord<SearchReport['discovery'][Protocol]>((p) => ({
    status: manifest[p] !== undefined ? 'failed' : 'disabled',
    coveredRanges: [],
    // No scan ever ran, so there is nothing to derive coverage from either — the demand floor is
    // still the protocol's real deployment block (where the manifest configures one) so a caller
    // reading it off this report sees the same number a real search's report would have used.
    demandFloor: deploymentBlockOf(manifest, p) ?? ZERO_BLOCK.number,
  }))

  return {
    block: ZERO_BLOCK,
    discovery,
    enumeration: zeroReportEnumeration(),
    quoting: zeroQuoting(),
    aborted: false,
    // Nothing was ever quoted or verified, so neither degradation axis applies: the failed-discovery
    // axis above is what makes this report incomplete. No head was ever pinned either, so nothing
    // could have regressed.
    verificationDegraded: false,
    headRegressed: false,
    // Nothing was ever simulated either — the outage stopped the search before wave 0's first quote.
    verification: zeroVerification(),
  }
}

/** The one result shape that is legal as both a `QuoteResult` and a `SwapResult`: nothing was ever
 * priced, so the empty `alternatives` satisfies either union's element type. */
function rpcUnavailable(manifest: ChainManifest): {
  status: 'inconclusive'
  reason: Reason
  alternatives: never[]
  search: SearchReport
} {
  return {
    status: 'inconclusive',
    reason: { code: 'rpc-unavailable', detail: RPC_UNAVAILABLE_DETAIL },
    alternatives: [],
    search: buildOutageReport(manifest),
  }
}

// ---------------------------------------------------------------------------
// createRouter
// ---------------------------------------------------------------------------

export function createRouter(opts: CreateRouterOptions): Router {
  const { client, manifest } = opts
  const modules = PROTOCOL_MODULES

  // Validated synchronously, before any RPC — same posture as `validateQuoteRequest`/
  // `validateSwapRequest` below: an operator mistake (here, a malformed `chain` bundle, a
  // `wrappedNative`/`execution.wrappedNative` disagreement, or injecting an index built for a
  // different chain/manifest) is rejected up front rather than left to silently misroute
  // native-family pairs the first time a search reads adjacency off it.
  assertChainData(manifest)
  assertWrappedNativeConsistency(manifest)

  // F1/F4: both are caller-supplied numbers gating a hand-rolled semaphore and a hand-rolled log
  // scanner respectively, and both have a degenerate value that hangs or burns a budget rather than
  // failing loudly — exactly the class of mistake this package rejects synchronously elsewhere
  // (`validateQuoteRequest`'s `amountIn`/`slippageBps`/etc. checks) rather than leaving to surface
  // deep inside a search, or not at all.
  if (opts.concurrency !== undefined && (!Number.isInteger(opts.concurrency) || opts.concurrency < 1 || opts.concurrency > MAX_CONCURRENCY)) {
    // `concurrency <= 0` (zero, negative, or NaN — which fails every comparison here) makes
    // `createSemaphore`'s `active < limit` check false forever: every `acquire()` queues and never
    // resolves, with no timeout or abort anywhere in that path — a permanent hang on this router's
    // very first RPC call, empirically confirmed, not a business-outcome result this package could
    // otherwise report. See `constants.ts#MAX_CONCURRENCY` for the upper bound's reasoning.
    throw new RouterConfigError(`concurrency must be an integer in [1, ${MAX_CONCURRENCY}], got ${opts.concurrency}`)
  }
  if (opts.assumeChainId !== undefined && (!Number.isInteger(opts.assumeChainId) || opts.assumeChainId < 1)) {
    throw new RouterConfigError(`assumeChainId must be a positive integer chain id, got ${opts.assumeChainId}`)
  }
  if (opts.logChunkBlocks !== undefined && opts.logChunkBlocks < MIN_CHUNK) {
    // `logChunkBlocks` below `MIN_CHUNK` (0n, negative, or merely too small) hands `scanLogs` a
    // window it can never usefully shrink further: `chunkStart = maxBig(fromBlock, cursor -
    // chunkSize + 1n)` inverts (`chunkStart > cursor`) for a non-positive `chunkSize`, so every one
    // of `MAX_REQUESTS_PER_SCAN` (4,000) attempts asks for the same nonsensical range and fails —
    // burning the whole per-scan request budget for a report that could have been an immediate,
    // named configuration error instead.
    throw new RouterConfigError(`logChunkBlocks must be at least MIN_CHUNK (${MIN_CHUNK}), got ${opts.logChunkBlocks}`)
  }

  const reorgOverlapBlocks = reorgOverlapBlocksOf(manifest)

  // Both sides are addresses this package itself constructed the index from, so `isAddressEqual` is
  // safe without a shape pre-check here — and it is the right comparison: an index built from a
  // checksummed spelling of the same token must not read as "a different chain".
  if (opts.index && !isAddressEqual(opts.index.wrappedNative, manifest.wrappedNative)) {
    throw new RouterConfigError(
      `injected index's wrappedNative (${opts.index.wrappedNative}) does not match manifest.wrappedNative (${manifest.wrappedNative}) — an index built for a different chain/manifest cannot be safely reused`,
    )
  }

  if (opts.index && opts.index.reorgOverlapBlocks !== reorgOverlapBlocks) {
    throw new RouterConfigError(
      `injected index's reorgOverlapBlocks (${opts.index.reorgOverlapBlocks}) does not match this manifest's (${reorgOverlapBlocks}) — an index whose scan coverage was maintained under a different reorg depth cannot be safely reused`,
    )
  }

  /** Builds a fresh index for THIS router's own manifest/`maxPools` — used both for the initial
   * (non-injected) index and by `clearIndex` below, so the two can never drift out of sync about
   * what "empty" means for this router. */
  function freshIndex(): PoolIndex {
    return new PoolIndex(manifest.wrappedNative, { maxPools: opts.maxPools, reorgOverlapBlocks })
  }

  // `let`, not `const`: `clearIndex` reassigns this to a new instance. Reassignment is exactly what
  // makes clearing safe mid-search — `buildContext` (below) reads this variable's CURRENT value into
  // a new `SearchContext` object every time it runs, so a context already handed to an in-flight
  // generator holds the OLD reference regardless of what this variable points to afterward; nothing
  // in `search/waves.ts` ever re-reads `index` off the router closure once a search has started.
  let index: PoolIndex = opts.index ?? freshIndex()
  // The highest `latest` block any search on this router has pinned. Lives here, next to the index,
  // because both are the router instance's memory of the chain: the index caches per-block negative
  // quotes and scan coverage, and this says whether a new search's head is actually newer than what
  // that memory was built from (see `fetchBlock`'s head-regression guard).
  const head: HeadWatermark = {}

  // Built ONCE per router instance, never per-search or per-batch (C4-P6) — that is the whole fix:
  // every concurrent operation this router runs (hint validation, probes, readiness, preflight, log
  // scans, `ingestPool`'s hint validation) acquires from this SAME semaphore, so `concurrency` is a
  // real cross-batch bound rather than the per-`mapConcurrent`-call one it used to be. See
  // `internal/rpc.ts`'s header for the measured before/after.
  const semaphore = createSemaphore(opts.concurrency ?? DEFAULT_CONCURRENCY)

  // ---------------------------------------------------------------------------
  // THE ONCE-CELL PATTERN, WRITTEN TWICE HERE — THIS ONE AND `resolveMulticall3`
  // BELOW — AND THE SECOND COPY IS WHY IT IS SPELLED OUT.
  //
  // Both answer a question about `(client, manifest)` that has a permanent
  // answer, at most once per router, with concurrent callers sharing one
  // in-flight promise rather than racing. Four rules make that safe, and every
  // future once-cell here has to reproduce all four:
  //
  //   1. THE CACHE HOLDS THE ANSWER, NOT THE FACT THAT WE ASKED. The stored
  //      value is a discriminated record (`{kind:'ok'} | {kind:'config-error'}`,
  //      `{address: Address | null}`), never a bare boolean, so "no" is cached
  //      as deliberately as "yes". A cell that only remembered success re-probes
  //      forever on the negative path — one `eth_getCode` per search, on exactly
  //      the chains that will never have an answer.
  //   2. A TRANSPORT FAILURE IS NOT AN ANSWER AND IS NEVER CACHED. It says
  //      nothing about the manifest or the deployment, so the next call asks
  //      again rather than being permanently bricked by one blip. The two
  //      differ in what they do MEANWHILE: validation rethrows (a config error
  //      the caller must see), while the multicall probe falls back to the
  //      conservative path (per-call quoting, correct on any chain), because
  //      it has one and validation does not.
  //   3. THE IN-FLIGHT PROMISE IS CLEARED IN `finally`, so a failed attempt
  //      does not leave every later caller awaiting a promise that already
  //      rejected.
  //   4. THE REQUEST HOLDS A SEMAPHORE PERMIT like every other
  //      `client.request` in this package (`internal/rpc.ts`). Both are leaf
  //      requests — nothing nested inside — so acquiring carries no
  //      lock-ordering risk, even though neither can contribute to a sustained
  //      peak.
  // ---------------------------------------------------------------------------

  // A chainId mismatch is a deterministic, permanent property of (client, manifest) — once
  // observed it is cached forever, and every future call rejects with the same `RouterConfigError`
  // without another round trip. Anything else (a transient `getChainId` failure: the node is
  // down, a timeout) is *not* cached: that outcome says nothing about whether the manifest itself
  // is wrong, so the next call gets to try again rather than being permanently bricked by one bad
  // network blip.
  type ManifestValidation = { kind: 'ok' } | { kind: 'config-error'; error: RouterConfigError }
  let validation: ManifestValidation | undefined
  let inFlight: Promise<void> | undefined

  async function ensureManifestValidated(): Promise<void> {
    if (validation) {
      if (validation.kind === 'config-error') throw validation.error
      return
    }
    if (!inFlight) {
      inFlight = (async () => {
        try {
          await validateManifest(client, manifest, opts.assumeChainId !== undefined ? { assumeChainId: opts.assumeChainId } : undefined)
          validation = { kind: 'ok' }
        } catch (err) {
          if (err instanceof RouterConfigError) validation = { kind: 'config-error', error: err }
          throw err
        } finally {
          inFlight = undefined
        }
      })()
    }
    return inFlight
  }

  // ---------------------------------------------------------------------------
  // Multicall3 probe — the aggregation fallback's one decision, made once.
  //
  // THE SECOND ONCE-CELL. Same four rules as `ensureManifestValidated` above
  // (see the block over it, which is where they are stated); what follows is
  // only what is specific to this question.
  //
  // Quoting rounds go through Multicall3 `aggregate3` (see `internal/multicall.ts` for the measured
  // why) ONLY on a chain where the deployment is real, and "is it real" is answered by reading the
  // code, never by trusting the canonical address: an `aggregate3` sent to an address with no code
  // "succeeds" with `0x` and silently loses every quote in it. The answer is a deterministic,
  // permanent property of `(client, manifest.multicall3 ?? canonical)` — a contract at that address
  // cannot appear or vanish within a router's lifetime in any way this package should chase — so it
  // is cached forever in BOTH directions, exactly like `ensureManifestValidated` caches a chainId
  // mismatch: code present → every search aggregates; code absent → every search quotes per-call,
  // permanently, with no re-probing. Only a probe that FAILED (transport blip — nothing was learned)
  // is not cached: that search quotes per-call (the conservative path needs no probe to be safe) and
  // the next search asks again.
  //
  // THE PROBE IS FIRED CONCURRENTLY WITH `ensureManifestValidated` (see the entry points below), so
  // its round trip hides behind the validation round trip on the first search and behind nothing at
  // all afterwards. It holds a semaphore permit around its one `eth_getCode` per `internal/rpc.ts`'s
  // every-request-is-gated rule — a leaf request, like `requestHead`, so no lock-ordering risk —
  // even though, like manifest validation, it can never contribute to a sustained peak.
  type MulticallResolution = { address: Address | null }
  let multicallResolved: MulticallResolution | undefined
  let multicallInFlight: Promise<Address | null> | undefined

  async function resolveMulticall3(): Promise<Address | null> {
    if (multicallResolved) return multicallResolved.address
    if (!multicallInFlight) {
      multicallInFlight = (async () => {
        const address = manifest.multicall3 ?? MULTICALL3_ADDRESS
        try {
          await semaphore.acquire()
          let code: Hex
          try {
            code = (await client.request({ method: 'eth_getCode', params: [address, 'latest'] } as any)) as Hex
          } finally {
            semaphore.release()
          }
          const resolved = typeof code === 'string' && code !== '0x' && code.length > 2 ? address : null
          multicallResolved = { address: resolved }
          return resolved
        } catch {
          // Transport failure: nothing was learned about the address, so nothing is cached — this
          // search runs per-call (correct on any chain) and the next one probes again.
          return null
        } finally {
          multicallInFlight = undefined
        }
      })()
    }
    return multicallInFlight
  }

  /**
   * Fires the search's pinned-block read (`eth_getBlockByNumber('latest')`) THE MOMENT A REQUEST
   * COMES IN, rather than after `ensureManifestValidated`/`resolveMulticall3` have been awaited and a
   * `SearchContext` built (C5-A) — the one round trip in the pre-search sequence that used to start
   * only once the other two were done, for no reason a real dependency required: `fetchBlock` reads
   * only `client`/`head`/`semaphore`, none of which come FROM validation or the multicall probe, so it
   * has never needed either of their answers.
   *
   * Not a once-cell: unlike a chainId mismatch or a multicall3 deployment, "what block is the chain
   * at right now" has no permanent answer to cache — a fresh read is exactly what every call wants,
   * every time. What moves here is WHEN that read is issued, not whether it repeats.
   *
   * Every caller of this function attaches a no-op `.catch` immediately (below), because a call whose
   * `ensureManifestValidated` rejects with a `RouterConfigError` never goes on to await this promise
   * at all — and an unawaited rejection is an unhandled-rejection warning waiting to fire, the same
   * reason `manifest.ts#validateManifest`'s own `codeRead` carries one. The ORIGINAL promise (not the
   * caught one) is still what reaches `SearchContext.pinnedBlock`, so `searchWaves` sees the real
   * rejection — a transport failure here still becomes the `RpcUnavailableError` it always did,
   * `fetchBlock`'s head-regression self-heal still runs, and the watermark is still written exactly
   * once per resolved read. Nothing about the OUTCOME changes, only when the request goes out.
   */
  function dispatchPinnedBlock(): Promise<{ block: BlockRef; regressed: boolean }> {
    return fetchBlock(client, maxPlausibleHeadRegression(reorgOverlapBlocksOf(manifest)), head, semaphore)
  }

  function buildContext(
    req: QuoteRequest,
    multicall3: Address | null,
    pinnedBlock: Promise<{ block: BlockRef; regressed: boolean }>,
    iterate?: IterateOptions,
  ): SearchContext {
    return {
      client,
      manifest,
      modules,
      index,
      hookData: buildHookData(req.hints),
      head,
      semaphore,
      pinnedBlock,
      ...(multicall3 !== null && { multicall3 }),
      logChunkBlocks: opts.logChunkBlocks,
      onFirstRoute: iterate?.onFirstRoute,
    }
  }

  /** One of `searchWaves`'s own events, or the sentinel this function yields in its place when the
   * search never reaches `searchWaves` at all (an outage during manifest validation) or is cut short
   * by one mid-search (`RpcUnavailableError`) — both cases a caller answers with {@link rpcUnavailable}. */
  type SearchEvent = { event: InternalResult } | { outage: true }

  /**
   * The preamble shared by all four search entry points below — everything between "a validated
   * request" and "a stream of `searchWaves` events" — parameterized by the two things that differ
   * per pair (quote/swap): which synchronous `validate*Request` runs, and which `searchWaves` `kind`
   * to search as. Classifying an event into the public result union, and deciding when to stop
   * consuming them, stays with each of the four callers below: `getQuote`/`getSwap` stop at the
   * first actionable status (a different one each) or the final event, while `quotes`/`swaps` simply
   * forward every event — that difference was always going to need call-site-specific code, so this
   * helper does not try to abstract it away.
   *
   * NOT an `async function`/`async function*` ITSELF UP TO THE `validate` CALL — that call has to
   * run synchronously, on the caller's own stack, the instant `startSearch` is invoked, because
   * `quotes`/`swaps` promise a malformed request throws before the generator they return is ever
   * driven (see the router-test comment on `swaps()` for the load-bearing case). An `async`/generator
   * function body never runs synchronously to its first `await`/`yield` the way a plain function
   * does, so `validate` has to happen here, before the `(async function* () {...})()` below is even
   * constructed. Everything after that line is free to be lazy.
   *
   * SURFACING A FAILURE IS THE ONE THING DELIBERATELY LEFT TO THE CALLER. `ensureManifestValidated`
   * rejecting with a `RouterConfigError` is always rethrown here, uncaught — a promise-shaped caller
   * lets that propagate as its own rejection, a generator-shaped caller lets it propagate as its
   * iterator's first `.next()` rejecting; both are exactly what "rethrow" already meant for each
   * shape before this helper existed. Anything else from `ensureManifestValidated`, and any
   * `RpcUnavailableError` from the search loop itself, becomes one final `{ outage: true }` yield — a
   * promise-shaped caller's loop returns `rpcUnavailable(manifest)` immediately on seeing it, a
   * generator-shaped caller yields that same value and stops, matching the `return`/`yield`-then-
   * `return` split each used to spell out individually.
   */
  function startSearch<Req extends QuoteRequest>(
    req: Req,
    validate: (req: Req, manifest: ChainManifest) => void,
    kind: 'quote' | 'swap',
    iterate?: IterateOptions,
  ): AsyncGenerator<SearchEvent> {
    validate(req, manifest)
    return (async function* () {
      // All three dispatched BEFORE the validation await so their round trips overlap (C5-A):
      // `resolveMulticall3` and `ensureManifestValidated` are once-cells and never reject uncaught by
      // themselves; `pinnedBlock`'s no-op `.catch` is what keeps a search that never reaches
      // `searchWaves` (a `RouterConfigError` below) from logging an unhandled rejection for it.
      const multicallProbe = resolveMulticall3()
      const pinnedBlock = dispatchPinnedBlock()
      pinnedBlock.catch(() => {})
      try {
        await ensureManifestValidated()
      } catch (err) {
        if (err instanceof RouterConfigError) throw err
        yield { outage: true }
        return
      }
      const ctx = buildContext(req, await multicallProbe, pinnedBlock, iterate)
      try {
        for await (const e of searchWaves(ctx, req, kind)) yield { event: e }
      } catch (err) {
        if (!(err instanceof RpcUnavailableError)) throw err
        yield { outage: true }
      }
    })()
  }

  async function getQuote(req: QuoteRequest): Promise<QuoteResult> {
    for await (const item of startSearch(req, validateQuoteRequest, 'quote')) {
      if ('outage' in item) return rpcUnavailable(manifest)
      const result = classifyQuote(item.event)
      if (result.status === 'quote' || item.event.done) return result
    }
    /* istanbul ignore next -- searchWaves always yields a done:true final event before returning */
    throw new Error('unreachable: searchWaves completed without a done event')
  }

  async function getSwap(req: SwapRequest): Promise<SwapResult> {
    for await (const item of startSearch(req, validateSwapRequest, 'swap')) {
      if ('outage' in item) return rpcUnavailable(manifest)
      const result = classifySwap(item.event)
      if (result.status === 'ready' || result.status === 'needs-action' || item.event.done) return result
    }
    /* istanbul ignore next -- searchWaves always yields a done:true final event before returning */
    throw new Error('unreachable: searchWaves completed without a done event')
  }

  function quotes(req: QuoteRequest, iterate?: IterateOptions): AsyncIterable<QuoteResult> {
    const search = startSearch(req, validateQuoteRequest, 'quote', iterate)
    return (async function* () {
      for await (const item of search) yield 'outage' in item ? rpcUnavailable(manifest) : classifyQuote(item.event)
    })()
  }

  function swaps(req: SwapRequest, iterate?: IterateOptions): AsyncIterable<SwapResult> {
    const search = startSearch(req, validateSwapRequest, 'swap', iterate)
    return (async function* () {
      for await (const item of search) yield 'outage' in item ? rpcUnavailable(manifest) : classifySwap(item.event)
    })()
  }

  /** Raw `eth_call` at the chain tip, for hint validation only — ingestion has no pinned search
   * block of its own to reuse. A hint sits in the index until the next search re-derives whatever
   * it needs against that search's own pinned block, so validating it against "latest" here costs
   * nothing in correctness. Gated by the router's global semaphore (C4-P6), same as every other RPC
   * this router issues — `ingestPool` is real request traffic too, not exempt from `concurrency`. */
  async function ethCallLatest(call: EthCall): Promise<Hex> {
    const transaction: { to: Address; data: Hex; from?: Address; value?: Hex } = { to: call.to, data: call.data }
    if (call.from !== undefined) transaction.from = call.from
    if (call.value !== undefined) transaction.value = `0x${call.value.toString(16)}`
    await semaphore.acquire()
    try {
      return (await client.request({ method: 'eth_call', params: [transaction, 'latest'] } as any)) as Hex
    } finally {
      semaphore.release()
    }
  }

  async function ingestPool(hint: PoolHint): Promise<void> {
    const module_ = modules[hint.protocol]
    if (!module_) throw new RouterConfigError(`ingestPool received a hint with unknown protocol ${String(hint.protocol)}`)
    // Same validation the request path applies to `req.hints` (R3): this is the OTHER door a
    // caller-composed hint comes through, and it writes straight into the long-lived index, so a
    // malformed address here would be a permanent resident rather than a one-request mistake.
    assertHintAddresses([hint])
    if (!module_.enabled(manifest)) return
    const record = await module_.validateHint(hint, ethCallLatest, manifest)
    if (record) index.upsert(record)
  }

  /**
   * Routes every log through every enabled module's parser, skipping anything that does not parse.
   *
   * DEFENSIVE PER LOG, DELIBERATELY UNCAPPED IN COUNT. `logs` is a caller-supplied array — in the
   * launcher recipe it is a whole `TransactionReceipt`'s logs — and a single malformed entry
   * (`null` from a sparse array, a hand-built object with no `address`, a log whose `data` is
   * truncated) must not take the rest of the batch down with it. The modules are hardened at the
   * same seam (`typeof log?.address === 'string'` before any `toLowerCase`), and the try/catch here
   * is the backstop for a decode this package does not control.
   *
   * ONLY THE PARSE IS GUARDED. `index.upsert` sits outside the `try` on purpose: a parse throwing
   * is a statement about untrusted *input* ("this is not a log I can read"), while an `upsert`
   * throwing would be a statement about this package's own invariants — a bug, which must propagate
   * loudly rather than be swallowed as one more unreadable log and leave the index quietly
   * incomplete.
   *
   * There is no cap on `logs.length` because, unlike `hints`, this array is not remote data pretending
   * to be a request: it is a batch the caller assembled from a receipt it already has in memory, and
   * a cap would silently drop pools from an honest large receipt. The trust boundary is stated
   * rather than enforced — `ingestLogs` trusts the caller's log provenance (see the README's
   * launcher recipe), and a caller that forwards logs it did not fetch itself is asserting pools
   * exist on nothing more than whoever handed them over.
   */
  function ingestLogs(logs: Log[]): void {
    for (const log of logs) {
      for (const protocol of PROTOCOLS) {
        const module_ = modules[protocol]
        if (!module_.enabled(manifest)) continue
        let record: PoolRecord | null
        try {
          record = module_.parsePoolLog(log, manifest)
        } catch {
          // A log this module cannot make sense of is not an error the caller can act on — it is
          // simply not this module's event, which is the same outcome `parsePoolLog` returns `null`
          // for. Skip it and keep going.
          continue
        }
        if (record) index.upsert(record)
      }
    }
  }

  function ingestReceipt(receipt: Pick<TransactionReceipt, 'logs'>): void {
    ingestLogs(receipt.logs)
  }

  function stats(): RouterStats {
    return index.stats()
  }

  function clearIndex(): void {
    index = freshIndex()
  }

  return { getQuote, getSwap, quotes, swaps, ingestPool, ingestLogs, ingestReceipt, stats, clearIndex }
}
