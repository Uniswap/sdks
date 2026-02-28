# Uniswap SDKs Monorepo

## Overview

Yarn 3 workspaces monorepo containing TypeScript SDKs for building applications on Uniswap protocols (V2, V3, V4, UniswapX, Universal Router).

## Commands

- `yarn g:build` - Build all packages (turbo)
- `yarn g:test` - Run all tests (turbo)
- `yarn g:lint` - Lint all packages (turbo)
- `yarn g:typecheck` - Type-check all packages (turbo)
- `yarn g:release` - Release packages (semantic-release)
- `yarn sdk <package-name> <command>` - Run command in specific workspace

## Dependencies

<!-- AUTO-GENERATED - Updated by /update-claude-md -->

- **turbo** (1.10.16) - Monorepo build orchestration
- **semantic-release** - Automated versioning and publishing
- **@manypkg/cli** - Workspace dependency validation
- **husky** - Git hooks (pre-commit)

## Structure

- `sdks/sdk-core` - Core entities (Token, Currency, Fraction, etc.)
- `sdks/v2-sdk` - Uniswap V2 pools and trades
- `sdks/v3-sdk` - Uniswap V3 concentrated liquidity
- `sdks/v4-sdk` - Uniswap V4 hooks and singleton
- `sdks/router-sdk` - Multi-protocol swap routing
- `sdks/permit2-sdk` - Permit2 token approvals
- `sdks/uniswapx-sdk` - UniswapX order types and builders
- `sdks/universal-router-sdk` - Universal Router integration
- `sdks/smart-wallet-sdk` - Smart wallet batched calls
- `sdks/flashtestations-sdk` - Flashtestations verification
- `sdks/tamperproof-transactions` - Transaction signing security

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md`
to keep this documentation synchronized with the codebase.
