---
'@uniswap/universal-router-sdk': minor
---

`UniswapTrade` / `SwapRouter.swapCallParameters` can now pay a portion fee to more than one recipient. `SwapOptions.fee` accepts an array of up to 4 `FeeOptions` alongside the single `FeeOptions` it has always accepted; each entry becomes its own fee command, emitted in the caller's order ahead of the final `SWEEP` / `UNWRAP_WETH` / `WRAP_ETH`.

Fees have gross-output semantics: each entry's fee means "this fraction of the gross swap output". Since on-chain `PAY_PORTION` pays a portion of the router's *remaining* balance, the SDK rescales fee i at encode time to `f_i / (1 - sum(f_0..f_{i-1}))` (exact fraction math via `scalePortionFees`, exported), so every recipient receives their stated fraction of gross to within the flooring dust of 1e18 command precision. The rescaled portions are fractional bips, so they are emitted as `PAY_PORTION_FULL_PRECISION` (1e18 denominator), so more than one fee recipient therefore requires `urVersion` >= 2.1.1 and throws `Multiple fee recipients require Universal Router version V2_1_1 or higher` on older versions.

The exact-output fee deduction replays the encoded command cascade against the gross minimum (`simulatePortionFeeDeduction`, exported): each command floors against the router's running balance using the exact portion value that gets ABI-encoded, so the sweep floor equals exactly what the router holds after the fees — never an unmeetable wei higher. Fees that together reach or exceed 100% of the output (leaving the swapper nothing) are rejected with `Portion fees together exceed 100% of the swap output`.

Passing a single `FeeOptions` is unchanged: calldata is byte-identical to the previous release across UR 2.0 / 2.1.1 and both trade types — a single fee needs no rescaling, and for one fee the cascade replay reduces exactly to the previous quantized deduction `floor(minimumAmountOut * encodedFee / SCALE)`. An empty array and more than `MAX_FEE_RECIPIENTS` (4) entries are rejected in the `UniswapTrade` constructor; `fee` and `flatFee` remain mutually exclusive.
