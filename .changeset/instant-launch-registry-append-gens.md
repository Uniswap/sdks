---
'@uniswap/liquidity-launcher-sdk': minor
---

Append the two newer chain-4663 Instant Launch strategy generations (liquidity-launcher deploy commits 8e40a35 and 3e05da8) to the deployment registry, keeping the original c3f9506 pair as a historical entry per the registry's append-only rule. `getInstantLaunchStrategy` (and the transaction builder) now selects the 3e05da8 pair for new launches, while `getInstantLaunchDeployment` still resolves every generation for indexers. FeeSplitters, singletons, creator-fee splits, and `initialTick` are unchanged across generations.
