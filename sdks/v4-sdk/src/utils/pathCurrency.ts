import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { Pool } from '../entities/pool'

export function amountWithPathCurrency(amount: CurrencyAmount<Currency>, pool: Pool): CurrencyAmount<Currency> {
  return CurrencyAmount.fromFractionalAmount(
    getPathCurrency(amount.currency, pool),
    amount.numerator,
    amount.denominator
  )
}

export function getPathCurrency(currency: Currency, pool: Pool): Currency {
  if (pool.involvesCurrency(currency)) {
    return currency
  } else if (pool.involvesCurrency(currency.wrapped)) {
    return currency.wrapped
  } else if (pool.currency0.wrapped.equals(currency)) {
    return pool.currency0
  } else if (pool.currency1.wrapped.equals(currency)) {
    return pool.currency1
  } else {
    throw new Error(
      `Expected currency ${currency.symbol} to be either ${pool.currency0.symbol} or ${pool.currency1.symbol}`
    )
  }
}
