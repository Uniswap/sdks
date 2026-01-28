import { expect } from 'chai'
import { CurrencyAmount, WETH9 } from '@uniswap/sdk-core'
import { ethers, BigNumber } from 'ethers'
import { Route } from '../entities/route'
import { Trade } from '../entities/trade'
import { encodeRouteToPath } from './encodeRouteToPath'
import { V4BaseActionsParser, V4RouterCall, SwapExactIn, SwapExactOut } from './v4BaseActionsParser'
import { V4Planner, Actions, URVersion } from './v4Planner'
import { USDC_WETH, DAI_USDC, DAI, USDC } from './v4Planner.test'
import { TradeType } from '@uniswap/sdk-core'
import JSBI from 'jsbi'

const addressOne = '0x0000000000000000000000000000000000000001'
const addressTwo = '0x0000000000000000000000000000000000000002'
const amount = ethers.utils.parseEther('1')

describe('Command Parser', () => {
  type ParserTest = {
    input: V4Planner
    result: V4RouterCall
  }

  const tests: ParserTest[] = [
    {
      input: new V4Planner().addAction(Actions.SWEEP, [addressOne, addressTwo]),
      result: {
        actions: [
          {
            actionName: 'SWEEP',
            actionType: Actions.SWEEP,
            params: [
              { name: 'currency', value: addressOne },
              { name: 'recipient', value: addressTwo },
            ],
          },
        ],
      },
    },
    {
      input: new V4Planner().addAction(Actions.CLOSE_CURRENCY, [addressOne]),
      result: {
        actions: [
          {
            actionName: 'CLOSE_CURRENCY',
            actionType: Actions.CLOSE_CURRENCY,
            params: [{ name: 'currency', value: addressOne }],
          },
        ],
      },
    },

    {
      input: new V4Planner().addAction(Actions.TAKE_PAIR, [addressOne, addressTwo, addressOne]),
      result: {
        actions: [
          {
            actionName: 'TAKE_PAIR',
            actionType: Actions.TAKE_PAIR,
            params: [
              { name: 'currency0', value: addressOne },
              { name: 'currency1', value: addressTwo },
              { name: 'recipient', value: addressOne },
            ],
          },
        ],
      },
    },
    {
      input: new V4Planner().addAction(Actions.TAKE_PORTION, [addressOne, addressTwo, amount]),
      result: {
        actions: [
          {
            actionName: 'TAKE_PORTION',
            actionType: Actions.TAKE_PORTION,
            params: [
              { name: 'currency', value: addressOne },
              { name: 'recipient', value: addressTwo },
              { name: 'bips', value: amount },
            ],
          },
        ],
      },
    },
    {
      input: new V4Planner().addAction(Actions.TAKE_ALL, [addressOne, amount]),
      result: {
        actions: [
          {
            actionName: 'TAKE_ALL',
            actionType: Actions.TAKE_ALL,
            params: [
              { name: 'currency', value: addressOne },
              { name: 'minAmount', value: amount },
            ],
          },
        ],
      },
    },
    {
      input: new V4Planner().addAction(Actions.TAKE, [addressOne, addressTwo, amount]),
      result: {
        actions: [
          {
            actionName: 'TAKE',
            actionType: Actions.TAKE,
            params: [
              { name: 'currency', value: addressOne },
              { name: 'recipient', value: addressTwo },
              { name: 'amount', value: amount },
            ],
          },
        ],
      },
    },
    {
      input: new V4Planner().addAction(Actions.SETTLE_PAIR, [addressOne, addressTwo]),
      result: {
        actions: [
          {
            actionName: 'SETTLE_PAIR',
            actionType: Actions.SETTLE_PAIR,
            params: [
              { name: 'currency0', value: addressOne },
              { name: 'currency1', value: addressTwo },
            ],
          },
        ],
      },
    },
    {
      input: new V4Planner().addAction(Actions.SETTLE, [addressOne, amount, true]),
      result: {
        actions: [
          {
            actionName: 'SETTLE',
            actionType: Actions.SETTLE,
            params: [
              { name: 'currency', value: addressOne },
              { name: 'amount', value: amount },
              { name: 'payerIsUser', value: true },
            ],
          },
        ],
      },
    },
    {
      input: new V4Planner().addAction(Actions.SWAP_EXACT_IN_SINGLE, [
        {
          poolKey: USDC_WETH.poolKey,
          zeroForOne: true,
          amountIn: amount,
          amountOutMinimum: amount,
          hookData: '0x',
        },
      ]),
      result: {
        actions: [
          {
            actionName: 'SWAP_EXACT_IN_SINGLE',
            actionType: Actions.SWAP_EXACT_IN_SINGLE,
            params: [
              {
                name: 'swap',
                value: {
                  poolKey: USDC_WETH.poolKey,
                  zeroForOne: true,
                  amountIn: amount,
                  amountOutMinimum: amount,
                  hookData: '0x',
                },
              },
            ],
          },
        ],
      },
    },
    {
      input: new V4Planner().addAction(Actions.SWAP_EXACT_OUT_SINGLE, [
        {
          poolKey: USDC_WETH.poolKey,
          zeroForOne: true,
          amountOut: amount,
          amountInMaximum: amount,
          hookData: '0x',
        },
      ]),
      result: {
        actions: [
          {
            actionName: 'SWAP_EXACT_OUT_SINGLE',
            actionType: Actions.SWAP_EXACT_OUT_SINGLE,
            params: [
              {
                name: 'swap',
                value: {
                  poolKey: USDC_WETH.poolKey,
                  zeroForOne: true,
                  amountOut: amount,
                  amountInMaximum: amount,
                  hookData: '0x',
                },
              },
            ],
          },
        ],
      },
    },
    // V2.0: SWAP_EXACT_IN without maxHopSlippage
    {
      input: new V4Planner().addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn: DAI.address,
          path: encodeRouteToPath(new Route([DAI_USDC, USDC_WETH], DAI, WETH9[1])),
          amountIn: amount,
          amountOutMinimum: amount,
        },
      ]),
      result: {
        actions: [
          {
            actionName: 'SWAP_EXACT_IN',
            actionType: Actions.SWAP_EXACT_IN,
            params: [
              {
                name: 'swap',
                value: {
                  currencyIn: DAI.address,
                  path: [
                    {
                      intermediateCurrency: USDC.address,
                      fee: DAI_USDC.fee,
                      tickSpacing: DAI_USDC.tickSpacing,
                      hooks: DAI_USDC.hooks,
                      hookData: '0x',
                    },
                    {
                      intermediateCurrency: WETH9[1].address,
                      fee: USDC_WETH.fee,
                      tickSpacing: USDC_WETH.tickSpacing,
                      hooks: USDC_WETH.hooks,
                      hookData: '0x',
                    },
                  ],
                  amountIn: amount,
                  amountOutMinimum: amount,
                },
              },
            ],
          },
        ],
      },
    },
    // V2.0: SWAP_EXACT_OUT without maxHopSlippage
    {
      input: new V4Planner().addAction(Actions.SWAP_EXACT_OUT, [
        {
          currencyOut: DAI.address,
          path: encodeRouteToPath(new Route([DAI_USDC, USDC_WETH], DAI, WETH9[1])),
          amountOut: amount,
          amountInMaximum: amount,
        },
      ]),
      result: {
        actions: [
          {
            actionName: 'SWAP_EXACT_OUT',
            actionType: Actions.SWAP_EXACT_OUT,
            params: [
              {
                name: 'swap',
                value: {
                  currencyOut: DAI.address,
                  path: [
                    {
                      intermediateCurrency: USDC.address,
                      fee: DAI_USDC.fee,
                      tickSpacing: DAI_USDC.tickSpacing,
                      hooks: DAI_USDC.hooks,
                      hookData: '0x',
                    },
                    {
                      intermediateCurrency: WETH9[1].address,
                      fee: USDC_WETH.fee,
                      tickSpacing: USDC_WETH.tickSpacing,
                      hooks: USDC_WETH.hooks,
                      hookData: '0x',
                    },
                  ],
                  amountOut: amount,
                  amountInMaximum: amount,
                },
              },
            ],
          },
        ],
      },
    },
  ]

  for (const test of tests) {
    it(`should parse calldata ${test.input.actions}`, () => {
      const calldata = test.input.finalize()
      const result = V4BaseActionsParser.parseCalldata(calldata)
      expect(result).to.deep.equal(test.result)
    })
  }
})

describe('Version-aware Parser', () => {
  const ONE_ETHER = JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(18))

  describe('V2.0 parsing (default)', () => {
    it('should parse SWAP_EXACT_IN without maxHopSlippage', async () => {
      const route = new Route([DAI_USDC, USDC_WETH], DAI, WETH9[1])
      const trade = await Trade.fromRoute(
        route,
        CurrencyAmount.fromRawAmount(DAI, ONE_ETHER.toString()),
        TradeType.EXACT_INPUT
      )

      const planner = new V4Planner()
      planner.addTrade(trade) // Default is V2.0

      const calldata = planner.finalize()
      const result = V4BaseActionsParser.parseCalldata(calldata) // Default is V2.0

      expect(result.actions).to.have.length(1)
      expect(result.actions[0].actionName).to.equal('SWAP_EXACT_IN')

      const swapValue = result.actions[0].params[0].value as SwapExactIn
      expect(swapValue.currencyIn).to.equal(DAI.address)
      expect(swapValue.path).to.have.length(2)
      expect(swapValue.maxHopSlippage).to.be.undefined // V2.0 does not have maxHopSlippage
    })

    it('should parse SWAP_EXACT_OUT without maxHopSlippage', async () => {
      const route = new Route([DAI_USDC, USDC_WETH], DAI, WETH9[1])
      const trade = await Trade.fromRoute(
        route,
        CurrencyAmount.fromRawAmount(WETH9[1], ONE_ETHER.toString()),
        TradeType.EXACT_OUTPUT
      )

      const planner = new V4Planner()
      planner.addTrade(trade, new (await import('@uniswap/sdk-core')).Percent('5')) // Default is V2.0

      const calldata = planner.finalize()
      const result = V4BaseActionsParser.parseCalldata(calldata) // Default is V2.0

      expect(result.actions).to.have.length(1)
      expect(result.actions[0].actionName).to.equal('SWAP_EXACT_OUT')

      const swapValue = result.actions[0].params[0].value as SwapExactOut
      expect(swapValue.currencyOut).to.equal(WETH9[1].address)
      expect(swapValue.path).to.have.length(2)
      expect(swapValue.maxHopSlippage).to.be.undefined // V2.0 does not have maxHopSlippage
    })
  })

  describe('V2.1 parsing', () => {
    it('should parse SWAP_EXACT_IN with maxHopSlippage', async () => {
      const route = new Route([DAI_USDC, USDC_WETH], DAI, WETH9[1])
      const trade = await Trade.fromRoute(
        route,
        CurrencyAmount.fromRawAmount(DAI, ONE_ETHER.toString()),
        TradeType.EXACT_INPUT
      )

      const maxHopSlippage = [BigNumber.from('10000'), BigNumber.from('20000')]

      const planner = new V4Planner()
      planner.addTrade(trade, undefined, maxHopSlippage, URVersion.V2_1)

      const calldata = planner.finalize()
      const result = V4BaseActionsParser.parseCalldata(calldata, URVersion.V2_1)

      expect(result.actions).to.have.length(1)
      expect(result.actions[0].actionName).to.equal('SWAP_EXACT_IN')

      const swapValue = result.actions[0].params[0].value as SwapExactIn
      expect(swapValue.currencyIn).to.equal(DAI.address)
      expect(swapValue.path).to.have.length(2)
      expect(swapValue.maxHopSlippage).to.not.be.undefined
      expect(swapValue.maxHopSlippage).to.have.length(2)
      expect(swapValue.maxHopSlippage![0].toString()).to.equal('10000')
      expect(swapValue.maxHopSlippage![1].toString()).to.equal('20000')
    })

    it('should parse SWAP_EXACT_OUT with maxHopSlippage', async () => {
      const route = new Route([DAI_USDC, USDC_WETH], DAI, WETH9[1])
      const trade = await Trade.fromRoute(
        route,
        CurrencyAmount.fromRawAmount(WETH9[1], ONE_ETHER.toString()),
        TradeType.EXACT_OUTPUT
      )

      const maxHopSlippage = [BigNumber.from('15000'), BigNumber.from('25000')]

      const planner = new V4Planner()
      planner.addTrade(trade, new (await import('@uniswap/sdk-core')).Percent('5'), maxHopSlippage, URVersion.V2_1)

      const calldata = planner.finalize()
      const result = V4BaseActionsParser.parseCalldata(calldata, URVersion.V2_1)

      expect(result.actions).to.have.length(1)
      expect(result.actions[0].actionName).to.equal('SWAP_EXACT_OUT')

      const swapValue = result.actions[0].params[0].value as SwapExactOut
      expect(swapValue.currencyOut).to.equal(WETH9[1].address)
      expect(swapValue.path).to.have.length(2)
      expect(swapValue.maxHopSlippage).to.not.be.undefined
      expect(swapValue.maxHopSlippage).to.have.length(2)
      expect(swapValue.maxHopSlippage![0].toString()).to.equal('15000')
      expect(swapValue.maxHopSlippage![1].toString()).to.equal('25000')
    })

    it('should parse SWAP_EXACT_IN with empty maxHopSlippage array', async () => {
      const route = new Route([DAI_USDC, USDC_WETH], DAI, WETH9[1])
      const trade = await Trade.fromRoute(
        route,
        CurrencyAmount.fromRawAmount(DAI, ONE_ETHER.toString()),
        TradeType.EXACT_INPUT
      )

      const planner = new V4Planner()
      planner.addTrade(trade, undefined, undefined, URVersion.V2_1) // No maxHopSlippage provided, defaults to []

      const calldata = planner.finalize()
      const result = V4BaseActionsParser.parseCalldata(calldata, URVersion.V2_1)

      expect(result.actions).to.have.length(1)
      expect(result.actions[0].actionName).to.equal('SWAP_EXACT_IN')

      const swapValue = result.actions[0].params[0].value as SwapExactIn
      expect(swapValue.maxHopSlippage).to.not.be.undefined
      expect(swapValue.maxHopSlippage).to.have.length(0) // Empty array
    })
  })

  describe('Round-trip encoding/parsing', () => {
    it('should round-trip V2.0 SWAP_EXACT_IN correctly', async () => {
      const route = new Route([DAI_USDC, USDC_WETH], DAI, WETH9[1])
      const trade = await Trade.fromRoute(
        route,
        CurrencyAmount.fromRawAmount(DAI, ONE_ETHER.toString()),
        TradeType.EXACT_INPUT
      )

      const planner = new V4Planner()
      planner.addTrade(trade)

      const calldata = planner.finalize()
      const result = V4BaseActionsParser.parseCalldata(calldata)

      const swapValue = result.actions[0].params[0].value as SwapExactIn
      expect(swapValue.currencyIn).to.equal(DAI.address)
      expect(swapValue.amountIn.toString()).to.equal(ONE_ETHER.toString())
    })

    it('should round-trip V2.1 SWAP_EXACT_IN with maxHopSlippage correctly', async () => {
      const route = new Route([DAI_USDC, USDC_WETH], DAI, WETH9[1])
      const trade = await Trade.fromRoute(
        route,
        CurrencyAmount.fromRawAmount(DAI, ONE_ETHER.toString()),
        TradeType.EXACT_INPUT
      )

      const maxHopSlippage = [BigNumber.from('12345'), BigNumber.from('67890')]

      const planner = new V4Planner()
      planner.addTrade(trade, undefined, maxHopSlippage, URVersion.V2_1)

      const calldata = planner.finalize()
      const result = V4BaseActionsParser.parseCalldata(calldata, URVersion.V2_1)

      const swapValue = result.actions[0].params[0].value as SwapExactIn
      expect(swapValue.currencyIn).to.equal(DAI.address)
      expect(swapValue.amountIn.toString()).to.equal(ONE_ETHER.toString())
      expect(swapValue.maxHopSlippage![0].toString()).to.equal('12345')
      expect(swapValue.maxHopSlippage![1].toString()).to.equal('67890')
    })
  })
})
