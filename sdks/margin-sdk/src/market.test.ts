import { describe, expect, test } from 'bun:test'
import { type Address } from 'viem'

import { MarginSdkError } from './errors.js'
import {
  marketHasCurrencies,
  poolKeyMatchesMarket,
  sortsBefore,
  swapZeroForOne,
  toPoolKey,
  validateMarket,
} from './market.js'
import { type PoolKey } from './types.js'

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const ZERO: Address = '0x0000000000000000000000000000000000000000'
const OTHER: Address = '0x9A7f8F5A9496D3c9dc0BEEfb44cCaC17CAAF28fa'

const LONG = { collateral: WETH, debt: USDC } // long ETH
const SHORT = { collateral: USDC, debt: WETH } // short ETH
const POOL: PoolKey = { currency0: USDC, currency1: WETH, fee: 3000, tickSpacing: 60, hooks: ZERO }

describe('toPoolKey', () => {
  test('sorts currencies canonically regardless of input order', () => {
    expect(toPoolKey({ currencyA: WETH, currencyB: USDC, fee: 3000, tickSpacing: 60 })).toEqual(POOL)
    expect(toPoolKey({ currencyA: USDC, currencyB: WETH, fee: 3000, tickSpacing: 60 })).toEqual(POOL)
    expect(sortsBefore(USDC, WETH)).toBe(true)
  })

  test('rejects identical currencies', () => {
    expect(() => toPoolKey({ currencyA: WETH, currencyB: WETH, fee: 3000, tickSpacing: 60 })).toThrow(MarginSdkError)
  })
})

describe('market validation', () => {
  test('accepts long and short pairings, matches pools order-insensitively', () => {
    validateMarket(LONG)
    validateMarket(SHORT)
    expect(poolKeyMatchesMarket(POOL, LONG)).toBe(true)
    expect(poolKeyMatchesMarket(POOL, SHORT)).toBe(true)
    expect(marketHasCurrencies(LONG, USDC, WETH)).toBe(true)
    expect(marketHasCurrencies(LONG, USDC, OTHER)).toBe(false)
  })

  test('rejects native-ETH and self-pairs', () => {
    expect(() => validateMarket({ collateral: ZERO, debt: USDC })).toThrow(MarginSdkError)
    expect(() => validateMarket({ collateral: WETH, debt: WETH })).toThrow(MarginSdkError)
  })
})

describe('swapZeroForOne (Market.toSwapParams direction mirror)', () => {
  test('long open sells USDC debt: USDC is currency0 → zeroForOne', () => {
    expect(swapZeroForOne(LONG, USDC, POOL)).toBe(true)
  })

  test('long close sells WETH collateral: WETH is currency1 → !zeroForOne', () => {
    expect(swapZeroForOne(LONG, WETH, POOL)).toBe(false)
  })

  test('short open sells WETH debt → !zeroForOne', () => {
    expect(swapZeroForOne(SHORT, WETH, POOL)).toBe(false)
  })

  test('rejects a pool/market mismatch and a non-market input (MarketSwapMismatch mirror)', () => {
    const wrongPool: PoolKey = { ...POOL, currency0: OTHER }
    expect(() => swapZeroForOne(LONG, USDC, wrongPool)).toThrow(MarginSdkError)
    expect(() => swapZeroForOne(LONG, OTHER, POOL)).toThrow(MarginSdkError)
  })
})

describe('toPoolKey bounds', () => {
  test('rejects out-of-range fees but accepts the dynamic-fee flag', () => {
    expect(() => toPoolKey({ currencyA: WETH, currencyB: USDC, fee: 1_000_001, tickSpacing: 60 })).toThrow(
      MarginSdkError
    )
    expect(() => toPoolKey({ currencyA: WETH, currencyB: USDC, fee: -1, tickSpacing: 60 })).toThrow(MarginSdkError)
    expect(() => toPoolKey({ currencyA: WETH, currencyB: USDC, fee: 0x800000, tickSpacing: 60 })).not.toThrow()
  })

  test('rejects out-of-range tick spacings', () => {
    expect(() => toPoolKey({ currencyA: WETH, currencyB: USDC, fee: 3000, tickSpacing: 0 })).toThrow(MarginSdkError)
    expect(() => toPoolKey({ currencyA: WETH, currencyB: USDC, fee: 3000, tickSpacing: 32_768 })).toThrow(
      MarginSdkError
    )
    expect(() => toPoolKey({ currencyA: WETH, currencyB: USDC, fee: 3000, tickSpacing: 2.5 })).toThrow(MarginSdkError)
  })

  test('rejects malformed addresses', () => {
    expect(() => toPoolKey({ currencyA: '0xnope' as never, currencyB: USDC, fee: 3000, tickSpacing: 60 })).toThrow(
      MarginSdkError
    )
    expect(() => validateMarket({ collateral: '0x12' as never, debt: USDC })).toThrow(MarginSdkError)
  })
})
