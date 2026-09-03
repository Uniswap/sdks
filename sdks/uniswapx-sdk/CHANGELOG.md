# @uniswap/uniswapx-sdk

## 3.1.1

### Patch Changes

- Updated dependencies [9a52777]
  - @uniswap/sdk-core@7.19.2

## 3.1.0

### Minor Changes

- dd518c4: Rename `multicallSameContractManyFunctions` to `multicallSameContractManyCalls`. The old name is still exported as a deprecated alias, so no existing import breaks.

  The helper resolves `functionName` to a single fragment once, then encodes one call per entry in `functionParams` — it varies the arguments of one function, not the function itself. `functionName` living in the shared `MulticallParams` base type already makes "many functions" impossible: its sibling `multicallSameFunctionManyContracts` extends the same base and varies the address instead, and that one is named accurately.

  No capability was missing. `multicall` is exported and takes arbitrary `{target, callData}` pairs, so heterogeneous functions and contracts were always reachable through it; these two helpers are narrow conveniences over it, one of them mislabeled.

### Patch Changes

- 241fb9a: Add Ink (chainId 57073) DutchV3 support. The reactor and OrderQuoter are deployed and source-verified on Ink; these are the mapping entries that let the SDK resolve them.

  - `REACTOR_ADDRESS_MAPPING[57073][Dutch_V3]` → `0x000000007A1C8e570011EeDF86A2A35593013cBA`. This is the same address as Robinhood (4663), as chains 130/196/1868 already share `0x000000005aF6…`; `REVERSE_REACTOR_MAPPING` collapses shared addresses to one key, which is correct since both are `Dutch_V3`.
  - `UNISWAPX_ORDER_QUOTER_MAPPING[57073]` → canonical `0x00000000a3db63Df9078cBF3dF88B4CAdD5a7F58`. Required: `constructSameAddressMap` only seeds the five `NETWORKS_WITH_SAME_ADDRESS` chains, so without an explicit entry the lookup is `undefined` and `UniswapXOrderQuoter`'s constructor throws `MissingConfiguration("quoter", "57073")`.
  - `PERMIT2_MAPPING[57073]` → canonical Permit2, verified on-chain (9,152 bytes, non-zero `DOMAIN_SEPARATOR()`).
  - `EXCLUSIVE_FILLER_VALIDATION_MAPPING[57073]` → zero address, matching every other V3-only chain. Required, and the quieter of the two: without an entry the lookup is `undefined`, and `encodeExclusiveFillerData` assigns it into `ValidationInfo.additionalValidationContract` unguarded, so `undefined` propagates into order construction instead of throwing. Exclusivity itself is reactor-enforced via `ExclusivityLib`; the zero address makes the hook correctly inert.

  No entry is added for `Priority`, `Dutch_V2`, `Hybrid`, or the `UNISWAPX_V4_*` mappings — no such reactors are deployed on Ink, and the absence is what makes x-service's `OffChainUniswapXOrderValidator.validateReactorAddress` reject those order types for the chain.

  Ink needs no chain-specific order-construction handling: it is a standard OP-stack L2 with 1s blocks, a real dynamic EIP-1559 basefee, and native ETH, so `adjustmentPerGweiBaseFee` keeps its normal non-zero treatment and the native sentinel is usable. `@uniswap/sdk-core` already has full Ink coverage (`ChainId.INK`, `INK_ADDRESSES`, `WETH9[57073]`, 1s block time).

- 1797f3b: UniswapX quoters: return batch results in the caller's order. `quoteBatch` / `validateBatch` (and the Relay and V4 equivalents) misattributed results for batches that mixed orders with and without block overrides — the caller got another order's quote and validation.

  `getMulticallResults` dispatches each order carrying `blockOverrides` on its own `eth_call`, because a block override applies to a whole call and those orders cannot share one. It then concatenated the responses override-orders-first and returned them, discarding the caller's ordering. Since results carry no order identity, `results[i]` is the only binding to `orders[i]`, so the mismatch was silent.

  Results are now scattered back into their input positions. This also corrects two places that cross-referenced the permuted results against the un-permuted input array — the exclusive-filler branch of `getValidations` and `checkTerminalStates` — which could blend one order's revert data with another order's deadline, nonce, or block override into a single verdict.

  The reordering triggered whenever an order without block overrides preceded one with them: `[dutch, priority]` came back swapped, `[dutch, dutch, priority]` rotated all three. Homogeneous batches, single-order calls, and batches listing every override order first were already correct, so `quote()` and `validate()` were never affected. In practice this needed a batch mixing Dutch with Priority or Hybrid orders.

  Also skips a wasted `eth_call` that `UniswapXOrderQuoter` and `RelayOrderQuoter` fired when every order in a batch carried an override, and consolidates three copies of the batching logic into one `multicallOrdersPreservingOrder` helper.

- Updated dependencies [4600c8d]
  - @uniswap/sdk-core@7.19.1

## 3.0.11

### Patch Changes

- Updated dependencies [8dc2570]
- Updated dependencies [0b2b31c]
  - @uniswap/sdk-core@7.19.0

## 3.0.10

### Patch Changes

- 8ccefd4: Add Robinhood (4663) and Arc (5042) Dutch_V3 reactors to REACTOR_ADDRESS_MAPPING, their canonical OrderQuoter entries in UNISWAPX_ORDER_QUOTER_MAPPING, and zero-address EXCLUSIVE_FILLER_VALIDATION_MAPPING entries (exclusivity is reactor-enforced).

## 3.0.9

### Patch Changes

- Updated dependencies [4263dcf]
  - @uniswap/sdk-core@7.18.0

## 3.0.8

### Patch Changes

- a9877ce: Add all remaining supported chains to PERMIT2_MAPPING: Rootstock (30), Gnosis (100), Moonbeam (1284), MegaETH (4326), Robinhood (4663), Arc (5042), Monad Testnet (10143), Linea (59144), Base Sepolia (84532), Arbitrum Sepolia (421614), Optimism Sepolia (11155420), and Zora Sepolia (999999999) at the canonical Permit2 address, plus zkSync Era (324) at its non-canonical address (different create2 derivation).

## 3.0.7

### Patch Changes

- Updated dependencies [ca82bac]
  - @uniswap/sdk-core@7.17.0

## 3.0.6

### Patch Changes

- Updated dependencies
  - @uniswap/sdk-core@7.16.1

## 3.0.5

### Patch Changes

- Updated dependencies
  - @uniswap/sdk-core@7.16.0

## 3.0.4

### Patch Changes

- Updated dependencies [0e30be1]
  - @uniswap/sdk-core@7.15.0

## 3.0.2

### Patch Changes

- Updated dependencies [58a58d0]
  - @uniswap/sdk-core@7.13.0

## 3.0.1

### Patch Changes

- Updated dependencies [1779ed4]
  - @uniswap/sdk-core@7.12.2
