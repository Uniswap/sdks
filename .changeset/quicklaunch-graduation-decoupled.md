---
'@uniswap/liquidity-launcher-sdk': minor
---

Decouple the quick-launch graduation threshold from the floor price and land the signed-off values: `QUICK_LAUNCH_GRADUATION_FDV_USD` is now 10_000 (was 50_000, pending sign-off) — i.e. ~$5k raised at the 50%-sold preset — and `QUICK_LAUNCH_FLOOR_FDV_USD` drops to 1_000 (was 5_000). Adds `QUICK_LAUNCH_SOLD_SUPPLY_SHARE` (0.5) and `QUICK_LAUNCH_GRADUATION_RAISE_USD` (graduation FDV x sold share = $5k; the raise is never the FDV 1:1), plus request-derivation helpers for the liquidity service's CreateAuction fields: `fdvUsdToPricePerToken(fdvUsd, totalSupplyWholeTokens, raiseCurrencyUsdPrice)` and the preset-bound `getQuickLaunchFloorPricePerToken(ethUsdPrice)` / `getQuickLaunchGraduationPricePerToken(ethUsdPrice)`, the latter feeding the new optional `graduation_price_raise_per_token` CreateAuction param.

SEQUENCING: consumers must not ship the lowered floor to production before the graduation param is live end-to-end (liquidity service deployed and the create flows sending `graduation_price_raise_per_token`) — today's graduation gate is floor-derived, so a $1k floor alone would silently drop the graduation target to ~$500 raised.
