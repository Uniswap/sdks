import { Currency } from '@uniswap/sdk-core'
import { Route } from '../entities/route'
import { ADDRESS_ZERO } from '../internalConstants'

export type PathKey = {
  intermediateCurrency: string // address
  fee: number
  tickSpacing: number
  hooks: string // address
  hookData: string // bytes
}

export const encodeRouteToPath = (route: Route<Currency, Currency>, exactOutput?: boolean): PathKey[] => {
  let startingCurrency = exactOutput ? route.output : route.input
  let pools = exactOutput ? route.pools.reverse() : route.pools
  let pathKeys: PathKey[] = []

  for (let pool of pools) {
    const nextCurrency = startingCurrency.equals(pool.currency0) ? pool.currency1 : pool.currency0

    pathKeys.push({
      intermediateCurrency: nextCurrency.isNative ? ADDRESS_ZERO : nextCurrency.address,
      fee: pool.fee,
      tickSpacing: pool.tickSpacing,
      hooks: pool.hooks,
      hookData: '0x',
    })

    startingCurrency = nextCurrency
  }

  return exactOutput ? pathKeys.reverse() : pathKeys
}
