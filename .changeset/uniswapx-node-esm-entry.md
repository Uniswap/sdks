---
'@uniswap/uniswapx-sdk': patch
---

Fix `import '@uniswap/uniswapx-sdk'` failing in Node.js with `ERR_UNSUPPORTED_DIR_IMPORT`. Node now resolves the package to the CommonJS build through a `node` export condition; bundlers keep using the ESM build.
