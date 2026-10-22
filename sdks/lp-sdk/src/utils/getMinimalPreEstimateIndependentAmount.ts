import { Currency, CurrencyAmount, MaxUint256 } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { maxLiquidityForAmounts, Pool as V3Pool, SqrtPriceMath, TickMath } from '@uniswap/v3-sdk'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import JSBI from 'jsbi'

const ZERO = JSBI.BigInt(0)
const ONE = JSBI.BigInt(1)
const TWO = JSBI.BigInt(2)
const TEN = JSBI.BigInt(10)
const MAX_UINT128 = JSBI.subtract(JSBI.exponentiate(TWO, JSBI.BigInt(128)), ONE)
const MAX_DOUBLINGS = 64

export interface MinimalPreEstimateIndependentAmountParams {
  /**
   * The v2 pair, or the v3/v4 pool (which also requires `tickLower` and `tickUpper`).
   */
  poolOrPair: Pair | V3Pool | V4Pool
  tickLower?: number
  tickUpper?: number
  /**
   * The two currencies the wallet deposits, in either order. A native currency matches its
   * wrapped pool token on v2/v3.
   */
  currencyA: Currency
  currencyB: Currency
}

/**
 * Picks the smallest independent amount that still yields a valid (non-zero liquidity) LP
 * transaction, for simulating the flow's gas before the user has entered an amount.
 *
 * Gas barely depends on the deposit size, so the smallest valid amount is the most robust
 * simulation input: it keeps the dependent side within the wallet's balance. Each currency is
 * tried as the independent side, starting at 10^(decimals / 2) raw units and doubling until the
 * position is valid; the smaller raw amount wins, ties going to `currencyA`. Out-of-range
 * positions are single-sided, so only the side that can provide liquidity qualifies.
 *
 * Returns null when neither side yields a valid amount (e.g. a degenerate tick range or an
 * empty pair).
 */
export function getMinimalPreEstimateIndependentAmount(
  params: MinimalPreEstimateIndependentAmountParams
): CurrencyAmount<Currency> | null {
  const { currencyA, currencyB } = params
  const amountA = minimalAmountFor(params, currencyA)
  const amountB = minimalAmountFor(params, currencyB)

  if (!amountA || !amountB) {
    return amountA ?? amountB
  }
  return JSBI.lessThanOrEqual(amountA.quotient, amountB.quotient) ? amountA : amountB
}

function minimalAmountFor(
  params: MinimalPreEstimateIndependentAmountParams,
  currency: Currency
): CurrencyAmount<Currency> | null {
  const { poolOrPair, tickLower, tickUpper } = params

  const isToken0 = sameToken(currency, poolOrPair.token0)
  if (!isToken0 && !sameToken(currency, poolOrPair.token1)) {
    return null
  }

  let isValid: (amount: JSBI) => boolean
  if (isPair(poolOrPair)) {
    isValid = (amount) => hasNonZeroV2Amounts(poolOrPair, isToken0, amount)
  } else {
    if (tickLower === undefined || tickUpper === undefined || tickLower >= tickUpper) {
      return null
    }
    isValid = (amount) =>
      JSBI.greaterThan(liquidityForIndependentAmount(poolOrPair, tickLower, tickUpper, isToken0, amount), ZERO)
  }

  let amount = JSBI.exponentiate(TEN, JSBI.BigInt(Math.floor(currency.decimals / 2)))
  for (let i = 0; i < MAX_DOUBLINGS && JSBI.lessThanOrEqual(amount, MAX_UINT128); i++) {
    if (isValid(amount)) {
      return CurrencyAmount.fromRawAmount(currency, amount)
    }
    amount = JSBI.multiply(amount, TWO)
  }
  return null
}

function isPair(poolOrPair: Pair | V3Pool | V4Pool): poolOrPair is Pair {
  return 'reserve0' in poolOrPair
}

// Native chains without a wrapped token (e.g. Arc) compare as themselves
function wrappedIfExists(currency: Currency): Currency {
  if (currency.isToken) {
    return currency
  }
  try {
    return currency.wrapped
  } catch {
    return currency
  }
}

function sameToken(a: Currency, b: Currency): boolean {
  return wrappedIfExists(a).equals(wrappedIfExists(b))
}

// The v2 router only needs both deposit amounts to be non-zero; the minted liquidity depends on
// the pair's total supply, which isn't available here.
function hasNonZeroV2Amounts(pair: Pair, independentIsToken0: boolean, amount: JSBI): boolean {
  const reserveIndependent = independentIsToken0 ? pair.reserve0.quotient : pair.reserve1.quotient
  const reserveDependent = independentIsToken0 ? pair.reserve1.quotient : pair.reserve0.quotient
  if (JSBI.equal(reserveIndependent, ZERO)) {
    return false
  }
  return JSBI.greaterThan(JSBI.divide(JSBI.multiply(amount, reserveDependent), reserveIndependent), ZERO)
}

/**
 * Liquidity minted for `amount` of the independent side, following the liquidity service's
 * path: out of range uses the single-sided amount; in range derives the dependent amount the
 * way `Position.fromAmount0/1` does, then recomputes liquidity over both amounts, so an
 * independent amount whose dependent side rounds to zero is rejected.
 */
function liquidityForIndependentAmount(
  pool: V3Pool | V4Pool,
  tickLower: number,
  tickUpper: number,
  independentIsToken0: boolean,
  amount: JSBI
): JSBI {
  const sqrtRatioX96 = pool.sqrtRatioX96
  const sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(tickLower)
  const sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(tickUpper)

  if (JSBI.greaterThanOrEqual(sqrtRatioX96, sqrtRatioBX96)) {
    return independentIsToken0
      ? ZERO
      : maxLiquidityForAmounts(sqrtRatioX96, sqrtRatioAX96, sqrtRatioBX96, ZERO, amount, true)
  }
  if (JSBI.lessThan(sqrtRatioX96, sqrtRatioAX96)) {
    return independentIsToken0
      ? maxLiquidityForAmounts(sqrtRatioX96, sqrtRatioAX96, sqrtRatioBX96, amount, ZERO, true)
      : ZERO
  }

  try {
    if (independentIsToken0) {
      const liquidity = maxLiquidityForAmounts(sqrtRatioX96, sqrtRatioAX96, sqrtRatioBX96, amount, MaxUint256, true)
      const dependent = SqrtPriceMath.getAmount1Delta(sqrtRatioAX96, sqrtRatioX96, liquidity, false)
      return maxLiquidityForAmounts(sqrtRatioX96, sqrtRatioAX96, sqrtRatioBX96, amount, dependent, true)
    }
    const liquidity = maxLiquidityForAmounts(sqrtRatioX96, sqrtRatioAX96, sqrtRatioBX96, MaxUint256, amount, true)
    const dependent = SqrtPriceMath.getAmount0Delta(sqrtRatioX96, sqrtRatioBX96, liquidity, false)
    return maxLiquidityForAmounts(sqrtRatioX96, sqrtRatioAX96, sqrtRatioBX96, dependent, amount, true)
  } catch {
    return ZERO
  }
}
