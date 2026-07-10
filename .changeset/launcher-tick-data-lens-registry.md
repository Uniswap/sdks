---
'@uniswap/liquidity-launcher-sdk': minor
---

Add a chain-independent auction-factory deployment registry: `AUCTION_FACTORY_DEPLOYMENTS` lists every factory ever deployed (v1 TWA, the early CCA test deploy, the CCA v2.0.0 deploy, and the 2026-07-09 blocknumberish-aware redeploy), each paired with the TickDataLens that reads its auctions. Also exports `getTickDataLensForFactory(factoryAddress)` (case-insensitive lookup, `undefined` for unknown factories), the derived `TICK_DATA_LENS_BY_FACTORY` map, and the `TICK_DATA_LENS_V1` / `TICK_DATA_LENS_V2` lens addresses. Downstream indexers can resolve a stored factory address through the registry instead of hardcoding their own factory-to-lens map, so a factory redeploy only requires bumping this package.
