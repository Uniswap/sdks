---
'@uniswap/liquidity-launcher-sdk': minor
---

Instant Launch: state the post-redeploy pool shape. The 2026-08-05 chain-4663 full redeploy did not re-pin the 3e05da8 InstantLaunchStrategy unchanged — it recompiled it with a new pool shape, which the SDK still described as "unchanged across deploys". All values below were read back from the deployed strategies' getters (`TICK_SPACING()` / `initialTick()` / `MIN_LAUNCH_TICK()`) on both current strategies and all eight pre-redeploy strategies.

- `INSTANT_LAUNCH_POOL_TICK_SPACING` → `25` (was 60). The current generation's compile-time `TICK_SPACING`; every pre-redeploy generation is 60. Confirmed against live `TokenLaunched` events: post-redeploy launches carry pool keys `(2500, 25, hookless)`.
- `INSTANT_LAUNCH_ALLOWED_POOL_TICK_SPACINGS` (new) → `[25, 60]`. The append-only grandfather set (same shape as `QUICK_LAUNCH_ALLOWED_POOL_TICK_SPACINGS`): pools are permanent, so routing/discovery consumers deriving a token's candidate launch pools must race a `(INSTANT_LAUNCH_POOL_LP_FEE, spacing)` key for every entry — the token address alone cannot say which generation minted its pool.
- `INSTANT_LAUNCH_INITIAL_TICK` → `198_050` (was 198,060) and `INSTANT_LAUNCH_MIN_LAUNCH_TICK` → `-160_100` (was -208,980): the current generation's launch-position bounds.
- `InstantLaunchDeployment.tickSpacing` / `.minLaunchTick` (new registry fields, beside the existing `initialTick`): the authoritative per-generation pool shape — 25 / 198,050 / -160,100 on the 2026-08-05 pair, 60 / 198,060 / -208,980 on every earlier generation. Consumers that know a launch's minting strategy resolve the exact pool key from here.
- `getInstantLaunchPoolKey` / `getInstantLaunchPoolId` now take an optional `tickSpacing` (default: the current generation) — pass the minting generation's spacing for pre-redeploy tokens. `getInstantLaunchPoolKeys` (new) returns one candidate key per grandfathered spacing, newest first, for consumers that must probe. `QuoteInstantLaunchBuyParams.tickSpacing` (new, optional) threads the same override through quoting.

`INSTANT_LAUNCH_POOL_LP_FEE` is genuinely unchanged (2500 on all ten deployed strategies). The quick-launch graduation-pool counterpart of this change (50 → 25) shipped in 1.9.0.
