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
// Pass the raised currency and launched token so custom ranges land on the correct price band
// (ordering follows the on-chain `currency < token`; native ETH is the zero address).
const positions = buildPositionDefinitions('FULL_RANGE', [], feeToTickSpacing(10000), currency, tokenAddress)
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
| `reads` | descriptor builders + viem helpers (`registeredPoolIdCall`, `slot0Call`, `predictTokenAddress`, `predictAuctionAddress`, allowance reads) |
| `availability` | `getFeeTierAvailability` |
| `build` | `buildLaunchTransactions`, `buildLaunchMulticall` |
| `lock` | `buildLockRecipient` (timelock / fees-forwarder / buyback-burn liquidity locks) |
| `format` | `formatFeePercent`, `formatTokenAmount` |

## Maintaining the lock-recipient bytecode

`buildLockRecipient` predicts CREATE2 addresses from three **creation bytecodes** committed in
[`src/lockRecipientBytecode.ts`](./src/lockRecipientBytecode.ts) — `TIMELOCK`
(`TimelockedPositionRecipient`), `FEES_FORWARDER` (`PositionFeesForwarder`), and `BUYBACK_BURN`
(`BuybackAndBurnPositionRecipient`). These are compiled artifacts lifted from the
[liquidity-launcher](https://github.com/Uniswap/liquidity-launcher) contracts and pinned to a
specific commit; the launcher publishes no consumable npm/artifact bundle, so extraction is the only
path today.

### Why they can silently go stale

The bytecode is pinned to an upstream **commit**, but nothing here re-derives it — so when the
launcher contracts (or any base contract they inherit, e.g. `BlockNumberish`) change and the pin is
not refreshed, the SDK keeps predicting addresses for the *old* code. That is exactly how the
Robinhood-chain timelock became a no-op: the launcher advanced, `BlockNumberish` behaved differently,
and the stale bytecode still predicted (and deployed) the previous recipient. The keccak assertions in
[`src/lock.test.ts`](./src/lock.test.ts) do **not** catch this — they hash the bytes committed
alongside them, so they only guard against an accidental local edit, not drift from upstream.

### When to regenerate

Whenever the liquidity-launcher periphery recipients **or their dependencies** (including inherited
base contracts such as `BlockNumberish`) change, and you are bumping the pinned commit. Treat a bump
as a deliberate, reviewed step.

### How to regenerate

Run the deterministic script against a local launcher checkout — it rewrites
`src/lockRecipientBytecode.ts` (header + the three constants) and refreshes the keccak pins in
`src/lock.test.ts`, so nothing is hand-copied:

```bash
LAUNCHER_REPO=/path/to/liquidity-launcher \
LAUNCHER_COMMIT=<commit-sha> \
bun run regenerate:lock-bytecode
```

It checks out the commit, initializes submodules, runs `forge build` for the three recipient sources,
reads each `out/<Contract>.sol/<Contract>.json` `bytecode.object`, and recomputes the pins. It fails
loudly (and writes nothing) if `forge` is missing, the build fails, or an artifact is absent.
Regeneration requires [Foundry](https://getfoundry.sh) plus the launcher's submodules; the
OpenZeppelin submodule uses an SSH remote, so a fresh clone needs SSH access (or an
`insteadOf` https rewrite). Escape-hatch env vars cover non-standard toolchains:

| Env var | Purpose |
| --- | --- |
| `FORGE_BIN` | Path to a `forge` binary (default: `forge` on `PATH`). |
| `SOLC_PATH` | Path to a `solc` binary, passed to `forge build --use`. |
| `SKIP_SUBMODULES` | Skip `git submodule update` when submodules are already fetched. |
| `SKIP_CHECKOUT` | Skip `git checkout` when the repo is already at the target commit. |

Running it against the already-pinned commit produces zero diff — a bump only changes the output when
the upstream bytecode actually changed.

### How it is enforced in CI

The regeneration script is only half the story — nothing stops a contributor from editing the pin or
the bytecode and forgetting to regenerate. Two GitHub Actions workflows close that gap by running the
script in **`--check` mode** (`bun run check:lock-bytecode`), which rebuilds the three recipients and
diffs the result against the committed `lockRecipientBytecode.ts` constants and the `lock.test.ts`
keccak pins **without writing anything** — exiting nonzero on any difference.

- **Consistency gate — `.github/workflows/liquidity-launcher-bytecode-check.yml`** (required PR check).
  Runs on every PR that touches `sdks/liquidity-launcher-sdk/**`. It clones liquidity-launcher, builds
  it at the commit recorded in the `lockRecipientBytecode.ts` header, and fails the PR if the committed
  bytecode does not match that build. This is what catches "edited the pin / hand-edited the hex and
  forgot to regenerate." Run the same check locally with:

  ```bash
  LAUNCHER_REPO=/path/to/liquidity-launcher bun run check:lock-bytecode
  ```

  (The pinned commit is read from the file header, so no `LAUNCHER_COMMIT` is needed for a consistency
  check.)

- **Staleness alarm — `.github/workflows/liquidity-launcher-bytecode-staleness.yml`** (weekly cron).
  The consistency gate only re-verifies the bytes *at the pin*, so it stays green even when upstream has
  moved on and the pin is stale — which is exactly what produced the Robinhood timelock no-op bug. This
  scheduled job rebuilds the recipients from **upstream main HEAD** (not the pinned commit) and compares
  to the committed bytecode. **A red "Lock Bytecode Staleness Alarm" run means upstream has advanced
  past the pin: a maintainer must review the launcher changes and regenerate + re-pin.** It does not
  auto-open a PR — the red run is the signal. It compares against main HEAD (rather than the latest
  release tag) on purpose: the Robinhood drift landed on main *between* releases, so a tag-based check
  would have missed it; the workflow header documents this choice and how to switch to a release tag.

Both jobs pin solc to the version the committed bytecode was built with (`0.8.35`), so the check
verifies genuine contract drift rather than tripping on an unrelated upstream solc release. They depend
on the CI runner being able to fetch the launcher and its public submodules over https (the workflows
rewrite the launcher's `git@github.com:` SSH submodule URLs to https before init). The fully
dependency-free alternative — the launcher publishing versioned bytecode/ABI artifacts, letting this
SDK adopt the `v2-sdk`/`v3-sdk` recompute-from-published-artifact pattern — is tracked as a follow-up.
