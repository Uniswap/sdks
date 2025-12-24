# UniswapX SDK Integration Tests

## Overview

Hardhat-based integration tests for UniswapX SDK against forked mainnet and local deployments.

## Commands

- `yarn test` - Run all integration tests
- `yarn hardhat test` - Run with Hardhat directly

## Key Files

- `test/DutchOrder.spec.ts` - Dutch order execution tests
- `test/V2DutchOrder.spec.ts` - V2 Dutch order tests
- `test/V3DutchOrder.spec.ts` - V3 Dutch order tests
- `test/PriorityOrder.spec.ts` - Priority order tests
- `test/RelayOrder.spec.ts` - Relay order tests
- `test/OrderValidator.spec.ts` - Validation tests
- `test/NonceManager.spec.ts` - Nonce management tests
- `hardhat.config.ts` - Hardhat configuration

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md`
to keep this documentation synchronized with the codebase.
