import { describe, expect, it } from 'bun:test'

import { AmountError, formatAmount, parseAmount, parseBudget } from './amounts'

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
