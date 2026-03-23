# @uniswap/v4-sdk

## 2.0.0

### Major Changes

- 1726505: ### Major: Universal Router 2.1.1

  - **`URVersion.V2_1` removed** — use **`URVersion.V2_1_1`** for UR **2.1.1** (or **`V2_0`** for older router ABIs). **2.1** had a **per-hop slippage precision bug** (`maxHopSlippage` could fail to enforce on some high–decimal / price–skew pools); **2.1.1** fixes that with higher-precision on-chain math.
  - **`URVersion.V2_1_1`** swap ABIs include **`maxHopSlippage`** on **single-hop** V4 swaps (in addition to multi-hop); **`V2_0`** keeps structs without per-hop fields.

## 1.30.0

### Minor Changes

- 58a58d0: Migrate build system from TSDX to tsc with separate CJS/ESM/types outputs. The new `exports` field ensures correct module resolution for all standard consumers (`import`/`require` of the package root). Deep subpath imports (e.g., `@uniswap/sdk-core/dist/...`) are no longer supported — all public APIs are re-exported from the package entry point. `tslib` is now a runtime dependency (required by `importHelpers`). Minimum Node.js version is now 18.

### Patch Changes

- Updated dependencies [58a58d0]
  - @uniswap/sdk-core@7.13.0
  - @uniswap/v3-sdk@3.30.0

## 1.29.3

### Patch Changes

- fix increase liquidity to use

## 1.29.2

### Patch Changes

- Updated dependencies [1779ed4]
  - @uniswap/sdk-core@7.12.2
  - @uniswap/v3-sdk@3.29.2
