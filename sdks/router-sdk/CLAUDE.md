> **Last Updated:** 2025-11-19

# CLAUDE.md - @uniswap/router-sdk

## Overview

The router-sdk is the unified routing layer for Uniswap V2, V3, and V4 protocols. It provides abstractions and utilities for:

- **Multi-protocol routing**: Route trades across V2 (constant product), V3 (concentrated liquidity), and V4 (hooks-enabled) pools
- **Mixed routes**: Construct single execution paths that span multiple protocols (e.g., V2 → V3 → V4)
- **Calldata generation**: Produce encoded transaction parameters for the SwapRouter02 contract
- **Swap execution**: Handle exact input, exact output, and swap-and-add liquidity scenarios
- **Protocol abstraction**: Consistent interface across all Uniswap protocol versions

The router-sdk is the interface between routing algorithms (which find optimal paths) and contract execution (which encodes and sends transactions).

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│ Routing Application (e.g., SOR, dApp, Trading Bot)          │
│ Provides: routes, trades, amounts                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┴──────────────┐
         │                            │
   ┌─────▼─────┐        ┌────────────▼────────┐
   │ router-sdk│        │ Aggregated Trade   │
   │           │        │ (Trade class)       │
   │ Entities: │        │ - swaps[]           │
   │ - Trade   │        │ - tradeType         │
   │ - Route   │        │ - protocol enum     │
   │ - Protocol│        └────────────┬────────┘
   └──────┬────┘                     │
          │                          │
   ┌──────▼──────────────────────────▼────────┐
   │ SwapRouter (static methods)               │
   │ - swapCallParameters()                    │
   │ - swapAndAddCallParameters()              │
   │                                           │
   │ Internal encoding pipeline:               │
   │ 1. encodeSwaps() - protocol-specific      │
   │ 2. encodeV2Swap() / encodeV3Swap() /      │
   │    encodeMixedRouteSwap()                 │
   │ 3. PaymentsExtended - fund handling       │
   │ 4. MulticallExtended - transaction batch  │
   └──────┬───────────────────────────────────┘
          │
   ┌──────▼─────────────────────────┐
   │ Contract Calldata (hex string)  │
   │ Ready for ethers.sendTransaction│
   └────────────────────────────────┘
```

### Protocol Abstraction Layer

The SDK wraps protocol-specific routes in a common interface:

```typescript
// Each protocol has a wrapper class that implements IRoute
RouteV2 extends V2RouteSDK implements IRoute<TInput, TOutput, Pair>
RouteV3 extends V3RouteSDK implements IRoute<TInput, TOutput, V3Pool>
RouteV4 extends V4RouteSDK implements IRoute<TInput, TOutput, V4Pool>
MixedRoute extends MixedRouteSDK implements IRoute<TInput, TOutput, Pair|V3Pool|V4Pool>
```

This abstraction allows `SwapRouter.encodeSwaps()` to work uniformly across all protocol types.

### Trade Aggregation

The `Trade` class (distinct from v2-sdk's Trade and v3-sdk's Trade) aggregates multiple swaps:

```typescript
const trade = new Trade({
  v2Routes: [...],  // V2 routes with amounts
  v3Routes: [...],  // V3 routes with amounts
  v4Routes: [...],  // V4 routes with amounts
  mixedRoutes: [...],  // Cross-protocol routes
  tradeType: TradeType.EXACT_INPUT  // or EXACT_OUTPUT
})
```

This allows SOR/routing algorithms to compute multiple simultaneous trades across protocols and pass them as a single execution unit.

### Cross-Protocol Routing

The `MixedRouteSDK` class represents a path that spans multiple protocol versions:

```typescript
// Example: USDC → USDC/ETH V3 pool → ETH → ETH/PEPE V4 pool → PEPE
// Results in: V3 swap followed by V4 swap in single transaction
const mixedRoute = new MixedRouteSDK(
  [v3Pool, v4Pool],  // Two pools of different versions
  usdc,              // Input token
  pepe               // Output token
)
```

Key features:
- **Validates chain consistency**: All pools must be on same chain
- **Handles wrapping/unwrapping**: Manages native ETH ↔ WETH transitions
- **Encodes efficiently**: Different encoding for V4 vs V2/V3 combinations
- **Detects fake pools**: Filters out synthetic V4 ETH-WETH pools used for quoting

## Key Components

### Entities

#### `Protocol` Enum
```typescript
export enum Protocol {
  V2 = 'V2',      // Constant product AMM
  V3 = 'V3',      // Concentrated liquidity
  V4 = 'V4',      // Hooks-enabled pools
  MIXED = 'MIXED' // Cross-protocol route
}
```

Used to identify swap type and determine encoding strategy.

#### `IRoute<TInput, TOutput, TPool>` Interface
Unified interface for routes across all protocols:

```typescript
interface IRoute {
  protocol: Protocol                    // Which protocol version
  pools: TPool[]                        // Array of pools/pairs
  path: Currency[]                      // Token path for UI display
  midPrice: Price<TInput, TOutput>     // Current execution price
  input: TInput                         // Input currency
  output: TOutput                       // Output currency
  pathInput: Currency                   // Wrapped input for contract (handles ETH)
  pathOutput: Currency                  // Wrapped output for contract
}
```

#### `RouteV2`, `RouteV3`, `RouteV4`, `MixedRoute` Classes
Concrete implementations of IRoute that wrap protocol-specific route types and ensure Protocol enum is set correctly.

#### `Trade<TInput, TOutput, TTradeType>` Class
Aggregates multiple swaps (can mix protocols):

```typescript
export class Trade<TInput, TOutput, TTradeType> {
  routes: IRoute[]              // All routes in this trade
  tradeType: TTradeType         // EXACT_INPUT or EXACT_OUTPUT
  swaps: [{                     // Individual swap execution units
    route: IRoute
    inputAmount: CurrencyAmount
    outputAmount: CurrencyAmount
  }]
}
```

**Key methods**:
- `executionPrice`: Best price available from combined swaps
- `priceImpact`: Total slippage across all swaps
- `inputAmount`: Total amount to spend
- `outputAmount`: Total amount received
- `minimumAmountOut(slippageTolerance)`: After slippage

#### `MixedRouteTrade<TInput, TOutput, TTradeType>` Class
Specialized Trade for single mixed-protocol routes. Has same methods as Trade but for a single MixedRoute.

### Core Services

#### `SwapRouter` (Static Class)
Main API for generating contract calldata. All methods are static; class cannot be instantiated.

**Public Methods**:

```typescript
static swapCallParameters(
  trades: Trade | V2Trade | V3Trade | MixedRouteTrade | (V2Trade | V3Trade | MixedRouteTrade)[],
  options: SwapOptions
): MethodParameters {
  // Returns: { calldata: string, value: string }
  // calldata: Encoded multicall for SwapRouter02 contract
  // value: ETH value to send (if input is native)
}
```

Supports swapping with any combination of protocols. Core logic:
1. Normalizes input trades to array
2. Encodes each trade using protocol-specific encoder
3. Handles wrapping/unwrapping of ETH
4. Batches calls via MulticallExtended
5. Calculates total value if swapping ETH

```typescript
static swapAndAddCallParameters(
  trades: AnyTradeType,
  options: SwapAndAddOptions,
  position: Position,              // V3 position to add liquidity to
  addLiquidityOptions: CondensedAddLiquidityOptions,
  tokenInApprovalType: ApprovalTypes,
  tokenOutApprovalType: ApprovalTypes
): MethodParameters
```

Combines swap + liquidity provision. Steps:
1. Execute swap on one/both tokens
2. Pull additional tokens if swap output insufficient
3. Approve tokens to NonfungiblePositionManager
4. Mint liquidity position
5. Sweep remaining tokens

**Private Encoding Methods** (protocol-specific):

- `encodeV2Swap()`: Encodes to V2 swapExactTokensForTokens or swapTokensForExactTokens
- `encodeV3Swap()`: Encodes to V3 exactInputSingle, exactOutputSingle, exactInput, or exactOutput
- `encodeMixedRouteSwap()`: Partitions mixed route by protocol and encodes each section

**Constants**:
- `SwapRouter.INTERFACE`: Ethers.js Interface for ISwapRouter02.json ABI

#### `PaymentsExtended` (Static Class)
Encodes extended payment operations like fee collection and token sweeping.

```typescript
static encodeUnwrapWETH9(
  amountMinimum: JSBI,
  recipient?: string,
  feeOptions?: FeeOptions
): string

static encodeSweepToken(
  token: Token,
  amountMinimum: JSBI,
  recipient?: string,
  feeOptions?: FeeOptions
): string

static encodePull(token: Token, amount: JSBI): string

static encodeWrapETH(amount: JSBI): string
```

Extends V3-sdk's Payments to support fee collection (e.g., protocol fees, referrer fees).

#### `MulticallExtended` (Static Class)
Batches multiple encoded functions into single transaction with deadline or blockhash validation.

```typescript
static encodeMulticall(
  calldatas: string | string[],
  validation?: Validation // deadline (number) or previousBlockhash (string)
): string
```

Two modes:
- **With deadline**: `multicall(uint256 deadline, bytes[] calls)` - reverts if block.timestamp > deadline
- **With blockhash**: `multicall(bytes32 previousBlockhash, bytes[] calls)` - reverts if previousBlockhash not found in last 256 blocks
- **No validation**: Falls back to regular multicall (no reversion guarantee)

#### `ApproveAndCall` (Static Class)
Encodes permit signatures and approvals for liquidity provision.

```typescript
static encodeApprove(token: Token, approvalType: ApprovalTypes): string

static encodeAddLiquidity(
  position: Position,
  minimalPosition: Position,  // With slippage applied
  addLiquidityOptions: CondensedAddLiquidityOptions,
  slippageTolerance: Percent
): string
```

Used by `swapAndAddCallParameters` to prepare position minting.

### Utilities

#### `encodeMixedRouteToPath(route, useMixedRouterQuoteV2?): string`
Converts a MixedRoute to encoded bytes path for on-chain quoters or routers.

**Path Format for V4 routes**:
```
address (input token)
[For each pool]:
  - V3: uint24 (fee + placeholder) + address (output)
  - V2: uint8 (fee placeholder) + address (output)
  - V4: uint24 (fee + placeholder) + uint24 (tickSpacing) + address (hooks) + address (output)
  - Wrap/Unwrap: uint8 (0) + address (wrapped token)
```

Used by quoters to fetch prices for mixed routes on-chain.

#### `getPathCurrency(currency, pool): Token`
Determines which token from a pool corresponds to a currency (handles native ETH → WETH unwrapping).

#### `partitionMixedRouteByProtocol(route): TPool[][]`
Splits a mixed route into contiguous sections by protocol (consecutive V3 pools, then V2, then V4, etc.).

Used by `encodeMixedRouteSwap` to encode each section optimally.

#### `getOutputOfPools(pools, inputToken): Token`
Given a sequence of pools and input token, calculates the output token at the end.

#### `TPool` Type
Union type for pool abstraction:
```typescript
type TPool = Pair | Pool (V3) | Pool (V4)
```

## Dependencies

### Direct Dependencies
- `@uniswap/sdk-core`: Core types (Currency, Token, CurrencyAmount, Percent, TradeType, Price)
- `@uniswap/v2-sdk`: V2 protocol types and Route/Trade classes
- `@uniswap/v3-sdk`: V3 protocol types, encoding utilities (encodeRouteToPath), payment methods
- `@uniswap/v4-sdk`: V4 protocol types, Pool class, hook utilities
- `@uniswap/swap-router-contracts`: ABIs for SwapRouter02 and payment interfaces
- `@ethersproject/abi`: Interface class for encoding/decoding
- `@ethersproject/solidity`: pack() function for encoding mixed routes
- `jsbi`: Arbitrary precision integer math
- `tiny-invariant`: Runtime assertion library

### Dependency Graph Within SDK
```
index.ts (main entry point)
├── swapRouter.ts (core API)
│   ├── entities/trade.ts
│   ├── entities/route.ts
│   ├── entities/protocol.ts
│   ├── entities/mixedRoute/
│   ├── constants.ts
│   ├── approveAndCall.ts
│   ├── multicallExtended.ts
│   ├── paymentsExtended.ts
│   └── utils/
├── entities/ (types)
├── utils/ (encoding/validation)
└── constants.ts (contract addresses, magic numbers)
```

No circular dependencies. Utils are pure functions. Entities are data structures. SwapRouter orchestrates everything.

## API Reference

### Main Export: SwapRouter

**Typical Usage Pattern**:

```typescript
import { SwapRouter } from '@uniswap/router-sdk'
import { Trade, RouteV3 } from '@uniswap/router-sdk'

// Construct routes (typically from routing algorithm)
const route = new RouteV3([pool1, pool2], tokenIn, tokenOut)
const trade = new Trade({
  v3Routes: [{
    routev3: route,
    inputAmount: CurrencyAmount.fromRawAmount(tokenIn, '1000000'),
    outputAmount: CurrencyAmount.fromRawAmount(tokenOut, '5000000')
  }],
  tradeType: TradeType.EXACT_INPUT
})

// Generate calldata
const { calldata, value } = SwapRouter.swapCallParameters(trade, {
  slippageTolerance: new Percent(50, 10000),  // 0.5%
  recipient: userAddress,
  deadline: Math.floor(Date.now() / 1000) + 1800  // 30 min
})

// Send transaction
const tx = await signer.sendTransaction({
  to: SWAP_ROUTER_ADDRESS[chainId],
  data: calldata,
  value: value
})
```

### Supported Trade Types

1. **Single Protocol Trades**:
   ```typescript
   // V2 only
   new Trade({ v2Routes: [...], tradeType })

   // V3 only
   new Trade({ v3Routes: [...], tradeType })

   // V4 only
   new Trade({ v4Routes: [...], tradeType })
   ```

2. **Multi-Route Same Protocol**:
   ```typescript
   // Multiple V3 swaps (SOR split)
   new Trade({
     v3Routes: [
       { routev3: route1, inputAmount: amt1, outputAmount: out1 },
       { routev3: route2, inputAmount: amt2, outputAmount: out2 }
     ],
     tradeType: TradeType.EXACT_INPUT
   })
   ```

3. **Mixed Protocol Trades**:
   ```typescript
   // Combination of V2, V3, V4, and mixed routes
   new Trade({
     v2Routes: [...],
     v3Routes: [...],
     v4Routes: [...],
     mixedRoutes: [...],
     tradeType: TradeType.EXACT_INPUT
   })
   ```

### Trade Execution Scenarios

#### Scenario 1: Simple Single Hop V3 Swap
```typescript
// USDC → USETH (0.3% pool, single hop)
const route = new RouteV3([pool], usdc, useth)
const trade = V3Trade.fromRoute(route, inputAmount, TradeType.EXACT_INPUT)

const { calldata, value } = SwapRouter.swapCallParameters(trade, {
  slippageTolerance: new Percent(50, 10000),
  recipient,
  deadline
})
// Generates: exactInputSingle() call to SwapRouter02
```

#### Scenario 2: Multi-Hop V3 Swap with ETH Output
```typescript
// DAI → USDC → WETH → ETH
const route = new RouteV3([pool1, pool2, pool3], dai, ether)
const trade = V3Trade.fromRoute(route, inputAmount, TradeType.EXACT_INPUT)

const { calldata, value } = SwapRouter.swapCallParameters(trade, {
  slippageTolerance: new Percent(50, 10000),
  recipient,
  deadline
})
// Generates: exactInput() call + unwrapWETH9() call
// Two calls batched via multicall
```

#### Scenario 3: Mixed V2/V3 Route
```typescript
// DAI → USDC (V2) → USETH (V3) → ETH
// Cross-protocol path
const route = new MixedRouteSDK([v2Pool, v3Pool, v3Pool], dai, ether)
const trade = MixedRouteTrade.createUncheckedTrade({
  route: new MixedRoute(route),
  inputAmount,
  outputAmount,
  tradeType: TradeType.EXACT_INPUT
})

const { calldata, value } = SwapRouter.swapCallParameters(trade, {
  slippageTolerance: new Percent(50, 10000),
  recipient,
  deadline
})
// Generates: exactInput() call with encoded mixed route path
```

#### Scenario 4: Swap and Add Liquidity
```typescript
// Swap USDC → USETH, then add to V3 position
const swapTrade = V3Trade.fromRoute(
  new RouteV3([pool], usdc, useth),
  inputAmount,
  TradeType.EXACT_INPUT
)
const position = new Position({
  pool: usdcUsethPool,
  tickLower: -1000,
  tickUpper: 1000,
  amount0: amount0Desired,  // USDC
  amount1: amount1Desired   // USETH
})

const { calldata, value } = SwapRouter.swapAndAddCallParameters(
  swapTrade,
  { slippageTolerance, recipient, deadline },
  position,
  {
    slippageTolerance,
    recipient,
    deadline,
    createPool: false  // Pool already exists
  },
  ApprovalTypes.NOT_REQUIRED,  // Tokens being pulled, not approved
  ApprovalTypes.MAX            // Approve for add
)
// Generates multi-step calldata:
// 1. Wrap/pull USDC
// 2. Swap USDC → USETH
// 3. Pull additional USETH if needed
// 4. Approve tokens
// 5. addLiquidityManaged() call
// 6. Sweep remaining tokens
```

#### Scenario 5: Multi-Trade Exact Output
```typescript
// Two simultaneous V3 swaps, both exact output
const trade = new Trade({
  v3Routes: [
    {
      routev3: route1,
      inputAmount: inputAmount1,
      outputAmount: exactOutputAmount
    },
    {
      routev3: route2,
      inputAmount: inputAmount2,
      outputAmount: exactOutputAmount
    }
  ],
  tradeType: TradeType.EXACT_OUTPUT
})

// With ETH input (exact output)
const { calldata, value } = SwapRouter.swapCallParameters(trade, {
  slippageTolerance: new Percent(50, 10000),
  recipient,
  deadline  // Critical: ensures full ETH refund on partial fill
})
// Generates: exactOutput() calls for both routes + refundETH()
// Because uncertain ETH input amount, must refund excess
```

## Implementation Patterns

### Pattern 1: Swap Encoding Pipeline

The `SwapRouter.encodeSwaps()` method orchestrates encoding:

```typescript
private static encodeSwaps(
  trades: AnyTradeType,
  options: SwapOptions,
  isSwapAndAdd?: boolean
): {
  calldatas: string[]
  sampleTrade
  routerMustCustody: boolean
  inputIsNative: boolean
  outputIsNative: boolean
  totalAmountIn: CurrencyAmount
  minimumAmountOut: CurrencyAmount
  quoteAmountOut: CurrencyAmount
}
```

Steps:
1. **Normalize**: Convert router-sdk Trade to individual protocol trades
2. **Validate**: Check all trades share same input/output/type
3. **Determine custody**: Does router need to hold funds? (ETH unwrap, fee taking, swap+add, aggregated slippage)
4. **Encode permits**: Optional EIP-2612 permit for token allowance
5. **Encode swaps**: Protocol-specific encoding (V2/V3/Mixed)
6. **Unwrap/Sweep**: If router held funds, generate unwrap or sweep calls
7. **Refund ETH**: If input is ETH and risk of partial fill, add refundETH call
8. **Batch**: Combine all calldatas via MulticallExtended

### Pattern 2: Protocol Detection

The SDK detects pools automatically:

```typescript
if (trade instanceof V2Trade) {
  // Use encodeV2Swap()
} else if (trade instanceof V3Trade) {
  // Use encodeV3Swap()
} else if (trade instanceof MixedRouteTrade) {
  // Use encodeMixedRouteSwap()
}
```

Also validates at route level:
```typescript
route.protocol === Protocol.V2   // V2 route
route.protocol === Protocol.V3   // V3 route
route.protocol === Protocol.MIXED  // Cross-protocol
```

### Pattern 3: Aggregated Slippage Check

When executing multiple exact-input swaps (SOR output), the SDK can optimize:

```typescript
const performAggregatedSlippageCheck =
  tradeType === TradeType.EXACT_INPUT && numberOfTrades > 2
```

**Without aggregation** (default):
- Each swap checks its own slippage
- If any swap reverts, entire tx reverts
- More gas expensive (multiple slippage checks)

**With aggregation** (2+ exact input trades):
- Individual swaps set `amountOutMinimum = 0`
- Total slippage checked at end via sweep
- Lower probability of unnecessary reverts
- Slightly more gas efficient

### Pattern 4: ETH Handling

ETH inputs/outputs require special handling since ERC20 pools use WETH:

**For ETH input**:
1. User sends ETH with tx
2. Router wraps to WETH internally (via wrapETH call)
3. Swap proceeds with WETH
4. If ETH output desired, unwrap at end

**For ETH output**:
1. User wants to receive ETH
2. Swap produces WETH
3. Router unwraps WETH → ETH
4. Sends ETH to recipient

**Special case - Exact output with ETH input**:
- Input amount uncertain (depends on prices)
- Must send full ETH amount and refund excess
- Router calls refundETH() to return unused ETH

### Pattern 5: Fee Collection

The SDK supports fee-on-output collection:

```typescript
const { calldata, value } = SwapRouter.swapCallParameters(trade, {
  slippageTolerance,
  recipient: userAddress,
  fee: {
    fee: new Percent(25, 10000),  // 0.25% fee
    recipient: feeCollectorAddress
  }
})
```

Fee collection requires router to hold funds:
```typescript
routerMustCustody = outputIsNative || !!options.fee || ...
```

When enabled:
1. Swap sends output to router (not recipient)
2. Router takes fee from output
3. Remaining output sent to recipient

## Testing Patterns

The SDK includes comprehensive test coverage (129KB swapRouter.test.ts):

**Test Structure**:
- **Unit tests**: Individual encoding functions
- **Integration tests**: Full trade scenarios
- **Edge cases**: ETH handling, multiple trades, mixed protocols

**Mock Data**:
- Predefined pools with known prices
- Test tokens (DAI, USDC, USETH, PEPE)
- Test addresses and signers

**Test Scenarios Covered**:
1. Single protocol swaps (V2, V3, V4)
2. Multi-hop routes
3. Mixed protocol routes
4. Swap + add liquidity
5. ETH wrapping/unwrapping
6. Fee collection
7. Permit signatures
8. Multiple simultaneous trades
9. Slippage tolerance validation
10. Deadline validation

## Key Algorithms

### Mixed Route Partitioning

When encoding a mixed route (V2 → V3 → V4 → V2), the SDK partitions by protocol:

```typescript
// Route: [V3Pool, V3Pool, V2Pool, V4Pool]
// Partitions into: [[V3Pool, V3Pool], [V2Pool], [V4Pool]]
// Each partition encoded separately, outputs chained together
```

**Why**: Different protocols have different encoding, different amounts flowing between sections, amount = 0 for intermediate sections.

### Currency Path Resolution

Mixed routes must handle ETH ↔ WETH wrapping transparently:

```typescript
// Input path might be: [ETH, WETH, DAI, USDC]
// But contract pools need: [WETH, WETH, DAI, USDC]
// Router automatically wraps/unwraps at boundaries
```

**Algorithm**:
1. Start with `pathInput` (wrapped version of input)
2. For each pool, determine output token
3. If output is ETH but next pool has WETH, use WETH internally
4. End with `pathOutput` (wrapped version of output)

### Exact Output Calculation

For exact output trades, work backwards:

```typescript
// Want exactly 1000 USDC
// From: USETH → WETH → USDC (3 pools)
// Calculate amounts needed at each step backwards:
// 1000 USDC ← quoteAmountOut from WETH pool
// quoteAmountOut WETH ← quoteAmountOut from WETH pool
// Calculate required USETH input by reverse calculation
```

Handled by protocol SDKs (v2-sdk, v3-sdk, v4-sdk). router-sdk just arranges the data.

## Common Integration Points

### With universal-router-sdk
Universal Router wraps router-sdk but adds command encoding and batching:
- router-sdk produces individual swaps
- universal-router-sdk groups them with permit, wrap, unwrap commands
- Single multicall instead of multiple

### With SOR (Swap Optimization Route)
SOR finds best routes, router-sdk encodes them:
1. SOR: "Best path: V3 pool A + V3 pool B (50/50 split)"
2. router-sdk: Receives two V3Trades, creates Trade, generates calldata
3. On-chain: SwapRouter02 executes multicall

### With uniswapx-sdk
For off-chain orders that fill via router-sdk:
1. uniswapx-sdk: Validates order signature
2. router-sdk: Encodes the fill swap
3. On-chain: Filler's swap executes via SwapRouter02

### With permit2-sdk
For signature-based approvals:
1. permit2-sdk: Generates permit signature
2. router-sdk: Includes permit in calldata (via SwapRouter.encodePermits)
3. On-chain: permit2 validates signature, router-sdk proceeds with swap

## Performance Considerations

### Gas Optimization

1. **Aggregated slippage**: Saves ~5k gas per additional swap
2. **Mixed encoding**: V4 encoding is 2x larger than V3 due to hooks/tickSpacing
3. **Exact input vs output**: Exact output (backwards calc) slightly more expensive
4. **Refund ETH**: Needed for exact output with ETH input (saves gas vs separate unwrap)

### Calculation Complexity

- **Single hop**: O(1)
- **Multi-hop route**: O(pools in route)
- **Multiple routes**: O(sum of all pools)
- **Mixed routes**: Same complexity, slightly higher coefficient (protocol detection)

## Development Guidelines

### Adding Support for New Protocol Version

If Uniswap V5 is released, you would:

1. Create `RouteV5` wrapper implementing `IRoute`
2. Set `protocol = Protocol.V5`
3. Add `encodeV5Swap()` to SwapRouter
4. Update type unions:
   ```typescript
   type AnyTradeType = Trade | V2Trade | V3Trade | V4Trade | V5Trade
   type IRoute = ... | V5Pool
   ```
5. Update `encodeSwaps()` dispatch logic
6. Add tests for V5 encoding

### Modifying Encoding

When changing swap encoding (e.g., adding new V3 pool fee):

1. Update encoding function (e.g., `encodeV3Swap()`)
2. Update test fixtures
3. Test against live pool data if possible
4. Verify calldata matches contract expectations

### Adding New Fee Options

To support new fee structures:

1. Extend `FeeOptions` interface
2. Update `PaymentsExtended` encoding
3. Add `routerMustCustody` condition
4. Test fee collection scenarios

## File Structure

```
router-sdk/src/
├── index.ts                    # Main exports
├── constants.ts                # Magic numbers, placeholders
├── swapRouter.ts               # SwapRouter static class (main API)
├── approveAndCall.ts           # Liquidity provision encoding
├── multicallExtended.ts        # Batch call encoding with validation
├── paymentsExtended.ts         # ETH/token payment encoding
│
├── entities/
│   ├── protocol.ts             # Protocol enum
│   ├── trade.ts                # Aggregated Trade class
│   ├── route.ts                # Route wrappers (V2/V3/V4)
│   │
│   └── mixedRoute/
│       ├── route.ts            # MixedRouteSDK for cross-protocol
│       └── trade.ts            # MixedRouteTrade class
│
└── utils/
    ├── index.ts                # Utility exports
    ├── encodeMixedRouteToPath.ts  # Path encoding for mixed routes
    ├── pathCurrency.ts         # Currency resolution in paths
    ├── TPool.ts                # Pool type union
    └── *.test.ts               # Test files
```

## Conventions and Patterns

### Naming Conventions

- **Classes**: PascalCase (Trade, SwapRouter, RouteV3)
- **Enum values**: UPPER_SNAKE_CASE (Protocol.V2, Protocol.MIXED)
- **Functions**: camelCase (encodeMixedRouteToPath, getPathToken)
- **Internal prefixes**: `_` for private properties (\_outputAmount)
- **Test files**: `*.test.ts` co-located with source

### Type Safety

- **Generic parameters**: `<TInput, TOutput, TTradeType>` for type-safe routes/trades
- **Union types**: `TPool = Pair | Pool (V3) | Pool (V4)` for protocol abstraction
- **Strict mode**: All TypeScript files in strict mode, no implicit any

### Error Handling

- **Invariants**: `invariant(condition, message)` for contract violations
  ```typescript
  invariant(pools.length > 0, 'POOLS')
  invariant(allOnSameChain, 'CHAIN_IDS')
  ```
- **Validation**: Functions validate before processing
- **Throws**: Descriptive error messages with context

### Code Organization

- **Single Responsibility**: Each file handles one concept (trade, encoding, validation)
- **No Circular Dependencies**: Entities depend on utils, SwapRouter orchestrates
- **Pure Functions**: Utils are stateless; no side effects
- **Static Classes**: SwapRouter and PaymentsExtended are never instantiated

<!-- CUSTOM:START -->
<!-- User additions preserved during updates -->
<!-- CUSTOM:END -->
