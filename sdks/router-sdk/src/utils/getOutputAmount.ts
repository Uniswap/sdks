import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import { Pair } from '@uniswap/v2-sdk'
import { Pool as V3Pool } from '@uniswap/v3-sdk'

type TPool = Pair | V3Pool | V4Pool

export async function getOutputAmount(
  pool: TPool,
  amountIn: CurrencyAmount<Currency>
): Promise<[CurrencyAmount<Currency>, TPool]> {
  if (pool instanceof V4Pool) {
    if (pool.involvesCurrency(amountIn.currency)) {
      return await pool.getOutputAmount(amountIn)
    } else if (pool.involvesCurrency(amountIn.currency.wrapped)) {
      return await pool.getOutputAmount(amountIn.wrapped)
    }
  }
  return await pool.getOutputAmount(amountIn.wrapped)
}
