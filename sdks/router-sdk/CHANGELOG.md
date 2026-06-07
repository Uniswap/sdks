# @uniswap/router-sdk

## 2.10.3

### Patch Changes

- Updated dependencies
  - @uniswap/sdk-core@7.16.1
  - @uniswap/v4-sdk@2.2.1
  - @uniswap/v2-sdk@4.20.3
  - @uniswap/v3-sdk@3.30.3

## 2.10.2

### Patch Changes

- Updated dependencies
  - @uniswap/sdk-core@7.16.0
  - @uniswap/v4-sdk@2.2.0
  - @uniswap/v2-sdk@4.20.2
  - @uniswap/v3-sdk@3.30.2

## 2.10.1

### Patch Changes

- Updated dependencies [0e30be1]
  - @uniswap/sdk-core@7.15.0
  - @uniswap/v2-sdk@4.20.1
  - @uniswap/v3-sdk@3.30.1
  - @uniswap/v4-sdk@2.1.1

## 2.10.0

### Minor Changes

- 5398a2c: Rename maxHopSlippage to minHopPriceX36

### Patch Changes

- Updated dependencies [5398a2c]
  - @uniswap/v4-sdk@2.1.0

## 2.9.0

### Minor Changes

- 1726505: Optional **`maxHopSlippage`** (`bigint[]` per swap leg) on **`Trade.swaps`** for per-hop slippage (e.g. UR 2.1.1+).

### Patch Changes

- Updated dependencies [1726505]
  - @uniswap/v4-sdk@2.0.0

## 2.8.0

### Minor Changes

- 58a58d0: Migrate build system from TSDX to tsc with separate CJS/ESM/types outputs. The new `exports` field ensures correct module resolution for all standard consumers (`import`/`require` of the package root). Deep subpath imports (e.g., `@uniswap/sdk-core/dist/...`) are no longer supported — all public APIs are re-exported from the package entry point. `tslib` is now a runtime dependency (required by `importHelpers`). Minimum Node.js version is now 18.

### Patch Changes

- Updated dependencies [58a58d0]
  - @uniswap/sdk-core@7.13.0
  - @uniswap/v2-sdk@4.20.0
  - @uniswap/v3-sdk@3.30.0
  - @uniswap/v4-sdk@1.30.0

## 2.7.3

### Patch Changes

- Updated dependencies
  - @uniswap/v4-sdk@1.29.3

## 2.7.2

### Patch Changes

- Updated dependencies [1779ed4]
  - @uniswap/sdk-core@7.12.2
  - @uniswap/v2-sdk@4.19.2
  - @uniswap/v3-sdk@3.29.2
  - @uniswap/v4-sdk@1.29.2
