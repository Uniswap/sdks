# @uniswap/lp-sdk

An SDK for building liquidity-provision flows on top of Uniswap v2, v3, and v4. It composes the
position calldata builders from `@uniswap/v2-sdk`, `@uniswap/v3-sdk`, and `@uniswap/v4-sdk` into
cross-version helpers, following the same pattern `@uniswap/router-sdk` uses for swaps.

Like all SDKs in this repository, it is chain-agnostic and makes no network calls: helpers take
onchain state (balances, allowances, pool state) as inputs and return transaction tuples
(`{ to, calldata, value }`).

## Gas estimation helpers

Estimating the real cost of an LP flow (instead of reserving a hardcoded native-token buffer)
requires estimating every transaction the user will send — token approvals included — before the
user has entered an amount. These helpers produce that transaction list:

- `pickPreEstimateIndependentAmount(balance0, balance1)` — picks which pool token (and how much of
  it) to drive a representative simulation with, from the wallet's two token balances. Balances are
  capped at 10^(decimals + 3) raw units; returns `null` when both are zero.
- `getV2AddLiquidityGasEstimateTransactions(params)` — approvals to the v2 router plus the
  `addLiquidity`/`addLiquidityETH` transaction.
- `getV3AddLiquidityGasEstimateTransactions(params)` — approvals to the `NonfungiblePositionManager`
  plus the mint/increase transaction (`NonfungiblePositionManager.addCallParameters`).
- `getV4AddLiquidityGasEstimateTransactions(params)` — ERC-20 approvals to Permit2, Permit2
  approvals to the v4 position manager, plus the mint/increase transaction
  (`V4PositionManager.addCallParameters`).

Callers run `eth_estimateGas` over the returned transactions in order (from the wallet's address)
and sum the results. Approvals are included pessimistically when no allowance state is provided.
