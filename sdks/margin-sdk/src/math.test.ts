import { describe, expect, test } from 'bun:test'
import { parseUnits } from 'viem'

import { MAX_UINT128, MAX_UINT256, WAD } from './constants'
import { MarginSdkError } from './errors'
import {
  collateralToBuyForLeverage,
  estimateLtv,
  healthFactor,
  impliedLtv,
  leverageForLtv,
  parseLeverageX18,
  quoteCollateralForDebt,
  quoteDebtForCollateral,
  sizeDecrease,
  sizeIncrease,
  toUint128,
  totalExposure,
  withSlippageDown,
  withSlippageUp,
} from './math'

describe('parseLeverageX18', () => {
  test('parses numbers and strings', () => {
    expect(parseLeverageX18(2)).toBe(2n * WAD)
    expect(parseLeverageX18('2.5')).toBe(25n * 10n ** 17n)
    expect(parseLeverageX18(1)).toBe(WAD)
  })

  test('rejects sub-1x leverage (LeverageBelowOne mirror)', () => {
    expect(() => parseLeverageX18(0.5)).toThrow(MarginSdkError)
    expect(() => parseLeverageX18('0.99')).toThrow(MarginSdkError)
    expect(() => parseLeverageX18(NaN)).toThrow(MarginSdkError)
  })
})

describe('leverage & exposure', () => {
  const equity = parseUnits('1', 18) // 1 WETH

  test('2x doubles exposure and buys equity-worth of collateral', () => {
    expect(totalExposure(equity, 2n * WAD)).toBe(2n * equity)
    expect(collateralToBuyForLeverage(equity, 2n * WAD)).toBe(equity)
  })

  test('1x buys nothing', () => {
    expect(collateralToBuyForLeverage(equity, WAD)).toBe(0n)
  })

  test('impliedLtv: 2x≈50%, 3x≈67%, 4x≈75%', () => {
    expect(impliedLtv(2n * WAD)).toBe(5n * 10n ** 17n)
    expect(impliedLtv(3n * WAD)).toBe(666666666666666666n)
    expect(impliedLtv(4n * WAD)).toBe(75n * 10n ** 16n)
    expect(impliedLtv(WAD)).toBe(0n)
  })

  test('leverageForLtv inverts impliedLtv', () => {
    expect(leverageForLtv(5n * 10n ** 17n)).toBe(2n * WAD)
    expect(leverageForLtv(75n * 10n ** 16n)).toBe(4n * WAD)
    // the mainnet Morpho WETH/USDC LLTV: 86% → ~7.14x
    expect(leverageForLtv(86n * 10n ** 16n)).toBe(7142857142857142857n)
    expect(() => leverageForLtv(WAD)).toThrow(MarginSdkError)
  })

  test('healthFactor mirrors describePosition semantics', () => {
    expect(healthFactor(86n * 10n ** 16n, 43n * 10n ** 16n)).toBe(2n * WAD)
    expect(healthFactor(86n * 10n ** 16n, 0n)).toBe(MAX_UINT256)
  })
})

describe('quotes & slippage (decimal-aware)', () => {
  test('long quote: WETH amount → USDC cost at 3000 USDC/WETH', () => {
    expect(
      quoteDebtForCollateral({
        collateralAmount: parseUnits('1', 18),
        priceDebtPerCollateralToken: parseUnits('3000', 6),
        collateralDecimals: 18,
      })
    ).toBe(parseUnits('3000', 6))
  })

  test('short quote (reversed decimals): USDC amount → WETH cost at 1/3000 WETH/USDC', () => {
    expect(
      quoteCollateralForDebt({
        debtAmount: parseUnits('3000', 6),
        priceCollateralPerDebtToken: parseUnits('0.000333333333333333', 18),
        debtDecimals: 6,
      })
    ).toBe(999999999999999000n) // ≈1 WETH, floor-rounded
  })

  test('slippage helpers', () => {
    expect(withSlippageUp(10_000n, 50)).toBe(10_050n)
    expect(withSlippageDown(10_000n, 50)).toBe(9_950n)
    expect(() => withSlippageUp(1n, -1)).toThrow(MarginSdkError)
    expect(() => withSlippageDown(1n, 10_001)).toThrow(MarginSdkError)
  })

  test('toUint128 bounds', () => {
    expect(toUint128(MAX_UINT128)).toBe(MAX_UINT128)
    expect(() => toUint128(MAX_UINT128 + 1n)).toThrow(MarginSdkError)
    expect(() => toUint128(-1n)).toThrow(MarginSdkError)
  })
})

describe('sizeIncrease (docs §7.3 example)', () => {
  test('1 WETH equity, 2x, 3000 USDC/WETH, 50 bps', () => {
    const { collateralToBuy, maxDebtIn, totalCollateral } = sizeIncrease({
      equity: parseUnits('1', 18),
      leverageX18: parseLeverageX18(2),
      priceDebtPerCollateralToken: parseUnits('3000', 6),
      collateralDecimals: 18,
      slippageBps: 50,
    })
    expect(collateralToBuy).toBe(parseUnits('1', 18))
    expect(maxDebtIn).toBe(parseUnits('3015', 6))
    expect(totalCollateral).toBe(parseUnits('2', 18))
  })

  test('short ETH sizing (6-decimal collateral, 18-decimal debt)', () => {
    // 3000 USDC equity at 2x: buy 3000 more USDC, paying WETH at 3000 USDC/WETH ≈ 1 WETH
    const { collateralToBuy, maxDebtIn } = sizeIncrease({
      equity: parseUnits('3000', 6),
      leverageX18: parseLeverageX18(2),
      priceDebtPerCollateralToken: parseUnits('0.000333333333333333', 18),
      collateralDecimals: 6,
      slippageBps: 100,
    })
    expect(collateralToBuy).toBe(parseUnits('3000', 6))
    expect(maxDebtIn).toBe(1009999999999998990n) // ≈1.01 WETH
  })

  test('rejects 1x (nothing to buy) and zero equity', () => {
    expect(() =>
      sizeIncrease({
        equity: parseUnits('1', 18),
        leverageX18: WAD,
        priceDebtPerCollateralToken: parseUnits('3000', 6),
        collateralDecimals: 18,
        slippageBps: 50,
      })
    ).toThrow(MarginSdkError)
    expect(() =>
      sizeIncrease({
        equity: 0n,
        leverageX18: 2n * WAD,
        priceDebtPerCollateralToken: parseUnits('3000', 6),
        collateralDecimals: 18,
        slippageBps: 50,
      })
    ).toThrow(MarginSdkError)
  })
})

describe('sizeDecrease', () => {
  test('caps collateral sold for a debt repay plus headroom', () => {
    const { maxCollateralIn } = sizeDecrease({
      debtToRepay: parseUnits('3000', 6),
      priceCollateralPerDebtToken: parseUnits('0.000333333333333333', 18),
      debtDecimals: 6,
      slippageBps: 100,
    })
    expect(maxCollateralIn).toBe(1009999999999998990n)
  })

  test('rejects zero debt', () => {
    expect(() =>
      sizeDecrease({ debtToRepay: 0n, priceCollateralPerDebtToken: 1n, debtDecimals: 6, slippageBps: 0 })
    ).toThrow(MarginSdkError)
  })
})

describe('estimateLtv', () => {
  test('2 WETH collateral, 3000 USDC debt at 3000 USDC/WETH → 50%', () => {
    expect(
      estimateLtv({
        collateralAmount: parseUnits('2', 18),
        debtAmount: parseUnits('3000', 6),
        priceDebtPerCollateralToken: parseUnits('3000', 6),
        collateralDecimals: 18,
      })
    ).toBe(5n * 10n ** 17n)
  })
})
