# @uniswap/router-sdk

## Overview

Unified routing SDK for swaps across Uniswap V2, V3, and V4 protocols with mixed route support.

## Commands

- `yarn build` - Build with tsdx
- `yarn test` - Run tests with tsdx
- `yarn lint` - ESLint check
- `yarn start` - Watch mode

## Dependencies

<!-- AUTO-GENERATED - Updated by /update-claude-md -->

- **@uniswap/sdk-core** - Core entities
- **@uniswap/v2-sdk** - V2 pairs and trades
- **@uniswap/v3-sdk** - V3 pools and trades
- **@uniswap/v4-sdk** - V4 pools and trades
- **@uniswap/swap-router-contracts** - Router ABIs

## Key Files

- `src/entities/trade.ts` - Multi-protocol trade abstraction
- `src/entities/route.ts` - Unified route across protocols
- `src/entities/mixedRoute/` - Routes mixing V2/V3/V4 hops
- `src/swapRouter.ts` - SwapRouter02 calldata
- `src/utils/encodeMixedRouteToPath.ts` - Path encoding

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md`
to keep this documentation synchronized with the codebase.
