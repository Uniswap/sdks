# @uniswap/smart-wallet-sdk

## Overview

SDK for smart wallet interactions on Uniswap: batched calls, delegations, and ERC-4337 compatible operations.

## Commands

- `yarn build` - Build CJS/ESM/types
- `yarn test` - Run Jest tests
- `yarn lint` - ESLint check
- `yarn clean` - Remove dist/

## Dependencies

<!-- AUTO-GENERATED - Updated by /update-claude-md -->

- **@uniswap/sdk-core** - Core entities
- **viem** (^2.23.5) - Modern Ethereum client

## Key Files

- `src/smartWallet.ts` - Main smart wallet interface
- `src/utils/callPlanner.ts` - Single call encoding
- `src/utils/batchedCallPlanner.ts` - Multi-call batching
- `src/utils/delegation.ts` - Delegation signatures
- `src/constants.ts` - Contract addresses
- `src/types.ts` - TypeScript interfaces

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md`
to keep this documentation synchronized with the codebase.
