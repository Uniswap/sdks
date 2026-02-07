# @uniswap/sdk-core

## Overview

Core SDK providing foundational entities for Uniswap V3+ applications: tokens, currencies, fractions, and price calculations.

## Commands

- `yarn build` - Build with tsdx
- `yarn test` - Run tests with tsdx
- `yarn lint` - ESLint check
- `yarn start` - Watch mode

## Dependencies

<!-- AUTO-GENERATED - Updated by /update-claude-md -->

- **@ethersproject/address** - Ethereum address utilities
- **jsbi** - BigInt for cross-browser support
- **big.js** / **decimal.js-light** - Precision math
- **tiny-invariant** - Runtime assertions

## Key Files

- `src/entities/token.ts` - ERC20 token representation
- `src/entities/currency.ts` - Native + token currency base
- `src/entities/fractions/` - Fraction, Percent, Price, CurrencyAmount
- `src/chains.ts` - Chain ID definitions
- `src/addresses.ts` - Contract addresses by chain

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md`
to keep this documentation synchronized with the codebase.
