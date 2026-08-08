# router-lite-sdk — Design

**Date:** 2026-08-03 (rev 5: amended for the implemented package — pure protocol
modules, structured reasons, transport knobs, quote-while-discovering)
**Status:** Approved direction; rev 5 describes what `sdks/router-lite-sdk` does
**Package:** `sdks/router-lite-sdk` → `@uniswap/router-lite-sdk`

### Revision 5 — what changed, and why

Rev 4 was written ahead of the implementation. Every normative section below is
now amended in place to match `src/`; these are the differences worth naming:

- **`ProtocolModule` became pure.** Its discovery methods return *descriptions*
  (`LogQuery[]`, `QuoteProbe[]`), never promises. The engine owns every RPC, so
  a module cannot invent a scan the wave policy did not authorize, and every
  module is testable without a transport.
- **Two transport-shaped construction knobs** (`concurrency`, `logChunkBlocks`)
  joined `index`/`maxPools`. Neither is a *policy* knob — they bound in-flight
  requests and `eth_getLogs` width, both provider-shaped facts the package
  cannot learn for free.
- **Per-pair caps split by cost class** (`MAX_POOLS_DIRECT = 6` linear,
  `MAX_POOLS_PER_LEG = 3` quadratic) and `MAX_QUOTE_CANDIDATES` is now *derived*
  from them, so the total can never drift below what enumeration produces.
- **`reason` is structured** (`{ code, detail }` over the exported closed
  `REASON_CODES`): the prose was already being branched on, and prose drifts.
- **`SearchReport` grew two honesty axes** — `verification`
  (preflight budget) and `enumeration.intermediatesPruned`; `ready`/
  `needs-action` echo the plan's own `limits`.
- **Waves 1–3 quote while they discover** (`QUOTE_INTERLEAVE_MS`) instead of
  scan-then-quote, and preflight is deliberately *not* pipelined — laziness is
  what makes the hint fast path free.
- **The index can leave the process** (`toSnapshot`/`fromSnapshot`), which is
  what makes a second CLI invocation warm; the SDK still performs no I/O of its
  own.

## Purpose

Find a working direct or one-intermediate route across configured Uniswap v2,
v3, and v4 deployments using bounded, RPC-only discovery, and return
executable Universal Router calldata when the route can be verified. A
**fallback and new-asset router**: bounded hops, bounded candidates, and
partial history are explicit, reported properties — never overstated.

Use cases: (1) fallback when the main routing stack fails or returns nothing;
(2) brand-new assets with one or few pools, where the launcher can hand us the
creation receipt and the pool is routable with zero historical scanning.

## Mental model

**The flow in one sentence:** pin a block, then search in widening waves —
hints and speculative direct quotes first, then core intermediates, then
endpoint adjacency — where the quote call itself proves a pool exists,
verifying the leader with readiness reads plus a real-trader Universal Router
simulation, and reporting exactly how far the search got.

**Consumption in one sentence:** `await router.getSwap(req)` resolves at the
first actionable route; `for await (const r of router.swaps(req))` yields the
improving best after each wave until the bounded search completes; a standard
`AbortSignal` cancels either, and the instance keeps everything it learned
for the next call.

**Extension in one sentence:** add a manifest bundle for a new chain, an
internal `ProtocolModule` for a new AMM, a `commandSet` encoder for a new
Universal Router version, or hint-carried `hookData` for a new hook — the
public API never changes.

**Two layers, one type ladder.** A *wave engine* owns policy (mode, budget,
stopping); *stage primitives* (discover, quote, compile, encode, verify) do
the work and hold no policy. Data flows one way down a ladder of types, and
each arrow is a module boundary:

```
CurrencyRef → PoolHint → PoolRecord → RouteLeg[] = RouteCandidate
            (validate)  (select)      (quote)
    → QuotedRoute → ExecutionPlan → EncodedTx → SwapResult
        (compile)      (encode)       (verify)
```

Nothing upstream knows about anything downstream: discovery never sees
quotes, quoting never sees Universal Router commands, the compiler never
sees RPC.

## Decisions locked during design review

| Decision | Choice |
| --- | --- |
| Protocols | v2 + v3 + v4 in v1, as internal `ProtocolModule`s (no public plugin API) |
| Route shapes | Direct + one intermediate (max 2 hops); protocols freely mixed |
| Trade sides | Exact-input only |
| Search | Wave-based anytime search; promises (`getQuote`/`getSwap`) resolve at the first actionable result; async iterators (`quotes()`/`swaps()`) yield the improving best per wave; cancellation via standard `AbortSignal`. No mode or budget knobs |
| Configuration | `createRouter({ client, manifest, index?, maxPools?, concurrency?, logChunkBlocks? })` — the entire surface. All *policy* values remain internal constants, observable through `SearchReport`; `index`/`maxPools` are PoolIndex-lifecycle knobs (C4-H5) and `concurrency`/`logChunkBlocks` are transport knobs (C4-P6). Still not a policy object |
| Quoting | **Speculative**: the quote call is the existence probe (v2 computed-pair `getReserves`, v3 QuoterV2 path calls, v4 standard configs) — no separate discovery for direct pairs. Canonical on-chain quoters for v3/v4 (whole-path), local reserve math for v2 (standard ERC-20 only); real-trader UR preflight is the only execution verification |
| Quote transport | Direct `eth_call`s via bounded-concurrency `client.request`; `http(url, { batch: true })` gives single-request batching; never Multicall3 for sender-sensitive quotes |
| Preflight | Readiness by reads + simulation as the real trader; **no generic ERC-20 state overrides** (false-positive preflights are worse than "unverified") |
| Public API | `createRouter` + `getQuote` / `getSwap` / `ingestPool` / `ingestLogs` / `ingestReceipt` / `stats` / `clearIndex`; pure pieces (incl. `PoolIndex`) under `/experimental` |
| Types | All public types defined in-package, viem-native; no type imports from ethers-based SDKs |
| Client input | viem `PublicClient` + `ChainManifest` of atomic deployment bundles |
| Encoding | RouteCandidate → version-neutral `ExecutionPlan` → version-bound encoder; `universal-router-sdk` pinned as devDependency oracle + golden vectors |
| V1 caching | In-memory `PoolIndex` + `ScanCoverage`; no live ingestion; small overlap re-scan for shallow reorgs. Unbounded by default; optionally bounded (`maxPools`, LRU-touched eviction) or injected/handed off between routers (`index`), with `stats()`/`clearIndex()` for observability and reset (C4-H5). The index is *serializable* (`toSnapshot`/`fromSnapshot` + `serializeSnapshot`/`parseSnapshot`, `/experimental`) so a host can carry it across processes; the SDK itself still performs no file I/O — `cli/cache.ts` is the reference consumer |

## Domain model

All types are defined in this package (viem-native — `Address`, `Hex`,
`bigint`); the ethers-based Uniswap SDKs appear only as devDependencies in
tests.

```ts
type CurrencyRef = Address | 'native'
// Amounts are raw bigint everywhere; no decimal parsing.
// Graph search normalizes native/wrapped into one "native family" node;
// materialized routes always use concrete currencies.

type PoolKey = {              // defined here, not imported from v4-sdk
  currency0: Address; currency1: Address
  fee: number; tickSpacing: number; hooks: Address
}

type PoolHint =               // an unvalidated assertion from the caller
  | { protocol: 'v2'; token0: Address; token1: Address; pool?: Address }
  | { protocol: 'v3'; token0: Address; token1: Address; fee: number; pool?: Address }
  | { protocol: 'v4'; poolKey: PoolKey; hookData?: Hex }

// Validated pool identity. The two facts every consumer wants out of a pool —
// its identity string and its two currencies — are carried on EVERY arm, derived
// once by the constructors in `protocols/poolRef.ts` (the only place a PoolRef is
// built), so nothing downstream switches on `protocol` to recompute them:
//   id:         `${protocol}:${lowercased address-or-poolId}` — the pool index
//               key, routeId's unit, the plan compiler's dedup identity
//   currencies: the pool's own two currencies in DOMAIN form (v4's on-chain
//               address(0) becomes 'native'; v2/v3 addresses pass through), in
//               the pool key's own sorted order
type PoolRef = { id: string; currencies: [CurrencyRef, CurrencyRef] } & (
  | { protocol: 'v2'; address: Address; token0: Address; token1: Address }
  | { protocol: 'v3'; address: Address; token0: Address; token1: Address; fee: number }
  | { protocol: 'v4'; poolId: Hex; poolKey: PoolKey }
)

type PoolRecord = {           // identity + index metadata (selection input)
  pool: PoolRef
  createdAtBlock?: bigint
  source: 'event' | 'factory' | 'hint'
  lastQuoteSuccessBlock?: bigint
  // An O(1) distinct-block failure counter — the only evidence a hint's
  // provenance can be discredited on (see "Hint provenance is provisional").
  quoteFailureBlocks?: number
  lastQuoteFailureBlock?: bigint
}

type RouteLeg = {             // one hop with concrete currencies
  pool: PoolRef
  currencyIn: CurrencyRef
  currencyOut: CurrencyRef
  hookData?: Hex              // v4 only; from the request-scoped hint map
}

type RouteCandidate = { legs: RouteLeg[] }   // 1 or 2 legs in v1

type RouteQuote = {
  amountIn: bigint
  amountOut: bigint
  intermediateAmounts: bigint[]   // realized per-leg outputs (chained quoting)
}

type QuotedRoute = {
  route: RouteCandidate
  quote: RouteQuote
  // Set when the simplicity margin promoted this route ahead of a
  // higher-`amountOut` hooked/mixed leader — the one ranking decision that
  // overrides amountOut-descending order, so it must be observable. It lives
  // here, not on `RankedRoute`: ranking is a fact about a QUOTE, and the quote
  // surface (plain `QuotedRoute`s) would otherwise destroy the only thing
  // explaining a `best` that prices below `alternatives[0]`.
  promotedOverComplex?: true
}

type EncodedTx = { to: Address; data: Hex; value: bigint }

type BlockRef = { number: bigint; hash: Hex; timestamp: bigint }

type Permit2PermitSingle = {  // defined here, not imported from permit2-sdk
  details: { token: Address; amount: bigint; expiration: number; nonce: number }
  spender: Address
  sigDeadline: bigint
  signature: Hex
}
```

`hookData` flow: hints may carry it; the pool index **never** stores it (it
can depend on trader, amount, direction); the engine keeps a request-scoped
`poolId → hookData` map from the request's hints and applies it when legs are
materialized. A `resolveHookData` callback is future work.

## Architecture

```
Snapshot ─────────── full pinned block { number, hash, timestamp }; every
     │               read, quote, and simulation executes at this block;
     │               deadline = block.timestamp + deadlineSeconds
     ▼
Wave engine ──────── owns stopping policy and caps; drives the primitives;
     │               readiness reads (route-independent) join wave 0's
     │               batch. Preflight of the leader is NOT pipelined against
     │               the next wave (see "Preflight is not pipelined" below)
     │
     │   Wave 0 (1 RTT + 1 preflight RTT): hints (v4 hints validate
     │           locally via poolId recompute) + cached pools +
     │           SPECULATIVE direct quotes — v2 getReserves at the
     │           CREATE2-computed pair, v3 QuoterV2 across enabled fees
     │           (quote reverts ⇒ no pool), v4 standard no-hook configs
     │           via V4Quoter — + v4 exact-pair Initialize logs +
     │           readiness reads + block header, all in one batch.
     │           WARM-INDEX EVIDENCE PASS: when a core intermediate's
     │           legs already face per-pair slot pressure in the index
     │           this search woke up with (pair records > MAX_POOLS_PER_LEG
     │           — a cached/pool-list index, never a cold one), the core
     │           half-pair probes run HERE, two-staged (in-legs at the
     │           request amount, out-legs at the best realized
     │           intermediate output), so wave 0's enumeration — the
     │           anytime contract's first answer — ranks contended legs
     │           on quote evidence rather than creation recency
     │   Wave 1 (2 RTTs): speculative core-intermediate legs; round 2
     │           feeds realized first-leg outputs into second legs
     │           (same-protocol 2-hops quote whole-path in round 1)
     │   Wave 2 (scan-bound): adjacency of the focus endpoint; exact-pair
     │           probes from each neighbor to the other endpoint
     │   Wave 3 (scan-bound): adjacency of the other endpoint; complete
     │           bounded shared-neighbor cross product
     │
     │   waves 1-3 QUOTE WHILE THEY DISCOVER: the wave's scans run
     │   concurrently with a re-enumerate-and-quote pass every
     │   QUOTE_INTERLEAVE_MS (5s), fed by chunk-by-chunk `onLogs`
     │   ingestion, and close with one final pass — so a wave whose
     │   scans outlive the caller's budget still buys prices, not only
     │   pools. getSwap additionally compiles, encodes, and preflights
     │   the leader. Promises resolve at the first actionable result;
     │   iterators yield after every wave that improves the best;
     │   AbortSignal is honored between batches.
     ▼
Stage primitives
     discover/probe ── the engine issues every RPC; ProtocolModules only
     │                 describe them (adjacency/exact-pair LogQuery,
     │                 speculative QuoteProbes, log parsing) → PoolRecords
     ▼
     quote ─────────── whole-path canonical quotes (v3 QuoterV2 path,
     │                 V4Quoter PathKey[]), v2 local reserve math;
     │                 cross-protocol paths chain segments in 2 rounds
     ▼
     compile ───────── QuotedRoute → ExecutionPlan (custody-explicit IR,
     │                 invariants asserted)
     ▼
     encode ────────── ExecutionPlan → EncodedTx for the manifest's
     │                 concrete UR deployment (commandSet-bound)
     ▼
     verify ────────── readiness requirements + eth_call as the real
                       trader; top-K fall-through on genuine reverts
```

### Focus endpoint

Wave 2 scans **one** endpoint's adjacency — the one likely to be small.
Chosen by: `focusToken` request field → endpoint appearing in a hint →
endpoint with fewer cached adjacent pools → endpoint with the newer hinted
pool → `tokenIn`. For a new launch this makes the two-hop search complete
relative to the new asset's adjacency without pulling the enormous WETH/USDC
adjacency sets.

### ProtocolModule (internal contract)

The honest per-protocol seam spans discovery through execution semantics —
not discovery alone. **It is pure: the engine owns every RPC.** A module
*describes* the calls its protocol needs (a topic filter, a probe, a quote
call) and *interprets* what comes back; it never awaits a transport:

```ts
type QuoteProbe = { candidate: RouteCandidate; quote: QuoteCall }

interface ProtocolModule {
  readonly id: Protocol                                   // 'v2' | 'v3' | 'v4'
  enabled(m: ChainManifest): boolean
  speculativeDirect(a: CurrencyRef, b: CurrencyRef, amountIn: bigint, m: ChainManifest): QuoteProbe[]
  adjacency(endpoint: Address, m: ChainManifest): LogQuery[]
  exactPair?(a: CurrencyRef, b: CurrencyRef, m: ChainManifest): LogQuery
  feeDiscovery?: FeeDiscovery                             // v3 only: { query, feesFromLogs, probes }
  parsePoolLog(log: Log, m: ChainManifest): PoolRecord | null
  validateHint(hint: PoolHint, call: (c: EthCall) => Promise<Hex>, m: ChainManifest): Promise<PoolRecord | null>
  encodeQuote(legs: RouteLeg[], amountIn: bigint, m: ChainManifest): QuoteCall
  compileOperation(legs: RouteLeg[], custody: Custody): ExecutionOperation
}
```

Rev 4 had `adjacency(): Promise<PoolRecord[]>`, `directPair()`, and an
I/O-doing `validateHint` — a module that could reach the network. Purity is
strictly better here, for reasons that all turned out to be load-bearing:

- **Policy cannot leak downward.** Block ranges, per-scan request budgets, the
  interleave, coverage bookkeeping and the abort are decided in `waves.ts` and
  applied in `discovery.ts`. A module that awaited its own scan could quietly
  spend a budget it was never told about — which is exactly how fee discovery
  starved the adjacency waves before its budget was hoisted out (see below).
- **One scanner, one set of hard-won behaviors.** Bisection, declared-cap
  handling, regrowth, backoff, chunk batching and the cross-scan width memory
  are written once and every protocol gets them, instead of three copies
  drifting apart.
- **Modules are testable with no transport at all.** `adjacency` returns a
  value to assert on. Only `validateHint` is async, and it takes the caller's
  `call` function rather than a client — the engine still owns the semaphore.

Internal only; adding an AMM means implementing this interface plus (if its
custody semantics are new) extending the encoder — a deliberate, reviewed
change, not a plugin drop-in.

### Preflight is not pipelined (deliberate)

Rev 4 had the leader's preflight overlapping the next wave's scans. The engine
does not do this, and the trade was made knowingly: the wave generator is
**lazy**, so a wave only runs when the consumer pulls. Starting wave N+1's
scans while verifying wave N's leader means doing work the consumer may never
ask for — and never asking for it is precisely what lets `getSwap` resolve a
hinted route with zero log scans. The cost is one preflight round trip of
serial latency per improving wave. See the KNOWN DEVIATION note in
`search/waves.ts`.

## Discovery

### Event-based adjacency

All three protocols index pool-creation topics by token (v2 `PairCreated`,
v3 `PoolCreated`, v4 `Initialize`, whose body carries the full `PoolKey`).
"Every pool containing X" is a pair of `eth_getLogs` filters per protocol;
"the exact pair (A,B)" is one. Filters are generated from each ABI (topic
positions differ; v4's first indexed arg is the PoolId). Scans run
recent-first from the pinned block toward the protocol's `deploymentBlock`,
bisecting ranges on provider caps. v4 poolIds are recomputed from decoded
keys and checked against the indexed id.

Scans **start wide**: the first request spans `min(remaining range, ceiling)`,
where the ceiling is 16M blocks (`MAX_SCAN_WINDOW` — the widest single request
measured served) unless the caller pins a lower one via `logChunkBlocks`. Caps
are per-*query* rather than per-endpoint (measured on one keyed mainnet
endpoint: v4 adjacency capped between 200k and 1M blocks, v2 between 1M and 5M,
v3 adjacency between 5M and 16M, while the v3 fee scan and the v4 exact-pair
scan each served their entire history in one request), and per-request latency
is round-trip- rather than width-dominated (456ms for a 10k window, 89ms for a
1M one), so a conservative fixed start is both unlearnable and expensive — it
was ~100 needless round trips per cold history scan. Refusals bisect down in
~log2 steps; a provider that states its cap in the error is jumped straight to
that width, and one whose refusal was *expensive* rather than cheap (a timeout
or a result-size cap — classified `transport`/`unavailable`) collapses to
`DESCENT_TIMEOUT_FALLBACK` (100k) in one step instead of thirteen.

**A declared cap has two flavors, and only one is durable.** A `span` cap is
policy ("this endpoint serves ≤ N blocks per query") and clamps the scan's
*ceiling*, so regrowth cannot double past a width already refused. A `density`
cap is one observation about one busy filter ("that range returned too many
logs") and only narrows the current window — clamping the ceiling on it would
pin every later, more selective query to the width of the worst one.

**Width discovery is remembered, not re-paid per scan.** A cold search runs
seven scans (three protocols × two topic slots, plus the v4 exact-pair scan),
each of which used to re-derive the same provider cap. `ScanWidthMemory` —
held by the `PoolIndex`, so it outlives the search — carries
`learnedScanWidth` (the widest window actually *served*: a hint, narrowing the
start) and `declaredScanCap` (a ceiling the endpoint *stated*: a bound). Only
the hint crosses a process boundary in a snapshot: a snapshot is keyed by
chain, and two providers share one, so a wrong hint costs a few regrowth
doublings while a wrong ceiling would cap every scan forever.

Once a width has actually been served, chunks at that width go out
`SCAN_CHUNK_CONCURRENCY` (4) at a time; the first chunk of any width always
goes out alone, so the bisection descent is never N simultaneous refusals, and
a batch never straddles a regrowth boundary. All of these decisions are a pure
reducer (`internal/logScanPolicy.ts`) over `(state, outcome) → (state,
action)`, table-tested row by row, so the loop that owns the wire never reasons
about widths.

Bisection is bounded in three directions, because the cap it discovers may be
transient rather than real: the window **grows back** (doubling after N clean
chunks, capped at the scan's ceiling) so one bad response cannot pin the rest of
a multi-million-block walk at a tiny window, and so a transient cap is re-climbed
rather than treated as permanent; every attempt counts against a **per-scan
request budget**, on exhaustion of which the scan stops and reports the blocks it
never reached as uncovered (`partial` discovery — no new report surface); and
retries at the minimum window **back off** exponentially (250ms doubling to a 2s
cap, and no more than 60s of sleeping per scan in total) rather than tight-looping
against an endpoint that is already throttling. All three bound the *work* a scan
may do, not its latency: 4,000 sequential requests against an endpoint that takes
~1s to fail each one is on the order of an hour before the partial result is
returned, so a caller with a latency budget must pass an `AbortSignal` — the only
wall-clock bound in the package. On a well-behaved endpoint that budget is now
~50x headroom (a cold mainnet history is 2 requests at the ceiling, versus ~2,600
at the old 10k window). Constants and their derivations live in `constants.ts`.

### Direct-pair probes

No factory lookup: the quote call *is* the probe, at a locally derived address.
v2 computes the CREATE2 pair and calls `getReserves`; v3 calls QuoterV2 at the
CREATE2 pool address across **all enabled fees** (standard tiers probed
immediately; the `FeeAmountEnabled` history scanned per factory and cached
covers nonstandard tiers); v4 uses an exact-pair topic filter. (`getPool` is
still called, but only by v3's `validateHint`, where the fee tier makes a
hinted pool's address non-derivable from the pair alone.)

**Fee discovery carries a request budget, threaded from the wave engine.**
`FEE_DISCOVERY_MAX_REQUESTS` (128) bounds one factory's `FeeAmountEnabled` walk
per search. It sits in wave 1, ahead of the adjacency scans that discovery
coverage is actually reported for, and on a 10k-capped endpoint Base's 48.2M
blocks of v3 history is 4,822 requests / 62s — an entire `--budget 60s` spent
before wave 2 started, reporting `partial — nothing covered yet` for all three
protocols. The bound is on *cost* rather than on a block window (fee
enablements are old, not recent), and the scan **converges across searches**:
coverage is keyed by factory, so each search resumes where the last stopped.

### Scan-coverage cache

The index remembers which ranges were scanned per (protocol, endpoint):
subsequent requests scan only `coveredThroughBlock + 1 → pinned block` plus a
small overlap re-scan (shallow-reorg tolerance), deduped by event identity.
This makes the cache useful without becoming an indexer.

### Candidate selection (deterministic)

Caps: `maxHops: 2`, `MAX_POOLS_DIRECT = 6` and `MAX_POOLS_PER_LEG = 3` (both
across all protocols), `MAX_INTERMEDIATES = 8`, `MAX_QUOTE_CANDIDATES` (78,
derived), `PREFLIGHT_TOP_K = 3` — all observable in the `SearchReport`,
including what they pruned.

**The per-pair cap is split by cost class.** A direct-pair selection is linear
(one candidate per kept pool), so 6 covers the pool set an ordinary major pair
actually has: one v2 + the four standard v3 tiers + one v4, exactly. A two-hop
*leg* selection is quadratic (every kept in-leg pool crossed with every kept
out-leg pool, per intermediate), so it keeps the historical 3 — raising it to 6
would take a single intermediate from 9 candidates to 36. One shared constant
had to be either too small for the linear case or too expensive for the
quadratic one.

**And the total is derived from them, never chosen:**

```ts
MAX_QUOTE_CANDIDATES = MAX_POOLS_DIRECT + MAX_INTERMEDIATES * MAX_POOLS_PER_LEG ** 2   // 6 + 8*9 = 78
```

which is a true upper bound on what `generateRoutes` can produce. The bare
`48` this replaced sat under a real worst case of 75: intermediates 6–8 could
enumerate full cross products and have every candidate silently trimmed while
`intermediatesSelected` still reported all 8 — a report overstating what was
quoted. Deriving it makes that drift a compile-time impossibility, and makes
`candidatesPruned` structurally zero today (it is kept as a drift backstop).

Intermediate priority: hints → previously successful (this instance) →
configured core intermediates → intermediates from newest endpoint pools →
remaining neighbors, stable order.

Pool-within-pair priority: hinted → **this search's own quote evidence**
(largest observed single-leg output first; evidenced over unevidenced) →
previously successful (most recent success block) → newest-created → an
unhooked pool where available → remaining, deterministic order. One slot per
pair is always reserved for the newest-initialized pool.

**Quote evidence is the warm-index fix, and it is quote-is-probe applied to
selection.** Without it, a dense pair under slot pressure fell through to
newest-created — which on mainnet is liquidity-HOSTILE, because a pair's
junk/copycat pools postdate its canonical liquid pool. Measured live
(XPR → USDC, 13 XPR/WETH pools, no direct pool): a cold cache found 0.2575 USDC
through the old v3 0.3% pool; a warm 655k-pool cache found 0.0460 — 5.6x worse
— because all three `MAX_POOLS_PER_LEG` slots went to freshly-created v4 junk
and the liquid pool was never quoted. The evidence is free: it is the
`amountOut` of single-leg quotes the search already pays for (direct
candidates, wave-0/fee route probes, and the half-pair discovery probes, which
now also `markSuccess` their pools instead of discarding the outcome). Values
are per-search, never persisted — they are only commensurable within one pair
at one block at one amount, which is exactly the only place selection compares
them. Success-block recency alone cannot do this job: it is boolean per block,
so junk that answers a quote (with a terrible price) ties the liquid pool and
the tie falls back to the broken recency key.

Two consequences follow. First, the core half-pair probes moved a wave early
*under contention only* (see the wave diagram): wave 0's enumeration is the
anytime contract's first — often only — answer, and evidence that arrives in
wave 1 is evidence that answer never sees. Second, the out-legs are probed at
the best realized intermediate output rather than `amountIn` (which is
denominated in tokenIn and therefore dimensionally wrong for the second leg —
measured live, the dust-amount ranking cost 0.3% by preferring a 0.01%-fee v4
pool over the v3 0.05% pool that wins at the realized amount). After both, the
warm cache quoted 0.257667 vs cold's 0.257458 on the same pair — the warmer
index now WINS, by knowing a nonstandard-tier pool speculation cannot reach.

Negative results (pool exists but unquoteable) are cached only for the pinned
block.

## Quoting

- **v3/v4**: canonical whole-path quoter `eth_call`s (QuoterV2 path encoding,
  `V4Quoter.quoteExactInput(PathKey[])`). Direct calls preserve original
  `msg.sender` for hooks and isolate per-candidate failures. Never Multicall3.
- **v2**: local constant-product math from `getReserves` — an *estimate
  assuming standard ERC-20 transfers*, not a canonical quote. Fee-on-transfer
  / rebasing / restricted tokens may quote but are safely rejected or
  downgraded at preflight, never returned `ready` on a mispriced quote.
- **Cross-protocol paths**: two batch rounds (all first segments; then second
  segments fed with realized outputs).
- **Transport**: `client.request` under the router-wide semaphore
  (`concurrency`, default 20 — shared with scans, readiness and preflight, not
  per batch); callers opt into single-HTTP-request batching via
  `http(url, { batch: true })`.
- **Ranking**: `amountOut` desc → fewer protocol transitions → fewer hops →
  deterministic route id. Simplicity margin (`SIMPLICITY_MARGIN_BPS`, 5): a
  hooked or mixed route must beat a simpler one by more than this to win. A
  promoted route carries `promotedOverComplex: true` — without it a `best`
  pricing *below* `alternatives[0]` (observed live on Base: 1,906.256081 vs
  1,906.567949 USDC from a hooked v4 pool, 1.6 bps inside the margin) reads as
  a broken sort rather than as the documented margin. At most one route per
  ranked list carries it, and it survives the quote surface's projection.
- **Hooks**: v1 supports v4 pools quoteable via the canonical V4Quoter with
  empty or hint-supplied hookData; unknown hooks are always tried with `0x`,
  and such routes require a passing preflight to be `ready`. No policy knob.

## Execution planning and encoding

The encoder is a **versioned execution compiler**. The complexity is custody
— payer semantics, recipient modes, balance sentinels, native wrapping,
Permit2 pulls, output checks, intermediate cleanup — and it differs between
immutable Universal Router versions.

```
QuotedRoute → compileExecutionPlan() → encode<commandSet>()
```

```ts
type ExecutionPlan = {
  acquireInput:
    | { kind: 'native-value'; amount: bigint }
    | { kind: 'permit2-pull'; token: Address; amount: bigint; permit?: Permit2PermitSingle }
  operations: ExecutionOperation[]
  deliverOutput: { recipient: Address; currency: CurrencyRef; minAmountOut: bigint }
}

type ExecutionOperation =
  | { kind: 'wrap-native';   amount: bigint | 'router-balance' }
  | { kind: 'unwrap-native'; amount: bigint | 'router-balance' }
  | { kind: 'v2-swap'; legs: RouteLeg[]; payer: 'trader-via-permit2' | 'router'; recipient: 'router' | 'final' }
  | { kind: 'v3-swap'; legs: RouteLeg[]; payer: 'trader-via-permit2' | 'router'; recipient: 'router' | 'final' }
  | { kind: 'v4-swap'; legs: RouteLeg[]; settleFrom: 'trader-via-permit2' | 'router'; takeTo: 'router' | 'final' }
```

Compiler invariants, asserted on every plan: every intermediate output has
exactly one consumer; no pool reused; exactly one final slippage check; no
allow-revert flags; nothing stranded in the router; native/WETH conversions
are explicit operations (**including intermediate** wrap/unwrap, e.g. v4
native pool → v3 WETH pool); recipients validated (incl. UR sentinel
collisions); Permit2 only funds the initial leg.

Version binding:

```ts
type UniversalRouterDeployment = {
  address: Address
  commandSet: 'ur-2.0' | 'ur-2.1'  // closed supported set; extended deliberately
  codeHash?: Hex              // keccak of the deployed code, verified at init when provided
                              // (the immutable cross-check below is stronger, and always on)
  permit2: Address
  wrappedNative: Address      // UR's own immutable; also drives native-family normalization
}
```

**The commandSet axis was proved by its second implementation** (2026-08-07):
`ur-2.1`, the UR 2.1.1 family, landed exactly as this section promised —
register an encoder behind `encoderFor`, extend `COMMAND_SETS`, flip the
manifest; no public API change, no call-site hunt. The implementation shape
validated a refinement of the "700-line encoder per set" picture: 2.1 changes
only the ABI of the three exact-in swap payloads (`minHopPriceX36`), so the
custody walker is shared (`encode/core.ts`) and each set is a thin
`SwapPayloadCodec` (`ur20.ts`/`ur21.ts`) — the versioned surface is versioned,
the fund-loss-critical custody logic exists once. The differential oracle ran
per set as specified (the full shape matrix against `universal-router-sdk`
pinned to `V2_1_1`, own goldens file), plus two oracles the spec did not
anticipate: behavioral verification of the deployed router's dispatch table
(2.0-shaped payloads revert `SliceOutOfBounds`/misparse — `encode/ur21.ts`),
and live `eth_simulateV1` execution as the proof on a chain that cannot be
forked (`canary/robinhood.test.ts`).

Differential oracle: `universal-router-sdk` devDependency pinned per
`commandSet`, plus golden calldata vectors in-repo and fork execution — SDK
byte-equality alone is not the oracle.

Supported shapes are a closed set — {single, two-hop} × {v2, v3, v4, mixed}
× {erc20, native} in/out, exact-input, optional permit — anything else
throws `UnsupportedRouteError`.

Edge cases defined now: `tokenIn === tokenOut` rejected; native↔WETH is
wrap/unwrap only (no pools); an intermediate equal to an endpoint after
normalization rejected as a cycle; recipient colliding with sentinel
addresses rejected.

## Chain manifest

Atomic per-protocol bundles; overrides replace whole bundles, never
individual fields — preventing configs where discovery finds pools on
factory A while the UR executes against factory B:

```ts
type ChainManifest = {
  chainId: number
  wrappedNative: Address          // required (C4-P3): quoting's native-family normalization needs
                                   // it whether or not a swap execution bundle is ever attached
  chain?: { blockTimeSeconds?: number; reorgOverlapBlocks?: bigint }
  v2?: { factory: Address; deploymentBlock: bigint; initCodeHash?: Hex }
  v3?: { factory: Address; deploymentBlock: bigint; v3QuoterV2: Address; poolInitCodeHash?: Hex }
  v4?: { poolManager: Address; deploymentBlock: bigint; quoter: Address }
  execution?: UniversalRouterDeployment   // optional (C4-P3) — see "Quote-only manifests" below
  coreIntermediates?: Address[]   // default: wrappedNative + per-chain majors
}
```

Bundled defaults for known chains (verified QuoterV2 addresses per chain,
independently checked against each chain's public RPC — never taken from
`sdk-core`'s `quoterAddress`, which is QuoterV1-shaped on several chains; see
"Runtime dependency" below for why `sdk-core` is not a runtime import at all,
C4-P4). At init: chainId cross-checked against the client; the `chain` bundle
validated synchronously (positive block time under a sanity ceiling,
non-negative reorg depth); `wrappedNative` cross-checked against
`execution.wrappedNative` whenever `execution` is present
(`RouterConfigError` on mismatch — see below).

**The UR's own bytecode is fingerprinted for this manifest's immutables,
unconditionally.** Whenever `execution` is present, one `eth_getCode` fetches
the deployed code and `assertImmutablesEmbedded` requires it to embed
`execution.permit2`, `execution.wrappedNative`, and each configured
`v2.factory` / `v3.factory` / `v4.poolManager` verbatim. `codeHash` alone is
blind to a router whose code is byte-identical to a known-good deployment but
wired to another chain's factories — which is exactly what the Robinhood Chain
bring-up found: mainnet's and Base's real UR bytecode, unmodified, at the usual
UR address, configured for their own factories. Same code, same hash, wrong
chain. (This assumes `execution.address` is the immutable-bearing contract, not
a proxy — the Uniswap convention for every UR deployment.) A protocol
without a bundle is skipped and reported `disabled` in every result — "no v2
route" is always distinguishable from "v2 not searched".

### Quote-only manifests (C4-P3)

`execution` is the one bundle a manifest can omit entirely. Before C4-P3 it
was required, which meant a caller who only ever wants `getQuote`/`quotes` —
a price-feed service with no interest in swap calldata — had to configure a
Universal Router deployment, a Permit2 address, and a `commandSet` it would
never use, purely to satisfy the type. `wrappedNative` is hoisted to the top
level of `ChainManifest` (required there, unconditionally) because it is the
one execution-bundle field quoting genuinely needs — native-family
normalization (`toGraphNode`/`sameFamily`) runs on every request, quote-only
or not — while every other `execution` field (`address`, `permit2`,
`commandSet`, `codeHash`) is swap-only.

`execution.wrappedNative` still exists, unchanged: it is the concrete
Universal Router deployment's own immutable (its constructor argument on
some chains, a fact about *that specific contract*, not about the chain in
the abstract), not a duplicate to keep in sync by convention. Whenever a
manifest carries both fields, `assertWrappedNativeConsistency` cross-checks
them — at `manifestFor` and at `createRouter` — and throws
`RouterConfigError` on a mismatch. This is a **stronger** invariant than the
one `execution.wrappedNative` used to enforce alone: previously nothing else
stated the address, so nothing could disagree with it; now two fields can,
and both are checked before either is trusted downstream. Every built-in
manifest sets both, equal.

`getQuote`/`quotes` never read `manifest.execution` at all — every quote-path
module (`v2Module`/`v3Module`/`v4Module`'s `speculativeDirect`/`encodeQuote`,
`search/discovery.ts`'s `node`, `search/waves.ts`'s wave 1-3 core-intermediate
and focus-selection logic) reads `manifest.wrappedNative` instead.
`getSwap`/`swaps` reject a request against an execution-less manifest with
`RouterConfigError('manifest has no execution bundle — swaps need a Universal
Router deployment')`, synchronously, in `validateSwapRequest`, before any
RPC — the same posture as every other request-validation check. Everything
downstream of that check (readiness's `permit2`/`router` addresses, leader
compilation's encoder dispatch) reaches `manifest.execution` through
`requireExecution` (`manifest.ts`), which is unreachable on the swap path in
practice (the pre-check already ran) and exists so those call sites narrow
the optional field once instead of `!`-asserting it at every use.

`manifestFor`'s override contract is unchanged in spirit: `execution:
undefined` removes the bundle wholesale, exactly like any other bundle key.
`wrappedNative` is not a bundle — it is a required scalar, like `chainId` —
so an override replaces just the address and can never remove it (a
manifest with no wrapped-native token cannot quote at all). Building a
manifest for an unknown chain now requires only `wrappedNative` via
`overrides` (previously it required `execution`); supplying `execution`
alone still works, since the top-level field defaults from
`execution.wrappedNative` when the caller does not state it separately.

**The `chain` bundle carries the facts that are neither a deployment nor a
tuning knob** (C4-P1) — chain physics the engine would otherwise have to
assume were mainnet's:

- `blockTimeSeconds` (default 12) converts every TIME-shaped policy into
  blocks. Today that is wave 0's recent-launch scan window, whose policy is
  `WAVE0_RECENT_WINDOW_SECONDS = 604_800` (7 days) and whose block count is
  `ceil(604800 / blockTimeSeconds)`: 50,400 on mainnet, 302,400 on a 2s L2,
  2,419,200 on Arbitrum. A fixed block count here is a unit error — the old
  `50_000n` constant meant 28 hours on Base and 3.5 hours on Arbitrum, i.e.
  the new-launch fast path stopped covering the launch on exactly the chains
  where launches happen.
- `reorgOverlapBlocks` (default 32 — one beacon epoch) is the tip a warm scan
  re-opens on every pass, and the unit the head watermark's plausible-
  regression bound is 4x of. On an L2 the relevant depth is an unsafe-head
  rewind, typically far deeper in that chain's faster blocks. It is injected
  into `PoolIndex` at construction (the index is manifest-unaware by design),
  and an injected index whose overlap disagrees with the manifest is rejected
  with `RouterConfigError`, exactly as a mismatched `wrappedNative` is.

**Init code hashes are chain facts too.** `v2.initCodeHash` and
`v3.poolInitCodeHash` default to the canonical values every ordinary EVM fork
shares, and exist because zkSync-class chains do not: their CREATE2 preimage
differs, so the default derives addresses no pool lives at, every speculative
probe reverts, and the search reports a confident `no-route` rather than a
configuration failure. Overriding them is what makes such a chain routable.

## Public API

```ts
const router = createRouter({ client, manifest })   // no policy object

// Promises: resolve at the first ACTIONABLE result — 'ready' or
// 'needs-action' for swaps, 'quote' for quotes — or the terminal
// no-route/inconclusive after the bounded search completes.
router.getQuote(req: QuoteRequest): Promise<QuoteResult>
router.getSwap(req: SwapRequest): Promise<SwapResult>

// Iterators: yield the current best after every wave that improves it;
// the final yield is the completed bounded search. Abandoning the
// iterator keeps everything the instance learned.
router.quotes(req: QuoteRequest): AsyncIterable<QuoteResult>
router.swaps(req: SwapRequest): AsyncIterable<SwapResult>

router.ingestPool(hint: PoolHint): Promise<void>
router.ingestLogs(logs: Log[]): void
router.ingestReceipt(receipt: Pick<TransactionReceipt, 'logs'>): void   // launcher fast path

// PoolIndex lifecycle (C4-H5) — see the dedicated section below.
router.stats(): RouterStats
router.clearIndex(): void

// Pure pieces, no stability guarantee — everything the facade is built from,
// each constructible from what this subpath itself exports:
// import {
//   generateRoutes, compileExecutionPlan, encoderFor, buildHookData,
//   PoolIndex, POOL_INDEX_SCHEMA_VERSION, serializeSnapshot, parseSnapshot,
//   PROTOCOL_MODULES, v2Module, v3Module, v4Module,
//   v2PoolRef, v3PoolRef, v4PoolRef, isHooked,
// } from '@uniswap/router-lite-sdk/experimental'
```

**Internal constants** (not configuration; all effects observable in
`SearchReport`): `MAX_POOLS_DIRECT = 6`, `MAX_POOLS_PER_LEG = 3`,
`MAX_INTERMEDIATES = 8`, `MAX_QUOTE_CANDIDATES` (derived, 78),
`PREFLIGHT_TOP_K = 3`, `SIMPLICITY_MARGIN_BPS = 5`,
`FEE_DISCOVERY_MAX_REQUESTS = 128`, `QUOTE_INTERLEAVE_MS = 5_000`,
`SCAN_CHUNK_CONCURRENCY = 4`, plus the log-scan bounds and the hostile-input
ceilings (`MAX_HINTS_PER_REQUEST`, `MAX_AMOUNT_IN`, `MAX_DEADLINE_SECONDS`,
`MAX_HOOK_DATA_BYTES`, `HINT_DISCREDIT_FAILURE_BLOCKS`). Values are revisited
from the latency benchmarks, not exposed as knobs — the two `createRouter`
options that *do* move a constant (`concurrency` over `DEFAULT_CONCURRENCY`,
`logChunkBlocks` over `MAX_SCAN_WINDOW`) are transport facts about the
caller's provider, not search policy. Resume-from-previous-state is not an
API: the instance's `PoolIndex` + `ScanCoverage` make every subsequent call
start from what is already known and scan only the block delta.

### PoolIndex lifecycle (C4-H5)

By default the `PoolIndex` above is unbounded and process-lived: every
distinct pool ever hinted/discovered/probed earns a permanent entry
(~3.1 KB/pool including adjacency), and every distinct scan scope a caller
has asked about earns a permanent coverage entry — measured at 150–250 MB
for a single long-tail trade's WETH-adjacency scan. `createRouter` gained two
optional construction knobs and `Router` two new methods to manage that
lifetime, none of which change the zero-config path:

```ts
type CreateRouterOptions = {
  client: PublicClient
  manifest: ChainManifest
  index?: PoolIndex        // inject a pre-built index (warm handoff between routers)
  maxPools?: number        // bound this router's own index; default unbounded
  concurrency?: number     // C4-P6: router-WIDE in-flight `client.request` bound; default 20
  logChunkBlocks?: bigint  // C4-P6: ceiling on the `eth_getLogs` window; default MAX_SCAN_WINDOW
}

type RouterStats = {
  pools: number
  adjacencyEdges: number
  coverageScopes: number
  negativeCacheBlocks: number
  enabledFeeFactories: number
}

router.stats(): RouterStats   // sizes only, safe to log on an interval
router.clearIndex(): void     // swaps in a fresh, empty PoolIndex
```

- **`index`** — inject a pre-built `PoolIndex` (exported from
  `/experimental`) instead of letting `createRouter` allocate an empty one,
  for a host that owns the index's lifetime independently of any one router
  instance (warm one via `ingestLogs`/`ingestReceipt`/searches, hand it to a
  freshly created router with zero re-scanning; also how a restored
  `fromSnapshot` index enters a router). Validated synchronously, before any
  RPC, on the two chain facts the index was *built* with and cannot re-derive:
  `index.wrappedNative` must equal `manifest.wrappedNative` (the top-level
  field, C4-P3 — present on every manifest whether or not it carries an
  `execution` bundle), and `index.reorgOverlapBlocks` must equal the
  manifest's (C4-P1 — a coverage cache maintained under a shallower tip cannot
  be trusted by a router that believes the chain rewinds deeper). Either
  mismatch throws `RouterConfigError` immediately: a mismatched index would
  silently misroute every native-family pair, or silently under-re-scan the
  tip. `maxPools` is ignored when `index` is supplied; the injected index keeps
  whatever bound it was built with.
- **`maxPools`** — bounds the index `createRouter` allocates. Past the cap,
  inserting a pool evicts the least-recently-*touched* one (touch = an
  upsert, a successful quote, a failed quote, or being selected as a route
  leg during candidate enumeration — `PoolIndex.touchAll`, called from
  `quoteEnumerated`, so a pool alive only as a two-hop intermediate is not
  evictable just because nothing ever called `markSuccess` on it directly),
  except a pool touched at the block the triggering call itself named, which
  is never evicted no matter how far over cap that leaves the index. A
  discredited hint (`isDiscredited`) is the *last* eviction candidate, not an
  ordinary one — its accumulated failure history is the valuable, hard-won
  part of an otherwise-tiny record, and evicting it would hand a caller who
  resubmits the same junk hint its full un-discredited rank back for free.
  Eviction removes the evicted pool's adjacency edges too, so `pair`/
  `neighbors` never return a dangling reference.
- **`stats()`** — a sizes-only snapshot (never the pools/routes themselves),
  folding in what used to be `PoolIndex`'s test-only
  `negativeCacheBlockCount()` accessor.
- **`clearIndex()`** — swaps in a fresh `PoolIndex`, dropping every learned
  pool/adjacency edge/coverage range/discredit counter/negative-cache
  entry/`enabledFees` entry at once. The router's cross-search head
  watermark is NOT index state (it lives beside the index) and survives a
  clear untouched. Safe to call mid-search: `buildContext` copies the
  router's *current* index reference into a `SearchContext` the moment a
  search starts, so an in-flight `quotes`/`swaps` generator keeps draining
  its own already-pinned (old) index to completion — `clearIndex` only
  changes what the *next* call sees.
- **`concurrency`** (C4-P6) — one semaphore per router instance, bounding
  in-flight `client.request` calls **across** every operation sharing it
  (`ethCall`, `scanLogs`, `preflightTx`, readiness's balance read,
  `ingestPool`'s hint validation, the pinned-block fetch). It is a *global*
  bound, not a per-batch one: wave 0 fires hint validation, probes and
  readiness concurrently, so before this the real peak was the sum of each
  batch's own limit — measured at ~44. Default 20; integer in
  `[1, MAX_CONCURRENCY = 1024]`, validated synchronously because `<= 0` makes
  every `acquire()` queue forever. The one deliberate carve-out is
  `validateManifest`'s `getChainId`/`eth_getCode`, which run at most once per
  router's lifetime.
- **`logChunkBlocks`** (C4-P6) — the ceiling on the `eth_getLogs` window,
  starting width and regrowth alike. Pass it when you *know* your provider's
  cap (Ankr's public endpoint ~3,000) and would rather not pay the descent;
  leave it unset and the scanner discovers the cap itself. Must be at least
  `MIN_CHUNK`, validated synchronously — a smaller value inverts the chunk
  arithmetic and burns the whole per-scan request budget on a range that can
  never be served.

### Index snapshots

`PoolIndex.toSnapshot()`/`fromSnapshot()` (plus `serializeSnapshot`/
`parseSnapshot`, since `JSON.stringify` throws on the bigints a snapshot
carries) make everything the index learned portable across processes:
`pools` (adjacency re-derived on the way in, never stored), `coverage` — the
one thing that cannot be re-derived more cheaply than by re-scanning —
`enabledFees`, `learnedScanWidth`, and the two chain facts (`wrappedNative`,
`reorgOverlapBlocks`) that make the rest interpretable. `POOL_INDEX_SCHEMA_VERSION`
is checked exactly, with no migration path: the whole payload is a cache of
things the chain can be re-read for, so starting fresh costs a delta scan.
Deliberately absent: the negative cache (block-scoped, evicted on first use
anyway) and the LRU clock (re-approximated from each record's own blocks).

The SDK still performs no I/O. `cli/cache.ts` is the reference consumer, and
it states the trust boundary the SDK cannot: a cache file may come from a
restored CI artifact or a shared `XDG_CACHE_HOME`, so it is treated as
untrusted — shape-checked before loading, every asserted pool still priced by
a real `eth_call` before it can appear in a result, and junk decaying via
`isDiscredited`. The accepted, named residual is **coverage suppression**: a
hostile snapshot can claim ranges nobody scanned and thereby *hide* a pool.
Detecting that means doing the scan the cache exists to avoid, so `--no-cache`
is the answer, and it is why this lives in `cli/` rather than in the SDK.

### Requests

```ts
type QuoteRequest = {
  tokenIn: CurrencyRef
  tokenOut: CurrencyRef
  amountIn: bigint
  focusToken?: CurrencyRef
  hints?: PoolHint[]
  signal?: AbortSignal    // e.g. AbortSignal.timeout(900) for latency SLAs
}

type SwapRequest = QuoteRequest & {
  trader: Address
  recipient?: Address           // default: trader
  slippageBps?: number          // default 100
  deadlineSeconds?: number      // default 300, from pinned block timestamp
  permit?: Permit2PermitSingle
}
```

#### Request validation (hostile input)

A request is caller-supplied data, and in the deployments this package targets
("a fallback when the main routing stack fails", a launcher service) the caller
is often relaying an end user's parameters. Every request field is therefore
bounded synchronously, before any RPC, and every failure is a
`RouterConfigError` naming the offending field — never a mid-search throw, and
never a silently-accepted value that surfaces as bad calldata:

| Field | Bound | Why |
| --- | --- | --- |
| `amountIn` | `> 0`, `< 2^128` | The V4Quoter's `quoteExactInput` and the UR's v4 swap params take `uint128`; anything at or above the ceiling is un-encodable for v4 at all |
| `hints` | ≤ 64 entries (`MAX_HINTS_PER_REQUEST`) | Each hint is validated (v3 costs an `eth_call`) and upserted into a `PoolIndex` that lives for the *process*, not the request — unbounded `hints` is unbounded RPC fan-out plus unbounded growth of a long-lived index |
| `hints[].hookData` | 0x-prefixed even-length hex, ≤ 4096 bytes (`MAX_HOOK_DATA_BYTES`) | Opaque bytes copied verbatim into every quote call and the final calldata; viem pads an odd-length `bytes` silently, so a malformed hint would reach the chain as different bytes than the caller wrote |
| `slippageBps` | integer in `[0, 10000]` | — |
| `deadlineSeconds` | integer in `[1, 86400]` (`MAX_DEADLINE_SECONDS`) | Reaches `BigInt()` in leader compilation, where a fractional value is a bare `RangeError`; an unbounded deadline is an effectively deadline-less transaction |
| `trader` / `recipient` | not zero, not a UR sentinel | A literal sentinel recipient silently misdirects funds |
| `recipient` | not `tokenIn`/`tokenOut`, `execution.address`, `permit2`, or `wrappedNative` | All live contracts a caller reaches by copy-pasting the wrong config field; output delivered there is unrecoverable |
| `recipient` | not any pool the chosen plan trades through (`assertPlanInvariants`) | Only checkable once a route exists, so it lives with the plan invariants rather than with request validation |
| `permit.details.expiration` / `.nonce` | integer in `[0, 2^48)` (`MAX_PERMIT2_UINT48`) | Permit2's own `uint48`s, arriving as plain `number`s and reaching `BigInt(...)` in `isPermitValid` — a fractional one is a bare `RangeError` thrown from inside wave 0's `Promise.all`, out of a function documented never to throw for a business outcome |
| `permit.details.amount` | bigint in `[0, 2^160)` (`MAX_PERMIT2_UINT160`) | Permit2's `uint160`. Held as a bigint, so the hazard is silent rather than loud: an over-wide amount compares fine against `amountIn` (the permit reads as covering the trade) and fails much later as an encoder error about calldata |
| `permit.details.token` / `permit.spender` / `permit.sigDeadline` | valid addresses; token equals `tokenIn`; non-negative bigint | `spender` is compared only downstream (readiness, the encoder), neither of which can report a `RouterConfigError` about a request field — so it is shape-checked here |

Two hostile-input defenses do not fit the table:

- **A quote is not a trusted number either.** `amountIn` is bounded up front,
  but `amountOut` comes from the chain — a broken quoter or a hooked pool can
  answer with a value whose slippage floor overruns the UR's `uint128`
  `amountOutMinimum`. Leader compilation treats viem's
  `IntegerOutOfRangeError` exactly like an unsupported route shape: the
  candidate is degraded (it cannot be encoded, so it cannot execute) and the
  search continues to the next one. One poisoned quote never aborts a search.
  When *every* candidate fails that way, the resulting `no-route` carries the
  first compile failure's message in its `reason` — "nothing verified" is the
  same verdict whether the chain rejected the simulations or nothing could be
  built at all, and only the second is something the caller can fix.
- **Hint provenance is provisional.** `validateHint` for v2 and v4 does no
  on-chain lookup at all (a v2 pair address is a pure CREATE2 derivation; a v4
  poolId is the hash of the caller's own `PoolKey`), so *any* well-formed hint
  enters the index at the top of the provenance order, ahead of every pool a
  creation log proved exists. A hinted pool that has failed to quote at
  `HINT_DISCREDIT_FAILURE_BLOCKS` (2) distinct blocks with zero lifetime
  successes is **discredited**: it ranks *below* `event`/`factory` pools in
  candidate selection, and stops buying its two-hop intermediate a top slot.
  That evidence has to accumulate during real searches, so every channel that
  quotes a pool *on its own* records its data-less failures — wave 0/1 route
  probes, direct-pair candidates, and the discovery probes of waves 1-2, which
  are the only thing that quotes a half-pair leg and therefore the only thing
  that can contradict a hint bought into an intermediate slot. (A pool
  reachable only inside a two-leg candidate is not attributed a failure at all:
  `quoteCandidates` reports per candidate, not per segment, and guessing which
  leg was at fault is exactly the poisoning C4-H3 forbade.)
  It is not deleted and the demotion is not permanent — a hint may legitimately
  name a pool that only becomes quoteable later (pre-launch, unfunded, a hook
  that opens at a set block), so the record keeps its `source: 'hint'` and
  there are two routes back: the first successful quote, or a pool-creation log
  (an `event`-sourced upsert clears the failure counters, since a creation log
  answers the existence question the counters stood in for). The second route
  exists because the first is not guaranteed: on a pair already at
  its pair's cap (`MAX_POOLS_DIRECT`/`MAX_POOLS_PER_LEG`) with proved pools, a demoted record can be pruned out of
  selection entirely and never quoted again — recovery needs spare pair
  capacity or a creation log, not merely patience.

`ingestLogs`/`ingestReceipt` are the one input that is bounded per *entry*
rather than in aggregate: each log's parse is isolated (a `null` entry, a
missing `address`, truncated `data`) so one malformed log never takes the batch
down, but `logs.length` is uncapped, because it is a batch the caller assembled
from a receipt it already holds rather than remote data pretending to be a
request. The trust boundary is stated rather than enforced — **`ingestLogs`
trusts the caller's log provenance**, and a caller forwarding logs it did not
fetch itself is asserting pools exist on the say-so of whoever handed them over.

### Results

Quotes never carry transactions; swaps always do. The two unions do not
overlap:

```ts
// `search` and `alternatives` are true of every outcome, so they are hoisted out of the variants:
// status-agnostic code (logging, telemetry, diffing two results) reads them off any result without
// narrowing first, and an empty `alternatives` means "nothing else priced" rather than "this
// variant does not carry the field".
type ResultBase = { search: SearchReport; alternatives: RankedRoute[] }

// A terminal result's cause is STRUCTURED, not prose (C4-P5). `code` is the closed vocabulary a
// caller may `switch` on — exported as a value (`REASON_CODES`) so the set can be walked, not
// hand-copied; `detail` is human-readable text carrying no contract and free to be reworded.
// Rev 4 had `reason: string`, and the README was already documenting two of those strings as if
// they were an API, with nothing stopping the prose around them from drifting.
const REASON_CODES = ['rpc-unavailable', 'rpc-degraded', 'aborted', 'discovery-incomplete',
                      'quotes-unattempted', 'no-viable-route', 'no-route-verified'] as const
type Reason = { code: (typeof REASON_CODES)[number]; detail: string }

// The compiled plan's own on-chain limits, echoed onto the two leading arms (C4-P7) so a caller can
// log or compare what the plan ASSERTS without re-deriving it from `slippageBps`/`deadlineSeconds`
// and the pinned block — a re-derivation is a second chance to disagree with the encoded `tx`.
type CompiledLimits = { minAmountOut: bigint; deadline: bigint }

type SwapResult = ResultBase & (
  | { status: 'ready';        best: RankedRoute; tx: EncodedTx; execution: { verifiedAtBlock: BlockRef }; limits: CompiledLimits }
  | { status: 'needs-action'; best: RankedRoute; tx: EncodedTx; requirements: ExecutionRequirement[]; limits: CompiledLimits }
  | { status: 'no-route';     reason: Reason }
  // TWO ARMS, NOT ONE WITH TWO OPTIONAL FIELDS: a `tx` with no `best` is calldata with nothing
  // naming the route it executes. The split makes that shape fail to COMPILE in any producer;
  // both arms declare both fields, so a reader that narrowed to 'inconclusive' needs no further
  // narrowing.
  | { status: 'inconclusive'; reason: Reason; best?: undefined; tx?: undefined }
  | { status: 'inconclusive'; reason: Reason; best: RankedRoute; tx?: EncodedTx }
)

type QuoteResult = { search: SearchReport; alternatives: QuotedRoute[] } & (
  | { status: 'quote';        best: QuotedRoute }
  | { status: 'no-route';     reason: Reason }
  // NO `best`, and the asymmetry with SwapResult is deliberate: a price is a price, so a leader is
  // reported `quote` however incomplete the search that found it. A quote is `inconclusive` only
  // when NOTHING priced, and there is then no leader to carry.
  | { status: 'inconclusive'; reason: Reason }
)

// Convenience aliases for the variants callers narrow to and then pass around:
type ReadySwap       = Extract<SwapResult,  { status: 'ready' }>
type NeedsActionSwap = Extract<SwapResult,  { status: 'needs-action' }>
type SuccessfulQuote = Extract<QuoteResult, { status: 'quote' }>

// A swap's `no-route` carries `alternatives`: a completed search whose every leader failed
// execution verification is `no-route` (not `inconclusive`), with the failed candidates it tried
// — including the nominal best — returned here so the caller can see what was attempted.
//
// `inconclusive` is an INCOMPLETE search, not an empty one: a search that priced twelve routes and
// compiled a transaction before `AbortSignal.timeout(900)` fired hands all of it back (`best`,
// `tx`, `alternatives`) alongside the reason it cannot be promised `ready`/`needs-action`. Both are
// optional because the search may equally have been cut off before finding anything — or have found
// only routes the chain rejected: a candidate that REVERTED in preflight is demoted to
// `alternatives` (with its `revertData`) on this path too, exactly as on the completed `no-route`
// path, and no `tx` is offered for it. A revert is evidence about the chain and stays valid however
// incomplete the rest of the search was, so `inconclusive` never leads with a known-broken route.
//
// `best` and `alternatives` are one type per union, so `.execution` is readable off either without
// knowing which is in hand. `ready.best.execution` is always 'verified' at runtime and
// `needs-action.best.execution` always 'needs-action', as is `needs-action`'s non-empty
// `requirements` — the invariants live in `assertResultCoherent`, not in narrowed literals and tuple
// types. Quote results carry plain `QuotedRoute`s: quoting verifies nothing, so no execution status
// rides along, and their `no-route`/`inconclusive` always carry an EMPTY `alternatives` (nothing
// priced means no runners-up; the field is there so callers need not narrow to read it).

// A `permit2-signature` arm (an EIP-712 typed-data signature requirement, as opposed to the
// on-chain allowance below) is future work: nothing in this package produces one today, so no
// such arm exists on the type — adding one back is the readiness path's job, not this compiler's.
type ExecutionRequirement =    // several can apply at once
  | { kind: 'erc20-approval';    token: Address; spender: Address; minimumAmount: bigint }
  | { kind: 'permit2-allowance'; token: Address; spender: Address; minimumAmount: bigint }
  | { kind: 'insufficient-balance'; token: CurrencyRef; required: bigint; available: bigint }

type RankedRoute = QuotedRoute &
  { execution: 'verified' | 'needs-action' | 'unverified' | 'failed'
    revertData?: Hex }   // verbatim preflight revert bytes, never interpreted;
                         // only on 'failed' candidates (a transport failure
                         // reached no chain, so it leaves none)
```

Status semantics: `ready` — the exact tx simulated successfully from the real
trader at the reported block. `needs-action` — route found and encoded;
listed prerequisites missing; execution necessarily unverified (an unfunded
trader cannot be honestly simulated without overrides, which we rejected).
`no-route` — the bounded search **completed** and found nothing.
`inconclusive` — abort, provider failures, or pruning prevented completion;
neither a total RPC outage (`rpc-unavailable`) nor a partial one — a provider
429ing `eth_call` while serving every other method (`rpc-degraded`) — is ever
`no-route`. When the caller's `AbortSignal` fires,
promises resolve with the best result so far (`inconclusive`, carrying whatever
was already found and encoded) and iterators complete after the current wave —
abort is a stop request, not an error, and never a reason to throw away work the
search already paid for.

### SearchReport — four kinds of "complete"

```ts
type SearchReport = {
  block: BlockRef
  discovery: Record<'v2' | 'v3' | 'v4',
    { status: 'complete' | 'partial' | 'disabled' | 'failed'; coveredRanges: BlockRange[] }>
  enumeration: { exhaustiveWithinMaxHops: boolean; intermediatesDiscovered: number;
                 intermediatesSelected: number; candidatesGenerated: number;
                 poolsPruned: number; candidatesPruned: number
                 intermediatesPruned: number }
  quoting: { attempted: number; succeeded: number; failed: number
             transportFailed: number; unattempted: number }
  aborted: boolean
  verificationDegraded: boolean
  headRegressed: boolean
  verification: { preflightAttempted: number; preflightBudgetExhausted: boolean }
}
```

Discovery coverage, enumeration pruning, quote completion, and execution
verification are independent axes, reported independently.

The three pruning counters are deliberately separate, one per unit, and
summing any two of them would mix units, so nothing does: `poolsPruned` is
pools dropped by a per-pair cap (`MAX_POOLS_DIRECT` for the direct pair,
`MAX_POOLS_PER_LEG` for a two-hop leg selection), summed across every
selection; `intermediatesPruned` is eligible two-hop intermediate *nodes*
dropped by `MAX_INTERMEDIATES` (it already drove `exhaustiveWithinMaxHops` —
it is now also reported); `candidatesPruned` is whole candidates dropped by
the total-candidate cap (`MAX_QUOTE_CANDIDATES`) once direct and two-hop
candidates are combined — structurally zero at today's derived ceiling, kept
as a drift backstop. `intermediatesSelected` is the actual
number of intermediate nodes the enumeration used (≤ `MAX_INTERMEDIATES`) —
threaded through from the enumeration itself, not re-derived from
`intermediatesDiscovered` and the cap (a search that never enumerated reports
`intermediatesSelected: 0` honestly, rather than a `min(...)` guess).
`exhaustiveWithinMaxHops` requires both `poolsPruned` and `candidatesPruned`
to be zero, `intermediatesSelected === intermediatesDiscovered` (no eligible
intermediate was dropped by the cap either), and the discovery/abort/quoting
axes below.

`failed` and `transportFailed` are deliberately separate tallies, and the
distinction decides a caller-visible verdict. A revert is the node answering
authoritatively about the chain ("this route cannot price at this block"); a
429/timeout/dropped socket is the provider answering about *itself* and is
evidence about the chain of exactly none. `transportFailed > 0` — or
`verificationDegraded`, its preflight counterpart, set when a simulation could
not be *carried out* — forfeits the right to an authoritative `no-route`: such a
search is `inconclusive` with reason `rpc-degraded`, however complete its
discovery looks. Invariant: `attempted === succeeded + failed +
transportFailed`.

**The quoting counters are probe-inclusive, not route-framed.** Three channels
feed them — wave 0's route probes and the enumerated quotes (both of which also
feed `candidatesGenerated`), and the half-pair *discovery* probes of waves 1–2,
which feed only `quoting`, because a half-pair leg is not a route and can never
become one. So `quoting.succeeded > 0` with an empty `alternatives` is a normal
shape, and comparing `candidatesGenerated` against `attempted` as if they
counted the same thing will never reconcile. What *is* asserted (in
`assertResultCoherent`) is a two-sided conservation bound: `unattempted <=
candidatesGenerated` (an unattempted quote *is* a generated candidate, which is
also what keeps discovery probes out of `unattempted` and the
`'quotes-unattempted'` code from naming candidates that do not exist) and
`candidatesGenerated <= attempted + unattempted` (the leak-catcher: a channel
that claims candidates it never accounts for is a report with generated
candidates unaccounted for).

**`verification` is the preflight budget, reported rather than absorbed**
(C4-P7). `preflightAttempted` counts real simulations issued across the whole
search (never a candidate skipped for free — an already-`verified`/`failed`
route, or one that failed to compile). `preflightBudgetExhausted` is true when
the most recent wave's `verifyLeader` stopped at `PREFLIGHT_TOP_K` with
untried, not-already-resolved candidates still on the table; it is recomputed
per wave, and an aborted search reports `false` by construction. It
deliberately does **not** feed the `no-route`/`inconclusive` decision: a revert
is real evidence about the chain, `alternatives` already makes the exhaustion
inferable, and folding it in would make "no route" depend on `PREFLIGHT_TOP_K`
— exactly the policy-into-verdict leak the report's independent axes exist to
prevent.

A NODE THAT CANNOT SERVE THE PINNED BLOCK IS NOT A REVERT EITHER. `header not
found`, `missing trie node`, `unknown block`, erigon's `state at block N is not
available`, alchemy's `Nonexistent block: requested N, latest M`, and the
response-size/range caps are all classified `unavailable` — a third channel
alongside `execution`/`transport`, counted on the transport axis (`NodeStateError
extends TransportError`) and kept apart only so a diagnostic can name it. The
realistic cause is not an outage but a load balancer serving the block-pinned
`eth_call`s from a replica a few blocks behind the node that answered
`eth_getBlockByNumber`; classifying them `execution` (the classifier's default,
since none of them mentions a revert) counted never-executed calls as on-chain
refusals and produced a confident `no-route` from a search that never touched
chain state.

`headRegressed` is that same failure mode when nothing errors at all: the
replica simply answers about an older head. The `latest` block each search pins
is compared against the highest one any earlier search on the same router
pinned; if it is lower the block is refetched exactly once, and if it is still
lower the search proceeds at that block (pinning a head the answering node does
not have would only trade a named degradation for a stream of `header not
found`s) and reports `headRegressed` — an incompleteness axis like `aborted`,
so the result is `inconclusive`/`rpc-degraded` and never an authoritative
`no-route`. The watermark advances to the highest head ever seen, never the most
recent, so one lagging answer cannot lower the bar for the searches after it.

The watermark is a maximum, but not an unfalsifiable one. Two consecutive
answers more than `maxPlausibleHeadRegression(reorgOverlapBlocksOf(manifest))`
— four times *this chain's* reorg depth, so 128 blocks on mainnet's default 32
and 2,400 on a chain that declares `chain.reorgOverlapBlocks: 600n` —
below it reset it to the head they agree on: no real reorg or replica lag runs
that deep, so two independent answers that far down are evidence the *record* is
wrong (one glitched high answer would otherwise sit above every real head for the
life of the router — permanent `rpc-degraded`, never again an authoritative
`no-route`, at two head round trips per search). Regressions within the bound
keep the strict behavior. The refetch itself is fault-isolated: it is a
diagnostic, so if it throws, the first (perfectly usable) block is pinned and the
regression reported, rather than escalating a degraded search to
`rpc-unavailable`.

## Readiness and preflight

No generic ERC-20 state overrides. Readiness is **reads** — trader balance;
ERC20→Permit2 allowance; Permit2→UR allowance/expiration/nonce; supplied
permit validity — started concurrently with wave 0 (input-side checks are
route-independent). All missing requirements are returned together.

A read that fails **on chain** still fails safe (that check counts as unmet). A
read that fails in the **transport** does not: coercing an unread balance to
zero would state `insufficient-balance available: 0n` as fact and fabricate
approvals the trader may already hold, and since any requirement short-circuits
preflight, nothing downstream would notice. Such a read contributes no
requirement and marks readiness `degraded`; `needs-action` is then never
promised (the list is known-incomplete) and the result is `inconclusive`
(`rpc-degraded`).

When requirements are satisfied, the exact transaction is simulated as the
real trader at the pinned block; top-`PREFLIGHT_TOP_K` candidates fall through
on genuine reverts (with the budget's use reported on `search.verification`);
unknown reverts stay unknown (raw data preserved) — no
revert-string guessing. A simulation that fails in the *transport* rather than
reverting is not a verdict on the route: it stays `unverified` (never `failed`),
sets `verificationDegraded`, and the result is `inconclusive`, never `ready`. Native-balance overrides may appear in *tests* only.

## Error handling

- **Business outcomes** → result union values. Never thrown.
- **Operator errors** (invalid manifest, chainId mismatch, unsupported route
  shape) → typed throws (`RouterConfigError`, `UnsupportedRouteError`),
  before RPC traffic where possible.
- **Malformed or out-of-bounds requests** → `RouterConfigError`,
  synchronously, before any RPC — see [Request validation (hostile
  input)](#request-validation-hostile-input) for the full set of bounds. What
  the *chain* hands back is not covered by that: an un-encodable quote degrades
  its candidate and the search continues (never a throw), and a malformed log
  handed to `ingestLogs` is skipped like a non-matching one.

| RPC failure | Response |
| --- | --- |
| `eth_getLogs` range/result cap | Start at `min(remaining range, 16M)`; bisect down on refusal — jumping straight to a declared cap when the provider states one (a `span` cap also lowers the scan's ceiling; a `density` observation only narrows the current window), and collapsing to `DESCENT_TIMEOUT_FALLBACK` in one step when the refusal was expensive; regrow after a run of clean chunks (the cap may have been transient); remember the served width across scans (`ScanWidthMemory`); record partial coverage |
| `eth_getLogs` rate-limited / failing at the minimum window | Exponential backoff (250ms → 2s cap, ≤60s of sleeping per scan) before retry; give the sub-range up after 3 attempts; stop the whole scan at the per-scan request budget and report the rest as uncovered — never an unbounded retry loop. Bounds work, not latency (a fully-throttling endpoint can still take ~an hour to return its partial answer): `AbortSignal` is the only wall-clock bound |
| Single quote revert | Candidate dies; others unaffected |
| Transport failure during quoting/preflight (429/5xx, timeout, dropped socket) | Counted apart (`quoting.transportFailed` / `verificationDegraded`), never as a revert; a preflighted route stays `unverified`, not `failed`; result is `inconclusive` (`rpc-degraded`) — never `no-route` — and still carries the route it priced and encoded |
| Node cannot serve the pinned block (`header not found`, `missing trie node`, `unknown block`, `state at block N not available`, `Nonexistent block: requested N, latest M`, range/response caps) | Classified `unavailable`, counted exactly like a transport failure (`quoting.transportFailed` / `verificationDegraded`) — never a revert, never a `no-route`; the channel is named in the thrown `NodeStateError` for diagnostics |
| Pinned `latest` head below one an earlier search already pinned | Refetch once; if still behind, search at that block and report `headRegressed` → `inconclusive` (`rpc-degraded`), never `no-route` |
| One protocol source fails | Others proceed; source reported `failed` |
| `AbortSignal` fires | Promise resolves `inconclusive` carrying best-so-far + its `tx` + `alternatives` (a leader that already reverted is demoted to `alternatives`, tx withheld); iterator completes after current wave |
| Total RPC outage | `inconclusive` / typed availability error — never `no-route` |

## Testing

1. **Unit** (`bun test`, colocated): wave scheduling and stopping policy,
   promise/iterator resolution semantics, abort between batches,
   speculative-quote decode (revert ⇒ pool absent, not error),
   candidate-selection determinism, per-protocol topic filters, poolId
   integrity, coverage-cache merge/overlap, ranking + simplicity margin,
   status classification, plan invariants. The log-scan width policy is a pure
   reducer, so its rules are a transition table (`(state, outcome) →
   (state, action)`) rather than scenarios engineered through a fake transport.
2. **Differential encoding**: every supported shape through the compiler and
   the pinned `universal-router-sdk` for the target `commandSet`;
   byte-identical; plus golden calldata vectors in-repo.
3. **Mixed-transition matrix**: all six transitions (v2↔v3, v2↔v4, v3↔v4 both
   directions), with ERC-20 and native/WETH intermediates, asserting custody
   on fork.
4. **Readiness matrix**: no balance; no ERC20→Permit2 approval; no Permit2
   authorization; expired authorization; valid embedded permit; fully
   approved; native input.
5. **Discovery honesty**: nonstandard v3 fee; >8 shared neighbors; >3 pools
   per pair; quote cap hit; scan timeout; one source failed; coverage cache +
   shallow reorg overlap.
6. **Hooks by behavior**: empty-data; data-requiring; caller-sensitive;
   quoter/execution divergence; quotes-but-fails-preflight (must not be
   `ready`).
7. **Fee-on-transfer**: asserted safely rejected/downgraded, not supported.
8. **Fork integration** (`integration/` workspace, `ROUTER_LITE_FORK=1`,
   skips without anvil): getSwap → execute → output within slippage,
   including a fresh pool via `ingestReceipt`.
9. **Latency benchmarks** (cold/warm): hint-only; direct pair; small-adjacency
   focus; WETH endpoint; full thorough search; non-batching transport;
   range-capped provider. Defaults are chosen from measurements.
10. **Recorded-replay goldens** (`replay.golden.test.ts`) — the hermetic layer
    that asks whether the router finds the *right* answer, not merely a
    coherent one. A session is one real `getQuote` run's complete, block-pinned
    RPC conversation, keyed by `(method, canonicalized params)` rather than by
    sequence number, because the engine's concurrency makes request *order*
    nondeterministic while the request *set* is not. Each session replays
    against the real `createRouter` and asserts the full canonical result —
    best routeId and `amountOut` exactly, every alternative, the canonicalized
    `SearchReport`. An unrecorded key throws by name: a change to what the
    search *asks* is a deliberate golden regeneration, never a defaulted
    response. Determinism holds because `src/` contains no `Date.now`/
    `Math.random` and the one wall-clock behavior (the 5s interleave) is
    quiescent under microtask-resolved replay.
11. **Provider conformance table** (`internal/providerConformance.test.ts`) —
    one row per capture in the canary-written `providerErrors.json` fixture,
    each error rebuilt from its own recorded fields rather than hand-asserted,
    stating the classification, the declared cap (width *and* kind), the wire
    shape, and what a real `scanLogs` run costs against an endpoint that fails
    that way. The table is **closed against the fixture**: a new capture
    recorded overnight fails this file until someone writes down what the stack
    does with it. Alchemy and QuickNode both say "10,000"; the same scan costs
    20 requests against one and 101 against the other, because only one means
    it as a span policy — which is the kind of fact only this table holds.

## Package conventions

Newer-SDK template (`liquidity-launcher-sdk`): plain `tsc` three-pass build,
`sideEffects: false`, `workspace:*` deps, changesets, per-package
eslint/prettier (printWidth 120, no semi, single quotes), existing monorepo
CI. Runtime deps: **viem only** (C4-P4 — see below; `@uniswap/sdk-core` and
every ethers-based Uniswap SDK are devDependencies, test-only).

### Runtime dependency: viem only (C4-P4)

`@uniswap/sdk-core` used to be a runtime dependency for exactly one thing:
`CHAIN_TO_ADDRESSES_MAP[chainId].v4QuoterAddress`, read once per built-in
manifest to populate `v4.quoter`. That single lookup pulled the entire
package — and, transitively, ethers — into the runtime dependency graph of a
package that is otherwise viem-native, for four constant addresses that
never change at runtime. `manifest.ts` now hardcodes each as a checksummed
literal (captured from that same `sdk-core` field), and `@uniswap/sdk-core`
moved to `devDependencies` — it is still used by tests (`Ether`/`Token` in
the poolId and encoding differential tests) but never imported by anything
that ships. `manifest.parity.test.ts` is the one file that imports it from
`src/`, and only to assert the four literals still equal
`CHAIN_TO_ADDRESSES_MAP[chainId].v4QuoterAddress` — a parity check that fails
loudly if `sdk-core` ever republishes a different address, rather than
letting the two silently diverge.

Branch: `feat/router-lite-sdk-v2`.

## Out of scope for v1

Exact-output; split routes; 3+ hops; live ingestion and reorg handling
(beyond overlap re-scan); *host-managed* persistence — the index serializes
itself (`toSnapshot`/`fromSnapshot`) but the SDK never touches a filesystem,
a TTL, or a schema migration; streaming results (waves make it a natural
later addition at wave boundaries); gas-aware ranking; `resolveHookData`
callback; generic ERC-20 state overrides (rejected deliberately);
fee-on-transfer support (safe rejection only); custom RPC batch executor
(transport batching covers it); ZKsync-style CREATE2 variance. The minimal
public surface is what gives these a chance to land compatibly; no blanket
additivity claim is made.

## Prior art consulted

- Senior-engineer v4-only design + rev-1 review (2026-08-03): topic-filtered
  adjacency, whole-path quoting, wave search, execution-plan compiler,
  readiness-by-reads, four-way completeness, manifest atomicity. Knowing
  divergences: v2/v3 in v1; transport-level batching over a custom executor;
  promise+iterator+AbortSignal instead of mode/budget knobs; speculative
  quote-as-probe for direct pairs; `resolveHookData` deferred.
- Uncommitted `feat/router-lite-sdk` worktree + `blockfeed-sdk` discovery
  (log-scan bisection, fork-test harness) — parts bins.
- `smart-order-router` (external): candidate-bounding philosophy.
