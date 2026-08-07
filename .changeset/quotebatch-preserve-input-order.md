---
'@uniswap/uniswapx-sdk': patch
---

UniswapX quoters: return batch results in the caller's order. `quoteBatch` / `validateBatch` (and the Relay and V4 equivalents) misattributed results for batches that mixed orders with and without block overrides — the caller got another order's quote and validation.

`getMulticallResults` dispatches each order carrying `blockOverrides` on its own `eth_call`, because a block override applies to a whole call and those orders cannot share one. It then concatenated the responses override-orders-first and returned them, discarding the caller's ordering. Since results carry no order identity, `results[i]` is the only binding to `orders[i]`, so the mismatch was silent.

Results are now scattered back into their input positions. This also corrects two places that cross-referenced the permuted results against the un-permuted input array — the exclusive-filler branch of `getValidations` and `checkTerminalStates` — which could blend one order's revert data with another order's deadline, nonce, or block override into a single verdict.

The reordering triggered whenever an order without block overrides preceded one with them: `[dutch, priority]` came back swapped, `[dutch, dutch, priority]` rotated all three. Homogeneous batches, single-order calls, and batches listing every override order first were already correct, so `quote()` and `validate()` were never affected. In practice this needed a batch mixing Dutch with Priority or Hybrid orders.

Also skips a wasted `eth_call` that `UniswapXOrderQuoter` and `RelayOrderQuoter` fired when every order in a batch carried an override, and consolidates three copies of the batching logic into one `multicallOrdersPreservingOrder` helper.
