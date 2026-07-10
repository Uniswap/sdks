---
'@uniswap/liquidity-launcher-sdk': patch
---

Point `ccaFactory` at the blocknumberish-v1.1.0 CCA factory (`0x000000001F26a0044BaA66024e7b6599c61963F8`) on every chain, not just Robinhood. The v3.1.0 LBPStrategy deployments shipped in #632 all create their auctions through this factory (verified on-chain via `LBPStrategy.initializerFactory()` on mainnet, base, unichain, arbitrum, avalanche, xlayer, sepolia, and base-sepolia), but `ccaFactory` was still reporting the legacy factory (`0x00cCa200BF124dBfA848937c553864f4B4CE0632`) for all non-Robinhood chains. Consumers resolving a chain's auction factory from the SDK (e.g. to pick the TickDataLens) now get the address auctions are actually created from. The legacy factory is retained in `AUCTION_FACTORY_DEPLOYMENTS` so historical auctions still resolve.
