---
'@uniswap/liquidity-launcher-sdk': minor
---

Point the Arc (5042) Instant Launch generation at the 2026-09-01 strategy redeploy: fees-on `0xfe7Be4Eb…`, fees-off `0xff301aCB…`, opening pools at initialTick 122,050 (previously 198,050; TICK_SPACING 25 and MIN_LAUNCH_TICK -160,100 unchanged). The superseded initial pair is replaced rather than retained — it was never launched against (zero on-chain logs), so no indexed launches reference it. FeeSplitters, vault and compounding recipient are unchanged.
