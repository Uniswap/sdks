/**
 * Integration tests for Exarch SDK
 *
 * These tests validate Exarch SDK logic:
 * - Hash derivation matches expected behavior
 * - EIP-712 type hashes match Solidity constants
 * - Amount derivation is consistent across scenarios
 * - BidState packing/unpacking works correctly
 * - Claimant and validity conditions encoding is reversible
 *
 * On-chain tests are skipped until Exarch is deployed.
 * Run with: npm test -- --testPathPattern="exarch.integration"
 */

import { describe, it, expect } from '@jest/globals'
import { keccak256, toHex, Address, Hex, encodePacked, encodeAbiParameters } from 'viem'

import {
  EXARCH_MANDATE_TYPESTRING,
  EXARCH_FILL_TYPESTRING,
  EXARCH_FILL_COMPONENT_TYPESTRING,
  EXARCH_RECIPIENT_CALLBACK_TYPESTRING,
  EXARCH_BATCH_COMPACT_TYPESTRING,
  EXARCH_LOCK_TYPESTRING,
  COMPACT_WITH_EXARCH_MANDATE_TYPESTRING,
  EXARCH_ADJUSTMENT_TYPESTRING,
  EXARCH_MANDATE_TYPEHASH,
  EXARCH_FILL_TYPEHASH,
  EXARCH_FILL_COMPONENT_TYPEHASH,
  EXARCH_RECIPIENT_CALLBACK_TYPEHASH,
  EXARCH_BATCH_COMPACT_TYPEHASH,
  EXARCH_LOCK_TYPEHASH,
  COMPACT_WITH_EXARCH_MANDATE_TYPEHASH,
  EXARCH_ADJUSTMENT_TYPEHASH,
  deriveExarchFillComponentHash,
  deriveExarchFillHash,
  deriveExarchMandateHash,
  deriveExarchClaimHash,
  deriveExarchAdjustmentHash,
  encodeClaimant,
  decodeClaimant,
  encodeValidityConditions,
  decodeValidityConditions,
  unpackBidState,
  packBidStateData,
  hasActiveBid,
  calculateRescindForfeit,
  calculateRescindRefund,
  deriveAmounts,
  NEUTRAL_SCALING_FACTOR,
} from './encoding/exarch'
import { ExarchBuilder, createExarchSameChainFill } from './builders/exarch'
import { createExarchDomain, getExarchDomainSeparator, EXARCH_NAME_HASH, EXARCH_VERSION_HASH } from './config/exarch'
import { BidState } from './types/exarch'

// Known values from Exarch Solidity implementation (ExarchTypeHashes.sol)
// These are computed by keccak256 of the typestrings
const SOLIDITY_MANDATE_TYPEHASH = keccak256(
  toHex(
    'Mandate(address adjuster,address legate,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_Fill(uint256 chainId,address exarch,uint256 expires,Mandate_FillComponent[] components,uint256 bondAmount,uint256 earnestAmount,uint256 holdPeriod,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes32 mandateHash,bytes context)'
  )
)

const SOLIDITY_MANDATE_FILL_TYPEHASH = keccak256(
  toHex(
    'Mandate_Fill(uint256 chainId,address exarch,uint256 expires,Mandate_FillComponent[] components,uint256 bondAmount,uint256 earnestAmount,uint256 holdPeriod,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate(address adjuster,address legate,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes32 mandateHash,bytes context)'
  )
)

const SOLIDITY_MANDATE_FILL_COMPONENT_TYPEHASH = keccak256(
  toHex('Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)')
)

const SOLIDITY_MANDATE_RECIPIENT_CALLBACK_TYPEHASH = keccak256(
  toHex(
    'Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes32 mandateHash,bytes context)Mandate(address adjuster,address legate,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_Fill(uint256 chainId,address exarch,uint256 expires,Mandate_FillComponent[] components,uint256 bondAmount,uint256 earnestAmount,uint256 holdPeriod,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)'
  )
)

const SOLIDITY_MANDATE_BATCH_COMPACT_TYPEHASH = keccak256(
  toHex(
    'Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate(address adjuster,address legate,Mandate_Fill[] fills)Mandate_Fill(uint256 chainId,address exarch,uint256 expires,Mandate_FillComponent[] components,uint256 bondAmount,uint256 earnestAmount,uint256 holdPeriod,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes32 mandateHash,bytes context)'
  )
)

const SOLIDITY_MANDATE_LOCK_TYPEHASH = keccak256(toHex('Mandate_Lock(bytes12 lockTag,address token,uint256 amount)'))

const SOLIDITY_COMPACT_WITH_MANDATE_TYPEHASH = keccak256(
  toHex(
    'BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Lock[] commitments,Mandate mandate)Lock(bytes12 lockTag,address token,uint256 amount)Mandate(address adjuster,address legate,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_Fill(uint256 chainId,address exarch,uint256 expires,Mandate_FillComponent[] components,uint256 bondAmount,uint256 earnestAmount,uint256 holdPeriod,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes32 mandateHash,bytes context)'
  )
)

const SOLIDITY_ADJUSTMENT_TYPEHASH = keccak256(
  toHex(
    'Adjustment(address adjuster,bytes32 claimHash,uint256 fillIndex,uint256 targetBlock,uint256[] supplementalPriceCurve,bytes32 validityConditions,uint256 nonce)'
  )
)

describe('Exarch SDK - Integration Tests', () => {
  describe('Type Hash Verification (Solidity Parity)', () => {
    it('EXARCH_MANDATE_TYPEHASH matches Solidity constant', () => {
      expect(EXARCH_MANDATE_TYPEHASH).toBe(SOLIDITY_MANDATE_TYPEHASH)
    })

    it('EXARCH_FILL_TYPEHASH matches Solidity constant', () => {
      expect(EXARCH_FILL_TYPEHASH).toBe(SOLIDITY_MANDATE_FILL_TYPEHASH)
    })

    it('EXARCH_FILL_COMPONENT_TYPEHASH matches Solidity constant', () => {
      expect(EXARCH_FILL_COMPONENT_TYPEHASH).toBe(SOLIDITY_MANDATE_FILL_COMPONENT_TYPEHASH)
    })

    it('EXARCH_RECIPIENT_CALLBACK_TYPEHASH matches Solidity constant', () => {
      expect(EXARCH_RECIPIENT_CALLBACK_TYPEHASH).toBe(SOLIDITY_MANDATE_RECIPIENT_CALLBACK_TYPEHASH)
    })

    it('EXARCH_BATCH_COMPACT_TYPEHASH matches Solidity constant', () => {
      expect(EXARCH_BATCH_COMPACT_TYPEHASH).toBe(SOLIDITY_MANDATE_BATCH_COMPACT_TYPEHASH)
    })

    it('EXARCH_LOCK_TYPEHASH matches Solidity constant', () => {
      expect(EXARCH_LOCK_TYPEHASH).toBe(SOLIDITY_MANDATE_LOCK_TYPEHASH)
    })

    it('COMPACT_WITH_EXARCH_MANDATE_TYPEHASH matches Solidity constant', () => {
      expect(COMPACT_WITH_EXARCH_MANDATE_TYPEHASH).toBe(SOLIDITY_COMPACT_WITH_MANDATE_TYPEHASH)
    })

    it('EXARCH_ADJUSTMENT_TYPEHASH matches Solidity constant', () => {
      expect(EXARCH_ADJUSTMENT_TYPEHASH).toBe(SOLIDITY_ADJUSTMENT_TYPEHASH)
    })

    // Verify typestrings hash to expected values
    it('typestrings hash to expected values', () => {
      expect(keccak256(toHex(EXARCH_MANDATE_TYPESTRING))).toBe(SOLIDITY_MANDATE_TYPEHASH)
      expect(keccak256(toHex(EXARCH_FILL_TYPESTRING))).toBe(SOLIDITY_MANDATE_FILL_TYPEHASH)
      expect(keccak256(toHex(EXARCH_FILL_COMPONENT_TYPESTRING))).toBe(SOLIDITY_MANDATE_FILL_COMPONENT_TYPEHASH)
      expect(keccak256(toHex(EXARCH_RECIPIENT_CALLBACK_TYPESTRING))).toBe(SOLIDITY_MANDATE_RECIPIENT_CALLBACK_TYPEHASH)
      expect(keccak256(toHex(EXARCH_BATCH_COMPACT_TYPESTRING))).toBe(SOLIDITY_MANDATE_BATCH_COMPACT_TYPEHASH)
      expect(keccak256(toHex(EXARCH_LOCK_TYPESTRING))).toBe(SOLIDITY_MANDATE_LOCK_TYPEHASH)
      expect(keccak256(toHex(COMPACT_WITH_EXARCH_MANDATE_TYPESTRING))).toBe(SOLIDITY_COMPACT_WITH_MANDATE_TYPEHASH)
      expect(keccak256(toHex(EXARCH_ADJUSTMENT_TYPESTRING))).toBe(SOLIDITY_ADJUSTMENT_TYPEHASH)
    })
  })

  describe('End-to-End Hash Derivation', () => {
    // Test addresses (lowercase to avoid checksum issues)
    const testFillToken = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address // USDC
    const testRecipient = '0x0734d56da60852a03e2aafae8a36ffd8c12b32f1' as Address
    const testExarch = '0x1234567890123456789012345678901234567890' as Address
    const testAdjuster = '0xdeadbeef00000000000000000000000000000000' as Address
    const testLegate = '0xabcdef1234567890abcdef1234567890abcdef12' as Address
    const testArbiter = '0x00000000000000171ede64904551eedf3c6c9788' as Address
    const testSponsor = '0x0734d56da60852a03e2aafae8a36ffd8c12b32f1' as Address
    const testToken = '0x0000000000000000000000000000000000000000' as Address // Native ETH
    const testLockTag = '0x00ee10cc2a753794795b6700' as Hex

    it('derives consistent claim hash for a simple mandate', () => {
      // Build a simple mandate using the builder
      const mandate = ExarchBuilder.mandate()
        .adjuster(testAdjuster)
        .legate(testLegate)
        .fill((f) =>
          f
            .chainId(1n)
            .exarch(testExarch)
            .expires(BigInt(Math.floor(Date.now() / 1000) + 3600))
            .bondAmount(1000000000000000n) // 0.001 ETH
            .earnestAmount(100000000000000n) // 0.0001 ETH
            .holdPeriod(10n) // 10 blocks
            .component((c) =>
              c.fillToken(testFillToken).minimumFillAmount(1000000n).recipient(testRecipient).applyScaling(false)
            )
            .salt('0x1234567890123456789012345678901234567890123456789012345678901234')
        )
        .build()

      // Derive fill hashes
      const fillHashes = mandate.fills.map(deriveExarchFillHash)

      // Derive mandate hash
      const mandateHash = deriveExarchMandateHash(mandate.adjuster, mandate.legate, fillHashes)

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

      const claimHash = deriveExarchClaimHash(compact, mandateHash)
      expect(claimHash).toMatch(/^0x[a-f0-9]{64}$/i)

      // Verify determinism - same inputs produce same hash
      const claimHash2 = deriveExarchClaimHash(compact, mandateHash)
      expect(claimHash).toBe(claimHash2)
    })

    it('derives consistent adjustment hash', () => {
      const domain = createExarchDomain({
        chainId: 1,
        exarchAddress: testExarch,
      })

      const claimHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex

      const builder = ExarchBuilder.adjustment(domain)
        .adjuster(testAdjuster)
        .fillIndex(0n)
        .targetBlock(12345678n)
        .blockWindow(10)
        .exclusiveBidder(testRecipient)
        .nonce(1n)

      const { adjustment, hash, typedData } = builder.build(claimHash)

      // Verify adjustment structure
      expect(adjustment.fillIndex).toBe(0n)
      expect(adjustment.targetBlock).toBe(12345678n)
      expect(adjustment.nonce).toBe(1n)

      // Verify hash is valid
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/i)

      // Verify typed data structure
      expect(typedData.primaryType).toBe('Adjustment')
      expect(typedData.domain?.name).toBe('Exarch')
      expect(typedData.domain?.version).toBe('1')

      // Verify hash derivation matches encoding function
      const encodedHash = deriveExarchAdjustmentHash(
        {
          adjuster: adjustment.adjuster,
          fillIndex: adjustment.fillIndex,
          targetBlock: adjustment.targetBlock,
          supplementalPriceCurve: adjustment.supplementalPriceCurve,
          validityConditions: adjustment.validityConditions,
          nonce: adjustment.nonce,
        },
        claimHash
      )
      expect(hash).toBe(encodedHash)
    })

    it('derives different hashes for different fills', () => {
      const fill1 = ExarchBuilder.fill()
        .chainId(1n)
        .exarch(testExarch)
        .expires(BigInt(Math.floor(Date.now() / 1000) + 3600))
        .bondAmount(1000000000000000n)
        .component((c) => c.fillToken(testFillToken).minimumFillAmount(1000000n).recipient(testRecipient))
        .salt('0x0000000000000000000000000000000000000000000000000000000000000001')
        .build()

      const fill2 = ExarchBuilder.fill()
        .chainId(1n)
        .exarch(testExarch)
        .expires(BigInt(Math.floor(Date.now() / 1000) + 3600))
        .bondAmount(1000000000000000n)
        .component((c) => c.fillToken(testFillToken).minimumFillAmount(2000000n).recipient(testRecipient))
        .salt('0x0000000000000000000000000000000000000000000000000000000000000001')
        .build()

      const hash1 = deriveExarchFillHash(fill1)
      const hash2 = deriveExarchFillHash(fill2)

      expect(hash1).not.toBe(hash2)
    })

    it('fill component hash is deterministic', () => {
      const component = {
        fillToken: testFillToken,
        minimumFillAmount: 1000000n,
        recipient: testRecipient,
        applyScaling: true,
      }

      const hash1 = deriveExarchFillComponentHash(component)
      const hash2 = deriveExarchFillComponentHash(component)

      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/i)
    })
  })

  describe('BidState Packing/Unpacking', () => {
    it('packs and unpacks bid state correctly', () => {
      const original = {
        aggregateBond: 1000000000000000000n, // 1 ETH
        bidExpiry: 12345678n,
        fillIndex: 5,
        filled: false,
        cancelled: false,
      }

      const packed = packBidStateData(original)
      const bidState: BidState = {
        claimant: '0x0000000000000000000000001234567890123456789012345678901234567890' as Hex,
        scalingFactor: NEUTRAL_SCALING_FACTOR,
        packedData: packed,
      }

      const unpacked = unpackBidState(bidState)

      expect(unpacked.aggregateBond).toBe(original.aggregateBond)
      expect(unpacked.bidExpiry).toBe(original.bidExpiry)
      expect(unpacked.fillIndex).toBe(original.fillIndex)
      expect(unpacked.filled).toBe(original.filled)
      expect(unpacked.cancelled).toBe(original.cancelled)
    })

    it('packs filled and cancelled flags correctly', () => {
      const filledBid = packBidStateData({
        aggregateBond: 1000000000000000000n,
        bidExpiry: 12345678n,
        fillIndex: 0,
        filled: true,
        cancelled: false,
      })

      const cancelledBid = packBidStateData({
        aggregateBond: 1000000000000000000n,
        bidExpiry: 12345678n,
        fillIndex: 0,
        filled: false,
        cancelled: true,
      })

      const unpackedFilled = unpackBidState({
        claimant: ('0x' + '00'.repeat(32)) as Hex,
        scalingFactor: NEUTRAL_SCALING_FACTOR,
        packedData: filledBid,
      })

      const unpackedCancelled = unpackBidState({
        claimant: ('0x' + '00'.repeat(32)) as Hex,
        scalingFactor: NEUTRAL_SCALING_FACTOR,
        packedData: cancelledBid,
      })

      expect(unpackedFilled.filled).toBe(true)
      expect(unpackedFilled.cancelled).toBe(false)
      expect(unpackedCancelled.filled).toBe(false)
      expect(unpackedCancelled.cancelled).toBe(true)
    })

    it('hasActiveBid returns correct result', () => {
      const activeBid = '0x0000000000000000000000001234567890123456789012345678901234567890' as Hex
      const inactiveBid = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex

      expect(hasActiveBid(activeBid)).toBe(true)
      expect(hasActiveBid(inactiveBid)).toBe(false)
    })

    it('handles maximum values correctly', () => {
      const maxValues = {
        aggregateBond: (1n << 96n) - 1n, // Max 96-bit value
        bidExpiry: (1n << 64n) - 1n, // Max 64-bit value
        fillIndex: (1 << 16) - 1, // Max 16-bit value (65535)
        filled: true,
        cancelled: true,
      }

      const packed = packBidStateData(maxValues)
      const bidState: BidState = {
        claimant: ('0x' + 'ff'.repeat(32)) as Hex,
        scalingFactor: NEUTRAL_SCALING_FACTOR,
        packedData: packed,
      }

      const unpacked = unpackBidState(bidState)

      expect(unpacked.aggregateBond).toBe(maxValues.aggregateBond)
      expect(unpacked.bidExpiry).toBe(maxValues.bidExpiry)
      expect(unpacked.fillIndex).toBe(maxValues.fillIndex)
      expect(unpacked.filled).toBe(true)
      expect(unpacked.cancelled).toBe(true)
    })
  })

  describe('Amount Derivation', () => {
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
      const result = deriveAmounts({
        commitments: testCommitments,
        components: testComponents,
        scalingFactor: NEUTRAL_SCALING_FACTOR,
      })

      // At neutral scaling, fill amounts equal minimum
      expect(result.fillAmounts[0]).toBe(testComponents[0].minimumFillAmount)
      // Claim amounts equal maximum
      expect(result.claimAmounts[0]).toBe(testCommitments[0].amount)
    })

    it('increases fill amounts in exact-in mode (scaling > 1e18)', () => {
      const scalingFactor = 1500000000000000000n // 1.5e18

      const result = deriveAmounts({
        commitments: testCommitments,
        components: testComponents,
        scalingFactor,
      })

      // In exact-in mode, fill amounts are scaled up
      expect(result.fillAmounts[0]).toBeGreaterThan(testComponents[0].minimumFillAmount)
      // Claim amounts stay at maximum
      expect(result.claimAmounts[0]).toBe(testCommitments[0].amount)

      // Verify exact scaling: fillAmount = minimumFillAmount * 1.5e18 / 1e18 = minimumFillAmount * 1.5
      const expectedFillAmount = (testComponents[0].minimumFillAmount * scalingFactor) / NEUTRAL_SCALING_FACTOR
      expect(result.fillAmounts[0]).toBe(expectedFillAmount)
    })

    it('decreases claim amounts in exact-out mode (scaling < 1e18)', () => {
      const scalingFactor = 500000000000000000n // 0.5e18

      const result = deriveAmounts({
        commitments: testCommitments,
        components: testComponents,
        scalingFactor,
      })

      // In exact-out mode, fill amounts stay at minimum
      expect(result.fillAmounts[0]).toBe(testComponents[0].minimumFillAmount)
      // Claim amounts are scaled down
      expect(result.claimAmounts[0]).toBeLessThan(testCommitments[0].amount)

      // Verify exact scaling: claimAmount = commitment.amount * 0.5e18 / 1e18 = commitment.amount * 0.5
      const expectedClaimAmount = (testCommitments[0].amount * scalingFactor) / NEUTRAL_SCALING_FACTOR
      expect(result.claimAmounts[0]).toBe(expectedClaimAmount)
    })

    it('respects applyScaling flag', () => {
      const scalingFactor = 1500000000000000000n // 1.5e18

      const componentsWithNoScaling = [
        {
          ...testComponents[0],
          applyScaling: false, // Disable scaling
        },
      ]

      const result = deriveAmounts({
        commitments: testCommitments,
        components: componentsWithNoScaling,
        scalingFactor,
      })

      // With applyScaling=false, fill amounts stay at minimum even in exact-in mode
      expect(result.fillAmounts[0]).toBe(componentsWithNoScaling[0].minimumFillAmount)
    })
  })

  describe('Rescindable Bond Calculation', () => {
    it('calculates linear decay correctly', () => {
      const params = {
        rescindableBond: 1000000000000000000n, // 1 ETH
        submissionBlock: 100n,
        currentBlock: 150n,
        expiryBlock: 200n,
      }

      // At halfway point, forfeit half the bond
      const forfeit = calculateRescindForfeit(params)
      const refund = calculateRescindRefund(params)

      expect(forfeit).toBe(500000000000000000n) // 0.5 ETH
      expect(refund).toBe(500000000000000000n) // 0.5 ETH
      expect(forfeit + refund).toBe(params.rescindableBond)
    })

    it('returns zero forfeit at submission block', () => {
      const params = {
        rescindableBond: 1000000000000000000n,
        submissionBlock: 100n,
        currentBlock: 100n, // At submission
        expiryBlock: 200n,
      }

      const forfeit = calculateRescindForfeit(params)
      expect(forfeit).toBe(0n)
    })

    it('returns full forfeit at expiry block', () => {
      const params = {
        rescindableBond: 1000000000000000000n,
        submissionBlock: 100n,
        currentBlock: 200n, // At expiry
        expiryBlock: 200n,
      }

      const forfeit = calculateRescindForfeit(params)
      expect(forfeit).toBe(params.rescindableBond)
    })

    it('returns full forfeit after expiry block', () => {
      const params = {
        rescindableBond: 1000000000000000000n,
        submissionBlock: 100n,
        currentBlock: 250n, // After expiry
        expiryBlock: 200n,
      }

      const forfeit = calculateRescindForfeit(params)
      expect(forfeit).toBe(params.rescindableBond)
    })

    it('handles edge case of single block window', () => {
      const params = {
        rescindableBond: 1000000000000000000n,
        submissionBlock: 100n,
        currentBlock: 100n,
        expiryBlock: 101n, // Single block window
      }

      const forfeit = calculateRescindForfeit(params)
      expect(forfeit).toBe(0n)
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

    it('handles exclusive bidder only', () => {
      const exclusiveBidder = '0x0734d56DA60852A03e2Aafae8a36FFd8c12B32f1' as Address
      const encoded = encodeValidityConditions(exclusiveBidder)
      const decoded = decodeValidityConditions(encoded)

      expect(decoded.exclusiveBidder?.toLowerCase()).toBe(exclusiveBidder.toLowerCase())
      expect(decoded.blockWindow).toBe(0)
    })

    it('handles block window only', () => {
      const blockWindow = 50
      const encoded = encodeValidityConditions(undefined, blockWindow)
      const decoded = decodeValidityConditions(encoded)

      expect(decoded.exclusiveBidder).toBeNull()
      expect(decoded.blockWindow).toBe(blockWindow)
    })

    it('claimant encoding produces correct bit layout', () => {
      const lockTag = '0xffffffffffff000000000000' as Hex
      const address = '0x0000000000000000000000000000000000000001' as Address

      const encoded = encodeClaimant(lockTag, address)

      // lockTag in upper 96 bits, address in lower 160 bits
      expect(encoded.startsWith('0xffffffffffff000000000000')).toBe(true)
      expect(encoded.endsWith('0000000000000000000000000000000001')).toBe(true)
    })
  })

  describe('Domain Separator Computation', () => {
    it('computes domain separator correctly for mainnet', () => {
      const exarchAddress = '0x1234567890123456789012345678901234567890' as Address
      const domain = createExarchDomain({
        chainId: 1,
        exarchAddress,
      })

      const separator = getExarchDomainSeparator(domain)

      // Verify it's a valid bytes32
      expect(separator).toMatch(/^0x[a-f0-9]{64}$/i)
    })

    it('domain separator varies by chain', () => {
      const exarchAddress = '0x1234567890123456789012345678901234567890' as Address

      const domain1 = createExarchDomain({ chainId: 1, exarchAddress })
      const domain10 = createExarchDomain({ chainId: 10, exarchAddress })
      const domain42161 = createExarchDomain({ chainId: 42161, exarchAddress })

      const sep1 = getExarchDomainSeparator(domain1)
      const sep10 = getExarchDomainSeparator(domain10)
      const sep42161 = getExarchDomainSeparator(domain42161)

      // All should be different
      expect(sep1).not.toBe(sep10)
      expect(sep1).not.toBe(sep42161)
      expect(sep10).not.toBe(sep42161)
    })

    it('domain separator varies by contract address', () => {
      const address1 = '0x1111111111111111111111111111111111111111' as Address
      const address2 = '0x2222222222222222222222222222222222222222' as Address

      const domain1 = createExarchDomain({ chainId: 1, exarchAddress: address1 })
      const domain2 = createExarchDomain({ chainId: 1, exarchAddress: address2 })

      const sep1 = getExarchDomainSeparator(domain1)
      const sep2 = getExarchDomainSeparator(domain2)

      expect(sep1).not.toBe(sep2)
    })

    it('pre-computed name hash is correct', () => {
      const computedNameHash = keccak256(toHex('Exarch'))
      expect(EXARCH_NAME_HASH).toBe(computedNameHash)
    })

    it('pre-computed version hash is correct', () => {
      const computedVersionHash = keccak256(toHex('1'))
      expect(EXARCH_VERSION_HASH).toBe(computedVersionHash)
    })
  })

  describe('Builder Ergonomics', () => {
    it('builds complete mandate with fluent API', () => {
      const mandate = ExarchBuilder.mandate()
        .adjuster('0xdeadbeef00000000000000000000000000000000')
        .legate('0xabcdef1234567890abcdef1234567890abcdef12')
        .fill(
          (f) =>
            f
              .chainId(1n)
              .exarch('0x1234567890123456789012345678901234567890')
              .expires(BigInt(Math.floor(Date.now() / 1000) + 3600))
              .bondAmount(1000000000000000n)
              .earnestAmount(100000000000000n)
              .holdPeriod(10n)
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
      expect(mandate.legate).toBe('0xabcdef1234567890abcdef1234567890abcdef12')
      expect(mandate.fills).toHaveLength(1)
      expect(mandate.fills[0].components).toHaveLength(1)
      expect(mandate.fills[0].bondAmount).toBe(1000000000000000n)
      expect(mandate.fills[0].earnestAmount).toBe(100000000000000n)
      expect(mandate.fills[0].holdPeriod).toBe(10n)
      expect(mandate.fills[0].baselinePriorityFee).toBe(1000000000n)
      expect(mandate.fills[0].scalingFactor).toBe(1100000000000000000n)
    })

    it('createExarchSameChainFill helper works correctly', () => {
      const fill = createExarchSameChainFill({
        chainId: 1n,
        exarch: '0x1234567890123456789012345678901234567890' as Address,
        expires: BigInt(Math.floor(Date.now() / 1000) + 3600),
        fillToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address,
        minimumFillAmount: 1000000n,
        recipient: '0x0734d56da60852a03e2aafae8a36ffd8c12b32f1' as Address,
        bondAmount: 1000000000000000n,
        earnestAmount: 100000000000000n,
        holdPeriod: 10n,
        scalingFactor: 1100000000000000000n,
      })

      expect(fill.chainId).toBe(1n)
      expect(fill.components).toHaveLength(1)
      expect(fill.bondAmount).toBe(1000000000000000n)
      expect(fill.earnestAmount).toBe(100000000000000n)
      expect(fill.holdPeriod).toBe(10n)
      expect(fill.scalingFactor).toBe(1100000000000000000n)
      expect(fill.recipientCallback).toHaveLength(0)
    })

    it('adjustment builder sets validity conditions correctly', () => {
      const domain = createExarchDomain({
        chainId: 1,
        exarchAddress: '0x1234567890123456789012345678901234567890',
      })

      const exclusiveBidder = '0xdeadbeef00000000000000000000000000000000' as Address
      const blockWindow = 20

      const { adjustment } = ExarchBuilder.adjustment(domain)
        .adjuster('0xdeadbeef00000000000000000000000000000000')
        .fillIndex(0n)
        .targetBlock(12345678n)
        .exclusiveBidder(exclusiveBidder)
        .blockWindow(blockWindow)
        .nonce(1n)
        .build(('0x' + '00'.repeat(32)) as Hex)

      // Decode validity conditions and verify
      const decoded = decodeValidityConditions(adjustment.validityConditions)
      expect(decoded.exclusiveBidder?.toLowerCase()).toBe(exclusiveBidder.toLowerCase())
      expect(decoded.blockWindow).toBe(blockWindow)
    })

    it('adjustment builder generates random nonce', () => {
      const domain = createExarchDomain({
        chainId: 1,
        exarchAddress: '0x1234567890123456789012345678901234567890',
      })

      const builder1 = ExarchBuilder.adjustment(domain)
        .adjuster('0xdeadbeef00000000000000000000000000000000')
        .fillIndex(0n)
        .targetBlock(12345678n)
        .randomNonce()

      const builder2 = ExarchBuilder.adjustment(domain)
        .adjuster('0xdeadbeef00000000000000000000000000000000')
        .fillIndex(0n)
        .targetBlock(12345678n)
        .randomNonce()

      const claimHash = ('0x' + '00'.repeat(32)) as Hex
      const { adjustment: adj1 } = builder1.build(claimHash)
      const { adjustment: adj2 } = builder2.build(claimHash)

      // Random nonces should be different (with extremely high probability)
      expect(adj1.nonce).not.toBe(adj2.nonce)
    })

    it('fill builder generates random salt', () => {
      const fill1 = ExarchBuilder.fill()
        .chainId(1n)
        .exarch('0x1234567890123456789012345678901234567890')
        .expires(BigInt(Math.floor(Date.now() / 1000) + 3600))
        .component((c) =>
          c
            .fillToken('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
            .minimumFillAmount(1000000n)
            .recipient('0x0734d56da60852a03e2aafae8a36ffd8c12b32f1')
        )
        .randomSalt()
        .build()

      const fill2 = ExarchBuilder.fill()
        .chainId(1n)
        .exarch('0x1234567890123456789012345678901234567890')
        .expires(BigInt(Math.floor(Date.now() / 1000) + 3600))
        .component((c) =>
          c
            .fillToken('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
            .minimumFillAmount(1000000n)
            .recipient('0x0734d56da60852a03e2aafae8a36ffd8c12b32f1')
        )
        .randomSalt()
        .build()

      // Random salts should be different
      expect(fill1.salt).not.toBe(fill2.salt)
    })

    it('fill instruction builder works correctly', () => {
      const instruction = ExarchBuilder.fillInstruction()
        .fillToken('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
        .fillAmount(1000000n)
        .recipient('0x0734d56da60852a03e2aafae8a36ffd8c12b32f1')
        .build()

      expect(instruction.fillToken).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
      expect(instruction.fillAmount).toBe(1000000n)
      expect(instruction.recipient).toBe('0x0734d56da60852a03e2aafae8a36ffd8c12b32f1')
    })
  })

  describe('Cross-validation with Mandate Construction', () => {
    it('mandate hash is consistent across different construction methods', () => {
      const adjuster = '0xdeadbeef00000000000000000000000000000000' as Address
      const legate = '0xabcdef1234567890abcdef1234567890abcdef12' as Address
      const exarch = '0x1234567890123456789012345678901234567890' as Address
      const fillToken = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address
      const recipient = '0x0734d56da60852a03e2aafae8a36ffd8c12b32f1' as Address
      const expires = BigInt(Math.floor(Date.now() / 1000) + 3600)
      const salt = '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex

      // Method 1: Using builder
      const mandate1 = ExarchBuilder.mandate()
        .adjuster(adjuster)
        .legate(legate)
        .fill((f) =>
          f
            .chainId(1n)
            .exarch(exarch)
            .expires(expires)
            .component((c) => c.fillToken(fillToken).minimumFillAmount(1000000n).recipient(recipient))
            .salt(salt)
        )
        .build()

      // Method 2: Direct construction
      const mandate2 = {
        adjuster,
        legate,
        fills: [
          {
            chainId: 1n,
            exarch,
            expires,
            components: [
              {
                fillToken,
                minimumFillAmount: 1000000n,
                recipient,
                applyScaling: false,
              },
            ],
            bondAmount: 0n,
            earnestAmount: 0n,
            holdPeriod: 0n,
            baselinePriorityFee: 0n,
            scalingFactor: NEUTRAL_SCALING_FACTOR,
            priceCurve: [],
            recipientCallback: [],
            salt,
          },
        ],
      }

      // Derive fill hashes
      const fillHashes1 = mandate1.fills.map(deriveExarchFillHash)
      const fillHashes2 = mandate2.fills.map(deriveExarchFillHash)

      // Fill hashes should match
      expect(fillHashes1).toEqual(fillHashes2)

      // Mandate hashes should match
      const mandateHash1 = deriveExarchMandateHash(mandate1.adjuster, mandate1.legate, fillHashes1)
      const mandateHash2 = deriveExarchMandateHash(mandate2.adjuster, mandate2.legate, fillHashes2)

      expect(mandateHash1).toBe(mandateHash2)
    })
  })
})
