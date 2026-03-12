---
"@uniswap/sdk-core": patch
"@uniswap/v2-sdk": patch
"@uniswap/v3-sdk": patch
"@uniswap/v4-sdk": patch
"@uniswap/router-sdk": patch
"@uniswap/universal-router-sdk": patch
---

Migrate build system from TSDX to tsc. Internal output paths changed but the `exports` field ensures correct resolution for all consumers. `tslib` is now a runtime dependency (required by `importHelpers`).
