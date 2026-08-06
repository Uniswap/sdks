---
'@uniswap/uniswapx-sdk': minor
---

Rename `multicallSameContractManyFunctions` to `multicallSameContractManyCalls`. The old name is still exported as a deprecated alias, so no existing import breaks.

The helper resolves `functionName` to a single fragment once, then encodes one call per entry in `functionParams` — it varies the arguments of one function, not the function itself. `functionName` living in the shared `MulticallParams` base type already makes "many functions" impossible: its sibling `multicallSameFunctionManyContracts` extends the same base and varies the address instead, and that one is named accurately.

No capability was missing. `multicall` is exported and takes arbitrary `{target, callData}` pairs, so heterogeneous functions and contracts were always reachable through it; these two helpers are narrow conveniences over it, one of them mislabeled.
