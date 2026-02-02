/**
 * Tests for Exarch validation utilities
 */

import { Address, Hex, zeroAddress } from 'viem'

import { encodeValidityConditions, packBidStateData } from '../encoding/exarch'
import { ExarchFillComponent, ExarchFillParameters, AuctionState, UnpackedBidState } from '../types/exarch'

import {
  validateFillParameters,
  validateFillComponent,
  validateBondingRequirements,
  validateBidEligibility,
  validateBidEligibilityFromState,
  validateValidityConditions,
  validateFillAmounts,
  validateClaimAmounts,
  validateFillMatchesMandate,
  findFillIndex,
  BidEligibilityError,
} from './exarch'

// Test addresses
const exarchAddress = '0x1111111111111111111111111111111111111111' as Address
const recipientAddress = '0x2222222222222222222222222222222222222222' as Address
const tokenAddress = '0x3333333333333333333333333333333333333333' as Address
const bidderAddress = '0x4444444444444444444444444444444444444444' as Address

// Test component
const createComponent = (overrides: Partial<ExarchFillComponent> = {}): ExarchFillComponent => ({
  fillToken: tokenAddress,
  minimumFillAmount: 1000000n,
  recipient: recipientAddress,
  applyScaling: false,
  ...overrides,
})

// Test fill parameters
const createFillParams = (overrides: Partial<ExarchFillParameters> = {}): ExarchFillParameters => ({
  chainId: 1n,
  exarch: exarchAddress,
  expires: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
  components: [createComponent()],
  bondAmount: 100000000000000000n, // 0.1 ETH
  earnestAmount: 10000000000000000n, // 0.01 ETH
  holdPeriod: 100n,
  baselinePriorityFee: 0n,
  scalingFactor: 1000000000000000000n,
  priceCurve: [],
  recipientCallback: [],
  salt: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
  ...overrides,
})

describe('validateFillComponent', () => {
  it('should pass for valid component', () => {
    const component = createComponent()
    const result = validateFillComponent(component)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should warn if minimumFillAmount is 0', () => {
    const component = createComponent({ minimumFillAmount: 0n })
    const result = validateFillComponent(component)

    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('minimumFillAmount is 0')
  })

  it('should fail if recipient is zero address', () => {
    const component = createComponent({ recipient: zeroAddress })
    const result = validateFillComponent(component)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('recipient cannot be zero address')
  })
})

describe('validateFillParameters', () => {
  it('should pass for valid fill parameters', () => {
    const params = createFillParams()
    const result = validateFillParameters(params)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should fail if earnestAmount > bondAmount', () => {
    const params = createFillParams({
      bondAmount: 100n,
      earnestAmount: 200n,
    })
    const result = validateFillParameters(params)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('earnestAmount must be less than or equal to bondAmount')
  })

  it('should fail if no components', () => {
    const params = createFillParams({ components: [] })
    const result = validateFillParameters(params)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('at least one component is required')
  })

  it('should fail if more than one recipient callback', () => {
    const params = createFillParams({
      recipientCallback: [
        { chainId: 1n, compact: {} as any, mandateHash: '0x' as Hex, context: '0x' as Hex },
        { chainId: 2n, compact: {} as any, mandateHash: '0x' as Hex, context: '0x' as Hex },
      ],
    })
    const result = validateFillParameters(params)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('at most one recipient callback is allowed')
  })

  it('should warn if holdPeriod is 0', () => {
    const params = createFillParams({ holdPeriod: 0n })
    const result = validateFillParameters(params)

    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('holdPeriod is 0, any bid can be immediately outbid')
  })

  it('should warn if bondAmount is 0', () => {
    const params = createFillParams({ bondAmount: 0n, earnestAmount: 0n })
    const result = validateFillParameters(params)

    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('bondAmount is 0, bidders have no stake')
  })

  it('should fail if scalingFactor is 0', () => {
    const params = createFillParams({ scalingFactor: 0n })
    const result = validateFillParameters(params)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('scalingFactor must be greater than 0')
  })

  it('should fail if already expired', () => {
    const params = createFillParams({
      expires: BigInt(Math.floor(Date.now() / 1000) - 3600), // 1 hour ago
    })
    const result = validateFillParameters(params)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('fill has already expired')
  })

  it('should propagate component errors', () => {
    const params = createFillParams({
      components: [createComponent({ recipient: zeroAddress })],
    })
    const result = validateFillParameters(params)

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('component[0]'))).toBe(true)
  })
})

describe('validateBondingRequirements', () => {
  it('should pass for valid bonding params', () => {
    const result = validateBondingRequirements(100n, 10n, 100n)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should fail if earnest exceeds bond', () => {
    const result = validateBondingRequirements(100n, 200n, 100n)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('earnestAmount cannot exceed bondAmount')
  })

  it('should warn if earnest is 0 with non-zero bond', () => {
    const result = validateBondingRequirements(100n, 0n, 100n)

    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('earnestAmount is 0, bidders can rescind with full refund immediately')
  })

  it('should warn if holdPeriod is 0 with non-zero bond', () => {
    const result = validateBondingRequirements(100n, 10n, 0n)

    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('holdPeriod is 0 with non-zero bond, bids can be immediately outbid')
  })
})

describe('validateBidEligibility', () => {
  const createAuctionState = (overrides: Partial<AuctionState> = {}): AuctionState => ({
    bidder: zeroAddress,
    bond: 0n,
    expiry: 0n,
    claimant: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
    isFilled: false,
    cancelled: false,
    ...overrides,
  })

  it('should return canBid true for fresh auction', () => {
    const state = createAuctionState()
    const result = validateBidEligibility(state, 1000n)

    expect(result.canBid).toBe(true)
  })

  it('should return canBid false if already filled', () => {
    const state = createAuctionState({ isFilled: true })
    const result = validateBidEligibility(state, 1000n)

    expect(result.canBid).toBe(false)
    expect(result.errorCode).toBe(BidEligibilityError.AlreadyFilled)
  })

  it('should return canBid false if cancelled', () => {
    const state = createAuctionState({ cancelled: true })
    const result = validateBidEligibility(state, 1000n)

    expect(result.canBid).toBe(false)
    expect(result.errorCode).toBe(BidEligibilityError.AlreadyCancelled)
  })

  it('should return canBid false if bid window is active', () => {
    const state = createAuctionState({
      bidder: bidderAddress,
      expiry: 2000n, // Expires at block 2000
    })
    const result = validateBidEligibility(state, 1000n) // Current block is 1000

    expect(result.canBid).toBe(false)
    expect(result.errorCode).toBe(BidEligibilityError.BidWindowActive)
  })

  it('should return canBid true if bid window has expired', () => {
    const state = createAuctionState({
      bidder: bidderAddress,
      expiry: 500n, // Expired at block 500
    })
    const result = validateBidEligibility(state, 1000n) // Current block is 1000

    expect(result.canBid).toBe(true)
  })

  it('should return canBid false if fill has expired', () => {
    const state = createAuctionState()
    const expiredFill = BigInt(Math.floor(Date.now() / 1000) - 3600) // 1 hour ago
    const result = validateBidEligibility(state, 1000n, expiredFill)

    expect(result.canBid).toBe(false)
    expect(result.errorCode).toBe(BidEligibilityError.Expired)
  })
})

describe('validateBidEligibilityFromState', () => {
  const createBidState = (overrides: Partial<UnpackedBidState> = {}): UnpackedBidState => ({
    claimant: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
    scalingFactor: 1000000000000000000n,
    aggregateBond: 0n,
    bidExpiry: 0n,
    fillIndex: 0,
    filled: false,
    cancelled: false,
    ...overrides,
  })

  it('should return canBid true for fresh state', () => {
    const state = createBidState()
    const result = validateBidEligibilityFromState(state, 1000n)

    expect(result.canBid).toBe(true)
  })

  it('should return canBid false if filled', () => {
    const state = createBidState({ filled: true })
    const result = validateBidEligibilityFromState(state, 1000n)

    expect(result.canBid).toBe(false)
    expect(result.errorCode).toBe(BidEligibilityError.AlreadyFilled)
  })

  it('should return canBid false if cancelled', () => {
    const state = createBidState({ cancelled: true })
    const result = validateBidEligibilityFromState(state, 1000n)

    expect(result.canBid).toBe(false)
    expect(result.errorCode).toBe(BidEligibilityError.AlreadyCancelled)
  })

  it('should return canBid false if bid window active', () => {
    const state = createBidState({
      claimant: '0x0000000000000000000000000000000000000001aabbccdd1122334455667788' as Hex,
      bidExpiry: 2000n,
    })
    const result = validateBidEligibilityFromState(state, 1000n)

    expect(result.canBid).toBe(false)
    expect(result.errorCode).toBe(BidEligibilityError.BidWindowActive)
  })
})

describe('validateValidityConditions', () => {
  it('should pass with no restrictions', () => {
    const conditions = encodeValidityConditions()
    const result = validateValidityConditions(conditions, bidderAddress, 1000n, 900n)

    expect(result.valid).toBe(true)
  })

  it('should pass for matching exclusive bidder', () => {
    const conditions = encodeValidityConditions(bidderAddress, 0)
    const result = validateValidityConditions(conditions, bidderAddress, 1000n, 900n)

    expect(result.valid).toBe(true)
  })

  it('should fail for non-matching exclusive bidder', () => {
    const otherBidder = '0x5555555555555555555555555555555555555555' as Address
    const conditions = encodeValidityConditions(otherBidder, 0)
    const result = validateValidityConditions(conditions, bidderAddress, 1000n, 900n)

    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Only')
  })

  it('should pass within block window', () => {
    const conditions = encodeValidityConditions(undefined, 200) // 200 block window
    const result = validateValidityConditions(conditions, bidderAddress, 1000n, 900n)

    expect(result.valid).toBe(true)
  })

  it('should fail after block window expires', () => {
    const conditions = encodeValidityConditions(undefined, 50) // 50 block window
    const result = validateValidityConditions(conditions, bidderAddress, 1000n, 900n) // 900 + 50 = 950 < 1000

    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Block window expired')
  })
})

describe('validateFillAmounts', () => {
  it('should pass when amounts meet minimums', () => {
    const components = [createComponent({ minimumFillAmount: 1000n })]
    const fillAmounts = [1000n]
    const result = validateFillAmounts(components, fillAmounts, 1000000000000000000n)

    expect(result.valid).toBe(true)
  })

  it('should pass when amounts exceed minimums', () => {
    const components = [createComponent({ minimumFillAmount: 1000n })]
    const fillAmounts = [2000n]
    const result = validateFillAmounts(components, fillAmounts, 1000000000000000000n)

    expect(result.valid).toBe(true)
  })

  it('should fail when amounts below minimums', () => {
    const components = [createComponent({ minimumFillAmount: 1000n })]
    const fillAmounts = [500n]
    const result = validateFillAmounts(components, fillAmounts, 1000000000000000000n)

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('less than required minimum'))).toBe(true)
  })

  it('should fail with mismatched array lengths', () => {
    const components = [createComponent(), createComponent()]
    const fillAmounts = [1000n]
    const result = validateFillAmounts(components, fillAmounts, 1000000000000000000n)

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('does not match'))).toBe(true)
  })

  it('should apply scaling to minimum when applyScaling is true', () => {
    const components = [createComponent({ minimumFillAmount: 1000n, applyScaling: true })]
    const scalingFactor = 2000000000000000000n // 2x
    const fillAmounts = [1500n] // Below scaled minimum of 2000n
    const result = validateFillAmounts(components, fillAmounts, scalingFactor)

    expect(result.valid).toBe(false)
  })

  it('should not apply scaling when applyScaling is false', () => {
    const components = [createComponent({ minimumFillAmount: 1000n, applyScaling: false })]
    const scalingFactor = 2000000000000000000n // 2x
    const fillAmounts = [1000n] // Meets unscaled minimum
    const result = validateFillAmounts(components, fillAmounts, scalingFactor)

    expect(result.valid).toBe(true)
  })
})

describe('validateClaimAmounts', () => {
  it('should pass with correct scaling', () => {
    const commitments = [1000000n]
    const claims = [1000000n]
    const result = validateClaimAmounts(commitments, claims, 1000000000000000000n)

    expect(result.valid).toBe(true)
  })

  it('should pass with exact-out scaling', () => {
    const commitments = [1000000n]
    const scalingFactor = 500000000000000000n // 0.5x
    const claims = [500000n] // 1000000 * 0.5 = 500000
    const result = validateClaimAmounts(commitments, claims, scalingFactor)

    expect(result.valid).toBe(true)
  })

  it('should fail with mismatched claim amounts', () => {
    const commitments = [1000000n]
    const claims = [500000n]
    const result = validateClaimAmounts(commitments, claims, 1000000000000000000n)

    expect(result.valid).toBe(false)
  })

  it('should fail with mismatched array lengths', () => {
    const commitments = [1000000n, 2000000n]
    const claims = [1000000n]
    const result = validateClaimAmounts(commitments, claims, 1000000000000000000n)

    expect(result.valid).toBe(false)
  })
})

describe('validateFillMatchesMandate', () => {
  const hash1 = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
  const hash2 = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex
  const hash3 = '0x3333333333333333333333333333333333333333333333333333333333333333' as Hex

  it('should pass when hash is in mandate', () => {
    const result = validateFillMatchesMandate(hash1, [hash1, hash2, hash3])

    expect(result.valid).toBe(true)
  })

  it('should fail when hash is not in mandate', () => {
    const unknownHash = '0x9999999999999999999999999999999999999999999999999999999999999999' as Hex
    const result = validateFillMatchesMandate(unknownHash, [hash1, hash2, hash3])

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Fill hash is not present in mandate fill hashes')
  })

  it('should be case insensitive', () => {
    const upperHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
    const lowerHashes = ['0x1111111111111111111111111111111111111111111111111111111111111111'.toLowerCase() as Hex]
    const result = validateFillMatchesMandate(upperHash, lowerHashes)

    expect(result.valid).toBe(true)
  })
})

describe('findFillIndex', () => {
  const hash1 = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
  const hash2 = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex
  const hash3 = '0x3333333333333333333333333333333333333333333333333333333333333333' as Hex

  it('should return correct index', () => {
    expect(findFillIndex(hash1, [hash1, hash2, hash3])).toBe(0)
    expect(findFillIndex(hash2, [hash1, hash2, hash3])).toBe(1)
    expect(findFillIndex(hash3, [hash1, hash2, hash3])).toBe(2)
  })

  it('should return -1 when not found', () => {
    const unknownHash = '0x9999999999999999999999999999999999999999999999999999999999999999' as Hex
    expect(findFillIndex(unknownHash, [hash1, hash2, hash3])).toBe(-1)
  })

  it('should be case insensitive', () => {
    const upperHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
    const lowerHashes = ['0x1111111111111111111111111111111111111111111111111111111111111111'.toLowerCase() as Hex]
    expect(findFillIndex(upperHash, lowerHashes)).toBe(0)
  })
})
