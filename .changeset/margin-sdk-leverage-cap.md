---
'@uniswap/margin-sdk': patch
---

Add `sizeIncreaseForLeverageCap` and `collateralToBuyForLeverageCap`: size the leverage buy for the worst fill (`equity * (L - 1) / (1 + L * slippage)`) so realized leverage can only slip down from the target, and return the matching `maxLtvAfter` (`impliedLtv(L)`) that enforces the ceiling onchain. `sizeIncrease` keeps sizing for the quote and now shares its `IncreaseSizingParams` input type.
