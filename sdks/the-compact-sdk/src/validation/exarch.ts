/**
 * Validation utilities for Exarch protocol
 *
 * Provides functions for validating fill parameters, bid eligibility,
 * adjustment signatures, and derived amounts.
 */

import { Address, Hex, verifyTypedData } from 'viem'

import { createExarchDomain } from '../config/exarch'
import { decodeValidityConditions, NEUTRAL_SCALING_FACTOR, hasActiveBid } from '../encoding/exarch'
import {
  ExarchFillParameters,
  ExarchFillComponent,
  ExarchAdjustment,
  AuctionState,
  UnpackedBidState,
} from '../types/exarch'

// ============ Validation Result Types ============

/**
 * Result of a validation operation
 */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean
  /** List of error messages if validation failed */
  errors: string[]
  /** List of warning messages (non-fatal issues) */
  warnings: string[]
}

/**
 * Result of bid eligibility check
 */
export interface BidEligibilityResult {
  /** Whether a bid can be placed */
  canBid: boolean
  /** Reason why bid cannot be placed (if canBid is false) */
  reason?: string
  /** Detailed error code */
  errorCode?: BidEligibilityError
}

/**
 * Error codes for bid eligibility
 */
export enum BidEligibilityError {
  /** Auction has been filled */
  AlreadyFilled = 'AlreadyFilled',
  /** Auction was cancelled by sponsor */
  AlreadyCancelled = 'AlreadyCancelled',
  /** Hold period is still active for current bidder */
  BidWindowActive = 'BidWindowActive',
  /** Fill has expired */
  Expired = 'Expired',
}

/**
 * Result of validity conditions check
 */
export interface ValidityConditionsResult {
  /** Whether conditions are met */
  valid: boolean
  /** Reason if conditions are not met */
  reason?: string
}

// ============ Fill Parameter Validation ============

/**
 * Validate fill parameters for correctness and constraints
 *
 * @param fillParams - Fill parameters to validate
 * @returns Validation result with errors and warnings
 *
 * @example
 * ```typescript
 * const result = validateFillParameters(fillParams)
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors)
 * }
 * ```
 */
export function validateFillParameters(fillParams: ExarchFillParameters): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate bonding constraints
  if (fillParams.earnestAmount > fillParams.bondAmount) {
    errors.push('earnestAmount must be less than or equal to bondAmount')
  }

  // Validate components exist
  if (fillParams.components.length === 0) {
    errors.push('at least one component is required')
  }

  // Validate each component
  fillParams.components.forEach((component, index) => {
    const componentErrors = validateFillComponent(component)
    componentErrors.errors.forEach((e) => errors.push(`component[${index}]: ${e}`))
    componentErrors.warnings.forEach((w) => warnings.push(`component[${index}]: ${w}`))
  })

  // Validate recipient callback
  if (fillParams.recipientCallback.length > 1) {
    errors.push('at most one recipient callback is allowed')
  }

  // Check for potentially problematic values
  if (fillParams.holdPeriod === 0n) {
    warnings.push('holdPeriod is 0, any bid can be immediately outbid')
  }

  if (fillParams.bondAmount === 0n) {
    warnings.push('bondAmount is 0, bidders have no stake')
  }

  // Validate scaling factor is positive
  if (fillParams.scalingFactor === 0n) {
    errors.push('scalingFactor must be greater than 0')
  }

  // Validate expiration
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (fillParams.expires <= now) {
    errors.push('fill has already expired')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Validate a single fill component
 *
 * @param component - Fill component to validate
 * @returns Validation result
 */
export function validateFillComponent(component: ExarchFillComponent): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate minimum fill amount
  if (component.minimumFillAmount === 0n) {
    warnings.push('minimumFillAmount is 0')
  }

  // Check if recipient is zero address
  if (component.recipient === '0x0000000000000000000000000000000000000000') {
    errors.push('recipient cannot be zero address')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Validate bonding requirements
 *
 * @param bondAmount - Required bond amount
 * @param earnestAmount - Non-rescindable portion
 * @param holdPeriod - Exclusive window in blocks
 * @returns Validation result
 */
export function validateBondingRequirements(
  bondAmount: bigint,
  earnestAmount: bigint,
  holdPeriod: bigint
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (earnestAmount > bondAmount) {
    errors.push('earnestAmount cannot exceed bondAmount')
  }

  if (bondAmount > 0n && earnestAmount === 0n) {
    warnings.push('earnestAmount is 0, bidders can rescind with full refund immediately')
  }

  if (holdPeriod === 0n && bondAmount > 0n) {
    warnings.push('holdPeriod is 0 with non-zero bond, bids can be immediately outbid')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// ============ Bid Eligibility ============

/**
 * Check if a new bid can be placed based on auction state
 *
 * @param auctionState - Current auction state from getAuctionState
 * @param currentBlock - Current block number
 * @param fillExpires - Fill expiration timestamp
 * @returns Bid eligibility result
 *
 * @example
 * ```typescript
 * const state = await client.getAuctionState(claimHash)
 * const currentBlock = await publicClient.getBlockNumber()
 * const result = validateBidEligibility(state, currentBlock, fillParams.expires)
 * if (!result.canBid) {
 *   console.log('Cannot bid:', result.reason)
 * }
 * ```
 */
export function validateBidEligibility(
  auctionState: AuctionState,
  currentBlock: bigint,
  fillExpires?: bigint
): BidEligibilityResult {
  // Check if already filled
  if (auctionState.isFilled) {
    return {
      canBid: false,
      reason: 'Auction has already been filled',
      errorCode: BidEligibilityError.AlreadyFilled,
    }
  }

  // Check if cancelled
  if (auctionState.cancelled) {
    return {
      canBid: false,
      reason: 'Auction was cancelled by sponsor',
      errorCode: BidEligibilityError.AlreadyCancelled,
    }
  }

  // Check if fill has expired
  if (fillExpires !== undefined) {
    const now = BigInt(Math.floor(Date.now() / 1000))
    if (fillExpires <= now) {
      return {
        canBid: false,
        reason: 'Fill has expired',
        errorCode: BidEligibilityError.Expired,
      }
    }
  }

  // Check if bid window is active (there's a current bid that hasn't expired)
  if (auctionState.expiry > 0n && auctionState.expiry > currentBlock) {
    return {
      canBid: false,
      reason: `Bid window active until block ${auctionState.expiry}`,
      errorCode: BidEligibilityError.BidWindowActive,
    }
  }

  return { canBid: true }
}

/**
 * Check bid eligibility using unpacked bid state
 *
 * @param bidState - Unpacked bid state from getBidState
 * @param currentBlock - Current block number
 * @returns Bid eligibility result
 */
export function validateBidEligibilityFromState(
  bidState: UnpackedBidState,
  currentBlock: bigint
): BidEligibilityResult {
  if (bidState.filled) {
    return {
      canBid: false,
      reason: 'Auction has already been filled',
      errorCode: BidEligibilityError.AlreadyFilled,
    }
  }

  if (bidState.cancelled) {
    return {
      canBid: false,
      reason: 'Auction was cancelled by sponsor',
      errorCode: BidEligibilityError.AlreadyCancelled,
    }
  }

  // Check if there's an active bid
  if (hasActiveBid(bidState.claimant) && bidState.bidExpiry > currentBlock) {
    return {
      canBid: false,
      reason: `Bid window active until block ${bidState.bidExpiry}`,
      errorCode: BidEligibilityError.BidWindowActive,
    }
  }

  return { canBid: true }
}

// ============ Validity Conditions ============

/**
 * Validate adjustment validity conditions against bidder and block
 *
 * @param validityConditions - Encoded validity conditions from adjustment
 * @param bidderAddress - Address of the bidder attempting to place bid
 * @param currentBlock - Current block number
 * @param targetBlock - Target block from adjustment
 * @returns Validity conditions check result
 *
 * @example
 * ```typescript
 * const result = validateValidityConditions(
 *   adjustment.validityConditions,
 *   bidderAddress,
 *   currentBlock,
 *   adjustment.targetBlock
 * )
 * if (!result.valid) {
 *   console.log('Conditions not met:', result.reason)
 * }
 * ```
 */
export function validateValidityConditions(
  validityConditions: Hex,
  bidderAddress: Address,
  currentBlock: bigint,
  targetBlock: bigint
): ValidityConditionsResult {
  const { exclusiveBidder, blockWindow } = decodeValidityConditions(validityConditions)

  // Check exclusive bidder
  if (exclusiveBidder !== null && exclusiveBidder.toLowerCase() !== bidderAddress.toLowerCase()) {
    return {
      valid: false,
      reason: `Only ${exclusiveBidder} can place a bid with this adjustment`,
    }
  }

  // Check block window
  if (blockWindow > 0) {
    const validUntilBlock = targetBlock + BigInt(blockWindow)
    if (currentBlock > validUntilBlock) {
      return {
        valid: false,
        reason: `Block window expired at block ${validUntilBlock}, current block is ${currentBlock}`,
      }
    }
  }

  return { valid: true }
}

// ============ Adjustment Signature Verification ============

/**
 * Parameters for adjustment signature verification
 */
export interface AdjustmentVerificationParams {
  /** Adjustment to verify (without signature) */
  adjustment: Omit<ExarchAdjustment, 'adjustmentAuthorization'>
  /** Signature to verify */
  signature: Hex
  /** Claim hash this adjustment applies to */
  claimHash: Hex
  /** Chain ID where Exarch is deployed */
  chainId: number
  /** Exarch contract address */
  exarchAddress: Address
}

/**
 * Verify an adjustment signature
 *
 * @param params - Verification parameters
 * @returns Promise resolving to true if signature is valid
 *
 * @example
 * ```typescript
 * const isValid = await verifyAdjustmentSignature({
 *   adjustment,
 *   signature: adjustment.adjustmentAuthorization,
 *   claimHash,
 *   chainId: 1,
 *   exarchAddress
 * })
 * ```
 */
export async function verifyAdjustmentSignature(params: AdjustmentVerificationParams): Promise<boolean> {
  const { adjustment, signature, claimHash, chainId, exarchAddress } = params

  const domain = createExarchDomain({ chainId, exarchAddress })

  const types = {
    Adjustment: [
      { name: 'adjuster', type: 'address' },
      { name: 'fillIndex', type: 'uint256' },
      { name: 'targetBlock', type: 'uint256' },
      { name: 'supplementalPriceCurve', type: 'uint256[]' },
      { name: 'validityConditions', type: 'bytes32' },
      { name: 'nonce', type: 'uint256' },
      { name: 'claimHash', type: 'bytes32' },
    ],
  }

  const message = {
    adjuster: adjustment.adjuster,
    fillIndex: adjustment.fillIndex,
    targetBlock: adjustment.targetBlock,
    supplementalPriceCurve: adjustment.supplementalPriceCurve,
    validityConditions: adjustment.validityConditions,
    nonce: adjustment.nonce,
    claimHash,
  }

  try {
    const recovered = await verifyTypedData({
      address: adjustment.adjuster,
      domain,
      types,
      primaryType: 'Adjustment',
      message,
      signature,
    })

    return recovered
  } catch {
    return false
  }
}

// ============ Amount Validation ============

/**
 * Validate that fill amounts meet minimum requirements
 *
 * @param components - Fill components with minimum amounts
 * @param fillAmounts - Actual fill amounts provided
 * @param scalingFactor - Scaling factor to apply
 * @returns Validation result
 */
export function validateFillAmounts(
  components: ExarchFillComponent[],
  fillAmounts: bigint[],
  scalingFactor: bigint
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (components.length !== fillAmounts.length) {
    errors.push(`Component count (${components.length}) does not match fill amount count (${fillAmounts.length})`)
    return { valid: false, errors, warnings }
  }

  for (let i = 0; i < components.length; i++) {
    const component = components[i]
    const fillAmount = fillAmounts[i]

    // Calculate required minimum with scaling
    let requiredMinimum = component.minimumFillAmount
    if (component.applyScaling && scalingFactor > NEUTRAL_SCALING_FACTOR) {
      requiredMinimum = (requiredMinimum * scalingFactor) / NEUTRAL_SCALING_FACTOR
    }

    if (fillAmount < requiredMinimum) {
      errors.push(`Fill amount for component ${i} (${fillAmount}) is less than required minimum (${requiredMinimum})`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Validate that claim amounts are correctly scaled
 *
 * @param commitmentAmounts - Original commitment amounts
 * @param claimAmounts - Derived claim amounts
 * @param scalingFactor - Scaling factor applied
 * @returns Validation result
 */
export function validateClaimAmounts(
  commitmentAmounts: bigint[],
  claimAmounts: bigint[],
  scalingFactor: bigint
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (commitmentAmounts.length !== claimAmounts.length) {
    errors.push(
      `Commitment count (${commitmentAmounts.length}) does not match claim amount count (${claimAmounts.length})`
    )
    return { valid: false, errors, warnings }
  }

  for (let i = 0; i < commitmentAmounts.length; i++) {
    const commitment = commitmentAmounts[i]
    const claim = claimAmounts[i]

    // Calculate expected claim amount
    let expectedClaim = commitment
    if (scalingFactor < NEUTRAL_SCALING_FACTOR) {
      expectedClaim = (commitment * scalingFactor) / NEUTRAL_SCALING_FACTOR
    }

    // Allow small rounding differences (1 wei)
    const diff = claim > expectedClaim ? claim - expectedClaim : expectedClaim - claim
    if (diff > 1n) {
      errors.push(`Claim amount for commitment ${i} (${claim}) does not match expected (${expectedClaim})`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// ============ Fill Hash Validation ============

/**
 * Validate that a fill hash is in the mandate's fill hashes
 *
 * @param fillHash - Hash of the fill to validate
 * @param mandateFillHashes - Array of fill hashes from mandate
 * @returns Validation result
 */
export function validateFillMatchesMandate(fillHash: Hex, mandateFillHashes: Hex[]): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const found = mandateFillHashes.some((h) => h.toLowerCase() === fillHash.toLowerCase())
  if (!found) {
    errors.push('Fill hash is not present in mandate fill hashes')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Find the index of a fill hash in the mandate's fill hashes
 *
 * @param fillHash - Hash of the fill to find
 * @param mandateFillHashes - Array of fill hashes from mandate
 * @returns Index of the fill hash, or -1 if not found
 */
export function findFillIndex(fillHash: Hex, mandateFillHashes: Hex[]): number {
  return mandateFillHashes.findIndex((h) => h.toLowerCase() === fillHash.toLowerCase())
}
