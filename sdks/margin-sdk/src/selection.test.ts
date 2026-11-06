import { describe, expect, test } from 'bun:test'
import { type Address, parseUnits } from 'viem'

import { MAX_UINT256, WAD } from './constants.js'
import { MarginSdkError } from './errors.js'
import { parseLeverageX18 } from './math.js'
import { SECONDS_PER_YEAR, morphoLiquidationIncentiveFactor } from './rates.js'
import { type MarketCandidate, type TradeIntent, quoteMarket, selectMarket } from './selection.js'

const pct = (n: string) => parseUnits(n, 16)
const DAY = 24n * 60n * 60n
const USDC_1M = parseUnits('1000000', 6)

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const MARKET = { collateral: WETH, debt: USDC, data: '0x' } as const
const ADAPTER: Address = '0x9A7f8F5A9496D3c9dc0BEEfb44cCaC17CAAF28fa'
const ORACLE_PRICE = parseUnits('3000', 6)

const morpho86: MarketCandidate = {
  id: 'morpho-weth-usdc-86',
  venue: 'MORPHO',
  adapter: ADAPTER,
  market: MARKET,
  eligible: true,
  riskRank: 2,
  liquidationLtv: pct('86'),
  borrowLtvCap: pct('86'),
  liquidationPenalty: morphoLiquidationIncentiveFactor(pct('86')) - WAD,
  oraclePriceDebtPerCollateralToken: ORACLE_PRICE,
  totalSupply: 20n * USDC_1M,
  totalBorrow: 17n * USDC_1M,
  rateModel: { kind: 'morphoAdaptiveCurve', rateAtTargetApr: pct('5') },
}

const morpho77: MarketCandidate = {
  ...morpho86,
  id: 'morpho-weth-usdc-77',
  liquidationLtv: pct('77'),
  borrowLtvCap: pct('77'),
  liquidationPenalty: morphoLiquidationIncentiveFactor(pct('77')) - WAD,
  totalSupply: 10n * USDC_1M,
  totalBorrow: (85n * USDC_1M) / 10n,
  rateModel: { kind: 'morphoAdaptiveCurve', rateAtTargetApr: pct('4') },
}

const aaveV3: MarketCandidate = {
  id: 'aave-v3-weth-usdc',
  venue: 'AAVE_V3',
  adapter: ADAPTER,
  market: MARKET,
  eligible: true,
  riskRank: 0,
  liquidationLtv: pct('83'),
  borrowLtvCap: pct('80.5'),
  liquidationPenalty: pct('5'),
  closeFactor: pct('50'),
  oraclePriceDebtPerCollateralToken: ORACLE_PRICE,
  totalSupply: 100n * USDC_1M,
  totalBorrow: 85n * USDC_1M,
  rateModel: {
    kind: 'aaveKinked',
    baseApr: 0n,
    slope1Apr: pct('6.5'),
    slope2Apr: pct('60'),
    optimalUtilization: pct('92'),
  },
  collateralSupplyApr: pct('1.8'),
}

const compound: MarketCandidate = {
  id: 'compound-usdc-weth',
  venue: 'COMPOUND_V3',
  adapter: ADAPTER,
  market: MARKET,
  eligible: true,
  riskRank: 1,
  liquidationLtv: pct('90'),
  borrowLtvCap: pct('83'),
  liquidationPenalty: pct('5'),
  oraclePriceDebtPerCollateralToken: ORACLE_PRICE,
  totalSupply: 50n * USDC_1M,
  totalBorrow: 40n * USDC_1M,
  rateModel: {
    kind: 'compoundKinked',
    baseApr: pct('1.5'),
    slopeLowApr: pct('5'),
    slopeHighApr: pct('50'),
    kink: pct('90'),
  },
  incentiveApr: pct('0.4'),
}

const ALL = [morpho86, morpho77, aaveV3, compound]

const intent: TradeIntent = {
  equity: parseUnits('1', 18),
  leverageX18: parseLeverageX18(3),
  collateralDecimals: 18,
  quotePriceDebtPerCollateralToken: parseUnits('3000', 6),
  horizonSeconds: 30n * DAY,
  volatilityWad: pct('80'),
}
const rateOnly: TradeIntent = { ...intent, volatilityWad: 0n }

function expectWadClose(actual: bigint, expected: bigint, tolerance: bigint): void {
  const diff = actual > expected ? actual - expected : expected - actual
  expect(diff <= tolerance).toBe(true)
}

describe('quoteMarket: sizing and health', () => {
  test('3x on 1 WETH borrows 6000 USDC and lands at 2/3 LTV', () => {
    const q = quoteMarket(morpho86, intent)
    expect(q.borrowAmount).toBe(parseUnits('6000', 6))
    expect(q.collateralAfter).toBe(parseUnits('3', 18))
    expectWadClose(q.ltvAfter, (2n * WAD) / 3n, 10n)
    expectWadClose(q.healthFactorAfter, parseUnits('1.29', 18), 10n ** 9n)
    // 1 - (2/3) / 0.86 and 0.86 / (2/3) - 1
    expectWadClose(q.collateralDropToLiquidation, parseUnits('0.224806', 18), 10n ** 13n)
    expectWadClose(q.debtRiseToLiquidation, parseUnits('0.29', 18), 10n ** 9n)
    expectWadClose(q.maxLeverageX18, parseUnits('7.142857', 18), 10n ** 13n)
    expect(q.feasible).toBe(true)
    expect(q.reasons).toEqual([])
  })

  test('maxLtvAfter enforces the displayed buffer with 50 bps of slack by default', () => {
    const q = quoteMarket(morpho86, intent)
    expect(q.maxLtvAfter).toBe((q.ltvAfter * 10_050n) / 10_000n)
    expect(quoteMarket(morpho86, intent, { ltvBoundToleranceBps: 0 }).maxLtvAfter).toBe(q.ltvAfter)
  })

  test('the venue oracle, not the swap quote, sets the post-trade LTV', () => {
    const richer = { ...morpho86, oraclePriceDebtPerCollateralToken: parseUnits('3300', 6) }
    const q = quoteMarket(richer, intent)
    expect(q.borrowAmount).toBe(parseUnits('6000', 6))
    expectWadClose(q.ltvAfter, (parseUnits('6000', 6) * WAD) / parseUnits('9900', 6), 10n)
  })

  test('1x leverage is a debt-free supply', () => {
    const q = quoteMarket(morpho86, { ...intent, leverageX18: WAD })
    expect(q.borrowAmount).toBe(0n)
    expect(q.ltvAfter).toBe(0n)
    expect(q.healthFactorAfter).toBe(MAX_UINT256)
    expect(q.collateralDropToLiquidation).toBe(WAD)
    expect(q.debtRiseToLiquidation).toBe(MAX_UINT256)
    expect(q.effectiveRateApr).toBe(0n)
    expect(q.liquidationProbability).toBe(0)
    expect(q.expectedCostApr).toBe(0n)
    expect(q.maxLtvAfter).toBe(0n)
    expect(q.feasible).toBe(true)
  })
})

describe('quoteMarket: rates at size', () => {
  test('the whole position pays the post-trade rate', () => {
    const q = quoteMarket(morpho86, rateOnly)
    expect(q.utilizationBefore).toBe(pct('85'))
    expect(q.utilizationAfter > q.utilizationBefore).toBe(true)
    expect(q.borrowRateApr >= q.borrowRateBeforeApr).toBe(true)
    expect(q.borrowRateApr < pct('5')).toBe(true)
  })

  test('a large borrow moves the curve and then runs out of liquidity', () => {
    const big = quoteMarket(morpho86, { ...rateOnly, equity: parseUnits('400', 18) })
    expect(big.borrowAmount).toBe(parseUnits('2400000', 6))
    expect(big.utilizationAfter).toBe(pct('97'))
    expectWadClose(big.borrowRateApr, pct('15.5'), 10n ** 9n)
    expect(big.feasible).toBe(false)
    expect(big.reasons).toEqual(['UTILIZATION_TOO_HIGH'])

    const huge = quoteMarket(morpho86, { ...rateOnly, equity: parseUnits('1000', 18) })
    expect(huge.utilizationAfter).toBe(WAD)
    expect(huge.reasons).toEqual(['INSUFFICIENT_LIQUIDITY', 'UTILIZATION_TOO_HIGH'])
  })

  test('collateral yield nets off the borrow rate on the debt basis', () => {
    const q = quoteMarket(aaveV3, rateOnly)
    // 1.8% on 3x the equity is 2.7% on the 2x debt
    expectWadClose(q.effectiveRateApr, q.borrowRateApr - pct('2.7'), 10n ** 9n)
    expect(q.collateralSupplyApr).toBe(pct('1.8'))
  })

  test('spread adds to the venue rate, incentives are reported only', () => {
    const premium = { ...aaveV3, spreadApr: pct('1') }
    const q = quoteMarket(premium, rateOnly)
    expect(q.borrowRateApr).toBe(quoteMarket(aaveV3, rateOnly).borrowRateApr + pct('1'))
    expect(quoteMarket(compound, rateOnly).incentiveApr).toBe(pct('0.4'))
    expect(quoteMarket(compound, rateOnly).expectedCostApr).toBe(quoteMarket(compound, rateOnly).effectiveRateApr)
  })

  test('cost conversions: equity basis and horizon amount', () => {
    const q = quoteMarket(aaveV3, rateOnly)
    // ltv 2/3 => debt is 2x equity
    expectWadClose(q.expectedCostOnEquityApr, 2n * q.expectedCostApr, 10n)
    expect(q.expectedCostOverHorizon).toBe(
      (q.borrowAmount * q.expectedCostApr * (30n * DAY)) / (WAD * SECONDS_PER_YEAR)
    )
  })
})

describe('quoteMarket: liquidation risk', () => {
  test('zero volatility reduces the ranking key to the effective rate', () => {
    for (const c of ALL) {
      const q = quoteMarket(c, rateOnly)
      expect(q.liquidationProbability).toBe(0)
      expect(q.expectedLiquidationCostApr).toBe(0n)
      expect(q.expectedCostApr).toBe(q.effectiveRateApr)
    }
  })

  test('lower LLTV means a higher hit probability and a larger expected cost', () => {
    const q86 = quoteMarket(morpho86, intent)
    const q77 = quoteMarket(morpho77, intent)
    const qC = quoteMarket(compound, intent)
    expect(q77.liquidationProbability).toBeGreaterThan(q86.liquidationProbability)
    expect(q86.liquidationProbability).toBeGreaterThan(qC.liquidationProbability)
    expect(q86.liquidationProbability).toBeCloseTo(0.27, 1)
    expect(q86.expectedLiquidationCostApr > 0n).toBe(true)
    expect(q86.expectedCostApr > q86.effectiveRateApr).toBe(true)
    // P * penalty * closeFactor, annualized over the 30-day horizon
    const perHorizon = q86.liquidationProbability * (Number(morpho86.liquidationPenalty) / 1e18)
    expectWadClose(q86.expectedLiquidationCostApr, BigInt(Math.round(((perHorizon * 365) / 30) * 1e18)), 10n ** 12n)
  })

  test('the close factor scales the expected loss', () => {
    const full = quoteMarket({ ...aaveV3, closeFactor: undefined }, intent)
    const half = quoteMarket(aaveV3, intent)
    expect(full.liquidationProbability).toBe(half.liquidationProbability)
    // annualizing each side rounds separately, so allow a few wei per year-to-horizon ratio
    expectWadClose(full.expectedLiquidationCostApr, 2n * half.expectedLiquidationCostApr, 10n ** 6n)
  })

  test('a liquidation-probability ceiling is a gate', () => {
    const q = quoteMarket(aaveV3, intent, { maxLiquidationProbability: 0.2 })
    expect(q.reasons).toEqual(['LIQUIDATION_PROBABILITY_TOO_HIGH'])
  })
})

describe('quoteMarket: feasibility gates', () => {
  test('leverage above the borrow cap, and health below the floor', () => {
    const six = { ...intent, leverageX18: parseLeverageX18(6) }
    // 6x is 83.3% LTV: over Aave's 80.5% borrow cap and already past its 83% liquidation threshold
    expect(quoteMarket(aaveV3, six).reasons).toEqual(['LEVERAGE_EXCEEDS_BORROW_CAP', 'HEALTH_FACTOR_TOO_LOW'])
    // 6x is 83.3% LTV: under Morpho's 86% LLTV but a 1.03 health factor
    expect(quoteMarket(morpho86, six).reasons).toEqual(['HEALTH_FACTOR_TOO_LOW'])
    expect(quoteMarket(morpho86, six, { minHealthFactorAfter: WAD }).feasible).toBe(true)
  })

  test('cap headroom must cover the trade plus the configured margin', () => {
    expect(quoteMarket({ ...aaveV3, borrowCapHeadroom: parseUnits('6500', 6) }, intent).reasons).toEqual([
      'BORROW_CAP_HEADROOM',
    ])
    expect(quoteMarket({ ...aaveV3, borrowCapHeadroom: parseUnits('6600', 6) }, intent).feasible).toBe(true)
    expect(quoteMarket({ ...aaveV3, collateralSupplyCapHeadroom: parseUnits('3', 18) }, intent).reasons).toEqual([
      'SUPPLY_CAP_HEADROOM',
    ])
    expect(quoteMarket({ ...aaveV3, collateralSupplyCapHeadroom: parseUnits('3.3', 18) }, intent).feasible).toBe(true)
  })

  test('ineligible markets are priced but never feasible', () => {
    const q = quoteMarket({ ...morpho86, eligible: false }, intent)
    expect(q.feasible).toBe(false)
    expect(q.reasons).toEqual(['NOT_ELIGIBLE'])
    expect(q.borrowRateApr > 0n).toBe(true)
  })

  test('input validation', () => {
    expect(() => quoteMarket({ ...morpho86, borrowLtvCap: pct('90') }, intent)).toThrow(MarginSdkError)
    expect(() => quoteMarket({ ...morpho86, totalBorrow: 21n * USDC_1M }, intent)).toThrow(MarginSdkError)
    expect(() => quoteMarket(morpho86, { ...intent, equity: 0n })).toThrow(MarginSdkError)
    expect(() => quoteMarket(morpho86, { ...intent, volatilityWad: -1n })).toThrow(MarginSdkError)
    expect(() => quoteMarket(morpho86, intent, { minHealthFactorAfter: pct('99') })).toThrow(MarginSdkError)
    expect(() => quoteMarket(morpho86, intent, { maxLiquidationProbability: 2 })).toThrow(MarginSdkError)
  })
})

describe('selectMarket', () => {
  test('ranks on expected cost, labels the endpoints, and flags dominated markets', () => {
    const s = selectMarket(ALL, intent)
    expect(s.quotes.map((q) => q.candidate.id)).toEqual([aaveV3.id, compound.id, morpho86.id, morpho77.id])
    expect(s.recommended?.candidate.id).toBe(aaveV3.id)
    expect(s.recommended?.reasons).toEqual([])
    expect(s.recommended?.labels).toEqual(['RECOMMENDED', 'CHEAPEST'])
    expect(s.cheapest?.candidate.id).toBe(aaveV3.id)
    expect(s.safest?.candidate.id).toBe(compound.id)
    expect(s.safest?.labels).toEqual(['SAFEST'])
    // Aave is both cheaper and safer than the 77% market, so it never belongs on the frontier.
    expect(s.frontier.map((q) => q.candidate.id)).toEqual([aaveV3.id, compound.id, morpho86.id])
    const q77 = s.quotes.find((q) => q.candidate.id === morpho77.id)!
    expect(q77.reasons).toEqual(['DOMINATED', 'HIGHER_EXPECTED_COST'])
    for (const q of s.quotes) {
      if (q !== s.recommended) expect(q.reasons).toContain('HIGHER_EXPECTED_COST')
    }
  })

  test('with no volatility the 77% market is the cheapest carry but still dominated on safety', () => {
    const s = selectMarket(ALL, rateOnly)
    expect(s.cheapest?.candidate.id).toBe(aaveV3.id)
    expect(s.frontier.map((q) => q.candidate.id)).not.toContain(morpho77.id)
  })

  test('infeasible markets trail the list in input order and keep their numbers', () => {
    const six = { ...intent, leverageX18: parseLeverageX18(6) }
    const s = selectMarket(ALL, six)
    expect(s.quotes.map((q) => q.feasible)).toEqual([false, false, false, false])
    expect(s.quotes.map((q) => q.candidate.id)).toEqual(ALL.map((c) => c.id))
    expect(s.recommended).toBeUndefined()
    expect(s.frontier).toEqual([])
    expect(s.quotes[0].borrowAmount).toBe(parseUnits('15000', 6))
  })

  test('within the tie band the lower risk rank wins', () => {
    const risky: MarketCandidate = {
      ...morpho86,
      id: 'risky',
      riskRank: 2,
      rateModel: { kind: 'constant', apr: pct('5') },
    }
    const safe: MarketCandidate = {
      ...morpho86,
      id: 'safe',
      riskRank: 0,
      rateModel: { kind: 'constant', apr: pct('5.2') },
    }
    const inBand = selectMarket([risky, safe], rateOnly)
    expect(inBand.recommended?.candidate.id).toBe('safe')
    expect(inBand.quotes.map((q) => q.candidate.id)).toEqual(['risky', 'safe'])
    expect(inBand.quotes[0].reasons).toEqual(['LOST_RISK_TIEBREAK'])

    const outOfBand = selectMarket([risky, { ...safe, rateModel: { kind: 'constant', apr: pct('5.3') } }], rateOnly)
    expect(outOfBand.recommended?.candidate.id).toBe('risky')
    // same LLTV and a higher rate: the safe market is dominated as well as more expensive
    expect(outOfBand.quotes[1].reasons).toEqual(['DOMINATED', 'HIGHER_EXPECTED_COST'])

    const wideBand = selectMarket([risky, { ...safe, rateModel: { kind: 'constant', apr: pct('5.3') } }], rateOnly, {
      tieBandApr: pct('0.5'),
    })
    expect(wideBand.recommended?.candidate.id).toBe('safe')
    // the tiebreak picked a market the risky one beats on both displayed axes: still offered, never dominated
    expect(wideBand.recommended?.reasons).toEqual([])
    expect(wideBand.frontier.map((q) => q.candidate.id)).toEqual(['risky', 'safe'])
    expect(wideBand.quotes.find((q) => q.candidate.id === 'risky')?.reasons).toEqual(['LOST_RISK_TIEBREAK'])
  })

  test('the recommendation stays on the frontier when the liquidation term prefers a dominated market', () => {
    const cheapRate: MarketCandidate = {
      ...morpho86,
      id: 'cheap-rate',
      rateModel: { kind: 'constant', apr: pct('5') },
    }
    // Same buffer and a slightly higher rate, but half the debt is repaid at liquidation.
    const lowPenalty: MarketCandidate = {
      ...morpho86,
      id: 'low-penalty',
      rateModel: { kind: 'constant', apr: pct('5.1') },
      closeFactor: pct('50'),
    }
    const s = selectMarket([cheapRate, lowPenalty], intent, { tieBandApr: 0n })
    expect(s.recommended?.candidate.id).toBe('low-penalty')
    expect(s.recommended?.reasons).toEqual([])
    expect(s.cheapest?.candidate.id).toBe('cheap-rate')
    expect(s.frontier.map((q) => q.candidate.id)).toEqual(['low-penalty', 'cheap-rate'])
    expect(s.quotes[1].reasons).toEqual(['HIGHER_EXPECTED_COST'])
  })

  test('empty input', () => {
    const s = selectMarket([], intent)
    expect(s.quotes).toEqual([])
    expect(s.frontier).toEqual([])
    expect(s.recommended).toBeUndefined()
  })
})
