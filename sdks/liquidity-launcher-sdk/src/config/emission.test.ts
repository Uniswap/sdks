import { describe, expect, it } from 'bun:test'

import { MPS_TOTAL } from '../constants'

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
