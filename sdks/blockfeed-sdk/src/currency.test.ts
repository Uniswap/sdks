import { Ether, Token } from '@uniswap/sdk-core'
import { describe, expect, it } from 'bun:test'

import { isCurrency, normalizeCurrency, toCurrency } from './currency'

const USDC_ADDR = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

describe('toCurrency', () => {
  it("builds native Ether for address 'native'", () => {
    const c = toCurrency({ chainId: 1, address: 'native', decimals: 18, symbol: 'ETH' })
    expect(c.isNative).toBe(true)
    expect(c.chainId).toBe(1)
  })

  it('builds a Token for an ERC-20 address', () => {
    const c = toCurrency({ chainId: 1, address: USDC_ADDR, decimals: 6, symbol: 'USDC' })
    expect(c.isToken).toBe(true)
    expect(c.wrapped.address).toBe(USDC_ADDR)
    expect(c.decimals).toBe(6)
    expect(c.symbol).toBe('USDC')
  })
})

describe('normalizeCurrency / isCurrency', () => {
  it('passes an existing Currency through unchanged', () => {
    const weth = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WETH')
    expect(isCurrency(weth)).toBe(true)
    expect(normalizeCurrency(weth)).toBe(weth)
  })

  it('recognizes a native Currency and a CurrencyInput', () => {
    expect(isCurrency(Ether.onChain(1))).toBe(true)
    expect(isCurrency({ chainId: 1, address: 'native', decimals: 18 })).toBe(false)
    expect(normalizeCurrency({ chainId: 1, address: USDC_ADDR, decimals: 6 }).isToken).toBe(true)
  })
})
