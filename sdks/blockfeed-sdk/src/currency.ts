import { type Currency, Ether, Token } from '@uniswap/sdk-core'
import type { Address } from 'viem'

/**
 * A plain, serializable description of a currency — the shape a frontend typically has on hand (from a
 * token list or an API) before it holds an sdk-core {@link Currency}. `address: 'native'` selects the
 * chain's native currency (ETH); any other value is an ERC-20 token address.
 */
export interface CurrencyInput {
  chainId: number
  address: Address | 'native'
  decimals: number
  symbol?: string
}

/**
 * Build an sdk-core {@link Currency} from a plain {@link CurrencyInput}, wrapping `Ether.onChain`
 * (native) or `Token` (ERC-20). Native currency is always 18 decimals, so `decimals` is ignored when
 * `address === 'native'`.
 */
export function toCurrency(input: CurrencyInput): Currency {
  if (input.address === 'native') return Ether.onChain(input.chainId)
  return new Token(input.chainId, input.address, input.decimals, input.symbol)
}

/** True when `x` is already an sdk-core {@link Currency} (rather than a plain {@link CurrencyInput}). */
export function isCurrency(x: Currency | CurrencyInput): x is Currency {
  return typeof (x as Currency).isToken === 'boolean'
}

/** Normalize a `Currency | CurrencyInput` to a `Currency` (identity for an existing Currency). */
export function normalizeCurrency(x: Currency | CurrencyInput): Currency {
  return isCurrency(x) ? x : toCurrency(x)
}
