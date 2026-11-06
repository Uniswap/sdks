import { describe, expect, test } from 'bun:test'
import { parseUnits } from 'viem'

import { WAD } from './constants.js'
import { MarginSdkError } from './errors.js'
import {
  MORPHO_MAX_LIQUIDATION_INCENTIVE_FACTOR,
  MORPHO_MAX_RATE_AT_TARGET_APR,
  type RateModel,
  SECONDS_PER_YEAR,
  borrowRateApr,
  liquidationProbability,
  morphoLiquidationIncentiveFactor,
  normalCdf,
  numberToWad,
  perSecondToApr,
  rayToWad,
  wadToNumber,
} from './rates.js'

const pct = (n: string) => parseUnits(n, 16) // '5' -> 5% in WAD
const DAY = 24n * 60n * 60n

function expectWadClose(actual: bigint, expected: bigint, tolerance: bigint): void {
  const diff = actual > expected ? actual - expected : expected - actual
  expect(diff <= tolerance).toBe(true)
}

describe('rate conversions', () => {
  test('per-second WAD rates annualize over a 365-day year', () => {
    const perSecond = pct('5') / SECONDS_PER_YEAR
    expectWadClose(perSecondToApr(perSecond), pct('5'), SECONDS_PER_YEAR)
  })

  test('RAY annual rates scale down to WAD', () => {
    expect(rayToWad(5n * 10n ** 25n)).toBe(pct('5'))
  })

  test('float round-trips', () => {
    expect(wadToNumber(pct('5'))).toBeCloseTo(0.05, 12)
    expect(numberToWad(0.05)).toBe(pct('5'))
    expect(() => numberToWad(NaN)).toThrow(MarginSdkError)
    expect(() => numberToWad(Infinity)).toThrow(MarginSdkError)
  })
})

describe('borrowRateApr', () => {
  const morpho: RateModel = { kind: 'morphoAdaptiveCurve', rateAtTargetApr: pct('5') }

  test('Morpho adaptive curve: anchor at target, 4x at full, 1/4 at empty', () => {
    expect(borrowRateApr(morpho, pct('90'))).toBe(pct('5'))
    expect(borrowRateApr(morpho, WAD)).toBe(pct('20'))
    expect(borrowRateApr(morpho, 0n)).toBe(pct('1.25'))
    // halfway above target: err 0.5, curve 3 * 0.5 + 1
    expect(borrowRateApr(morpho, pct('95'))).toBe(pct('12.5'))
    // halfway below target: err -0.5, curve 1 - 0.75 * 0.5
    expect(borrowRateApr(morpho, pct('45'))).toBe(pct('3.125'))
  })

  test('Morpho anchor is bounded like the contract', () => {
    const hot: RateModel = { kind: 'morphoAdaptiveCurve', rateAtTargetApr: pct('300') }
    expect(borrowRateApr(hot, pct('90'))).toBe(MORPHO_MAX_RATE_AT_TARGET_APR)
  })

  test('Morpho persistence prices the drifting anchor: up above target, down below', () => {
    const persisted: RateModel = { ...morpho, persistenceSeconds: 5n * DAY }
    // k = 50 * 1 * 5/365; average anchor = 5% * (e^k - 1) / k; times the 4x curve
    const k = (50 * 5) / 365
    const expected = 0.05 * (Math.expm1(k) / k) * 4
    expectWadClose(borrowRateApr(persisted, WAD), numberToWad(expected), 10n ** 12n)
    expect(borrowRateApr(persisted, WAD) > borrowRateApr(morpho, WAD)).toBe(true)
    expect(borrowRateApr(persisted, pct('45')) < borrowRateApr(morpho, pct('45'))).toBe(true)
    expect(borrowRateApr(persisted, pct('90'))).toBe(borrowRateApr(morpho, pct('90')))
  })

  test('Aave kinked curve', () => {
    const aave: RateModel = {
      kind: 'aaveKinked',
      baseApr: 0n,
      slope1Apr: pct('4'),
      slope2Apr: pct('60'),
      optimalUtilization: pct('92'),
    }
    expect(borrowRateApr(aave, 0n)).toBe(0n)
    expect(borrowRateApr(aave, pct('92'))).toBe(pct('4'))
    expect(borrowRateApr(aave, pct('96'))).toBe(pct('34'))
    expect(borrowRateApr(aave, WAD)).toBe(pct('64'))
  })

  test('Compound kinked curve', () => {
    const comet: RateModel = {
      kind: 'compoundKinked',
      baseApr: pct('1'),
      slopeLowApr: pct('5'),
      slopeHighApr: pct('50'),
      kink: pct('90'),
    }
    expect(borrowRateApr(comet, 0n)).toBe(pct('1'))
    expect(borrowRateApr(comet, pct('90'))).toBe(pct('5.5'))
    expect(borrowRateApr(comet, WAD)).toBe(pct('10.5'))
  })

  test('constant and input validation', () => {
    expect(borrowRateApr({ kind: 'constant', apr: pct('3') }, pct('50'))).toBe(pct('3'))
    expect(() => borrowRateApr(morpho, WAD + 1n)).toThrow(MarginSdkError)
    expect(() => borrowRateApr(morpho, -1n)).toThrow(MarginSdkError)
  })
})

describe('morphoLiquidationIncentiveFactor', () => {
  test('matches 1 / (0.3 * lltv + 0.7) and caps at 1.15', () => {
    expectWadClose(morphoLiquidationIncentiveFactor(pct('86')), numberToWad(1 / (0.3 * 0.86 + 0.7)), 10n ** 6n)
    expectWadClose(morphoLiquidationIncentiveFactor(pct('98')), numberToWad(1 / (0.3 * 0.98 + 0.7)), 10n ** 6n)
    expect(morphoLiquidationIncentiveFactor(pct('50'))).toBe(MORPHO_MAX_LIQUIDATION_INCENTIVE_FACTOR)
    expect(() => morphoLiquidationIncentiveFactor(WAD)).toThrow(MarginSdkError)
  })
})

describe('normalCdf', () => {
  test('known quantiles', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7)
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 5)
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 5)
    expect(normalCdf(-6)).toBeCloseTo(9.866e-10, 11)
  })
})

describe('liquidationProbability', () => {
  const base = { healthFactorAfter: parseUnits('1.29', 18), volatilityWad: pct('80'), horizonSeconds: 30n * DAY }

  test('boundary cases', () => {
    expect(liquidationProbability({ ...base, healthFactorAfter: WAD })).toBe(1)
    expect(liquidationProbability({ ...base, healthFactorAfter: WAD / 2n })).toBe(1)
    expect(liquidationProbability({ ...base, horizonSeconds: 0n })).toBe(0)
    expect(liquidationProbability({ ...base, volatilityWad: 0n })).toBe(0)
    // No volatility, but interest alone carries the position past the barrier within the horizon.
    expect(
      liquidationProbability({
        healthFactorAfter: parseUnits('1.05', 18),
        volatilityWad: 0n,
        horizonSeconds: SECONDS_PER_YEAR,
        logDriftApr: -pct('10'),
      })
    ).toBe(1)
  })

  test('driftless case is the reflection formula 2 * Phi(-ln(HF) / (sigma * sqrt(T)))', () => {
    const y0 = Math.log(1.29)
    const s = 0.8 * Math.sqrt(30 / 365)
    expect(liquidationProbability(base)).toBeCloseTo(2 * normalCdf(-y0 / s), 6)
    expect(liquidationProbability(base)).toBeCloseTo(0.267, 2)
  })

  test('monotone in health factor, volatility, horizon, and drift', () => {
    const p = liquidationProbability(base)
    expect(liquidationProbability({ ...base, healthFactorAfter: parseUnits('1.5', 18) })).toBeLessThan(p)
    expect(liquidationProbability({ ...base, volatilityWad: pct('120') })).toBeGreaterThan(p)
    expect(liquidationProbability({ ...base, horizonSeconds: 90n * DAY })).toBeGreaterThan(p)
    expect(liquidationProbability({ ...base, logDriftApr: -pct('20') })).toBeGreaterThan(p)
    expect(liquidationProbability({ ...base, logDriftApr: pct('20') })).toBeLessThan(p)
  })

  test('extreme drift stays finite and bounded', () => {
    const p = liquidationProbability({ ...base, logDriftApr: -1000n * WAD })
    expect(Number.isFinite(p)).toBe(true)
    expect(p).toBeCloseTo(1, 6)
    const q = liquidationProbability({ ...base, logDriftApr: 1000n * WAD })
    expect(q).toBeCloseTo(0, 6)
  })

  test('rejects negative inputs', () => {
    expect(() => liquidationProbability({ ...base, volatilityWad: -1n })).toThrow(MarginSdkError)
    expect(() => liquidationProbability({ ...base, horizonSeconds: -1n })).toThrow(MarginSdkError)
  })
})
