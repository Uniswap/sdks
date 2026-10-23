---
'@uniswap/uniswapx-sdk': patch
---

Fixed `UnsignedV3DutchOrder.serialize()` writing the input curve's encoded `relativeBlocks` into every output instead of each output's own, so a decoded output carried the wrong decay block schedule whenever an output curve's `relativeBlocks` differed from the input's. `CosignedV3DutchOrder.serialize()` already encoded this correctly per output; `UnsignedV3DutchOrder.serialize()` now matches it.

`hash()`/`witnessInfo()` already encoded each output's own `relativeBlocks` correctly, so this bug did not affect the signed digest — it was confined to the serialized byte string produced by `serialize()`. No production caller of `UnsignedV3DutchOrder.serialize()` was identified during this fix; both existing round-trip tests in `V3DutchOrder.test.ts` constructed a `CosignedV3DutchOrder` (the already-correct sibling), so `UnsignedV3DutchOrder.serialize()` itself was never exercised by any prior test.

Note: an order already serialized under the old (buggy) code will still decode with the wrong output block schedule after this fix — this only corrects newly-serialized orders, it cannot retroactively repair previously-persisted bytes.
