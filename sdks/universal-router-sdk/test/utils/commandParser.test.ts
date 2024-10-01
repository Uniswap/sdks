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
