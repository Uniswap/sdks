---
'@uniswap/universal-router-sdk': minor
---

`SwapRouter.encodeSwaps` can now pay a fee to more than one recipient. `SwapSpecification.fee` accepts an array of up to `MAX_FEE_RECIPIENTS` (4) `Fee` entries alongside the single `Fee` it has always accepted; each entry becomes its own command (`PAY_PORTION` / `PAY_PORTION_FULL_PRECISION` for `portion`, `TRANSFER` for `flat`), emitted in the caller's order ahead of the settlement `SWEEP`.

Portion fees have precise gross-output semantics: each entry's fee means "this fraction of the gross swap output". Since on-chain `PAY_PORTION` pays a portion of the router's *remaining* balance, the encoder rescales fee i via the shared `scalePortionFees` helper to `f_i / (1 - sum(f_0..f_{i-1}))` (exact fraction math), so every recipient receives exactly their stated fraction of gross. The rescaled portions are fractional bips and are emitted as `PAY_PORTION_FULL_PRECISION`, so more than one portion fee requires `urVersion` >= 2.1.1 and is rejected with `MULTIPLE_FEE_RECIPIENTS_REQUIRE_UR_V2_1_1` on older versions.

The sweep floor subtracts the exact sum of the gross-based fees, `sum(floor(gross * f_i))` (`computeEncodeSwapsAmounts`), and a total exceeding the output is rejected (`FEE_TOTAL_GT_AMOUNT_OUT`, or `FLAT_FEE_GT_AMOUNT` for flat fees) instead of underflowing into ABI encoding. Flat fees are absolute transfers, so their sum is exact by construction.

Every existing per-fee invariant applies per entry: portion pairs with `EXACT_INPUT`, flat with `EXACT_OUTPUT`, fractional bips require UR >= 2.1.1, and portion fees require router custody under `allowDirectTransfers`. A mixed portion/flat array is rejected by those same invariants. An empty array (`AT_LEAST_ONE_FEE_RECIPIENT_REQUIRED`) and more than `MAX_FEE_RECIPIENTS` entries (`TOO_MANY_FEE_RECIPIENTS`) are rejected in `validateEncodeSwaps`.

Passing a single `Fee` is unchanged (a single portion needs no rescaling): calldata is byte-identical across UR 2.0 / 2.1.1, both trade types, portion and flat fees, `safeMode`, and the `ApproveProxy` wrapper.
