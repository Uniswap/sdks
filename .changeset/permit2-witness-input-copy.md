---
'@uniswap/permit2-sdk': patch
---

Avoid mutating caller permit objects when building signing data with a witness, allowing frozen permit inputs while retaining required inherited and non-enumerable fields.
