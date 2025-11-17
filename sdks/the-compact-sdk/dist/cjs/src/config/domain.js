"use strict";
/**
 * EIP-712 domain configuration for The Compact
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDomain = createDomain;
exports.getDomainSeparator = getDomainSeparator;
const viem_1 = require("viem");
/**
 * Create an EIP-712 domain for The Compact
 * @param params - Chain ID and contract address
 * @returns The EIP-712 domain object
 */
function createDomain(params) {
    return {
        name: 'The Compact',
        version: '1',
        chainId: params.chainId,
        verifyingContract: params.contractAddress,
    };
}
/**
 * EIP-712 domain type hash
 * keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
 */
const EIP712_DOMAIN_TYPEHASH = '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f';
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
function getDomainSeparator(domain) {
    const nameHash = (0, viem_1.keccak256)(Buffer.from(domain.name));
    const versionHash = (0, viem_1.keccak256)(Buffer.from(domain.version));
    const encoded = (0, viem_1.encodeAbiParameters)([
        { name: 'typeHash', type: 'bytes32' },
        { name: 'nameHash', type: 'bytes32' },
        { name: 'versionHash', type: 'bytes32' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
    ], [EIP712_DOMAIN_TYPEHASH, nameHash, versionHash, BigInt(domain.chainId), domain.verifyingContract]);
    return (0, viem_1.keccak256)(encoded);
}
//# sourceMappingURL=domain.js.map