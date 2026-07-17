---
"@uniswap/liquidity-launcher-sdk": minor
---

Add TickDataLens tick-data reads and CCA clearing-price read helpers. New `TICK_DATA_LENS_ABI` plus `tickDataCall`/`getTickData` expose an auction's initialized price ticks (the live bid-distribution data). `clearingPriceCall`/`getClearingPrice` read the current clearing price (Q96 raw-currency-per-raw-token) from the auction's `checkpoint()` — the same live source the backend uses. `deriveTickFillRatios` is a pure per-tick fill-ratio helper (`currencyDemand / requiredCurrencyDemand`).
