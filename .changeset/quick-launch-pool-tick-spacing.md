---
'@uniswap/liquidity-launcher-sdk': minor
---

Quick-launch preset: state the graduation pool's tick spacing, which the 2026-08-05 chain-4663 full redeploy changed on-chain from 50 to 25 without any SDK constant describing it.

- `QUICK_LAUNCH_POOL_TICK_SPACING` (new) → `25`. The value the launch flow passes in `MigratorParameters.poolParameters` since the redeploy — deliberately NOT the generic `feeToTickSpacing` derivation, which yields 50 for the 2500 fee tier. Evidence: the post-redeploy `Initialize` census on chain 4663 shows every quick-launch graduation pool minted at spacing 25 (295 pools in the redeploy's first day, zero new pools at 50).
- `QUICK_LAUNCH_ALLOWED_POOL_TICK_SPACINGS` (new) → `[25, 50]`. The append-only grandfather set (same shape as `QUICK_LAUNCH_ALLOWED_GRADUATION_FDV_USD`): pools are permanent, so routing/discovery consumers deriving a token's candidate launch pools must race a `(QUICK_LAUNCH_LP_FEE, spacing)` key for every entry — the token address alone cannot say which generation minted its pool. This is the constant rh-cca's `LAUNCH_POOL_TIERS`-style routing should consume instead of hand-maintained literals (Uniswap/universe#38608 shipped the interim literal).
- `QUICK_LAUNCH_PRESET.lp.tickSpacing` (new field) → `QUICK_LAUNCH_POOL_TICK_SPACING`, beside the existing `lp.fee`.

`feeToTickSpacing` itself is unchanged — it remains the generic v3-canonical/interface derivation used for validation; the preset now states the observed on-chain value where the launch flow no longer follows that formula. `isQuickLaunch` classification is unaffected (it never matched on the pool key).
