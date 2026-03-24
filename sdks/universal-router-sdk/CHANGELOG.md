# @uniswap/universal-router-sdk

## 5.1.0

### Minor Changes

- c603b90: Use `UniversalRouterVersion` for `SwapOptions.urVersion` instead of v4-sdk's `URVersion`. Version logic (`isAtLeastV2_1_1`) is now local to universal-router-sdk. Consumers should use `UniversalRouterVersion` from this package.

## 5.0.0

### Major Changes

- 1726505: ### Major: Universal Router 2.1.1

  - Adds **`UniversalRouterVersion.V2_1_1`** addresses/blocks where deployed.
  - **`URVersion.V2_1` removed** — use **`URVersion.V2_1_1`** for UR **2.1.1** (or **`V2_0`** for older router ABIs). **2.1** had a **per-hop slippage precision bug** (`maxHopSlippage` could fail to enforce on some high–decimal / price–skew pools); **2.1.1** fixes that with higher-precision on-chain math.
  - **`PAY_PORTION_FULL_PRECISION`** (1e18) replaces **`PAY_PORTION`** (bips) for percentage **`fee`** options when using **`V2_1_1`** — finer fractional fees; re-check exact-output + fee calldata if you upgrade.
  - **`maxHopSlippage`** on V2, V3, and V4 swaps: extended ABIs when using **`V2_1_1`**; **`V2_0`** stays the old encoding.

### Patch Changes

- Updated dependencies [1726505]
- Updated dependencies [1726505]
  - @uniswap/router-sdk@2.9.0
  - @uniswap/v4-sdk@2.0.0

## 4.35.0

### Minor Changes

- 58a58d0: Migrate build system from TSDX to tsc with separate CJS/ESM/types outputs. The new `exports` field ensures correct module resolution for all standard consumers (`import`/`require` of the package root). Deep subpath imports (e.g., `@uniswap/sdk-core/dist/...`) are no longer supported — all public APIs are re-exported from the package entry point. `tslib` is now a runtime dependency (required by `importHelpers`). Minimum Node.js version is now 18.

### Patch Changes

- Updated dependencies [58a58d0]
  - @uniswap/sdk-core@7.13.0
  - @uniswap/v2-sdk@4.20.0
  - @uniswap/v3-sdk@3.30.0
  - @uniswap/v4-sdk@1.30.0
  - @uniswap/router-sdk@2.8.0

## 4.34.2

### Patch Changes

- Updated dependencies
  - @uniswap/v4-sdk@1.29.3
  - @uniswap/router-sdk@2.7.3

## 4.34.1

### Patch Changes

- Updated dependencies [1779ed4]
  - @uniswap/sdk-core@7.12.2
  - @uniswap/router-sdk@2.7.2
  - @uniswap/v2-sdk@4.19.2
  - @uniswap/v3-sdk@3.29.2
  - @uniswap/v4-sdk@1.29.2
