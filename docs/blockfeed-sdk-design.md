# `@uniswap/blockfeed-sdk` — Live On-Chain Data Design

**Status:** Draft v2 (post self-review) for team review
**Date:** 2026-07-16
**Scope:** New package in the SDKs monorepo, plus CCA source additions to `@uniswap/liquidity-launcher-sdk`

---

## 1. Motivation

Indexed price data reaches the app 30–60 seconds after the chain moves. Two product moments make that latency unacceptable:

1. **Token explore pages** — the price readout and chart should update on every new block.
2. **CCA quick-launch auctions** — a 4-hour auction's UX *is* the live drama of bids landing and the clearing price moving. Both must update within a block of the transaction landing, including the graduation moment when the auction migrates into a fresh v4 pool that the indexer has never seen.

The fix is not to make the indexer faster; it is to read the chain directly for the small set of assets a user is actively looking at, while continuing to use indexed data for everything topology-shaped (history, pool rankings, metadata).

**Governing decomposition — control plane vs. data plane.** Pool topology changes on a timescale of days; pool *state* changes every block. The delayed indexer is perfectly fresh for choosing which pools to watch; it is only stale for pricing them. So:

- **Control plane (slow, occasional):** decide *what* to watch — a `PricePath` per asset. Supplied by the app/backend where indexer data exists; discovered on-chain where it doesn't (new launches).
- **Data plane (fast, per block):** read the state of the watched pools, derive prices, emit updates.

Judgment never runs on the hot path.

## 2. Goals and non-goals

**Goals**

- Block-latency subscriptions to derived on-chain values (prices, auction state) and event streams (bids), in the browser, over any viem `PublicClient`.
- Environment-agnostic engine: browser is the driving consumer, but the core contains **no browser APIs** — the same engine must embed in a backend service unchanged (browser concerns like tab visibility are injectable plugins, §8).
- One continuous, phase-tagged price stream across the CCA auction → graduated-pool transition, with **no gap tick at graduation**.
- A lightweight path-discovery module ("router-lite"): max 2 hops, holistic v4 coverage, executable-price ranking — usable standalone.
- Generic quote currency. USDC is not special-cased; pricing in EURC, WETH, or anything else is the same code path. The feed reports prices *in an asset*, never "in USD" — fiat display mapping is the UI's concern.
- Sources are **pure reducers** — every derivation is a deterministic function of (previous emission, this tick's data), so the entire derivation layer is golden-testable without a network.

**Non-goals (v1)**

- Historical/archive backfill (price at arbitrary past blocks). The feed buffers ticks from first-subscriber attach only.
- React bindings. The store contract is `useSyncExternalStore`-compatible; the frontend writes its own three-line hook.
- Trade-execution routing. Discovery picks pools for *display pricing*; routing-api / onchain-router remain the execution routers.
- TS reimplementation of tick-traversal quoter math. Evaluation delegates to deployed quoter contracts.
- Depeg detection. A USDC-quoted price is a USDC-quoted price.
- Fee-on-transfer token accuracy. Quoters don't model FOT transfer taxes; displayed prices for FOT tokens will be optimistic. Documented limitation, not solved.

## 3. Package placement and dependencies

- **New package `sdks/blockfeed-sdk` → `@uniswap/blockfeed-sdk`.** Follows the viem-generation conventions: `viem ^2.23.5` as a direct dependency (no peer deps, matching every other package in the repo), CJS/ESM/types triple build, `bun test`, changesets, `workspace:*` internals. Never binds a transport.
- **Subpath export `@uniswap/blockfeed-sdk/discovery`** for router-lite. It ships as a module, not its own package; promote to a standalone package only when a second real consumer appears (candidates: interface fallback quoting, backend sanity checks).
- **CCA sources live in `@uniswap/liquidity-launcher-sdk`**, next to the auction semantics they depend on (`deriveAuctionOutcome`, deterministic poolId derivation, `TickDataLens` registry). Crucially, **neither package depends on the other at runtime**: a `Source` is a plain object and TypeScript structural typing makes launcher-exported source factories compatible with the engine with zero import.
  - **Drift guard:** structural typing means the interfaces can silently diverge and only fail in some downstream app's compile. To catch this in CI, `liquidity-launcher-sdk` takes blockfeed as a **devDependency** and includes a types-only test asserting its exported factories `satisfies` the engine's `Source` shape. Compile-time drift detection; zero runtime or publish coupling.
- `sdk-core` is a dependency for `Currency`/`Price`/`Fraction` math (multi-hop composition via `Price.multiply` handles decimals exactly).

**Rejected placements:** `router-sdk` (semantically apt but ethers-v5 and contractually offline — its consumers rely on it never touching the network); `liquidity-launcher-sdk` (a generic engine inside an auction SDK is a placement lie that worsens every release); a separate router package now (speculative split; costs changeset coordination during the least-stable API phase).

**Rejected alternative — "just use wagmi `watch: true`":** wagmi's `useReadContracts` re-reads per block, but it has no derive/compose layer (multi-hop price math per consumer), no log support and therefore no retractions, no rolling tick buffer for charts, no cross-component call dedupe beyond query-key equality, no phase/lifecycle model, and it is React-bound (excluding the backend goal). Blockfeed is the layer a wagmi hook would *wrap*, not a competitor to it.

## 4. Core concepts

### 4.1 Heartbeat — one atomic read per tick

One heartbeat per `(chainId, client)` pair, shared by all subscriptions on that chain.

**The tick read is a single Multicall3 `aggregate3` batch whose first three calls are Multicall3's own `getBlockNumber`, `getLastBlockHash`, and `getCurrentBlockTimestamp`, followed by every active state descriptor across all sources.** This gives:

- **One RPC round-trip per poll on HTTP transports** — there is no separate "check for new block" call; the poll *is* the read. If the returned block number and hash match the previous tick, the results are discarded (nothing moved).
- **Atomicity** — the block number/hash/timestamp and all state come from the same EVM call, so a tick can never pair block N's identity with block N+1's state.
- **Same-height reorg detection for free** — a reorg replacing block N with a different block N is invisible to number-based change detection but caught by the hash.
- **Chart-ready timestamps** without an extra `getBlock` call.

Transport adaptation: **WS** transports use `newHeads` (`watchBlockNumber`) purely as a *trigger* for the same atomic read (sub-second notification); **HTTP** transports poll it on a per-chain cadence (§8). Descriptors are deduplicated at the call level across all sources and subscribers — ten paths referencing the same WETH/USDC pool contribute one `slot0` read. Batches are **chunked** above a size threshold (provider calldata/compute caps); chunks share the tick identity from chunk 1.

Each tick additionally executes **one `eth_getLogs`** over the trailing window `[head − K, head]` (K ≈ 2–3) covering all active log filters (merged by address/topics), with `toBlock` pinned to the tick's observed block so the tick stays coherent; later logs belong to the next tick.

**State never lags the head.** No confirmation depth for state reads — instant-at-head is the point. Reorged state self-heals on the next tick (§7).

### 4.2 Sources — keyed reads, pure reducers

A source is data, not a class hierarchy:

```ts
interface Source<T> {
  /** Stable identity for engine-level dedupe across subscribers. */
  key: string
  /** Keyed state reads for this tick. May vary tick-to-tick (phase changes, endBlock passed, …). */
  calls(ctx: TickContext<T>): Record<string, SpeculativeCall>
  /** Optional log filters for this tick. */
  logFilters?(ctx: TickContext<T>): LogFilter[]
  /** PURE reducer: (previous emission, this tick's keyed results + logs) → next emission. */
  derive(prev: SourceEmission<T> | undefined, tick: TickData, ctx: TickContext<T>): SourceEmission<T>
}

type SpeculativeCall = ContractCall & { allowFailure?: boolean }
```

Design decisions embedded here (each fixes a specific defect found in review):

- **Keyed calls, keyed results.** `derive` looks up `tick.results['slot0']`, never `results[3]`. Positional coupling is exactly wrong for sources whose call set varies between ticks.
- **Reducer purity.** Sources hold no internal mutable state; phase and history live in the emission that the engine threads back as `prev`. Every source is replayable and unit-testable from fixtures alone. One source instance is evaluated once per tick regardless of subscriber count.
- **Speculative descriptors.** `allowFailure: true` calls map to `aggregate3`'s per-call failure tolerance. A source may include reads against contracts/pools that don't exist *yet*; the call fails harmlessly until the tick it doesn't. This is what eliminates the graduation gap (§6).

`ContractCall` is the same `{ address, abi, functionName, args }` descriptor shape as `liquidity-launcher-sdk/src/reads.ts` — the house style.

Shipped sources in v1:

- `pricePathSource(path: PricePath)` — v2 reserves / v3 `slot0` / v4 `StateView.getSlot0` per leg, composed via `Price.multiply`.
- CCA sources (exported from `liquidity-launcher-sdk`): `ccaAuctionSource`, `ccaBidsSource`, and the composite `launchAssetSource` (§6).

Future sources fit without engine changes: wallet balances, gas price, position health, client-side TWAPs (a reducer over its own previous emission), limit-order trigger monitoring.

### 4.3 Subscriptions are stores

```ts
interface FeedStore<T> {
  subscribe(listener: (e: FeedEvent<T>) => void): () => void
  getSnapshot(): FeedSnapshot<T>   // current value + rolling tick buffer + phase + staleness
}
```

- Directly consumable by React's `useSyncExternalStore`; equally usable from vanilla JS, Svelte, or a server loop. No React dependency in this repo. (`getSnapshot` returns a referentially stable object between emissions — a `useSyncExternalStore` contract requirement.)
- **Refcounted lifecycle:** first subscriber for a chain starts the heartbeat; last unsubscribe stops it. Sources with equal `key` share one evaluation.
- **Rolling buffer:** each price store retains the last N ticks `(blockNumber, timestamp, value)` from the moment the first subscriber attached, so a chart mounting mid-session renders a live tail immediately. The seam between indexer history and the live tail (up to ~60s gap on first paint) is accepted and heals as indexer data arrives; both are spot-derived so they agree where they overlap.

### 4.4 Event model

Every emission is tagged with `(blockNumber, blockHash)` (consumers reconcile against indexer data by block). Five first-class event types:

| Event | Meaning |
|---|---|
| `tick` | New derived value (price, auction state) at block N. Suppressed when the derived value is unchanged (e.g., ~250ms L2 blocks where nothing relevant moved). |
| `log` | New matched log (e.g., a bid), deduped by `(txHash, logIndex)`. |
| `retraction` | A previously emitted log vanished in a reorg (§7). Carries the original log identity. |
| `phase` | Source lifecycle transition (`auction → graduated`, `auction → failed`). Distinct from ticks so charts render markers instead of silently connecting discontinuous lines. |
| `gap` | The feed knows it missed blocks it cannot cheaply recover (e.g., long tab-throttle, §8) — charts must not draw a false flat line across it. |

### 4.5 `PricePath` — the pricing contract

```ts
interface PricePath {
  base: Currency          // the asset being priced
  quote: Currency         // ANY currency — USDC, EURC, WETH, …
  legs: PoolLeg[]         // ordered; ≤ 2 in practice; each leg oriented base→quote
}

type PoolLeg =
  | { protocol: 'v2'; pair: Address }
  | { protocol: 'v3'; pool: Address }
  | { protocol: 'v4'; poolKey: PoolKey }   // poolId derived
```

The data plane only ever consumes explicit paths. Where they come from:

1. **App/backend supplies them** (the normal case — indexer knows the pools and is better at canonical-pool judgment than any on-chain heuristic).
2. **Discovery** (§5) for cold starts.
3. **Constructed deterministically** for CCA graduation — no discovery, no indexer (§6).

There is **no anchor registry**. "Price in USDC" is just discovery/backend producing a path whose final leg lands on USDC — the good WETH→USDC leg is a *discovered output*, not a curated input. Sharing of common legs across assets is emergent from call-level dedupe, not designated. Price is derived entirely on-chain within one block-tagged snapshot — no mixing of live legs with externally-pushed values.

**Native/WETH duality:** v4 pools denominate native ETH as `address(0)`; v2/v3 use WETH. Path legs and discovery treat them as one logical intermediary with two representations (the onchain-router special-cases this too; we inherit the obligation).

## 5. Discovery — router-lite (`@uniswap/blockfeed-sdk/discovery`)

```ts
discoverPricePath(client, {
  base, quote,
  intermediaries?,   // default: [WETH/native] (from sdk-core registries)
  maxHops?,          // default 2
  probeNotional?,    // default ≈ 1_000 quote units, sized in quote terms
  hookPolicy?,       // default: hookless only + explicit whitelist
}): Promise<PricePath | NoPathFound>
```

**First-principles factoring.** Routing = enumerate → evaluate → select. Each has a natural home:

- **Enumerate — off-chain.** v2/v3: factory `getPair`/`getPool` across fee tiers (multicalled). v4: the PoolManager's `Initialize` event indexes `currency0` and `currency1`, so an `eth_getLogs` scan per token returns *every v4 pool containing it*, each log carrying the complete `PoolKey` — nonstandard fees, exotic tick spacings, hooked pools, everything. This is holistic in a way no on-chain enumerator can be: v4's singleton stores no iterable registry (poolIds are hashes), which is precisely why the onchain-router needed its default-config guesses + leaderboard. *Provider reality:* scans start from a per-chain PoolManager deploy-block constant (small registry) and chunk the range when a provider enforces span caps; this is control-plane, so a few round-trips are fine.
- **Evaluate — on-chain, via contracts that already exist.** After a dust filter (existence + minimal in-range-liquidity floor, only to cap probe count), every candidate is probe-quoted **in both directions** at a fixed notional through the deployed **QuoterV2** (v3) and **V4Quoter** (v4); v2 is two lines of reserves math in TS. Quoter functions are non-`view`, but Multicall3 under `eth_call` simulates state writes — all probes land in **one RPC round-trip**. No TS port of tick-traversal math, no new contract deployments, works on every chain Uniswap is deployed on.
- **Select — off-chain.** Rank by two-way executable quality with a round-trip-spread penalty. Compose: best direct pool vs. best 2-hop through each intermediary; take the winner; emit `PricePath`.

**Why executable ranking (not spot or liquidity):** in-range `L` is cheap to fake — $50 concentrated in a 1-tick band at a fantasy price produces an enormous `L` reading, and automatic discovery on the Uniswap frontend is exactly the adversarial surface where scam tokens would exploit that. A probe punches through thin fake bands (impact craters the output), and a pool quoting *better than market* in any direction is offering arbable free money — economically self-extinguishing. Winning the ranking requires either genuine depth or briefly donating money to arbitrageurs. **This claim is a regression test, not prose — see §9.3's adversarial fork test.**

**Cost:** ~2–3 RPC round-trips, one time per token. Discovery is control-plane only — never on the hot path. Optional periodic re-validation of active paths is a config knob, off by default; the accepted risk is a chosen pool draining mid-session, which indexer reconciliation eventually surfaces.

**Why not the deployed onchain-router lens** (`routeExactInput` as a single view `eth_call`): its v4 enumeration probes only the default configs `(100, 500, 3000, 10000)` + a permissionless win-scored leaderboard. **The quick-launch graduated pool has fee 2500** — invisible to default enumeration, dependent on leaderboard registration that is untested in anger and score-maintained only by swaps through that router. Adding 2500 to the config list treats the symptom (whack-a-mole per exotic config, redeploy per chain, extra gas on every route call for everyone). The router's bundling of enumeration+evaluation+selection into one contract is correct for *its* problem — atomic on-chain execution — and structurally handicapped for ours. The `Discoverer` interface stays pluggable; the lens (and a future full TS mini-router) can be added as alternative discoverers if a use case demands simulation-grade route selection.

**Policy knobs (defaults to be finalized in review):** probe notional (~1k quote units), round-trip-spread penalty weight, dust-filter liquidity floor, hook whitelist (default empty). These are the places where "automatic pool choice" embeds judgment — they are explicit config, not buried constants.

## 6. CCA / quick-launch sources (in `liquidity-launcher-sdk`)

A quick-launch asset lives two lives; `launchAssetSource(launch)` makes them one stream.

**During the auction (`phase: 'auction'`):**
- Clearing price via **`TickDataLens`** (`getTickDataLensForFactory` registry already exists in `addresses.ts`; the ABI + read helpers are new work, see §10).
- `currencyRaised`, `remainingSupply`, graduation-relevant block getters from `CCA_ABI` — all in the shared per-tick multicall.
- **Live bids** via log filters on the auction address — single contract, few topics, append-only ticker: the easy case of log watching. Reorged bids surface as `retraction` events (§7) — during a live auction, a bid that "un-happens" moves the clearing price people just watched; the retraction event is the explanation.

**At graduation — no gap tick.** From late auction onward, the source speculatively includes the graduated pool's `StateView.getSlot0` descriptor with `allowFailure: true` — the pool's `PoolKey`/poolId is **known deterministically** from the launch parameters (`poolId.ts`), it just doesn't exist yet, so the call fails harmlessly each tick. On the tick where `isGraduated` flips, the pool read succeeds *in the same batch*: the `phase` event and the first pool-price tick carry the same block number. No discovery, no indexer wait, no unsubscribe/resubscribe race, no one-block price hole at the most-watched moment of the launch.

**Auction prices are native-denominated** (quick-launch raises in ETH); composition with a native→quote leg uses the same `Price.multiply` machinery as any 2-hop path.

**Block domains:** the CCA is `BlockNumberish`-aware — on Arbitrum-style chains it counts L1 blocks, not L2 `eth_blockNumber`. The heartbeat always ticks on the **L2 head** (state — bids, clearing price — can change on any L2 block), but sources must interpret `endBlock`/`claimBlock`/deadlines in the auction's own block domain. `deriveAuctionOutcome` already models this; the source carries it through. Tick suppression (§4.4) keeps fast L2 blocks from spamming subscribers when nothing moved.

## 7. Reorg policy

- **State: self-healing, zero added latency.** Every tick re-reads at head; a reorged-away value is corrected one tick later (~2s exposure on OP-stack chains). No confirmation lag, ever — the provisional chart tail may wiggle and later reconciles against indexer data via block tags. Same-height reorgs are detected via the batched `getLastBlockHash` (§4.1), so even a replaced-block-N tick re-emits rather than being deduped away.
- **Logs: trailing-window reconciliation.** Each tick fetches `[head − K, head]` (K ≈ 2–3) rather than just the new block — same single `eth_getLogs`, marginally wider range. New logs are emitted deduped by `(txHash, logIndex)`; previously-emitted logs missing from a re-scanned block yield **`retraction` events**. Transport-agnostic (no dependency on WS `removed: true`, though WS subscriptions can feed the same mechanism). The UI chooses whether to remove or mark retracted rows — the feed's job is to make honesty *possible*.
- **Accepted risk:** reorgs deeper than K blocks escape retraction; K is configurable, and indexer reconciliation is the backstop. On the OP-stack chains quick-launch targets, deep reorgs are effectively absent.

## 8. Degradation and runtime behavior

- **RPC errors:** exponential backoff on the heartbeat (pattern per `flashtestations-sdk`'s `RpcClient`); snapshots expose `stale: boolean` + last-successful-block so UIs can dim rather than lie.
- **Environment plugins, not environment assumptions:** the core references no `document`/`window`. Tab-visibility handling (pause or slow the heartbeat when hidden; on regain, widen the next trailing log window to cover the missed span, bounded; beyond the bound emit a `gap` event) ships as an optional browser plugin the app installs. A future backend embedding installs nothing.
- **Poll cadence (HTTP transports):** per-chain defaults keyed to block time (e.g., ~1× block time on 1–2s chains, tighter divisor on 12s mainnet), always configurable. WS transports make this moot.
- **Cost envelope:** per open page ≈ 1 multicall + 1 `getLogs` per block per chain, regardless of how many components subscribe (HTTP polling: the multicall *is* the block check, §4.1). Discovery adds ~2–3 calls once per cold-start token.

## 9. Testing strategy

Layered so that everything above the network boundary is hermetic, and everything below it runs against real chain state via **Anvil forks**. Integration lives in a private `sdks/blockfeed-sdk/integration` workspace — the repo precedent is `sdks/uniswapx-sdk/integration` (a private workspace running against a local chain); we use Anvil/foundry rather than Hardhat to match the viem generation. Fork tests pin `(chain, blockNumber)` per scenario and take the upstream RPC URL from an env var.

**CI posture (decided):** CI runs only the hermetic unit suite (§9.1). The fork suites (§9.2–9.4) are **local developer tools** — `bun run test:integration`, requiring a locally installed foundry and an RPC URL env var; they skip cleanly when either is absent. Promoting them to CI (foundry install step + RPC key secret + fixture cache) is an optional later hardening step, not a v1 requirement.

### 9.1 Unit (bun test, hermetic — in-package)
- Every `derive` is a pure reducer: golden tests from fixture `(prev, tickData)` pairs — price composition across hops/decimals, phase transitions, tick suppression, retraction bookkeeping.
- Discovery selection logic against fixture candidate sets (ranking, spread penalty, hook policy, native/WETH unification, `NoPathFound`).
- Engine scheduling with injected clock and a mock transport: refcounting, dedupe, chunking boundaries, backoff, buffer semantics, snapshot referential stability.

### 9.2 Engine integration (Anvil fork)
- **Price tick correctness:** fork Base at a pinned block; subscribe to a `PricePath`; impersonate a whale (`anvil_impersonateAccount`) and execute a real swap against the watched pool; `anvil_mine`; assert the feed emits the exactly-computable new price, tagged with the new block, within one tick.
- **Reorg honesty:** mine a block containing a watched log (a bid-shaped event), then `anvil_reorg` (or `evm_snapshot`/`evm_revert` + re-mine without the tx) — assert a `retraction` event fires carrying the original `(txHash, logIndex)`, and that state ticks self-heal to the canonical value.
- **Both transports:** Anvil serves HTTP and WS; every scenario in this suite runs under both, exercising the poll heartbeat and the push-triggered atomic read identically.
- **Multicall atomicity:** assert block number/hash/timestamp in each emission match the state actually read (mine mid-test and verify no mixed-block tick is ever emitted).

### 9.3 Discovery integration (Anvil fork)
- **Known-token selection:** run `discoverPricePath` for established tokens at pinned blocks; assert the selected pools match hand-verified expectations (including a token whose best path is 2-hop through WETH).
- **v4 holisticity:** target a token whose only pool is a nonstandard-fee v4 pool (fee 2500 — the quick-launch shape); assert enumeration finds it via the `Initialize` log scan. This is the direct regression test for the onchain-router gap that motivated router-lite.
- **Adversarial manipulation test:** on the fork, deploy the attack from §5 — a v3/v4 pool for the target pair with a huge-`L` 1-tick band at a fantasy price and negligible capital — and assert discovery ranks the honest pool first and the trap pool's two-way probe collapses. The manipulation-resistance argument becomes CI, not prose.

### 9.4 CCA lifecycle end-to-end (Anvil fork — the flagship scenario)
Fork a chain where `LiquidityLauncher` is deployed. Using the launcher SDK's own helpers (`buildLaunchTransactions`), execute a real launch with a test-sized block duration; then, from impersonated accounts, place bids across several mined blocks; mine through `endBlock`; trigger graduation/migration. Against a single `launchAssetSource` subscription, assert one continuous stream:
1. auction-phase ticks with a clearing price that moves as bids land (validates `TickDataLens` reads),
2. `log` events for each bid in the same tick as the price they moved,
3. the `phase: graduated` event **and the first pool-price tick on the same block** (regression test for the speculative-descriptor design, §6),
4. post-graduation spot ticks from the deterministic v4 pool consistent with the auction's final clearing price.

This one scenario exercises the engine, the CCA sources, speculative descriptors, block-domain handling, and the launcher SDK's build helpers together — it is also, usefully, an executable spec of launch-day behavior.

### 9.5 Live-RPC smoke (nightly/manual, env-gated, never CI-blocking)
Watch WETH/USDC on real Base for ~10 blocks over both HTTP and WS; assert monotonically block-tagged ticks arrive within latency bounds. Catches provider-behavior drift (rate limits, `getLogs` caps, WS quirks) that forks structurally cannot.

## 10. Open items

1. **`TickDataLens` ABI + read helpers** in `liquidity-launcher-sdk` — prerequisite for auction clearing price; registry exists, ABI/helpers don't.
2. **Quick-launch v1 chain list** — no longer architecturally load-bearing (onchain-router dependency dropped) but determines the tested/tuned chain set, quoter address table, and PoolManager deploy-block registry entries.
3. **Policy defaults** — probe notional, spread penalty, liquidity floor, poll cadences, buffer length N, trailing window K, multicall chunk size. Proposed defaults above; finalize in implementation review.
4. **Quick-launch fee sign-off** — 0.25% vs 0.3% is still marked PENDING SIGN-OFF in `quickLaunch.ts`; discovery is immune either way (holistic enumeration), but test fixtures should track the decision.
5. **v4 hooked-pool policy over time** — default-deny with whitelist is right for v1; a principled "hook safety" classification is future work.

## 11. Phasing

1. **Engine core:** atomic heartbeat, multicall batching/chunking, store/refcount lifecycle, `pricePathSource`, event model, browser visibility plugin. Testable against any token with an app-supplied path (§9.1–9.2 suites land here).
2. **Discovery module:** enumeration, probes, ranking (§9.3 suite).
3. **CCA sources** in `liquidity-launcher-sdk` (blocked on `TickDataLens` helpers): auction source, bids source, composite lifecycle source with speculative graduation reads (§9.4 suite).
4. **Hardening:** reorg/retraction paths, backgrounding, backoff, per-chain tuning, live-RPC smoke (§9.5) — against the quick-launch launch-day traffic profile.
