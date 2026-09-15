---
'@uniswap/permit2-sdk': minor
---

Check signature-transfer nonce against the permit owner. `nonceBitmap` is keyed by the EIP-712 signer, not the spender. `isPermitValid` and `validatePermit` now require `owner`.
