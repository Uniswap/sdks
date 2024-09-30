import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import { TPool } from './TPool'

export async function getOutputAmount(
  pool: TPool,
  amountIn: CurrencyAmount<Currency>
): Promise<[CurrencyAmount<Currency>, TPool]> {
  if (pool instanceof V4Pool) {
    if (pool.involvesCurrency(amountIn.currency)) {
      return await pool.getOutputAmount(amountIn)
    }
    if (pool.token0.wrapped.equals(amountIn.currency)) {
      return await pool.getOutputAmount(CurrencyAmount.fromRawAmount(pool.token0, amountIn.quotient))
    }
    if (pool.token1.wrapped.equals(amountIn.currency)) {
      return await pool.getOutputAmount(CurrencyAmount.fromRawAmount(pool.token1, amountIn.quotient))
    }
  }

  return await pool.getOutputAmount(amountIn.wrapped)
}
