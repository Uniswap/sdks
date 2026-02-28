# flashtestations-sdk

## Overview

SDK for Flashtestations: TEE workload verification, attestation events, and block validation on Unichain.

## Commands

- `yarn build` - Build CJS/ESM/types
- `yarn test` - Run Jest tests
- `yarn lint` - ESLint check
- `yarn clean` - Remove dist/

## Dependencies

<!-- AUTO-GENERATED - Updated by /update-claude-md -->

- **viem** (^2.23.5) - Ethereum client for RPC calls

## Key Files

- `src/verification/service.ts` - Attestation verification
- `src/crypto/workload.ts` - Workload ID computation
- `src/rpc/client.ts` - RPC client for attestation queries
- `src/config/chains.ts` - Supported chain configurations
- `src/types/` - TypeScript interfaces and validation
- `examples/` - Usage examples

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md`
to keep this documentation synchronized with the codebase.
