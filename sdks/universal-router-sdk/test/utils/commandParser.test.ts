import { expect } from 'chai'
import { ethers } from 'ethers'
import { CommandParser, UniversalRouterCall } from '../../src/utils/commandParser'
import { RoutePlanner, CommandType } from '../../src/utils/routerCommands'
import { SwapRouter } from '../../src/swapRouter'

const addressOne = '0x0000000000000000000000000000000000000001'
const addressTwo = '0x0000000000000000000000000000000000000002'
const amount = ethers.utils.parseEther('1')

describe('Command Parser', () => {
  type ParserTest = {
    input: RoutePlanner
    result: UniversalRouterCall
  }

  const tests: ParserTest[] = [
    {
      input: new RoutePlanner().addCommand(CommandType.WRAP_ETH, [addressOne, amount]),
      result: {
        commands: [
          {
            commandName: 'WRAP_ETH',
            commandType: CommandType.WRAP_ETH,
            params: [
              { name: 'recipient', value: addressOne },
              { name: 'amountMin', value: amount },
            ],
          },
        ],
      },
    },
    {
      input: new RoutePlanner().addCommand(CommandType.UNWRAP_WETH, [addressOne, amount]),
      result: {
        commands: [
          {
            commandName: 'UNWRAP_WETH',
            commandType: CommandType.UNWRAP_WETH,
            params: [
              { name: 'recipient', value: addressOne },
              { name: 'amountMin', value: amount },
            ],
          },
        ],
      },
    },
    {
      input: new RoutePlanner().addCommand(CommandType.SWEEP, [addressOne, addressTwo, amount]),
      result: {
        commands: [
          {
            commandName: 'SWEEP',
            commandType: CommandType.SWEEP,
            params: [
              { name: 'token', value: addressOne },
              { name: 'recipient', value: addressTwo },
              { name: 'amountMin', value: amount },
            ],
          },
        ],
      },
    },
    {
      input: new RoutePlanner().addCommand(CommandType.TRANSFER, [addressOne, addressTwo, amount]),
      result: {
        commands: [
          {
            commandName: 'TRANSFER',
            commandType: CommandType.TRANSFER,
            params: [
              { name: 'token', value: addressOne },
              { name: 'recipient', value: addressTwo },
              { name: 'value', value: amount },
            ],
          },
        ],
      },
    },
    {
      input: new RoutePlanner().addCommand(CommandType.PAY_PORTION, [addressOne, addressTwo, amount]),
      result: {
        commands: [
          {
            commandName: 'PAY_PORTION',
            commandType: CommandType.PAY_PORTION,
            params: [
              { name: 'token', value: addressOne },
              { name: 'recipient', value: addressTwo },
              { name: 'bips', value: amount },
            ],
          },
        ],
      },
    },
    {
      input: new RoutePlanner().addCommand(CommandType.BALANCE_CHECK_ERC20, [addressOne, addressTwo, amount]),
      result: {
        commands: [
          {
            commandName: 'BALANCE_CHECK_ERC20',
            commandType: CommandType.BALANCE_CHECK_ERC20,
            params: [
              { name: 'owner', value: addressOne },
              { name: 'token', value: addressTwo },
              { name: 'minBalance', value: amount },
            ],
          },
        ],
      },
    },
    {
      input: new RoutePlanner()
        .addCommand(CommandType.WRAP_ETH, [addressOne, amount])
        .addCommand(CommandType.UNWRAP_WETH, [addressOne, amount]),
      result: {
        commands: [
          {
            commandName: 'WRAP_ETH',
            commandType: CommandType.WRAP_ETH,
            params: [
              { name: 'recipient', value: addressOne },
              { name: 'amountMin', value: amount },
            ],
          },
          {
            commandName: 'UNWRAP_WETH',
            commandType: CommandType.UNWRAP_WETH,
            params: [
              { name: 'recipient', value: addressOne },
              { name: 'amountMin', value: amount },
            ],
          },
        ],
      },
    },
  ]

  for (const test of tests) {
    it(`should parse calldata ${test.input.commands}`, () => {
      const { commands, inputs } = test.input
      const functionSignature = 'execute(bytes,bytes[])'
      const calldata = SwapRouter.INTERFACE.encodeFunctionData(functionSignature, [commands, inputs])

      const result = CommandParser.parseCalldata(calldata)
      expect(result).to.deep.equal(test.result)
    })
  }
})
