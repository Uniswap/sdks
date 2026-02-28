> **Last Updated:** 2025-11-19

# CLAUDE.md - UniswapX SDK (First Half - Core Architecture & APIs)

## Overview

The UniswapX SDK is a TypeScript library for building, parsing, validating, and trading UniswapX off-chain orders. This documentation covers the **first half** (core architecture and main APIs) of the SDK's 114 TypeScript files, focusing on order types, builders, trades, and utilities that form the foundation of the SDK.

UniswapX enables gasless, MEV-protected token swaps through an off-chain order protocol filled by a decentralized network of fillers. This SDK provides comprehensive tooling to:
- Build various order types (Dutch auctions, relay orders, priority orders)
- Validate and quote orders on-chain
- Manage permit nonces for signature-based approvals
- Handle complex pricing models with decay curves

**Package:** `@uniswap/uniswapx-sdk`
**License:** MIT
**Repository:** https://github.com/Uniswap/sdks.git
**Main Dependencies:**
- `ethers` (^5.7.0): Core Ethereum library
- `@uniswap/permit2-sdk` (^1.2.1): Signature-based approvals
- `@uniswap/sdk-core` (^7.5.0): Currency types and core abstractions

## Architecture Overview

### Core Design Principle

The SDK follows a **builder → order → trade** pattern for constructing and working with orders:

```
DutchOrderBuilder      OrderBuilder (abstract base)
  ├─ chainId              ├─ swapper
  ├─ reactor address      ├─ nonce
  ├─ input/outputs        ├─ deadline
  └─ build()              └─ validation info
       ↓
    DutchOrder (OrderInfo + signing logic)
       ├─ serialize() → ABI-encoded bytes
       ├─ getSigner(sig) → address
       ├─ permitData() → EIP-712 signature data
       └─ hash() → unique order ID
       ↓
    DutchOrderTrade (Currency-aware wrapper)
       ├─ inputAmount → CurrencyAmount<TInput>
       ├─ outputAmounts → CurrencyAmount<TOutput>[]
       ├─ executionPrice → Price<TInput, TOutput>
       └─ minimumAmountOut() → with slippage
```

### Four Major Modules

#### 1. Order Module (`src/order/`)
Implements all UniswapX order types with full EIP-712 signing support and on-chain compatibility:

**Order Types Implemented:**
- **DutchOrder**: Original Dutch auction with linear time-based decay
  - Input: Fixed amount
  - Outputs: Decay linearly from start→end amount
  - Exclusive filler: Optional, with override period
  - Use: Standard swaps with time-decaying prices

- **V2DutchOrder** (Unsigned/Cosigned): Enhanced Dutch with cosigner
  - Cosigner: Off-chain party who sets decay parameters
  - Input override: Cosigner can adjust input amount at execution
  - Output overrides: Cosigner can adjust all output amounts
  - Dynamic pricing: Decay params set just-in-time
  - Use: RFQ-style pricing, filler quotes

- **V3DutchOrder** (Unsigned/Cosigned): Advanced with nonlinear decay
  - Nonlinear curves: Custom decay via relative blocks/amounts
  - Gas price adjustment: Prices adjust for base fee changes
  - Independent decay: Input and output can decay differently
  - Use: Complex pricing, gas-aware execution

- **PriorityOrder** (Unsigned/Cosigned): Priority fee-based MEV protection
  - Priority fee scaling: Amounts scale with block priority fee
  - Block auctions: Price discovery through block-by-block increases
  - Use: MEV-aware trading, block space auctions

- **RelayOrder**: Universal Router integration for complex swaps
  - Universal Router calldata: Execute arbitrary swap sequences
  - Fee escalation: Fee increases over time if unfilled
  - Single input token: Unified input to router
  - Use: Multi-hop swaps, advanced DeFi interactions

**Common Order Interface:**
All orders implement `OffChainOrder` interface:
```typescript
interface OffChainOrder {
  chainId: number;
  serialize(): string;                          // ABI-encoded order
  getSigner(signature): string;                 // Recover maker address
  permitData(): PermitTransferFromData;         // EIP-712 data
  hash(): string;                               // Unique order ID
  blockOverrides?: { number?: string };         // For quoting
}
```

**Order Info Structure:**
```typescript
type OrderInfo = {
  reactor: string;                    // Order reactor contract
  swapper: string;                    // Order creator/maker
  nonce: BigNumber;                   // Permit2 nonce (bitmap-based)
  deadline: number;                   // Unix timestamp expiry
  additionalValidationContract: string; // Optional custom validation
  additionalValidationData: string;     // Encoded validation params
}
```

#### 2. Builder Module (`src/builder/`)
Fluent builder interfaces for constructing orders with validation.

**Class Hierarchy:**
```
OrderBuilder (abstract base, 60 lines)
  ├─ deadline(number) → self
  ├─ nonce(BigNumber) → self
  ├─ swapper(address) → self
  ├─ validation(ValidationInfo) → self
  ├─ reactor(address) [protected] → self
  └─ getOrderInfo() → OrderInfo [protected]

  ↓

DutchOrderBuilder extends OrderBuilder
  ├─ constructor(chainId, reactorAddress?, permit2Address?)
  ├─ decayStartTime(number) → self
  ├─ decayEndTime(number) → self
  ├─ input(DutchInput) → self
  ├─ output(DutchOutput) → self
  ├─ exclusiveFiller(address, bps) → self
  ├─ fromOrder(DutchOrder) [static] → DutchOrderBuilder
  └─ build() → DutchOrder
```

**Builder Pattern Benefits:**
- **Chainable API**: All methods return `this` for fluent interface
- **Validation**: `getOrderInfo()` validates all required fields before use
- **Factory support**: `fromOrder()` static methods for order cloning/modification
- **Chainable validation**: Deadline must be future, defaults applied for optional fields

**Key Implementation Details:**
- Builders resolve reactor address via `REACTOR_ADDRESS_MAPPING` using OrderType + chainId
- Default values: `additionalValidationContract` = AddressZero, `additionalValidationData` = "0x"
- Deadline defaults to `decayEndTime` for Dutch orders
- All inputs validated with `tiny-invariant` before building

**Builder Types Implemented:**
1. `DutchOrderBuilder` - Basic Dutch auctions
2. `V2DutchOrderBuilder` - Cosigned Dutch orders
3. `V3DutchOrderBuilder` - Nonlinear decay Dutch orders
4. `PriorityOrderBuilder` - Priority fee orders
5. `RelayOrderBuilder` - Relay orders for Universal Router

#### 3. Trade Module (`src/trade/`)
High-level trade abstractions wrapping orders with `@uniswap/sdk-core` currency types.

**Purpose:**
Convert raw order data (addresses, amounts) into typed, currency-aware objects for better DX:

```typescript
// Raw order
order.info.input.token = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
order.info.input.startAmount = BigNumber.from("1000000")

// With Trade wrapper
trade.inputAmount.currency = USDC            // Token type
trade.inputAmount.toExact() = "1.000000"     // Human-readable
trade.inputAmount.toSignificant(6) = "1"     // Formatted
```

**Generic Trade Class:**
```typescript
class DutchOrderTrade<TInput, TOutput, TTradeType> {
  readonly tradeType: TTradeType;  // EXACT_INPUT | EXACT_OUTPUT
  readonly order: DutchOrder;

  get inputAmount(): CurrencyAmount<TInput>;
  get outputAmounts(): CurrencyAmount<TOutput>[];

  minimumAmountOut(slippage: Percent): CurrencyAmount<TOutput>;
  maximumAmountOut(): CurrencyAmount<TOutput>;
  executionPrice: Price<TInput, TOutput>;
}
```

**Currency Matching Logic:**
- Matches token addresses across native/wrapped variants
- Handles chain ID mismatches with validation
- Maps zero address (0x0) to native currency per chain
- Throws if output currency not found in provided array

**Trade Types Implemented:**
1. `DutchOrderTrade` - For DutchOrder
2. `V2DutchOrderTrade` - For V2DutchOrder (unsigned/cosigned)
3. `V3DutchOrderTrade` - For V3DutchOrder
4. `PriorityOrderTrade` - For PriorityOrder
5. `RelayOrderTrade` - For RelayOrder

**Utility Functions** (`utils.ts`):
- `areCurrenciesEqual()`: Compare Currency with address accounting for native/wrapped
- `nativeCurrencyAddressString()`: Map chain ID to native currency symbol (ETH, MATIC, BNB, AVAX)

#### 4. Utils Module (`src/utils/`)
Core utilities for order management, validation, and calculations.

**NonceManager** (30 lines)
Purpose: Track Permit2 nonces (256-bit word + bitmap) for batch order creation
```typescript
class NonceManager {
  constructor(provider: BaseProvider, chainId: number, permit2Address?)

  async useNonce(address: string): Promise<BigNumber>
    // Finds next unused nonce, marks it used, returns it
    // NOTE: Does NOT check external nonce usage in-flight

  async isUsed(address: string, nonce: BigNumber): Promise<boolean>
    // Checks on-chain if nonce already consumed

  private async getNextOpenWord(address: string): Promise<NonceData>
    // Finds first word with empty bits
}
```

**Nonce Encoding:**
Permit2 nonces are 256-bit values: `word:192 | bitPosition:64`
- Word: Index into nonce bitmap storage (0-2^192)
- BitPosition: Position within 256-bit bitmap (0-255)
- Supports 2^256 unique nonces per address

**OrderValidator** (22 lines)
Purpose: Validate orders on-chain via multicall
```typescript
class OrderValidator extends UniswapXOrderQuoter {
  async validate(order: SignedUniswapXOrder): Promise<OrderValidation>
  async validateBatch(orders: SignedUniswapXOrder[]): Promise<OrderValidation[]>
}

enum OrderValidation {
  OK, Expired, NonceUsed, InsufficientFunds, InvalidSignature,
  InvalidOrderFields, ExclusivityPeriod, OrderNotFillableYet,
  InvalidGasPrice, InvalidCosignature, ValidationFailed, UnknownError
}
```

**OrderQuoter** (200+ lines)
Purpose: Quote order amounts and validate on-chain using OrderQuoter contract
```typescript
class UniswapXOrderQuoter {
  constructor(provider, chainId, quoterAddress?)

  async quote(order: SignedUniswapXOrder): Promise<UniswapXOrderQuote>
    // Returns { validation: OrderValidation, quote: ResolvedUniswapXOrder }

  async quoteBatch(orders: SignedUniswapXOrder[]): Promise<UniswapXOrderQuote[]>
    // Batch quote multiple orders
}

interface UniswapXOrderQuote {
  validation: OrderValidation;
  quote?: { input: TokenAmount, outputs: TokenAmount[] }
}
```

**Decay Calculation Utilities:**
- `getDecayedAmount()`: Calculate linearly decayed amount at given time
  - Handles decay not started, in progress, completed
  - Supports both upward and downward decay
  - Uses precise BigNumber arithmetic

- `dutchBlockDecay.ts`: Block-based decay (V3 orders)
  - `calculateResolvedAmount()`: Resolve nonlinear block decay curves
  - Supports relative block offsets and relative amount adjustments

- `dutchDecay.ts`: Time-based decay (V1/V2 orders)
  - Linear interpolation between startAmount and endAmount
  - Safety: Returns endAmount if decay period elapsed

**Multicall Utilities** (`multicall.ts`):
- `multicallSameContractManyFunctions()`: Batch call multiple functions on same contract
- Used for efficient on-chain validation of multiple orders

**Order Utilities** (`order.ts`):
- `originalIfZero()`: Return original value if BigNumber is zero
- `getPermit2()`: Get Permit2 contract instance with provider

**PermissionedTokenValidator:**
Purpose: Validate special tokens with transfer restrictions (BUIDL, USCC)
- Checks permissions before order execution
- Supports multiple token interfaces (DSTokenInterface, ISuperstateTokenV4)
- Handles proxy types (Standard, ERC1967)

**EventWatcher:**
Purpose: Monitor blockchain events for order lifecycle
- Watch for order fills, cancellations, nonce usage
- Subscribe to ERC20 transfers related to orders

### Order Validation System

**Validation Flow:**
```
Order Created (unsigned)
  ↓
Sign with EIP-712 (SignatureTransfer from permit2-sdk)
  ↓
Serialize() → ABI-encoded bytes
  ↓
Submit to OrderQuoter contract
  ↓
OrderQuoter returns validation result + resolved amounts
  ↓
Parse error codes to OrderValidation enum
```

**Validation Stages:**
1. **Expiry**: `deadline` must be in future
2. **Nonce**: Check against Permit2 nonce bitmap
3. **Funds**: Verify swapper has sufficient balance
4. **Signature**: Recover and verify signer matches order.swapper
5. **Order Fields**: Validate decay time ranges, amount constraints
6. **Exclusivity**: Check exclusive filler period if applicable
7. **Block**: Verify order is fillable for current block
8. **Gas**: Check gas price meets order requirements (Priority orders)
9. **Cosignature**: Verify cosigner signature (V2/V3/Priority orders)
10. **Custom**: Run additional validation contract if specified

**Error Code Mapping:**
OrderQuoter contract returns specific error selectors; known errors mapped to OrderValidation enum:
- `8baa579f`: InvalidSignature
- `756688fe`: NonceUsed
- `302e5b7c`: InvalidOrderFields (decay time)
- Others: UnknownError category

## Type System

### Core Types (`src/order/types.ts`)

**Order Resolution Options:**
```typescript
type OrderResolutionOptions = {
  timestamp: number;        // Unix timestamp for decay calculation
  filler?: string;         // Optional filler address for exclusive orders
}

type PriorityOrderResolutionOptions = {
  priorityFee: BigNumber;   // Current block priority fee in wei
  currentBlock?: BigNumber; // Current block number
}

type V3OrderResolutionOptions = {
  currentBlock: number;     // Current block for nonlinear decay
  filler?: string;
}
```

**Dutch Order Input/Output:**
```typescript
type DutchInput = {
  token: string;            // Token address
  startAmount: BigNumber;   // Start of decay period
  endAmount: BigNumber;     // End of decay period
}

type DutchOutput = DutchInput & {
  recipient: string;        // Where tokens go
}
```

**Priority Order Input/Output:**
```typescript
type PriorityInput = {
  token: string;
  amount: BigNumber;
  mpsPerPriorityFeeWei: BigNumber;  // Million parts scaling factor
}

type PriorityOutput = PriorityInput & {
  recipient: string;
}
```

**V3 Nonlinear Decay:**
```typescript
type NonlinearDutchDecay = {
  relativeBlocks: number[];     // Block offsets from current
  relativeAmounts: bigint[];    // Amount adjustments (can be negative!)
}

type EncodedNonlinearDutchDecay = {
  relativeBlocks: BigNumber;
  relativeAmounts: string[];    // As BigNumber strings
}
```

**Cosigner Data:**
```typescript
type CosignerData = {
  decayStartTime: number;
  decayEndTime: number;
  exclusiveFiller: string;
  exclusivityOverrideBps: BigNumber;   // Basis points, 0 = strict
  inputOverride: BigNumber;            // Adjusted input amount
  outputOverrides: BigNumber[];        // Adjusted output amounts
}
```

### Validation Types

```typescript
enum ValidationType {
  None,
  ExclusiveFiller,  // Only exclusive filler can fill before lastExclusiveTimestamp
}

type ExclusiveFillerData = {
  filler: string;
  lastExclusiveTimestamp: number;
}

type ValidationInfo = {
  additionalValidationContract: string;
  additionalValidationData: string;  // ABI-encoded validation data
}
```

## Constants & Mappings

### Chain Support

**Supported Chains:** (via `constants.ts`)
- Mainnet (1)
- Goerli (5) - deprecated
- Sepolia (11155111)
- Polygon (137)
- Arbitrum (42161)
- Base (8453)
- Blast (130)
- Unichain (12341234)

### Address Mappings

**PERMIT2_MAPPING:**
Universal Permit2 address: `0x000000000022d473030f116ddee9f6b43ac78ba3`
(Same across all chains, standard deployed address)

**REACTOR_ADDRESS_MAPPING:**
Maps `chainId → OrderType → reactorAddress`

Example for Mainnet (1):
```typescript
{
  [OrderType.Dutch]: "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
  [OrderType.Dutch_V2]: "0x00000011F84B9aa48e5f8aA8B9897600006289Be",
  [OrderType.Relay]: "0x0000000000A4e21E2597DCac987455c48b12edBF",
}
```

**UNISWAPX_ORDER_QUOTER_MAPPING:**
Maps `chainId → OrderQuoter contractAddress`
Default: `0x54539967a06Fc0E3C3ED0ee320Eb67362D13C5fF`

**EXCLUSIVE_FILLER_VALIDATION_MAPPING:**
Maps `chainId → ExclusiveFillerValidation contractAddress`
Default: `0x8A66A74e15544db9688B68B06E116f5d19e5dF90`

### Constants

**BPS = 10000** (basis points)
Used for exclusivity override calculation: `overrideBps / BPS`

**MPS = BigNumber.from(10).pow(7)** (million parts)
Used for priority fee scaling in PriorityOrder

**RELAY_SENTINEL_RECIPIENT = "0x0000000000000000000000000000000000000000"`
Indicates relay order recipient determined by router

### Permissioned Tokens

**Supported Permissioned Tokens:**
1. **BUIDL** (BlackRock USD Institutional Digital Liquidity)
   - Address: `0x7712c34205737192402172409a8F7ccef8aA2AEc`
   - Chain: Mainnet (1)
   - Interface: `DSTokenInterface`
   - Proxy: None

2. **USCC** (Superstate Short Duration US Government Securities)
   - Address: `0x14d60E7FDC0D71d8611742720E4C50E7a974020c`
   - Chain: Mainnet (1)
   - Interface: `ISuperstateTokenV4`
   - Proxy: ERC1967

## Contract Integration Layer (`src/contracts/`)

### TypeChain-Generated Bindings

The `src/contracts/` directory contains auto-generated TypeChain bindings for all relevant smart contracts:

**Reactor Contracts** (19 core files):
- `DutchOrderReactor.ts` - Basic Dutch auction reactor
- `ExclusiveDutchOrderReactor.ts` - Dutch with exclusive filler support
- `DutchLimitOrderReactor.ts` - Limit order variant
- `V2DutchOrderReactor.ts` - Cosigned Dutch with RFQ support
- `V3DutchOrderReactor.ts` - Advanced nonlinear decay reactor
- `PriorityOrderReactor.ts` - Priority fee-based MEV protection
- `RelayOrderReactor.ts` - Universal Router integration

**Utility Contracts**:
- `Permit2.ts` - Token approval and transfer interface
- `OrderQuoter.ts` - On-chain order validation/quoting
- `Multicall2.ts` - Batched function calls
- `DeploylessMulticall2.ts` - Multicall without prior deployment

**Token Contracts**:
- `MockERC20.ts` - Test ERC20 implementation
- `DSTokenInterface.ts` - BUIDL token interface
- `ISuperstateTokenV4.ts` - USCC token interface
- `ExclusiveFillerValidation.ts` - Custom validation logic
- `SwapRouter02Executor.ts` - Swap execution interface

**Infrastructure Contracts**:
- `Proxy.ts` - Standard proxy pattern
- `ERC1967Proxy.ts` - Modern proxy pattern
- `Multicall2.ts` / `DeploylessMulticall2.ts` - Batching

**Factory Pattern:**
Each contract has a corresponding factory file:
- `DutchOrderReactor__factory.ts` → `DutchOrderReactor.ts`
- Uses factory pattern for contract instantiation
- Factories include: `connect()`, `deploy()`, `attach()`, `isAddress()`, `getDeployTransaction()`

### Generation Process

Bindings are generated via TypeChain:
```bash
yarn typechain --target=ethers-v5 --out-dir src/contracts --glob ./abis/**/*.json
```

**Build Pipeline:**
1. ABIs in `abis/` directory (JSON files)
2. TypeChain processes with ethers-v5 target
3. Generates `src/contracts/` TypeScript bindings
4. Factories expose `connect()` to get contract instances

**Contract Usage Pattern:**
```typescript
import { DutchOrderReactor__factory } from './contracts/factories'

const contract = DutchOrderReactor__factory.connect(
  reactorAddress,
  provider
)

const tx = await contract.execute({
  order: serializedOrder,
  signature: orderSignature
})
```

## Key Algorithms & Patterns

### Dutch Auction Decay

**Linear Time-Based Decay:**
```
Amount = startAmount - (startAmount - endAmount) × (time - startTime) / (endTime - startTime)
```

**Implementation** (`getDecayedAmount()`):
```typescript
function getDecayedAmount(config: DutchDecayConfig, atTime?): BigNumber {
  const { startAmount, endAmount, decayStartTime, decayEndTime } = config

  if (decayEndTime <= atTime) return endAmount      // Decay complete
  if (decayStartTime >= atTime) return startAmount  // Not started
  if (startAmount.eq(endAmount)) return startAmount // No decay

  const duration = decayEndTime - decayStartTime
  const elapsed = atTime - decayStartTime

  if (startAmount.gt(endAmount)) {
    // Decay downward (more common)
    const decay = startAmount.sub(endAmount).mul(elapsed).div(duration)
    return startAmount.sub(decay)
  } else {
    // Decay upward
    const decay = endAmount.sub(startAmount).mul(elapsed).div(duration)
    return startAmount.add(decay)
  }
}
```

**Key Points:**
- Uses BigNumber for precision (prevents overflow)
- Integer division safe (endAmount at or after decay period)
- Supports both upward and downward decay

### Nonce Bitmap Management

**Nonce Structure:**
- 256-bit value = `word:192 | bitPosition:64`
- Stored in Permit2 as `nonceBitmap[address][word] → uint256 bitmap`

**Nonce Encoding/Decoding:**
```typescript
function buildNonce(word: BigNumber, bitPos: number): BigNumber {
  return word.shl(64).add(bitPos)  // word in upper 192 bits
}

function splitNonce(nonce: BigNumber): { word: BigNumber, bitPos: number } {
  const word = nonce.shr(64)
  const bitPos = nonce.mod(BigNumber.from(2).pow(64)).toNumber()
  return { word, bitPos }
}
```

**Bitmap Bit Operations:**
```typescript
function setBit(bitmap: BigNumber, bitPos: number): BigNumber {
  return bitmap.add(BigNumber.from(2).pow(bitPos))
}

function getFirstUnsetBit(bitmap: BigNumber): number {
  for (let i = 0; i < 256; i++) {
    if (bitmap.div(BigNumber.from(2).pow(i)).mod(2).eq(0)) {
      return i
    }
  }
  return 255  // All bits set
}
```

**NonceManager Algorithm:**
1. Fetch current word's bitmap from Permit2
2. Find first unset bit in bitmap
3. Calculate nonce = `word << 64 | bitPos`
4. Mark bit as used in local cache
5. Return nonce for order signing

### Validation Parsing

**Error Handling:**
OrderQuoter contract returns error data; SDK decodes it:

```typescript
const KNOWN_ERRORS: { [selector: string]: OrderValidation } = {
  "8baa579f": OrderValidation.InvalidSignature,    // recoveryFailed()
  "815e1d64": OrderValidation.InvalidSignature,    // invalidSignature()
  "756688fe": OrderValidation.NonceUsed,           // nonceAlreadyUsed()
  "302e5b7c": OrderValidation.InvalidOrderFields,  // decayTimeInvalid()
  // ... more mappings
}

// Parse error data
const selector = errorData.slice(0, 10)  // "0x" + 8 hex chars
const validation = KNOWN_ERRORS[selector] || OrderValidation.UnknownError
```

**Custom Validation Parsing:**
```typescript
function parseExclusiveFillerData(encoded: string): CustomOrderValidation {
  try {
    const [address, timestamp] = new ethers.utils.AbiCoder().decode(
      ["address", "uint256"],
      encoded
    )
    return {
      type: ValidationType.ExclusiveFiller,
      data: { filler: address, lastExclusiveTimestamp: timestamp.toNumber() }
    }
  } catch {
    return { type: ValidationType.None, data: null }
  }
}
```

## EIP-712 Signing

### Order Hashing

All orders implement EIP-712 domain separation for secure signing:

**Domain Separator:**
```typescript
const DOMAIN_SEPARATOR = {
  name: "UniswapX",
  version: "2",
  chainId: chainId,
  verifyingContract: PERMIT2_ADDRESS
}
```

**Order Witness Structure:**
Extends SignatureTransfer witness from permit2-sdk with order-specific fields:
- OrderInfo (reactor, swapper, nonce, deadline, validation)
- Order-type-specific fields (decay times, inputs, outputs, etc.)
- Flattened into single witness for EIP-712 signature

**Implementation:**
```typescript
const signature = await signer._signTypedData(domain, types, values)
// Signer produces 65-byte signature (r, s, v)
// Recoverable via ethers.utils.recoverAddress()
```

### Cosigner Support

V2 and V3 orders support optional cosigner:
- Primary signer: Order maker (swapper)
- Cosigner: Off-chain price setter/validator
- Both signatures required for fillability
- Cosigner can adjust input/output amounts at execution time

## Integration Patterns

### Pattern 1: Build and Sign a Dutch Order

```typescript
import { DutchOrderBuilder, NonceManager } from '@uniswap/uniswapx-sdk'
import { ethers } from 'ethers'

const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
const account = await wallet.getAddress()

// Step 1: Get next available nonce
const nonceMgr = new NonceManager(provider, 1)
const nonce = await nonceMgr.useNonce(account)

// Step 2: Build order
const deadline = Math.floor(Date.now() / 1000) + 1000
const order = new DutchOrderBuilder(1)
  .deadline(deadline)
  .decayStartTime(deadline - 100)
  .decayEndTime(deadline)
  .swapper(account)
  .nonce(nonce)
  .input({
    token: USDC,
    startAmount: parseUnits('1', 6),
    endAmount: parseUnits('1', 6)
  })
  .output({
    token: WETH,
    startAmount: parseUnits('1', 18),
    endAmount: parseUnits('0.9', 18),
    recipient: account
  })
  .build()

// Step 3: Sign order
const { domain, types, values } = order.permitData()
const signature = await wallet._signTypedData(domain, types, values)

// Step 4: Verify signer
const recovered = order.getSigner(signature)
console.assert(recovered.toLowerCase() === account.toLowerCase())

// Step 5: Serialize for submission
const serialized = order.serialize()
console.log('Order hash:', order.hash())
```

### Pattern 2: Parse and Validate Order

```typescript
import { DutchOrder, OrderValidator } from '@uniswap/uniswapx-sdk'

// Parse serialized order
const order = DutchOrder.parse(serializedOrder, chainId)
console.log('Swapper:', order.info.swapper)
console.log('Input:', order.info.input)
console.log('Outputs:', order.info.outputs)

// Validate on-chain
const validator = new OrderValidator(provider, chainId)
const result = await validator.validate({ order, signature })

if (result === OrderValidation.OK) {
  console.log('Order is valid and ready to fill')
} else {
  console.log('Validation failed:', OrderValidation[result])
}
```

### Pattern 3: Create Trade with Currency Types

```typescript
import { DutchOrderTrade } from '@uniswap/uniswapx-sdk'
import { Token, TradeType, Percent } from '@uniswap/sdk-core'

const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6)
const WETH = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18)

const trade = new DutchOrderTrade({
  currencyIn: USDC,
  currenciesOut: [WETH],
  orderInfo: order.info,
  tradeType: TradeType.EXACT_INPUT
})

console.log('Input:', trade.inputAmount.toExact())               // "1.000000"
console.log('Min output:', trade.minimumAmountOut(
  new Percent(50, 10000)
).toExact())                                                      // "0.95"
console.log('Execution price:', trade.executionPrice.toSignificant(6))
```

## File Organization (First Half)

```
src/
├── builder/              (12 files - 340 lines)
│   ├── OrderBuilder.ts          (Order base class, 60 lines)
│   ├── DutchOrderBuilder.ts      (60 lines)
│   ├── DutchOrderBuilder.test.ts (Test suite)
│   ├── V2DutchOrderBuilder.ts    (Cosigner support, 70 lines)
│   ├── V2DutchOrderBuilder.test.ts
│   ├── V3DutchOrderBuilder.ts    (Nonlinear decay, 90 lines)
│   ├── V3DutchOrderBuilder.test.ts
│   ├── PriorityOrderBuilder.ts   (Priority fee, 50 lines)
│   ├── PriorityOrderBuilder.test.ts
│   ├── RelayOrderBuilder.ts      (Universal Router, 60 lines)
│   ├── RelayOrderBuilder.test.ts
│   └── index.ts                  (Re-exports)
│
├── order/                (14 files - 650 lines)
│   ├── DutchOrder.ts             (Core Dutch auction, 180 lines)
│   ├── DutchOrder.test.ts        (Test suite)
│   ├── V2DutchOrder.ts           (Cosigned, 200 lines)
│   ├── V2DutchOrder.test.ts
│   ├── V3DutchOrder.ts           (Nonlinear, 220 lines)
│   ├── V3DutchOrder.test.ts
│   ├── PriorityOrder.ts          (Priority fee, 150 lines)
│   ├── PriorityOrder.test.ts
│   ├── RelayOrder.ts             (Relay, 140 lines)
│   ├── RelayOrder.test.ts
│   ├── types.ts                  (Type definitions, 200 lines)
│   ├── validation.ts             (Validation parsing, 100 lines)
│   ├── validation.test.ts
│   └── index.ts                  (Re-exports)
│
├── trade/                (14 files - 350 lines)
│   ├── DutchOrderTrade.ts        (Currency-aware wrapper, 80 lines)
│   ├── DutchOrderTrade.test.ts
│   ├── V2DutchOrderTrade.ts      (V2 variant, 80 lines)
│   ├── V2DutchOrderTrade.test.ts
│   ├── V3DutchOrderTrade.ts      (V3 variant, 90 lines)
│   ├── V3DutchOrderTrade.test.ts
│   ├── PriorityOrderTrade.ts     (Priority variant, 70 lines)
│   ├── PriorityOrderTrade.test.ts
│   ├── RelayOrderTrade.ts        (Relay variant, 80 lines)
│   ├── RelayOrderTrade.test.ts
│   ├── utils.ts                  (Trade utilities, 40 lines)
│   ├── index.ts                  (Re-exports)
│   └── index.ts
│
├── utils/                (10 files - 280 lines)
│   ├── NonceManager.ts           (Nonce tracking, 95 lines)
│   ├── NonceManager.test.ts      (120 lines)
│   ├── OrderValidator.ts         (Validation, 22 lines)
│   ├── OrderQuoter.ts            (On-chain quoting, 200 lines)
│   ├── PermissionedTokenValidator.ts (30 lines)
│   ├── EventWatcher.ts           (Event monitoring, 40 lines)
│   ├── dutchDecay.ts             (Decay calculation, 43 lines)
│   ├── dutchDecay.test.ts
│   ├── dutchBlockDecay.ts        (Block decay, 35 lines)
│   ├── dutchBlockDecay.test.ts
│   ├── order.ts                  (Order utilities, 15 lines)
│   ├── order.test.ts
│   ├── multicall.ts              (Batch calls, 25 lines)
│   └── index.ts                  (Re-exports)
│
├── contracts/            (55 files - TypeChain bindings)
│   ├── DutchOrderReactor.ts
│   ├── ExclusiveDutchOrderReactor.ts
│   ├── V2DutchOrderReactor.ts
│   ├── V3DutchOrderReactor.ts
│   ├── PriorityOrderReactor.ts
│   ├── RelayOrderReactor.ts
│   ├── OrderQuoter.ts
│   ├── Permit2.ts
│   ├── Multicall2.ts / DeploylessMulticall2.ts
│   ├── [19 more contract interfaces]
│   ├── factories/         (Factory patterns)
│   │   └── [19 contract factories]
│   ├── common.ts          (Shared types)
│   └── index.ts           (Re-exports)
│
├── constants.ts          (180 lines - Mappings and constants)
├── constants.test.ts     (50 lines)
├── errors.ts             (7 lines - Custom errors)
└── index.ts              (Main export entry point)
```

**First Half Summary:**
- ~50 implementation files + ~30 test files + contract bindings
- 1,650 lines of implementation code (excluding contracts/tests)
- 340 lines of generic builder base, 650 lines of order implementations
- 350 lines of trade wrappers, 280 lines of utilities

## Documentation Management

**This CLAUDE.md File:**
- Covers the **first half** (core architecture, builders, orders, trades)
- Complements the existing root-level `/sdks/CLAUDE.md` which provides ecosystem overview
- Part of multi-file strategy due to large SDK codebase (114+ files)

**When to Update:**
- New order types added
- Builder API changes
- Decay calculation algorithms modified
- Contract interfaces updated
- Trade wrapper logic changed
- Constants or address mappings updated

**How to Update:**
1. Update code/features
2. Run tests locally: `yarn test:unit`
3. Update this file with new algorithms/patterns
4. Preserve existing documentation for backward compatibility
5. Add new features in appropriate sections
6. Update timestamp at top: `> **Last Updated:** YYYY-MM-DD`

**Related Documentation:**
- **Root Ecosystem CLAUDE.md**: `/home/toda/workspace/sdks/CLAUDE.md` - Overall SDK monorepo
- **Second Half CLAUDE.md**: (future) Will cover order resolution, advanced utilities, integration tests
- **Related SDKs**:
  - `@uniswap/permit2-sdk` - Signature-based approvals and transfers
  - `@uniswap/sdk-core` - Currency types, amounts, prices

<!-- CUSTOM:START -->
<!-- Add your custom notes, examples, or project-specific documentation here -->
<!-- This section will be preserved during documentation updates -->

## Implementation Insights (First Half Focus)

### Core Design Decisions

**Builder Pattern Over Direct Construction:**
Why builders are used instead of direct object creation:
1. **Validation**: Required fields validated before object exists
2. **Reactor Resolution**: Chain ID + order type → reactor address mapping handled transparently
3. **Fluent API**: Chainable methods for better developer experience
4. **Extensibility**: Easy to add new fields without breaking existing code

**Separate Order vs Trade Classes:**
Why separation exists:
- **Order**: Raw on-chain compatible structure, EIP-712 signing, serialization
- **Trade**: DApp-friendly wrapper with currency-aware calculations, prices, slippage
- This matches patterns from router-sdk and other Uniswap SDKs

**Decay Algorithm Generalization:**
Time-based decay function works for both linear and "static" cases:
- If startAmount == endAmount: returns startAmount (no decay)
- If time outside decay period: returns boundary value
- Supports both upward and downward decay without special cases

### Testing Strategy

Tests include:
- **Unit Tests**: Builder construction, decay calculation, nonce encoding
- **Integration Tests**: Full order signing, on-chain validation (in `integration/` directory)
- **Edge Cases**: Decimal precision, overflow protection, timezone handling

### Performance Considerations

**Nonce Manager Caching:**
- Caches current word/bitmap to avoid redundant contract calls
- Assumption: Single NonceManager instance per user in same process
- In-flight operations outside this instance may cause nonce collisions

**Batch Operations:**
- OrderQuoter supports `quoteBatch()` for efficient multi-order validation
- Uses multicall to combine multiple contract calls into single transaction

**Memory Efficiency:**
- Trade objects are lazy-computed (amounts computed on-demand)
- Repeated calls return cached values
- Builders are lightweight (minimal state until build())

<!-- CUSTOM:END -->
