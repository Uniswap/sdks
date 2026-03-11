> **Last Updated:** 2025-11-19

# CLAUDE.md - Permit2 SDK

## Overview

The Permit2 SDK is a lightweight TypeScript library for building, encoding, and validating Permit2 signatures. Permit2 is a Uniswap-developed smart contract that enables gasless token approvals through EIP-712 typed data signatures, eliminating the need for users to submit separate approval transactions.

**Key Value Proposition**: Enable gasless token transfers by signing EIP-712 messages instead of submitting on-chain approve transactions, reducing transaction count and user friction.

**Package**: `@uniswap/permit2-sdk`
**Size**: ~1,100 lines of TypeScript
**License**: MIT
**Repository**: https://github.com/Uniswap/sdks.git

## Purpose and Use Cases

### Primary Use Cases

1. **Gasless Trading**: Enable users to approve and swap tokens in a single transaction
2. **Signature-Based Transfers**: Implement one-time signed permits for token transfers
3. **Multi-Token Operations**: Batch approve multiple tokens with a single signature
4. **Permit Validation**: Check permit validity and nonce status on-chain before execution

### When to Use Permit2

- Building DEX frontends that want to reduce user transaction count
- Creating trading bots that need signature-based approval
- Implementing complex multi-token swaps with single user action
- Integrating with `uniswapx-sdk` for off-chain orders
- Building with `universal-router-sdk` for unified execution

### When NOT to Use Permit2

- Simple one-time token transfers (use standard ERC-20 approve)
- Applications that already have alternative approval mechanisms
- Privacy-critical applications (signatures are readable in mempool)

## Architecture

### Two Core Signature Patterns

The Permit2 SDK implements two distinct EIP-712 signature patterns for different use cases:

#### 1. Allowance Transfer Pattern
**Purpose**: Approve-once, transfer-many model
**Use Case**: User signs once, protocol can transfer up to the approved amount multiple times
**State**: On-chain allowance tracking per (owner, token, spender) tuple

**Components**:
- `AllowanceTransfer` class - Encode/decode allowance permits
- Tracks: amount, expiration, nonce (ordered - used per-token per-spender)
- Validation: Amount fits in uint160, expiration in uint48, nonce in uint48

#### 2. Signature Transfer Pattern
**Purpose**: One-time signed permits
**Use Case**: User signs permit, recipient executes single transfer with signature
**State**: Nonce bitmap tracking per owner (256 bits per word)

**Components**:
- `SignatureTransfer` class - Encode/decode signature transfer permits
- Supports: Single token, batch multi-token transfers
- Optional: Witness data for additional context (e.g., trade details)
- Validation: Amount fits in uint256, deadline in uint256, nonce in uint256

### Module Organization

```
src/
├── allowanceTransfer.ts         # AllowanceTransfer class (111 lines)
│   └── PermitSingle / PermitBatch interfaces
│   └── PermitDetails validation
│
├── signatureTransfer.ts         # SignatureTransfer class (155 lines)
│   ├── TokenPermissions interface
│   ├── PermitTransferFrom / PermitBatchTransferFrom
│   └── Witness support for custom data
│
├── providers/
│   ├── AllowanceProvider.ts     # On-chain allowance state queries (35 lines)
│   │   └── Reads: amount, nonce, expiration
│   │
│   └── SignatureProvider.ts     # On-chain signature validation (151 lines)
│       ├── Nonce bitmap queries
│       ├── Permit deadline validation
│       ├── Batch nonce checking with optimization
│       └── Bit manipulation utilities
│
├── domain.ts                    # EIP-712 domain helper (18 lines)
│   └── permit2Domain() - Creates typed data domain
│
├── constants.ts                 # Chain-specific addresses & max values (31 lines)
│   ├── Permit2Address lookup per chain
│   ├── MaxUint values (160, 256, 48)
│   └── Type aliases for semantic meaning
│
└── index.ts                     # Main exports (5 lines)
```

## Key APIs and Interfaces

### AllowanceTransfer

**Purpose**: Encode/decode EIP-712 permits for allowance-based transfers

```typescript
// Encode permit data for signing
AllowanceTransfer.getPermitData(
  permit: PermitSingle | PermitBatch,
  permit2Address: string,
  chainId: number
): PermitSingleData | PermitBatchData

// Get permit hash for validation
AllowanceTransfer.hash(
  permit: PermitSingle | PermitBatch,
  permit2Address: string,
  chainId: number
): string
```

**Key Interfaces**:

```typescript
interface PermitDetails {
  token: string              // Token address
  amount: BigNumberish       // Approval amount (uint160)
  expiration: BigNumberish   // Permit expiration (uint48)
  nonce: BigNumberish        // Ordered nonce per token/spender (uint48)
}

interface PermitSingle {
  details: PermitDetails
  spender: string            // Approved spender address
  sigDeadline: BigNumberish  // Signature deadline (uint256)
}

interface PermitBatch {
  details: PermitDetails[]   // Multiple token permits
  spender: string
  sigDeadline: BigNumberish
}
```

**Validation Rules**:
- `amount <= 2^160 - 1` (MaxAllowanceTransferAmount)
- `expiration <= 2^48 - 1` (MaxAllowanceExpiration)
- `nonce <= 2^48 - 1` (MaxOrderedNonce)
- `sigDeadline <= 2^256 - 1` (MaxSigDeadline)

### SignatureTransfer

**Purpose**: Encode/decode EIP-712 permits for one-time signed transfers

```typescript
// Encode permit data for signing
SignatureTransfer.getPermitData(
  permit: PermitTransferFrom | PermitBatchTransferFrom,
  permit2Address: string,
  chainId: number,
  witness?: Witness
): PermitTransferFromData | PermitBatchTransferFromData

// Get permit hash for validation
SignatureTransfer.hash(
  permit: PermitTransferFrom | PermitBatchTransferFrom,
  permit2Address: string,
  chainId: number,
  witness?: Witness
): string
```

**Key Interfaces**:

```typescript
interface TokenPermissions {
  token: string              // Token address
  amount: BigNumberish       // Transfer amount (uint256)
}

interface PermitTransferFrom {
  permitted: TokenPermissions
  spender: string            // Recipient of permit
  nonce: BigNumberish        // Unordered nonce (uint256, bitmap tracked)
  deadline: BigNumberish     // Permit deadline (uint256)
}

interface PermitBatchTransferFrom {
  permitted: TokenPermissions[]  // Multiple tokens
  spender: string
  nonce: BigNumberish
  deadline: BigNumberish
}

interface Witness {
  witness: any                           // Custom witness data
  witnessTypeName: string                // Type name (e.g., "TradeDetails")
  witnessType: Record<string, TypedDataField[]>  // Type definition
}
```

**Validation Rules**:
- `amount <= 2^256 - 1` (MaxSignatureTransferAmount)
- `deadline <= 2^256 - 1` (MaxSigDeadline)
- `nonce <= 2^256 - 1` (MaxUnorderedNonce)

### AllowanceProvider

**Purpose**: Query on-chain allowance state for permits

```typescript
class AllowanceProvider {
  constructor(provider: Provider, permit2Address: string)

  // Get all allowance data in single call
  async getAllowanceData(
    token: string,
    owner: string,
    spender: string
  ): Promise<AllowanceData>

  // Get just the allowance amount
  async getAllowance(
    token: string,
    owner: string,
    spender: string
  ): Promise<BigNumber>

  // Get current nonce for next permit
  async getNonce(
    token: string,
    owner: string,
    spender: string
  ): Promise<number>

  // Get permit expiration
  async getExpiration(
    token: string,
    owner: string,
    spender: string
  ): Promise<number>
}

interface AllowanceData {
  amount: BigNumber     // Current allowed amount
  nonce: number         // Next nonce to use
  expiration: number    // Permit expiration timestamp
}
```

**Use Case**: Check current allowance before proposing new permit

### SignatureProvider

**Purpose**: Query and validate signature transfer permits on-chain

```typescript
class SignatureProvider {
  constructor(provider: Provider, permit2Address: string)

  // Check if a nonce has been used
  async isNonceUsed(
    owner: string,
    nonce: BigNumberish
  ): Promise<boolean>

  // Check if permit deadline has passed
  async isExpired(deadline: BigNumberish): Promise<boolean>

  // Comprehensive permit validation
  async validatePermit(
    permit: PermitTransferFrom | PermitBatchTransferFrom
  ): Promise<NonceValidationResult>

  // Check permit validity (not expired AND nonce not used)
  async isPermitValid(
    permit: PermitTransferFrom | PermitBatchTransferFrom
  ): Promise<boolean>

  // Get nonce bitmap for specific word position
  async getNonceBitmap(
    owner: string,
    wordPos: BigNumberish
  ): Promise<BigNumber>

  // Batch check multiple nonces (optimized)
  async batchCheckNonces(
    owner: string,
    nonces: BigNumberish[]
  ): Promise<boolean[]>

  // Get current block timestamp
  async getCurrentTimestamp(): Promise<number>

  // Static utility: extract word and bit positions from nonce
  static getNoncePositions(
    nonce: BigNumberish
  ): { wordPos: BigNumber; bitPos: number }

  // Static utility: check if bit is set in bitmap
  static isBitSet(bitmap: BigNumber, bitPos: number): boolean
}

interface NonceValidationResult {
  isUsed: boolean         // Nonce already consumed
  isExpired: boolean      // Deadline passed
  isValid: boolean        // Both false (valid permit)
}
```

**Use Case**: Pre-validate permits before on-chain execution

## Integration with Other SDKs

### With universal-router-sdk

**Pattern**: `universal-router-sdk` uses `permit2-sdk` for gasless swaps

```typescript
import { SwapRouter } from '@uniswap/universal-router-sdk'
import { SignatureTransfer } from '@uniswap/permit2-sdk'

// User signs permit
const permitData = SignatureTransfer.getPermitData(permit, permit2Address, chainId)
const signature = await signer._signTypedData(permitData.domain, permitData.types, permitData.values)

// Include permit in swap
const { calldata, value } = SwapRouter.swapCallParameters(trade, {
  inputTokenPermit: {
    // Permit2 signature and details
  }
})
```

### With uniswapx-sdk

**Pattern**: `uniswapx-sdk` uses `permit2-sdk` for gasless order fills

```typescript
import { DutchOrderBuilder } from '@uniswap/uniswapx-sdk'
import { AllowanceTransfer } from '@uniswap/permit2-sdk'

// Order builder handles permit2 integration internally
const order = new DutchOrderBuilder(chainId)
  .input({ token, startAmount, endAmount })
  .output({ token, startAmount, endAmount, recipient })
  .build()

// Permit2 allows UniswapX reactor to fill order
```

### Dependency Graph

```
permit2-sdk (no dependencies on other SDKs)
    ↓
    ├── Used by: uniswapx-sdk (for gasless order fills)
    └── Used by: universal-router-sdk (for gasless swaps)
```

## Chain Support

### Mainnet Permit2 Address

```typescript
// Default address across most chains
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3'

// Exception: zkSync Era (chain ID 324)
export const PERMIT2_ADDRESS_ZKSYNC = '0x0000000000225e31D15943971F47aD3022F714Fa'

// Lookup function
permit2Address(chainId?: number): string
```

**Supported Chains**:
- Ethereum mainnet and testnets
- L2s: Optimism, Arbitrum, Base, Polygon, Avalanche, etc.
- Special case: zkSync Era

## Data Type System

### Bit-Packing for Signature Transfer Nonces

The SDK uses clever bit-packing to track nonces efficiently:

```
nonce (uint256 = 256 bits)
├─ wordPos = nonce >> 8     (upper 248 bits = which 256-bit word)
└─ bitPos = nonce & 255     (lower 8 bits = which bit in word, 0-255)

Benefit: One mapping[uint256 => uint256] for nonce tracking across all permits
vs: 2^256 separate mappings if each nonce was tracked individually
```

**Implementation**:
```typescript
// Extract positions from nonce
const { wordPos, bitPos } = SignatureProvider.getNoncePositions(nonce)

// Check if bit is set
const isUsed = SignatureProvider.isBitSet(bitmap, bitPos)

// To use a nonce, the contract sets bit: bitmap |= (1 << bitPos)
```

### Type Constraints

**Allowance Transfer** uses smaller types to pack permit data efficiently:

```
PermitDetails encoding:
├─ token: address          (20 bytes)
├─ amount: uint160         (20 bytes) ← Packed with token
├─ expiration: uint48      (6 bytes)
├─ nonce: uint48           (6 bytes) ← Packed with expiration
```

**Signature Transfer** uses full uint256 for flexibility:

```
TokenPermissions encoding:
├─ token: address          (20 bytes)
└─ amount: uint256         (32 bytes) ← Full range
```

## Development Workflow

### Setup

```bash
# Install dependencies
yarn install

# Navigate to SDK directory
cd sdks/permit2-sdk
```

### Building

```bash
# Build all formats (CJS, ESM, TypeScript types)
yarn build

# Individual build targets
yarn build:cjs      # CommonJS for Node.js
yarn build:esm      # ES Modules for bundlers
yarn build:types    # TypeScript declarations
yarn clean          # Remove dist/ directory
```

### Testing

```bash
# Run all tests
yarn test

# Watch mode for development
yarn test --watch

# Test coverage
yarn test --coverage
```

**Test Coverage**:
- `allowanceTransfer.test.ts`: Max value validation, permit encoding
- `signatureTransfer.test.ts`: Single/batch transfers, witness data, permit encoding
- `providers/SignatureProvider.test.ts`: Nonce validation, bitmap operations
- `constants.test.ts`: Max value constraints

### Code Quality

```bash
# Check code formatting
yarn lint

# Auto-fix formatting issues
yarn lint --fix
```

**Formatter Configuration**:
- Print width: 120 characters
- Semicolons: No
- Quotes: Single quotes

## Implementation Details

### EIP-712 Typed Data Structure

Both permit patterns use EIP-712 for type-safe signature encoding:

**AllowanceTransfer Types**:
```solidity
struct PermitDetails {
    address token;
    uint160 amount;
    uint48 expiration;
    uint48 nonce;
}

struct PermitSingle {
    PermitDetails details;
    address spender;
    uint256 sigDeadline;
}

struct PermitBatch {
    PermitDetails[] details;
    address spender;
    uint256 sigDeadline;
}
```

**SignatureTransfer Types**:
```solidity
struct TokenPermissions {
    address token;
    uint256 amount;
}

struct PermitTransferFrom {
    TokenPermissions permitted;
    address spender;
    uint256 nonce;
    uint256 deadline;
}

struct PermitBatchTransferFrom {
    TokenPermissions[] permitted;
    address spender;
    uint256 nonce;
    uint256 deadline;
}
```

### Witness Data Support

Advanced feature for embedding additional context in signatures:

```typescript
const witness = {
  witness: {
    // Custom data matching witnessType definition
    // e.g., { orderHash: '0x...', validAfter: 123 }
  },
  witnessTypeName: 'TradeDetails',
  witnessType: {
    TradeDetails: [
      { name: 'orderHash', type: 'bytes32' },
      { name: 'validAfter', type: 'uint256' }
    ]
  }
}

const permitData = SignatureTransfer.getPermitData(
  permit,
  permit2Address,
  chainId,
  witness
)

// Sign including witness data
const signature = await signer._signTypedData(
  permitData.domain,
  permitData.types,
  permitData.values
)
```

**Use Case**: Link permit to specific trade details, preventing replay across different contexts

## Dependencies

### Production Dependencies

- `ethers` (^5.7.0) - Core Ethereum interactions
  - `@ethersproject/abstract-signer`: TypedData signing interface
  - `@ethersproject/bignumber`: BigNumber arithmetic
  - `@ethersproject/hash`: EIP-712 hash computation
  - `@ethersproject/contracts`: Contract ABIs

- `tiny-invariant` (^1.1.0) - Runtime validation assertions

### Development Dependencies

- `typescript` (^4.3.3) - TypeScript compiler
- `jest` (25.5.0) - Test runner
- `prettier` (^2.4.1) - Code formatter
- `@types/jest` (^24.0.25) - Jest TypeScript definitions

## Conventions and Patterns

### Naming Conventions

- **Classes**: PascalCase (AllowanceTransfer, SignatureProvider)
- **Interfaces**: PascalCase with semantic suffixes (PermitDetails, AllowanceData)
- **Functions**: Static methods on classes for logical grouping
- **Constants**: SCREAMING_SNAKE_CASE (MaxUint48, MaxAllowanceExpiration)

### Validation Strategy

All permit parameters validated before encoding:

```typescript
// Invariants ensure constraints
invariant(MaxSigDeadline.gte(permit.sigDeadline), 'SIG_DEADLINE_OUT_OF_RANGE')
invariant(MaxOrderedNonce.gte(details.nonce), 'NONCE_OUT_OF_RANGE')
invariant(MaxAllowanceTransferAmount.gte(details.amount), 'AMOUNT_OUT_OF_RANGE')
```

**Benefits**:
- Fail early with descriptive messages
- Prevent invalid signatures from being generated
- Help users understand constraints

### Error Messages

Clear, concise error messages indicate what constraint was violated:
- `AMOUNT_OUT_OF_RANGE`: Amount exceeds max for permit type
- `NONCE_OUT_OF_RANGE`: Nonce exceeds max for permit type
- `SIG_DEADLINE_OUT_OF_RANGE`: Signature deadline exceeds max
- `EXPIRATION_OUT_OF_RANGE`: Permit expiration exceeds max

## Usage Examples

### Example 1: Gasless Swap with Permit2

```typescript
import { SignatureTransfer } from '@uniswap/permit2-sdk'
import { ethers } from 'ethers'

const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
const wallet = new ethers.Wallet(PRIVATE_KEY, provider)

// Create permit for USDC swap
const permit = {
  permitted: {
    token: USDC_ADDRESS,
    amount: ethers.utils.parseUnits('100', 6) // 100 USDC
  },
  spender: SWAP_ROUTER_ADDRESS,
  nonce: 0,
  deadline: Math.floor(Date.now() / 1000) + 3600 // 1 hour
}

// Get EIP-712 typed data
const permitData = SignatureTransfer.getPermitData(
  permit,
  PERMIT2_ADDRESS,
  1 // Ethereum mainnet
)

// Sign with wallet
const signature = await wallet._signTypedData(
  permitData.domain,
  permitData.types,
  permitData.values
)

console.log('Signature:', signature)
console.log('Permit hash:', SignatureTransfer.hash(permit, PERMIT2_ADDRESS, 1))
```

### Example 2: Validate Permit on Frontend

```typescript
import { SignatureProvider } from '@uniswap/permit2-sdk'
import { ethers } from 'ethers'

const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
const sigProvider = new SignatureProvider(provider, PERMIT2_ADDRESS)

// Check permit validity before submitting
const validation = await sigProvider.validatePermit({
  permitted: { token: USDC_ADDRESS, amount: '100000000' },
  spender: SWAP_ROUTER_ADDRESS,
  nonce: 0,
  deadline: 1700000000
})

if (validation.isValid) {
  // Proceed with transaction
  console.log('Permit is valid, ready to execute')
} else {
  if (validation.isExpired) console.log('Permit expired')
  if (validation.isUsed) console.log('Nonce already used')
}
```

### Example 3: Batch Nonce Checking

```typescript
// Efficiently check multiple nonces for same owner
const noncesToCheck = [0n, 1n, 2n, 50n, 500n]
const results = await sigProvider.batchCheckNonces(
  ownerAddress,
  noncesToCheck
)

results.forEach((isUsed, i) => {
  console.log(`Nonce ${noncesToCheck[i]} is ${isUsed ? 'used' : 'available'}`)
})

// Optimization: Collects all unique word positions,
// fetches bitmaps once, checks all nonces locally
```

### Example 4: Allowance Transfer (Approve-Once Model)

```typescript
import { AllowanceTransfer } from '@uniswap/permit2-sdk'
import { ethers } from 'ethers'

// Approve spender to transfer token multiple times
const permit = {
  details: {
    token: TOKEN_ADDRESS,
    amount: ethers.utils.parseUnits('1000', 18), // 1000 tokens
    expiration: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    nonce: 0
  },
  spender: DeFi_PROTOCOL_ADDRESS,
  sigDeadline: Math.floor(Date.now() / 1000) + 3600 // 1 hour to sign
}

// Get typed data for signing
const permitData = AllowanceTransfer.getPermitData(
  permit,
  PERMIT2_ADDRESS,
  1
)

// User signs this once
const signature = await wallet._signTypedData(
  permitData.domain,
  permitData.types,
  permitData.values
)

// Protocol can now transfer up to 1000 tokens, multiple times
// Each transfer increments nonce, allowing next permit at nonce: 1
```

## File Structure

```
sdks/permit2-sdk/
├── src/
│   ├── allowanceTransfer.ts     # AllowanceTransfer class (111 lines)
│   ├── allowanceTransfer.test.ts # Tests with max value validation
│   ├── signatureTransfer.ts      # SignatureTransfer class (155 lines)
│   ├── signatureTransfer.test.ts # Tests with witness data
│   ├── domain.ts                 # EIP-712 domain setup (18 lines)
│   ├── constants.ts              # Addresses & max values (31 lines)
│   ├── constants.test.ts         # Constant validation tests
│   ├── providers/
│   │   ├── AllowanceProvider.ts    # On-chain allowance queries (35 lines)
│   │   ├── SignatureProvider.ts    # Permit validation (151 lines)
│   │   ├── SignatureProvider.test.ts
│   │   └── index.ts               # Provider exports
│   └── index.ts                 # Main SDK exports (5 lines)
├── abis/
│   └── Permit2.json              # Permit2 contract ABI (830 lines)
├── package.json                  # Package metadata
├── tsconfig.*.json              # TypeScript configurations (4 files)
├── jest.config.js               # Jest testing configuration
├── README.md                     # Quick start guide
└── LICENSE                       # MIT license
```

## Special Features

### Permit2 Nonce Optimization

The SDK implements nonce bitmap tracking for signature transfers:

**Problem**: 2^256 possible nonces, can't track each separately
**Solution**:
- Track 256-bit words (2^256 / 256 = 2^248 words)
- Each bit in word represents one nonce
- `nonce >> 8` = word position, `nonce & 0xFF` = bit position

**Benefit**: Single mapping can track all unordered nonces efficiently

### Type Constraints

AllowanceTransfer uses constrained types (uint160, uint48) to:
- Pack data efficiently in contract storage
- Save gas by reducing storage slots
- Force developers to think about realistic amounts (uint160 ≈ 1.5e48 wei)

### Chain-Specific Configuration

Recognizes that Permit2 may have different addresses on different chains:
```typescript
switch (chainId) {
  case 324: // zkSync Era
    return '0x0000000000225e31D15943971F47aD3022F714Fa'
  default:
    return '0x000000000022D473030F116dDEE9F6B43aC78BA3'
}
```

## Documentation Management

### CLAUDE.md Hierarchy

- This file (`permit2-sdk/CLAUDE.md`) - Complete SDK reference
  - No child CLAUDE.md files (single-module package structure)
  - Covers all classes, interfaces, and utilities in one place

### Update Strategy

Update this file when:
- New chain support is added (update addresses)
- New validation rules introduced
- API changes to AllowanceTransfer or SignatureTransfer
- New provider methods added
- Examples or usage patterns change significantly

### Cross-References

- Related: `universal-router-sdk` - Uses permit2-sdk for gasless swaps
- Related: `uniswapx-sdk` - Uses permit2-sdk for gasless order fills
- Related: Permit2 contract documentation - Smart contract reference

<!-- CUSTOM:START -->
<!-- User additions preserved during updates -->
<!-- CUSTOM:END -->
