---
'@uniswap/liquidity-launcher-sdk': minor
---

Launcher pool tick spacing: give the derivation a single source of truth — `max(round(fee / 100), 1)`, one tick of spacing per bip of fee — scoped to the **new v4 pools this launcher opens**.

- `resolveNewPoolTickSpacing(fee)` (new) — the named entry point. Previously the derivation consulted the v3 `TICK_SPACINGS` table for well-known tiers and fell back to `max(round(2 * fee / 100), 1)`; it now computes `max(round(fee / 100), 1)` directly and no longer consults the v3 table at all (v3's fee→spacing pairs are factory-enforced on-chain and describe v3 pools, not the pools this launcher opens). The `MAX_TICK_SPACING` guard and `INVALID_FEE` rejection are unchanged.
- Resolved spacings that change: `500: 10 → 5`, `2500: 50 → 25`, `3000: 60 → 30`, `10000: 200 → 100`; every fee that previously fell through to the doubled fallback halves (e.g. `1234: 25 → 12`). `100 → 1` is unchanged (floor at 1).
- Contract: the function decides the spacing a **new** pool is opened with. It must not be used to reconstruct, hash, or look up the key of a pool that already exists — those resolve from the pool's own stored, served, or on-chain key, or by racing the relevant `*_ALLOWED_POOL_TICK_SPACINGS` grandfather set.
- `feeToTickSpacing` is now a deprecated alias of `resolveNewPoolTickSpacing`, so existing imports keep working.
- `QUICK_LAUNCH_POOL_TICK_SPACING` is now derived from `resolveNewPoolTickSpacing(QUICK_LAUNCH_LP_FEE)` instead of being a hand-maintained literal. Its value is unchanged (25), and it remains exported.
- Grandfather sets are unchanged: `QUICK_LAUNCH_ALLOWED_POOL_TICK_SPACINGS` stays `[25, 50]` (pools are permanent; pre-redeploy graduation pools on chain 4663 are reachable only through the `50` entry when no served pool key is available) and `INSTANT_LAUNCH_ALLOWED_POOL_TICK_SPACINGS` stays `[25, 60]`. Tests assert each set contains the spacing its mechanism's fee tier resolves to.

The v3 `TICK_SPACINGS` table is not modified.
