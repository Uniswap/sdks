import { describe, expect, it } from 'bun:test'

import { Q96 } from '../constants'

import { deriveAuctionPricing, floorPriceToX96, requiredCurrencyRaised } from './price'

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

describe('deriveAuctionPricing', () => {
  it('derives tickSpacing = floor/100 and snaps the floor down to a tick boundary', () => {
    const { floorPriceX96, tickSpacing } = deriveAuctionPricing(12_345n)
    expect(tickSpacing).toBe(123n)
    expect(floorPriceX96).toBe(12_300n)
    expect(floorPriceX96 % tickSpacing).toBe(0n)
  })
})
