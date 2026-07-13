---
'@uniswap/universal-router-sdk': minor
---

Support Universal Router v2.3.0's 3-parameter UNWRAP_WETH. From v2.3.0 the command encodes (recipient, amount, minAmount) instead of (recipient, amountMinimum): `amount` is the exact amount of WETH to unwrap, and CONTRACT_BALANCE (2^255) is the only unwrap-the-full-balance sentinel (0 now unwraps nothing). Adds `UniversalRouterVersion.V2_3_0` and `isAtLeastV2_3_0`, a version-layered UNWRAP_WETH ABI override used by both encoding (RoutePlanner/createCommand) and decoding (CommandParser), and an optional exact `amount` field on the UNWRAP_WETH swap step (validated to require urVersion >= 2.3.0). All internal call sites preserve legacy unwrap-the-full-balance semantics via CONTRACT_BALANCE when encoding for >= 2.3.0. Note: calldata built with urVersion >= 2.3.0 must only be sent to v2.3.0+ router deployments, and 2-parameter calldata reverts on v2.3.0 routers.
