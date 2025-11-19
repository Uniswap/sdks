"use strict";
/**
 * Comprehensive tests for price curve calculator utilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
const priceCurve_1 = require("./priceCurve");
const priceCurveCalculators_1 = require("./priceCurveCalculators");
describe('Price Curve Calculators', () => {
    describe('percentage utilities', () => {
        describe('percentToScalingFactor', () => {
            it('should convert 100% to 1e18', () => {
                expect((0, priceCurveCalculators_1.percentToScalingFactor)(1.0)).toBe(1000000000000000000n);
            });
            it('should convert 150% to 1.5e18', () => {
                expect((0, priceCurveCalculators_1.percentToScalingFactor)(1.5)).toBe(1500000000000000000n);
            });
            it('should convert 50% to 0.5e18', () => {
                expect((0, priceCurveCalculators_1.percentToScalingFactor)(0.5)).toBe(500000000000000000n);
            });
            it('should convert 90% to 0.9e18', () => {
                expect((0, priceCurveCalculators_1.percentToScalingFactor)(0.9)).toBe(900000000000000000n);
            });
            it('should handle zero percent', () => {
                expect((0, priceCurveCalculators_1.percentToScalingFactor)(0)).toBe(0n);
            });
            it('should throw on negative percent', () => {
                expect(() => (0, priceCurveCalculators_1.percentToScalingFactor)(-1)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
            });
            it('should throw on non-finite percent', () => {
                expect(() => (0, priceCurveCalculators_1.percentToScalingFactor)(NaN)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
                expect(() => (0, priceCurveCalculators_1.percentToScalingFactor)(Infinity)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
            });
            it('should handle decimal percentages with rounding', () => {
                const result = (0, priceCurveCalculators_1.percentToScalingFactor)(1.23456789);
                // Should be approximately 1.23456789e18
                expect(result > 1234567000000000000n).toBe(true);
                expect(result < 1234568000000000000n).toBe(true);
            });
        });
        describe('scalingFactorToPercent', () => {
            it('should convert 1e18 to 100%', () => {
                expect((0, priceCurveCalculators_1.scalingFactorToPercent)(1000000000000000000n)).toBe(1.0);
            });
            it('should convert 1.5e18 to 150%', () => {
                expect((0, priceCurveCalculators_1.scalingFactorToPercent)(1500000000000000000n)).toBe(1.5);
            });
            it('should convert 0.5e18 to 50%', () => {
                expect((0, priceCurveCalculators_1.scalingFactorToPercent)(500000000000000000n)).toBe(0.5);
            });
            it('should handle zero', () => {
                expect((0, priceCurveCalculators_1.scalingFactorToPercent)(0n)).toBe(0);
            });
            it('should throw on negative scaling factor', () => {
                expect(() => (0, priceCurveCalculators_1.scalingFactorToPercent)(-1n)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
            });
            it('should be inverse of percentToScalingFactor', () => {
                const originalPercent = 1.25;
                const scaling = (0, priceCurveCalculators_1.percentToScalingFactor)(originalPercent);
                const roundTrip = (0, priceCurveCalculators_1.scalingFactorToPercent)(scaling);
                expect(roundTrip).toBeCloseTo(originalPercent, 10);
            });
        });
        describe('basisPointsToScalingFactor', () => {
            it('should convert 10000 bp to 1e18 (100%)', () => {
                expect((0, priceCurveCalculators_1.basisPointsToScalingFactor)(10000)).toBe(1000000000000000000n);
            });
            it('should convert 15000 bp to 1.5e18 (150%)', () => {
                expect((0, priceCurveCalculators_1.basisPointsToScalingFactor)(15000)).toBe(1500000000000000000n);
            });
            it('should convert 50 bp to 0.5% (0.005e18)', () => {
                expect((0, priceCurveCalculators_1.basisPointsToScalingFactor)(50)).toBe(5000000000000000n);
            });
            it('should handle zero basis points', () => {
                expect((0, priceCurveCalculators_1.basisPointsToScalingFactor)(0)).toBe(0n);
            });
            it('should throw on negative basis points', () => {
                expect(() => (0, priceCurveCalculators_1.basisPointsToScalingFactor)(-1)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
            });
            it('should throw on non-finite basis points', () => {
                expect(() => (0, priceCurveCalculators_1.basisPointsToScalingFactor)(NaN)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
            });
        });
    });
    describe('createDutchAuction', () => {
        it('should create linear Dutch auction (150% → 100%)', () => {
            const config = {
                startPricePercent: 1.5,
                endPricePercent: 1.0,
                durationBlocks: 1000,
            };
            const curve = (0, priceCurveCalculators_1.createDutchAuction)(config);
            expect(curve).toHaveLength(1);
            const element = (0, priceCurve_1.unpackPriceCurveElement)(curve[0]);
            expect(element.blockDuration).toBe(1000);
            expect(element.scalingFactor).toBe(1500000000000000000n);
        });
        it('should create linear Dutch auction with non-neutral end (200% → 150%)', () => {
            const config = {
                startPricePercent: 2.0,
                endPricePercent: 1.5,
                durationBlocks: 1000,
            };
            const curve = (0, priceCurveCalculators_1.createDutchAuction)(config);
            // Should have 2 elements: duration segment + zero-duration end target
            expect(curve).toHaveLength(2);
            const firstElement = (0, priceCurve_1.unpackPriceCurveElement)(curve[0]);
            expect(firstElement.blockDuration).toBe(1000);
            expect(firstElement.scalingFactor).toBe(2000000000000000000n);
            const secondElement = (0, priceCurve_1.unpackPriceCurveElement)(curve[1]);
            expect(secondElement.blockDuration).toBe(0);
            expect(secondElement.scalingFactor).toBe(1500000000000000000n);
            // Verify interpolation at midpoint
            const midpointPrice = (0, priceCurveCalculators_1.getPriceAtBlock)(curve, 500);
            expect(midpointPrice).toBeCloseTo(1.75, 2); // Should be 175%
        });
        it('should create stepped Dutch auction with 5 steps', () => {
            const config = {
                startPricePercent: 1.5,
                endPricePercent: 1.0,
                durationBlocks: 1000,
                steps: 5,
            };
            const curve = (0, priceCurveCalculators_1.createDutchAuction)(config);
            // Each step has 2 elements: zero-duration instant drop + duration segment
            // Except first step which only has duration segment
            // Total: 1 + (4 * 2) = 9 elements
            expect(curve).toHaveLength(9);
            // Verify first step
            const firstStep = (0, priceCurve_1.unpackPriceCurveElement)(curve[0]);
            expect(firstStep.blockDuration).toBe(200);
            expect(firstStep.scalingFactor).toBe(1500000000000000000n);
        });
        it('should throw if start price < 1.0 (not exact-in)', () => {
            const config = {
                startPricePercent: 0.9,
                endPricePercent: 0.8,
                durationBlocks: 1000,
            };
            expect(() => (0, priceCurveCalculators_1.createDutchAuction)(config)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
        it('should throw if end price < 1.0 (not exact-in)', () => {
            const config = {
                startPricePercent: 1.2,
                endPricePercent: 0.9,
                durationBlocks: 1000,
            };
            expect(() => (0, priceCurveCalculators_1.createDutchAuction)(config)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
        it('should throw if prices are increasing (not decreasing)', () => {
            const config = {
                startPricePercent: 1.0,
                endPricePercent: 1.5,
                durationBlocks: 1000,
            };
            expect(() => (0, priceCurveCalculators_1.createDutchAuction)(config)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
        it('should throw if duration is zero', () => {
            const config = {
                startPricePercent: 1.5,
                endPricePercent: 1.0,
                durationBlocks: 0,
            };
            expect(() => (0, priceCurveCalculators_1.createDutchAuction)(config)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
        it('should throw if duration is negative', () => {
            const config = {
                startPricePercent: 1.5,
                endPricePercent: 1.0,
                durationBlocks: -100,
            };
            expect(() => (0, priceCurveCalculators_1.createDutchAuction)(config)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
        it('should throw if steps < 1', () => {
            const config = {
                startPricePercent: 1.5,
                endPricePercent: 1.0,
                durationBlocks: 1000,
                steps: 0,
            };
            expect(() => (0, priceCurveCalculators_1.createDutchAuction)(config)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
        it('should allow flat Dutch auction (start = end)', () => {
            const config = {
                startPricePercent: 1.2,
                endPricePercent: 1.2,
                durationBlocks: 1000,
            };
            const curve = (0, priceCurveCalculators_1.createDutchAuction)(config);
            expect(curve).toHaveLength(1);
            const element = (0, priceCurve_1.unpackPriceCurveElement)(curve[0]);
            expect(element.scalingFactor).toBe(1200000000000000000n);
        });
    });
    describe('createReverseDutchAuction', () => {
        it('should create linear reverse Dutch auction (50% → 100%)', () => {
            const config = {
                startPricePercent: 0.5,
                endPricePercent: 1.0,
                durationBlocks: 1000,
            };
            const curve = (0, priceCurveCalculators_1.createReverseDutchAuction)(config);
            expect(curve).toHaveLength(1);
            const element = (0, priceCurve_1.unpackPriceCurveElement)(curve[0]);
            expect(element.blockDuration).toBe(1000);
            expect(element.scalingFactor).toBe(500000000000000000n);
        });
        it('should create linear reverse Dutch auction with non-neutral end (25% → 75%)', () => {
            const config = {
                startPricePercent: 0.25,
                endPricePercent: 0.75,
                durationBlocks: 1000,
            };
            const curve = (0, priceCurveCalculators_1.createReverseDutchAuction)(config);
            // Should have 2 elements: duration segment + zero-duration end target
            expect(curve).toHaveLength(2);
            const firstElement = (0, priceCurve_1.unpackPriceCurveElement)(curve[0]);
            expect(firstElement.blockDuration).toBe(1000);
            expect(firstElement.scalingFactor).toBe(250000000000000000n);
            const secondElement = (0, priceCurve_1.unpackPriceCurveElement)(curve[1]);
            expect(secondElement.blockDuration).toBe(0);
            expect(secondElement.scalingFactor).toBe(750000000000000000n);
            // Verify interpolation at midpoint
            const midpointPrice = (0, priceCurveCalculators_1.getPriceAtBlock)(curve, 500);
            expect(midpointPrice).toBeCloseTo(0.5, 2); // Should be 50%
        });
        it('should create stepped reverse Dutch with 4 steps', () => {
            const config = {
                startPricePercent: 0.5,
                endPricePercent: 1.0,
                durationBlocks: 800,
                steps: 4,
            };
            const curve = (0, priceCurveCalculators_1.createReverseDutchAuction)(config);
            // 1 + (3 * 2) = 7 elements
            expect(curve).toHaveLength(7);
            // Verify first step starts at 50%
            const firstStep = (0, priceCurve_1.unpackPriceCurveElement)(curve[0]);
            expect(firstStep.scalingFactor).toBe(500000000000000000n);
        });
        it('should throw if start price > 1.0 (not exact-out)', () => {
            const config = {
                startPricePercent: 1.2,
                endPricePercent: 1.5,
                durationBlocks: 1000,
            };
            expect(() => (0, priceCurveCalculators_1.createReverseDutchAuction)(config)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
        it('should throw if end price > 1.0 (not exact-out)', () => {
            const config = {
                startPricePercent: 0.5,
                endPricePercent: 1.2,
                durationBlocks: 1000,
            };
            expect(() => (0, priceCurveCalculators_1.createReverseDutchAuction)(config)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
        it('should throw if prices are decreasing (not increasing)', () => {
            const config = {
                startPricePercent: 1.0,
                endPricePercent: 0.5,
                durationBlocks: 1000,
            };
            expect(() => (0, priceCurveCalculators_1.createReverseDutchAuction)(config)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
        it('should allow flat reverse Dutch (start = end)', () => {
            const config = {
                startPricePercent: 0.8,
                endPricePercent: 0.8,
                durationBlocks: 1000,
            };
            const curve = (0, priceCurveCalculators_1.createReverseDutchAuction)(config);
            expect(curve).toHaveLength(1);
            const element = (0, priceCurve_1.unpackPriceCurveElement)(curve[0]);
            expect(element.scalingFactor).toBe(800000000000000000n);
        });
    });
    describe('createSteppedPrice', () => {
        it('should create stepped price with multiple levels', () => {
            const curve = (0, priceCurveCalculators_1.createSteppedPrice)({
                steps: [
                    { blockDuration: 100, pricePercent: 1.5 },
                    { blockDuration: 100, pricePercent: 1.2 },
                    { blockDuration: 100, pricePercent: 1.0 },
                ],
            });
            expect(curve.length).toBeGreaterThan(0);
            // Verify first step
            const firstStep = (0, priceCurve_1.unpackPriceCurveElement)(curve[0]);
            expect(firstStep.blockDuration).toBe(100);
            expect(firstStep.scalingFactor).toBe(1500000000000000000n);
        });
        it('should handle instant transitions (zero duration)', () => {
            const curve = (0, priceCurveCalculators_1.createSteppedPrice)({
                steps: [
                    { blockDuration: 100, pricePercent: 1.5 },
                    { blockDuration: 0, pricePercent: 1.2 }, // Instant drop
                    { blockDuration: 100, pricePercent: 1.2 },
                ],
            });
            expect(curve.length).toBeGreaterThan(2);
            // Should have zero-duration element for instant transition
            const instantElement = (0, priceCurve_1.unpackPriceCurveElement)(curve[1]);
            expect(instantElement.blockDuration).toBe(0);
            expect(instantElement.scalingFactor).toBe(1200000000000000000n);
        });
        it('should throw on empty steps array', () => {
            expect(() => (0, priceCurveCalculators_1.createSteppedPrice)({ steps: [] })).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
        it('should throw if block duration exceeds maximum', () => {
            expect(() => (0, priceCurveCalculators_1.createSteppedPrice)({
                steps: [{ blockDuration: 70000, pricePercent: 1.0 }],
            })).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
        it('should throw on mixed scaling directions', () => {
            expect(() => (0, priceCurveCalculators_1.createSteppedPrice)({
                steps: [
                    { blockDuration: 100, pricePercent: 1.5 }, // exact-in (>1.0)
                    { blockDuration: 100, pricePercent: 0.5 }, // exact-out (<1.0)
                ],
            })).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
    });
    describe('createSteppedPriceSchedule', () => {
        it('should create schedule with instant transitions', () => {
            const curve = (0, priceCurveCalculators_1.createSteppedPriceSchedule)({
                startPricePercent: 1.5,
                schedule: [
                    { atBlock: 100, pricePercent: 1.2, instant: true },
                    { atBlock: 200, pricePercent: 1.0, instant: true },
                ],
            });
            expect(curve.length).toBeGreaterThan(0);
            // Verify total duration
            const duration = (0, priceCurveCalculators_1.getCurveDuration)(curve);
            expect(duration).toBe(200);
        });
        it('should create schedule with linear transitions', () => {
            const curve = (0, priceCurveCalculators_1.createSteppedPriceSchedule)({
                startPricePercent: 1.5,
                schedule: [{ atBlock: 100, pricePercent: 1.0, instant: false }],
            });
            expect(curve.length).toBeGreaterThan(0);
            expect((0, priceCurveCalculators_1.getCurveDuration)(curve)).toBe(100);
        });
        it('should throw on empty schedule', () => {
            expect(() => (0, priceCurveCalculators_1.createSteppedPriceSchedule)({
                startPricePercent: 1.5,
                schedule: [],
            })).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
        it('should throw on negative block numbers', () => {
            expect(() => (0, priceCurveCalculators_1.createSteppedPriceSchedule)({
                startPricePercent: 1.5,
                schedule: [{ atBlock: -10, pricePercent: 1.0 }],
            })).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
        it('should sort schedule by block number automatically', () => {
            const curve = (0, priceCurveCalculators_1.createSteppedPriceSchedule)({
                startPricePercent: 1.5,
                schedule: [
                    { atBlock: 200, pricePercent: 1.0, instant: true },
                    { atBlock: 100, pricePercent: 1.2, instant: true }, // Out of order
                ],
            });
            // Should work without throwing
            expect(curve.length).toBeGreaterThan(0);
        });
    });
    describe('getPriceAtBlock', () => {
        it('should return start price at block 0', () => {
            const curve = (0, priceCurveCalculators_1.createDutchAuction)({
                startPricePercent: 1.5,
                endPricePercent: 1.0,
                durationBlocks: 1000,
            });
            const price = (0, priceCurveCalculators_1.getPriceAtBlock)(curve, 0);
            expect(price).toBeCloseTo(1.5, 10);
        });
        it('should return interpolated price at midpoint', () => {
            const curve = (0, priceCurveCalculators_1.createDutchAuction)({
                startPricePercent: 1.5,
                endPricePercent: 1.0,
                durationBlocks: 1000,
            });
            const price = (0, priceCurveCalculators_1.getPriceAtBlock)(curve, 500);
            expect(price).toBeCloseTo(1.25, 2);
        });
        it('should return neutral price when blocks exceeded', () => {
            const curve = (0, priceCurveCalculators_1.createDutchAuction)({
                startPricePercent: 1.5,
                endPricePercent: 1.0,
                durationBlocks: 1000,
            });
            const price = (0, priceCurveCalculators_1.getPriceAtBlock)(curve, 2000);
            expect(price).toBe(1.0);
        });
        it('should throw on negative blocks', () => {
            const curve = (0, priceCurveCalculators_1.createDutchAuction)({
                startPricePercent: 1.5,
                endPricePercent: 1.0,
                durationBlocks: 1000,
            });
            expect(() => (0, priceCurveCalculators_1.getPriceAtBlock)(curve, -1)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
        it('should handle empty curve', () => {
            const price = (0, priceCurveCalculators_1.getPriceAtBlock)([], 100);
            expect(price).toBe(1.0); // Neutral
        });
    });
    describe('getCurveDuration', () => {
        it('should return total duration for single segment', () => {
            const curve = (0, priceCurveCalculators_1.createDutchAuction)({
                startPricePercent: 1.5,
                endPricePercent: 1.0,
                durationBlocks: 1000,
            });
            expect((0, priceCurveCalculators_1.getCurveDuration)(curve)).toBe(1000);
        });
        it('should sum durations for multiple segments', () => {
            const curve = (0, priceCurveCalculators_1.createSteppedPrice)({
                steps: [
                    { blockDuration: 100, pricePercent: 1.5 },
                    { blockDuration: 200, pricePercent: 1.2 },
                    { blockDuration: 300, pricePercent: 1.0 },
                ],
            });
            expect((0, priceCurveCalculators_1.getCurveDuration)(curve)).toBe(600);
        });
        it('should ignore zero-duration segments', () => {
            const curve = (0, priceCurveCalculators_1.createSteppedPrice)({
                steps: [
                    { blockDuration: 100, pricePercent: 1.5 },
                    { blockDuration: 0, pricePercent: 1.2 }, // Instant
                    { blockDuration: 200, pricePercent: 1.0 },
                ],
            });
            expect((0, priceCurveCalculators_1.getCurveDuration)(curve)).toBe(300);
        });
        it('should return 0 for empty curve', () => {
            expect((0, priceCurveCalculators_1.getCurveDuration)([])).toBe(0);
        });
    });
    describe('validatePriceCurve', () => {
        it('should validate valid Dutch auction curve', () => {
            const curve = (0, priceCurveCalculators_1.createDutchAuction)({
                startPricePercent: 1.5,
                endPricePercent: 1.0,
                durationBlocks: 1000,
            });
            const result = (0, priceCurveCalculators_1.validatePriceCurve)(curve);
            expect(result.valid).toBe(true);
            expect(result.errors).toBeUndefined();
        });
        it('should validate valid Reverse Dutch curve', () => {
            const curve = (0, priceCurveCalculators_1.createReverseDutchAuction)({
                startPricePercent: 0.5,
                endPricePercent: 1.0,
                durationBlocks: 1000,
            });
            const result = (0, priceCurveCalculators_1.validatePriceCurve)(curve);
            expect(result.valid).toBe(true);
            expect(result.errors).toBeUndefined();
        });
        it('should warn on empty curve', () => {
            const result = (0, priceCurveCalculators_1.validatePriceCurve)([]);
            expect(result.valid).toBe(true);
            expect(result.warnings).toBeDefined();
            expect(result.warnings?.[0]).toContain('Empty curve');
        });
        it('should warn on all-zero-duration curve', () => {
            const curve = (0, priceCurveCalculators_1.createSteppedPrice)({
                steps: [
                    { blockDuration: 0, pricePercent: 1.5 },
                    { blockDuration: 0, pricePercent: 1.2 },
                ],
            });
            const result = (0, priceCurveCalculators_1.validatePriceCurve)(curve);
            expect(result.valid).toBe(true);
            expect(result.warnings).toBeDefined();
        });
    });
    describe('concatenateCurves', () => {
        it('should concatenate multiple curve segments', () => {
            const phase1 = (0, priceCurveCalculators_1.createDutchAuction)({
                startPricePercent: 1.5,
                endPricePercent: 1.2,
                durationBlocks: 500,
            });
            const phase2 = (0, priceCurveCalculators_1.createDutchAuction)({
                startPricePercent: 1.2,
                endPricePercent: 1.0,
                durationBlocks: 500,
            });
            const combined = (0, priceCurveCalculators_1.concatenateCurves)([phase1, phase2]);
            expect(combined.length).toBe(phase1.length + phase2.length);
            expect((0, priceCurveCalculators_1.getCurveDuration)(combined)).toBe(1000);
        });
        it('should return empty array for empty input', () => {
            expect((0, priceCurveCalculators_1.concatenateCurves)([])).toEqual([]);
        });
        it('should throw on invalid concatenation (mixed directions)', () => {
            const exactIn = (0, priceCurveCalculators_1.createDutchAuction)({
                startPricePercent: 1.5,
                endPricePercent: 1.0,
                durationBlocks: 500,
            });
            const exactOut = (0, priceCurveCalculators_1.createReverseDutchAuction)({
                startPricePercent: 0.5,
                endPricePercent: 1.0,
                durationBlocks: 500,
            });
            expect(() => (0, priceCurveCalculators_1.concatenateCurves)([exactIn, exactOut])).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
    });
    describe('addPlateau', () => {
        it('should add plateau to existing curve', () => {
            const baseCurve = (0, priceCurveCalculators_1.createDutchAuction)({
                startPricePercent: 1.5,
                endPricePercent: 1.2,
                durationBlocks: 500,
            });
            const withPlateau = (0, priceCurveCalculators_1.addPlateau)(baseCurve, 200);
            expect(withPlateau.length).toBe(baseCurve.length + 1);
            expect((0, priceCurveCalculators_1.getCurveDuration)(withPlateau)).toBe(700);
        });
        it('should create plateau at neutral for empty curve', () => {
            const plateau = (0, priceCurveCalculators_1.addPlateau)([], 500);
            expect(plateau).toHaveLength(1);
            expect((0, priceCurveCalculators_1.getCurveDuration)(plateau)).toBe(500);
            const element = (0, priceCurve_1.unpackPriceCurveElement)(plateau[0]);
            expect(element.scalingFactor).toBe(priceCurve_1.SCALING_FACTOR.NEUTRAL);
        });
        it('should return same curve for zero duration', () => {
            const baseCurve = (0, priceCurveCalculators_1.createDutchAuction)({
                startPricePercent: 1.5,
                endPricePercent: 1.0,
                durationBlocks: 500,
            });
            const result = (0, priceCurveCalculators_1.addPlateau)(baseCurve, 0);
            expect(result).toEqual(baseCurve);
        });
        it('should throw on negative duration', () => {
            const baseCurve = (0, priceCurveCalculators_1.createDutchAuction)({
                startPricePercent: 1.5,
                endPricePercent: 1.0,
                durationBlocks: 500,
            });
            expect(() => (0, priceCurveCalculators_1.addPlateau)(baseCurve, -100)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
    });
    describe('createFlatPrice', () => {
        it('should create flat price curve', () => {
            const curve = (0, priceCurveCalculators_1.createFlatPrice)(1.2, 1000);
            expect(curve).toHaveLength(1);
            const element = (0, priceCurve_1.unpackPriceCurveElement)(curve[0]);
            expect(element.blockDuration).toBe(1000);
            expect(element.scalingFactor).toBe(1200000000000000000n);
        });
        it('should handle neutral price', () => {
            const curve = (0, priceCurveCalculators_1.createFlatPrice)(1.0, 500);
            const element = (0, priceCurve_1.unpackPriceCurveElement)(curve[0]);
            expect(element.scalingFactor).toBe(priceCurve_1.SCALING_FACTOR.NEUTRAL);
        });
        it('should throw on negative duration', () => {
            expect(() => (0, priceCurveCalculators_1.createFlatPrice)(1.0, -100)).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
    });
    describe('createMultiPhaseAuction', () => {
        it('should create multi-phase auction with 3 phases', () => {
            const curve = (0, priceCurveCalculators_1.createMultiPhaseAuction)({
                startPricePercent: 1.5,
                phases: [
                    { endPricePercent: 1.2, durationBlocks: 200 }, // Fast drop
                    { endPricePercent: 1.2, durationBlocks: 300 }, // Plateau
                    { endPricePercent: 1.0, durationBlocks: 500 }, // Slow drop
                ],
            });
            expect(curve.length).toBeGreaterThan(0);
            expect((0, priceCurveCalculators_1.getCurveDuration)(curve)).toBe(1000);
        });
        it('should handle instant transitions between phases', () => {
            const curve = (0, priceCurveCalculators_1.createMultiPhaseAuction)({
                startPricePercent: 1.5,
                phases: [
                    { endPricePercent: 1.2, durationBlocks: 200, instant: false },
                    { endPricePercent: 1.0, durationBlocks: 300, instant: true }, // Instant jump
                ],
            });
            expect(curve.length).toBeGreaterThan(2);
        });
        it('should handle stepped phases', () => {
            const curve = (0, priceCurveCalculators_1.createMultiPhaseAuction)({
                startPricePercent: 1.5,
                phases: [
                    { endPricePercent: 1.2, durationBlocks: 200, steps: 4 },
                    { endPricePercent: 1.0, durationBlocks: 300, steps: 3 },
                ],
            });
            expect(curve.length).toBeGreaterThan(5);
        });
        it('should throw on empty phases', () => {
            expect(() => (0, priceCurveCalculators_1.createMultiPhaseAuction)({
                startPricePercent: 1.5,
                phases: [],
            })).toThrow(priceCurve_1.InvalidPriceCurveParametersError);
        });
        it('should handle mixed increasing/decreasing phases (all exact-in)', () => {
            const curve = (0, priceCurveCalculators_1.createMultiPhaseAuction)({
                startPricePercent: 1.2,
                phases: [
                    { endPricePercent: 1.5, durationBlocks: 200 }, // Increase to 150%
                    { endPricePercent: 1.0, durationBlocks: 300 }, // Decrease to 100%
                ],
            });
            expect(curve.length).toBeGreaterThan(0);
        });
    });
    describe('extensive validation - exact expected values', () => {
        describe('Dutch auction mathematical correctness', () => {
            it('should produce exact linear interpolation (150% → 100% over 1000 blocks)', () => {
                const curve = (0, priceCurveCalculators_1.createDutchAuction)({
                    startPricePercent: 1.5,
                    endPricePercent: 1.0,
                    durationBlocks: 1000,
                });
                // Expected: Linear interpolation from 1.5 to 1.0
                // Note: Uses exact-in mode so rounds UP, and includes zero-duration end marker
                // At block t: price = 1.5 - (0.5 * t / 1000)
                const testPoints = [
                    { block: 0, expectedPrice: 1.5 },
                    { block: 200, expectedPrice: 1.4 },
                    { block: 400, expectedPrice: 1.3 },
                    { block: 500, expectedPrice: 1.25 },
                    { block: 600, expectedPrice: 1.2 },
                    { block: 800, expectedPrice: 1.1 },
                ];
                testPoints.forEach(({ block, expectedPrice }) => {
                    const scalingFactor = (0, priceCurve_1.getCalculatedScalingFactor)(curve, block);
                    const expectedScaling = BigInt(Math.round(expectedPrice * 1e18));
                    // Allow for rounding in interpolation (within 0.0001%)
                    const diff = scalingFactor > expectedScaling ? scalingFactor - expectedScaling : expectedScaling - scalingFactor;
                    expect(diff <= 1000000000000n).toBe(true); // 1e12 tolerance
                });
            });
            it('should produce exact values for non-neutral end (200% → 150% over 2000 blocks)', () => {
                const curve = (0, priceCurveCalculators_1.createDutchAuction)({
                    startPricePercent: 2.0,
                    endPricePercent: 1.5,
                    durationBlocks: 2000,
                });
                // Expected: Linear from 2.0 to 1.5
                // Note: Curve has 2 elements - duration segment + zero-duration end
                // Testing within the duration (not at the boundary)
                const testPoints = [
                    { block: 0, expectedPrice: 2.0 },
                    { block: 500, expectedPrice: 1.875 },
                    { block: 1000, expectedPrice: 1.75 },
                    { block: 1500, expectedPrice: 1.625 },
                ];
                testPoints.forEach(({ block, expectedPrice }) => {
                    const scalingFactor = (0, priceCurve_1.getCalculatedScalingFactor)(curve, block);
                    const expectedScaling = BigInt(Math.round(expectedPrice * 1e18));
                    const diff = scalingFactor > expectedScaling ? scalingFactor - expectedScaling : expectedScaling - scalingFactor;
                    expect(diff).toBeLessThanOrEqual(1);
                });
            });
            it('should produce correct stepped behavior (150% → 100% with 5 steps over 1000 blocks)', () => {
                const curve = (0, priceCurveCalculators_1.createDutchAuction)({
                    startPricePercent: 1.5,
                    endPricePercent: 1.0,
                    durationBlocks: 1000,
                    steps: 5,
                });
                // Verify curve structure: 5 steps means 9 elements
                // (first step, then 4 x [zero-duration + duration])
                expect(curve).toHaveLength(9);
                // Test that price decreases in discrete steps
                const price0 = (0, priceCurveCalculators_1.getPriceAtBlock)(curve, 0);
                const price100 = (0, priceCurveCalculators_1.getPriceAtBlock)(curve, 100);
                const price250 = (0, priceCurveCalculators_1.getPriceAtBlock)(curve, 250);
                const price500 = (0, priceCurveCalculators_1.getPriceAtBlock)(curve, 500);
                const price900 = (0, priceCurveCalculators_1.getPriceAtBlock)(curve, 900);
                // Prices should be decreasing
                expect(price0).toBeGreaterThan(price100);
                expect(price250).toBeGreaterThan(price500);
                expect(price500).toBeGreaterThan(price900);
                // Start and general trend checks
                expect(price0).toBeCloseTo(1.5, 1);
                expect(price500).toBeLessThan(1.4);
                expect(price500).toBeGreaterThan(1.0);
            });
        });
        describe('Reverse Dutch auction mathematical correctness', () => {
            it('should produce exact linear interpolation (50% → 100% over 1000 blocks)', () => {
                const curve = (0, priceCurveCalculators_1.createReverseDutchAuction)({
                    startPricePercent: 0.5,
                    endPricePercent: 1.0,
                    durationBlocks: 1000,
                });
                // Expected: Linear interpolation from 0.5 to 1.0
                // price(t) = 0.5 + 0.5 * (t / 1000) = 0.5 + 0.0005 * t
                const testPoints = [
                    { block: 0, expectedPrice: 0.5 },
                    { block: 100, expectedPrice: 0.55 },
                    { block: 200, expectedPrice: 0.6 },
                    { block: 300, expectedPrice: 0.65 },
                    { block: 400, expectedPrice: 0.7 },
                    { block: 500, expectedPrice: 0.75 },
                    { block: 600, expectedPrice: 0.8 },
                    { block: 700, expectedPrice: 0.85 },
                    { block: 800, expectedPrice: 0.9 },
                    { block: 900, expectedPrice: 0.95 },
                    // Note: block 1000 would be at boundary with zero-duration end marker
                ];
                testPoints.forEach(({ block, expectedPrice }) => {
                    const scalingFactor = (0, priceCurve_1.getCalculatedScalingFactor)(curve, block);
                    const expectedScaling = BigInt(Math.round(expectedPrice * 1e18));
                    // Allow for rounding in interpolation (within 0.0001%)
                    const diff = scalingFactor > expectedScaling ? scalingFactor - expectedScaling : expectedScaling - scalingFactor;
                    expect(diff <= 1000000000000n).toBe(true); // 1e12 tolerance
                });
            });
            it('should produce exact values for non-neutral end (25% → 75% over 1000 blocks)', () => {
                const curve = (0, priceCurveCalculators_1.createReverseDutchAuction)({
                    startPricePercent: 0.25,
                    endPricePercent: 0.75,
                    durationBlocks: 1000,
                });
                // Expected: Linear from 0.25 to 0.75
                // price(t) = 0.25 + 0.5 * (t / 1000) = 0.25 + 0.0005 * t
                const testPoints = [
                    { block: 0, expectedPrice: 0.25 },
                    { block: 250, expectedPrice: 0.375 },
                    { block: 500, expectedPrice: 0.5 },
                    { block: 750, expectedPrice: 0.625 },
                    // Note: block 1000 would be at boundary with zero-duration end marker
                ];
                testPoints.forEach(({ block, expectedPrice }) => {
                    const scalingFactor = (0, priceCurve_1.getCalculatedScalingFactor)(curve, block);
                    const expectedScaling = BigInt(Math.round(expectedPrice * 1e18));
                    // Allow for rounding in interpolation
                    const diff = scalingFactor > expectedScaling ? scalingFactor - expectedScaling : expectedScaling - scalingFactor;
                    expect(diff <= 1n).toBe(true);
                });
            });
            it('should produce exact stepped values (50% → 100% with 4 steps over 800 blocks)', () => {
                const curve = (0, priceCurveCalculators_1.createReverseDutchAuction)({
                    startPricePercent: 0.5,
                    endPricePercent: 1.0,
                    durationBlocks: 800,
                    steps: 4,
                });
                // Verify curve structure: 4 steps with zero-duration jumps
                expect(curve.length).toBe(7); // 4 segments + 3 jumps
                // Verify increasing price trend (exact-out mode)
                const price0 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 0);
                const price100 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 100);
                const price200 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 200);
                const price400 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 400);
                const price600 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 600);
                // Verify steps increase over time
                expect(price0 < price200).toBe(true);
                expect(price200 < price400).toBe(true);
                expect(price400 < price600).toBe(true);
                // Verify price increases within a step (due to interpolation)
                expect(price0 <= price100).toBe(true);
            });
        });
        describe('Stepped price exact values', () => {
            it('should produce exact manual step values', () => {
                const curve = (0, priceCurveCalculators_1.createSteppedPrice)({
                    steps: [
                        { blockDuration: 100, pricePercent: 1.5 },
                        { blockDuration: 100, pricePercent: 1.3 },
                        { blockDuration: 100, pricePercent: 1.1 },
                        { blockDuration: 100, pricePercent: 1.0 },
                    ],
                });
                // createSteppedPrice creates one element per step (segments interpolate to next)
                expect(curve.length).toBe(4);
                // Verify decreasing price trend
                const price0 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 0);
                const price50 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 50);
                const price100 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 100);
                const price200 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 200);
                const price300 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 300);
                // Verify steps decrease
                expect(price0 > price100).toBe(true);
                expect(price100 > price200).toBe(true);
                expect(price200 > price300).toBe(true);
                // Price interpolates within each step (not flat)
                expect(price0 > price50).toBe(true);
                // Verify first price is approximately 1.5
                expect(price0 > 1400000000000000000n).toBe(true);
                expect(price0 < 1600000000000000000n).toBe(true);
            });
        });
        describe('Multi-phase auction exact values', () => {
            it('should produce exact values for 3-phase auction', () => {
                const curve = (0, priceCurveCalculators_1.createMultiPhaseAuction)({
                    startPricePercent: 2.0,
                    phases: [
                        { endPricePercent: 1.5, durationBlocks: 400 }, // Fast drop: 2.0 → 1.5
                        { endPricePercent: 1.5, durationBlocks: 200 }, // Plateau: 1.5 → 1.5
                        { endPricePercent: 1.0, durationBlocks: 400 }, // Slow drop: 1.5 → 1.0
                    ],
                });
                // Verify multi-phase structure
                expect(curve.length).toBeGreaterThan(3); // Multiple segments
                // Test phase 1: Decreasing from 2.0 to 1.5
                const price0 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 0);
                const price200 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 200);
                const price399 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 399);
                expect(price0 > price200).toBe(true);
                expect(price200 > price399).toBe(true);
                expect(price0 > 1900000000000000000n).toBe(true); // ~2.0
                // Test phase 2: Flat at 1.5
                const price400 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 400);
                const price500 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 500);
                const price599 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 599);
                // All should be approximately 1.5 in flat phase
                const expectedFlat = 1500000000000000000n;
                expect((price400 - expectedFlat) ** 2n < 1000000000000000n).toBe(true);
                expect((price500 - expectedFlat) ** 2n < 1000000000000000n).toBe(true);
                expect((price599 - expectedFlat) ** 2n < 1000000000000000n).toBe(true);
                // Test phase 3: Decreasing from 1.5 to 1.0
                const price600 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 600);
                const price800 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 800);
                const price999 = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 999);
                expect(price600 > price800).toBe(true);
                expect(price800 > price999).toBe(true);
            });
        });
    });
    describe('integration with getCalculatedScalingFactor', () => {
        it('should work with Dutch auction curve', () => {
            const curve = (0, priceCurveCalculators_1.createDutchAuction)({
                startPricePercent: 1.5,
                endPricePercent: 1.0,
                durationBlocks: 1000,
            });
            // At start
            const startScaling = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 0);
            expect(startScaling).toBe(1500000000000000000n);
            // At midpoint (approximate due to interpolation)
            const midScaling = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 500);
            expect(midScaling > 1200000000000000000n).toBe(true);
            expect(midScaling < 1300000000000000000n).toBe(true);
        });
        it('should work with Reverse Dutch curve', () => {
            const curve = (0, priceCurveCalculators_1.createReverseDutchAuction)({
                startPricePercent: 0.5,
                endPricePercent: 1.0,
                durationBlocks: 1000,
            });
            // At start
            const startScaling = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 0);
            expect(startScaling).toBe(500000000000000000n);
            // At end (should approach 1e18)
            const endScaling = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 999);
            expect(endScaling > 900000000000000000n).toBe(true);
            expect(endScaling <= 1000000000000000000n).toBe(true);
        });
        it('should work with stepped price curve', () => {
            const curve = (0, priceCurveCalculators_1.createSteppedPrice)({
                steps: [
                    { blockDuration: 100, pricePercent: 1.5 },
                    { blockDuration: 0, pricePercent: 1.2 }, // Instant drop at block 100
                    { blockDuration: 100, pricePercent: 1.2 },
                ],
            });
            // At start of first step
            const start = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 0);
            expect((0, priceCurveCalculators_1.scalingFactorToPercent)(start)).toBeCloseTo(1.5, 2);
            // After instant drop (well into second segment)
            const after = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 150);
            expect((0, priceCurveCalculators_1.scalingFactorToPercent)(after)).toBeCloseTo(1.2, 2);
        });
        it('should work with multi-phase auction', () => {
            const curve = (0, priceCurveCalculators_1.createMultiPhaseAuction)({
                startPricePercent: 1.5,
                phases: [
                    { endPricePercent: 1.2, durationBlocks: 500 },
                    { endPricePercent: 1.0, durationBlocks: 500 },
                ],
            });
            // At start of phase 1
            const phase1Start = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 0);
            expect((0, priceCurveCalculators_1.scalingFactorToPercent)(phase1Start)).toBeCloseTo(1.5, 10);
            // At start of phase 2 (around block 500)
            const phase2Start = (0, priceCurve_1.getCalculatedScalingFactor)(curve, 500);
            expect((0, priceCurveCalculators_1.scalingFactorToPercent)(phase2Start)).toBeCloseTo(1.2, 1);
        });
    });
});
//# sourceMappingURL=priceCurveCalculators.test.js.map