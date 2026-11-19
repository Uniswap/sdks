---
'@uniswap/margin-sdk': patch
---

Point the SDK at the 2026-11-19 margin suite, deployed at one address table on Ethereum mainnet, Base, Arbitrum One and Robinhood Chain (`SupportedChainId` gains `BASE`, `ARBITRUM_ONE` and `ROBINHOOD_CHAIN`). `lendingAdapters` lists an adapter only where its venue is deployed: Base and Arbitrum One have no Aave v4 adapter, Robinhood Chain has Morpho Blue only. The ABI bindings are re-pinned to v4-periphery `dce24b92`, and the account derivation vectors come from the new router. The 2026-10-22 mainnet suite is no longer in the address table.
