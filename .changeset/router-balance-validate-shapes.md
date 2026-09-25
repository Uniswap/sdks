---
'@uniswap/universal-router-sdk': patch
---

`routerBalanceInput` shape checks move into `validateEncodeSwaps`, so a plan the rewrite cannot express is refused before encoding rather than throwing mid-transform: an unwrap with no native leg after it, more than one native leg after the unwrap, a split leg with no comparable amount, and a v4 step nominating two open-delta swaps on the same currency. The transform keeps the same assertions as a backstop. Callers that mapped a transform throw to a 500 now get the same typed refusal both encode paths already produce.
