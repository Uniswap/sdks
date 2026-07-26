---
'@uniswap/liquidity-launcher-sdk': minor
---

Add the Direct Launch ("Instant Launch") module: `buildDirectLaunchTransaction` (the single LiquidityLauncher `multicall(createToken, distributeToken)` assembler), `encodeDirectLaunchConfig`, the Direct Launch preset constants (`DIRECT_LAUNCH_TOTAL_SUPPLY_RAW`, `DIRECT_LAUNCH_TOKEN_DECIMALS`, `DISABLED_CREATOR_FEE_BENEFICIARY`), `predictDirectLaunchTokenAddressCall`, and the chain-4663 `directLaunchStrategy` / `feeSplitter` entries on the launcher address registry (the single swap point for the expected liquidity-launcher#196 redeploy). Lifted from the rh-cca app so the backend liquidity service and the frontend build the same transaction from one implementation.
