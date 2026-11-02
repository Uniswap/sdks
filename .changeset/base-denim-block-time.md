---
'@uniswap/liquidity-launcher-sdk': minor
---

Follow Base's Denim upgrade (2s → 200ms blocks) in time ↔ block conversions. Adds a per-chain block-time schedule (`BLOCK_TIME_SCHEDULE_BY_CHAIN`) with Base and Base Sepolia activation anchors, `timeToBlockOnChain`, `blocksBetweenTimestamps`, `blocksToSeconds`, and a `chainId` option on `deriveBlocks` that converts windows crossing the activation correctly. `getBlockTimeSeconds` takes an optional timestamp (default: now) and returns the cadence in effect then. `isQuickLaunch`, `isPermanentTimelock` and `getQuickLaunchDurationBlocks` follow the schedule.
