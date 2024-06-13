import { Ether, Token } from '@uniswap/sdk-core'
import { encodeSqrtRatioX96, TickMath } from '@uniswap/v3-sdk'
import { Pool } from './pool'
import { Route } from './route'
import { ADDRESS_ZERO, FEE_AMOUNT_MEDIUM, TICK_SPACING_TEN } from '../utils/internalConstants'

describe('Route', () => {
  const eth = Ether.onChain(1)
  const currency0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0')
  const currency1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1')
  const currency2 = new Token(1, '0x0000000000000000000000000000000000000003', 18, 't2')
  // const weth = WETH9[1]

  const pool_0_1 = new Pool(
    currency0,
    currency1,
    FEE_AMOUNT_MEDIUM,
    TICK_SPACING_TEN,
    ADDRESS_ZERO,
    encodeSqrtRatioX96(1, 1),
    0,
    0,
    []
  )
  const pool_0_eth = new Pool(
    currency0,
    eth,
    FEE_AMOUNT_MEDIUM,
    TICK_SPACING_TEN,
    ADDRESS_ZERO,
    encodeSqrtRatioX96(1, 1),
    0,
    0,
    []
  )
  const pool_1_eth = new Pool(
    currency1,
    eth,
    FEE_AMOUNT_MEDIUM,
    TICK_SPACING_TEN,
    ADDRESS_ZERO,
    encodeSqrtRatioX96(1, 1),
    0,
    0,
    []
  )

  describe('path', () => {
    it('constructs a path from the currencies', () => {
      const route = new Route([pool_0_1], currency0, currency1)
      expect(route.pools).toEqual([pool_0_1])
      expect(route.currencyPath).toEqual([currency0, currency1])
      expect(route.input).toEqual(currency0)
      expect(route.output).toEqual(currency1)
      expect(route.chainId).toEqual(1)
    })
    it('should fail if the input is not in the first pool', () => {
      expect(() => new Route([pool_0_1], eth, currency1)).toThrow()
    })
    it('should fail if output is not in the last pool', () => {
      expect(() => new Route([pool_0_1], currency0, eth)).toThrow()
    })
  })

  it('can have a currency as both input and output', () => {
    const route = new Route([pool_0_eth, pool_0_1, pool_1_eth], eth, eth)
    expect(route.pools).toEqual([pool_0_eth, pool_0_1, pool_1_eth])
    expect(route.input).toEqual(eth)
    expect(route.output).toEqual(eth)
  })

  it('supports ether input', () => {
    const route = new Route([pool_0_eth], eth, currency0)
    expect(route.pools).toEqual([pool_0_eth])
    expect(route.input).toEqual(eth)
    expect(route.output).toEqual(currency0)
  })

  it('supports ether output', () => {
    const route = new Route([pool_0_eth], currency0, eth)
    expect(route.pools).toEqual([pool_0_eth])
    expect(route.input).toEqual(currency0)
    expect(route.output).toEqual(eth)
  })

  describe('#midPrice', () => {
    const pool_0_1 = new Pool(
      currency0,
      currency1,
      FEE_AMOUNT_MEDIUM,
      TICK_SPACING_TEN,
      ADDRESS_ZERO,
      encodeSqrtRatioX96(1, 5),
      0,
      TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(1, 5)),
      []
    )
    const pool_1_2 = new Pool(
      currency1,
      currency2,
      FEE_AMOUNT_MEDIUM,
      TICK_SPACING_TEN,
      ADDRESS_ZERO,
      encodeSqrtRatioX96(15, 30),
      0,
      TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(15, 30)),
      []
    )
    const pool_0_eth = new Pool(
      currency0,
      eth,
      FEE_AMOUNT_MEDIUM,
      TICK_SPACING_TEN,
      ADDRESS_ZERO,
      encodeSqrtRatioX96(3, 1),
      0,
      TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(3, 1)),
      []
    )
    const pool_1_eth = new Pool(
      currency1,
      eth,
      FEE_AMOUNT_MEDIUM,
      TICK_SPACING_TEN,
      ADDRESS_ZERO,
      encodeSqrtRatioX96(1, 7),
      0,
      TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(1, 7)),
      []
    )

    it('correct for 0 -> 1', () => {
      const price = new Route([pool_0_1], currency0, currency1).midPrice
      expect(price.toFixed(4)).toEqual('0.2000')
      expect(price.baseCurrency.equals(currency0)).toEqual(true)
      expect(price.quoteCurrency.equals(currency1)).toEqual(true)
    })

    it('is cached', () => {
      const route = new Route([pool_0_1], currency0, currency1)
      expect(route.midPrice).toStrictEqual(route.midPrice)
    })

    it('correct for 1 -> 0', () => {
      const price = new Route([pool_0_1], currency1, currency0).midPrice
      expect(price.toFixed(4)).toEqual('5.0000')
      expect(price.baseCurrency.equals(currency1)).toEqual(true)
      expect(price.quoteCurrency.equals(currency0)).toEqual(true)
    })

    it('correct for 0 -> 1 -> 2', () => {
      const price = new Route([pool_0_1, pool_1_2], currency0, currency2).midPrice
      expect(price.toFixed(4)).toEqual('0.1000')
      expect(price.baseCurrency.equals(currency0)).toEqual(true)
      expect(price.quoteCurrency.equals(currency2)).toEqual(true)
    })

    it('correct for 2 -> 1 -> 0', () => {
      const price = new Route([pool_1_2, pool_0_1], currency2, currency0).midPrice
      expect(price.toFixed(4)).toEqual('10.0000')
      expect(price.baseCurrency.equals(currency2)).toEqual(true)
      expect(price.quoteCurrency.equals(currency0)).toEqual(true)
    })

    it('correct for ether -> 0', () => {
      const price = new Route([pool_0_eth], eth, currency0).midPrice
      expect(price.toFixed(4)).toEqual('3.0000')
      expect(price.baseCurrency.equals(eth)).toEqual(true)
      expect(price.quoteCurrency.equals(currency0)).toEqual(true)
    })

    it('correct for 1 -> eth', () => {
      const price = new Route([pool_1_eth], currency1, eth).midPrice
      expect(price.toFixed(4)).toEqual('7.0000')
      expect(price.baseCurrency.equals(currency1)).toEqual(true)
      expect(price.quoteCurrency.equals(eth)).toEqual(true)
    })

    it('correct for ether -> 0 -> 1 -> eth', () => {
      const price = new Route([pool_0_eth, pool_0_1, pool_1_eth], eth, eth).midPrice
      expect(price.toSignificant(4)).toEqual('4.2')
      expect(price.baseCurrency.equals(eth)).toEqual(true)
      expect(price.quoteCurrency.equals(eth)).toEqual(true)
    })

    it('correct for eth -> 0 -> 1 -> ether', () => {
      const price = new Route([pool_0_eth, pool_0_1, pool_1_eth], eth, eth).midPrice
      expect(price.toSignificant(4)).toEqual('4.2')
      expect(price.baseCurrency.equals(eth)).toEqual(true)
      expect(price.quoteCurrency.equals(eth)).toEqual(true)
    })
  })
})
