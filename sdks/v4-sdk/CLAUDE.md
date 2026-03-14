# @uniswap/v4-sdk

## Overview

SDK for Uniswap V4 singleton pool architecture with hooks support, position management, and V4-specific routing.

## Commands

- `yarn build` - Build with tsdx
- `yarn test` - Run tests with tsdx
- `yarn lint` - ESLint check
- `yarn start` - Watch mode

## Dependencies

<!-- AUTO-GENERATED - Updated by /update-claude-md -->

- **@uniswap/sdk-core** - Core entities
- **@uniswap/v3-sdk** - Shared pool/position logic
- **@ethersproject/solidity** - ABI encoding
- **tiny-invariant** - Runtime assertions

## Key Files

- `src/entities/pool.ts` - V4 pool with hooks address
- `src/entities/position.ts` - V4 liquidity positions
- `src/entities/route.ts` - Route through V4 pools
- `src/PositionManager.ts` - Position NFT management
- `src/utils/v4Planner.ts` - Action batching for V4
- `src/utils/hook.ts` - Hook address utilities

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md`
to keep this documentation synchronized with the codebase.
