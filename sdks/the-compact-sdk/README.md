# The Compact SDK

[![npm version](https://img.shields.io/npm/v/@uniswap/the-compact-sdk/latest.svg)](https://www.npmjs.com/package/@uniswap/the-compact-sdk/v/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive TypeScript SDK for building and interacting with [The Compact v1](https://github.com/Uniswap/the-compact) - a generalized resource lock protocol that enables efficient cross-chain operations and intent-based transactions.

## Overview

The Compact is an on-chain protocol that allows users (sponsors) to lock tokens that can later be claimed by authorized processors (arbiters) with flexible distribution rules. This SDK provides type-safe, ergonomic tools to:

- **Build EIP-712 signed compacts** for token locks
- **Create claim payloads** to process locked tokens
- **Interact with deployed contracts** using strongly-typed methods
- **Support complex operations** including batched and multichain compacts

## Features

- 🔐 **EIP-712 Compact Building**: Type-safe builders for `Compact`, `BatchCompact`, and `MultichainCompact` messages
- 📝 **Claim Payloads**: Build claim payloads with correct claimant encoding and witness hashing
- 🔗 **Contract Interaction**: Fully-typed client for sponsor, arbiter, and view operations
- 🛠️ **Fluent Builders**: Intuitive builder patterns with method chaining
- 🌐 **Multi-Chain Support**: First-class support for cross-chain compacts
- 🎯 **Mandate System**: Flexible witness data for custom claim constraints
- ⚡ **Framework Agnostic**: Built on viem primitives, works with any web3 stack
- 📚 **Comprehensive Types**: Full TypeScript support with detailed JSDoc

## Installation

```bash
npm install @uniswap/the-compact-sdk viem
```

Or with yarn:

```bash
yarn add @uniswap/the-compact-sdk viem
```

**Peer Dependencies:**
- `viem` ^2.0.0

## Quick Start

```typescript
import { CompactClient } from '@uniswap/the-compact-sdk'
import { createPublicClient, createWalletClient, http } from 'viem'
import { mainnet } from 'viem/chains'

// Initialize clients
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
})

const walletClient = createWalletClient({
  chain: mainnet,
  transport: http(),
  account: '0x...' // Your account
})

// Create CompactClient
const client = new CompactClient({
  chainId: 1,
  publicClient,
  walletClient,
})

// Build and submit a compact
const compact = await client.sponsor.compact()
  .arbiter('0xArbiterAddress...')
  .sponsor(walletClient.account.address)
  .nonce(1n)
  .expiresIn('1 hour')
  .lockTag('0x000000000000000000000001')
  .token('0xUSDC...')
  .amount(1000000n) // 1 USDC
  .build()

// Sign and submit
const hash = await client.sponsor.allocate(compact.struct)
console.log('Compact submitted:', hash)
```

## Core Concepts

### Resource Locks

Resource locks are the fundamental unit of state in The Compact. They’re created whenever a depositor places tokens (ERC20 or native) into the protocol and are represented as fungible ERC‑6909 tokens.

Each resource lock is defined by four properties:

- **Underlying token** – the ERC20 or native token held in the lock  
- **Allocator** – infrastructure that prevents double‑spends and authorizes use of the lock  
- **Scope** – whether the lock can be spent on a single chain or across chains  
- **Reset period** – a timelock used for forced withdrawals and emissary changes  

These properties are packed into a 12‑byte **lock tag** (`bytes12 lockTag`). The ERC‑6909 token id for a given lock is:

> `lockId = (lockTag << 160) | tokenAddress`

So each unique `(lockTag, token)` pair corresponds to one fungible ERC‑6909 id. Whoever holds that ERC‑6909 balance is the **sponsor** for that lock and can create compacts backed by it.

---

### Compacts

A **Compact** is an EIP‑712 typed commitment created by a sponsor that allows an **arbiter** to claim from one or more resource locks under specified conditions. Compacts **do not** move funds by themselves; they just define what an arbiter is allowed to do later via a claim.

The protocol defines three EIP‑712 payload shapes:

- **Single Compact**  
  Commits an amount of a single resource lock on a single chain.  
  Conceptually: “arbiter X may claim up to `amount` from `lockTag` / `token` for sponsor Y before `expires`.”

- **Batch Compact**  
  Commits multiple `(lockTag, token, amount)` tuples on the same chain in one payload.  
  Conceptually: “arbiter X may claim from this set of locks, each up to its own `amount`, for sponsor Y before `expires`.”

- **Multichain Compact**  
  Commits locks across multiple chains. Each element binds:
  - a `chainId`  
  - a per‑chain `arbiter`  
  - one or more `(lockTag, token, amount)` commitments  
  - a **Mandate** witness (see below)  

Single and batch compacts may optionally include a Mandate. Multichain compacts always include a Mandate per element.

---

### Claims

A **Claim** is what an arbiter submits to actually spend a compact against one or more resource locks.

At a high level, a claim:

- Proves allocator authorization for a specific lock id and `allocatedAmount`
- Proves sponsor authorization (via signature, EIP‑1271, emissary, or direct call)
- Binds to a particular compact (or registered compact hash) and its `nonce` / `expires`
- Specifies how to distribute the committed value via an array of **components**

Each component is an encoded `(lockTag, recipient, amount)` triple. How The Compact interprets a component depends on the `lockTag` embedded in it:

1. **Direct transfer (keep the lock as‑is)**  
   - Component’s `lockTag` == original lock’s `lockTag`  
   - The claim transfers ERC‑6909 tokens for that lock id to the recipient.

2. **Convert to a new resource lock**  
   - Component’s `lockTag` is non‑zero and different from the original  
   - The claim burns from the original lock and mints into a new lock with the new `lockTag` for the recipient.  
   - This changes allocator / scope / reset period while keeping the funds locked in The Compact.

3. **Withdraw underlying tokens**  
   - Component’s `lockTag` is zero  
   - The claim burns ERC‑6909 and withdraws the underlying ERC20 or native tokens to the recipient, exiting The Compact.

The TS SDK focuses on helping construct these claim payloads correctly (including component encoding) and leaves allocator- and arbiter-specific logic to the integrator.

---

### Mandates (Witness Data)

**Mandates** are typed witness data used to add arbitrary, domain‑specific conditions to a compact and its eventual claims.

On-chain, a Mandate is an extra struct appended to the end of the compact’s EIP‑712 payload. The Compact itself treats this as an **opaque blob**; it only cares about:

- `witness` – the `bytes32` hash of the encoded Mandate data  
- `witnessTypestring` – the EIP‑712 typestring describing the Mandate struct (and any nested Mandate* structs)

During a claim, the arbiter provides `witness` and `witnessTypestring`. The Compact rebuilds the full EIP‑712 typestring, recomputes the claim hash, and passes that into the allocator’s authorization logic. This ties allocator approval to both:

- the compact’s core fields (arbiter, sponsor, lockTag(s), token(s), amount(s), nonce, expires), and  
- the Mandate payload, without needing to understand the Mandate’s semantics.

Typical Mandate uses:

- Routing / fill parameters for RFQ or auction flows  
- Price / slippage bounds  
- Deadlines and validity conditions  
- Cross‑chain message or proof references  
- Any other constraints arbiters and allocators want to enforce

## API Reference

### CompactClient

The main entry point for interacting with The Compact protocol.

```typescript
import { CompactClient } from '@uniswap/the-compact-sdk'

const client = new CompactClient({
  chainId: 1,
  address: '0x00000000000000171ede64904551eeDF3C6C9788', // Optional: defaults to canonical deployment
  publicClient,
  walletClient, // Optional: required for write operations
})
```

**Properties:**

- `client.sponsor` - Sponsor operations (deposits, allocations)
- `client.arbiter` - Arbiter operations (claims, withdrawals)
- `client.view` - Read-only queries (balances, lock details)

### Sponsor Client

Handles operations for token sponsors.

#### Deposit ERC20

```typescript
const result = await client.sponsor.depositERC20({
  token: '0xTokenAddress...',
  amount: 1000000n,
  lockTag: '0x000000000000000000000001',
  recipient: sponsorAddress,
})

console.log('Lock ID:', result.id)
console.log('Transaction hash:', result.txHash)
```

#### Build and Allocate a Compact

```typescript
// Build compact
const compact = await client.sponsor.compact()
  .arbiter(arbiterAddress)
  .sponsor(sponsorAddress)
  .nonce(1n)
  .expiresIn('15 minutes')
  .lockTag('0x000000000000000000000001')
  .token('0xTokenAddress...')
  .amount(1000000n)
  .build()

// Submit to chain
const hash = await client.sponsor.allocate(compact.struct)
```

#### Batch Compact

Lock multiple tokens in a single signature:

```typescript
const batchCompact = await client.sponsor.batchCompact()
  .arbiter(arbiterAddress)
  .sponsor(sponsorAddress)
  .nonce(1n)
  .expiresIn('1 hour')
  .addLock({
    lockTag: '0x000000000000000000000001',
    token: '0xUSDC...',
    amount: 1000000n,
  })
  .addLock({
    lockTag: '0x000000000000000000000002',
    token: '0xWETH...',
    amount: 5000000000000000000n,
  })
  .build()

const hash = await client.sponsor.allocateBatch(batchCompact.struct)
```

### Arbiter Client

Handles operations for authorized processors.

#### Build and Submit a Claim

```typescript
// Build claim from a compact
const claim = await client.arbiter.claim()
  .fromCompact({
    compact: signedCompact.struct,
    signature: sponsorSignature,
  })
  .addTransfer({
    recipient: '0xRecipient1...',
    amount: 600000n,
  })
  .addTransfer({
    recipient: '0xRecipient2...',
    amount: 400000n,
  })
  .build()

// Submit claim
const result = await client.arbiter.submitClaim(claim.struct)
console.log('Claim hash:', result.claimHash)
console.log('Transaction hash:', result.txHash)
```

#### Different Claimant Types

```typescript
const claim = await client.arbiter.claim()
  .fromCompact({ compact, signature })
  // Transfer: Same lock tag
  .addTransfer({
    recipient: recipientAddress,
    amount: 500000n,
  })
  // Convert: Different lock tag
  .addConvert({
    recipient: recipientAddress,
    amount: 300000n,
    targetLockTag: '0x000000000000000000000002',
  })
  // Withdraw: Back to underlying token
  .addWithdraw({
    recipient: recipientAddress,
    amount: 200000n,
  })
  .build()
```

### View Client

Read-only queries for protocol state.

```typescript
// Get lock details
const lockDetails = await client.view.getLockDetails(lockId)
console.log('Token:', lockDetails.token)
console.log('Allocator:', lockDetails.allocator)
console.log('Reset period:', lockDetails.resetPeriod)

// Check account balance for a lock
const balance = await client.view.balanceOf({
  account: sponsorAddress,
  id: lockId,
})
console.log('Locked amount:', balance)

// Check if claim is registered
const isRegistered = await client.view.isRegistered({
  sponsor: sponsorAddress,
  claimHash: claimHash,
  typehash: typehash,
})

// Get forced withdrawal status
const status = await client.view.getForcedWithdrawalStatus(
  accountAddress,
  lockId
)
if (status.status === ForcedWithdrawalStatusEnum.Enabled) {
  console.log('Can withdraw at:', status.withdrawableAt)
}
```

## Advanced Usage

### Multichain Compacts

Coordinate token locks across multiple chains:

```typescript
import { simpleMandate } from '@uniswap/the-compact-sdk'

// Define mandate type
const mandateType = simpleMandate<{ maxAmount: bigint }>([
  { name: 'maxAmount', type: 'uint256' },
])

// Build multichain compact
const multichainCompact = await client.sponsor.multichainCompact()
  .sponsor(sponsorAddress)
  .nonce(1n)
  .expiresIn('1 hour')
  // Ethereum element
  .addElement()
    .arbiter(ethereumArbiter)
    .chainId(1n)
    .addCommitment({
      lockTag: '0x000000000000000000000001',
      token: '0xUSDC...',
      amount: 1000000n,
    })
    .witness(mandateType, { maxAmount: 2000000n })
    .done()
  // Base element
  .addElement()
    .arbiter(baseArbiter)
    .chainId(8453n)
    .addCommitment({
      lockTag: '0x000000000000000000000001',
      token: '0xUSDC...',
      amount: 500000n,
    })
    .witness(mandateType, { maxAmount: 1000000n })
    .done()
  .build()

const hash = await client.sponsor.allocateMultichain(multichainCompact.struct)
```

### Using Mandates

Mandates add custom constraints to your compacts:

```typescript
import { simpleMandate } from '@uniswap/the-compact-sdk'

// Define mandate structure
const OrderMandate = simpleMandate<{
  orderId: `0x${string}`
  minFillAmount: bigint
  deadline: bigint
}>([
  { name: 'orderId', type: 'bytes32' },
  { name: 'minFillAmount', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
])

// Use in compact
const compact = await client.sponsor.compact()
  .arbiter(arbiterAddress)
  .sponsor(sponsorAddress)
  .nonce(1n)
  .expiresIn('15m')
  .lockTag(lockTag)
  .token(tokenAddress)
  .amount(amount)
  .witness(OrderMandate, {
    orderId: '0x123...',
    minFillAmount: 900000n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 900),
  })
  .build()

// Use in claim
const claim = await client.arbiter.claim()
  .fromCompact({ compact: compact.struct, signature })
  .witness(OrderMandate, {
    orderId: '0x123...',
    minFillAmount: 900000n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 900),
  })
  .addTransfer({ recipient, amount: 1000000n })
  .build()
```

### Complex Mandate Types

For nested structures:

```typescript
import { tribunalMandate } from '@uniswap/the-compact-sdk'

const TribunalMandate = tribunalMandate<{
  allocatorId: bigint
  priceCurve: {
    startPrice: bigint
    endPrice: bigint
    duration: bigint
  }
  conditions: Array<{
    token: `0x${string}`
    minAmount: bigint
  }>
}>({
  fields: [
    { name: 'allocatorId', type: 'uint256' },
    { name: 'priceCurve', type: 'PriceCurve' },
    { name: 'conditions', type: 'Condition[]' },
  ],
  nestedTypes: {
    PriceCurve: [
      { name: 'startPrice', type: 'uint256' },
      { name: 'endPrice', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
    ],
    Condition: [
      { name: 'token', type: 'address' },
      { name: 'minAmount', type: 'uint256' },
    ],
  },
})
```

## TypeScript Types

The SDK provides comprehensive TypeScript types for all operations:

### Core Types

```typescript
import type {
  Compact,
  BatchCompact,
  MultichainCompact,
  Claim,
  BatchClaim,
  MultichainClaim,
  Component,
  Lock,
  LockDetails,
  ResetPeriod,
  Scope,
  CompactCategory,
} from '@uniswap/the-compact-sdk'
```

### Builder Return Types

```typescript
import type {
  BuiltCompact,
  BuiltBatchCompact,
  BuiltMultichainCompact,
  BuiltClaim,
} from '@uniswap/the-compact-sdk'

// Example usage
const compact: BuiltCompact = await client.sponsor.compact()
  .arbiter(arbiterAddress)
  .sponsor(sponsorAddress)
  .nonce(1n)
  .expiresIn('1h')
  .lockTag(lockTag)
  .token(tokenAddress)
  .amount(amount)
  .build()

// Access built properties
compact.struct    // Compact struct
compact.hash      // EIP-712 hash
compact.typedData // Full typed data for signing
compact.mandate   // Optional mandate data
```

## Error Handling

The SDK provides detailed error types:

```typescript
import { decodeCompactError, type CompactError } from '@uniswap/the-compact-sdk'

try {
  await client.arbiter.submitClaim(claim.struct)
} catch (error) {
  // Try to decode as CompactError
  const compactError = decodeCompactError(error)

  if (compactError) {
    console.error('Compact error:', compactError.kind)
    console.error('Details:', compactError.args)

    // Handle specific errors
    switch (compactError.kind) {
      case 'InvalidScope':
        console.error('Invalid scope for lock')
        break
      case 'ClaimHashMismatch':
        console.error('Claim hash does not match')
        break
      // ... handle other error types
    }
  } else {
    // Handle non-Compact errors
    console.error('Unknown error:', error)
  }
}
```

## Best Practices

### 1. Nonce Management

```typescript
// Get next available nonce
const currentNonce = await client.view.getCurrentNonce(sponsorAddress)
const nextNonce = currentNonce + 1n

// Use sequential nonces for compacts
const compact = await client.sponsor.compact()
  .nonce(nextNonce)
  // ... other fields
  .build()
```

### 2. Expiration Times

```typescript
// Use relative expiration for better UX
const compact = await client.sponsor.compact()
  .expiresIn('15 minutes') // or '1h', '30s', '1d'
  // ...
  .build()

// Or set absolute timestamp
const expirationTimestamp = BigInt(Math.floor(Date.now() / 1000) + 900)
const compact = await client.sponsor.compact()
  .expires(expirationTimestamp)
  // ...
  .build()
```

### 3. Lock Tag Management

```typescript
// Use consistent lock tags for related operations
const USDC_SWAP_TAG = '0x000000000000555344435357' // "USDCSW" encoded
const WETH_SWAP_TAG = '0x000000000000574554485357' // "WETHSW" encoded

// Create semantic lock tags
function createLockTag(protocol: string, operation: string): `0x${string}` {
  const bytes = Buffer.concat([
    Buffer.from(protocol.slice(0, 6)),
    Buffer.from(operation.slice(0, 6)),
  ])
  return `0x${bytes.toString('hex').padEnd(24, '0')}` as `0x${string}`
}
```

### 4. Gas Optimization

```typescript
// Use batch compacts for multiple locks
const batchCompact = await client.sponsor.batchCompact()
  .arbiter(arbiterAddress)
  .sponsor(sponsorAddress)
  .nonce(1n)
  .expiresIn('1h')
  .addLock({ lockTag: tag1, token: token1, amount: amount1 })
  .addLock({ lockTag: tag2, token: token2, amount: amount2 })
  .addLock({ lockTag: tag3, token: token3, amount: amount3 })
  .build()

// More gas efficient than 3 separate compacts
```

### 5. Type Safety

```typescript
// Always use TypeScript for compile-time safety
const compact = await client.sponsor.compact()
  .arbiter(arbiterAddress) // Type-checked as `0x${string}`
  .sponsor(sponsorAddress)
  .nonce(1n) // Type-checked as bigint
  .expiresIn('1h') // Type-checked string format
  .lockTag(lockTag) // Type-checked as `0x${string}` with length
  .token(tokenAddress)
  .amount(amount) // Type-checked as bigint
  .build()
// Returns BuiltCompact<undefined> with proper typing
```

## Supported Chains

The Compact v1 is deployed at `0x00000000000000171ede64904551eeDF3C6C9788` on:

| Chain | Chain ID | Status |
|-------|----------|--------|
| Ethereum Mainnet | 1 | ✅ Supported |
| Base | 8453 | ✅ Supported |
| Unichain Sepolia | 1301 | ✅ Supported |

### Using Custom Deployments

```typescript
const client = new CompactClient({
  chainId: 1,
  address: '0xYourCustomDeployment...', // Custom address
  publicClient,
  walletClient,
})
```

## Examples

See the [examples](./examples) directory for complete working examples:

- [Basic Compact](./examples/basic-compact.ts) - Simple token lock and claim
- [Batch Operations](./examples/batch-compact.ts) - Multiple locks in one signature
- [Multichain Compact](./examples/multichain-compact.ts) - Cross-chain coordination
- [Using Mandates](./examples/mandates.ts) - Custom witness data
- [Intent-based Trading](./examples/intent-trading.ts) - Order flow with compacts

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/Uniswap/the-compact-sdk.git
cd the-compact-sdk

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Run linter
npm run lint
```

## Resources

- [The Compact Documentation](https://docs.uniswap.org/contracts/the-compact/overview)
- [Protocol Repository](https://github.com/Uniswap/the-compact)
- [EIP-712 Specification](https://eips.ethereum.org/EIPS/eip-712)
- [Viem Documentation](https://viem.sh/)

## License

MIT © [Uniswap Labs](https://github.com/Uniswap)
