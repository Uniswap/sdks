> **Last Updated:** 2025-11-19

# CLAUDE.md - SDK Core

## Overview

The SDK Core (`@uniswap/sdk-core`) is the foundational TypeScript library for all Uniswap SDKs, providing essential abstractions and utilities for building DeFi applications. It defines shared types for currency handling, provides arbitrary-precision mathematical operations, and maintains cross-chain contract address registries that serve as the bedrock for all protocol-specific SDKs (v2-sdk, v3-sdk, v4-sdk, router-sdk, etc.).

**Purpose**: Deliver reusable, type-safe primitives for currency representation, fraction mathematics with arbitrary precision, and multi-chain constants/addresses that eliminate duplication across the Uniswap SDK ecosystem.

**Critical Role**: Every other Uniswap SDK depends on this package. It is the first package to update when adding chain support or changing core mathematical operations.

**Key Capabilities**:
- Multi-chain currency abstractions with strong type safety
- Arbitrary-precision mathematical operations (no floating-point errors)
- Comprehensive chain ID and contract address registry (29+ EVM chains)
- Address validation and Ethereum utilities
- Token and native currency representations with fee-on-transfer support

## Repository Context

This package is one of 11 SDKs in the Uniswap TypeScript SDK monorepo, part of the Uniswap Labs developer toolkit. It's currently maintained alongside:
- Protocol SDKs: v2-sdk, v3-sdk, v4-sdk
- Routing: router-sdk, universal-router-sdk
- Orders: uniswapx-sdk, permit2-sdk
- Advanced: smart-wallet-sdk, flashtestations-sdk, tamperproof-transactions

## Architecture

The SDK Core is organized into five core modules with 34 TypeScript source files:

```
sdk-core/ (42 total files, 34 TS source)
├── src/
│   ├── entities/                    # 15 core domain model files
│   │   ├── baseCurrency.ts         # Abstract currency base class (interface definition)
│   │   ├── currency.ts             # Currency union type (NativeCurrency | Token)
│   │   ├── nativeCurrency.ts       # Abstract native currency (ETH, MATIC, etc.)
│   │   ├── ether.ts                # Per-chain Ether singleton implementations
│   │   ├── token.ts                # ERC-20 token with checksummed address
│   │   ├── weth9.ts                # WETH9 wrapped ether token factory
│   │   ├── fractions/              # Mathematical abstractions (8 files)
│   │   │   ├── fraction.ts         # Immutable arbitrary-precision fraction (numerator/denominator)
│   │   │   ├── currencyAmount.ts   # Fraction with currency context and decimal handling
│   │   │   ├── price.ts            # Exchange rate between two currencies (base/quote)
│   │   │   ├── percent.ts          # Basis-point fraction for slippage/fees
│   │   │   ├── index.ts            # Re-exports
│   │   │   ├── *.test.ts           # Jest unit tests (4 test files)
│   │   └── *.test.ts               # Entity tests (3 test files)
│   │
│   ├── utils/                       # 9 utility function files
│   │   ├── computePriceImpact.ts   # Price impact percentage calculation
│   │   ├── computeZksyncCreate2Address.ts  # zkSync-specific address derivation
│   │   ├── sortedInsert.ts         # Generic sorted array insertion utility
│   │   ├── sqrt.ts                 # JSBI-based square root (Babylonian method)
│   │   ├── validateAndParseAddress.ts # Ethereum address validation + checksumming
│   │   ├── index.ts                # Re-exports
│   │   └── *.test.ts               # Utility tests (4 test files)
│   │
│   ├── chains.ts                    # 29 ChainId enum values + SUPPORTED_CHAINS array
│   ├── constants.ts                 # TradeType, Rounding, MaxUint256, BigintIsh type
│   ├── addresses.ts                 # Cross-chain contract address maps (170+ lines)
│   ├── declarations.d.ts            # Third-party type declarations
│   ├── index.ts                     # Main export barrel (re-exports all public APIs)
│   └── [test files]                 # addresses.test.ts, currency.test.ts
│
├── package.json                      # TSDX build config, semantic-release setup
├── tsconfig.json                     # TypeScript compilation settings
├── .eslintrc.js                      # ESLint configuration
├── README.md                         # Package overview
└── CLAUDE.md                         # This file
```

**File Count Breakdown**:
- **Entities**: 15 files (10 source + 5 test)
- **Utils**: 9 files (5 source + 4 test)
- **Core modules**: 3 files (chains.ts, constants.ts, addresses.ts)
- **Config/Docs**: 8 files (package.json, tsconfig, eslint, readme, etc.)

## Core Concepts

### Currency Type Hierarchy

SDK Core defines a type hierarchy for representing different kinds of value on blockchains:

```
BaseCurrency (abstract base, 42 lines)
├── NativeCurrency (abstract, implements isNative=true)
│   └── Ether.onChain(chainId)  # Singleton factory per chain
└── Token (concrete, implements isToken=true)
    ├── Regular ERC-20 tokens
    └── WETH9 (special wrapped ETH case)

Exported as union:
type Currency = NativeCurrency | Token
```

**Key Design**:
- `BaseCurrency` enforces shared interface: `chainId`, `decimals`, `symbol`, `name`, `equals()`, `wrapped`
- `isNative` and `isToken` discriminator properties enable TypeScript type narrowing
- Prevents mixing currencies across chains (invariant checked at construction)
- All instances are immutable value objects

### Fraction Mathematics System

All numerical operations use JSBI (JavaScript BigInt polyfill) to avoid JavaScript's floating-point precision limits. This is critical for financial calculations with 18+ decimal places.

**Mathematics Hierarchy**:
```
Fraction (immutable numerator/denominator pair)
├── Arithmetic: add(), subtract(), multiply(), divide(), invert()
├── Comparison: lessThan(), equalTo(), greaterThan()
├── Access: quotient (integer division), remainder
└── Formatting: toSignificant(), toFixed()

CurrencyAmount extends Fraction
├── Adds currency context
├── Validates against MaxUint256
├── Returns currency-typed operations
└── Handles decimal scale conversions

Price extends Fraction
├── Represents base/quote currency exchange rate
├── quote() method converts amounts
├── invert() swaps base/quote

Percent extends Fraction
├── Denominator fixed to 10000 (basis points)
├── Used for slippage tolerance, fees
└── toSignificant(), toFixed() format as percentages
```

**Key Properties**:
- **Immutable**: All operations return new instances
- **Arbitrary precision**: JSBI handles 256-bit integers natively
- **Lazy reduction**: Fractions don't reduce numerator/denominator
- **Type-safe**: TypeScript generics prevent mixing unrelated currencies

### Chain Support Matrix

29 supported chains across production, testnet, and experimental deployments:

```
Mainnet Chains (13):
- Ethereum (1), Optimism (10), Arbitrum One (42161)
- Polygon (137), BNB (56), Avalanche (43114)
- Celo (42220), Base (8453), Gnosis (100)
- Moonbeam (1284), Zora (7777777)
- Rootstock (30), zkSync (324), MONAD (143)

Testnet Chains (11):
- Goerli (5), Sepolia (11155111)
- Optimism: Goerli (420), Sepolia (11155420)
- Arbitrum: Goerli (421613), Sepolia (421614)
- Polygon Mumbai (80001), Base: Goerli (84531), Sepolia (84532)
- Zora Sepolia (999999999), Unichain Sepolia (1301), Monad Testnet (10143)

Experimental/Emerging (5):
- Unichain (130), Worldchain (480)
- Blast (81457), Soneium (1868)

See: ChainId enum, SUPPORTED_CHAINS array in chains.ts
```

Each chain can have custom native currency (ETH, MATIC, CELO, etc.)

## Key Modules & APIs

### Entities Module (`entities/`)

#### BaseCurrency (abstract, 63 lines)
```typescript
export abstract class BaseCurrency {
  public abstract readonly isNative: boolean
  public abstract readonly isToken: boolean
  public readonly chainId: number
  public readonly decimals: number
  public readonly symbol?: string
  public readonly name?: string

  protected constructor(chainId, decimals, symbol?, name?)
  public abstract equals(other: Currency): boolean
  public abstract get wrapped(): Token
}
```

Used by: NativeCurrency (via inheritance), enforces interface contract

#### Currency Type (`currency.ts`, 4 lines)
```typescript
export type Currency = NativeCurrency | Token
```

Discriminated union. Use `currency.isNative` or `currency.isToken` for narrowing.

#### Token (`token.ts`, 85 lines)
```typescript
export class Token extends BaseCurrency {
  public readonly address: string  // Checksummed
  public readonly buyFeeBps?: BigNumber  // Fee-on-transfer support
  public readonly sellFeeBps?: BigNumber

  constructor(
    chainId: number,
    address: string,
    decimals: number,
    symbol?: string,
    name?: string,
    bypassChecksum?: boolean,
    buyFeeBps?: BigNumber,
    sellFeeBps?: BigNumber
  )

  public equals(other: Currency): boolean  // Address-based comparison
  public sortsBefore(other: Token): boolean  // For pair ordering
}
```

**Notes**:
- Address is checksummed unless `bypassChecksum=true`
- Supports fee-on-transfer tokens (e.g., USDT on some chains)
- `sortsBefore()` used by v2-sdk for canonical pair ordering
- Throws if currencies on different chains

#### Ether (`ether.ts`, 80 lines)
```typescript
export class Ether extends NativeCurrency {
  public static onChain(chainId: ChainId): Ether
  // Returns cached instance per chain
  // Symbol/name vary: ETH (Ethereum), MATIC (Polygon), etc.
}
```

Predefined for 29 supported chains. Use factory method for per-chain instances.

#### WETH9 (`weth9.ts`, 65 lines)
```typescript
export class WETH9 extends Token {
  public static onChain(chainId: ChainId): WETH9
  // Returns cached wrapped ether token for chain
}
```

Standard wrapped ETH implementations across chains.

#### Fraction (`fractions/fraction.ts`, 150 lines)
```typescript
export class Fraction {
  public readonly numerator: JSBI
  public readonly denominator: JSBI

  constructor(numerator: BigintIsh, denominator?: BigintIsh = 1)

  // Arithmetic (return new Fraction)
  public add(other: Fraction | BigintIsh): Fraction
  public subtract(other: Fraction | BigintIsh): Fraction
  public multiply(other: Fraction | BigintIsh): Fraction
  public divide(other: Fraction | BigintIsh): Fraction
  public invert(): Fraction

  // Comparison
  public lessThan(other: Fraction | BigintIsh): boolean
  public equalTo(other: Fraction | BigintIsh): boolean
  public greaterThan(other: Fraction | BigintIsh): boolean

  // Access
  public get quotient(): JSBI  // Floor division result
  public get remainder(): Fraction

  // Formatting
  public toSignificant(
    significantDigits?: number,
    format?: object,
    rounding?: Rounding
  ): string

  public toFixed(
    decimalPlaces?: number,
    format?: object,
    rounding?: Rounding
  ): string
}
```

**Implementation Details**:
- Uses JSBI for numerator/denominator storage
- Comparisons cross-multiply to avoid division
- Supports Rounding modes: ROUND_DOWN, ROUND_HALF_UP, ROUND_UP
- Formatting via decimal.js-light and big.js

#### CurrencyAmount (`fractions/currencyAmount.ts`, 105 lines)
```typescript
export class CurrencyAmount<T extends Currency> extends Fraction {
  public readonly currency: T
  public readonly decimalScale: JSBI  // 10^currency.decimals

  // Factory methods
  public static fromRawAmount<T extends Currency>(
    currency: T,
    rawAmount: BigintIsh
  ): CurrencyAmount<T>

  public static fromFractionalAmount<T extends Currency>(
    currency: T,
    numerator: BigintIsh,
    denominator: BigintIsh
  ): CurrencyAmount<T>

  // Arithmetic (returns CurrencyAmount<T>)
  public add(other: CurrencyAmount<T>): CurrencyAmount<T>
  public subtract(other: CurrencyAmount<T>): CurrencyAmount<T>
  public multiply(other: Fraction | BigintIsh): CurrencyAmount<T>
  public divide(other: Fraction | BigintIsh): CurrencyAmount<T>

  // Formatting (handles decimal places)
  public toSignificant(
    significantDigits?: number = 6,
    format?: object,
    rounding?: Rounding = ROUND_DOWN
  ): string

  public toFixed(
    decimalPlaces?: number = currency.decimals,
    format?: object,
    rounding?: Rounding = ROUND_DOWN
  ): string
}
```

**Key Features**:
- Enforces currency compatibility (invariant check on add/subtract)
- Automatic decimal scaling for display
- Validates quotient <= MaxUint256 (prevents overflow)
- Immutable operations return new CurrencyAmount

#### Price (`fractions/price.ts`, 120 lines)
```typescript
export class Price<
  TBaseCurrency extends Currency,
  TQuoteCurrency extends Currency
> extends Fraction {
  public readonly baseCurrency: TBaseCurrency
  public readonly quoteCurrency: TQuoteCurrency
  public readonly scalar: JSBI  // Decimal adjustment factor

  constructor(
    baseCurrency: TBaseCurrency,
    quoteCurrency: TQuoteCurrency,
    denominator: BigintIsh,  // Base amount
    numerator: BigintIsh      // Quote amount
  )

  public invert(): Price<TQuoteCurrency, TBaseCurrency>

  public multiply<TMultiplyQuoteCurrency extends Currency>(
    other: Price<TQuoteCurrency, TMultiplyQuoteCurrency>
  ): Price<TBaseCurrency, TMultiplyQuoteCurrency>

  public quote(amount: CurrencyAmount<TBaseCurrency>):
    CurrencyAmount<TQuoteCurrency>

  // Formatting
  public toSignificant(significantDigits?: number, format?: object, rounding?: Rounding): string
  public toFixed(decimalPlaces?: number, format?: object, rounding?: Rounding): string
}
```

**Usage Pattern**:
```typescript
// Create: 1 USDC = 1.01 DAI
const price = new Price(USDC, DAI, '1000000', '1010000000000000000')

// Convert: 100 USDC → ~101 DAI
const output = price.quote(CurrencyAmount.fromRawAmount(USDC, '100000000'))
```

#### Percent (`fractions/percent.ts`, 30 lines)
```typescript
export class Percent extends Fraction {
  constructor(numerator: BigintIsh, denominator: BigintIsh = 10000) {
    // Denominator defaults to basis points (10000 = 100%)
  }

  public toSignificant(significantDigits?: number, format?: object, rounding?: Rounding): string
  public toFixed(decimalPlaces?: number, format?: object, rounding?: Rounding): string
}
```

Basis points fraction for slippage tolerance, fees, etc.

### Utils Module (`utils/`)

#### computePriceImpact (`utils/computePriceImpact.ts`, 20 lines)
```typescript
export function computePriceImpact(
  spotPrice: Price<Currency, Currency>,
  executionPrice: Price<Currency, Currency>
): Percent

// Formula: (executionPrice - spotPrice) / spotPrice * -1
// Returns negative percent for worse execution, positive for better
```

#### sortedInsert (`utils/sortedInsert.ts`, 25 lines)
```typescript
export function sortedInsert<T>(
  items: T[],
  add: T,
  maxItems: number,
  compareFn: (a: T, b: T) => number
): T[]

// Inserts into sorted position, removes item at end if > maxItems
// Used for: maintaining top N routes/trades
```

#### validateAndParseAddress (`utils/validateAndParseAddress.ts`, 25 lines)
```typescript
export function validateAndParseAddress(address: string): string
// Validates hex string, returns checksummed address
// Throws if invalid format

export function checkValidAddress(address: string): string
// Lighter validation (42 chars, 0x prefix, hex only)
// No checksumming, for performance
```

#### sqrt (`utils/sqrt.ts`, 20 lines)
```typescript
export function sqrt(value: JSBI): JSBI
// Babylonian method for JSBI big integers
// Used in: liquidity calculations, tick math
```

#### computeZksyncCreate2Address (`utils/computeZksyncCreate2Address.ts`, 30 lines)
```typescript
export function computeZksyncCreate2Address(
  sender: string,
  bytecodeHash: string,
  salt: string,
  input: string
): string

// zkSync-specific CREATE2 address computation
// Different algorithm than Ethereum CREATE2
```

### Constants & Configuration

#### Chains (`chains.ts`, 78 lines)
```typescript
export enum ChainId {
  MAINNET = 1,
  GOERLI = 5,
  SEPOLIA = 11155111,
  OPTIMISM = 10,
  OPTIMISM_GOERLI = 420,
  OPTIMISM_SEPOLIA = 11155420,
  ARBITRUM_ONE = 42161,
  ARBITRUM_GOERLI = 421613,
  ARBITRUM_SEPOLIA = 421614,
  POLYGON = 137,
  POLYGON_MUMBAI = 80001,
  CELO = 42220,
  CELO_ALFAJORES = 44787,
  GNOSIS = 100,
  MOONBEAM = 1284,
  BNB = 56,
  AVALANCHE = 43114,
  BASE_GOERLI = 84531,
  BASE_SEPOLIA = 84532,
  BASE = 8453,
  ZORA = 7777777,
  ZORA_SEPOLIA = 999999999,
  ROOTSTOCK = 30,
  BLAST = 81457,
  ZKSYNC = 324,
  WORLDCHAIN = 480,
  UNICHAIN_SEPOLIA = 1301,
  UNICHAIN = 130,
  MONAD_TESTNET = 10143,
  SONEIUM = 1868,
  MONAD = 143,
}

export const SUPPORTED_CHAINS = [
  ChainId.MAINNET,
  ChainId.OPTIMISM,
  // ... 27 total
] as const

export type SupportedChainsType = (typeof SUPPORTED_CHAINS)[number]

export enum NativeCurrencyName {
  ETHER = 'ETH',
  MATIC = 'MATIC',
  CELO = 'CELO',
  GNOSIS = 'XDAI',
  MOONBEAM = 'GLMR',
  BNB = 'BNB',
  AVAX = 'AVAX',
  ROOTSTOCK = 'RBTC',
}
```

#### Constants (`constants.ts`, 18 lines)
```typescript
export type BigintIsh = JSBI | string | number

export enum TradeType {
  EXACT_INPUT,    // Swap exact input amount
  EXACT_OUTPUT    // Swap for exact output amount
}

export enum Rounding {
  ROUND_DOWN,      // Floor for worst-case (min output)
  ROUND_HALF_UP,   // Standard banker's rounding
  ROUND_UP         // Ceiling for worst-case (max input)
}

export const MaxUint256 = JSBI.BigInt(
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
)
```

#### Addresses (`addresses.ts`, 175 lines)
Cross-chain contract address registry:

```typescript
type AddressMap = { [chainId: number]: string }

// Uniswap V2
export const V2_FACTORY_ADDRESSES: AddressMap = {
  [ChainId.MAINNET]: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  [ChainId.ARBITRUM_ONE]: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
  // ... 10+ chains
}

export const V2_ROUTER_ADDRESSES: AddressMap = { ... }

// Uniswap V3
export const V3_CORE_FACTORY_ADDRESSES: AddressMap = { ... }
export const SWAP_ROUTER_ADDRESSES: AddressMap = { ... }
export const SWAP_ROUTER_02_ADDRESSES: AddressMap = { ... }
export const NONFUNGIBLE_POSITION_MANAGER_ADDRESSES: AddressMap = { ... }
export const TICK_LENS_ADDRESSES: AddressMap = { ... }

// Uniswap V4
export const V4_ADDRESSES: Record<ChainId, ChainAddresses> = { ... }

// Permit2 & Allowance transfers
export const PERMIT2_ADDRESS: AddressMap = { ... }

// ENS & Other
export const ENS_REGISTRAR_ADDRESSES: AddressMap = { ... }
export const UNISWAP_NFT_AIRDROP_CLAIM_ADDRESS = '0x8B799381ac40b838...'

// Legacy (deprecated)
export const V2_FACTORY_ADDRESS = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f' // Deprecated
```

## Public API & Exports

Main entry point (`src/index.ts`) re-exports:

```typescript
// From entities/
export * from './entities'  // Token, Currency, Ether, etc.

// From fractions/
export * from './entities/fractions'  // Fraction, CurrencyAmount, Price, Percent

// From utils/
export * from './utils'  // computePriceImpact, sortedInsert, etc.

// From config/
export * from './chains'    // ChainId, SUPPORTED_CHAINS, NativeCurrencyName
export * from './constants' // TradeType, Rounding, MaxUint256, BigintIsh
export * from './addresses' // V2_FACTORY_ADDRESSES, V3_CORE_FACTORY_ADDRESSES, etc.
```

## Integration Points with Other SDKs

SDK Core is imported and extended by all downstream SDKs:

```
v2-sdk: Uses Currency, Token, Fraction, TradeType, MaxUint256
  └─ Defines: Pair (currencies), Route, Trade

v3-sdk: Extends v2-sdk concepts with concentrated liquidity
  └─ Uses: Currency, Token, Price, Fraction, ChainId, V3_CORE_FACTORY_ADDRESSES
  └─ Defines: Pool, Position, TickList, Trade

v4-sdk: Extends v3-sdk for hooks-based pools
  └─ Uses: Pool from v3-sdk + v4-specific addresses
  └─ Adds: Hook validation, V4 pool ID computation

router-sdk: Aggregates v2, v3, v4 routing
  └─ Uses: Trade, Route from all version SDKs
  └─ Defines: MixedRoute (cross-version routing)

universal-router-sdk: Unified swap interface
  └─ Uses: Trade, CurrencyAmount for calldata generation
  └─ Uses: PERMIT2_ADDRESS for signature-based approvals

uniswapx-sdk: Off-chain order protocol
  └─ Uses: Currency, CurrencyAmount for order amounts
  └─ Uses: TradeType for order direction

permit2-sdk: Signature-based approvals
  └─ Uses: Token, CurrencyAmount for allowance tracking

smart-wallet-sdk: Account abstraction (EIP-7702)
  └─ Uses: Currency, CurrencyAmount, ChainId

flashtestations-sdk: TEE attestations for Unichain
  └─ Uses: ChainId for chain identification
```

## Development Workflow

### Building the Package

```bash
# In sdks/sdk-core directory
yarn build

# Output:
# - dist/index.js (CommonJS)
# - dist/sdk-core.esm.js (ES modules)
# - dist/index.d.ts (TypeScript declarations)
```

Build tool: TSDX v0.14.1 (abstracts TypeScript/rollup configuration)

### Running Tests

```bash
yarn test

# Test structure: Jest with ts-jest transformer
# Pattern: *.test.ts files co-located with source
# Coverage: Currency operations, fractions, utilities, addresses
```

### Linting & Formatting

```bash
yarn lint   # ESLint with strict max-warnings: 0 rule

# Configuration: eslint-config-react-app base
# Formatter: Prettier (120 char width, single quotes, no semicolons)
```

### Development Server (Watch Mode)

```bash
yarn start  # tsdx watch (compiles on file changes)
```

### Monorepo Commands (from root)

```bash
yarn g:build      # Build all packages respecting dependencies
yarn g:test       # Test all packages
yarn g:lint       # Lint all packages
yarn g:typecheck  # TypeScript type checking all packages
```

## Code Quality & Patterns

### Type Safety Guarantees

1. **Strict TypeScript**: All code uses `strict: true` config
2. **Currency Type Constraints**: Generic `T extends Currency` prevents mixing unrelated currencies
3. **Chain ID Validation**: Invariants prevent cross-chain operations
4. **Address Checksumming**: Token addresses checksummed by default
5. **Overflow Protection**: MaxUint256 validation on CurrencyAmount

### Immutability Pattern

```typescript
// All operations are pure functions returning new instances
const amount1 = CurrencyAmount.fromRawAmount(USDC, '100')
const amount2 = CurrencyAmount.fromRawAmount(USDC, '50')
const sum = amount1.add(amount2)  // Returns NEW CurrencyAmount
console.log(amount1.quotient)     // Still '100' (unchanged)
```

### Arbitrary Precision Arithmetic

```typescript
// JavaScript number (loses precision at 16+ digits)
const lost = 0.1 + 0.2  // 0.30000000000000004

// SDK Core Fraction (perfect precision)
const fraction = new Fraction('1', '10').add(new Fraction('2', '10'))
console.log(fraction.toFixed())  // Exactly '0.3'
```

### Generic Type Patterns

```typescript
// Currency-specific amounts (type-safe)
type USDCAmount = CurrencyAmount<Token>
type DAIAmount = CurrencyAmount<Token>

const usdc: USDCAmount = ...
const dai: DAIAmount = ...
// usdc.add(dai)  // TypeScript error: incompatible currency types

// Price type parameters track base/quote
type USDCDAIPrice = Price<Token, Token>
const price: USDCDAIPrice = new Price(USDC, DAI, ...)
```

### Validation with tiny-invariant

```typescript
import invariant from 'tiny-invariant'

// Runtime assertions with error messages
invariant(Number.isSafeInteger(chainId), 'CHAIN_ID')
invariant(decimals >= 0 && decimals < 255, 'DECIMALS')
invariant(this.currency.equals(other.currency), 'CURRENCY')

// Throws immediately if condition false, enables dead code elimination in production
```

## Conventions

### Naming Standards

- **Classes**: PascalCase (`Token`, `CurrencyAmount`, `Fraction`, `Percent`, `Price`)
- **Types**: PascalCase (`Currency`, `BigintIsh`)
- **Enums**: PascalCase type, UPPER_SNAKE_CASE members (`ChainId.MAINNET`, `TradeType.EXACT_INPUT`)
- **Constants**: UPPER_SNAKE_CASE (`V2_FACTORY_ADDRESSES`, `MaxUint256`, `SUPPORTED_CHAINS`)
- **Functions**: camelCase (`fromRawAmount`, `toSignificant`, `validateAndParseAddress`)
- **Private/Protected**: Same rules + optional leading underscore for very internal usage

### Code Organization

```
- Public entities exported from index.ts
- Internal utilities in utils/ subdirectories
- Test files co-located with source (file.ts + file.test.ts)
- No default exports (explicit named exports for tree-shaking)
- Index files re-export subdirectory contents
```

### Documentation Style

- JSDoc comments for public APIs
- Inline comments for non-obvious algorithms
- No comments for self-documenting code
- Type annotations preferred over runtime documentation

## Performance Characteristics

### Computational Complexity

- **Fraction.add/subtract**: O(1) cross-multiplication
- **Fraction.multiply/divide**: O(1) JSBI operations
- **Fraction.quotient**: O(1) integer division
- **CurrencyAmount operations**: O(1) with overhead from decimal scale
- **Comparison operators**: O(1) cross-multiplication without full division
- **Address validation**: O(1) format check + checksum validation

### Memory Usage

- **Fraction**: 2 JSBI references (48+ bytes each) = ~96+ bytes minimum
- **CurrencyAmount**: Fraction + Currency reference + decimalScale JSBI
- **Price**: 2 Fractions + 2 Currency references + scalar JSBI
- **Tokens**: Cached per chain (minimal memory footprint for repeated use)

### Optimization Recommendations

1. **Cache computations**: Ether, WETH9, commonly-used tokens are cached per chain
2. **Reuse fractions**: Create once and use multiple times (avoid repeated conversions)
3. **Batch operations**: Process multiple trades in single pass vs. individual calculations
4. **Avoid repeated formatting**: `.toFixed()` and `.toSignificant()` invoke Decimal.js (slow)
5. **Use quotient for checks**: Avoid `.toFixed()` for comparisons, use JSBI operations

## Dependencies & Vulnerabilities

### Production Dependencies (6)

| Package | Version | Purpose | Risk |
|---------|---------|---------|------|
| `@ethersproject/address` | ^5.0.2 | Address validation/checksumming | Low (maintained by ethers team) |
| `@ethersproject/bytes` | ^5.7.0 | Hex string handling | Low |
| `@ethersproject/keccak256` | 5.7.0 | Hash functions | Low |
| `@ethersproject/strings` | 5.7.0 | String utilities | Low |
| `jsbi` | ^3.1.4 | BigInt polyfill | Low (pure JS, no native deps) |
| `big.js` | ^5.2.2 | Decimal arithmetic | Low (pure JS) |
| `decimal.js-light` | ^2.5.0 | Decimal implementation | Low (pure JS) |
| `tiny-invariant` | ^1.1.0 | Assertion library | Low (3 lines of code) |
| `toformat` | ^2.0.0 | Number formatting | Low (pure JS) |

**Security Status**: No known vulnerabilities. All dependencies are pure JavaScript with no native dependencies. Safe for browser and Node.js environments.

## Changelog & Recent Updates

Recent commits (from git log):
1. **feat(sdk-core): monad add v4 addresses** (#428) - Added Monad V4 pool addresses
2. **chore(ci): Upgrade from node 18 to 20** (#411) - Build environment update
3. **feat(sdk-core): MONAD add chain** (#390) - Added Monad mainnet (chainId: 143)
4. **fix(sdk-core): add celo v4 addresses** (#397) - V4 support for Celo
5. **feat(sdk-core): support soneium** (#307) - New chain: Soneium (chainId: 1868)
6. **feat(v4-sdk, v3-sdk, v2-sdk): separate esm/cjs builds** (#226) - Build output improvements
7. **feat(sdk-core): v4 for L1** (#269) - V4 protocol expansion

**Trend**: Primarily adding new chain support and V4 contract addresses. Minimal API changes (backward compatible).

## Best Practices & Anti-Patterns

### Do's

✅ Use `CurrencyAmount` for all token amounts
```typescript
const amount = CurrencyAmount.fromRawAmount(token, '1000000')
```

✅ Use `.equals()` for currency comparison
```typescript
if (currency1.equals(currency2)) { ... }
```

✅ Cache token and Ether instances
```typescript
const USDC = new Token(ChainId.MAINNET, '0xA0b869...', 6)
// Reuse USDC throughout application
```

✅ Use appropriate rounding for user-facing amounts
```typescript
const minOutput = amount.multiply(new Fraction('1').subtract(slippage))
// ROUND_DOWN is default (safe for minimums)
```

✅ Validate addresses before creating tokens
```typescript
const address = validateAndParseAddress(addressString)
const token = new Token(chainId, address, decimals)
```

✅ Use type narrowing for currency discrimination
```typescript
if (currency.isNative) {
  // currency is NativeCurrency
} else {
  // currency is Token (has .address)
}
```

### Don'ts

❌ Never use JavaScript numbers for amounts
```typescript
// WRONG
const amount = 1.5  // Loses precision!
// RIGHT
const amount = CurrencyAmount.fromRawAmount(token, '1500000')
```

❌ Don't use `===` or `==` for currency comparison
```typescript
// WRONG
if (currency1 === currency2) { ... }
// RIGHT
if (currency1.equals(currency2)) { ... }
```

❌ Don't assume chain ID without checking
```typescript
// WRONG
const usdc = new Token(ChainId.MAINNET, '0xA0b869...')  // What if it's on Arbitrum?
// RIGHT
if (chainId === ChainId.MAINNET) {
  const usdc = new Token(chainId, MAINNET_USDC_ADDRESS, 6)
}
```

❌ Don't create new Fraction for simple operations
```typescript
// WRONG
for (const amount of amounts) {
  const total = total.add(new Fraction(amount))  // Repeated Fraction construction
}
// RIGHT
const scale = JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(decimals))
```

❌ Don't expose raw JSBI without wrapping
```typescript
// WRONG
const rawAmount = amount.quotient  // External code modifies?
// RIGHT
export methods that work with typed amounts
```

## Future Roadmap & Extensibility

### Potential Extensions

1. **New Chain Support**: Add ChainId enum entries, Ether instance, contract addresses
2. **Custom Native Currencies**: Inherit from NativeCurrency for chains with non-ETH native token
3. **Token Variants**: Extend Token for special cases (rebasing, vote-escrowed, etc.)
4. **Fee-on-Transfer**: Already supported (Token.buyFeeBps, Token.sellFeeBps)
5. **Yield-Bearing Tokens**: Could extend Token with underlying token reference

### Backward Compatibility

- All public APIs are immutable (methods return new instances)
- Adding new chain support doesn't break existing code
- Enum extensions are backward compatible if not used in switch statements

## Testing Strategy

### Test Coverage

**Unit Tests** (co-located with source):
- `fraction.test.ts` (125+ lines): Arithmetic, comparisons, formatting, rounding modes
- `currencyAmount.test.ts` (100+ lines): Factory methods, decimal scaling, overflow checks
- `price.test.ts` (75+ lines): Quote calculations, inversion, multiplication
- `percent.test.ts` (50+ lines): Basis points, formatting
- `token.test.ts` (60+ lines): Address validation, equality, sorting
- `ether.test.ts` (40+ lines): Per-chain singletons, native currency handling
- `computePriceImpact.test.ts` (50+ lines): Price impact calculations
- `sortedInsert.test.ts` (60+ lines): Array insertion, ordering
- `sqrt.test.ts` (35+ lines): Large number square roots
- `validateAndParseAddress.test.ts` (45+ lines): Address validation, checksumming
- `addresses.test.ts` (85+ lines): Cross-chain address registry completeness

**Test Framework**: Jest 25.5.0 with ts-jest transformer
**Coverage Target**: >95% for core math operations
**Regression Prevention**: All math operations validated against reference implementations

### Key Test Patterns

```typescript
// Precision testing
test('fraction addition preserves precision', () => {
  const f1 = new Fraction('1', '3')
  const f2 = new Fraction('1', '6')
  const sum = f1.add(f2)
  expect(sum.numerator).toEqual(JSBI.BigInt('1'))
  expect(sum.denominator).toEqual(JSBI.BigInt('2'))
})

// Type safety testing
test('currency amount enforces currency equality', () => {
  const amountUSDC = CurrencyAmount.fromRawAmount(USDC, '100')
  const amountDAI = CurrencyAmount.fromRawAmount(DAI, '100')
  expect(() => amountUSDC.add(amountDAI)).toThrow()
})

// Chain isolation testing
test('currencies from different chains cannot be mixed', () => {
  const tokenEth = new Token(ChainId.MAINNET, '0x...', 18)
  const tokenArb = new Token(ChainId.ARBITRUM_ONE, '0x...', 18)
  expect(() => new Price(tokenEth, tokenArb, '1', '1')).toThrow()
})
```

## Documentation Management

### Maintenance Guidelines

When updating this file:

1. **Add New Chain Support**:
   - Add ChainId enum value to chains.ts
   - Add to SUPPORTED_CHAINS array
   - Update contract addresses in addresses.ts
   - Update "Chain Support Matrix" section above
   - Document in changelog

2. **Add New Utility Function**:
   - Implement in utils/
   - Add unit tests (file.test.ts)
   - Export from utils/index.ts
   - Document in "Utils Module" section with signature
   - Include usage example

3. **Modify Core Entity**:
   - Update source file
   - Update tests
   - Document breaking changes prominently
   - Update "Key Modules" section
   - Update version per semantic-release rules

4. **General Updates**:
   - Keep timestamp at top current (update to today's date)
   - Verify code examples compile and run
   - Cross-reference with dependent SDKs (especially v2/v3/v4)
   - Test build succeeds: `yarn build && yarn test`

5. **Preserve Custom Additions**:
   - All user customizations between `<!-- CUSTOM:START -->` and `<!-- CUSTOM:END -->` markers are preserved during automated updates

<!-- CUSTOM:START -->
<!-- User additions preserved during updates -->
<!-- CUSTOM:END -->