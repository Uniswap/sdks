/**
 * Price Curve Library for Tribunal auctions
 *
 * Provides functionality for creating, manipulating, and evaluating price curves that define
 * how auction prices evolve over time.
 *
 * Key concepts:
 * - PriceCurveElement: Packs block duration (16 bits) + scaling factor (240 bits) into uint256
 * - Scaling factor: 1e18 = neutral/100%. >1e18 = exact-in mode, <1e18 = exact-out mode
 * - Zero-duration segments: Enable instant price jumps at specific blocks
 * - Linear interpolation: Smooth transitions between curve points
 * - Supplemental curves: Adjusters can modify base curves by adding scaling factors
 *
 * Based on: tribunal/src/lib/PriceCurveLib.sol
 */

/**
 * Price curve element representing a segment of the auction curve
 */
export interface PriceCurveElement {
  blockDuration: number // 16-bit duration in blocks
  scalingFactor: bigint // 240-bit scaling factor (1e18 = neutral)
}

/**
 * Constants for bit manipulation
 */
const BLOCK_DURATION_BITS = 16
const SCALING_FACTOR_BITS = 240
const BLOCK_DURATION_SHIFT = SCALING_FACTOR_BITS
const SCALING_FACTOR_MASK = (1n << BigInt(SCALING_FACTOR_BITS)) - 1n
const MAX_BLOCK_DURATION = (1 << BLOCK_DURATION_BITS) - 1 // 65535 blocks
const MAX_SCALING_FACTOR = (1n << BigInt(SCALING_FACTOR_BITS)) - 1n

/**
 * Error types
 */
export class PriceCurveBlocksExceededError extends Error {
  constructor() {
    super('Price curve blocks exceeded')
    this.name = 'PriceCurveBlocksExceededError'
  }
}

export class InvalidPriceCurveParametersError extends Error {
  constructor(message?: string) {
    super(message || 'Invalid price curve parameters')
    this.name = 'InvalidPriceCurveParametersError'
  }
}

/**
 * Create a packed PriceCurveElement from individual components
 * @param blockDuration - Duration in blocks for this curve segment (0-65535)
 * @param scalingFactor - Scaling factor (1e18 = neutral, max 240 bits)
 * @returns Packed uint256 containing both values
 */
export function createPriceCurveElement(blockDuration: number, scalingFactor: bigint): bigint {
  if (blockDuration < 0 || blockDuration > MAX_BLOCK_DURATION) {
    throw new InvalidPriceCurveParametersError(
      `Block duration must be between 0 and ${MAX_BLOCK_DURATION}, got ${blockDuration}`
    )
  }

  if (scalingFactor < 0n || scalingFactor > MAX_SCALING_FACTOR) {
    throw new InvalidPriceCurveParametersError(
      `Scaling factor must be between 0 and ${MAX_SCALING_FACTOR}, got ${scalingFactor}`
    )
  }

  return (BigInt(blockDuration) << BigInt(BLOCK_DURATION_SHIFT)) | scalingFactor
}

/**
 * Extract block duration from a packed PriceCurveElement
 */
export function getBlockDuration(element: bigint): number {
  return Number(element >> BigInt(BLOCK_DURATION_SHIFT))
}

/**
 * Extract scaling factor from a packed PriceCurveElement
 */
export function getScalingFactor(element: bigint): bigint {
  return element & SCALING_FACTOR_MASK
}

/**
 * Extract both components from a packed PriceCurveElement
 */
export function unpackPriceCurveElement(element: bigint): PriceCurveElement {
  return {
    blockDuration: getBlockDuration(element),
    scalingFactor: getScalingFactor(element),
  }
}

/**
 * Check if two scaling factors scale in the same direction
 * Returns true if both are exact-in (>1e18) or both exact-out (<1e18), or either is neutral (=1e18)
 */
export function sharesScalingDirection(a: bigint, b: bigint): boolean {
  const threshold = 1000000000000000000n // 1e18

  // Either value is 1e18 (neutral)
  if (a === threshold || b === threshold) {
    return true
  }

  // Both values are on the same side of 1e18
  return (a > threshold) === (b > threshold)
}

/**
 * Apply a supplemental price curve from an adjuster to a base price curve
 *
 * Combines curves by adding scaling factors and subtracting 1e18:
 * combinedScalingFactor = baseScalingFactor + supplementalScalingFactor - 1e18
 *
 * This allows adjusters to modify prices while preserving the sponsor's base curve structure.
 *
 * @param baseCurve - The base price curve array
 * @param supplementalCurve - The supplemental curve from the adjuster
 * @returns Combined price curve array
 * @throws InvalidPriceCurveParametersError if curves scale in different directions or overflow
 */
export function applySupplementalPriceCurve(baseCurve: bigint[], supplementalCurve: bigint[]): bigint[] {
  const combinedCurve: bigint[] = []
  const applicationRange = Math.min(baseCurve.length, supplementalCurve.length)

  // Apply supplemental curve to overlapping segments
  for (let i = 0; i < applicationRange; i++) {
    const { blockDuration, scalingFactor } = unpackPriceCurveElement(baseCurve[i])
    const supplementalScalingFactor = supplementalCurve[i]

    // Combine: base + supplemental - 1e18
    const combinedScalingFactor = scalingFactor + supplementalScalingFactor - 1000000000000000000n

    // Validate scaling direction compatibility
    if (!sharesScalingDirection(scalingFactor, supplementalScalingFactor)) {
      throw new InvalidPriceCurveParametersError(
        `Incompatible scaling directions at index ${i}: base=${scalingFactor}, supplemental=${supplementalScalingFactor}`
      )
    }

    // Check for overflow (must fit in 240 bits)
    if (combinedScalingFactor > MAX_SCALING_FACTOR || combinedScalingFactor < 0n) {
      throw new InvalidPriceCurveParametersError(
        `Combined scaling factor overflow at index ${i}: ${combinedScalingFactor}`
      )
    }

    combinedCurve.push(createPriceCurveElement(blockDuration, combinedScalingFactor))
  }

  // Copy remaining base curve segments if supplemental is shorter
  for (let i = applicationRange; i < baseCurve.length; i++) {
    combinedCurve.push(baseCurve[i])
  }

  return combinedCurve
}

/**
 * Calculate the current scaling factor based on blocks elapsed since auction start
 *
 * Processes the price curve sequentially to determine the current price based on block progression.
 * Supports:
 * - Linear interpolation between discrete curve points
 * - Zero-duration segments for instant price jumps
 * - Defaults to 1e18 (neutral) if auction extends beyond curve duration
 *
 * @param curve - Array of packed PriceCurveElements defining the curve segments
 * @param blocksPassed - Number of blocks elapsed since the auction start (targetBlock)
 * @returns The calculated scaling factor for the current block (1e18 = neutral)
 * @throws PriceCurveBlocksExceededError if blocksPassed exceeds total curve duration
 */
export function getCalculatedScalingFactor(curve: bigint[], blocksPassed: number): bigint {
  // Empty curve returns neutral scaling
  if (curve.length === 0) {
    return 1000000000000000000n // 1e18
  }

  let blocksCounted = 0
  let hasPassedZeroDuration = false
  let currentScalingFactor = 1000000000000000000n // Default to neutral

  // Process each curve segment
  for (let i = 0; i < curve.length; i++) {
    const { blockDuration, scalingFactor } = unpackPriceCurveElement(curve[i])

    // Special handling for zero-duration segments (instant price jumps)
    if (blockDuration === 0) {
      if (blocksPassed >= blocksCounted) {
        currentScalingFactor = scalingFactor
        hasPassedZeroDuration = true
      }
      // Zero duration doesn't add to blocksCounted
      // Don't return early - continue processing to handle consecutive zero-duration elements
      continue
    }

    // Check if blocksPassed falls within this segment
    if (blocksPassed < blocksCounted + blockDuration) {
      // Determine start and end values for interpolation
      let startScalingFactor: bigint
      let endScalingFactor: bigint

      // Check if we're in a segment right after a zero-duration segment
      if (hasPassedZeroDuration && i > 0 && getBlockDuration(curve[i - 1]) === 0) {
        // Interpolate from zero-duration value to current segment value
        startScalingFactor = getScalingFactor(curve[i - 1])
        endScalingFactor = scalingFactor

        // Validate scaling direction
        if (!sharesScalingDirection(startScalingFactor, endScalingFactor)) {
          throw new InvalidPriceCurveParametersError(
            'Incompatible scaling directions between zero-duration segment and following segment'
          )
        }

        return locateCurrentAmount(
          startScalingFactor,
          endScalingFactor,
          blocksCounted,
          blocksPassed,
          blocksCounted + blockDuration,
          startScalingFactor > 1000000000000000000n // Round up for exact-in
        )
      } else {
        // Standard interpolation between current and next segment
        startScalingFactor = scalingFactor

        if (i + 1 < curve.length) {
          // Next segment determines target value
          endScalingFactor = getScalingFactor(curve[i + 1])
        } else {
          // Last segment ends at 1e18 (neutral)
          endScalingFactor = 1000000000000000000n
        }

        // Validate scaling direction
        if (!sharesScalingDirection(startScalingFactor, endScalingFactor)) {
          throw new InvalidPriceCurveParametersError('Incompatible scaling directions between curve segments')
        }

        return locateCurrentAmount(
          startScalingFactor,
          endScalingFactor,
          blocksCounted,
          blocksPassed,
          blocksCounted + blockDuration,
          startScalingFactor > 1000000000000000000n // Round up for exact-in
        )
      }
    }

    // We've passed this segment, continue to next
    blocksCounted += blockDuration
  }

  // If we went through all segments and exceeded total duration, revert
  if (blocksPassed >= blocksCounted) {
    throw new PriceCurveBlocksExceededError()
  }

  return currentScalingFactor
}

/**
 * Perform linear interpolation to derive the current scaling factor between two points
 *
 * Formula: ((startAmount × remaining) + (endAmount × elapsed)) / duration
 *
 * @param startAmount - Starting scaling factor
 * @param endAmount - Ending scaling factor
 * @param startBlock - Block where segment begins
 * @param currentBlock - Current block (must be: startBlock ≤ currentBlock < endBlock)
 * @param endBlock - Block where segment ends
 * @param roundUp - Whether to round up (true for exact-in) or down (false for exact-out)
 * @returns Interpolated scaling factor
 */
function locateCurrentAmount(
  startAmount: bigint,
  endAmount: bigint,
  startBlock: number,
  currentBlock: number,
  endBlock: number,
  roundUp: boolean
): bigint {
  // If start and end are equal, no interpolation needed
  if (startAmount === endAmount) {
    return endAmount
  }

  // Calculate block durations
  const duration = endBlock - startBlock
  const elapsed = currentBlock - startBlock
  const remaining = duration - elapsed

  // Weighted interpolation: (startAmount × remaining + endAmount × elapsed) / duration
  const totalBeforeDivision = startAmount * BigInt(remaining) + endAmount * BigInt(elapsed)

  // Handle zero case to avoid intermediate overflow
  if (totalBeforeDivision === 0n) {
    return 0n
  }

  // Apply rounding:
  // - For round up: (total - 1) / duration + 1
  // - For round down: total / duration
  if (roundUp) {
    return (totalBeforeDivision - 1n) / BigInt(duration) + 1n
  } else {
    return totalBeforeDivision / BigInt(duration)
  }
}

/**
 * Convenience function to create a simple price curve from an array of elements
 */
export function createPriceCurve(elements: PriceCurveElement[]): bigint[] {
  return elements.map((el) => createPriceCurveElement(el.blockDuration, el.scalingFactor))
}

/**
 * Convenience function to unpack an entire price curve
 */
export function unpackPriceCurve(curve: bigint[]): PriceCurveElement[] {
  return curve.map(unpackPriceCurveElement)
}

/**
 * Constants for common scaling factors
 */
export const SCALING_FACTOR = {
  /** Neutral scaling (100%) */
  NEUTRAL: 1000000000000000000n, // 1e18
  /** 50% */
  HALF: 500000000000000000n, // 0.5e18
  /** 75% */
  THREE_QUARTERS: 750000000000000000n, // 0.75e18
  /** 90% */
  NINETY_PERCENT: 900000000000000000n, // 0.9e18
  /** 110% */
  ONE_TEN_PERCENT: 1100000000000000000n, // 1.1e18
  /** 120% */
  ONE_TWENTY_PERCENT: 1200000000000000000n, // 1.2e18
  /** 150% */
  ONE_FIFTY_PERCENT: 1500000000000000000n, // 1.5e18
  /** 200% */
  DOUBLE: 2000000000000000000n, // 2e18
} as const
