# @uniswap/universal-router-sdk

## 5.7.0

### Minor Changes

- aafa8fc: Add `nativeErc20Input` swap option for chains whose native gas token is exposed via an ERC20 predeploy (e.g. USDC on Arc). When set, swaps are funded by attaching `msg.value = maximumAmountIn * 10^(18 - token.decimals)` instead of pulling the input via Permit2: the Universal Router self-funds (`payerIsUser = false`), no ERC20 approval or permit is ever needed, and unused input is swept back to the recipient on exact-output / partial-fill-risk trades. Off by default; incompatible with native input, `inputTokenPermit`, and `TokenTransferMode.ApproveProxy`.

### Patch Changes

- a8a1cb1: `nativeErc20Input` exact-output / partial-fill refunds now sweep the leftover input as native (`ETH_ADDRESS`) instead of the ERC20. The router's leftover lives in its native balance (18 decimals); an ERC20 sweep floors to the token's decimals (e.g. 6 for Arc USDC) and can strand sub-decimal dust in the router.

## 5.6.0

### Minor Changes

- ca82bac: Add Robinhood (4663) and Arc (5042) chain and Universal Router deployment config.

  Also corrects `ChainId.ROBINHOOD` from `46630` to `4663` to match the canonical Robinhood
  mainnet chain ID used across Uniswap's backend and the contracts deployments repo. Robinhood
  had no addresses wired up previously, so this is shipped as a minor bump.

### Patch Changes

- Updated dependencies [ca82bac]
  - @uniswap/sdk-core@7.17.0
  - @uniswap/router-sdk@2.10.4
  - @uniswap/v2-sdk@4.20.4
  - @uniswap/v3-sdk@3.30.4
  - @uniswap/v4-sdk@2.2.2

## 5.5.2

### Patch Changes

- Fix UR version mapping with v4-sdk

## 5.5.1

### Patch Changes

- Add mainnet UniversalRouterVersion V2_2_0 router config and update sepolia V2_2_0 address (perm-pool redeploy)
- Updated dependencies
  - @uniswap/sdk-core@7.16.1
  - @uniswap/v4-sdk@2.2.1
  - @uniswap/router-sdk@2.10.3
  - @uniswap/v2-sdk@4.20.3
  - @uniswap/v3-sdk@3.30.3

## 5.5.0

### Minor Changes

- Add UniversalRouterVersion V2_2_0 (Sepolia) with permissioned-pool support

### Patch Changes

- Updated dependencies
  - @uniswap/sdk-core@7.16.0
  - @uniswap/v4-sdk@2.2.0
  - @uniswap/router-sdk@2.10.2
  - @uniswap/v2-sdk@4.20.2
  - @uniswap/v3-sdk@3.30.2

## 5.4.0

### Minor Changes

- 0e30be1: Add MegaETH chain and Universal Router deployment config

### Patch Changes

- Updated dependencies [0e30be1]
  - @uniswap/sdk-core@7.15.0
  - @uniswap/router-sdk@2.10.1
  - @uniswap/v2-sdk@4.20.1
  - @uniswap/v3-sdk@3.30.1
  - @uniswap/v4-sdk@2.1.1

## 5.3.0

### Minor Changes

- e8e7bd5: Add SwapRouter.encodeSwaps(spec, swapSteps), an alternative entry point for callers that can provide explicit SwapStep[] plans

## 5.2.0

### Minor Changes

- 5398a2c: Rename maxHopSlippage to minHopPriceX36

### Patch Changes

- Updated dependencies [5398a2c]
  - @uniswap/router-sdk@2.10.0
  - @uniswap/v4-sdk@2.1.0

## 5.1.0

### Minor Changes

- 061f054: Use `UniversalRouterVersion` for `SwapOptions.urVersion` instead of v4-sdk's `URVersion`. Version logic (`isAtLeastV2_1_1`) is now local to universal-router-sdk. Consumers should use `UniversalRouterVersion` from this package.

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
