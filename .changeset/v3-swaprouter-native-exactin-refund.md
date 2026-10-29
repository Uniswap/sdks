---
'@uniswap/v3-sdk': patch
---

Refund unspent ETH on native exact-input swaps. `swapCallParameters` only swept ETH for exact-output trades, so a native exact-input swap that stopped early against `sqrtPriceLimitX96` could leave the remainder stuck in the router.
