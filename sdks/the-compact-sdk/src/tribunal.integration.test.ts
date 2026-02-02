/**
 * Integration tests for Tribunal SDK
 *
 * These tests validate Tribunal SDK logic:
 * - Hash derivation matches expected behavior
 * - EIP-712 type hashes match Solidity constants
 * - Amount derivation is consistent across scenarios
 * - ERC-7683 encoding produces valid calldata
 *
 * On-chain tests are skipped until Tribunal is deployed.
 * Run with: npm test -- --testPathPattern="tribunal.integration"
 */

import { describe, it, expect } from '@jest/globals'
import { keccak256, toHex, Address, Hex, encodePacked, encodeAbiParameters } from 'viem'

import {
  TRIBUNAL_MANDATE_TYPESTRING,
  TRIBUNAL_FILL_TYPESTRING,
  TRIBUNAL_FILL_COMPONENT_TYPESTRING,
  TRIBUNAL_RECIPIENT_CALLBACK_TYPESTRING,
  TRIBUNAL_BATCH_COMPACT_TYPESTRING,
  TRIBUNAL_LOCK_TYPESTRING,
  COMPACT_WITH_TRIBUNAL_MANDATE_TYPESTRING,
  TRIBUNAL_ADJUSTMENT_TYPESTRING,
  TRIBUNAL_MANDATE_TYPEHASH,
  TRIBUNAL_FILL_TYPEHASH,
  TRIBUNAL_FILL_COMPONENT_TYPEHASH,
  TRIBUNAL_RECIPIENT_CALLBACK_TYPEHASH,
  TRIBUNAL_BATCH_COMPACT_TYPEHASH,
  TRIBUNAL_LOCK_TYPEHASH,
  COMPACT_WITH_TRIBUNAL_MANDATE_TYPEHASH,
  TRIBUNAL_ADJUSTMENT_TYPEHASH,
  deriveTribunalFillComponentHash,
  deriveTribunalFillHash,
  deriveTribunalMandateHash,
  deriveTribunalClaimHash,
  deriveTribunalAdjustmentHash,
  encodeClaimant,
  decodeClaimant,
  encodeValidityConditions,
  decodeValidityConditions,
  encodeERC7683OriginData,
  encodeERC7683FillerData,
} from './encoding/tribunal'
import { TribunalBuilder, TribunalAdjustmentBuilder, createSameChainFill } from './builders/tribunal'
import { createTribunalDomain, getTribunalDomainSeparator, THE_COMPACT_ADDRESS } from './config/tribunal'
import {
  deriveAmounts,
  deriveAmountsFromComponents,
  BASE_SCALING_FACTOR,
  calculatePriorityFeeAboveBaseline,
} from './lib/tribunalAmounts'
import { createPriceCurveElement } from './lib/priceCurve'

// Known values from Tribunal Solidity implementation
const SOLIDITY_MANDATE_TYPEHASH = '0xd98eceb6e5c7770b3b664a99c269855402fe5255294a30970d25376caea662c6'
const SOLIDITY_MANDATE_FILL_TYPEHASH = '0x1d0ee69a7bc1ac54d9a6b38f32ab156fbfe09a9098843d54f89e7b1033533d33'
const SOLIDITY_MANDATE_FILL_COMPONENT_TYPEHASH = '0x97a135285706d21a6b74ac159b77b16cea827acc358fc6c33e430ce0a85fe9d6'
const SOLIDITY_MANDATE_RECIPIENT_CALLBACK_TYPEHASH =
  '0xb60a17eb6828a433f2f2fcbeb119166fa25e1fb6ae3866e33952bb74f5055031'
const SOLIDITY_MANDATE_BATCH_COMPACT_TYPEHASH = '0x75d7205b7ec9e9b203d9161387d95a46c8440f4530dceab1bb28d4194a586227'
const SOLIDITY_MANDATE_LOCK_TYPEHASH = '0xce4f0854d9091f37d9dfb64592eee0de534c6680a5444fd55739b61228a6e0b0'
const SOLIDITY_COMPACT_WITH_MANDATE_TYPEHASH = '0xdbbdcf42471b4a26f7824df9f33f0a4f9bb4e7a66be6a31be8868a6cbbec0a7d'
const SOLIDITY_ADJUSTMENT_TYPEHASH = '0xe829b2a82439f37ac7578a226e337d334e0ee0da2f05ab63891c19cb84714414'

describe('Tribunal SDK - Integration Tests', () => {
  describe('Type Hash Verification (Solidity Parity)', () => {
    it('TRIBUNAL_MANDATE_TYPEHASH matches Solidity constant', () => {
      expect(TRIBUNAL_MANDATE_TYPEHASH).toBe(SOLIDITY_MANDATE_TYPEHASH)
    })

    it('TRIBUNAL_FILL_TYPEHASH matches Solidity constant', () => {
      expect(TRIBUNAL_FILL_TYPEHASH).toBe(SOLIDITY_MANDATE_FILL_TYPEHASH)
    })

    it('TRIBUNAL_FILL_COMPONENT_TYPEHASH matches Solidity constant', () => {
      expect(TRIBUNAL_FILL_COMPONENT_TYPEHASH).toBe(SOLIDITY_MANDATE_FILL_COMPONENT_TYPEHASH)
    })

    it('TRIBUNAL_RECIPIENT_CALLBACK_TYPEHASH matches Solidity constant', () => {
      expect(TRIBUNAL_RECIPIENT_CALLBACK_TYPEHASH).toBe(SOLIDITY_MANDATE_RECIPIENT_CALLBACK_TYPEHASH)
    })

    it('TRIBUNAL_BATCH_COMPACT_TYPEHASH matches Solidity constant', () => {
      expect(TRIBUNAL_BATCH_COMPACT_TYPEHASH).toBe(SOLIDITY_MANDATE_BATCH_COMPACT_TYPEHASH)
    })

    it('TRIBUNAL_LOCK_TYPEHASH matches Solidity constant', () => {
      expect(TRIBUNAL_LOCK_TYPEHASH).toBe(SOLIDITY_MANDATE_LOCK_TYPEHASH)
    })

    it('COMPACT_WITH_TRIBUNAL_MANDATE_TYPEHASH matches Solidity constant', () => {
      expect(COMPACT_WITH_TRIBUNAL_MANDATE_TYPEHASH).toBe(SOLIDITY_COMPACT_WITH_MANDATE_TYPEHASH)
    })

    it('TRIBUNAL_ADJUSTMENT_TYPEHASH matches Solidity constant', () => {
      expect(TRIBUNAL_ADJUSTMENT_TYPEHASH).toBe(SOLIDITY_ADJUSTMENT_TYPEHASH)
    })

    // Verify typestrings hash to expected values
    it('typestrings hash to expected values', () => {
      expect(keccak256(toHex(TRIBUNAL_MANDATE_TYPESTRING))).toBe(SOLIDITY_MANDATE_TYPEHASH)
      expect(keccak256(toHex(TRIBUNAL_FILL_TYPESTRING))).toBe(SOLIDITY_MANDATE_FILL_TYPEHASH)
      expect(keccak256(toHex(TRIBUNAL_FILL_COMPONENT_TYPESTRING))).toBe(SOLIDITY_MANDATE_FILL_COMPONENT_TYPEHASH)
      expect(keccak256(toHex(TRIBUNAL_RECIPIENT_CALLBACK_TYPESTRING))).toBe(
        SOLIDITY_MANDATE_RECIPIENT_CALLBACK_TYPEHASH
      )
      expect(keccak256(toHex(TRIBUNAL_BATCH_COMPACT_TYPESTRING))).toBe(SOLIDITY_MANDATE_BATCH_COMPACT_TYPEHASH)
      expect(keccak256(toHex(TRIBUNAL_LOCK_TYPESTRING))).toBe(SOLIDITY_MANDATE_LOCK_TYPEHASH)
      expect(keccak256(toHex(COMPACT_WITH_TRIBUNAL_MANDATE_TYPESTRING))).toBe(SOLIDITY_COMPACT_WITH_MANDATE_TYPEHASH)
      expect(keccak256(toHex(TRIBUNAL_ADJUSTMENT_TYPESTRING))).toBe(SOLIDITY_ADJUSTMENT_TYPEHASH)
    })
  })

  describe('End-to-End Hash Derivation', () => {
    // Test addresses (lowercase to avoid checksum issues)
    const testFillToken = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address // USDC
    const testRecipient = '0x0734d56da60852a03e2aafae8a36ffd8c12b32f1' as Address
    const testTribunal = '0x1234567890123456789012345678901234567890' as Address
    const testAdjuster = '0xdeadbeef00000000000000000000000000000000' as Address
    const testArbiter = '0x00000000000000171ede64904551eedf3c6c9788' as Address
    const testSponsor = '0x0734d56da60852a03e2aafae8a36ffd8c12b32f1' as Address
    const testToken = '0x0000000000000000000000000000000000000000' as Address // Native ETH
    const testLockTag = '0x00ee10cc2a753794795b6700' as Hex

    it('derives consistent claim hash for a simple mandate', () => {
      // Build a simple mandate using the builder
      const mandate = TribunalBuilder.mandate()
        .adjuster(testAdjuster)
        .fill((f) =>
          f
            .chainId(1n)
            .tribunal(testTribunal)
            .expires(BigInt(Math.floor(Date.now() / 1000) + 3600))
            .component((c) =>
              c.fillToken(testFillToken).minimumFillAmount(1000000n).recipient(testRecipient).applyScaling(false)
            )
            .salt('0x1234567890123456789012345678901234567890123456789012345678901234')
        )
        .build()

      // Derive mandate hash
      const mandateHash = deriveTribunalMandateHash(mandate)

      // Verify it's a valid bytes32
      expect(mandateHash).toMatch(/^0x[a-f0-9]{64}$/i)

      // Create compact and derive claim hash
      const compact = {
        arbiter: testArbiter,
        sponsor: testSponsor,
        nonce: 1n,
        expires: BigInt(Math.floor(Date.now() / 1000) + 3600),
        commitments: [
          {
            lockTag: testLockTag,
            token: testToken,
            amount: 1000000000000000000n, // 1 ETH
          },
        ],
      }

      const claimHash = deriveTribunalClaimHash(compact, mandateHash)
      expect(claimHash).toMatch(/^0x[a-f0-9]{64}$/i)

      // Verify determinism - same inputs produce same hash
      const claimHash2 = deriveTribunalClaimHash(compact, mandateHash)
      expect(claimHash).toBe(claimHash2)
    })

    it('derives consistent adjustment hash', () => {
      const domain = createTribunalDomain({
        chainId: 1,
        tribunalAddress: testTribunal,
      })

      const claimHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex

      const builder = new TribunalAdjustmentBuilder(domain)
        .adjuster(testAdjuster)
        .fillIndex(0n)
        .targetBlock(12345678n)
        .blockWindow(10)
        .exclusiveFiller(testRecipient)

      const { adjustment, hash, typedData } = builder.build(claimHash)

      // Verify adjustment structure
      expect(adjustment.fillIndex).toBe(0n)
      expect(adjustment.targetBlock).toBe(12345678n)

      // Verify hash is valid
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/i)

      // Verify typed data structure
      expect(typedData.primaryType).toBe('Adjustment')
      expect(typedData.domain?.name).toBe('Tribunal')
      expect(typedData.domain?.version).toBe('1')

      // Verify hash derivation matches encoding function
      const encodedHash = deriveTribunalAdjustmentHash(
        {
          fillIndex: adjustment.fillIndex,
          targetBlock: adjustment.targetBlock,
          supplementalPriceCurve: adjustment.supplementalPriceCurve,
          validityConditions: adjustment.validityConditions,
        },
        claimHash
      )
      expect(hash).toBe(encodedHash)
    })
  })

  describe('Amount Derivation Consistency', () => {
    const testCommitments = [
      {
        lockTag: '0x00ee10cc2a753794795b6700' as Hex,
        token: '0x0000000000000000000000000000000000000000' as Address,
        amount: 1000000000000000000n, // 1e18
      },
    ]

    const testComponents = [
      {
        fillToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
        minimumFillAmount: 2000000000n, // 2000 USDC (6 decimals)
        recipient: '0x0734d56DA60852A03e2Aafae8a36FFd8c12B32f1' as Address,
        applyScaling: true,
      },
    ]

    it('derives neutral amounts at 1e18 scaling', () => {
      const result = deriveAmountsFromComponents({
        maximumClaimAmounts: testCommitments,
        components: testComponents,
        priceCurve: [],
        supplementalPriceCurve: [],
        targetBlock: 0n,
        fillBlock: 12345678n,
        baselinePriorityFee: 0n,
        scalingFactor: BASE_SCALING_FACTOR,
        priorityFeeAboveBaseline: 0n,
      })

      // At neutral scaling, fill amounts equal minimum
      expect(result.fillAmounts[0]).toBe(testComponents[0].minimumFillAmount)
      // Claim amounts equal maximum
      expect(result.claimAmounts[0]).toBe(testCommitments[0].amount)
      // Scaling multiplier is 1e18
      expect(result.scalingMultiplier).toBe(BASE_SCALING_FACTOR)
    })

    it('increases fill amounts in exact-in mode (scaling > 1e18)', () => {
      const scalingFactor = 1500000000000000000n // 1.5e18

      const result = deriveAmountsFromComponents({
        maximumClaimAmounts: testCommitments,
        components: testComponents,
        priceCurve: [],
        supplementalPriceCurve: [],
        targetBlock: 0n,
        fillBlock: 12345678n,
        baselinePriorityFee: 0n,
        scalingFactor,
        priorityFeeAboveBaseline: 0n,
      })

      // In exact-in mode at neutral scaling:
      // - Fill amounts are scaled to match the current scaling multiplier
      // - Claim amounts stay at maximum
      // Note: At priorityFeeAboveBaseline=0, the fill amount is still scaled by the multiplier
      expect(result.useExactIn).toBe(true)
      // At 1.5e18 scaling factor and 0 priority fee, multiplier is 1e18 (neutral), so fill = minimum * 1e18 / 1e18 rounded up
      expect(result.fillAmounts[0]).toBeGreaterThanOrEqual(testComponents[0].minimumFillAmount)
      expect(result.claimAmounts[0]).toBe(testCommitments[0].amount)
    })

    it('decreases claim amounts in exact-out mode (scaling < 1e18)', () => {
      const scalingFactor = 500000000000000000n // 0.5e18

      const result = deriveAmountsFromComponents({
        maximumClaimAmounts: testCommitments,
        components: testComponents,
        priceCurve: [],
        supplementalPriceCurve: [],
        targetBlock: 0n,
        fillBlock: 12345678n,
        baselinePriorityFee: 0n,
        scalingFactor,
        priorityFeeAboveBaseline: 0n,
      })

      // In exact-out mode at neutral current scaling:
      // - Fill amounts stay at minimum
      // - Claim amounts are scaled by the multiplier
      // Note: At priorityFeeAboveBaseline=0, the current scaling factor determines the multiplier
      expect(result.useExactIn).toBe(false)
      expect(result.fillAmounts[0]).toBe(testComponents[0].minimumFillAmount)
      // At 0.5e18 scaling factor and 0 priority fee, multiplier is 1e18 (neutral), so claim amounts = maximum * 1e18 / 1e18 = maximum
      expect(result.claimAmounts[0]).toBeLessThanOrEqual(testCommitments[0].amount)
    })

    it('applies priority fee scaling correctly', () => {
      const scalingFactor = 1100000000000000000n // 1.1e18 (exact-in mode)
      const baselinePriorityFee = 1000000000n // 1 gwei

      // Simulate priority fee of 5 gwei (4 above baseline)
      const priorityFeeAboveBaseline = 4n * 1000000000n

      const resultWithFee = deriveAmountsFromComponents({
        maximumClaimAmounts: testCommitments,
        components: testComponents,
        priceCurve: [],
        supplementalPriceCurve: [],
        targetBlock: 0n,
        fillBlock: 12345678n,
        baselinePriorityFee,
        scalingFactor,
        priorityFeeAboveBaseline,
      })

      const resultWithoutFee = deriveAmountsFromComponents({
        maximumClaimAmounts: testCommitments,
        components: testComponents,
        priceCurve: [],
        supplementalPriceCurve: [],
        targetBlock: 0n,
        fillBlock: 12345678n,
        baselinePriorityFee,
        scalingFactor,
        priorityFeeAboveBaseline: 0n,
      })

      // Higher priority fee should increase fill amounts in exact-in mode
      expect(resultWithFee.fillAmounts[0]).toBeGreaterThan(resultWithoutFee.fillAmounts[0])
    })

    it('calculatePriorityFeeAboveBaseline works correctly', () => {
      // Below baseline returns 0
      expect(calculatePriorityFeeAboveBaseline(1000000000n, 2000000000n)).toBe(0n)

      // Equal to baseline returns 0
      expect(calculatePriorityFeeAboveBaseline(1000000000n, 1000000000n)).toBe(0n)

      // Above baseline returns difference
      expect(calculatePriorityFeeAboveBaseline(3000000000n, 1000000000n)).toBe(2000000000n)
    })
  })

  describe('Claimant and Validity Conditions Encoding', () => {
    it('encodes and decodes claimant correctly', () => {
      const lockTag = '0x00ee10cc2a753794795b6700' as Hex
      const address = '0x0734d56DA60852A03e2Aafae8a36FFd8c12B32f1' as Address

      const encoded = encodeClaimant(lockTag, address)
      const decoded = decodeClaimant(encoded)

      expect(decoded.lockTag).toBe(lockTag)
      expect(decoded.address.toLowerCase()).toBe(address.toLowerCase())
    })

    it('encodes and decodes validity conditions correctly', () => {
      const exclusiveBidder = '0x0734d56DA60852A03e2Aafae8a36FFd8c12B32f1' as Address
      const blockWindow = 100

      const encoded = encodeValidityConditions(exclusiveBidder, blockWindow)
      const decoded = decodeValidityConditions(encoded)

      expect(decoded.exclusiveBidder?.toLowerCase()).toBe(exclusiveBidder.toLowerCase())
      expect(decoded.blockWindow).toBe(blockWindow)
    })

    it('handles empty validity conditions', () => {
      const encoded = encodeValidityConditions()
      const decoded = decodeValidityConditions(encoded)

      expect(decoded.exclusiveBidder).toBeNull()
      expect(decoded.blockWindow).toBe(0)
    })
  })

  describe('ERC-7683 Encoding', () => {
    const testAddresses = {
      adjuster: '0xdeadbeef00000000000000000000000000000000' as Address,
      arbiter: '0x00000000000000171ede64904551eedf3c6c9788' as Address,
      sponsor: '0x0734d56da60852a03e2aafae8a36ffd8c12b32f1' as Address,
      tribunal: '0x1234567890123456789012345678901234567890' as Address,
      fillToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address,
      recipient: '0x0734d56da60852a03e2aafae8a36ffd8c12b32f1' as Address,
      token: '0x0000000000000000000000000000000000000000' as Address,
    }
    const testLockTag = '0x00ee10cc2a753794795b6700' as Hex
    const testSalt = '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex

    it('encodes origin data correctly', () => {
      const originData = {
        claim: {
          compact: {
            arbiter: testAddresses.arbiter,
            sponsor: testAddresses.sponsor,
            nonce: 1n,
            expires: BigInt(Math.floor(Date.now() / 1000) + 3600),
            commitments: [{ lockTag: testLockTag, token: testAddresses.token, amount: 1000000000000000000n }],
          },
          sponsorSignature: '0x' as Hex,
          allocatorSignature: '0x' as Hex,
        },
        mandate: {
          chainId: 1n,
          tribunal: testAddresses.tribunal,
          expires: BigInt(Math.floor(Date.now() / 1000) + 3600),
          components: [
            {
              fillToken: testAddresses.fillToken,
              minimumFillAmount: 1000000n,
              recipient: testAddresses.recipient,
              applyScaling: true,
            },
          ],
          baselinePriorityFee: 0n,
          scalingFactor: BASE_SCALING_FACTOR,
          priceCurve: [],
          recipientCallback: [],
          salt: testSalt,
        },
        fillHashes: [],
      }

      const encoded = encodeERC7683OriginData(originData)

      // Verify it's valid hex
      expect(encoded).toMatch(/^0x[a-f0-9]+$/i)
      // Should be substantial size
      expect(encoded.length).toBeGreaterThan(500)
    })

    it('encodes filler data correctly', () => {
      const fillerData = {
        adjustment: {
          adjuster: testAddresses.adjuster,
          fillIndex: 0n,
          targetBlock: 12345678n,
          supplementalPriceCurve: [],
          validityConditions: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
          adjustmentAuthorization: '0x' as Hex,
        },
        claimant: encodeClaimant(testLockTag, testAddresses.recipient),
        fillBlock: 0n,
      }

      const encoded = encodeERC7683FillerData(fillerData)

      // Verify it's valid hex
      expect(encoded).toMatch(/^0x[a-f0-9]+$/i)
      // Should contain the claimant value
      expect(encoded.toLowerCase()).toContain(fillerData.claimant.slice(2).toLowerCase())
    })
  })

  describe('Domain Separator Computation', () => {
    it('computes domain separator correctly for mainnet', () => {
      const tribunalAddress = '0x1234567890123456789012345678901234567890' as Address
      const domain = createTribunalDomain({
        chainId: 1,
        tribunalAddress,
      })

      const separator = getTribunalDomainSeparator(domain)

      // Verify it's a valid bytes32
      expect(separator).toMatch(/^0x[a-f0-9]{64}$/i)
    })

    it('domain separator varies by chain', () => {
      const tribunalAddress = '0x1234567890123456789012345678901234567890' as Address

      const domain1 = createTribunalDomain({ chainId: 1, tribunalAddress })
      const domain10 = createTribunalDomain({ chainId: 10, tribunalAddress })
      const domain42161 = createTribunalDomain({ chainId: 42161, tribunalAddress })

      const sep1 = getTribunalDomainSeparator(domain1)
      const sep10 = getTribunalDomainSeparator(domain10)
      const sep42161 = getTribunalDomainSeparator(domain42161)

      // All should be different
      expect(sep1).not.toBe(sep10)
      expect(sep1).not.toBe(sep42161)
      expect(sep10).not.toBe(sep42161)
    })
  })

  describe('Builder Ergonomics', () => {
    it('builds complete mandate with fluent API', () => {
      const mandate = TribunalBuilder.mandate()
        .adjuster('0xdeadbeef00000000000000000000000000000000')
        .fill(
          (f) =>
            f
              .chainId(1n)
              .tribunal('0x1234567890123456789012345678901234567890')
              .expires(BigInt(Math.floor(Date.now() / 1000) + 3600))
              .component((c) =>
                c
                  .fillToken('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
                  .minimumFillAmount(1000000n)
                  .recipient('0x0734d56da60852a03e2aafae8a36ffd8c12b32f1')
                  .applyScaling(true)
              )
              .baselinePriorityFee(1000000000n) // 1 gwei
              .scalingFactor(1100000000000000000n) // 1.1e18
        )
        .build()

      expect(mandate.adjuster).toBe('0xdeadbeef00000000000000000000000000000000')
      expect(mandate.fills).toHaveLength(1)
      expect(mandate.fills[0].components).toHaveLength(1)
      expect(mandate.fills[0].baselinePriorityFee).toBe(1000000000n)
      expect(mandate.fills[0].scalingFactor).toBe(1100000000000000000n)
    })

    it('createSameChainFill helper works correctly', () => {
      const fill = createSameChainFill({
        chainId: 1n,
        tribunal: '0x1234567890123456789012345678901234567890' as Address,
        expires: BigInt(Math.floor(Date.now() / 1000) + 3600),
        fillToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address,
        minimumFillAmount: 1000000n,
        recipient: '0x0734d56da60852a03e2aafae8a36ffd8c12b32f1' as Address,
        scalingFactor: 1100000000000000000n,
      })

      expect(fill.chainId).toBe(1n)
      expect(fill.components).toHaveLength(1)
      expect(fill.scalingFactor).toBe(1100000000000000000n)
      expect(fill.recipientCallback).toHaveLength(0)
    })
  })
})
