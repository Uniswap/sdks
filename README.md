# Uniswap SDK

A unified SDK for interacting with Uniswap protocols. The SDK consolidates all Uniswap SDK packages into a single package with subpath exports.

## Installation

```bash
npm install @uniswap/sdk
# or
yarn add @uniswap/sdk
```

## Usage

Import from subpaths based on your needs:

```typescript
// Core types and utilities
import { ChainId, Token, CurrencyAmount } from '@uniswap/sdk/core'

// Protocol-specific imports
import { Pool, Position } from '@uniswap/sdk/v3'
import { Pool as V4Pool } from '@uniswap/sdk/v4'
import { Pair } from '@uniswap/sdk/v2'

// Router and Universal Router
import { SwapRouter } from '@uniswap/sdk/router'
import { SwapRouter as UniversalRouter } from '@uniswap/sdk/universal-router'

// Other modules
import { AllowanceProvider } from '@uniswap/sdk/permit2'
import { DutchOrder } from '@uniswap/sdk/uniswapx'
import { SmartWallet } from '@uniswap/sdk/smart-wallet'
```

## Development Commands

```bash
# Clone
git clone https://github.com/Uniswap/sdks.git

# Install
yarn

# Build
yarn g:build

# Typecheck
yarn g:typecheck

# Lint
yarn g:lint

# Test
yarn g:test

# Run commands for the SDK workspace
yarn sdk @uniswap/sdk {command}
```

## Publishing

Publishing is done automatically on merge to main using semantic-release. PR titles / commits follow Angular conventional commits:

```
- fix(sdk): will trigger a patch version
- feat(sdk): will trigger a minor version
- feat(breaking): will trigger a major version for a breaking change
- chore(sdk): will not trigger a release
```
