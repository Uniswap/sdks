import { describe, expect, it } from 'bun:test'

import { abbreviateBlock, approxMonthYear, groupThousands, humanizeAge, humanizeDuration } from './format'

describe('humanizeDuration', () => {
  it('renders sub-second durations as bare milliseconds', () => {
    expect(humanizeDuration(0)).toBe('0ms')
    expect(humanizeDuration(82)).toBe('82ms')
    expect(humanizeDuration(999)).toBe('999ms')
  })

  it('renders 1s–120s as one decimal of seconds, across the old 10s boundary', () => {
    expect(humanizeDuration(1_000)).toBe('1.0s')
    expect(humanizeDuration(9_400)).toBe('9.4s')
    expect(humanizeDuration(10_000)).toBe('10.0s')
    expect(humanizeDuration(62_600)).toBe('62.6s')
    expect(humanizeDuration(119_999)).toBe('120.0s')
  })

  it('renders >=120s as zero-padded minutes and seconds', () => {
    expect(humanizeDuration(120_000)).toBe('2m 00s')
    expect(humanizeDuration(63_000)).toBe('63.0s') // still under the 120s boundary, not '1m 03s'
    expect(humanizeDuration(180_500)).toBe('3m 01s')
    expect(humanizeDuration(3_723_000)).toBe('62m 03s')
  })

  it('preserves sign for a negative duration (defensive — callers should not pass one)', () => {
    expect(humanizeDuration(-500)).toBe('-500ms')
  })
})

describe('humanizeAge', () => {
  it('rounds to the coarsest sensible unit', () => {
    expect(humanizeAge(0)).toBe('0s')
    expect(humanizeAge(45_000)).toBe('45s')
    expect(humanizeAge(3 * 60_000)).toBe('3m')
    expect(humanizeAge(59_600)).toBe('1m') // rounds up across the minute boundary rather than truncating to 0m
    expect(humanizeAge(90 * 60_000)).toBe('2h')
    expect(humanizeAge(3 * 24 * 60 * 60_000)).toBe('3d')
  })
})

describe('groupThousands', () => {
  it('groups both number and bigint counters', () => {
    expect(groupThousands(1234)).toBe('1,234')
    expect(groupThousands(5992)).toBe('5,992')
    expect(groupThousands(25_727_084)).toBe('25,727,084')
    expect(groupThousands(127n)).toBe('127')
    expect(groupThousands(25_727_084n)).toBe('25,727,084')
  })

  it('handles zero and negatives', () => {
    expect(groupThousands(0)).toBe('0')
    expect(groupThousands(-1234)).toBe('-1,234')
    expect(groupThousands(-1234n)).toBe('-1,234')
  })
})

describe('abbreviateBlock', () => {
  it('abbreviates to one decimal of millions once past 1M', () => {
    expect(abbreviateBlock(17_600_830n)).toBe('17.6M')
    expect(abbreviateBlock(21_000_000n)).toBe('21.0M')
    expect(abbreviateBlock(999_999n)).toBe('999,999')
    expect(abbreviateBlock(0n)).toBe('0')
  })
})

describe('approxMonthYear', () => {
  it('extrapolates backward from a head block/timestamp at the manifest block time', () => {
    // Mainnet-shaped: 12s/block, ~2,628,000 blocks/year.
    const head = { number: 17_600_830n + 2_628_000n * 3n, timestamp: 1_735_689_600n } // ~2025-01-01
    expect(approxMonthYear(17_600_830n, head, 12)).toMatch(/^~\w{3} 202[12]$/)
  })

  it('reads the same block as the head as "now"', () => {
    const head = { number: 25_727_084n, timestamp: 1_735_689_600n } // 2025-01-01T00:00:00Z
    expect(approxMonthYear(25_727_084n, head, 12)).toBe('~Jan 2025')
  })
})
