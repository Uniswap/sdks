---
"@uniswap/sdk-core": minor
"@uniswap/v2-sdk": minor
"@uniswap/v3-sdk": minor
"@uniswap/v4-sdk": minor
"@uniswap/router-sdk": minor
"@uniswap/universal-router-sdk": minor
---

Migrate build system from TSDX to tsc with separate CJS/ESM/types outputs. The new `exports` field ensures correct module resolution for all standard consumers (`import`/`require` of the package root). Deep subpath imports (e.g., `@uniswap/sdk-core/dist/...`) are no longer supported — all public APIs are re-exported from the package entry point. `tslib` is now a runtime dependency (required by `importHelpers`). Minimum Node.js version is now 18.
