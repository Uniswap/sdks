import { TypedDataDomain, TypedDataField } from '@ethersproject/abstract-signer'
import { ethers } from 'ethers'

export const EIP712_DOMAIN_NAME = 'UniversalRouter'
export const EIP712_DOMAIN_VERSION = '2'

export const EXECUTE_SIGNED_TYPES: Record<string, TypedDataField[]> = {
  ExecuteSigned: [
    { name: 'commands', type: 'bytes' },
    { name: 'inputs', type: 'bytes[]' },
    { name: 'intent', type: 'bytes32' },
    { name: 'data', type: 'bytes32' },
    { name: 'sender', type: 'address' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
  ],
}

/**
 * Generate EIP712 domain for Universal Router
 */
export function getUniversalRouterDomain(chainId: number, verifyingContract: string): TypedDataDomain {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  }
}

/**
 * Generate a random nonce for signed execution
 * Uses ethers.utils.randomBytes for secure randomness
 */
export function generateNonce(): string {
  const randomBytes = ethers.utils.randomBytes(32)
  return ethers.utils.hexlify(randomBytes)
}

/**
 * Sentinel value to skip nonce checking (allows signature replay)
 */
export const NONCE_SKIP_CHECK = '0x' + 'f'.repeat(64) // bytes32(type(uint256).max)
