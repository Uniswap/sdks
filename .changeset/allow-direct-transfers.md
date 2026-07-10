---
'@uniswap/universal-router-sdk': minor
---

`SwapRouter.encodeSwaps`: add `allowDirectTransfers`, an opt-in validation regime letting routing-supplied steps move funds directly between the user and pools (per-step `payerIsUser` on V2/V3 swaps and v4 SETTLE, step recipients equal to the spec recipient, v4 SETTLE_ALL/TAKE_ALL). The SDK enforces an inbound budget (total contract-enforced direct pulls never exceed `exactOrMaxAmountIn`; ingress pulls only the remainder) and outbound coverage (contract-enforced direct output minimums reduce the final sweep floor). Portion fees still require full output custody.

Tightened in the default regime: v4 `SETTLE_ALL` and `TAKE_ALL` are now rejected at encode time unless `allowDirectTransfers` is set — both act on `msgSender()` directly on-chain and could previously only revert, double-charge, or bypass the fee/sweep envelope under custody encoding.

Also exports `computeEncodeSwapsAmounts` (and the `EncodeSwapsAmounts` type) so integrators can derive the trade-level amount bounds from a `SwapSpecification` without reimplementing the math.
