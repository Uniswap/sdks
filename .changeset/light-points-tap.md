---
"@uniswap/universal-router-sdk": major
---

### Major: Universal Router 2.1.1

- Adds **`UniversalRouterVersion.V2_1_1`** addresses/blocks where deployed.
- **`URVersion.V2_1` removed** — use **`URVersion.V2_1_1`** for UR **2.1.1** (or **`V2_0`** for older router ABIs). **2.1** had a **per-hop slippage precision bug** (`maxHopSlippage` could fail to enforce on some high–decimal / price–skew pools); **2.1.1** fixes that with higher-precision on-chain math.
- **`PAY_PORTION_FULL_PRECISION`** (1e18) replaces **`PAY_PORTION`** (bips) for percentage **`fee`** options when using **`V2_1_1`** — finer fractional fees; re-check exact-output + fee calldata if you upgrade.
- **`maxHopSlippage`** on V2, V3, and V4 swaps: extended ABIs when using **`V2_1_1`**; **`V2_0`** stays the old encoding.
