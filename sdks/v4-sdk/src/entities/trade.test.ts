import { Currency, CurrencyAmount, Ether, WETH9, Percent, Price, sqrt, Token, TradeType } from '@uniswap/sdk-core'
import { ADDRESS_ZERO, FEE_AMOUNT_MEDIUM, TICK_SPACING_SIXTY } from '../internalConstants'
import JSBI from 'jsbi'
import { nearestUsableTick, encodeSqrtRatioX96, TickMath } from '@uniswap/v3-sdk'
import { Pool } from './pool'
import { Route } from './route'
import { Trade } from './trade'

describe('Trade', () => {
  const ETHER = Ether.onChain(1)
  const weth = WETH9[1]
  const token0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0', 'token0')
  const token1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1', 'token1')
  const token2 = new Token(1, '0x0000000000000000000000000000000000000003', 18, 't2', 'token2')
  const token3 = new Token(1, '0x0000000000000000000000000000000000000004', 18, 't3', 'token3')

  function v2StylePool(
    reserve0: CurrencyAmount<Currency>,
    reserve1: CurrencyAmount<Currency>,
    feeAmount: number = FEE_AMOUNT_MEDIUM
  ) {
    const sqrtRatioX96 = encodeSqrtRatioX96(reserve1.quotient, reserve0.quotient)
    const liquidity = sqrt(JSBI.multiply(reserve0.quotient, reserve1.quotient))
    return new Pool(
      reserve0.currency,
      reserve1.currency,
      feeAmount,
      TICK_SPACING_SIXTY,
      ADDRESS_ZERO,
      sqrtRatioX96,
      liquidity,
      TickMath.getTickAtSqrtRatio(sqrtRatioX96),
      [
        {
          index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACING_SIXTY),
          liquidityNet: liquidity,
          liquidityGross: liquidity,
        },
        {
          index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACING_SIXTY),
          liquidityNet: JSBI.multiply(liquidity, JSBI.BigInt(-1)),
          liquidityGross: liquidity,
        },
      ]
    )
  }

  const pool_0_1 = v2StylePool(
    CurrencyAmount.fromRawAmount(token0, 100000),
    CurrencyAmount.fromRawAmount(token1, 100000)
  )
  const pool_0_2 = v2StylePool(
    CurrencyAmount.fromRawAmount(token0, 100000),
    CurrencyAmount.fromRawAmount(token2, 110000)
  )
  const pool_0_3 = v2StylePool(
    CurrencyAmount.fromRawAmount(token0, 100000),
    CurrencyAmount.fromRawAmount(token3, 90000)
  )
  const pool_1_2 = v2StylePool(
    CurrencyAmount.fromRawAmount(token1, 120000),
    CurrencyAmount.fromRawAmount(token2, 100000)
  )
  const pool_1_3 = v2StylePool(
    CurrencyAmount.fromRawAmount(token1, 120000),
    CurrencyAmount.fromRawAmount(token3, 130000)
  )

  const pool_eth_0 = v2StylePool(
    CurrencyAmount.fromRawAmount(ETHER, JSBI.BigInt(100000)),
    CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(100000))
  )

  const pool_eth_1 = v2StylePool(
    CurrencyAmount.fromRawAmount(ETHER, JSBI.BigInt(100000)),
    CurrencyAmount.fromRawAmount(token1, JSBI.BigInt(100000))
  )

  const pool_eth_2 = v2StylePool(
    CurrencyAmount.fromRawAmount(ETHER, JSBI.BigInt(100000)),
    CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(100000))
  )

  const pool_weth_0 = v2StylePool(
    CurrencyAmount.fromRawAmount(weth, JSBI.BigInt(100000)),
    CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(100000))
  )

  describe('#fromRoute', () => {
    it('can be constructed with ETHER as input', async () => {
      const trade = await Trade.fromRoute(
        new Route([pool_eth_0], ETHER, token0),
        CurrencyAmount.fromRawAmount(Ether.onChain(1), JSBI.BigInt(10000)),
        TradeType.EXACT_INPUT
      )
      expect(trade.inputAmount.currency).toEqual(ETHER)
      expect(trade.outputAmount.currency).toEqual(token0)
    })

    it('can be constructed with ETHER as input on a WETH Pool', async () => {
      const trade = await Trade.fromRoute(
        new Route([pool_weth_0], ETHER, token0),
        CurrencyAmount.fromRawAmount(Ether.onChain(1), JSBI.BigInt(10000)),
        TradeType.EXACT_INPUT
      )
      expect(trade.inputAmount.currency).toEqual(ETHER)
      expect(trade.outputAmount.currency).toEqual(token0)
    })

    it('can be constructed with WETH as input on a ETH Pool', async () => {
      const trade = await Trade.fromRoute(
        new Route([pool_eth_0], weth, token0),
        CurrencyAmount.fromRawAmount(weth, JSBI.BigInt(10000)),
        TradeType.EXACT_INPUT
      )
      expect(trade.inputAmount.currency).toEqual(weth)
      expect(trade.outputAmount.currency).toEqual(token0)
    })

    it('can be constructed with ETHER as output on a WETH Pool', async () => {
      const trade = await Trade.fromRoute(
        new Route([pool_weth_0], token0, ETHER),
        CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(10000)),
        TradeType.EXACT_INPUT
      )
      expect(trade.inputAmount.currency).toEqual(token0)
      expect(trade.outputAmount.currency).toEqual(ETHER)
    })

    it('can be constructed with WETH as output on a ETH Pool', async () => {
      const trade = await Trade.fromRoute(
        new Route([pool_eth_0], token0, weth),
        CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(10000)),
        TradeType.EXACT_INPUT
      )
      expect(trade.inputAmount.currency).toEqual(token0)
      expect(trade.outputAmount.currency).toEqual(weth)
    })

    it('can be constructed with ETHER as input for exact output', async () => {
      const trade = await Trade.fromRoute(
        new Route([pool_eth_0], ETHER, token0),
        CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(10000)),
        TradeType.EXACT_OUTPUT
      )
      expect(trade.inputAmount.currency).toEqual(ETHER)
      expect(trade.outputAmount.currency).toEqual(token0)
    })

    it('can be constructed with ETHER as output', async () => {
      const trade = await Trade.fromRoute(
        new Route([pool_eth_0], token0, ETHER),
        CurrencyAmount.fromRawAmount(Ether.onChain(1), JSBI.BigInt(10000)),
        TradeType.EXACT_OUTPUT
      )
      expect(trade.inputAmount.currency).toEqual(token0)
      expect(trade.outputAmount.currency).toEqual(ETHER)
    })
    it('can be constructed with ETHER as output for exact input', async () => {
      const trade = await Trade.fromRoute(
        new Route([pool_eth_0], token0, ETHER),
        CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(10000)),
        TradeType.EXACT_INPUT
      )
      expect(trade.inputAmount.currency).toEqual(token0)
      expect(trade.outputAmount.currency).toEqual(ETHER)
    })
  })

  describe('#fromRoutes', () => {
    it('can be constructed with ETHER as input with multiple routes', async () => {
      const trade = await Trade.fromRoutes<Ether, Token, TradeType.EXACT_INPUT>(
        [
          {
            amount: CurrencyAmount.fromRawAmount(Ether.onChain(1), JSBI.BigInt(10000)),
            route: new Route([pool_eth_0], ETHER, token0),
          },
        ],
        TradeType.EXACT_INPUT
      )
      expect(trade.inputAmount.currency).toEqual(ETHER)
      expect(trade.outputAmount.currency).toEqual(token0)
    })

    it('can be constructed with ETHER as input for exact output with multiple routes', async () => {
      const trade = await Trade.fromRoutes<Ether, Token, TradeType.EXACT_OUTPUT>(
        [
          {
            amount: CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(3000)),
            route: new Route([pool_eth_0], ETHER, token0),
          },
          {
            amount: CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(7000)),
            route: new Route([pool_eth_1, pool_0_1], ETHER, token0),
          },
        ],
        TradeType.EXACT_OUTPUT
      )
      expect(trade.inputAmount.currency).toEqual(ETHER)
      expect(trade.outputAmount.currency).toEqual(token0)
    })

    it('can be constructed with ETHER as output with multiple routes', async () => {
      const trade = await Trade.fromRoutes<Token, Ether, TradeType.EXACT_OUTPUT>(
        [
          {
            amount: CurrencyAmount.fromRawAmount(Ether.onChain(1), JSBI.BigInt(4000)),
            route: new Route([pool_eth_0], token0, ETHER),
          },
          {
            amount: CurrencyAmount.fromRawAmount(Ether.onChain(1), JSBI.BigInt(6000)),
            route: new Route([pool_0_1, pool_eth_1], token0, ETHER),
          },
        ],
        TradeType.EXACT_OUTPUT
      )
      expect(trade.inputAmount.currency).toEqual(token0)
      expect(trade.outputAmount.currency).toEqual(ETHER)
    })
    it('can be constructed with ETHER as output for exact input with multiple routes', async () => {
      const trade = await Trade.fromRoutes<Token, Ether, TradeType.EXACT_INPUT>(
        [
          {
            amount: CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(3000)),
            route: new Route([pool_eth_0], token0, ETHER),
          },
          {
            amount: CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(7000)),
            route: new Route([pool_0_1, pool_eth_1], token0, ETHER),
          },
        ],
        TradeType.EXACT_INPUT
      )
      expect(trade.inputAmount.currency).toEqual(token0)
      expect(trade.outputAmount.currency).toEqual(ETHER)
    })

    it('throws if pools are re-used between routes', async () => {
      await expect(
        Trade.fromRoutes<Token, Ether, TradeType.EXACT_INPUT>(
          [
            {
              amount: CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(4500)),
              route: new Route([pool_0_1, pool_eth_1], token0, ETHER),
            },
            {
              amount: CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(5500)),
              route: new Route([pool_0_1, pool_1_2, pool_eth_2], token0, ETHER),
            },
          ],
          TradeType.EXACT_INPUT
        )
      ).rejects.toThrow('POOLS_DUPLICATED')
    })
  })

  describe('#createUncheckedTrade', () => {
    it('throws if input currency does not match route', () => {
      expect(() =>
        Trade.createUncheckedTrade({
          route: new Route([pool_0_1], token0, token1),
          inputAmount: CurrencyAmount.fromRawAmount(token2, 10000),
          outputAmount: CurrencyAmount.fromRawAmount(token1, 10000),
          tradeType: TradeType.EXACT_INPUT,
        })
      ).toThrow('INPUT_CURRENCY_MATCH')
    })
    it('throws if output currency does not match route', () => {
      expect(() =>
        Trade.createUncheckedTrade({
          route: new Route([pool_0_1], token0, token1),
          inputAmount: CurrencyAmount.fromRawAmount(token0, 10000),
          outputAmount: CurrencyAmount.fromRawAmount(token2, 10000),
          tradeType: TradeType.EXACT_INPUT,
        })
      ).toThrow('OUTPUT_CURRENCY_MATCH')
    })
    it('can create an exact input trade without simulating', () => {
      Trade.createUncheckedTrade({
        route: new Route([pool_0_1], token0, token1),
        inputAmount: CurrencyAmount.fromRawAmount(token0, 10000),
        outputAmount: CurrencyAmount.fromRawAmount(token1, 100000),
        tradeType: TradeType.EXACT_INPUT,
      })
    })
    it('can create an exact output trade without simulating', () => {
      Trade.createUncheckedTrade({
        route: new Route([pool_0_1], token0, token1),
        inputAmount: CurrencyAmount.fromRawAmount(token0, 10000),
        outputAmount: CurrencyAmount.fromRawAmount(token1, 100000),
        tradeType: TradeType.EXACT_OUTPUT,
      })
    })
  })
  describe('#createUncheckedTradeWithMultipleRoutes', () => {
    it('throws if input currency does not match route with multiple routes', () => {
      expect(() =>
        Trade.createUncheckedTradeWithMultipleRoutes({
          routes: [
            {
              route: new Route([pool_1_2], token2, token1),
              inputAmount: CurrencyAmount.fromRawAmount(token2, 2000),
              outputAmount: CurrencyAmount.fromRawAmount(token1, 2000),
            },
            {
              route: new Route([pool_0_1], token0, token1),
              inputAmount: CurrencyAmount.fromRawAmount(token2, 8000),
              outputAmount: CurrencyAmount.fromRawAmount(token1, 8000),
            },
          ],
          tradeType: TradeType.EXACT_INPUT,
        })
      ).toThrow('INPUT_CURRENCY_MATCH')
    })
    it('throws if output currency does not match route with multiple routes', () => {
      expect(() =>
        Trade.createUncheckedTradeWithMultipleRoutes({
          routes: [
            {
              route: new Route([pool_0_2], token0, token2),
              inputAmount: CurrencyAmount.fromRawAmount(token0, 10000),
              outputAmount: CurrencyAmount.fromRawAmount(token2, 10000),
            },
            {
              route: new Route([pool_0_1], token0, token1),
              inputAmount: CurrencyAmount.fromRawAmount(token0, 10000),
              outputAmount: CurrencyAmount.fromRawAmount(token2, 10000),
            },
          ],
          tradeType: TradeType.EXACT_INPUT,
        })
      ).toThrow('OUTPUT_CURRENCY_MATCH')
    })

    it('can create an exact input trade without simulating with multiple routes', () => {
      Trade.createUncheckedTradeWithMultipleRoutes({
        routes: [
          {
            route: new Route([pool_0_1], token0, token1),
            inputAmount: CurrencyAmount.fromRawAmount(token0, 5000),
            outputAmount: CurrencyAmount.fromRawAmount(token1, 50000),
          },
          {
            route: new Route([pool_0_2, pool_1_2], token0, token1),
            inputAmount: CurrencyAmount.fromRawAmount(token0, 5000),
            outputAmount: CurrencyAmount.fromRawAmount(token1, 50000),
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })
    })

    it('can create an exact output trade without simulating with multiple routes', () => {
      Trade.createUncheckedTradeWithMultipleRoutes({
        routes: [
          {
            route: new Route([pool_0_1], token0, token1),
            inputAmount: CurrencyAmount.fromRawAmount(token0, 5001),
            outputAmount: CurrencyAmount.fromRawAmount(token1, 50000),
          },
          {
            route: new Route([pool_0_2, pool_1_2], token0, token1),
            inputAmount: CurrencyAmount.fromRawAmount(token0, 4999),
            outputAmount: CurrencyAmount.fromRawAmount(token1, 50000),
          },
        ],
        tradeType: TradeType.EXACT_OUTPUT,
      })
    })
  })

  describe('#route and #swaps', () => {
    const singleRoute = Trade.createUncheckedTrade({
      route: new Route([pool_0_1, pool_1_2], token0, token2),
      inputAmount: CurrencyAmount.fromRawAmount(token0, 100),
      outputAmount: CurrencyAmount.fromRawAmount(token2, 69),
      tradeType: TradeType.EXACT_INPUT,
    })
    const multiRoute = Trade.createUncheckedTradeWithMultipleRoutes({
      routes: [
        {
          route: new Route([pool_0_1, pool_1_2], token0, token2),
          inputAmount: CurrencyAmount.fromRawAmount(token0, 50),
          outputAmount: CurrencyAmount.fromRawAmount(token2, 35),
        },
        {
          route: new Route([pool_0_2], token0, token2),
          inputAmount: CurrencyAmount.fromRawAmount(token0, 50),
          outputAmount: CurrencyAmount.fromRawAmount(token2, 34),
        },
      ],
      tradeType: TradeType.EXACT_INPUT,
    })
    it('can access route for single route trade if less than 0', () => {
      expect(singleRoute.route).toBeDefined()
    })
    it('can access routes for both single and multi route trades', () => {
      expect(singleRoute.swaps).toBeDefined()
      expect(singleRoute.swaps).toHaveLength(1)
      expect(multiRoute.swaps).toBeDefined()
      expect(multiRoute.swaps).toHaveLength(2)
    })
    it('throws if access route on multi route trade', () => {
      expect(() => multiRoute.route).toThrow('MULTIPLE_ROUTES')
    })
  })

  describe('#worstExecutionPrice', () => {
    describe('tradeType = EXACT_INPUT', () => {
      const exactIn = Trade.createUncheckedTrade({
        route: new Route([pool_0_1, pool_1_2], token0, token2),
        inputAmount: CurrencyAmount.fromRawAmount(token0, 100),
        outputAmount: CurrencyAmount.fromRawAmount(token2, 69),
        tradeType: TradeType.EXACT_INPUT,
      })
      const exactInMultiRoute = Trade.createUncheckedTradeWithMultipleRoutes({
        routes: [
          {
            route: new Route([pool_0_1, pool_1_2], token0, token2),
            inputAmount: CurrencyAmount.fromRawAmount(token0, 50),
            outputAmount: CurrencyAmount.fromRawAmount(token2, 35),
          },
          {
            route: new Route([pool_0_2], token0, token2),
            inputAmount: CurrencyAmount.fromRawAmount(token0, 50),
            outputAmount: CurrencyAmount.fromRawAmount(token2, 34),
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })
      it('throws if less than 0', () => {
        expect(() => exactIn.minimumAmountOut(new Percent(-1, 100))).toThrow('SLIPPAGE_TOLERANCE')
      })
      it('returns exact if 0', () => {
        expect(exactIn.worstExecutionPrice(new Percent(0, 100))).toEqual(exactIn.executionPrice)
      })
      it('returns exact if nonzero', () => {
        expect(exactIn.worstExecutionPrice(new Percent(0, 100))).toEqual(new Price(token0, token2, 100, 69))
        expect(exactIn.worstExecutionPrice(new Percent(5, 100))).toEqual(new Price(token0, token2, 100, 65))
        expect(exactIn.worstExecutionPrice(new Percent(200, 100))).toEqual(new Price(token0, token2, 100, 23))
      })
      it('returns exact if nonzero with multiple routes', () => {
        expect(exactInMultiRoute.worstExecutionPrice(new Percent(0, 100))).toEqual(new Price(token0, token2, 100, 69))
        expect(exactInMultiRoute.worstExecutionPrice(new Percent(5, 100))).toEqual(new Price(token0, token2, 100, 65))
        expect(exactInMultiRoute.worstExecutionPrice(new Percent(200, 100))).toEqual(new Price(token0, token2, 100, 23))
      })
    })
    describe('tradeType = EXACT_OUTPUT', () => {
      const exactOut = Trade.createUncheckedTrade({
        route: new Route([pool_0_1, pool_1_2], token0, token2),
        inputAmount: CurrencyAmount.fromRawAmount(token0, 156),
        outputAmount: CurrencyAmount.fromRawAmount(token2, 100),
        tradeType: TradeType.EXACT_OUTPUT,
      })
      const exactOutMultiRoute = Trade.createUncheckedTradeWithMultipleRoutes({
        routes: [
          {
            route: new Route([pool_0_1, pool_1_2], token0, token2),
            inputAmount: CurrencyAmount.fromRawAmount(token0, 78),
            outputAmount: CurrencyAmount.fromRawAmount(token2, 50),
          },
          {
            route: new Route([pool_0_2], token0, token2),
            inputAmount: CurrencyAmount.fromRawAmount(token0, 78),
            outputAmount: CurrencyAmount.fromRawAmount(token2, 50),
          },
        ],
        tradeType: TradeType.EXACT_OUTPUT,
      })

      it('throws if less than 0', () => {
        expect(() => exactOut.worstExecutionPrice(new Percent(-1, 100))).toThrow('SLIPPAGE_TOLERANCE')
      })
      it('returns exact if 0', () => {
        expect(exactOut.worstExecutionPrice(new Percent(0, 100))).toEqual(exactOut.executionPrice)
      })
      it('returns slippage amount if nonzero', () => {
        expect(
          exactOut.worstExecutionPrice(new Percent(0, 100)).equalTo(new Price(token0, token2, 156, 100))
        ).toBeTruthy()
        expect(
          exactOut.worstExecutionPrice(new Percent(5, 100)).equalTo(new Price(token0, token2, 163, 100))
        ).toBeTruthy()
        expect(
          exactOut.worstExecutionPrice(new Percent(200, 100)).equalTo(new Price(token0, token2, 468, 100))
        ).toBeTruthy()
      })
      it('returns exact if nonzero with multiple routes', () => {
        expect(
          exactOutMultiRoute.worstExecutionPrice(new Percent(0, 100)).equalTo(new Price(token0, token2, 156, 100))
        ).toBeTruthy()
        expect(
          exactOutMultiRoute.worstExecutionPrice(new Percent(5, 100)).equalTo(new Price(token0, token2, 163, 100))
        ).toBeTruthy()
        expect(
          exactOutMultiRoute.worstExecutionPrice(new Percent(200, 100)).equalTo(new Price(token0, token2, 468, 100))
        ).toBeTruthy()
      })
    })
  })

  describe('#priceImpact', () => {
    describe('tradeType = EXACT_INPUT', () => {
      const exactIn = Trade.createUncheckedTradeWithMultipleRoutes({
        routes: [
          {
            route: new Route([pool_0_1, pool_1_2], token0, token2),
            inputAmount: CurrencyAmount.fromRawAmount(token0, 100),
            outputAmount: CurrencyAmount.fromRawAmount(token2, 69),
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })
      const exactInMultipleRoutes = Trade.createUncheckedTradeWithMultipleRoutes({
        routes: [
          {
            route: new Route([pool_0_1, pool_1_2], token0, token2),
            inputAmount: CurrencyAmount.fromRawAmount(token0, 90),
            outputAmount: CurrencyAmount.fromRawAmount(token2, 62),
          },
          {
            route: new Route([pool_0_2], token0, token2),
            inputAmount: CurrencyAmount.fromRawAmount(token0, 10),
            outputAmount: CurrencyAmount.fromRawAmount(token2, 7),
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })
      it('is correct', () => {
        expect(exactIn.priceImpact.toSignificant(3)).toEqual('17.2')
      })
      it('is correct with multiple routes', async () => {
        expect(exactInMultipleRoutes.priceImpact.toSignificant(3)).toEqual('19.8')
      })
    })
    describe('tradeType = EXACT_OUTPUT', () => {
      const exactOut = Trade.createUncheckedTradeWithMultipleRoutes({
        routes: [
          {
            route: new Route([pool_0_1, pool_1_2], token0, token2),
            inputAmount: CurrencyAmount.fromRawAmount(token0, 156),
            outputAmount: CurrencyAmount.fromRawAmount(token2, 100),
          },
        ],
        tradeType: TradeType.EXACT_OUTPUT,
      })
      const exactOutMultipleRoutes = Trade.createUncheckedTradeWithMultipleRoutes({
        routes: [
          {
            route: new Route([pool_0_1, pool_1_2], token0, token2),
            inputAmount: CurrencyAmount.fromRawAmount(token0, 140),
            outputAmount: CurrencyAmount.fromRawAmount(token2, 90),
          },
          {
            route: new Route([pool_0_2], token0, token2),
            inputAmount: CurrencyAmount.fromRawAmount(token0, 16),
            outputAmount: CurrencyAmount.fromRawAmount(token2, 10),
          },
        ],
        tradeType: TradeType.EXACT_OUTPUT,
      })
      it('is correct', () => {
        expect(exactOut.priceImpact.toSignificant(3)).toEqual('23.1')
      })
      it('is correct with multiple routes', () => {
        expect(exactOutMultipleRoutes.priceImpact.toSignificant(3)).toEqual('25.5')
      })
    })
  })

  describe('#bestTradeExactIn', () => {
    it('throws with empty pools', async () => {
      await expect(
        Trade.bestTradeExactIn([], CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(10000)), token2)
      ).rejects.toThrow('POOLS')
    })
    it('throws with max hops of 0', async () => {
      await expect(
        Trade.bestTradeExactIn([pool_0_2], CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(10000)), token2, {
          maxHops: 0,
        })
      ).rejects.toThrow('MAX_HOPS')
    })

    it('provides best route', async () => {
      const result = await Trade.bestTradeExactIn(
        [pool_0_1, pool_0_2, pool_1_2],
        CurrencyAmount.fromRawAmount(token0, 10000),
        token2
      )
      expect(result).toHaveLength(2)
      expect(result[0].swaps[0].route.pools).toHaveLength(1) // 0 -> 2 at 10:11
      expect(result[0].swaps[0].route.currencyPath).toEqual([token0, token2])
      expect(result[0].inputAmount.equalTo(CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(10000)))).toBeTruthy()
      expect(result[0].outputAmount.equalTo(CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(9971)))).toBeTruthy()
      expect(result[1].swaps[0].route.pools).toHaveLength(2) // 0 -> 1 -> 2 at 12:12:10
      expect(result[1].swaps[0].route.currencyPath).toEqual([token0, token1, token2])
      expect(result[1].inputAmount.equalTo(CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(10000)))).toBeTruthy()
      expect(result[1].outputAmount.equalTo(CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(7004)))).toBeTruthy()
    })

    it('respects maxHops', async () => {
      const result = await Trade.bestTradeExactIn(
        [pool_0_1, pool_0_2, pool_1_2],
        CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(10)),
        token2,
        { maxHops: 1 }
      )
      expect(result).toHaveLength(1)
      expect(result[0].swaps[0].route.pools).toHaveLength(1) // 0 -> 2 at 10:11
      expect(result[0].swaps[0].route.currencyPath).toEqual([token0, token2])
    })

    it('insufficient input for one pool', async () => {
      const result = await Trade.bestTradeExactIn(
        [pool_0_1, pool_0_2, pool_1_2],
        CurrencyAmount.fromRawAmount(token0, 1),
        token2
      )
      expect(result).toHaveLength(2)
      expect(result[0].swaps[0].route.pools).toHaveLength(1) // 0 -> 2 at 10:11
      expect(result[0].swaps[0].route.currencyPath).toEqual([token0, token2])
      expect(result[0].outputAmount).toEqual(CurrencyAmount.fromRawAmount(token2, 0))
    })

    it('respects n', async () => {
      const result = await Trade.bestTradeExactIn(
        [pool_0_1, pool_0_2, pool_1_2],
        CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(10)),
        token2,
        { maxNumResults: 1 }
      )

      expect(result).toHaveLength(1)
    })

    it('no path', async () => {
      const result = await Trade.bestTradeExactIn(
        [pool_0_1, pool_0_3, pool_1_3],
        CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(10)),
        token2
      )
      expect(result).toHaveLength(0)
    })

    it('works for ETHER currency input', async () => {
      const result = await Trade.bestTradeExactIn(
        [pool_eth_0, pool_0_1, pool_0_3, pool_1_3],
        CurrencyAmount.fromRawAmount(Ether.onChain(1), JSBI.BigInt(100)),
        token3
      )
      expect(result).toHaveLength(2)
      expect(result[0].inputAmount.currency).toEqual(ETHER)
      expect(result[0].swaps[0].route.currencyPath).toEqual([ETHER, token0, token1, token3])
      expect(result[0].outputAmount.currency).toEqual(token3)
      expect(result[1].inputAmount.currency).toEqual(ETHER)
      expect(result[1].swaps[0].route.currencyPath).toEqual([ETHER, token0, token3])
      expect(result[1].outputAmount.currency).toEqual(token3)
    })

    it('works for ETHER currency output', async () => {
      const result = await Trade.bestTradeExactIn(
        [pool_eth_0, pool_0_1, pool_0_3, pool_1_3],
        CurrencyAmount.fromRawAmount(token3, JSBI.BigInt(100)),
        ETHER
      )
      expect(result).toHaveLength(2)
      expect(result[0].inputAmount.currency).toEqual(token3)
      expect(result[0].swaps[0].route.currencyPath).toEqual([token3, token0, ETHER])
      expect(result[0].outputAmount.currency).toEqual(ETHER)
      expect(result[1].inputAmount.currency).toEqual(token3)
      expect(result[1].swaps[0].route.currencyPath).toEqual([token3, token1, token0, ETHER])
      expect(result[1].outputAmount.currency).toEqual(ETHER)
    })
  })

  describe('#maximumAmountIn', () => {
    describe('tradeType = EXACT_INPUT', () => {
      let exactIn: Trade<Token, Token, TradeType.EXACT_INPUT>
      beforeEach(async () => {
        exactIn = await Trade.fromRoute(
          new Route([pool_0_1, pool_1_2], token0, token2),
          CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(100)),
          TradeType.EXACT_INPUT
        )
      })
      it('throws if less than 0', () => {
        expect(() => exactIn.maximumAmountIn(new Percent(JSBI.BigInt(-1), JSBI.BigInt(100)))).toThrow(
          'SLIPPAGE_TOLERANCE'
        )
      })
      it('returns exact if 0', () => {
        expect(exactIn.maximumAmountIn(new Percent(JSBI.BigInt(0), JSBI.BigInt(100)))).toEqual(exactIn.inputAmount)
      })
      it('returns exact if nonzero', () => {
        expect(
          exactIn
            .maximumAmountIn(new Percent(JSBI.BigInt(0), JSBI.BigInt(100)))
            .equalTo(CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(100)))
        ).toBeTruthy()
        expect(
          exactIn
            .maximumAmountIn(new Percent(JSBI.BigInt(5), JSBI.BigInt(100)))
            .equalTo(CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(100)))
        ).toBeTruthy()
        expect(
          exactIn
            .maximumAmountIn(new Percent(JSBI.BigInt(200), JSBI.BigInt(100)))
            .equalTo(CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(100)))
        ).toBeTruthy()
      })
    })

    describe('tradeType = EXACT_OUTPUT', () => {
      let exactOut: Trade<Token, Token, TradeType.EXACT_OUTPUT>
      beforeEach(async () => {
        exactOut = await Trade.fromRoute(
          new Route([pool_0_1, pool_1_2], token0, token2),
          CurrencyAmount.fromRawAmount(token2, 10000),
          TradeType.EXACT_OUTPUT
        )
      })

      it('throws if less than 0', () => {
        expect(() => exactOut.maximumAmountIn(new Percent(JSBI.BigInt(-1), 10000))).toThrow('SLIPPAGE_TOLERANCE')
      })

      it('returns exact if 0', () => {
        expect(exactOut.maximumAmountIn(new Percent(JSBI.BigInt(0), 10000))).toEqual(exactOut.inputAmount)
      })

      it('returns slippage amount if nonzero', () => {
        expect(
          exactOut
            .maximumAmountIn(new Percent(JSBI.BigInt(0), 100))
            .equalTo(CurrencyAmount.fromRawAmount(token0, 15488))
        ).toBeTruthy()
        expect(
          exactOut
            .maximumAmountIn(new Percent(JSBI.BigInt(5), JSBI.BigInt(100)))
            .equalTo(CurrencyAmount.fromRawAmount(token0, 16262))
        ).toBeTruthy()
        expect(
          exactOut
            .maximumAmountIn(new Percent(JSBI.BigInt(200), JSBI.BigInt(100)))
            .equalTo(CurrencyAmount.fromRawAmount(token0, 46464))
        ).toBeTruthy()
      })
    })
  })

  describe('#minimumAmountOut', () => {
    describe('tradeType = EXACT_INPUT', () => {
      let exactIn: Trade<Token, Token, TradeType.EXACT_INPUT>
      beforeEach(
        async () =>
          (exactIn = await Trade.fromRoute(
            new Route([pool_0_1, pool_1_2], token0, token2),
            CurrencyAmount.fromRawAmount(token0, 10000),
            TradeType.EXACT_INPUT
          ))
      )

      it('throws if less than 0', () => {
        expect(() => exactIn.minimumAmountOut(new Percent(JSBI.BigInt(-1), 100))).toThrow('SLIPPAGE_TOLERANCE')
      })

      it('returns exact if 0', () => {
        expect(exactIn.minimumAmountOut(new Percent(JSBI.BigInt(0), 10000))).toEqual(exactIn.outputAmount)
      })

      it('returns exact if nonzero', () => {
        expect(exactIn.minimumAmountOut(new Percent(JSBI.BigInt(0), 100))).toEqual(
          CurrencyAmount.fromRawAmount(token2, 7004)
        )
        expect(exactIn.minimumAmountOut(new Percent(JSBI.BigInt(5), 100))).toEqual(
          CurrencyAmount.fromRawAmount(token2, 6670)
        )
        expect(exactIn.minimumAmountOut(new Percent(JSBI.BigInt(200), 100))).toEqual(
          CurrencyAmount.fromRawAmount(token2, 2334)
        )
      })
    })
    describe('tradeType = EXACT_OUTPUT', () => {
      let exactOut: Trade<Token, Token, TradeType.EXACT_OUTPUT>
      beforeEach(async () => {
        exactOut = await Trade.fromRoute(
          new Route([pool_0_1, pool_1_2], token0, token2),
          CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(100)),
          TradeType.EXACT_OUTPUT
        )
      })

      it('throws if less than 0', () => {
        expect(() => exactOut.minimumAmountOut(new Percent(JSBI.BigInt(-1), JSBI.BigInt(100)))).toThrow(
          'SLIPPAGE_TOLERANCE'
        )
      })
      it('returns exact if 0', () => {
        expect(exactOut.minimumAmountOut(new Percent(JSBI.BigInt(0), JSBI.BigInt(100)))).toEqual(exactOut.outputAmount)
      })
      it('returns slippage amount if nonzero', () => {
        expect(
          exactOut
            .minimumAmountOut(new Percent(JSBI.BigInt(0), JSBI.BigInt(100)))
            .equalTo(CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(100)))
        ).toBeTruthy()
        expect(
          exactOut
            .minimumAmountOut(new Percent(JSBI.BigInt(5), JSBI.BigInt(100)))
            .equalTo(CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(100)))
        ).toBeTruthy()
        expect(
          exactOut
            .minimumAmountOut(new Percent(JSBI.BigInt(200), JSBI.BigInt(100)))
            .equalTo(CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(100)))
        ).toBeTruthy()
      })
    })
  })

  describe('#bestTradeExactOut', () => {
    it('throws with empty pools', async () => {
      await expect(
        Trade.bestTradeExactOut([], token0, CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(100)))
      ).rejects.toThrow('POOLS')
    })
    it('throws with max hops of 0', async () => {
      await expect(
        Trade.bestTradeExactOut([pool_0_2], token0, CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(100)), {
          maxHops: 0,
        })
      ).rejects.toThrow('MAX_HOPS')
    })

    it('provides best route', async () => {
      const result = await Trade.bestTradeExactOut(
        [pool_0_1, pool_0_2, pool_1_2],
        token0,
        CurrencyAmount.fromRawAmount(token2, 10000)
      )

      expect(result).toHaveLength(2)
      expect(result[0].swaps[0].route.pools).toHaveLength(1) // 0 -> 2 at 10:11
      expect(result[0].swaps[0].route.currencyPath).toEqual([token0, token2])
      expect(result[0].inputAmount.equalTo(CurrencyAmount.fromRawAmount(token0, 10032))).toBeTruthy()
      expect(result[0].outputAmount.equalTo(CurrencyAmount.fromRawAmount(token2, 10000))).toBeTruthy()
      expect(result[1].swaps[0].route.pools).toHaveLength(2) // 0 -> 1 -> 2 at 12:12:10
      expect(result[1].swaps[0].route.currencyPath).toEqual([token0, token1, token2])
      expect(result[1].inputAmount.equalTo(CurrencyAmount.fromRawAmount(token0, 15488))).toBeTruthy()
      expect(result[1].outputAmount.equalTo(CurrencyAmount.fromRawAmount(token2, 10000))).toBeTruthy()
    })

    it('respects maxHops', async () => {
      const result = await Trade.bestTradeExactOut(
        [pool_0_1, pool_0_2, pool_1_2],
        token0,
        CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(10)),
        { maxHops: 1 }
      )
      expect(result).toHaveLength(1)
      expect(result[0].swaps[0].route.pools).toHaveLength(1) // 0 -> 2 at 10:11
      expect(result[0].swaps[0].route.currencyPath).toEqual([token0, token2])
    })

    it.skip('insufficient liquidity', () => {
      const result = Trade.bestTradeExactOut(
        [pool_0_1, pool_0_2, pool_1_2],
        token0,
        CurrencyAmount.fromRawAmount(token2, 1200)
      )
      expect(result).toHaveLength(0)
    })

    it.skip('insufficient liquidity in one pool but not the other', () => {
      const result = Trade.bestTradeExactOut(
        [pool_0_1, pool_0_2, pool_1_2],
        token0,
        CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(1050))
      )
      expect(result).toHaveLength(1)
    })

    it('respects n', async () => {
      const result = await Trade.bestTradeExactOut(
        [pool_0_1, pool_0_2, pool_1_2],
        token0,
        CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(10)),
        { maxNumResults: 1 }
      )

      expect(result).toHaveLength(1)
    })

    it('no path', async () => {
      const result = await Trade.bestTradeExactOut(
        [pool_0_1, pool_0_3, pool_1_3],
        token0,
        CurrencyAmount.fromRawAmount(token2, JSBI.BigInt(10))
      )
      expect(result).toHaveLength(0)
    })

    it('works for ETHER currency input', async () => {
      const result = await Trade.bestTradeExactOut(
        [pool_eth_0, pool_0_1, pool_0_3, pool_1_3],
        ETHER,
        CurrencyAmount.fromRawAmount(token3, 10000)
      )
      expect(result).toHaveLength(2)
      expect(result[0].inputAmount.currency).toEqual(ETHER)
      expect(result[0].swaps[0].route.currencyPath).toEqual([ETHER, token0, token1, token3])
      expect(result[0].outputAmount.currency).toEqual(token3)
      expect(result[1].inputAmount.currency).toEqual(ETHER)
      expect(result[1].swaps[0].route.currencyPath).toEqual([ETHER, token0, token3])
      expect(result[1].outputAmount.currency).toEqual(token3)
    })
    it('works for ETHER currency output', async () => {
      const result = await Trade.bestTradeExactOut(
        [pool_eth_0, pool_0_1, pool_0_3, pool_1_3],
        token3,
        CurrencyAmount.fromRawAmount(Ether.onChain(1), JSBI.BigInt(100))
      )
      expect(result).toHaveLength(2)
      expect(result[0].inputAmount.currency).toEqual(token3)
      expect(result[0].swaps[0].route.currencyPath).toEqual([token3, token0, ETHER])
      expect(result[0].outputAmount.currency).toEqual(ETHER)
      expect(result[1].inputAmount.currency).toEqual(token3)
      expect(result[1].swaps[0].route.currencyPath).toEqual([token3, token1, token0, ETHER])
      expect(result[1].outputAmount.currency).toEqual(ETHER)
    })
  })
})
