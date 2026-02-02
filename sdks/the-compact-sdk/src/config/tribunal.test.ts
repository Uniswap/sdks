/**
 * Tests for Tribunal configuration
 */

import { describe, it, expect } from '@jest/globals'
import { keccak256, toHex, Address, Hex } from 'viem'

import {
  TRIBUNAL_DOMAIN_NAME,
  TRIBUNAL_DOMAIN_VERSION,
  TRIBUNAL_NAME_HASH,
  TRIBUNAL_VERSION_HASH,
  createTribunalDomain,
  getTribunalDomainSeparator,
  THE_COMPACT_ADDRESS,
  TRIBUNAL_ADDRESSES,
  getTribunalAddress,
  isTribunalDeployed,
} from './tribunal'

describe('Tribunal Domain Configuration', () => {
  describe('Constants', () => {
    it('TRIBUNAL_DOMAIN_NAME is "Tribunal"', () => {
      expect(TRIBUNAL_DOMAIN_NAME).toBe('Tribunal')
    })

    it('TRIBUNAL_DOMAIN_VERSION is "1"', () => {
      expect(TRIBUNAL_DOMAIN_VERSION).toBe('1')
    })

    it('TRIBUNAL_NAME_HASH matches keccak256("Tribunal")', () => {
      const computed = keccak256(toHex('Tribunal'))
      expect(TRIBUNAL_NAME_HASH).toBe(computed)
    })

    it('TRIBUNAL_VERSION_HASH matches keccak256("1")', () => {
      const computed = keccak256(toHex('1'))
      expect(TRIBUNAL_VERSION_HASH).toBe(computed)
    })

    it('THE_COMPACT_ADDRESS is valid address', () => {
      expect(THE_COMPACT_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(THE_COMPACT_ADDRESS).toBe('0x00000000000000171ede64904551eeDF3C6C9788')
    })
  })

  describe('createTribunalDomain', () => {
    it('creates valid domain for mainnet', () => {
      const tribunalAddress = '0x1234567890123456789012345678901234567890' as Address
      const domain = createTribunalDomain({
        chainId: 1,
        tribunalAddress,
      })

      expect(domain.name).toBe('Tribunal')
      expect(domain.version).toBe('1')
      expect(domain.chainId).toBe(1)
      expect(domain.verifyingContract).toBe(tribunalAddress)
    })

    it('creates valid domain for Optimism', () => {
      const tribunalAddress = '0x1234567890123456789012345678901234567890' as Address
      const domain = createTribunalDomain({
        chainId: 10,
        tribunalAddress,
      })

      expect(domain.chainId).toBe(10)
    })

    it('creates valid domain for Arbitrum', () => {
      const tribunalAddress = '0x1234567890123456789012345678901234567890' as Address
      const domain = createTribunalDomain({
        chainId: 42161,
        tribunalAddress,
      })

      expect(domain.chainId).toBe(42161)
    })
  })

  describe('getTribunalDomainSeparator', () => {
    it('produces consistent domain separator', () => {
      const domain = createTribunalDomain({
        chainId: 1,
        tribunalAddress: '0x1234567890123456789012345678901234567890' as Address,
      })

      const separator1 = getTribunalDomainSeparator(domain)
      const separator2 = getTribunalDomainSeparator(domain)

      expect(separator1).toBe(separator2)
    })

    it('produces different separator for different chain IDs', () => {
      const tribunalAddress = '0x1234567890123456789012345678901234567890' as Address

      const domain1 = createTribunalDomain({ chainId: 1, tribunalAddress })
      const domain2 = createTribunalDomain({ chainId: 10, tribunalAddress })

      const separator1 = getTribunalDomainSeparator(domain1)
      const separator2 = getTribunalDomainSeparator(domain2)

      expect(separator1).not.toBe(separator2)
    })

    it('produces different separator for different contract addresses', () => {
      const domain1 = createTribunalDomain({
        chainId: 1,
        tribunalAddress: '0x1234567890123456789012345678901234567890' as Address,
      })
      const domain2 = createTribunalDomain({
        chainId: 1,
        tribunalAddress: '0x2234567890123456789012345678901234567890' as Address,
      })

      const separator1 = getTribunalDomainSeparator(domain1)
      const separator2 = getTribunalDomainSeparator(domain2)

      expect(separator1).not.toBe(separator2)
    })

    it('returns valid bytes32 hash', () => {
      const domain = createTribunalDomain({
        chainId: 1,
        tribunalAddress: '0x1234567890123456789012345678901234567890' as Address,
      })

      const separator = getTribunalDomainSeparator(domain)

      expect(separator).toMatch(/^0x[a-f0-9]{64}$/i)
    })
  })

  describe('Address Utilities', () => {
    it('TRIBUNAL_ADDRESSES is an object', () => {
      expect(typeof TRIBUNAL_ADDRESSES).toBe('object')
    })

    it('getTribunalAddress returns undefined for undeployed chains', () => {
      // Using a chain ID that's unlikely to have deployment
      const address = getTribunalAddress(999999)
      expect(address).toBeUndefined()
    })

    it('isTribunalDeployed returns false for undeployed chains', () => {
      const deployed = isTribunalDeployed(999999)
      expect(deployed).toBe(false)
    })

    // These tests will pass once addresses are added to TRIBUNAL_ADDRESSES
    it('getTribunalAddress and isTribunalDeployed are consistent', () => {
      const testChainId = 1 // mainnet
      const address = getTribunalAddress(testChainId)
      const deployed = isTribunalDeployed(testChainId)

      if (address) {
        expect(deployed).toBe(true)
        expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/)
      } else {
        expect(deployed).toBe(false)
      }
    })
  })
})
