import { describe, expect, it } from 'bun:test'

import { MAX_TICK_SPACING } from '../constants'

import { feeToTickSpacing, resolveNewPoolTickSpacing } from './fees'

describe('resolveNewPoolTickSpacing', () => {
  it('resolves the 0.25% tier to 25', () => {
    expect(resolveNewPoolTickSpacing(2_500)).toBe(25)
  })

  it('derives max(round(fee / 100), 1) — one tick of spacing per bip of fee', () => {
    expect(resolveNewPoolTickSpacing(100)).toBe(1)
    expect(resolveNewPoolTickSpacing(500)).toBe(5)
    expect(resolveNewPoolTickSpacing(1_234)).toBe(12)
    expect(resolveNewPoolTickSpacing(2_500)).toBe(25)
    expect(resolveNewPoolTickSpacing(3_000)).toBe(30)
    expect(resolveNewPoolTickSpacing(10_000)).toBe(100)
    expect(resolveNewPoolTickSpacing(50_000)).toBe(500)
  })

  it('floors the spacing at 1 for tiny fees', () => {
    expect(resolveNewPoolTickSpacing(1)).toBe(1)
    expect(resolveNewPoolTickSpacing(0)).toBe(1)
    expect(resolveNewPoolTickSpacing(49)).toBe(1)
  })

  it('rejects a fee whose resolved spacing exceeds the v4 maximum', () => {
    const tooLarge = (MAX_TICK_SPACING + 1) * 100
    expect(() => resolveNewPoolTickSpacing(tooLarge)).toThrow()
    expect(() => resolveNewPoolTickSpacing(MAX_TICK_SPACING * 100)).not.toThrow()
  })
})

describe('feeToTickSpacing', () => {
  it('is the deprecated alias of resolveNewPoolTickSpacing', () => {
    expect(feeToTickSpacing).toBe(resolveNewPoolTickSpacing)
    expect(feeToTickSpacing(1_234)).toBe(12)
    expect(feeToTickSpacing(2_500)).toBe(25)
  })
})
