# The Compact SDK - Implementation Summary

This document provides an overview of the implementation of The Compact SDK for TypeScript/JavaScript developers.

## Overview

The Compact SDK is a comprehensive TypeScript SDK for building and interacting with [The Compact v1](https://github.com/Uniswap/the-compact). It provides type-safe, ergonomic APIs for:

- Building and signing EIP-712 Compact messages (single, batch, and multichain)
- Creating claim payloads with proper claimant packing and witness hashing
- Interacting with The Compact contract via viem

## Package Structure

```
src/
├── config/           # Chain configurations and EIP-712 domain helpers
├── types/            # TypeScript type definitions mirroring Solidity structs
├── encoding/         # Low-level encoding utilities (locks, claimants, hashes)
├── builders/         # Fluent builder APIs for Compacts and Claims
├── client/           # High-level client for contract interactions
├── abi/              # Contract ABIs
├── errors/           # Error handling and decoding
└── index.ts          # Main entry point
```

## Key Features

### 1. Type-Safe Builders

The SDK provides fluent builder APIs that guide developers through the process of creating valid Compacts and Claims:

```typescript
const { struct, hash, typedData } = CompactBuilder.single(domain)
  .sponsor(sponsorAddress)
  .arbiter(arbiterAddress)
  .nonce(nonce)
  .expiresIn('15m')
  .lockTag(lockTag)
  .token(tokenAddress)
  .amount(amount)
  .witness(Mandate, { orderId, minFill })
  .build()
```

### 2. Mandate/Witness System

The SDK encapsulates the complex witness mechanism with a clean API:

```typescript
const Mandate = defineMandateType<{ orderId: `0x${string}`; minFill: bigint }>({
  fields: [
    MandateFields.bytes32('orderId'),
    MandateFields.uint256('minFill'),
  ],
})

// Automatically handles typestring generation and hashing
const witnessHash = Mandate.hash({ orderId, minFill })
```

### 3. Claimant Encoding

Simplifies the complex claimant packing rules:

```typescript
// Transfer (same lock tag)
claimBuilder.addTransfer({ recipient, amount })

// Convert (different lock tag)
claimBuilder.addConvert({ recipient, amount, targetLockTag })

// Withdraw (to underlying token)
claimBuilder.addWithdraw({ recipient, amount })
```

### 4. High-Level Client

Provides a unified interface for all contract interactions:

```typescript
const compact = createCompactClient({
  chainId: 1,
  publicClient,
  walletClient,
})

// Sponsor operations
await compact.sponsor.depositERC20({ token, lockTag, amount, recipient })

// Arbiter operations
await compact.arbiter.claim(claimStruct)

// View operations
const details = await compact.view.getLockDetails(lockId)
```

## Module Details

### Config Module

- **chains.ts**: Default deployments for Ethereum, Base, and Unichain
- **domain.ts**: EIP-712 domain creation helpers

### Types Module

- **eip712.ts**: Compact, BatchCompact, MultichainCompact, Lock types
- **claims.ts**: Claim, Component, and related types
- **runtime.ts**: Enums (Scope, ResetPeriod, CompactCategory) and conversion utilities

### Encoding Module

- **locks.ts**: Lock tag and lock ID encoding/decoding
  - `encodeLockTag()` / `decodeLockTag()`
  - `encodeLockId()` / `decodeLockId()`
- **claimants.ts**: Claimant packing/unpacking
  - `buildComponent()` / `decodeComponent()`
  - Helper functions: `transfer()`, `convert()`, `withdraw()`
- **hashes.ts**: Hash computation utilities

### Builders Module

- **mandate.ts**: Mandate type definition and witness handling
  - `defineMandateType()` - Creates a mandate type with proper typestring generation
  - `MandateFields` - Helper for common field types
- **compact.ts**: Compact builders
  - `CompactBuilder.single()` - Single compact
  - `CompactBuilder.batch()` - Batch compact
  - `CompactBuilder.multichain()` - Multichain compact
- **claim.ts**: Claim builders
  - `ClaimBuilder.single()` - Single claim

### Client Module

- **coreClient.ts**: Main client factory (`createCompactClient()`)
- **sponsor.ts**: Sponsor operations (deposits, registrations, forced withdrawals)
- **arbiter.ts**: Arbiter operations (claim submissions)
- **view.ts**: Read-only queries (balances, lock details, registration status)

### ABI Module

- **theCompact.ts**: Core Compact contract ABI
- **theCompactClaims.ts**: Claims interface ABI

### Errors Module

- **types.ts**: Error type definitions
- **decode.ts**: Revert data decoding utilities

## Design Decisions

### 1. Framework-Agnostic Core

The SDK is built on viem primitives but keeps the core logic framework-agnostic. This allows:
- Easy integration with any viem-based application
- Potential future adapters for ethers.js or other libraries
- Pure TypeScript types that work everywhere

### 2. Fluent Builders with Plain Structs

Builders provide ergonomic APIs, but everything decomposes to plain TypeScript structs that exactly mirror the Solidity structs. This means:
- Developers can use builders for convenience
- Power users can construct structs manually
- Easy serialization and debugging

### 3. Comprehensive Type Safety

All types are strongly typed with TypeScript:
- Address types use `` `0x${string}` `` for compile-time validation
- BigInt for all numeric values (no number types for amounts)
- Readonly arrays and objects where appropriate
- Discriminated unions for claimant types

### 4. Witness System Encapsulation

The witness/mandate mechanism is one of the most complex parts of The Compact. The SDK completely encapsulates this:
- Automatic typestring generation following the spec
- Proper EIP-712 type ordering
- Hash computation
- Validation of nested type names

## Testing

The SDK includes comprehensive unit tests for:
- Lock tag encoding/decoding
- Claimant packing/unpacking
- Mandate type definition and hashing
- Chain configuration
- Runtime type conversions

All tests pass and provide good coverage of the core functionality.

## Build Output

The package builds to three formats:
- **CommonJS** (`dist/cjs/`) - For Node.js
- **ESM** (`dist/esm/`) - For modern bundlers
- **Types** (`dist/types/`) - TypeScript declarations

## Future Enhancements

Potential areas for expansion:

1. **Additional Builders**
   - BatchClaim builder
   - MultichainClaim builder
   - BatchMultichainClaim builder

2. **Enhanced Client Features**
   - Relayer client with Permit2 integration
   - Allocator client for infrastructure operators
   - Event listening and parsing

3. **Utilities**
   - Proper claim hash computation
   - Event log parsing
   - Transaction simulation helpers

4. **Documentation**
   - API reference documentation
   - More usage examples
   - Integration guides

5. **Testing**
   - Integration tests with actual contracts
   - More edge case coverage
   - Property-based testing

## Dependencies

- **viem**: ^2.23.5 - For Ethereum interactions and EIP-712 utilities
- **tiny-invariant**: ^1.1.0 - For runtime assertions

## Compatibility

- **Node.js**: >=14
- **TypeScript**: ^5.6.2
- **Chains**: Ethereum Mainnet (1), Base (8453), Unichain (130)
- **Contract Address**: `0x00000000000000171ede64904551eeDF3C6C9788`

## License

MIT License - See LICENSE file for details.

