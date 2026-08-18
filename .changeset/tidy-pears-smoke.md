---
'@uniswap/liquidity-launcher-sdk': minor
---

Launcher pool tick spacing: give the v4 derivation a single source of truth, and resolve the 0.25% (2500) fee tier to spacing 25.

- `LAUNCHER_V4_FEE_TICK_SPACINGS` (new) — the launcher's own fee → tick-spacing table for the v4 pools it opens. v4 has no protocol-level fee→tickSpacing map, so the launcher previously consulted the v3 `TICK_SPACINGS` table and fell through to `max(round(2*fee/100), 1)` for anything it did not cover, which left the 2500 tier resolving to 50. The table now states the launcher's canonical choice per well-known tier, including `2500: 25`, and is independent of the v3 table so the two populations can move separately. Every fee the v3 table covers resolves to exactly the spacing it did before; 2500 is the only tier whose resolved spacing changes.
- `resolveNewPoolTickSpacing(fee)` (new) — the named entry point. It consults the table first and otherwise falls back to the unchanged `max(round(2*fee/100), 1)` derivation. It decides the spacing a *new* pool is opened with, and must not be used to reconstruct, hash, or look up the key of a pool that already exists — those resolve from the pool's own stored, served, or on-chain key, or by racing the relevant `*_ALLOWED_POOL_TICK_SPACINGS` grandfather set.
- `feeToTickSpacing` is now a deprecated alias of `resolveNewPoolTickSpacing`, so existing imports keep working.
- `QUICK_LAUNCH_POOL_TICK_SPACING` is now derived from `resolveNewPoolTickSpacing(QUICK_LAUNCH_LP_FEE)` instead of being a hand-maintained literal. Its value is unchanged (25), and it remains exported.
- `QUICK_LAUNCH_ALLOWED_POOL_TICK_SPACINGS` is unchanged at `[25, 50]`. The `50` entry stays: pools are permanent, and pre-redeploy graduation pools on chain 4663 are reachable only through that entry when no served pool key is available.

The v3 `TICK_SPACINGS` table is not modified.
