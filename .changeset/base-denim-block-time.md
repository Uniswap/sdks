---
'@uniswap/liquidity-launcher-sdk': minor
---

Follow Base's Denim upgrade (2s → 200ms blocks) in time ↔ block conversions. Adds a per-chain block-time schedule (`BLOCK_TIME_SCHEDULE_BY_CHAIN`) with Base and Base Sepolia activation anchors, `timeToBlockOnChain`, `blocksBetweenTimestamps`, `blocksToSeconds`, and a `chainId` option on `deriveBlocks` that converts windows crossing the activation correctly. `deriveBlocks` throws if given both `chainId` and `blockTimeSeconds`, and the `chainId` conversions throw `INVALID_TIME` for a chain with no known block time instead of assuming 12s (`hasKnownBlockTime` checks this up front). `getBlockTimeSeconds` takes an optional timestamp (default: now) and returns the cadence in effect then. `isQuickLaunch`, `isPermanentTimelock` and `getQuickLaunchDurationBlocks` follow the schedule.
