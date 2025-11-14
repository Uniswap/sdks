/**
 * Hash computation utilities for claims and compacts
 * These functions compute hashes consistent with the on-chain Solidity implementations
 *
 * NOTE: These implementations follow the general patterns from the contract but should
 * be validated against the actual on-chain implementations in ClaimProcessorLib.sol
 */

import { keccak256, encodeAbiParameters, encodePacked, concat } from 'viem'
import { Claim, BatchClaim, Component, IdAndAmount } from '../types/claims'
import { Compact, BatchCompact, MultichainCompact } from '../types/eip712'

/**
 * Compute the hash of a claim
 * This should match the on-chain claimHash computation
 * @param claim - The claim to hash
 * @returns The claim hash
 */
export function claimHash(claim: Claim): `0x${string}` {
  // Hash the claim parameters following the contract's pattern
  // The contract hashes: sponsor, nonce, expires, witness, id, allocatedAmount
  const encoded = encodeAbiParameters(
    [
      { name: 'sponsor', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expires', type: 'uint256' },
      { name: 'witness', type: 'bytes32' },
      { name: 'id', type: 'uint256' },
      { name: 'allocatedAmount', type: 'uint256' },
    ],
    [claim.sponsor, claim.nonce, claim.expires, claim.witness, claim.id, claim.allocatedAmount]
  )
  return keccak256(encoded)
}

/**
 * Compute the hash of a batch claim
 * @param claim - The batch claim to hash
 * @returns The batch claim hash
 */
export function batchClaimHash(claim: BatchClaim): `0x${string}` {
  // Compute hash of idsAndAmounts array
  const idsAndAmountsHashValue = idsAndAmountsHash(claim.idsAndAmounts)

  // Hash the batch claim parameters
  const encoded = encodeAbiParameters(
    [
      { name: 'sponsor', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expires', type: 'uint256' },
      { name: 'witness', type: 'bytes32' },
      { name: 'idsAndAmountsHash', type: 'bytes32' },
    ],
    [claim.sponsor, claim.nonce, claim.expires, claim.witness, idsAndAmountsHashValue]
  )
  return keccak256(encoded)
}

/**
 * Compute the hash of an array of components
 * Hashes each component and then hashes the concatenated hashes
 * @param components - The components to hash
 * @returns The components hash
 */
export function componentsHash(components: Component[]): `0x${string}` {
  if (components.length === 0) {
    return keccak256('0x')
  }

  // Hash each component: keccak256(abi.encode(component.claimant, component.amount))
  const componentHashes = components.map((component) => {
    const encoded = encodeAbiParameters(
      [
        { name: 'claimant', type: 'uint256' },
        { name: 'amount', type: 'uint256' },
      ],
      [component.claimant, component.amount]
    )
    return keccak256(encoded)
  })

  // Concatenate all hashes and hash the result
  const concatenated = concat(componentHashes as `0x${string}`[])
  return keccak256(concatenated)
}

/**
 * Compute the hash of an array of id and amount pairs
 * Hashes each pair and then hashes the concatenated hashes
 * @param idsAndAmounts - The id and amount pairs to hash
 * @returns The hash
 */
export function idsAndAmountsHash(idsAndAmounts: Array<{ id: bigint; amount: bigint }>): `0x${string}` {
  if (idsAndAmounts.length === 0) {
    return keccak256('0x')
  }

  // Hash each id/amount pair: keccak256(abi.encode(id, amount))
  const pairHashes = idsAndAmounts.map((pair) => {
    const encoded = encodeAbiParameters(
      [
        { name: 'id', type: 'uint256' },
        { name: 'amount', type: 'uint256' },
      ],
      [pair.id, pair.amount]
    )
    return keccak256(encoded)
  })

  // Concatenate all hashes and hash the result
  const concatenated = concat(pairHashes as `0x${string}`[])
  return keccak256(concatenated)
}

/**
 * Compute the EIP-712 struct hash for a Compact
 * Note: This is a placeholder - actual implementation would use viem's hashTypedData
 * @param compact - The compact to hash
 * @returns The struct hash
 */
export function compactStructHash(compact: Compact): `0x${string}` {
  // This would use the full EIP-712 hashing with domain separator
  // For now, this is a placeholder
  throw new Error('compactStructHash not yet implemented - use viem hashTypedData')
}

/**
 * Compute the EIP-712 struct hash for a BatchCompact
 * @param compact - The batch compact to hash
 * @returns The struct hash
 */
export function batchCompactStructHash(compact: BatchCompact): `0x${string}` {
  throw new Error('batchCompactStructHash not yet implemented - use viem hashTypedData')
}

/**
 * Compute the EIP-712 struct hash for a MultichainCompact
 * @param compact - The multichain compact to hash
 * @returns The struct hash
 */
export function multichainCompactStructHash(compact: MultichainCompact): `0x${string}` {
  throw new Error('multichainCompactStructHash not yet implemented - use viem hashTypedData')
}

