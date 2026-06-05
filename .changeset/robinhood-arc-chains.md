---
"@uniswap/sdk-core": minor
"@uniswap/universal-router-sdk": minor
---

Add Robinhood (4663) and Arc (5042) chain and Universal Router deployment config.

Also corrects `ChainId.ROBINHOOD` from `46630` to `4663` to match the canonical Robinhood
mainnet chain ID used across Uniswap's backend and the contracts deployments repo. Robinhood
had no addresses wired up previously, so this is shipped as a minor bump.
