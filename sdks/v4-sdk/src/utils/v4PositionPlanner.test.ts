import { expect } from 'chai'
import { BigNumber, ethers } from 'ethers'
import { V4RouterActionParser, V4RouterCall } from './v4CommandParser'
import { V4Planner, Actions } from './v4Planner'
import { USDC_WETH } from './v4Planner.test'

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
            params: [
              { name: 'currency', value: addressOne },
            ],
          },
        ],
      },
    },
    {
      input: new V4Planner().addAction(Actions.SETTLE_TAKE_PAIR, [addressOne, addressTwo]),
      result: {
        actions: [
          {
            actionName: 'SETTLE_TAKE_PAIR',
            actionType: Actions.SETTLE_TAKE_PAIR,
            params: [
              { name: 'settleCurrency', value: addressOne },
              { name: 'takeCurrency', value: addressTwo },
            ],
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
      input: new V4Planner().addAction(Actions.SWAP_EXACT_IN_SINGLE, [{
          poolKey: USDC_WETH.poolKey,
          zeroForOne: true,
          amountIn: amount,
          amountOutMinimum: amount,
          sqrtPriceLimitX96: 0,
          hookData: '0x',
      }]),
      result: {
        actions: [
          {
            actionName: 'SWAP_EXACT_IN_SINGLE',
            actionType: Actions.SWAP_EXACT_IN_SINGLE,
            params: [
              { name: 'poolKey', value: USDC_WETH.poolKey },
              { name: 'zeroForOne', value: true },
              { name: 'amountIn', value: amount },
              { name: 'amountOutMinimum', value: amount },
              { name: 'sqrtPriceLimitX96', value: BigNumber.from(0) },
              { name: 'hookData', value: '0x' },
            ],
          },
        ],
      },
    },
  ]

  for (const test of tests) {
    it(`should parse calldata ${test.input.actions}`, () => {
      const calldata = test.input.finalize()
      const result = V4RouterActionParser.parseCalldata(calldata)
      expect(result).to.deep.equal(test.result)
    })
  }
})
