import type { Address, Hex } from 'viem'

// ---------------------------------------------------------------------------
// Domain model
//
// All types are defined in this package (viem-native — Address, Hex, bigint);
// the ethers-based Uniswap SDKs appear only as devDependencies in tests.
//
// Data flows one way down a ladder of types, and each arrow is a module
// boundary:
//
//   CurrencyRef -> PoolHint -> PoolRecord -> RouteLeg[] = RouteCandidate
//               (validate)  (select)      (quote)
//       -> QuotedRoute -> ExecutionPlan -> EncodedTx -> SwapResult
//           (compile)      (encode)       (verify)
//
// Nothing upstream knows about anything downstream: discovery never sees
// quotes, quoting never sees Universal Router commands, the compiler never
// sees RPC.
// ---------------------------------------------------------------------------

/** The three AMM protocols supported in v1, as internal ProtocolModules (no public plugin API). */
export const PROTOCOLS = ['v2', 'v3', 'v4'] as const
export type Protocol = (typeof PROTOCOLS)[number]

/**
 * Builds a `Record<Protocol, T>` from `build`, one call per entry of {@link PROTOCOLS}. The single
 * seam that asserts `Object.fromEntries`' index-signature result really does carry exactly the
 * `v2`/`v3`/`v4` keys `PROTOCOLS` iterated — true by construction, but not something the type
 * checker can see through a generic `fromEntries` — so every caller gets a real `Record`, not a
 * `{} as Record<Protocol, T>` seed asserted before a single entry exists.
 */
export function protocolRecord<T>(build: (p: Protocol) => T): Record<Protocol, T> {
  return Object.fromEntries(PROTOCOLS.map((p) => [p, build(p)])) as unknown as Record<Protocol, T>
}

export type CurrencyRef = Address | 'native'
// Amounts are raw bigint everywhere; no decimal parsing.
// Graph search normalizes native/wrapped into one "native family" node;
// materialized routes always use concrete currencies.

export type PoolKey = {
  // defined here, not imported from v4-sdk
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}

export type PoolHint =
  // an unvalidated assertion from the caller
  | { protocol: 'v2'; token0: Address; token1: Address; pool?: Address }
  | { protocol: 'v3'; token0: Address; token1: Address; fee: number; pool?: Address }
  | { protocol: 'v4'; poolKey: PoolKey; hookData?: Hex }

/**
 * A validated pool identity, normalized so no consumer ever has to re-derive one from the arms.
 *
 * The protocol-specific arms spell identity and currencies differently — v2/v3 by contract address
 * plus `token0`/`token1`, v4 by `poolId` plus a `PoolKey` whose native side is address(0) — and
 * every consumer wants the same two facts out of them: what this pool *is*, and which two currencies
 * it holds. So both are carried on every arm:
 *
 *  - `id`: `${protocol}:${lowercased address-or-poolId}`. The pool index's key, the unit `routeId`
 *    is built from, and the identity the plan compiler dedupes on.
 *  - `currencies`: the pool's own two currencies in DOMAIN form (v4's address(0) becomes the
 *    `'native'` CurrencyRef; v2/v3 addresses pass through — a v2/v3 pool can only ever hold wrapped
 *    native), in the pool key's own sorted order.
 *
 * Both are derived, and derived exactly once, by the constructors in `protocols/poolRef.ts` — the
 * only place a `PoolRef` is ever built. Nothing downstream switches on `protocol` to recompute them.
 */
export type PoolRef = { id: string; currencies: [CurrencyRef, CurrencyRef] } & (
  // validated pool identity
  | { protocol: 'v2'; address: Address; token0: Address; token1: Address }
  | { protocol: 'v3'; address: Address; token0: Address; token1: Address; fee: number }
  | { protocol: 'v4'; poolId: Hex; poolKey: PoolKey }
)

export type PoolRecord = {
  // identity + index metadata (selection input)
  pool: PoolRef
  createdAtBlock?: bigint | undefined
  source: 'event' | 'factory' | 'hint'
  lastQuoteSuccessBlock?: bigint | undefined
  /**
   * How many DISTINCT blocks this pool has been marked unquoteable at, and the most recent of them
   * — the two fields together are a distinct-block counter that costs O(1) memory instead of the
   * unbounded set of block numbers it stands in for (`PoolIndex.markNegative` only increments when
   * the block differs from the last one recorded).
   *
   * They exist for exactly one decision: discrediting a `source: 'hint'` pool that has never once
   * quoted (see `pools/poolIndex.ts#isDiscredited`). A hint is unverifiable by construction for
   * v2/v4 — `validateHint` is a pure local derivation of an address/poolId from the caller's own
   * numbers, so ANY well-formed key "validates" — and hint provenance outranks every other source
   * forever. Failing to quote at two separate blocks is the only evidence available that the pool
   * the caller asserted does not, in fact, exist.
   */
  quoteFailureBlocks?: number | undefined
  lastQuoteFailureBlock?: bigint | undefined
}

export type RouteLeg = {
  // one hop with concrete currencies
  pool: PoolRef
  currencyIn: CurrencyRef
  currencyOut: CurrencyRef
  hookData?: Hex // v4 only; from the request-scoped hint map
}

export type RouteCandidate = { legs: RouteLeg[] } // 1 or 2 legs in v1

export type RouteQuote = {
  amountIn: bigint
  amountOut: bigint
  intermediateAmounts: bigint[] // realized per-leg outputs (chained quoting)
  /**
   * The quoter's own gas figure for this route, when the chain reported one — REPORTED, NEVER
   * RANKED, and NEVER a transaction gas limit.
   *
   * WHERE IT COMES FROM. QuoterV2 (`quoteExactInput` → `(amountOut, …, gasEstimate)`) and V4Quoter
   * (`quoteExactInput` → `(amountOut, gasEstimate)`) each return a gas word alongside the amount,
   * measured by the quoter as `gasBefore - gasleft()` around the swap it simulated. This package
   * decoded and discarded it until now; here it is, unmodified.
   *
   * WHEN IT IS ABSENT — and absence is a fact, not a gap:
   *  - v2 routes NEVER carry one. A v2 quote is local constant-product math over `getReserves()`
   *    (`protocols/v2.ts#getAmountOut`); no swap is simulated anywhere, so there is no measurement
   *    to report and inventing one would be a guess dressed as a reading.
   *  - A route quoted in two rounds (a protocol boundary, or two solo v2 legs — see
   *    `quote/quote.ts`'s segmentation header) carries the SUM of its segments' estimates, and only
   *    when EVERY segment reported one. One v2 segment anywhere therefore makes the whole route's
   *    estimate absent, rather than reporting a partial sum that silently under-counts a leg. The
   *    sum is defensible because the segments really are separate on-chain swaps under the
   *    Universal Router too — what it omits is the same thing a single-segment estimate omits (see
   *    below), plus the router's own hop-to-hop custody, not a whole leg's swap cost.
   *  - A route the quoter priced but whose response predates this field (an old recorded session,
   *    a hand-built `QuotedRoute`) simply has no key.
   *
   * WHAT IT IS NOT. It is not a gas limit and must not be used as one: it covers the swap inside
   * the quoter and nothing else — no 21k intrinsic, no calldata cost, no Permit2 pull, no Universal
   * Router dispatch/custody/wrapping, no token-specific transfer quirks. The real number for a
   * transaction comes from preflight/`eth_estimateGas` against the encoded `tx` at execution time
   * (`verify/preflight.ts`), which is what `SwapResult`'s verification already does.
   *
   * IT IS ALSO ENVELOPE-DEPENDENT — the same route at the same block yields DIFFERENT values
   * depending on what else the call that carried it had already touched, because `gasleft()`
   * accounting includes EIP-2929 cold/warm state-access costs and this package aggregates quoting
   * rounds through Multicall3 (`internal/multicall.ts`). Measured live on mainnet at block
   * 25,707,079, one route quoted four ways:
   *
   *   v3 WETH→USDC 0.05%:  90,012 direct `eth_call`  ·  90,012 alone inside `aggregate3`
   *                        90,012 aggregated behind unrelated calls
   *                        83,512 aggregated behind ANOTHER call to the same pool  (−6,500, −7.2%)
   *   v4 ETH→USDC 0.05%:   43,222 direct  ·  43,222 alone  ·  40,722 behind the same pool (−2,500, −5.8%)
   *
   * The deltas are exactly the EIP-2929 warm/cold deltas (2,600→100 per account, 2,100→100 per
   * slot) for state an earlier inner call already warmed; `amountOut` was byte-identical in every
   * envelope. So: treat it as an APPROXIMATE figure good for RELATIVE comparison between routes
   * priced in the same round and for display (the CLI prints `~90k gas`), with a few percent of
   * envelope noise — never as an absolute cost, and never as a number to send a transaction with.
   *
   * NOTHING IN THIS PACKAGE RANKS ON IT. `rankRoutes` (`quote/quote.ts`) orders by `amountOut` and
   * its tie-breakers alone; a route with no estimate is never disadvantaged, and a cheaper-gas route
   * is never promoted. Gas-aware ranking would need a gas PRICE and an output-token price to be
   * meaningful, both of which are the caller's to know.
   */
  gasEstimate?: bigint
}

export type QuotedRoute = {
  route: RouteCandidate
  quote: RouteQuote
  /**
   * Set (to `true`; absent otherwise) when `rankRoutes` (`quote/quote.ts`) promoted this route ahead
   * of a higher-`amountOut` but "complex" (mixed-protocol or hooked) leader under the simplicity
   * margin (`SIMPLICITY_MARGIN_BPS`) — the one ranking decision that overrides the
   * amountOut-descending order, made observable here rather than only inferable by a caller
   * re-deriving `compareRoutes`' own ordering and noticing it disagrees with `amountOut` alone. Set
   * on at most one route per ranked list (a promoted candidate is by construction non-complex, so
   * `rankRoutes` promotes at most once).
   *
   * IT LIVES ON `QuotedRoute`, NOT ON `RankedRoute`, AND THAT IS THE WHOLE POINT. It used to sit on
   * `RankedRoute`, which meant the QUOTE surface — where `best` and `alternatives` are plain
   * `QuotedRoute`s and `router.ts#toQuoted` rebuilds each one from `{ route, quote }` — destroyed it
   * on the way out. The observable result was a `QuoteResult` whose `best` priced BELOW
   * `alternatives[0]` with nothing anywhere saying why (live on Base: 1,906.256081 USDC led
   * 1,906.567949 USDC from a hooked v4 pool, 1.6 bps inside the margin), which reads as a broken
   * sort rather than as the documented margin. Ranking is a fact about a QUOTE; only `execution` and
   * `revertData` are facts about verification, so only those two belong one level down.
   *
   * A FACT ABOUT THE ROUTE, NOT ABOUT FINAL PLACEMENT — it USUALLY ends up leading (`best`), since
   * promotion happens before verification and nothing downstream un-does it, but it is not
   * guaranteed to: `rankRoutes` runs before `search/leader.ts#verifyLeader` ever simulates anything,
   * so a promoted candidate that itself then fails preflight can still be demoted into `alternatives`
   * (by a different, verified candidate becoming `best`) while carrying this marker right along with
   * it — the marker travels with the route object, not with whichever slot it lands in. A caller that
   * cares only about the leader's own promotion history reads it off `best`; one auditing the whole
   * ranking (why did a lower-`amountOut` route ever outrank this one) may find it on an alternative
   * too.
   */
  promotedOverComplex?: true
}

export type EncodedTx = { to: Address; data: Hex; value: bigint }

export type BlockRef = { number: bigint; hash: Hex; timestamp: bigint }

export type BlockRange = { fromBlock: bigint; toBlock: bigint }

export type Permit2PermitSingle = {
  // defined here, not imported from permit2-sdk
  details: { token: Address; amount: bigint; expiration: number; nonce: number }
  spender: Address
  sigDeadline: bigint
  signature: Hex
}

// `hookData` flow: hints may carry it; the pool index never stores it (it can
// depend on trader, amount, direction); the engine keeps a request-scoped
// poolId -> hookData map from the request's hints and applies it when legs
// are materialized. A resolveHookData callback is future work.

// ---------------------------------------------------------------------------
// RPC primitives
// ---------------------------------------------------------------------------

export type EthCall = { to: Address; data: Hex; value?: bigint; from?: Address }

/**
 * What one quote call's return data decodes to: the amount, plus the quoter's own gas figure when
 * the protocol's quoter reports one (v3/v4 do; v2's local reserve math does not — see
 * {@link RouteQuote.gasEstimate}). A `decode` that cannot produce an amount THROWS, exactly as
 * before this shape carried two fields — a failed decode is the pool-absent/reverted signal
 * `quote/quote.ts` accounts for, never a `{ amountOut: 0n }`.
 */
export type DecodedQuote = { amountOut: bigint; gasEstimate?: bigint }

export type QuoteCall = { call: EthCall; decode(returnData: Hex): DecodedQuote }

export type LogQuery = { address: Address; topics: (Hex | null)[] }

/**
 * The MERGED form of {@link LogQuery}: several emitters, and several accepted values per topic slot.
 *
 * `eth_getLogs` has always supported both — an `address` ARRAY (match any of these contracts) and an
 * ARRAY WITHIN one topic position (match any of these values there) — and the adjacency scans are
 * built on exactly that: one request asks the v2 factory AND the v3 factory, for `PairCreated` OR
 * `PoolCreated`, with either of the trade's two endpoints in the token slot. Twelve query chains
 * (3 protocols x 2 endpoints x 2 token slots) collapse to four — six on a chain whose v2 and v3
 * deployed apart, where the pre-v3 stretch is a segment only v2 can be asked about. See
 * `protocols/adjacency.ts#adjacencyQueries` for the construction and `search/adjacencyPlan.ts` for
 * which scopes may legally share one request.
 */
export type MergedLogQuery = { address: Address[]; topics: (Hex | Hex[] | null)[] }

/** Custody semantics for a single execution operation: who pays in, who receives out. */
export type Custody = { payer: 'trader-via-permit2' | 'router'; recipient: 'router' | 'final' }

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export type QuoteRequest = {
  tokenIn: CurrencyRef
  tokenOut: CurrencyRef
  amountIn: bigint
  focusToken?: CurrencyRef
  hints?: PoolHint[]
  signal?: AbortSignal // e.g. AbortSignal.timeout(900) for latency SLAs
}

export type SwapRequest = QuoteRequest & {
  trader: Address
  recipient?: Address // default: trader
  slippageBps?: number // default 100
  deadlineSeconds?: number // default 300, from pinned block timestamp
  permit?: Permit2PermitSingle
}

// ---------------------------------------------------------------------------
// Results
//
// Quotes never carry transactions; swaps always do. The two unions do not
// overlap.
//
// TWO FIELDS ARE STATUS-AGNOSTIC AND THEREFORE HOISTED OUT OF THE VARIANTS.
// Every result reports how far the search got (`search`) and what it priced
// (`alternatives`), whatever its verdict — so status-agnostic code (logging,
// telemetry, a caller diffing two results) reads both off any result without
// narrowing to a variant first. Hoisting also makes the empty array mean what
// it says — "nothing else priced" — instead of being indistinguishable from
// "this variant does not carry the field at all".
//
// A swap's `no-route` consequently also carries `alternatives`: a completed
// search whose leader never verified (every attempted candidate failed
// preflight) is `no-route`, not `inconclusive`, and the candidates that were
// tried — including the nominal best — are listed there so the caller can see
// what was attempted.
//
// `INCONCLUSIVE` IS AN INCOMPLETE SEARCH, NOT AN EMPTY ONE. A search that
// priced twelve routes and compiled a transaction before the caller's
// `AbortSignal.timeout(900)` fired hands all of that back — `best`, `tx`,
// `alternatives` — alongside the `reason` it cannot be *promised* as
// `ready`/`needs-action`. Both are optional because the search may equally
// have been cut off before finding anything, or have found only routes the
// chain authoritatively rejected: `best` is offered when a route is still
// *plausible* (nobody could verify it), and a candidate that reverted in
// preflight is demoted to `alternatives` with `execution: 'failed'` exactly as
// it would be on the completed `no-route` path. A route the chain refused is
// not a lead, whether or not the search that found it ran to completion — so
// `if (r.best)` is the whole test, and it never hands back known-broken
// calldata.
//
// `best` and `alternatives` are one type per union — `RankedRoute` for swaps,
// `QuotedRoute` for quotes — so `.execution` is readable off either without
// knowing which one is in hand. `ready`'s `best.execution` is always
// `'verified'` at runtime, and `needs-action`'s always `'needs-action'`
// (`assertResultCoherent` enforces both); the type stays the wider
// `RankedRoute` rather than a narrowed literal so the two fields never diverge.
// Quote results carry plain `QuotedRoute`s: quoting verifies nothing, so there
// is no execution status to report and none rides along.
// ---------------------------------------------------------------------------

/**
 * Closed, stable vocabulary for {@link Reason}'s `code` — every shape a terminal (`no-route`/
 * `inconclusive`) result's `reason` can carry, across both {@link SwapResult} and {@link QuoteResult}.
 *
 * `reason` used to be prose (`'rpc-unavailable'`, `'discovery incomplete (v2:partial)'`, ...), which
 * reads fine in a log line but is not something a consumer can safely branch on: the README already
 * documented two of these strings (`rpc-unavailable`/`rpc-degraded`) as if they were an API, and
 * nothing stopped the prose around them from drifting the moment someone edited a message for
 * clarity. `code` is the part of `reason` a caller may `switch`/`===` on; `detail` (see {@link Reason})
 * is the prose, free to reword without being a breaking change.
 *
 * Every current emission maps onto exactly one of these seven:
 *
 *  - `'rpc-unavailable'` — total outage: not even the pinned block could be fetched, so nothing was
 *    searched at all (`router.ts#rpcUnavailable`).
 *  - `'rpc-degraded'` — partial outage: some `eth_call`s were 429'd/timed out/lost, the verification
 *    channel lost a call, or the pinned head regressed — real partial results came back, but the
 *    search cannot be promised complete (`router.ts#inconclusiveReason`).
 *  - `'aborted'` — the caller's `AbortSignal` fired before the search finished.
 *  - `'discovery-incomplete'` — one or more protocols' log-scan discovery is `partial`/`failed`.
 *  - `'quotes-unattempted'` — the search was cut off with quote candidates still unquoted.
 *  - `'no-viable-route'` — the search completed and never priced a single candidate.
 *  - `'no-route-verified'` — the search completed, priced at least one candidate, but none of them
 *    could be turned into a verified/executable plan (every preflight reverted, or nothing compiled —
 *    see `plan/compile.ts`'s closed supported set); `detail` names the cause when one is known.
 */
export const REASON_CODES = [
  'rpc-unavailable',
  'rpc-degraded',
  'aborted',
  'discovery-incomplete',
  'quotes-unattempted',
  'no-viable-route',
  'no-route-verified',
] as const
export type ReasonCode = (typeof REASON_CODES)[number]

/**
 * A terminal result's cause: `code` is the closed, stable vocabulary a caller may branch on;
 * `detail` is human-readable prose for logs and error text, carrying no contract of its own — it
 * may be reworded, shortened, or restructured release to release without that being a breaking
 * change (F6: it is NOT a verbatim, pinned copy of any past message — several `code`s were given
 * fuller prose than the bare strings `reason` used to be). The one thing every `detail` still does
 * is name a cause when the engine has a specific one to give beyond the code itself — e.g.
 * `no-route-verified`'s compile-error suffix, or `discovery-incomplete`'s per-protocol status list.
 */
export type Reason = { code: ReasonCode; detail: string }

/** The fields every {@link SwapResult} carries, whatever its status. */
type ResultBase = { search: SearchReport; alternatives: RankedRoute[] }

/**
 * The compiled plan's own on-chain limits, echoed onto a `ready`/`needs-action` result (C4-P7) so a
 * caller can log/compare what the plan actually asserts without re-deriving it from `slippageBps`/
 * `deadlineSeconds` and the pinned block — both already exist on `ExecutionPlan.deliverOutput` and
 * the deadline handed to the encoder (`search/leader.ts#compileAndEncode`); this is that same pair,
 * not a re-computation with its own chance to disagree with the encoded `tx`.
 */
export type CompiledLimits = { minAmountOut: bigint; deadline: bigint }

export type SwapResult = ResultBase &
  (
    | { status: 'ready'; best: RankedRoute; tx: EncodedTx; execution: { verifiedAtBlock: BlockRef }; limits: CompiledLimits }
    // `requirements` is a plain array; its non-emptiness is an invariant of the classifier
    // (`assertResultCoherent` enforces it), not a tuple type — a `[R, ...R[]]` here would buy one
    // guarantee and cost every caller that builds or maps such a list.
    | {
        status: 'needs-action'
        best: RankedRoute
        tx: EncodedTx
        requirements: ExecutionRequirement[]
        limits: CompiledLimits
      }
    | { status: 'no-route'; reason: Reason }
    // TWO ARMS, NOT ONE WITH TWO OPTIONAL FIELDS. `tx` is calldata FOR `best`; a `tx` with no `best`
    // is a dangling reference — the caller is handed bytes to send with nothing naming the route they
    // execute. Splitting the arm makes that shape fail to COMPILE in any producer, rather than being
    // caught only at runtime by `internal/testing.ts#assertResultCoherent` (whose check stays: it is
    // the belt to this braces, and the only line of defence for a JS caller building results by hand).
    //
    // Both arms declare both fields, so a reader that has narrowed to `'inconclusive'` still reaches
    // `result.best` / `result.tx` with no further narrowing — the split constrains PRODUCERS only.
    | { status: 'inconclusive'; reason: Reason; best?: undefined; tx?: undefined }
    | { status: 'inconclusive'; reason: Reason; best: RankedRoute; tx?: EncodedTx }
  )

export type QuoteResult = { search: SearchReport; alternatives: QuotedRoute[] } &
  (
    | { status: 'quote'; best: QuotedRoute }
    // A quote's `no-route`/`inconclusive` always carries an EMPTY `alternatives`: quoting has no
    // verification step to demote a leader over, so either something priced (and the leader is
    // reported `quote`, however incomplete the search that found it) or nothing did and there are no
    // runners-up to list. The field is present so callers need not narrow to read it, not because
    // these two variants can populate it.
    | { status: 'no-route'; reason: Reason }
    // NO `best` HERE, AND THAT ASYMMETRY WITH `SwapResult` IS DELIBERATE. `classifyQuote` reports a
    // leader as `status: 'quote'` however incomplete the search that found it — a price is a price,
    // and quoting has no verification step that could make one provisional. So a quote is
    // `inconclusive` only when NOTHING priced, and there is no leader to carry. (The truncation
    // signal a caller needs is on `search`: `aborted`, the per-protocol `discovery` statuses, and
    // `quoting.unattempted`, which is the same evidence the reason code is built from.) A swap's
    // `inconclusive` genuinely can carry a leader, because verification is a step that can be cut
    // short with the route already priced and compiled — hence the two arms over there.
    | { status: 'inconclusive'; reason: Reason }
  )

export type ExecutionRequirement =
  // several can apply at once. Permit-signature production (a `permit2-signature` requirement) is
  // future work: `verify/readiness.ts` never emits one today, so no such arm exists here yet.
  | { kind: 'erc20-approval'; token: Address; spender: Address; minimumAmount: bigint }
  | { kind: 'permit2-allowance'; token: Address; spender: Address; minimumAmount: bigint }
  | { kind: 'insufficient-balance'; token: CurrencyRef; required: bigint; available: bigint }

/**
 * A quoted route plus what verification learned about it.
 *
 * `revertData` is the raw, uninterpreted return data of the preflight simulation that failed the
 * route — verbatim bytes from the node, never decoded or explained here (the caller owns the error
 * ABIs of whatever hooks and tokens its route touched). It is present only on candidates the chain
 * authoritatively rejected: an `execution: 'failed'` candidate whose simulation reverted *with*
 * data. A `'verified'` route never has it, and neither does an `'unverified'` one — a simulation
 * that failed in the transport channel never reached the chain, so there is nothing to report.
 */
export type RankedRoute = QuotedRoute & {
  execution: 'verified' | 'needs-action' | 'unverified' | 'failed'
  revertData?: Hex
}

// ---------------------------------------------------------------------------
// SearchReport — four kinds of "complete"
//
// Discovery coverage, enumeration pruning, quote completion, and execution
// verification are independent axes, reported independently.
// ---------------------------------------------------------------------------

export type SearchReport = {
  block: BlockRef
  /**
   * Per-protocol discovery coverage — CUMULATIVE INDEX KNOWLEDGE, not this run's scan traffic.
   *
   * `coveredRanges` is the merged set of blocks this search's index can *currently* answer for, over
   * the demanded scopes (this trade's two endpoints), each `demand − uncovered`, queried against the
   * index right after this search's own scans landed and INTERSECTED across the two endpoints — not
   * unioned. This is AND, matching how `discoveryStatus` judges completeness (every endpoint, by
   * name, must be fully known before the protocol counts as `complete`): a route needs every pool
   * touching either endpoint, so a bar built from the union of two endpoints' knowledge would read
   * near-full while the status word next to it still said `partial`, whenever one endpoint happened
   * to be fully cached and the other had never been touched at all. It is stable and monotone across
   * searches that share a cache — a warm run that scans nothing new still reports everything the
   * cache already knows, and running the same search twice in a row can only grow (never shrink) the
   * covered fraction (both endpoints' individual coverage only grows, and intersection preserves that
   * monotonicity). This is deliberately NOT a record of which ranges this particular run's
   * `eth_getLogs` calls happened to walk; that number resets every search and would make the reported
   * coverage drift downward as the cache warms and there is less left to scan — exactly the dishonesty
   * this field exists to rule out. `demandFloor` is the deployment-floor block the demand is measured
   * from — fixed per protocol, so a percentage/denominator built from it (`head - demandFloor + 1`)
   * does not wander between runs depending on which sub-range happened to get scanned.
   */
  discovery: Record<
    Protocol,
    { status: 'complete' | 'partial' | 'disabled' | 'failed'; coveredRanges: BlockRange[]; demandFloor: bigint }
  >
  enumeration: {
    exhaustiveWithinMaxHops: boolean
    intermediatesDiscovered: number
    intermediatesSelected: number
    candidatesGenerated: number
    /** Pools dropped by the per-pair cap (`MAX_POOLS_DIRECT` for the direct pair, `MAX_POOLS_PER_LEG`
     * for a two-hop leg selection), summed across every direct pair and two-hop leg selection — a
     * pool-count, never a candidate-count. */
    poolsPruned: number
    /** Whole candidates dropped by the total-candidate cap (`MAX_QUOTE_CANDIDATES`) once direct and
     * two-hop candidates are combined — a candidate-count, never a pool-count. Kept apart from
     * `poolsPruned` because the two caps bite at different granularities; summing them would mix units.
     *
     * STRUCTURALLY ZERO AT TODAY'S CONSTANTS (C4-P7): `MAX_QUOTE_CANDIDATES` is DERIVED
     * (`constants.ts`) to exactly bound what `generateRoutes` can ever produce
     * (`MAX_POOLS_DIRECT + MAX_INTERMEDIATES × MAX_POOLS_PER_LEG²`), so this field cannot currently
     * observe a nonzero value through that function's own per-pair/intermediate caps — it is a drift
     * backstop (`search/candidates.ts`'s own comment on the final trim), reported here in case a
     * future change to the enumeration shape (a third hop, a cap relaxed independently of the
     * derivation) outpaces the derived ceiling, not because it is expected to fire today. */
    candidatesPruned: number
    /** Eligible two-hop intermediate NODES dropped by `MAX_INTERMEDIATES` — symmetric with
     * `poolsPruned`/`candidatesPruned`, and kept apart from both for the same reason: a node-count is
     * neither a pool-count nor a candidate-count. The value already existed internally
     * (`prunedIntermediates`, threaded through `search/waves.ts`'s `EngineState.enumeration`) and drove
     * `exhaustiveWithinMaxHops` before it was surfaced here — this is the same number, just made
     * observable rather than only used to decide a boolean. */
    intermediatesPruned: number
  }
  /**
   * `failed` is on-chain evidence: the quote call reverted, so that route cannot price at this
   * block. `transportFailed` is evidence about the *provider* — a 429, a timeout, a dropped socket —
   * and evidence about the chain of exactly none. A search with `transportFailed > 0` is never
   * reported `no-route`, however complete its other axes look.
   *
   * Invariant: `attempted === succeeded + failed + transportFailed`. `unattempted` counts candidates
   * that were never dispatched at all (an abort landed first) and is not part of that sum.
   *
   * READ THIS AS PROBE-INCLUSIVE, NOT ROUTE-FRAMED, OR `succeeded` WILL MISLEAD. Three separate
   * channels feed these five counters (`search/waves.ts`):
   *
   *  1. Route quotes (`runRouteProbes`) — wave 0's direct-pair probes, where the quote call *is* the
   *     existence check and a success *is* a route. Counted here AND in `enumeration.candidatesGenerated`.
   *  2. Enumerated quotes (`quoteNew`) — candidates `generateRoutes` built from discovered pools.
   *     Counted here AND in `enumeration.candidatesGenerated`.
   *  3. Discovery probes (`runDiscoveryProbes`) — single-leg, half-pair existence checks
   *     (`tokenIn -> core`, `neighbor -> tokenOut`) run purely to learn whether a hinted or
   *     newly-scanned pool exists, so a fabricated hint accumulates the failure history
   *     `isDiscredited` reads. Counted HERE ONLY: `candidatesGenerated` never sees them, because a
   *     half-pair leg is not a route and can NEVER become one — its priced amount is for one leg at
   *     the full input, not a quote for anything the caller asked about, and is discarded on success.
   *
   * The consequence: `quoting.succeeded > 0 && alternatives.length === 0` (or `best` absent
   * entirely) is a NORMAL shape, not a bug — every one of `succeeded` may be a discovery probe that
   * confirmed a pool exists and nothing more. `candidatesGenerated` excludes channel 3 by
   * construction, so comparing it against `quoting.succeeded`/`attempted` directly (as if they
   * counted the same thing with a different label) will never reconcile; treat the two as answering
   * different questions — "how many candidates were built" vs. "how many on-chain calls resolved,
   * across all three channels" — rather than as the same count reported twice.
   */
  quoting: { attempted: number; succeeded: number; failed: number; transportFailed: number; unattempted: number }
  aborted: boolean
  /**
   * True when a route's execution verification (preflight simulation) could not be *carried out* —
   * the simulation call failed in the transport channel rather than reverting. Such a route stays
   * `unverified` (it may well be perfectly executable; nobody found out) and the result is
   * `inconclusive`, never `ready` and never `no-route`.
   */
  verificationDegraded: boolean
  /**
   * True when the `latest` block this search pinned was BELOW one an earlier search on the same
   * router had already pinned, and a single refetch did not resolve it — a lagging replica behind a
   * load balancer, or a deep reorg. The whole search then ran against a head the router has already
   * been past, so it is an incompleteness axis exactly like `aborted`: the result is `inconclusive`
   * (`rpc-degraded`), never an authoritative `no-route`.
   *
   * Unlike `transportFailed`/`verificationDegraded`, nothing errored: the node answered every call
   * it was asked, just about an older chain. That is precisely why it needs its own axis — there is
   * no failed call anywhere for the other two to count.
   */
  headRegressed: boolean
  /**
   * Preflight-simulation budget, reported rather than silently absorbed (C4-P7) — the one cap that
   * otherwise converts to an authoritative verdict with no visible trace: `verifyLeader`
   * (`search/leader.ts`) falls through at most `PREFLIGHT_TOP_K` reverting/uncompilable candidates
   * per wave before giving up on that wave's leader, and without this a search that reverted through
   * exactly its budget's worth of candidates is indistinguishable, from the report alone, from one
   * that tried every candidate there was.
   *
   * `preflightAttempted`: the running total of real preflight simulations (`preflightTx` calls) this
   * search has issued, across every wave — never candidates that were skipped for free (a known
   * `'verified'`/`'failed'` route, or one that failed to compile at all, which `verifyLeader`
   * explicitly does not charge against the budget).
   *
   * `preflightBudgetExhausted`: true when the MOST RECENT wave's `verifyLeader` call stopped because
   * it hit `PREFLIGHT_TOP_K` attempts while candidates it had not yet tried — and that are not
   * already known `'failed'` OR `'verified'` from an earlier wave — remained on the table (a
   * `'verified'` candidate needs nothing more from the budget; excluding only `'failed'` would report
   * exhaustion on a search whose leader is already `ready`). Recomputed every wave (like
   * `enumeration`'s pruning counters, the last call wins), so a later wave that resolves a leader
   * before exhausting the budget clears it back to `false` — and an ABORTED search always reports
   * `false` here too, by construction: the abort short-circuits `verifyLeader` before it ever reaches
   * the cap check, so this field never conflates "the caller stopped us" with "the budget stopped
   * us". Deliberately does NOT change `no-route`'s classification (see `router.ts#isSearchComplete`'s
   * comment): alternatives already make a reverted route's contribution inferable, and a route the
   * chain authoritatively rejected is real evidence whatever else the search left untried.
   */
  verification: { preflightAttempted: number; preflightBudgetExhausted: boolean }
}

// ---------------------------------------------------------------------------
// The all-zero counter blocks, spelled once.
//
// Three places need a `SearchReport`'s counters at their starting values — the
// engine's `initialState` (`search/waves.ts`), the RPC-outage report
// (`router.ts#buildOutageReport`), and the test-fixture report
// (`internal/testing.ts#emptyReport`) — and each used to restate the object
// literal in full. A counter added to one of these blocks is then a compile
// error in exactly the places that hand-write it, which is fine, and a SILENT
// omission in any place that spreads a partial, which is not: these factories
// are the single spelling, typed as the report's own slices so the fields and
// their types can never widen away from what `SearchReport` declares.
// ---------------------------------------------------------------------------

export function zeroQuoting(): SearchReport['quoting'] {
  return { attempted: 0, succeeded: 0, failed: 0, transportFailed: 0, unattempted: 0 }
}

export function zeroVerification(): SearchReport['verification'] {
  return { preflightAttempted: 0, preflightBudgetExhausted: false }
}

/**
 * The report-shaped enumeration block. Deliberately NOT shared with the engine's
 * `EngineState.enumeration`, which is a different type: it names its pruning counters
 * `prunedPools`/`prunedCandidates`/`prunedIntermediates` (the report renames them
 * `poolsPruned`/…) and carries no `exhaustiveWithinMaxHops`, because that field is a VERDICT
 * `buildReport` derives from four other axes rather than a counter the engine accumulates.
 */
export function zeroReportEnumeration(): SearchReport['enumeration'] {
  return {
    exhaustiveWithinMaxHops: false,
    intermediatesDiscovered: 0,
    intermediatesSelected: 0,
    candidatesGenerated: 0,
    poolsPruned: 0,
    candidatesPruned: 0,
    intermediatesPruned: 0,
  }
}

// ---------------------------------------------------------------------------
// Execution planning and encoding
//
// The encoder is a versioned execution compiler. The complexity is custody —
// payer semantics, recipient modes, balance sentinels, native wrapping,
// Permit2 pulls, output checks, intermediate cleanup — and it differs between
// immutable Universal Router versions.
//
//   QuotedRoute -> compileExecutionPlan() -> encode<commandSet>()
// ---------------------------------------------------------------------------

export type ExecutionPlan = {
  acquireInput:
    | { kind: 'native-value'; amount: bigint }
    | { kind: 'permit2-pull'; token: Address; amount: bigint; permit?: Permit2PermitSingle }
  operations: ExecutionOperation[]
  deliverOutput: { recipient: Address; currency: CurrencyRef; minAmountOut: bigint }
}

/** The three swap-shaped operations, v4's `settleFrom`/`takeTo` spelling included — same custody
 * semantics as {@link Custody}, spelled per-protocol so a plan reads naturally either way (see
 * `plan/operations.ts#payerOf`/`recipientOf` for the shared accessor that erases the spelling). */
export type SwapOperation =
  | { kind: 'v2-swap'; legs: RouteLeg[]; payer: Custody['payer']; recipient: Custody['recipient'] }
  | { kind: 'v3-swap'; legs: RouteLeg[]; payer: Custody['payer']; recipient: Custody['recipient'] }
  | { kind: 'v4-swap'; legs: RouteLeg[]; settleFrom: Custody['payer']; takeTo: Custody['recipient'] }

/** A native-family conversion, threaded between swap operations wherever adjacent forms disagree. */
export type ConversionOperation =
  | { kind: 'wrap-native'; amount: bigint | 'router-balance' }
  | { kind: 'unwrap-native'; amount: bigint | 'router-balance' }

export type ExecutionOperation = SwapOperation | ConversionOperation

/** The Universal Router command-set families this package knows how to encode for — closed,
 * extended deliberately. `encoderFor` (`encode/index.ts`) dispatches on this set. `ur-2.1` is the
 * UR 2.1.1 deployment family: identical command/action bytes and custody to `ur-2.0`, three swap
 * payload ABIs extended with `minHopPriceX36` — see `encode/ur21.ts` for sources and proof. */
export const COMMAND_SETS = ['ur-2.0', 'ur-2.1'] as const
export type CommandSet = (typeof COMMAND_SETS)[number]

/**
 * Version binding for a concrete Universal Router deployment. Differential oracle:
 * `universal-router-sdk` devDependency pinned per commandSet, plus golden calldata vectors
 * in-repo and fork execution — SDK byte-equality alone is not the oracle.
 */
export type UniversalRouterDeployment = {
  address: Address
  commandSet: CommandSet
  /**
   * Optional exact-bytecode check, verified at init when provided: `validateManifest` (`manifest.ts`)
   * fetches the code at `address` and rejects a `keccak256` mismatch.
   *
   * THE IMMUTABLE CROSS-CHECK BELOW IS STRONGER, AND ALWAYS ON — WITH OR WITHOUT THIS FIELD. A
   * Universal Router's `permit2`/`wrappedNative` immutables (plus, when present, `v2.factory` /
   * `v3.factory` / `v4.poolManager`) are baked verbatim into its deployed bytecode at construction
   * time. `codeHash` alone is BLIND to a router whose code is byte-identical to a known-good
   * deployment but wired to the wrong chain's factories — exactly what the Robinhood Chain bring-up
   * found: mainnet's and Base's real Universal Router bytecode sits, unmodified, at Robinhood
   * Chain's usual UR address, configured for mainnet/Base's own factories instead of Robinhood's.
   * Same code, same hash, wrong chain. `validateManifest` therefore fingerprints the fetched code for
   * this manifest's own immutables every time `execution` is present — regardless of whether
   * `codeHash` is set — and throws `RouterConfigError` naming whichever immutable it could not find.
   */
  codeHash?: Hex
  permit2: Address
  wrappedNative: Address // UR's own immutable; also drives native-family normalization
}

// ---------------------------------------------------------------------------
// Chain manifest
//
// Atomic per-protocol bundles; overrides replace whole bundles, never
// individual fields — preventing configs where discovery finds pools on
// factory A while the UR executes against factory B.
// ---------------------------------------------------------------------------

/**
 * Facts about the CHAIN ITSELF, as opposed to about anything deployed on it (C4-P1).
 *
 * Every field here answers a question this package would otherwise have to answer for the caller by
 * assuming mainnet. They are a bundle like any other — supplying `chain` replaces it wholesale, so a
 * manifest that overrides `blockTimeSeconds` and wants mainnet's reorg depth must say so — and each
 * field is individually optional, defaulting to the mainnet value (see
 * {@link DEFAULT_BLOCK_TIME_SECONDS} / {@link DEFAULT_REORG_OVERLAP_BLOCKS}), so an L2 manifest that
 * only knows its block time need not invent a reorg depth.
 */
export type ChainData = {
  /**
   * Seconds per block, used to convert this package's TIME-shaped policies into block counts — today
   * only wave 0's recent-launch scan window (`WAVE0_RECENT_WINDOW_SECONDS`). Must be finite and
   * greater than zero; sub-second chains use a fraction (Arbitrum ≈ `0.25`). Default: 12 (mainnet).
   */
  blockTimeSeconds?: number | undefined
  /**
   * How many blocks of already-covered tip a scan re-opens on every pass, and the unit the head
   * watermark's plausible-regression bound is built from. Mainnet's 32 is one beacon epoch; an L2's
   * relevant depth is its unsafe-head rewind distance, which is typically far larger in that chain's
   * own (faster) blocks. Must be non-negative. Default: 32n (mainnet).
   */
  reorgOverlapBlocks?: bigint | undefined
}

export type ChainManifest = {
  chainId: number
  /**
   * The chain's wrapped-native token (WETH-shaped) — required, unconditionally, because quoting
   * itself needs it: native-family normalization (`internal/currency.ts#toGraphNode`/`sameFamily`)
   * runs for every request, quote-only or not, so there is no manifest this package can quote
   * against without it (C4-P3). This is the field a quote-only caller — a price-feed service that
   * never calls `getSwap`/`swaps` — states on its own, with no Universal Router deployment attached.
   *
   * `execution.wrappedNative` (below) is a SEPARATE field, not a duplicate to keep in sync by
   * convention: it is the concrete Universal Router deployment's own immutable, and the two are
   * cross-checked (`manifestFor`, `createRouter`) whenever `execution` is present — a mismatch
   * throws `RouterConfigError` before any RPC. On every built-in manifest they are, and must be,
   * the same address; a manifest is free to omit `execution` entirely and state only this one.
   */
  wrappedNative: Address
  // `| undefined` (not just `?:`) because `manifestFor`'s override contract treats an explicit
  // `undefined` as meaningful — "remove this bundle wholesale" — distinct from the key's absence;
  // `exactOptionalPropertyTypes` otherwise rejects passing `undefined` for an optional property.
  chain?: ChainData | undefined
  // `initCodeHash`/`poolInitCodeHash` are the CREATE2 init-code hashes this package derives pool
  // addresses from without an RPC round trip. They are canonical across every ordinary EVM fork of
  // v2/v3 (hence the defaults in `protocols/v2.ts`/`v3.ts`), and NOT canonical on chains whose
  // CREATE2 semantics differ — zkSync-class chains hash a different preimage entirely, so the
  // default silently yields addresses no pool lives at, and a search there reports a confident
  // `no-route` rather than a configuration failure. Overriding is how such a chain becomes routable.
  v2?: { factory: Address; deploymentBlock: bigint; initCodeHash?: Hex | undefined } | undefined
  v3?:
    | { factory: Address; deploymentBlock: bigint; v3QuoterV2: Address; poolInitCodeHash?: Hex | undefined }
    | undefined
  v4?: { poolManager: Address; deploymentBlock: bigint; quoter: Address } | undefined
  /**
   * The Universal Router deployment this manifest executes swaps against — OPTIONAL as of C4-P3.
   * `getQuote`/`quotes` never read it (quoting has no execution step); `getSwap`/`swaps` require it
   * and throw `RouterConfigError` synchronously, before any RPC, when it is absent (see
   * `router.ts#requireExecution` via `manifest.ts`). A manifest built for a price-feed-only caller —
   * one that will never call `getSwap`/`swaps` — states `wrappedNative` above and omits this bundle
   * entirely, rather than being made to point at a Universal Router / Permit2 / commandSet it will
   * never use.
   */
  execution?: UniversalRouterDeployment | undefined
  coreIntermediates?: Address[] | undefined // default: wrappedNative + per-chain majors
  /**
   * The chain's Multicall3 deployment, used to aggregate a quoting round's `eth_call`s into a few
   * `aggregate3` calls (`internal/multicall.ts`). OPTIONAL, and almost never stated: when absent the
   * canonical CREATE2 deployment (`0xcA11bde05977b3631167028862bE2a173976CA11`, live on 250+ chains
   * including all five built-in manifests' — see `internal/multicall.ts#MULTICALL3_ADDRESS`) is
   * assumed. Either way the router PROBES the address (`eth_getCode`, once per router lifetime,
   * cached like manifest validation — see `router.ts`) before ever aggregating through it, and a
   * chain where no code lives there simply quotes call-by-call, exactly as before aggregation
   * existed. So this field exists only for a chain that deployed Multicall3 somewhere non-canonical;
   * a chain with no Multicall3 at all needs nothing — the probe discovers that on its own.
   */
  multicall3?: Address | undefined
}
