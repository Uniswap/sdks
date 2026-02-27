/**
 * Tribunal-specific configuration
 *
 * IMPORTANT: Tribunal uses its own EIP-712 domain (name: "Tribunal") for adjustment signatures,
 * which is different from The Compact's domain. This separation is critical for proper
 * signature verification on-chain.
 */

import { keccak256, encodeAbiParameters, Address, Hex, toHex } from 'viem'

/**
 * Tribunal EIP-712 domain name
 */
export const TRIBUNAL_DOMAIN_NAME = 'Tribunal' as const

/**
 * Tribunal EIP-712 domain version
 */
export const TRIBUNAL_DOMAIN_VERSION = '1' as const

/**
 * EIP-712 domain for Tribunal
 * Used for signing adjustments - different from The Compact's domain
 */
export interface TribunalDomain {
  name: typeof TRIBUNAL_DOMAIN_NAME
  version: typeof TRIBUNAL_DOMAIN_VERSION
  chainId: number
  verifyingContract: Address
}

/**
 * Create an EIP-712 domain for Tribunal
 *
 * This domain is used for signing adjustments. The verifying contract
 * should be the Tribunal contract address on the specific chain.
 *
 * @param params - Chain ID and Tribunal contract address
 * @returns The Tribunal EIP-712 domain object
 *
 * @example
 * ```typescript
 * const domain = createTribunalDomain({
 *   chainId: 1,
 *   tribunalAddress: '0x...'
 * })
 * ```
 */
export function createTribunalDomain(params: { chainId: number; tribunalAddress: Address }): TribunalDomain {
  return {
    name: TRIBUNAL_DOMAIN_NAME,
    version: TRIBUNAL_DOMAIN_VERSION,
    chainId: params.chainId,
    verifyingContract: params.tribunalAddress,
  }
}

/**
 * EIP-712 domain type hash
 * keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
 */
const EIP712_DOMAIN_TYPEHASH = '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f' as Hex

/**
 * Pre-computed hash of "Tribunal"
 * keccak256(bytes("Tribunal"))
 * From: DomainLib.sol _NAME_HASH
 */
export const TRIBUNAL_NAME_HASH = '0x0e2a7404936dd29a4a3b49dad6c2f86f8e2da9cf7cf60ef9518bb049b4cb9b44' as Hex

/**
 * Pre-computed hash of "1"
 * keccak256("1")
 * From: DomainLib.sol _VERSION_HASH
 */
export const TRIBUNAL_VERSION_HASH = '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6' as Hex

/**
 * Get the domain separator hash for a Tribunal domain
 * This can be used to verify against the on-chain domain separator
 *
 * The domain separator is computed as:
 * keccak256(abi.encode(
 *   EIP712_DOMAIN_TYPEHASH,
 *   keccak256("Tribunal"),
 *   keccak256("1"),
 *   chainId,
 *   verifyingContract
 * ))
 *
 * @param domain - The Tribunal domain to hash
 * @returns The domain separator hash
 */
export function getTribunalDomainSeparator(domain: TribunalDomain): Hex {
  const nameHash = keccak256(toHex(domain.name))
  const versionHash = keccak256(toHex(domain.version))

  const encoded = encodeAbiParameters(
    [
      { name: 'typeHash', type: 'bytes32' },
      { name: 'nameHash', type: 'bytes32' },
      { name: 'versionHash', type: 'bytes32' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    [EIP712_DOMAIN_TYPEHASH, nameHash, versionHash, BigInt(domain.chainId), domain.verifyingContract]
  )

  return keccak256(encoded)
}

/**
 * Compute the domain-specific hash according to EIP-712
 * Equivalent to DomainLib.withDomain in Solidity
 *
 * @param messageHash - The EIP-712 hash of the message data
 * @param domainSeparator - The domain separator to combine with the message hash
 * @returns The domain-specific hash
 */
export function withDomain(messageHash: Hex, domainSeparator: Hex): Hex {
  // Concatenate: 0x1901 + domainSeparator + messageHash
  const data = `0x1901${domainSeparator.slice(2)}${messageHash.slice(2)}` as Hex
  return keccak256(data)
}

/**
 * The Compact contract address (constant across all chains)
 */
export const THE_COMPACT_ADDRESS = '0x00000000000000171ede64904551eeDF3C6C9788' as Address

/**
 * Known Tribunal contract addresses per chain
 * These will be populated when Tribunal is deployed to production chains
 */
export const TRIBUNAL_ADDRESSES: Partial<Record<number, Address>> = {
  1: '0x000000000000790009689f43bAedb61D67D45bB8' as Address, // Ethereum Mainnet
  10: '0x000000000000790009689f43bAedb61D67D45bB8' as Address, // Optimism
  8453: '0x000000000000790009689f43bAedb61D67D45bB8' as Address, // Base
  130: '0x000000000000790009689f43bAedb61D67D45bB8' as Address, // Unichain
  42161: '0x000000000000790009689f43bAedb61D67D45bB8' as Address, // Arbitrum
}

/**
 * Get the Tribunal contract address for a specific chain
 *
 * @param chainId - The chain ID
 * @returns The Tribunal contract address or undefined if not deployed
 */
export function getTribunalAddress(chainId: number): Address | undefined {
  return TRIBUNAL_ADDRESSES[chainId]
}

/**
 * Check if Tribunal is deployed on a specific chain
 *
 * @param chainId - The chain ID to check
 * @returns True if Tribunal is deployed on the chain
 */
export function isTribunalDeployed(chainId: number): boolean {
  return chainId in TRIBUNAL_ADDRESSES
}

// =============================================================================
// Indexer Configuration
// =============================================================================

/**
 * Default Tribunal Indexer endpoint
 * This GraphQL API provides historical data for Tribunal fills, mandates, etc.
 */
export const DEFAULT_TRIBUNAL_INDEXER_ENDPOINT = 'https://tribunal-indexer.marble.live/'
