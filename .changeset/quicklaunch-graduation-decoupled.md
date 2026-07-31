---
'@uniswap/liquidity-launcher-sdk': minor
---

Decouple the quick-launch graduation threshold from the floor price: `QUICK_LAUNCH_GRADUATION_FDV_USD` is now 10_000 (was 50_000) and `QUICK_LAUNCH_FLOOR_FDV_USD` is now 1_000 (was 5_000). Adds `QUICK_LAUNCH_SOLD_SUPPLY_SHARE` (0.5) and `QUICK_LAUNCH_GRADUATION_RAISE_USD` (graduation FDV x sold share = $5k — the USD raised at a given FDV is always FDV x sold share, never the FDV itself), plus derivation helpers for the liquidity service's CreateAuction request fields: `fdvUsdToPricePerToken(fdvUsd, totalSupplyWholeTokens, raiseCurrencyUsdPrice)` and the preset-bound `getQuickLaunchFloorPricePerToken(ethUsdPrice)` / `getQuickLaunchGraduationPricePerToken(ethUsdPrice)`, the latter feeding the CreateAuction `graduation_price_raise_per_token` param.

Adoption note: pick up the lowered floor only together with (or after) sending `graduation_price_raise_per_token`. Against a liquidity service that derives the graduation threshold from the floor, the lower floor alone also lowers the graduation target (~$500 raised at a $1k floor, instead of the intended ~$5k).
