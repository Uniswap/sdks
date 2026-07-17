# Liquidity Launcher SDK

⚒️ A framework-agnostic toolkit for launching tokens and auctions through the Uniswap **Liquidity
Launcher** stack — `LiquidityLauncher` + `LBPStrategy` + `ContinuousClearingAuction` (CCA) +
`TokenSplitter` + the uERC20 / USUPERC20 token factories.

It gives you everything needed to **read, predict, configure, and build** launch transactions:
per-chain addresses, contract ABIs, on-chain struct types, calldata encoders, deterministic-address
prediction, the auction-configuration math, on-chain read helpers, and a pure transaction assembler.

The SDK is built on [viem](https://viem.sh) and ships no transport of its own: reads are exposed as
plain **contract descriptors** (`{ address, abi, functionName, args }`) that drop straight into
wagmi, viem, or any rpc client, plus optional viem helpers for quick server-side use.

## Installation

```bash
bun add @uniswap/liquidity-launcher-sdk viem
# or: npm i @uniswap/liquidity-launcher-sdk viem
```

## Concepts

A launch is a single `LiquidityLauncher.multicall([...])` that (1) acquires the token — `depositToken`
for an existing token, or `createToken` for a new one — then (2) `distributeToken`s it into the
`LBPStrategy`, which runs a continuous-clearing auction and, on graduation, migrates the proceeds into
a Uniswap v4 pool.

Each launch reserves the destination v4 **pool id** — `keccak256(abi.encode(currency0, currency1,
fee, tickSpacing, hook))` — in `LBPStrategy.registeredPoolIds` until migration. A second launch that
resolves to the same pool key reverts with `PoolIdOccupied`. Use [`getFeeTierAvailability`](#check-which-fee-tiers-are-available)
to surface this before a user commits.

## Quickstarts

### Check which fee tiers are available

A fee tier is unusable if the v4 pool is already initialized **or** its pool id is reserved by a live
(not-yet-migrated) auction. `getFeeTierAvailability` checks both:

```ts
import { createPublicClient, http } from 'viem'
import { unichain } from 'viem/chains'
import { getFeeTierAvailability } from '@uniswap/liquidity-launcher-sdk'

const client = createPublicClient({ chain: unichain, transport: http() })

const tiers = await getFeeTierAvailability(client, {
  chainId: 130,
  currency: '0x0000000000000000000000000000000000000000', // native ETH
  token: '0x15d0e0c55a3e7ee67152ad7e89acf164253ff68d',
  feeTiers: [
    { feeAmount: 10000, tickSpacing: 200 },
    { feeAmount: 3000, tickSpacing: 60 },
  ],
})
// → [{ feeAmount: 10000, ..., available: false, reason: 'pool-reserved', reservedBy: '0x7ded…' }, …]
```

Prefer descriptors when you want to batch reads yourself (e.g. wagmi `useReadContracts`):

```ts
import { computeLbpPoolId, getLauncherAddresses, registeredPoolIdCall } from '@uniswap/liquidity-launcher-sdk'

const { lbpStrategy } = getLauncherAddresses(130)!
const poolId = computeLbpPoolId(currency, token, 10000, 200, '0x0000000000000000000000000000000000000000')
const call = registeredPoolIdCall({ lbpStrategy, poolId }) // → { address, abi, functionName, args }
```

### Predict the token and auction addresses

```ts
import { getLauncherAddresses, selectTokenFactory, predictTokenAddress } from '@uniswap/liquidity-launcher-sdk'

const addresses = getLauncherAddresses(130)!
const factory = selectTokenFactory(addresses)! // { factory, kind: 'uerc20' | 'usuperc20' }

const token = await predictTokenAddress(client, {
  factory: factory.factory,
  kind: factory.kind,
  launcherAddress: addresses.liquidityLauncher,
  wallet: '0xF570…', // the creator
  name: 'My Token',
  symbol: 'MINE',
  decimals: 18,
  homeChainId: 130n,
})
```

### Derive auction configuration

Pure helpers convert user-friendly inputs into contract-native values:

```ts
import {
  deriveBlocks,
  floorPriceToX96,
  deriveAuctionPricing,
  requiredCurrencyRaised,
  feeToTickSpacing,
  buildPositionDefinitions,
  buildLpAllocationSchedule,
  deriveConvexAuctionSteps,
} from '@uniswap/liquidity-launcher-sdk'

const { startBlock, endBlock, claimBlock, migrationBlock } = deriveBlocks({
  startTimeUnix, endTimeUnix, currentBlock, nowUnix, blockTimeSeconds: 1,
})
const { floorPriceX96, tickSpacing } = deriveAuctionPricing(floorPriceToX96('0.0001', 18, 18))
const steps = deriveConvexAuctionSteps(startBlock, endBlock)
const positions = buildPositionDefinitions('FULL_RANGE', [], feeToTickSpacing(10000))
const lp = buildLpAllocationSchedule({ kind: 'single', percent: 50 })
```

### Build the launch transaction

Encode the structs, then assemble. Product-specific fields (an X-verification `extraData`, a KYC
`validationHook`) are yours to compute and pass in — the SDK only handles mechanics.

```ts
import {
  encodeAuctionParams, encodeAuctionSteps, encodeConfigData, encodePositionDefinitions,
  encodeLpAllocationSchedule, buildLaunchTransactions, getLauncherAddresses,
} from '@uniswap/liquidity-launcher-sdk'

const addresses = getLauncherAddresses(130)!
const auctionParams = encodeAuctionParams({ /* AuctionParameters */ })
const configData = encodeConfigData(
  { /* MigratorParameters, with positionDefinitions/lpAllocationSchedule pre-encoded */ },
  auctionParams,
)

const txs = buildLaunchTransactions({
  liquidityLauncher: addresses.liquidityLauncher,
  token,
  salt,
  acquire: { kind: 'deposit', amount: depositAmount }, // existing token via Permit2
  distributions: [{ strategy: addresses.lbpStrategy, amount: depositAmount, configData }],
})
// → [{ to, data, value }] — add `from` / `chainId` / gas and submit.
```

### Lock the migrated liquidity (timelock)

After an auction migrates, its LP position can be sent to a per-launch **lock recipient** that holds
the liquidity until a timelock expires. `buildLockRecipient` computes the recipient's deterministic
CREATE2 address (bake it into `MigratorParameters.positionRecipient`) and the calldata to deploy it:

```ts
import { buildLockRecipient, getLauncherAddresses, computeLauncherSalt } from '@uniswap/liquidity-launcher-sdk'

const { positionManager } = getLauncherAddresses(130)!
const { predictedAddress, deployData } = buildLockRecipient({
  mode: 'timelock', // or 'feesForwarder' | 'buybackBurn'
  positionManager: positionManager!,
  operator: poolOwner,
  timelockBlockNumber: unlockBlock,
  lockSalt: computeLauncherSalt(wallet, userSalt),
})
// predictedAddress → MigratorParameters.positionRecipient
// deployData → send to the canonical CREATE2 deployer before migration
```

## Live data (blockfeed) sources

A quick-launch asset lives two lives — a live continuous-clearing auction, then a graduated Uniswap v4
pool. This SDK exports **structural `Source` factories** that stream both over
[`@uniswap/blockfeed-sdk`](../blockfeed-sdk)'s block-latency engine. They live here, next to the auction
semantics they depend on (`deriveAuctionOutcome`, deterministic pool-id derivation, the `TickDataLens`
registry), but there is **zero runtime coupling**: blockfeed is a `devDependency` only, a source is a
plain object, and TypeScript's structural typing makes these factories assignable to the engine's
`Source` with nothing imported at runtime (a types-only drift guard, run in CI via `g:typecheck`, keeps
the shapes compatible).

- **`launchAssetSource`** — one continuous, phase-tagged lifecycle stream (`auction` →
  `graduated`/`failed`) with **no gap tick at graduation**. From late auction onward it speculatively
  reads the deterministic graduated v4 pool's `StateView.getSlot0` every tick; on the tick graduation
  lands, the pool read succeeds in the *same* multicall, so the `phase` event and the first pool-price
  tick carry the same block number — no discovery, no indexer wait, no one-block price hole.
- **`ccaBidsSource`** — the append-only `BidSubmitted` log ticker (monotonic cumulative count; a bid
  that un-happens in a reorg surfaces as a blockfeed `retraction` event).
- **`ccaAuctionSource`** — auction-only state (clearing price, currency raised, remaining supply,
  per-tick bid-distribution fill ratios) without the graduation lifecycle.

The underlying reads are also usable standalone: `clearingPriceCall`/`getClearingPrice` (Q96
raw-currency-per-raw-token, from the auction's `checkpoint()` — the same live source the backend uses),
`tickDataCall`/`getTickData` (the lens's initialized price ticks — the live bid-distribution data), and
the pure `deriveTickFillRatios` helper.

```ts
import { createBlockFeed } from '@uniswap/blockfeed-sdk'
import { launchAssetSource, ccaBidsSource, getTickDataLensForFactory } from '@uniswap/liquidity-launcher-sdk'

const feed = createBlockFeed({ client, chainId: 8453 })
const launch = feed.watch(
  launchAssetSource({ chainId: 8453, auction, tickDataLens, poolKey, stateView, endBlock })
)
launch.subscribe((e) => {
  if (e.type === 'phase') console.log(e.from, '→', e.to) // auction → graduated
  if (e.type === 'tick') console.log('priceX96', e.emission.value.priceX96)
})
```

## Supported chains

`getLauncherAddresses(chainId)` returns the deployed stack, or `undefined` if the launcher isn't on
that chain. Currently: Ethereum (1), Unichain (130), Base (8453), Arbitrum One (42161), Sepolia
(11155111), Base Sepolia (84532).

## Error handling

Config-derivation helpers throw [`LauncherSdkError`](./src/errors.ts) with a stable `code`
(`UNSUPPORTED_CHAIN`, `INVALID_FLOOR_PRICE`, `INVALID_AUCTION_WINDOW`, `INVALID_FEE`,
`INVALID_PRICE_RANGE`, `INVALID_LP_ALLOCATION`, `INVALID_EMISSION_SCHEDULE`, `INVALID_AUCTION_STEP`,
`INVALID_TIME`, `INVALID_INPUT`). Switch on `error.code` to map to your own error types.

## API surface

| Module | Exports |
| --- | --- |
| `addresses`, `chains` | `getLauncherAddresses`, `LAUNCHER_ADDRESSES`, `selectTokenFactory`, `SupportedChainId`, `isLaunchSupportedChain`, `AUCTION_FACTORY_DEPLOYMENTS`, `getTickDataLensForFactory`, `TICK_DATA_LENS_BY_FACTORY`, `TICK_DATA_LENS_V1`, `TICK_DATA_LENS_V2` |
| `poolId`, `salts` | `computeLbpPoolId`, `computeGraffiti`, `computeLauncherSalt`, `computeInitializerSalt` |
| `abis`, `types` | contract ABIs and on-chain struct types |
| `encode` | `encodeCreateToken`, `encodeDepositToken`, `encodeDistributeToken`, `encodeMulticall`, `encodeConfigData`, `encodeAuctionParams`, `encodeAuctionSteps`, `encodeTokenData`, … |
| `config/*` | `deriveBlocks`, `floorPriceToX96`, `deriveAuctionPricing`, `feeToTickSpacing`, `buildPositionDefinitions`, `buildLpAllocationSchedule`, `deriveConvexAuctionSteps` |
| `reads` | descriptor builders + viem helpers (`registeredPoolIdCall`, `slot0Call`, `predictTokenAddress`, `predictAuctionAddress`, allowance reads, `clearingPriceCall`/`getClearingPrice`, `tickDataCall`/`getTickData`, `deriveTickFillRatios`) |
| `blockfeed` | `launchAssetSource`, `ccaAuctionSource`, `ccaBidsSource` (structural blockfeed `Source` factories) |
| `availability` | `getFeeTierAvailability` |
| `build` | `buildLaunchTransactions`, `buildLaunchMulticall` |
| `lock` | `buildLockRecipient` (timelock / fees-forwarder / buyback-burn liquidity locks) |
| `format` | `formatFeePercent`, `formatTokenAmount` |
