---
'@uniswap/universal-router-sdk': minor
---

Add `nativeErc20Input` swap option for chains whose native gas token is exposed via an ERC20 predeploy (e.g. USDC on Arc). When set, swaps are funded by attaching `msg.value = maximumAmountIn * 10^(18 - token.decimals)` instead of pulling the input via Permit2: the Universal Router self-funds (`payerIsUser = false`), no ERC20 approval or permit is ever needed, and unused input is swept back to the recipient on exact-output / partial-fill-risk trades. Off by default; incompatible with native input, `inputTokenPermit`, and `TokenTransferMode.ApproveProxy`.
