---
'@uniswap/liquidity-launcher-sdk': minor
---

Add a graduation-FDV gate to the quick-launch classifier. `isQuickLaunch` now accepts an optional `graduationFdvUsd` on `QuickLaunchMatchParams`: when the caller supplies a resolved, finite USD number it must match one of `QUICK_LAUNCH_ALLOWED_GRADUATION_FDV_USD` ([5_000, 10_000]) within `QUICK_LAUNCH_GRADUATION_FDV_TOLERANCE_RATIO` (0.1, mirroring the duration ratio; accepted bands [4500, 5500] and [9000, 11000]), or the auction is not a quick launch; `undefined`/`null`/non-finite (`NaN`/`Infinity`) leave the assertion off so nothing regresses before the backend populates it and a price-resolution miss never demotes a legit launch. Both the allowed set and the tolerance are overridable via `QuickLaunchMatchOptions` (`allowedGraduationFdvUsd`, `graduationFdvToleranceRatio`), mirroring `allowedDurationsSeconds`. The gate is USD-denominated (chain-agnostic) and layered on top of the existing structural checks — no structural check is weakened.

This SDK-side gate is dormant until the backend supplies the value: it becomes live once `Uniswap/backend` populates and passes `graduationFdvUsd` (follow-up branch `claude/backend-graduation-fdv-gate`), which converts each auction's native `required_currency_raised` to USD at ingest.
