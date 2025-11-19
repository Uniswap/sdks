/**
 * EIP-712 type definitions for Compacts
 * These mirror the Solidity structs exactly
 */

/**
 * A commitment to lock a specific amount of a token
 */
export interface Lock {
  lockTag: `0x${string}` // bytes12
  token: `0x${string}` // address (or zero address for native)
  amount: bigint // uint256
}

/**
 * A single compact - commits to locking tokens for a specific arbiter
 */
export interface Compact {
  arbiter: `0x${string}` // address
  sponsor: `0x${string}` // address
  nonce: bigint // uint256
  expires: bigint // uint256 (timestamp)
  lockTag: `0x${string}` // bytes12
  token: `0x${string}` // address
  amount: bigint // uint256
}

/**
 * A batch compact - commits to multiple locks for a specific arbiter
 */
export interface BatchCompact {
  arbiter: `0x${string}` // address
  sponsor: `0x${string}` // address
  nonce: bigint // uint256
  expires: bigint // uint256 (timestamp)
  commitments: Lock[] // Lock[]
}

/**
 * An element in a multichain compact
 * Each element represents commitments on a specific chain with a specific arbiter
 */
export interface MultichainElement {
  arbiter: `0x${string}` // address
  chainId: bigint // uint256
  commitments: Lock[] // Lock[]
}

/**
 * A multichain compact - commits to locks across multiple chains
 */
export interface MultichainCompact {
  sponsor: `0x${string}` // address
  nonce: bigint // uint256
  expires: bigint // uint256 (timestamp)
  elements: MultichainElement[] // Element[]
}

/**
 * Type guard to check if a value is a Compact
 */
export function isCompact(value: any): value is Compact {
  return (
    value &&
    typeof value.arbiter === 'string' &&
    typeof value.sponsor === 'string' &&
    typeof value.nonce === 'bigint' &&
    typeof value.expires === 'bigint' &&
    typeof value.lockTag === 'string' &&
    typeof value.token === 'string' &&
    typeof value.amount === 'bigint'
  )
}

/**
 * Type guard to check if a value is a BatchCompact
 */
export function isBatchCompact(value: any): value is BatchCompact {
  return (
    value &&
    typeof value.arbiter === 'string' &&
    typeof value.sponsor === 'string' &&
    typeof value.nonce === 'bigint' &&
    typeof value.expires === 'bigint' &&
    Array.isArray(value.commitments)
  )
}

/**
 * Type guard to check if a value is a MultichainCompact
 */
export function isMultichainCompact(value: any): value is MultichainCompact {
  return (
    value &&
    typeof value.sponsor === 'string' &&
    typeof value.nonce === 'bigint' &&
    typeof value.expires === 'bigint' &&
    Array.isArray(value.elements)
  )
}
