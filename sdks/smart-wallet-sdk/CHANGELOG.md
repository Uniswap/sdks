# @uniswap/smart-wallet-sdk

## 2.8.0

### Minor Changes

- d9317ae: Add Monad (143) as a supported chain with the canonical Calibur deployments: v1.1.0 (`0x000000005c84F8Fd50b21CAC312528A64437030e`, latest) and v1.0.0 (`0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00`).

## 2.7.0

### Minor Changes

- d97c7e7: Add Calibur v1.1.0 and point `SmartWalletVersion.LATEST` at the redeployed contract `0x000000005c84F8Fd50b21CAC312528A64437030e` on all supported chains. `v1_0_0` (`0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00`) is retained so `getAllSmartWalletVersions` still recognizes wallets that have not yet re-delegated.

## 2.6.6

### Patch Changes

- Updated dependencies [4263dcf]
  - @uniswap/sdk-core@7.18.0

## 2.6.5

### Patch Changes

- d200b3b: Add Arc and Robinhood smart wallet deployment addresses.

## 2.6.4

### Patch Changes

- Updated dependencies [ca82bac]
  - @uniswap/sdk-core@7.17.0

## 2.6.3

### Patch Changes

- Updated dependencies
  - @uniswap/sdk-core@7.16.1

## 2.6.2

### Patch Changes

- Updated dependencies
  - @uniswap/sdk-core@7.16.0

## 2.6.1

### Patch Changes

- Updated dependencies [0e30be1]
  - @uniswap/sdk-core@7.15.0

## 2.6.0

### Minor Changes

- Add `encodeUserOp` method for encoding UserOperation calldata compatible with EntryPoint v0.7 and v0.8.

## 2.5.2

### Patch Changes

- Updated dependencies [58a58d0]
  - @uniswap/sdk-core@7.13.0

## 2.5.1

### Patch Changes

- Updated dependencies [1779ed4]
  - @uniswap/sdk-core@7.12.2
