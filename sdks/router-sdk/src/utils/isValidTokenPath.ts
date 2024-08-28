import { Currency, Token } from '@uniswap/sdk-core'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import { Pair } from '@uniswap/v2-sdk'
import { Pool as V3Pool } from '@uniswap/v3-sdk'

type TPool = Pair | V3Pool | V4Pool

export function isValidTokenPath(prevPool: TPool, currentPool: TPool, inputToken: Currency): boolean {
  if (currentPool.involvesToken(inputToken as Token)) return true

  // throw if both v4 pools, native/wrapped tokens not interchangeable in v4
  if (prevPool instanceof V4Pool && currentPool instanceof V4Pool) return false

  // v2/v3 --> v4 valid if v2/v3 output is the wrapped version of the v4 pool native currency
  if (currentPool instanceof V4Pool){
    if (currentPool.token0.wrapped.equals(inputToken) || currentPool.token1.wrapped.equals(inputToken)) return true
  }

  // v4 --> v2/v3 valid if v4 output is the native version of the v2/v3 wrapped token
  if (prevPool instanceof V4Pool) {
    if (currentPool.involvesToken(inputToken.wrapped)) return true
  }

  return false
}
