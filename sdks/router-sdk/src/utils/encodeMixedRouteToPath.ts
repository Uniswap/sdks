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
 * @param useMixedRouterQuoteV2 if true, uses the Mixed Quoter V2 encoding for v4 pools. By default, we do not set it. This is only used in SOR for explicit setting during onchain quoting.
 * @returns the exactIn encoded path
 */
export function encodeMixedRouteToPath(
  route: MixedRouteSDK<Currency, Currency>,
  useMixedRouterQuoteV2?: boolean
): string {
  const containsV4Pool = useMixedRouterQuoteV2 ?? route.pools.some((pool) => pool instanceof V4Pool)

  let path: (string | number)[]
  let types: string[]

  if (containsV4Pool) {
    path = [route.pathInput.isNative ? ADDRESS_ZERO : route.pathInput.address]
    types = ['address']

    // route.path[i + 1] is always pool i's own currency object -- the MixedRouteSDK constructor
    // already resolves native/wrapped boundaries (including cases where neither the input nor
    // output currency instance is literally `.equals()` to either of the pool's own token
    // objects), so reading it directly is reliable. Re-deriving the output token here via
    // `currencyIn.equals(pool.token0) ? pool.token1 : pool.token0` silently falls through to
    // `pool.token0` whenever neither side matches by exact reference, which can pick the wrong
    // side of the pool at a native/wrapped boundary (see fix(router-sdk) ROUTE-886 / #706, which
    // fixed the identical fallthrough pattern in `MixedRouteSDK.midPrice` and `getOutputOfPools`).
    for (const [i, pool] of route.pools.entries()) {
      const currencyOut = route.path[i + 1]

      if (pool instanceof V4Pool) {
        // a tickSpacing of 0 indicates a "fake" v4 pool where the quote actually requires a wrap or unwrap
        // the fake v4 pool will always have native as token0 and wrapped native as token1
        if (pool.tickSpacing === 0) {
          const wrapOrUnwrapEncoding = 0
          path.push(wrapOrUnwrapEncoding, currencyOut.isNative ? ADDRESS_ZERO : currencyOut.wrapped.address)
          types.push('uint8', 'address')
        } else {
          const v4Fee = pool.fee + MIXED_QUOTER_V2_V4_FEE_PATH_PLACEHOLDER
          path.push(
            v4Fee,
            pool.tickSpacing,
            pool.hooks,
            currencyOut.isNative ? ADDRESS_ZERO : currencyOut.wrapped.address
          )
          types.push('uint24', 'uint24', 'address', 'address')
        }
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
    }
  } else {
    // TODO: ROUTE-276 - delete this else block
    // We introduced this else block as a safety measure to prevent non-v4 mixed routes from potentially regressing
    // We'd like to gain more confidence in the new implementation before removing this block

    // Same fix as the v4 branch above: read each hop's currency straight from route.path (which
    // the MixedRouteSDK constructor already resolves correctly, including native/wrapped
    // boundaries) instead of re-deriving it here via `pool.token0.equals(inputToken) ? ... :
    // pool.token0`, which silently falls through to `pool.token0` whenever `inputToken` doesn't
    // exactly match either side of the pool (e.g. `route.input` is native ETH but the pool's
    // tokens are the wrapped form). This also fixes seeding from `route.input`, which may be
    // native, instead of `route.pathInput` (route.path[0]), which is already resolved to the
    // form the first pool actually holds.
    const result = route.pools.reduce(
      (
        { path, types }: { path: (string | number)[]; types: string[] },
        pool: TPool,
        index
      ): { path: (string | number)[]; types: string[] } => {
        const inputToken = route.path[index]
        const outputToken = route.path[index + 1]
        if (index === 0) {
          return {
            types: ['address', 'uint24', 'address'],
            path: [
              inputToken.wrapped.address,
              pool instanceof V3Pool ? pool.fee : MIXED_QUOTER_V1_V2_FEE_PATH_PLACEHOLDER,
              outputToken.wrapped.address,
            ],
          }
        } else {
          return {
            types: [...types, 'uint24', 'address'],
            path: [
              ...path,
              pool instanceof V3Pool ? pool.fee : MIXED_QUOTER_V1_V2_FEE_PATH_PLACEHOLDER,
              outputToken.wrapped.address,
            ],
          }
        }
      },
      { path: [], types: [] }
    )

    path = result.path
    types = result.types
  }

  return pack(types, path)
}
