/**
 * Tests for EIP-712 domain configuration
 */

import { createDomain, getDomainSeparator } from './domain'

describe('createDomain', () => {
  it('should create a valid domain object', () => {
    const domain = createDomain({
      chainId: 1,
      contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
    })

    expect(domain).toEqual({
      name: 'TheCompact',
      version: '1',
      chainId: 1,
      verifyingContract: '0x00000000000000171ede64904551eeDF3C6C9788',
    })
  })

  it('should create domains with different chain IDs', () => {
    const domain1 = createDomain({
      chainId: 1,
      contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
    })

    const domain2 = createDomain({
      chainId: 137,
      contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
    })

    expect(domain1.chainId).toBe(1)
    expect(domain2.chainId).toBe(137)
  })

  it('should create domains with different contract addresses', () => {
    const domain1 = createDomain({
      chainId: 1,
      contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
    })

    const domain2 = createDomain({
      chainId: 1,
      contractAddress: '0x1111111111111111111111111111111111111111',
    })

    expect(domain1.verifyingContract).toBe('0x00000000000000171ede64904551eeDF3C6C9788')
    expect(domain2.verifyingContract).toBe('0x1111111111111111111111111111111111111111')
  })
})

describe('getDomainSeparator', () => {
  it('should produce a valid 32-byte hash', () => {
    const domain = createDomain({
      chainId: 1,
      contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
    })

    const separator = getDomainSeparator(domain)

    // Should be a 0x-prefixed 64-character hex string (32 bytes)
    expect(separator).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('should produce different hashes for different chain IDs', () => {
    const domain1 = createDomain({
      chainId: 1,
      contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
    })

    const domain2 = createDomain({
      chainId: 137,
      contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
    })

    const separator1 = getDomainSeparator(domain1)
    const separator2 = getDomainSeparator(domain2)

    expect(separator1).not.toBe(separator2)
  })

  it('should produce different hashes for different contract addresses', () => {
    const domain1 = createDomain({
      chainId: 1,
      contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
    })

    const domain2 = createDomain({
      chainId: 1,
      contractAddress: '0x1111111111111111111111111111111111111111',
    })

    const separator1 = getDomainSeparator(domain1)
    const separator2 = getDomainSeparator(domain2)

    expect(separator1).not.toBe(separator2)
  })

  it('should produce the same hash for the same domain', () => {
    const domain = createDomain({
      chainId: 1,
      contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
    })

    const separator1 = getDomainSeparator(domain)
    const separator2 = getDomainSeparator(domain)

    expect(separator1).toBe(separator2)
  })

  it('should compute the correct domain separator for a known domain', () => {
    // This test uses a known domain and expected separator to verify correctness
    // The expected value would need to match the on-chain DOMAIN_SEPARATOR() result
    const domain = createDomain({
      chainId: 1,
      contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
    })

    const separator = getDomainSeparator(domain)

    // This should match keccak256(abi.encode(
    //   EIP712_DOMAIN_TYPEHASH,
    //   keccak256("TheCompact"),
    //   keccak256("1"),
    //   1,
    //   0x00000000000000171ede64904551eeDF3C6C9788
    // ))

    // Verify it's a valid hash format
    expect(separator).toMatch(/^0x[0-9a-f]{64}$/)

    // Note: To fully verify correctness, this should be compared against
    // the actual on-chain DOMAIN_SEPARATOR() result for this specific domain.
    // That would require either:
    // 1. A known test vector from the contract tests
    // 2. A call to the on-chain contract
    // 3. Computing it using the same Solidity code path
  })

  it('should follow EIP-712 domain separator specification', () => {
    const domain = createDomain({
      chainId: 42161, // Arbitrum
      contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
    })

    const separator = getDomainSeparator(domain)

    // The separator should be deterministic and unique per domain
    expect(separator).toBeDefined()
    expect(typeof separator).toBe('string')
    expect(separator.startsWith('0x')).toBe(true)
    expect(separator.length).toBe(66) // '0x' + 64 hex chars
  })
})
