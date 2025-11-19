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
/**
 * Configuration interfaces
 */
export interface DutchAuctionConfig {
    /** Starting price as percentage (e.g., 1.5 = 150%, must be >= 1.0) */
    startPricePercent: number;
    /** Ending price as percentage (e.g., 1.0 = 100%, must be >= 1.0 and <= start) */
    endPricePercent: number;
    /** Total duration in blocks */
    durationBlocks: number;
    /** Optional: number of discrete steps (default: 1 for linear) */
    steps?: number;
}
export interface ReverseDutchAuctionConfig {
    /** Starting price as percentage (e.g., 0.5 = 50%, must be <= 1.0) */
    startPricePercent: number;
    /** Ending price as percentage (e.g., 1.0 = 100%, must be <= 1.0 and >= start) */
    endPricePercent: number;
    /** Total duration in blocks */
    durationBlocks: number;
    /** Optional: number of discrete steps (default: 1 for linear) */
    steps?: number;
}
export interface SteppedPriceConfig {
    /** Array of price steps with durations */
    steps: PriceStep[];
}
export interface PriceStep {
    /** Block duration for this step (0 for instant transition) */
    blockDuration: number;
    /** Price as percentage (e.g., 1.2 = 120%) */
    pricePercent: number;
}
export interface SteppedPriceScheduleConfig {
    /** Starting price percentage */
    startPricePercent: number;
    /** Schedule of price changes */
    schedule: PriceChange[];
}
export interface PriceChange {
    /** Blocks from start when this change occurs */
    atBlock: number;
    /** New price percentage */
    pricePercent: number;
    /** Whether to jump instantly (true) or interpolate (false) */
    instant?: boolean;
}
export interface MultiPhaseAuctionConfig {
    /** Starting price percentage for the entire auction */
    startPricePercent: number;
    /** Array of phases, each with target price and duration */
    phases: AuctionPhase[];
}
export interface AuctionPhase {
    /** Target price percentage at the end of this phase */
    endPricePercent: number;
    /** Duration of this phase in blocks */
    durationBlocks: number;
    /** Optional: number of steps for this phase (default: 1 for linear) */
    steps?: number;
    /** Optional: whether to transition instantly to this phase (default: false) */
    instant?: boolean;
}
export interface CurveValidationResult {
    /** Whether the curve is valid */
    valid: boolean;
    /** Array of error messages if invalid */
    errors?: string[];
    /** Array of warning messages */
    warnings?: string[];
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
export declare function percentToScalingFactor(percent: number): bigint;
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
export declare function scalingFactorToPercent(scalingFactor: bigint): number;
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
export declare function basisPointsToScalingFactor(basisPoints: number): bigint;
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
export declare function createDutchAuction(config: DutchAuctionConfig): bigint[];
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
export declare function createReverseDutchAuction(config: ReverseDutchAuctionConfig): bigint[];
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
export declare function createSteppedPrice(config: SteppedPriceConfig): bigint[];
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
export declare function createSteppedPriceSchedule(config: SteppedPriceScheduleConfig): bigint[];
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
export declare function getPriceAtBlock(curve: bigint[], blocksPassed: number): number;
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
export declare function getCurveDuration(curve: bigint[]): number;
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
export declare function validatePriceCurve(curve: bigint[]): CurveValidationResult;
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
export declare function concatenateCurves(segments: bigint[][]): bigint[];
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
export declare function addPlateau(curve: bigint[], plateauBlocks: number): bigint[];
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
export declare function createFlatPrice(pricePercent: number, durationBlocks: number): bigint[];
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
export declare function createMultiPhaseAuction(config: MultiPhaseAuctionConfig): bigint[];
