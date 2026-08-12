---
'@uniswap/universal-router-sdk': minor
---

`SwapRouter.encodeSwaps` can now pay a fee to more than one recipient. `SwapSpecification.fee` accepts an array of up to `MAX_FEE_RECIPIENTS` (4) `Fee` entries alongside the single `Fee` it has always accepted; each entry becomes its own command — `PAY_PORTION` / `PAY_PORTION_FULL_PRECISION` for `portion`, `TRANSFER` for `flat` — emitted in the caller's order ahead of the settlement `SWEEP`.

This is the swap-steps counterpart to the same widening on `UniswapTrade` / `SwapRouter.swapCallParameters`. The two encoders are separate code paths, and only the pair of them together lets a caller pay more than one recipient on every route.

The sweep floor now subtracts the **sum** of the fees rather than a single one. Portions are each floored individually against the same pre-fee gross amount and then added; on-chain each `PAY_PORTION` reads the router's *current* balance, so the portions compound downward and the sum is an upper bound on what the recipients actually take — the floor can only be conservative, never short. Flat fees are absolute transfers, so their sum is exact. A total that exceeds the output is rejected (`FEE_TOTAL_GT_AMOUNT_OUT`, or `FLAT_FEE_GT_AMOUNT` for flat fees) instead of underflowing into ABI encoding.

Every existing per-fee invariant is now applied per entry rather than to a single fee: portion↔`EXACT_INPUT`, flat↔`EXACT_OUTPUT`, fractional bips requiring UR >= 2.1.1, and portion fees requiring router custody under `allowDirectTransfers`. Because `kind` is pinned by the trade type, a mixed portion/flat array is rejected by those same invariants. An empty array (`AT_LEAST_ONE_FEE_RECIPIENT_REQUIRED`) and more than `MAX_FEE_RECIPIENTS` entries (`TOO_MANY_FEE_RECIPIENTS`) are rejected in `validateEncodeSwaps`.

Passing a single `Fee` is unchanged: calldata is byte-identical to the previous release across UR 2.0 / 2.1.1, both trade types, portion and flat fees, `safeMode`, and the `ApproveProxy` wrapper.
