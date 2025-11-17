"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.componentsHash = componentsHash;
exports.idsAndAmountsHash = idsAndAmountsHash;
exports.claimHash = claimHash;
exports.batchClaimHash = batchClaimHash;
const viem_1 = require("viem");
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
function componentsHash(components) {
    if (components.length === 0) {
        return (0, viem_1.keccak256)('0x');
    }
    // Hash each component: keccak256(abi.encode(claimant, amount))
    const componentHashes = components.map((component) => {
        const encoded = (0, viem_1.encodeAbiParameters)([
            { name: 'claimant', type: 'uint256' },
            { name: 'amount', type: 'uint256' },
        ], [component.claimant, component.amount]);
        return (0, viem_1.keccak256)(encoded);
    });
    // Concatenate all hashes and hash the result
    return (0, viem_1.keccak256)((0, viem_1.concat)(componentHashes));
}
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
function idsAndAmountsHash(idsAndAmounts) {
    if (idsAndAmounts.length === 0) {
        return (0, viem_1.keccak256)('0x');
    }
    // Hash each id/amount pair: keccak256(abi.encode(id, amount))
    const pairHashes = idsAndAmounts.map((pair) => {
        const encoded = (0, viem_1.encodeAbiParameters)([
            { name: 'id', type: 'uint256' },
            { name: 'amount', type: 'uint256' },
        ], [pair.id, pair.amount]);
        return (0, viem_1.keccak256)(encoded);
    });
    // Concatenate all hashes and hash the result
    return (0, viem_1.keccak256)((0, viem_1.concat)(pairHashes));
}
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
function claimHash(claim) {
    return (0, viem_1.keccak256)((0, viem_1.encodeAbiParameters)([
        { name: 'sponsor', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expires', type: 'uint256' },
        { name: 'witness', type: 'bytes32' },
        { name: 'id', type: 'uint256' },
        { name: 'allocatedAmount', type: 'uint256' },
    ], [claim.sponsor, claim.nonce, claim.expires, claim.witness, claim.id, claim.allocatedAmount]));
}
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
function batchClaimHash(claim) {
    // Extract id and allocatedAmount from claim components
    const idsAndAmounts = claim.claims.map((c) => ({
        id: c.id,
        amount: c.allocatedAmount,
    }));
    const idsAndAmountsHashValue = idsAndAmountsHash(idsAndAmounts);
    return (0, viem_1.keccak256)((0, viem_1.encodeAbiParameters)([
        { name: 'sponsor', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expires', type: 'uint256' },
        { name: 'witness', type: 'bytes32' },
        { name: 'idsAndAmountsHash', type: 'bytes32' },
    ], [claim.sponsor, claim.nonce, claim.expires, claim.witness, idsAndAmountsHashValue]));
}
//# sourceMappingURL=hashes.js.map