import { describe, expect, it } from 'bun:test'

import { MPS_TOTAL } from '../constants'
import { LauncherSdkError } from '../errors'

import { deriveConvexAuctionSteps } from './emission'

describe('deriveConvexAuctionSteps', () => {
  const startBlock = 1_000n
  const endBlock = 1_100n
  const steps = deriveConvexAuctionSteps(startBlock, endBlock)

  it('emits per-block mps summing to exactly MPS_TOTAL', () => {
    const total = steps.reduce((sum, s) => sum + s.mps * Number(s.endBlock - s.startBlock), 0)
    expect(total).toBe(MPS_TOTAL)
  })

  it('covers the whole window contiguously (start..end with no gaps)', () => {
    expect(steps[0]!.startBlock).toBe(startBlock)
    expect(steps[steps.length - 1]!.endBlock).toBe(endBlock)
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.startBlock).toBe(steps[i - 1]!.endBlock)
    }
  })

  it('ends with a single large final block', () => {
    const finalStep = steps[steps.length - 1]!
    expect(finalStep.endBlock - finalStep.startBlock).toBe(1n)
    // The final block anchors ~30% of supply, far above any ramp step.
    expect(finalStep.mps).toBeGreaterThan(steps[0]!.mps)
  })

  it('rejects a window too short to ramp', () => {
    expect(() => deriveConvexAuctionSteps(0n, 1n)).toThrow()
  })
})

describe('deriveConvexAuctionSteps — 200ms blocks (Base after Denim)', () => {
  // Window lengths are literal block counts at 200ms/block.
  const durations: [string, bigint][] = [
    ['1h', 18_000n],
    ['1d', 432_000n],
    ['3d', 1_296_000n],
    ['7d', 3_024_000n],
    ['14d', 6_048_000n],
  ]

  for (const [label, blocks] of durations) {
    it(`builds a valid schedule for a ${label} auction (${blocks} blocks)`, () => {
      const start = 60_000_000n
      const steps = deriveConvexAuctionSteps(start, start + blocks)
      let total = 0
      let cursor = start
      for (const step of steps) {
        expect(step.startBlock).toBe(cursor)
        expect(step.endBlock - step.startBlock).toBeGreaterThanOrEqual(1n)
        expect(step.endBlock - step.startBlock).toBeLessThan(2n ** 40n) // encoded as uint40
        expect(Number.isInteger(step.mps)).toBe(true)
        expect(step.mps).toBeGreaterThanOrEqual(1)
        expect(step.mps).toBeLessThan(2 ** 24) // encoded as uint24
        total += step.mps * Number(step.endBlock - step.startBlock)
        cursor = step.endBlock
      }
      expect(cursor).toBe(start + blocks)
      expect(total).toBe(MPS_TOTAL)
    })
  }

  it('fits at most MPS_TOTAL blocks: every ramp block needs at least 1 mps', () => {
    // 10,000,000 blocks is ~23.1 days at 200ms.
    expect(() => deriveConvexAuctionSteps(0n, 10_000_000n)).not.toThrow()
    expect(() => deriveConvexAuctionSteps(0n, 10_000_001n)).toThrow(LauncherSdkError)
    // 30 days at 200ms.
    expect(() => deriveConvexAuctionSteps(0n, 12_960_000n)).toThrow(LauncherSdkError)
  })
})
