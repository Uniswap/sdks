# The Compact SDK

[![npm version](https://img.shields.io/npm/v/@uniswap/the-compact-sdk/latest.svg)](https://www.npmjs.com/package/@uniswap/the-compact-sdk/v/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive TypeScript SDK for building and interacting with [The Compact v1](https://github.com/Uniswap/the-compact) - a generalized resource lock protocol that enables efficient cross-chain operations and intent-based transactions.

## Overview

The Compact is an on-chain protocol that allows users (sponsors) to lock tokens that can be credibly committed and subsequently claimed in exchange for fulfilling some condition (the mandate). This SDK provides type-safe, ergonomic tools to:

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
  account: '0x...', // Your account
})

// Create CompactClient
const client = new CompactClient({
  chainId: 1,
  publicClient,
  walletClient,
})

// Build and sign a compact
const compact = await client.sponsor
  .compact()
  .arbiter('0xArbiterAddress...')
  .sponsor(walletClient.account.address)
  .nonce(1n)
  .expiresIn('1h')
  .lockTag('0x000000000000000000000001')
  .token('0xUSDC...')
  .amount(1000000n) // 1 USDC
  .build()

// Sign the compact with wallet
const signature = await walletClient.signTypedData(compact.typedData)
console.log('Compact signed:', compact.hash)
```

## Core Concepts

### Resource Locks

Resource locks are the fundamental accounting unit in The Compact. They’re created whenever a depositor places tokens (ERC20 or native) into the protocol and are represented as fungible ERC‑6909 tokens.

Each resource lock is defined by four properties:

- **Underlying token** – the ERC20 or native token held in the lock
- **Allocator** – infrastructure that prevents double‑spends and authorizes use of the lock
- **Scope** – whether the lock can be spent on a single chain or across chains
- **Reset period** – a timelock used for forced withdrawals and emissary changes

These properties are packed into a 12‑byte **lock tag** (`bytes12 lockTag`). The ERC‑6909 token id for a given lock is:

> `lockId = (lockTag << 160) | tokenAddress`

So each unique `(lockTag, token)` pair corresponds to one fungible ERC‑6909 id. Anyone holding these ERC‑6909 tokens can create compacts backed by them.

---

### Compacts

A **Compact** is an EIP‑712 typed commitment signed by a sponsor that defines an **arbiter** to verify that some specified condition has been met and process a claim releasing the committed assets from the associated resource lock(s). Compacts **do not** move funds by themselves; they just define the conditions under which the committed tokens can be released.

The protocol defines three EIP‑712 Compact payload shapes:

- **Single Compact**  
  Commits an amount of a single resource lock on a single chain. Conceptually: “upon proving to `arbiter` that my `mandate` has been fulfilled, a claim can be made for up to `amount` from `resourceLock` before `expires`.”

- **Batch Compact**  
  Commits multiple locks from the same chain in one "batch" compact. An arbitrary number of resource locks, each with their own specific allocated amount, can be committed using this type of compact.

- **Multichain Compact**  
  Commits multiple locks across multiple chains in one compact. Each element binds:
  - a `chainId`
  - an `arbiter` for that chain
  - one or more `(lock, amount)` commitments
  - a **Mandate** witness (see below)

Single and batch compacts _may optionally_ include a Mandate. Multichain compacts **must always** include a Mandate per element.

---

### Claims

A **Claim** is what an arbiter submits to The Compact to authorize a claim against one or more resource locks.

At a high level, a claim:

- Binds to a particular compact (or registered compact hash) and its `nonce` / `expires`
- Verifies sponsor authorization of the compact in question (via signature, registration, or emissary)
- Specifies how The Compact should distribute the committed asset(s) via an array of **components**

Each component is an encoded as `(lockTag, recipient, amount)`. How The Compact interprets a component depends on the `lockTag` embedded in it:

1. **Direct transfer (keep the lock as‑is)**

   - Component’s `lockTag` == original lock’s `lockTag`
   - The claim transfers ERC‑6909 tokens for that lock id to the recipient.

2. **Convert to a new resource lock**

   - Component’s `lockTag` is non‑zero and different from the original
   - The claim burns from the original lock and mints into a new lock with the new `lockTag` for the recipient.
   - This changes allocator / scope / reset period while keeping the funds in The Compact protocol.

3. **Withdraw underlying tokens**
   - Component’s `lockTag` is zero
   - The claim burns ERC‑6909 and withdraws the underlying ERC20 or native tokens to the recipient, exiting The Compact.

The TS SDK focuses on helping construct these claim payloads correctly (including component encoding) and leaves allocator- and arbiter-specific logic to the integrator.

---

### Mandates (Witness Data)

**Mandates** are typed witness data used to add arbitrary, domain‑specific conditions to a compact and its eventual claims.

On-chain, a Mandate is an extra struct appended to the end of the compact’s EIP‑712 payload. The Compact itself essentially treats this as an **opaque blob**; it really only cares about:

- `witness` – the `bytes32` hash of the encoded Mandate data
- `witnessTypestring` – the EIP‑712 typestring describing the Mandate struct (and any nested Mandate\* structs)

During a claim, the arbiter provides the `witness` hash and `witnessTypestring`. The Compact dynamically rebuilds the full EIP‑712 typestring, recomputes the claim hash, and passes that into the allocator’s authorization logic. This ties allocator approval to both:

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

#### Build and Sign a Compact

```typescript
// Build compact
const compact = await client.sponsor
  .compact()
  .arbiter(arbiterAddress)
  .sponsor(sponsorAddress)
  .nonce(1n)
  .expiresIn('15m')
  .lockTag('0x000000000000000000000001')
  .token('0xTokenAddress...')
  .amount(1000000n)
  .build()

// Sign the compact
const signature = await walletClient.signTypedData(compact.typedData)
```

#### Batch Compact

Lock multiple tokens in a single signature:

```typescript
const batchCompact = await client.sponsor
  .batchCompact()
  .arbiter(arbiterAddress)
  .sponsor(sponsorAddress)
  .nonce(1n)
  .expiresIn('1h')
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

const signature = await walletClient.signTypedData(batchCompact.typedData)
```

### Arbiter Client

Handles operations for authorized processors.

#### Build and Submit a Claim

```typescript
// Build claim from a compact
const claim = await client.arbiter
  .claim()
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
const result = await client.arbiter.claim(claim.struct)
console.log('Claim hash:', result.claimHash)
console.log('Transaction hash:', result.txHash)
```

#### Different Claimant Types

```typescript
const claim = await client.arbiter
  .claim()
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
const status = await client.view.getForcedWithdrawalStatus(accountAddress, lockId)
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
const mandateType = simpleMandate<{ maxAmount: bigint }>([{ name: 'maxAmount', type: 'uint256' }])

// Build multichain compact
const multichainCompact = await client.sponsor
  .multichainCompact()
  .sponsor(sponsorAddress)
  .nonce(1n)
  .expiresIn('1h')
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

const signature = await walletClient.signTypedData(multichainCompact.typedData)
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
const compact = await client.sponsor
  .compact()
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
const claim = await client.arbiter
  .claim()
  .fromCompact({ compact: compact.struct, signature })
  .witness(OrderMandate, {
    orderId: '0x123...',
    minFillAmount: 900000n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 900),
  })
  .addTransfer({ recipient, amount: 1000000n })
  .build()
```

### Tribunal Allocator Mandates

The SDK includes the official Tribunal allocator mandate type, which supports cross-chain fills with dynamic pricing curves:

```typescript
import { TribunalMandate, createDutchAuction } from '@uniswap/the-compact-sdk'

// Create a Dutch auction price curve (150% → 100% over 1000 blocks)
const priceCurve = createDutchAuction({
  startPricePercent: 1.5,
  endPricePercent: 1.0,
  durationBlocks: 1000,
})

// Build compact with Tribunal mandate
const compact = await client.sponsor
  .compact()
  .arbiter(arbiterAddress)
  .sponsor(sponsorAddress)
  .nonce(1n)
  .expiresIn('1h')
  .lockTag(lockTag)
  .token(tokenAddress)
  .amount(1000000n)
  .witness(TribunalMandate, {
    adjuster: '0xAdjusterAddress...',
    fills: [
      {
        chainId: 1n,
        tribunal: '0xTribunalAddress...',
        expires: BigInt(Math.floor(Date.now() / 1000) + 3600),
        components: [
          {
            fillToken: '0xUSDC...',
            minimumFillAmount: 900000n, // Min 0.9 USDC
            recipient: '0xRecipient...',
            applyScaling: true,
          },
        ],
        baselinePriorityFee: 1000000n,
        scalingFactor: 1000000000000000000n, // 100% (1e18)
        priceCurve, // Dutch auction curve elements
        recipientCallback: [],
        salt: '0x0000000000000000000000000000000000000000000000000000000000000001',
      },
    ],
  })
  .build()
```

The Tribunal mandate structure supports:

- **Dynamic pricing** via price curve arrays (compatible with price curve calculators)
- **Cross-chain fills** with per-chain tribunal addresses
- **Fill validation** with minimum amounts and scaling factors
- **Callbacks** for post-fill operations on recipient addresses

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
import type { BuiltCompact, BuiltBatchCompact, BuiltMultichainCompact, BuiltClaim } from '@uniswap/the-compact-sdk'

// Example usage
const compact: BuiltCompact = await client.sponsor
  .compact()
  .arbiter(arbiterAddress)
  .sponsor(sponsorAddress)
  .nonce(1n)
  .expiresIn('1h')
  .lockTag(lockTag)
  .token(tokenAddress)
  .amount(amount)
  .build()

// Access built properties
compact.struct // Compact struct
compact.hash // EIP-712 hash
compact.typedData // Full typed data for signing
compact.mandate // Optional mandate data
```

## Error Handling

The SDK provides detailed error types:

```typescript
import { decodeCompactError, type CompactError } from '@uniswap/the-compact-sdk'

try {
  await client.arbiter.claim(claim.struct)
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
const compact = await client.sponsor
  .compact()
  .nonce(nextNonce)
  // ... other fields
  .build()
```

### 2. Expiration Times

```typescript
// Use relative expiration for better UX
const compact = await client.sponsor
  .compact()
  .expiresIn('15m') // or '1h', '30s', '1d'
  // ...
  .build()

// Or set absolute timestamp
const expirationTimestamp = BigInt(Math.floor(Date.now() / 1000) + 900)
const compact = await client.sponsor
  .compact()
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
  const bytes = Buffer.concat([Buffer.from(protocol.slice(0, 6)), Buffer.from(operation.slice(0, 6))])
  return `0x${bytes.toString('hex').padEnd(24, '0')}` as `0x${string}`
}
```

### 4. Gas Optimization

```typescript
// Use batch compacts for multiple locks
const batchCompact = await client.sponsor
  .batchCompact()
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
const compact = await client.sponsor
  .compact()
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

The Compact v1 is deployed at `0x00000000000000171ede64904551eeDF3C6C9788` on various chains. The SDK surfaces current known deployments (Ethereum Mainnet, Unichain, Base, Arbitrum), and can support custom deployments across other chains and/or at different addresses.

### Using Custom Deployments

```typescript
const client = new CompactClient({
  chainId: 1,
  address: '0xYourCustomDeployment...', // Custom address
  publicClient,
  walletClient,
})
```

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
