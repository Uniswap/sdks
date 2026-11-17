---
'@uniswap/margin-sdk': patch
---

Add `buildV4NativePoolExactOutRoute` for v4 pools with ETH on one side serving a WETH market: selling WETH pulls the cap with `PERMIT2_TRANSFER_FROM`, unwraps it, settles the swap from the Universal Router's own ETH and wraps the change back to the margin router (`WRAP_ETH(MSG_SENDER, CONTRACT_BALANCE)`); buying WETH takes the ETH into the Universal Router and wraps exactly `amountOut` to the account. `buildV4ExactOutRoute` dispatches to it when given `weth9` and otherwise explains what is missing instead of throwing `MARKET_MISMATCH`.
