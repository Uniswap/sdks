# @uniswap/lp-sdk

An SDK for building liquidity-provision flows on top of Uniswap v2, v3, and v4. It composes the
position calldata builders from `@uniswap/v2-sdk`, `@uniswap/v3-sdk`, and `@uniswap/v4-sdk` into
cross-version helpers, following the same pattern `@uniswap/router-sdk` uses for swaps.

Like all SDKs in this repository, it is chain-agnostic and makes no network calls: helpers take
onchain state (pool state, allowances) as inputs and return transaction tuples
(`{ to, calldata, value }`).

## Gas estimation helpers

Estimating the real cost of an LP flow (instead of reserving a hardcoded native-token buffer)
requires estimating every transaction the user will send — token approvals included — before the
user has entered an amount. These helpers produce that transaction list:

- `getMinimalPreEstimateIndependentAmount(params)` — picks which pool currency (and how little of
  it) to drive the simulation with: the smallest amount that still yields a valid position, so the
  dependent side stays within the wallet's balance. Returns `null` when no amount is valid.
- `getV2AddLiquidityGasEstimateTransactions(params)` — approvals to the v2 router plus the
  `addLiquidity`/`addLiquidityETH` transaction.
- `getV3AddLiquidityGasEstimateTransactions(params)` — approvals to the `NonfungiblePositionManager`
  plus the mint/increase transaction (`NonfungiblePositionManager.addCallParameters`).
- `getV4AddLiquidityGasEstimateTransactions(params)` — ERC-20 approvals to Permit2, Permit2
  approvals to the v4 position manager, plus the mint/increase transaction
  (`V4PositionManager.addCallParameters`).

Callers simulate the returned transactions in order, from the wallet's address, and sum the gas.
The calls must share state (e.g. `eth_simulateV1`, viem's `simulateCalls`): the position
transaction reverts until the approvals before it have been applied, so estimating each
transaction independently with `eth_estimateGas` fails whenever an approval is still needed.
Approvals are included pessimistically when no allowance state is provided.
