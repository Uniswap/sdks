import {pack} from '@ethersproject/solidity'
import {Protocol} from "@uniswap/router-sdk/src/entities/protocol";
import {Currency} from '@uniswap/sdk-core'
import {Pair} from '@uniswap/v2-sdk'
import {Pool as V3Pool} from '@uniswap/v3-sdk'
import {Pool as V4Pool} from '@uniswap/v4-sdk'
import {
  MIXED_QUOTER_V2_V2_FEE_PATH_PLACEHOLDER,
  MIXED_QUOTER_V2_V3_FEE_PATH_PLACEHOLDER,
  MIXED_QUOTER_V2_V4_FEE_PATH_PLACEHOLDER,
  V2_FEE_PATH_PLACEHOLDER
} from '../constants'
import {MixedRouteSDK} from '../entities/mixedRoute/route'
import { TPool } from './TPool';

/**
 * Converts a route to a hex encoded path
 * @notice only supports exactIn route encodings
 * @param route the mixed path to convert to an encoded path
 * @returns the exactIn encoded path
 */
export function encodeMixedRouteToPath(route: MixedRouteSDK<Currency, Currency>): string {
  const firstInputToken: Currency = route.input.wrapped

  const routeContainsV4Pool = (route.pools.filter((pool) => pool instanceof V4Pool).length > 0);

  const { path, types } = route.pools.reduce(
    (
      { inputToken, path, types }: { inputToken: Currency; path: (string | number)[]; types: string[] },
      pool: TPool,
      index
    ): { inputToken: Currency; path: (string | number)[]; types: string[] } => {
      const poolVersion: Protocol = pool instanceof V4Pool ? Protocol.V4 : pool instanceof V3Pool ? Protocol.V3 : Protocol.V2
      const outputToken: Currency = pool.token0.equals(inputToken) ? pool.token1 : pool.token0
      const fee= derivePoolFee(pool)

      if (routeContainsV4Pool) {
        if (index === 0) {
          return {
            inputToken: outputToken,
            types: poolVersionToInputTypes(index, ['address'], poolVersion),
            path: [
              inputToken.wrapped.address,
              fee,
              outputToken.wrapped.address,
            ],
          }
        } else {
          return {
            inputToken: outputToken,
            types: [...poolVersionToInputTypes(index, types, poolVersion)],
            path: [...path, fee, outputToken.wrapped.address],
          }
        }
      } else {
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
      }
    },
    { inputToken: firstInputToken, path: [], types: [] }
  )

  return pack(types, path)
}

export function poolVersionToInputTypes(index: number, prependedTypes: string[], poolVersion: Protocol): string[] {
  switch (poolVersion) {
    case Protocol.V4:
      if (index === 0) {
          return [...prependedTypes, 'uint24', 'uint24', 'address', 'address']
      } else {
          return [...prependedTypes, 'uint24', 'address']
      }
    case Protocol.V3:
      return [...prependedTypes, 'uint24', 'address']
    case Protocol.V2:
      return [...prependedTypes, 'uint8', 'address']
    default:
      throw new Error(`Unsupported pool version ${poolVersion}`)
  }
}

export function derivePoolFee(pool: TPool): number {
  if (pool instanceof Pair) {
    return MIXED_QUOTER_V2_V2_FEE_PATH_PLACEHOLDER
  } else if (pool instanceof V3Pool) {
    return pool.fee + MIXED_QUOTER_V2_V3_FEE_PATH_PLACEHOLDER
  } else if (pool instanceof V4Pool) {
    return pool.fee + MIXED_QUOTER_V2_V4_FEE_PATH_PLACEHOLDER
  } else {
    throw new Error(`Unsupported pool type ${pool}`)
  }
}