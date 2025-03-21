import { Currency, Token } from '@uniswap/sdk-core'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import { TPool } from '@uniswap/router-sdk'

export function getPathCurrency(currency: Currency, pool: TPool): Currency {
  // return currency if the currency matches a currency of the pool
  if (pool.involvesToken(currency as Token)) {
    return currency

    // return if currency.wrapped if pool involves wrapped currency
  } else if (pool.involvesToken(currency.wrapped as Token)) {
    return currency.wrapped

    // return native currency if pool involves native version of wrapped currency (only applies to V4)
  } else if (pool instanceof V4Pool && pool.token0.wrapped.equals(currency)) {
    return pool.token0
  } else if (pool instanceof V4Pool && pool.token1.wrapped.equals(currency)) {
    return pool.token1
  } else {
    throw new Error(`Expected currency ${currency.symbol} to be either ${pool.token0.symbol} or ${pool.token1.symbol}`)
  }

  return currency // this line needed for typescript to compile
}
