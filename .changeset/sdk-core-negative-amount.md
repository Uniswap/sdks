---
'@uniswap/sdk-core': patch
---

Reject a negative raw token amount. `CurrencyAmount` already rejected a value above `MaxUint256`. A negative quotient passed that check.
