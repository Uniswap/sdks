import { TICK_SPACINGS } from '@uniswap/v3-sdk'
import { describe, expect, it } from 'bun:test'

import { MAX_TICK_SPACING } from '../constants'

import { LAUNCHER_V4_FEE_TICK_SPACINGS, feeToTickSpacing, resolveNewPoolTickSpacing } from './fees'

describe('resolveNewPoolTickSpacing', () => {
  it('resolves the 0.25% tier to 25', () => {
    expect(resolveNewPoolTickSpacing(2_500)).toBe(25)
    expect(LAUNCHER_V4_FEE_TICK_SPACINGS[2_500]).toBe(25)
  })

  it('resolves every well-known tier from the launcher table', () => {
    expect(resolveNewPoolTickSpacing(100)).toBe(1)
    expect(resolveNewPoolTickSpacing(500)).toBe(10)
    expect(resolveNewPoolTickSpacing(3_000)).toBe(60)
    expect(resolveNewPoolTickSpacing(10_000)).toBe(200)
  })

  it('resolves every fee the v3 table covers to the spacing v3 gives it', () => {
    // The launcher table is independent of v3's, but no fee v3 already answered may change spacing.
    for (const [fee, spacing] of Object.entries(TICK_SPACINGS as Readonly<Record<number, number>>)) {
      expect(resolveNewPoolTickSpacing(Number(fee))).toBe(spacing)
    }
  })

  it('falls back to max(round(2*fee/100), 1) for fees outside the table', () => {
    expect(resolveNewPoolTickSpacing(1_234)).toBe(25)
    expect(resolveNewPoolTickSpacing(1)).toBe(1)
    expect(resolveNewPoolTickSpacing(50_000)).toBe(1_000)
  })

  it('rejects a fee whose resolved spacing exceeds the v4 maximum', () => {
    const tooLarge = (MAX_TICK_SPACING + 1) * 50
    expect(() => resolveNewPoolTickSpacing(tooLarge)).toThrow()
  })
})

describe('feeToTickSpacing', () => {
  it('is the deprecated alias of resolveNewPoolTickSpacing', () => {
    expect(feeToTickSpacing).toBe(resolveNewPoolTickSpacing)
    expect(feeToTickSpacing(1_234)).toBe(25)
    expect(feeToTickSpacing(2_500)).toBe(25)
  })
})
