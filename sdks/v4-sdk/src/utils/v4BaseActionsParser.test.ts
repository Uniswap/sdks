import { expect } from 'chai'
import { WETH9 } from '@uniswap/sdk-core'
import { ethers } from 'ethers'
import { Route } from '../entities/route'
import { encodeRouteToPath } from './encodeRouteToPath'
import { V4BaseActionsParser, V4RouterCall } from './v4BaseActionsParser'
import { V4Planner, Actions } from './v4Planner'
import { USDC_WETH, DAI_USDC, DAI, USDC } from './v4Planner.test'

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
