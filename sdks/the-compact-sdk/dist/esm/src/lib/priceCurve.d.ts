/**
 * Price Curve Library for Tribunal auctions
 *
 * Price curves enable time-based Dutch auctions where fill amounts change over time.
 * Each curve element packs a block duration (16 bits) and scaling factor (240 bits).
 *
 * Key concepts:
 * - Exact-in mode (scaling > 1e18): Filler receives more tokens for providing the fill
 * - Exact-out mode (scaling < 1e18): Filler receives fewer tokens for providing the fill
 * - Neutral (scaling = 1e18): No scaling applied
 * - Zero-duration segments: Create instant price jumps (steps) at specific block numbers
 * - Linear interpolation: Smooth transitions between curve points
 * - Supplemental curves: Adjusters can modify base curves (combined = base + supplemental - 1e18)
 *
 * Based on: tribunal/src/lib/PriceCurveLib.sol
 */
/**
 * Price curve element representing a segment of the auction curve
 */
export interface PriceCurveElement {
    blockDuration: number;
    scalingFactor: bigint;
}
/**
 * Error types
 */
export declare class PriceCurveBlocksExceededError extends Error {
    constructor();
}
export declare class InvalidPriceCurveParametersError extends Error {
    constructor(message?: string);
}
/**
 * Create a packed PriceCurveElement from individual components
 * @param blockDuration - Duration in blocks for this curve segment (0-65535)
 * @param scalingFactor - Scaling factor (1e18 = neutral, max 240 bits)
 * @returns Packed uint256 containing both values
 */
export declare function createPriceCurveElement(blockDuration: number, scalingFactor: bigint): bigint;
/**
 * Extract block duration from a packed PriceCurveElement
 * @param element - Packed PriceCurveElement uint256
 * @returns Block duration (0-65535)
 */
export declare function getBlockDuration(element: bigint): number;
/**
 * Extract scaling factor from a packed PriceCurveElement
 * @param element - Packed PriceCurveElement uint256
 * @returns Scaling factor (240-bit value, 1e18 = neutral)
 */
export declare function getScalingFactor(element: bigint): bigint;
/**
 * Extract both components from a packed PriceCurveElement
 * @param element - Packed PriceCurveElement uint256
 * @returns Unpacked PriceCurveElement with blockDuration and scalingFactor
 */
export declare function unpackPriceCurveElement(element: bigint): PriceCurveElement;
/**
 * Check if two scaling factors scale in the same direction
 * Returns true if both are exact-in (>1e18) or both exact-out (<1e18), or either is neutral (=1e18)
 * @param a - First scaling factor
 * @param b - Second scaling factor
 * @returns True if scaling factors are compatible (same direction or one is neutral)
 */
export declare function sharesScalingDirection(a: bigint, b: bigint): boolean;
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
export declare function applySupplementalPriceCurve(baseCurve: bigint[], supplementalCurve: bigint[]): bigint[];
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
export declare function getCalculatedScalingFactor(curve: bigint[], blocksPassed: number): bigint;
/**
 * Convenience function to create a packed price curve from an array of elements
 * @param elements - Array of unpacked PriceCurveElements
 * @returns Array of packed uint256 values ready for on-chain use
 */
export declare function createPriceCurve(elements: PriceCurveElement[]): bigint[];
/**
 * Convenience function to unpack an entire price curve
 * @param curve - Array of packed PriceCurveElement uint256 values
 * @returns Array of unpacked PriceCurveElements
 */
export declare function unpackPriceCurve(curve: bigint[]): PriceCurveElement[];
/**
 * Constants for common scaling factors
 */
export declare const SCALING_FACTOR: {
    /** Neutral scaling (100%) */
    readonly NEUTRAL: 1000000000000000000n;
    /** 50% */
    readonly HALF: 500000000000000000n;
    /** 75% */
    readonly THREE_QUARTERS: 750000000000000000n;
    /** 90% */
    readonly NINETY_PERCENT: 900000000000000000n;
    /** 110% */
    readonly ONE_TEN_PERCENT: 1100000000000000000n;
    /** 120% */
    readonly ONE_TWENTY_PERCENT: 1200000000000000000n;
    /** 150% */
    readonly ONE_FIFTY_PERCENT: 1500000000000000000n;
    /** 200% */
    readonly DOUBLE: 2000000000000000000n;
};
