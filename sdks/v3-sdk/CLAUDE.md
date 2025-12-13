> **Last Updated:** 2025-11-19

# CLAUDE.md - Uniswap V3 SDK

## Overview

The Uniswap V3 SDK (@uniswap/v3-sdk) provides TypeScript abstractions for building applications on top of Uniswap V3, the concentrated liquidity automated market maker (AMM) protocol. This SDK enables developers to interact with V3 pools, manage liquidity positions as NFTs, execute swaps, and integrate with V3 periphery contracts (SwapRouter, NonfungiblePositionManager, Quoter, and Staker).

**Key Capabilities:**
- Create and manage concentrated liquidity positions with custom price ranges (stored as ERC-721 NFTs)
- Execute single-hop and multi-hop swaps with sophisticated routing and price simulation
- Calculate off-chain price quotes without executing trades
- Interact with NFT liquidity position management and fee collection
- Manage liquidity mining programs through Staker contract
- Handle gasless approvals via Permit2 integration
- Generate fully-formed contract call parameters for all V3 operations

**Status:** Alpha software (used in production on Uniswap Interface but may contain bugs or change between patch versions)

## Package Information

- **Name:** @uniswap/v3-sdk
- **Current Version:** Latest (semantic versioning)
- **Description:** SDK for building applications on top of Uniswap V3
- **License:** MIT
- **Repository:** https://github.com/Uniswap/sdks.git
- **Documentation:** https://docs.uniswap.org/

## Core Concepts

### Concentrated Liquidity

Unlike V2's constant product formula (x * y = k) that distributes liquidity across all price ranges, Uniswap V3 allows liquidity providers to concentrate their capital within custom price ranges. This revolutionary approach provides:

- **Capital Efficiency:** 4000x capital improvement vs V2 for same liquidity in-range
- **Active Liquidity:** Only liquidity within the current price contributes to swaps and earns fees
- **Flexible Ranges:** Liquidity providers choose their own price ranges (tickLower and tickUpper)
- **Better Returns:** Concentrated positions within tight ranges earn higher fees for same capital

**Trade-off:** Out-of-range positions earn no fees until price returns to their range or they exit the position.

### Tick System and Price Representation

V3 uses a logarithmic tick-based system for pricing:

- **Tick Index:** Integer representing discrete price level where tick = log_(1.0001)(price)
- **Tick Spacing:** Variable granularity determined by fee tier (1, 4, 6, 8, 10, 60, or 200 ticks)
- **Sqrt Ratio X96:** Internal price representation as sqrt(token1/token0) * 2^96 (Q64.96 fixed-point)
- **Valid Ticks:** Range from MIN_TICK (-887,272) to MAX_TICK (887,272), must align with tick spacing

**Example:** In a 0.3% fee pool with tick spacing of 60:
- Valid ticks: ..., -120, -60, 0, 60, 120, ...
- Position from tick -6000 to tick +6000 (±3600% price range at center)

### NFT Liquidity Positions

V3 liquidity positions are fully represented as ERC-721 NFTs managed by NonfungiblePositionManager:

- **Unique Tokens:** Each position is a distinct NFT with its own metadata
- **Transferability:** Positions can be transferred, traded, or composed in other protocols
- **Fee Accumulation:** Each position independently accumulates trading fees
- **Composability:** NFTs can be used as collateral, in yield strategies, or wrapped in other protocols
- **Burning:** Positions can be completely removed and NFT burned when desired

### Fee Tiers and Tick Spacing

V3 supports multiple fee tiers for different trading pair characteristics:

| Fee Tier | Basis Points | Tick Spacing | Use Case |
|----------|-------------|--------------|----------|
| 0.01%    | 100         | 1            | Stablecoin pairs, correlated assets |
| 0.05%    | 500         | 10           | Low volatility pairs |
| 0.3%     | 3000        | 60           | Standard pairs (most common) |
| 1%       | 10000       | 200          | Exotic pairs, high volatility |
| **Plus:** | **200**     | **4** | Recent addition for better efficiency |
| **Plus:** | **300**     | **6** | Ultra-stable pairs |
| **Plus:** | **400**     | **8** | Between low and medium |

Each fee tier must be created once per pair (e.g., DAI/USDC 0.01%, DAI/USDC 0.05%, DAI/USDC 0.3% are three separate pools).

## Architecture

### Directory Structure

```
sdks/v3-sdk/
├── src/
│   ├── entities/                      # Core domain entities (6 classes)
│   │   ├── pool.ts                    # Pool state and swap simulation
│   │   ├── position.ts                # Concentrated liquidity position
│   │   ├── trade.ts                   # Trade routing and execution
│   │   ├── route.ts                   # Multi-pool swap paths
│   │   ├── tick.ts                    # Tick data structure
│   │   ├── tickDataProvider.ts        # Tick data provider interface
│   │   ├── tickListDataProvider.ts    # Array-based tick data implementation
│   │   └── index.ts                   # Entity exports
│   │
│   ├── utils/                         # Mathematical and utility functions (23 files)
│   │   ├── tickMath.ts                # Tick ↔ sqrt price conversions
│   │   ├── sqrtPriceMath.ts           # Square root price mathematics
│   │   ├── swapMath.ts                # Swap step amount calculations
│   │   ├── liquidityMath.ts           # Liquidity addition/removal math
│   │   ├── fullMath.ts                # Extended precision multiplication
│   │   ├── priceTickConversions.ts    # Price ↔ tick conversions
│   │   ├── maxLiquidityForAmounts.ts  # Maximum liquidity calculation
│   │   ├── mostSignificantBit.ts      # Bit manipulation utilities
│   │   ├── computePoolAddress.ts      # Deterministic pool address (CREATE2)
│   │   ├── encodeRouteToPath.ts       # Route encoding for contracts
│   │   ├── encodeSqrtRatioX96.ts      # Price encoding as sqrt ratio
│   │   ├── nearestUsableTick.ts       # Round ticks to valid spacing
│   │   ├── position.ts                # Position math utilities
│   │   ├── tickLibrary.ts             # Tick data structure utilities
│   │   ├── tickList.ts                # Tick list processing
│   │   ├── isSorted.ts                # Array validation utilities
│   │   ├── calldata.ts                # Contract calldata utilities
│   │   ├── v3swap.ts                  # Multi-hop swap simulation
│   │   └── index.ts                   # Utility exports
│   │
│   ├── nonfungiblePositionManager.ts  # NFT position management interface
│   ├── swapRouter.ts                  # Swap execution interface
│   ├── quoter.ts                      # Off-chain price quote interface
│   ├── staker.ts                      # Liquidity mining interface
│   ├── multicall.ts                   # Multi-call batch encoding
│   ├── payments.ts                    # Payment handling utilities
│   ├── selfPermit.ts                  # Permit signature utilities
│   ├── constants.ts                   # Protocol constants and enums
│   ├── internalConstants.ts           # Internal math constants
│   └── index.ts                       # Public API exports
│
├── package.json
├── tsconfig.json
├── .eslintrc.js
└── README.md
```

**Total:** 65 source files (includes 20 test files, 45 implementation files)

### Module Organization

The v3-sdk is organized into four conceptual layers:

1. **Entity Layer** (`entities/`): Domain models representing V3 concepts
   - `Pool`: Pool state container
   - `Position`: Concentrated liquidity position
   - `Trade`: Trade routing information
   - `Route`: Multi-pool path
   - `Tick`: Tick data point

2. **Mathematical Layer** (`utils/`): Pure functions for V3 calculations
   - Tick mathematics and conversions
   - Price calculations (sqrt-based)
   - Swap step calculations
   - Liquidity mathematics
   - Position math

3. **Contract Interface Layer**: Static classes for generating contract calls
   - `NonfungiblePositionManager`: Position lifecycle management
   - `SwapRouter`: Swap execution
   - `SwapQuoter`: Off-chain quotes
   - `Staker`: Incentive program interaction
   - `SelfPermit`: Permit signature handling
   - `Multicall`: Batch operations
   - `Payments`: Payment utilities

4. **Constants Layer**: Protocol constants, fee tiers, tick spacings

## Core Components - Detailed

### Pool Entity

**Location:** `src/entities/pool.ts`

Represents a V3 liquidity pool with a specific token pair and fee tier.

**Constructor Parameters:**
```typescript
new Pool(
  tokenA: Token,           // First token in pair
  tokenB: Token,           // Second token in pair
  fee: FeeAmount,          // Fee tier (100, 500, 3000, 10000, etc.)
  sqrtRatioX96: BigintIsh,  // Current sqrt price (Q64.96)
  liquidity: BigintIsh,     // Current in-range liquidity
  tickCurrent: number,      // Current tick
  ticks?: TickDataProvider | Tick[]  // Optional tick data
)
```

**Key Properties:**
- `token0`, `token1`: Sorted token pair (token0 < token1 by address)
- `fee`: Fee tier in hundredths of basis points
- `sqrtRatioX96`: Current price as sqrt ratio (verified to be between current and next tick)
- `liquidity`: In-range active liquidity
- `tickCurrent`: Current tick (must be valid: between two integer ticks)
- `tickDataProvider`: Source of tick information for swap simulation
- `tickSpacing`: Derived from fee (1, 10, 60, 200, etc.)

**Key Methods:**
- `involvesToken(token)`: Returns true if token is either token0 or token1
- `getOutputAmount(inputAmount)`: Simulates swap output
- `getInputAmount(outputAmount)`: Simulates reverse swap
- `priceOf(token)`: Returns token price in terms of the other
- `token0Price`, `token1Price`: Current mid prices (getters)
- `static getAddress()`: Computes deterministic pool address

**Pool State Invariants:**
- sqrtRatioX96 must be between TickMath.getSqrtRatioAtTick(tickCurrent) and getSqrtRatioAtTick(tickCurrent + 1)
- liquidity is the sum of all active position liquidities
- tokenA and tokenB are automatically sorted (token0 < token1)

### Position Entity

**Location:** `src/entities/position.ts`

Represents a concentrated liquidity position within a pool. A position defines how much liquidity is provided between two specific ticks.

**Constructor Parameters:**
```typescript
new Position({
  pool: Pool,               // Pool where position exists
  tickLower: number,        // Lower bound of position
  tickUpper: number,        // Upper bound of position
  liquidity: BigintIsh      // Liquidity amount (Q128 format)
})
```

**Key Properties:**
- `pool`: Reference to the pool
- `tickLower`: Lower tick boundary (must be valid for pool's tick spacing)
- `tickUpper`: Upper tick boundary (must be valid for pool's tick spacing)
- `liquidity`: Amount of liquidity in Q128 format
- `amount0`, `amount1`: Current token amounts this position represents
- `token0PriceLower`, `token0PriceUpper`: Price at position boundaries

**Position States (relative to current pool price):**
- **In-range:** tickCurrent is between tickLower and tickUpper → earns fees
- **Below:** tickCurrent < tickLower → holds only token0
- **Above:** tickCurrent > tickUpper → holds only token1

**Static Factory Methods:**
- `Position.fromAmounts()`: Create position from desired token amounts (calculates required liquidity)
- `Position.fromAmount0()`: Create position with specific amount of token0
- `Position.fromAmount1()`: Create position with specific amount of token1

**Key Slippage Methods:**
- `mintAmountsWithSlippage(slippageTolerance)`: Token amounts accounting for slippage (used for minting)
- `burnAmountsWithSlippage(slippageTolerance)`: Token amounts accounting for slippage (used for burning)

### Trade Entity

**Location:** `src/entities/trade.ts`

Represents a trade execution across one or more routes. Handles multi-route best execution and calculates execution price, price impact, and slippage.

**Constructor:** Not directly instantiated; use factory methods

**Static Factory Methods:**
- `Trade.exactIn(route, amountIn)`: Exact input trade (specify how much to spend)
- `Trade.exactOut(route, amountOut)`: Exact output trade (specify how much to receive)
- `Trade.fromRoute()`: Create from single route
- `Trade.fromRoutes()`: Create from multiple routes (splits execution)
- `Trade.bestTradeExactIn()`: Find best route from many pools
- `Trade.bestTradeExactOut()`: Find best route for exact output

**Key Properties:**
- `routes`: Array of Route objects (for split execution)
- `tradeType`: TradeType.EXACT_INPUT or TradeType.EXACT_OUTPUT
- `inputAmount`: Total input amount (CurrencyAmount)
- `outputAmount`: Expected output amount
- `executionPrice`: Average execution price across all routes
- `priceImpact`: Percentage price impact (negative = favorable)
- `worstExecutionPrice()`: Worst price given slippage tolerance

**Usage:** Trade instances provide routing information to SwapRouter for generating contract calldata.

### Route Entity

**Location:** `src/entities/route.ts`

Represents a path through multiple pools for a swap. Validates that each consecutive pool shares a token (path continuity).

**Constructor:**
```typescript
new Route(
  pools: Pool[],           // Array of pools in swap path
  input: Token,            // Input token
  output: Token            // Output token
)
```

**Validation:**
- Each pool must share token(s) with adjacent pools
- Input token must be token0 or token1 of first pool
- Output token must be token0 or token1 of last pool
- Path must be continuous with no gaps

**Example valid routes:**
- Single hop: DAI → USDC (one pool)
- Multi-hop: DAI → USDC → ETH (two pools: DAI-USDC + USDC-ETH)
- Multi-hop with fee tiers: DAI → USDC (0.05%) → DAI → USDC (0.3%) (possible but unusual)

**Key Properties:**
- `pools`: Pools in the path
- `tokenPath`: Array of tokens in order (input through output)
- `input`, `output`: First and last tokens
- `midPrice`: Average price across entire path

### Contract Interface Classes

All contract interface classes follow the same pattern: static class with private constructor, providing static methods that generate contract calldata. These classes never instantiate; they're pure calldata generators.

#### NonfungiblePositionManager

**Location:** `src/nonfungiblePositionManager.ts`

Generates calldata for NonfungiblePositionManager contract operations (ERC-721 position lifecycle).

**Key Static Methods:**

1. **addCallParameters(position, options)**: Mint new or increase existing position
   - For minting: `{ recipient, slippageTolerance, deadline, createPool: boolean }`
   - For increasing: `{ tokenId, slippageTolerance, deadline }`
   - Returns: `{ calldata: string, value: string }`

2. **removeCallParameters(position, options)**: Decrease or remove position
   - Options: `{ tokenId, liquidityPercentage, slippageTolerance, deadline, burnToken, collectOptions }`
   - Returns: `{ calldata: string, value: string }`

3. **collectCallParameters(options)**: Collect accumulated fees
   - Returns: `{ calldata: string, value: string }`

4. **safeTransferFromParameters(options)**: Transfer NFT position
   - Returns: `{ calldata: string, value: string }`

5. **createCallParameters(pool, options)**: Create new pool (for pairs without a pool)
   - Options: `{ fee, tickLower, tickUpper, sqrtPriceX96, recipient, deadline }`
   - Returns: `{ calldata: string, value: string }`

#### SwapRouter

**Location:** `src/swapRouter.ts`

Generates calldata for SwapRouter contract (swap execution and routing).

**Key Static Methods:**

1. **swapCallParameters(trades, options)**
   - Input: Trade or Trade[] (can split across multiple routes)
   - Options: `{ slippageTolerance, recipient, deadline, inputTokenPermit?, outputTokenPermit?, permit?, fee? }`
   - Returns: `{ calldata: string, value: string }`
   - Handles exact input/output, native ETH wrapping, multi-hop routing

2. Automatically handles:
   - ETH wrapping to WETH and unwrapping
   - Fee-on-transfer tokens
   - Permit signatures for gasless approvals

#### SwapQuoter

**Location:** `src/quoter.ts`

Generates calldata for Quoter contract (off-chain price simulation).

**Key Static Methods:**

1. **quoteCallParameters(route, amount, tradeType, options)**
   - Route: Single pool path
   - Amount: Input or output amount (depending on tradeType)
   - TradeType: EXACT_INPUT or EXACT_OUTPUT
   - Options: `{ useQuoterV2: boolean }`
   - Returns: `{ calldata: string }`
   - Read-only (no value transfer)

#### Staker

**Location:** `src/staker.ts`

Generates calldata for UniswapV3Staker contract (liquidity mining programs).

**Key Static Methods:**
- `stakeCallParameters()`: Stake NFT in incentive
- `unstakeCallParameters()`: Withdraw staked NFT
- `collectRewardsCallParameters()`: Collect earned rewards
- `transferCallParameters()`: Transfer staked position

#### SelfPermit

**Location:** `src/selfPermit.ts`

Generates calldata for self-permit signatures (EIP-2612 token permits).

**Key Static Methods:**
- `selfPermit()`: Permit signature for token approval
- `selfPermitAllowed()`: Permit with allowance model

#### Multicall

**Location:** `src/multicall.ts`

Utility for batch encoding multiple contract calls into single transaction.

**Key Methods:**
- `encodeMulticall()`: Combine multiple calldatas into batch

#### Payments

**Location:** `src/payments.ts`

Utility functions for payment handling:
- `unwrapWETH9()`: Convert WETH back to ETH
- `sweepToken()`: Transfer token remainder to recipient
- `refundETH()`: Return unused ETH to caller

### Mathematics and Utilities

The `utils/` directory contains pure mathematical functions critical for V3:

**Core Math Functions:**

| File | Purpose | Key Functions |
|------|---------|----------------|
| `tickMath.ts` | Tick ↔ price conversions | getSqrtRatioAtTick, getTickAtSqrtRatio |
| `sqrtPriceMath.ts` | Sqrt price calculations | getAmount0Delta, getAmount1Delta, getNextSqrtPriceX96 |
| `swapMath.ts` | Single swap step | computeSwapStep |
| `liquidityMath.ts` | Add/remove liquidity | addDelta |
| `fullMath.ts` | Extended precision | mulDiv, mulDivRoundingUp |
| `priceTickConversions.ts` | Price ↔ tick | priceToClosestTick, tickToPrice |
| `maxLiquidityForAmounts.ts` | Optimal liquidity | maxLiquidityForAmounts |
| `mostSignificantBit.ts` | Bit operations | mostSignificantBit |
| `computePoolAddress.ts` | Pool address | computePoolAddress |
| `encodeRouteToPath.ts` | Route encoding | encodeRouteToPath |
| `encodeSqrtRatioX96.ts` | Price encoding | encodeSqrtRatioX96 |
| `nearestUsableTick.ts` | Tick rounding | nearestUsableTick, nearestUsableTickRange |
| `position.ts` | Position utilities | derivePositionFromAmounts |
| `tickLibrary.ts` | Tick data structures | TickLibrary methods |
| `tickList.ts` | Tick list processing | maxLiquidityAtTick |
| `v3swap.ts` | Multi-hop simulation | uniswapV3SwapExactInternal, etc. |

**Precision Handling:**

All math uses JSBI (arbitrary precision JavaScript big integers) to safely handle 256-bit Ethereum values without overflow. Key constants:

```typescript
Q64 = 2^64                    // Used in tick calculations
Q96 = 2^96                    // Q64.96 fixed-point format
Q128 = 2^128                  // Liquidity format
Q192 = 2^192                  // Full precision intermediate calculations
```

## Dependencies and Integrations

### Direct Dependencies

```json
{
  "@ethersproject/abi": "^5.5.0",          // ABI encoding/decoding
  "@ethersproject/solidity": "^5.0.9",     // Solidity utilities
  "@uniswap/sdk-core": "^7.8.0",           // Dependency: Core types
  "@uniswap/swap-router-contracts": "^1.3.0",  // Router ABI and constants
  "@uniswap/v3-periphery": "^1.1.1",       // V3 periphery contract ABIs
  "@uniswap/v3-staker": "1.0.0",           // Staker contract ABI
  "tiny-invariant": "^1.1.0",              // Runtime assertions (contracts must hold)
  "tiny-warning": "^1.0.3"                 // Development warnings
}
```

### SDK Dependencies

**Required Foundation:**
- `@uniswap/sdk-core` (DEPENDENCY): Provides Token, Currency, Price, CurrencyAmount, Percent, TradeType
  - Must be imported first before using v3-sdk
  - V3 SDK re-exports core types for convenience

**Consumers of V3 SDK:**
- `@uniswap/router-sdk`: Higher-level routing combining V2/V3/V4 protocols
- `@uniswap/universal-router-sdk`: Universal Router integration for production swaps
- `@uniswap/permit2-sdk`: Gasless approvals work alongside V3 for signature-based trades
- `@uniswap/uniswapx-sdk`: Off-chain orders can use V3 routes for execution

### Integration Points

**On-Chain Contracts:**
- **UniswapV3Factory** (0x1F98431c...): Pool registry and factory
- **UniswapV3Router** (various addresses): Swap execution
- **NonfungiblePositionManager** (various): Position NFT management
- **SwapRouter02** (updated version): Enhanced swap routing
- **SwapQuoterV1/V2** (various): Off-chain price quotes
- **UniswapV3Staker** (various): Liquidity mining programs

**Supported Chains:**
- Ethereum Mainnet (primary development target)
- Polygon, Arbitrum, Optimism, Base, BNB Chain, Celo, zkSync, etc.
- Custom fork chains with same architecture

**Chain-Specific Handling:**
The SDK includes chain-aware features:
- `poolInitCodeHash(chainId)`: Returns correct init code hash per chain (zkSync differs)
- Constants may need overrides for non-standard chains
- Tick spacing and fee tiers are standardized across all EVM chains

## Usage Patterns and Examples

### Pattern 1: Create Pool Instance

```typescript
import { Pool, FeeAmount } from '@uniswap/v3-sdk'
import { Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'

const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI')
const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC')

// Create pool with current state
const pool = new Pool(
  DAI,
  USDC,
  FeeAmount.LOW,                            // 0.05% fee
  '1896710696286449799487660847590000000', // sqrtPriceX96 (1:1 price)
  '1000000000000000000',                    // liquidity
  200                                        // tickCurrent
)

// Access pool state
console.log('Token0:', pool.token0.symbol)  // "USDC"
console.log('Token1:', pool.token1.symbol)  // "DAI"
console.log('Current Tick:', pool.tickCurrent)
console.log('Pool Address:', Pool.getAddress(DAI, USDC, FeeAmount.LOW))
```

### Pattern 2: Create Concentrated Position

```typescript
import { Position, nearestUsableTick, TickMath } from '@uniswap/v3-sdk'
import { Percent } from '@uniswap/sdk-core'

// Define position range (e.g., -1000 to +1000 ticks from current)
const tickLower = nearestUsableTick(pool.tickCurrent - 1000, pool.tickSpacing)
const tickUpper = nearestUsableTick(pool.tickCurrent + 1000, pool.tickSpacing)

// Create position from desired token amounts
const position = Position.fromAmounts({
  pool,
  tickLower,
  tickUpper,
  amount0: '1000000',   // 1 USDC (6 decimals)
  amount1: '1000000000000000000',  // 1 DAI (18 decimals)
  useFullPrecision: true
})

// Get position value at current price
console.log('Amount0:', position.amount0.toSignificant(6))  // "1000000"
console.log('Amount1:', position.amount1.toSignificant(6))  // "1.0"

// Calculate mint amounts with 0.5% slippage
const slippage = new Percent(50, 10000)
const { amount0: min0, amount1: min1 } = position.mintAmountsWithSlippage(slippage)
```

### Pattern 3: Simulate Multi-Hop Swap

```typescript
import { Trade, Route } from '@uniswap/v3-sdk'
import { TradeType, CurrencyAmount } from '@uniswap/sdk-core'

// Create multi-pool route
const route = new Route(
  [pool1, pool2, pool3],  // DAI → USDC → USDT → ETH
  DAI,
  ETH
)

// Exact input: specify input amount
const amountIn = CurrencyAmount.fromRawAmount(DAI, '1000000000000000000')
const trade = new Trade({
  routes: [new Route([pool1, pool2], DAI, ETH)],
  tradeType: TradeType.EXACT_INPUT
})

// Get execution details
console.log('Output:', trade.outputAmount.toSignificant(4))
console.log('Execution Price:', trade.executionPrice.toSignificant(4))
console.log('Price Impact:', trade.priceImpact.toSignificant(2) + '%')
```

### Pattern 4: Generate Mint NFT Calldata

```typescript
import { NonfungiblePositionManager } from '@uniswap/v3-sdk'

// Mint new NFT position
const { calldata, value } = NonfungiblePositionManager.addCallParameters(
  position,
  {
    recipient: '0x1234567890123456789012345678901234567890',
    slippageTolerance: new Percent(50, 10000),  // 0.5%
    deadline: Math.floor(Date.now() / 1000) + 60 * 20,  // 20 min
    createPool: false  // Pool already exists
  }
)

// Send transaction
const tx = await signer.sendTransaction({
  to: NONFUNGIBLE_POSITION_MANAGER_ADDRESS,
  data: calldata,
  value: value
})
```

### Pattern 5: Generate Swap Calldata

```typescript
import { SwapRouter } from '@uniswap/v3-sdk'

const { calldata, value } = SwapRouter.swapCallParameters(trade, {
  slippageTolerance: new Percent(50, 10000),
  recipient: userAddress,
  deadline: Math.floor(Date.now() / 1000) + 60 * 20
})

const tx = await signer.sendTransaction({
  to: SWAP_ROUTER_ADDRESS,
  data: calldata,
  value: value
})
```

### Pattern 6: Get Price Quote (Off-Chain)

```typescript
import { SwapQuoter } from '@uniswap/v3-sdk'

const quoteCalldata = SwapQuoter.quoteCallParameters(
  route,
  amountIn,
  TradeType.EXACT_INPUT,
  { useQuoterV2: true }
)

// Call quoter contract via provider (read-only, no gas fee)
const quotedAmount = await provider.call({
  to: QUOTER_ADDRESS,
  data: quoteCalldata.calldata
})
```

### Pattern 7: Find Best Route Across Many Pools

```typescript
const pools = [pool1, pool2, pool3, pool4, pool5]
const amountIn = CurrencyAmount.fromRawAmount(DAI, '1000000000000000000')

// Find best route(s) up to 3 hops
const bestRoutes = await Trade.bestTradeExactIn(
  pools,
  amountIn,
  USDC,
  {
    maxNumResults: 3,  // Return top 3 routes
    maxHops: 3         // Max 3 pools in path
  }
)

if (bestRoutes.length > 0) {
  const best = bestRoutes[0]
  console.log('Best route pools:', best.routes[0].pools.length)
  console.log('Expected output:', best.outputAmount.toSignificant(6))
}
```

### Pattern 8: Remove Liquidity Position

```typescript
const { calldata, value } = NonfungiblePositionManager.removeCallParameters(
  position,
  {
    tokenId: 12345,
    liquidityPercentage: new Percent(100),  // Remove 100%
    slippageTolerance: new Percent(50, 10000),
    deadline: Math.floor(Date.now() / 1000) + 60 * 20,
    burnToken: true,  // Burn NFT after removal
    collectOptions: {
      expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, 0),
      expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, 0),
      recipient: userAddress
    }
  }
)
```

## Development Workflow

### Setup and Build

```bash
# Install dependencies
yarn install

# Build the package
yarn build

# Build outputs:
# - dist/index.js             (CommonJS)
# - dist/v3-sdk.esm.js       (ES modules)
# - dist/index.d.ts          (TypeScript declarations)
```

### Testing

```bash
# Run full test suite
yarn test

# Watch mode for development
yarn test --watch

# Coverage
yarn test --coverage
```

**Test Coverage:**
- Entity tests: Pool state, Position calculations, Trade routing
- Math utility tests: Tick conversions, price math, liquidity calculations
- Contract interface tests: Calldata encoding, parameter validation
- Edge cases: Min/max values, rounding, overflow protection

### Development

```bash
# Start watch mode for development
yarn start

# Watch files and recompile on changes
# Useful for active development and integration testing

# Run linter
yarn lint

# Fix linting issues
yarn lint --fix
```

## Code Quality Standards

### Type Safety

- **Strict TypeScript Mode:** All files compiled with strict mode enabled
- **Explicit Return Types:** All public methods have explicit return type annotations
- **Generic Types:** Heavy use of generics for Token and Currency types
- **Immutability:** All entities are immutable; operations return new instances
- **Invariant Checks:** `tiny-invariant` used for contract validation

### Testing Requirements

- Unit tests for all core entities
- Mathematical utility tests with edge cases (MIN_TICK, MAX_TICK, extreme prices)
- Contract parameter encoding validation
- Swap simulation accuracy tests
- Tick crossing and price movement tests

### Code Conventions

**Naming:**
- PascalCase for classes (Pool, Position, Trade, Route)
- camelCase for methods and properties
- UPPER_SNAKE_CASE for constants (FACTORY_ADDRESS, TICK_SPACINGS)
- Descriptive names for boolean predicates (involvesToken, isSorted)

**Structure:**
- Public methods documented with JSDoc comments
- Private implementation details use underscore prefix (_tokenPrice)
- Static methods for factories and utilities
- Classes for immutable value objects

**Exports:**
- All public APIs exported through `src/index.ts`
- No internal modules exposed
- Re-exports from sdk-core for convenience

## Constants and Configuration

### Protocol-Level Constants

**Factory and Pool:**
```typescript
FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
POOL_INIT_CODE_HASH = '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54'
poolInitCodeHash(chainId) // Chain-specific override for zkSync
```

**Fee Tiers (in hundredths of basis points):**
```typescript
FeeAmount.LOWEST = 100      // 0.01%
FeeAmount.LOW_200 = 200     // 0.02%
FeeAmount.LOW_300 = 300     // 0.03%
FeeAmount.LOW_400 = 400     // 0.04%
FeeAmount.LOW = 500         // 0.05%
FeeAmount.MEDIUM = 3000     // 0.3%
FeeAmount.HIGH = 10000      // 1%
```

**Tick Spacings (by fee tier):**
```typescript
TICK_SPACINGS = {
  100: 1,
  200: 4,
  300: 6,
  400: 8,
  500: 10,
  3000: 60,
  10000: 200
}
```

**Tick Boundaries:**
```typescript
TickMath.MIN_TICK = -887272
TickMath.MAX_TICK = 887272
TickMath.MIN_SQRT_RATIO = 4295128739
TickMath.MAX_SQRT_RATIO = '1461446703485210103287273052203988822378723970342'
```

### Internal Math Constants

```typescript
// In internalConstants.ts
ZERO = 0n
NEGATIVE_ONE = -1n
Q64 = 2^64
Q192 = 2^192
```

## Integration with Other SDKs

### Position in SDK Ecosystem

```
                        sdk-core (foundation)
                              ↓
                          v3-sdk (this SDK)
                         ↙           ↘
                    router-sdk    (direct usage)
                         ↓
                  universal-router-sdk
                         ↓
                (permit2-sdk + uniswapx-sdk)
```

### How Other SDKs Use V3

**router-sdk:**
- Aggregates V3 routes with V2 routes for best execution
- Extends V3 Trade with V2-compatible routing
- Creates MixedRoutes that can combine V2 and V3 pools

**universal-router-sdk:**
- Uses V3 SDK for encoding V3 swap paths
- Handles V3-specific parameter encoding
- Batch multiple V3 operations via Multicall

**permit2-sdk:**
- Works alongside V3 for gasless approvals
- Token approval signatures apply to V3 swaps
- No direct dependency; used together

**uniswapx-sdk:**
- Can use V3 routes for order matching
- Integrates V3 pool information for pricing
- Works with permit2-sdk + v3-sdk for full flow

### Shared Types from sdk-core

All of these come from `@uniswap/sdk-core`:
- `Token`: ERC-20 token representation
- `Currency`: Token or native ETH
- `Fraction`, `Price`, `CurrencyAmount`: Math primitives
- `Percent`: Slippage and fee representation
- `TradeType`: EXACT_INPUT or EXACT_OUTPUT enum
- `ChainId`: Ethereum chain enumeration

## Contract Address Resolution

### How Pool Addresses are Computed

V3 pools use CREATE2 for deterministic addresses:

```typescript
keccak256(
  abi.encodePacked(
    FACTORY,
    token0,
    token1,
    fee,
    POOL_INIT_CODE_HASH
  )
)
```

The `computePoolAddress()` utility handles this:

```typescript
const poolAddress = Pool.getAddress(token0, token1, fee)
// or manually
const address = computePoolAddress({
  factoryAddress: FACTORY_ADDRESS,
  tokenA: DAI,
  tokenB: USDC,
  fee: FeeAmount.LOW
})
```

### Multi-Chain Deployment

**Standard EVM Chains:**
- Use default `POOL_INIT_CODE_HASH`
- Same factory address across all chains
- Same fee tiers and tick spacings

**zkSync Era:**
- Different `POOL_INIT_CODE_HASH` (different opcodes)
- Call `poolInitCodeHash(ChainId.ZKSYNC)` for correct hash
- Otherwise identical behavior

**Custom Chains:**
- Override constants via function parameters
- `Pool.getAddress(..., initCodeHashManualOverride)`
- `computePoolAddress(..., initCodeHashManualOverride)`

## Troubleshooting Common Issues

### "TICK_ORDER" Invariant Error

**Cause:** tickLower >= tickUpper
**Solution:**
```typescript
invariant(tickLower < tickUpper, 'TICK_ORDER')
// Always ensure tickLower < tickUpper
const tickLower = Math.min(tick1, tick2)
const tickUpper = Math.max(tick1, tick2)
```

### "PRICE_BOUNDS" Invariant Error

**Cause:** sqrtRatioX96 not between current and next tick
**Solution:**
- Pool state is stale; re-fetch sqrtRatioX96 and tickCurrent
- Verify tick data came from same block
- Use latest pool state before creating positions

### Tick Not Multiple of Tick Spacing

**Cause:** Using invalid tick for pool's fee tier
**Solution:**
```typescript
import { nearestUsableTick } from '@uniswap/v3-sdk'

// Always round ticks to valid spacing
const tickLower = nearestUsableTick(inputTick, pool.tickSpacing)
```

### Insufficient Liquidity for Swap

**Cause:** Swap size larger than available liquidity in the route
**Solution:**
- Check pool liquidity before swap
- Use smaller amount or different route
- Ensure tick data provider has accurate tick information
- Multi-hop routes may have better liquidity

### Wrong Token Amounts

**Cause:** Incorrect decimal places or rounding
**Solution:**
```typescript
// Always use explicit decimals
const amount = CurrencyAmount.fromRawAmount(token, '1000000000000000000')

// Or use toExact() for clean conversion
const normalized = currencyAmount.toExact()
```

## Performance Considerations

### Computational Costs

**Swap Simulation:**
- Linear with number of ticks crossed (more ticks = slower)
- Best trades finding explores multiple routes (can be slow)
- Cache pool state when possible

**Best Route Finding:**
```typescript
// This is O(n^k) where n=pools, k=maxHops
const bestTrades = await Trade.bestTradeExactIn(
  pools,  // Large array?
  amount,
  output,
  { maxHops: 3 }  // Reduces search space
)
```

### Gas Optimization

**On-Chain Costs:**
- Position minting: ~100k gas (create position NFT)
- Swap: ~150k gas (single-hop), +50k per additional hop
- Swap with permit: +50k for signature verification
- Use `useFullPrecision: false` to save on computation (less accurate)

### Memory and Caching

- Pool instances are reusable (immutable)
- Cache computed prices and swap amounts
- Tick data providers can be expensive; cache tick lists

## Additional Resources

**Official Documentation:**
- Main Site: https://docs.uniswap.org/
- V3 Protocol Docs: https://docs.uniswap.org/protocol/v3
- SDK Docs: https://docs.uniswap.org/sdk

**Source Code:**
- V3 Core: https://github.com/Uniswap/v3-core
- V3 Periphery: https://github.com/Uniswap/v3-periphery
- V3 Examples: https://github.com/Uniswap/examples
- This SDK: `sdks/v3-sdk/` in https://github.com/Uniswap/sdks

**Research:**
- V3 Whitepaper: https://uniswap.org/whitepaper-v3.pdf
- Concentrated Liquidity Explained: https://docs.uniswap.org/protocol/concepts/V3-overview/concentrated-liquidity

**Community Support:**
- Discord: #dev-chat channel at https://discord.gg/uniswap
- GitHub Issues: https://github.com/Uniswap/sdks/issues
- Forum: https://gov.uniswap.org/

## Package Statistics

- **Total Source Files:** 65 (45 implementation, 20 test files)
- **Entities:** 6 classes (Pool, Position, Trade, Route, Tick, TickDataProvider)
- **Contract Interfaces:** 7 static classes (NonfungiblePositionManager, SwapRouter, Quoter, Staker, SelfPermit, Multicall, Payments)
- **Utility Modules:** 23 files with mathematical functions
- **Test Coverage:** Comprehensive coverage of entities, math, and encodings
- **Build Output:** CJS, ESM, and TypeScript declarations
- **Bundle Size:** ~200KB minified (varies with tree-shaking)

<!-- CUSTOM:START -->
<!-- User additions preserved during updates -->
<!-- CUSTOM:END -->
