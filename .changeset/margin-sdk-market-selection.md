---
'@uniswap/margin-sdk': patch
---

Add market selection: `selectMarket` / `quoteMarket` price every eligible lending market for a pair at the user's size and leverage and rank them by expected cost of carry (post-trade effective borrow rate net of collateral yield, plus the expected liquidation loss over the user's horizon from a first-passage volatility model), with feasibility gates for borrow caps, utilization, liquidity, cap headroom, and a minimum health factor, a risk-rank tiebreak inside a cost band, the cheapest-to-safest frontier for display, and the `maxLtvAfter` that enforces the displayed liquidation buffer onchain. Ships the venue rate curves behind it (`borrowRateApr` for Morpho's AdaptiveCurveIRM including anchor drift, the Aave kinked strategy, and the Comet curve), `morphoLiquidationIncentiveFactor`, and `liquidationProbability`.
