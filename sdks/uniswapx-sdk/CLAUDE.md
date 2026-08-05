# @uniswap/uniswapx-sdk

## Overview

SDK for UniswapX protocol: Dutch auction orders, priority orders, relay orders with builders and validators.

## Commands

- `yarn build` - Build CJS/ESM/types + typechain
- `yarn test` - Run unit + integration tests
- `yarn test:unit` - Unit tests only
- `yarn test:integration` - Integration tests (in ./integration)
- `yarn lint` - ESLint check
- `yarn typechain` - Generate contract types

## Dependencies

<!-- AUTO-GENERATED - Updated by /update-claude-md -->

- **ethers** (^5.7.0) - Ethereum interactions
- **@uniswap/permit2-sdk** - Permit2 signatures
- **@uniswap/sdk-core** - Core entities
- **@ethersproject/bytes** / **providers** - Low-level utilities

## Key Files

- `src/order/` - Order types: DutchOrder, V2/V3DutchOrder, PriorityOrder, RelayOrder
- `src/builder/` - Order builders for each type
- `src/trade/` - Trade wrappers for order types
- `src/utils/OrderValidator.ts` - On-chain order validation
- `src/utils/OrderQuoter.ts` - Quote resolution
- `src/utils/dutchDecay.ts` - Price decay calculations

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md`
to keep this documentation synchronized with the codebase.
