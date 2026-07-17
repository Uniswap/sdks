import { Ether, Token } from '@uniswap/sdk-core'
import { describe, expect, it } from 'bun:test'

import { BlockfeedError } from '../errors'

import { priceFromSqrtPriceX96, priceFromV2Reserves } from './sqrtPrice'

// Real mainnet currencies used across the golden vectors. token0/token1 are the pool's
// address-sorted currencies: USDC (0xA0b8…) sorts before WETH (0xC02a…).
const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin')
const WETH = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WETH', 'Wrapped Ether')
const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'Dai Stablecoin')
const ETH = Ether.onChain(1)

const Q96 = 2n ** 96n
const Q192 = 2n ** 192n

describe('priceFromSqrtPriceX96', () => {
  it('sqrtPriceX96 = 2^96 with equal decimals → price of token0 in token1 is exactly 1', () => {
    // token0=DAI(18), token1=WETH(18). sqrtP=2^96 ⇒ sqrtP²/2¹⁹² = 1.
    const price = priceFromSqrtPriceX96({ sqrtPriceX96: Q96, token0: DAI, token1: WETH, base: DAI, quote: WETH })
    expect(price.toSignificant(6)).toBe('1')
    // Independent raw ratio: numerator/denominator = 1/1.
    expect(price.numerator.toString()).toBe(price.denominator.toString())
  })

  it('realistic USDC/WETH v3 sqrtPriceX96 → price of WETH in USDC ≈ 2000', () => {
    const sqrtPriceX96 = 1771595571142957102961017161607260n
    // base=WETH (token1), quote=USDC (token0): USDC-raw per WETH-raw = Q192 / sqrtP².
    const price = priceFromSqrtPriceX96({ sqrtPriceX96, token0: USDC, token1: WETH, base: WETH, quote: USDC })
    // Independent arithmetic (BigInt): human USDC/WETH = (Q192 / sqrtP²) * 10^(18-6).
    const sqrtSq = sqrtPriceX96 * sqrtPriceX96
    // Scale to keep integer precision, then read the leading digits.
    const scaled = (Q192 * 10n ** 12n * 10n ** 6n) / sqrtSq // ×10^6 extra for rounding headroom
    const leadingDigits = (scaled / 10n ** 6n).toString() // → "2000"
    expect(leadingDigits).toBe('2000')
    expect(price.toSignificant(5).startsWith('2000')).toBe(true)
  })

  it('inverts correctly: price(token0 in token1) is the reciprocal of price(token1 in token0)', () => {
    const sqrtPriceX96 = 1771595571142957102961017161607260n
    const usdcInWeth = priceFromSqrtPriceX96({ sqrtPriceX96, token0: USDC, token1: WETH, base: USDC, quote: WETH })
    const wethInUsdc = priceFromSqrtPriceX96({ sqrtPriceX96, token0: USDC, token1: WETH, base: WETH, quote: USDC })
    // Raw fractions are exact reciprocals.
    expect(usdcInWeth.numerator.toString()).toBe(wethInUsdc.denominator.toString())
    expect(usdcInWeth.denominator.toString()).toBe(wethInUsdc.numerator.toString())
    expect(wethInUsdc.invert().toSignificant(8)).toBe(usdcInWeth.toSignificant(8))
  })

  it('handles decimal asymmetry: USDC(6) in WETH(18) ≈ 0.0005', () => {
    const sqrtPriceX96 = 1771595571142957102961017161607260n
    const price = priceFromSqrtPriceX96({ sqrtPriceX96, token0: USDC, token1: WETH, base: USDC, quote: WETH })
    // Independent: 1 / 2000 = 0.0005.
    expect(price.toSignificant(4)).toBe('0.0005')
  })

  it('treats native ETH and WETH as equivalent via wrapped comparison', () => {
    const sqrtPriceX96 = 1771595571142957102961017161607260n
    // Pool is token0=USDC, token1=WETH, but caller prices native ETH.
    const price = priceFromSqrtPriceX96({ sqrtPriceX96, token0: USDC, token1: WETH, base: ETH, quote: USDC })
    expect(price.baseCurrency.isNative).toBe(true)
    expect(price.toSignificant(5).startsWith('2000')).toBe(true)
  })

  it('throws when base/quote are not the pool currencies', () => {
    expect(() =>
      priceFromSqrtPriceX96({ sqrtPriceX96: Q96, token0: USDC, token1: WETH, base: DAI, quote: WETH })
    ).toThrow(BlockfeedError)
  })
})

describe('priceFromV2Reserves', () => {
  it('spot price = reserve1 / reserve0 (raw), adjusted for decimals', () => {
    // 2,000,000 USDC (6dp) and 1000 WETH (18dp) ⇒ 2000 USDC per WETH.
    const reserve0 = 2_000_000n * 10n ** 6n // USDC
    const reserve1 = 1000n * 10n ** 18n // WETH
    const price = priceFromV2Reserves({ reserve0, reserve1, token0: USDC, token1: WETH, base: WETH, quote: USDC })
    expect(price.toSignificant(6)).toBe('2000')
  })

  it('inverts for the opposite orientation', () => {
    const reserve0 = 2_000_000n * 10n ** 6n
    const reserve1 = 1000n * 10n ** 18n
    const price = priceFromV2Reserves({ reserve0, reserve1, token0: USDC, token1: WETH, base: USDC, quote: WETH })
    expect(price.toSignificant(4)).toBe('0.0005')
  })

  it('throws when base/quote are not the pool currencies', () => {
    expect(() =>
      priceFromV2Reserves({ reserve0: 1n, reserve1: 1n, token0: USDC, token1: WETH, base: DAI, quote: WETH })
    ).toThrow(BlockfeedError)
  })
})
