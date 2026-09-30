---
'@uniswap/lp-sdk': minor
---

Introduce @uniswap/lp-sdk with LP gas-estimation helpers: pickPreEstimateIndependentAmount for choosing a representative simulation amount from wallet balances, and getV2/getV3/getV4AddLiquidityGasEstimateTransactions for building the ordered approval + create/increase transaction lists to run eth_estimateGas over.
