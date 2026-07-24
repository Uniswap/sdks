---
'@uniswap/margin-sdk': patch
---

Initial pre-release of the margin trading SDK for the Uniswap v4 margin periphery (MarginRouter + Morpho Blue / Aave v3 / Aave v4 lending adapters): entry-point encoders and write descriptors (increase/decrease/close/addCollateral/execute/multicall/permit), offchain MarginAccount address derivation (Solady CWIA, verified against the live mainnet router), decimal-aware leverage/LTV/health sizing math, a validated `execute`-plan builder over the v4 routing + margin action set, venue-agnostic read descriptors, and the mainnet deployment address registry. Published as 0.0.x deliberately: the contracts (Uniswap/v4-periphery#563) are still in review and governance has not yet been handed to a timelock/multisig — the package graduates to 0.1.0 once the deployment is final.
