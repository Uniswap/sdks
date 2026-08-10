import { describe, expect, it } from 'bun:test'

import { adaptiveFractionDigits, AmountError, formatAmount, formatFixed, parseAmount, parseBudget } from './amounts'

describe('parseAmount', () => {
  it('scales human decimals by the token decimals', () => {
    expect(parseAmount('1.5', 18)).toBe(1_500_000_000_000_000_000n)
    expect(parseAmount('250', 6)).toBe(250_000_000n)
    expect(parseAmount('0.000001', 6)).toBe(1n)
  })

  it('passes raw units through with a wei/raw suffix', () => {
    expect(parseAmount('2500000wei', 18)).toBe(2_500_000n)
    expect(parseAmount('42raw', 6)).toBe(42n)
  })

  it('tolerates underscore separators', () => {
    expect(parseAmount('1_000_000', 6)).toBe(1_000_000_000_000n)
  })

  it('rejects more fractional digits than the token has — never silently truncates', () => {
    expect(() => parseAmount('0.0000001', 6)).toThrow(AmountError)
  })

  it('rejects zero, negatives, and garbage', () => {
    expect(() => parseAmount('0', 18)).toThrow(AmountError)
    expect(() => parseAmount('-1', 18)).toThrow(AmountError)
    expect(() => parseAmount('1,5', 18)).toThrow(AmountError)
    expect(() => parseAmount('a lot', 18)).toThrow(AmountError)
  })
})

describe('formatAmount', () => {
  it('groups thousands and trims trailing zeros', () => {
    expect(formatAmount(3_912_401_234n, 6)).toBe('3,912.401234')
    expect(formatAmount(1_500_000_000_000_000_000n, 18)).toBe('1.5')
    expect(formatAmount(1_000_000n, 6)).toBe('1')
  })

  it('truncates (never rounds up) beyond maxFractionDigits', () => {
    expect(formatAmount(1_999_999_999_999_999_999n, 18)).toBe('1.999999')
  })

  it('marks a nonzero dust amount instead of printing a lying zero', () => {
    expect(formatAmount(1n, 18)).toBe('<0.000001')
  })

  it('handles zero and tokens with fewer decimals than the display cap', () => {
    expect(formatAmount(0n, 18)).toBe('0')
    expect(formatAmount(12_345n, 2)).toBe('123.45')
  })
})

describe('formatFixed', () => {
  it('never trims — exact fraction digits, unlike formatAmount', () => {
    expect(formatFixed(300_000n, 6, 2)).toBe('0.30')
    expect(formatFixed(3_912_401_234n, 6, 2)).toBe('3,912.40')
    expect(formatFixed(1_000_000n, 6, 2)).toBe('1.00')
  })

  it('formats negative deltas with a leading sign', () => {
    expect(formatFixed(-300_000n, 6, 2)).toBe('-0.30')
  })

  it('caps fraction digits at the token decimals, and drops the point entirely at zero digits', () => {
    expect(formatFixed(1_500_000_000_000_000_000n, 18, 30)).toBe('1.500000000000000000')
    expect(formatFixed(1_500_000_000_000_000_000n, 18, 0)).toBe('1')
  })
})

describe('adaptiveFractionDigits', () => {
  it('picks the fewest digits that keep every delta distinct and nonzero', () => {
    // -0.30 / -0.42 already differ at 2 digits.
    expect(adaptiveFractionDigits([-300_000n, -420_000n], 6)).toBe(2)
  })

  it('grows past the default when 2 digits would collide or flatten to zero', () => {
    // -0.001200 / -0.001500 — both round to 0.00 at 2 digits.
    expect(adaptiveFractionDigits([-1_200n, -1_500n], 6)).toBeGreaterThan(2)
    // A dust delta indistinguishable from zero at any digit count below its own scale.
    expect(adaptiveFractionDigits([-1n], 6)).toBe(6)
  })

  it('never exceeds the token decimals or the caller-supplied max', () => {
    expect(adaptiveFractionDigits([-1n, -2n], 2)).toBeLessThanOrEqual(2)
    expect(adaptiveFractionDigits([-1_234_567n, -1_234_568n], 18, { max: 3 })).toBe(3)
  })
})

describe('parseBudget', () => {
  it('parses ms/s/m durations', () => {
    expect(parseBudget('900ms')).toBe(900)
    expect(parseBudget('10s')).toBe(10_000)
    expect(parseBudget('2m')).toBe(120_000)
    expect(parseBudget('1.5s')).toBe(1_500)
  })

  it('rejects a unitless number — ms-vs-s ambiguity must not be guessed at', () => {
    expect(() => parseBudget('900')).toThrow(AmountError)
  })

  it('rejects zero and garbage', () => {
    expect(() => parseBudget('0s')).toThrow(AmountError)
    expect(() => parseBudget('fast')).toThrow(AmountError)
  })
})
