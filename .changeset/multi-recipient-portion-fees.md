---
'@uniswap/universal-router-sdk': minor
---

`UniswapTrade` / `SwapRouter.swapCallParameters` can now pay a portion fee to more than one recipient. `SwapOptions.fee` accepts an array of up to 4 `FeeOptions` alongside the single `FeeOptions` it has always accepted; each entry becomes its own fee command, emitted in the caller's order ahead of the final `SWEEP` / `UNWRAP_WETH` / `WRAP_ETH`.

Fees have precise gross-output semantics: each entry's fee means "this fraction of the gross swap output". Since on-chain `PAY_PORTION` pays a portion of the router's *remaining* balance, the SDK rescales fee i at encode time to `f_i / (1 - sum(f_0..f_{i-1}))` (exact fraction math via `scalePortionFees`, exported), so every recipient receives exactly their stated fraction of gross. The rescaled portions are fractional bips, so they are emitted as `PAY_PORTION_FULL_PRECISION` (1e18 denominator), so more than one fee recipient therefore requires `urVersion` >= 2.1.1 and throws `Multiple fee recipients require Universal Router version V2_1_1 or higher` on older versions.

The exact-output fee deduction sums the gross-based fees exactly (`sum of floor(minimumAmountOut * f_i)`). Fees that together exceed 100% of the output are rejected with `Portion fees together exceed 100% of the swap output`.

Passing a single `FeeOptions` is unchanged: calldata is byte-identical to the previous release across UR 2.0 / 2.1.1 and both trade types (a single fee needs no rescaling). An empty array and more than `MAX_FEE_RECIPIENTS` (4) entries are rejected in the `UniswapTrade` constructor; `fee` and `flatFee` remain mutually exclusive.
