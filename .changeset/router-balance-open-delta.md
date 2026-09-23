---
'@uniswap/universal-router-sdk': patch
---

`routerBalanceInput` no longer adds a second open-delta swap to a v4 step that already has one. GuideStar writes intermediate steps with one `SWAP_EXACT_IN*` at `amountIn: 0`, and the remainder picker compared amounts, so that nominated leg always lost to a fixed slice and a second open-delta swap was created: the first consumed the whole delta and the second reverted. A step that already nominates its remainder now keeps it, one that does not keeps the previous largest-last behaviour, and a step with two is refused. A post-rewrite invariant asserts exactly one open-delta swap per input currency.
