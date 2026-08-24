---
'@uniswap/uniswapx-sdk': minor
---

Make `CosignedV3DutchOrder.resolve()` match `V3DutchOrderReactor` settlement.

The local V3 resolver decayed the raw curve and ignored the rest of the signed order, so it could report amounts that differ from — and in the worst case invert — the ones the reactor settles with. A filler pricing an order with `resolve()` and then calling `execute()` would pay the reactor's amounts, not the ones it was shown.

Five divergences are fixed:

- **Bounds.** `NonlinearDutchDecayLib` bounds the decayed input to `[0, maxAmount]` and each decayed output to `[minAmount, uint256.max]`; the SDK applied neither. A curve crossing those bounds resolved locally to the unclamped value. With `input {start: 1, max: 1, curve: -999_999}` and `output {start: 1_000_000, min: 1_000_000, curve: +999_999}` the SDK reported an input of 1,000,000 and an output of 1 where the reactor settles an input of 1 and an output of 1,000,000. Bounds now also apply on the no-decay path, matching `decay()`'s early return.
- **Base fee adjustment.** `_updateWithGasAdjustment` shifts the base amounts by `blockBaseFee - startingBaseFee` scaled by `adjustmentPerGweiBaseFee` before decaying; the SDK dropped `startingBaseFee` and both `adjustmentPerGweiBaseFee` fields entirely. This moves amounts even for an empty curve. `V3OrderResolutionOptions` gains an optional `blockBaseFee`; it is required only for orders with a nonzero `adjustmentPerGweiBaseFee`, and `resolve()` now throws instead of silently returning an unadjusted amount when it is missing.
- **Rounding.** The reactor interpolates the *relative* curve amounts with separate input and output functions that round in opposite directions, both in favor of the swapper. The SDK interpolated absolute amounts with one shared round-down, which inverts the rounding branch and was off by one against the reactor for inputs on a decaying curve and outputs on an increasing curve — in both cases in the filler's favor as reported, against it on settlement.

- **Exclusivity override.** `ExclusivityLib` scales every output up by `exclusivityOverrideBps` for a filler without exclusive rights, and rejects the fill entirely when the override is 0 (strict exclusivity). `resolve()` applied neither, so it under-reported what a non-exclusive filler pays. Rights now follow the reactor: no exclusive filler, or `currentBlock > decayStartBlock`, or `options.filler` matching the exclusive filler (compared case-insensitively). **This is the breaking part of the release** — a caller that omits `options.filler` is treated as an arbitrary filler, which is the conservative reading since no caller can claim another filler's rights. For a strictly exclusive order that means `resolve()` now throws where it previously returned amounts the reactor would never settle. Only outputs are scaled; the input is not.
- **Cosigner amount validation.** The reactor reverts when a cosigner override worsens the order for the swapper — an `inputOverride` above the signed `startAmount`, an `outputOverride` below it, or an `outputOverrides` array that does not cover every output. `resolve()` accepted all three and reported amounts for an order that cannot be filled (the length mismatch surfaced as a `TypeError`). It now throws `InvalidCosignerInput` / `InvalidCosignerOutput`, matching the reactor.

`decay()` also caps `blockDelta` at `uint16` max, as the reactor does.

`MathExt.sol` is ported to `utils/mathExt.ts` (`bound`, `boundedSub`, `boundedAdd`, `mulDivDown`, `mulDivUp`) and `ExclusivityLib.sol` to `utils/exclusivity.ts` (`hasFillingRights`, `applyExclusivityOverride`). The exclusivity helper is deliberately generic over the output shape and over position (timestamp or block), so V1 and V2 — which have the same omission — can adopt it without an import cycle. The internal `getBlockDecayedAmount` is replaced by `decayInput`/`decayOutput`, which take the signed input/output so the bounds cannot be dropped at the call site; none of these are exported from the package root.

`resolve()` still does not check the deadline or verify the cosignature, which `_validateOrder` does before resolving. Those are order-validity concerns rather than amount resolution: the deadline is a timestamp and `resolve()` takes a block, and cosignature recovery is already exposed as `recoverCosigner()`.
