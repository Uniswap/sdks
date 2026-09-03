---
'@uniswap/universal-router-sdk': minor
---

`SwapOptions.routerBalanceInput` on both encode paths (`SwapRouter.swapCallParameters` and `encodeSwaps`): the swap spends whatever input-token balance the Universal Router already holds instead of pulling it from the swapper via Permit2. The first hop's amount is encoded as `CONTRACT_BALANCE`, and an optional `routerBalanceInput.minimumAmount` is asserted up front with `BALANCE_CHECK_ERC20` against the router's own address, so an under-funded router reverts before any swap runs. Split routes are supported: fixed legs are encoded first at their quoted amounts and the largest leg last as `CONTRACT_BALANCE`, with one aggregate sweep floor.

Intended for bridged or relayer-delivered funds that land in the router and are swapped in the same transaction. `routerBalanceInput` requires `TradeType.EXACT_INPUT`, an explicit recipient (not `SENDER_AS_RECIPIENT`, since `msg.sender` is the funder rather than the swapper), and is mutually exclusive with `inputTokenPermit`, `nativeErc20Input` and `TokenTransferMode.ApproveProxy`. Callers that don't set the option get byte-identical calldata to the previous release.
