/**
 * Hash computation utilities for The Compact protocol
 *
 * This module provides hash computation functions for claims and their components.
 * These are content hashes used for claim identification, not EIP-712 signature hashes.
 *
 * For EIP-712 structured data signing, use viem's `hashTypedData` function with
 * the appropriate type definitions from `../types/eip712`.
 *
 * @example
 * ```typescript
 * import { hashTypedData } from 'viem'
 * import { createDomain } from '../config/domain'
 *
 * // For EIP-712 signature hashing, use viem's hashTypedData:
 * const domain = createDomain({ chainId: 1, contractAddress: '0x...' })
 * const compactHash = hashTypedData({
 *   domain,
 *   types: compactTypes,
 *   primaryType: 'Compact',
 *   message: compact
 * })
 *
 * // For claim content hashes (identification), use the functions in this module:
 * const claim = { sponsor, nonce, expires, witness, id, allocatedAmount, ... }
 * const contentHash = claimHash(claim)
 * ```
 */
import { type Hex } from 'viem';
import type { Component, Claim, BatchClaim } from '../types/claims';
/**
 * Compute hash of component array (claimants with amounts)
 *
 * Used internally by claim builders. Matches Solidity's componentsHash computation:
 * - Hash each component: keccak256(abi.encode(claimant, amount))
 * - Concatenate all hashes
 * - Hash the concatenation
 *
 * @param components - Array of components to hash
 * @returns The components hash
 *
 * @internal
 */
export declare function componentsHash(components: readonly Component[]): Hex;
/**
 * Compute hash of id and amount pairs
 *
 * Used internally for batch claims. Matches Solidity's idsAndAmountsHash computation:
 * - Hash each pair: keccak256(abi.encode(id, amount))
 * - Concatenate all hashes
 * - Hash the concatenation
 *
 * @param idsAndAmounts - Array of {id, amount} pairs to hash
 * @returns The hash
 *
 * @internal
 */
export declare function idsAndAmountsHash(idsAndAmounts: readonly {
    id: bigint;
    amount: bigint;
}[]): Hex;
/**
 * Compute content hash for a single claim
 *
 * This is a simplified hash used for claim identification, not the full EIP-712 hash.
 * Hashes the core claim parameters: sponsor, nonce, expires, witness, id, and allocatedAmount.
 *
 * @param claim - The claim to hash
 * @returns The claim content hash
 *
 * @example
 * ```typescript
 * const claim = {
 *   sponsor: '0x...',
 *   nonce: 1n,
 *   expires: BigInt(Date.now() + 3600000),
 *   witness: '0x0000000000000000000000000000000000000000000000000000000000000000',
 *   id: 12345n,
 *   allocatedAmount: 1000000n,
 *   // ... other fields
 * }
 * const hash = claimHash(claim)
 * ```
 */
export declare function claimHash(claim: Claim): Hex;
/**
 * Compute content hash for a batch claim
 *
 * This is a simplified hash used for claim identification, not the full EIP-712 hash.
 * Hashes the core batch claim parameters: sponsor, nonce, expires, witness, and idsAndAmountsHash.
 *
 * @param claim - The batch claim to hash
 * @returns The batch claim content hash
 *
 * @example
 * ```typescript
 * const claim = {
 *   sponsor: '0x...',
 *   nonce: 1n,
 *   expires: BigInt(Date.now() + 3600000),
 *   witness: '0x0000000000000000000000000000000000000000000000000000000000000000',
 *   claims: [{ id: 100n, allocatedAmount: 1000000n, portions: [...] }],
 *   // ... other fields
 * }
 * const hash = batchClaimHash(claim)
 * ```
 */
export declare function batchClaimHash(claim: BatchClaim): Hex;
