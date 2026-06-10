---
'@uniswap/universal-router-sdk': patch
---

`nativeErc20Input` exact-output / partial-fill refunds now sweep the leftover input as native (`ETH_ADDRESS`) instead of the ERC20. The router's leftover lives in its native balance (18 decimals); an ERC20 sweep floors to the token's decimals (e.g. 6 for Arc USDC) and can strand sub-decimal dust in the router.
