---
'@uniswap/uniswapx-sdk': patch
---

Add Ink (chainId 57073) DutchV3 support. The reactor and OrderQuoter are deployed and source-verified on Ink; these are the mapping entries that let the SDK resolve them.

- `REACTOR_ADDRESS_MAPPING[57073][Dutch_V3]` → `0x000000007A1C8e570011EeDF86A2A35593013cBA`. This is the same address as Robinhood (4663), as chains 130/196/1868 already share `0x000000005aF6…`; `REVERSE_REACTOR_MAPPING` collapses shared addresses to one key, which is correct since both are `Dutch_V3`.
- `UNISWAPX_ORDER_QUOTER_MAPPING[57073]` → canonical `0x00000000a3db63Df9078cBF3dF88B4CAdD5a7F58`. Required: `constructSameAddressMap` only seeds the five `NETWORKS_WITH_SAME_ADDRESS` chains, so without an explicit entry the lookup is `undefined` and `UniswapXOrderQuoter`'s constructor throws `MissingConfiguration("quoter", "57073")`.
- `PERMIT2_MAPPING[57073]` → canonical Permit2, verified on-chain (9,152 bytes, non-zero `DOMAIN_SEPARATOR()`).
- `EXCLUSIVE_FILLER_VALIDATION_MAPPING[57073]` → zero address, matching every other V3-only chain. Required, and the quieter of the two: without an entry the lookup is `undefined`, and `encodeExclusiveFillerData` assigns it into `ValidationInfo.additionalValidationContract` unguarded, so `undefined` propagates into order construction instead of throwing. Exclusivity itself is reactor-enforced via `ExclusivityLib`; the zero address makes the hook correctly inert.

No entry is added for `Priority`, `Dutch_V2`, `Hybrid`, or the `UNISWAPX_V4_*` mappings — no such reactors are deployed on Ink, and the absence is what makes x-service's `OffChainUniswapXOrderValidator.validateReactorAddress` reject those order types for the chain.

Ink needs no chain-specific order-construction handling: it is a standard OP-stack L2 with 1s blocks, a real dynamic EIP-1559 basefee, and native ETH, so `adjustmentPerGweiBaseFee` keeps its normal non-zero treatment and the native sentinel is usable. `@uniswap/sdk-core` already has full Ink coverage (`ChainId.INK`, `INK_ADDRESSES`, `WETH9[57073]`, 1s block time).
