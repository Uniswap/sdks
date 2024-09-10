import { Currency } from '@uniswap/sdk-core'
import { Route } from '../entities/route'
import { ADDRESS_ZERO } from './internalConstants'

export type PathKey = {
  intermediateCurrency: string // address
  fee: number
  tickSpacing: number
  hooks: string // address
  hookData: string // bytes
}

export const encodeRouteToPath = (route: Route<Currency, Currency>): PathKey[] => {
  let currencyIn = route.input
  let pathKeys: PathKey[] = []

  for (let pool of route.pools) {
    const currencyOut = currencyIn.equals(pool.currency0) ? pool.currency1 : pool.currency0

    pathKeys.push({
      intermediateCurrency: currencyOut.isNative ? ADDRESS_ZERO : currencyOut.address,
      fee: pool.fee,
      tickSpacing: pool.tickSpacing,
      hooks: pool.hooks,
      hookData: '0x',
    })

    currencyIn = currencyOut
  }

  return pathKeys
}
