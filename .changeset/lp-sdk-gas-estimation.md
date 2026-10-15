---
'@uniswap/lp-sdk': minor
---

Introduce @uniswap/lp-sdk with LP gas-estimation helpers: getMinimalPreEstimateIndependentAmount for choosing the smallest valid simulation amount, and getV2/getV3/getV4AddLiquidityGasEstimateTransactions for building the ordered approval + create/increase transaction lists to simulate in sequence.
