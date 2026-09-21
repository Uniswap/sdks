---
"@uniswap/universal-router-sdk": minor
---

`swapCallParameters` output floors:

- `EXACT_OUTPUT` trades that contain a V2 leg now route every leg through router custody and settle with a `SWEEP` (or `UNWRAP_WETH`) floored at `amountOut`. The Universal Router's `v2SwapExactOutput` only bounds `amountIn` and forwards whatever the pair actually produced, so when less than the computed `amountIn` reached the pair (a fee-on-transfer input, or any pre-pair shortfall) the recipient received less than the requested output without a revert; the router now reverts (`InsufficientToken` / `InsufficientETH`) instead. V3 and V4 exact-out legs already assert their own output and keep the direct-recipient encoding.
- When the router custodies output that must be wrapped (a native-ETH path settling into WETH), settlement is now `WRAP_ETH(ROUTER, CONTRACT_BALANCE)` followed by a floored `SWEEP(WETH, recipient, minimum)` instead of an unfloored `WRAP_ETH(recipient, CONTRACT_BALANCE)`. Custodied legs carry `amountOutMinimum = 0`, so this settlement was previously the trade's only output check and had none.

`EXACT_INPUT` encoding is unchanged except for the wrapped-output settlement above. No-fee, ERC-20-output V2 exact-out swaps gain one `SWEEP` command and one router→recipient transfer.
