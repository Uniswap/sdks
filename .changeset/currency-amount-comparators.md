---
"@uniswap/sdk-core": minor
"@uniswap/v2-sdk": patch
"@uniswap/router-sdk": patch
---

Add `lessThan`, `equalTo`, and `greaterThan` overrides on `CurrencyAmount` that enforce the same currency invariant used by `add`/`subtract`. The operand type is narrowed to `CurrencyAmount<T> | 0`: comparing two `CurrencyAmount`s of different currencies now throws `CURRENCY`, and the only non-`CurrencyAmount` operand accepted is the literal `0` sentinel (so comparisons against bare `BigintIsh` values that ignore `decimalScale` are no longer allowed). Internal callers in `v2-sdk` and `router-sdk` that previously passed `JSBI.BigInt(0)` have been updated to pass `0`.
