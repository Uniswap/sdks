# @uniswap/v2-sdk

## Overview

SDK for building applications on Uniswap V2, providing pair/route/trade entities and router calldata generation.

## Commands

- `yarn build` - Build with tsdx
- `yarn test` - Run tests with tsdx
- `yarn lint` - ESLint check
- `yarn start` - Watch mode

## Dependencies

<!-- AUTO-GENERATED - Updated by /update-claude-md -->

- **@uniswap/sdk-core** - Core entities (Token, Currency, etc.)
- **@ethersproject/address** - Address checksum utilities
- **@ethersproject/solidity** - Keccak256 for pair addresses
- **tiny-invariant** / **tiny-warning** - Runtime checks

## Key Files

- `src/entities/pair.ts` - V2 pair with reserves and pricing
- `src/entities/route.ts` - Multi-hop route through pairs
- `src/entities/trade.ts` - Trade with input/output amounts
- `src/router.ts` - Calldata generation for Router02

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md`
to keep this documentation synchronized with the codebase.
