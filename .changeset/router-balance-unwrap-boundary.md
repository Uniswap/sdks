---
'@uniswap/universal-router-sdk': patch
---

`routerBalanceInput` no longer double-claims the delivered balance when WETH is the input and the plan unwraps mid-route into a native v4 pool. `UNWRAP_WETH` takes the router's entire WETH balance, so it is already the open-ended leg; promoting a v3 leg to `CONTRACT_BALANCE` as well drained the pot and left the unwrap reverting on its `amountMin`. The WETH legs now keep their quoted amounts and the leg spending the unwrapped ETH becomes the `CONTRACT_BALANCE` claim, so over-delivery reaches the recipient instead of stranding in the router.

Shapes that cannot be expressed are refused rather than mis-encoded: an input-token leg after the unwrap (`ROUTER_BALANCE_INPUT_WETH_LEG_AFTER_UNWRAP`), an unwrap with no native leg following it, and more than one native leg after the unwrap. An unwrap that drains an intermediate token rather than the delivered one is unaffected.
