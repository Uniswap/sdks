/**
 * Exarch-specific configuration
 *
 * IMPORTANT: Exarch uses its own EIP-712 domain (name: "Exarch") for adjustment signatures,
 * which is different from The Compact's domain. This separation is critical for proper
 * signature verification on-chain.
 */

import { keccak256, encodeAbiParameters, Address, Hex, toHex } from 'viem'

/**
 * Exarch EIP-712 domain name
 */
export const EXARCH_DOMAIN_NAME = 'Exarch' as const

/**
 * Exarch EIP-712 domain version
 */
export const EXARCH_DOMAIN_VERSION = '1' as const

/**
 * EIP-712 domain for Exarch
 * Used for signing adjustments - different from The Compact's domain
 */
export interface ExarchDomain {
  name: typeof EXARCH_DOMAIN_NAME
  version: typeof EXARCH_DOMAIN_VERSION
  chainId: number
  verifyingContract: Address
}

/**
 * Create an EIP-712 domain for Exarch
 *
 * This domain is used for signing adjustments. The verifying contract
 * should be the Exarch contract address on the specific chain.
 *
 * @param params - Chain ID and Exarch contract address
 * @returns The Exarch EIP-712 domain object
 *
 * @example
 * ```typescript
 * const domain = createExarchDomain({
 *   chainId: 1,
 *   exarchAddress: '0x...'
 * })
 * ```
 */
export function createExarchDomain(params: { chainId: number; exarchAddress: Address }): ExarchDomain {
  return {
    name: EXARCH_DOMAIN_NAME,
    version: EXARCH_DOMAIN_VERSION,
    chainId: params.chainId,
    verifyingContract: params.exarchAddress,
  }
}

/**
 * EIP-712 domain type hash
 * keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
 */
const EIP712_DOMAIN_TYPEHASH = '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f' as Hex

/**
 * Pre-computed hash of "Exarch"
 * keccak256(bytes("Exarch"))
 */
export const EXARCH_NAME_HASH = '0x20272b034184b37dd5d467d3b5994836dc577d0898155e691710d12c46d4f98f' as Hex

/**
 * Pre-computed hash of "1"
 * keccak256("1")
 */
export const EXARCH_VERSION_HASH = '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6' as Hex

/**
 * Get the domain separator hash for an Exarch domain
 * This can be used to verify against the on-chain domain separator
 *
 * The domain separator is computed as:
 * keccak256(abi.encode(
 *   EIP712_DOMAIN_TYPEHASH,
 *   keccak256("Exarch"),
 *   keccak256("1"),
 *   chainId,
 *   verifyingContract
 * ))
 *
 * @param domain - The Exarch domain to hash
 * @returns The domain separator hash
 */
export function getExarchDomainSeparator(domain: ExarchDomain): Hex {
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
 * Known Exarch contract addresses per chain
 * These will be populated when Exarch is deployed to production chains
 */
export const EXARCH_ADDRESSES: Partial<Record<number, Address>> = {
  // Mainnet, Optimism, Arbitrum, etc. - TBD when deployed
}

/**
 * Get the Exarch contract address for a specific chain
 *
 * @param chainId - The chain ID
 * @returns The Exarch contract address or undefined if not deployed
 */
export function getExarchAddress(chainId: number): Address | undefined {
  return EXARCH_ADDRESSES[chainId]
}

/**
 * Check if Exarch is deployed on a specific chain
 *
 * @param chainId - The chain ID to check
 * @returns True if Exarch is deployed on the chain
 */
export function isExarchDeployed(chainId: number): boolean {
  return chainId in EXARCH_ADDRESSES
}
