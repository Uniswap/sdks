---
"@uniswap/liquidity-launcher-sdk": minor
---

Arc (5042): register the 2026-09-01 Instant Launch strategy redeploy and the chain's block time.

- `INSTANT_LAUNCH_DEPLOYMENTS` (Arc): the fees-on / fees-off `InstantLaunchStrategy` pair is now `0xfe7Be4EbBE6CcDfA57EE8c36fe9a767B033eB056` / `0xff301aCB22816D210d75D71F31Ac13C771093EF3`, with `initialTick` `122050` (native-USDC denominated: Arc's native currency is 18-decimal USDC, so this opens a 1e9-supply launch at ≈ $5k FDV). The 1.12.0 pair (`0x26e78031…` / `0xe510927f…`) had inherited Robinhood's ETH-denominated `198050` (≈ $2.50 FDV on Arc) and is removed from the registry — it launched nothing. `tickSpacing` 25, `minLaunchTick` -160100, the FeeSplitters, UERC20BeneficiaryVault and CompoundingClaimRecipient are unchanged, and `getInstantLaunchStrategy(5042, …)` now resolves to the redeployed pair.
- `BLOCK_TIME_SECONDS_BY_CHAIN[5042]` → `0.48` (was falling back to the 12s default, which derived a 4h Arc auction window as ~10 minutes of blocks). `getBlockTimeSeconds(SupportedChainId.ARC)` returns it.
