import { Currency, Token } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { Pool as V3Pool } from '@uniswap/v3-sdk'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import { MixedRouteSDK } from '../entities/mixedRoute/route'
import { TPool } from './TPool'

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
      (route.pools[left] instanceof Pair && !(route.pools[right] instanceof Pair))
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
      if (!pool.involvesToken(inputToken as Token)) throw new Error('PATH')
      const outputToken: Currency = pool.token0.equals(inputToken) ? pool.token1 : pool.token0
      return {
        inputToken: outputToken,
      }
    },
    { inputToken: firstInputToken }
  )
  return outputToken
}
