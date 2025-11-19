/**
 * EIP-712 domain configuration for The Compact
 */
/**
 * EIP-712 domain for The Compact v1
 */
export interface CompactDomain {
    name: 'The Compact';
    version: '1';
    chainId: number;
    verifyingContract: `0x${string}`;
}
/**
 * Create an EIP-712 domain for The Compact
 * @param params - Chain ID and contract address
 * @returns The EIP-712 domain object
 */
export declare function createDomain(params: {
    chainId: number;
    contractAddress: `0x${string}`;
}): CompactDomain;
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
export declare function getDomainSeparator(domain: CompactDomain): `0x${string}`;
