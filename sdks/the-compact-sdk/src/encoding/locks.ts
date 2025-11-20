/**
 * Lock tag and lock ID encoding/decoding utilities
 */

import invariant from 'tiny-invariant'
import type { Address, Hex } from 'viem'

import { Scope, ResetPeriod } from '../types/runtime'

/**
 * Compute the compact flag for an allocator address
 *
 * The compact flag is a 4-bit value (0-15) that encodes information about
 * the position of significant bits in the upper portion of an address.
 * This Compact uses this flag to "compress" allocator addresses.
 *
 * @param allocator - The allocator address
 * @returns The 4-bit compact flag (0-15)
 *
 * @example
 * '0x0000000000000000000000000000000000000000' → flag = 15 (all zeros)
 * '0x00000000000000171ede64904551eeDF3C6C9788' → flag ≈ 14 (many leading zeros)
 * '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF' → flag = 0 (no leading zeros)
 */
export function toCompactFlag(allocator: Address): number {
  // An address is 160 bits = 40 hex nibbles
  // We examine the upper portion, excluding the lower 88 bits (22 nibbles)
  // Upper portion = 40 - 22 = 18 nibbles (72 bits)
  const upperNibbles = allocator.slice(2, 20)

  // Count consecutive leading zeros in the upper portion using regex
  const leadingZeroCount = upperNibbles.match(/^0*/)?.[0]?.length ?? 0

  // Map leading zeros to compact flag (0-15)
  // Formula: (leadingZeros / 18) * 16, capped at 15
  // Linear mapping: 0 zeros → flag 0, 18 zeros → flag 15
  const compactFlag = leadingZeroCount < 4 ? 0 : Math.min(leadingZeroCount - 3, 15)
  return compactFlag
}

/**
 * Convert an allocator address to its allocator ID representation
 * The allocator ID is a uint96 value that combines:
 * - Upper 4 bits: compact flag (computed from address)
 * - Lower 92 bits: lower 88 bits of the address
 *
 * When used in a lock tag, only the lower 92 bits are stored (the compact flag
 * can be recomputed from the address when needed).
 *
 * Matches the Solidity implementation in IdLib.sol:toAllocatorId
 *
 * @param allocator - The allocator address
 * @returns The allocator ID as a uint96 (bigint with max 96 bits)
 *
 * @example
 * ```typescript
 * const allocatorId = allocatorToAllocatorId('0x1234567890123456789012345678901234567890')
 * // Use in lock tag encoding
 * const lockTag = encodeLockTag({
 *   allocatorId,
 *   scope: Scope.Multichain,
 *   resetPeriod: ResetPeriod.TenMinutes
 * })
 * ```
 */
export function allocatorToAllocatorId(allocator: Address): bigint {
  // Validate input
  const allocatorHex = allocator.slice(2).toLowerCase()
  invariant(allocatorHex.length === 40, 'allocator must be a valid address (20 bytes)')

  const compactFlag = BigInt(toCompactFlag(allocator))
  const addressBits = BigInt(allocator)

  // Extract lower 88 bits of address
  // In Solidity: shr(168, shl(168, allocator))
  const lower88Bits = addressBits & ((1n << 88n) - 1n)

  // Combine: (compactFlag << 88) | lower88Bits
  // In Solidity: or(shl(88, compactFlag), shr(168, shl(168, allocator)))
  const allocatorId = (compactFlag << 88n) | lower88Bits

  // Validate result fits in 96 bits
  invariant(allocatorId < 2n ** 96n, 'allocatorId must fit in 96 bits')

  return allocatorId
}

/**
 * Parts of a lock tag
 */
export interface LockTagParts {
  allocatorId: bigint // uint96 (but only uses 92 bits in the lockTag)
  scope: Scope // 1 bit
  resetPeriod: ResetPeriod // 3 bits (enum 0-7)
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
export function encodeLockTag(parts: LockTagParts): Hex {
  const { allocatorId, scope, resetPeriod } = parts

  // Validate allocatorId fits in 92 bits (4 bits for compact flag + 88 bits from address)
  invariant(allocatorId >= 0n && allocatorId < 2n ** 92n, 'allocatorId must fit in 92 bits')

  // Validate scope and resetPeriod
  invariant(scope === Scope.ChainSpecific || scope === Scope.Multichain, 'Invalid scope')
  invariant(resetPeriod >= 0 && resetPeriod <= 7, 'Invalid reset period')

  // Pack according to contract layout:
  // - scope at bit 95 (shl 95)
  // - resetPeriod at bits 92-94 (shl 92)
  // - allocatorId at bits 0-91
  const scopeBits = BigInt(scope) << 95n
  const resetPeriodBits = BigInt(resetPeriod) << 92n
  const packed = scopeBits | resetPeriodBits | allocatorId

  // Convert to hex and pad to 12 bytes (24 hex chars)
  const hex = packed.toString(16).padStart(24, '0')
  return `0x${hex}` as Hex
}

/**
 * Decode a lock tag into its component parts
 * @param lockTag - The lock tag to decode (bytes12)
 * @returns The decoded lock tag parts
 */
export function decodeLockTag(lockTag: Hex): LockTagParts {
  // Remove 0x prefix and validate length
  const hex = lockTag.slice(2)
  invariant(hex.length === 24, 'lockTag must be 12 bytes (24 hex chars)')

  const packed = BigInt(lockTag)

  // Extract components according to contract layout:
  // - Bit 95: scope
  // - Bits 92-94: resetPeriod
  // - Bits 0-91: allocatorId
  const allocatorId = packed & ((1n << 92n) - 1n)
  const resetPeriod = Number((packed >> 92n) & 0x7n) as ResetPeriod // 3 bits = 0x7
  const scope = Number((packed >> 95n) & 0x1n) as Scope // 1 bit = 0x1

  return {
    allocatorId,
    scope,
    resetPeriod,
  }
}

/**
 * Encode a lock ID from a lock tag and token address
 * Lock ID is the ERC6909 token ID: lockTag (12 bytes) || token (20 bytes) = 32 bytes
 *
 * @param lockTag - The lock tag (bytes12)
 * @param token - The token address (address)
 * @returns The lock ID as uint256
 */
export function encodeLockId(lockTag: Hex, token: Address): bigint {
  // Validate inputs
  const lockTagHex = lockTag.slice(2)
  invariant(lockTagHex.length === 24, 'lockTag must be 12 bytes')

  const tokenHex = token.slice(2).toLowerCase()
  invariant(tokenHex.length === 40, 'token must be 20 bytes (address)')

  // Concatenate: lockTag (12 bytes) in upper bits, token (20 bytes) in lower bits
  const lockTagBits = BigInt(lockTag) << 160n
  const tokenBits = BigInt(token)

  return lockTagBits | tokenBits
}

/**
 * Decode a lock ID into its lock tag and token address
 * @param id - The lock ID (uint256)
 * @returns The lock tag and token address
 */
export function decodeLockId(id: bigint): { lockTag: Hex; token: Address } {
  // Extract token (lower 160 bits / 20 bytes)
  const token = id & ((1n << 160n) - 1n)
  const tokenHex = token.toString(16).padStart(40, '0')

  // Extract lockTag (upper 96 bits / 12 bytes)
  const lockTag = id >> 160n
  const lockTagHex = lockTag.toString(16).padStart(24, '0')

  return {
    lockTag: `0x${lockTagHex}` as Hex,
    token: `0x${tokenHex}` as Address,
  }
}
