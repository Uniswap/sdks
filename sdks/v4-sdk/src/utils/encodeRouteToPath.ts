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
  // create a deep copy of pools so that we don't tamper with pool array on route
  let pools = route.pools.map((p) => p)
  if (exactOutput) pools = pools.reverse()
  let startingCurrency = exactOutput ? route.pathOutput : route.pathInput
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
