# TODO

## Universal Router v2.1 ABI Update

- [ ] **Update @uniswap/universal-router npm package**: The SDK currently uses `@uniswap/universal-router` version `2.0.0-beta.2` which doesn't include v2.1 features. Need to update to v2.1 once published.

  **Current Issue**: The SDK cannot fully test signed routes functionality because:
  - The npm package is v2.0 (doesn't have `executeSigned` function in ABI)
  - The v2.1 contracts exist locally in `lib/universal-router/` but can't be built due to missing dependencies
  - Manual encoding workaround is implemented using known function selector `0x5f8554bc`

  **What Works**:
  - ✅ `getExecuteSignedPayload()` - Generates EIP712 payloads
  - ✅ `encodeExecuteSigned()` - Manually encodes the function call
  - ⚠️ Tests are skipped until v2.1 ABI is available

  **Action Required**: Update `package.json` when v2.1 is published:
  ```json
  "@uniswap/universal-router": "^2.1.0"  // Update from 2.0.0-beta.2
  ```

## Post-Release Tasks

- [ ] **Update v4-sdk dependency in universal-router-sdk**: Once the updated `@uniswap/v4-sdk` with per-hop slippage support is published to npm, change the dependency in `package.json` from `workspace:*` back to the published version (e.g., `^1.23.0` or whatever the new version is).

  ```json
  "@uniswap/v4-sdk": "^1.23.0"  // Update to published version
  ```

- [ ] **Update v4-sdk dependency in router-sdk**: Also update `sdks/router-sdk/package.json` to use the published version instead of `workspace:*`.

- [ ] **Remove yarn resolutions**: Remove the `"@uniswap/v4-sdk": "workspace:sdks/v4-sdk"` and `"@uniswap/sdk-core": "workspace:sdks/sdk-core"` entries from the root `package.json` resolutions field.

  Currently using `workspace:*` and yarn resolutions for local development during v2.1 implementation.
