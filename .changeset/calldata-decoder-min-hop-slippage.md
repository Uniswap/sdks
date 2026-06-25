---
'@uniswap/universal-router-sdk': patch
---

Fix `CommandParser.parseCalldata` to decode the `minHopPriceX36` per-hop slippage parameter added in UniversalRouter V2.1.1. The decoder now accepts an optional `UniversalRouterVersion` (defaulting to `V2_0` for backwards compatibility) and uses the V2.1.1 V2/V3 swap command definitions plus the versioned V4 action parser so the trailing `minHopPriceX36` array is no longer silently dropped.
