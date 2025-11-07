# TODO

## Post-Release Tasks

- [ ] **Update v4-sdk dependency in universal-router-sdk**: Once the updated `@uniswap/v4-sdk` with per-hop slippage support is published to npm, change the dependency in `package.json` from `workspace:*` back to the published version (e.g., `^1.23.0` or whatever the new version is).

  ```json
  "@uniswap/v4-sdk": "^1.23.0"  // Update to published version
  ```

- [ ] **Update v4-sdk dependency in router-sdk**: Also update `sdks/router-sdk/package.json` to use the published version instead of `workspace:*`.

- [ ] **Remove yarn resolutions**: Remove the `"@uniswap/v4-sdk": "workspace:sdks/v4-sdk"` and `"@uniswap/sdk-core": "workspace:sdks/sdk-core"` entries from the root `package.json` resolutions field.

  Currently using `workspace:*` and yarn resolutions for local development during v2.1 implementation.
