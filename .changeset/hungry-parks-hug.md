---
"@uniswap/v4-sdk": major
---

### Major: Universal Router 2.1.1

- **`URVersion.V2_1` removed** — use **`URVersion.V2_1_1`** for UR **2.1.1** (or **`V2_0`** for older router ABIs). **2.1** had a **per-hop slippage precision bug** (`maxHopSlippage` could fail to enforce on some high–decimal / price–skew pools); **2.1.1** fixes that with higher-precision on-chain math.
- **`URVersion.V2_1_1`** swap ABIs include **`maxHopSlippage`** on **single-hop** V4 swaps (in addition to multi-hop); **`V2_0`** keeps structs without per-hop fields.
