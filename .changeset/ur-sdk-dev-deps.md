---
'@uniswap/universal-router-sdk': patch
---

`@openzeppelin/contracts`, `@uniswap/v2-core` and `@uniswap/v3-core` move from `dependencies` to `devDependencies`. The published SDK does not import them. Only the Hardhat and Forge tests use them. Consumers no longer install these packages, which removes the GPL-3.0 (`v2-core`) and BUSL-1.1 (`v3-core`) packages from the dependency tree of the SDK.
