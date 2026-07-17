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

Create one feed per `(chainId, client)`, `watch` a source, and `subscribe` to its store. The heartbeat
starts on the first subscriber and stops on the last unsubscribe (refcounted).

```ts
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { Token } from '@uniswap/sdk-core'
import { createBlockFeed, pricePathSource, type PricePath } from '@uniswap/blockfeed-sdk'

const client = createPublicClient({ chain: base, transport: http() })
const feed = createBlockFeed({ client, chainId: 8453 })

const usdc = new Token(8453, '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 6, 'USDC')
const weth = new Token(8453, '0x4200000000000000000000000000000000000006', 18, 'WETH')

// A PricePath is the pricing contract: base priced in quote, over ordered base→quote legs.
const path: PricePath = {
  base: weth,
  quote: usdc,
  // A single v3 leg here for brevity; supply the pool address from your backend, or use Discovery
  // (below) to find it. Legs are also v2 (`{ protocol: 'v2', pair }`) or v4 (`{ protocol: 'v4', poolKey }`).
  legs: [{ pool: { protocol: 'v3', pool: '0x…' }, base: weth, quote: usdc }],
}

const store = feed.watch(pricePathSource(path, { chainId: 8453 }))

const unsubscribe = store.subscribe((event) => {
  if (event.type === 'tick') {
    // event.emission.value.price is an sdk-core Price<Currency, Currency>
    console.log('WETH price:', event.emission.value.price.toSignificant(6), 'USDC', '@ block', event.emission.identity.blockNumber)
  }
})

// getSnapshot() returns a referentially-stable object (useSyncExternalStore-compatible): current value,
// rolling tick buffer, phase, and staleness.
const { current, buffer, stale } = store.getSnapshot()

// later:
unsubscribe()
```

### Transports

The engine adapts to the transport automatically:

- **HTTP** (`http()`) — polls on a per-chain cadence (see [Configuration](#configuration)). The tick
  multicall *is* the block check, so there is no separate "is there a new block" call.
- **WebSocket** (`webSocket()`) — uses `newHeads` purely as a *trigger* for the same atomic read, for
  sub-second latency. No polling.

```ts
import { webSocket } from 'viem'
const wsClient = createPublicClient({ chain: base, transport: webSocket('wss://…') })
const wsFeed = createBlockFeed({ client: wsClient, chainId: 8453 })
```

### Tab visibility (browser)

The core references no `document`/`window`. Tab-visibility handling ships as an optional plugin the app
installs, with the DOM injected as a structural type (never read from a global):

```ts
import { attachVisibilityPlugin } from '@uniswap/blockfeed-sdk'

const detach = attachVisibilityPlugin(feed, { target: document })
// Pauses the heartbeat while the tab is hidden; on regain, widens the next trailing log window to
// cover the missed span (bounded by maxCatchupBlocks, default 20). Beyond the bound → a `gap` event.
// detach() removes the listener.
```

## Discovery — router-lite

`@uniswap/blockfeed-sdk/discovery` finds a `PricePath` on-chain when no backend can supply one (cold
starts, brand-new launches). It **enumerates** candidate pools (v2/v3 factory lookups; v4 via a
PoolManager `Initialize` log scan that finds *every* v4 pool containing the token — any fee, any tick
spacing, hooked or not), **probe-quotes** each in both directions at a fixed notional through the
deployed QuoterV2 / V4Quoter, and **selects** by two-way executable quality — never spot price or raw
in-range liquidity, both of which are cheap to fake.

```ts
import { discoverPricePath } from '@uniswap/blockfeed-sdk/discovery'

// Tuning knobs are passed nested under `options` (all optional).
const result = await discoverPricePath(client, {
  chainId: 8453,
  base: weth,
  quote: usdc,
  options: { maxHops: 2, maxProbeCandidatesPerPair: 12 },
})

// `'kind' in result` alone narrows to NoPathFound on the true branch and to PricePath on the false
// branch. Do NOT write `'kind' in result && result.kind === 'no-path'`: a false compound condition
// does not narrow the `else` branch to PricePath, so `pricePathSource(result)` would not typecheck.
if ('kind' in result) {
  // NoPathFound — no pool produced a positive two-way executable score.
  console.warn(result.reason)
} else {
  const store = feed.watch(pricePathSource(result, { chainId: 8453 }))
  // …subscribe
}
```

Knobs under `options`: `intermediaries` (2-hop bridge assets, default the chain's WETH), `maxHops`
(default 2), `probeNotional` (default `10^quote.decimals * 1000`), `hookAllowlist` (default `[]` —
hookless only), `maxProbeCandidatesPerPair` (default 12), and `fromBlockOverride` (start block for the
v4 `Initialize` scan — see the RPC caveat below).

## CCA / quick-launch (live launch data)

Continuous Clearing Auction sources live in `@uniswap/liquidity-launcher-sdk` (next to the auction
semantics they depend on), but they are plain structural `Source` objects — `feed.watch(...)` consumes
them with **zero runtime coupling** (blockfeed is not even a runtime dependency of the launcher SDK).

```ts
import { createBlockFeed } from '@uniswap/blockfeed-sdk'
import { launchAssetSource, ccaBidsSource, getTickDataLensForFactory } from '@uniswap/liquidity-launcher-sdk'

const feed = createBlockFeed({ client, chainId: 8453 })

// getTickDataLensForFactory returns `Address | undefined` (undefined = a factory it doesn't recognize);
// guard it before use rather than passing the union into the source.
const tickDataLens = getTickDataLensForFactory(factory)
if (!tickDataLens) throw new Error('unknown CCA factory — no TickDataLens mapping')

// One continuous, phase-tagged stream across the auction → graduated-pool transition, with NO gap
// tick at graduation (the deterministic v4 pool is read speculatively every tick until it exists).
const launch = feed.watch(
  launchAssetSource({
    chainId: 8453,
    auction: auctionAddress,
    tickDataLens,          // guarded Address (see above)
    poolKey,               // deterministic graduated-pool key from launch params
    stateView,             // v4 StateView address
    endBlock,              // auction end, in the auction's own block domain
  })
)
launch.subscribe((e) => {
  if (e.type === 'phase') console.log('lifecycle:', e.from, '→', e.to) // e.g. auction → graduated
  if (e.type === 'tick') console.log('priceX96:', e.emission.value.priceX96)
})

// The append-only bid ticker (cumulative count; retracted bids surface as `retraction` events).
const bids = feed.watch(ccaBidsSource({ auction: auctionAddress }))
```

## Event model

Every emission is tagged with `(blockNumber, parentBlockHash, timestamp)`. A store's `subscribe`
listener receives `FeedEvent<T>`:

| Event | Fields | Meaning |
|---|---|---|
| `tick` | `emission` | New derived value at block N. **Suppressed** when the derived value is unchanged (per-source `valueEquals`, default `Object.is`), so fast L2 blocks don't spam subscribers. |
| `log` | `log` | New matched log (e.g. a bid), deduped by `(txHash, logIndex)`. Never suppressed. |
| `retraction` | `ref` | A previously-emitted log vanished in a reorg. Carries the original `(txHash, logIndex, blockNumber)`. |
| `phase` | `from`, `to`, `identity` | Source lifecycle transition (e.g. `auction → graduated`). Distinct from ticks so charts draw markers instead of connecting discontinuous lines. |
| `gap` | `fromBlock`, `toBlock` | The feed knows it missed blocks it cannot cheaply recover (e.g. a long tab-throttle beyond the catch-up bound). Charts must not draw a false flat line across it. |
| `stale` | `stale` | Heartbeat health flipped. Set after `STALE_AFTER_CONSECUTIVE_FAILURES` (3) consecutive RPC failures; cleared on the next success. Dim the UI rather than lie. |

State never lags the head — there is no confirmation depth. A reorged-away value self-heals on the next
tick (~one block of exposure); reorged logs within the trailing window (default K=3 blocks) surface as
`retraction` events. Reorgs deeper than K escape retraction; indexer reconciliation is the backstop.

## Configuration

Pass overrides to `createBlockFeed({ client, chainId, … })`; defaults live in
[`src/constants.ts`](./src/constants.ts).

| Option | Default | Notes |
|---|---|---|
| `pollIntervalMs` | `{ 1: 3000, 8453: 1000, 130: 500 }[chainId] ?? 1000` | HTTP poll cadence, keyed to block time. Moot on WebSocket. |
| `trailingLogWindow` | `3` | Blocks (K) of already-delivered logs re-scanned each tick to reconcile reorgs. |
| `bufferSize` | `120` | Per-store rolling emission buffer length (a chart mounting mid-session renders a live tail immediately). |
| `maxCallsPerChunk` | `200` | Max calls per multicall chunk before splitting; chunks share tick 1's identity. |
| `scheduler` | `realScheduler` | Injectable time source for tests. |

Backoff and staleness (heartbeat-wide, not per-call): `BACKOFF_BASE_MS` (500), `BACKOFF_MAX_MS`
(30000), `STALE_AFTER_CONSECUTIVE_FAILURES` (3).

## Supported chains (v1)

`getChainAddresses(chainId)` returns the protocol addresses the sources read from, throwing for an
unregistered chain. `CHAIN_ADDRESSES` covers **Ethereum mainnet (1), Base (8453), and Unichain (130)**
in v1.

## Caveats

- **PricePath legs are trusted input.** The data plane consumes explicit paths and does **no on-chain
  token verification** — it prices exactly the pools it is handed. Correctness is the control plane's
  responsibility (a backend that knows the canonical pools, or discovery's executable ranking). A path
  built from an attacker-chosen pool will be priced faithfully and wrongly.
- **Discovery's v4 `Initialize` scan needs a capable RPC provider.** The full-history log scan from the
  PoolManager deploy block is Alchemy-class work; weak public RPCs time out or cap the range. Prefer
  backend-supplied paths, or pass `fromBlockOverride` to bound the scan, where possible.
- **Prices are asset-denominated, never "USD".** A USDC-quoted price is a price *in USDC*; fiat display
  mapping is the UI's concern. USDC is not special-cased — EURC, WETH, or any currency is the same code
  path.
- **v1 chain set:** mainnet / Base / Unichain (`CHAIN_ADDRESSES`).

## Integration tests

A private Anvil-fork suite lives in [`integration/`](./integration) — 11 fork tests including a real
launch → bids → graduation end-to-end. These are **local developer tools, never run in CI**: they are
**opt-in** and execute only when `BLOCKFEED_FORK=1` is set (CI installs foundry, so an opt-out gate
would run them on every PR). They also require a locally installed [foundry](https://getfoundry.sh)
(`anvil`) and skip cleanly when it is absent or when `BLOCKFEED_FORK` is unset.

```bash
cd integration
bun install
bun test                                        # SKIPS every fork suite (opt-in gate not set)
BLOCKFEED_FORK=1 bun test                        # run the fork suites against a Base fork of https://mainnet.base.org
BLOCKFEED_FORK=1 BLOCKFEED_FORK_RPC_BASE=https://… bun test   # override the upstream Base RPC (Alchemy-class recommended)
BLOCKFEED_SKIP_FORK=1 bun test                   # force-skip even when opted in (back-compat kill switch)
```

## Design

Full design and architecture: [`docs/blockfeed-sdk-design.md`](../../docs/blockfeed-sdk-design.md).
