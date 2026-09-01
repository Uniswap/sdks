---
"@uniswap/liquidity-launcher-sdk": minor
---

Arc (5042): Instant Launch strategy redeploy, uERC20 factory and block time.

- `INSTANT_LAUNCH_DEPLOYMENTS`: the Arc fees-on / fees-off `InstantLaunchStrategy` pair is now `0xfe7Be4EbBE6CcDfA57EE8c36fe9a767B033eB056` / `0xff301aCB22816D210d75D71F31Ac13C771093EF3` with `initialTick` `122050` (Arc's native currency is USDC, so the tick is USDC-denominated: ≈ $5k FDV on 1e9 supply). The previous pair (`0x26e78031…` / `0xe510927f…`, `initialTick` `198050`) is removed. `tickSpacing` 25, `minLaunchTick` -160100, FeeSplitters, vault and claim recipient are unchanged.
- `LAUNCHER_ADDRESSES[5042].uerc20Factory` = `0xFf99D8f6C994607576eB652EDCf12E04a7EbfBf6`: `selectTokenFactory(5042)` now resolves `{ kind: 'uerc20' }`, and `getInstantLaunchAddresses(5042, …)` / `isInstantLaunchSupportedChain(5042)` resolve.
- `BLOCK_TIME_SECONDS_BY_CHAIN[5042]` = `0.48` (was the 12s default).
- `getQuickLaunchFloorPricePerToken` / `getQuickLaunchGraduationPricePerToken`: the price parameter is now `nativeUsdPrice`, the USD price of the chain's native currency (ETH on Robinhood, USDC ≈ 1 on Arc); `ethUsdPrice` is deprecated in favour of `nativeUsdPrice` (positional, so existing callers are unaffected). Docs now say "native currency"; no math changes.
