---
'@uniswap/v4-sdk': minor
---

Add `URVersion.V2_1_2` ('2.1.2') to mirror the new `UniversalRouterVersion.V2_1_2` in `@uniswap/universal-router-sdk`. The two enums are resolved by string value in `toV4URVersion`, so they must stay in sync for the new version to be usable from the router SDK.

`isAtLeastV2_1_1('2.1.2')` returns `true`, so v2.1.2 takes the same v4 action encoding as v2.1.1. No behavior change for any existing version.
