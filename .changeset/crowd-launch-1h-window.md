---
"@uniswap/liquidity-launcher-sdk": minor
---

Quick launches move from a 4h to a 1h auction window.

- `QUICK_LAUNCH_DURATION_SECONDS` is now `3_600` (was `14_400`). `QUICK_LAUNCH_PRESET.durationSeconds` and `getQuickLaunchDurationBlocks` follow, so create flows built on the preset produce 1h auctions (36,000 blocks on Robinhood at 0.1s/block, 300 blocks on a 12s chain).
- New `QUICK_LAUNCH_LEGACY_DURATION_SECONDS = 14_400`: the window quick launches were created with before the 1h window.
- `isQuickLaunch` `allowedDurationsSeconds` now defaults to `[QUICK_LAUNCH_DURATION_SECONDS, QUICK_LAUNCH_LEGACY_DURATION_SECONDS]` (1h and 4h, each ±10%), so a consumer that upgrades without passing options keeps recognising the 4h quick launches already on-chain while also recognising new 1h ones. Callers that need a stricter window (e.g. a backend applying a cutover date) pass their own list, such as `[QUICK_LAUNCH_DURATION_SECONDS]`.

No other classifier checks change.
