import { expect } from 'chai'
import { Token, WETH9, CurrencyAmount, TradeType } from '@uniswap/sdk-core'
import { encodeSqrtRatioX96, nearestUsableTick, TickMath } from '@uniswap/v3-sdk'
import { ethers, BigNumber } from 'ethers'
import { CommandParser, Param, UniversalRouterCall } from '../../src/utils/commandParser'
import { RoutePlanner, CommandType } from '../../src/utils/routerCommands'
import { CONTRACT_BALANCE, UniversalRouterVersion } from '../../src/utils/constants'
import { SwapRouter } from '../../src/swapRouter'
import { V4Planner, Actions, Pool, Route as V4Route, Trade as V4Trade } from '@uniswap/v4-sdk'
import { Trade as RouterTrade } from '@uniswap/router-sdk'
import { WETH, USDC as USDC_DATA, DAI, makeV4Pool, swapOptions } from './uniswapData'

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
    version?: UniversalRouterVersion
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
      input: new RoutePlanner().addCommand(CommandType.PAY_PORTION_FULL_PRECISION, [addressOne, addressTwo, amount]),
      result: {
        commands: [
          {
            commandName: 'PAY_PORTION_FULL_PRECISION',
            commandType: CommandType.PAY_PORTION_FULL_PRECISION,
            params: [
              { name: 'token', value: addressOne },
              { name: 'recipient', value: addressTwo },
              { name: 'portion', value: amount },
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
    // V2.1.1 V3 exact-in carries the trailing minHopPriceX36 array and must round-trip through the decoder
    {
      version: UniversalRouterVersion.V2_1_1,
      input: new RoutePlanner().addCommand(
        CommandType.V3_SWAP_EXACT_IN,
        [addressOne, amount, amount, encodePathExactInput([addressOne, addressTwo], 123), true, ['500', '600']],
        false,
        UniversalRouterVersion.V2_1_1
      ),
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
              { name: 'minHopPriceX36', value: [BigNumber.from(500), BigNumber.from(600)] },
            ],
          },
        ],
      },
    },
    // V2.1.1 V3 exact-out
    {
      version: UniversalRouterVersion.V2_1_1,
      input: new RoutePlanner().addCommand(
        CommandType.V3_SWAP_EXACT_OUT,
        [addressOne, amount, amount, encodePathExactOutput([addressOne, addressTwo], 123), true, ['750']],
        false,
        UniversalRouterVersion.V2_1_1
      ),
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
              { name: 'minHopPriceX36', value: [BigNumber.from(750)] },
            ],
          },
        ],
      },
    },
    // V2.1.1 V2 exact-in
    {
      version: UniversalRouterVersion.V2_1_1,
      input: new RoutePlanner().addCommand(
        CommandType.V2_SWAP_EXACT_IN,
        [addressOne, amount, amount, [addressOne, addressTwo], true, ['500', '600']],
        false,
        UniversalRouterVersion.V2_1_1
      ),
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
              { name: 'minHopPriceX36', value: [BigNumber.from(500), BigNumber.from(600)] },
            ],
          },
        ],
      },
    },
    // V2.1.1 V2 exact-out
    {
      version: UniversalRouterVersion.V2_1_1,
      input: new RoutePlanner().addCommand(
        CommandType.V2_SWAP_EXACT_OUT,
        [addressOne, amount, amount, [addressOne, addressTwo], true, ['250']],
        false,
        UniversalRouterVersion.V2_1_1
      ),
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
              { name: 'minHopPriceX36', value: [BigNumber.from(250)] },
            ],
          },
        ],
      },
    },
    // V2.3.0 UNWRAP_WETH carries an explicit exact amount: (recipient, amount, minAmount)
    {
      version: UniversalRouterVersion.V2_3_0,
      input: new RoutePlanner().addCommand(
        CommandType.UNWRAP_WETH,
        [addressOne, amount, amount],
        false,
        UniversalRouterVersion.V2_3_0
      ),
      result: {
        commands: [
          {
            commandName: 'UNWRAP_WETH',
            commandType: CommandType.UNWRAP_WETH,
            params: [
              { name: 'recipient', value: addressOne },
              { name: 'amount', value: amount },
              { name: 'minAmount', value: amount },
            ],
          },
        ],
      },
    },
    // V2.3.0 UNWRAP_WETH full-balance sentinel (CONTRACT_BALANCE) round-trips
    {
      version: UniversalRouterVersion.V2_3_0,
      input: new RoutePlanner().addCommand(
        CommandType.UNWRAP_WETH,
        [addressOne, CONTRACT_BALANCE, amount],
        false,
        UniversalRouterVersion.V2_3_0
      ),
      result: {
        commands: [
          {
            commandName: 'UNWRAP_WETH',
            commandType: CommandType.UNWRAP_WETH,
            params: [
              { name: 'recipient', value: addressOne },
              { name: 'amount', value: CONTRACT_BALANCE },
              { name: 'minAmount', value: amount },
            ],
          },
        ],
      },
    },
    // V2.2.0 still decodes the legacy 2-param UNWRAP_WETH
    {
      version: UniversalRouterVersion.V2_2_0,
      input: new RoutePlanner().addCommand(
        CommandType.UNWRAP_WETH,
        [addressOne, amount],
        false,
        UniversalRouterVersion.V2_2_0
      ),
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
    // V2.3.0 keeps decoding the V2.1.1 swap-command overrides (version tiers layer)
    {
      version: UniversalRouterVersion.V2_3_0,
      input: new RoutePlanner().addCommand(
        CommandType.V3_SWAP_EXACT_IN,
        [addressOne, amount, amount, encodePathExactInput([addressOne, addressTwo], 123), true, ['500', '600']],
        false,
        UniversalRouterVersion.V2_3_0
      ),
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
              { name: 'minHopPriceX36', value: [BigNumber.from(500), BigNumber.from(600)] },
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

  // Helper to convert BigNumbers to strings for comparison
  function normalizeBigNumbers(obj: any): any {
    if (obj == null) return obj
    if (BigNumber.isBigNumber(obj)) return obj.toString()
    if (Array.isArray(obj)) return obj.map(normalizeBigNumbers)
    if (typeof obj === 'object') {
      const normalized: any = {}
      for (const key in obj) {
        normalized[key] = normalizeBigNumbers(obj[key])
      }
      return normalized
    }
    return obj
  }

  for (const test of tests) {
    it(`should parse calldata ${test.input.commands}`, () => {
      const { commands, inputs } = test.input
      const functionSignature = 'execute(bytes,bytes[])'
      const calldata = SwapRouter.INTERFACE.encodeFunctionData(functionSignature, [commands, inputs])

      const result = CommandParser.parseCalldata(calldata, test.version)
      // Normalize BigNumbers in both objects for comparison
      expect(normalizeBigNumbers(result)).to.deep.equal(normalizeBigNumbers(test.result))
    })
  }

  // V4 swaps are delegated to V4BaseActionsParser; the V2.1.1 minHopPriceX36 lives inside the
  // swap action struct, so verify it survives a full round-trip through CommandParser.
  describe('V4 per-hop slippage (V2.1.1)', () => {
    const WETH_USDC_V4 = makeV4Pool(WETH, USDC_DATA)
    const USDC_DAI_V4 = makeV4Pool(USDC_DATA, DAI)

    it('surfaces minHopPriceX36 in the decoded V4_SWAP action', () => {
      const v4Route = new V4Route([WETH_USDC_V4, USDC_DAI_V4], WETH, DAI)
      const v4Trade = V4Trade.createUncheckedTrade({
        route: v4Route,
        inputAmount: CurrencyAmount.fromRawAmount(WETH, '1000000000000000000'),
        outputAmount: CurrencyAmount.fromRawAmount(DAI, '1000000000000000000'),
        tradeType: TradeType.EXACT_INPUT,
      })
      const trade = new RouterTrade({
        v4Routes: [
          {
            routev4: v4Trade.route,
            inputAmount: v4Trade.inputAmount,
            outputAmount: v4Trade.outputAmount,
            minHopPriceX36: [BigInt(1000), BigInt(2000)],
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { calldata } = SwapRouter.swapCallParameters(
        trade,
        swapOptions({ urVersion: UniversalRouterVersion.V2_1_1 })
      )

      const result = CommandParser.parseCalldata(calldata, UniversalRouterVersion.V2_1_1)
      const v4Command = result.commands.find((c) => c.commandType === CommandType.V4_SWAP)
      expect(v4Command, 'expected a V4_SWAP command').to.not.be.undefined

      const swapAction = v4Command!.params.find((p) => p.name === 'SWAP_EXACT_IN')
      expect(swapAction, 'expected a SWAP_EXACT_IN action').to.not.be.undefined

      const swapStruct = (swapAction!.value as Param[]).find((p) => p.name === 'swap')!.value as any
      expect(swapStruct.minHopPriceX36.map((v: BigNumber) => v.toString())).to.deep.equal(['1000', '2000'])
    })

    it('omits minHopPriceX36 when decoding the same V4 swap as V2_0', () => {
      const v4Route = new V4Route([WETH_USDC_V4, USDC_DAI_V4], WETH, DAI)
      const v4Trade = V4Trade.createUncheckedTrade({
        route: v4Route,
        inputAmount: CurrencyAmount.fromRawAmount(WETH, '1000000000000000000'),
        outputAmount: CurrencyAmount.fromRawAmount(DAI, '1000000000000000000'),
        tradeType: TradeType.EXACT_INPUT,
      })
      const trade = new RouterTrade({
        v4Routes: [{ routev4: v4Trade.route, inputAmount: v4Trade.inputAmount, outputAmount: v4Trade.outputAmount }],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { calldata } = SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: UniversalRouterVersion.V2_0 }))

      const result = CommandParser.parseCalldata(calldata, UniversalRouterVersion.V2_0)
      const v4Command = result.commands.find((c) => c.commandType === CommandType.V4_SWAP)!
      const swapAction = v4Command.params.find((p) => p.name === 'SWAP_EXACT_IN')!
      const swapStruct = (swapAction.value as Param[]).find((p) => p.name === 'swap')!.value as any
      expect(swapStruct.minHopPriceX36).to.be.undefined
    })
  })
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
