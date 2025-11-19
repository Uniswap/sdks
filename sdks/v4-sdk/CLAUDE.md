> **Last Updated:** 2025-11-19

# CLAUDE.md - Uniswap V4 SDK

## Overview

The Uniswap V4 SDK (`@uniswap/v4-sdk`) provides TypeScript abstractions for building applications on top of Uniswap V4, the next-generation AMM protocol with customizable hooks and native ETH support. This SDK is the lowest-level interface to V4 pools and positions, focusing on transaction encoding and pool interaction.

**Purpose**: Enable developers to:
- Construct and encode transactions for V4 liquidity management
- Interact with V4 pools including hooks-enabled pools
- Perform atomic batch operations via the action encoding system
- Support both wrapped ERC-20 tokens and native ETH in pools
- Calculate slippage-protected amounts for mint/burn operations

**Core Innovation**: V4 introduces two revolutionary features that shape this SDK:
1. **Hooks System**: External contracts can customize pool behavior at lifecycle points via before/after callbacks
2. **Native ETH**: Direct native ETH support without requiring WETH wrapping via the `ADDRESS_ZERO` convention

**Key Capabilities**:
- Pool creation and state management with optional hook contracts
- Liquidity position management (mint, increase, decrease, burn) with hooks support
- Multi-hop swap routing with native ETH compatibility
- Hook permission detection and validation from encoded address
- Action-based transaction encoding (sequencing multiple operations atomically)
- Permit2 integration for gasless approvals
- V3-compatible tick mathematics and swap calculations

## Tech Stack

**Core Dependencies**:
- `@uniswap/sdk-core` ^7.8.0 - Core abstractions (Currency, Token, CurrencyAmount, Fraction, Percent, Price)
- `@uniswap/v3-sdk` 3.26.0 - Tick math, price calculations, liquidity computations (V4 extends V3)
- `@ethersproject/solidity` ^5.0.9 - ABI encoding, keccak256 hashing for pool ID computation
- `ethers` (^5.7.0) - Utilities for address validation, encoding
- `tiny-invariant` ^1.1.0 - Precondition assertions
- `tiny-warning` ^1.0.3 - Non-fatal warnings
- `jsbi` - Arbitrary precision integer math (inherited from v3-sdk)

**Build & Development Tools**:
- TypeScript 4.3.3 (strict mode)
- TSDX - Zero-config TypeScript package builder
- Jest 25.5.0 - Unit test framework with ts-jest
- ESLint 8.57.0 - Code quality with prettier integration
- Prettier 2.4.1 - Code formatting (120 column width, single quotes)

**Package Manager**: Yarn 3.2.3+ (monorepo context)

## Repository Structure

```
sdks/v4-sdk/                          (23 TypeScript source files)
├── src/
│   ├── entities/                      # Core domain models (5 files + tests)
│   │   ├── pool.ts                   # Pool model with hook address and poolId computation
│   │   ├── position.ts               # Liquidity position with mint/burn slippage math
│   │   ├── route.ts                  # Multi-pool swap routes with currency path normalization
│   │   ├── trade.ts                  # Trade execution with best route finding (exact in/out)
│   │   └── index.ts                  # Public exports
│   │
│   ├── utils/                         # Action encoding, utilities, and helpers (11 files + tests)
│   │   ├── v4Planner.ts              # SwapPlanner for encoding swap actions (SWAP_EXACT_IN/OUT)
│   │   ├── v4PositionPlanner.ts      # PositionPlanner for encoding position operations
│   │   ├── v4BaseActionsParser.ts    # Actions enum and ABI struct definitions for all operation types
│   │   ├── hook.ts                   # Hook permission detection from address bits 0-13
│   │   ├── encodeRouteToPath.ts      # Convert Route → PathKey[] for multi-hop encoding
│   │   ├── calldata.ts               # ABI encoding helpers, toHex conversion
│   │   ├── currencyMap.ts            # Currency wrapper utilities
│   │   ├── pathCurrency.ts           # Path currency extraction and normalization
│   │   ├── priceTickConversions.ts   # Tick ↔ Price conversions
│   │   ├── sortsBefore.ts            # Currency sorting logic
│   │   ├── positionManagerAbi.ts     # Position manager contract ABI definitions
│   │   └── index.ts                  # Public exports
│   │
│   ├── PositionManager.ts            # Central API for liquidity operations (300+ lines)
│   │   ├── Static methods: createCallParameters, addCallParameters, removeCallParameters, etc.
│   │   ├── Interfaces: MintOptions, IncreaseLiquidityOptions, RemoveLiquidityOptions, etc.
│   │   ├── Batch permit generation for gasless approvals
│   │   └── Native ETH handling with automatic SWEEP action
│   │
│   ├── actionConstants.ts            # MSG_SENDER constant for delegation
│   ├── internalConstants.ts          # Constants: FeeAmount, TickSpacing, error messages, FeeAmount enum
│   ├── multicall.ts                  # Multicall encoding for batched RPC calls
│   └── index.ts                      # Main entry point (re-exports all public APIs)
│
├── .eslintrc.js                      # ESLint configuration (no max-warnings)
├── package.json                      # Dependencies, build scripts, semantic-release config
├── tsconfig.json                     # TypeScript 4.3.3 strict mode configuration
└── LICENSE                           # MIT license
```

**Key Statistics**:
- **Source files**: 23 TypeScript files (excluding tests, config)
- **Test files**: 8 files (*.test.ts)
- **Total lines of code**: ~2,500 (implementation) + ~1,200 (tests)
- **Main entry point**: `src/index.ts` (re-exports all entities and utilities)
- **Largest module**: `PositionManager.ts` (300+ lines - position operation encoding)

## Key Modules

### Core Entities (`src/entities/`)

#### Pool (`pool.ts` - 85 lines)

**Purpose**: Represents a V4 liquidity pool with optional hooks customization.

**Key Properties**:
- `currency0`, `currency1` - Token currencies (can be native or wrapped ERC-20)
- `fee` - Fee percentage in hundredths of bips (100-10000, or 0x800000 for dynamic)
- `tickSpacing` - Minimum tick spacing enforced (1, 10, 60, 200)
- `hooks` - Hook contract address (can be zero if no hooks)
- `liquidity` - Current liquidity in the pool
- `tickCurrent` - Current tick of pool price
- `sqrtRatioX96` - Pool price as fixed-point number (sqrt(P) * 2^96)
- `poolKey` - Struct identifying the pool (currency0, currency1, fee, tickSpacing, hooks)
- `poolId` - Unique identifier (keccak256 of poolKey) used by PoolManager

**Key Methods**:
- `static getPoolKey(...)` - Construct poolKey with sorted currencies
- `static getPoolId(...)` - Compute keccak256 poolId from parameters
- `static getOutputAmount(trade, pools)` - Calculate output for exact input (v3-compatible)
- `static getInputAmount(trade, pools)` - Calculate input for exact output (v3-compatible)
- `token0Price`, `token1Price` - Cached price instances for quick access

**Important Details**:
- Native ETH represented as `ADDRESS_ZERO` in pool key (not wrapped to WETH)
- Pool identity includes hooks address - different hooks = different pool
- Dynamic fee pools have `fee = 0x800000` and MUST have non-zero hooks
- Hookless pools delegate all swap math to V3 SDK (`v3Swap()`)
- Pools with swap hooks cannot use `getOutputAmount()`/`getInputAmount()` (throws "Unsupported hook")
- Currencies always sorted: currency0 < currency1 (deterministic ordering)

#### Position (`position.ts` - 140 lines)

**Purpose**: Represents a concentrated liquidity position (NFT) on a V4 pool.

**Key Properties**:
- `pool` - The pool this position resides on
- `liquidity` - Amount of liquidity (fetched from pool manager on-chain)
- `tickLower`, `tickUpper` - Range boundaries (must be multiples of pool.tickSpacing)
- `amount0`, `amount1` - Token amounts this position represents at current pool price (cached)

**Key Methods**:
- `static fromAmounts(pool, tickLower, tickUpper, amount0Desired, amount1Desired)` - Construct from token amounts
- `static fromAmount0(pool, tickLower, tickUpper, amount0)` - Construct position with only token0
- `static fromAmount1(pool, tickLower, tickUpper, amount1)` - Construct position with only token1
- `mintAmountsWithSlippage(slippageTolerance)` - Returns `{amount0: max, amount1: max}` for safe minting
- `burnAmountsWithSlippage(slippageTolerance)` - Returns `{amount0: min, amount1: min}` for safe burning
- `permitBatchData(permitAmount)` - Generate Permit2 batch data for gasless approvals
- Price getters: `token0PriceLower`, `token0PriceUpper`

**Slippage Model** (V4-specific):
- V4 uses separate min/max protection per token (different from V3's single amountMin)
- For mint: amounts are capped with `amount0Max` and `amount1Max`
- For burn: amounts are floored with `amount0Min` and `amount1Min`
- `mintAmountsWithSlippage` applies slippage to BOTH tokens simultaneously

#### Route (`route.ts` - 45 lines)

**Purpose**: Represents a multi-pool path for a swap or liquidity operation.

**Key Properties**:
- `pools` - Array of Pool objects traversed in order
- `currencyPath` - Array of currencies including start and end
- `input` - First currency in the route
- `output` - Last currency in the route
- `pathInput` - Actual input currency (normalized for native/wrapped)
- `pathOutput` - Actual output currency (normalized for native/wrapped)

**Key Methods**:
- `midPrice` - Computed price at midpoint of route (for display)
- Constructor validates: pools connected sequentially, currencies match

**Native Handling**: Route normalizes native ETH and WETH automatically (treats as same currency).

#### Trade (`trade.ts` - 120 lines)

**Purpose**: Represents a complete trade execution across one or multiple routes.

**Key Properties**:
- `routes` - Array of Route objects (route + input/output amounts for that route)
- `tradeType` - `TradeType.EXACT_INPUT` or `TradeType.EXACT_OUTPUT`
- `inputAmount` - Total amount of input currency
- `outputAmount` - Total amount of output currency

**Key Methods**:
- `static exactIn(routes, outputAmount)` - Trade with exact input
- `static exactOut(routes, inputAmount)` - Trade with exact output
- `static fromRoute(route, inputAmount, outputAmount, tradeType)` - Single-route trade
- `static createUncheckedTrade(...)` - Construct without validation (internal use)
- `static bestTradeExactIn(pools, currencyIn, currencyOut, amountIn, maxHops, maxNumResults)` - Find best route(s)
- `static bestTradeExactOut(pools, currencyIn, currencyOut, amountOut, maxHops, maxNumResults)` - Find best route(s)
- `minimumAmountOut(slippageTolerance)` - Minimum acceptable output
- `maximumAmountIn(slippageTolerance)` - Maximum acceptable input
- `priceImpact` - Percentage loss due to route execution

### Position Manager (`PositionManager.ts` - 320 lines)

**Purpose**: Central API for encoding position management transactions. Static-only class (no instances).

**Public API**:
```typescript
// Liquidity operations
static addCallParameters(position, options): MethodParameters
static removeCallParameters(position, options): MethodParameters
static collectCallParameters(position, options): MethodParameters

// Pool initialization
static createCallParameters(params): MethodParameters

// Encoding helpers
static encodeModifyLiquidities(unlockData, deadline): string
static encodePermitBatch(permitBatch): string
static encodeERC721Permit(permit): string
static getPermitData(position): TypedDataDomain & TypedDataField
```

**Options Type Hierarchy**:
```
CommonOptions (shared by all)
├── slippageTolerance: Percent
├── hookData?: string
└── deadline: BigintIsh

CommonAddLiquidityOptions
├── useNative?: NativeCurrency
└── batchPermit?: BatchPermitOptions

MintSpecificOptions
├── recipient: string
├── createPool?: boolean
├── sqrtPriceX96?: BigintIsh
└── migrate?: boolean

IncreaseLiquidityOptions
└── tokenId: BigintIsh
```

**Return Type**: `MethodParameters`
```typescript
{
  calldata: string     // Function call data (0x...)
  value: string        // Transaction value for native ETH (optional)
}
```

**Native ETH Workflow**:
1. Set `useNative: nativeCurrency` in options
2. Native must be currency0 in the pool
3. SDK automatically adds `SWEEP` action to return excess ETH
4. Send transaction with `value = amount0Max` (in wei)

**Permit2 Integration**:
- If `batchPermit` provided, generates EIP-2612 signatures
- Allows gasless token approvals with `AllowanceProvider`
- Batch permits work for both tokens in a single signature

### Action System (`src/utils/`)

#### V4Planner (`v4Planner.ts` - 95 lines)

**Purpose**: Encodes sequences of atomic actions for swap execution. Builder pattern for action batching.

**Core Concept**: V4 pools use an "unlocking" pattern where all position and swap operations must execute atomically in a callback. Planner encodes actions as:
- `bytes actions` - Packed action codes (1 byte per action)
- `bytes[] params` - ABI-encoded parameters for each action (variable length)

**API Methods**:
```typescript
addTrade(trade, slippageTolerance, hookData?): V4Planner
addSettle(currency, inputAmount): V4Planner
addTake(currency, amount): V4Planner
addUnwrap(currency, recipient?): V4Planner
finalize(): { actions: string, params: string[] }
```

**Action Codes** (1 byte identifier):
- `SWAP_EXACT_IN_SINGLE (0x06)` - Single pool exact input swap
- `SWAP_EXACT_IN (0x07)` - Multi-pool exact input swap (with path)
- `SWAP_EXACT_OUT_SINGLE (0x08)` - Single pool exact output swap
- `SWAP_EXACT_OUT (0x09)` - Multi-pool exact output swap (with path)
- `SETTLE (0x0b)` - Pay specific currency amount to pool
- `SETTLE_ALL (0x0c)` - Pay all of a currency to pool
- `TAKE (0x0e)` - Withdraw specific currency amount from pool
- `TAKE_ALL (0x0f)` - Withdraw all of a currency from pool
- `TAKE_PORTION (0x10)` - Withdraw percentage of a currency
- `UNWRAP (0x16)` - Unwrap WETH to native ETH

**Example Usage**:
```typescript
const planner = new V4Planner()
planner.addSwapExactInSingle(pool, tokenIn, tokenOut, amountIn, minOut)
       .addSettle(pool.currency0, maxAmountIn)
       .addTake(pool.currency1, minAmountOut)
const { actions, params } = planner.finalize()
```

#### V4PositionPlanner (`v4PositionPlanner.ts` - 85 lines)

**Purpose**: Extends V4Planner specifically for position (liquidity) operations.

**API Methods**:
```typescript
addMint(pool, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner): V4PositionPlanner
addIncrease(pool, tokenId, liquidity, amount0Max, amount1Max, owner): V4PositionPlanner
addDecrease(pool, tokenId, liquidity, amount0Min, amount1Min): V4PositionPlanner
addBurn(pool, tokenId): V4PositionPlanner
addSettlePair(currency0, currency1, amount0, amount1): V4PositionPlanner
addTakePair(currency0, currency1, amount0Min, amount1Min, recipient): V4PositionPlanner
addSweep(currency, amount, recipient): V4PositionPlanner
```

**Position Action Codes**:
- `MINT_POSITION (0x02)` - Create new liquidity position (NFT)
- `INCREASE_LIQUIDITY (0x00)` - Add liquidity to existing position
- `DECREASE_LIQUIDITY (0x01)` - Remove liquidity from position
- `BURN_POSITION (0x03)` - Delete position NFT (only after liquidity = 0)

**Native ETH Pattern**:
```typescript
const planner = new V4PositionPlanner()
planner.addMint(pool, tickLower, tickUpper, liquidity, amount0Max, amount1Max, msg.sender)
       .addSettlePair(currency0, currency1, amount0Max, amount1Max)
       .addSweep(currency0, 0, msg.sender) // Sweep excess ETH (currency0 if native)
const { actions, params } = planner.finalize()
```

#### Hook Utilities (`hook.ts` - 110 lines)

**Purpose**: Decode and validate hook permissions from address encoding.

**Static API**:
```typescript
Hook.permissions(address): HookPermissions    // Get all 14 permissions
Hook.hasPermission(address, hookOption): boolean
Hook.hasSwapPermissions(address): boolean      // beforeSwap || afterSwap
Hook.hasLiquidityPermissions(address): boolean // before/afterAddLiquidity || before/afterRemoveLiquidity
Hook.hasDonatePermissions(address): boolean
Hook.hasInitializePermissions(address): boolean
```

**Hook Permission Bits** (encoded in address bits 0-13):
```
Bit 13: beforeInitialize
Bit 12: afterInitialize
Bit 11: beforeAddLiquidity
Bit 10: afterAddLiquidity
Bit 9:  beforeRemoveLiquidity
Bit 8:  afterRemoveLiquidity
Bit 7:  beforeSwap
Bit 6:  afterSwap
Bit 5:  beforeDonate
Bit 4:  afterDonate
Bit 3:  beforeSwapReturnsDelta
Bit 2:  afterSwapReturnsDelta
Bit 1:  afterAddLiquidityReturnsDelta
Bit 0:  afterRemoveLiquidityReturnsDelta
```

**Implementation Detail**: Extracts last 4 bytes of address to avoid JavaScript BigInt overflow, then uses bitwise AND to check individual bits.

**Encoding Example**:
```
0x0000000000000000000000000000000000000011  // Bits 0 and 1 set
0x0000000000000000000000000000000000002000  // Bit 13 set (beforeInitialize)
```

**Actions Enum** (from `v4BaseActionsParser.ts`):
```typescript
enum Actions {
  // Liquidity
  INCREASE_LIQUIDITY = 0x00,
  DECREASE_LIQUIDITY = 0x01,
  MINT_POSITION = 0x02,
  BURN_POSITION = 0x03,

  // Swapping
  SWAP_EXACT_IN_SINGLE = 0x06,
  SWAP_EXACT_IN = 0x07,
  SWAP_EXACT_OUT_SINGLE = 0x08,
  SWAP_EXACT_OUT = 0x09,

  // Settling (pay to pool)
  SETTLE = 0x0b,
  SETTLE_ALL = 0x0c,
  SETTLE_PAIR = 0x0d,

  // Taking (receive from pool)
  TAKE = 0x0e,
  TAKE_ALL = 0x0f,
  TAKE_PORTION = 0x10,
  TAKE_PAIR = 0x11,

  // Other
  CLOSE_CURRENCY = 0x12,
  SWEEP = 0x14,
  UNWRAP = 0x16,
}
```

## V4 Architecture Concepts

### Hooks System

**What are Hooks?**
Hooks are external contracts that can customize pool behavior at specific lifecycle points. The hook address is part of the pool's identity (poolKey).

**Hook Address Encoding**:
- Hook permissions are encoded in the address itself (bits 0-13)
- Allows permission checking without external calls
- Example: Last 4 bytes contain 14 permission flags

**Hook Permission Flags** (14 total):
```
Bit 0:  afterRemoveLiquidityReturnsDelta
Bit 1:  afterAddLiquidityReturnsDelta
Bit 2:  afterSwapReturnsDelta
Bit 3:  beforeSwapReturnsDelta
Bit 4:  afterDonate
Bit 5:  beforeDonate
Bit 6:  afterSwap
Bit 7:  beforeSwap
Bit 8:  afterRemoveLiquidity
Bit 9:  beforeRemoveLiquidity
Bit 10: afterAddLiquidity
Bit 11: beforeAddLiquidity
Bit 12: afterInitialize
Bit 13: beforeInitialize
```

**Hook Impact on SDK**:
- Pools with swap hooks cannot use `getOutputAmount()`/`getInputAmount()` (throws "Unsupported hook")
- Hookless pools delegate to V3 swap math
- Hook data can be passed to operations via `hookData` parameter

### Native ETH Support

**Currency Abstraction**:
- V4 uses `Currency` type (can be native or ERC-20)
- Native currencies represented by `ADDRESS_ZERO` in poolKey
- No wrapping required for native ETH pools

**Native ETH Patterns**:
1. **Pool Creation**: Set currency0 or currency1 to native currency
2. **Address Encoding**: Native → `ADDRESS_ZERO`, ERC-20 → token address
3. **Position Operations**:
   - Set `useNative` option
   - Native must be currency0
   - SDK adds SWEEP action automatically
   - Transaction value = amount0Max

**Example Flow** (Mint with Native ETH):
```
1. MINT_POSITION (with hookData if needed)
2. SETTLE_PAIR (user pays both currencies)
3. SWEEP (return excess native ETH to user)
```

### Pool Identity

**PoolKey** - Struct identifying a pool:
```typescript
{
  currency0: string,      // ADDRESS_ZERO or token address
  currency1: string,      // ADDRESS_ZERO or token address
  fee: number,            // Fee in hundredths of bip
  tickSpacing: number,    // Tick spacing
  hooks: string           // Hook contract address
}
```

**PoolId** - Unique identifier:
- `keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))`
- Used to identify pools in PoolManager

**Dynamic Fees**:
- Set `fee = DYNAMIC_FEE_FLAG` (0x800000)
- Requires a hook contract (hooks address cannot be zero)
- Hook determines fee dynamically per swap

### Position Management Workflow

**Mint New Position**:
1. Create Position object with desired liquidity
2. Compute amounts with slippage: `mintAmountsWithSlippage()`
3. (Optional) Generate Permit2 batch: `position.permitBatchData()`
4. Encode calldata: `V4PositionManager.addCallParameters(position, mintOptions)`
5. Execute transaction with value (if native ETH)

**Increase Liquidity**:
1. Create Position object with additional liquidity
2. Use `IncreaseLiquidityOptions` with existing `tokenId`
3. Encode: `V4PositionManager.addCallParameters(position, increaseOptions)`

**Decrease/Remove Liquidity**:
1. Specify `liquidityPercentage` (e.g., 50% = new Percent(50, 100))
2. Set `burnToken: true` to burn NFT (requires 100% removal)
3. (Optional) Include NFT permit if sender doesn't own position
4. Encode: `V4PositionManager.removeCallParameters(position, removeOptions)`

**Collect Fees**:
1. Set liquidity decrease to 0 (triggers fee collection)
2. Specify recipient address
3. Encode: `V4PositionManager.collectCallParameters(position, collectOptions)`

### Action Encoding Pattern

**Planner Pattern**:
```typescript
// Create planner
const planner = new V4PositionPlanner()

// Add actions in sequence
planner.addMint(pool, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner)
planner.addSettlePair(currency0, currency1)
if (useNative) planner.addSweep(currency0, recipient)

// Finalize to get encoded bytes
const unlockData = planner.finalize()

// Wrap in modifyLiquidities call
const calldata = V4PositionManager.encodeModifyLiquidities(unlockData, deadline)
```

**Action Execution**:
- All actions execute atomically in the PoolManager's unlock callback
- Position Manager calls `modifyLiquidities(unlockData, deadline)`
- PoolManager unlocks → executes actions → checks deltas settled

### Slippage Protection (V4 vs V3)

**V4 Slippage Model**:
- **Mint/Increase**: Protected by MAXIMUM amounts (amount0Max, amount1Max)
- **Burn/Decrease**: Protected by MINIMUM amounts (amount0Min, amount1Min)

**Key Difference from V3**:
- V3: Uses single amountMin for both tokens
- V4: Separate max/min for each token based on price movement direction
- V4 mint slippage: Upper price for amount1, lower price for amount0

**Computing Slippage Amounts**:
```typescript
// For minting (get maximum amounts)
const { amount0, amount1 } = position.mintAmountsWithSlippage(slippageTolerance)

// For burning (get minimum amounts)
const { amount0, amount1 } = position.burnAmountsWithSlippage(slippageTolerance)
```

## Development Workflow

### Local Development

**Setup**:
```bash
# Clone repo and install dependencies
git clone https://github.com/Uniswap/sdks.git
cd sdks
yarn install

# Build v4-sdk specifically
yarn sdk @uniswap/v4-sdk build

# Or build all SDKs (respects dependency order)
yarn g:build
```

**Development Commands**:
```bash
# Watch mode for v4-sdk (auto-rebuild on changes)
cd sdks/v4-sdk && yarn start

# Run tests
yarn test
yarn test --watch              # Watch mode

# Lint and format
yarn lint                       # ESLint with --max-warnings 0
yarn lint --fix                # Auto-fix prettier/eslint issues

# Type-check
yarn typecheck

# Build for production
yarn build                      # Outputs: dist/index.js, dist/v4-sdk.esm.js, dist/index.d.ts
```

**Build Output** (TSDX):
- `dist/index.js` - CommonJS bundle
- `dist/v4-sdk.esm.js` - ES modules bundle
- `dist/index.d.ts` - TypeScript type definitions
- Tree-shaking enabled (`sideEffects: false` in package.json)

### NPM Usage

**Installation**:
```bash
npm install @uniswap/v4-sdk @uniswap/sdk-core ethers jsbi

# or yarn
yarn add @uniswap/v4-sdk @uniswap/sdk-core ethers jsbi
```

**Basic Import**:
```typescript
import { Pool, Position, Trade, V4PositionManager } from '@uniswap/v4-sdk'
import { Token, TradeType, Percent } from '@uniswap/sdk-core'
import { ethers } from 'ethers'
```

## Code Quality

**Linting & Formatting**:
- **Framework**: ESLint 8.57.0 with Prettier 2.4.1 integration
- **Configuration**: `.eslintrc.js` in package root
- **Strictness**: `--max-warnings 0` (zero warnings policy)
- **Plugins**:
  - `@typescript-eslint/eslint-plugin` - TypeScript-specific rules
  - `eslint-plugin-prettier` - Format checking
  - `eslint-plugin-import` - Import/export rules
  - `eslint-plugin-eslint-comments` - ESLint directive linting
  - `eslint-plugin-functional` - Functional programming patterns
- **Prettier Settings** (applied to all files):
  - 120 column width (readability)
  - Single quotes (consistency with Uniswap SDKs)
  - No semicolons (functional style)
  - Trailing commas (diff clarity)

**Testing**:
- **Framework**: Jest 25.5.0 with ts-jest transformer
- **Coverage**: 8 test files (*.test.ts) co-located with implementation
- **Test Suites**:
  - `entities/*.test.ts` - Pool, Position, Route, Trade tests
  - `utils/*.test.ts` - Hook, path encoding, planner tests
  - `PositionManager.test.ts` - Position manager encoding tests
- **Commands**:
  ```bash
  yarn test              # Run all tests
  yarn test --watch    # Watch mode (re-run on changes)
  yarn test --coverage # Generate coverage report
  ```

**Type Safety**:
- **TypeScript 4.3.3** - Strict mode enforced
- **Compiler Options**: `strict: true`, no `noImplicitAny`
- **Module System**: ESM + CJS dual support
- **Exports**: Full TypeScript type definitions (`*.d.ts` in dist)
- **No Any Types**: Strict type checking throughout codebase

## Conventions and Patterns

### Naming Conventions

**Classes** (PascalCase):
- Entity models: `Pool`, `Position`, `Route`, `Trade`
- Managers: `V4PositionManager`
- Planners: `V4Planner`, `V4PositionPlanner`
- Utilities: `Hook`, `Multicall`

**Enums** (PascalCase):
- `Actions` - Action codes (MINT_POSITION, SWAP_EXACT_IN, etc.)
- `HookOptions` - Hook permission flags
- `FeeAmount` - Standard fee tiers (LOWEST, LOW, MEDIUM, HIGH)
- `PositionFunctions` - Function signatures/selectors

**Constants** (UPPER_SNAKE_CASE):
- Pool identifiers: `ADDRESS_ZERO` (0x0000...0000), `DYNAMIC_FEE_FLAG` (0x800000)
- Sentinel values: `EMPTY_BYTES` (0x), `MSG_SENDER` (0x...)
- Math constants: `Q96`, `Q192`, `ONE_ETHER`, `ZERO`
- Fees/ticks: `FEE_AMOUNT_LOW`, `TICK_SPACING_SIXTY`

**Functions** (camelCase):
- Encoding: `addCallParameters`, `encodeModifyLiquidities`, `encodeRouteToPath`
- Computations: `getPoolKey`, `getPoolId`, `getOutputAmount`
- Builders: `addMint`, `addSettle`, `finalize`

**Files** (kebab-case or camelCase):
- Core entities: `pool.ts`, `position.ts`, `route.ts`, `trade.ts`
- Utilities: `v4Planner.ts`, `v4PositionPlanner.ts`, `hook.ts`
- Tests: `*.test.ts` (co-located with implementation)

### Architectural Patterns

**Abstract Classes (Namespace Pattern)**:
- `V4PositionManager` - Cannot be instantiated; only static methods
- Provides type-safe namespace for related transaction encoding functions
- Pattern: Prevents accidental instantiation while organizing related APIs

**Builder Pattern (Action Encoding)**:
```typescript
const planner = new V4PositionPlanner()
  .addMint(pool, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner)
  .addSettlePair(currency0, currency1)
  .addSweep(currency0, 0, recipient)

const { actions, params } = planner.finalize()
```
- Chain methods for fluent API
- Accumulates state internally
- Finalizes to immutable encoded output

**Static Factory Methods**:
```typescript
// Pool construction
Pool.getPoolKey(currencyA, currencyB, fee, tickSpacing, hooks): PoolKey
Pool.getPoolId(currencyA, currencyB, fee, tickSpacing, hooks): string

// Position construction
Position.fromAmounts(pool, tickLower, tickUpper, amount0, amount1): Position
Position.fromAmount0(pool, tickLower, tickUpper, amount0): Position

// Trade construction
Trade.exactIn(routes, amountOut, tradeType): Trade
Trade.exactOut(routes, amountIn, tradeType): Trade
Trade.bestTradeExactIn(...): Trade[]
```
- Hides complex initialization logic
- Validates inputs before construction
- Enables multiple construction strategies

**Immutability Pattern**:
- Entities (Pool, Position, Route, Trade) are immutable after construction
- Computed values cached in private fields to avoid recalculation
- No setters; use static constructors for variations
- Enables safe sharing and concurrent access

**Mathematical Precision Pattern**:
- All amounts use JSBI (JavaScript BigInt) for arbitrary precision
- Prices use Fraction class (numerator/denominator)
- Rounding applied explicitly: `amount.quotient`, `amount.toSignificant()`

### Error Handling

**Invariant Assertions** (`tiny-invariant`):
```typescript
import invariant from 'tiny-invariant'

invariant(tickLower < tickUpper, 'TICK_ORDER')
invariant(amount.greaterThan(0), 'ZERO_LIQUIDITY')
invariant(pool.tickCurrent >= tickLower && pool.tickCurrent <= tickUpper, 'TICK_RANGE')
```
- Preconditions thrown at construction time
- Descriptive error codes for debugging
- Common error strings: `ZERO_LIQUIDITY`, `NATIVE_NOT_SET`, `NO_SQRT_PRICE`, `CANNOT_BURN`

**Warnings** (`tiny-warning`):
```typescript
import warning from 'tiny-warning'

warning(minimalAmount.lessThan(expectedAmount), 'Slippage exceeded')
```
- Non-fatal issues logged but don't throw
- Used for user-facing warnings (slippage, price impact)

**Hooks Limitations**:
- Pools with swap hooks cannot use `getOutputAmount()`/`getInputAmount()`
- Throws error: "Unsupported hook" when attempting
- Reason: Hook behavior is unpredictable without execution
- Workaround: Simulate with actual pool manager or use rough estimates

### Integration Patterns

**With sdk-core**:
- **Core Types**: `Currency`, `Token`, `NativeCurrency`, `CurrencyAmount`
  ```typescript
  import { Token, NativeCurrency } from '@uniswap/sdk-core'
  const dai = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI')
  const weth = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WETH')
  ```
- **Math Types**: `Fraction`, `Percent`, `Price`
  ```typescript
  import { Percent } from '@uniswap/sdk-core'
  const slippage = new Percent(50, 10_000) // 0.50%
  ```
- **Currency Comparison**: `currency.equals()`, `currency.isNative`

**With v3-sdk**:
- **Tick Math**: `TickMath.MIN_TICK`, `TickMath.MAX_TICK`, `TickMath.getSqrtRatioAtTick()`
  ```typescript
  import { TickMath } from '@uniswap/v3-sdk'
  const sqrtPrice = TickMath.getSqrtRatioAtTick(pool.tickCurrent)
  ```
- **Price Conversions**: `SqrtPriceMath`, `encodeSqrtRatioX96()`
- **Liquidity**: `maxLiquidityForAmounts()` from v3-sdk
- **Swap Logic**: `v3Swap()` for hookless pools (V4 delegates to V3)

**With ethers.js**:
- **Address Utilities**:
  ```typescript
  import { isAddress } from 'ethers/lib/utils'
  invariant(isAddress(hookAddress), 'Invalid hook address')
  ```
- **ABI Encoding**:
  ```typescript
  import { defaultAbiCoder } from 'ethers/lib/utils'
  const encoded = defaultAbiCoder.encode(['uint256', 'address'], [amount, recipient])
  ```
- **Hashing**:
  ```typescript
  import { keccak256 } from '@ethersproject/solidity'
  const poolId = keccak256(['bytes'], [encodedPoolKey])
  ```

## Common Usage Patterns

### Pattern 1: Create a V4 Pool and Calculate Price

```typescript
import { Pool } from '@uniswap/v4-sdk'
import { Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'

// Create tokens
const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC')
const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI')

// Create pool (pool state fetched from on-chain)
const pool = new Pool(
  USDC,                                           // currency0
  DAI,                                            // currency1
  3000,                                           // fee (0.30%)
  60,                                             // tickSpacing
  '0x0000000000000000000000000000000000000000', // hooks (no hooks)
  JSBI.BigInt('1000000000000000000'),            // sqrtRatioX96
  JSBI.BigInt('1000000000000000000'),            // liquidity
  -276325                                         // tickCurrent
)

// Get current price
const price = pool.token0Price  // USDC/DAI
console.log(price.toSignificant(6))
```

### Pattern 2: Mint a Position with Slippage

```typescript
import { Position, V4PositionManager } from '@uniswap/v4-sdk'
import { Percent } from '@uniswap/sdk-core'

const pool = new Pool(...)  // from Pattern 1

// Create position with specified liquidity
const position = new Position({
  pool,
  liquidity: JSBI.BigInt('1000000000000000000'),
  tickLower: -276400,
  tickUpper: -276200
})

// Compute slippage-protected amounts
const slippageTolerance = new Percent(50, 10_000)  // 0.5%
const { amount0: amount0Max, amount1: amount1Max } =
  position.mintAmountsWithSlippage(slippageTolerance)

// Get transaction calldata
const { calldata, value } = V4PositionManager.addCallParameters(
  position,
  {
    slippageTolerance,
    recipient: '0x...',  // your address
    deadline: Math.floor(Date.now() / 1000) + 1800,
    createPool: false
  }
)

// Send transaction
const tx = await signer.sendTransaction({
  to: POSITION_MANAGER_ADDRESS,
  data: calldata,
  value  // native ETH if applicable
})
```

### Pattern 3: Check Hook Permissions

```typescript
import { Hook, HookOptions } from '@uniswap/v4-sdk'

const hookAddress = '0x...'  // hook contract address

// Get all permissions
const permissions = Hook.permissions(hookAddress)
console.log(permissions.beforeSwap)  // boolean
console.log(permissions.afterSwap)   // boolean

// Check specific permission
const hasBeforeSwap = Hook.hasPermission(hookAddress, HookOptions.BeforeSwap)

// Check permission categories
const canAffectSwaps = Hook.hasSwapPermissions(hookAddress)
const canAffectLiquidity = Hook.hasLiquidityPermissions(hookAddress)
```

### Pattern 4: Multi-hop Trade Route

```typescript
import { Route, Trade, TradeType } from '@uniswap/v4-sdk'
import { CurrencyAmount } from '@uniswap/sdk-core'

// Create route through multiple pools
const pools = [pool1, pool2, pool3]  // V4 pools in sequence
const route = new Route(pools, USDC, DAI)

// Create trade for exact input
const amountIn = CurrencyAmount.fromRawAmount(USDC, '1000000')  // 1 USDC
const trade = Trade.fromRoute(route, amountIn, TradeType.EXACT_INPUT)

// Get slippage-protected output
const slippageTolerance = new Percent(50, 10_000)  // 0.5%
const minimumAmountOut = trade.minimumAmountOut(slippageTolerance)

console.log(`Minimum output: ${minimumAmountOut.toSignificant(6)} DAI`)
```

### Pattern 5: Native ETH Position (Currency0 = ETH)

```typescript
import { NativeCurrency } from '@uniswap/sdk-core'

// Create pool with native ETH as currency0
const ETH = NativeCurrency.onChain(1)  // mainnet ETH
const USDC = new Token(1, '0x...', 6, 'USDC')

const pool = new Pool(
  ETH,                                            // currency0 (native)
  USDC,                                           // currency1
  3000,                                           // fee
  60,                                             // tickSpacing
  '0x0000000000000000000000000000000000000000', // no hooks
  sqrtRatioX96,
  liquidity,
  tick
)

// Mint position with native ETH
const position = new Position({
  pool,
  liquidity,
  tickLower,
  tickUpper
})

// Get calldata with native ETH support
const { calldata, value } = V4PositionManager.addCallParameters(
  position,
  {
    slippageTolerance: new Percent(50, 10_000),
    recipient: '0x...',
    deadline: Math.floor(Date.now() / 1000) + 1800,
    useNative: ETH  // enables native ETH
  }
)

// Send transaction with ETH value
const tx = await signer.sendTransaction({
  to: POSITION_MANAGER_ADDRESS,
  data: calldata,
  value: value  // contains the native ETH amount
})
```

## Documentation Management

### CLAUDE.md Hierarchy

This monorepo maintains documentation at multiple levels:

```
/sdks/CLAUDE.md                  ← Ecosystem overview (all 11 SDKs)
├── /sdks/v4-sdk/CLAUDE.md       ← V4 SDK (this file)
├── /sdks/v3-sdk/CLAUDE.md       ← V3 SDK
├── /sdks/router-sdk/CLAUDE.md   ← Router SDK
└── [other SDK docs...]
```

### Update Policy

**When to Update v4-sdk/CLAUDE.md**:
- Adding or removing public APIs (exports in `index.ts`)
- Changing Position, Pool, Trade constructors/methods
- Modifying hook handling or permission system
- Adding new action types to V4Planner
- Changing native ETH support patterns
- Updating dependencies or peer requirements

**What to Update**:
1. **Timestamp**: Update "Last Updated" date at top
2. **Architecture**: If module structure changes
3. **API**: If public interfaces change
4. **Examples**: If usage patterns become outdated
5. **Dependencies**: If versions bump significantly

**Preserving Custom Content**:
- Content between `<!-- CUSTOM:START -->` and `<!-- CUSTOM:END -->` is preserved
- Use this for project-specific notes or experimental features
- Update markers when modifying surrounding sections

### Integration with Sibling SDKs

**v4-sdk depends on**:
- `@uniswap/sdk-core` - Core types (Currency, Token, Percent, Price)
- `@uniswap/v3-sdk` - Tick math, price calculations, swap logic for hookless pools

**v4-sdk is consumed by**:
- `router-sdk` - Aggregates V2, V3, V4 routing
- `universal-router-sdk` - Unified swap interface using v4-sdk
- `permit2-sdk` - Compatible with v4-sdk position approvals
- dApps and trading bots building on V4

### Documentation Standards

**Code Examples**:
- Always include imports
- Show complete, runnable snippets where possible
- Include error handling for production use
- Comment non-obvious logic

**API Documentation**:
- Document all public methods with signatures
- Specify parameter types and return types
- Include preconditions and error cases
- Provide usage examples for complex methods

**Architecture Explanations**:
- Explain "why" not just "how"
- Include conceptual diagrams where helpful
- Cross-reference related modules
- Highlight gotchas and common mistakes

<!-- CUSTOM:START -->
<!-- User additions preserved during updates -->
<!-- CUSTOM:END -->