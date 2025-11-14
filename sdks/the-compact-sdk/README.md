# The Compact SDK

[![npm version](https://img.shields.io/npm/v/@uniswap/the-compact-sdk/latest.svg)](https://www.npmjs.com/package/@uniswap/the-compact-sdk/v/latest)

A TypeScript SDK for building and interacting with [The Compact v1](https://github.com/Uniswap/the-compact).

## Features

- 🔐 **EIP-712 Compact Building**: Build and sign `Compact`, `BatchCompact`, and `MultichainCompact` messages
- 📝 **Claim Payloads**: Build claim payloads with correct claimant packing and witness hashing
- 🔗 **Type-Safe Contract Calls**: Call `ITheCompact` and `ITheCompactClaims` with strongly-typed payloads
- 🛠️ **Fluent Builders**: Ergonomic builder patterns for all operations
- 🌐 **Multi-Chain Support**: First-class support for Ethereum, Base, and Unichain
- ⚡ **Framework Agnostic**: Built on viem primitives, works with any framework

## Installation

```bash
npm install @uniswap/the-compact-sdk
# or
yarn add @uniswap/the-compact-sdk
```

## Quick Start

### Building a Compact

```typescript
import { CompactBuilder, createDomain, defineMandateType } from '@uniswap/the-compact-sdk'

// Create EIP-712 domain
const domain = createDomain({
  chainId: 1,
  contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
})

// Define your mandate type
const Mandate = defineMandateType<{
  orderId: `0x${string}`
  minFill: bigint
}>({
  fields: [
    { name: 'orderId', type: 'bytes32' },
    { name: 'minFill', type: 'uint256' },
  ],
})

// Build and sign compact
const { struct, typedData, hash, sign } = CompactBuilder.single(domain)
  .sponsor(sponsorAddress)
  .arbiter(arbiterAddress)
  .nonce(nonce)
  .expiresIn('15m')
  .lockTag(lockTag)
  .token(tokenAddress)
  .amount(amount)
  .witness(Mandate, { orderId, minFill })
  .build()

const signature = await sign(walletClient)
```

### Building a Claim

```typescript
import { ClaimBuilder } from '@uniswap/the-compact-sdk'

const claimBuilt = ClaimBuilder.single(domain)
  .fromCompact({
    compact: compactStruct,
    signature: sponsorSignature,
    id: lockId,
  })
  .allocator(allocatorAddress)
  .allocatorData(allocatorDataBytes)
  .allocatedAmount(allocatedAmount)
  .witness(Mandate, { orderId, minFill })
  .addTransfer({
    recipient: fillerAddress,
    amount: fillerAmount,
  })
  .addWithdraw({
    recipient: userAddress,
    amount: userAmount,
  })
  .build()
```

### Using the Client

```typescript
import { createCompactClient } from '@uniswap/the-compact-sdk'
import { createPublicClient, createWalletClient, http } from 'viem'
import { mainnet } from 'viem/chains'

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
})

const walletClient = createWalletClient({
  chain: mainnet,
  transport: http(),
})

const compact = createCompactClient({
  chainId: 1,
  publicClient,
  walletClient,
})

// Deposit tokens
const { id } = await compact.sponsor.depositERC20({
  token: tokenAddress,
  lockTag,
  amount: depositAmount,
  recipient: sponsorAddress,
})

// Submit claim
const { txHash, claimHash } = await compact.arbiter.claim(claimBuilt.struct)
```

## Documentation

For detailed documentation, see:

- [The Compact Documentation](https://docs.uniswap.org/contracts/the-compact/overview)
- [Compacts & EIP-712 Reference](https://docs.uniswap.org/contracts/the-compact/reference/compacts-eip712)
- [Core Interfaces Reference](https://docs.uniswap.org/contracts/the-compact/reference/core-interfaces)

## Supported Chains

The Compact v1 is deployed at `0x00000000000000171ede64904551eeDF3C6C9788` on:

- Ethereum Mainnet (chainId: 1)
- Base (chainId: 8453)
- Unichain (chainId: 130)

Custom deployments are also supported.

## License

MIT

