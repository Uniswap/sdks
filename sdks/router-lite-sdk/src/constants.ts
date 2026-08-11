/**
 * Internal constants — not configuration. All effects are observable through {@link SearchReport}.
 * Values are revisited from latency benchmarks (see spec "Testing" section 9), not exposed as knobs.
 */

import type { Address } from 'viem'
import { isAddressEqual, zeroAddress } from 'viem'

/**
 * basis: derived
 * Universal Router recipient sentinel meaning "the caller" (`msg.sender`). The encoder substitutes
 * it deliberately; a *plan* that carries it as a literal recipient address would silently redirect
 * funds, so {@link assertPlanInvariants} rejects it.
 */
export const UR_MSG_SENDER = '0x0000000000000000000000000000000000000001' as Address

/** basis: derived
 * Universal Router recipient sentinel meaning "the router itself" (`address(this)`). */
export const UR_ADDRESS_THIS = '0x0000000000000000000000000000000000000002' as Address

/**
 * True for either Universal Router recipient sentinel.
 *
 * THE PREDICATE LIVES HERE, THE ERROR LIVES AT THE CALL SITE (R5). `router.ts` and `plan/compile.ts`
 * each had their own copy of this membership test, next to their own copy of a zero-address check —
 * two implementations of one fact ("which addresses can never be a real custody endpoint"), which is
 * exactly the kind of duplicate that goes stale the day a third sentinel is added. The predicate is
 * shared; the throw is not, because the two callers are answering different questions and must keep
 * their own error classes: `router.ts` is rejecting a caller's REQUEST (`RouterConfigError`, before
 * any RPC) while `plan/compile.ts` is rejecting a PLAN the search itself built (`UnsupportedRouteError`).
 *
 * `isAddressEqual` rather than lowercased string comparison, so a checksummed and an all-lowercase
 * spelling of the same sentinel can never disagree. It throws on a malformed address, which is why
 * every caller validates shape (`isAddress`) first — see {@link isUnusableCustodyAddress}.
 */
export function isUrSentinel(address: Address): boolean {
  return isAddressEqual(address, UR_MSG_SENDER) || isAddressEqual(address, UR_ADDRESS_THIS)
}

/**
 * True for any address that can never be a real trader/recipient/custody endpoint: the zero address
 * or either Universal Router sentinel (see {@link isUrSentinel}).
 *
 * REQUIRES A SYNTACTICALLY VALID ADDRESS — `isAddressEqual` throws viem's `InvalidAddressError` on
 * anything else, which would be a raw viem throw where the caller wanted its own named error. Every
 * call site checks `isAddress(addr, { strict: false })` first and reports that failure in its own
 * vocabulary.
 */
export function isUnusableCustodyAddress(address: Address): boolean {
  return isAddressEqual(address, zeroAddress) || isUrSentinel(address)
}

// ---------------------------------------------------------------------------
// Hostile-input bounds (C4-H4).
//
// Everything below bounds what a *request* may assert, as opposed to what the
// search may spend. A `QuoteRequest` is caller-supplied data, and in the
// launcher/aggregator deployments this package targets, "the caller" is often
// a service relaying an end user's parameters — so every field a stranger can
// influence gets an explicit ceiling, enforced synchronously in
// `router.ts#validateQuoteRequest`/`validateSwapRequest` before any RPC.
// ---------------------------------------------------------------------------

/**
 * basis: policy
 * Max `hints` a single {@link QuoteRequest} may carry.
 *
 * Every hint is validated (v3 costs an `eth_call` round trip; v2/v4 are local derivations) and every
 * accepted one is upserted into the router's PoolIndex — which lives for the whole process, not for
 * the request. An unbounded `hints` array is therefore an unbounded write into a long-lived index
 * *and*, for v3, an unbounded fan-out of RPC calls, both driven by whoever composed the request. 64
 * is far beyond any honest use (a launcher hints the one pool it just deployed; a caller working
 * around a discovery gap hints a handful), and small enough that the worst case is a bounded burst
 * rather than a memory-growth vector.
 */
export const MAX_HINTS_PER_REQUEST = 64

/**
 * basis: derived
 * Exclusive ceiling on `amountIn`: 2^128.
 *
 * The V4Quoter's `quoteExactInput` takes `uint128 amountIn` (and `uint128 amountOutMinimum` appears
 * in the Universal Router's own v4 swap params — see `encode/ur20.ts`), so an `amountIn` at or above
 * 2^128 cannot be encoded for v4 at all. Rejecting it up front, rather than letting viem's
 * `IntegerOutOfRangeError` surface from deep inside a search, keeps the failure a
 * {@link RouterConfigError} about the *request* — which is what it is — instead of a mid-search
 * throw whose stack points at the encoder. No real trade approaches this: 2^128 wei is ~3.4e20 ETH,
 * ~28 orders of magnitude past the total supply.
 */
export const MAX_AMOUNT_IN = 2n ** 128n

/**
 * basis: policy
 * Max `deadlineSeconds` a swap request may ask for: 24 hours.
 *
 * `deadlineSeconds` is added to the pinned block timestamp and encoded into the Universal Router's
 * execution deadline, so an absurd value is an effectively-deadline-less transaction — a signed
 * plan that can be mined weeks later at a price nobody agreed to. It is also the field most likely
 * to arrive as a float (`BigInt(1.5)` is a `RangeError`, not a validation failure), so the integer
 * check matters as much as the ceiling.
 */
export const MAX_DEADLINE_SECONDS = 86_400

/**
 * basis: derived
 * Exclusive ceiling on a Permit2 permit's `expiration` and `nonce`: 2^48.
 *
 * Both are `uint48` in Permit2's `PermitDetails` struct, and both arrive as plain JS `number`s (see
 * `types.ts#Permit2PermitSingle`) — so both carry the same hazard `MAX_DEADLINE_SECONDS` documents,
 * one layer deeper: `verify/readiness.ts#isPermitValid` does `BigInt(details.expiration)`, and
 * `BigInt(1.5)` is a `RangeError` thrown from a function whose contract is that it never throws for
 * a business outcome, reached from inside the readiness source. The integer check is therefore the
 * point of this bound as much as the ceiling is: a value at or above 2^48 cannot be signed into a
 * Permit2 permit at all, and a fractional one cannot be encoded at all.
 */
export const MAX_PERMIT2_UINT48 = 2 ** 48

/**
 * basis: derived
 * Exclusive ceiling on a Permit2 permit's `details.amount`: 2^160.
 *
 * `uint160` in Permit2's `PermitDetails` — the deliberate width that lets an allowance and an
 * address share a storage slot. Held here as a `bigint`, so unlike the uint48s above the hazard is
 * not `RangeError` but a silent one: an over-wide `amount` compares perfectly well against
 * `amountIn` in `isPermitValid` (so the permit reads as covering the trade) and only fails much
 * later, in the encoder, as a viem `IntegerOutOfRangeError` about calldata rather than a
 * {@link RouterConfigError} about the request.
 */
export const MAX_PERMIT2_UINT160 = 2n ** 160n

/**
 * basis: policy
 * Max bytes of `hookData` a v4 hint may carry.
 *
 * `hookData` is opaque caller bytes, copied verbatim into every quote call and into the final
 * calldata for the route. Nothing in this package can interpret it, so the only defensible bound is
 * a size one: 4 KiB is generous for anything a hook actually reads (a signature, a permit, a small
 * struct) while keeping a single hint from inflating every `eth_call` in a search — its bytes ride
 * along on every leg measurement the hinted pool takes part in, so they are paid for repeatedly.
 */
export const MAX_HOOK_DATA_BYTES = 4096

/**
 * basis: policy
 * Distinct blocks at which a hinted pool's quote must fail — with zero lifetime successes — before
 * the hint's provenance is discredited (see `pools/poolIndex.ts#isDiscredited`).
 *
 * A hint enters at the TOP of the provenance order and is never downgraded by anything discovered
 * later, which is right for the case hints exist for (a launcher that knows about a pool no log
 * scan can see yet) and wrong for the case a hostile caller creates: a junk pool key that outranks
 * every real, event-sourced pool in the pair forever, on nothing but the caller's say-so. Two
 * distinct blocks is the smallest evidence that is not a single-block fluke — one block's failure
 * can be a transient state, two cannot both be — and the demotion is reversible on the first
 * success, so a genuine pre-launch hint that starts quoting later is restored to hint rank.
 *
 * DO NOT RAISE THIS WITHOUT CHANGING HOW IT IS COUNTED. `PoolIndex.recordQuoteFailure` counts
 * blocks at which the failing block *changed* from the last one recorded, not the true number of
 * distinct blocks — an O(1) counter standing in for a set it deliberately does not keep. The two
 * agree at 2 (a second failure at a different block always increments; failures at N, N+1, N are
 * three changes but also three real observations across two blocks, and either way the threshold is
 * already met). At 3 or more they diverge: an alternating N, N+1, N, N+1 pattern would reach a
 * higher threshold on changes alone without ever visiting a third block. A larger value needs the
 * real distinct-block set (or a bounded ring of recent block numbers) first.
 */
export const HINT_DISCREDIT_FAILURE_BLOCKS = 2

/**
 * basis: policy
 * Per-cycle growth batch for the intermediates frontier (`search/loop.ts#advanceIntermediates`) — the
 * seed size selected before the first pump cycle, and the batch added on each subsequent quiet cycle.
 * NOT a permanent cap: the frontier keeps growing by this many nodes every dry cycle until every
 * eligible intermediate is selected (see `types.ts#intermediatesPruned`'s docstring).
 */
export const INTERMEDIATES_BATCH = 8

/** basis: policy
 * Max pools measured on one pair — an abuse backstop against pool-spam pairs, not a selection cap. */
export const MEASUREMENT_PAIR_CEILING = 128

/** basis: policy
 * Max legs one pump cycle dispatches in a single measurement round — keeps one round under ~8
 * aggregate3 chunks (`MULTICALL_CHUNK` = 50); leftover due legs stay due for the next cycle. */
export const PUMP_ROUND_CAP = 400

/**
 * basis: policy
 * The size of a detached round's FIRST dispatch group — the vanguard envelope. A round bigger than
 * this splits its evidence-ordered head (`search/pump.ts#measurablePools` plans most-recently-
 * proven pools first) into its own small envelope, dispatched concurrently with the rest, so the
 * legs most likely to contain the true best answer settle FIRST: a dozen light inner calls clear
 * the provider while the 50-call envelopes (which on dense hooked pairs can run long enough to
 * bisect) are still executing. An ordering-and-batching decision, never a selection: every leg
 * still measures; only WHEN moves. 12 is four times the per-pair breadth the wave engine's wave-0
 * selection led from (3-of-N), small enough that the envelope's inner gas can never approach a cap,
 * and costs at most one extra envelope per round.
 */
export const PUMP_VANGUARD_LEGS = 12

/** basis: policy
 * Max leader candidates preflighted (simulated) before falling through on genuine reverts. */
export const PREFLIGHT_TOP_K = 3

/** basis: policy
 * A hooked or mixed-protocol route must beat a simpler one by more than this (bps) to win ranking. */
export const SIMPLICITY_MARGIN_BPS = 5

/** basis: policy
 * Default slippage tolerance for a swap request, in bps. */
export const DEFAULT_SLIPPAGE_BPS = 100

/** basis: policy
 * Default deadline window for a swap request, in seconds from the pinned block timestamp. */
export const DEFAULT_DEADLINE_SECONDS = 300

/**
 * basis: policy
 * Default for `createRouter`'s `concurrency` option (C4-P6): the size of the router-WIDE semaphore
 * (`internal/rpc.ts#createSemaphore`) bounding how many `client.request` calls (`eth_call` /
 * `eth_getLogs`) may be in flight AT ONCE, across every operation sharing this router instance —
 * NOT a per-batch limit, whatever this constant's name used to suggest. A search runs its
 * measurement rounds, its log scans, and (for swaps) the readiness reads all concurrently
 * (`search/loop.ts`), so without a shared bound the real peak is the SUM of each operation's own
 * batch size, not any one of them — measured at ~44 in-flight calls for a realistic first cycle
 * before this option existed, more than double what a reader of the old per-batch doc comment would
 * have expected. 20 is a conservative default comfortably under the connection-pool ceilings of
 * every major public endpoint; a caller fronting a stricter provider (or wanting a wider one) passes
 * `createRouter({ ..., concurrency })`.
 */
export const DEFAULT_CONCURRENCY = 20

/**
 * basis: policy
 * Ceiling on `createRouter`'s `concurrency` option — validated in `router.ts#createRouter`,
 * synchronously, before any RPC (F1). `concurrency <= 0` (zero, negative, or `NaN`, which fails
 * every numeric comparison) makes `createSemaphore`'s `active < limit` check false forever: every
 * `acquire()` queues and NEVER resolves, with no abort escape anywhere in the acquire path — a
 * silent, permanent hang on the very first RPC call this router ever issues, not a business-outcome
 * result. 1,024 is a generous, arbitrary-but-sane upper bound: nothing in this package's own
 * candidate/probe/hint caps (see the "Hostile-input bounds" section above) ever approaches four
 * digits of real concurrent RPC demand, so a caller asking for more is almost certainly a typo
 * (a stray zero, a unit confusion) rather than a deliberate, load-tested value — better rejected
 * synchronously than silently accepted and left to misbehave against whatever transport backs
 * `client.request`.
 */
export const MAX_CONCURRENCY = 1024

// ---------------------------------------------------------------------------
// Chain-shaped defaults (C4-P1).
//
// The two values below are FACTS ABOUT A CHAIN, not tuning knobs, and the
// mainnet numbers are only defaults: both are overridable per-chain through
// `ChainManifest.chain` (see `manifest.ts#blockTimeSecondsOf` /
// `#reorgOverlapBlocksOf`, the only two readers). Nothing in this package may
// read them directly to make a per-chain decision — an L2 at 2s blocks and a
// beacon-chain-shaped 32-block reorg depth are different chains' answers to
// the same two questions, and hardcoding mainnet's turns a portable search
// into a mainnet-only one.
// ---------------------------------------------------------------------------

/**
 * basis: derived
 * Seconds per block on mainnet — the default when a manifest carries no `chain.blockTimeSeconds`.
 *
 * Post-merge Ethereum produces a block every 12s by protocol, modulo missed slots. Every window this
 * package expresses in TIME (today: {@link EAGER_PAIR_WINDOW_SECONDS}) is converted to blocks
 * through this, so a chain that supplies its own value gets the same policy in its own units rather
 * than mainnet's block count reinterpreted as if its blocks were 12s apart.
 */
export const DEFAULT_BLOCK_TIME_SECONDS = 12

/**
 * basis: derived
 * Overlap re-scanned on top of `coveredThroughBlock + 1` for shallow-reorg tolerance — the default
 * when a manifest carries no `chain.reorgOverlapBlocks`.
 *
 * 32 is a mainnet number: one beacon epoch, past which finality makes a reorg a consensus failure
 * rather than an ordinary tip wobble. It is the WRONG number almost everywhere else. On an optimistic
 * L2 the relevant depth is not a reorg at all but an unsafe-head rewind — the sequencer's soft head
 * being replaced when the derivation pipeline catches up with L1 — which is routinely deeper than 32
 * of that chain's (much faster) blocks. Chains that know their own answer supply it via
 * `ChainManifest.chain.reorgOverlapBlocks`.
 */
export const DEFAULT_REORG_OVERLAP_BLOCKS = 32n

/**
 * basis: policy
 * How many blocks of history the pool index's negative cache retains (see `pools/poolIndex.ts`).
 * The cache exists ONLY to dedupe *within-block* retries — a pinned-block search re-run moments
 * later at the same head, or a concurrent request landing on the same head — never to remember
 * across blocks that a pool is bad: liquidity changes, hook state changes, and a stale negative
 * would otherwise suppress a pool that has since recovered for no reason this small a window buys
 * back. 2 is ample for that job and small enough that the cache's memory footprint is a handful of
 * blocks' worth of pool ids regardless of how long the process has been running or how many pools
 * have ever failed a quote — see `PoolIndex.markNegative`'s eviction.
 */
export const NEGATIVE_CACHE_BLOCKS = 2n

/**
 * basis: policy
 * How far below the router's head watermark a fresh `latest` may plausibly sit and still be the
 * chain's doing — a lagging replica behind a load balancer, or a reorg — rather than the watermark
 * itself being wrong. Four times the reorg overlap this package already tolerates: deep enough that
 * every real lag/reorg lands inside it, shallow enough that a bogus recorded head (a provider glitch
 * answering an absurd block number, which would otherwise poison the watermark permanently) lands
 * outside. Two consecutive answers further below than this reset the watermark instead of being
 * reported as a regression — see `search/loop.ts#fetchBlock`.
 *
 * A FUNCTION, not a constant, because the multiplicand is per-chain (C4-P1): the multiple of 4 is
 * the policy — "no honest lag runs four reorg depths deep" — and `reorgOverlapBlocks` is the chain
 * fact it multiplies. Callers pass `reorgOverlapBlocksOf(manifest)`, never the mainnet default.
 */
export function maxPlausibleHeadRegression(reorgOverlapBlocks: bigint): bigint {
  return reorgOverlapBlocks * 4n
}

// ---------------------------------------------------------------------------
// Log scanning (`internal/logScan.ts`; the width-policy decisions these
// constants parameterize live in `internal/logScanPolicy.ts`).
//
// `eth_getLogs` caps differ per endpoint, and differ per *query* on the same
// endpoint (a result cap binds on a busy contract at a span a quiet one sails
// through). So the scanner discovers the usable window empirically, and every
// constant below is a bound on how much that discovery is allowed to cost — in
// requests, in wasted probes, and in wall-clock.
//
// DISCOVERY MEANS STARTING WIDE (S1). The scanner opens every scan at
// `min(remaining range, MAX_SCAN_WINDOW)` and bisects DOWN from there, rather
// than opening at a conservative width it can never grow past. A start that is
// too wide costs a few fast rejections once; a start that is too narrow costs a
// round trip per window for the life of the scan, and — before this — could
// never be corrected, because the starting width doubled as the regrowth
// ceiling. See {@link MAX_SCAN_WINDOW} for the measurements.
//
// THE DECLARED-CAP FAST PATH SHORT-CIRCUITS THAT DISCOVERY WHEN IT CAN (R2).
// Caps are not *never* advertised — several providers state the window that
// would have worked in the error itself, and
// `internal/rpcErrors.ts#parseDeclaredCap` reads it out. Where it fires, the window
// jumps straight to the stated cap instead of halving toward it, and a cap
// below {@link MIN_CHUNK} gives the sub-range up on the FIRST error rather than
// spending {@link MAX_CONSECUTIVE_MIN_FAILURES} retries and a backoff
// escalation on a window the endpoint has already said it will not serve. Every
// number below is therefore a bound on the SILENT case — the endpoints that
// only ever answer with an error — and an upper bound, not an expected cost,
// for the ones that talk.
// ---------------------------------------------------------------------------

/**
 * basis: measured (2026-08, S1 study against a keyed Alchemy mainnet endpoint)
 * Widest `eth_getLogs` window the scanner will EVER ask for: the default ceiling on both the first
 * request of a scan (`min(remaining range, MAX_SCAN_WINDOW)`) and on regrowth, and the default for
 * `createRouter`'s `logChunkBlocks` option (C4-P6, which lowers it — see below).
 *
 * START WIDE AND LET THE ENDPOINT SAY NO. This used to be a 10,000-block `INITIAL_CHUNK` that was
 * simultaneously the starting window and the regrowth ceiling, which meant the scanner could never
 * learn what an endpoint actually serves — it asked for 10k, got 10k, and asked for 10k again,
 * forever. The S1 profile (measured live against a keyed Alchemy mainnet endpoint) is what killed
 * that:
 *
 *   * PER-REQUEST LATENCY IS OVERHEAD-DOMINATED, NOT WIDTH-DOMINATED. A 10k-block window cost 456ms
 *     per request; a 1,000,000-block window cost 89ms. Wider was not merely cheaper per block, it was
 *     cheaper per REQUEST — the round trip, not the range, is the cost — so the 10k window was paying
 *     full freight 100 times over for what one request could serve. Measured per-request medians:
 *
 *         window     10k    100k     1M      4M     16M
 *         per req  456ms   ~200ms   89ms   ~300ms  ~900ms      (near-flat; ~500x throughput spread)
 *
 *   * THE REAL CAP IS PER-QUERY, NOT PER-ENDPOINT, so no single constant can be "the endpoint's cap"
 *     and the scanner has to discover it per scan. On that one endpoint: v4 adjacency capped somewhere
 *     between 200k and 1M blocks, v2 between 1M and 5M, v3 adjacency between 5M and 16M — while the v3
 *     `FeeAmountEnabled` scan and the v4 exact-pair scan each served their ENTIRE history in ONE
 *     request (16M blocks in 80ms; 4M in 887ms). Selectivity, not policy, is what binds: a filter that
 *     matches a handful of logs sails through a span that a busy one cannot.
 *
 * 16,000,000 IS THE LARGEST SINGLE-REQUEST WIDTH OBSERVED SERVED (the v3 fee scan's whole history),
 * so it is an empirical ceiling rather than an aspirational one — and, conveniently, wider than the
 * full history of every chain this package ships a manifest for except mainnet, so most scans start
 * at `remaining range` and finish in one request.
 *
 * AN OVERSIZED START COSTS A HANDFUL OF FAILED PROBES, NOT A SLOW SCAN — BUT ONLY BECAUSE THE DESCENT
 * IS NOT PURELY log2. Failures bisect down in ~log2 steps ({@link MIN_CHUNK} is the floor), so a hard
 * 2k-block-cap provider is ~13 halvings before landing on a width that clears, and they happen ONCE
 * (the within-scan ratchet and the index's coverage cache both remember). Whether those 13 are cheap
 * depends entirely on HOW the provider refuses:
 *
 *   * A SPAN VALIDATOR rejects an over-wide window without touching the chain. 13 of those is 13 fast
 *     round trips — genuinely cheap, and the case this ceiling was sized for.
 *   * A RESULT-SIZE CAP executes the query first and refuses on the way out, and a TIMEOUT-SHAPED
 *     endpoint (drpc's archive reads, captured in this repo) bills the full wait — which viem then
 *     multiplies by its own retries (3 × ~10s) before the error even reaches the scanner. A naive
 *     ladder there is minutes of zero progress, not a handful of probes.
 *
 * {@link DESCENT_TIMEOUT_FALLBACK} is what makes the second class affordable, and
 * `internal/rpcErrors.ts#parseDeclaredCap` lets providers that DECLARE their cap skip the ladder entirely
 * (the window jumps straight to the stated width on the way down). Against all of that, the old 10k
 * start paid ~2,600 needless round trips per cold mainnet history scan, on every generous endpoint,
 * every scan, forever.
 *
 * `logChunkBlocks` IS A CEILING OVERRIDE, NOT A MANDATORY START (C4-P6). A caller who KNOWS their
 * provider's cap passes it (`createRouter({ ..., logChunkBlocks: 3_000n })` for Ankr's ~3k public
 * endpoint) and pins the ceiling there, skipping the descent; the start is then
 * `min(remaining range, override)`. A caller who does not gets this constant and lets the bisection
 * find the truth.
 */
export const MAX_SCAN_WINDOW = 16_000_000n

/**
 * basis: policy
 * The width the descent drops STRAIGHT to when a wide window fails in a way that cost the provider
 * real time, rather than being cheaply refused — instead of halving toward it one expensive step at
 * a time.
 *
 * HALVING PRICES A REFUSAL AS FREE, AND FOR SOME PROVIDERS IT IS NOT. `internal/logScanPolicy.ts`'s
 * refusal transition classifies the failure (`internal/rpcErrors.ts#classifyRpcError`); a `transport` or `unavailable` verdict
 * covers exactly the expensive shapes — a timeout (the endpoint hung until viem gave up, having
 * already retried 3 times at ~10s apiece: ~40s for ONE probe, so a 13-step ladder from
 * {@link MAX_SCAN_WINDOW} is ~9 minutes of no progress) and a result-size cap (the endpoint executed
 * the query and refused on the way out). This package documents drpc doing the former on archive
 * reads. One such failure now costs ONE narrowing instead of thirteen.
 *
 * 100,000 IS A WIDTH ALMOST NOTHING REFUSES, WITHOUT BEING TIMID. It is 10x the old fixed 10k start
 * and comfortably above every documented provider ceiling this package knows of (Alchemy/Infura/
 * QuickNode's 10k filtered-query limit, Ankr's ~3k, blastapi's public 10) — so it lands in one step
 * where the ladder would have taken ~7 — while still being narrow enough that a busy contract's
 * result cap has a real chance of clearing it. If it does not clear, ordinary halving takes over from
 * there (this jump can fire at most once per descent, since it only applies while the window is
 * strictly wider than this), so nothing about termination or the request budget depends on the guess
 * being right.
 */
export const DESCENT_TIMEOUT_FALLBACK = 100_000n

/**
 * basis: policy
 * Floor on the window. Below this a scan is no longer usefully making progress, so an endpoint that
 * cannot answer this is failing, not capping, and the failure path (retry, then give the sub-range
 * up) takes over instead of bisecting toward 1.
 *
 * 128 IS A FIXED TRANSPORT FLOOR, NOT A CHAIN-DERIVED ONE, and it is deliberately the one width in
 * this file no manifest can move. What it prices is a PROVIDER's behaviour — the width below which
 * "it refused" stops being evidence about the request and becomes evidence about the endpoint — and
 * that has nothing to do with which chain is on the other end of it.
 *
 * (It used to be documented as "4x {@link DEFAULT_REORG_OVERLAP_BLOCKS} — the smallest window still
 * larger than the overlap a warm re-scan re-reads anyway". That derivation holds on the mainnet
 * DEFAULT and nowhere else: every other manifest this package ships overrides `reorgOverlapBlocks`
 * upward (Base 150, Unichain 300, Arbitrum 1200, Robinhood 3000), so on four of five chains the
 * floor sits BELOW the overlap rather than 4x above it. The number never changed with them, because
 * it was never really about them. Reorg overlap is a per-chain question and is answered per
 * manifest, in `manifest.ts#reorgOverlapBlocksOf`.)
 *
 * AN ENDPOINT THAT DECLARES A CAP BELOW THIS IS THE ONE CASE WHERE "FAILING, NOT CAPPING" IS WRONG
 * (R2), and it is a real one: `eth-mainnet.public.blastapi.io` caps public `eth_getLogs` at TEN
 * blocks, nine halvings under this floor. It is genuinely capping, it says so in the error, and no
 * retry can reach a window it will serve — so the scanner gives that sub-range up on the first
 * error instead of treating it as a transient failure. See `internal/logScanPolicy.ts`'s declared-cap
 * branch; raising this floor widens the set of endpoints that fall into that case.
 */
export const MIN_CHUNK = 128n

/**
 * basis: policy
 * Failures at {@link MIN_CHUNK} on the *same* sub-range before it is given up (left out of `covered`
 * and reported as partial discovery). Two retries is enough to ride out a blip without turning one
 * permanently poisoned range — a block whose logs the node genuinely cannot serve — into a scan that
 * never advances.
 */
export const MAX_CONSECUTIVE_MIN_FAILURES = 3

/**
 * basis: policy
 * Consecutive successful chunks before the window is doubled back toward the scan's ceiling
 * ({@link MAX_SCAN_WINDOW}, or `logChunkBlocks` when the caller pinned it lower).
 *
 * Without regrowth the window only ever shrinks, so a single transient failure early in a scan pins
 * the entire remaining walk at a tiny window: one blip three requests into a multi-million-block
 * range turns a handful of requests into tens of thousands of sequential ones. Regrowth makes that
 * self-healing — and, since the start is now wide (see {@link MAX_SCAN_WINDOW}), it is also how the
 * scanner RE-CLIMBS after a transient cap: the ratchet is what remembers the widest width this
 * endpoint has actually served for this query, rather than treating the first refusal as permanent.
 * The cost is one failed probe per regrowth attempt at an endpoint whose cap is real, which is
 * exactly what this number prices: at 4, a hard-capped provider pays 1 wasted request per 5 (20%
 * overhead, bounded and steady, since the probe re-halves immediately), while a transient collapse
 * recovers within a few chunks.
 */
export const CHUNK_REGROWTH_SUCCESSES = 4

/**
 * basis: policy
 * How many `eth_getLogs` chunk requests ONE {@link scanLogs} call may have in flight at once, once
 * the working window width has been ESTABLISHED (P1).
 *
 * WHY A SCAN NEEDED ITS OWN BOUND AT ALL. The router-wide semaphore
 * ({@link DEFAULT_CONCURRENCY} = 20) has always been the ceiling on in-flight requests, but nothing
 * under it ever generated the demand: `search/coverage.ts` fans out across protocols and topic
 * positions, and every one of those chains then walked its own block range strictly one chunk at a
 * time. Measured during a full cold mainnet drain: 7 of the 20 permits in use at the peak — the
 * per-query loop, not the semaphore, was the bound. With adaptive windows (S1) most queries now
 * finish in one or two chunks and this changes nothing for them; it is the narrow-cap queries that
 * still serialize (v4 adjacency caps between 200k and 1M blocks on a keyed mainnet endpoint, so a
 * 4M-block delta is 4-20 sequential round trips) plus every post-descent walk.
 *
 * 4, NOT 20, AND DELIBERATELY MODEST. This multiplies with the fan-out ABOVE it rather than
 * replacing it: a realistic post-gate coverage pass runs ~8 scans concurrently, so 8 x 4 = 32 chunk
 * requests competing for 20 permits — already saturation, with a queue. At 20 it would be 160
 * contending for 20, which does not scan any faster (the semaphore admits 20 either way) and does
 * starve the `eth_call` measurements that share the same permits, since `createSemaphore` is FIFO
 * and a scan that queues 160 acquires puts every subsequent measurement behind them. 4 fills the
 * measured 13-permit gap without letting log scanning crowd the pump out of its own concurrency
 * budget. A caller who wants a different total still has one knob — `createRouter({ concurrency })`
 * — and it still binds.
 *
 * WHAT IT NEVER DOES. The first chunk of any width goes out ALONE: a batch is only planned after a
 * chunk at the current width has actually been served, so the bisection descent (which is a
 * sequential search, and where a wide concurrent volley would be N simultaneous refusals instead of
 * one) is untouched. A batch also never crosses a {@link CHUNK_REGROWTH_SUCCESSES} boundary while the
 * window is below the scan's ceiling, so the regrowth ratchet's cadence is bit-for-bit what it was
 * sequentially — at the ceiling, doubling is a no-op and there is no boundary to respect.
 */
export const SCAN_CHUNK_CONCURRENCY = 4

/**
 * basis: policy
 * Hard ceiling on `eth_getLogs` attempts (successes *and* failures) in one {@link scanLogs} call.
 *
 * THE BUDGET IS NOW MOSTLY HEADROOM, AND DELIBERATELY SO. A cold full-history scan against a
 * well-behaved endpoint costs a couple of requests, not thousands: ~26M mainnet blocks at
 * {@link MAX_SCAN_WINDOW} is 2 requests where the old 10k window cost ~2.6k, so 4,000 is ~50x slack
 * over the well-behaved case rather than the ~50% it used to be. It is kept at 4,000 because it never
 * bounded the well-behaved case — it bounds the pathological one, and that case is unchanged: an
 * endpoint that rate-limits everything down to {@link MIN_CHUNK} would otherwise walk the same
 * history in 200k+ sequential requests with no exit but the caller's `AbortSignal`, which the
 * zero-config path does not pass. When the budget is spent the scan stops and returns what it
 * covered; the coverage machinery already reports the shortfall as partial discovery, so nothing is
 * silently lost — it just stops paying for it.
 *
 * This bounds *work*, not latency, and the difference is worth stating plainly: 4,000 sequential
 * requests against an endpoint that takes ~1s to fail each one is on the order of an hour (plus at
 * most {@link MAX_BACKOFF_TOTAL_MS} of deliberate waiting) before a fully-throttling provider yields
 * its partial answer. That is a guarantee of termination, not of promptness — any caller with a
 * latency budget should pass an `AbortSignal`, which remains the only way to bound wall-clock. The
 * wide start does not change that worst case (the same 4,000 attempts, the same ~1s each); it adds at
 * most ~13 halving probes per scan on the way down to the floor, a rounding error against the budget
 * and a one-time cost per scan.
 */
export const MAX_REQUESTS_PER_SCAN = 4_000

/**
 * basis: policy
 * First backoff delay before retrying a failed chunk at {@link MIN_CHUNK}, doubled per consecutive
 * failure and capped at {@link BACKOFF_MAX_MS}. Retrying a throttling endpoint immediately is how a
 * rate limit becomes a tight loop; 250ms is short enough that a one-off blip barely registers, and
 * doubling reaches the cap after four failures, so five attempts buy the endpoint ~3.75s of quiet.
 */
export const BACKOFF_BASE_MS = 250

/**
 * basis: policy
 * Ceiling on that delay. This package creates no other timers, so this is also the longest a pending
 * backoff can hold a Node event loop open after the caller has walked away (an abort clears the timer
 * immediately, so it only applies to a scan nobody aborted).
 */
export const BACKOFF_MAX_MS = 2_000

/**
 * basis: policy
 * Total time one scan may spend *sleeping* between retries, across all of them.
 *
 * Per-retry caps do not compose: {@link MAX_REQUESTS_PER_SCAN} failures each waiting
 * {@link BACKOFF_MAX_MS} is over two hours of pure sleep, which would make the request budget's
 * termination guarantee worthless in practice. 60s is generous for the case backoff actually exists
 * to serve — riding out a rate-limit window or a brief endpoint wobble, which resolves in seconds if
 * it resolves at all — and once spent, the remaining failures retry without sleeping. Nothing
 * becomes unbounded when it runs out: the request budget still stops the scan, and backing off
 * further is simply no longer buying anything from an endpoint that has been failing for a solid
 * minute.
 */
export const MAX_BACKOFF_TOTAL_MS = 60_000

/**
 * basis: policy
 * How far back the EAGER exact-pair log scan reaches from the pinned head, IN SECONDS: one week.
 *
 * The eager slice is a latency budget, not a completeness budget: it exists for the brand-new-asset
 * case, where the pool was created minutes ago and the caller is waiting. Scanning the full history
 * there would cost hundreds of sequential `eth_getLogs` before the first result could be yielded.
 * The remaining history is opened by the coverage gate (`search/coverage.ts#demandFull`) once cheap
 * information is exhausted, and discovery is only ever reported `complete` once it has been walked.
 *
 * SECONDS, NOT BLOCKS, IS THE UNIT THE POLICY IS ACTUALLY IN (C4-P1). "Recently launched" is a claim
 * about wall-clock — a token deployed in the last few days — and a block count only expresses it on
 * the one chain whose block time you assumed. This used to be a `50_000n` block constant rationalized
 * as "~a week of mainnet blocks"; on Base (2s blocks) the same number is 28 hours and on Arbitrum
 * (~0.25s) 3.5 hours, so on exactly the chains where new launches are most common the new-launch fast
 * path silently stopped covering the launch. The block count is derived per-search from the
 * manifest's block time instead — see `manifest.ts#eagerPairScanBlocks`, which on mainnet's default
 * 12s yields 50,400 blocks (the old constant, to within 1% — the window was always approximate).
 */
export const EAGER_PAIR_WINDOW_SECONDS = 604_800
