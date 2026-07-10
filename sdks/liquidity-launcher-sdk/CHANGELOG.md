# @uniswap/liquidity-launcher-sdk

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
