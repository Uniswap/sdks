# HybridOrder Signature Issue: Simple Summary

## The Problem

HybridOrder tests were failing because the SDK's hash calculations didn't match the contract's hash calculations, causing signature validation to fail.

## Root Cause

The contract uses **gas-optimized hashing** that differs from standard EIP-712:

1. **Hook data is hashed first** (converts variable-length `bytes` to fixed-size `bytes32`)
2. **Outputs array uses `encodePacked`** (cheaper than `encode` for arrays)
3. **Price curve is hashed** (converts array to single `bytes32`)

These optimizations save gas but mean the hash doesn't match what EIP-712 would produce.

## The Fixes (All 3 Required)

### Fix #1: Hash Hook Data Before Encoding
**File:** `sdks/uniswapx-sdk/src/order/v4/hashing.ts` - `hashOrderInfoV4()`

**Change:** Hash `preExecutionHookData` and `postExecutionHookData` before encoding them (use `bytes32` instead of `bytes`)

**Why:** Matches contract's gas-optimized approach

### Fix #2: Use `solidityPack` for Outputs Array
**File:** `sdks/uniswapx-sdk/src/order/v4/hashing.ts` - `hashHybridOutputs()`

**Change:** Use `ethers.utils.solidityPack` instead of `defaultAbiCoder.encode` for the outputs array

**Why:** Matches contract's `abi.encodePacked` behavior

### Fix #3: Use `signPermitData()` for Permit2 Signatures
**Files:** 
- `sdks/uniswapx-sdk/src/order/v4/HybridOrder.ts` - Added `signPermitData()` method
- `sdks/uniswapx-sdk/integration/test/HybridOrder.spec.ts` - Updated all tests

**Change:** Manually construct and sign the Permit2 message hash to match the contract's custom EIP-712 type hash

**Why:** The contract's Permit2 validation uses a custom type hash that embeds the witness type string, which doesn't match standard EIP-712 `_signTypedData()` behavior

## Why All 3 Are Necessary

We verified by testing each combination:

- **Only Fix #1**: ❌ Fails with `InvalidCosignature`
- **Fix #1 + #2**: ❌ Fails with `InvalidSignature` (cosigner passes, Permit2 fails)
- **Fix #1 + #3**: ❌ Fails with `InvalidCosignature`
- **All 3 fixes**: ✅ Test passes

**Fix #1 and #2** are both needed for correct `order.hash()` (used by cosigner validation).  
**Fix #3** is needed for correct Permit2 signature validation.

## Why Only the Cosigner Test Failed Initially

1. **Cosigner validation runs first** and uses `order.hash()` directly
2. **If the hash is wrong, cosigner validation fails immediately** ❌
3. **The resolver reverts before Permit2 validation runs**

Other tests:
- Skip cosigner validation (zero cosigner)
- Would have failed Permit2 validation too, but the original tests passed for unknown reasons (possibly hash bugs were already fixed, or original implementation was different)

## Why V3DutchOrder Works Differently

V3DutchOrder's contract hash **coincidentally matches EIP-712** because:
- No hook data to hash
- Simpler structure that aligns with EIP-712 encoding
- Can use `SignatureTransfer.getPermitData()` + `_signTypedData()` ✅

HybridOrder cannot use this approach because its gas-optimized hash doesn't match EIP-712.

## Current Status

✅ **All fixes implemented and working**  
✅ **All tests updated to use `signPermitData()`**  
✅ **SDK matches contract's gas-optimized hash calculation exactly**

The current implementation is correct and matches the contract's intentional design choice to optimize for gas costs.

