# @uniswap/v3-sdk

## Overview

SDK for Uniswap V3 concentrated liquidity: pools, positions, ticks, and swap routing with price range support.

## Commands

- `yarn build` - Build with tsdx
- `yarn test` - Run tests with tsdx
- `yarn lint` - ESLint check
- `yarn start` - Watch mode

## Dependencies

<!-- AUTO-GENERATED - Updated by /update-claude-md -->

- **@uniswap/sdk-core** - Core entities
- **@uniswap/v3-periphery** - Contract ABIs
- **@uniswap/swap-router-contracts** - SwapRouter02 integration
- **@ethersproject/abi** - ABI encoding

## Key Files

- `src/entities/pool.ts` - V3 pool with sqrtPrice and liquidity
- `src/entities/position.ts` - Liquidity position with tick range
- `src/entities/tick.ts` - Tick data and math
- `src/swapRouter.ts` - SwapRouter calldata generation
- `src/nonfungiblePositionManager.ts` - NFT position manager
- `src/utils/tickMath.ts` - Tick ↔ price conversions

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md`
to keep this documentation synchronized with the codebase.
