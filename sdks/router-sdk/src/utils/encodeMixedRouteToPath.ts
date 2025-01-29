import { pack } from '@ethersproject/solidity'
import { Currency } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { Pool as V3Pool } from '@uniswap/v3-sdk'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import {
  ADDRESS_ZERO,
  MIXED_QUOTER_V2_V2_FEE_PATH_PLACEHOLDER,
  MIXED_QUOTER_V2_V3_FEE_PATH_PLACEHOLDER,
  MIXED_QUOTER_V2_V4_FEE_PATH_PLACEHOLDER,
  MIXED_QUOTER_V1_V2_FEE_PATH_PLACEHOLDER,
} from '../constants'
import { MixedRouteSDK } from '../entities/mixedRoute/route'
import { TPool } from './TPool'

/**
 * Converts a route to a hex encoded path
 * @notice only supports exactIn route encodings
 * @param route the mixed path to convert to an encoded path
 * @returns the exactIn encoded path
 */
export function encodeMixedRouteToPath(route: MixedRouteSDK<Currency, Currency>): string {
  const containsV4Pool = route.pools.some((pool) => pool instanceof V4Pool)

  let path: (string | number)[]
  let types: string[]

  if (containsV4Pool) {
    path = [route.pathInput.isNative ? ADDRESS_ZERO : route.pathInput.address]
    types = ['address']
    let currencyIn = route.pathInput
    let lastCurrencyOut = undefined

    for (let i = 0; i < route.pools.length; i++) {
      const pool = route.pools[i]
      // it's possible lastCurrencyOut is native and currencyIn is wrapped native, or vice versa
      // in this case we need to wrap both and check they are equal
      const currencyOut = currencyIn.wrapped.equals(pool.token0.wrapped) ? pool.token1 : pool.token0

      if (lastCurrencyOut) {
        const lastCurrencyOutNativeCurrencyInWrapped = lastCurrencyOut.isNative && currencyIn.isToken && lastCurrencyOut.wrapped.equals(currencyIn)
        const lastCurrencyOutWrappedCurrencyInNative = lastCurrencyOut.isToken && currencyIn.isNative && lastCurrencyOut.equals(currencyIn.wrapped)

        if (lastCurrencyOutWrappedCurrencyInNative) {
          const v0SpecialEncoding = 0
          path.push(v0SpecialEncoding, ADDRESS_ZERO)
          types.push('uint8', 'address')
        }

        if (lastCurrencyOutNativeCurrencyInWrapped) {
            const v0SpecialEncoding = 0
            path.push(v0SpecialEncoding, currencyIn.wrapped.address)
            types.push('uint8', 'address')
        }
      }

      if (pool instanceof V4Pool) {
        const v4Fee = pool.fee + MIXED_QUOTER_V2_V4_FEE_PATH_PLACEHOLDER
        path.push(
          v4Fee,
          pool.tickSpacing,
          pool.hooks,
          currencyOut.isNative ? ADDRESS_ZERO : currencyOut.wrapped.address
        )
        types.push('uint24', 'uint24', 'address', 'address')
      } else if (pool instanceof V3Pool) {
        const v3Fee = pool.fee + MIXED_QUOTER_V2_V3_FEE_PATH_PLACEHOLDER
        path.push(v3Fee, currencyOut.wrapped.address)
        types.push('uint24', 'address')
      } else if (pool instanceof Pair) {
        const v2Fee = MIXED_QUOTER_V2_V2_FEE_PATH_PLACEHOLDER
        path.push(v2Fee, currencyOut.wrapped.address)
        types.push('uint8', 'address')
      } else {
        throw new Error(`Unsupported pool type ${JSON.stringify(pool)}`)
      }

      currencyIn = currencyOut
      lastCurrencyOut = currencyOut
    }
  } else {
    // TODO: ROUTE-276 - delete this else block
    // We introduced this else block as a safety measure to prevent non-v4 mixed routes from potentially regressing
    // We'd like to gain more confidence in the new implementation before removing this block
    const result = route.pools.reduce(
      (
        { inputToken, path, types }: { inputToken: Currency; path: (string | number)[]; types: string[] },
        pool: TPool,
        index
      ): { inputToken: Currency; path: (string | number)[]; types: string[] } => {
        const outputToken: Currency = pool.token0.equals(inputToken) ? pool.token1 : pool.token0
        if (index === 0) {
          return {
            inputToken: outputToken,
            types: ['address', 'uint24', 'address'],
            path: [
              inputToken.wrapped.address,
              pool instanceof V3Pool ? pool.fee : MIXED_QUOTER_V1_V2_FEE_PATH_PLACEHOLDER,
              outputToken.wrapped.address,
            ],
          }
        } else {
          return {
            inputToken: outputToken,
            types: [...types, 'uint24', 'address'],
            path: [
              ...path,
              pool instanceof V3Pool ? pool.fee : MIXED_QUOTER_V1_V2_FEE_PATH_PLACEHOLDER,
              outputToken.wrapped.address,
            ],
          }
        }
      },
      { inputToken: route.input, path: [], types: [] }
    )

    path = result.path
    types = result.types
  }

  return pack(types, path)
}
