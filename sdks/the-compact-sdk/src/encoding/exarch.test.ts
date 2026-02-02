/**
 * Tests for Exarch encoding utilities
 */

import { Address, Hex, parseEther, keccak256, toHex } from 'viem'

import { SCALING_FACTOR } from '../lib/priceCurve'
import { ExarchFillComponent, ExarchFillParameters, BidState } from '../types/exarch'
import { BatchCompact, Lock } from '../types/eip712'

import {
  // Type hash constants
  EXARCH_MANDATE_TYPESTRING,
  EXARCH_MANDATE_TYPEHASH,
  EXARCH_FILL_TYPEHASH,
  EXARCH_FILL_COMPONENT_TYPEHASH,
  EXARCH_ADJUSTMENT_TYPEHASH,
  EXARCH_WITNESS_TYPESTRING,
  LOCK_TYPEHASH,
  // Hash derivation
  deriveExarchFillComponentHash,
  deriveExarchFillComponentsHash,
  deriveExarchFillHash,
  deriveExarchMandateHash,
  deriveExarchClaimHash,
  deriveExarchAdjustmentHash,
  deriveExecutionHash,
  deriveCommitmentsHash,
  // Claimant encoding
  encodeClaimant,
  decodeClaimant,
  // Validity conditions
  encodeValidityConditions,
  decodeValidityConditions,
  // BidState utilities
  unpackBidState,
  packBidStateData,
  hasActiveBid,
  // Rescind calculation
  calculateRescindRefund,
  calculateRescindForfeit,
  // Amount derivation
  deriveAmounts,
  NEUTRAL_SCALING_FACTOR,
} from './exarch'

describe('Exarch Encoding Utilities', () => {
  const exarchAddress = '0x1234567890123456789012345678901234567890' as Address
  const adjusterAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address
  const legateAddress = '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd' as Address
  const recipientAddress = '0x1111111111111111111111111111111111111111' as Address
  const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address

  describe('Type Hash Constants', () => {
    it('should have correct mandate typestring', () => {
      expect(EXARCH_MANDATE_TYPESTRING).toContain('Mandate(address adjuster,address legate')
      expect(EXARCH_MANDATE_TYPESTRING).toContain('Mandate_Fill[]')
      expect(EXARCH_MANDATE_TYPESTRING).toContain('bondAmount')
      expect(EXARCH_MANDATE_TYPESTRING).toContain('earnestAmount')
      expect(EXARCH_MANDATE_TYPESTRING).toContain('holdPeriod')
    })

    it('should compute mandate typehash correctly', () => {
      const expected = keccak256(toHex(EXARCH_MANDATE_TYPESTRING))
      expect(EXARCH_MANDATE_TYPEHASH).toBe(expected)
    })

    it('should have correct witness typestring', () => {
      expect(EXARCH_WITNESS_TYPESTRING).toContain('address adjuster,address legate')
      // Witness typestring should NOT start with 'Mandate('
      expect(EXARCH_WITNESS_TYPESTRING.startsWith('Mandate(')).toBe(false)
      // Witness typestring should NOT end with closing paren
      expect(EXARCH_WITNESS_TYPESTRING).not.toMatch(/\)$/)
    })
  })

  describe('Fill Component Hash', () => {
    const component: ExarchFillComponent = {
      fillToken: usdcAddress,
      minimumFillAmount: 1000000n,
      recipient: recipientAddress,
      applyScaling: true,
    }

    it('should hash a fill component', () => {
      const hash = deriveExarchFillComponentHash(component)
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/)
    })

    it('should produce different hashes for different components', () => {
      const hash1 = deriveExarchFillComponentHash(component)
      const hash2 = deriveExarchFillComponentHash({
        ...component,
        minimumFillAmount: 2000000n,
      })
      expect(hash1).not.toBe(hash2)
    })

    it('should hash multiple components', () => {
      const components: ExarchFillComponent[] = [
        component,
        { ...component, fillToken: '0x0000000000000000000000000000000000000000' as Address },
      ]
      const hash = deriveExarchFillComponentsHash(components)
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/)
    })
  })

  describe('Fill Hash', () => {
    const fill: ExarchFillParameters = {
      chainId: 1n,
      exarch: exarchAddress,
      expires: BigInt(Date.now() + 3600000),
      components: [
        {
          fillToken: usdcAddress,
          minimumFillAmount: 1000000n,
          recipient: recipientAddress,
          applyScaling: true,
        },
      ],
      bondAmount: parseEther('0.1'),
      earnestAmount: parseEther('0.01'),
      holdPeriod: 100n,
      baselinePriorityFee: 1000000000n,
      scalingFactor: SCALING_FACTOR.NEUTRAL,
      priceCurve: [],
      recipientCallback: [],
      salt: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
    }

    it('should hash fill parameters', () => {
      const hash = deriveExarchFillHash(fill)
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/)
    })

    it('should produce different hashes for different fills', () => {
      const hash1 = deriveExarchFillHash(fill)
      const hash2 = deriveExarchFillHash({ ...fill, bondAmount: parseEther('0.2') })
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('Mandate Hash', () => {
    it('should derive mandate hash', () => {
      const fillHash1 = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const fillHash2 = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex

      const hash = deriveExarchMandateHash(adjusterAddress, legateAddress, [fillHash1, fillHash2])
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/)
    })

    it('should produce different hashes for different legates', () => {
      const fillHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex

      const hash1 = deriveExarchMandateHash(adjusterAddress, legateAddress, [fillHash])
      const hash2 = deriveExarchMandateHash(adjusterAddress, recipientAddress, [fillHash])

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('Claim Hash', () => {
    const compact: BatchCompact = {
      arbiter: exarchAddress,
      sponsor: adjusterAddress,
      nonce: 1n,
      expires: BigInt(Date.now() + 3600000),
      commitments: [
        {
          lockTag: '0x000000000000000000000001' as Hex,
          token: usdcAddress,
          amount: 1000000n,
        },
      ],
    }

    it('should derive claim hash', () => {
      const mandateHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const hash = deriveExarchClaimHash(compact, mandateHash)
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/)
    })

    it('should produce different hashes for different mandates', () => {
      const mandateHash1 = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
      const mandateHash2 = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex

      const hash1 = deriveExarchClaimHash(compact, mandateHash1)
      const hash2 = deriveExarchClaimHash(compact, mandateHash2)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('Adjustment Hash', () => {
    it('should derive adjustment hash', () => {
      const claimHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex

      const hash = deriveExarchAdjustmentHash(
        {
          adjuster: adjusterAddress,
          fillIndex: 0n,
          targetBlock: 1000n,
          supplementalPriceCurve: [],
          validityConditions: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
          nonce: 12345n,
        },
        claimHash
      )

      expect(hash).toMatch(/^0x[a-f0-9]{64}$/)
    })

    it('should produce different hashes for different nonces', () => {
      const claimHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex
      const baseAdjustment = {
        adjuster: adjusterAddress,
        fillIndex: 0n,
        targetBlock: 1000n,
        supplementalPriceCurve: [],
        validityConditions: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
      }

      const hash1 = deriveExarchAdjustmentHash({ ...baseAdjustment, nonce: 1n }, claimHash)
      const hash2 = deriveExarchAdjustmentHash({ ...baseAdjustment, nonce: 2n }, claimHash)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('Execution Hash', () => {
    it('should derive execution hash', () => {
      const claimHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex

      const hash = deriveExecutionHash(
        [
          { fillToken: usdcAddress, fillAmount: 1000000n, recipient: recipientAddress },
          {
            fillToken: '0x0000000000000000000000000000000000000000' as Address,
            fillAmount: parseEther('1'),
            recipient: recipientAddress,
          },
        ],
        claimHash
      )

      expect(hash).toMatch(/^0x[a-f0-9]{64}$/)
    })
  })

  describe('Claimant Encoding', () => {
    it('should encode claimant', () => {
      const lockTag = '0x000000000000000000000001' as Hex
      const claimant = encodeClaimant(lockTag, recipientAddress)

      expect(claimant).toMatch(/^0x[a-f0-9]{64}$/)
    })

    it('should decode claimant', () => {
      const lockTag = '0x000000000000000000000001' as Hex
      const claimant = encodeClaimant(lockTag, recipientAddress)
      const decoded = decodeClaimant(claimant)

      expect(decoded.lockTag).toBe(lockTag)
      expect(decoded.address.toLowerCase()).toBe(recipientAddress.toLowerCase())
    })

    it('should round-trip encode/decode', () => {
      const lockTags = [
        '0x000000000000000000000000' as Hex,
        '0x000000000000000000000001' as Hex,
        '0xffffffffffffffffffff0000' as Hex,
        '0xffffffffffffffffffff1234' as Hex,
      ]

      for (const lockTag of lockTags) {
        const claimant = encodeClaimant(lockTag, recipientAddress)
        const decoded = decodeClaimant(claimant)
        expect(decoded.lockTag).toBe(lockTag)
        expect(decoded.address.toLowerCase()).toBe(recipientAddress.toLowerCase())
      }
    })
  })

  describe('Validity Conditions', () => {
    it('should encode empty conditions', () => {
      const conditions = encodeValidityConditions()
      expect(conditions).toBe('0x0000000000000000000000000000000000000000000000000000000000000000')
    })

    it('should encode exclusive bidder', () => {
      const conditions = encodeValidityConditions(recipientAddress)
      const decoded = decodeValidityConditions(conditions)

      expect(decoded.exclusiveBidder?.toLowerCase()).toBe(recipientAddress.toLowerCase())
      expect(decoded.blockWindow).toBe(0)
    })

    it('should encode block window', () => {
      const conditions = encodeValidityConditions(undefined, 10)
      const decoded = decodeValidityConditions(conditions)

      expect(decoded.exclusiveBidder).toBeNull()
      expect(decoded.blockWindow).toBe(10)
    })

    it('should encode both exclusive bidder and block window', () => {
      const conditions = encodeValidityConditions(recipientAddress, 25)
      const decoded = decodeValidityConditions(conditions)

      expect(decoded.exclusiveBidder?.toLowerCase()).toBe(recipientAddress.toLowerCase())
      expect(decoded.blockWindow).toBe(25)
    })

    it('should decode null exclusive bidder for zero address', () => {
      const conditions = encodeValidityConditions('0x0000000000000000000000000000000000000000' as Address, 5)
      const decoded = decodeValidityConditions(conditions)

      expect(decoded.exclusiveBidder).toBeNull()
      expect(decoded.blockWindow).toBe(5)
    })
  })

  describe('BidState Utilities', () => {
    it('should pack and unpack bid state data', () => {
      const params = {
        aggregateBond: parseEther('0.5'),
        bidExpiry: 12345678n,
        fillIndex: 3,
        filled: false,
        cancelled: false,
      }

      const packed = packBidStateData(params)
      const bidState: BidState = {
        claimant: '0x0000000000000000000000001111111111111111111111111111111111111111' as Hex,
        scalingFactor: SCALING_FACTOR.NEUTRAL,
        packedData: packed,
      }

      const unpacked = unpackBidState(bidState)

      expect(unpacked.aggregateBond).toBe(params.aggregateBond)
      expect(unpacked.bidExpiry).toBe(params.bidExpiry)
      expect(unpacked.fillIndex).toBe(params.fillIndex)
      expect(unpacked.filled).toBe(params.filled)
      expect(unpacked.cancelled).toBe(params.cancelled)
      expect(unpacked.claimant).toBe(bidState.claimant)
      expect(unpacked.scalingFactor).toBe(bidState.scalingFactor)
    })

    it('should pack filled and cancelled flags', () => {
      const packedFilled = packBidStateData({
        aggregateBond: 0n,
        bidExpiry: 0n,
        fillIndex: 0,
        filled: true,
        cancelled: false,
      })

      const packedCancelled = packBidStateData({
        aggregateBond: 0n,
        bidExpiry: 0n,
        fillIndex: 0,
        filled: false,
        cancelled: true,
      })

      const packedBoth = packBidStateData({
        aggregateBond: 0n,
        bidExpiry: 0n,
        fillIndex: 0,
        filled: true,
        cancelled: true,
      })

      expect(
        unpackBidState({ claimant: ('0x' + '00'.repeat(32)) as Hex, scalingFactor: 0n, packedData: packedFilled })
          .filled
      ).toBe(true)
      expect(
        unpackBidState({ claimant: ('0x' + '00'.repeat(32)) as Hex, scalingFactor: 0n, packedData: packedFilled })
          .cancelled
      ).toBe(false)

      expect(
        unpackBidState({ claimant: ('0x' + '00'.repeat(32)) as Hex, scalingFactor: 0n, packedData: packedCancelled })
          .filled
      ).toBe(false)
      expect(
        unpackBidState({ claimant: ('0x' + '00'.repeat(32)) as Hex, scalingFactor: 0n, packedData: packedCancelled })
          .cancelled
      ).toBe(true)

      expect(
        unpackBidState({ claimant: ('0x' + '00'.repeat(32)) as Hex, scalingFactor: 0n, packedData: packedBoth }).filled
      ).toBe(true)
      expect(
        unpackBidState({ claimant: ('0x' + '00'.repeat(32)) as Hex, scalingFactor: 0n, packedData: packedBoth })
          .cancelled
      ).toBe(true)
    })

    it('should check for active bid', () => {
      const activeClaimant = '0x0000000000000000000000001111111111111111111111111111111111111111' as Hex
      const inactiveClaimant = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex

      expect(hasActiveBid(activeClaimant)).toBe(true)
      expect(hasActiveBid(inactiveClaimant)).toBe(false)
    })
  })

  describe('Rescind Calculation', () => {
    const rescindableBond = parseEther('0.09') // bond - earnest

    it('should return full refund at submission time', () => {
      const refund = calculateRescindRefund({
        rescindableBond,
        submissionBlock: 100n,
        currentBlock: 100n,
        expiryBlock: 200n,
      })

      expect(refund).toBe(rescindableBond)
    })

    it('should return zero refund at expiry', () => {
      const refund = calculateRescindRefund({
        rescindableBond,
        submissionBlock: 100n,
        currentBlock: 200n,
        expiryBlock: 200n,
      })

      expect(refund).toBe(0n)
    })

    it('should return half refund at midpoint', () => {
      const refund = calculateRescindRefund({
        rescindableBond,
        submissionBlock: 100n,
        currentBlock: 150n,
        expiryBlock: 200n,
      })

      // At midpoint, forfeit = rescindableBond * 50 / 100 = half
      // Refund = rescindableBond - forfeit
      expect(refund).toBe(rescindableBond / 2n)
    })

    it('should calculate forfeit correctly', () => {
      const forfeit = calculateRescindForfeit({
        rescindableBond,
        submissionBlock: 100n,
        currentBlock: 175n,
        expiryBlock: 200n,
      })

      // 75% elapsed -> 75% forfeit
      const expectedForfeit = (rescindableBond * 75n) / 100n
      expect(forfeit).toBe(expectedForfeit)
    })

    it('should handle edge case after expiry', () => {
      const forfeit = calculateRescindForfeit({
        rescindableBond,
        submissionBlock: 100n,
        currentBlock: 250n, // After expiry
        expiryBlock: 200n,
      })

      expect(forfeit).toBe(rescindableBond)
    })
  })

  describe('Amount Derivation', () => {
    const commitments: Lock[] = [
      { lockTag: '0x000000000000000000000001' as Hex, token: usdcAddress, amount: 1000000n },
      {
        lockTag: '0x000000000000000000000002' as Hex,
        token: '0x0000000000000000000000000000000000000000' as Address,
        amount: parseEther('1'),
      },
    ]

    const components: ExarchFillComponent[] = [
      {
        fillToken: usdcAddress,
        minimumFillAmount: 500000n,
        recipient: recipientAddress,
        applyScaling: true,
      },
      {
        fillToken: '0x0000000000000000000000000000000000000000' as Address,
        minimumFillAmount: parseEther('0.5'),
        recipient: recipientAddress,
        applyScaling: false,
      },
    ]

    it('should derive amounts with neutral scaling', () => {
      const { fillAmounts, claimAmounts } = deriveAmounts({
        commitments,
        components,
        scalingFactor: NEUTRAL_SCALING_FACTOR,
      })

      // Neutral scaling: no changes
      expect(fillAmounts[0]).toBe(components[0].minimumFillAmount)
      expect(fillAmounts[1]).toBe(components[1].minimumFillAmount)
      expect(claimAmounts[0]).toBe(commitments[0].amount)
      expect(claimAmounts[1]).toBe(commitments[1].amount)
    })

    it('should derive amounts with exact-in scaling (>1e18)', () => {
      const scalingFactor = SCALING_FACTOR.ONE_FIFTY_PERCENT // 1.5e18

      const { fillAmounts, claimAmounts } = deriveAmounts({
        commitments,
        components,
        scalingFactor,
      })

      // Exact-in: fill amounts increased for applyScaling=true, claim amounts unchanged
      expect(fillAmounts[0]).toBe((components[0].minimumFillAmount * scalingFactor) / NEUTRAL_SCALING_FACTOR)
      expect(fillAmounts[1]).toBe(components[1].minimumFillAmount) // applyScaling=false
      expect(claimAmounts[0]).toBe(commitments[0].amount)
      expect(claimAmounts[1]).toBe(commitments[1].amount)
    })

    it('should derive amounts with exact-out scaling (<1e18)', () => {
      const scalingFactor = SCALING_FACTOR.NINETY_PERCENT // 0.9e18

      const { fillAmounts, claimAmounts } = deriveAmounts({
        commitments,
        components,
        scalingFactor,
      })

      // Exact-out: fill amounts unchanged, claim amounts reduced
      expect(fillAmounts[0]).toBe(components[0].minimumFillAmount)
      expect(fillAmounts[1]).toBe(components[1].minimumFillAmount)
      expect(claimAmounts[0]).toBe((commitments[0].amount * scalingFactor) / NEUTRAL_SCALING_FACTOR)
      expect(claimAmounts[1]).toBe((commitments[1].amount * scalingFactor) / NEUTRAL_SCALING_FACTOR)
    })
  })

  describe('Commitments Hash', () => {
    it('should derive commitments hash', () => {
      const commitments: Lock[] = [
        { lockTag: '0x000000000000000000000001' as Hex, token: usdcAddress, amount: 1000000n },
      ]

      const hash = deriveCommitmentsHash(commitments, LOCK_TYPEHASH)
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/)
    })

    it('should produce different hashes for different typehashes', () => {
      const commitments: Lock[] = [
        { lockTag: '0x000000000000000000000001' as Hex, token: usdcAddress, amount: 1000000n },
      ]

      const hash1 = deriveCommitmentsHash(commitments, LOCK_TYPEHASH)
      const hash2 = deriveCommitmentsHash(commitments, EXARCH_MANDATE_TYPEHASH) // Using a different typehash

      expect(hash1).not.toBe(hash2)
    })
  })
})
