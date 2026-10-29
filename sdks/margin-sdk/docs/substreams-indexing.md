# Market Discovery via Substreams: What to Index

## Why

`src/markets.ts`'s `discoverAllMarkets` works but is slow: a full unfiltered run against live
mainnet measures **22 RPC calls + 4 HTTP calls, ~910ms wall-clock** (see the per-venue breakdown
below). Most of that is Aave v4's speculative 256-reserve-id scan and Aave v3's chunked multicalls
over ~63 reserves — work that only needs to happen once per chain reorg depth, not once per
request. A Substreams-backed materialized view turns `discoverAllMarkets` into a single query
against a table that's already current, with zero onchain calls at request time.

Measured today (2026-10-23, mainnet):

| Venue | RPC/HTTP calls | Markets found |
|---|---|---|
| Aave v3 | 5 RPC | 430 |
| Aave v4 | 13 RPC | 85 |
| Compound v3 | 4 RPC | 13 |
| Morpho Blue | 4 HTTP | 355 |

All contract addresses, event signatures, and struct layouts below were pulled from Etherscan's
verified ABIs and cross-checked against live onchain reads — not recalled from training data.
Re-verify before wiring a real indexer, since any of this can change if a protocol upgrades.

## Existing coverage: `substreams.dev/datasets/lending`

Checked directly rather than assumed. Coverage is partial:

| Venue | Chain we need | Covered today? |
|---|---|---|
| Morpho Blue | Ethereum | ✅ `morpho-blue-substreams@v0.2.0` — already emits market creation |
| Compound v3 | Ethereum | ⚠️ `compound-v3-substreams@v0.2.0` — activity only, **no market/config listing** |
| Aave v3 | Ethereum | ❌ package only covers **Polygon** |
| Aave v4 | Ethereum | ❌ not covered at all (protocol is too new) |

So: reuse Morpho's package as-is, extend Compound's, and write Aave v3 + Aave v4 from scratch.

---

## 1. Morpho Blue — reuse as-is

Package: `github.com/streamingfast/substreams-chain-modules/tree/main/lending/morpho-blue-substreams`,
start block 18883124. Contract: `Morpho` singleton `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb`
(immutable, not a proxy).

### Market listing

```solidity
event CreateMarket(bytes32 indexed id, MarketParams marketParams)
// MarketParams { address loanToken; address collateralToken; address oracle; address irm; uint256 lltv }
```

Already emitted as `MarketCreated{ market_id, loan_token, collateral_token, oracle, irm, lltv,
block_num, tx_hash, log_index }` by the existing package's `map_events` module. Maps directly to
`Market{ collateral: collateral_token, debt: loan_token, data: encode(oracle, irm, lltv) }`.

**Gap**: no `listed` flag. Morpho Blue is fully permissionless — `CreateMarket` fires for *every*
market anyone creates, including ones with a broken or zero IRM (verified: `blue-api.morpho.org`
has returned exactly such a market). `listed` is Morpho's own off-chain app curation, not an
onchain signal. Don't surface the raw `CreateMarket` stream to users directly — overlay our own
allowlist (seed it from `GET /v1/blue/markets?listed=true` once, or maintain one manually; either
way it's a separate small table keyed by `market_id`, refreshed on whatever cadence we're
comfortable with, decoupled from the event stream).

---

## 2. Compound v3 — extend the existing package

Package: `compound-v3-substreams@v0.2.0`, start block 15331590. Activity events only today
(`Supply`, `Withdraw`, etc.) — add a new source contract for configuration.

Compound III's asset list is **fixed per Comet deployment** and changes only via a full proxy
upgrade through governance, not incremental per-asset events you can safely replay. Verified by
tracing an actual historical upgrade transaction against our USDC Comet
(`0xc3d688B66703497DAA19211EEdff47f25384cdc3`): its `Upgraded` event's parent tx called
`CometProxyAdmin.deployUpgradeToAndCall(configuratorProxy, cometProxy, ...)`, where
`configuratorProxy = 0x316f9708bB98af7dA9c68C1C3b5e79039cD336E3` (impl `0xcfc1fa...`).

### Market listing

Index on the **Configurator** (`0x316f9708bB98af7dA9c68C1C3b5e79039cD336E3`):

```solidity
event SetConfiguration(address indexed cometProxy, Configuration oldConfiguration, Configuration newConfiguration)
event CometDeployed(address indexed cometProxy, address indexed newComet)
```

`newConfiguration.assetConfigs[]` carries the **complete** collateral list in one event — each
entry is `{ asset, priceFeed, decimals, borrowCollateralFactor, liquidateCollateralFactor,
liquidationFactor, supplyCap }`, the same shape `IComet.getAssetInfo()` returns live.

Don't replay the Configurator's granular `AddAsset`/`UpdateAsset`/`UpdateAssetSupplyCap` events as
if they were live state — those are *proposed* changes staged before a governance vote executes,
and can be superseded or never go live at all. Only treat a `SetConfiguration` as the comet's
current config once a matching `CometDeployed` (same block or shortly after, same `cometProxy`)
confirms the upgrade actually executed. Debt side is always `baseToken` (unchanged by
`SetConfiguration`; read once from the Comet itself, or add `baseToken`/`baseTokenPriceFeed` to the
indexed fields if the Configuration struct carries them — verify against the struct ABI before
assuming).

---

## 3. Aave v3 (Ethereum mainnet) — net new module

Not in any existing package (Polygon package doesn't apply). Index on **PoolConfigurator**
(`0x64b761D848206f447Fe2dd461b0c635Ec39EbB27`, proxy → impl `0xff42ce30054dce7dc7c1282a9a497aa58eabce99`).

### Market listing

```solidity
event ReserveInitialized(address indexed asset, address indexed aToken, address stableDebtToken, address variableDebtToken, address interestRateStrategyAddress)
event CollateralConfigurationChanged(address indexed asset, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus)
event ReserveBorrowing(address indexed asset, bool enabled)
event ReserveActive(address indexed asset, bool active)
event ReserveFrozen(address indexed asset, bool frozen)
event ReservePaused(address indexed asset, bool paused)
```

- `ReserveInitialized` is the one-time "this reserve now exists" event. It also hands you the
  `aToken` address for free — needed below for liquidity tracking, so there's no second lookup.
- Collateral-eligible: latest `liquidationThreshold != 0` from `CollateralConfigurationChanged`
  (Aave's own convention — a reserve with `liquidationThreshold == 0` cannot be used as collateral,
  matching what `getReserveConfigurationData().usageAsCollateralEnabled` derives live).
- Debt-eligible: latest `ReserveBorrowing.enabled`.
- Both gated by latest `ReserveActive.active && !ReserveFrozen.frozen && !ReservePaused.paused`.

These six events are a complete, continuously-updated mirror of everything
`getAllReservesTokens()` + `getReserveConfigurationData()` compute today over RPC.

---

## 4. Aave v4 — net new module (no reference implementation exists yet)

Not covered anywhere. Two source contracts, both proxies:

- **Hub** `0xCca852Bc40e560adC3b1Cc58CA5b55638ce826c9` → impl `0xfe89fd96f270ac3c0f11921af0390dbb1340f704`
- **Spoke (MAIN_SPOKE)** `0x94e7A5dCbE816e498b89aB752661904E2F56c485` → impl `0xabd0e26fe17bde4f1f1187ed8aa80c274e03d8b5`

### Market listing

Hub:
```solidity
event AddAsset(uint256 indexed assetId, address indexed underlying, uint8 decimals)
```

Spoke:
```solidity
event AddReserve(uint256 indexed reserveId, uint256 indexed assetId, address indexed hub)
event UpdateReserveConfig(uint256 indexed reserveId, ReserveConfig config)
// ReserveConfig { uint24 collateralRisk; bool paused; bool frozen; bool borrowable; bool receiveSharesEnabled }
event AddDynamicReserveConfig(uint256 indexed reserveId, uint32 indexed dynamicConfigKey, DynamicReserveConfig config)
event UpdateDynamicReserveConfig(uint256 indexed reserveId, uint32 indexed dynamicConfigKey, DynamicReserveConfig config)
// DynamicReserveConfig { uint16 collateralFactor; uint32 maxLiquidationBonus; uint16 liquidationFee }
```

`AddReserve` only carries `assetId`, not the token address — join on `(hub, assetId)` against the
Hub's `AddAsset` to resolve `reserveId → underlying`. Reserve ids are a dense sequence starting at
0 (verified: an unused id reverts `ReserveNotListed` rather than returning a zeroed struct), so
`AddReserve` is also how an indexer would avoid the client-side "scan 256 ids and see what sticks"
hack `discoverAaveV4Markets` currently does — this is specifically the piece responsible for 10 of
Aave v4's 13 RPC calls today.

- Collateral-eligible: latest `DynamicReserveConfig.collateralFactor > 0` and reserve not
  paused/frozen.
- Debt-eligible: latest `ReserveConfig.borrowable` and reserve not paused/frozen.

---

## 5. Borrow rate and available liquidity

This is a separate concern from market *listing* above — rate and liquidity change on every
supply/borrow/repay/withdraw, not just on config changes, so they need their own (much
higher-volume) event stream per venue.

### Morpho Blue — already fully covered

```solidity
event AccrueInterest(bytes32 indexed id, uint256 prevBorrowRate, uint256 interest, uint256 feeShares)
event Supply(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)
event Withdraw(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets, uint256 shares)
event Borrow(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets, uint256 shares)
event Repay(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)
```

- **Borrow rate**: `AccrueInterest.prevBorrowRate` directly, per market id. Note the name — it's
  the rate that applied *up to* this accrual, so between two accruals the "current" rate an app
  shows is actually the last known value, same staleness characteristic the market already has
  onchain (Morpho only accrues on interaction, not per-block).
- **Available liquidity**: `totalSupplyAssets - totalBorrowAssets`, maintained as a running total
  per market id from the `assets` fields on `Supply`/`Withdraw`/`Borrow`/`Repay` (all four already
  in the existing package's output — no new events needed, just aggregate what's already indexed).

### Aave v3 — already-identified events cover it

```solidity
event ReserveDataUpdated(address indexed reserve, uint256 liquidityRate, uint256 stableBorrowRate, uint256 variableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex)
```

Fires on the Pool (`0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2`) on every Supply/Borrow/Repay/
Withdraw/Liquidation touching that reserve.

- **Borrow rate**: `variableBorrowRate`, RAY-scaled (1e27 = 100%). (`stableBorrowRate` is present
  but Aave v3 stable-rate borrowing is deprecated protocol-wide; ignore it.)
- **Available liquidity**: simplest ground truth is the reserve's `aToken` balance of the
  underlying — `ERC20(reserve).balanceOf(aToken)`. Index `Transfer` events on each reserve's
  underlying token **filtered to transfers where `to` or `from` is that reserve's `aToken`**
  (address already known from `ReserveInitialized` in section 3, so no extra lookup) and maintain
  a running balance. This is a direct balance mirror, not a derived accounting value, so it can't
  drift from onchain truth the way reconstructing it from `Supply`/`Borrow` deltas could.

### Aave v4 — on the Hub, not the Spoke

```solidity
event UpdateAsset(uint256 indexed assetId, uint256 drawnIndex, uint256 drawnRate, uint256 accruedFees)
event Add(uint256 indexed assetId, address indexed spoke, uint256 shares, uint256 amount)      // supply
event Remove(uint256 indexed assetId, address indexed spoke, uint256 shares, uint256 amount)    // withdraw
event Draw(uint256 indexed assetId, address indexed spoke, uint256 drawnShares, uint256 drawnAmount)  // borrow
event Restore(uint256 indexed assetId, address indexed spoke, uint256 drawnShares, tuple premiumDelta, uint256 drawnAmount, uint256 premiumAmount)  // repay
```

Rate and liquidity economics live on the **Hub**, not the Spoke — matching the hub-and-spoke
design where the Hub pools an asset across every Spoke that lists it.

- **Borrow rate**: `UpdateAsset.drawnRate`, per `assetId`. This event's exact semantics aren't
  independently confirmed beyond the verified event signature itself (Aave v4 is new enough that
  there's no established public documentation or reference indexer to cross-check against) —
  confirm the rate's scale/convention (RAY? WAD? per-second vs per-year?) against the Hub source
  or a `cast call` comparison before trusting it in production.
- **Available liquidity**: running total of `Add.amount - Remove.amount` (supplied minus
  withdrawn) minus `Draw.drawnAmount - Restore.drawnAmount` (drawn minus restored), per `assetId`.
  Join to `reserveId` the same way as market listing (via `AddReserve.assetId` → `AddAsset`).

### Compound v3 — computed, not emitted; liquidity reuses existing coverage

Comet does **not** emit a rate event — the interest rate is a pure function of utilization,
computed on read (`getUtilization()` → kink-curve formula), not broadcast onchain.

- **Borrow rate**: compute it ourselves: `utilization = totalBorrow / totalSupply`, then apply the
  kink-curve parameters already captured in section 2's `SetConfiguration` (`supplyKink`,
  `borrowPerYearInterestRateBase/SlopeLow/SlopeHigh`, etc. — also settable individually via the
  Configurator's `SetBorrowKink`/`SetBorrowPerYearInterestRate*` events if we want finer-grained
  history instead of only reacting to full `SetConfiguration` replacements). This is the one venue
  where "rate" is a derived column, not an indexed field — compute it in a downstream view, not
  the raw event table.
- **Available liquidity**: `totalSupply - totalBorrow` of the **base asset only** (collateral
  assets aren't the borrowable side in Compound III's single-base-asset model). The existing
  `compound-v3-substreams` package already emits `Supply`/`Withdraw` with amounts for exactly this
  — no new events needed, just aggregate what's already there, filtered to the base-asset flows
  (as opposed to `TransferCollateral`/collateral-side activity, which doesn't affect borrowable
  liquidity).

---

## Suggested materialized tables

Two tables cover everything above:

**`markets`** — one row per `(venue, collateral, debt, data)`, upserted by the listing events in
sections 1–4:
```
venue, collateral, debt, data (hex), reserve_id/asset_id (nullable, Aave only),
collateral_eligible (bool), debt_eligible (bool), last_updated_block
```

**`market_rates`** — one row per indexed reserve/market/asset id, upserted by the events in
section 5:
```
venue, reserve_id/market_id, borrow_rate (normalized to WAD-per-year for comparability across
venues), available_liquidity (in the asset's native decimals), last_updated_block
```

`discoverAllMarkets` becomes `SELECT ... FROM markets JOIN market_rates ...` — one query, no RPC,
no HTTP, and the existing `src/markets.ts` functions stay as the correctness fallback for a chain
this indexer doesn't cover yet.

## Verified contract addresses used in this research (Ethereum mainnet)

| Contract | Address | Role |
|---|---|---|
| Morpho Blue | `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb` | singleton, not a proxy |
| Aave v3 PoolAddressesProvider | `0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e` | resolves Pool/PoolConfigurator |
| Aave v3 Pool | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` | impl `0x728a138a4823392c2efa55e028d434f526fe03cf` |
| Aave v3 PoolConfigurator | `0x64b761D848206f447Fe2dd461b0c635Ec39EbB27` | impl `0xff42ce30054dce7dc7c1282a9a497aa58eabce99` |
| Aave v4 Hub | `0xCca852Bc40e560adC3b1Cc58CA5b55638ce826c9` | impl `0xfe89fd96f270ac3c0f11921af0390dbb1340f704` |
| Aave v4 MAIN_SPOKE | `0x94e7A5dCbE816e498b89aB752661904E2F56c485` | impl `0xabd0e26fe17bde4f1f1187ed8aa80c274e03d8b5` |
| Compound v3 USDC Comet | `0xc3d688B66703497DAA19211EEdff47f25384cdc3` | proxy, admin `0x1ec63b5883c3481134fd50d5daebc83ecd2e8779` |
| Compound v3 Configurator | `0x316f9708bB98af7dA9c68C1C3b5e79039cD336E3` | impl `0xcfc1fa6b7ca982176529899d99af6473ad80df4f` |

All verified 2026-10-23 via Etherscan's `getabi`/`getsourcecode` API and live `cast call`/`cast
logs` against the addresses the margin router's adapters themselves resolve — re-verify before any
of these informs a real indexer build, since proxy implementations can change.
