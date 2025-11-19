/**
 * Lock tag and lock ID encoding/decoding utilities
 */
import type { Address, Hex } from 'viem';
import { Scope, ResetPeriod } from '../types/runtime';
/**
 * Parts of a lock tag
 */
export interface LockTagParts {
    allocatorId: bigint;
    scope: Scope;
    resetPeriod: ResetPeriod;
}
/**
 * Encode a lock tag from its component parts
 * Lock tag is 12 bytes (96 bits) with the following layout:
 * - Bit 95 (leftmost): scope (1 bit)
 * - Bits 92-94: resetPeriod (3 bits)
 * - Bits 0-91: allocatorId (92 bits)
 *
 * This matches the contract implementation in IdLib.sol:
 * lockTag := or(or(shl(255, scope), shl(252, resetPeriod)), shl(160, allocatorId))
 *
 * Note: The contract uses uint256 positions (255, 252, 160) but when cast to bytes12,
 * this becomes (95, 92, 0) respectively.
 *
 * @param parts - The lock tag components
 * @returns The encoded lock tag as bytes12
 */
export declare function encodeLockTag(parts: LockTagParts): Hex;
/**
 * Decode a lock tag into its component parts
 * @param lockTag - The lock tag to decode (bytes12)
 * @returns The decoded lock tag parts
 */
export declare function decodeLockTag(lockTag: Hex): LockTagParts;
/**
 * Encode a lock ID from a lock tag and token address
 * Lock ID is the ERC6909 token ID: lockTag (12 bytes) || token (20 bytes) = 32 bytes
 *
 * @param lockTag - The lock tag (bytes12)
 * @param token - The token address (address)
 * @returns The lock ID as uint256
 */
export declare function encodeLockId(lockTag: Hex, token: Address): bigint;
/**
 * Decode a lock ID into its lock tag and token address
 * @param id - The lock ID (uint256)
 * @returns The lock tag and token address
 */
export declare function decodeLockId(id: bigint): {
    lockTag: Hex;
    token: Address;
};
