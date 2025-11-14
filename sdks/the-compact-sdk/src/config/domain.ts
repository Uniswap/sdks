/**
 * EIP-712 domain configuration for The Compact
 */

/**
 * EIP-712 domain for The Compact v1
 */
export interface CompactDomain {
  name: 'TheCompact'
  version: '1'
  chainId: number
  verifyingContract: `0x${string}`
}

/**
 * Create an EIP-712 domain for The Compact
 * @param params - Chain ID and contract address
 * @returns The EIP-712 domain object
 */
export function createDomain(params: { chainId: number; contractAddress: `0x${string}` }): CompactDomain {
  return {
    name: 'TheCompact',
    version: '1',
    chainId: params.chainId,
    verifyingContract: params.contractAddress,
  }
}

/**
 * Get the domain separator hash for a given domain
 * This can be used to verify against the on-chain DOMAIN_SEPARATOR()
 * @param domain - The domain to hash
 * @returns The domain separator hash
 */
export function getDomainSeparator(domain: CompactDomain): `0x${string}` {
  // Implementation would use keccak256 of the EIP-712 domain encoding
  // For now, this is a placeholder that would need viem's hashDomain
  throw new Error('getDomainSeparator not yet implemented - use viem hashDomain')
}

