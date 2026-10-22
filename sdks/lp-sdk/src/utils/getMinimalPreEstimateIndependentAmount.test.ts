import { CurrencyAmount, Ether, Token, WETH9 } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import {
  encodeSqrtRatioX96,
  FeeAmount,
  nearestUsableTick,
  Pool as V3Pool,
  Position as V3Position,
  TICK_SPACINGS,
  TickMath,
} from '@uniswap/v3-sdk'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import { getMinimalPreEstimateIndependentAmount } from './getMinimalPreEstimateIndependentAmount'

const ETH = Ether.onChain(1)
const WETH = WETH9[1]
const USDT = new Token(1, '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6, 'USDT')
const OTHER = new Token(1, '0x0000000000000000000000000000000000000009', 18, 'OTHER')

const spacing = TICK_SPACINGS[FeeAmount.MEDIUM]
const FULL_RANGE = {
  tickLower: nearestUsableTick(TickMath.MIN_TICK, spacing),
  tickUpper: nearestUsableTick(TickMath.MAX_TICK, spacing),
}

// Mainnet WETH/USDT 0.3% (WETH is token0)
const TICK_CURRENT = -193981
const v3Pool = new V3Pool(
  WETH,
  USDT,
  FeeAmount.MEDIUM,
  '4862546267419838844180017',
  '6661209530036967407',
  TICK_CURRENT
)

describe('getMinimalPreEstimateIndependentAmount', () => {
  it('picks the side with the smaller valid raw amount for an in-range v3 position', () => {
    const result = getMinimalPreEstimateIndependentAmount({
      poolOrPair: v3Pool,
      ...FULL_RANGE,
      currencyA: WETH,
      currencyB: USDT,
    })

    // WETH starts at 10^9 wei and USDT at 10^3 raw units; both are valid, so USDT wins
    expect(result?.currency).toBe(USDT)
    expect(result?.quotient.toString()).toEqual('1000')
  })

  it('yields a position with non-zero amounts on both sides', () => {
    const result = getMinimalPreEstimateIndependentAmount({
      poolOrPair: v3Pool,
      ...FULL_RANGE,
      currencyA: WETH,
      currencyB: USDT,
    })
    const position = V3Position.fromAmount1({ pool: v3Pool, ...FULL_RANGE, amount1: result!.quotient })

    expect(position.amount0.greaterThan(0)).toBe(true)
    expect(position.liquidity.toString()).not.toEqual('0')
  })

  it('doubles the amount until the dependent side stops rounding to zero', () => {
    // At a 1e12:1 price, 10^9 of token0 is worth less than one raw unit of token1
    const t0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0')
    const t1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1')
    const sqrtRatioX96 = encodeSqrtRatioX96(1, (10n ** 12n).toString())
    const pool = new V3Pool(t0, t1, FeeAmount.MEDIUM, sqrtRatioX96, 0, TickMath.getTickAtSqrtRatio(sqrtRatioX96))

    // OTHER is not in the pool, isolating the token0 side
    const result = getMinimalPreEstimateIndependentAmount({
      poolOrPair: pool,
      ...FULL_RANGE,
      currencyA: t0,
      currencyB: OTHER,
    })

    expect(result?.currency).toBe(t0)
    expect(BigInt(result!.quotient.toString()) > 10n ** 9n).toBe(true)
    const position = V3Position.fromAmount0({
      pool,
      ...FULL_RANGE,
      amount0: result!.quotient,
      useFullPrecision: true,
    })
    expect(position.amount1.greaterThan(0)).toBe(true)
  })

  it('only qualifies token0 when the range is above the current price', () => {
    const tickLower = nearestUsableTick(TICK_CURRENT + 6000, spacing)
    const result = getMinimalPreEstimateIndependentAmount({
      poolOrPair: v3Pool,
      tickLower,
      tickUpper: tickLower + 600,
      currencyA: USDT,
      currencyB: WETH,
    })

    expect(result?.currency).toBe(WETH)
  })

  it('only qualifies token1 when the range is below the current price', () => {
    const tickUpper = nearestUsableTick(TICK_CURRENT - 6000, spacing)
    const result = getMinimalPreEstimateIndependentAmount({
      poolOrPair: v3Pool,
      tickLower: tickUpper - 600,
      tickUpper,
      currencyA: WETH,
      currencyB: USDT,
    })

    expect(result?.currency).toBe(USDT)
  })

  it('returns the amount in the native currency when native is deposited into a wrapped-native v3 side', () => {
    const tickLower = nearestUsableTick(TICK_CURRENT + 6000, spacing)
    const result = getMinimalPreEstimateIndependentAmount({
      poolOrPair: v3Pool,
      tickLower,
      tickUpper: tickLower + 600,
      currencyA: ETH,
      currencyB: USDT,
    })

    expect(result?.currency.isNative).toBe(true)
  })

  it('returns null when the tick range is empty', () => {
    const tick = nearestUsableTick(0, spacing)
    const result = getMinimalPreEstimateIndependentAmount({
      poolOrPair: v3Pool,
      tickLower: tick,
      tickUpper: tick,
      currencyA: WETH,
      currencyB: USDT,
    })

    expect(result).toBeNull()
  })

  it('returns null when the ticks are inverted or missing', () => {
    expect(
      getMinimalPreEstimateIndependentAmount({
        poolOrPair: v3Pool,
        tickLower: FULL_RANGE.tickUpper,
        tickUpper: FULL_RANGE.tickLower,
        currencyA: WETH,
        currencyB: USDT,
      })
    ).toBeNull()
    expect(getMinimalPreEstimateIndependentAmount({ poolOrPair: v3Pool, currencyA: WETH, currencyB: USDT })).toBeNull()
  })

  it('ignores a currency that is not in the pool', () => {
    const result = getMinimalPreEstimateIndependentAmount({
      poolOrPair: v3Pool,
      ...FULL_RANGE,
      currencyA: OTHER,
      currencyB: WETH,
    })

    expect(result?.currency).toBe(WETH)
  })

  it('supports v4 pools with a native side', () => {
    const pool = new V4Pool(
      ETH,
      USDT,
      FeeAmount.MEDIUM,
      spacing,
      '0x0000000000000000000000000000000000000000',
      '4862546267419838844180017',
      '6661209530036967407',
      TICK_CURRENT
    )
    const tickLower = nearestUsableTick(TICK_CURRENT + 6000, spacing)
    const result = getMinimalPreEstimateIndependentAmount({
      poolOrPair: pool,
      tickLower,
      tickUpper: tickLower + 600,
      currencyA: USDT,
      currencyB: ETH,
    })

    expect(result?.currency).toBe(ETH)
  })

  it('quotes v2 pairs against reserves and picks the smaller valid raw amount', () => {
    // 1,000 WETH : 3,000,000 USDT
    const pair = new Pair(
      CurrencyAmount.fromRawAmount(WETH, (1000n * 10n ** 18n).toString()),
      CurrencyAmount.fromRawAmount(USDT, (3_000_000n * 10n ** 6n).toString())
    )
    const result = getMinimalPreEstimateIndependentAmount({ poolOrPair: pair, currencyA: ETH, currencyB: USDT })

    expect(result?.currency).toBe(USDT)
    expect(result?.quotient.toString()).toEqual('1000')
  })

  it('returns null for an empty v2 pair', () => {
    const pair = new Pair(CurrencyAmount.fromRawAmount(WETH, 0), CurrencyAmount.fromRawAmount(USDT, 0))

    expect(getMinimalPreEstimateIndependentAmount({ poolOrPair: pair, currencyA: WETH, currencyB: USDT })).toBeNull()
  })

  it('breaks ties in favor of currencyA', () => {
    const t0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0')
    const t1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1')
    const pool = new V3Pool(t0, t1, FeeAmount.MEDIUM, encodeSqrtRatioX96(1, 1), 0, 0)

    const result = getMinimalPreEstimateIndependentAmount({
      poolOrPair: pool,
      ...FULL_RANGE,
      currencyA: t1,
      currencyB: t0,
    })

    expect(result?.currency).toBe(t1)
  })
})
