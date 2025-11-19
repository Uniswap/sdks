> **Last Updated:** 2025-11-19

# CLAUDE.md - Universal Router SDK

The Universal Router SDK provides a unified TypeScript interface for executing swaps and liquidity operations across all Uniswap protocol versions (V2, V3, and V4) through the Universal Router smart contract. It abstracts protocol-specific complexities into a command-based architecture, enabling sophisticated multi-protocol transactions with a single, composable interface.

**Key Value Proposition**: One SDK to rule all Uniswap trading - handles cross-protocol routing, gasless approvals via Permit2, native ETH support, and advanced operations like V3-to-V4 position migrations.

## Package Overview

- **Name**: `@uniswap/universal-router-sdk`
- **Version**: Semantic versioning via semantic-release-monorepo
- **Entry Point**: `src/index.ts` → exports SwapRouter, RoutePlanner, CommandParser, and utility functions
- **Source Files**: 15 TypeScript files in src/, 10 test files (Hardhat + Forge)
- **Total Lines**: ~25 source files (25 tracked), comprehensive test coverage
- **License**: MIT
- **Supported Node**: 14+ (compatible with v14, v16, v18+)

## Architecture

### Command-Based Design Pattern

The Universal Router executes operations as a sequence of discrete, versioned commands. The SDK encodes high-level operations (like "swap on V3") into this command format:

```
User Intent (Swap 1000 USDC for ETH)
    ↓
RouterTrade object (output from @uniswap/router-sdk)
    ↓
SwapRouter.swapCallParameters()
    ↓
RoutePlanner builds sequence:
  [0] WRAP_ETH
  [1] V3_SWAP_EXACT_IN
  [2] UNWRAP_WETH
    ↓
Command bytecode + encoded parameters
    ↓
Universal Router contract executes commands in sequence
    ↓
Transaction result
```

### Core Design Principles

1. **Composability**: Commands chain together atomically on-chain
2. **Protocol Abstraction**: Same interface for V2, V3, V4, and mixed-protocol swaps
3. **Batch Efficiency**: Multiple operations execute in single transaction
4. **Type Safety**: Full TypeScript support with ethers v5 integration
5. **Extensibility**: Command pattern enables adding new operations without changing core router

### Directory Structure

```
src/
├── index.ts                          # Main entry point, re-exports all public APIs
│
├── swapRouter.ts                     # SwapRouter abstract class
│   ├── Static method: swapCallParameters()
│   ├── Static method: migrateV3ToV4CallParameters()
│   └── Helper: encodePlan() - internal method for command serialization
│
├── entities/
│   ├── Command.ts                    # Command interface definition
│   │   ├── interface Command { tradeType, encode() }
│   │   ├── enum RouterActionType { UniswapTrade, UnwrapWETH }
│   │   └── type TradeConfig { allowRevert }
│   │
│   ├── actions/
│   │   ├── index.ts                  # Re-exports UniswapTrade, UnwrapWETH
│   │   ├── uniswap.ts                # UniswapTrade class (main swap encoder)
│   │   │   └── Implements: Command interface
│   │   │       Properties: trade, options, payerIsUser, isAllV4
│   │   │       Methods: encode(), various swap type handlers
│   │   │
│   │   └── unwrapWETH.ts             # UnwrapWETH command (WETH → ETH)
│   │
│   └── index.ts                      # Re-exports Command, actions
│
└── utils/
    ├── routerCommands.ts             # RoutePlanner class, CommandType enum
    │   ├── enum CommandType (0x00-0x21)
    │   ├── class RoutePlanner (builder for command sequences)
    │   ├── type CommandDefinition (ABI parsing metadata)
    │   ├── const COMMAND_DEFINITION (20 command type definitions)
    │   ├── enum Parser { Abi, V4Actions, V3Actions }
    │   └── enum Subparser (V3 path parsing variants)
    │
    ├── commandParser.ts              # Parse Universal Router calldata
    │   ├── class CommandParser (static parser)
    │   ├── class GenericCommandParser (parameterized parser)
    │   └── Helper functions: parseV3PathExactIn(), parseV3PathExactOut()
    │
    ├── constants.ts                  # Chain configurations, deployment addresses
    │   ├── enum UniversalRouterVersion { V1_2, V2_0 }
    │   ├── type ChainConfig (WETH address, router configs per version)
    │   ├── const CHAIN_CONFIGS (22 chains configured)
    │   ├── Helper: UNIVERSAL_ROUTER_ADDRESS(), WETH_ADDRESS()
    │   └── Special addresses: SENDER_AS_RECIPIENT, ROUTER_AS_RECIPIENT, CONTRACT_BALANCE
    │
    ├── inputTokens.ts                # Permit2 signature encoding
    │   ├── interface Permit2Permit (PermitSingle + signature)
    │   ├── function encodePermit() (Add PERMIT2_PERMIT command)
    │   ├── function encodeV3PositionPermit() (V3 NFT permit encoding)
    │   └── function encodeInputTokenOptions() (Batch input token handling)
    │
    ├── routerTradeAdapter.ts         # Convert routing API quotes to RouterTrade
    │   ├── Converts classic quotes to RouterTrade objects
    │   └── Handles native currency and route parsing
    │
    ├── getCurrencyAddress.ts         # Extract addresses from Currency types
    │   └── Handles native vs wrapped tokens
    │
    ├── pathCurrency.ts               # Utilities for path-based currency handling
    │   └── Used in V3/V4 path encoding
    │
    ├── numbers.ts                    # Numeric encoding utilities
    │   └── feeBips encoding for percentage-based fees
    │
    └── index.ts                      # Utility re-exports

test/
├── uniswapTrades.test.ts             # Main Hardhat tests for swap encoding
├── utils/
│   ├── permit2.test.ts               # Permit2 integration tests
│   ├── constants.test.ts             # Address and chain config verification
│   ├── commandParser.test.ts         # Calldata parsing verification
│   ├── permit2.ts                    # Test utility: Permit2 helpers
│   ├── uniswapData.ts                # Test utility: Mock pool data
│   ├── addresses.ts                  # Test utility: Chain address configs
│   └── hexToDecimalString.ts         # Test utility: Number conversions
│
└── forge/
    └── writeInterop.ts               # Generate Forge test data

lib/                                   # Git submodules for contracts
├── universal-router/                 # Universal Router contract source
├── v3-core/                          # V3 pool contracts
├── v2-core/                          # V2 pool contracts
└── openzeppelin/

abis/                                  # Contract ABI directory
```

## Core Dependencies

### Direct Dependencies (package.json)

```typescript
// Protocol SDKs - core trading logic
"@uniswap/router-sdk": "^2.1.0"        // Multi-protocol routing, Trade composition
"@uniswap/sdk-core": "^7.8.0"          // Currency, Token, amounts, fractions, math
"@uniswap/v2-sdk": "^4.16.0"           // V2 pools, trade encoding
"@uniswap/v3-sdk": "^3.26.0"           // V3 pools, concentrated liquidity
"@uniswap/v4-sdk": "^1.22.0"           // V4 pools, hooks, native ETH support

// Gasless approvals
"@uniswap/permit2-sdk": "^1.3.0"       // Signature-based token permissions

// Contract ABI and types
"@uniswap/universal-router": "2.0.0-beta.2"  // UR contract artifact
"@uniswap/v2-core": "^1.0.1"           // V2 contract types
"@uniswap/v3-core": "1.0.0"            // V3 contract types
"@openzeppelin/contracts": "4.7.0"     // ERC20, SafeTransferLib

// Ethereum libraries
"ethers": "^5.7.0"                     // Contract interaction, ABI encoding
"bignumber.js": "^9.0.2"               // Extended numeric operations

// Dev dependencies
"typescript": "^4.3.3"                 // TypeScript compiler
"tsdx": "^0.14.1"                      // Build system (builds CJS + ESM + types)
"hardhat": "^2.25.0"                   // Local Ethereum testing
"ts-node": "^10.9.1"                   // TypeScript execution in Node
```

### Dependency Graph

```
universal-router-sdk
├── @uniswap/router-sdk
│   ├── @uniswap/v2-sdk
│   │   └── @uniswap/sdk-core
│   ├── @uniswap/v3-sdk
│   │   └── @uniswap/sdk-core
│   └── @uniswap/sdk-core (shared foundation)
│
├── @uniswap/v4-sdk
│   └── @uniswap/v3-sdk (extends V3)
│       └── @uniswap/sdk-core
│
├── @uniswap/permit2-sdk
│   └── @uniswap/sdk-core
│
└── ethers (transitive via SDKs)
```

The SDK is built on a layered hierarchy: sdk-core (foundation) → protocol SDKs (V2/V3/V4) → aggregation (router-sdk) → universal-router-sdk.

## Key Modules & APIs

### SwapRouter - Main Entry Point

**File**: `src/swapRouter.ts` (195 lines)

The `SwapRouter` abstract class provides static methods for generating Universal Router calldata. It's the main API surface:

#### Primary Method: `swapCallParameters()`

```typescript
public static swapCallParameters(
  trades: RouterTrade<Currency, Currency, TradeType>,
  options: SwapOptions
): MethodParameters
```

**Parameters**:
- `trades`: `RouterTrade` object from `@uniswap/router-sdk` containing:
  - `v2Routes[]`: V2 pool routes
  - `v3Routes[]`: V3 concentrated liquidity routes
  - `v4Routes[]`: V4 hook-based routes
  - `tradeType`: `TradeType.EXACT_INPUT` or `TradeType.EXACT_OUTPUT`

- `options: SwapOptions` (extends router-sdk options):
  ```typescript
  {
    slippageTolerance: Percent           // e.g., new Percent(50, 10000) for 0.5%
    recipient: string                    // Destination address
    deadlineOrPreviousBlockhash?: number // Tx deadline or block hash
    flatFee?: { amount, recipient }      // Flat fee collection
    fee?: number                         // Percentage fee in bips
    safeMode?: boolean                   // Extra ETH sweep safety check
    useRouterBalance?: boolean           // Reuse tokens in router (aggregator pattern)
    inputTokenPermit?: Permit2Permit     // Gasless approval signature
  }
  ```

**Returns**: `{ calldata: string, value: string }`

**Flow**:
1. Creates `RoutePlanner` to build command sequence
2. Wraps `RouterTrade` in `UniswapTrade` command
3. If native input currency detected, calculates ETH value
4. If Permit2 signature provided, adds PERMIT2_PERMIT command first
5. Encodes trade as command sequence
6. Returns calldata for `execute(bytes commands, bytes[] inputs, uint256 deadline)`

**Invariants Checked**:
- Cannot have both native input AND Permit2 (NATIVE_INPUT_PERMIT)
- Command sequence must not be empty
- Deadline must be reasonable (if provided)

#### Secondary Method: `migrateV3ToV4CallParameters()`

```typescript
public static migrateV3ToV4CallParameters(
  options: MigrateV3ToV4Options,
  positionManagerOverride?: string
): MethodParameters
```

**Purpose**: Atomically removes V3 liquidity and adds equivalent V4 position

**Parameter Validation**:
- V3 and V4 pools must contain same tokens
- V3 liquidity must be 100% (liquidityPercentage.equalTo(new Percent(100, 100)))
- V3 NFT must be burned (burnToken: true)
- Collected tokens must go to V4PositionManager
- V4 operation must be mint (isMint check)
- V4 operation must have migrate flag set

**Flow**:
1. If createPool flag set, initializes V4 pool with current price
2. Encodes V3 position removal (decreaseLiquidity + collect + burn)
3. Encodes V4 position initialization with collected liquidity
4. Returns combined calldata

### UniswapTrade - Swap Command Encoder

**File**: `src/entities/actions/uniswap.ts` (~300 lines)

The `UniswapTrade` class implements the `Command` interface and handles the complex logic of encoding swaps:

```typescript
export class UniswapTrade implements Command {
  readonly tradeType: RouterActionType = RouterActionType.UniswapTrade
  readonly payerIsUser: boolean

  constructor(
    public trade: RouterTrade<Currency, Currency, TradeType>,
    public options: SwapOptions
  )

  // Main encode method called by RoutePlanner
  encode(planner: RoutePlanner, config: TradeConfig): void
}
```

**Key Properties**:
- `trade`: The underlying RouterTrade with routes and amounts
- `options`: Swap configuration (recipient, slippage, fees, etc.)
- `payerIsUser`: Whether user is source of input tokens (vs router balance)
- `inputRequiresWrap`: Detects if native → WETH conversion needed
- `outputRequiresUnwrap`: Detects if WETH → native conversion needed
- `isAllV4`: Optimization flag when all routes use V4 pools

**Protocol-Specific Encoding**:
- **V2 Swaps**: Encodes as V2_SWAP_EXACT_IN or V2_SWAP_EXACT_OUT
- **V3 Swaps**: Encodes as V3_SWAP_EXACT_IN or V3_SWAP_EXACT_OUT with encoded path
- **V4 Swaps**: Uses V4Planner to encode hook-aware pool interactions
- **Mixed Routes**: Partitions routes by protocol and encodes each segment

**Advanced Features**:

1. **Fee-on-Transfer Tokens**: Adjusts output calculations for tokens that charge fees
2. **Percentage Fees** (PAY_PORTION): Collects % of output before sending to user
3. **Flat Fees**: Direct transfer to fee recipient
4. **Slippage Aggregation**: For multi-route trades, aggregates slippage across routes
5. **ETH Handling**: Automatically detects and inserts WRAP_ETH/UNWRAP_WETH as needed
6. **Safe Mode**: Optional extra ETH sweep at end of transaction

**Entry Point Logic**:
- User is payer if: no wrap/unwrap needed AND not using router balance
- Router is payer if: native wrap OR output unwrap OR using router balance
- This determines which commands are added before/after swap

### RoutePlanner - Command Builder

**File**: `src/utils/routerCommands.ts` (~300 lines)

The `RoutePlanner` is a builder class for constructing command sequences:

```typescript
export class RoutePlanner {
  private commands: string[] = []
  private inputs: string[] = []

  addCommand(commandType: CommandType, params: any[]): void
  addSubPlan(subplanner: RoutePlanner, allowRevert: boolean): void

  get commands(): string  // Encoded bytes of all command types
  get inputs(): string[]  // Array of encoded parameter sets
}
```

**CommandType Enum** (17 command types defined):

1. **Swap Commands**:
   - `0x00`: V3_SWAP_EXACT_IN
   - `0x01`: V3_SWAP_EXACT_OUT
   - `0x08`: V2_SWAP_EXACT_IN
   - `0x09`: V2_SWAP_EXACT_OUT
   - `0x10`: V4_SWAP

2. **Token Commands**:
   - `0x04`: SWEEP (recover arbitrary tokens)
   - `0x05`: TRANSFER (send tokens)
   - `0x0b`: WRAP_ETH (ETH → WETH)
   - `0x0c`: UNWRAP_WETH (WETH → ETH)
   - `0x06`: PAY_PORTION (% based fee)

3. **Permit2 Commands**:
   - `0x02`: PERMIT2_TRANSFER_FROM
   - `0x03`: PERMIT2_PERMIT_BATCH
   - `0x0a`: PERMIT2_PERMIT (single permit)
   - `0x0d`: PERMIT2_TRANSFER_FROM_BATCH

4. **Position Manager Commands**:
   - `0x11`: V3_POSITION_MANAGER_PERMIT
   - `0x12`: V3_POSITION_MANAGER_CALL
   - `0x13`: V4_INITIALIZE_POOL
   - `0x14`: V4_POSITION_MANAGER_CALL

5. **Execution Control**:
   - `0x21`: EXECUTE_SUB_PLAN (revertible nested commands)

6. **Validation**:
   - `0x0e`: BALANCE_CHECK_ERC20

**COMMAND_DEFINITION**:
- Maps each CommandType to its parameter schema
- Uses ABI encoder, V3Actions parser, or V4Actions parser
- Enables generic parsing and validation

### CommandParser - Calldata Decoder

**File**: `src/utils/commandParser.ts` (~150 lines)

Reverse-engineers Universal Router calldata into readable command structures:

```typescript
export class CommandParser {
  static parseCalldata(calldata: string): UniversalRouterCall
}

export class GenericCommandParser {
  parse(commands: string, inputs: string[]): UniversalRouterCall
}
```

**Output Structure**:
```typescript
type UniversalRouterCall = {
  commands: UniversalRouterCommand[]  // Array of parsed commands
}

type UniversalRouterCommand = {
  commandName: string          // e.g., "V3_SWAP_EXACT_IN"
  commandType: CommandType     // Numeric command ID
  params: Param[]              // Decoded parameter array
}
```

**Parsing Strategy**:
1. Decodes calldata using Universal Router ABI
2. Extracts `commands` bytes and `inputs` array
3. For each command type, uses appropriate parser:
   - **Parser.Abi**: Standard ABI decoder (Permit2, wrapping, etc.)
   - **Parser.V3Actions**: V3 path parser (fee & token extraction)
   - **Parser.V4Actions**: V4 actions parser (using V4SDK parser)

**Use Cases**:
- Transaction debugging and visualization
- UI display of pending transactions
- Analytics and monitoring
- Integration testing

### Constants - Chain Configurations

**File**: `src/utils/constants.ts` (~400 lines)

Centralized deployment addresses and chain configurations:

```typescript
enum UniversalRouterVersion {
  V1_2 = '1.2',  // Original version
  V2_0 = '2.0'   // Latest with V4 support
}

const CHAIN_CONFIGS: { [chainId: number]: ChainConfig }

// 22 chains configured:
1       // Ethereum Mainnet
5       // Goerli testnet
11155111 // Sepolia testnet
137     // Polygon
10      // Optimism
42161   // Arbitrum
8453    // Base
56      // BSC (Binance Smart Chain)
43114   // Avalanche
42220   // Celo
81457   // Blast
7777777 // Zora
324     // ZKSync (ZKSync ERA)
480     // Worldchain
1301    // ZKSync Sepolia
130     // Unichain mainnet
10143   // Unichain sepolia
84532   // Base sepolia
1868    // ZKSync Custom
143     // Monad mainnet
(+ more test networks)
```

**For Each Chain**:
- WETH address (native wrapper token)
- Router configs per version:
  - V1.2 address and creation block
  - V2.0 address and creation block
- Creation blocks used for event filtering and efficiency

**Helper Functions**:
- `UNIVERSAL_ROUTER_ADDRESS(version, chainId)`: Get router address
- `UNIVERSAL_ROUTER_CREATION_BLOCK(version, chainId)`: Get creation block
- `WETH_ADDRESS(chainId)`: Get wrapped native token
- Special address constants for command encoding

## Command Types & Encoding

### Encoding Architecture

Each command has two parts:
1. **Command Type** (uint8, 1 byte): Operation ID from CommandType enum
2. **Encoded Parameters** (bytes): Parameters encoded per command's definition

Example V3 swap:
```
Command type: 0x00 (V3_SWAP_EXACT_IN)
Parameters: [recipient, amountIn, amountOutMin, encodedPath, payerIsUser]
         → ABI encoded as (address,uint256,uint256,bytes,bool)
```

### Special Encoding Cases

**V3/V4 Paths**: Encoded as concatenated bytes:
```
token0[20] || fee[3] || token1[20] || fee[3] || ... || tokenN[20]
```

**Permit2 Permits**: Structured data:
```typescript
{
  details: {
    token: address,
    amount: uint160,
    expiration: uint48,
    nonce: uint48
  },
  spender: address,
  sigDeadline: uint256,
  signature: bytes // 65 bytes ECDSA or compact (64 bytes)
}
```

**V4 Actions**: Uses V4SDK's V4Planner internally:
- Encodes pool keys with hook addresses
- Handles before/after hook calls
- Supports native ETH in swaps

## Permit2 Integration

**File**: `src/utils/inputTokens.ts` (~80 lines)

Integrates signature-based token permissions for gasless swaps:

```typescript
export interface Permit2Permit extends PermitSingle {
  signature: string  // 65 or 64 byte ECDSA signature
}

export function encodePermit(planner: RoutePlanner, permit2: Permit2Permit): void
```

**Signature Handling**:
- Accepts 65-byte canonical signatures (v + r + s)
- Accepts 64-byte compact EIP-2098 signatures
- Normalizes malformed signatures using ethers' splitSignature/joinSignature
- Supports EIP-1271 arbitrary length signatures

**Encoding Flow**:
1. User signs permit data off-chain
2. Pass `inputTokenPermit` in SwapOptions
3. SDK adds PERMIT2_PERMIT command before swap
4. Universal Router executes permit first, then swap
5. Eliminates need for separate approval transaction

## Development & Testing

### Build System (TSDX)

**Configuration**: TSDX handles TypeScript compilation and bundling:
```bash
yarn build  # Compiles src/ → dist/
           # Creates: dist/index.js (CJS), dist/index.esm.js (ESM)
           #          dist/index.d.ts (TypeScript declarations)
```

**TSDX Features**:
- CJS and ESM dual module support
- Automatic TypeScript declaration generation
- Dead code elimination via rollup
- Tree-shaking enabled (sideEffects: false in package.json)

### Testing Infrastructure

**Hardhat Tests** (`yarn test:hardhat`):
- Unit tests in `test/*.test.ts`
- Uses ethers v5 to simulate transactions
- Mock pools and token data in `test/utils/`
- Tests cover:
  - Swap encoding for each protocol
  - Permit2 signature handling
  - Chain-specific address validation
  - Calldata parsing round-trips

**Forge Tests** (`yarn test:forge`):
- Solidity integration tests in `test/forge/`
- Tests against actual contract ABIs
- Validates encoded calldata against on-chain behavior
- Uses foundry for execution

**Test Utilities**:
- `test/utils/uniswapData.ts`: Mock pool data generators
- `test/utils/permit2.ts`: Permit2 signature helpers
- `test/utils/addresses.ts`: Chain address fixtures

### Code Quality Standards

**Prettier Formatting** (120 char width):
```bash
yarn lint        # Check formatting
yarn lint:fix    # Auto-fix + Forge fmt
```

**TypeScript Configuration**:
- Strict mode enabled
- Full type exports in declarations
- All public APIs are type-safe

**Invariant Checking**:
- Uses `tiny-invariant` for contract violations
- Descriptive error messages for debugging

## Integration with Sibling SDKs

### With @uniswap/router-sdk

Router SDK handles multi-hop routing and protocol selection. Universal Router SDK consumes its `Trade` object:

```typescript
import { Trade as RouterTrade } from '@uniswap/router-sdk'

// Router SDK determines best route across protocols
const trade = new RouterTrade({
  v2Routes: [...],
  v3Routes: [...],
  v4Routes: [...],
  tradeType: TradeType.EXACT_INPUT
})

// Universal Router SDK encodes it for on-chain execution
const { calldata, value } = SwapRouter.swapCallParameters(trade, options)
```

### With @uniswap/permit2-sdk

Permit2 SDK provides signature types, Universal Router SDK encodes them:

```typescript
import { PermitSingle } from '@uniswap/permit2-sdk'

const permit: Permit2Permit = {
  // ... permit details from permit2-sdk
  signature: await signer._signTypedData(...)
}

const { calldata, value } = SwapRouter.swapCallParameters(trade, {
  inputTokenPermit: permit,
  // ... other options
})
```

### With V2/V3/V4 SDKs

References types and encoding utilities from protocol SDKs:
- V2: `Trade`, `Pair`, `Route` types and path encoding
- V3: `Trade`, `Pool`, `encodeRouteToPath()`, `NonfungiblePositionManager`
- V4: `Trade`, `Pool`, `V4Planner`, `encodeRouteToPath()`, `PoolKey` types

## Common Patterns & Examples

### Pattern 1: Basic Exact Input Swap

```typescript
import { TradeType, Percent, CurrencyAmount, Token } from '@uniswap/sdk-core'
import { Trade as RouterTrade, RouteV3 } from '@uniswap/router-sdk'
import { SwapRouter } from '@uniswap/universal-router-sdk'

// Setup
const USDC = new Token(1, '0xA0b8...', 6)
const ETH = NativeCurrency.onChain(1)
const amount = CurrencyAmount.fromRawAmount(USDC, 1000_000_000) // 1000 USDC

// Create trade (from routing engine result)
const route = new RouteV3([...pools], USDC, ETH)
const routerTrade = new RouterTrade({
  v3Routes: [{ routev3: route, inputAmount: amount, outputAmount: ethAmount }],
  tradeType: TradeType.EXACT_INPUT
})

// Encode
const { calldata, value } = SwapRouter.swapCallParameters(routerTrade, {
  slippageTolerance: new Percent(50, 10000),  // 0.5%
  recipient: userAddress,
  deadlineOrPreviousBlockhash: Math.floor(Date.now() / 1000) + 60 // 60s deadline
})

// Execute
const tx = await signer.sendTransaction({
  to: UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_0, 1),
  data: calldata,
  value,
  gasLimit: 500_000
})
```

### Pattern 2: Gasless Swap with Permit2

```typescript
import { SignatureTransfer } from '@uniswap/permit2-sdk'

// Build permit signature off-chain
const permit: PermitSingle = {
  details: {
    token: USDC.address,
    amount: amount.quotient.toString(),
    expiration: Math.floor(Date.now() / 1000) + 3600,
    nonce: await permitProvider.nonce(userAddress, PERMIT2_ADDRESS)
  },
  spender: UNIVERSAL_ROUTER_ADDRESS,
  sigDeadline: Math.floor(Date.now() / 1000) + 3600
}

const signature = await signer._signTypedData(
  SignatureTransfer.domain(1),
  SignatureTransfer.types,
  permit
)

// Include in swap
const { calldata, value } = SwapRouter.swapCallParameters(routerTrade, {
  slippageTolerance: new Percent(50, 10000),
  recipient: userAddress,
  inputTokenPermit: { ...permit, signature },
  deadlineOrPreviousBlockhash: deadline
})

// No approval needed - permit signature is sufficient
const tx = await signer.sendTransaction({
  to: UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_0, 1),
  data: calldata,
  value
})
```

### Pattern 3: Mixed Protocol Swap (V2 → V3)

```typescript
// Route determined by routing engine
const routerTrade = new RouterTrade({
  v2Routes: [{
    routev2: new RouteV2([pair1, pair2], USDC, DAI),
    inputAmount: CurrencyAmount.fromRawAmount(USDC, 1000_000_000),
    outputAmount: daiAmount
  }],
  v3Routes: [{
    routev3: new RouteV3([pool], DAI, ETH),
    inputAmount: daiAmount,
    outputAmount: ethAmount
  }],
  tradeType: TradeType.EXACT_INPUT
})

// SDK automatically handles:
// 1. V2 swap: USDC → DAI
// 2. Router receives DAI from V2
// 3. V3 swap: DAI → ETH using router's balance
// 4. ETH sent to recipient

const { calldata, value } = SwapRouter.swapCallParameters(routerTrade, options)
```

### Pattern 4: Swap with Fee Collection

```typescript
// Percentage fee (0.2% of output)
const { calldata, value } = SwapRouter.swapCallParameters(routerTrade, {
  fee: {
    fee: new Percent(2, 1000),        // 0.2%
    recipient: treasuryAddress
  },
  slippageTolerance: new Percent(50, 10000),
  recipient: userAddress,
  deadlineOrPreviousBlockhash: deadline
})

// Output flow: Router → PAY_PORTION (20 bips) → Recipient gets rest
// OR flat fee:
const { calldata, value } = SwapRouter.swapCallParameters(routerTrade, {
  flatFee: {
    amount: BigNumber.from('1000000000000000000'),  // 1 ETH
    recipient: treasuryAddress
  },
  // ...
})
```

### Pattern 5: Decode and Debug Transaction

```typescript
import { CommandParser } from '@uniswap/universal-router-sdk'

// Parse calldata to understand commands
const decoded = CommandParser.parseCalldata(calldata)

decoded.commands.forEach((cmd) => {
  console.log(`Command: ${cmd.commandName}`)
  cmd.params.forEach((param) => {
    console.log(`  ${param.name}: ${param.value}`)
  })
})

// Output example:
// Command: WRAP_ETH
//   recipient: 0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD
//   amount: 1000000000000000000
// Command: V3_SWAP_EXACT_IN
//   recipient: 0x1234...
//   amountIn: 1000000000000000000
//   // ... more params
```

## Advanced Considerations

### Native ETH vs WETH

- **V2/V3**: Require wrapped tokens, SDK adds WRAP_ETH before swap and UNWRAP_WETH after
- **V4**: Supports native ETH directly via hooks
- **Detection**: Automatic based on route protocol and input/output currencies
- **Edge Case**: If user sends native ETH but all routes go through V3, SDK wraps it

### Slippage & Price Impact

**Per-Route**: Each individual route has its own slippage protection based on output amounts
**Aggregated**: For multi-route trades where router custodies tokens:
- Router receives outputs from first routes
- Uses that balance for subsequent routes
- Aggregated slippage check at end

**Safe Mode**: Optional `safeMode` flag adds extra ETH sweep:
```typescript
// After all commands, adds SWEEP command to recover unexpected ETH
const { calldata, value } = SwapRouter.swapCallParameters(routerTrade, {
  safeMode: true,  // Extra safety at gas cost
  // ...
})
```

### Fee-on-Transfer Tokens

Some ERC20s charge fees on transfer (e.g., USDT on certain chains):

```typescript
// SDK detects and adjusts:
// 1. Estimates actual received amount after fee
// 2. Uses that as input to next step
// 3. Adjusts minimum output calculation
```

### Router as Liquidity Provider

Pattern for aggregators:

```typescript
// Aggregator has tokens in router contract already
const { calldata, value } = SwapRouter.swapCallParameters(routerTrade, {
  useRouterBalance: true,  // Use router's existing balance instead of user transfer
  recipient: userAddress,
  // ...
})

// Flow:
// 1. Router uses its balance as swap input
// 2. Swap executes
// 3. Output sent to recipient
// 4. Any leftover tokens can be swept
```

## Special Notes on V3-to-V4 Migration

The `migrateV3ToV4CallParameters()` method handles a complex operation atomically:

```typescript
// Requirements checked:
✓ Same tokens in both positions (order can differ if one is native)
✓ V3 liquidity removal must be 100%
✓ V3 NFT must be burned
✓ Collected fees must go to V4 position manager
✓ V4 operation must be mint (not increase)
✓ Migrate flag must be set

// Flow:
1. [Optional] V4_INITIALIZE_POOL if pool doesn't exist
2. V3_POSITION_MANAGER_CALL: decreaseLiquidity
3. V3_POSITION_MANAGER_CALL: collect
4. V3_POSITION_MANAGER_CALL: burn
5. V4_POSITION_MANAGER_CALL: modifyLiquidities (mint)

// All in one transaction!
```

## Documentation & Maintenance

### File Structure for Documentation

This CLAUDE.md covers the entire package architecture and APIs.

For navigating the codebase:
- **Start here**: `src/swapRouter.ts` - main entry point
- **Understand encoding**: `src/entities/actions/uniswap.ts` - protocol logic
- **Debug commands**: `src/utils/commandParser.ts` - parse encoded calls
- **Chain configs**: `src/utils/constants.ts` - deployment addresses

### Versioning & Publishing

- **Release Mechanism**: semantic-release-monorepo
- **Branch**: main (releases) and feature branches
- **Commit Convention**: Angular style (feat, fix, chore)
- **Publishing**: Auto-publish to npm with provenance on merge to main

### Key Maintenance Points

- When Universal Router contracts update, COMMAND_DEFINITION must be updated
- When new chains deploy UR, add to CHAIN_CONFIGS
- When protocols add features, may need new command types
- Permit2 integration depends on @uniswap/permit2-sdk updates

<!-- CUSTOM:START -->
<!-- User additions preserved during updates -->
<!-- CUSTOM:END -->