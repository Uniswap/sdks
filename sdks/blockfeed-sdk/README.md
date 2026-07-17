# Blockfeed SDK

⚡ Block-latency on-chain data feeds — live prices, auction state, and logs over any viem
`PublicClient`.

Indexed price data reaches an app 30–60 seconds after the chain moves. Blockfeed closes that gap for
the small set of assets a user is actively looking at by reading the chain directly, every block,
while the indexer keeps doing what it is good at (history, rankings, metadata). It splits cleanly into
a **control plane** — decide *what* to watch (a `PricePath` per asset, supplied by a backend or found
by on-chain discovery) — and a **data plane** — read the state of the watched pools each block, derive
prices, and emit updates. Judgment never runs on the hot path. The engine is environment-agnostic (no
browser APIs in the core; the browser is just one consumer), sources are **pure reducers** so the whole
derivation layer is unit-testable without a network, and it binds no transport of its own — it runs
over any viem `PublicClient`.

## Installation

```bash
bun add @uniswap/blockfeed-sdk viem
# or: npm i @uniswap/blockfeed-sdk viem
```

## Quickstart

Create one feed per `(client, chainId)`, `watch` a source, and `subscribe` to its store. The heartbeat
starts on the first subscriber and stops on the last unsubscribe (refcounted). `chainId` is optional —
it defaults to `client.chain?.id`.

```ts
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { Token } from '@uniswap/sdk-core'
import { createFeedRegistry, pricePathSource, type PricePath } from '@uniswap/blockfeed-sdk'

const client = createPublicClient({ chain: base, transport: http() })

// A registry hands back ONE shared feed per (client, chainId) — see "The double-feed footgun" below.
const registry = createFeedRegistry()
const feed = registry.getFeed(client) // chainId inferred from client.chain.id (8453)

const usdc = new Token(8453, '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 6, 'USDC')
const weth = new Token(8453, '0x4200000000000000000000000000000000000006', 18, 'WETH')

// A PricePath is the pricing contract: base priced in quote, over ordered base→quote legs.
const path: PricePath = {
  base: weth,
  quote: usdc,
  // A single v3 leg here for brevity; supply the pool address from your backend, or use Discovery
  // (below) to find it. Legs are also v2 (`{ protocol: 'v2', pair }`) or v4 (`{ protocol: 'v4', poolKey }`).
  legs: [{ pool: { protocol: 'v3', pool: '0x0000000000000000000000000000000000000000' }, base: weth, quote: usdc }],
}

// chainId is taken from path.base.chainId — no options argument.
const store = feed.watch(pricePathSource(path))

const unsubscribe = store.subscribe((event) => {
  if (event.type === 'tick') {
    // value.price is an sdk-core Price; value.priceFloat is the same number for charts.
    console.log('WETH price:', event.emission.value.price.toSignificant(6), 'USDC', '@', event.emission.identity.blockNumber)
  }
})

// getSnapshot() returns a referentially-stable object (useSyncExternalStore-compatible):
// current value, rolling tick buffer, delivered logs, staleness, last tick identity, last error.
const { current, buffer, logs, stale, lastError } = store.getSnapshot()

// later:
unsubscribe()
```

### Feed lifecycle: `{ watch, unwatch, stop }`

- `watch(source)` — register a source and get its store (same `key` ⇒ same shared store).
- `unwatch(key)` — remove an entry you own: its store stops updating and its calls drop out of the
  next tick's batch. Intended for keys you created.
- `stop()` — tear the whole feed down (a stopped feed rejects further `watch`).

### The double-feed footgun

Two `createBlockFeed` calls for the same `(client, chainId)` run two independent heartbeats — double
the RPC, duplicate ticks. Prefer a single `createFeedRegistry()` per app and always `getFeed(...)`
through it; it memoizes one feed per `(client reference, resolved chainId)`. Call `registry.stopAll()`
on teardown.

### Transports

The engine adapts to the transport automatically:

- **HTTP** (`http()`) — polls on a per-chain cadence (see [Configuration](#configuration)). The tick
  multicall *is* the block check, so there is no separate "is there a new block" call.
- **WebSocket** (`webSocket()`) — uses `newHeads` purely as a *trigger* for the same atomic read, for
  sub-second latency. No polling.

> **Transport retries stack inside a tick.** Each tick attempt reads through your client, so a retry
> policy on its transport (viem's `http`/`fallback` retry by default) runs *before* the engine's own
> backoff/stale machine ever sees a failure. Tune the transport's `retryCount` if you want backoff to
> react promptly.

### Tab visibility (browser)

The core references no `document`/`window`. Gate subscriptions on visibility yourself — because the
heartbeat is refcounted, dropping the last subscriber stops it:

```ts
let unsub: (() => void) | undefined
const sync = (): void => {
  const visible = document.visibilityState === 'visible'
  if (visible && !unsub) unsub = store.subscribe((e) => { /* handle event */ void e })
  else if (!visible && unsub) { unsub(); unsub = undefined } // last unsubscribe stops the heartbeat
}
document.addEventListener('visibilitychange', sync)
sync()
```

On regain, the always-on catch-up window (bounded by `maxCatchupBlocks`, default 20) recovers recent
logs; a stall longer than the bound surfaces a `gap` event instead of a silent hole.

## Discovery — router-lite

`@uniswap/blockfeed-sdk/discovery` finds a `PricePath` on-chain when no backend can supply one (cold
starts, brand-new launches). It **enumerates** candidate pools (v2/v3 factory lookups; v4 via a
PoolManager `Initialize` log scan that finds *every* v4 pool containing the token — any fee, any tick
spacing, hooked or not), **probe-quotes** each in both directions at a fixed notional through the
deployed QuoterV2 / V4Quoter, and **selects** by two-way executable quality — never spot price or raw
in-range liquidity, both of which are cheap to fake.

```ts
import { discoverPricePath, isNoPathFound } from '@uniswap/blockfeed-sdk/discovery'

// chainId is derived from base.chainId (quote must agree). Tuning knobs are nested under `options`.
const result = await discoverPricePath(client, {
  base: weth,
  quote: usdc,
  options: { maxHops: 2, maxProbeCandidatesPerPair: 12 },
})

if (isNoPathFound(result)) {
  console.warn(result.reason) // no pool produced a positive two-way executable score
} else {
  const store = feed.watch(pricePathSource(result))
  // …subscribe
}
```

`base`/`quote` also accept a plain `CurrencyInput` (`{ chainId, address, decimals, symbol? }`, where
`address: 'native'` means the native currency) — see [`toCurrency`](#currency--price-helpers).

Knobs under `options`: `intermediaries` (2-hop bridge assets, default the chain's WETH), `maxHops`
(default 2), `probeNotional` (default `10^quote.decimals * 1000`), `hookAllowlist` (default `[]` —
hookless only), `maxProbeCandidatesPerPair` (default 12), and `fromBlockOverride` (start block for the
v4 `Initialize` scan — see the RPC caveat below).

## Launch sources (CCA / quick-launch)

The Uniswap Liquidity Launcher auction sources ship **in this package** (`launchAssetSource`,
`quickLaunchAssetSource`, `ccaBidsSource`, `decodeBidSubmitted`); they read their descriptors and
decoders from `@uniswap/liquidity-launcher-sdk`.

`quickLaunchAssetSource` is the one-call path for the canonical native-ETH quick-launch shape: it
resolves the TickDataLens from the auction factory and builds the graduated `(native, token)` pool key
for you. The result is **one continuous, phase-tagged stream across the auction → graduated-pool
transition, with no gap tick at graduation** (the deterministic v4 pool is read speculatively every
tick until it exists). The lifecycle `phase` (`'auction' | 'graduated' | 'failed'`) lives **inside the
emission value**, not as a separate event.

```ts
import { createFeedRegistry, quickLaunchAssetSource, ccaBidsSource, decodeBidSubmitted } from '@uniswap/blockfeed-sdk'

const feed = createFeedRegistry().getFeed(client, { chainId: 8453 })

const launch = feed.watch(
  quickLaunchAssetSource({
    chainId: 8453,
    auction: '0x0000000000000000000000000000000000000000',       // auction (initializer) address
    token: '0x0000000000000000000000000000000000000000',         // launched token
    auctionFactory: '0x0000000000000000000000000000000000000000', // resolves the TickDataLens
    endBlock: 0n,                                                  // auction end, in the auction's block domain
  })
)
launch.subscribe((e) => {
  if (e.type === 'tick') {
    const v = e.emission.value
    console.log('phase:', v.phase, 'priceX96:', v.priceX96) // phase is part of the value
  }
})

// The append-only bid ticker: each new bid is a `log` event (decode it); retracted bids are `retraction`.
const bids = feed.watch(ccaBidsSource({ auction: '0x0000000000000000000000000000000000000000' }))
bids.subscribe((e) => {
  if (e.type === 'log') console.log(decodeBidSubmitted(e.log)) // { id, owner, price, amount }
})
```

For non-native raises or bespoke pool keys, the lower-level `launchAssetSource({ chainId, auction,
tickDataLens, poolKey, endBlock })` stays available (it resolves the v4 StateView internally from
`chainId`).

## Currency & price helpers

- `toCurrency({ chainId, address, decimals, symbol? })` builds an sdk-core `Currency` from a plain
  shape (`address: 'native'` → the native currency, else an ERC-20 `Token`). `discoverPricePath`
  accepts these directly.
- `q96ToPrice(priceX96, base, quote)` converts a Q96 raw-currency-per-raw-token price (the launch
  vocabulary) into an sdk-core `Price` (the `pricePath`/discovery vocabulary).
- `PricePathValue.priceFloat` is the composed price as a plain number, computed once per emission.
  Handy for charts — but note that **ticks are suppressed when the value is unchanged**, so points are
  unevenly spaced in time; plot against `emission.identity.blockNumber`/`timestamp`, never assume a
  fixed interval.

## Event model

Every emission is tagged with `(blockNumber, parentBlockHash, timestamp)`. A store's `subscribe`
listener receives `FeedEvent<T>` — six variants:

| Event | Fields | Meaning |
|---|---|---|
| `tick` | `emission` | New derived value at block N. **Suppressed** when the derived value is unchanged (per-source `valueEquals`, default `Object.is`), so fast L2 blocks don't spam subscribers. |
| `log` | `log` | New matched log (e.g. a bid), deduped by `(txHash, logIndex)`. Never suppressed. Also buffered in `snapshot.logs`. |
| `retraction` | `log` | A previously-emitted log vanished in a reorg. Carries the **full** `DecodedFeedLog`; removes the matching entry from `snapshot.logs`. |
| `gap` | `fromBlock`, `toBlock` | The feed knows it missed blocks it cannot cheaply recover (e.g. a stall beyond the catch-up bound). Charts must not draw a false flat line across it. |
| `stale` | `stale` | Heartbeat health flipped. Set after 3 consecutive RPC failures; cleared on the next success. Dim the UI rather than lie. |
| `error` | `scope`, `error`, `identity?` | Diagnostic (fan-out only; never enters the tick buffer). `scope: 'tick'` is a shared read/`getLogs` failure sent to every store; `scope: 'source'` is a throwing `derive`, sent only to that store. Mirrored in `snapshot.lastError`, cleared on that store's next tick. |

The lifecycle phase of the launch sources is **not** an event — it is a field on the emission value
(`value.phase`), so a phase transition arrives as an ordinary `tick`.

State never lags the head — there is no confirmation depth. A reorged-away value self-heals on the next
tick (~one block of exposure); reorged logs within the trailing window (default K=3 blocks) surface as
`retraction` events. Reorgs deeper than K escape retraction; indexer reconciliation is the backstop.

## Configuration

Pass overrides to `createBlockFeed({ client, chainId, … })` (or `registry.getFeed(client, { … })`);
defaults live in [`src/constants.ts`](./src/constants.ts).

| Option | Default | Notes |
|---|---|---|
| `chainId` | `client.chain?.id` | Required only when the client carries no `chain.id` (throws synchronously if neither). |
| `pollIntervalMs` | `{ 1: 3000, 8453: 1000, 130: 500 }[chainId] ?? 1000` | HTTP poll cadence, keyed to block time. Moot on WebSocket. |
| `trailingLogWindow` | `3` | Blocks (K) of already-delivered logs re-scanned each tick to reconcile reorgs. |
| `maxCatchupBlocks` | `20` | Upper bound on the always-on catch-up look-back after a stall. A longer stall recovers at most this many recent blocks; the rest surfaces as a `gap`. |
| `bufferSize` | `120` | Per-store rolling tick/log buffer length (a chart mounting mid-session renders a live tail immediately). |
| `scheduler` | `realScheduler` | Injectable time source for tests. |

Backoff and staleness (heartbeat-wide, not per-call): backoff starts at 1s and doubles to a 30s
ceiling; feeds mark stale after 3 consecutive failures. The multicall chunk size is an internal
constant.

## Supported chains (v1)

`getChainAddresses(chainId)` returns the protocol addresses the sources read from, throwing for an
unregistered chain. `CHAIN_ADDRESSES` covers **Ethereum mainnet (1), Base (8453), and Unichain (130)**
in v1.

## Caveats

- **PricePath legs are trusted input.** The data plane consumes explicit paths and does **no on-chain
  token verification** — it prices exactly the pools it is handed. Correctness is the control plane's
  responsibility (a backend that knows the canonical pools, or discovery's executable ranking). A path
  built from an attacker-chosen pool will be priced faithfully and wrongly.
- **A bad source never poisons the others.** Launch and `pricePath` reads are failure-tolerant, so a
  reverting/unpriceable pool yields no emission for that source instead of failing the shared tick.
- **Discovery's v4 `Initialize` scan needs a capable RPC provider.** The full-history log scan from the
  PoolManager deploy block is Alchemy-class work; weak public RPCs time out or cap the range. Prefer
  backend-supplied paths, or pass `fromBlockOverride` to bound the scan, where possible. On providers
  with hard `eth_getLogs` range caps, `options.bestEffortV4: true` skips v4 enumeration (selecting from
  v2/v3 candidates only — it can miss a better v4 pool) instead of failing the whole discovery; the SDK
  also fast-fails unreachable capped scans rather than burning the full bisection budget.
- **Prices are asset-denominated, never "USD".** A USDC-quoted price is a price *in USDC*; fiat display
  mapping is the UI's concern. USDC is not special-cased — EURC, WETH, or any currency is the same code
  path.
- **v1 chain set:** mainnet / Base / Unichain (`CHAIN_ADDRESSES`).

## Integration tests

A private Anvil-fork suite lives in [`integration/`](./integration) — fork tests including a real
launch → bids → graduation end-to-end. These are **local developer tools, never run in CI**: they are
**opt-in** and execute only when `BLOCKFEED_FORK=1` is set. They also require a locally installed
[foundry](https://getfoundry.sh) (`anvil`) and skip cleanly when it is absent or when `BLOCKFEED_FORK`
is unset.

```bash
cd integration
bun install
bun test                                        # SKIPS every fork suite (opt-in gate not set)
BLOCKFEED_FORK=1 bun test                        # run the fork suites against a Base fork of https://mainnet.base.org
BLOCKFEED_FORK=1 BLOCKFEED_FORK_RPC_BASE=https://… bun test   # override the upstream Base RPC (Alchemy-class recommended)
BLOCKFEED_SKIP_FORK=1 bun test                   # force-skip even when opted in (back-compat kill switch)
```
