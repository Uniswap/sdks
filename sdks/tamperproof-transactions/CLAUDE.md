# @uniswap/tamperproof-transactions

## Overview

Transaction security SDK (TWIST): DNS-based transaction signing verification to prevent supply chain attacks.

## Commands

- `yarn build` - Build CJS/ESM + browser bundle
- `yarn build:browser` - Browserify + terser minification
- `yarn test` - Run Jest tests
- `yarn lint` - ESLint check
- `yarn format` - Prettier format

## Dependencies

<!-- AUTO-GENERATED - Updated by /update-claude-md -->

- **dohjs** (^0.3.3) - DNS-over-HTTPS for TXT record lookup

## Key Files

- `src/generate.ts` - Generate signing keys
- `src/sign.ts` - Sign transaction data
- `src/verify.ts` - Verify signatures against DNS
- `src/utils/txtRecord.ts` - DNS TXT record parsing
- `src/utils/canonicalJson.ts` - Deterministic JSON serialization
- `src/algorithms.ts` - Supported crypto algorithms

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md`
to keep this documentation synchronized with the codebase.
