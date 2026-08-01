# @uniswap/liquidity-launcher-sdk

## 1.3.0

### Minor Changes

- 275572c: Add creator-fees position recipient helper and fee-splitter custody mode for auction launches: `getCreatorFeesPositionRecipient` / `CREATOR_FEES_POSITION_RECIPIENTS` resolve the fees-enabled FeeSplitter to use as a launch's position recipient, `isCreatorFeesPositionRecipient` recognizes it classifier-side, and the quick-launch model gains a structurally permanent `creatorFees` lock mode that `isQuickLaunch` and `isPermanentTimelock` accept.

## 1.2.0

### Minor Changes

- c5ae2e8: Decouple the quick-launch graduation threshold from the floor price: `QUICK_LAUNCH_GRADUATION_FDV_USD` is now 10_000 (was 50_000) and `QUICK_LAUNCH_FLOOR_FDV_USD` is now 1_000 (was 5_000). Adds `QUICK_LAUNCH_SOLD_SUPPLY_SHARE` (0.5) and `QUICK_LAUNCH_GRADUATION_RAISE_USD` (graduation FDV x sold share = $5k — the USD raised at a given FDV is always FDV x sold share, never the FDV itself), plus derivation helpers for the liquidity service's CreateAuction request fields: `fdvUsdToPricePerToken(fdvUsd, totalSupplyWholeTokens, raiseCurrencyUsdPrice)` and the preset-bound `getQuickLaunchFloorPricePerToken(ethUsdPrice)` / `getQuickLaunchGraduationPricePerToken(ethUsdPrice)`, the latter feeding the CreateAuction `graduation_price_raise_per_token` param.

  Adoption note: pick up the lowered floor only together with (or after) sending `graduation_price_raise_per_token`. Against a liquidity service that derives the graduation threshold from the floor, the lower floor alone also lowers the graduation target (~$500 raised at a $1k floor, instead of the intended ~$5k).

## 1.1.0

### Minor Changes

- 24ac471: Make the SDK the single home for interacting with the Instant Launch contracts — ABI fragments, address registry, transaction building, and fee math — consumed by both backend and frontend. Adds the variant-keyed, append-only Instant Launch deployment registry (`INSTANT_LAUNCH_DEPLOYMENTS` / `INSTANT_LAUNCH_CONTRACTS`, with `getInstantLaunchStrategy(chainId, { creatorFeesEnabled })`, the `getInstantLaunchDeployment(strategyAddress)` reverse lookup for indexers, and `getInstantLaunchDeployments(chainId)`), carrying the canonical chain-4663 deployment: creator-fee on/off is a per-instance constructor immutable, so each variant is its own strategy + FeeSplitter pair sharing the UERC20BeneficiaryVault and CompoundingClaimRecipient singletons. `buildInstantLaunchTransaction` selects the strategy by `creatorFeesEnabled` and, on the fees-off path, internally encodes the mandatory-but-unused `DISABLED_CREATOR_FEE_BENEFICIARY` placeholder. Ships minimal event/function ABI fragments for InstantLaunchStrategy, FeeSplitter, the beneficiary vault, and the compounding claim recipient, plus dependency-light BigInt fee math over indexed events (`creatorFeesAccumulated`, `creatorFeesClaimable`, `feesCompounded`) driven by the per-splitter bps recorded in the registry. Also adds the launch-pool derivation and quoting helpers (`getInstantLaunchPoolKey` / `getInstantLaunchPoolId` / `quoteInstantLaunchBuy*`), `predictInstantLaunchTokenAddressCall`, and the preset constants (1e27 supply, LP fee 2500, tick spacing 60, initial tick 198060, min launch tick -208980). Everything is named InstantLaunch (contracts renamed in liquidity-launcher#214); the unreleased DirectLaunch API surface is superseded.

  Also refines the quick-launch classifier so the SDK owns the full predicate: `isQuickLaunch` now accepts `null` for its two `MigratorParameters` refinements with resolved-vs-unknown semantics — a `null` lock means _resolved: no lock_ and fails the match, while `null`/`undefined` for `reservedTokenAmountForLP` mean _unknown_ and leave the 50/50 split unasserted. Consolidates every definition of a "permanent" lock into the SDK: `PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS` (1000 years — the canonical classification threshold), `PERMANENT_TIMELOCK_REQUEST_SECONDS` (~100k years — the horizon the create flow requests, formerly a local constant in the create flow), and `PERMANENT_UNLOCK_BLOCK_THRESHOLD` (2e11 — the chain-agnostic raw-block approximation formerly private to data-api's `lockedForever` serving path), with `isPermanentTimelock` as the one predicate accepting all three call-site forms: the chain-aware block form (`{chainId, endBlock, unlockBlock}`), the create-flow timestamp form (`{endTimeSeconds, unlockTimeSeconds}`), and the raw-block sentinel form (`{unlockBlock}`), legacy max-uint sentinel unlock blocks included. `QuickLaunchLockMode` gains `'burn'` as a first-class member — a burned LP position is _structurally_ permanent (such rows carry `unlock_block = 0`) and qualifies as a quick launch (strictly stronger than the preset), so `isPermanentTimelock({lockMode: 'burn', ...})` short-circuits to true, `isQuickLaunch` accepts a burn lock, and the backend can drop its local `'burn'` → `'buybackBurn'` fold and structural special-case.

## 1.0.1

### Patch Changes

- Updated dependencies [8dc2570]
- Updated dependencies [0b2b31c]
  - @uniswap/sdk-core@7.19.0
  - @uniswap/v3-sdk@3.31.1
  - @uniswap/v4-sdk@2.3.1

## 1.0.0

### Major Changes

- 564bcdc: `buildPositionDefinitions` now requires the raised `currency` and launched `token` addresses so it can apply v4 currency ordering. When `currency` sorts as `currency0` (`currency < token`, always the case for native-ETH launches), the pool price is the reciprocal of the CCA currency-per-token price, so custom asymmetric ranges are now mirrored onto the reciprocal price band (offsets negated and swapped) instead of landing on the mirror image of the intended band. Full-range positions use the `(MIN_TICK, MAX_TICK)` sentinel and are unaffected. This is a breaking signature change: callers must pass `currency` and `token`.

## 0.5.1

### Patch Changes

- 1c06f58: Update lock recipient creation bytecodes to the latest liquidity-launcher artifacts (commit e4660af). Picks up the new BlockNumberish that detects the ArbSys precompile at construction time instead of hardcoding the Arbitrum One chain id.

## 0.5.0

### Minor Changes

- 305a40d: Add the canonical quick-launch definition as the single source of truth for CCA "quick launches", replacing the two drifting client copies that existed before (a discovery-side heuristic and the create flow's preset).

  - `QUICK_LAUNCH_PRESET` — the frozen, defining CCA parameter set: CCA auction type, instant start, 4h duration (14400s, superseding the old 30m/1h/4h set), 1B fixed supply (1e27 @ 18dp), native (ETH) raise, ~$5k floor FDV, 50/50 supply split, V4 LP (0.25% fee tier, full-range + concentrated, permanent buyback-&-burn timelock), and the fixed convex emission curve.
  - `isQuickLaunch(params, options?)` — a pure, deterministic, address-free matcher that classifies a CCA auction's on-chain parameters against the preset. Usable client-side and server-side. Matches on native raise, 1B supply, and the 4h window (with the 50/50 reserve and permanent buyback-&-burn lock as optional refinements); duration is 4h-only by default, with an opt-in override for historical 30m/1h windows.
  - Field constants (`QUICK_LAUNCH_DURATION_SECONDS`, `QUICK_LAUNCH_TOTAL_SUPPLY_RAW`, `QUICK_LAUNCH_RESERVED_FOR_LP_RAW`, etc.) and `getQuickLaunchDurationBlocks(chainId)`.

  The LP fee tier (0.25% vs 0.3%) and the $50k graduation FDV are marked pending final sign-off in code comments. This classifier is a cosmetic / discovery descriptor only and, being reproducible by construction, must not gate suppression of security warnings.

## 0.4.0

### Minor Changes

- 018477b: Add CCA auction-instance interaction helpers: `buildSweepUnsoldTokensTx` / `buildMigrateTx` transaction builders (with `encodeSweepUnsoldTokens` / `encodeMigrate` and a minimal `CCA_ABI`, plus `migrate` on `LBP_STRATEGY_ABI`), auction state read descriptors (`isGraduatedCall`, `sweepUnsoldTokensBlockCall`, `sweepCurrencyBlockCall`, `currencyRaisedCall`, `remainingSupplyCall`, `tokensRecipientCall`, `auctionEndBlockCall`, `auctionClaimBlockCall`), and a pure `deriveAuctionOutcome` helper. Creators of a failed (non-graduated) auction can now construct the `sweepUnsoldTokens()` withdrawal transaction, and anyone can construct the success-path `LBPStrategy.migrate()` transaction.

## 0.3.2

### Patch Changes

- dc4161f: Point `ccaFactory` at the blocknumberish-v1.1.0 CCA factory (`0x000000001F26a0044BaA66024e7b6599c61963F8`) on every chain, not just Robinhood. The v3.1.0 LBPStrategy deployments shipped in #632 all create their auctions through this factory (verified on-chain via `LBPStrategy.initializerFactory()` on mainnet, base, unichain, arbitrum, avalanche, xlayer, sepolia, and base-sepolia), but `ccaFactory` was still reporting the legacy factory (`0x00cCa200BF124dBfA848937c553864f4B4CE0632`) for all non-Robinhood chains. Consumers resolving a chain's auction factory from the SDK (e.g. to pick the TickDataLens) now get the address auctions are actually created from. The legacy factory is retained in `AUCTION_FACTORY_DEPLOYMENTS` so historical auctions still resolve.

## 0.3.1

### Patch Changes

- 9f407e4: Update LBPStrategy addresses to the v3.1.0 deployments on all chains

## 0.3.0

### Minor Changes

- 6081b3e: Add a chain-independent auction-factory deployment registry: `AUCTION_FACTORY_DEPLOYMENTS` lists every factory ever deployed (v1 TWA, the early CCA test deploy, the CCA v2.0.0 deploy, and the 2026-07-09 blocknumberish-aware redeploy), each paired with the TickDataLens that reads its auctions. Also exports `getTickDataLensForFactory(factoryAddress)` (case-insensitive lookup, `undefined` for unknown factories), the derived `TICK_DATA_LENS_BY_FACTORY` map, and the `TICK_DATA_LENS_V1` / `TICK_DATA_LENS_V2` lens addresses. Downstream indexers can resolve a stored factory address through the registry instead of hardcoding their own factory-to-lens map, so a factory redeploy only requires bumping this package.

### Patch Changes

- e664d2d: Update Robinhood (chain 4663) contract addresses to the 2026-07-09 blocknumberish-aware redeploy: ccaFactory 0x000000001F26a0044BaA66024e7b6599c61963F8, lbpStrategy 0x843747f4c08E3393E55508F577296bA48E8Ca000. The previous contracts did not recognize chain 4663 in blocknumberish, so auction block ranges were derived against the wrong clock (silently compressing a ~14h auction window to ~7min).

## 0.2.1

### Patch Changes

- 208556d: Fix auction duration on Arbitrum-family chains. `BLOCK_TIME_SECONDS_BY_CHAIN` now sets the correct sub-second L2 (`arbBlockNumber`) cadence for Arbitrum One (0.25s) and Robinhood (0.1s); previously both fell back to the 12s default, which compressed an auction's real-time window by ~48x (Arbitrum) and ~120x (Robinhood) because the CCA advances on the L2 block clock, not `block.number`. Robinhood additionally requires the on-chain `blocknumberish` library to recognize its chain id (and a CCA/LBPStrategy redeploy) before the fix takes effect on-chain.

## 0.2.0

### Minor Changes

- 437605c: Add Avalanche (43114), XLayer (196), and Robinhood Chain (4663) to the supported launch chains, all carrying the canonical uERC20 factory. Robinhood is intentionally omitted from `BLOCK_TIME_SECONDS_BY_CHAIN` — like Arbitrum, its contract-visible `block.number` tracks Ethereum L1 (~12s).

## 0.1.0

### Minor Changes

- a021251: Add `@uniswap/liquidity-launcher-sdk`: a framework-agnostic toolkit for the Uniswap Liquidity Launcher (CCA + LBP) stack — per-chain addresses, ABIs, struct types, calldata encoders, deterministic-address prediction, auction-configuration math, on-chain read descriptors, fee-tier availability (`getFeeTierAvailability`), a pure transaction assembler (`buildLaunchTransactions`), and liquidity-lock recipients (`buildLockRecipient`: timelock / fees-forwarder / buyback-burn).
