---
"@uniswap/universal-router-sdk": minor
---

Add `SwapOptions.settleBeforeSwapHooks`. A v4 exact-input route through a listed hook is encoded as `SETTLE(amountIn)` then a swap on the open delta, so hooks that `take` the input inside `beforeSwap` (for example ERC-4626 wrapper hooks) find it in the PoolManager. Routes through other hooks keep the existing encoding byte for byte. An exact-output route through a listed hook throws `SETTLE_BEFORE_SWAP_HOOK_EXACT_INPUT_ONLY`.
