---
'@uniswap/v4-sdk': minor
---

Adds a `settleFromNativeValue` option to `addCallParameters` for approval-free settlement of native-backed ERC20 gas tokens: the currency's leg is settled by the position manager from attached msg.value (scaled to native decimals) instead of being pulled from the user via Permit2, with the unused maximum swept back and the pool key unchanged.
