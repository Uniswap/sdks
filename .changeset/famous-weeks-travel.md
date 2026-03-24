---
"@uniswap/universal-router-sdk": minor
---

Use `UniversalRouterVersion` for `SwapOptions.urVersion` instead of v4-sdk's `URVersion`. Version logic (`isAtLeastV2_1_1`) is now local to universal-router-sdk. Consumers should use `UniversalRouterVersion` from this package.
