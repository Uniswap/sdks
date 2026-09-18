---
'@uniswap/universal-router-sdk': minor
---

Add `UniversalRouterVersion.V2_1_2` with the Universal Router v2.1.2 deployment recorded on all 24 chains that already ran v2.1.1: mainnet (1), optimism (10), bsc (56), unichain (130), polygon (137), monad (143), xlayer (196), worldchain (480), unichain-sepolia (1301), soneium (1868), tempo (4217), megaeth (4326), robinhood (4663), arc (5042), base (8453), arbitrum (42161), celo (42220), avalanche (43114), ink (57073), linea (59144), blast (81457), base-sepolia (84532), zora (7777777) and sepolia (11155111). Addresses are taken from `Uniswap/universal-router#516`; each `creationBlock` was resolved from chain state and verified to sit after that chain's v2.1.1 block.

`UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_1_2, chainId)` and `UNIVERSAL_ROUTER_CREATION_BLOCK(…)` now resolve on every one of those chains. On Ink, v2.1.2 is a standalone router (`0x661E93cc…`) rather than the v2.2.0 alias that currently backs `V2_1_1` there. Arc (5042) and Robinhood (4663), which previously had only `V2_1_1`, now also carry `V2_1_2`.

**Intentionally unchanged**: all existing `V1_2` / `V2_0` / `V2_1_1` / `V2_2_0` entries, every `weth` and `swapProxy` address, and the `RouterConfig` / `ChainConfig` shapes. `isAtLeastV2_1_1('2.1.2')` returns `true`, so 2.1.2 callers get the same 1e18-precision fee encoding as 2.1.1. Note that `V2_2_0` is retained and is a separate, *earlier* deployment than v2.1.2 (mainnet block 25733844 vs 25999984) despite the higher version string — 2.2.0 is the permissioned-pool router and is not superseded by this change. No ABI, command, or function-signature changes.
