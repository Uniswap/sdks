# Blockfeed SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@uniswap/blockfeed-sdk` — a block-latency on-chain data subscription engine (per-block prices, CCA auction state, live bids) — plus CCA sources in `@uniswap/liquidity-launcher-sdk` and Anvil-fork integration tests.

**Architecture:** Per the committed design doc `docs/blockfeed-sdk-design.md` (READ IT FIRST for any task — it is the spec). One atomic Multicall3 read per tick drives keyed, pure-reducer sources; stores expose `subscribe`/`getSnapshot`; discovery ("router-lite") enumerates off-chain and evaluates via deployed quoters; CCA sources compose the auction→pool lifecycle with speculative reads.

**Tech Stack:** TypeScript (strict), viem ^2.23.5, @uniswap/sdk-core, bun test, Anvil forks for integration. No React, no ethers.

## Global Constraints

- The design doc `docs/blockfeed-sdk-design.md` is the binding spec; where this plan and the doc conflict, STOP and escalate.
- Package conventions must match `sdks/liquidity-launcher-sdk` exactly: `viem ^2.23.5` and `@uniswap/sdk-core workspace:*` as direct dependencies (NEVER peerDependencies), triple build (`tsconfig.{base,cjs,esm,types}.json`, outputs `dist/{cjs,esm,types}`), `bun test`, prettier `{ printWidth: 120, semi: false, singleQuote: true }`, `sideEffects: false`, MIT license, publishConfig public+provenance.
- Zero browser APIs (`window`, `document`, timers beyond `setTimeout`/`clearTimeout`) anywhere in `src/` EXCEPT `src/plugins/visibility.ts`.
- Zero React. Zero ethers. `@uniswap/blockfeed-sdk` must not depend on `@uniswap/liquidity-launcher-sdk` and vice versa (runtime); launcher may use blockfeed as devDependency only.
- Sources are pure reducers: no mutable state inside a `Source`; all cross-tick state flows through `ctx.prev`.
- All descriptor shapes follow the house style of `sdks/liquidity-launcher-sdk/src/reads.ts` (`{ address, abi, functionName, args }`).
- Canonical Multicall3 address on all supported chains: `0xcA11bde05977b3631167028862bE2a173976CA11`.
- Supported chains v1: Ethereum mainnet (1), Base (8453), Unichain (130). All per-chain tables must be extensible records keyed by chainId.
- Every task: run `bun test` for the touched package AND `bun run typecheck` before committing. Commit messages: conventional commits (`feat(blockfeed-sdk): …`, `test(blockfeed-sdk): …`, `feat(liquidity-launcher-sdk): …`).
- TDD: write tests first for every pure function; engine/heartbeat may be tested behavior-first with fakes.
- Do not modify any file outside `sdks/blockfeed-sdk/`, `sdks/liquidity-launcher-sdk/`, root `package.json` workspaces (not needed — glob covers), `turbo.json` (only if required), and `docs/`.

---

### Task 1: Package scaffold

**Files:**
- Create: `sdks/blockfeed-sdk/package.json`, `sdks/blockfeed-sdk/tsconfig.base.json`, `tsconfig.cjs.json`, `tsconfig.esm.json`, `tsconfig.types.json`, `sdks/blockfeed-sdk/src/index.ts`, `sdks/blockfeed-sdk/README.md`, `sdks/blockfeed-sdk/.eslintrc.json` (if launcher has one — mirror whatever lint config `sdks/liquidity-launcher-sdk` uses)

**Interfaces:**
- Produces: a building, testable, lintable empty package named `@uniswap/blockfeed-sdk` version `0.0.0`, description "⚡ Block-latency on-chain data feeds — live prices, auction state, and logs over any viem PublicClient".

**Steps:**
- [ ] Copy structure from `sdks/liquidity-launcher-sdk/package.json` (read it), adjust name/description/keywords (`blockfeed`, `price-feed`, `live-data`). Dependencies: `@uniswap/sdk-core workspace:*`, `jsbi ^3.1.4`, `viem ^2.23.5`. Same devDependencies block. Add the `./discovery` subpath to `exports` NOW (placeholder pointing at `./dist/*/src/discovery/index.*`) so later tasks don't touch package.json:
  ```json
  "exports": {
    ".": { "types": "./dist/types/src/index.d.ts", "import": "./dist/esm/src/index.js", "require": "./dist/cjs/src/index.js" },
    "./discovery": { "types": "./dist/types/src/discovery/index.d.ts", "import": "./dist/esm/src/discovery/index.js", "require": "./dist/cjs/src/discovery/index.js" }
  }
  ```
- [ ] `src/index.ts`: `export const BLOCKFEED_SDK_VERSION = '0.0.0'` (placeholder so build emits). `src/discovery/index.ts`: empty export `export {}` placeholder.
- [ ] tsconfigs: copy the four from liquidity-launcher-sdk verbatim.
- [ ] README.md: one-paragraph stub pointing at `docs/blockfeed-sdk-design.md` (full README is Task 16).
- [ ] Smoke test file `src/index.test.ts` asserting the version export (deleted in Task 2 when real tests exist).
- [ ] Run: `cd sdks/blockfeed-sdk && bun install (from repo root: bun install) && bun run build && bun test && bun run typecheck` — all pass.
- [ ] Commit: `feat(blockfeed-sdk): scaffold package`

### Task 2: Core types, constants, and address registry

**Files:**
- Create: `sdks/blockfeed-sdk/src/types.ts`, `src/constants.ts`, `src/addresses.ts`, tests `src/types.test.ts`, `src/addresses.test.ts`
- Modify: `src/index.ts` (export everything public)

**Interfaces (verbatim — later tasks depend on these exact names):**

```ts
// types.ts
import type { Abi, AbiEvent, Address, Hex, PublicClient } from 'viem'
import type { Currency } from '@uniswap/sdk-core'

export interface ContractCall<TAbi extends Abi = Abi> {
  address: Address
  abi: TAbi
  functionName: string
  args: readonly unknown[]
}

/** allowFailure maps to aggregate3 per-call tolerance. Absent/false → a failure fails the whole tick. */
export interface SpeculativeCall extends ContractCall {
  allowFailure?: boolean
}

export interface LogFilter {
  address: Address
  event: AbiEvent
  /** Optional indexed-arg filters, viem `getLogs` style. */
  args?: Record<string, unknown>
}

export interface TickIdentity {
  chainId: number
  blockNumber: bigint
  /** Parent block hash from Multicall3.getLastBlockHash — best-effort fork discriminator. */
  parentBlockHash: Hex
  /** Block timestamp, seconds. */
  timestamp: bigint
}

export type CallResult = { status: 'success'; result: unknown } | { status: 'failure'; error: Error }

export interface FeedLogRef {
  txHash: Hex
  logIndex: number
  blockNumber: bigint
}

export interface DecodedFeedLog extends FeedLogRef {
  address: Address
  eventName: string
  args: Record<string, unknown>
}

export interface TickData {
  identity: TickIdentity
  /** Keyed by the source's call keys. */
  results: Record<string, CallResult>
  /** New logs matching this source's filters this tick (deduped). */
  logs: DecodedFeedLog[]
  /** Logs previously delivered to this source that a reorg removed. */
  retractions: FeedLogRef[]
}

export interface SourceEmission<T> {
  value: T
  phase?: string
  identity: TickIdentity
}

export interface TickContext<T> {
  prev: SourceEmission<T> | undefined
}

export interface Source<T> {
  /** Stable identity; equal keys share one evaluation and one store. */
  key: string
  calls(ctx: TickContext<T>): Record<string, SpeculativeCall>
  logFilters?(ctx: TickContext<T>): LogFilter[]
  /** PURE. Return undefined when required data is missing (no emission this tick). */
  derive(tick: TickData, ctx: TickContext<T>): SourceEmission<T> | undefined
  /** Emission suppression comparator; default is strict equality of `value`. */
  valueEquals?(a: T, b: T): boolean
}

export type FeedEvent<T> =
  | { type: 'tick'; emission: SourceEmission<T> }
  | { type: 'log'; log: DecodedFeedLog }
  | { type: 'retraction'; ref: FeedLogRef }
  | { type: 'phase'; from: string | undefined; to: string; identity: TickIdentity }
  | { type: 'gap'; fromBlock: bigint; toBlock: bigint }
  | { type: 'stale'; stale: boolean }

export interface FeedSnapshot<T> {
  current: SourceEmission<T> | undefined
  /** Oldest→newest rolling tick buffer, length ≤ bufferSize. */
  buffer: readonly SourceEmission<T>[]
  phase: string | undefined
  stale: boolean
  lastTick: TickIdentity | undefined
}

export interface FeedStore<T> {
  subscribe(listener: (e: FeedEvent<T>) => void): () => void
  getSnapshot(): FeedSnapshot<T>
}

// v4 PoolKey mirroring the on-chain struct
export interface PoolKeyStruct {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}

export type PoolRef =
  | { protocol: 'v2'; pair: Address }
  | { protocol: 'v3'; pool: Address }
  | { protocol: 'v4'; poolKey: PoolKeyStruct }

export interface PathLeg {
  pool: PoolRef
  base: Currency
  quote: Currency
}

export interface PricePath {
  base: Currency
  quote: Currency
  /** Ordered base→quote; leg[i].quote must equal leg[i+1].base (wrapped-equivalent). ≤2 legs in v1. */
  legs: PathLeg[]
}
```

```ts
// constants.ts
export const MULTICALL3_ADDRESS: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'
export const DEFAULT_TRAILING_LOG_WINDOW = 3
export const DEFAULT_BUFFER_SIZE = 120
export const DEFAULT_MAX_CALLS_PER_CHUNK = 200
export const DEFAULT_POLL_INTERVAL_MS: Record<number, number> = { 1: 3_000, 8453: 1_000, 130: 500 }
export const FALLBACK_POLL_INTERVAL_MS = 1_000
export const STALE_AFTER_CONSECUTIVE_FAILURES = 3
export const BACKOFF_BASE_MS = 500
export const BACKOFF_MAX_MS = 30_000
```

```ts
// addresses.ts — per-chain protocol addresses, extensible records keyed by chainId.
export interface ChainAddresses {
  v2Factory?: Address
  v3Factory: Address
  v4PoolManager: Address
  v4StateView: Address
  v4PoolManagerDeployBlock: bigint
  quoterV2: Address       // v3 QuoterV2
  v4Quoter: Address
  weth: Address
}
export const CHAIN_ADDRESSES: Record<number, ChainAddresses> = { /* 1, 8453, 130 */ }
export function getChainAddresses(chainId: number): ChainAddresses  // throws BlockfeedError w/ clear message if unsupported
```

Populate `CHAIN_ADDRESSES` with verified values. Sources for the values (verify against at least one): `sdks/liquidity-launcher-sdk/src/addresses.ts` (StateView, PoolManager for its chains), Uniswap deployments docs. Known anchors: mainnet v3Factory `0x1F98431c8aD98523631AE4a59f267346ea31F984`, mainnet v2Factory `0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f`, mainnet PoolManager `0x000000000004444c5dc75cB358380D2e3dE08A90`, QuoterV2 mainnet `0x61fFE014bA17989E743c5F6cB21bF9697530B21e`. For Base/Unichain values the implementer MUST cross-check against `liquidity-launcher-sdk/src/addresses.ts` and https://docs.uniswap.org/contracts/v4/deployments (WebFetch). If a value cannot be verified from two sources, leave the chain out and note it in the report — do NOT guess addresses.

**Steps:**
- [ ] Write `types.ts` exactly as above (JSDoc encouraged). Delete Task 1's placeholder test.
- [ ] Write `addresses.test.ts`: `getChainAddresses(1)` returns mainnet record; unsupported chainId throws with message containing the chainId; every address checksummed (`getAddress(x) === x`).
- [ ] Write `constants.ts`, `addresses.ts`; make tests pass. Export all from `index.ts`.
- [ ] `bun test && bun run typecheck && bun run build` pass.
- [ ] Commit: `feat(blockfeed-sdk): core types, constants, and chain address registry`

### Task 3: Atomic tick reader

**Files:**
- Create: `src/internal/tickReader.ts`, `src/internal/tickReader.test.ts`, `src/errors.ts`

**Interfaces:**
- Produces:
  ```ts
  // errors.ts
  export class BlockfeedError extends Error { constructor(message: string, public readonly cause?: unknown) }
  export class TickFailedError extends BlockfeedError { constructor(message: string, public readonly failedKeys: string[], cause?: unknown) }

  // internal/tickReader.ts
  export interface TickReadRequest { keyed: Record<string, SpeculativeCall> }  // keys already namespaced by engine: `${sourceKey}:${callKey}`
  export interface TickReadResult { identity: Omit<TickIdentity, 'chainId'>; results: Record<string, CallResult> }
  export async function readTick(
    client: Pick<PublicClient, 'multicall'>,
    request: TickReadRequest,
    opts?: { maxCallsPerChunk?: number }
  ): Promise<TickReadResult>
  ```
- Consumes: types from Task 2.

**Behavior (binding):**
1. Build the batch as: 3 identity calls FIRST — Multicall3 `getBlockNumber()`, `getLastBlockHash()`, `getCurrentBlockTimestamp()` (self-calls at `MULTICALL3_ADDRESS`; define a minimal `MULTICALL3_HELPER_ABI` const in this file) — then all keyed calls in deterministic (sorted-key) order.
2. Execute via `client.multicall({ contracts, allowFailure: true })`. Chunk when `3 + N > maxCallsPerChunk`: identity calls go in chunk 1 only; chunks run sequentially (viem batches are already parallel enough; sequential keeps provider pressure bounded).
3. Identity-call failure → throw `TickFailedError`.
4. Keyed-call failure: if the call had `allowFailure: true`, record `{ status: 'failure', error }` in results; otherwise throw `TickFailedError` listing the failed keys.
5. Successful results recorded `{ status: 'success', result }`.

**Steps:**
- [ ] Tests first, with a fake `multicall` capturing the contracts array and returning canned viem-shaped results (`{ status: 'success', result }` / `{ status: 'failure', error }`). Cases: (a) identity calls first + values land in `identity`; (b) keyed results mapped back by key regardless of order; (c) speculative failure → failure CallResult; (d) non-speculative failure → `TickFailedError` with key names; (e) chunking at maxCallsPerChunk=5 with 7 calls → two multicall invocations, identity only in first; (f) identity failure → throws.
- [ ] Implement; all tests pass; typecheck; commit: `feat(blockfeed-sdk): atomic multicall tick reader`

### Task 4: Log window reconciliation

**Files:**
- Create: `src/internal/logWindow.ts`, `src/internal/logWindow.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface LogBookEntry { ref: FeedLogRef; log: DecodedFeedLog }
  /** Immutable snapshot of delivered logs within the trailing window. */
  export interface LogBook { entries: ReadonlyMap<string, LogBookEntry> }   // key = `${txHash}:${logIndex}`
  export const emptyLogBook: LogBook
  export function reconcileLogs(args: {
    book: LogBook
    /** All decoded logs observed in [fromBlock, toBlock] this tick. */
    observed: DecodedFeedLog[]
    fromBlock: bigint
    toBlock: bigint
  }): { book: LogBook; newLogs: DecodedFeedLog[]; retractions: FeedLogRef[] }
  export function decodeFeedLogs(filters: LogFilter[], rawLogs: Log[]): DecodedFeedLog[]  // decode + match; unmatched logs dropped
  export function matchLogsToFilters(logs: DecodedFeedLog[], filters: LogFilter[]): DecodedFeedLog[]
  ```

**Behavior (binding):**
- `newLogs` = observed keys not in book. `retractions` = book entries with `fromBlock ≤ blockNumber ≤ toBlock` that are absent from observed (the window re-scanned their block and they're gone). Book entries older than `fromBlock` are evicted (outside window — no longer verifiable) WITHOUT retraction. Returned book contains only entries within `[fromBlock, toBlock]`.
- Pure functions, no I/O. `decodeFeedLogs` uses viem `decodeEventLog` per filter event; a log matches a filter iff address equal (case-insensitive) AND topic0 equals the filter event's selector AND all specified `args` match.

**Steps:**
- [ ] Tests first: new-log detection, dedupe across overlapping windows, retraction on missing re-scanned log, eviction without retraction when window slides past, args-filter matching, address match case-insensitivity.
- [ ] Implement; pass; commit: `feat(blockfeed-sdk): trailing-window log reconciliation`

### Task 5: Feed store

**Files:**
- Create: `src/internal/store.ts`, `src/internal/store.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface InternalStore<T> extends FeedStore<T> {
    /** Engine-side: dispatch events and update snapshot atomically. */
    publish(events: FeedEvent<T>[]): void
    readonly subscriberCount: number
    /** Called with subscriber-count transitions so engine can refcount. */
    onSubscriberChange(cb: (count: number) => void): void
  }
  export function createInternalStore<T>(opts: { bufferSize: number }): InternalStore<T>
  ```

**Behavior (binding):**
- `publish` applies events in order: `tick` sets `current`, appends to buffer (dropping oldest beyond bufferSize), sets `lastTick`; `phase` sets `phase`; `stale` sets `stale`. THEN builds ONE new snapshot object (referential stability: `getSnapshot()` returns the same object until the next `publish` that changes anything) and notifies each listener once per event, in event order. Listener exceptions are caught and swallowed (one bad consumer must not break others) — but rethrown asynchronously via `queueMicrotask` so they surface.
- `subscribe` returns idempotent unsubscribe. `onSubscriberChange` fires on 0→1 and 1→0 transitions (and any change).

**Steps:**
- [ ] Tests first: snapshot stability (same reference when nothing published; new reference after tick), buffer capping (publish bufferSize+3 ticks, assert length and order), event fan-out order, unsubscribe idempotence, subscriber-count callbacks, listener-throw isolation.
- [ ] Implement; pass; commit: `feat(blockfeed-sdk): feed store with rolling buffer`

### Task 6: Engine + heartbeat

**Files:**
- Create: `src/engine.ts`, `src/engine.test.ts`, `src/internal/scheduler.ts`
- Modify: `src/index.ts` (export `createBlockFeed`, `BlockFeed`, `BlockFeedOptions`)

**Interfaces:**
- Produces:
  ```ts
  export interface BlockFeedOptions {
    client: PublicClient
    chainId: number                      // explicit; do not fetch (keeps constructor sync)
    pollIntervalMs?: number              // default DEFAULT_POLL_INTERVAL_MS[chainId] ?? FALLBACK_POLL_INTERVAL_MS
    trailingLogWindow?: number           // default DEFAULT_TRAILING_LOG_WINDOW
    bufferSize?: number                  // default DEFAULT_BUFFER_SIZE
    maxCallsPerChunk?: number            // default DEFAULT_MAX_CALLS_PER_CHUNK
    scheduler?: Scheduler                // injectable for tests
  }
  export interface BlockFeed {
    watch<T>(source: Source<T>): FeedStore<T>
    pause(): void
    resume(opts?: { logWindowOverride?: number }): void   // plugin surface (Task 8)
    stop(): void
    readonly running: boolean
  }
  export function createBlockFeed(opts: BlockFeedOptions): BlockFeed

  // internal/scheduler.ts — injectable time source
  export interface Scheduler { setTimeout(cb: () => void, ms: number): unknown; clearTimeout(h: unknown): void; now(): number }
  export const realScheduler: Scheduler
  ```

**Behavior (binding):**
1. `watch(source)`: same `source.key` → same store (and the FIRST registered source object wins; do not re-register). Store created via Task 5. Refcount: heartbeat starts when total subscribers across all stores goes 0→1; stops (clears timers, unwatches) on →0. `stop()` is terminal.
2. Tick pipeline (one at a time — a guard prevents overlapping ticks; if a trigger fires mid-tick, run one more tick immediately after):
   a. For each active source: `calls(ctx)` with its own `ctx.prev`; namespace keys `${source.key}:${callKey}`; merge; **call-level dedupe**: identical `(address, abi ref or functionName, args JSON)` across sources share one batch slot (map back to every requester).
   b. `readTick` (Task 3). On `TickFailedError`: consecutive-failure counter++, schedule retry with exponential backoff (`BACKOFF_BASE_MS * 2^n` capped `BACKOFF_MAX_MS`); at `STALE_AFTER_CONSECUTIVE_FAILURES` publish `{type:'stale',stale:true}` to all stores (snapshot.stale=true). First success afterwards publishes `stale:false` and resets.
   c. If identity `(blockNumber, parentBlockHash)` equals previous tick's, skip log fetch and derive entirely (nothing moved) — EXCEPT do not skip if the previous tick failed.
   d. Logs: gather `logFilters(ctx)` from all sources; if any, ONE `client.getLogs({ address: [unique addresses], events: [unique events], fromBlock: max(lastTickBlock+1 - (K-1), 0)…, toBlock: identity.blockNumber })` — actually binding rule: `fromBlock = identity.blockNumber - BigInt(K - 1)` clamped ≥ 0 and ≥ (lastProcessedBlock - K + 1); decode via Task 4, reconcile per-source books (each source has its own `LogBook`, matched by its own filters).
   e. Per source: build `TickData` (its keyed results un-namespaced, its newLogs, its retractions), call `derive(tick, ctx)`. `undefined` → no events. Else compare with `ctx.prev`: value changed per `valueEquals` (default `Object.is`) → `tick` event; `phase` changed → `phase` event (ordered BEFORE the tick event); log events one per newLog (ordered before tick event so a bid and the price it moved arrive log-then-tick); retraction events likewise. Publish batch to that source's store. Update `ctx.prev = emission` (even when suppressed — store latest, but do NOT emit; note: suppressed emissions do NOT enter the buffer).
   f. derive() throws → isolate: that source keeps prev, counts as source-level error, engine continues others; rethrow async via queueMicrotask.
3. Heartbeat: if `client.transport.type === 'webSocket'` (or `client.transport.transports?.some(t => t.config.type === 'webSocket')` — check simple `type` only in v1), use `client.watchBlockNumber({ onBlockNumber })` as trigger (each notification schedules a tick; still run an immediate first tick on start). Otherwise poll: run tick, then `scheduler.setTimeout(next, pollIntervalMs)` (chained, not setInterval — no overlap by construction).
4. `pause()` stops scheduling (keeps state); `resume({logWindowOverride})` runs an immediate tick whose log window uses the override (bounded by caller), then normal cadence. If the pause spanned more blocks than the override covers, publish `{type:'gap', fromBlock: lastProcessedBlock+1n, toBlock: resumeTickBlock - windowCovered}` to all stores with log filters.

**Steps:**
- [ ] Tests first with fake client (`multicall`, `getLogs`, `watchBlockNumber` stubs) + fake scheduler (manual `advance()`): (a) refcount start/stop; (b) two sources sharing one identical call → one batch slot, both derive; (c) suppression: same value twice → one tick event, buffer length 1; (d) phase change emits phase event before tick event; (e) log-then-tick ordering within a tick; (f) backoff schedule and stale flag at 3 failures, recovery clears; (g) identical identity skips derive; (h) WS trigger path runs ticks on pushed block numbers; (i) pause/resume with gap event; (j) derive throw isolates source.
- [ ] Implement `scheduler.ts` then `engine.ts`. All green; typecheck; build.
- [ ] Commit: `feat(blockfeed-sdk): refcounted block heartbeat engine`

### Task 7: pricePathSource + sqrt price math

**Files:**
- Create: `src/math/sqrtPrice.ts`, `src/math/sqrtPrice.test.ts`, `src/sources/pricePath.ts`, `src/sources/pricePath.test.ts`, `src/abis.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  // math/sqrtPrice.ts
  /** Price of `base` in `quote` from a pool's sqrtPriceX96, where token0/token1 are the pool's sorted currencies. */
  export function priceFromSqrtPriceX96(args: { sqrtPriceX96: bigint; token0: Currency; token1: Currency; base: Currency; quote: Currency }): Price<Currency, Currency>
  export function priceFromV2Reserves(args: { reserve0: bigint; reserve1: bigint; token0: Currency; token1: Currency; base: Currency; quote: Currency }): Price<Currency, Currency>

  // sources/pricePath.ts
  export interface PricePathValue { price: Price<Currency, Currency>; legPrices: Price<Currency, Currency>[] }
  export function pricePathSource(path: PricePath): Source<PricePathValue>
  export function pricePathKey(path: PricePath): string   // stable key: chain-agnostic serialization of legs
  ```
- `src/abis.ts`: minimal const ABIs used by sources/discovery: `V2_PAIR_ABI` (getReserves, token0, token1), `V3_POOL_ABI` (slot0, liquidity), `STATE_VIEW_ABI` (getSlot0, getLiquidity), `V2_FACTORY_ABI` (getPair), `V3_FACTORY_ABI` (getPool), `V4_POOL_MANAGER_INITIALIZE_EVENT` (AbiEvent for `Initialize`), `QUOTER_V2_ABI` (quoteExactInputSingle), `V4_QUOTER_ABI` (quoteExactInputSingle). Use `as const` viem human-readable ABI (`parseAbi`).

**Behavior (binding):**
- `priceFromSqrtPriceX96`: price of token0 in token1 = sqrtP² / 2¹⁹² as a raw ratio; construct `new Price(token0, token1, Q192_STRING, (sqrtP*sqrtP).toString())`; invert when `base` is token1. Use `.wrapped` currency comparison (`currency.wrapped.equals(other.wrapped)`) so native ETH and WETH interoperate. Throw `BlockfeedError` if base/quote aren't the pool's currencies.
- `pricePathSource.calls`: per leg — v2: `getReserves` at pair; v3: `slot0` at pool; v4: `STATE_VIEW.getSlot0(poolId)` where poolId = keccak256 of abi-encoded PoolKey (implement `poolIdFromPoolKey(poolKey)` in `src/math/poolId.ts` — mirror `liquidity-launcher-sdk/src/poolId.ts` approach; verify against a known real poolId in tests). StateView address from `getChainAddresses(chainId)` — pass `chainId` into `pricePathSource` via `PricePath`… **Decision:** `pricePathSource(path, { chainId })` second param, REQUIRED for v4 legs, optional otherwise.
- `derive`: all leg reads present → compose leg prices via `.multiply`, asserting leg chaining (leg[i].quote.wrapped equals leg[i+1].base.wrapped, else throw at SOURCE CONSTRUCTION time, not derive time). v4 `sqrtPriceX96 === 0n` (uninitialized) → return `undefined` (no emission). `valueEquals`: compare `a.price.equalTo(b.price)`.
- Golden test anchor (compute expected with independent arithmetic in the test, not by calling the implementation): sqrtPriceX96 = `1771595571142957102961017161607260n` (a realistic USDC/WETH v3 value) with token0=USDC(6dp), token1=WETH(18dp) → price of WETH in USDC ≈ 2000.xx; assert `price.toSignificant(5)` startsWith the independently computed digits. Also exact small case: sqrtP = 2^96 exactly, token0/token1 both 18dp → price token0-in-token1 exactly '1'.

**Steps:**
- [ ] Math tests first (golden cases incl. inversion + decimal asymmetry + native/wrapped equivalence), then implement math.
- [ ] Source tests: calls shape per protocol; derive composes 2-leg path; uninitialized v4 → undefined; leg-chain mismatch throws at construction; valueEquals suppresses equal prices from fresh objects.
- [ ] Implement; pass; commit: `feat(blockfeed-sdk): price path source and sqrt price math`

### Task 8: Visibility plugin

**Files:**
- Create: `src/plugins/visibility.ts`, `src/plugins/visibility.test.ts`
- Modify: `src/index.ts` (export from `./plugins/visibility`)

**Interfaces:**
```ts
export interface VisibilityTarget {  // structural subset of Document
  addEventListener(type: 'visibilitychange', cb: () => void): void
  removeEventListener(type: 'visibilitychange', cb: () => void): void
  visibilityState: 'visible' | 'hidden'
}
export function attachVisibilityPlugin(feed: BlockFeed, opts: { target: VisibilityTarget; maxCatchupBlocks?: number /* default 20 */ }): () => void
```

**Behavior:** hidden → `feed.pause()`; visible → `feed.resume({ logWindowOverride: maxCatchupBlocks })`. Returns detach. No `document` global reference — caller passes it (`attachVisibilityPlugin(feed, { target: document })`).

**Steps:**
- [ ] Tests with a fake EventTarget; assert pause/resume calls and detach. Implement. Commit: `feat(blockfeed-sdk): visibility plugin`

### Task 9: Discovery — enumeration

**Files:**
- Create: `src/discovery/types.ts`, `src/discovery/enumerate.ts`, `src/discovery/enumerate.test.ts`
- Modify: `src/discovery/index.ts`

**Interfaces:**
```ts
// discovery/types.ts
export interface CandidatePool { ref: PoolRef; currencyA: Currency; currencyB: Currency; inRangeLiquidity?: bigint }
export interface NoPathFound { kind: 'no-path'; reason: string }
export interface DiscoveryOptions {
  intermediaries?: Currency[]        // default: [native wrapped (WETH) of the chain]
  maxHops?: 1 | 2                    // default 2
  probeNotional?: bigint             // raw units of `quote`; default 10^quote.decimals * 1000
  hookAllowlist?: Address[]          // default []
  maxProbeCandidatesPerPair?: number // default 12
  fromBlockOverride?: bigint         // v4 scan start override (tests/forks)
}

// discovery/enumerate.ts
export async function enumerateCandidates(
  client: PublicClient, chainId: number, tokenA: Currency, tokenB: Currency, opts: Pick<DiscoveryOptions,'hookAllowlist'|'fromBlockOverride'>
): Promise<CandidatePool[]>
```

**Behavior (binding):**
- v2 (if `v2Factory` configured): `getPair(a,b)`; zero address → none.
- v3: `getPool(a,b,fee)` for fees `[100, 500, 3000, 10000]`; batch all factory reads + follow-up `liquidity()` (v3) reads via `client.multicall` (two rounds).
- v4: `client.getLogs({ address: v4PoolManager, event: Initialize, args: { currency0 }, fromBlock: deployBlock })` PLUS the mirrored `{ currency1 }` query — four queries total to cover (A as c0∧B as c1) and (B as c0∧A as c1)? NO — binding: two queries filtered on `{currency0: min(a,b), currency1: max(a,b)}` in ONE query (both indexed → single query with both args), PLUS when either side is WETH/native also the variant with `0x0…0` substituted for the WETH side. Fetch `getLiquidity(poolId)` via StateView multicall for each found pool. Hook filter: drop pools whose `hooks != zeroAddress` unless in `hookAllowlist`. Range-cap resilience: on provider error containing block-range indications, bisect the range and retry (max depth 8); this is control-plane, sequential is fine.
- Candidate `currencyA/currencyB` are the actual pool currencies (native as native Currency when `address(0)`).

**Steps:**
- [ ] Tests with fake client fixtures: v3 fee-tier fan-out; v2 zero-pair skip; v4 log→PoolKey candidates incl. nonstandard fee 2500 and hook filtering incl. allowlist; native-side variant query issued when one side is WETH; range-bisection on simulated provider error.
- [ ] Implement; pass; commit: `feat(blockfeed-sdk): discovery candidate enumeration`

### Task 10: Discovery — probe, rank, assemble

**Files:**
- Create: `src/discovery/probe.ts`, `src/discovery/rank.ts`, `src/discovery/discoverPricePath.ts`, tests for each
- Modify: `src/discovery/index.ts` (public exports: `discoverPricePath`, `DiscoveryOptions`, `NoPathFound`, `enumerateCandidates`, plus types)

**Interfaces:**
```ts
// probe.ts
export interface ProbeResult { candidate: CandidatePool; buyOut: bigint; roundTripOut: bigint }  // buy: notional quote→base; roundTrip: buyOut base→quote
export async function probeCandidates(client: PublicClient, chainId: number, candidates: CandidatePool[], base: Currency, quote: Currency, notional: bigint): Promise<ProbeResult[]>
// rank.ts
export function scoreProbe(p: ProbeResult, notional: bigint): number  // Number(buyOut) * (Number(roundTripOut) / Number(notional)); 0 when either probe failed
export function pickBest(results: ProbeResult[], notional: bigint): ProbeResult | undefined
// discoverPricePath.ts
export async function discoverPricePath(client: PublicClient, args: { chainId: number; base: Currency; quote: Currency; options?: DiscoveryOptions }): Promise<PricePath | NoPathFound>
```

**Behavior (binding):**
- Probes in ONE `client.multicall({ allowFailure: true })` batch: v3 via QuoterV2 `quoteExactInputSingle({tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0})`; v4 via V4Quoter `quoteExactInputSingle({ poolKey, zeroForOne, exactAmount, hookData: '0x' })`; v2 computed in TS from already-fetched reserves (`amountOut = (in*997*rOut)/(rIn*1000 + in*997)`). NOTE the buy and round-trip probes are sequential rounds (round-trip needs buyOut as input): two multicall rounds total.
- Failed/reverted probe → excluded (score 0).
- 2-hop assembly, exact algorithm:
  1. If quote-side intermediary legs needed: for each intermediary I ≠ base,quote: rank `I/quote` candidates with notional (in quote units) → best leg L2 + its implied I-amount `buyOut_I`.
  2. Rank `base/quote` direct candidates with notional → bestDirect (score S_d as quote-side round-trip composite).
  3. For each intermediary: rank `base/I` candidates using notional `buyOut_I` (I units) → best leg L1; two-hop composite score = scoreProbe(L1 composed): buy leg chain quote→I→base gives `buyOut_2hop`; round trip back gives `roundTrip_2hop`; score with same formula against original notional.
  4. Winner = max score among direct + each 2-hop. Nothing scored > 0 → `NoPathFound` with reason.
- Resulting `PricePath.legs` ordered base→quote (leg1 = base/I pool with base as leg.base, quote=I; leg2 = I/quote pool). Direct → single leg.
- `maxProbeCandidatesPerPair`: pre-cap candidates by `inRangeLiquidity` descending (v2 pools always kept).

**Steps:**
- [ ] rank tests (pure): score formula, failed-probe zero, pickBest tie/empty.
- [ ] probe tests with fake multicall: correct quoter encodings for v3/v4 (assert functionName+args incl. zeroForOne orientation both ways), v2 TS math golden case (given reserves 100/200 and in=10 → out floor value), failure exclusion.
- [ ] discoverPricePath tests with fully faked probe/enumerate layers (inject via a `_deps` parameter default-bound to real fns — keep it simple and test the orchestration): direct-only win, 2-hop win when direct is worse, NoPathFound, hook exclusion end-to-end, maxHops=1 skips intermediaries.
- [ ] Implement; pass; commit: `feat(blockfeed-sdk): executable-price path discovery (router-lite)`

### Task 11: liquidity-launcher-sdk — TickDataLens ABI + reads

**Files:**
- Modify: `sdks/liquidity-launcher-sdk/src/abis.ts` (add `TICK_DATA_LENS_ABI`), `src/reads.ts` (lens read descriptors + helpers), `src/index.ts` (exports)
- Create: `sdks/liquidity-launcher-sdk/src/reads.lens.test.ts` (or extend existing reads tests — follow the package's existing test layout)
- Create: `.changeset/<name>.md` (minor bump for liquidity-launcher-sdk)

**Reference (READ FIRST):** `/Users/mark.toda/dev/backend/packages/services/data-api/src/abis/Auctions/TickDataLensAbi.ts` (the ABI — port the entries the reads need, formatted like this package's existing ABIs) and `/Users/mark.toda/dev/backend/packages/services/data-api/src/clients/auctions/tickDataLens.ts` + `tickDataLens.test.ts` (how data-api calls it and derives the clearing price — mirror the semantics EXACTLY; if the lens exposes a paginated/tick-array view, expose the same raw view plus a derived `clearingPriceX96` helper matching data-api's derivation).

**Interfaces (adjust names to match the actual ABI, keeping this shape):**
```ts
export function tickDataCall(lens: Address, auction: Address, ...paginationArgs): ContractCall
export async function getTickData(client: PublicClient, lens: Address, auction: Address, ...): Promise<...>
/** Pure: derive current clearing price (Q96 raw-currency-per-raw-token) from lens output; mirrors data-api. */
export function deriveClearingPriceX96(lensOutput: ...): bigint | undefined
```

**Steps:**
- [ ] Port ABI (only needed entries), write descriptor + helper + pure derivation with unit tests using fixture lens outputs copied/adapted from the backend's own test fixtures.
- [ ] Follow this package's existing patterns (look at neighboring reads + tests). `bun test`, `typecheck`, `build` in the launcher package pass.
- [ ] Add changeset (minor: "add TickDataLens ABI and clearing-price read helpers").
- [ ] Commit: `feat(liquidity-launcher-sdk): TickDataLens ABI and clearing-price reads`

### Task 12: liquidity-launcher-sdk — CCA blockfeed sources

**Files:**
- Create: `sdks/liquidity-launcher-sdk/src/blockfeed/ccaAuctionSource.ts`, `src/blockfeed/ccaBidsSource.ts`, `src/blockfeed/launchAssetSource.ts`, `src/blockfeed/types.ts`, tests per file, `src/blockfeed/index.ts`
- Modify: `sdks/liquidity-launcher-sdk/src/index.ts` (export `* from './blockfeed'`), `package.json` (add `"@uniswap/blockfeed-sdk": "workspace:*"` to **devDependencies** ONLY)
- Create: `src/blockfeed/sourceContract.test-d.ts` or a bun test that does `const s = launchAssetSource(...) satisfies import('@uniswap/blockfeed-sdk').Source<LaunchAssetState>` (type-drift guard from design §3)
- Create: `.changeset/<name>.md` (minor)

**Reference:** CCA bid event ABI — check `/Users/mark.toda/dev/backend/packages/services/data-api/src/abis/Auctions/` for the CCA/auction ABI containing bid events; if absent, check `/Users/mark.toda/dev/universe` (frontend) for the auction ABI it uses to submit/watch bids. Port only the event(s) needed. If no bid event ABI can be found in either repo, report NEEDS_CONTEXT with what you searched.

**Interfaces:**
```ts
// blockfeed/types.ts — plain structural types; do NOT import from blockfeed-sdk in runtime code (type-only imports allowed via `import type` + devDep)
export type LaunchPhase = 'auction' | 'graduated' | 'failed'
export interface LaunchAssetState {
  phase: LaunchPhase
  /** Q96 raw-currency-per-raw-token clearing price while auction; pool sqrt-derived price after graduation. */
  priceX96?: bigint
  poolSqrtPriceX96?: bigint
  currencyRaised: bigint
  remainingSupply: bigint
}
export interface LaunchAssetSourceArgs {
  chainId: number
  auction: Address
  tickDataLens: Address
  /** Deterministic graduated pool key (from launch params / poolId.ts). */
  poolKey: { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }
  stateView: Address
  endBlock: bigint
}
export function launchAssetSource(args: LaunchAssetSourceArgs): Source<LaunchAssetState>  // structural Source type
export function ccaBidsSource(args: { auction: Address }): Source<{ bidCount: number }>   // value minor; the payload is the log events
```

**Behavior (binding, from design §6):**
- `launchAssetSource.calls(ctx)`: while phase is `auction` (or prev undefined): lens tick data call, `currencyRaised()`, `remainingSupply()`, `isGraduated()` — plus, ALWAYS, speculative `{ ...stateViewGetSlot0(poolId), allowFailure: true }`. After graduation (prev.phase === 'graduated'): only the StateView call (+ keep `currencyRaised` if cheap — NO: binding = only StateView post-graduation).
- `derive`: compute phase via `isGraduated` + `deriveAuctionOutcome`-style logic (endBlock passed & !graduated → 'failed'); on the graduation tick the speculative slot0 result is already present → emission carries `phase: 'graduated'` AND `poolSqrtPriceX96` in the SAME emission (this is the design's no-gap guarantee — test it explicitly).
- Reducer purity: no fields on the source object mutate; everything from `ctx.prev`.
- `ccaBidsSource.logFilters` returns the bid event filter on the auction address; derive counts cumulative bids (prev.value.bidCount + tick.logs.length).

**Steps:**
- [ ] Tests first (pure reducer golden tests): auction-phase emission from fixture lens output; graduation tick carries pool price same-emission; failed outcome after endBlock; speculative call present in `calls()` during auction; post-graduation calls shrink to StateView only; bids counting + retraction does NOT decrement (document: counts are monotonic; UI reconciles via retraction events).
- [ ] Type-drift guard test compiles against real blockfeed-sdk `Source`.
- [ ] Launcher `bun test`, `typecheck`, `build` pass. Changeset added.
- [ ] Commit: `feat(liquidity-launcher-sdk): CCA blockfeed sources (auction, bids, launch lifecycle)`

### Task 13: Integration workspace + engine fork scenarios (design §9.2)

**Files:**
- Create: `sdks/blockfeed-sdk/integration/package.json` (private, name `blockfeed-integration`, `"test": "bun test"`), `integration/tsconfig.json`, `integration/anvil.ts` (harness), `integration/engine.fork.test.ts`
- Modify: root `package.json` workspaces: add `"sdks/blockfeed-sdk/integration"`; `.changeset/config.json` ignore list: add `blockfeed-integration` (mirror how `uniswapx-integration` is ignored).

**Harness contract (`anvil.ts`):**
```ts
export interface AnvilFork { rpcUrl: string; wsUrl: string; stop(): Promise<void>; rpc<T>(method: string, params: unknown[]): Promise<T> }
export async function startAnvilFork(opts: { forkUrl: string; forkBlock?: bigint; port?: number }): Promise<AnvilFork>
export const FORK_RPC_BASE = process.env.BLOCKFEED_FORK_RPC_BASE ?? 'https://mainnet.base.org'
export function anvilAvailable(): boolean   // sync `which anvil`-style check
```
All fork test files start with `const RUN = anvilAvailable() && process.env.BLOCKFEED_SKIP_FORK !== '1'` and use `describe.skipIf(!RUN)` so CI (no foundry) skips cleanly. Use unique ports (e.g., 8600+offset per file). Kill anvil in `afterAll` even on failure.

**Scenarios (binding — Base fork at a pinned recent block; pick one at implementation time and hard-code it):**
1. **Price tick correctness:** watch a `pricePathSource` over the Base WETH/USDC v3 0.05% pool (`0xd0b53D9277642d899DF5C87A3966A349A798F224`) with HTTP transport. Read slot0 directly for expected price. Then: impersonate a USDC whale (find one at the pinned block via `cast`/multicall on top holders — hard-code the address in the test with a comment on how it was found), approve + `exactInputSingle` 50k USDC→WETH through SwapRouter02 (`0x2626664c2603336E57B271c5C0b26F421741e481`), `anvil_mine` 1 block; assert a `tick` event arrives whose price differs and whose value matches a fresh direct slot0 read; assert emission identity blockNumber === new block.
2. **Retraction honesty:** subscribe a source with a `logFilters` on USDC `Transfer` (any event works for the mechanism); send a transfer tx from the whale, mine, assert `log` event; then `anvil_reorg` (params per anvil 1.x: depth 1 dropping the tx) — fallback `evm_snapshot` before tx / `evm_revert` + mine empty blocks; assert a `retraction` event with the tx's `(txHash, logIndex)`.
3. **Transport parity:** run scenario 1's happy path over `webSocket(wsUrl)` transport too (anvil serves WS on same port path `/`).
4. **Atomicity:** during a burst of `anvil_mine` (5 blocks) with interleaved swaps, assert every emission's `identity.blockNumber` is monotonically nondecreasing and each tick's price equals the direct `slot0` read at that same block number (`blockNumber` param on readContract).

**Steps:**
- [ ] Harness first (unit-test `startAnvilFork` spins & stops against plain `anvil --fork-url` only when available).
- [ ] Scenarios; run locally (`bun test` inside integration workspace with anvil present) until green. These tests hit a public RPC to fork — keep fork block pinned and total upstream calls low (anvil caches).
- [ ] Commit: `test(blockfeed-sdk): anvil fork integration harness and engine scenarios`

### Task 14: Discovery fork scenarios (design §9.3)

**Files:**
- Create: `sdks/blockfeed-sdk/integration/discovery.fork.test.ts`

**Scenarios (binding, same Base fork):**
1. **Known-token selection:** `discoverPricePath` for WETH→USDC on Base resolves a direct leg on a real deep pool (assert protocol+address is one of the known deep WETH/USDC pools; assert single leg).
2. **2-hop:** pick a token with no meaningful direct USDC pool but a deep WETH pool at the pinned block (implementer selects one at the pinned block by inspection — e.g., a mid-cap ERC20; hard-code with a comment); assert 2 legs via WETH.
3. **v4 nonstandard-fee enumeration:** initialize a fresh v4 pool with fee 2500/tickSpacing 50, hooks=0, for a freshly-deployed test ERC20 vs WETH (`poolManager.initialize(poolKey, sqrtPriceX96)` — permissionless, one tx; deploy the ERC20 via `anvil_setCode`-free plain deployment tx of a tiny ERC20 bytecode or use forge-created artifact committed as hex fixture). Assert `enumerateCandidates` finds it (this validates the Initialize log scan on fork-local blocks with `fromBlockOverride`).
4. **Adversarial trap:** create a v3 pool for scenario 2's token pair at an unused fee tier with a fantasy price and a tiny 1-tick-band position (mint via NonfungiblePositionManager `0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1` on Base); assert `discoverPricePath` still selects the honest pool (trap's round-trip probe collapses). This is design §9.3's manipulation-resistance regression.

**Steps:**
- [ ] Implement scenarios; run locally green with anvil; commit: `test(blockfeed-sdk): discovery fork scenarios incl. adversarial trap pool`

### Task 15: CCA lifecycle end-to-end (design §9.4)

**Files:**
- Create: `sdks/blockfeed-sdk/integration/cca.fork.test.ts` (imports launcher SDK via workspace)
- Modify: `integration/package.json` (add `"@uniswap/liquidity-launcher-sdk": "workspace:*"`, `"@uniswap/blockfeed-sdk": "workspace:*"` deps if not present)

**Scenario (binding):** Fork a chain where LiquidityLauncher is deployed (read `sdks/liquidity-launcher-sdk/src/addresses.ts` for deployments — prefer Base or Unichain). Drive a real launch via the launcher SDK's `buildLaunchTransactions` with a small custom config (tiny auction duration in blocks — NOT the quick-launch preset), from an impersonated funded EOA. Then:
1. Subscribe one `launchAssetSource` (poolKey computed via the launcher SDK's poolId helpers from the launch params).
2. Place ≥2 bids from impersonated accounts (bid tx encoding: check the backend/universe references from Task 12 for the bid function ABI; if Task 12 found it, reuse). Mine between bids. Assert: auction-phase `tick` events with `priceX96` defined and `log` bid events arriving before the tick they moved (engine ordering).
3. Mine through `endBlock`; execute graduation/migration (launcher SDK build helpers — `buildMigrateTx` exists per repo). Assert ONE emission carrying `phase: 'graduated'` AND `poolSqrtPriceX96` (same-tick no-gap guarantee), and a `phase` event.
4. Post-graduation: assert ≥1 pool-price tick consistent with the final clearing price within 10%.
**Fallback (acceptable reduced scope, document in report):** if bid encoding is unobtainable, run the zero-bid path — auction reaches `endBlock` unraised → assert `phase: 'failed'` emission — and note the gap; do NOT fake bids via storage writes.

**Steps:**
- [ ] Implement; run locally; expect this task to surface real integration bugs in Tasks 11–12 — fix them here (that's the point), keeping fixes in the appropriate package with tests.
- [ ] Commit: `test(blockfeed-sdk): CCA launch lifecycle end-to-end fork scenario`

### Task 16: Documentation, changesets, release hygiene

**Files:**
- Modify: `sdks/blockfeed-sdk/README.md` (full: quickstart with `createBlockFeed`+`pricePathSource`, discovery example, CCA example importing launcher sources, event model table, transport/poll config, integration-test instructions), `sdks/liquidity-launcher-sdk/README.md` (new "Live data (blockfeed) sources" section), `docs/blockfeed-sdk-design.md` (status → Implemented; correct any drift discovered during implementation — list corrections in the report)
- Create: `.changeset/<name>.md` for blockfeed-sdk (minor, first release)
- Verify: `bun run g:build`, `bun run g:typecheck`, root `bun test` for both packages, `bun run g:lint` green from repo root.

**Steps:**
- [ ] Write docs; run full verification suite; commit: `docs(blockfeed-sdk): README, launcher docs, changesets`

---

## Plan Self-Review Notes

- Spec coverage: design §4 → Tasks 2–8; §5 → Tasks 9–10; §6 → Tasks 11–12; §7 → Tasks 4, 6, 13; §8 → Tasks 6, 8; §9.1 → per-task tests; §9.2 → 13; §9.3 → 14; §9.4 → 15; §9.5 (live-RPC smoke) → deliberately DEFERRED (nightly tooling, not v1 code — noted as future work in Task 16 README).
- Type consistency: `Source`, `TickData`, `SourceEmission`, `PricePath`, `FeedStore` names fixed in Task 2 and referenced verbatim in Tasks 6, 7, 12.
- Known judgment points delegated to implementers WITH guardrails: exact TickDataLens function names (Task 11 mirrors backend), bid event ABI (Task 12, NEEDS_CONTEXT protocol), pinned fork blocks and whale addresses (Tasks 13–15, hard-code with provenance comments).
