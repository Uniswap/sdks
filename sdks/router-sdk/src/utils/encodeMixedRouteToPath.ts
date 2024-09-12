import { pack } from '@ethersproject/solidity'
import { Currency } from '@uniswap/sdk-core'
import { Pool as V3Pool } from '@uniswap/v3-sdk'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import { MixedRouteSDK } from '../entities/mixedRoute/route'
import { V2_FEE_PATH_PLACEHOLDER } from '../constants'
import { TPool } from './TPool'

/**
 * Converts a route to a hex encoded path
 * @notice only supports exactIn route encodings
 * @param route the mixed path to convert to an encoded path
 * @returns the exactIn encoded path
 */
export function encodeMixedRouteToPath(route: MixedRouteSDK<Currency, Currency>): string {
  const firstInputToken: Currency = route.input.wrapped

  const { path, types } = route.pools.reduce(
    (
      { inputToken, path, types }: { inputToken: Currency; path: (string | number)[]; types: string[] },
      pool: TPool,
      index
    ): { inputToken: Currency; path: (string | number)[]; types: string[] } => {
      if (pool instanceof V4Pool) throw 'Encoding mixed routes with V4 not supported'
      const outputToken: Currency = pool.token0.equals(inputToken) ? pool.token1 : pool.token0
      if (index === 0) {
        return {
          inputToken: outputToken,
          types: ['address', 'uint24', 'address'],
          path: [
            inputToken.wrapped.address,
            pool instanceof V3Pool ? pool.fee : V2_FEE_PATH_PLACEHOLDER,
            outputToken.wrapped.address,
          ],
        }
      } else {
        return {
          inputToken: outputToken,
          types: [...types, 'uint24', 'address'],
          path: [...path, pool instanceof V3Pool ? pool.fee : V2_FEE_PATH_PLACEHOLDER, outputToken.wrapped.address],
        }
      }
    },
    { inputToken: firstInputToken, path: [], types: [] }
  )

  return pack(types, path)
}
