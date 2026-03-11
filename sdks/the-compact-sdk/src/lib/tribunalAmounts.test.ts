/**
 * Tests for Tribunal amount derivation utilities
 */

import { describe, it, expect } from '@jest/globals'

import {
  BASE_SCALING_FACTOR,
  deriveAmounts,
  deriveAmountsFromComponents,
  calculatePriorityFeeAboveBaseline,
  estimateFillAmounts,
} from './tribunalAmounts'
import { createPriceCurveElement as packElement } from './priceCurve'

describe('Tribunal Amount Derivation', () => {
  const testCommitments = [
    {
      lockTag: '0x000000000000000000000001' as const,
      token: '0x0000000000000000000000000000000000000001' as const,
      amount: 1000000000000000000n, // 1e18
    },
  ]

  describe('BASE_SCALING_FACTOR', () => {
    it('equals 1e18', () => {
      expect(BASE_SCALING_FACTOR).toBe(1000000000000000000n)
    })
  })

  describe('calculatePriorityFeeAboveBaseline', () => {
    it('returns 0 when priority fee is below baseline', () => {
      const result = calculatePriorityFeeAboveBaseline(100n, 200n)
      expect(result).toBe(0n)
    })

    it('returns difference when priority fee exceeds baseline', () => {
      const result = calculatePriorityFeeAboveBaseline(300n, 100n)
      expect(result).toBe(200n)
    })

    it('returns 0 when priority fee equals baseline', () => {
      const result = calculatePriorityFeeAboveBaseline(100n, 100n)
      expect(result).toBe(0n)
    })
  })

  describe('deriveAmounts', () => {
    it('returns correct amounts with no price curve (neutral)', () => {
      const result = deriveAmounts({
        maximumClaimAmounts: testCommitments,
        priceCurve: [],
        targetBlock: 0n,
        fillBlock: 12345n,
        minimumFillAmount: 500000000000000000n, // 0.5e18
        baselinePriorityFee: 0n,
        scalingFactor: BASE_SCALING_FACTOR,
        priorityFeeAboveBaseline: 0n,
      })

      // Neutral scaling: fill amount = minimum, claim amounts = maximum
      expect(result.fillAmount).toBe(500000000000000000n)
      expect(result.claimAmounts).toHaveLength(1)
      expect(result.claimAmounts[0]).toBe(1000000000000000000n)
    })

    it('throws InvalidTargetBlockDesignationError when curve provided but targetBlock is 0', () => {
      const priceCurve = [packElement(10, BASE_SCALING_FACTOR)]

      expect(() =>
        deriveAmounts({
          maximumClaimAmounts: testCommitments,
          priceCurve,
          targetBlock: 0n,
          fillBlock: 12345n,
          minimumFillAmount: 500000000000000000n,
          baselinePriorityFee: 0n,
          scalingFactor: BASE_SCALING_FACTOR,
          priorityFeeAboveBaseline: 0n,
        })
      ).toThrow('Price curve provided but targetBlock is 0')
    })

    it('throws InvalidTargetBlockError when targetBlock exceeds fillBlock', () => {
      expect(() =>
        deriveAmounts({
          maximumClaimAmounts: testCommitments,
          priceCurve: [],
          targetBlock: 20000n,
          fillBlock: 12345n,
          minimumFillAmount: 500000000000000000n,
          baselinePriorityFee: 0n,
          scalingFactor: BASE_SCALING_FACTOR,
          priorityFeeAboveBaseline: 0n,
        })
      ).toThrow('Invalid target block')
    })
  })

  describe('deriveAmountsFromComponents', () => {
    const testComponents = [
      {
        fillToken: '0x0000000000000000000000000000000000000001' as const,
        minimumFillAmount: 500000000000000000n,
        recipient: '0x0000000000000000000000000000000000000002' as const,
        applyScaling: true,
      },
    ]

    it('returns correct amounts with no scaling', () => {
      const result = deriveAmountsFromComponents({
        maximumClaimAmounts: testCommitments,
        components: testComponents,
        priceCurve: [],
        supplementalPriceCurve: [],
        targetBlock: 0n,
        fillBlock: 12345n,
        baselinePriorityFee: 0n,
        scalingFactor: BASE_SCALING_FACTOR,
        priorityFeeAboveBaseline: 0n,
      })

      expect(result.fillAmounts).toHaveLength(1)
      expect(result.claimAmounts).toHaveLength(1)
      expect(result.scalingMultiplier).toBe(BASE_SCALING_FACTOR)
      expect(result.useExactIn).toBe(true)
    })

    it('applies scaling correctly in exact-in mode', () => {
      // scaling > 1e18 = exact-in mode
      const scalingFactor = 1500000000000000000n // 1.5e18

      const result = deriveAmountsFromComponents({
        maximumClaimAmounts: testCommitments,
        components: testComponents,
        priceCurve: [],
        supplementalPriceCurve: [],
        targetBlock: 0n,
        fillBlock: 12345n,
        baselinePriorityFee: 0n,
        scalingFactor,
        priorityFeeAboveBaseline: 0n,
      })

      expect(result.useExactIn).toBe(true)
      // In exact-in, fill amounts increase, claim amounts stay at maximum
      expect(result.claimAmounts[0]).toBe(testCommitments[0].amount)
    })

    it('applies scaling correctly in exact-out mode', () => {
      // scaling < 1e18 = exact-out mode
      const scalingFactor = 500000000000000000n // 0.5e18

      const result = deriveAmountsFromComponents({
        maximumClaimAmounts: testCommitments,
        components: testComponents,
        priceCurve: [],
        supplementalPriceCurve: [],
        targetBlock: 0n,
        fillBlock: 12345n,
        baselinePriorityFee: 0n,
        scalingFactor,
        priorityFeeAboveBaseline: 0n,
      })

      expect(result.useExactIn).toBe(false)
      // In exact-out, fill amounts stay at minimum, claim amounts decrease
      expect(result.fillAmounts[0]).toBe(testComponents[0].minimumFillAmount)
    })

    it('handles components with applyScaling=false', () => {
      const nonScalingComponents = [
        {
          fillToken: '0x0000000000000000000000000000000000000001' as const,
          minimumFillAmount: 500000000000000000n,
          recipient: '0x0000000000000000000000000000000000000002' as const,
          applyScaling: false,
        },
      ]

      const scalingFactor = 1500000000000000000n // 1.5e18

      const result = deriveAmountsFromComponents({
        maximumClaimAmounts: testCommitments,
        components: nonScalingComponents,
        priceCurve: [],
        supplementalPriceCurve: [],
        targetBlock: 0n,
        fillBlock: 12345n,
        baselinePriorityFee: 0n,
        scalingFactor,
        priorityFeeAboveBaseline: 0n,
      })

      // Non-scaling components should not have fill amounts scaled
      expect(result.fillAmounts[0]).toBe(nonScalingComponents[0].minimumFillAmount)
    })

    it('applies supplemental price curve', () => {
      // Base curve: start at 1e18, stays flat for 100 blocks
      const baseCurve = [packElement(100, BASE_SCALING_FACTOR)]
      // Supplemental curve: array of raw scaling factors
      // Formula is: combined = base + supplemental - 1e18
      // So supplemental of 1.1e18 + base of 1e18 - 1e18 = 1.1e18
      const supplementalCurve = [1100000000000000000n]

      const result = deriveAmountsFromComponents({
        maximumClaimAmounts: testCommitments,
        components: testComponents,
        priceCurve: baseCurve,
        supplementalPriceCurve: supplementalCurve,
        targetBlock: 12340n,
        fillBlock: 12345n, // 5 blocks passed
        baselinePriorityFee: 0n,
        scalingFactor: BASE_SCALING_FACTOR,
        priorityFeeAboveBaseline: 0n,
      })

      // Should have a scaling multiplier >= 1e18 after combining curves
      expect(result.scalingMultiplier >= BASE_SCALING_FACTOR).toBe(true)
    })
  })

  describe('estimateFillAmounts', () => {
    const testComponents = [
      {
        fillToken: '0x0000000000000000000000000000000000000001' as const,
        minimumFillAmount: 500000000000000000n,
        recipient: '0x0000000000000000000000000000000000000002' as const,
        applyScaling: true,
      },
    ]

    it('estimates amounts with zero priority fee', () => {
      const result = estimateFillAmounts({
        maximumClaimAmounts: testCommitments,
        components: testComponents,
        priceCurve: [],
        supplementalPriceCurve: [],
        targetBlock: 0n,
        fillBlock: 12345n,
        baselinePriorityFee: 0n,
        scalingFactor: BASE_SCALING_FACTOR,
      })

      expect(result.fillAmounts).toHaveLength(1)
      expect(result.claimAmounts).toHaveLength(1)
    })
  })
})
