import { BigNumber } from 'ethers'
import JSBI from 'jsbi'
import { CurrencyAmount, Percent, TradeType, Token, WETH9 } from '@uniswap/sdk-core'
import { encodeSqrtRatioX96, nearestUsableTick, TickMath } from '@uniswap/v3-sdk'
import { Pool } from '../entities/pool'
import { Trade } from '../entities/trade'
import { Route } from '../entities/route'
import { encodeRouteToPath } from './encodeRouteToPath'
import { ADDRESS_ZERO, FEE_AMOUNT_MEDIUM, TICK_SPACING_TEN, ONE_ETHER, NEGATIVE_ONE } from '../internalConstants'

import { Actions, V4Planner } from './v4Planner'

const ONE_ETHER_BN = BigNumber.from(1).mul(10).pow(18)
const TICKLIST = [
  {
    index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACING_TEN),
    liquidityNet: ONE_ETHER,
    liquidityGross: ONE_ETHER,
  },
  {
    index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACING_TEN),
    liquidityNet: JSBI.multiply(ONE_ETHER, NEGATIVE_ONE),
    liquidityGross: ONE_ETHER,
  },
]

export const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin')
export const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'DAI Stablecoin')
export const USDC_WETH = new Pool(
  USDC,
  WETH9[1],
  FEE_AMOUNT_MEDIUM,
  TICK_SPACING_TEN,
  ADDRESS_ZERO,
  encodeSqrtRatioX96(1, 1),
  0,
  0,
  TICKLIST
)
export const DAI_USDC = new Pool(
  USDC,
  DAI,
  FEE_AMOUNT_MEDIUM,
  TICK_SPACING_TEN,
  ADDRESS_ZERO,
  encodeSqrtRatioX96(1, 1),
  0,
  0,
  TICKLIST
)
export const DAI_WETH = new Pool(
  WETH9[1],
  DAI,
  FEE_AMOUNT_MEDIUM,
  TICK_SPACING_TEN,
  ADDRESS_ZERO,
  encodeSqrtRatioX96(1, 1),
  0,
  0,
  TICKLIST
)

describe('RouterPlanner', () => {
  let planner: V4Planner

  beforeEach(() => {
    planner = new V4Planner()
  })

  describe('addAction', () => {
    it('encodes a v4 exactInSingle swap', async () => {
      planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [
        {
          poolKey: USDC_WETH.poolKey,
          zeroForOne: true,
          amountIn: ONE_ETHER_BN,
          amountOutMinimum: ONE_ETHER_BN.div(2),
          sqrtPriceLimitX96: 0,
          hookData: '0x',
        },
      ])

      expect(planner.actions).toEqual('0x04')
      expect(planner.params[0]).toEqual(
        '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000006f05b59d3b20000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000000'
      )
    })
  })

  describe('addTrade', () => {
    it('completes a v4 exactIn 2 hop swap with same results as same addAction', async () => {
      const route = new Route([DAI_USDC, USDC_WETH], DAI, WETH9[1])

      // encode with addAction function
      planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn: DAI.address,
          path: encodeRouteToPath(route),
          amountIn: ONE_ETHER_BN.toString(),
          amountOutMinimum: 0,
        },
      ])

      // encode with addTrade function
      const tradePlanner = new V4Planner()
      const trade = await Trade.fromRoute(
        route,
        CurrencyAmount.fromRawAmount(DAI, ONE_ETHER.toString()),
        TradeType.EXACT_INPUT
      )
      tradePlanner.addTrade(trade)

      expect(planner.actions).toEqual('0x05')
      expect(planner.params[0]).toEqual(
        '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000006b175474e89094c44da98b954eedeac495271d0f00000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000100000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000000'
      )

      expect(planner.actions).toEqual(tradePlanner.actions)
      expect(planner.params[0]).toEqual(tradePlanner.params[0])
    })

    it('completes a v4 exactOut 2 hop swap', async () => {
      const route = new Route([DAI_USDC, USDC_WETH], DAI, WETH9[1])
      const slippageTolerance = new Percent('5')
      const trade = await Trade.fromRoute(
        route,
        CurrencyAmount.fromRawAmount(WETH9[1], ONE_ETHER.toString()),
        TradeType.EXACT_OUTPUT
      )
      planner.addTrade(trade, slippageTolerance)

      expect(planner.actions).toEqual('0x07')
      expect(planner.params[0]).toEqual(
        '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc200000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000001000000000000000000000000006b175474e89094c44da98b954eedeac495271d0f0000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000000'
      )
    })

    it('throws an error if adding exactOut trade without slippage tolerance', async () => {
      const route = new Route([DAI_USDC, USDC_WETH], DAI, WETH9[1])
      const trade = await Trade.fromRoute(
        route,
        CurrencyAmount.fromRawAmount(WETH9[1], ONE_ETHER.toString()),
        TradeType.EXACT_OUTPUT
      )
      expect(() => planner.addTrade(trade)).toThrow('ExactOut requires slippageTolerance')
    })

    it('throws an error if adding exactOut trade without slippage tolerance', async () => {
      const slippageTolerance = new Percent('5')
      const amount = CurrencyAmount.fromRawAmount(WETH9[1], ONE_ETHER.toString())
      const route1 = new Route([DAI_USDC, USDC_WETH], DAI, WETH9[1])
      const route2 = new Route([DAI_WETH], DAI, WETH9[1])
      const trade = await Trade.fromRoutes(
        [
          { route: route1, amount },
          { route: route2, amount },
        ],
        TradeType.EXACT_OUTPUT
      )
      expect(() => planner.addTrade(trade, slippageTolerance)).toThrow(
        'Only accepts Trades with 1 swap (must break swaps into individual trades)'
      )
    })
  })

  describe('addSettle', () => {
    it('completes a settle without a specified amount', async () => {
      const payerIsUser = true
      planner.addSettle(DAI, payerIsUser)

      expect(planner.actions).toEqual('0x09')
      expect(planner.params[0]).toEqual(
        '0x0000000000000000000000006b175474e89094c44da98b954eedeac495271d0f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001'
      )
    })

    it('completes a settle with a specified amount', async () => {
      const payerIsUser = true
      const amount = BigNumber.from('8')
      planner.addSettle(DAI, payerIsUser, amount)

      expect(planner.actions).toEqual('0x09')
      expect(planner.params[0]).toEqual(
        '0x0000000000000000000000006b175474e89094c44da98b954eedeac495271d0f00000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000001'
      )
    })

    it('completes a settle with payerIsUser as false', async () => {
      const payerIsUser = false
      const amount = BigNumber.from('8')
      planner.addSettle(DAI, payerIsUser, amount)

      expect(planner.actions).toEqual('0x09')
      expect(planner.params[0]).toEqual(
        '0x0000000000000000000000006b175474e89094c44da98b954eedeac495271d0f00000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000'
      )
    })
  })

  describe('addTrade', () => {
    it('completes a take without a specified amount', async () => {
      const recipient = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      planner.addTake(DAI, recipient)

      expect(planner.actions).toEqual('0x12')
      expect(planner.params[0]).toEqual(
        '0x0000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000000000000000000000000000000000000000000000000000000000'
      )
    })

    it('completes a take with a specified amount', async () => {
      const recipient = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      const amount = BigNumber.from('8')
      planner.addTake(DAI, recipient, amount)

      expect(planner.actions).toEqual('0x12')
      expect(planner.params[0]).toEqual(
        '0x0000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000000000000000000000000000000000000000000000000000000008'
      )
    })
  })
})
