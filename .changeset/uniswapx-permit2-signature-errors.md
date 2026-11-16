---
'@uniswap/uniswapx-sdk': minor
---

UniswapX quoters: map Permit2's `InvalidContractSignature()` (`0xb0669cbc`, an ERC-1271 signer rejected the signature) and `InvalidSignatureLength()` (`0x4be6321b`) reverts to `OrderValidation.InvalidSignature` instead of `UnknownError`. `UniswapXOrderQuote` gains an optional `validationErrorData` field carrying the raw revert data whenever the quote call reverted, matching `V4OrderQuote`. `validate()` / `validateBatch()` are unchanged.
