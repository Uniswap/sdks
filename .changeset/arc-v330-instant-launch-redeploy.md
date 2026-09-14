---
'@uniswap/liquidity-launcher-sdk': patch
---

Redeploy the Arc (5042) **v3.3.0** Instant Launch strategy pair with the protocolFeeController fix (LP-1727): fees-on `0x78429369…` (was `0x0C7adf7A…`), fees-off `0xA5FFB8B0…` (was `0x3d4C91ca…`). The 2026-09-08 v3.3.0 pair never launched anything, so the `INSTANT_LAUNCH_DEPLOYMENTS` entries are **replaced in place** rather than a new generation appended — there are no indexed launches that reference the dropped strategies. Both 2026-09-08 strategies have zero on-chain logs from deployment to tip, so no launch, position or creator share references them. `getInstantLaunchStrategy(5042, …)` now returns the redeployed addresses; pool shape (`25 / 122,050 / -160,100`) and the creator-fee split are unchanged.

**Intentionally unchanged**: Arc's FeeSplitters (`0xC2F1D915…` / `0xCDDC6103…`), UERC20BeneficiaryVault `0x3892aB3D…` and CompoundingClaimRecipient `0xBE5A26C5…` (the redeployed strategies pin the same periphery, so neither Arc position recipient moves); the 2026-09-01 Arc generation (`0xfe7Be4Eb…` / `0xff301aCB…`), which has live launches; `INSTANT_LAUNCH_CONTRACTS[5042]`; the Arc LBPStrategy `0x542BCDA1…`. No ABI, type, or function-signature changes.
