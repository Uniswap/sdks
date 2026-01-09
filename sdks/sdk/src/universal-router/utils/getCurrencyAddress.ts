import { Currency } from '../../core'
import { ETH_ADDRESS } from './constants'

export function getCurrencyAddress(currency: Currency): string {
  return currency.isNative ? ETH_ADDRESS : currency.wrapped.address
}
