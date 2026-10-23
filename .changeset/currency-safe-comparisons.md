---
"@uniswap/sdk-core": minor
---

`CurrencyAmount.greaterThan/equalTo/lessThan` now throw a `CURRENCY` invariant when compared against a `CurrencyAmount` of a different currency, matching the existing behavior of `add`/`subtract`. Previously these fell through to `Fraction` and silently compared raw numerators across currencies. Comparisons against a raw amount (number, `JSBI`, `Fraction`) are unchanged.
