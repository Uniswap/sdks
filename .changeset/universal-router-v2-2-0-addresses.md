---
'@uniswap/universal-router-sdk': patch
---

Update Universal Router v2.2.0 addresses (#738)

Repoints the v2.2.0 Universal Router deployment config on Ethereum mainnet (1), Ethereum Sepolia (11155111) and Ink (57073) to the corrected router addresses, and removes Ink's `V2_1_1` entry. That entry was an alias pointing at Ink's old v2.2.0 router rather than a real v2.1.1 deployment, so `getUniversalRouterAddress(UniversalRouterVersion.V2_1_1, 57073)` no longer resolves and now throws — callers on Ink should use `V2_1_2` or `V2_2_0`. #738 landed these changes on `main` without a changeset, so this releases them.
