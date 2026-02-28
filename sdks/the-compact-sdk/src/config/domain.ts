/**
 * EIP-712 domain configuration for The Compact
 */

import { keccak256, encodeAbiParameters, Address, Hex, toHex } from 'viem'

/**
 * EIP-712 domain for The Compact v1
 */
export interface CompactDomain {
  name: 'The Compact'
  version: '1'
  chainId: number
  verifyingContract: Address
}

/**
 * Create an EIP-712 domain for The Compact
 * @param params - Chain ID and contract address
 * @returns The EIP-712 domain object
 */
export function createDomain(params: { chainId: number; contractAddress: Address }): CompactDomain {
  return {
    name: 'The Compact',
    version: '1',
    chainId: params.chainId,
    verifyingContract: params.contractAddress,
  }
}

/**
 * EIP-712 domain type hash
 * keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
 */
const EIP712_DOMAIN_TYPEHASH = '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f' as Hex

/**
 * Get the domain separator hash for a given domain
 * This can be used to verify against the on-chain DOMAIN_SEPARATOR()
 *
 * The domain separator is computed as:
 * keccak256(abi.encode(
 *   EIP712_DOMAIN_TYPEHASH,
 *   keccak256("The Compact"),
 *   keccak256("1"),
 *   chainId,
 *   verifyingContract
 * ))
 *
 * @param domain - The domain to hash
 * @returns The domain separator hash
 */
export function getDomainSeparator(domain: CompactDomain): Hex {
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
