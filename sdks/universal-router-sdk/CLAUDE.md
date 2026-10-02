# @uniswap/universal-router-sdk

## Overview

SDK for Universal Router contract: unified interface for swaps, NFT trades, and multi-protocol interactions.

## Commands

- `yarn build` - Build with tsdx
- `yarn test` - Hardhat + Forge tests
- `yarn test:hardhat` - Hardhat tests only
- `yarn test:forge` - Forge tests only
- `yarn lint` - Prettier check
- `yarn docs` - Generate TypeDoc

## Dependencies

<!-- AUTO-GENERATED - Updated by /update-claude-md -->

- **@uniswap/universal-router** (2.1.0) - Contract ABIs
- **@uniswap/sdk-core** / **v2-sdk** / **v3-sdk** / **v4-sdk** - Protocol SDKs
- **@uniswap/router-sdk** - Routing logic
- **@uniswap/permit2-sdk** - Token approvals
- **ethers** (^5.7.0) - Ethereum interactions

## Key Files

- `src/swapRouter.ts` - Main router interface
- `src/entities/Command.ts` - Router command encoding
- `src/entities/actions/` - Uniswap swap actions
- `src/utils/routerCommands.ts` - Command type definitions
- `src/utils/routerTradeAdapter.ts` - Trade → commands adapter

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md`
to keep this documentation synchronized with the codebase.
