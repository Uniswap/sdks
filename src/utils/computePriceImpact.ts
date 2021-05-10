import { Currency, CurrencyAmount, Percent, Price } from '../entities'

/**
 * Returns the percent difference between the mid price and the execution price, i.e. price impact.
 * @param midPrice mid price before the trade
 * @param inputAmount the input amount of the trade
 * @param outputAmount the output amount of the trade
 */
export function computePriceImpact<TBase extends Currency, TQuote extends Currency>(
  midPrice: Price<TBase, TQuote>,
  inputAmount: CurrencyAmount<TBase>,
  outputAmount: CurrencyAmount<TQuote>
): Percent {
  const exactQuote = midPrice.raw.multiply(inputAmount.raw)
  // calculate price impact := (exactQuote - outputAmount) / exactQuote
  const priceImpact = exactQuote.subtract(outputAmount.raw).divide(exactQuote)
  return new Percent(priceImpact.numerator, priceImpact.denominator)
}
