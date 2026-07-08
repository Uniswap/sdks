---
"@uniswap/liquidity-launcher-sdk": minor
---

Add Avalanche (43114), XLayer (196), and Robinhood Chain (4663) to the supported launch chains. Avalanche and XLayer launch with pre-existing tokens only (no token factory deployed); Robinhood carries the uERC20 factory. Robinhood is intentionally omitted from `BLOCK_TIME_SECONDS_BY_CHAIN` — like Arbitrum, its contract-visible `block.number` tracks Ethereum L1 (~12s).
