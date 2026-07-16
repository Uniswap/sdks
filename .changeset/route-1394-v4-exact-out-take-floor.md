---
"@uniswap/universal-router-sdk": minor
---

V4 exact-output legs encoded via `swapCallParameters` now `TAKE` the exact leg output amount instead of `OPEN_DELTA`, so under-delivery (e.g. pool liquidity exhausted at the price limit) reverts at unlock settlement instead of silently partial-filling. Hook pools that overcredit output beyond the exact amount will also revert. Zero exact-output amounts now throw at encode time (`ZERO_EXACT_OUTPUT_AMOUNT`). Scope: SDK-generated trade encoding through `addV4Swap` only — caller-authored `encodeSwaps` V4 action plans are unaffected.
