---
'@uniswap/liquidity-launcher-sdk': minor
---

Add Arc (5042) to the deployment registries: launcher stack (redeployed LiquidityLauncher, LBPStrategy, shared TokenSplitter, UniversalRouterStrategy, v4 PositionManager) and the Instant Launch generation (fees-on/fees-off strategy + FeeSplitter pairs, UERC20BeneficiaryVault, CompoundingClaimRecipient). Arc deploys no token factory, so new-token launches stay unsupported there (`selectTokenFactory`/`getInstantLaunchAddresses` return undefined); everything else resolves.
