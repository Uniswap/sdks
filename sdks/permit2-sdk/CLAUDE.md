# @uniswap/permit2-sdk

## Overview

SDK for interacting with Permit2 contract: signature-based token approvals and transfers with nonce management.

## Commands

- `yarn build` - Build CJS/ESM/types
- `yarn test` - Run Jest tests
- `yarn lint` - Prettier check
- `yarn clean` - Remove dist/

## Dependencies

<!-- AUTO-GENERATED - Updated by /update-claude-md -->

- **ethers** (^5.7.0) - Ethereum interactions
- **tiny-invariant** - Runtime assertions

## Key Files

- `src/allowanceTransfer.ts` - Allowance-based permits (EIP-2612 style)
- `src/signatureTransfer.ts` - Signature-based one-time transfers
- `src/domain.ts` - EIP-712 domain construction
- `src/constants.ts` - Permit2 addresses by chain
- `src/providers/` - AllowanceProvider, SignatureProvider

## Auto-Update Instructions

After changes to files in this directory or subdirectories, run `/update-claude-md`
to keep this documentation synchronized with the codebase.
