---
"@uniswap/sdk-core": major
"@uniswap/v2-sdk": major
"@uniswap/v3-sdk": major
"@uniswap/v4-sdk": major
"@uniswap/router-sdk": major
"@uniswap/universal-router-sdk": major
---

Migrate build system from TSDX to tsc. Output paths changed from `dist/index.js` to `dist/cjs/src/index.js` (CJS), `dist/esm/src/index.js` (ESM), and `dist/types/src/index.d.ts` (types). The `exports` field in package.json ensures correct resolution for all modern bundlers and Node.js versions. `tslib` is now a runtime dependency (required by `importHelpers`).
