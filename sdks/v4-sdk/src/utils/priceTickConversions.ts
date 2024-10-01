import { Price, Currency } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { Q192 } from '../internalConstants'
import { TickMath, encodeSqrtRatioX96 } from '@uniswap/v3-sdk'
import { sortsBefore } from '../utils/sortsBefore'

/**
 * This library is the almost the same as v3-sdk priceTickConversion except
 * that it accepts a Currency type instead of a Token type,
 * and thus uses some helper functions defined for the Currency type over the Token type.
 */

/**
 * Returns a price object corresponding to the input tick and the base/quote token
 * Inputs must be tokens because the address order is used to interpret the price represented by the tick
 * @param baseToken the base token of the price
 * @param quoteToken the quote token of the price
 * @param tick the tick for which to return the price
 */
export function tickToPrice(baseCurrency: Currency, quoteCurrency: Currency, tick: number): Price<Currency, Currency> {
  const sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick)

  const ratioX192 = JSBI.multiply(sqrtRatioX96, sqrtRatioX96)

  return sortsBefore(baseCurrency, quoteCurrency)
    ? new Price(baseCurrency, quoteCurrency, Q192, ratioX192)
    : new Price(baseCurrency, quoteCurrency, ratioX192, Q192)
}

/**
 * Returns the first tick for which the given price is greater than or equal to the tick price
 * @param price for which to return the closest tick that represents a price less than or equal to the input price,
 * i.e. the price of the returned tick is less than or equal to the input price
 */
export function priceToClosestTick(price: Price<Currency, Currency>): number {
  const sorted = sortsBefore(price.baseCurrency, price.quoteCurrency)

  const sqrtRatioX96 = sorted
    ? encodeSqrtRatioX96(price.numerator, price.denominator)
    : encodeSqrtRatioX96(price.denominator, price.numerator)

  let tick = TickMath.getTickAtSqrtRatio(sqrtRatioX96)
  const nextTickPrice = tickToPrice(price.baseCurrency, price.quoteCurrency, tick + 1)
  if (sorted) {
    if (!price.lessThan(nextTickPrice)) {
      tick++
    }
  } else {
    if (!price.greaterThan(nextTickPrice)) {
      tick++
    }
  }
  return tick
}
