> **Last Updated:** 2025-11-19

# CLAUDE.md - flashtestations-sdk

## Overview

**Purpose**: Verify that Unichain blocks were built by Trusted Execution Environments (TEEs) running specific versions of Flashbots' op-rbuilder software using cryptographic attestations.

**What are Flashtestations?** Flashtestations are cryptographic proofs embedded as transactions in the last slot of each Unichain block that prove the block was built by a TEE running a specific version of op-rbuilder. Unlike other blockchains where block builders are trusted actors with no verifiable guarantees of fair building, flashtestations provide hardware-enforced cryptographic proof that a block was constructed with a particular version of builder software.

**Key Innovation**: Unichain uses Intel TDX (Trusted Domain Extensions) TEEs where op-rbuilder runs in a secure enclave. Each build creates a unique measurement (workload ID) based on the exact software configuration. This SDK allows developers to verify locally that a block was built with an expected workload, enabling MEV-aware infrastructure, transparent block building, and tamper-proof execution guarantees.

**Part of**: Uniswap SDK ecosystem for Unichain infrastructure

**Status**: Early development (v0.1.0), actively maintained for Unichain mainnet and testnet

## Architecture

### High-Level Flow

```
User Input:
  - Workload ID (expected TEE workload) or Measurement Registers
  - Block parameter (tag like 'latest', block number, or hash)
  - Chain ID (130=mainnet, 1301=sepolia, etc.)
    │
    ├─ verifyFlashtestationInBlock()  [Main verification function]
    │   │
    │   ├─ computeWorkloadId()  [if measurement registers provided]
    │   │   └─ Apply bitwise ops and keccak256 hash
    │   │
    │   └─ RpcClient.getFlashtestationEvent()  [Get event from chain]
    │       │
    │       ├─ Get block by parameter
    │       ├─ Extract last transaction (the flashtestation tx)
    │       ├─ Parse BlockBuilderProofVerified event from receipt logs
    │       └─ Fetch source locators from BlockBuilderPolicy contract
    │
Output:
  - VerificationResult:
      - isBuiltByExpectedTee: boolean (workload match?)
      - workloadMetadata: WorkloadId, commitHash, builderAddress, etc.
      - blockExplorerLink: URL to block on Uniscan
```

### Module Structure

```
src/
├── index.ts                      # Main entry point (exports)
├── types/
│   ├── index.ts                  # Core types (VerificationResult, WorkloadMeasureRegisters, error classes)
│   └── validation.ts             # Input validation helpers
├── config/
│   └── chains.ts                 # Chain configuration registry (Mainnet, Sepolia, Alphanet, Experimental)
├── crypto/
│   └── workload.ts               # Workload ID computation from measurement registers
├── rpc/
│   ├── client.ts                 # Viem-based JSON-RPC client with retry logic and caching
│   └── abi.ts                    # BlockBuilderPolicy contract ABI (event + getWorkloadMetadata)
└── verification/
    └── service.ts                # High-level verification logic (verifyFlashtestationInBlock, getFlashtestationEvent)

test/
├── config/chains.test.ts         # Chain configuration tests
├── crypto/workload.test.ts       # Workload ID computation tests
├── rpc/client.test.ts            # RPC client and retry logic tests
├── verification/service.test.ts  # Verification function tests
├── __mocks__/viem.ts             # Viem mock for testing
└── setup.js                      # Jest configuration

examples/
├── verifyBlock.ts                # Verify if latest block matches workload ID
└── getFlashtestationTx.ts        # Retrieve flashtestation event from block
```

## Key Components

### 1. Verification Service (`src/verification/service.ts`)

**Main Functions**:

- **`verifyFlashtestationInBlock(workloadIdOrRegisters, blockParameter, config)`**
  - **Input**: Workload ID (hex string) or WorkloadMeasureRegisters object
  - **Output**: VerificationResult with match status and metadata
  - **Process**:
    1. Compute workload ID from registers if needed
    2. Normalize workload ID (add 0x prefix, lowercase)
    3. Fetch flashtestation event from specified block
    4. Compare workload IDs (exact byte match)
    5. Return metadata about the block and TEE workload
  - **Throws**: NetworkError, BlockNotFoundError, ValidationError, ChainNotSupportedError

- **`getFlashtestationEvent(blockParameter, config)`**
  - **Input**: Block identifier and chain config
  - **Output**: FlashtestationEvent object or null
  - **Purpose**: Raw event retrieval without verification (useful for debugging or auditing all TEE workloads)
  - **Returns null**: If block has no flashtestation transaction

### 2. RPC Client (`src/rpc/client.ts`)

**Purpose**: Encapsulates JSON-RPC interaction with viem, handles retries, and manages connection caching.

**Key Features**:

- **Client Caching**: Reuses connections per chain ID + RPC URL pair (reduces connection overhead)
- **Exponential Backoff Retry**: Retries failed network requests with exponential backoff (default: 3 retries, 1s initial delay)
- **Error Handling**: Distinguishes between transient (NetworkError) and permanent errors (BlockNotFoundError)
- **30-second Timeout**: HTTP transport timeout prevents hanging requests

**Key Methods**:

- `getBlock(blockParameter)`: Fetch block data, supports tags ('latest', 'safe') and numbers/hashes
- `getTransactionReceipt(txHash)`: Fetch receipt for transaction (used to read event logs)
- `getFlashtestationEvent(blockParameter)`: Orchestrates block→last tx→receipt→event parsing pipeline
- `getSourceLocators(workloadId)`: Contract read-call to BlockBuilderPolicy for source code URLs

**Implementation Details**:

- Uses viem's `parseEventLogs` to decode BlockBuilderProofVerified event from transaction receipt logs
- Validates exactly one flashtestation event per block (safety check)
- Converts block parameters (tags, numbers, hashes) using `toViemBlockParameter()` helper

### 3. Workload ID Computation (`src/crypto/workload.ts`)

**Purpose**: Compute workload ID from TEE measurement registers (same algorithm as on-chain smart contract).

**Algorithm** (matches Solidity BlockBuilderPolicy.sol):

```
workloadId = keccak256(
  concat(
    mrTd,
    rtMr0,
    rtMr1,
    rtMr2,
    rtMr3,
    mrConfigId,
    xFAM ^ expectedXfamBits,
    tdAttributes & ~ignoredTdAttributesBitmask
  )
)
```

**Measurement Registers** (from Intel TDX):

| Register     | Size  | Purpose                                    |
| ------------ | ----- | ------------------------------------------ |
| tdAttributes | 8 B   | TD configuration flags                     |
| xFAM         | 8 B   | Feature mask (XFE bits)                    |
| mrTd         | 48 B  | Core TD measurement (hash of config)       |
| mrConfigId   | 48 B  | VMM configuration measurement              |
| rtMr0        | 48 B  | Runtime measurement 0 (OS kernel)          |
| rtMr1        | 48 B  | Runtime measurement 1 (application)        |
| rtMr2        | 48 B  | Runtime measurement 2 (reserved)           |
| rtMr3        | 48 B  | Runtime measurement 3 (reserved)           |

**TDX Constants** (hardcoded from BlockBuilderPolicy.sol):

- `expectedXfamBits = 0x01 XOR 0x02 = 0x03` (expected feature mask)
- `ignoredTdAttributesBitmask = 0x10000000 OR 0x40000000 OR 0x80000000` (bits to mask out)

**Helper Functions**:

- `hexToBytes()`: Convert hex string to Uint8Array
- `xorBytes()`, `orBytes()`, `andBytes()`, `notBytes()`: Bitwise operations
- `concatBytes()`: Concatenate Uint8Arrays

### 4. Chain Configuration (`src/config/chains.ts`)

**Supported Chains**:

```typescript
130:     Unichain Mainnet
         Contract: 0x0000... (TODO: pending deployment)
         RPC: https://mainnet.unichain.org
         Explorer: https://uniscan.xyz

1301:    Unichain Sepolia (Testnet - Primary Testing)
         Contract: 0x3b03b3caabd49ca12de9eba46a6a2950700b1db4
         RPC: https://sepolia.unichain.org
         Explorer: https://sepolia.uniscan.xyz

22444422: Unichain Alphanet (Internal Testing)
         Contract: 0x8d0e3f57052f33CEF1e6BE98B65aad1794dc95a5
         RPC: Requires RPC_URL env var (not public)

33611633: Unichain Experimental (Research)
         Contract: 0x2E41cb0D68D8dB7ebd16cef81D7eD82e7E1fbA40
         RPC: Requires RPC_URL env var (not public)
```

**Chain Helper Functions**:

- `getChainConfig(chainId)`: Get full config object
- `getContractAddress(chainId)`: Get BlockBuilderPolicy contract address
- `getRpcUrl(chainId)`: Get default RPC URL (respects RPC_URL env var)
- `getBlockExplorerUrl(chainId)`: Get block explorer base URL
- `getSupportedChains()`: List all supported chain IDs
- `isChainSupported(chainId)`: Boolean check

**All throw `ChainNotSupportedError` for unsupported chains**

### 5. Type Definitions (`src/types/index.ts`)

**Core Types**:

```typescript
// Main verification result (discriminated union)
VerificationResult =
  | { isBuiltByExpectedTee: true; blockExplorerLink: string | null; workloadMetadata: WorkloadMetadata }
  | { isBuiltByExpectedTee: false; blockExplorerLink: string | null; workloadMetadata: WorkloadMetadata | null }

// TEE workload metadata
WorkloadMetadata = {
  workloadId: string;              // bytes32 hex
  commitHash: string;              // git commit of op-rbuilder source
  builderAddress: string;          // Ethereum address of block builder
  version: number;                 // flashtestation protocol version
  sourceLocators: string[];        // GitHub URLs to source code
}

// TEE measurement registers for workload ID computation
WorkloadMeasureRegisters = {
  tdAttributes: `0x${string}`;     // 8 bytes hex
  xFAM: `0x${string}`;             // 8 bytes hex
  mrTd: `0x${string}`;             // 48 bytes hex
  mrConfigId: `0x${string}`;       // 48 bytes hex
  rtMr0: `0x${string}`;            // 48 bytes hex
  rtMr1: `0x${string}`;            // 48 bytes hex
  rtMr2: `0x${string}`;            // 48 bytes hex
  rtMr3: `0x${string}`;            // 48 bytes hex
}

// Parsed event from BlockBuilderProofVerified
FlashtestationEvent = {
  caller: string;                  // block builder address
  workloadId: string;              // bytes32 hex
  version: number;                 // protocol version
  blockContentHash: `0x${string}`;// hash of block (excluding flashtestation tx)
  commitHash: string;              // op-rbuilder git commit
  sourceLocators: string[];        // source code URLs
}

// Configuration for RPC client
ClientConfig = {
  chainId: number;
  rpcUrl?: string;                 // optional override
}

// Block identifier
BlockParameter = 'earliest' | 'latest' | 'safe' | 'finalized' | 'pending' | string | number | bigint
```

**Custom Error Classes**:

- `NetworkError`: RPC connection/network failure (retryable)
- `BlockNotFoundError`: Specified block doesn't exist (permanent)
- `ValidationError`: Invalid measurement registers (user input error)
- `ChainNotSupportedError`: Chain ID not in registry (user input error)

### 6. Contract Integration (`src/rpc/abi.ts`)

**BlockBuilderPolicy Contract ABI** (partial):

- **Event**: `BlockBuilderProofVerified(address caller, bytes32 workloadId, uint8 version, bytes32 blockContentHash, string commitHash)`
  - Emitted by the flashtestation transaction at the end of each block
  - Provides cryptographic proof that the block was built by a specific TEE workload

- **Function**: `getWorkloadMetadata(bytes32 workloadId) → (string commitHash, string[] sourceLocators)`
  - Stores metadata about known workload IDs
  - Allows on-chain retrieval of source code locations
  - Called by SDK to enrich verification results

## API Reference

### Primary Export: `verifyFlashtestationInBlock()`

```typescript
async function verifyFlashtestationInBlock(
  workloadIdOrRegisters: string | WorkloadMeasureRegisters,
  blockParameter: BlockParameter,
  config: ClientConfig
): Promise<VerificationResult>
```

**Usage Example**:

```typescript
import { verifyFlashtestationInBlock } from 'flashtestations-sdk'

// Verify latest block matches expected workload
const result = await verifyFlashtestationInBlock(
  '0x1234567890abcdef...', // workload ID
  'latest',                 // block parameter
  { chainId: 1301 }         // Unichain Sepolia
)

if (result.isBuiltByExpectedTee) {
  console.log('✓ Block built by expected TEE')
  console.log(`Workload: ${result.workloadMetadata.workloadId}`)
  console.log(`Commit: ${result.workloadMetadata.commitHash}`)
} else {
  console.log('✗ Block built by different TEE')
  if (result.workloadMetadata) {
    console.log(`Actual workload: ${result.workloadMetadata.workloadId}`)
  }
}
```

### Secondary Export: `getFlashtestationEvent()`

```typescript
async function getFlashtestationEvent(
  blockParameter?: BlockParameter,
  config: ClientConfig
): Promise<FlashtestationEvent | null>
```

**Usage Example**:

```typescript
import { getFlashtestationEvent } from 'flashtestations-sdk'

const event = await getFlashtestationEvent('latest', { chainId: 1301 })

if (event) {
  console.log('Event found:', event.workloadId, event.commitHash)
} else {
  console.log('No flashtestation in this block')
}
```

### Utility Functions

**`computeWorkloadId(registers: WorkloadMeasureRegisters): string`**
- Compute workload ID from measurement registers locally
- Useful for pre-computing or debugging

**`getSupportedChains(): number[]`**
- Returns `[130, 1301, 22444422, 33611633]`

**`isChainSupported(chainId: number): boolean`**
- Quick check before calling verification

**`getChainConfig(chainId: number): ChainConfig`**
- Get full chain configuration

## Dependencies

**Production**:
- `viem` ^2.23.5 - Modern Ethereum TypeScript library (contract interaction, event parsing, client management)

**Development**:
- `typescript` ^5.6.2 - Type checking (modern version with strict mode)
- `jest` 25.5.0 - Unit testing
- `ts-jest` ^25.5.1 - Jest TypeScript transformer
- `@typescript-eslint/*` ^8.38.0 - Linting
- `eslint-config-prettier` ^9.1.0 - Formatting

**Note**: No dependency on ethers.js (unlike most SDK packages). Uses viem for modern async/await patterns and better TypeScript support.

## Development Workflow

### Build System

**Commands**:

```bash
# Build to CJS, ESM, and TypeScript declarations
yarn build

# Build individual targets
yarn build:cjs    # CommonJS
yarn build:esm    # ECMAScript modules
yarn build:types  # TypeScript declarations

# Clean dist directory
yarn clean
```

**Output Structure**:

```
dist/
├── cjs/
│   ├── src/
│   │   ├── index.js
│   │   ├── types/
│   │   ├── config/
│   │   ├── crypto/
│   │   ├── rpc/
│   │   └── verification/
│   └── package.json  (with "main" export)
├── esm/
│   ├── src/
│   │   └── [same structure]
│   └── package.json  (with "module" export)
└── types/
    ├── src/
    │   └── [.d.ts files]
    └── package.json  (with "types" export)
```

### Testing

```bash
# Run all tests
yarn test

# Watch mode
yarn test --watch

# Test specific file
yarn test src/crypto/workload.test.ts
```

**Test Coverage**:

- **workload.test.ts**: Workload ID computation from registers, bitwise operations
- **chains.test.ts**: Chain configuration lookup, error handling for unsupported chains
- **rpc/client.test.ts**: Retry logic, client caching, block parameter conversion, event parsing
- **verification/service.test.ts**: End-to-end verification flows, workload matching

**Mock Infrastructure**:

- `test/__mocks__/viem.ts`: Mock viem client for testing without live RPC

### Linting & Formatting

```bash
# Lint TypeScript files
yarn lint

# Prettier formatting
# Uses 80 column width and semicolons (different from other SDKs)
```

## Code Patterns

### Pattern 1: Verification with Error Handling

```typescript
import {
  verifyFlashtestationInBlock,
  NetworkError,
  BlockNotFoundError,
  ValidationError,
  ChainNotSupportedError,
} from 'flashtestations-sdk'

async function verifyWithFallback(workloadId: string, chainId: number) {
  try {
    const result = await verifyFlashtestationInBlock(
      workloadId,
      'latest',
      { chainId }
    )
    return result
  } catch (error) {
    if (error instanceof ChainNotSupportedError) {
      console.error(`Chain ${chainId} not supported`)
    } else if (error instanceof NetworkError) {
      console.error('Network failed, retrying...')
      // Can implement custom retry logic here
    } else if (error instanceof BlockNotFoundError) {
      console.error('Block not found')
    }
    throw error
  }
}
```

### Pattern 2: Compute Workload ID from Registers

```typescript
import {
  computeWorkloadId,
  verifyFlashtestationInBlock,
  type WorkloadMeasureRegisters,
} from 'flashtestations-sdk'

// Pre-compute ID once, then verify multiple blocks
const registers: WorkloadMeasureRegisters = {
  tdAttributes: '0x0000000000000000',
  xFAM: '0x0000000000000003',
  mrTd: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  mrConfigId: '0x0000000000000000000000000000000000000000000000000000000000000000',
  rtMr0: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  rtMr1: '0xef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abab',
  rtMr2: '0x234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeff',
  rtMr3: '0x67890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234d',
}

const workloadId = computeWorkloadId(registers)

// Now verify blocks using this ID
for (let blockNum = 100; blockNum <= 110; blockNum++) {
  const result = await verifyFlashtestationInBlock(
    workloadId,
    blockNum,
    { chainId: 1301 }
  )
  console.log(`Block ${blockNum}: ${result.isBuiltByExpectedTee ? '✓' : '✗'}`)
}
```

### Pattern 3: Monitor Workload Changes

```typescript
import { getFlashtestationEvent } from 'flashtestations-sdk'

async function monitorWorkloadChanges(chainId: number) {
  let lastWorkloadId: string | null = null

  setInterval(async () => {
    try {
      const event = await getFlashtestationEvent('latest', { chainId })

      if (event && event.workloadId !== lastWorkloadId) {
        console.log(`Workload changed to ${event.workloadId}`)
        console.log(`Commit: ${event.commitHash}`)
        console.log(`Builder: ${event.caller}`)
        lastWorkloadId = event.workloadId
      }
    } catch (error) {
      console.error('Failed to check workload:', error)
    }
  }, 5000) // Check every 5 seconds
}
```

### Pattern 4: Batch Block Verification

```typescript
import { verifyFlashtestationInBlock } from 'flashtestations-sdk'

async function verifyBlockRange(
  workloadId: string,
  startBlock: number,
  endBlock: number,
  chainId: number
) {
  const results = await Promise.allSettled(
    Array.from({ length: endBlock - startBlock + 1 }, (_, i) =>
      verifyFlashtestationInBlock(workloadId, startBlock + i, { chainId })
    )
  )

  const verified = results.filter(
    (r) => r.status === 'fulfilled' && r.value.isBuiltByExpectedTee
  ).length

  console.log(`${verified}/${results.length} blocks verified`)
  return verified === results.length
}
```

## Integration with Other Uniswap SDKs

### Relationship to SDK Ecosystem

```
flashtestations-sdk (STANDALONE)
    │
    ├─ No direct dependencies on other SDKs
    │  (Unichain-specific infrastructure, not DEX-related)
    │
    └─ Could be integrated with:
       ├─ smart-wallet-sdk (verify transactions on Unichain)
       ├─ tamperproof-transactions (cross-verify transaction integrity)
       └─ frontend dApps (verify block building for transparency)
```

### Example Integration with Smart Wallet SDK

```typescript
import { verifyFlashtestationInBlock } from 'flashtestations-sdk'
// import { SmartWalletAccount } from '@uniswap/smart-wallet-sdk'

// When executing a batch transaction on Unichain, verify the block
async function verifySmartWalletExecution(
  expectedWorkloadId: string,
  blockNumber: number
) {
  const result = await verifyFlashtestationInBlock(
    expectedWorkloadId,
    blockNumber,
    { chainId: 130 } // Unichain mainnet
  )

  if (result.isBuiltByExpectedTee) {
    console.log('✓ Transaction executed by trusted TEE builder')
    return true
  } else {
    console.warn('✗ Transaction built by unexpected TEE workload')
    console.log(`Expected: ${expectedWorkloadId}`)
    console.log(`Actual: ${result.workloadMetadata?.workloadId}`)
    return false
  }
}
```

### Use Cases in Uniswap Applications

1. **Infrastructure Operators**: Verify that blocks on Unichain are built by expected TEE software versions
2. **Smart Wallet Dapps**: Confirm batched transactions are executed by trusted builders
3. **MEV-Aware Applications**: Verify execution environment guarantees when building on Unichain
4. **Block Builders**: Audit and prove their TEE workload configuration
5. **Security Researchers**: Investigate workload changes or unexpected builder configurations

## Configuration

### Environment Variables

**Production**:
- `RPC_URL`: Override default RPC endpoint (optional, chain-specific defaults provided)

**Development**:
- `RPC_URL`: Point to local testnet or custom RPC endpoint

### Runtime Configuration

All configuration passed via `ClientConfig` parameter:

```typescript
interface ClientConfig {
  chainId: number           // Required: 130, 1301, 22444422, or 33611633
  rpcUrl?: string          // Optional: override default RPC URL
}
```

## Conventions and Patterns

### Naming Conventions

- **Module files**: Lowercase with hyphens (`workload.ts`, `client.ts`, `service.ts`)
- **Types**: PascalCase (`VerificationResult`, `WorkloadMeasureRegisters`, `FlashtestationEvent`)
- **Functions**: camelCase (`verifyFlashtestationInBlock`, `computeWorkloadId`)
- **Constants**: UPPERCASE_SNAKE_CASE (`TDX_CONSTANTS`, `CHAIN_CONFIGS`)
- **Error classes**: PascalCase with `Error` suffix (`NetworkError`, `BlockNotFoundError`)

### Error Handling Pattern

All functions throw specific custom errors to allow programmatic error handling:

```typescript
try {
  await verifyFlashtestationInBlock(id, 'latest', { chainId })
} catch (error) {
  if (error instanceof ValidationError) {
    // Handle invalid input
  } else if (error instanceof NetworkError) {
    // Handle transient network failure (retryable)
  } else if (error instanceof BlockNotFoundError) {
    // Handle permanent error
  } else if (error instanceof ChainNotSupportedError) {
    // Handle invalid chain
  } else {
    // Unexpected error
  }
}
```

### TypeScript Strict Mode

- All files use strict TypeScript mode (`strict: true`)
- No implicit `any` types
- All exports include full type declarations
- Discriminated union types for branching on results

### Viem Over Ethers

- Uses viem (v2) instead of ethers for modern async/await patterns
- Viem's type safety better aligns with TypeScript 5.6
- Client caching reduces connection overhead
- parseEventLogs provides type-safe event parsing

### Contract Interaction Pattern

- Minimal ABI (only needed functions/events, as Uint8Array operations happen off-chain)
- Read-only contract calls (getWorkloadMetadata for metadata lookup)
- Event parsing from transaction receipts (not polling)

## Known Limitations and TODOs

1. **Mainnet Contract Address Pending**: BlockBuilderPolicy contract on Unichain Mainnet (chain 130) is still being deployed. Contract address currently set to `0x0000...` as placeholder.

2. **Private RPC Endpoints**: Alphanet and Experimental chains require private RPC endpoints via environment variables. These chains are for internal testing only.

3. **Single Flashtestation Per Block**: SDK validates exactly one BlockBuilderProofVerified event per block. This enforces protocol invariant but errors if unexpected duplicates occur.

4. **Block Explorer Coverage**: Block explorer links generated for mainnet/sepolia only. Alphanet and experimental have no block explorers configured.

## Performance Considerations

### Client Caching

RPC clients are cached by `chainId:rpcUrl` combination. Subsequent calls reuse existing connections:

```typescript
// First call: creates and caches client
await verifyFlashtestationInBlock(id, 'latest', { chainId: 1301 })

// Second call: reuses cached client (no new connection)
await verifyFlashtestationInBlock(id, 'latest', { chainId: 1301 })
```

### Retry Logic

Failed requests automatically retry with exponential backoff:

- Default: 3 retries, 1-second initial delay
- Backoff multiplier: 2x per attempt (1s → 2s → 4s)
- 30-second HTTP timeout prevents indefinite hangs
- BlockNotFoundError never retried (permanent failure)

### Batch Verification

When verifying many blocks, use `Promise.allSettled()` for parallel requests:

```typescript
// Verify 100 blocks in parallel (respects viem client connection pooling)
const results = await Promise.allSettled(
  Array.from({ length: 100 }, (_, i) =>
    verifyFlashtestationInBlock(workloadId, startBlock + i, { chainId })
  )
)
```

## Testing

### Running Tests

```bash
# All tests
yarn test

# Watch mode during development
yarn test --watch

# Specific test file
yarn test src/crypto/workload.test.ts

# Coverage report (if configured)
yarn test --coverage
```

### Test Structure

- Tests co-located with source code: `src/module.ts` + `test/module.test.ts`
- Viem client mocked to avoid RPC calls in tests
- Deterministic test data (fixed workload IDs, block numbers)
- Error path testing for all custom error types

### Example Test

```typescript
// src/crypto/workload.test.ts
describe('computeWorkloadId', () => {
  it('should compute consistent workload ID', () => {
    const registers: WorkloadMeasureRegisters = {
      tdAttributes: '0x0000000000000000',
      xFAM: '0x0000000000000003',
      // ... other fields
    }
    const id1 = computeWorkloadId(registers)
    const id2 = computeWorkloadId(registers)
    expect(id1).toBe(id2) // Deterministic
  })
})
```

## Examples

### Example 1: Basic Verification

See `examples/verifyBlock.ts`:

```bash
export WORKLOAD_ID=0x1234...
npx tsx examples/verifyBlock.ts
```

Output shows whether latest block matches the workload ID.

### Example 2: Get Flashtestation Event

See `examples/getFlashtestationTx.ts`:

```bash
npx tsx examples/getFlashtestationTx.ts
```

Output shows raw event data from latest block's flashtestation transaction.

## Publishing

**Current Status**: Not yet published to npm (v0.1.0 pre-release)

**Planned Publication**: Will be published as `@uniswap/flashtestations-sdk` when Unichain mainnet is ready.

**Publishing Config**:

```json
{
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "engines": {
    "node": ">=18"
  }
}
```

**Module Exports** (once published):

```json
{
  "main": "./dist/cjs/src/index.js",
  "module": "./dist/esm/src/index.js",
  "types": "./dist/types/src/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/types/src/index.d.ts",
      "import": "./dist/esm/src/index.js",
      "require": "./dist/cjs/src/index.js"
    }
  }
}
```

## Glossary

**Attestation**: Cryptographic proof that a piece of software ran in a specific TEE configuration (hardware-verified)

**Flashtestation**: Unichain-specific attestation embedded as the last transaction in each block, proving the builder's TEE workload

**TEE (Trusted Execution Environment)**: Hardware-secured enclave (Intel TDX on Unichain) that isolates software execution and provides cryptographic proof of what code ran

**Workload ID**: 32-byte hash uniquely identifying a specific version of op-rbuilder configured in a TEE (computed from measurement registers)

**Measurement Registers**: Intel TDX registers that cryptographically commit to the exact TEE configuration and software (8 registers: tdAttributes, xFAM, mrTd, etc.)

**op-rbuilder**: Flashbots' builder software that constructs blocks for Unichain (source: https://github.com/flashbots/op-rbuilder)

**BlockBuilderPolicy Contract**: Smart contract on Unichain that verifies flashtestations and stores workload metadata

**Block Explorer**: https://uniscan.xyz (Unichain block/transaction viewer)

<!-- CUSTOM:START -->
<!-- User additions preserved during updates -->
<!-- CUSTOM:END -->
