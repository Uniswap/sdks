import { expect } from 'chai'
import { Token, WETH9 } from '@uniswap/sdk-core'
import { encodeSqrtRatioX96, nearestUsableTick, TickMath } from '@uniswap/v3-sdk'
import { ethers, BigNumber } from 'ethers'
import { CommandParser, UniversalRouterCall } from '../../src/utils/commandParser'
import { RoutePlanner, CommandType } from '../../src/utils/routerCommands'
import { SwapRouter } from '../../src/swapRouter'
import { V4Planner, Actions, Pool } from '@uniswap/v4-sdk'

const addressOne = '0x0000000000000000000000000000000000000001'
const addressTwo = '0x0000000000000000000000000000000000000002'
const amount = ethers.utils.parseEther('1')
const TICKLIST = [
  {
    index: nearestUsableTick(TickMath.MIN_TICK, 10),
    liquidityNet: amount,
    liquidityGross: amount,
  },
  {
    index: nearestUsableTick(TickMath.MAX_TICK, 10),
    liquidityNet: amount.mul(-1),
    liquidityGross: amount,
  },
]
const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin')
const USDC_WETH = new Pool(
  USDC,
  WETH9[1],
  3000,
  10,
  ethers.constants.AddressZero,
  encodeSqrtRatioX96(1, 1),
  0,
  0,
  TICKLIST
)

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
    {
      input: new RoutePlanner().addCommand(CommandType.V4_SWAP, [
        new V4Planner()
          .addAction(Actions.SWAP_EXACT_IN_SINGLE, [
            {
              poolKey: USDC_WETH.poolKey,
              zeroForOne: true,
              amountIn: amount,
              amountOutMinimum: amount,
              hookData: '0x',
            },
          ])
          .finalize(),
      ]),
      result: {
        commands: [
          {
            commandName: 'V4_SWAP',
            commandType: CommandType.V4_SWAP,
            params: [
              {
                name: 'SWAP_EXACT_IN_SINGLE',
                value: [
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
        ],
      },
    },
    {
      input: new RoutePlanner().addCommand(CommandType.V4_SWAP, [
        new V4Planner().addAction(Actions.TAKE_ALL, [addressOne, amount]).finalize(),
      ]),
      result: {
        commands: [
          {
            commandName: 'V4_SWAP',
            commandType: CommandType.V4_SWAP,
            params: [
              {
                name: 'TAKE_ALL',
                value: [
                  {
                    name: 'currency',
                    value: addressOne,
                  },
                  {
                    name: 'minAmount',
                    value: amount,
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    {
      input: new RoutePlanner().addCommand(CommandType.V4_POSITION_MANAGER_CALL, [
        new V4Planner()
          .addAction(Actions.MINT_POSITION, [USDC_WETH.poolKey, -60, 60, 5000000, amount, amount, addressOne, '0x'])
          .finalize(),
      ]),
      result: {
        commands: [
          {
            commandName: 'V4_POSITION_MANAGER_CALL',
            commandType: CommandType.V4_POSITION_MANAGER_CALL,
            params: [
              {
                name: 'MINT_POSITION',
                value: [
                  {
                    name: 'poolKey',
                    value: USDC_WETH.poolKey,
                  },
                  {
                    name: 'tickLower',
                    value: -60,
                  },
                  {
                    name: 'tickUpper',
                    value: 60,
                  },
                  {
                    name: 'liquidity',
                    value: BigNumber.from(5000000),
                  },
                  {
                    name: 'amount0Max',
                    value: amount,
                  },
                  {
                    name: 'amount1Max',
                    value: amount,
                  },
                  {
                    name: 'owner',
                    value: addressOne,
                  },
                  {
                    name: 'hookData',
                    value: '0x',
                  },
                ],
              },
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
