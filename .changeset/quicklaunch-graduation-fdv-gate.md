---
'@uniswap/liquidity-launcher-sdk': minor
---

Add a graduation-FDV gate to the quick-launch classifier. `isQuickLaunch` now accepts an optional `graduationFdvUsd` on `QuickLaunchMatchParams`: when the caller supplies a resolved USD number it must match one of `QUICK_LAUNCH_ALLOWED_GRADUATION_FDV_USD` ([5_000, 10_000]) within `QUICK_LAUNCH_GRADUATION_FDV_TOLERANCE_RATIO` (0.25), or the auction is not a quick launch; `undefined`/`null` leave the assertion off so nothing regresses before the backend populates it. Both the allowed set and the tolerance are overridable via `QuickLaunchMatchOptions` (`allowedGraduationFdvUsd`, `graduationFdvToleranceRatio`), mirroring `allowedDurationsSeconds`. The gate is USD-denominated (chain-agnostic) and layered on top of the existing structural checks — no structural check is weakened.
