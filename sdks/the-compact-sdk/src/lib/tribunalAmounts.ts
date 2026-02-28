/**
 * Amount derivation utilities for Tribunal auctions
 *
 * Implements the full pricing logic matching Tribunal.sol's deriveAmounts and
 * deriveAmountsFromComponents functions. Handles:
 * - Price curve interpolation
 * - Supplemental price curve application
 * - Priority fee above baseline calculation
 * - Exact-in vs exact-out mode determination
 * - Scaling factor application
 *
 * Based on: tribunal/src/Tribunal.sol
 */

import { Lock } from '../types/eip712'
import { FillComponent } from '../types/tribunal'

import {
  getCalculatedScalingFactor,
  sharesScalingDirection,
  applySupplementalPriceCurve,
  InvalidPriceCurveParametersError,
} from './priceCurve'

/**
 * Base scaling factor (1e18 = 100%, neutral)
 */
export const BASE_SCALING_FACTOR = 1000000000000000000n

/**
 * Error thrown when targetBlock exceeds fillBlock
 */
export class InvalidTargetBlockError extends Error {
  constructor(public fillBlock: bigint, public targetBlock: bigint) {
    super(`Invalid target block: fillBlock=${fillBlock}, targetBlock=${targetBlock}`)
    this.name = 'InvalidTargetBlockError'
  }
}

/**
 * Error thrown when price curve is provided but targetBlock is 0
 */
export class InvalidTargetBlockDesignationError extends Error {
  constructor() {
    super('Price curve provided but targetBlock is 0')
    this.name = 'InvalidTargetBlockDesignationError'
  }
}

/**
 * Parameters for deriveAmounts (simple single-component case)
 */
export interface DeriveAmountsParams {
  /** Maximum claim amounts from commitments */
  maximumClaimAmounts: Lock[]
  /** Combined price curve (after supplemental applied) */
  priceCurve: bigint[]
  /** Target block for price curve evaluation (0 = no curve) */
  targetBlock: bigint
  /** Fill block number */
  fillBlock: bigint
  /** Minimum fill amount for the component */
  minimumFillAmount: bigint
  /** Base fee threshold where scaling kicks in */
  baselinePriorityFee: bigint
  /** Fee scaling multiplier (1e18 = baseline) */
  scalingFactor: bigint
  /** Priority fee above baseline (tx.gasprice - block.basefee - baseline, or 0 if below) */
  priorityFeeAboveBaseline: bigint
}

/**
 * Parameters for deriveAmountsFromComponents (multi-component case)
 */
export interface DeriveAmountsFromComponentsParams {
  /** Maximum claim amounts from commitments */
  maximumClaimAmounts: Lock[]
  /** Fill components defining output requirements */
  components: FillComponent[]
  /** Base price curve from mandate */
  priceCurve: bigint[]
  /** Supplemental price curve from adjuster (empty = no modification) */
  supplementalPriceCurve: bigint[]
  /** Target block for price curve evaluation (0 = no curve) */
  targetBlock: bigint
  /** Fill block number */
  fillBlock: bigint
  /** Base fee threshold where scaling kicks in */
  baselinePriorityFee: bigint
  /** Fee scaling multiplier (1e18 = baseline) */
  scalingFactor: bigint
  /** Priority fee above baseline (tx.gasprice - block.basefee - baseline, or 0 if below) */
  priorityFeeAboveBaseline: bigint
}

/**
 * Result of amount derivation
 */
export interface DerivedAmounts {
  /** Fill amounts for each component */
  fillAmounts: bigint[]
  /** Claim amounts for each commitment */
  claimAmounts: bigint[]
  /** The scaling multiplier used (for diagnostics) */
  scalingMultiplier: bigint
  /** Whether exact-in mode was used (for diagnostics) */
  useExactIn: boolean
}

/**
 * Result of simple amount derivation
 */
export interface SimpleDerivedAmounts {
  /** Fill amount for the single component */
  fillAmount: bigint
  /** Claim amounts for each commitment */
  claimAmounts: bigint[]
}

/**
 * Multiply with wad rounding up
 * Equivalent to Solady's FixedPointMathLib.mulWadUp
 * Formula: x * y / 1e18, rounded up
 */
function mulWadUp(x: bigint, y: bigint): bigint {
  const product = x * y
  if (product === 0n) return 0n

  // Round up: (product - 1) / 1e18 + 1
  return (product - 1n) / BASE_SCALING_FACTOR + 1n
}

/**
 * Multiply with wad rounding down
 * Equivalent to Solady's FixedPointMathLib.mulWad
 * Formula: x * y / 1e18, rounded down
 */
function mulWad(x: bigint, y: bigint): bigint {
  return (x * y) / BASE_SCALING_FACTOR
}

/**
 * Calculate the current scaling factor from price curve based on blocks elapsed
 *
 * If targetBlock is 0, no curve is applied and returns BASE_SCALING_FACTOR (1e18).
 *
 * @param priceCurve - The price curve to apply
 * @param targetBlock - The auction start block number
 * @param fillBlock - The fill block number
 * @returns The calculated current scaling factor
 */
function calculateCurrentScalingFactor(priceCurve: bigint[], targetBlock: bigint, fillBlock: bigint): bigint {
  // No curve = neutral scaling
  if (targetBlock === 0n) {
    if (priceCurve.length !== 0) {
      throw new InvalidTargetBlockDesignationError()
    }
    return BASE_SCALING_FACTOR
  }

  // Target block must not exceed fill block
  if (targetBlock > fillBlock) {
    throw new InvalidTargetBlockError(fillBlock, targetBlock)
  }

  // Calculate blocks elapsed since auction start
  const blocksPassed = Number(fillBlock - targetBlock)

  // Apply price curve to determine scaling factor
  return getCalculatedScalingFactor(priceCurve, blocksPassed)
}

/**
 * Calculate the scaling multiplier and determine auction mode
 *
 * @param currentScalingFactor - The current scaling factor from price curve
 * @param scalingFactor - The mandate's scaling factor
 * @param priorityFeeAboveBaseline - Priority fee above baseline
 * @returns Scaling multiplier and whether to use exact-in mode
 */
function calculateScalingMultiplier(
  currentScalingFactor: bigint,
  scalingFactor: bigint,
  priorityFeeAboveBaseline: bigint
): { scalingMultiplier: bigint; useExactIn: boolean } {
  // Determine auction mode based on whether scaling factor is above or below 1e18
  // useExactIn = (scalingFactor > 1e18) || (scalingFactor == 1e18 && currentScalingFactor >= 1e18)
  const useExactIn =
    scalingFactor > BASE_SCALING_FACTOR ||
    (scalingFactor === BASE_SCALING_FACTOR && currentScalingFactor >= BASE_SCALING_FACTOR)

  let scalingMultiplier: bigint

  if (useExactIn) {
    // Exact-in: add priority fee scaled by distance above 1e18
    // scalingMultiplier = currentScalingFactor + ((scalingFactor - 1e18) * priorityFeeAboveBaseline)
    scalingMultiplier = currentScalingFactor + (scalingFactor - BASE_SCALING_FACTOR) * priorityFeeAboveBaseline
  } else {
    // Exact-out: subtract priority fee scaled by distance below 1e18
    // scalingMultiplier = currentScalingFactor - ((1e18 - scalingFactor) * priorityFeeAboveBaseline)
    scalingMultiplier = currentScalingFactor - (BASE_SCALING_FACTOR - scalingFactor) * priorityFeeAboveBaseline
  }

  return { scalingMultiplier, useExactIn }
}

/**
 * Calculate fill amounts for each component
 *
 * @param components - The fill components
 * @param scalingMultiplier - The scaling multiplier
 * @param useExactIn - Whether to use exact-in mode
 * @returns The calculated fill amounts
 */
function calculateFillAmounts(components: FillComponent[], scalingMultiplier: bigint, useExactIn: boolean): bigint[] {
  const fillAmounts: bigint[] = []

  for (const component of components) {
    if (component.applyScaling) {
      if (useExactIn) {
        // In exact-in mode, scale up the fill amount
        fillAmounts.push(mulWadUp(component.minimumFillAmount, scalingMultiplier))
      } else {
        // In exact-out mode, use minimum unchanged
        fillAmounts.push(component.minimumFillAmount)
      }
    } else {
      // Non-scaled components always use the minimum
      fillAmounts.push(component.minimumFillAmount)
    }
  }

  return fillAmounts
}

/**
 * Calculate claim amounts for each commitment
 *
 * @param maximumClaimAmounts - The maximum claim amounts from commitments
 * @param scalingMultiplier - The scaling multiplier
 * @param useExactIn - Whether to use exact-in mode
 * @returns The calculated claim amounts
 */
function calculateClaimAmounts(maximumClaimAmounts: Lock[], scalingMultiplier: bigint, useExactIn: boolean): bigint[] {
  const claimAmounts: bigint[] = []

  if (useExactIn) {
    // In exact-in mode, use maximum claim amounts unchanged
    for (const commitment of maximumClaimAmounts) {
      claimAmounts.push(commitment.amount)
    }
  } else {
    // In exact-out mode, scale down the claim amounts
    for (const commitment of maximumClaimAmounts) {
      claimAmounts.push(mulWad(commitment.amount, scalingMultiplier))
    }
  }

  return claimAmounts
}

/**
 * Derive fill and claim amounts for a simple single-component case
 *
 * Matches Tribunal.sol's `deriveAmounts` function.
 *
 * @param params - Parameters for amount derivation
 * @returns The derived fill amount and claim amounts
 * @throws InvalidTargetBlockError if targetBlock > fillBlock
 * @throws InvalidTargetBlockDesignationError if priceCurve provided but targetBlock is 0
 * @throws InvalidPriceCurveParametersError if scaling directions are incompatible
 */
export function deriveAmounts(params: DeriveAmountsParams): SimpleDerivedAmounts {
  const {
    maximumClaimAmounts,
    priceCurve,
    targetBlock,
    fillBlock,
    minimumFillAmount,
    baselinePriorityFee: _baselinePriorityFee,
    scalingFactor,
    priorityFeeAboveBaseline,
  } = params

  // Calculate current scaling factor from price curve
  const currentScalingFactor = calculateCurrentScalingFactor(priceCurve, targetBlock, fillBlock)

  // Validate scaling direction
  if (!sharesScalingDirection(scalingFactor, currentScalingFactor)) {
    throw new InvalidPriceCurveParametersError('Incompatible scaling directions')
  }

  // Calculate scaling multiplier and determine mode
  const { scalingMultiplier, useExactIn } = calculateScalingMultiplier(
    currentScalingFactor,
    scalingFactor,
    priorityFeeAboveBaseline
  )

  // Calculate fill amount (single component with applyScaling = true)
  let fillAmount: bigint
  if (useExactIn) {
    fillAmount = mulWadUp(minimumFillAmount, scalingMultiplier)
  } else {
    fillAmount = minimumFillAmount
  }

  // Calculate claim amounts
  const claimAmounts = calculateClaimAmounts(maximumClaimAmounts, scalingMultiplier, useExactIn)

  return { fillAmount, claimAmounts }
}

/**
 * Derive fill and claim amounts for multi-component case with supplemental curve
 *
 * Matches Tribunal.sol's `deriveAmountsFromComponents` function.
 *
 * @param params - Parameters for amount derivation
 * @returns The derived fill amounts, claim amounts, and diagnostic info
 * @throws InvalidTargetBlockError if targetBlock > fillBlock
 * @throws InvalidTargetBlockDesignationError if priceCurve provided but targetBlock is 0
 * @throws InvalidPriceCurveParametersError if scaling directions are incompatible
 */
export function deriveAmountsFromComponents(params: DeriveAmountsFromComponentsParams): DerivedAmounts {
  const {
    maximumClaimAmounts,
    components,
    priceCurve,
    supplementalPriceCurve,
    targetBlock,
    fillBlock,
    baselinePriorityFee: _baselinePriorityFee,
    scalingFactor,
    priorityFeeAboveBaseline,
  } = params

  // Apply supplemental price curve if provided
  let combinedCurve: bigint[]
  if (supplementalPriceCurve.length > 0) {
    combinedCurve = applySupplementalPriceCurve(priceCurve, supplementalPriceCurve)
  } else {
    combinedCurve = priceCurve
  }

  // Calculate current scaling factor from combined price curve
  const currentScalingFactor = calculateCurrentScalingFactor(combinedCurve, targetBlock, fillBlock)

  // Validate scaling direction
  if (!sharesScalingDirection(scalingFactor, currentScalingFactor)) {
    throw new InvalidPriceCurveParametersError('Incompatible scaling directions')
  }

  // Calculate scaling multiplier and determine mode
  const { scalingMultiplier, useExactIn } = calculateScalingMultiplier(
    currentScalingFactor,
    scalingFactor,
    priorityFeeAboveBaseline
  )

  // Calculate fill amounts
  const fillAmounts = calculateFillAmounts(components, scalingMultiplier, useExactIn)

  // Calculate claim amounts
  const claimAmounts = calculateClaimAmounts(maximumClaimAmounts, scalingMultiplier, useExactIn)

  return { fillAmounts, claimAmounts, scalingMultiplier, useExactIn }
}

/**
 * Calculate the priority fee above baseline
 *
 * In a real transaction context, this would be:
 * priorityFee = tx.gasprice - block.basefee
 * priorityFeeAboveBaseline = priorityFee > baselinePriorityFee ? priorityFee - baselinePriorityFee : 0
 *
 * @param priorityFee - The priority fee (tx.gasprice - block.basefee)
 * @param baselinePriorityFee - The baseline priority fee from the mandate
 * @returns The priority fee above baseline (0 if below baseline)
 */
export function calculatePriorityFeeAboveBaseline(priorityFee: bigint, baselinePriorityFee: bigint): bigint {
  return priorityFee > baselinePriorityFee ? priorityFee - baselinePriorityFee : 0n
}

/**
 * Estimate fill amounts for a given block, useful for UI display
 *
 * @param params - Parameters excluding the priorityFeeAboveBaseline (assumes 0)
 * @returns Estimated fill amounts at the given block
 */
export function estimateFillAmounts(
  params: Omit<DeriveAmountsFromComponentsParams, 'priorityFeeAboveBaseline'>
): DerivedAmounts {
  return deriveAmountsFromComponents({
    ...params,
    priorityFeeAboveBaseline: 0n,
  })
}
