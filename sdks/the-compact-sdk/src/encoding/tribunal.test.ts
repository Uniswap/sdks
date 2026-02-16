/**
 * Tests for Tribunal encoding utilities
 *
 * These tests verify that the TypeScript type hashes and hash derivation
 * functions match the Solidity implementation in Tribunal.
 */

import { describe, it, expect } from '@jest/globals'
import { keccak256, toHex, Address, Hex } from 'viem'

import {
  // Type strings
  TRIBUNAL_MANDATE_TYPESTRING,
  TRIBUNAL_FILL_TYPESTRING,
  TRIBUNAL_FILL_COMPONENT_TYPESTRING,
  TRIBUNAL_RECIPIENT_CALLBACK_TYPESTRING,
  TRIBUNAL_BATCH_COMPACT_TYPESTRING,
  TRIBUNAL_LOCK_TYPESTRING,
  COMPACT_WITH_TRIBUNAL_MANDATE_TYPESTRING,
  TRIBUNAL_ADJUSTMENT_TYPESTRING,
  TRIBUNAL_WITNESS_TYPESTRING,
  // Type hashes
  TRIBUNAL_MANDATE_TYPEHASH,
  TRIBUNAL_FILL_TYPEHASH,
  TRIBUNAL_FILL_COMPONENT_TYPEHASH,
  TRIBUNAL_RECIPIENT_CALLBACK_TYPEHASH,
  TRIBUNAL_BATCH_COMPACT_TYPEHASH,
  TRIBUNAL_LOCK_TYPEHASH,
  COMPACT_WITH_TRIBUNAL_MANDATE_TYPEHASH,
  TRIBUNAL_ADJUSTMENT_TYPEHASH,
  // Hash derivation functions
  deriveTribunalFillComponentHash,
  deriveTribunalFillComponentsHash,
  deriveTribunalFillHash,
  deriveTribunalFillsHash,
  deriveTribunalFillsHashFromFills,
  deriveTribunalMandateHashFromComponents,
  deriveTribunalMandateHash,
  deriveTribunalClaimHash,
  deriveTribunalAdjustmentHash,
  deriveTribunalCommitmentsHash,
  deriveTribunalRecipientCallbackHash,
  // Claimant encoding
  encodeClaimant,
  decodeClaimant,
  // Validity conditions
  encodeValidityConditions,
  decodeValidityConditions,
  // ERC-7683 encoding
  encodeERC7683OriginData,
  encodeERC7683FillerData,
} from './tribunal'

// Expected type hashes from Solidity (TribunalTypeHashes.sol)
const EXPECTED_MANDATE_TYPEHASH = '0xd98eceb6e5c7770b3b664a99c269855402fe5255294a30970d25376caea662c6'
const EXPECTED_MANDATE_FILL_TYPEHASH = '0x1d0ee69a7bc1ac54d9a6b38f32ab156fbfe09a9098843d54f89e7b1033533d33'
const EXPECTED_MANDATE_FILL_COMPONENT_TYPEHASH = '0x97a135285706d21a6b74ac159b77b16cea827acc358fc6c33e430ce0a85fe9d6'
const EXPECTED_MANDATE_RECIPIENT_CALLBACK_TYPEHASH =
  '0xb60a17eb6828a433f2f2fcbeb119166fa25e1fb6ae3866e33952bb74f5055031'
const EXPECTED_MANDATE_BATCH_COMPACT_TYPEHASH = '0x75d7205b7ec9e9b203d9161387d95a46c8440f4530dceab1bb28d4194a586227'
const EXPECTED_MANDATE_LOCK_TYPEHASH = '0xce4f0854d9091f37d9dfb64592eee0de534c6680a5444fd55739b61228a6e0b0'
const EXPECTED_COMPACT_WITH_MANDATE_TYPEHASH = '0xdbbdcf42471b4a26f7824df9f33f0a4f9bb4e7a66be6a31be8868a6cbbec0a7d'
const EXPECTED_ADJUSTMENT_TYPEHASH = '0xe829b2a82439f37ac7578a226e337d334e0ee0da2f05ab63891c19cb84714414'

describe('Tribunal Type Hash Constants', () => {
  describe('Type strings match Solidity', () => {
    it('TRIBUNAL_MANDATE_TYPESTRING is non-empty', () => {
      expect(TRIBUNAL_MANDATE_TYPESTRING.length).toBeGreaterThan(0)
    })

    it('TRIBUNAL_FILL_TYPESTRING is non-empty', () => {
      expect(TRIBUNAL_FILL_TYPESTRING.length).toBeGreaterThan(0)
    })

    it('TRIBUNAL_FILL_COMPONENT_TYPESTRING is non-empty', () => {
      expect(TRIBUNAL_FILL_COMPONENT_TYPESTRING.length).toBeGreaterThan(0)
    })

    it('TRIBUNAL_RECIPIENT_CALLBACK_TYPESTRING is non-empty', () => {
      expect(TRIBUNAL_RECIPIENT_CALLBACK_TYPESTRING.length).toBeGreaterThan(0)
    })

    it('TRIBUNAL_BATCH_COMPACT_TYPESTRING is non-empty', () => {
      expect(TRIBUNAL_BATCH_COMPACT_TYPESTRING.length).toBeGreaterThan(0)
    })

    it('TRIBUNAL_LOCK_TYPESTRING is non-empty', () => {
      expect(TRIBUNAL_LOCK_TYPESTRING.length).toBeGreaterThan(0)
    })

    it('COMPACT_WITH_TRIBUNAL_MANDATE_TYPESTRING is non-empty', () => {
      expect(COMPACT_WITH_TRIBUNAL_MANDATE_TYPESTRING.length).toBeGreaterThan(0)
    })

    it('TRIBUNAL_ADJUSTMENT_TYPESTRING is non-empty', () => {
      expect(TRIBUNAL_ADJUSTMENT_TYPESTRING.length).toBeGreaterThan(0)
    })

    it('TRIBUNAL_WITNESS_TYPESTRING is non-empty', () => {
      expect(TRIBUNAL_WITNESS_TYPESTRING.length).toBeGreaterThan(0)
    })
  })

  describe('Type hash computation matches keccak256 of type string', () => {
    it('TRIBUNAL_MANDATE_TYPEHASH matches keccak256(MANDATE_TYPESTRING)', () => {
      const computed = keccak256(toHex(TRIBUNAL_MANDATE_TYPESTRING))
      expect(computed).toBe(TRIBUNAL_MANDATE_TYPEHASH)
    })

    it('TRIBUNAL_FILL_TYPEHASH matches keccak256(MANDATE_FILL_TYPESTRING)', () => {
      const computed = keccak256(toHex(TRIBUNAL_FILL_TYPESTRING))
      expect(computed).toBe(TRIBUNAL_FILL_TYPEHASH)
    })

    it('TRIBUNAL_FILL_COMPONENT_TYPEHASH matches keccak256(MANDATE_FILL_COMPONENT_TYPESTRING)', () => {
      const computed = keccak256(toHex(TRIBUNAL_FILL_COMPONENT_TYPESTRING))
      expect(computed).toBe(TRIBUNAL_FILL_COMPONENT_TYPEHASH)
    })

    it('TRIBUNAL_RECIPIENT_CALLBACK_TYPEHASH matches keccak256(MANDATE_RECIPIENT_CALLBACK_TYPESTRING)', () => {
      const computed = keccak256(toHex(TRIBUNAL_RECIPIENT_CALLBACK_TYPESTRING))
      expect(computed).toBe(TRIBUNAL_RECIPIENT_CALLBACK_TYPEHASH)
    })

    it('TRIBUNAL_BATCH_COMPACT_TYPEHASH matches keccak256(MANDATE_BATCH_COMPACT_TYPESTRING)', () => {
      const computed = keccak256(toHex(TRIBUNAL_BATCH_COMPACT_TYPESTRING))
      expect(computed).toBe(TRIBUNAL_BATCH_COMPACT_TYPEHASH)
    })

    it('TRIBUNAL_LOCK_TYPEHASH matches keccak256(MANDATE_LOCK_TYPESTRING)', () => {
      const computed = keccak256(toHex(TRIBUNAL_LOCK_TYPESTRING))
      expect(computed).toBe(TRIBUNAL_LOCK_TYPEHASH)
    })

    it('COMPACT_WITH_TRIBUNAL_MANDATE_TYPEHASH matches keccak256(COMPACT_WITH_MANDATE_TYPESTRING)', () => {
      const computed = keccak256(toHex(COMPACT_WITH_TRIBUNAL_MANDATE_TYPESTRING))
      expect(computed).toBe(COMPACT_WITH_TRIBUNAL_MANDATE_TYPEHASH)
    })

    it('TRIBUNAL_ADJUSTMENT_TYPEHASH matches keccak256(ADJUSTMENT_TYPESTRING)', () => {
      const computed = keccak256(toHex(TRIBUNAL_ADJUSTMENT_TYPESTRING))
      expect(computed).toBe(TRIBUNAL_ADJUSTMENT_TYPEHASH)
    })
  })

  describe('Type hashes match Solidity constants', () => {
    it('TRIBUNAL_MANDATE_TYPEHASH matches Solidity', () => {
      expect(TRIBUNAL_MANDATE_TYPEHASH).toBe(EXPECTED_MANDATE_TYPEHASH)
    })

    it('TRIBUNAL_FILL_TYPEHASH matches Solidity', () => {
      expect(TRIBUNAL_FILL_TYPEHASH).toBe(EXPECTED_MANDATE_FILL_TYPEHASH)
    })

    it('TRIBUNAL_FILL_COMPONENT_TYPEHASH matches Solidity', () => {
      expect(TRIBUNAL_FILL_COMPONENT_TYPEHASH).toBe(EXPECTED_MANDATE_FILL_COMPONENT_TYPEHASH)
    })

    it('TRIBUNAL_RECIPIENT_CALLBACK_TYPEHASH matches Solidity', () => {
      expect(TRIBUNAL_RECIPIENT_CALLBACK_TYPEHASH).toBe(EXPECTED_MANDATE_RECIPIENT_CALLBACK_TYPEHASH)
    })

    it('TRIBUNAL_BATCH_COMPACT_TYPEHASH matches Solidity', () => {
      expect(TRIBUNAL_BATCH_COMPACT_TYPEHASH).toBe(EXPECTED_MANDATE_BATCH_COMPACT_TYPEHASH)
    })

    it('TRIBUNAL_LOCK_TYPEHASH matches Solidity', () => {
      expect(TRIBUNAL_LOCK_TYPEHASH).toBe(EXPECTED_MANDATE_LOCK_TYPEHASH)
    })

    it('COMPACT_WITH_TRIBUNAL_MANDATE_TYPEHASH matches Solidity', () => {
      expect(COMPACT_WITH_TRIBUNAL_MANDATE_TYPEHASH).toBe(EXPECTED_COMPACT_WITH_MANDATE_TYPEHASH)
    })

    it('TRIBUNAL_ADJUSTMENT_TYPEHASH matches Solidity', () => {
      expect(TRIBUNAL_ADJUSTMENT_TYPEHASH).toBe(EXPECTED_ADJUSTMENT_TYPEHASH)
    })
  })
})

describe('Hash Derivation', () => {
  // Test data
  const testFillToken = '0x0000000000000000000000000000000000000001' as Address
  const testRecipient = '0x0000000000000000000000000000000000000002' as Address
  const testTribunal = '0x0000000000000000000000000000000000000003' as Address
  const testAdjuster = '0x0000000000000000000000000000000000000004' as Address
  const testArbiter = '0x0000000000000000000000000000000000000005' as Address
  const testSponsor = '0x0000000000000000000000000000000000000006' as Address
  const testToken = '0x0000000000000000000000000000000000000007' as Address
  const testLockTag = '0x000000000000000000000001' as Hex
  const testSalt = '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex

  describe('deriveTribunalFillComponentHash', () => {
    it('produces consistent hash for same input', () => {
      const component = {
        fillToken: testFillToken,
        minimumFillAmount: 1000000n,
        recipient: testRecipient,
        applyScaling: true,
      }

      const hash1 = deriveTribunalFillComponentHash(component)
      const hash2 = deriveTribunalFillComponentHash(component)

      expect(hash1).toBe(hash2)
    })

    it('produces different hash for different inputs', () => {
      const component1 = {
        fillToken: testFillToken,
        minimumFillAmount: 1000000n,
        recipient: testRecipient,
        applyScaling: true,
      }

      const component2 = {
        fillToken: testFillToken,
        minimumFillAmount: 2000000n, // Different amount
        recipient: testRecipient,
        applyScaling: true,
      }

      const hash1 = deriveTribunalFillComponentHash(component1)
      const hash2 = deriveTribunalFillComponentHash(component2)

      expect(hash1).not.toBe(hash2)
    })

    it('applyScaling affects hash', () => {
      const component1 = {
        fillToken: testFillToken,
        minimumFillAmount: 1000000n,
        recipient: testRecipient,
        applyScaling: true,
      }

      const component2 = {
        fillToken: testFillToken,
        minimumFillAmount: 1000000n,
        recipient: testRecipient,
        applyScaling: false,
      }

      const hash1 = deriveTribunalFillComponentHash(component1)
      const hash2 = deriveTribunalFillComponentHash(component2)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('deriveTribunalFillComponentsHash', () => {
    it('produces consistent hash for same components', () => {
      const components = [
        {
          fillToken: testFillToken,
          minimumFillAmount: 1000000n,
          recipient: testRecipient,
          applyScaling: true,
        },
      ]

      const hash1 = deriveTribunalFillComponentsHash(components)
      const hash2 = deriveTribunalFillComponentsHash(components)

      expect(hash1).toBe(hash2)
    })

    it('order of components affects hash', () => {
      const component1 = {
        fillToken: testFillToken,
        minimumFillAmount: 1000000n,
        recipient: testRecipient,
        applyScaling: true,
      }
      const component2 = {
        fillToken: testRecipient, // Different token
        minimumFillAmount: 2000000n,
        recipient: testFillToken,
        applyScaling: false,
      }

      const hash1 = deriveTribunalFillComponentsHash([component1, component2])
      const hash2 = deriveTribunalFillComponentsHash([component2, component1])

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('deriveTribunalFillHash', () => {
    it('produces consistent hash for same fill parameters', () => {
      const fill = {
        chainId: 1n,
        tribunal: testTribunal,
        expires: 1000000n,
        components: [
          {
            fillToken: testFillToken,
            minimumFillAmount: 1000000n,
            recipient: testRecipient,
            applyScaling: true,
          },
        ],
        baselinePriorityFee: 0n,
        scalingFactor: 1000000000000000000n, // 1e18
        priceCurve: [],
        recipientCallback: [],
        salt: testSalt,
      }

      const hash1 = deriveTribunalFillHash(fill)
      const hash2 = deriveTribunalFillHash(fill)

      expect(hash1).toBe(hash2)
    })

    it('chainId affects hash', () => {
      const baseFill = {
        tribunal: testTribunal,
        expires: 1000000n,
        components: [
          {
            fillToken: testFillToken,
            minimumFillAmount: 1000000n,
            recipient: testRecipient,
            applyScaling: true,
          },
        ],
        baselinePriorityFee: 0n,
        scalingFactor: 1000000000000000000n,
        priceCurve: [],
        recipientCallback: [],
        salt: testSalt,
      }

      const hash1 = deriveTribunalFillHash({ ...baseFill, chainId: 1n })
      const hash2 = deriveTribunalFillHash({ ...baseFill, chainId: 10n })

      expect(hash1).not.toBe(hash2)
    })

    it('priceCurve affects hash', () => {
      const baseFill = {
        chainId: 1n,
        tribunal: testTribunal,
        expires: 1000000n,
        components: [
          {
            fillToken: testFillToken,
            minimumFillAmount: 1000000n,
            recipient: testRecipient,
            applyScaling: true,
          },
        ],
        baselinePriorityFee: 0n,
        scalingFactor: 1000000000000000000n,
        recipientCallback: [],
        salt: testSalt,
      }

      const hash1 = deriveTribunalFillHash({ ...baseFill, priceCurve: [] })
      const hash2 = deriveTribunalFillHash({
        ...baseFill,
        priceCurve: [1100000000000000000n], // 1.1e18
      })

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('deriveTribunalFillsHash', () => {
    it('produces consistent hash for same fill hashes array', () => {
      const fillHashes = [
        '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex,
        '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex,
      ]

      const hash1 = deriveTribunalFillsHash(fillHashes)
      const hash2 = deriveTribunalFillsHash(fillHashes)

      expect(hash1).toBe(hash2)
    })

    it('order of fill hashes affects result', () => {
      const fillHash1 = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const fillHash2 = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex

      const hash1 = deriveTribunalFillsHash([fillHash1, fillHash2])
      const hash2 = deriveTribunalFillsHash([fillHash2, fillHash1])

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('deriveTribunalMandateHash', () => {
    it('produces consistent hash for same mandate', () => {
      const mandate = {
        adjuster: testAdjuster,
        fills: [
          {
            chainId: 1n,
            tribunal: testTribunal,
            expires: 1000000n,
            components: [
              {
                fillToken: testFillToken,
                minimumFillAmount: 1000000n,
                recipient: testRecipient,
                applyScaling: true,
              },
            ],
            baselinePriorityFee: 0n,
            scalingFactor: 1000000000000000000n,
            priceCurve: [],
            recipientCallback: [],
            salt: testSalt,
          },
        ],
      }

      const hash1 = deriveTribunalMandateHash(mandate)
      const hash2 = deriveTribunalMandateHash(mandate)

      expect(hash1).toBe(hash2)
    })

    it('adjuster affects hash', () => {
      const baseFills = [
        {
          chainId: 1n,
          tribunal: testTribunal,
          expires: 1000000n,
          components: [
            {
              fillToken: testFillToken,
              minimumFillAmount: 1000000n,
              recipient: testRecipient,
              applyScaling: true,
            },
          ],
          baselinePriorityFee: 0n,
          scalingFactor: 1000000000000000000n,
          priceCurve: [],
          recipientCallback: [],
          salt: testSalt,
        },
      ]

      const hash1 = deriveTribunalMandateHash({
        adjuster: testAdjuster,
        fills: baseFills,
      })
      const hash2 = deriveTribunalMandateHash({
        adjuster: testRecipient, // Different adjuster
        fills: baseFills,
      })

      expect(hash1).not.toBe(hash2)
    })

    it('deriveTribunalMandateHashFromComponents matches deriveTribunalMandateHash', () => {
      const fill = {
        chainId: 1n,
        tribunal: testTribunal,
        expires: 1000000n,
        components: [
          {
            fillToken: testFillToken,
            minimumFillAmount: 1000000n,
            recipient: testRecipient,
            applyScaling: true,
          },
        ],
        baselinePriorityFee: 0n,
        scalingFactor: 1000000000000000000n,
        priceCurve: [],
        recipientCallback: [],
        salt: testSalt,
      }

      const fillHash = deriveTribunalFillHash(fill)
      const hashFromComponents = deriveTribunalMandateHashFromComponents(testAdjuster, [fillHash])
      const hashFromMandate = deriveTribunalMandateHash({ adjuster: testAdjuster, fills: [fill] })

      expect(hashFromComponents).toBe(hashFromMandate)
    })
  })

  describe('deriveTribunalClaimHash', () => {
    it('produces consistent hash for same compact and mandate', () => {
      const compact = {
        arbiter: testArbiter,
        sponsor: testSponsor,
        nonce: 1n,
        expires: 1000000n,
        commitments: [
          {
            lockTag: testLockTag,
            token: testToken,
            amount: 1000000000000000000n,
          },
        ],
      }

      const mandateHash = '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex

      const hash1 = deriveTribunalClaimHash(compact, mandateHash)
      const hash2 = deriveTribunalClaimHash(compact, mandateHash)

      expect(hash1).toBe(hash2)
    })

    it('commitment amount affects hash', () => {
      const baseCompact = {
        arbiter: testArbiter,
        sponsor: testSponsor,
        nonce: 1n,
        expires: 1000000n,
      }

      const mandateHash = '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex

      const hash1 = deriveTribunalClaimHash(
        {
          ...baseCompact,
          commitments: [{ lockTag: testLockTag, token: testToken, amount: 1000000000000000000n }],
        },
        mandateHash
      )
      const hash2 = deriveTribunalClaimHash(
        {
          ...baseCompact,
          commitments: [{ lockTag: testLockTag, token: testToken, amount: 2000000000000000000n }],
        },
        mandateHash
      )

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('deriveTribunalAdjustmentHash', () => {
    it('produces consistent hash for same adjustment', () => {
      const adjustment = {
        fillIndex: 0n,
        targetBlock: 12345n,
        supplementalPriceCurve: [],
        validityConditions: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
      }
      const claimHash = '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex

      const hash1 = deriveTribunalAdjustmentHash(adjustment, claimHash)
      const hash2 = deriveTribunalAdjustmentHash(adjustment, claimHash)

      expect(hash1).toBe(hash2)
    })

    it('claimHash affects adjustment hash', () => {
      const adjustment = {
        fillIndex: 0n,
        targetBlock: 12345n,
        supplementalPriceCurve: [],
        validityConditions: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
      }

      const hash1 = deriveTribunalAdjustmentHash(
        adjustment,
        '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      )
      const hash2 = deriveTribunalAdjustmentHash(
        adjustment,
        '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex
      )

      expect(hash1).not.toBe(hash2)
    })

    it('supplementalPriceCurve affects hash', () => {
      const claimHash = '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex
      const baseAdjustment = {
        fillIndex: 0n,
        targetBlock: 12345n,
        validityConditions: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
      }

      const hash1 = deriveTribunalAdjustmentHash({ ...baseAdjustment, supplementalPriceCurve: [] }, claimHash)
      const hash2 = deriveTribunalAdjustmentHash(
        { ...baseAdjustment, supplementalPriceCurve: [1100000000000000000n] },
        claimHash
      )

      expect(hash1).not.toBe(hash2)
    })

    it('validityConditions affects hash', () => {
      const claimHash = '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex
      const baseAdjustment = {
        fillIndex: 0n,
        targetBlock: 12345n,
        supplementalPriceCurve: [],
      }

      const hash1 = deriveTribunalAdjustmentHash(
        {
          ...baseAdjustment,
          validityConditions: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        },
        claimHash
      )
      const hash2 = deriveTribunalAdjustmentHash(
        {
          ...baseAdjustment,
          validityConditions: '0x0000000000000000000000010000000000000000000000000000000000000001' as Hex,
        },
        claimHash
      )

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('deriveTribunalCommitmentsHash', () => {
    it('produces consistent hash using TRIBUNAL_LOCK_TYPEHASH', () => {
      const commitments = [
        {
          lockTag: testLockTag,
          token: testToken,
          amount: 1000000000000000000n,
        },
      ]

      const hash1 = deriveTribunalCommitmentsHash(commitments, TRIBUNAL_LOCK_TYPEHASH)
      const hash2 = deriveTribunalCommitmentsHash(commitments, TRIBUNAL_LOCK_TYPEHASH)

      expect(hash1).toBe(hash2)
    })

    it('different typehash produces different result', () => {
      const commitments = [
        {
          lockTag: testLockTag,
          token: testToken,
          amount: 1000000000000000000n,
        },
      ]

      const hash1 = deriveTribunalCommitmentsHash(commitments, TRIBUNAL_LOCK_TYPEHASH)
      const hash2 = deriveTribunalCommitmentsHash(commitments, TRIBUNAL_MANDATE_TYPEHASH)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('deriveTribunalRecipientCallbackHash', () => {
    it('returns empty bytes hash for empty callback array', () => {
      const hash = deriveTribunalRecipientCallbackHash([])
      // keccak256 of empty bytes = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
      expect(hash).toBe('0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470')
    })

    it('throws for multiple callbacks', () => {
      const callback = {
        chainId: 1n,
        compact: {
          arbiter: testArbiter,
          sponsor: testSponsor,
          nonce: 1n,
          expires: 1000000n,
          commitments: [{ lockTag: testLockTag, token: testToken, amount: 1000000000000000000n }],
        },
        mandateHash: '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex,
        context: '0x' as Hex,
      }

      expect(() => deriveTribunalRecipientCallbackHash([callback, callback])).toThrow(
        'Only single recipient callback is supported'
      )
    })
  })
})

describe('Claimant Encoding', () => {
  describe('encodeClaimant', () => {
    it('encodes lockTag and address correctly', () => {
      const lockTag = '0x000000000000000000000001' as Hex
      const address = '0x1234567890123456789012345678901234567890' as Address

      const encoded = encodeClaimant(lockTag, address)

      // Verify it's a valid bytes32
      expect(encoded).toMatch(/^0x[a-f0-9]{64}$/i)
    })

    it('roundtrips correctly', () => {
      const lockTag = '0x000000000000000000000001' as Hex
      const address = '0x1234567890123456789012345678901234567890' as Address

      const encoded = encodeClaimant(lockTag, address)
      const decoded = decodeClaimant(encoded)

      expect(decoded.lockTag).toBe(lockTag)
      expect(decoded.address.toLowerCase()).toBe(address.toLowerCase())
    })

    it('produces different results for different lock tags', () => {
      const address = '0x1234567890123456789012345678901234567890' as Address

      const encoded1 = encodeClaimant('0x000000000000000000000001' as Hex, address)
      const encoded2 = encodeClaimant('0x000000000000000000000002' as Hex, address)

      expect(encoded1).not.toBe(encoded2)
    })

    it('produces different results for different addresses', () => {
      const lockTag = '0x000000000000000000000001' as Hex

      const encoded1 = encodeClaimant(lockTag, '0x1234567890123456789012345678901234567890' as Address)
      const encoded2 = encodeClaimant(lockTag, '0x2234567890123456789012345678901234567890' as Address)

      expect(encoded1).not.toBe(encoded2)
    })
  })

  describe('decodeClaimant', () => {
    it('decodes zero claimant correctly', () => {
      const zeroClaimant = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex

      const decoded = decodeClaimant(zeroClaimant)

      expect(decoded.lockTag).toBe('0x000000000000000000000000')
      expect(decoded.address).toBe('0x0000000000000000000000000000000000000000')
    })
  })
})

describe('Validity Conditions Encoding', () => {
  describe('encodeValidityConditions', () => {
    it('encodes zero values correctly', () => {
      const encoded = encodeValidityConditions()

      expect(encoded).toBe('0x0000000000000000000000000000000000000000000000000000000000000000')
    })

    it('encodes exclusive bidder correctly', () => {
      const bidder = '0x1234567890123456789012345678901234567890' as Address
      const encoded = encodeValidityConditions(bidder, 0)

      const decoded = decodeValidityConditions(encoded)
      expect(decoded.exclusiveBidder?.toLowerCase()).toBe(bidder.toLowerCase())
      expect(decoded.blockWindow).toBe(0)
    })

    it('encodes block window correctly', () => {
      const encoded = encodeValidityConditions(undefined, 10)

      const decoded = decodeValidityConditions(encoded)
      expect(decoded.exclusiveBidder).toBeNull()
      expect(decoded.blockWindow).toBe(10)
    })

    it('encodes both values correctly', () => {
      const bidder = '0x1234567890123456789012345678901234567890' as Address
      const encoded = encodeValidityConditions(bidder, 10)

      const decoded = decodeValidityConditions(encoded)
      expect(decoded.exclusiveBidder?.toLowerCase()).toBe(bidder.toLowerCase())
      expect(decoded.blockWindow).toBe(10)
    })

    it('roundtrips correctly', () => {
      const bidder = '0x1234567890123456789012345678901234567890' as Address
      const blockWindow = 100

      const encoded = encodeValidityConditions(bidder, blockWindow)
      const decoded = decodeValidityConditions(encoded)

      expect(decoded.exclusiveBidder?.toLowerCase()).toBe(bidder.toLowerCase())
      expect(decoded.blockWindow).toBe(blockWindow)
    })
  })
})

describe('ERC-7683 Encoding', () => {
  const testAdjuster = '0x0000000000000000000000000000000000000004' as Address
  const testArbiter = '0x0000000000000000000000000000000000000005' as Address
  const testSponsor = '0x0000000000000000000000000000000000000006' as Address
  const testToken = '0x0000000000000000000000000000000000000007' as Address
  const testTribunal = '0x0000000000000000000000000000000000000003' as Address
  const testRecipient = '0x0000000000000000000000000000000000000002' as Address
  const testFillToken = '0x0000000000000000000000000000000000000001' as Address
  const testLockTag = '0x000000000000000000000001' as Hex
  const testSalt = '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex

  describe('encodeERC7683OriginData', () => {
    it('produces valid hex output', () => {
      const originData = {
        claim: {
          compact: {
            arbiter: testArbiter,
            sponsor: testSponsor,
            nonce: 1n,
            expires: 1000000n,
            commitments: [{ lockTag: testLockTag, token: testToken, amount: 1000000000000000000n }],
          },
          sponsorSignature: '0x' as Hex,
          allocatorSignature: '0x' as Hex,
        },
        mandate: {
          chainId: 1n,
          tribunal: testTribunal,
          expires: 1000000n,
          components: [
            {
              fillToken: testFillToken,
              minimumFillAmount: 1000000n,
              recipient: testRecipient,
              applyScaling: true,
            },
          ],
          baselinePriorityFee: 0n,
          scalingFactor: 1000000000000000000n,
          priceCurve: [],
          recipientCallback: [],
          salt: testSalt,
        },
        fillHashes: [],
      }

      const encoded = encodeERC7683OriginData(originData)

      // Verify it's valid hex
      expect(encoded).toMatch(/^0x[a-f0-9]+$/i)
      // Should be fairly long due to complex structure
      expect(encoded.length).toBeGreaterThan(500)
    })
  })

  describe('encodeERC7683FillerData', () => {
    it('produces valid hex output', () => {
      const fillerData = {
        adjustment: {
          adjuster: testAdjuster,
          fillIndex: 0n,
          targetBlock: 12345n,
          supplementalPriceCurve: [],
          validityConditions: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
          adjustmentAuthorization: '0x' as Hex,
        },
        claimant: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        fillBlock: 0n,
      }

      const encoded = encodeERC7683FillerData(fillerData)

      // Verify it's valid hex
      expect(encoded).toMatch(/^0x[a-f0-9]+$/i)
      // Should be at least several hundred bytes
      expect(encoded.length).toBeGreaterThan(200)
    })

    it('encodes non-zero claimant correctly', () => {
      const claimant = encodeClaimant(testLockTag, testRecipient)

      const fillerData = {
        adjustment: {
          adjuster: testAdjuster,
          fillIndex: 0n,
          targetBlock: 12345n,
          supplementalPriceCurve: [],
          validityConditions: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
          adjustmentAuthorization: '0x' as Hex,
        },
        claimant,
        fillBlock: 0n,
      }

      const encoded = encodeERC7683FillerData(fillerData)

      // Verify the claimant value is present in the encoded data
      // The claimant should appear somewhere in the encoded bytes
      expect(encoded.toLowerCase()).toContain(claimant.slice(2).toLowerCase())
    })
  })
})
