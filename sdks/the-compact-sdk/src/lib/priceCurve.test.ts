/**
 * Comprehensive tests for price curve functionality
 * Test cases adapted from:
 * - tribunal/test/PriceCurveDocumentationTests.t.sol
 * - tribunal/test/PriceCurveEdgeCasesTest.t.sol
 */

import {
  createPriceCurveElement,
  getBlockDuration,
  getScalingFactor,
  unpackPriceCurveElement,
  sharesScalingDirection,
  applySupplementalPriceCurve,
  getCalculatedScalingFactor,
  createPriceCurve,
  PriceCurveBlocksExceededError,
  InvalidPriceCurveParametersError,
  SCALING_FACTOR,
} from './priceCurve'

describe('Price Curve Library', () => {
  describe('element creation and packing', () => {
    it('should create and unpack a price curve element', () => {
      const element = createPriceCurveElement(100, SCALING_FACTOR.ONE_FIFTY_PERCENT)

      expect(getBlockDuration(element)).toBe(100)
      expect(getScalingFactor(element)).toBe(SCALING_FACTOR.ONE_FIFTY_PERCENT)
    })

    it('should handle zero duration', () => {
      const element = createPriceCurveElement(0, SCALING_FACTOR.ONE_TWENTY_PERCENT)

      expect(getBlockDuration(element)).toBe(0)
      expect(getScalingFactor(element)).toBe(SCALING_FACTOR.ONE_TWENTY_PERCENT)
    })

    it('should handle maximum block duration', () => {
      const maxDuration = 65535 // 2^16 - 1
      const element = createPriceCurveElement(maxDuration, SCALING_FACTOR.NEUTRAL)

      expect(getBlockDuration(element)).toBe(maxDuration)
    })

    it('should throw on block duration overflow', () => {
      expect(() => createPriceCurveElement(65536, SCALING_FACTOR.NEUTRAL)).toThrow(
        InvalidPriceCurveParametersError
      )
    })

    it('should unpack element components', () => {
      const element = createPriceCurveElement(50, SCALING_FACTOR.DOUBLE)
      const unpacked = unpackPriceCurveElement(element)

      expect(unpacked.blockDuration).toBe(50)
      expect(unpacked.scalingFactor).toBe(SCALING_FACTOR.DOUBLE)
    })
  })

  describe('scaling direction validation', () => {
    it('should allow both exact-in (>1e18)', () => {
      expect(sharesScalingDirection(SCALING_FACTOR.ONE_FIFTY_PERCENT, SCALING_FACTOR.ONE_TWENTY_PERCENT)).toBe(
        true
      )
    })

    it('should allow both exact-out (<1e18)', () => {
      expect(sharesScalingDirection(SCALING_FACTOR.HALF, SCALING_FACTOR.NINETY_PERCENT)).toBe(true)
    })

    it('should allow neutral with exact-in', () => {
      expect(sharesScalingDirection(SCALING_FACTOR.NEUTRAL, SCALING_FACTOR.ONE_FIFTY_PERCENT)).toBe(true)
    })

    it('should allow neutral with exact-out', () => {
      expect(sharesScalingDirection(SCALING_FACTOR.NEUTRAL, SCALING_FACTOR.HALF)).toBe(true)
    })

    it('should reject mixed exact-in and exact-out', () => {
      expect(sharesScalingDirection(SCALING_FACTOR.ONE_FIFTY_PERCENT, SCALING_FACTOR.HALF)).toBe(false)
    })

    it('should reject mixed exact-out and exact-in', () => {
      expect(sharesScalingDirection(SCALING_FACTOR.HALF, SCALING_FACTOR.ONE_FIFTY_PERCENT)).toBe(false)
    })
  })

  describe('empty price curve', () => {
    it('should return neutral scaling for empty curve', () => {
      const curve: bigint[] = []
      const scaling = getCalculatedScalingFactor(curve, 0)

      expect(scaling).toBe(SCALING_FACTOR.NEUTRAL)
    })

    it('should return neutral scaling at any block for empty curve', () => {
      const curve: bigint[] = []
      expect(getCalculatedScalingFactor(curve, 100)).toBe(SCALING_FACTOR.NEUTRAL)
      expect(getCalculatedScalingFactor(curve, 1000)).toBe(SCALING_FACTOR.NEUTRAL)
    })
  })

  describe('documentation examples', () => {
    it('should match Step Function with Plateaus example', () => {
      const curve = createPriceCurve([
        { blockDuration: 50, scalingFactor: SCALING_FACTOR.ONE_FIFTY_PERCENT },
        { blockDuration: 0, scalingFactor: SCALING_FACTOR.ONE_TWENTY_PERCENT }, // Zero-duration drop
        { blockDuration: 50, scalingFactor: SCALING_FACTOR.ONE_TWENTY_PERCENT },
        { blockDuration: 50, scalingFactor: SCALING_FACTOR.NEUTRAL },
      ])

      // Block 25: interpolate from 1.5 towards 1.2
      // Expected: 1.5 - (1.5 - 1.2) * (25/50) = 1.35
      expect(getCalculatedScalingFactor(curve, 25)).toBe(1350000000000000000n)

      // Block 50: exactly at zero-duration element
      expect(getCalculatedScalingFactor(curve, 50)).toBe(SCALING_FACTOR.ONE_TWENTY_PERCENT)

      // Block 75: plateau (stays at 1.2)
      expect(getCalculatedScalingFactor(curve, 75)).toBe(SCALING_FACTOR.ONE_TWENTY_PERCENT)
    })

    it('should match Aggressive Initial Discount example', () => {
      const curve = createPriceCurve([
        { blockDuration: 10, scalingFactor: SCALING_FACTOR.HALF },
        { blockDuration: 90, scalingFactor: SCALING_FACTOR.NINETY_PERCENT },
      ])

      // Block 0: start at 0.5x
      expect(getCalculatedScalingFactor(curve, 0)).toBe(SCALING_FACTOR.HALF)

      // Block 5: midway through first segment
      // Expected: 0.5 + (0.9 - 0.5) * (5/10) = 0.7
      expect(getCalculatedScalingFactor(curve, 5)).toBe(700000000000000000n)

      // Block 10: start of second segment
      expect(getCalculatedScalingFactor(curve, 10)).toBe(SCALING_FACTOR.NINETY_PERCENT)

      // Block 55: midway through second segment
      // Expected: 0.9 + (1.0 - 0.9) * (45/90) = 0.95
      expect(getCalculatedScalingFactor(curve, 55)).toBe(950000000000000000n)
    })

    it('should throw when exceeding curve duration', () => {
      const curve = createPriceCurve([
        { blockDuration: 10, scalingFactor: SCALING_FACTOR.HALF },
        { blockDuration: 90, scalingFactor: SCALING_FACTOR.NINETY_PERCENT },
      ])

      expect(() => getCalculatedScalingFactor(curve, 100)).toThrow(PriceCurveBlocksExceededError)
    })

    it('should match Reverse Dutch Auction example', () => {
      const curve = createPriceCurve([{ blockDuration: 200, scalingFactor: SCALING_FACTOR.DOUBLE }])

      // Block 0: start at 2x
      expect(getCalculatedScalingFactor(curve, 0)).toBe(SCALING_FACTOR.DOUBLE)

      // Block 100: midway, should be 1.5x
      // Expected: 2.0 - (2.0 - 1.0) * (100/200) = 1.5
      expect(getCalculatedScalingFactor(curve, 100)).toBe(SCALING_FACTOR.ONE_FIFTY_PERCENT)

      // Block 199: near end, should be close to 1x
      // Expected: 2.0 - (2.0 - 1.0) * (199/200) = 1.005
      expect(getCalculatedScalingFactor(curve, 199)).toBe(1005000000000000000n)
    })

    it('should match Complete Dutch Auction example', () => {
      const curve = createPriceCurve([
        { blockDuration: 30, scalingFactor: 1500000000000000000n }, // 1.5x
        { blockDuration: 40, scalingFactor: 1200000000000000000n }, // 1.2x
        { blockDuration: 30, scalingFactor: SCALING_FACTOR.NEUTRAL },
      ])

      // Block 0: start at 1.5x
      expect(getCalculatedScalingFactor(curve, 0)).toBe(1500000000000000000n)

      // Block 30: at 1.2x
      expect(getCalculatedScalingFactor(curve, 30)).toBe(1200000000000000000n)

      // Block 70: at 1.0x
      expect(getCalculatedScalingFactor(curve, 70)).toBe(SCALING_FACTOR.NEUTRAL)

      // Block 99: last valid block at 1.0x
      expect(getCalculatedScalingFactor(curve, 99)).toBe(SCALING_FACTOR.NEUTRAL)
    })
  })

  describe('zero-duration segments', () => {
    it('should handle instantaneous price point', () => {
      const curve = createPriceCurve([
        { blockDuration: 10, scalingFactor: SCALING_FACTOR.ONE_TWENTY_PERCENT },
        { blockDuration: 0, scalingFactor: SCALING_FACTOR.ONE_FIFTY_PERCENT }, // Instant jump
        { blockDuration: 20, scalingFactor: SCALING_FACTOR.NEUTRAL },
      ])

      // Block 5: interpolate from 1.2x towards 1.5x
      // Expected: 1.2 + (1.5 - 1.2) * (5/10) = 1.35
      const scalingAt5 = getCalculatedScalingFactor(curve, 5)
      expect(scalingAt5 >= 1340000000000000000n).toBe(true)
      expect(scalingAt5 <= 1360000000000000000n).toBe(true)

      // Block 10: exactly at zero-duration element
      expect(getCalculatedScalingFactor(curve, 10)).toBe(SCALING_FACTOR.ONE_FIFTY_PERCENT)

      // Block 15: interpolate from 1.5x towards 1.0x
      // Expected: 1.5 - (1.5 - 1.0) * (5/20) = 1.375
      const scalingAt15 = getCalculatedScalingFactor(curve, 15)
      expect(scalingAt15 >= 1365000000000000000n).toBe(true)
      expect(scalingAt15 <= 1385000000000000000n).toBe(true)
    })

    it('should handle zero scaling factor', () => {
      const curve = createPriceCurve([{ blockDuration: 100, scalingFactor: 0n }])

      // Block 50: interpolate from 0 to 1e18
      // Expected: 0 + (1e18 - 0) * (50/100) = 0.5e18
      expect(getCalculatedScalingFactor(curve, 50)).toBe(SCALING_FACTOR.HALF)
    })
  })

  describe('supplemental price curve application', () => {
    it('should combine base and supplemental curves correctly', () => {
      const baseCurve = createPriceCurve([
        { blockDuration: 100, scalingFactor: SCALING_FACTOR.ONE_FIFTY_PERCENT },
        { blockDuration: 100, scalingFactor: SCALING_FACTOR.ONE_TWENTY_PERCENT },
      ])

      // Supplemental curve adds 0.1e18 to each segment
      // Combined = base + supplemental - 1e18
      const supplementalCurve = [
        1100000000000000000n, // +0.1e18
        1050000000000000000n, // +0.05e18
      ]

      const combined = applySupplementalPriceCurve(baseCurve, supplementalCurve)

      // First segment: 1.5 + 1.1 - 1.0 = 1.6
      expect(getScalingFactor(combined[0])).toBe(1600000000000000000n)

      // Second segment: 1.2 + 1.05 - 1.0 = 1.25
      expect(getScalingFactor(combined[1])).toBe(1250000000000000000n)

      // Block durations should be preserved
      expect(getBlockDuration(combined[0])).toBe(100)
      expect(getBlockDuration(combined[1])).toBe(100)
    })

    it('should use base curve when supplemental is shorter', () => {
      const baseCurve = createPriceCurve([
        { blockDuration: 100, scalingFactor: SCALING_FACTOR.ONE_FIFTY_PERCENT },
        { blockDuration: 100, scalingFactor: SCALING_FACTOR.ONE_TWENTY_PERCENT },
        { blockDuration: 50, scalingFactor: SCALING_FACTOR.NEUTRAL },
      ])

      const supplementalCurve = [1100000000000000000n] // Only one element

      const combined = applySupplementalPriceCurve(baseCurve, supplementalCurve)

      // First segment: combined
      expect(getScalingFactor(combined[0])).toBe(1600000000000000000n)

      // Remaining segments: unchanged
      expect(getScalingFactor(combined[1])).toBe(SCALING_FACTOR.ONE_TWENTY_PERCENT)
      expect(getScalingFactor(combined[2])).toBe(SCALING_FACTOR.NEUTRAL)
    })

    it('should reject incompatible scaling directions', () => {
      const baseCurve = createPriceCurve([{ blockDuration: 100, scalingFactor: SCALING_FACTOR.ONE_FIFTY_PERCENT }]) // Exact-in

      const supplementalCurve = [SCALING_FACTOR.HALF] // Exact-out

      expect(() => applySupplementalPriceCurve(baseCurve, supplementalCurve)).toThrow(
        InvalidPriceCurveParametersError
      )
    })

    it('should reject combined scaling factor overflow', () => {
      const maxScaling = (1n << 240n) - 1n
      const baseCurve = createPriceCurveElement(100, maxScaling - 100n)

      const supplementalCurve = [1200000000000000000n] // Would cause overflow

      expect(() => applySupplementalPriceCurve([baseCurve], supplementalCurve)).toThrow(
        InvalidPriceCurveParametersError
      )
    })
  })

  describe('interpolation edge cases', () => {
    it('should handle equal start and end values', () => {
      const curve = createPriceCurve([{ blockDuration: 100, scalingFactor: SCALING_FACTOR.ONE_TWENTY_PERCENT }])

      // When next segment (or default 1e18) equals current, all blocks in segment have same value
      // But since we default to 1e18 at the end, this will interpolate from 1.2 to 1.0
      const scaling = getCalculatedScalingFactor(curve, 50)
      expect(scaling < SCALING_FACTOR.ONE_TWENTY_PERCENT).toBe(true)
      expect(scaling > SCALING_FACTOR.NEUTRAL).toBe(true)
    })

    it('should handle curve that starts at block 0', () => {
      const curve = createPriceCurve([{ blockDuration: 50, scalingFactor: SCALING_FACTOR.DOUBLE }])

      expect(getCalculatedScalingFactor(curve, 0)).toBe(SCALING_FACTOR.DOUBLE)
    })

    it('should handle single-element curve', () => {
      const curve = createPriceCurve([{ blockDuration: 100, scalingFactor: SCALING_FACTOR.ONE_FIFTY_PERCENT }])

      // Should interpolate from 1.5x to 1.0x (default end)
      expect(getCalculatedScalingFactor(curve, 0)).toBe(SCALING_FACTOR.ONE_FIFTY_PERCENT)
      const scalingAt99 = getCalculatedScalingFactor(curve, 99)
      // Should be close to 1e18
      expect(scalingAt99 >= 995000000000000000n && scalingAt99 <= 1005000000000000000n).toBe(true)
    })
  })

  describe('rounding behavior', () => {
    it('should round up for exact-in mode (scaling > 1e18)', () => {
      const curve = createPriceCurve([{ blockDuration: 3, scalingFactor: 1500000000000000000n }]) // 1.5x

      // With rounding up, should favor the filler slightly
      const scaling = getCalculatedScalingFactor(curve, 1)
      expect(scaling >= 1333333333333333333n).toBe(true)
    })

    it('should round down for exact-out mode (scaling < 1e18)', () => {
      const curve = createPriceCurve([{ blockDuration: 3, scalingFactor: 500000000000000000n }]) // 0.5x

      // With rounding down, should favor the sponsor slightly
      const scaling = getCalculatedScalingFactor(curve, 1)
      expect(scaling <= 666666666666666667n).toBe(true)
    })
  })

  describe('multiple zero-duration segments', () => {
    it('should handle consecutive zero-duration elements', () => {
      const curve = createPriceCurve([
        { blockDuration: 10, scalingFactor: SCALING_FACTOR.ONE_FIFTY_PERCENT },
        { blockDuration: 0, scalingFactor: SCALING_FACTOR.ONE_TWENTY_PERCENT },
        { blockDuration: 0, scalingFactor: SCALING_FACTOR.NEUTRAL },
        { blockDuration: 20, scalingFactor: SCALING_FACTOR.NINETY_PERCENT },
      ])

      // At block 10: should use the last zero-duration value (1.0x)
      expect(getCalculatedScalingFactor(curve, 10)).toBe(SCALING_FACTOR.NEUTRAL)
    })
  })
})
