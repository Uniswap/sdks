---
"@uniswap/universal-router-sdk": minor
---

A route through a hook in `settleBeforeSwapHooks` now takes back, after the swap, the input currency of each hop through a listed hook, on the open delta, to the recipient. A listed hook may spend less than its hop's input and credit the rest to the router (for example a hook that fills from a limit-order book and returns what it could not fill); before, that credit was never taken and the swap reverted with `CurrencyNotSettled`. A hook that spends the whole input leaves no credit and the take moves nothing. Mixed-route v4 sections through a listed hook get the same take. Routes through unlisted hooks are unchanged.
