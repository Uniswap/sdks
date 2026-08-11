import type { Hex } from 'viem'

import type { BlockRange } from '../types'

// ---------------------------------------------------------------------------
// RPC error classification — one cause-chain walk, and everything read off it.
//
// A failed `client.request` is a string, a code, a status and a nest of
// `cause`s, and this package has to answer three different questions about
// that mess: WHICH CHANNEL did it fail in (`classifyRpcError`), WHAT REVERT
// BYTES did it carry (`revertDataOf`), and DOES IT DECLARE A WINDOW the
// provider would have served (`parseDeclaredCap`). All three read the same
// facts, so all three go through {@link collectFacts} — the package's only
// cause-chain walker, and the reason its shape rules cannot drift apart (they
// used to: three walkers, three sets of rules, and the weakest of them lost
// geth's revert data in preflight).
//
// This is a PURE PARSER. Nothing here touches a transport, a semaphore, or a
// client; it takes an unknown and returns a verdict. The dispatch half — the
// `eth_call` seam that consumes these verdicts, the semaphore, and the
// bounded-concurrency map — lives next door in `rpc.ts`, which imports this
// file and not the other way round.
//
// The vocabulary is deliberately conservative in one direction throughout: an
// unrecognized shape is `execution` and an unrecognized message declares no
// cap, because both defaults keep the pre-existing behaviour of the caller
// that reads them.
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
 *    `query returned more than 10000 results`, `response size exceeded`, and drpc's phrasing of the
 *    same fact, `query exceeds max results 20000` (see below)
 *  - quicknode's span cap, captured live off `base-mainnet.quiknode.pro`:
 *    `eth_getLogs is limited to a 10,000 range` (JSON-RPC `-32614`)
 *
 * `state .{0,40}(not available|unavailable)` is bounded rather than `.*` so it cannot leap across a
 * whole verbose viem message to marry an unrelated "state" to an unrelated "unavailable".
 *
 * `unknown block\b` is anchored on the right so prose like "unknown blockNumber field" (a schema
 * complaint, not a node-state one) does not match — the phrase is short enough to collide otherwise.
 *
 * `limited to a N range` is anchored on BOTH a digit run and the word `range`, so it cannot match a
 * revert whose message merely says something is "limited" — the shape it exists for always states a
 * number and always calls it a range (see {@link DECLARED_CAP_LIMITED_TO}, which reads the same
 * sentence for the width itself).
 *
 * `max results` is drpc's wording for the result cap the two alternatives beside it already cover
 * (`query returned more than`, `response size`), and it was missing — found by
 * `providerConformance.test.ts`, which rebuilds each live capture from its OWN recorded fields
 * instead of pinning a transport class on by hand. Rebuilt faithfully, the drpc capture (`query
 * exceeds max results 20000, retry with the range …`) has no HTTP status, no transport-class name,
 * and a JSON-RPC code (`-32602`) that is in no code set — publicnode's archive-paywall capture
 * carries the same `-32602` for a completely unrelated failure, so the CODE can never be the
 * discriminator here and the message tier is all there is. It matched none of the three dialects and
 * fell through to the `execution` default: "the EVM rejected this", about an `eth_getLogs` no EVM
 * ever saw. That is the identical mis-tiering C4-H1 fixed for `header not found` and the -32614 fix
 * fixed for quicknode, with the identical two costs (a `no-route` could be built out of it, and
 * `logScanPolicy`'s expensive-refusal collapse never engages on a refusal that cost the node a full
 * query). The vocabulary was already in this file — {@link DENSITY_CAP_MESSAGE} reads `max results`
 * as a result-cap marker — so the defect was two regexes in one module disagreeing about the same
 * sentence.
 */
const NODE_STATE_MESSAGE =
  /header not found|block not found|unknown block\b|missing trie node|state .{0,40}(not available|unavailable)|nonexistent block|requested block|exceeded maximum block range|query returned more than|\bmax(?:imum)? results?\b|response size|limited to (?:an?\s+)?[\d][\d,_]*\s+(?:block\s+)?range/i

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
export type DeclaredCap = {
  capBlocks?: bigint
  retryRange?: BlockRange
  /**
   * Whether `capBlocks` is a DURABLE SPAN POLICY or a one-off DENSITY observation — the distinction
   * that decides whether a caller may treat it as a ceiling or only as this attempt's width.
   *
   * `'span'`  — the endpoint refuses spans wider than N, full stop, and will still refuse them in
   *             four chunks' time. quicknode: `eth_getLogs is limited to a 10,000 range`.
   * `'density'` — N is what the endpoint computed would fit under a RESULT/RESPONSE-SIZE limit at
   *             this query's density right here, and it says nothing about any other query. drpc
   *             (`query exceeds max results 20000, retry with the range …`) and alchemy both do this.
   *
   * ALCHEMY IS WHY THIS FIELD EXISTS, and it is worth spelling out because the message reads like a
   * policy and is not one. Its response-size refusal says: `Log response size exceeded. You can make
   * eth_getLogs requests with up to a 10,000 block range and no limit on the response size, OR you
   * can request any block range with a cap of 10K logs in the response. Based on your parameters …
   * this block range should work: [<8,000,000 blocks>]`. That is TWO offers, and the "10,000 block
   * range" is only the first one's terms — the endpoint demonstrably serves 8M-block windows for the
   * very same query, and 13M-block ones for a sparser one. A caller that read the 10,000 as a
   * ceiling would pin every mainnet scan 800x too narrow, forever, off a sentence the provider meant
   * as an option.
   *
   * THE DISCRIMINATOR IS DELIBERATELY CONSERVATIVE: a cap is `'span'` only when the failure mentions
   * no response-size/result-count limit AND volunteers no retry range. Anything that suggests a
   * range is describing THIS query's data (see {@link DeclaredCap.retryRange}'s note), and anything
   * that mentions a size limit is describing a second limit that the block cap alone does not
   * characterize. Misfiling a real span policy as `'density'` costs one probe per regrowth cycle;
   * misfiling a density observation as `'span'` costs the entire scan, permanently — so the doubt
   * goes to `'density'`.
   */
  capKind?: 'span' | 'density'
}

/**
 * Response-size / result-count language: the marker that a stated block count is a DENSITY
 * observation about this query rather than a span policy. Matched against the same messages
 * {@link parseDeclaredCap} reads, and captured verbatim from alchemy and drpc.
 */
const DENSITY_CAP_MESSAGE = /response size|result size|max results|too many (results|logs)|log(s)? (response|limit)|cap of [\d][\d,_]* logs|returned more than/i

/**
 * "…with up to a 10 block range…" (blastapi, alchemy). The generic `N block range` tail also
 * catches phrasings that drop the "up to a", which is the shape alchemy's response-size variant
 * uses. Digit separators are tolerated because providers write both `10000` and `10,000`.
 */
const DECLARED_CAP_BLOCKS = /\b([\d][\d,_]*) block range\b/i

/**
 * quicknode: "eth_getLogs is limited to a 10,000 range" — the same fact as {@link
 * DECLARED_CAP_BLOCKS}, said without the word "block", which is why the pattern above missed it
 * entirely. Captured live off `base-mainnet.quiknode.pro` (see `__fixtures__/providerErrors.json`)
 * in BOTH shapes viem can deliver it in: an `HttpRequestError` (status 413, the cap in `details`)
 * when the transport is unbatched, and an `RpcRequestError` (HTTP 200, `code: -32614`) when it is
 * batched — the batched one being what `cli/` actually hits.
 *
 * MISSING THIS ONE SENTENCE COST THE WHOLE FAST PATH. Base's v3 history is ~48M blocks and this
 * endpoint serves 10k of them at a time, so a scan that cannot read the cap blind-halves from
 * `MAX_SCAN_WINDOW` eleven times, settles on 7,812 (the first power-of-two step under the cap
 * rather than the cap), and then re-probes 15,624 after every four clean chunks forever. Measured
 * against this endpoint, reading the sentence is worth 1.39x on a six-scan adjacency fan-out — and
 * most of that is not the eleven probes, it is that a cap the scanner KNOWS is a ceiling stops the
 * regrowth ratchet from breaking up its own request batches (see `logScan.ts`).
 *
 * `block` stays optional so a provider that words it the other way is read by this pattern too;
 * the two are tried in order and the first to match wins.
 */
const DECLARED_CAP_LIMITED_TO = /\blimited to (?:an?\s+)?([\d][\d,_]*)\s+(?:block\s+)?range\b/i

/**
 * mevblocker-style: "range 500000 exceeds limit of 10000" — the requested span first, the accepted
 * one second. THE CAP IS THE SECOND NUMBER, deliberately captured as such rather than reusing
 * whichever group a shared pattern would put first: a caller that read the 500000 as the cap would
 * widen every subsequent request instead of narrowing it, which is the opposite of what this whole
 * module exists to do. No retry range is volunteered here — only two bare numbers either side of
 * "exceeds limit of" — so {@link DECLARED_RETRY_RANGE_DEC} (which requires a `-` between its pair)
 * correctly leaves `retryRange` unset for this dialect; the cap stands alone as a span policy.
 *
 * Verified in-tree: before this pattern existed, `parseDeclaredCap` returned `{}` for this message —
 * a live miss that cost ~11 blind halvings (`MAX_SCAN_WINDOW` down past `MIN_CHUNK`) and settled the
 * scan window at the last power-of-two step under 10,000 rather than the cap itself, ~22% narrower
 * than the endpoint would actually have served.
 */
const DECLARED_CAP_EXCEEDS_LIMIT = /\brange\s+[\d][\d,_]*\s+exceeds\s+limit\s+of\s+([\d][\d,_]*)/i

/**
 * A free-tier plan cap: "ranges over 10000 blocks are not supported on free plan". One number, no
 * suggested range, and no response-size language — a plan-tier ceiling that will refuse the identical
 * width again next request, so it reads as a span policy exactly like quicknode's `limited to` cap
 * above, not a density observation.
 *
 * Verified in-tree: also returned `{}` before this pattern existed, for the same reason as
 * {@link DECLARED_CAP_EXCEEDS_LIMIT} — neither `DECLARED_CAP_BLOCKS` (wants the literal phrase
 * `N block range`) nor `DECLARED_CAP_LIMITED_TO` (wants `limited to`) matches "ranges over N blocks".
 */
const DECLARED_CAP_RANGES_OVER = /\branges?\s+over\s+([\d][\d,_]*)\s+blocks?\b/i

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
      const cap =
        DECLARED_CAP_BLOCKS.exec(message) ??
        DECLARED_CAP_LIMITED_TO.exec(message) ??
        DECLARED_CAP_EXCEEDS_LIMIT.exec(message) ??
        DECLARED_CAP_RANGES_OVER.exec(message)
      if (cap) {
        const blocks = toBig(cap[1]!)
        if (blocks > 0n) declared.capBlocks = blocks
      }
    }
  }
  if (declared.capBlocks !== undefined) {
    // A stated block count is only a policy when nothing else in the failure says it is really about
    // how much DATA this particular query would have returned.
    const density =
      declared.retryRange !== undefined || collectFacts(err).messages.some((m) => DENSITY_CAP_MESSAGE.test(m))
    declared.capKind = density ? 'density' : 'span'
  }
  if (declared.capBlocks === undefined && declared.retryRange !== undefined) {
    // A suggested RANGE is a width, not a policy: it is what the provider computed would fit under a
    // RESULT cap at this query's density right here, so it is only as durable as that density. It can
    // therefore come back absurdly narrow — a range under `MIN_CHUNK` is only plausible at densities
    // above ~20k logs per 128 blocks — and the scanner treats such a width exactly as it treats a
    // declared block cap that low: give the sub-range up rather than chase it (`logScan.ts`).
    declared.capBlocks = declared.retryRange.toBlock - declared.retryRange.fromBlock + 1n
    declared.capKind = 'density'
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

/**
 * JSON-RPC codes that mean "I will not serve a request over THIS BLOCK SPAN" — a range cap, which is
 * `unavailable` (see {@link RpcFailureKind}) rather than transport or execution.
 *
 * `-32614` is quicknode's, captured live off `base-mainnet.quiknode.pro`. It needs a STRUCTURED rule
 * and not just the message tier because of how the two transports differ: unbatched, the cap arrives
 * as an HTTP 413 and the status rule above already catches it; BATCHED, it arrives inside a 200 with
 * no status anywhere, no viem transport class, and a message (`eth_getLogs is limited to a 10,000
 * range`) that matched none of the three dialects — so it fell all the way through to the default and
 * was classified `execution`, i.e. "the EVM rejected this", about a request the EVM never saw. That
 * is the same mis-tiering C4-H1 fixed for `header not found`, and it has the same two costs: a
 * `no-route` could be built out of it, and `logScan.ts`'s expensive-refusal fast path (which fires on
 * `transport`/`unavailable`) never engaged.
 */
const NODE_STATE_RPC_CODES = new Set([-32614])

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
   * `rpcErrors.test.ts` pins the asymmetry in both directions.
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
 * code, a Node `E*` errno) and the structured node-state codes beside it
 * ({@link NODE_STATE_RPC_CODES}), then message dialects.
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
  if (facts.numericCodes.some((c) => NODE_STATE_RPC_CODES.has(c))) return 'unavailable'
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
 * who was asking. See `search/pump.ts`'s reverted-measurement handling for where this decides
 * whether a failure is allowed into the (cross-request-shared) negative cache.
 */
export function revertDataOf(err: unknown): Hex | undefined {
  return collectFacts(err).revertData
}
