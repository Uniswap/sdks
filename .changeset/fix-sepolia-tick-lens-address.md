---
"@uniswap/sdk-core": patch
---

Fix the Sepolia `tickLensAddress`, which pointed at the UniswapInterfaceMulticall contract (`0xD7F33bCdb21b359c8ee6F0251d30E94832baAd07`) instead of the TickLens deployment at `0x0b343475d44EC2b4b8243EBF81dc888BF0A14b36`, so any TickLens call on Sepolia reverted.
