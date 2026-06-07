# @uniswap/v2-sdk

## 4.20.4

### Patch Changes

- Updated dependencies [ca82bac]
  - @uniswap/sdk-core@7.17.0

## 4.20.3

### Patch Changes

- Updated dependencies
  - @uniswap/sdk-core@7.16.1

## 4.20.2

### Patch Changes

- Updated dependencies
  - @uniswap/sdk-core@7.16.0

## 4.20.1

### Patch Changes

- Updated dependencies [0e30be1]
  - @uniswap/sdk-core@7.15.0

## 4.20.0

### Minor Changes

- 58a58d0: Migrate build system from TSDX to tsc with separate CJS/ESM/types outputs. The new `exports` field ensures correct module resolution for all standard consumers (`import`/`require` of the package root). Deep subpath imports (e.g., `@uniswap/sdk-core/dist/...`) are no longer supported — all public APIs are re-exported from the package entry point. `tslib` is now a runtime dependency (required by `importHelpers`). Minimum Node.js version is now 18.

### Patch Changes

- Updated dependencies [58a58d0]
  - @uniswap/sdk-core@7.13.0

## 4.19.2

### Patch Changes

- Updated dependencies [1779ed4]
  - @uniswap/sdk-core@7.12.2
