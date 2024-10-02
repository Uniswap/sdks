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
              { name: 'amount', value: amount },
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
              { name: 'amount', value: amount },
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
    {
      input: new RoutePlanner().addCommand(CommandType.V3_SWAP_EXACT_IN, [
        addressOne,
        amount,
        amount,
        encodePathExactInput([addressOne, addressTwo], 123),
        true,
      ]),
      result: {
        commands: [
          {
            commandName: 'V3_SWAP_EXACT_IN',
            commandType: CommandType.V3_SWAP_EXACT_IN,
            params: [
              { name: 'recipient', value: addressOne },
              { name: 'amountIn', value: amount },
              { name: 'amountOutMin', value: amount },
              { name: 'path', value: [{ tokenIn: addressOne, tokenOut: addressTwo, fee: 123 }] },
              { name: 'payerIsUser', value: true },
            ],
          },
        ],
      },
    },
    {
      input: new RoutePlanner().addCommand(CommandType.V3_SWAP_EXACT_OUT, [
        addressOne,
        amount,
        amount,
        encodePathExactOutput([addressOne, addressTwo], 123),
        true,
      ]),
      result: {
        commands: [
          {
            commandName: 'V3_SWAP_EXACT_OUT',
            commandType: CommandType.V3_SWAP_EXACT_OUT,
            params: [
              { name: 'recipient', value: addressOne },
              { name: 'amountOut', value: amount },
              { name: 'amountInMax', value: amount },
              { name: 'path', value: [{ tokenIn: addressOne, tokenOut: addressTwo, fee: 123 }] },
              { name: 'payerIsUser', value: true },
            ],
          },
        ],
      },
    },
    {
      input: new RoutePlanner().addCommand(CommandType.V2_SWAP_EXACT_IN, [
        addressOne,
        amount,
        amount,
        [addressOne, addressTwo],
        true,
      ]),
      result: {
        commands: [
          {
            commandName: 'V2_SWAP_EXACT_IN',
            commandType: CommandType.V2_SWAP_EXACT_IN,
            params: [
              { name: 'recipient', value: addressOne },
              { name: 'amountIn', value: amount },
              { name: 'amountOutMin', value: amount },
              { name: 'path', value: [addressOne, addressTwo] },
              { name: 'payerIsUser', value: true },
            ],
          },
        ],
      },
    },
    {
      input: new RoutePlanner().addCommand(CommandType.V2_SWAP_EXACT_OUT, [
        addressOne,
        amount,
        amount,
        [addressOne, addressTwo],
        true,
      ]),
      result: {
        commands: [
          {
            commandName: 'V2_SWAP_EXACT_OUT',
            commandType: CommandType.V2_SWAP_EXACT_OUT,
            params: [
              { name: 'recipient', value: addressOne },
              { name: 'amountOut', value: amount },
              { name: 'amountInMax', value: amount },
              { name: 'path', value: [addressOne, addressTwo] },
              { name: 'payerIsUser', value: true },
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

function encodePath(path: string[], fee: number): string {
  let encoded = '0x'
  for (let i = 0; i < path.length - 1; i++) {
    // 20 byte encoding of the address
    encoded += path[i].slice(2)
    // 3 byte encoding of the fee
    encoded += fee.toString(16).padStart(6, '0')
  }
  // encode the final token
  encoded += path[path.length - 1].slice(2)

  return encoded.toLowerCase()
}

function encodePathExactInput(tokens: string[], fee: number): string {
  return encodePath(tokens, fee)
}

function encodePathExactOutput(tokens: string[], fee: number): string {
  return encodePath(tokens.slice().reverse(), fee)
}
