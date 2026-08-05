---
'@uniswap/liquidity-launcher-sdk': minor
---

Register the 2026-08-05 chain-4663 (Robinhood) **full stack redeploy** as the current Instant Launch generation. Every "current" pointer moves to the new deploy; every prior generation stays registered (the registry is append-only — indexed launches permanently reference the strategy and splitter that created them), so historical classification is unchanged.

- `LIQUIDITY_LAUNCHER_ROBINHOOD` → `0x0000FffFBE8efE702c8703aE3477FF5dE3d319C0` (was the interim v3.1.1 `0x7A6C474b…`), used by both `LAUNCHER_ADDRESSES[4663].liquidityLauncher` and `INSTANT_LAUNCH_CONTRACTS[4663].liquidityLauncher`.
- `LAUNCHER_ADDRESSES[4663].universalRouterStrategy` → `0x1242c9439d589cAE85E121B1f79f2aF51e91DCEE` (was `0x4962907c…`).
- `LAUNCHER_ADDRESSES[4663].tokenSplitter` → `0x4F5E3FBb9745358A92Da5674305FAb8D2B8a73cE` — a new Robinhood-only constant; the other eight chains keep the shared `0x8B7DCeb5…` TokenSplitter.
- A fifth `INSTANT_LAUNCH_DEPLOYMENTS` pair is **appended**: `0x23f8209572b4a1C2AD88A42749E830791Fb027f1` (fees-on) and `0xAD44D55E7f8337C3cE113fBb591486E85be104b2` (fees-off). `getInstantLaunchStrategy` now selects it; the four older generations (`c3f9506`, `8e40a35`, `3e05da8`, v3.1.1) still resolve through `getInstantLaunchDeployment`.
- **Both FeeSplitters move** — the first generation where the fees-off side changes: fees-on → `0xeFF166AAf189323c58dc27eD1206EB2C37FaACDf`, fees-off → `0x222D6d4f1ce59b0d48D5505114eC8Addc90A4359`. `getCreatorFeesPositionRecipient` / `getAutocompoundPositionRecipient` (and their derived maps) return the new splitters, so a new auction / crowd launch must set the new address as its `MigratorParameters.positionRecipient`. `isCreatorFeesPositionRecipient` / `isAutocompoundPositionRecipient` still recognize every superseded splitter, so launches already parked there keep classifying.
- `INSTANT_LAUNCH_CONTRACTS[4663].beneficiaryVault` → `0xd35E9CA72F64C7F93BE30fad67524323396B36D7` (was `0xa5889CaF…`); `compoundingClaimRecipient` → `0xf9526Dd3361fe0ba6b7a99533ed471D3E808E99a` (was `0x666DA634…`). `DISABLED_CREATOR_FEE_BENEFICIARY` (the placeholder the fees-off builder encodes) follows the CompoundingClaimRecipient to the new address.

**Intentionally unchanged**: `LAUNCHER_ADDRESSES[4663].lbpStrategy` (`0x05d55239…`) and the CCA factory were not part of the redeploy (nor was the InitializerHook, which this SDK does not track). The shared all-chain `LIQUIDITY_LAUNCHER` stays `0x00004c4c…`; the eight non-Robinhood chains are byte-for-byte unchanged. No ABI, type, or function-signature changes.
