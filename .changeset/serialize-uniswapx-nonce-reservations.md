---
"@uniswap/uniswapx-sdk": patch
---

Serialize nonce reservations per owner so concurrent `NonceManager.useNonce` calls on the same instance cannot return the same Permit2 nonce. Share the reservation cache across checksum and lowercase spellings of an address, and release queued callers when a bitmap read fails.
