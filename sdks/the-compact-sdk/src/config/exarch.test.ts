/**
 * Tests for Exarch configuration
 */

import { Address, keccak256, toHex, encodeAbiParameters } from 'viem'

import {
  EXARCH_DOMAIN_NAME,
  EXARCH_DOMAIN_VERSION,
  EXARCH_NAME_HASH,
  EXARCH_VERSION_HASH,
  createExarchDomain,
  getExarchDomainSeparator,
  getExarchAddress,
  isExarchDeployed,
} from './exarch'

describe('Exarch Configuration', () => {
  const testExarchAddress = '0x1234567890123456789012345678901234567890' as Address

  describe('Domain Constants', () => {
    it('should have correct domain name', () => {
      expect(EXARCH_DOMAIN_NAME).toBe('Exarch')
    })

    it('should have correct domain version', () => {
      expect(EXARCH_DOMAIN_VERSION).toBe('1')
    })

    it('should have correct name hash', () => {
      const expectedHash = keccak256(toHex('Exarch'))
      expect(EXARCH_NAME_HASH).toBe(expectedHash)
    })

    it('should have correct version hash', () => {
      const expectedHash = keccak256(toHex('1'))
      expect(EXARCH_VERSION_HASH).toBe(expectedHash)
    })
  })

  describe('createExarchDomain', () => {
    it('should create a valid domain', () => {
      const domain = createExarchDomain({
        chainId: 1,
        exarchAddress: testExarchAddress,
      })

      expect(domain.name).toBe('Exarch')
      expect(domain.version).toBe('1')
      expect(domain.chainId).toBe(1)
      expect(domain.verifyingContract).toBe(testExarchAddress)
    })

    it('should create domains for different chains', () => {
      const domain1 = createExarchDomain({ chainId: 1, exarchAddress: testExarchAddress })
      const domain10 = createExarchDomain({ chainId: 10, exarchAddress: testExarchAddress })
      const domain137 = createExarchDomain({ chainId: 137, exarchAddress: testExarchAddress })

      expect(domain1.chainId).toBe(1)
      expect(domain10.chainId).toBe(10)
      expect(domain137.chainId).toBe(137)
    })
  })

  describe('getExarchDomainSeparator', () => {
    it('should compute domain separator', () => {
      const domain = createExarchDomain({
        chainId: 1,
        exarchAddress: testExarchAddress,
      })

      const separator = getExarchDomainSeparator(domain)
      expect(separator).toMatch(/^0x[a-f0-9]{64}$/)
    })

    it('should compute different separators for different chains', () => {
      const domain1 = createExarchDomain({ chainId: 1, exarchAddress: testExarchAddress })
      const domain10 = createExarchDomain({ chainId: 10, exarchAddress: testExarchAddress })

      const separator1 = getExarchDomainSeparator(domain1)
      const separator10 = getExarchDomainSeparator(domain10)

      expect(separator1).not.toBe(separator10)
    })

    it('should compute different separators for different contract addresses', () => {
      const addr1 = '0x1111111111111111111111111111111111111111' as Address
      const addr2 = '0x2222222222222222222222222222222222222222' as Address

      const domain1 = createExarchDomain({ chainId: 1, exarchAddress: addr1 })
      const domain2 = createExarchDomain({ chainId: 1, exarchAddress: addr2 })

      const separator1 = getExarchDomainSeparator(domain1)
      const separator2 = getExarchDomainSeparator(domain2)

      expect(separator1).not.toBe(separator2)
    })

    it('should match EIP-712 domain separator computation', () => {
      const domain = createExarchDomain({
        chainId: 1,
        exarchAddress: testExarchAddress,
      })

      // Compute expected domain separator manually
      const EIP712_DOMAIN_TYPEHASH = '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f'
      const nameHash = keccak256(toHex('Exarch'))
      const versionHash = keccak256(toHex('1'))

      const expected = keccak256(
        encodeAbiParameters(
          [
            { name: 'typeHash', type: 'bytes32' },
            { name: 'nameHash', type: 'bytes32' },
            { name: 'versionHash', type: 'bytes32' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          [EIP712_DOMAIN_TYPEHASH, nameHash, versionHash, 1n, testExarchAddress]
        )
      )

      const actual = getExarchDomainSeparator(domain)
      expect(actual).toBe(expected)
    })
  })

  describe('Address Lookup', () => {
    it('should return undefined for unknown chains', () => {
      expect(getExarchAddress(999999)).toBeUndefined()
    })

    it('should report unknown chains as not deployed', () => {
      expect(isExarchDeployed(999999)).toBe(false)
    })

    // Note: When Exarch is deployed to production chains, add tests for those addresses
  })
})
