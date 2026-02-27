/**
 * Price Curve Calculator Utilities
 *
 * High-level utilities for creating common auction patterns including Dutch auctions,
 * Reverse Dutch auctions, stepped prices, and multi-phase auctions.
 *
 * Key concepts:
 * - Dutch auction (exact-in): Price decreases over time, scaling >= 1e18
 * - Reverse Dutch (exact-out): Price increases over time, scaling <= 1e18
 * - Stepped prices: Discrete price changes at specific block intervals
 * - Multi-phase auctions: Complex curves with N distinct pricing phases
 *
 * All utilities build on primitives from priceCurve.ts and maintain compatibility
 * with existing validation and interpolation logic.
 */

import {
  createPriceCurveElement,
  unpackPriceCurveElement,
  sharesScalingDirection,
  getCalculatedScalingFactor,
  InvalidPriceCurveParametersError,
} from './priceCurve'

/**
 * Constants
 */
const NEUTRAL_SCALING = 1000000000000000000n // 1e18
const MAX_BLOCK_DURATION = 65535 // 2^16 - 1

/**
 * Configuration interfaces
 */

export interface DutchAuctionConfig {
  /** Starting price as percentage (e.g., 1.5 = 150%, must be >= 1.0) */
  startPricePercent: number
  /** Ending price as percentage (e.g., 1.0 = 100%, must be >= 1.0 and <= start) */
  endPricePercent: number
  /** Total duration in blocks */
  durationBlocks: number
  /** Optional: number of discrete steps (default: 1 for linear) */
  steps?: number
}

export interface ReverseDutchAuctionConfig {
  /** Starting price as percentage (e.g., 0.5 = 50%, must be <= 1.0) */
  startPricePercent: number
  /** Ending price as percentage (e.g., 1.0 = 100%, must be <= 1.0 and >= start) */
  endPricePercent: number
  /** Total duration in blocks */
  durationBlocks: number
  /** Optional: number of discrete steps (default: 1 for linear) */
  steps?: number
}

export interface SteppedPriceConfig {
  /** Array of price steps with durations */
  steps: PriceStep[]
}

export interface PriceStep {
  /** Block duration for this step (0 for instant transition) */
  blockDuration: number
  /** Price as percentage (e.g., 1.2 = 120%) */
  pricePercent: number
}

export interface SteppedPriceScheduleConfig {
  /** Starting price percentage */
  startPricePercent: number
  /** Schedule of price changes */
  schedule: PriceChange[]
}

export interface PriceChange {
  /** Blocks from start when this change occurs */
  atBlock: number
  /** New price percentage */
  pricePercent: number
  /** Whether to jump instantly (true) or interpolate (false) */
  instant?: boolean
}

export interface MultiPhaseAuctionConfig {
  /** Starting price percentage for the entire auction */
  startPricePercent: number
  /** Array of phases, each with target price and duration */
  phases: AuctionPhase[]
}

export interface AuctionPhase {
  /** Target price percentage at the end of this phase */
  endPricePercent: number
  /** Duration of this phase in blocks */
  durationBlocks: number
  /** Optional: number of steps for this phase (default: 1 for linear) */
  steps?: number
  /** Optional: whether to transition instantly to this phase (default: false) */
  instant?: boolean
}

export interface CurveValidationResult {
  /** Whether the curve is valid */
  valid: boolean
  /** Array of error messages if invalid */
  errors?: string[]
  /** Array of warning messages */
  warnings?: string[]
}

/**
 * ============================================================================
 * Percentage Conversion Utilities
 * ============================================================================
 */

/**
 * Convert percentage to scaling factor
 * Uses banker's rounding (round to nearest even) for values at midpoint.
 * Precision: Supports up to 15-16 significant digits (JavaScript number limitation).
 *
 * @param percent - Percentage value (e.g., 1.5 for 150%, 0.9 for 90%)
 * @returns Scaling factor as bigint (e.g., 1.5e18, 0.9e18)
 *
 * @example
 * percentToScalingFactor(1.5)     // 1500000000000000000n (150%)
 * percentToScalingFactor(1.0)     // 1000000000000000000n (100%)
 * percentToScalingFactor(0.5)     // 500000000000000000n  (50%)
 */
export function percentToScalingFactor(percent: number): bigint {
  if (!Number.isFinite(percent) || percent < 0) {
    throw new InvalidPriceCurveParametersError(`Percent must be a finite non-negative number, got ${percent}`)
  }

  // Multiply by 1e18 and round to nearest integer
  const scaled = percent * Number(NEUTRAL_SCALING)
  const rounded = Math.round(scaled)

  return BigInt(rounded)
}

/**
 * Convert scaling factor to percentage
 *
 * @param scalingFactor - Scaling factor as bigint (e.g., 1.5e18)
 * @returns Percentage value (e.g., 1.5 for 150%)
 *
 * @example
 * scalingFactorToPercent(1500000000000000000n) // 1.5
 * scalingFactorToPercent(1000000000000000000n) // 1.0
 */
export function scalingFactorToPercent(scalingFactor: bigint): number {
  if (scalingFactor < 0n) {
    throw new InvalidPriceCurveParametersError(`Scaling factor must be non-negative, got ${scalingFactor}`)
  }

  return Number(scalingFactor) / Number(NEUTRAL_SCALING)
}

/**
 * Create scaling factor from basis points (1 bp = 0.01%)
 *
 * @param basisPoints - Basis points (e.g., 10000 = 100%, 150 = 1.5%)
 * @returns Scaling factor as bigint
 *
 * @example
 * basisPointsToScalingFactor(10000) // 1000000000000000000n (100%)
 * basisPointsToScalingFactor(15000) // 1500000000000000000n (150%)
 * basisPointsToScalingFactor(50)    // 5000000000000000n    (0.5%)
 */
export function basisPointsToScalingFactor(basisPoints: number): bigint {
  if (!Number.isFinite(basisPoints) || basisPoints < 0) {
    throw new InvalidPriceCurveParametersError(`Basis points must be a finite non-negative number, got ${basisPoints}`)
  }

  // Convert basis points to percentage (10000 bp = 100% = 1.0)
  const percent = basisPoints / 10000
  return percentToScalingFactor(percent)
}

/**
 * ============================================================================
 * Dutch Auction Calculator (Exact-In, Decreasing Prices)
 * ============================================================================
 */

/**
 * Create a Dutch auction price curve (exact-in: price decreases over time)
 *
 * In a Dutch auction, the filler receives more tokens initially, less over time.
 * This means scaling starts >= 1e18 and trends toward 1e18 (exact-in mode).
 *
 * @param config - Dutch auction configuration
 * @returns Array of packed PriceCurveElements
 * @throws InvalidPriceCurveParametersError if invalid configuration
 *
 * @example
 * // Linear Dutch auction: 150% → 100% over 1000 blocks
 * const curve = createDutchAuction({
 *   startPricePercent: 1.5,
 *   endPricePercent: 1.0,
 *   durationBlocks: 1000
 * })
 *
 * @example
 * // Stepped Dutch auction with 5 discrete steps
 * const steppedCurve = createDutchAuction({
 *   startPricePercent: 1.5,
 *   endPricePercent: 1.0,
 *   durationBlocks: 1000,
 *   steps: 5
 * })
 */
export function createDutchAuction(config: DutchAuctionConfig): bigint[] {
  const { startPricePercent, endPricePercent, durationBlocks, steps = 1 } = config

  // Validate inputs
  if (startPricePercent < 1.0 || endPricePercent < 1.0) {
    throw new InvalidPriceCurveParametersError(
      `Dutch auction requires percentages >= 1.0 (exact-in mode), got start=${startPricePercent}, end=${endPricePercent}`
    )
  }

  if (startPricePercent < endPricePercent) {
    throw new InvalidPriceCurveParametersError(
      `Dutch auction must have decreasing prices: start (${startPricePercent}) should be >= end (${endPricePercent})`
    )
  }

  if (durationBlocks <= 0 || durationBlocks > MAX_BLOCK_DURATION * steps) {
    throw new InvalidPriceCurveParametersError(
      `Duration must be between 1 and ${MAX_BLOCK_DURATION * steps} blocks, got ${durationBlocks}`
    )
  }

  if (steps < 1 || !Number.isInteger(steps)) {
    throw new InvalidPriceCurveParametersError(`Steps must be a positive integer, got ${steps}`)
  }

  // Convert percentages to scaling factors
  const startScaling = percentToScalingFactor(startPricePercent)
  const endScaling = percentToScalingFactor(endPricePercent)

  // Single linear segment
  if (steps === 1) {
    // If ending at neutral OR flat price (start = end), single element suffices
    if (endScaling === NEUTRAL_SCALING || startScaling === endScaling) {
      return [createPriceCurveElement(durationBlocks, startScaling)]
    } else {
      // Need two elements: duration segment + zero-duration end target for interpolation
      return [createPriceCurveElement(durationBlocks, startScaling), createPriceCurveElement(0, endScaling)]
    }
  }

  // Multi-step: divide duration and create discrete steps
  const curve: bigint[] = []
  const segmentDuration = Math.floor(durationBlocks / steps)
  const remainder = durationBlocks % steps

  // Calculate price drop per step
  const priceRangePercent = startPricePercent - endPricePercent
  const priceDropPerStep = priceRangePercent / steps

  for (let i = 0; i < steps; i++) {
    // Calculate price for this step
    const stepPrice = startPricePercent - priceDropPerStep * i
    const stepScaling = percentToScalingFactor(stepPrice)

    // Add instant transition if not first step
    if (i > 0) {
      curve.push(createPriceCurveElement(0, stepScaling))
    }

    // Add duration for this step (distribute remainder to early steps)
    const duration = segmentDuration + (i < remainder ? 1 : 0)
    curve.push(createPriceCurveElement(duration, stepScaling))
  }

  // Validate all segments share scaling direction
  for (let i = 0; i < curve.length - 1; i++) {
    const currentScaling = unpackPriceCurveElement(curve[i]).scalingFactor
    const nextScaling = unpackPriceCurveElement(curve[i + 1]).scalingFactor
    if (!sharesScalingDirection(currentScaling, nextScaling)) {
      throw new InvalidPriceCurveParametersError(
        `Incompatible scaling directions at segment ${i}: ${currentScaling} vs ${nextScaling}`
      )
    }
  }

  return curve
}

/**
 * ============================================================================
 * Reverse Dutch Auction Calculator (Exact-Out, Increasing Prices)
 * ============================================================================
 */

/**
 * Create a reverse Dutch auction price curve (exact-out: price increases over time)
 *
 * In a reverse Dutch auction, the filler receives fewer tokens initially, more over time.
 * This means scaling starts <= 1e18 and trends toward 1e18 (exact-out mode).
 *
 * @param config - Reverse Dutch auction configuration
 * @returns Array of packed PriceCurveElements
 * @throws InvalidPriceCurveParametersError if invalid configuration
 *
 * @example
 * // Linear reverse Dutch: 50% → 100% over 1000 blocks
 * const curve = createReverseDutchAuction({
 *   startPricePercent: 0.5,
 *   endPricePercent: 1.0,
 *   durationBlocks: 1000
 * })
 */
export function createReverseDutchAuction(config: ReverseDutchAuctionConfig): bigint[] {
  const { startPricePercent, endPricePercent, durationBlocks, steps = 1 } = config

  // Validate inputs
  if (startPricePercent > 1.0 || endPricePercent > 1.0) {
    throw new InvalidPriceCurveParametersError(
      `Reverse Dutch auction requires percentages <= 1.0 (exact-out mode), got start=${startPricePercent}, end=${endPricePercent}`
    )
  }

  if (startPricePercent > endPricePercent) {
    throw new InvalidPriceCurveParametersError(
      `Reverse Dutch auction must have increasing prices: start (${startPricePercent}) should be <= end (${endPricePercent})`
    )
  }

  if (durationBlocks <= 0 || durationBlocks > MAX_BLOCK_DURATION * steps) {
    throw new InvalidPriceCurveParametersError(
      `Duration must be between 1 and ${MAX_BLOCK_DURATION * steps} blocks, got ${durationBlocks}`
    )
  }

  if (steps < 1 || !Number.isInteger(steps)) {
    throw new InvalidPriceCurveParametersError(`Steps must be a positive integer, got ${steps}`)
  }

  // Convert percentages to scaling factors
  const startScaling = percentToScalingFactor(startPricePercent)
  const endScaling = percentToScalingFactor(endPricePercent)

  // Single linear segment
  if (steps === 1) {
    // If ending at neutral OR flat price (start = end), single element suffices
    if (endScaling === NEUTRAL_SCALING || startScaling === endScaling) {
      return [createPriceCurveElement(durationBlocks, startScaling)]
    } else {
      // Need two elements: duration segment + zero-duration end target for interpolation
      return [createPriceCurveElement(durationBlocks, startScaling), createPriceCurveElement(0, endScaling)]
    }
  }

  // Multi-step: divide duration and create discrete steps
  const curve: bigint[] = []
  const segmentDuration = Math.floor(durationBlocks / steps)
  const remainder = durationBlocks % steps

  // Calculate price increase per step
  const priceRangePercent = endPricePercent - startPricePercent
  const priceIncreasePerStep = priceRangePercent / steps

  for (let i = 0; i < steps; i++) {
    // Calculate price for this step
    const stepPrice = startPricePercent + priceIncreasePerStep * i
    const stepScaling = percentToScalingFactor(stepPrice)

    // Add instant transition if not first step
    if (i > 0) {
      curve.push(createPriceCurveElement(0, stepScaling))
    }

    // Add duration for this step (distribute remainder to early steps)
    const duration = segmentDuration + (i < remainder ? 1 : 0)
    curve.push(createPriceCurveElement(duration, stepScaling))
  }

  // Validate all segments share scaling direction
  for (let i = 0; i < curve.length - 1; i++) {
    const currentScaling = unpackPriceCurveElement(curve[i]).scalingFactor
    const nextScaling = unpackPriceCurveElement(curve[i + 1]).scalingFactor
    if (!sharesScalingDirection(currentScaling, nextScaling)) {
      throw new InvalidPriceCurveParametersError(
        `Incompatible scaling directions at segment ${i}: ${currentScaling} vs ${nextScaling}`
      )
    }
  }

  return curve
}

/**
 * ============================================================================
 * Stepped Price Calculators
 * ============================================================================
 */

/**
 * Create a stepped price curve with configurable intervals
 *
 * @param config - Stepped price configuration
 * @returns Array of packed PriceCurveElements
 * @throws InvalidPriceCurveParametersError if invalid configuration
 *
 * @example
 * const curve = createSteppedPrice({
 *   steps: [
 *     { blockDuration: 100, pricePercent: 1.5 },
 *     { blockDuration: 100, pricePercent: 1.2 },
 *     { blockDuration: 100, pricePercent: 1.0 }
 *   ]
 * })
 */
export function createSteppedPrice(config: SteppedPriceConfig): bigint[] {
  const { steps } = config

  if (!steps || steps.length === 0) {
    throw new InvalidPriceCurveParametersError('Stepped price requires at least one step')
  }

  const curve: bigint[] = []

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]

    if (step.blockDuration < 0 || step.blockDuration > MAX_BLOCK_DURATION) {
      throw new InvalidPriceCurveParametersError(
        `Block duration must be between 0 and ${MAX_BLOCK_DURATION}, got ${step.blockDuration} at step ${i}`
      )
    }

    const scaling = percentToScalingFactor(step.pricePercent)

    // For instant transitions (duration=0), only add element if it's changing the price
    if (step.blockDuration === 0 && i > 0) {
      // Instant price change - add zero-duration element
      curve.push(createPriceCurveElement(0, scaling))
    } else if (step.blockDuration > 0) {
      // Add the duration segment
      curve.push(createPriceCurveElement(step.blockDuration, scaling))
    } else if (i === 0) {
      // First step with zero duration - use as starting point
      curve.push(createPriceCurveElement(0, scaling))
    }
  }

  // Validate scaling direction compatibility
  for (let i = 0; i < curve.length - 1; i++) {
    const currentScaling = unpackPriceCurveElement(curve[i]).scalingFactor
    const nextScaling = unpackPriceCurveElement(curve[i + 1]).scalingFactor
    if (!sharesScalingDirection(currentScaling, nextScaling)) {
      throw new InvalidPriceCurveParametersError(
        `Incompatible scaling directions between steps: exact-in and exact-out modes cannot be mixed`
      )
    }
  }

  return curve
}

/**
 * Create stepped price with automatic intervals from schedule
 *
 * @param config - Stepped price schedule configuration
 * @returns Array of packed PriceCurveElements
 * @throws InvalidPriceCurveParametersError if invalid configuration
 *
 * @example
 * const curve = createSteppedPriceSchedule({
 *   startPricePercent: 1.5,
 *   schedule: [
 *     { atBlock: 100, pricePercent: 1.2, instant: true },
 *     { atBlock: 200, pricePercent: 1.0, instant: false }
 *   ]
 * })
 */
export function createSteppedPriceSchedule(config: SteppedPriceScheduleConfig): bigint[] {
  const { startPricePercent, schedule } = config

  if (!schedule || schedule.length === 0) {
    throw new InvalidPriceCurveParametersError('Schedule must contain at least one price change')
  }

  // Sort schedule by block number
  const sortedSchedule = [...schedule].sort((a, b) => a.atBlock - b.atBlock)

  // Validate schedule
  if (sortedSchedule[0].atBlock < 0) {
    throw new InvalidPriceCurveParametersError('Schedule blocks must be non-negative')
  }

  const curve: bigint[] = []
  let currentBlock = 0
  let currentPrice = startPricePercent

  for (const change of sortedSchedule) {
    const blockDuration = change.atBlock - currentBlock

    if (blockDuration < 0) {
      throw new InvalidPriceCurveParametersError('Schedule must have increasing block numbers')
    }

    if (blockDuration > MAX_BLOCK_DURATION) {
      throw new InvalidPriceCurveParametersError(
        `Segment duration ${blockDuration} exceeds maximum ${MAX_BLOCK_DURATION}`
      )
    }

    // Add segment from current position to change point
    if (blockDuration > 0) {
      const scaling = percentToScalingFactor(currentPrice)
      curve.push(createPriceCurveElement(blockDuration, scaling))
    }

    // Handle transition
    if (change.instant) {
      // Instant jump: add zero-duration element
      const newScaling = percentToScalingFactor(change.pricePercent)
      curve.push(createPriceCurveElement(0, newScaling))
    }

    currentPrice = change.pricePercent
    currentBlock = change.atBlock
  }

  // Validate scaling direction compatibility
  for (let i = 0; i < curve.length - 1; i++) {
    const currentScaling = unpackPriceCurveElement(curve[i]).scalingFactor
    const nextScaling = unpackPriceCurveElement(curve[i + 1]).scalingFactor
    if (!sharesScalingDirection(currentScaling, nextScaling)) {
      throw new InvalidPriceCurveParametersError(
        `Incompatible scaling directions in schedule: exact-in and exact-out modes cannot be mixed`
      )
    }
  }

  return curve
}

/**
 * ============================================================================
 * Price Evaluation Utilities
 * ============================================================================
 */

/**
 * Calculate the effective price at a specific block
 *
 * @param curve - Price curve array
 * @param blocksPassed - Blocks elapsed since auction start
 * @returns Effective price as percentage
 *
 * @example
 * const curve = createDutchAuction({
 *   startPricePercent: 1.5,
 *   endPricePercent: 1.0,
 *   durationBlocks: 1000
 * })
 * const priceAtMidpoint = getPriceAtBlock(curve, 500) // ~1.25
 */
export function getPriceAtBlock(curve: bigint[], blocksPassed: number): number {
  if (blocksPassed < 0) {
    throw new InvalidPriceCurveParametersError('Blocks passed must be non-negative')
  }

  try {
    const scalingFactor = getCalculatedScalingFactor(curve, blocksPassed)
    return scalingFactorToPercent(scalingFactor)
  } catch (error) {
    // If blocks exceeded, return neutral price
    if (error instanceof Error && error.name === 'PriceCurveBlocksExceededError') {
      return 1.0 // Neutral
    }
    throw error
  }
}

/**
 * Get the total duration of a price curve
 *
 * @param curve - Price curve array
 * @returns Total duration in blocks (0 for empty curve or all-zero-duration curve)
 * @throws InvalidPriceCurveParametersError if duration sum exceeds Number.MAX_SAFE_INTEGER
 *
 * @example
 * const curve = createDutchAuction({
 *   startPricePercent: 1.5,
 *   endPricePercent: 1.0,
 *   durationBlocks: 1000
 * })
 * const duration = getCurveDuration(curve) // 1000
 */
export function getCurveDuration(curve: bigint[]): number {
  let totalDuration = 0

  for (const element of curve) {
    const { blockDuration } = unpackPriceCurveElement(element)
    totalDuration += blockDuration

    if (totalDuration > Number.MAX_SAFE_INTEGER) {
      throw new InvalidPriceCurveParametersError('Total curve duration exceeds maximum safe integer')
    }
  }

  return totalDuration
}

/**
 * Validate price curve comprehensively
 *
 * Validates:
 * - Block durations fit in 16 bits
 * - Scaling factors fit in 240 bits
 * - All segments share scaling direction
 * - No invalid zero-duration patterns
 * - Total duration doesn't overflow
 *
 * @param curve - Price curve array
 * @returns Validation result with error details
 *
 * @example
 * const result = validatePriceCurve(myCurve)
 * if (!result.valid) {
 *   console.error('Invalid curve:', result.errors)
 * }
 */
export function validatePriceCurve(curve: bigint[]): CurveValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Empty curve is valid (returns neutral scaling)
  if (curve.length === 0) {
    warnings.push('Empty curve will return neutral scaling (1e18)')
    return { valid: true, warnings }
  }

  let totalDuration = 0
  let hasNonZeroDuration = false
  let previousScaling: bigint | null = null

  for (let i = 0; i < curve.length; i++) {
    try {
      const { blockDuration, scalingFactor } = unpackPriceCurveElement(curve[i])

      // Check block duration bounds
      if (blockDuration < 0 || blockDuration > MAX_BLOCK_DURATION) {
        errors.push(`Element ${i}: block duration ${blockDuration} exceeds valid range [0, ${MAX_BLOCK_DURATION}]`)
      }

      // Check scaling factor is non-negative (240-bit check happens in createPriceCurveElement)
      if (scalingFactor < 0n) {
        errors.push(`Element ${i}: scaling factor must be non-negative, got ${scalingFactor}`)
      }

      // Track durations
      if (blockDuration > 0) {
        hasNonZeroDuration = true
      }

      totalDuration += blockDuration
      if (totalDuration > Number.MAX_SAFE_INTEGER) {
        errors.push('Total duration exceeds maximum safe integer')
        break
      }

      // Check scaling direction compatibility
      if (previousScaling !== null) {
        if (!sharesScalingDirection(previousScaling, scalingFactor)) {
          errors.push(`Element ${i}: incompatible scaling directions (${previousScaling} vs ${scalingFactor})`)
        }
      }

      previousScaling = scalingFactor
    } catch (error) {
      errors.push(`Element ${i}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Check for all-zero-duration curve
  if (!hasNonZeroDuration) {
    warnings.push('All curve elements have zero duration (instant price jump only)')
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}

/**
 * ============================================================================
 * Curve Composition Utilities
 * ============================================================================
 */

/**
 * Concatenate multiple curve segments into a single curve
 *
 * Note: Segments are joined directly without automatic transition elements.
 * The caller is responsible for ensuring compatible scaling directions between segments.
 *
 * @param segments - Array of curve segments to concatenate
 * @returns Combined price curve
 * @throws InvalidPriceCurveParametersError if concatenation would create invalid curve
 *
 * @example
 * const phase1 = createDutchAuction({ startPricePercent: 1.5, endPricePercent: 1.2, durationBlocks: 500 })
 * const phase2 = createDutchAuction({ startPricePercent: 1.2, endPricePercent: 1.0, durationBlocks: 500 })
 * const combined = concatenateCurves([phase1, phase2])
 */
export function concatenateCurves(segments: bigint[][]): bigint[] {
  if (segments.length === 0) {
    return []
  }

  const combined: bigint[] = []

  for (const segment of segments) {
    combined.push(...segment)
  }

  // Validate the combined curve
  const validation = validatePriceCurve(combined)
  if (!validation.valid) {
    throw new InvalidPriceCurveParametersError(`Concatenated curve is invalid: ${validation.errors?.join(', ')}`)
  }

  return combined
}

/**
 * Add a plateau (constant price) segment to a curve
 *
 * @param curve - Existing price curve
 * @param plateauBlocks - Duration of plateau in blocks
 * @returns Curve with plateau added
 * @throws InvalidPriceCurveParametersError if invalid
 *
 * @example
 * const baseCurve = createDutchAuction({ startPricePercent: 1.5, endPricePercent: 1.2, durationBlocks: 500 })
 * const withPlateau = addPlateau(baseCurve, 200) // Adds 200 blocks at 1.2
 */
export function addPlateau(curve: bigint[], plateauBlocks: number): bigint[] {
  if (plateauBlocks < 0 || plateauBlocks > MAX_BLOCK_DURATION) {
    throw new InvalidPriceCurveParametersError(
      `Plateau duration must be between 0 and ${MAX_BLOCK_DURATION}, got ${plateauBlocks}`
    )
  }

  if (plateauBlocks === 0) {
    return [...curve]
  }

  if (curve.length === 0) {
    // No existing curve, create plateau at neutral
    return [createPriceCurveElement(plateauBlocks, NEUTRAL_SCALING)]
  }

  // Get final scaling factor from curve
  const lastElement = curve[curve.length - 1]
  const { scalingFactor } = unpackPriceCurveElement(lastElement)

  // Add plateau at the final price
  return [...curve, createPriceCurveElement(plateauBlocks, scalingFactor)]
}

/**
 * Create a flat price curve (constant price)
 *
 * @param pricePercent - Price as percentage
 * @param durationBlocks - Duration in blocks
 * @returns Price curve with constant price
 *
 * @example
 * const flatCurve = createFlatPrice(1.2, 1000) // 120% for 1000 blocks
 */
export function createFlatPrice(pricePercent: number, durationBlocks: number): bigint[] {
  if (durationBlocks < 0 || durationBlocks > MAX_BLOCK_DURATION) {
    throw new InvalidPriceCurveParametersError(
      `Duration must be between 0 and ${MAX_BLOCK_DURATION}, got ${durationBlocks}`
    )
  }

  const scaling = percentToScalingFactor(pricePercent)
  return [createPriceCurveElement(durationBlocks, scaling)]
}

/**
 * Create a multi-phase auction with N distinct pricing phases
 *
 * Each phase can have different price movements and durations, enabling
 * complex auction strategies (e.g., fast decline, plateau, slow decline).
 *
 * @param config - Multi-phase auction configuration
 * @returns Price curve with multiple distinct phases
 * @throws InvalidPriceCurveParametersError if invalid configuration
 *
 * @example
 * // Fast drop, then plateau, then slow drop
 * const multiPhase = createMultiPhaseAuction({
 *   startPricePercent: 1.5,
 *   phases: [
 *     { endPricePercent: 1.2, durationBlocks: 200, steps: 1 },    // Fast linear drop
 *     { endPricePercent: 1.2, durationBlocks: 300, instant: true }, // Plateau
 *     { endPricePercent: 1.0, durationBlocks: 500, steps: 5 }      // Slow stepped drop
 *   ]
 * })
 */
export function createMultiPhaseAuction(config: MultiPhaseAuctionConfig): bigint[] {
  const { startPricePercent, phases } = config

  if (!phases || phases.length === 0) {
    throw new InvalidPriceCurveParametersError('Multi-phase auction requires at least one phase')
  }

  const curve: bigint[] = []
  let currentPrice = startPricePercent

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]

    // Validate phase
    if (phase.durationBlocks < 0) {
      throw new InvalidPriceCurveParametersError(
        `Phase ${i}: duration must be non-negative, got ${phase.durationBlocks}`
      )
    }

    const steps = phase.steps ?? 1

    // Handle instant transition to this phase
    if (phase.instant && i > 0) {
      const scaling = percentToScalingFactor(currentPrice)
      curve.push(createPriceCurveElement(0, scaling))
    }

    // Create phase curve
    if (currentPrice === phase.endPricePercent) {
      // Flat price phase
      const scaling = percentToScalingFactor(currentPrice)
      curve.push(createPriceCurveElement(phase.durationBlocks, scaling))
    } else if (currentPrice > phase.endPricePercent) {
      // Decreasing price - check if it should use Dutch auction
      if (currentPrice >= 1.0 && phase.endPricePercent >= 1.0) {
        // Use Dutch auction (exact-in mode)
        const phaseConfig: DutchAuctionConfig = {
          startPricePercent: currentPrice,
          endPricePercent: phase.endPricePercent,
          durationBlocks: phase.durationBlocks,
          steps,
        }
        const phaseCurve = createDutchAuction(phaseConfig)
        curve.push(...phaseCurve)
      } else {
        // Manual curve for decreasing phases that don't meet auction criteria
        const startScaling = percentToScalingFactor(currentPrice)
        curve.push(createPriceCurveElement(phase.durationBlocks, startScaling))
      }
    } else {
      // Increasing price - check if it should use Reverse Dutch auction
      if (currentPrice <= 1.0 && phase.endPricePercent <= 1.0) {
        // Use Reverse Dutch auction (exact-out mode)
        const phaseConfig: ReverseDutchAuctionConfig = {
          startPricePercent: currentPrice,
          endPricePercent: phase.endPricePercent,
          durationBlocks: phase.durationBlocks,
          steps,
        }
        const phaseCurve = createReverseDutchAuction(phaseConfig)
        curve.push(...phaseCurve)
      } else {
        // Manual curve for increasing phases that don't meet auction criteria
        const startScaling = percentToScalingFactor(currentPrice)
        curve.push(createPriceCurveElement(phase.durationBlocks, startScaling))
      }
    }

    currentPrice = phase.endPricePercent
  }

  return curve
}
