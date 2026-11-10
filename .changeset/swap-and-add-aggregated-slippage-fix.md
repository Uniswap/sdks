---
"@uniswap/router-sdk": patch
---

Fix swap-and-add silently weakening EXACT_INPUT slippage protection on routes with >2 trades.

`SwapRouter.encodeSwaps` previously toggled `performAggregatedSlippageCheck` whenever an
EXACT_INPUT trade had more than two routes, which set each individual swap's
`amountOutMinimum` to `0` and shifted enforcement onto a downstream `sweepToken` /
`unwrapWETH9` call. In the swap-and-add path there is no such trailing aggregate check;
the only remaining swap-output guard is `Position#mintAmountsWithSlippage`'s
`amount0Min` / `amount1Min`, which can legitimately drop well below the swap-derived
minimum when the position price range is wide or near a boundary. The result was that a
user's nominal 3% swap slippage could degrade to 30%+ effective slippage. Aggregation is
now suppressed when `isSwapAndAdd` is true, restoring per-swap slippage floors.

Fixes #514.
