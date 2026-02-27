/**
 * Tests for ExarchCompactBuilder
 */

import { Address, Hex } from 'viem'

import { createDomain } from '../config/domain'
import { deriveExarchFillHash, deriveExarchMandateHash, deriveExarchClaimHash } from '../encoding/exarch'
import { Lock } from '../types/eip712'

import { ExarchCompactBuilder, getExarchWitnessTypestring, createFillParams, createMandate } from './exarchCompact'

// Test addresses
const exarchAddress = '0x1111111111111111111111111111111111111111' as Address
const sponsorAddress = '0x2222222222222222222222222222222222222222' as Address
const adjusterAddress = '0x3333333333333333333333333333333333333333' as Address
const legateAddress = '0x4444444444444444444444444444444444444444' as Address
const recipientAddress = '0x5555555555555555555555555555555555555555' as Address
const tokenAddress = '0x6666666666666666666666666666666666666666' as Address
const lockTag = '0x000000000000000000000001' as Hex

// Test domain
const testDomain = createDomain({
  chainId: 1,
  contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788' as Address,
})

// Test lock
const testLock: Lock = {
  lockTag,
  token: tokenAddress,
  amount: 1000000n,
}

describe('ExarchCompactBuilder', () => {
  describe('create()', () => {
    it('should create a new builder instance', () => {
      const builder = ExarchCompactBuilder.create(testDomain)
      expect(builder).toBeDefined()
    })
  })

  describe('build()', () => {
    it('should build a complete Exarch compact', () => {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)

      const result = ExarchCompactBuilder.create(testDomain)
        .arbiter(exarchAddress)
        .sponsor(sponsorAddress)
        .nonce(1n)
        .expires(expiry)
        .addLock(testLock)
        .mandate((m) =>
          m
            .adjuster(adjusterAddress)
            .legate(legateAddress)
            .fill((f) =>
              f
                .chainId(1n)
                .exarch(exarchAddress)
                .expires(expiry)
                .component((c) =>
                  c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress).applyScaling(true)
                )
                .bondAmount(100000000000000000n)
                .earnestAmount(10000000000000000n)
                .holdPeriod(100n)
            )
        )
        .build()

      // Verify struct
      expect(result.struct.arbiter).toBe(exarchAddress)
      expect(result.struct.sponsor).toBe(sponsorAddress)
      expect(result.struct.nonce).toBe(1n)
      expect(result.struct.expires).toBe(expiry)
      expect(result.struct.commitments).toEqual([testLock])

      // Verify mandate
      expect(result.mandate.adjuster).toBe(adjusterAddress)
      expect(result.mandate.legate).toBe(legateAddress)
      expect(result.mandate.fills).toHaveLength(1)

      // Verify hashes
      expect(result.mandateHash).toMatch(/^0x[0-9a-f]{64}$/)
      expect(result.claimHash).toMatch(/^0x[0-9a-f]{64}$/)
      expect(result.hash).toMatch(/^0x[0-9a-f]{64}$/)
      expect(result.fillHashes).toHaveLength(1)
      expect(result.fillHashes[0]).toMatch(/^0x[0-9a-f]{64}$/)

      // Verify typed data structure
      expect(result.typedData.primaryType).toBe('BatchCompact')
      expect(result.typedData.types).toHaveProperty('BatchCompact')
      expect(result.typedData.types).toHaveProperty('Lock')
      expect(result.typedData.types).toHaveProperty('Mandate')
      expect(result.typedData.types).toHaveProperty('Mandate_Fill')
      expect(result.typedData.types).toHaveProperty('Mandate_FillComponent')
    })

    it('should compute hashes correctly', () => {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)
      const salt = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex

      const result = ExarchCompactBuilder.create(testDomain)
        .arbiter(exarchAddress)
        .sponsor(sponsorAddress)
        .nonce(1n)
        .expires(expiry)
        .addLock(testLock)
        .mandate((m) =>
          m
            .adjuster(adjusterAddress)
            .legate(legateAddress)
            .fill((f) =>
              f
                .chainId(1n)
                .exarch(exarchAddress)
                .expires(expiry)
                .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
                .salt(salt)
            )
        )
        .build()

      // Manually compute expected hashes
      const fill = result.mandate.fills[0]
      const expectedFillHash = deriveExarchFillHash(fill)
      const expectedMandateHash = deriveExarchMandateHash(adjusterAddress, legateAddress, [expectedFillHash])
      const expectedClaimHash = deriveExarchClaimHash(result.struct, expectedMandateHash)

      expect(result.fillHashes[0]).toBe(expectedFillHash)
      expect(result.mandateHash).toBe(expectedMandateHash)
      expect(result.claimHash).toBe(expectedClaimHash)
    })

    it('should support multiple locks', () => {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)
      const lock2: Lock = {
        lockTag: '0x000000000000000000000002' as Hex,
        token: '0x7777777777777777777777777777777777777777' as Address,
        amount: 2000000n,
      }

      const result = ExarchCompactBuilder.create(testDomain)
        .arbiter(exarchAddress)
        .sponsor(sponsorAddress)
        .nonce(1n)
        .expires(expiry)
        .addLock(testLock)
        .addCommitment(lock2) // Test alias
        .mandate((m) =>
          m
            .adjuster(adjusterAddress)
            .legate(legateAddress)
            .fill((f) =>
              f
                .chainId(1n)
                .exarch(exarchAddress)
                .expires(expiry)
                .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
            )
        )
        .build()

      expect(result.struct.commitments).toHaveLength(2)
      expect(result.struct.commitments[0]).toEqual(testLock)
      expect(result.struct.commitments[1]).toEqual(lock2)
    })

    it('should support multiple fills', () => {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)

      const result = ExarchCompactBuilder.create(testDomain)
        .arbiter(exarchAddress)
        .sponsor(sponsorAddress)
        .nonce(1n)
        .expires(expiry)
        .addLock(testLock)
        .mandate((m) =>
          m
            .adjuster(adjusterAddress)
            .legate(legateAddress)
            .fill((f) =>
              f
                .chainId(1n)
                .exarch(exarchAddress)
                .expires(expiry)
                .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
            )
            .fill((f) =>
              f
                .chainId(10n) // Optimism
                .exarch('0x8888888888888888888888888888888888888888' as Address)
                .expires(expiry)
                .component((c) =>
                  c
                    .fillToken('0x9999999999999999999999999999999999999999' as Address)
                    .minimumFillAmount(750000n)
                    .recipient(recipientAddress)
                )
            )
        )
        .build()

      expect(result.mandate.fills).toHaveLength(2)
      expect(result.fillHashes).toHaveLength(2)
      expect(result.mandate.fills[0].chainId).toBe(1n)
      expect(result.mandate.fills[1].chainId).toBe(10n)
    })

    it('should support expiresIn with string duration', () => {
      const beforeTimestamp = BigInt(Math.floor(Date.now() / 1000))

      const result = ExarchCompactBuilder.create(testDomain)
        .arbiter(exarchAddress)
        .sponsor(sponsorAddress)
        .nonce(1n)
        .expiresIn('1h')
        .addLock(testLock)
        .mandate((m) =>
          m
            .adjuster(adjusterAddress)
            .legate(legateAddress)
            .fill((f) =>
              f
                .chainId(1n)
                .exarch(exarchAddress)
                .expires(beforeTimestamp + 7200n)
                .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
            )
        )
        .build()

      const afterTimestamp = BigInt(Math.floor(Date.now() / 1000))

      // Should be approximately 1 hour from now
      expect(Number(result.struct.expires)).toBeGreaterThanOrEqual(Number(beforeTimestamp + 3600n))
      expect(Number(result.struct.expires)).toBeLessThanOrEqual(Number(afterTimestamp + 3600n + 1n))
    })

    it('should support expiresIn with numeric duration', () => {
      const beforeTimestamp = BigInt(Math.floor(Date.now() / 1000))

      const result = ExarchCompactBuilder.create(testDomain)
        .arbiter(exarchAddress)
        .sponsor(sponsorAddress)
        .nonce(1n)
        .expiresIn(3600) // 1 hour in seconds
        .addLock(testLock)
        .mandate((m) =>
          m
            .adjuster(adjusterAddress)
            .legate(legateAddress)
            .fill((f) =>
              f
                .chainId(1n)
                .exarch(exarchAddress)
                .expires(beforeTimestamp + 7200n)
                .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
            )
        )
        .build()

      const afterTimestamp = BigInt(Math.floor(Date.now() / 1000))

      expect(Number(result.struct.expires)).toBeGreaterThanOrEqual(Number(beforeTimestamp + 3600n))
      expect(Number(result.struct.expires)).toBeLessThanOrEqual(Number(afterTimestamp + 3600n + 1n))
    })

    it('should support expiresAt alias', () => {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 7200)

      const result = ExarchCompactBuilder.create(testDomain)
        .arbiter(exarchAddress)
        .sponsor(sponsorAddress)
        .nonce(1n)
        .expiresAt(expiry)
        .addLock(testLock)
        .mandate((m) =>
          m
            .adjuster(adjusterAddress)
            .legate(legateAddress)
            .fill((f) =>
              f
                .chainId(1n)
                .exarch(exarchAddress)
                .expires(expiry)
                .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
            )
        )
        .build()

      expect(result.struct.expires).toBe(expiry)
    })

    it('should support withMandate for pre-built mandates', () => {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)

      const mandate = createMandate((m) =>
        m
          .adjuster(adjusterAddress)
          .legate(legateAddress)
          .fill((f) =>
            f
              .chainId(1n)
              .exarch(exarchAddress)
              .expires(expiry)
              .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
          )
      )

      const result = ExarchCompactBuilder.create(testDomain)
        .arbiter(exarchAddress)
        .sponsor(sponsorAddress)
        .nonce(1n)
        .expires(expiry)
        .addLock(testLock)
        .withMandate(mandate)
        .build()

      expect(result.mandate).toEqual(mandate)
    })
  })

  describe('validation', () => {
    it('should throw if arbiter is missing', () => {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)

      expect(() =>
        ExarchCompactBuilder.create(testDomain)
          .sponsor(sponsorAddress)
          .nonce(1n)
          .expires(expiry)
          .addLock(testLock)
          .mandate((m) =>
            m
              .adjuster(adjusterAddress)
              .legate(legateAddress)
              .fill((f) =>
                f
                  .chainId(1n)
                  .exarch(exarchAddress)
                  .expires(expiry)
                  .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
              )
          )
          .build()
      ).toThrow('arbiter is required')
    })

    it('should throw if sponsor is missing', () => {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)

      expect(() =>
        ExarchCompactBuilder.create(testDomain)
          .arbiter(exarchAddress)
          .nonce(1n)
          .expires(expiry)
          .addLock(testLock)
          .mandate((m) =>
            m
              .adjuster(adjusterAddress)
              .legate(legateAddress)
              .fill((f) =>
                f
                  .chainId(1n)
                  .exarch(exarchAddress)
                  .expires(expiry)
                  .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
              )
          )
          .build()
      ).toThrow('sponsor is required')
    })

    it('should throw if nonce is missing', () => {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)

      expect(() =>
        ExarchCompactBuilder.create(testDomain)
          .arbiter(exarchAddress)
          .sponsor(sponsorAddress)
          .expires(expiry)
          .addLock(testLock)
          .mandate((m) =>
            m
              .adjuster(adjusterAddress)
              .legate(legateAddress)
              .fill((f) =>
                f
                  .chainId(1n)
                  .exarch(exarchAddress)
                  .expires(expiry)
                  .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
              )
          )
          .build()
      ).toThrow('nonce is required')
    })

    it('should throw if expires is missing', () => {
      expect(() =>
        ExarchCompactBuilder.create(testDomain)
          .arbiter(exarchAddress)
          .sponsor(sponsorAddress)
          .nonce(1n)
          .addLock(testLock)
          .mandate((m) =>
            m
              .adjuster(adjusterAddress)
              .legate(legateAddress)
              .fill((f) =>
                f
                  .chainId(1n)
                  .exarch(exarchAddress)
                  .expires(1000000n)
                  .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
              )
          )
          .build()
      ).toThrow('expires is required')
    })

    it('should throw if no commitments', () => {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)

      expect(() =>
        ExarchCompactBuilder.create(testDomain)
          .arbiter(exarchAddress)
          .sponsor(sponsorAddress)
          .nonce(1n)
          .expires(expiry)
          .mandate((m) =>
            m
              .adjuster(adjusterAddress)
              .legate(legateAddress)
              .fill((f) =>
                f
                  .chainId(1n)
                  .exarch(exarchAddress)
                  .expires(expiry)
                  .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
              )
          )
          .build()
      ).toThrow('at least one commitment is required')
    })

    it('should throw if mandate is missing', () => {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)

      expect(() =>
        ExarchCompactBuilder.create(testDomain)
          .arbiter(exarchAddress)
          .sponsor(sponsorAddress)
          .nonce(1n)
          .expires(expiry)
          .addLock(testLock)
          .build()
      ).toThrow('mandate is required')
    })
  })

  describe('hash consistency', () => {
    it('should produce consistent hashes for same input', () => {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)
      const salt = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex

      const build = () =>
        ExarchCompactBuilder.create(testDomain)
          .arbiter(exarchAddress)
          .sponsor(sponsorAddress)
          .nonce(1n)
          .expires(expiry)
          .addLock(testLock)
          .mandate((m) =>
            m
              .adjuster(adjusterAddress)
              .legate(legateAddress)
              .fill((f) =>
                f
                  .chainId(1n)
                  .exarch(exarchAddress)
                  .expires(expiry)
                  .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
                  .salt(salt)
              )
          )
          .build()

      const result1 = build()
      const result2 = build()

      expect(result1.hash).toBe(result2.hash)
      expect(result1.mandateHash).toBe(result2.mandateHash)
      expect(result1.claimHash).toBe(result2.claimHash)
      expect(result1.fillHashes).toEqual(result2.fillHashes)
    })

    it('should produce different hashes for different nonces', () => {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)
      const salt = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex

      const build = (nonce: bigint) =>
        ExarchCompactBuilder.create(testDomain)
          .arbiter(exarchAddress)
          .sponsor(sponsorAddress)
          .nonce(nonce)
          .expires(expiry)
          .addLock(testLock)
          .mandate((m) =>
            m
              .adjuster(adjusterAddress)
              .legate(legateAddress)
              .fill((f) =>
                f
                  .chainId(1n)
                  .exarch(exarchAddress)
                  .expires(expiry)
                  .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
                  .salt(salt)
              )
          )
          .build()

      const result1 = build(1n)
      const result2 = build(2n)

      expect(result1.hash).not.toBe(result2.hash)
      expect(result1.claimHash).not.toBe(result2.claimHash)
      // Mandate hash should be same since nonce is not part of mandate
      expect(result1.mandateHash).toBe(result2.mandateHash)
    })
  })
})

describe('getExarchWitnessTypestring', () => {
  it('should return the Exarch witness typestring', () => {
    const typestring = getExarchWitnessTypestring()

    expect(typestring).toContain('adjuster')
    expect(typestring).toContain('legate')
    expect(typestring).toContain('fills')
    expect(typestring).toContain('Mandate_Fill')
  })
})

describe('createFillParams', () => {
  it('should create fill parameters using builder function', () => {
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)

    const fill = createFillParams((f) =>
      f
        .chainId(1n)
        .exarch(exarchAddress)
        .expires(expiry)
        .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
        .bondAmount(100000000000000000n)
        .earnestAmount(10000000000000000n)
        .holdPeriod(100n)
    )

    expect(fill.chainId).toBe(1n)
    expect(fill.exarch).toBe(exarchAddress)
    expect(fill.expires).toBe(expiry)
    expect(fill.components).toHaveLength(1)
    expect(fill.bondAmount).toBe(100000000000000000n)
    expect(fill.earnestAmount).toBe(10000000000000000n)
    expect(fill.holdPeriod).toBe(100n)
  })
})

describe('createMandate', () => {
  it('should create mandate using builder function', () => {
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)

    const mandate = createMandate((m) =>
      m
        .adjuster(adjusterAddress)
        .legate(legateAddress)
        .fill((f) =>
          f
            .chainId(1n)
            .exarch(exarchAddress)
            .expires(expiry)
            .component((c) => c.fillToken(tokenAddress).minimumFillAmount(500000n).recipient(recipientAddress))
        )
    )

    expect(mandate.adjuster).toBe(adjusterAddress)
    expect(mandate.legate).toBe(legateAddress)
    expect(mandate.fills).toHaveLength(1)
    expect(mandate.fills[0].chainId).toBe(1n)
  })
})
