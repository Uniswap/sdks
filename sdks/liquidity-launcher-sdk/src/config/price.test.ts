import { describe, expect, it } from 'bun:test'

import { Q96 } from '../constants'

import { deriveAuctionPricing, fdvUsdToPricePerToken, floorPriceToX96, requiredCurrencyRaised } from './price'

describe('floorPriceToX96', () => {
  it('encodes a 1:1 price (equal decimals) as exactly 2^96', () => {
    expect(floorPriceToX96('1', 18, 18)).toBe(Q96)
  })

  it('scales by the currency/token decimal difference', () => {
    // 1 token priced at 1 USDC (6 decimals) vs an 18-decimal token.
    expect(floorPriceToX96('1', 18, 6)).toBe(Q96 / 10n ** 12n)
  })

  it('rejects a non-numeric floor price', () => {
    expect(() => floorPriceToX96('abc', 18, 18)).toThrow()
  })
})

describe('requiredCurrencyRaised', () => {
  it('is supply * floorPrice / 2^96', () => {
    expect(requiredCurrencyRaised(Q96, 5_000n)).toBe(5_000n)
  })
})

describe('fdvUsdToPricePerToken', () => {
  it('is (fdv / supply) / raise-currency price, as a plain decimal', () => {
    // $10k FDV over 1B tokens at $2,500/ETH = 1e-5 / 2500 = 4e-9 ETH per token.
    expect(fdvUsdToPricePerToken(10_000, 1_000_000_000n, 2_500)).toBe('0.000000004')
  })

  it('accepts a numeric supply and emits no scientific notation or trailing zeros', () => {
    expect(fdvUsdToPricePerToken(1_000, 1_000_000_000, 2_000)).toBe('0.0000000005')
  })

  it('rejects a non-positive or non-finite FDV', () => {
    expect(() => fdvUsdToPricePerToken(0, 1_000_000_000n, 2_500)).toThrow('FDV')
    expect(() => fdvUsdToPricePerToken(Number.NaN, 1_000_000_000n, 2_500)).toThrow('FDV')
  })

  it('rejects a non-positive supply', () => {
    expect(() => fdvUsdToPricePerToken(10_000, 0n, 2_500)).toThrow('supply')
  })

  it('rejects a missing/invalid raise-currency price', () => {
    expect(() => fdvUsdToPricePerToken(10_000, 1_000_000_000n, 0)).toThrow('Raise-currency')
    expect(() => fdvUsdToPricePerToken(10_000, 1_000_000_000n, Number.NaN)).toThrow('Raise-currency')
  })

  it('rejects a price that rounds to zero at 18 decimals', () => {
    expect(() => fdvUsdToPricePerToken(1e-12, 1_000_000_000n, 2_500)).toThrow('rounds to zero')
  })
})

describe('deriveAuctionPricing', () => {
  it('derives tickSpacing = floor/100 and snaps the floor down to a tick boundary', () => {
    const { floorPriceX96, tickSpacing } = deriveAuctionPricing(12_345n)
    expect(tickSpacing).toBe(123n)
    expect(floorPriceX96).toBe(12_300n)
    expect(floorPriceX96 % tickSpacing).toBe(0n)
  })
})
