---
'@uniswap/liquidity-launcher-sdk': patch
---

Update lock recipient creation bytecodes to the latest liquidity-launcher artifacts (commit e4660af). Picks up the new BlockNumberish that detects the ArbSys precompile at construction time instead of hardcoding the Arbitrum One chain id.
