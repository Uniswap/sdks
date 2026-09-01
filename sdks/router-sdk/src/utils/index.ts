import { Currency } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { Pool as V3Pool } from '@uniswap/v3-sdk'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import { MixedRouteSDK } from '../entities/mixedRoute/route'
import { TPool } from './TPool'

// `Pair.involvesToken` and `V3Pool.involvesToken` only accept a `Token`, so calling `involvesToken`
// on the `TPool` union with a bare `Currency` (e.g. native ETH from `route.path`) fails to
// typecheck. This checks the same token0/token1 membership but against any `Currency`.
const poolInvolvesCurrency = (pool: TPool, currency: Currency): boolean =>
  pool.token0.equals(currency) || pool.token1.equals(currency)

/**
 * Utility function to return each consecutive section of Pools or Pairs in a MixedRoute
 * @param route
 * @returns a nested array of Pools or Pairs in the order of the route
 */
export const partitionMixedRouteByProtocol = (route: MixedRouteSDK<Currency, Currency>): TPool[][] => {
  let acc = []

  let left = 0
  let right = 0
  while (right < route.pools.length) {
    if (
      (route.pools[left] instanceof V4Pool && !(route.pools[right] instanceof V4Pool)) ||
      (route.pools[left] instanceof V3Pool && !(route.pools[right] instanceof V3Pool)) ||
      (route.pools[left] instanceof Pair && !(route.pools[right] instanceof Pair)) ||
      // a native/wrapped boundary (e.g. a native-ETH v4 pool followed by a WETH v4 pool) needs a
      // wrap/unwrap between sections, so it ends the section even within a single protocol
      !poolInvolvesCurrency(route.pools[right], route.path[right])
    ) {
      acc.push(route.pools.slice(left, right))
      left = right
    }
    // seek forward with right pointer
    right++
    if (right === route.pools.length) {
      /// we reached the end, take the rest
      acc.push(route.pools.slice(left, right))
    }
  }
  return acc
}

/**
 * Simple utility function to get the output of an array of Pools or Pairs
 * @param pools
 * @param firstInputToken
 * @returns the output token of the last pool in the array
 */
export const getOutputOfPools = (pools: TPool[], firstInputToken: Currency): Currency => {
  const { inputToken: outputToken } = pools.reduce(
    ({ inputToken }, pool: TPool): { inputToken: Currency } => {
      // exact matches take priority so genuine ETH/WETH pools resolve to the correct side;
      // the wrapped comparisons bridge native/wrapped boundaries the same way MixedRouteSDK does
      if (pool.token0.equals(inputToken)) return { inputToken: pool.token1 }
      if (pool.token1.equals(inputToken)) return { inputToken: pool.token0 }
      if (pool.token0.wrapped.equals(inputToken.wrapped)) return { inputToken: pool.token1 }
      if (pool.token1.wrapped.equals(inputToken.wrapped)) return { inputToken: pool.token0 }
      throw new Error('PATH')
    },
    { inputToken: firstInputToken }
  )
  return outputToken
}
