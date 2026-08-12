---
'@uniswap/universal-router-sdk': minor
---

`UniswapTrade` / `SwapRouter.swapCallParameters` can now pay a portion fee to more than one recipient. `SwapOptions.fee` accepts an array of up to 4 `FeeOptions` alongside the single `FeeOptions` it has always accepted; each entry becomes its own `PAY_PORTION` (or `PAY_PORTION_FULL_PRECISION` on UR >= 2.1.1) command, emitted in the caller's order ahead of the final `SWEEP` / `UNWRAP_WETH` / `WRAP_ETH`.

Previously the encoder had a single `if (!!options.fee)`, so exactly one fee recipient was representable per swap no matter what the caller passed downstream.

The exact-output fee deduction now sums across every entry instead of holding one value. Each portion is measured against the same pre-fee `minimumAmountOut`, while on-chain the portions apply sequentially to a shrinking router balance — so the sum is an upper bound on what the recipients actually take and the sweep floor can only be conservative, never short. A total that exceeds `minimumAmountOut` is now rejected with `Fee amount greater than minimumAmountOut` rather than underflowing into ABI encoding.

Passing a single `FeeOptions` is unchanged: calldata is byte-identical to the previous release across UR 2.0 / 2.1.1 and both trade types. An empty array and more than `MAX_FEE_RECIPIENTS` (4) entries are rejected in the `UniswapTrade` constructor; `fee` and `flatFee` remain mutually exclusive.
