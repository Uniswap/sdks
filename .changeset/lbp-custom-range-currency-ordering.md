---
"@uniswap/liquidity-launcher-sdk": major
---

`buildPositionDefinitions` now requires the raised `currency` and launched `token` addresses so it can apply v4 currency ordering. When `currency` sorts as `currency0` (`currency < token`, always the case for native-ETH launches), the pool price is the reciprocal of the CCA currency-per-token price, so custom asymmetric ranges are now mirrored onto the reciprocal price band (offsets negated and swapped) instead of landing on the mirror image of the intended band. Full-range positions use the `(MIN_TICK, MAX_TICK)` sentinel and are unaffected. This is a breaking signature change: callers must pass `currency` and `token`.
