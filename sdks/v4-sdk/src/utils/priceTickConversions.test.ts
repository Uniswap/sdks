import { Ether, Price, Token } from '@uniswap/sdk-core'
import { TickMath, priceToClosestTick as priceToClosestTickV3, tickToPrice as tickToPriceV3 } from '@uniswap/v3-sdk'
import { priceToClosestTick, tickToPrice } from './priceTickConversions'

describe('priceTickConversions', () => {
  /**
   * Creates an example token with a specific sort order
   */
  function token({
    sortOrder,
    decimals = 18,
    chainId = 1,
  }: {
    sortOrder: number
    decimals?: number
    chainId?: number
  }): Token {
    if (sortOrder > 9 || sortOrder % 1 !== 0) throw new Error('invalid sort order')
    return new Token(
      chainId,
      `0x${new Array<string>(40).fill(`${sortOrder}`).join('')}`,
      decimals,
      `T${sortOrder}`,
      `token${sortOrder}`
    )
  }

  const token0 = token({ sortOrder: 0 })
  const token1 = token({ sortOrder: 1 })
  const token2_6decimals = token({ sortOrder: 2, decimals: 6 })
  const ether = Ether.onChain(1)

  describe('#tickToPrice', () => {
    // This library is a port of the v3-sdk one, so a token pair has to keep
    // producing the price the v3-sdk produces.
    it.each([-276225, -74959, 0, 74959, 276225])('matches the v3-sdk for a token pair at tick %i', (tick) => {
      expect(tickToPrice(token1, token0, tick).toSignificant(6)).toEqual(
        tickToPriceV3(token1, token0, tick).toSignificant(6)
      )
    })

    it('matches the v3-sdk across a decimal difference', () => {
      expect(tickToPrice(token0, token2_6decimals, -276225).toSignificant(5)).toEqual(
        tickToPriceV3(token0, token2_6decimals, -276225).toSignificant(5)
      )
    })

    // Ether has no address, so it takes the same position against token1 that
    // token0 does.
    it('sorts ether before a token', () => {
      const withEther = tickToPrice(ether, token1, 74959)
      const withToken = tickToPrice(token0, token1, 74959)

      expect(withEther.numerator.toString()).toEqual(withToken.numerator.toString())
      expect(withEther.denominator.toString()).toEqual(withToken.denominator.toString())
      expect(withEther.toSignificant(5)).toEqual('1800')
    })

    it('inverts when ether is the quote currency', () => {
      expect(tickToPrice(token1, ether, 74959).toSignificant(5)).toEqual(
        tickToPrice(ether, token1, 74959).invert().toSignificant(5)
      )
    })

    it('scales by the quote currency decimals when ether is the base', () => {
      expect(tickToPrice(ether, token2_6decimals, -276225).toSignificant(5)).toEqual('1.01')
    })
  })

  describe('#priceToClosestTick', () => {
    it('matches the v3-sdk for a token pair', () => {
      const price = new Price(token1, token0, 1, 1800)

      expect(priceToClosestTick(price)).toEqual(priceToClosestTickV3(price))
    })

    it('handles ether as the base currency', () => {
      expect(priceToClosestTick(new Price(ether, token1, 1800, 1))).toEqual(-74960)
    })

    it('handles ether as the quote currency', () => {
      expect(priceToClosestTick(new Price(token1, ether, 1, 1800))).toEqual(-74960)
    })

    describe('reciprocal with tickToPrice', () => {
      const ticks = [TickMath.MIN_TICK, -276225, -74960, -1, 0, 1, 74960, 276225, TickMath.MAX_TICK - 1]

      it.each([
        ['a token pair', token1, token0],
        ['ether as the base currency', ether, token1],
        ['ether as the quote currency', token1, ether],
        ['ether against a 6 decimal token', ether, token2_6decimals],
      ] as const)('round trips every tick with %s', (_name, base, quote) => {
        for (const tick of ticks) expect(priceToClosestTick(tickToPrice(base, quote, tick))).toEqual(tick)
      })
    })
  })
})
