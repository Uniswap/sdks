---
'@uniswap/universal-router-sdk': minor
---

`routerBalanceInput` now supports a native (ETH) input. The router is funded via `msg.value` on `execute()` and the route's `WRAP_ETH` wraps the router's whole native balance (`CONTRACT_BALANCE`), so nothing is left behind; when `routerBalanceInput.minimumAmount` is set the floor is asserted post-wrap as WETH with `BALANCE_CHECK_ERC20`. A trailing native sweep returns any dust to the recipient, and the encoded transaction `value` is `0` because the funder, not the swapper, attaches the ETH.

Routes that consume native directly (a pure-native v4 first pool, so no wrap step exists) are refused in the `UniswapTrade` constructor with `routerBalanceInput with a native input requires a route that wraps to WETH`; split routes with a native input require every leg to wrap. Recipients that resolve to a Universal Router sentinel (`address(1)`, `address(2)`) or the zero address are refused, since with a router-funded swap they would pay the filler, strand the output in the router, or burn it.
