import type { Address, Hex, PublicClient } from 'viem'

import { NodeStateError, TransportError } from '../errors'
import type { BlockRange, EthCall } from '../types'

// ---------------------------------------------------------------------------
// RPC primitives — raw `eth_call` over `client.request` (not viem's `call()`
// public action), transport-vs-execution error classification, and
// bounded-concurrency dispatch.
//
// A raw `request()` call is used instead of viem's `call()` action so this
// stays block-pinned and free of viem's own batching/multicall behavior —
// the quoting engine (Task 12) is entirely in control of how many in-flight
// calls exist and against which block, and tests only need to stub `request`
// rather than a full `PublicClient`.
// ---------------------------------------------------------------------------

/**
 * Which *channel* a failed RPC call failed in.
 *
 * `execution` — the node answered authoritatively and the EVM rejected the call (a revert, with or
 * without data; an invalid opcode; out of gas). For a quote that means "no pool there / this route
 * cannot price", which is real evidence about the chain.
 *
 * `transport` — the node never answered, or answered about *itself* rather than the chain: HTTP
 * 429/5xx, a timeout, a dropped connection, a rate-limit JSON-RPC error. This is evidence about the
 * provider and NONE about the chain, so it can never contribute to a `no-route` conclusion.
 *
 * `unavailable` — the node answered, and what it said is "I cannot serve this request AT THIS
 * BLOCK": `header not found`, `missing trie node`, `unknown block`, erigon's `state at block N is
 * not available`, alchemy's `Nonexistent block: requested N, latest M`, a response-size/range cap.
 * Same evidentiary weight as `transport` (none, about the chain) and the same downstream axis; kept
 * apart only so a diagnostic can name the difference. The realistic cause is not an outage at all:
 * a load balancer serving the pinned-block calls from a replica a few blocks behind the node that
 * answered `eth_getBlockByNumber`. Folding these into `execution` — which the default below used to
 * do, since none of them mention a revert — is what let dozens of never-executed calls be counted
 * as on-chain refusals and produce a confident `no-route` (C4-H1).
 */
export type RpcFailureKind = 'execution' | 'transport' | 'unavailable'

/** Revert dialects across clients (geth/erigon/nethermind/anvil) and viem's own wrappers. */
const REVERT_MESSAGE = /execution reverted|reverted with|revert(ed)?\b|invalid opcode|out of gas|stack (under|over)flow|vm exception|always failing transaction/i

/** Provider-side (never chain-side) failure text: HTTP status *phrases*, socket/DNS errors, timeouts.
 * Bare status numbers are deliberately absent — `\b50[0234]\b` matched revert strings like
 * "amount 504 too low", turning an on-chain answer into a phantom outage. Numeric status belongs to
 * the structured `status`/`code` checks below, which is where a real transport reports it. */
const TRANSPORT_MESSAGE =
  /too many requests|rate ?limit|request limit|quota|capacity|timed? ?out|timeout|fetch failed|failed to fetch|socket|connection (closed|refused|reset|terminated)|network error|bad gateway|service unavailable|gateway time-?out|internal (server )?error|upstream|econn|etimedout|enotfound|ehostunreach|epipe/i

/**
 * Node-state-availability dialects: the node is up and talking, but cannot serve THIS block.
 *
 *  - geth/anvil pruned or reorged-away state: `header not found`, `missing trie node 0x…`,
 *    `unknown block`, `block not found`
 *  - erigon: `state at block 12345 is not available` / `... unavailable`
 *  - alchemy/infura load balancers: `Nonexistent block: requested 21000002, latest 21000000`,
 *    `requested block is not available`
 *  - result caps that abort the request rather than answer it: `exceeded maximum block range`,
 *    `query returned more than 10000 results`, `response size exceeded`
 *
 * `state .{0,40}(not available|unavailable)` is bounded rather than `.*` so it cannot leap across a
 * whole verbose viem message to marry an unrelated "state" to an unrelated "unavailable".
 *
 * `unknown block\b` is anchored on the right so prose like "unknown blockNumber field" (a schema
 * complaint, not a node-state one) does not match — the phrase is short enough to collide otherwise.
 */
const NODE_STATE_MESSAGE =
  /header not found|block not found|unknown block\b|missing trie node|state .{0,40}(not available|unavailable)|nonexistent block|requested block|exceeded maximum block range|query returned more than|response size/i

// ---------------------------------------------------------------------------
// Declared `eth_getLogs` caps (R2).
//
// Concept borrowed, with thanks, from `blockfeed`'s `enumerate.ts`: several
// providers do not merely refuse an over-wide `eth_getLogs` — they TELL YOU the
// window that would have worked, in the error message. `internal/logScan.ts`'s
// bisection was written for the providers that say nothing (halve, retry,
// halve again), and it applied that same blind ratchet to the ones that
// answered the question outright.
//
// Two things that costs, both visible in the live captures in
// `__fixtures__/providerErrors.json`:
//
//   * A provider capping at 10 blocks (`eth-mainnet.public.blastapi.io`) is
//     nine halvings below MIN_CHUNK. The scanner cannot bisect its way to a
//     window that endpoint will serve — MIN_CHUNK is the floor — so it spends
//     MAX_CONSECUTIVE_MIN_FAILURES requests plus a full backoff escalation per
//     sub-range discovering, over and over, a fact the FIRST error stated in
//     plain English. Reading the cap turns that into one request and an honest
//     "not covered".
//   * A provider that declares a usable span (`eth.drpc.org`'s
//     `retry with the range 25683953-25685027`) has just handed over the answer
//     the halving loop is searching for. Jumping straight to it skips every
//     intermediate probe.
//
// This is a MESSAGE parser, and deliberately a conservative one: an unmatched
// message returns `{}` and the caller's existing halve/retry/give-up logic runs
// exactly as before. Nothing here is required to fire for the scanner to work.
// ---------------------------------------------------------------------------

/**
 * What a provider's own error message says about the window it would accept.
 *
 * `capBlocks` — the widest span it claims to serve, in blocks. Taken from an explicit "N block
 * range" phrase when there is one; otherwise derived from `retryRange`'s width, since a range the
 * provider volunteers is a span it is asserting will work.
 *
 * `retryRange` — the literal range it suggested. Parsed and exposed because it is real information
 * a diagnostic may want, but see `logScan.ts` for why the scanner uses only its WIDTH: the live
 * captures show providers suggesting ranges that sit partly (blastapi: the oldest 10 blocks of a
 * 2,000-block request) or entirely (drpc: 25,683,953-25,685,027 against a request for
 * 25,684,977-25,686,977) outside the window that was actually asked for. Jumping the cursor to one
 * would leave a hole the scanner would then report as covered — a coverage lie, which is the one
 * failure mode this whole module is built to avoid.
 */
export type DeclaredCap = { capBlocks?: bigint; retryRange?: BlockRange }

/**
 * "…with up to a 10 block range…" (blastapi, alchemy). The generic `N block range` tail also
 * catches phrasings that drop the "up to a", which is the shape alchemy's response-size variant
 * uses. Digit separators are tolerated because providers write both `10000` and `10,000`.
 */
const DECLARED_CAP_BLOCKS = /\b([\d][\d,_]*) block range\b/i

/** drpc: "query exceeds max results 20000, retry with the range 25683953-25685027". */
const DECLARED_RETRY_RANGE_DEC = /\brange\s+(\d[\d,_]*)\s*-\s*(\d[\d,_]*)/i

/**
 * blastapi: "…this block range should work: [0x187e655, 0x187e65e]".
 *
 * The `0x` is required on BOTH sides with no intervening quote, which is what keeps this off the
 * JSON `topics` array viem echoes into the same message (`["0x…","0x…"]` — quoted, so it cannot
 * match) and off the `params` array (`[{…}]`).
 */
const DECLARED_RETRY_RANGE_HEX = /\[\s*(0x[0-9a-f]+)\s*,\s*(0x[0-9a-f]+)\s*\]/i

/** Strips the digit separators providers sprinkle into large numbers. */
function toBig(digits: string): bigint {
  return BigInt(digits.replace(/[,_]/g, ''))
}

/**
 * Reads a provider's declared `eth_getLogs` window out of a failure, walking the same `cause` chain
 * as {@link classifyRpcError} (one walker — see {@link collectFacts}) because the useful text is
 * routinely on a nested `details`/`cause.message` rather than the error handed to the caller.
 *
 * Returns `{}` for anything it does not recognize, which is most errors: the caller must treat a
 * declared cap as an optimization it may or may not get, never as a precondition.
 */
export function parseDeclaredCap(err: unknown): DeclaredCap {
  const declared: DeclaredCap = {}
  for (const message of collectFacts(err).messages) {
    if (declared.retryRange === undefined) {
      const hex = DECLARED_RETRY_RANGE_HEX.exec(message)
      const dec = hex ? null : DECLARED_RETRY_RANGE_DEC.exec(message)
      const bounds = hex ? [BigInt(hex[1]!), BigInt(hex[2]!)] : dec ? [toBig(dec[1]!), toBig(dec[2]!)] : undefined
      // A suggestion whose ends are inverted is not a range, it is noise from a regex that found two
      // numbers next to each other; drop it rather than derive a negative width from it.
      if (bounds && bounds[1]! >= bounds[0]!) declared.retryRange = { fromBlock: bounds[0]!, toBlock: bounds[1]! }
    }
    if (declared.capBlocks === undefined) {
      const cap = DECLARED_CAP_BLOCKS.exec(message)
      if (cap) {
        const blocks = toBig(cap[1]!)
        if (blocks > 0n) declared.capBlocks = blocks
      }
    }
  }
  if (declared.capBlocks === undefined && declared.retryRange !== undefined) {
    // A suggested RANGE is a width, not a policy: it is what the provider computed would fit under a
    // RESULT cap at this query's density right here, so it is only as durable as that density. It can
    // therefore come back absurdly narrow — a range under `MIN_CHUNK` is only plausible at densities
    // above ~20k logs per 128 blocks — and the scanner treats such a width exactly as it treats a
    // declared block cap that low: give the sub-range up rather than chase it (`logScan.ts`).
    declared.capBlocks = declared.retryRange.toBlock - declared.retryRange.fromBlock + 1n
  }
  return declared
}

/**
 * viem error classes that only ever describe the transport itself.
 *
 * EVERY NAME HERE IS A REAL viem 2.47 CLASS — checked against the package, not remembered. The set
 * used to also carry `'RequestTimeoutError'`, which viem has never exported under that name (its
 * timeout class is plain `TimeoutError`, `errors/request.ts`); a name that matches nothing is dead
 * weight that reads as coverage, so it is gone. The real transport-shaped classes viem 2.47 ships,
 * for anyone extending this list later:
 *
 *  - `errors/request.ts`: `HttpRequestError`, `WebSocketRequestError`, `RpcRequestError`,
 *    `SocketClosedError`, `TimeoutError`
 *  - `errors/rpc.ts`: `LimitExceededRpcError` (-32005), `ResourceUnavailableRpcError` (-32002),
 *    `ProviderDisconnectedError` (4900), `ChainDisconnectedError` (4901)
 *
 * `RpcRequestError` is deliberately ABSENT: it is the generic wrapper viem puts around *every*
 * JSON-RPC error response, including `execution reverted` — classifying it as transport would
 * launder every revert into "the node never answered".
 *
 * The two `ProviderRpcError` subclasses ARE included: EIP-1193 4900/4901 both mean the provider is
 * not connected to a chain right now, which is the definition of a failure that says nothing about
 * the chain. They arrive from injected/EIP-1193 transports rather than HTTP, which is the only
 * reason they were not here before.
 */
const TRANSPORT_ERROR_NAMES = new Set([
  'HttpRequestError',
  'TimeoutError',
  'SocketClosedError',
  'WebSocketRequestError',
  'LimitExceededRpcError',
  'ResourceUnavailableRpcError',
  'ProviderDisconnectedError',
  'ChainDisconnectedError',
])

/** JSON-RPC codes that report a provider limit, not an EVM outcome. `-32000` is deliberately absent:
 * it is geth's catch-all and carries "execution reverted" far more often than anything else. */
const TRANSPORT_RPC_CODES = new Set([-32005, -32002])

/** geth's dedicated revert code (EIP-1474-era `3`), which always accompanies real revert data. */
const REVERT_RPC_CODE = 3

type ErrorFacts = {
  messages: string[]
  names: string[]
  numericCodes: number[]
  stringCodes: string[]
  statuses: number[]
  /**
   * A revert-data FIELD was present anywhere in the chain. Evidence the node executed; see
   * `classifyRpcError`, whose first rule this is.
   *
   * A ZERO-LENGTH `'0x'` COUNTS ONLY AT THE NESTED `data.data` POSITION, NOT AT THE TOP LEVEL — an
   * asymmetry inherited verbatim from the pre-R1 code and deliberately preserved, since changing it
   * would silently reclassify errors this package has never seen a real example of. The nested
   * position is geth's error object, where a bare `'0x'` genuinely means "reverted, no reason";
   * a top-level `data: '0x'` has no such established provenance. `revertData` below applies the
   * `.length > 2` rule uniformly at BOTH positions, so the two fields disagree for exactly one
   * shape: `{ cause: { data: { data: '0x' } } }` is `hasRevertData` with no `revertData`.
   * `rpc.test.ts` pins the asymmetry in both directions.
   */
  hasRevertData: boolean
  /** The first NON-EMPTY revert payload found while walking. `undefined` means the revert carried no
   * bytes at all; a bare `0x` never lands here. See {@link revertDataOf}, the only reader. */
  revertData?: Hex
}

/**
 * Flattens an error and its `cause` chain (viem nests 2-3 deep) into the few facts classification
 * and revert-data extraction need. Bounded depth so a self-referential `cause` can never spin.
 *
 * THIS IS THE ONLY CAUSE-CHAIN WALKER IN THE PACKAGE, and that is the point rather than an
 * incidental tidiness. There used to be three: this one, {@link revertDataOf}'s own copy, and a
 * third in `verify/preflight.ts` that walked only ONE level, never stepped into geth's `data.data`,
 * and accepted a zero-length `'0x'` as data. That third copy is why a preflight against a real geth
 * node lost `revertData` for exactly the nested shape geth actually emits — `RankedRoute.revertData`
 * came back empty precisely when a caller most wanted the reason bytes. One walker, one set of
 * shape rules, and the regression test in `preflight.test.ts` pins the geth shape end to end.
 */
function collectFacts(err: unknown): ErrorFacts {
  const facts: ErrorFacts = { messages: [], names: [], numericCodes: [], stringCodes: [], statuses: [], hasRevertData: false }
  let node: any = err
  for (let depth = 0; node !== null && node !== undefined && depth < 8; depth++) {
    if (typeof node === 'string') {
      facts.messages.push(node)
      break
    }
    for (const field of ['message', 'shortMessage', 'details', 'reason'] as const) {
      if (typeof node[field] === 'string') facts.messages.push(node[field])
    }
    if (typeof node.name === 'string') facts.names.push(node.name)
    if (typeof node.code === 'number') facts.numericCodes.push(node.code)
    if (typeof node.code === 'string') facts.stringCodes.push(node.code)
    if (typeof node.status === 'number') facts.statuses.push(node.status)
    // Revert data can sit on the error itself or one level in as `data.data` (geth's error object).
    // Top-level is preferred when both are present, and the FIRST non-empty payload down the chain
    // wins — the outermost wrapper is the one closest to what the node actually said.
    if (typeof node.data === 'string' && node.data.startsWith('0x') && node.data.length > 2) {
      facts.hasRevertData = true
      facts.revertData ??= node.data as Hex
    }
    if (node.data !== null && typeof node.data === 'object' && typeof node.data.data === 'string' && node.data.data.startsWith('0x')) {
      facts.hasRevertData = true
      if (node.data.data.length > 2) facts.revertData ??= node.data.data as Hex
    }
    node = node.cause
  }
  return facts
}

/**
 * Decides which channel a failed RPC call failed in. See {@link RpcFailureKind} for why the
 * three-way distinction is load-bearing.
 *
 * Order matters and is deliberate: structured revert evidence (revert data, geth's code `3`) beats
 * everything, then structured transport evidence (HTTP status, viem transport class, rate-limit RPC
 * code, a Node `E*` errno), then message dialects.
 *
 * Within the message tier, NODE-STATE TEXT IS CHECKED FIRST — ahead of both revert and transport
 * text. A node-state error names a block, not an outcome ("header not found"), and nothing else in
 * the message tier is entitled to it: reading it as a revert is the C4-H1 bug, and reading it as a
 * plain transport failure loses the diagnostic. Revert text still wins over transport text (the
 * order the two have always had), so a verbose viem `CallExecutionError` that happens to quote a URL
 * containing "socket" is not mistaken for a network failure.
 *
 * (The spec sketch for this fix listed revert text *after* transport text. It is kept before, as it
 * always was: flipping it would reclassify every verbose viem revert whose quoted URL/request body
 * happens to contain a transport word — which has its own pinned regression test — and that is a
 * strictly different, much larger change than the node-state tier this fix is about.)
 *
 * An unrecognized shape is `execution`, unchanged. A node that answered at all, in a dialect we do
 * not know, is far more likely reporting a revert than a dead transport — and that keeps the
 * existing "candidate dies, others unaffected" semantics as the default rather than turning every
 * odd error into an `inconclusive` search.
 */
export function classifyRpcError(err: unknown): RpcFailureKind {
  const facts = collectFacts(err)

  if (facts.hasRevertData) return 'execution'
  if (facts.numericCodes.includes(REVERT_RPC_CODE)) return 'execution'

  if (facts.statuses.some((s) => s >= 400)) return 'transport'
  if (facts.names.some((n) => TRANSPORT_ERROR_NAMES.has(n))) return 'transport'
  if (facts.numericCodes.some((c) => TRANSPORT_RPC_CODES.has(c))) return 'transport'
  // Node system errors (`ECONNREFUSED`, `ETIMEDOUT`, `UND_ERR_CONNECT_TIMEOUT`, ...) are string codes.
  if (facts.stringCodes.some((c) => /^(e[a-z_]+|und_err_|err_)/i.test(c))) return 'transport'

  if (facts.messages.some((m) => NODE_STATE_MESSAGE.test(m))) return 'unavailable'
  if (facts.messages.some((m) => REVERT_MESSAGE.test(m))) return 'execution'
  if (facts.messages.some((m) => TRANSPORT_MESSAGE.test(m))) return 'transport'

  return 'execution'
}

/**
 * Extracts the raw revert data from a failed `eth_call`'s error shape, if any is present — a thin
 * read of {@link collectFacts}, so it walks the same `cause` chain and honours the same "top-level
 * `data`, or one level in at `data.data`" shapes as classification does, by construction rather
 * than by two implementations agreeing. `undefined` means the revert carried NO data at all (a
 * zero-length `0x` counts as none).
 *
 * This is the amount-independence seam: an execution-channel revert with NO data is the pool-absent
 * shape (v2's `getReserves()` on an address with no contract there decodes nothing because there is
 * nothing to decode; a v3/v4 quoter reverting because there is no pool at that key carries no error
 * payload either) — a fact about the *chain*, true for every amount and every caller, so it is safe
 * to remember. A revert WITH data — `NotEnoughLiquidity(poolId)`, a hook rejecting the call, a
 * zero-output rounding revert — names a REASON, and a reason can depend on how much was asked for or
 * who was asking. See `search/waves.ts`'s `recordFailures` for where this decides whether a failure
 * is allowed into the (cross-request-shared) negative cache.
 */
export function revertDataOf(err: unknown): Hex | undefined {
  return collectFacts(err).revertData
}

// ---------------------------------------------------------------------------
// Global request semaphore (C4-P6).
//
// `mapConcurrent`'s `limit` used to be the ONLY concurrency bound in this package, and it is
// per-CALL — every `mapConcurrent(items, MAX_CONCURRENT_CALLS, fn)` batch gets its own fresh
// budget. That is fine in isolation, but wave 0 fires several such batches at once (hint
// validation, route probes, and — for swaps — the readiness reads, all under one `Promise.all` in
// `search/waves.ts#wave0`), so the REAL peak in-flight `client.request` count is the SUM of every
// concurrently-running batch's own limit, not any single one of them (measured at ~44 for a
// realistic wave 0, more than double the doc comment's claimed bound). A {@link Semaphore} fixes
// that by being a bound the ROUTER holds once (`createSemaphore` in `router.ts#createRouter`) and
// threads into every function that actually issues a `client.request`.
//
// THE FULL GATED SET (F3) — every one of these acquires/releases the SAME router-instance
// semaphore around its own `client.request`, and nothing else in this package talks to the
// transport at all:
//
//   - `ethCall` (this file) — every `eth_call`: quoting (`quote.ts`'s `quoteCandidates`/
//     `probeQuotes`), readiness's three ERC-20/Permit2 reads (`verify/readiness.ts#readErc20State`),
//     and hint validation (`search/waves.ts#resolveHints`).
//   - `scanLogs` (`internal/logScan.ts`) — every `eth_getLogs`: adjacency/fee-tier/exact-pair
//     discovery (`search/discovery.ts`).
//   - `preflightTx` (`verify/preflight.ts`) — the leader's simulation `eth_call`
//     (`search/leader.ts#verifyLeader`); raw, not through `ethCall`, because it simulates a real
//     transaction rather than decoding a quoter's return data.
//   - `getNativeBalance` (`verify/readiness.ts`) — the native-`currencyIn` `eth_getBalance` read;
//     raw for the same reason (`eth_getBalance` has no revert/quote semantics to classify).
//   - `ethCallLatest` (`router.ts`) — `ingestPool`'s hint-validation `eth_call` at `'latest'`; raw
//     because ingestion has no pinned search block of its own to reuse.
//   - `requestHead` (`search/waves.ts`) — the pinned-block `eth_getBlockByNumber` fetch AND its
//     head-regression refetch (`fetchBlock`); a leaf request with nothing nested inside it, so
//     gating it carries no lock-ordering risk.
//
// THE ONE DELIBERATE CARVE-OUT: `manifest.ts#validateManifest`'s `getChainId`/`eth_getCode` calls
// are NOT gated. They run at most once per router's lifetime (`router.ts#ensureManifestValidated`
// caches the result, success or config-error, forever) rather than once per search, so they cannot
// contribute to a sustained concurrency peak the way a per-search read could — see that function's
// own docs for the caching contract this carve-out depends on.
//
// THE RULE FOR ANYTHING ADDED LATER: any new function that calls `client.request` directly (rather
// than going through one of the six above) MUST accept a `Semaphore` and acquire/release it around
// that call, or it silently escapes `concurrency` exactly as `requestHead` did before F2 — a router
// with N concurrent searches making N (or more) ungated requests of its own, undercounted by every
// caller who set `concurrency` expecting it to be the real ceiling.
// ---------------------------------------------------------------------------

/** A tiny counting semaphore: at most `limit` holders of `acquire()` may be unresolved at once. */
export type Semaphore = { acquire(): Promise<void>; release(): void }

/**
 * Builds a {@link Semaphore} bounding at most `limit` concurrent holders. `acquire()` resolves
 * immediately while under the limit; once at capacity it queues (FIFO) until a `release()` frees a
 * slot. `release()` hands the freed slot directly to the next queued waiter rather than letting it
 * race a fresh `acquire()` in, so the bound is exact — `active` never exceeds `limit` even under
 * heavy contention.
 */
export function createSemaphore(limit: number): Semaphore {
  let active = 0
  const queue: (() => void)[] = []

  return {
    acquire(): Promise<void> {
      if (active < limit) {
        active++
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => {
        queue.push(() => {
          active++
          resolve()
        })
      })
    },
    release(): void {
      active--
      const next = queue.shift()
      if (next) next()
    },
  }
}

/**
 * Issues one block-pinned `eth_call` and returns the raw hex return data. Failures propagate as a
 * thrown error, classified into channels first: a transport failure is wrapped in
 * {@link TransportError} and a node-state failure in {@link NodeStateError} (a subclass of it, so
 * every `instanceof TransportError` counting site catches both) — original preserved as `cause` in
 * either case — while an execution failure — a revert, with or without data — is rethrown untouched,
 * verbatim, so callers that read revert data still see exactly what the node returned.
 *
 * The revert itself is still never *interpreted* here; that's the caller's job (see
 * {@link mapConcurrent}, which is what actually keeps a batch of these from rejecting as a whole,
 * and captures both kinds as `Error` slots for the caller to discriminate with `instanceof`).
 *
 * `semaphore` (C4-P6), when supplied, is acquired around the actual `client.request` call below and
 * released whether it succeeds, reverts, or fails in the transport — this is one of the exactly two
 * places (the other is `scanLogs`'s `eth_getLogs`) a real request goes out, so gating here is what
 * makes the router's `concurrency` option a genuine cross-batch bound rather than a per-call one.
 * Omitted (as every unit test below the router facade does) it is simply not gated, unchanged from
 * before this option existed.
 */
export async function ethCall(client: Pick<PublicClient, 'request'>, call: EthCall, blockNumber: bigint, semaphore?: Semaphore): Promise<Hex> {
  const transaction: { to: Address; data: Hex; from?: Address; value?: Hex } = { to: call.to, data: call.data }
  if (call.from !== undefined) transaction.from = call.from
  if (call.value !== undefined) transaction.value = `0x${call.value.toString(16)}`
  const blockTag = `0x${blockNumber.toString(16)}` as Hex

  await semaphore?.acquire()
  try {
    // The typed `PublicRpcSchema` declares `eth_call`'s transaction/block params in viem's internal
    // (bigint-quantity) shape, not the hex-quantity wire shape this function builds — viem's own
    // `call()` action re-formats to hex before calling `request()` too (see
    // `actions/public/call.js`), so this cast just skips re-deriving that formatter here.
    return (await client.request({ method: 'eth_call', params: [transaction, blockTag] } as any)) as Hex
  } catch (err) {
    const kind = classifyRpcError(err)
    if (kind === 'transport') {
      throw new TransportError(`eth_call to ${call.to} failed in the transport, not on-chain`, { cause: err })
    }
    if (kind === 'unavailable') {
      throw new NodeStateError(
        `eth_call to ${call.to} could not be served at block ${blockNumber} (node state unavailable) — not an on-chain answer`,
        { cause: err },
      )
    }
    throw err
  } finally {
    semaphore?.release()
  }
}

/**
 * Maps `fn` over `items`, preserving input order in the output. Never rejects: a thrown/rejected
 * `fn` call is captured as an `Error` in that item's slot rather than aborting the whole batch, so
 * one bad candidate can never take down the others.
 *
 * `limit` is either a plain number — at most `limit` `fn` calls in flight from THIS batch alone,
 * the original (pre-C4-P6) behavior, still the right choice for a caller with no shared semaphore
 * to hand in — or a {@link Semaphore}: every item is then dispatched at once (no batch-local cap of
 * its own), trusting that `fn`'s own `client.request` calls (via `ethCall`/`scanLogs`, which accept
 * this very semaphore) will throttle themselves against the REAL, cross-batch bound. Layering a
 * second, batch-local cap on top in that case would not be wrong, only redundant — and, if this
 * function's own workers additionally held the shared semaphore around the whole `fn` call, actively
 * harmful: a nested acquire against the same semaphore an inner `ethCall` also acquires halves the
 * effective concurrency (or deadlocks it at `limit === 1`) for no benefit. So it does not.
 */
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number | Semaphore,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<R | Error>> {
  const results: Array<R | Error> = new Array(items.length)

  async function run(item: T, i: number): Promise<void> {
    try {
      results[i] = await fn(item, i)
    } catch (err) {
      results[i] = err instanceof Error ? err : new Error(String(err))
    }
  }

  if (typeof limit !== 'number') {
    await Promise.all(items.map((item, i) => run(item, i)))
    return results
  }

  let next = 0
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      await run(items[i]!, i)
    }
  }

  const workerCount = Math.max(0, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}
