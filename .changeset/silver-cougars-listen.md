---
'@uniswap/liquidity-launcher-sdk': minor
---

Point the chain-4663 (Robinhood) Instant Launch stack at the verified liquidity-launcher **v3.1.1** deploy, replacing the v3.1.0 dev addresses that shipped in 1.6.0.

The v3.1.0 set was never usable: those strategies were deployed with `Parameters.sol` still holding the previous launcher, so their `launcher` immutable pointed at the old address and any call from the v3.1.0 launcher reverted `OnlyLauncher()`. liquidity-launcher `5ef0262b` redeployed the strategies against the correct launcher; all of the addresses below were verified on-chain on 4663 (`launcher()` returns the new launcher on every strategy). Because the v3.1.0 set has no indexed launches, it is **removed** rather than appended to — the append-only rule protects deployments that real launches reference, and these have none.

- `LIQUIDITY_LAUNCHER_ROBINHOOD` → `0x7A6C474b4DcD35b72203D2B569EAfE4C9b5C768e` (was `0xe050309b…`), used by both `LAUNCHER_ADDRESSES[4663].liquidityLauncher` and `INSTANT_LAUNCH_CONTRACTS[4663].liquidityLauncher`.
- `LAUNCHER_ADDRESSES[4663].universalRouterStrategy` → `0x4962907c62eBC529E84de899d081A53Ca9Ed05dD` (was `0xB7fF4d94…`).
- The current `INSTANT_LAUNCH_DEPLOYMENTS` pair → `0x3f556B542105D5EFBBefe7C766a4919C76B960Fb` (fees-on) and `0x36bdB859518C89F764337cd5C24762d2Aa650f3C` (fees-off), replacing the v3.1.0 pair. The three older generations (`c3f9506`, `8e40a35`, `3e05da8`) are untouched and still resolve through `getInstantLaunchDeployment`.
- **The fees-on FeeSplitter moves** to `0x6CC1b74Fc1BE1ff373Fa07f3381856f38103e653` — v3.1.1 deploys a new one, unlike the three previous generations which all reused the `c3f9506` splitter. `getCreatorFeesPositionRecipient` / `CREATOR_FEES_POSITION_RECIPIENTS` therefore return the new splitter, so a new auction / crowd launch that opts into creator fees must set the new address as its `MigratorParameters.positionRecipient`. `isCreatorFeesPositionRecipient` still recognizes the `c3f9506` splitter, so launches already parked there keep classifying. The fees-off splitter (`0xDF50f4ea…`) is unchanged, so `getAutocompoundPositionRecipient` does not move.
- **`INSTANT_LAUNCH_CONTRACTS[4663].beneficiaryVault` moves** to `0xa5889CaFCB1757218eA71730bee381Cc2a3F2CCC` (was `0x587D2fDD…`) — the vault the new fees-on splitter forwards the creator share to, and the one a new fees-on launch registers its beneficiary with. Creator-fee claims for beneficiaries registered by the three older generations still live on the old vault, which this registry no longer exposes.

The shared all-chain `LIQUIDITY_LAUNCHER` stays `0x00004c4ccc709Ef590F7C81102C0689F0263D4e9`; the eight non-Robinhood chains are byte-for-byte unchanged. No ABI, type or function-signature changes — `LIQUIDITY_LAUNCHER_ABI` (including the `payable` entries and `distributeWithNative`) is exactly as published in 1.6.0.
