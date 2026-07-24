---
'@uniswap/margin-sdk': minor
---

Initial release of the margin trading SDK for the Uniswap v4 margin periphery (MarginRouter + Morpho Blue / Aave v3 / Aave v4 lending adapters): entry-point encoders and write descriptors (increase/decrease/close/addCollateral/execute/multicall/permit), offchain MarginAccount address derivation (Solady CWIA, verified against the live mainnet router), decimal-aware leverage/LTV/health sizing math, a validated `execute`-plan builder over the v4 routing + margin action set, venue-agnostic read descriptors, and the mainnet deployment address registry.
