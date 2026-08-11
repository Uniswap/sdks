---
'@uniswap/sdk-core': minor
---

Correct deployment addresses and split Quoter/QuoterV2

- Separate quoterAddress (V1) and quoterV2Address (V2) in ChainAddresses
- Add ground-truth quoterAddress, quoterV2Address, tickLensAddress, and swapRouter02Address deployments for all active chains
- Fix SWAP_ROUTER_02_ADDRESSES and QUOTER_ADDRESSES fallbacks for unsupported chains

