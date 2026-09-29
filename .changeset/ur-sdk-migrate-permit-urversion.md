---
'@uniswap/universal-router-sdk': minor
---

`SwapRouter.migrateV3ToV4CallParameters` now takes an optional `urVersion` on `MigrateV3ToV4Options`. When `v3RemoveLiquidityOptions.permit` is set, its `spender` must be the Universal Router registered for that version; the check used to be hardcoded to the chain's 2.0 router, so on chains that register only a newer router (Robinhood, Arc) `UNIVERSAL_ROUTER_ADDRESS(V2_0, chainId)` threw before the spender was even compared and a permit-based migration could not be built at all. `urVersion` defaults to `V2_0`, so existing callers are unchanged. The spender comparison is also case-insensitive now, so a checksummed spender is accepted. A `urVersion` below 2.0 is rejected with `UR_VERSION_TOO_OLD`, since the position-manager commands a migrate emits do not exist on the 1.2 router.
