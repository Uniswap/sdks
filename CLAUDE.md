> **Last Updated:** 2025-11-19

# CLAUDE.md - Uniswap SDKs Monorepo

## Overview

This monorepo contains **11 TypeScript SDKs** that form the complete Uniswap protocol developer toolkit. These SDKs enable developers to build decentralized exchange (DEX) applications, interact with Uniswap's automated market makers (AMMs), create advanced trading interfaces, and integrate with Uniswap's next-generation features including account abstraction, MEV protection, and trusted execution environments.

The SDK ecosystem spans three generations of Uniswap protocols (V2, V3, V4), multiple order types (limit orders, Dutch auctions), unified routing layers, permission management, and emerging technologies like smart wallets and TEE attestations for Unichain.

**Mission**: Provide comprehensive, production-ready TypeScript abstractions for every aspect of Uniswap protocol interaction.

**Status**: Used in production on Uniswap Interface and by thousands of dApps. Some SDKs are marked as alpha (v3-sdk) due to potential patch-level changes, but all are stable for production use with appropriate testing.

## Quick Start by Use Case

### Simple Token Swaps
```bash
npm install @uniswap/universal-router-sdk @uniswap/sdk-core ethers
```
**SDKs**: `universal-router-sdk` + `sdk-core`

### Liquidity Provision
```bash
npm install @uniswap/v3-sdk @uniswap/sdk-core ethers jsbi
```
**SDKs**: `v3-sdk` (or `v4-sdk`) + `sdk-core`

### Advanced Orders with MEV Protection
```bash
npm install @uniswap/uniswapx-sdk @uniswap/permit2-sdk ethers
```
**SDKs**: `uniswapx-sdk` + `permit2-sdk` + `sdk-core`

### Account Abstraction & Batching
```bash
npm install @uniswap/smart-wallet-sdk ethers
```
**SDKs**: `smart-wallet-sdk` + `sdk-core`

### Unichain Integration
```bash
npm install @uniswap/flashtestations-sdk @uniswap/tamperproof-transactions
```
**SDKs**: `flashtestations-sdk` + `tamperproof-transactions`

## Tech Stack

**Languages & Build Tools**:
- TypeScript 4.3+ (sdk-core, v2/v3/v4) and 5.6+ (smart-wallet-sdk, flashtestations-sdk)
- Node.js 10+ (legacy SDKs), 14+ (modern SDKs), 18+ (flashtestations-sdk)
- Build: TSDX (most SDKs), native TypeScript compiler (permit2-sdk, smart-wallet-sdk, uniswapx-sdk)
- Bundling: CJS, ESM, and TypeScript declarations for all SDKs
- Turbo for monorepo build orchestration

**Package Management**:
- Yarn 3.2.3+ (workspaces)
- Semantic versioning with semantic-release-monorepo

**Core Dependencies**:
- Ethers.js v5 (transaction construction, contract interaction)
- Viem v2 (smart-wallet-sdk, flashtestations-sdk - modern alternative to ethers)
- JSBI (arbitrary precision integers for mathematical calculations)
- big.js / decimal.js-light (precise decimal arithmetic)

**Testing & Quality**:
- Jest 25.5.0 (unit testing framework)
- TypeScript strict mode
- ESLint with Prettier integration
- Husky for pre-commit hooks

## Repository Structure

```
sdks/                                        (11 packages, 380+ source files)
├── sdk-core/                  # Core currency, fraction math, chain abstractions (37 files)
│   ├── src/entities/          # Currency, Token, Ether, Fraction, Percent, Price
│   ├── src/utils/             # Common utilities, validation, sorting
│   └── src/addresses.ts       # Contract addresses per chain
│
├── v2-sdk/                    # Uniswap V2 constant product AMM (x*y=k) (15 files)
│   ├── src/entities/          # Pair, Route, Trade
│   └── src/utils/             # Pricing and liquidity calculations
│
├── v3-sdk/                    # Uniswap V3 concentrated liquidity AMM (65 files)
│   ├── src/entities/          # Pool, Position, Route, Trade, Tick
│   ├── src/utils/             # Tick math, price calculations, liquidity math
│   └── src/nonfungiblePositionManager.ts  # NFT position management
│
├── v4-sdk/                    # Uniswap V4 with hooks and native ETH (32 files)
│   ├── src/entities/          # Pool, Position (extends v3), PathKey
│   ├── src/utils/             # Hook address validation, pool ID computation
│   └── src/multicall/         # Batched contract calls
│
├── router-sdk/                # Multi-protocol routing (V2, V3, V4) (25 files)
│   ├── src/entities/          # Trade, Route, MixedRoute (cross-protocol)
│   └── src/utils/             # Path encoding for multi-hop swaps
│
├── universal-router-sdk/      # Unified interface for V2/V3/V4 swaps (25 files)
│   ├── src/entities/          # RouterTrade, Command encoding
│   └── src/utils/             # Universal Router contract interaction
│
├── uniswapx-sdk/              # Off-chain order protocol (114 files)
│   ├── src/builder/           # Order builders (Dutch, Limit, Relay, Priority)
│   ├── src/order/             # Order types, validation, encoding
│   ├── integration/           # Integration test suite
│   └── abis/                  # Contract ABIs with TypeChain
│
├── permit2-sdk/               # Gasless approvals via signatures (14 files)
│   ├── src/allowanceTransfer.ts    # Approve-once pattern
│   ├── src/signatureTransfer.ts    # One-time signed permits
│   └── src/providers/              # AllowanceProvider, SignatureProvider
│
├── smart-wallet-sdk/          # EIP-7702 account abstraction (16 files)
│   ├── src/accounts/          # Smart account creation and management
│   ├── src/transactions/      # Batched transaction construction
│   └── src/utils/             # EIP-7702 authorization handling
│
├── flashtestations-sdk/       # TEE attestation verification (18 files)
│   ├── src/verification/      # Flashbots TEE attestation service
│   ├── src/crypto/            # Workload identity verification
│   └── src/rpc/               # RPC client for attestation requests
│
└── tamperproof-transactions/  # EIP-7754 signature verification (19 files)
    ├── src/verify.ts          # Signature verification logic
    ├── src/sign.ts            # Transaction signing with attestation
    └── src/utils/             # Crypto utilities with browser/node support
```

**Total**: 11 packages, 380+ source files, ~10,000 lines of implementation code

## SDK Dependency Graph & Architecture

### Visual Dependency Flow

```
                           sdk-core (foundation)
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
      v2-sdk                    v3-sdk                     v4-sdk
        │                          │                          │
        │                   (v4 depends on v3)               │
        │                          │                          │
        └──────────────────────────┴──────────────────────────┘
                                   │
                              router-sdk (aggregates V2/V3/V4)
                                   │
                          universal-router-sdk
                                   │
                         ┌─────────┴─────────┐
                    permit2-sdk         uniswapx-sdk
                         │                    │
                         └────────┬───────────┘
                                  │
                           (used together for
                            signature-based trading)

Independent but complementary:
    smart-wallet-sdk (EIP-7702 account abstraction)
    flashtestations-sdk (Unichain TEE attestations)
    tamperproof-transactions (EIP-7754 signatures)
```

### Dependency Hierarchy

1. **Foundation Layer**: `sdk-core`
   - Required by: All other SDKs
   - Provides: Currency, Token, Fraction, Price, CurrencyAmount, Percent, ChainId, contract addresses
   - Size: ~37 files, ~1,500 LOC

2. **Protocol Layer**: `v2-sdk`, `v3-sdk`, `v4-sdk`
   - V2: Constant product formula (x * y = k)
   - V3: Concentrated liquidity with ticks and fee tiers
   - V4: Hooks system and native ETH support
   - All depend on: `sdk-core`
   - Used by: `router-sdk`, `universal-router-sdk`

3. **Aggregation Layer**: `router-sdk`, `universal-router-sdk`
   - Combines: V2, V3, V4 routing into unified interface
   - Enables: Cross-protocol best execution
   - Used by: dApps, trading bots

4. **Order Layer**: `uniswapx-sdk`, `permit2-sdk`
   - Off-chain orders: Dutch auctions, limit orders, relay orders
   - Gasless approvals: EIP-712 signatures
   - Integration: Designed to work together
   - Enables: Signature-based trading, MEV protection

5. **Emerging Tech Layer**: `smart-wallet-sdk`, `flashtestations-sdk`, `tamperproof-transactions`
   - Smart wallets: EIP-7702 account abstraction
   - TEE attestations: Unichain integration
   - Tamper-proof: Transaction signature verification
   - Enables: Advanced account models, trusted execution

## Individual SDK Summaries

### Core Foundation

#### sdk-core (Foundation)
**Purpose**: Shared types, currency abstractions, mathematical primitives
- **Key Exports**: `Currency`, `Token`, `Ether`, `NativeCurrency`, `Fraction`, `Percent`, `Price`, `CurrencyAmount`
- **Math System**: JSBI-based arbitrary precision integers, fraction mathematics
- **Chain Support**: 29+ EVM chains with multi-chain address registry
- **Use Case**: Import this first for any Uniswap integration
- **CLAUDE.md**: `/sdks/sdk-core/CLAUDE.md` - Detailed entity documentation and API reference

### Protocol Layer - AMM Implementations

#### v2-sdk (Constant Product AMM)
**Protocol Model**: x * y = k (constant product formula)
- **Key Exports**: `Pair`, `Route`, `Trade`
- **Liquidity**: Uniform distribution across price range
- **Use Case**: Simple two-token pools, legacy protocol support
- **Files**: 15 source files
- **CLAUDE.md**: Individual SDK documentation available

#### v3-sdk (Concentrated Liquidity AMM)
**Protocol Model**: Tick-based concentrated liquidity with fee tiers
- **Key Exports**: `Pool`, `Position`, `Route`, `Trade`, `TickMath`, `TickList`, `NonfungiblePositionManager`
- **Liquidity**: NFT positions with custom price ranges
- **Advanced Features**: 7 fee tiers (0.01%-1%), capital efficiency 4000x vs V2
- **Use Case**: Professional market making, liquidity provision with capital efficiency
- **Files**: 65 source files, most complex SDK
- **CLAUDE.md**: `/sdks/v3-sdk/CLAUDE.md` - Comprehensive tick system, position management, contract interfaces

#### v4-sdk (Hooks-Based AMM)
**Protocol Model**: Extends V3 with customizable hooks and native ETH support
- **Key Exports**: `Pool`, `Position`, `PathKey`, `validateHookAddress`, `PoolIdLibrary`
- **Innovation**: Before/after swap hooks, custom pool logic, singleton architecture
- **Native ETH**: Direct ETH trading without WETH wrapping
- **Use Case**: Custom pool behavior, advanced DeFi integrations, gas-optimized native ETH swaps
- **Files**: 32 source files with builder pattern for action encoding
- **CLAUDE.md**: `/sdks/v4-sdk/CLAUDE.md` - Hook system, action encoding, native ETH patterns

### Routing & Aggregation Layer

#### router-sdk (Multi-Protocol Router)
**Purpose**: Route trades across V2, V3, and V4 pools
- **Key Exports**: `Trade`, `Route`, `MixedRoute` (cross-protocol paths)
- **Routing**: Single or multi-hop, mixed protocol paths (V2→V3→V4)
- **Use Case**: Optimal price execution across all Uniswap versions
- **Files**: 25 source files

#### universal-router-sdk (Unified Interface)
**Purpose**: Single contract interface for all swap types
- **Key Exports**: `RouterTrade`, command encoding utilities
- **Command System**: Batch multiple operations (swap, wrap, unwrap, permit)
- **Integration**: Uses `router-sdk`, `permit2-sdk` for complete flows
- **Use Case**: Production-ready swap interface, gas-efficient batching
- **Files**: 25 source files
- **CLAUDE.md**: `/sdks/universal-router-sdk/CLAUDE.md` - Router interface, batch operations

### Order & Permission Layer

#### uniswapx-sdk (Off-Chain Order System)
**Order Types Implemented**:
- **Dutch Auction Orders**: Price decreases over time until filled
- **V2/V3 Dutch Orders**: Enhanced with cosigner for dynamic pricing
- **Limit Orders**: Fill at exact price or better
- **Relay Orders**: Gasless transactions with relayer integration
- **Priority Orders**: MEV-protected execution with priority fee scaling
- **Key Exports**: `DutchOrderBuilder`, `LimitOrderBuilder`, `OrderValidator`, `OrderEncoder`
- **Dependencies**: Uses `permit2-sdk` for gasless approvals
- **Use Case**: Advanced order types, MEV protection, gasless trading
- **Files**: 114 source files, most comprehensive order system
- **CLAUDE.md**: `/sdks/uniswapx-sdk/CLAUDE.md` - Order types, builders, trading logic

#### permit2-sdk (Signature-Based Approvals)
**Purpose**: Gasless token approvals using EIP-2612 signatures
- **Patterns**:
  - **Allowance Transfer**: Approve once, transfer many times
  - **Signature Transfer**: One-time signed permits
- **Key Exports**: `AllowanceProvider`, `SignatureProvider`, permit encoding/decoding
- **Gas Savings**: Eliminates separate approval transactions
- **Use Case**: UX improvement, gasless trading flows, batch operations
- **Files**: 14 source files
- **CLAUDE.md**: `/sdks/permit2-sdk/CLAUDE.md` - Signature patterns, EIP-712 details

### Emerging Technologies Layer

#### smart-wallet-sdk (Account Abstraction)
**Standard**: EIP-7702 (EOA to smart contract account upgrade)
- **Key Exports**: Account creation, batch transaction builder, authorization management
- **Features**: Transaction batching, session keys, gas sponsorship support
- **Use Case**: Smart accounts, sponsored transactions, improved UX for batched operations
- **Files**: 16 source files
- **Note**: Uses Viem (modern ethers alternative) instead of ethers.js

#### flashtestations-sdk (TEE Attestations)
**Purpose**: Verify Flashbots TEE (Trusted Execution Environment) attestations on Unichain
- **Key Exports**: `FlasttestationVerificationService`, workload identity verification
- **Security**: Cryptographic proof of execution in secure enclave
- **Use Case**: Unichain block verification, MEV-aware infrastructure, trusted sequencing
- **Files**: 18 source files
- **Platform**: Node.js and browser support

#### tamperproof-transactions (Transaction Signing)
**Standard**: EIP-7754 implementation for tamper-proof signatures
- **Key Exports**: `sign`, `verify`, signature utilities
- **Platform Support**: Node.js and browser environments with crypto polyfills
- **Use Case**: Enhanced transaction security, signature verification, cross-platform signing
- **Files**: 19 source files

## Development Workflow

### Initial Setup

```bash
# Clone with submodules (some SDKs reference contracts as git submodules)
git clone --recurse-submodules https://github.com/Uniswap/sdks.git
cd sdks

# Install dependencies (Yarn 3 required)
yarn install

# Build all packages (Turbo orchestrates build order)
yarn g:build
```

### Development Commands

```bash
# Build all SDKs (respects dependency order)
yarn g:build

# Run all tests
yarn g:test

# Lint all packages
yarn g:lint

# Type-check all packages
yarn g:typecheck

# Check for dependency version mismatches
yarn g:check:deps:mismatch

# Work with a specific SDK
yarn sdk @uniswap/sdk-core build
yarn sdk @uniswap/v3-sdk test
yarn sdk @uniswap/uniswapx-sdk lint

# Watch mode for development (TSDX-based SDKs)
cd sdks/sdk-core && yarn start
```

### Build System Details

**Turbo Pipeline** (`turbo.json`):
- **Inputs**: Source files (`src/**/*.ts`, `src/**/*.tsx`), configuration files
- **Outputs**: `dist/` directories with CJS, ESM, and TypeScript declarations
- **Caching**: Turbo caches build artifacts for incremental builds
- **Dependencies**: `test` depends on `build` completing first

**Build Targets** (varies by SDK):
- **TSDX-based**: Single command `tsdx build` → CJS, ESM, TypeScript types
- **Custom TypeScript**: Multiple targets (`build:cjs`, `build:esm`, `build:types`)
- **Contract Integration**: TypeChain generation for ABIs (uniswapx-sdk)

### Testing

**Test Structure**:
- **Unit Tests**: Co-located with source (`.test.ts` files)
- **Integration Tests**: Separate directories (e.g., `uniswapx-sdk/integration/`)
- **Framework**: Jest 25.5.0 with ts-jest transformer
- **Coverage**: Test files run against compiled output in TSDX setups

**Running Tests**:
```bash
# All SDKs
yarn g:test

# Specific SDK (TSDX)
cd sdks/sdk-core && yarn test

# Specific SDK (custom)
cd sdks/uniswapx-sdk && yarn test:unit && yarn test:integration

# Watch mode
cd sdks/v3-sdk && yarn test --watch
```

## Code Quality Standards

### Linting & Formatting

**ESLint Configuration**:
- Shared across packages: `eslint-config-react-app` base (legacy SDKs)
- Plugins: `eslint-plugin-prettier`, `eslint-plugin-import`, `eslint-plugin-functional`
- TypeScript: `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`
- Severity: `--max-warnings 0` (zero warnings policy)

**Prettier Settings** (consistent across SDKs):
```json
{
  "printWidth": 120,
  "semi": false,
  "singleQuote": true
}
```

**Note**: `flashtestations-sdk` uses 80 column width and semicolons

### Type Safety

- **Strict TypeScript**: All SDKs use TypeScript in strict mode
- **Type Exports**: All packages export full TypeScript declarations
- **Module Resolution**: ESM and CJS dual-module support
- **Side Effects**: `"sideEffects": false` for tree-shaking optimization

### Pre-Commit Hooks

- **Husky**: Configured at monorepo root
- **Hooks**: Lint and format check before commit
- **Command**: `yarn postinstall` sets up hooks automatically

## Conventions and Patterns

### Package Naming

- **Scoped Packages**: All published as `@uniswap/{name}`
- **Exception**: `flashtestations-sdk` (not yet scoped/published)

### Module Structure

**Common Pattern** (applies to most SDKs):
```
src/
├── index.ts              # Main entry point (re-exports)
├── constants.ts          # Contract addresses, chain IDs, magic numbers
├── entities/             # Core business objects (Token, Pool, Trade, etc.)
│   ├── {Entity}.ts
│   ├── {Entity}.test.ts
│   └── index.ts
├── utils/                # Helper functions, validation, encoding
│   └── index.ts
└── {feature}/            # Feature-specific modules
    └── index.ts
```

### Testing Patterns

- **File Naming**: `{module}.test.ts` co-located with source
- **Assertions**: `tiny-invariant` for runtime checks, Jest expect for tests
- **Mock Data**: Test fixtures in `test/` directories
- **Integration**: Separate integration test packages (uniswapx-sdk)

### Mathematical Precision

**Principle**: All financial calculations use arbitrary precision arithmetic
- **Integers**: JSBI for amounts, tick calculations, liquidity values
- **Decimals**: `Fraction` class (from sdk-core) for ratios and prices
- **Rounding**: Explicit rounding modes (ROUND_UP, ROUND_DOWN, ROUND_HALF_UP)
- **Overflow Protection**: JSBI prevents JavaScript number overflow

### Error Handling

- **Invariants**: `tiny-invariant(condition, message)` for contract violations
- **Warnings**: `tiny-warning(condition, message)` for non-fatal issues
- **Custom Errors**: Throw descriptive errors with context

### Dependency Injection

**Provider Pattern** (permit2-sdk, uniswapx-sdk):
- `AllowanceProvider`: Reads on-chain allowance state
- `SignatureProvider`: Generates EIP-712 signatures
- Allows testing with mock providers

### Contract Interaction

**Ethers.js v5 Pattern** (most SDKs):
```typescript
import { ethers } from 'ethers'
const contract = new ethers.Contract(address, abi, provider)
```

**Viem Pattern** (smart-wallet-sdk, flashtestations-sdk):
```typescript
import { createPublicClient, createWalletClient } from 'viem'
const client = createPublicClient({ chain, transport })
```

## Publishing & Release

### Semantic Release Configuration

**Monorepo Strategy**: Uses `semantic-release-monorepo` for independent versioning

**Commit Convention** (Angular style):
```
fix(sdk-name): description     → Patch version (0.0.X)
fix(public): description        → Patch version (0.0.X)
feat(sdk-name): description     → Minor version (0.X.0)
feat(breaking): description     → Major version (X.0.0)
chore(scope): description       → No release
```

**Release Process**:
1. PR merged to `main` branch
2. Semantic-release analyzes commits per SDK directory
3. Versions bumped based on commit types
4. Changelog generated automatically
5. Package published to npm with provenance
6. GitHub release created with notes
7. Post-publish: `yarn.lock` restored and reinstalled

**Branch Strategy**:
- **Main**: `main` (stable releases)
- **Prerelease**: Some SDKs use `beta` or `still-in-alpha` branches

### Publication Settings

**NPM Config** (all packages):
```json
{
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

**Provenance**: Supply chain security via npm attestations

## Common Integration Patterns

### Pattern 1: Basic Swap with Universal Router

```typescript
import { CurrencyAmount, Token, TradeType } from '@uniswap/sdk-core'
import { Trade } from '@uniswap/router-sdk'
import { SwapRouter, UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk'

// 1. Construct trade from router-sdk
const trade = new Trade({ routes, tradeType: TradeType.EXACT_INPUT })

// 2. Generate swap calldata
const { calldata, value } = SwapRouter.swapCallParameters(trade, {
  slippageTolerance: new Percent(50, 10_000), // 0.5%
  recipient: userAddress,
  deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
})

// 3. Execute transaction
const tx = await signer.sendTransaction({
  to: UNIVERSAL_ROUTER_ADDRESS(chainId),
  data: calldata,
  value,
})
```

### Pattern 2: Gasless Swap with Permit2

```typescript
import { SignatureTransfer } from '@uniswap/permit2-sdk'
import { ethers } from 'ethers'

// 1. Create permit signature
const permit = {
  permitted: { token: tokenAddress, amount: amount },
  spender: UNIVERSAL_ROUTER_ADDRESS,
  nonce: await getPermitNonce(userAddress),
  deadline: ethers.constants.MaxUint256,
}

const signature = await signer._signTypedData(
  SignatureTransfer.domain(chainId),
  SignatureTransfer.types,
  permit
)

// 2. Include permit in swap calldata
const { calldata, value } = SwapRouter.swapCallParameters(trade, {
  permit: { signature, ...permit },
  // ... other options
})
```

### Pattern 3: V3 Liquidity Position

```typescript
import { Pool, Position, nearestUsableTick } from '@uniswap/v3-sdk'
import { NonfungiblePositionManager } from '@uniswap/v3-sdk'

// 1. Create pool instance
const pool = new Pool(
  tokenA,
  tokenB,
  fee,
  sqrtPriceX96,
  liquidity,
  tick
)

// 2. Define position parameters
const position = Position.fromAmounts({
  pool,
  tickLower: nearestUsableTick(currentTick - 1000, pool.tickSpacing),
  tickUpper: nearestUsableTick(currentTick + 1000, pool.tickSpacing),
  amount0: amount0Desired,
  amount1: amount1Desired,
  useFullPrecision: true,
})

// 3. Generate mint calldata
const { calldata, value } = NonfungiblePositionManager.addCallParameters(
  position,
  { slippageTolerance, recipient, deadline }
)
```

### Pattern 4: UniswapX Dutch Auction Order

```typescript
import { DutchOrderBuilder } from '@uniswap/uniswapx-sdk'

// 1. Build Dutch auction order
const order = new DutchOrderBuilder(chainId)
  .input({
    token: inputToken,
    startAmount: inputAmount,
    endAmount: inputAmount, // No decay on input
  })
  .output({
    token: outputToken,
    startAmount: maxOutputAmount,    // Best price at start
    endAmount: minOutputAmount,      // Decays to min price
    recipient: userAddress,
  })
  .deadline(Math.floor(Date.now() / 1000) + 300) // 5 minutes
  .swapper(userAddress)
  .nonce(Date.now())
  .build()

// 2. Sign order
const signature = await signOrder(order, signer)

// 3. Submit to UniswapX API
await submitOrder({ order, signature })
```

### Pattern 5: V4 Hook Integration

```typescript
import { Pool, validateHookAddress, PoolIdLibrary } from '@uniswap/v4-sdk'

// 1. Validate hook address (checks permission bits)
const isValid = validateHookAddress(hookAddress, {
  beforeSwap: true,
  afterSwap: false,
  beforeAddLiquidity: true,
  afterAddLiquidity: false,
})

// 2. Create pool with hook
const pool = new Pool(
  tokenA,
  tokenB,
  fee,
  tickSpacing,
  hookAddress,  // Custom hook contract
  sqrtPriceX96,
  liquidity,
  tick
)

// 3. Get unique pool ID
const poolId = PoolIdLibrary.getPoolId(pool)
```

## SDK Selection Matrix

| Use Case | SDKs | Complexity | When to Use |
|----------|------|-----------|-----------|
| Simple swap | universal-router-sdk + sdk-core | Low | Most users - production-ready |
| V2 liquidity | v2-sdk + sdk-core | Low | Legacy support, simple pools |
| V3 liquidity | v3-sdk + sdk-core | Medium | Capital-efficient market making |
| V4 custom pools | v4-sdk + sdk-core | High | Custom logic, hooks, advanced |
| Cross-protocol | router-sdk + (v2/v3/v4)-sdk | High | Optimal execution across versions |
| Advanced orders | uniswapx-sdk + permit2-sdk | High | MEV protection, gasless, auctions |
| Smart wallets | smart-wallet-sdk + sdk-core | Medium | Account abstraction, batching |
| Unichain | flashtestations-sdk + tamperproof-transactions | High | TEE attestations, trusted sequencing |

## Monorepo Management

### Key Files & Directories

**Root Configuration**:
- `package.json` - Workspace configuration, shared scripts
- `yarn.lock` - Dependency lock file (committed)
- `turbo.json` - Turbo build pipeline configuration
- `.eslintrc.js` - Shared ESLint configuration
- `.github/workflows/` - GitHub Actions CI/CD
- `.husky/` - Pre-commit hooks

**Individual SDK Structure**:
Each SDK directory contains:
- `package.json` - SDK-specific dependencies and metadata
- `src/` - TypeScript source code
- `dist/` - Compiled output (CJS, ESM, types)
- `tsconfig.json` - TypeScript configuration
- `.eslintrc.js` - Linting rules (if overridden)
- `jest.config.js` - Test configuration
- `CLAUDE.md` - SDK-specific documentation

### Workspace Scripts

**Global Commands**:
```bash
yarn g:build          # Build all packages
yarn g:test           # Test all packages
yarn g:lint           # Lint all packages
yarn g:typecheck      # Type check all packages
yarn g:check:deps:mismatch  # Check dependency consistency
```

**SDK-Specific**:
```bash
yarn sdk @uniswap/sdk-core build
yarn sdk @uniswap/v3-sdk test
yarn workspace @uniswap/permit2-sdk run lint
```

### Dependency Management

**Monorepo Principles**:
- Shared versions for cross-SDK dependencies (sdk-core)
- Independent versions for SDK-specific dependencies
- Yarn workspaces for local package resolution
- semantic-release-monorepo for independent versioning per SDK

**Version Consistency Checks**:
- CI runs `yarn g:check:deps:mismatch` to ensure consistency
- Prevents version drift for shared dependencies
- Enforces common patterns across SDKs

## Documentation Hierarchy

This monorepo maintains documentation at multiple levels:

```
/sdks/CLAUDE.md                         ← Ecosystem overview (this file)
├── /sdks/sdk-core/CLAUDE.md            ← Core types and abstractions
├── /sdks/v2-sdk/CLAUDE.md              ← V2 protocol specifics
├── /sdks/v3-sdk/CLAUDE.md              ← V3 protocol specifics (65 files)
├── /sdks/v4-sdk/CLAUDE.md              ← V4 protocol specifics (32 files)
├── /sdks/router-sdk/CLAUDE.md          ← Routing algorithms
├── /sdks/universal-router-sdk/CLAUDE.md← Universal Router integration
├── /sdks/uniswapx-sdk/CLAUDE.md        ← Order types and builders (114 files)
├── /sdks/permit2-sdk/CLAUDE.md         ← Signature schemes (14 files)
├── /sdks/smart-wallet-sdk/CLAUDE.md    ← Account abstraction
├── /sdks/flashtestations-sdk/CLAUDE.md ← TEE attestations
└── /sdks/tamperproof-transactions/CLAUDE.md ← Signature verification
```

### Documentation Management Rules

When making changes to SDKs in this monorepo:

1. **Apply the Documentation Proximity Principle**:
   - Find the CLOSEST CLAUDE.md file in the directory hierarchy that would benefit from documenting this change
   - Start from the immediate parent directory of changed files and work upward
   - Update the closest relevant CLAUDE.md rather than always going to root level
   - Only bubble up to parent CLAUDE.md files if the change affects that level's public API or architecture

2. **Identify the appropriate CLAUDE.md level**:
   - **SDK/Component level**: For changes to a specific SDK or component with its own CLAUDE.md
   - **Module level**: For changes affecting multiple components within a module
   - **Monorepo/Root level**: For changes to monorepo structure, common patterns, or cross-SDK architectural decisions

3. **Update Protocol**:
   - **Code Changes**: Implement and test changes in relevant SDK
   - **SDK Documentation**: Update SDK's CLAUDE.md with new APIs or patterns
   - **Root Documentation**: Update this file if changes affect ecosystem architecture
   - **Timestamp**: Update the "Last Updated" timestamp at the top
   - **Preserve Custom Content**: Maintain any custom additions between `<!-- CUSTOM:START -->` and `<!-- CUSTOM:END -->` markers

4. **When to Update Root CLAUDE.md** (`/sdks/CLAUDE.md`):
   - New SDKs added to the monorepo
   - Major architectural changes affecting multiple SDKs
   - Changes to common patterns or conventions across packages
   - Updates to monorepo build system or workflow
   - Breaking changes in dependency relationships
   - Changes to publication strategy or versioning

5. **When to Update SDK-Level CLAUDE.md**:
   - New public APIs or exports
   - Significant changes to internal architecture
   - New dependencies or dependency updates
   - Major features or refactoring
   - Bug fixes affecting usage patterns
   - Examples that need updating

## Performance & Optimization

### SDK Sizes (Estimated)

| SDK | Size (minified) | Primary Use | Load Time |
|-----|-----------------|------------|----------|
| sdk-core | 45KB | Foundation | Fast |
| v2-sdk | 30KB | Legacy swaps | Fast |
| v3-sdk | 120KB | Concentrated liquidity | Medium |
| v4-sdk | 95KB | Hooks + native ETH | Medium |
| router-sdk | 50KB | Multi-protocol routing | Fast |
| universal-router-sdk | 40KB | Unified interface | Fast |
| uniswapx-sdk | 180KB | Advanced orders | Slow (async loads) |
| permit2-sdk | 25KB | Gasless approvals | Fast |
| smart-wallet-sdk | 35KB | Account abstraction | Fast |
| flashtestations-sdk | 30KB | TEE verification | Fast |
| tamperproof-transactions | 28KB | Signatures | Fast |

### Memory Optimization Tips

1. **Cache Pool Instances**: Reuse pool objects, they're immutable
2. **Lazy Load Heavy SDKs**: Load uniswapx-sdk on-demand
3. **Tree-Shaking**: All SDKs support ES6 modules for dead code elimination
4. **Batch Operations**: Group multiple trades instead of individual calls

### Computational Complexity

- **Swap Simulation**: O(n) where n = ticks crossed
- **Best Route Finding**: O(p^k) where p = pools, k = max hops (bounded)
- **Math Operations**: O(1) for JSBI operations
- **Signature Generation**: O(1) for EIP-712 signing

## Troubleshooting & Common Issues

### Build Issues

**Issue**: `yarn g:build` fails on specific SDK
**Solution**: Check SDK's package.json build script, verify dependencies

**Issue**: TypeScript compilation errors
**Solution**: Run `yarn g:typecheck` to identify issues, check tsconfig.json

### Runtime Issues

**Issue**: "CHAIN_ID" invariant error
**Solution**: Ensure consistent chain ID usage across entities

**Issue**: Incorrect amounts due to decimal places
**Solution**: Always use `CurrencyAmount.fromRawAmount()` with exact decimals

### Integration Issues

**Issue**: Missing contract addresses for new chain
**Solution**: Check sdk-core's addresses.ts, add chain to ChainId enum

**Issue**: Insufficient liquidity for route
**Solution**: Check pool state, verify tick data, try alternative routes

## Future Development

### Planned Features

1. **V4 Expansion**: More hook examples, dynamic fee pools
2. **Cross-Chain**: Bridges, multi-chain routing
3. **MEV Tools**: Enhanced MEV protection, flashbot integration
4. **Smart Contracts**: SDK-generated contract scaffolding

### Contribution Guidelines

- Fork the repository
- Create feature branch: `git checkout -b feat/my-feature`
- Follow naming conventions and code style
- Add tests for new functionality
- Update relevant CLAUDE.md files
- Submit PR with clear description

## Related Resources

**Official Documentation**:
- [Uniswap Docs](https://docs.uniswap.org/)
- [SDK Documentation](https://docs.uniswap.org/sdk)
- [Protocol Docs](https://docs.uniswap.org/protocol)

**Source Code**:
- [Uniswap SDKs Repository](https://github.com/Uniswap/sdks)
- [V2 Core](https://github.com/Uniswap/v2-core)
- [V3 Core](https://github.com/Uniswap/v3-core)
- [V4 Core](https://github.com/Uniswap/v4-core)

**Community**:
- [Discord](https://discord.gg/uniswap)
- [GitHub Issues](https://github.com/Uniswap/sdks/issues)
- [Governance Forum](https://gov.uniswap.org/)

## Summary Statistics

- **Total SDKs**: 11 packages
- **Total Source Files**: 380+ TypeScript files
- **Implementation LOC**: ~10,000 lines
- **Test Coverage**: All packages have comprehensive unit tests
- **Chain Support**: 29+ EVM chains
- **TypeScript Version**: 4.3+ strict mode
- **Node Versions**: 10-18+
- **Build System**: Turbo + TSDX
- **Package Manager**: Yarn 3.2.3+
- **Supported Contract Versions**: V2, V3, V4, UniswapX, Permit2
- **Published**: npm @uniswap/* scoped packages

<!-- CUSTOM:START -->
<!-- User additions preserved during updates -->
<!-- CUSTOM:END -->
