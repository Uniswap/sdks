import { Currency } from '@uniswap/sdk-core'
import { ADDRESS_ZERO } from '../internalConstants'

// Uniswap v4 supports native pools. Those currencies are represented by the zero address.
// TODO: Figure out if this is how we should be handling weird edge case tokens like CELO/Polygon/etc..
// Does interface treat those like ERC20 tokens or NATIVE tokens?
export function toAddress(currency: Currency): string {
  if (currency.isNative) return ADDRESS_ZERO
  else return currency.wrapped.address
}
