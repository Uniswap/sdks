---
'@uniswap/liquidity-launcher-sdk': patch
---

Register the Arc (5042) **v3.3.0 buyback-and-burn** Instant Launch pair as a new `INSTANT_LAUNCH_DEPLOYMENTS` generation: fees-on `0x58E5099f…` + FeeSplitter `0xdaA7C2e8…` (40% native to the vault, 60% native + 100% token to the BuybackAndBurnRecipient `0x5cEe9852…`), fees-off `0x36F8c870…` + FeeSplitter `0xE8113a9a…` (100% to the BuybackAndBurnRecipient). `getInstantLaunchStrategy(5042, …)` now returns these; `getCreatorFeesPositionRecipient(5042)` / `getAutocompoundPositionRecipient(5042)` move to the new splitters, so a new Arc auction / crowd launch must set the new address as its `MigratorParameters.positionRecipient`. Pool shape (`25 / 122,050 / -160,100`) and the creator-fee split are unchanged.

The 2026-09-14 pair (`0x78429369…` / `0xA5FFB8B0…`) is **kept, not replaced**: the fees-off strategy has launched tokens on-chain, so removing it would orphan their classification. `isCreatorFeesPositionRecipient` / `isAutocompoundPositionRecipient` still recognize the v3.2.0 splitters (`0xC2F1D915…` / `0xCDDC6103…`).

**Intentionally unchanged**: the Arc LBPStrategy `0x542BCDA1…`, UniversalRouterStrategy `0x0A122717…`, LiquidityLauncher `0x0000FffF…`, TokenSplitter `0x8B7DCeb5…`, UERC20BeneficiaryVault `0x3892aB3D…`, and `INSTANT_LAUNCH_CONTRACTS[5042].compoundingClaimRecipient` `0xBE5A26C5…` (still the claim surface of the v3.2.0 splitters). New optional `buybackAndBurnRecipient` on `InstantLaunchChainContracts` / `InstantLaunchAddresses`, set to `0x5cEe9852…` on Arc only (additive; `undefined` elsewhere). The VestingClaimRecipient `0xf914C6b4…` and InitializerHook `0x0A2Bf52D…` are not tracked by this SDK. No ABI or function-signature changes.
