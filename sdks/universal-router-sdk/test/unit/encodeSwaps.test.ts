import { expect } from 'chai'
import { BigNumber, utils } from 'ethers'
import { defaultAbiCoder } from 'ethers/lib/utils'
import { Route as V3RouteSDK } from '@uniswap/v3-sdk'
import { Trade as RouterTrade } from '@uniswap/router-sdk'
import { Currency, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core'
import { URVersion, V4BaseActionsParser } from '@uniswap/v4-sdk'
import { SwapRouter } from '../../src/swapRouter'
import { TokenTransferMode } from '../../src/entities/actions/uniswap'
import {
  Fee,
  SwapSpecification,
  SwapStep,
  V2SwapExactIn,
  V3SwapExactIn,
  V3SwapExactOut,
  V4Action,
  V4Swap,
} from '../../src/types/encodeSwaps'
import { encodeSwapStep } from '../../src/utils/encodeSwapStep'
import { validateEncodeSwaps } from '../../src/utils/validateEncodeSwaps'
import { encodeFee1e18 } from '../../src/utils/numbers'
import {
  CONTRACT_BALANCE,
  ETH_ADDRESS,
  ROUTER_AS_RECIPIENT,
  SENDER_AS_RECIPIENT,
  UNIVERSAL_ROUTER_ADDRESS,
  UniversalRouterVersion,
} from '../../src/utils/constants'
import { CommandType, RoutePlanner } from '../../src/utils/routerCommands'
import { TEST_FEE_RECIPIENT_ADDRESS, TEST_RECIPIENT_ADDRESS } from '../utils/addresses'
import { DAI, ETHER as ETH, USDC, WETH, makeV3Pool, parseCommands, swapOptions } from '../utils/uniswapData'

const TEST_RECIPIENT = TEST_RECIPIENT_ADDRESS
const FEE_RECIPIENT = TEST_FEE_RECIPIENT_ADDRESS
const TEST_PERMIT = {
  details: {
    token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    amount: '1000000',
    expiration: '1000000000',
    nonce: 0,
  },
  spender: '0x0000000000000000000000000000000000000001',
  sigDeadline: '1000000000',
  signature: '0x' + '00'.repeat(65),
}

const PROXY_INTERFACE = new utils.Interface([
  'function execute(address router, address token, uint256 amount, bytes commands, bytes[] inputs, uint256 deadline) external payable',
])

function packV3Path(tokens: string[], fees: number[]): string {
  const types: string[] = ['address']
  const values: Array<string | number> = [tokens[0]]

  for (let i = 0; i < fees.length; i++) {
    types.push('uint24', 'address')
    values.push(fees[i], tokens[i + 1])
  }

  return utils.solidityPack(types, values)
}

function packV3ExactOutPath(tokens: string[], fees: number[]): string {
  const types: string[] = ['address']
  const values: Array<string | number> = [tokens[tokens.length - 1]]

  for (let i = fees.length - 1; i >= 0; i--) {
    types.push('uint24', 'address')
    values.push(fees[i], tokens[i])
  }

  return utils.solidityPack(types, values)
}

function decodeExecute(calldata: string): { commands: string; inputs: string[]; deadline?: BigNumber } {
  try {
    const decoded = SwapRouter.INTERFACE.decodeFunctionData('execute(bytes,bytes[],uint256)', calldata)
    return {
      commands: decoded.commands as string,
      inputs: decoded.inputs as string[],
      deadline: decoded.deadline as BigNumber,
    }
  } catch {
    const decoded = SwapRouter.INTERFACE.decodeFunctionData('execute(bytes,bytes[])', calldata)
    return {
      commands: decoded.commands as string,
      inputs: decoded.inputs as string[],
    }
  }
}

function exactInputGrossMin(quote: BigNumber, slippageTolerance: Percent): BigNumber {
  const numerator = BigNumber.from(slippageTolerance.numerator.toString())
  const denominator = BigNumber.from(slippageTolerance.denominator.toString())
  return quote.mul(denominator).div(denominator.add(numerator))
}

function exactOutputMaxIn(quote: BigNumber, slippageTolerance: Percent): BigNumber {
  const numerator = BigNumber.from(slippageTolerance.numerator.toString())
  const denominator = BigNumber.from(slippageTolerance.denominator.toString())
  return quote.mul(denominator.add(numerator)).div(denominator)
}

function portionAmount(amount: BigNumber, fee: Percent): BigNumber {
  return amount.mul(fee.numerator.toString()).div(fee.denominator.toString())
}

function buildSpec(
  overrides: Partial<SwapSpecification> = {},
  routingOverrides: Partial<SwapSpecification['routing']> = {}
): SwapSpecification {
  const base: SwapSpecification = {
    tradeType: TradeType.EXACT_INPUT,
    routing: {
      inputToken: USDC,
      outputToken: WETH,
      amount: CurrencyAmount.fromRawAmount(USDC, '1000000'),
      quote: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
    },
    recipient: TEST_RECIPIENT,
    slippageTolerance: new Percent(5, 100),
  }

  return {
    ...base,
    ...overrides,
    routing: {
      ...base.routing,
      ...routingOverrides,
    },
  }
}

function buildV3ExactInStep(
  overrides: Partial<V3SwapExactIn> = {},
  tokens: Currency[] = [USDC, WETH],
  fees: number[] = [500]
): V3SwapExactIn {
  return {
    type: 'V3_SWAP_EXACT_IN',
    recipient: ROUTER_AS_RECIPIENT,
    amountIn: '1000000',
    amountOutMin: '0',
    path: packV3Path(
      tokens.map((token) => token.wrapped.address),
      fees
    ),
    ...overrides,
  }
}

function buildV3ExactOutStep(
  overrides: Partial<V3SwapExactOut> = {},
  tokens: Currency[] = [USDC, WETH],
  fees: number[] = [500]
): V3SwapExactOut {
  return {
    type: 'V3_SWAP_EXACT_OUT',
    recipient: ROUTER_AS_RECIPIENT,
    amountOut: '500000000000000000',
    amountInMax: '1050000',
    path: packV3ExactOutPath(
      tokens.map((token) => token.wrapped.address),
      fees
    ),
    ...overrides,
  }
}

describe('encodeSwaps', () => {
  describe('validateEncodeSwaps', () => {
    it('rejects empty swap steps', () => {
      expect(() => validateEncodeSwaps(buildSpec(), [])).to.throw('EMPTY_SWAP_STEPS')
    })

    it('rejects ApproveProxy without chainId', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec({ tokenTransferMode: TokenTransferMode.ApproveProxy, chainId: undefined }), [
          buildV3ExactInStep(),
        ])
      ).to.throw('PROXY_MISSING_CHAIN_ID')
    })

    it('rejects ApproveProxy with native input', () => {
      expect(() =>
        validateEncodeSwaps(
          buildSpec(
            { tokenTransferMode: TokenTransferMode.ApproveProxy, chainId: 1 },
            {
              inputToken: ETH,
              amount: CurrencyAmount.fromRawAmount(ETH, '1000000000000000000'),
              quote: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
            }
          ),
          [buildV3ExactInStep({ amountIn: '1000000000000000000' }, [WETH, WETH])]
        )
      ).to.throw('PROXY_NATIVE_INPUT')
    })

    it('rejects ApproveProxy with permit', () => {
      expect(() =>
        validateEncodeSwaps(
          buildSpec({
            tokenTransferMode: TokenTransferMode.ApproveProxy,
            chainId: 1,
            permit: TEST_PERMIT,
          }),
          [buildV3ExactInStep()]
        )
      ).to.throw('PROXY_PERMIT_CONFLICT')
    })

    it('rejects ApproveProxy without an explicit recipient', () => {
      expect(() =>
        validateEncodeSwaps(
          buildSpec({
            tokenTransferMode: TokenTransferMode.ApproveProxy,
            chainId: 1,
            recipient: SENDER_AS_RECIPIENT,
          }),
          [buildV3ExactInStep()]
        )
      ).to.throw('PROXY_EXPLICIT_RECIPIENT_REQUIRED')
    })

    it('rejects native input with permit', () => {
      expect(() =>
        validateEncodeSwaps(
          buildSpec(
            { permit: TEST_PERMIT },
            {
              inputToken: ETH,
              outputToken: USDC,
              amount: CurrencyAmount.fromRawAmount(ETH, '1000000000000000000'),
              quote: CurrencyAmount.fromRawAmount(USDC, '2000000000'),
            }
          ),
          [buildV3ExactInStep({ amountIn: '1000000000000000000' }, [WETH, USDC])]
        )
      ).to.throw('NATIVE_INPUT_PERMIT')
    })

    it('rejects negative slippage', () => {
      expect(() => validateEncodeSwaps(buildSpec({ slippageTolerance: new Percent(-1, 100) }), [buildV3ExactInStep()])).to.throw(
        'SLIPPAGE_TOLERANCE'
      )
    })

    it('rejects exact-input routing amounts with the wrong currency', () => {
      expect(() =>
        validateEncodeSwaps(
          buildSpec({}, { amount: CurrencyAmount.fromRawAmount(WETH, '500000000000000000') }),
          [buildV3ExactInStep()]
        )
      ).to.throw('INVALID_ROUTING_AMOUNT_CURRENCY')
    })

    it('rejects exact-input routing quotes with the wrong currency', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec({}, { quote: CurrencyAmount.fromRawAmount(USDC, '1000000') }), [buildV3ExactInStep()])
      ).to.throw('INVALID_ROUTING_QUOTE_CURRENCY')
    })

    it('rejects exact-output routing amounts with the wrong currency', () => {
      expect(() =>
        validateEncodeSwaps(
          buildSpec(
            { tradeType: TradeType.EXACT_OUTPUT },
            {
              amount: CurrencyAmount.fromRawAmount(USDC, '1000000'),
              quote: CurrencyAmount.fromRawAmount(USDC, '1000000'),
            }
          ),
          [buildV3ExactOutStep()]
        )
      ).to.throw('INVALID_ROUTING_AMOUNT_CURRENCY')
    })

    it('rejects exact-output routing quotes with the wrong currency', () => {
      expect(() =>
        validateEncodeSwaps(
          buildSpec(
            { tradeType: TradeType.EXACT_OUTPUT },
            {
              amount: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
              quote: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
            }
          ),
          [buildV3ExactOutStep()]
        )
      ).to.throw('INVALID_ROUTING_QUOTE_CURRENCY')
    })

    it('rejects V3 swap recipients that are not router custody', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec(), [
          buildV3ExactInStep({
            recipient: TEST_RECIPIENT,
          }),
        ])
      ).to.throw('STEP_RECIPIENT_MUST_BE_ROUTER')
    })

    it('rejects V2 swap recipients that use SENDER_AS_RECIPIENT', () => {
      const step: V2SwapExactIn = {
        type: 'V2_SWAP_EXACT_IN',
        recipient: SENDER_AS_RECIPIENT,
        amountIn: '1000',
        amountOutMin: '0',
        path: [USDC.address, WETH.address],
      }

      expect(() => validateEncodeSwaps(buildSpec(), [step])).to.throw('STEP_RECIPIENT_MUST_BE_ROUTER')
    })

    it('rejects wrap recipients that are not router custody', () => {
      expect(() =>
        validateEncodeSwaps(
          buildSpec(
            {},
            {
              inputToken: ETH,
              outputToken: USDC,
              amount: CurrencyAmount.fromRawAmount(ETH, '1000000000000000000'),
              quote: CurrencyAmount.fromRawAmount(USDC, '2000000000'),
            }
          ),
          [
            {
              type: 'WRAP_ETH',
              recipient: TEST_RECIPIENT,
              amount: '1000000000000000000',
            },
            buildV3ExactInStep({ amountIn: '1000000000000000000' }, [WETH, USDC]),
          ]
        )
      ).to.throw('STEP_RECIPIENT_MUST_BE_ROUTER')
    })

    it('rejects V4 TAKE recipients that are not router custody', () => {
      const step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [
          {
            action: 'TAKE',
            currency: USDC.address,
            recipient: TEST_RECIPIENT,
            amount: '1000',
          },
        ],
      }

      expect(() => validateEncodeSwaps(buildSpec(), [step])).to.throw('V4_ACTION_RECIPIENT_MUST_BE_ROUTER')
    })

    it('rejects V4 SWEEP recipients that are not router custody', () => {
      const step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [
          {
            action: 'SWEEP',
            currency: USDC.address,
            recipient: TEST_RECIPIENT,
          },
        ],
      }

      expect(() => validateEncodeSwaps(buildSpec(), [step])).to.throw('V4_ACTION_RECIPIENT_MUST_BE_ROUTER')
    })

    it('allows router-custody recipients in swap steps', () => {
      expect(() => validateEncodeSwaps(buildSpec(), [buildV3ExactInStep()])).not.to.throw()
    })

    it('rejects portion fees on non exact-input trades', () => {
      const fee: Fee = { kind: 'portion', recipient: FEE_RECIPIENT, fee: new Percent(5, 100) }
      expect(() =>
        validateEncodeSwaps(
          buildSpec(
            { tradeType: TradeType.EXACT_OUTPUT, fee },
            {
              amount: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
              quote: CurrencyAmount.fromRawAmount(USDC, '1000000'),
            }
          ),
          [buildV3ExactOutStep()]
        )
      ).to.throw('INVALID_PORTION_FEE_TRADE_TYPE')
    })

    it('rejects flat fees on non exact-output trades', () => {
      const fee: Fee = { kind: 'flat', recipient: FEE_RECIPIENT, amount: '1000' }
      expect(() => validateEncodeSwaps(buildSpec({ fee }), [buildV3ExactInStep()])).to.throw(
        'INVALID_FLAT_FEE_TRADE_TYPE'
      )
    })

    it('rejects flat fees that exceed the gross output amount', () => {
      const fee: Fee = { kind: 'flat', recipient: FEE_RECIPIENT, amount: '600000000000000000' }
      expect(() =>
        validateEncodeSwaps(
          buildSpec(
            { tradeType: TradeType.EXACT_OUTPUT, fee },
            {
              amount: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
              quote: CurrencyAmount.fromRawAmount(USDC, '1000000'),
            }
          ),
          [buildV3ExactOutStep()]
        )
      ).to.throw('FLAT_FEE_GT_AMOUNT')
    })

    it('rejects maxHopSlippage on UR 2.0 steps', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec({ urVersion: UniversalRouterVersion.V2_0 }), [
          buildV3ExactInStep({ maxHopSlippage: ['100'] }),
        ])
      ).to.throw('MAX_HOP_SLIPPAGE_UNSUPPORTED_ON_V2_0')
    })

    it('rejects maxHopSlippage on UR 2.0 v4 actions', () => {
      const v4Step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [
          {
            action: 'SWAP_EXACT_OUT_SINGLE',
            poolKey: {
              currency0: USDC.address,
              currency1: WETH.address,
              fee: 500,
              tickSpacing: 10,
              hooks: ETH_ADDRESS,
            },
            zeroForOne: true,
            amountOut: '1000',
            amountInMaximum: '2000',
            maxHopSlippage: '123',
            hookData: '0x',
          },
        ],
      }

      expect(() => validateEncodeSwaps(buildSpec({ urVersion: UniversalRouterVersion.V2_0 }), [v4Step])).to.throw(
        'MAX_HOP_SLIPPAGE_UNSUPPORTED_ON_V2_0'
      )
    })

    it('rejects fractional-bps portion fees on UR 2.0', () => {
      const fee: Fee = { kind: 'portion', recipient: FEE_RECIPIENT, fee: new Percent(1, 3) }
      expect(() =>
        validateEncodeSwaps(buildSpec({ urVersion: UniversalRouterVersion.V2_0, fee }), [buildV3ExactInStep()])
      ).to.throw('FRACTIONAL_BPS_PORTION_FEE_UNSUPPORTED_ON_V2_0')
    })

    it('rejects V2 hop-count mismatches', () => {
      const step: V2SwapExactIn = {
        type: 'V2_SWAP_EXACT_IN',
        recipient: ROUTER_AS_RECIPIENT,
        amountIn: '1000',
        amountOutMin: '0',
        path: [USDC.address, WETH.address],
        maxHopSlippage: ['10', '20'],
      }

      expect(() => validateEncodeSwaps(buildSpec({ urVersion: UniversalRouterVersion.V2_1_1 }), [step])).to.throw(
        'V2_MAX_HOP_SLIPPAGE_LENGTH_MISMATCH'
      )
    })

    it('rejects V4 path hop-count mismatches', () => {
      const step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [
          {
            action: 'SWAP_EXACT_IN',
            currencyIn: USDC.address,
            path: [
              {
                intermediateCurrency: WETH.address,
                fee: 500,
                tickSpacing: 10,
                hooks: ETH_ADDRESS,
                hookData: '0x',
              },
            ],
            amountIn: '1000',
            amountOutMinimum: '0',
            maxHopSlippage: ['10', '20'],
          },
        ],
      }

      expect(() => validateEncodeSwaps(buildSpec({ urVersion: UniversalRouterVersion.V2_1_1 }), [step])).to.throw(
        'V4_MAX_HOP_SLIPPAGE_LENGTH_MISMATCH'
      )
    })

    it('rejects V3 path-count mismatches when the path can be counted', () => {
      const step = buildV3ExactInStep({
        maxHopSlippage: ['10', '20'],
      })

      expect(() => validateEncodeSwaps(buildSpec({ urVersion: UniversalRouterVersion.V2_1_1 }), [step])).to.throw(
        'V3_MAX_HOP_SLIPPAGE_LENGTH_MISMATCH'
      )
    })
  })

  describe('encodeSwapStep', () => {
    let planner: RoutePlanner

    beforeEach(() => {
      planner = new RoutePlanner()
    })

    it('encodes V2 swap maxHopSlippage on UR 2.1.1', () => {
      const step: V2SwapExactIn = {
        type: 'V2_SWAP_EXACT_IN',
        recipient: ROUTER_AS_RECIPIENT,
        amountIn: '1000',
        amountOutMin: '0',
        path: [USDC.address, WETH.address, DAI.address],
        maxHopSlippage: ['10', '20'],
      }

      encodeSwapStep(planner, step, UniversalRouterVersion.V2_1_1)

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool', 'uint256[]'],
        planner.inputs[0]
      )
      expect(decoded[4]).to.equal(false)
      expect(decoded[5].map((value: BigNumber) => value.toString())).to.deep.equal(['10', '20'])
    })

    it('omits V3 maxHopSlippage on UR 2.0', () => {
      encodeSwapStep(planner, buildV3ExactInStep(), UniversalRouterVersion.V2_0)

      const decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], planner.inputs[0])
      expect(decoded[4]).to.equal(false)
    })

    it('encodes V3 maxHopSlippage on UR 2.1.1', () => {
      encodeSwapStep(
        planner,
        buildV3ExactInStep({ maxHopSlippage: ['500', '600'] }, [USDC, WETH, DAI], [500, 3000]),
        UniversalRouterVersion.V2_1_1
      )

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool', 'uint256[]'],
        planner.inputs[0]
      )
      expect(decoded[4]).to.equal(false)
      expect(decoded[5].map((value: BigNumber) => value.toString())).to.deep.equal(['500', '600'])
    })

    it('encodes V3 exact-output paths in reverse pool order', () => {
      encodeSwapStep(
        planner,
        buildV3ExactOutStep({}, [USDC, WETH, DAI], [500, 3000]),
        UniversalRouterVersion.V2_0
      )

      const decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], planner.inputs[0])
      expect(decoded[3]).to.equal(packV3ExactOutPath([USDC.address, WETH.address, DAI.address], [500, 3000]))
    })

    it('encodes V4 path maxHopSlippage on UR 2.1.1', () => {
      const step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [
          {
            action: 'SWAP_EXACT_IN',
            currencyIn: USDC.address,
            path: [
              {
                intermediateCurrency: WETH.address,
                fee: 500,
                tickSpacing: 10,
                hooks: ETH_ADDRESS,
                hookData: '0x',
              },
              {
                intermediateCurrency: DAI.address,
                fee: 3000,
                tickSpacing: 60,
                hooks: ETH_ADDRESS,
                hookData: '0x',
              },
            ],
            amountIn: '1000',
            amountOutMinimum: '0',
            maxHopSlippage: ['100', '200'],
          },
        ],
      }

      encodeSwapStep(planner, step, UniversalRouterVersion.V2_1_1)

      const parsed = V4BaseActionsParser.parseCalldata(planner.inputs[0], URVersion.V2_1_1)
      const action = parsed.actions[0].params[0].value as any
      expect(action.maxHopSlippage.map((value: BigNumber) => value.toString())).to.deep.equal(['100', '200'])
    })

    it('encodes V4 single maxHopSlippage on UR 2.1.1', () => {
      const step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [
          {
            action: 'SWAP_EXACT_OUT_SINGLE',
            poolKey: {
              currency0: USDC.address,
              currency1: WETH.address,
              fee: 500,
              tickSpacing: 10,
              hooks: ETH_ADDRESS,
            },
            zeroForOne: true,
            amountOut: '1000',
            amountInMaximum: '2000',
            maxHopSlippage: '123456',
            hookData: '0x',
          },
        ],
      }

      encodeSwapStep(planner, step, UniversalRouterVersion.V2_1_1)

      const parsed = V4BaseActionsParser.parseCalldata(planner.inputs[0], URVersion.V2_1_1)
      const action = parsed.actions[0].params[0].value as any
      expect(action.maxHopSlippage.toString()).to.equal('123456')
    })

    it('hardcodes V4 SETTLE payerIsUser to false', () => {
      const step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [
          {
            action: 'SETTLE',
            currency: USDC.address,
            amount: '1000',
          },
        ],
      }

      encodeSwapStep(planner, step, UniversalRouterVersion.V2_1_1)

      const parsed = V4BaseActionsParser.parseCalldata(planner.inputs[0], URVersion.V2_1_1)
      expect(parsed.actions[0].params[2].value).to.equal(false)
    })
  })

  describe('SwapRouter.encodeSwaps', () => {
    it('encodes exact-input ERC20 to ERC20 with ingress and final sweep', () => {
      const spec = buildSpec({
        slippageTolerance: new Percent(25, 1000),
      })

      const result = SwapRouter.encodeSwaps(spec, [buildV3ExactInStep()])
      const { commands, inputs } = decodeExecute(result.calldata)

      expect(result.value).to.equal('0x00')
      expect(commands).to.equal('0x020004')

      const transfer = defaultAbiCoder.decode(['address', 'address', 'uint160'], inputs[0])
      expect(transfer[0].toLowerCase()).to.equal(USDC.address.toLowerCase())
      expect(transfer[1]).to.equal(ROUTER_AS_RECIPIENT)
      expect(transfer[2].toString()).to.equal('1000000')

      const sweep = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[2])
      const expectedGrossMin = exactInputGrossMin(
        BigNumber.from(spec.routing.quote.quotient.toString()),
        spec.slippageTolerance
      )
      expect(sweep[0].toLowerCase()).to.equal(WETH.address.toLowerCase())
      expect(sweep[1].toLowerCase()).to.equal(TEST_RECIPIENT.toLowerCase())
      expect(sweep[2].toString()).to.equal(expectedGrossMin.toString())
    })

    it('encodes exact-input native to ERC20 with wrap step and tx value', () => {
      const spec = buildSpec(
        {
          slippageTolerance: new Percent(25, 1000),
        },
        {
          inputToken: ETH,
          outputToken: USDC,
          amount: CurrencyAmount.fromRawAmount(ETH, '1000000000000000000'),
          quote: CurrencyAmount.fromRawAmount(USDC, '2056807919'),
        }
      )

      const swapSteps: SwapStep[] = [
        { type: 'WRAP_ETH', recipient: ROUTER_AS_RECIPIENT, amount: '1000000000000000000' },
        buildV3ExactInStep({ amountIn: '1000000000000000000' }, [WETH, USDC]),
      ]

      const result = SwapRouter.encodeSwaps(spec, swapSteps)
      const { commands, inputs } = decodeExecute(result.calldata)

      expect(commands).to.equal('0x0b0004')
      expect(result.value).to.equal(BigNumber.from('1000000000000000000').toHexString())

      const wrap = defaultAbiCoder.decode(['address', 'uint256'], inputs[0])
      expect(wrap[0]).to.equal(ROUTER_AS_RECIPIENT)
      expect(wrap[1].toString()).to.equal('1000000000000000000')
    })

    it('encodes exact-input ERC20 to native with router-owned output normalization before settlement', () => {
      const spec = buildSpec(
        {
          slippageTolerance: new Percent(25, 1000),
        },
        {
          outputToken: ETH,
          quote: CurrencyAmount.fromRawAmount(ETH, '500000000000000000'),
        }
      )

      const swapSteps: SwapStep[] = [
        buildV3ExactInStep(),
        {
          type: 'UNWRAP_WETH',
          recipient: ROUTER_AS_RECIPIENT,
          amountMin: '0',
        },
      ]

      const result = SwapRouter.encodeSwaps(spec, swapSteps)
      const { commands, inputs } = decodeExecute(result.calldata)
      const { commandTypes } = parseCommands(result.calldata)

      expect(commands).to.equal('0x02000c04')
      expect(commandTypes).to.deep.equal([
        CommandType.PERMIT2_TRANSFER_FROM,
        CommandType.V3_SWAP_EXACT_IN,
        CommandType.UNWRAP_WETH,
        CommandType.SWEEP,
      ])

      const sweep = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[3])
      expect(sweep[0].toLowerCase()).to.equal(ETH_ADDRESS.toLowerCase())
      expect(sweep[1].toLowerCase()).to.equal(TEST_RECIPIENT.toLowerCase())
    })

    it('encodes exact-output ERC20 to ERC20 with refund sweep', () => {
      const spec = buildSpec(
        {
          tradeType: TradeType.EXACT_OUTPUT,
          slippageTolerance: new Percent(5, 100),
        },
        {
          outputToken: DAI,
          amount: CurrencyAmount.fromRawAmount(DAI, '500000000000000000'),
          quote: CurrencyAmount.fromRawAmount(USDC, '1000000'),
        }
      )

      const result = SwapRouter.encodeSwaps(spec, [
        buildV3ExactOutStep({
          amountInMax: exactOutputMaxIn(BigNumber.from('1000000'), spec.slippageTolerance).toString(),
        }, [USDC, WETH, DAI], [500, 3000]),
      ])
      const { commands, inputs } = decodeExecute(result.calldata)

      expect(commands).to.equal('0x02010404')

      const swap = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], inputs[1])
      expect(swap[3]).to.equal(packV3ExactOutPath([USDC.address, WETH.address, DAI.address], [500, 3000]))

      const transfer = defaultAbiCoder.decode(['address', 'address', 'uint160'], inputs[0])
      expect(transfer[2].toString()).to.equal(
        exactOutputMaxIn(BigNumber.from('1000000'), spec.slippageTolerance).toString()
      )

      const settlement = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[2])
      expect(settlement[0].toLowerCase()).to.equal(DAI.address.toLowerCase())
      expect(settlement[2].toString()).to.equal('500000000000000000')

      const refund = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[3])
      expect(refund[0].toLowerCase()).to.equal(USDC.address.toLowerCase())
      expect(refund[2].toString()).to.equal('0')
    })

    it('encodes exact-output wrapped-native input with router-owned normalization before refund', () => {
      const spec = buildSpec(
        {
          tradeType: TradeType.EXACT_OUTPUT,
          slippageTolerance: new Percent(5, 100),
        },
        {
          inputToken: WETH,
          outputToken: USDC,
          amount: CurrencyAmount.fromRawAmount(USDC, '2000000000'),
          quote: CurrencyAmount.fromRawAmount(WETH, '1000000000000000000'),
        }
      )

      const maxAmountIn = exactOutputMaxIn(
        BigNumber.from(spec.routing.quote.quotient.toString()),
        spec.slippageTolerance
      )

      const swapSteps: SwapStep[] = [
        {
          type: 'UNWRAP_WETH',
          recipient: ROUTER_AS_RECIPIENT,
          amountMin: '0',
        },
        {
          type: 'V4_SWAP',
          v4Actions: [
            {
              action: 'SWAP_EXACT_OUT_SINGLE',
              poolKey: {
                currency0: ETH_ADDRESS,
                currency1: USDC.address,
                fee: 500,
                tickSpacing: 10,
                hooks: ETH_ADDRESS,
              },
              zeroForOne: true,
              amountOut: '2000000000',
              amountInMaximum: maxAmountIn.toString(),
              hookData: '0x',
            },
          ],
        },
        {
          type: 'WRAP_ETH',
          recipient: ROUTER_AS_RECIPIENT,
          amount: CONTRACT_BALANCE.toString(),
        },
      ]

      const result = SwapRouter.encodeSwaps(spec, swapSteps)
      const { commands, inputs } = decodeExecute(result.calldata)
      const { commandTypes } = parseCommands(result.calldata)

      expect(commandTypes).to.deep.equal([
        CommandType.PERMIT2_TRANSFER_FROM,
        CommandType.UNWRAP_WETH,
        CommandType.V4_SWAP,
        CommandType.WRAP_ETH,
        CommandType.SWEEP,
        CommandType.SWEEP,
      ])
      expect(commandTypes[commandTypes.length - 1]).to.equal(CommandType.SWEEP)
      expect(commandTypes.filter((type) => type === CommandType.SWEEP)).to.have.length(2)

      const settlement = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[4])
      expect(settlement[0].toLowerCase()).to.equal(USDC.address.toLowerCase())

      const refund = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[5])
      expect(refund[0].toLowerCase()).to.equal(WETH.address.toLowerCase())
      expect(refund[1].toLowerCase()).to.equal(TEST_RECIPIENT.toLowerCase())
      expect(refund[2].toString()).to.equal('0')
    })

    it('encodes exact-output native input with router-owned wrapped-native refund normalization', () => {
      const spec = buildSpec(
        {
          tradeType: TradeType.EXACT_OUTPUT,
          slippageTolerance: new Percent(5, 100),
        },
        {
          inputToken: ETH,
          outputToken: USDC,
          amount: CurrencyAmount.fromRawAmount(USDC, '2000000000'),
          quote: CurrencyAmount.fromRawAmount(ETH, '1000000000000000000'),
        }
      )

      const maxAmountIn = exactOutputMaxIn(
        BigNumber.from(spec.routing.quote.quotient.toString()),
        spec.slippageTolerance
      )
      const swapSteps: SwapStep[] = [
        { type: 'WRAP_ETH', recipient: ROUTER_AS_RECIPIENT, amount: maxAmountIn.toString() },
        buildV3ExactOutStep({ amountOut: '2000000000', amountInMax: maxAmountIn.toString() }, [WETH, USDC]),
      ]

      const result = SwapRouter.encodeSwaps(spec, swapSteps)
      const { commands, inputs } = decodeExecute(result.calldata)
      const { commandTypes } = parseCommands(result.calldata)

      expect(commands).to.equal('0x0b01040c')
      expect(result.value).to.equal(maxAmountIn.toHexString())
      expect(commandTypes[commandTypes.length - 1]).to.equal(CommandType.UNWRAP_WETH)
      expect(commandTypes.filter((type) => type === CommandType.SWEEP)).to.have.length(1)

      const settlement = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[2])
      expect(settlement[0].toLowerCase()).to.equal(USDC.address.toLowerCase())
    })

    it('uses PAY_PORTION on UR 2.0 exact-input fees', () => {
      const slippageTolerance = new Percent(25, 1000)
      const feePercent = new Percent(20, 10_000)
      const fee: Fee = { kind: 'portion', recipient: FEE_RECIPIENT, fee: feePercent }
      const spec = buildSpec({
        slippageTolerance,
        fee,
        urVersion: UniversalRouterVersion.V2_0,
      })

      const result = SwapRouter.encodeSwaps(spec, [buildV3ExactInStep()])
      const { commands, inputs } = decodeExecute(result.calldata)

      expect(commands).to.equal('0x02000604')

      const feeInput = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[2])
      expect(feeInput[0].toLowerCase()).to.equal(WETH.address.toLowerCase())
      expect(feeInput[1].toLowerCase()).to.equal(FEE_RECIPIENT.toLowerCase())
      expect(feeInput[2].toString()).to.equal('20')

      const grossMin = exactInputGrossMin(BigNumber.from(spec.routing.quote.quotient.toString()), slippageTolerance)
      const expectedNet = grossMin.sub(portionAmount(grossMin, feePercent))
      const settlement = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[3])
      expect(settlement[2].toString()).to.equal(expectedNet.toString())
    })

    it('rejects fractional exact-input portion fees on UR 2.0', () => {
      const fee: Fee = { kind: 'portion', recipient: FEE_RECIPIENT, fee: new Percent(1, 3) }
      expect(() =>
        SwapRouter.encodeSwaps(buildSpec({ fee, urVersion: UniversalRouterVersion.V2_0 }), [buildV3ExactInStep()])
      ).to.throw('FRACTIONAL_BPS_PORTION_FEE_UNSUPPORTED_ON_V2_0')
    })

    it('uses PAY_PORTION_FULL_PRECISION on UR 2.1.1 exact-input fees', () => {
      const feePercent = new Percent(20, 10_000)
      const fee: Fee = { kind: 'portion', recipient: FEE_RECIPIENT, fee: feePercent }
      const spec = buildSpec({
        fee,
        urVersion: UniversalRouterVersion.V2_1_1,
      })

      const result = SwapRouter.encodeSwaps(spec, [buildV3ExactInStep({ maxHopSlippage: ['10'] })])
      const { commands, inputs } = decodeExecute(result.calldata)

      expect(commands).to.equal('0x02000704')

      const feeInput = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[2])
      expect(feeInput[0].toLowerCase()).to.equal(WETH.address.toLowerCase())
      expect(feeInput[1].toLowerCase()).to.equal(FEE_RECIPIENT.toLowerCase())
      expect(feeInput[2].toString()).to.equal('2000000000000000')
    })

    it('quantizes UR 2.1.1 fractional exact-input portion fees to command precision', () => {
      const feePercent = new Percent(1, 3)
      const fee: Fee = { kind: 'portion', recipient: FEE_RECIPIENT, fee: feePercent }
      const spec = buildSpec(
        {
          fee,
          urVersion: UniversalRouterVersion.V2_1_1,
          slippageTolerance: new Percent(0, 1),
        },
        {
          quote: CurrencyAmount.fromRawAmount(WETH, '3'),
        }
      )

      const result = SwapRouter.encodeSwaps(spec, [buildV3ExactInStep()])
      const { commands, inputs } = decodeExecute(result.calldata)
      const fee1e18 = BigNumber.from(encodeFee1e18(feePercent))
      const expectedSettlement = BigNumber.from(3).sub(BigNumber.from(3).mul(fee1e18).div(BigNumber.from(10).pow(18)))

      expect(commands).to.equal('0x02000704')

      const feeInput = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[2])
      expect(feeInput[2].toString()).to.equal(fee1e18.toString())

      const settlement = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[3])
      expect(settlement[2].toString()).to.equal(expectedSettlement.toString())
      expect(settlement[2].toString()).not.to.equal('2')
    })

    it('uses flat exact-output fees against the gross routed output and settles the net amount', () => {
      const fee: Fee = { kind: 'flat', recipient: FEE_RECIPIENT, amount: '100000000000000000' }
      const spec = buildSpec(
        {
          tradeType: TradeType.EXACT_OUTPUT,
          fee,
          slippageTolerance: new Percent(5, 100),
        },
        {
          amount: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
          quote: CurrencyAmount.fromRawAmount(USDC, '1000000'),
        }
      )

      const result = SwapRouter.encodeSwaps(spec, [
        buildV3ExactOutStep({
          amountInMax: exactOutputMaxIn(BigNumber.from('1000000'), spec.slippageTolerance).toString(),
        }),
      ])
      const { commands, inputs } = decodeExecute(result.calldata)

      expect(commands).to.equal('0x0201050404')

      const feeTransfer = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[2])
      expect(feeTransfer[0].toLowerCase()).to.equal(WETH.address.toLowerCase())
      expect(feeTransfer[1].toLowerCase()).to.equal(FEE_RECIPIENT.toLowerCase())
      expect(feeTransfer[2].toString()).to.equal('100000000000000000')

      const settlement = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[3])
      expect(settlement[2].toString()).to.equal('400000000000000000')
    })

    it('takes native output fees from ETH when the router outputs ETH', () => {
      const feePercent = new Percent(20, 10_000)
      const fee: Fee = { kind: 'portion', recipient: FEE_RECIPIENT, fee: feePercent }
      const spec = buildSpec(
        {
          fee,
          urVersion: UniversalRouterVersion.V2_0,
          slippageTolerance: new Percent(25, 1000),
        },
        {
          outputToken: ETH,
          quote: CurrencyAmount.fromRawAmount(ETH, '500000000000000000'),
        }
      )

      const swapSteps: SwapStep[] = [
        buildV3ExactInStep(),
        {
          type: 'UNWRAP_WETH',
          recipient: ROUTER_AS_RECIPIENT,
          amountMin: '0',
        },
      ]

      const result = SwapRouter.encodeSwaps(spec, swapSteps)
      const { inputs } = decodeExecute(result.calldata)

      const feeInput = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[3])
      const settlement = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[4])

      expect(feeInput[0].toLowerCase()).to.equal(ETH_ADDRESS.toLowerCase())
      expect(settlement[0].toLowerCase()).to.equal(ETH_ADDRESS.toLowerCase())
    })

    it('wraps proxy execution without Permit2 ingress and uses the proxy deadline', () => {
      const deadline = 1700000000
      const spec = buildSpec({
        tokenTransferMode: TokenTransferMode.ApproveProxy,
        chainId: 1,
        deadline,
        urVersion: UniversalRouterVersion.V2_0,
      })

      const result = SwapRouter.encodeSwaps(spec, [buildV3ExactInStep()])
      const decoded = PROXY_INTERFACE.decodeFunctionData('execute', result.calldata)

      expect(result.value).to.equal('0x00')
      expect(decoded.router.toLowerCase()).to.equal(
        UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_0, 1).toLowerCase()
      )
      expect(decoded.token.toLowerCase()).to.equal(USDC.address.toLowerCase())
      expect(decoded.amount.toString()).to.equal('1000000')
      expect(decoded.deadline.toString()).to.equal(deadline.toString())
      expect(decoded.commands).to.equal('0x0004')
    })

    it('uses a sweep refund on exact-output proxy flows', () => {
      const spec = buildSpec(
        {
          tradeType: TradeType.EXACT_OUTPUT,
          tokenTransferMode: TokenTransferMode.ApproveProxy,
          chainId: 1,
          slippageTolerance: new Percent(5, 100),
        },
        {
          amount: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
          quote: CurrencyAmount.fromRawAmount(USDC, '1000000'),
        }
      )

      const result = SwapRouter.encodeSwaps(spec, [
        buildV3ExactOutStep({
          amountInMax: exactOutputMaxIn(BigNumber.from('1000000'), spec.slippageTolerance).toString(),
        }),
      ])
      const decoded = PROXY_INTERFACE.decodeFunctionData('execute', result.calldata)
      expect(decoded.commands).to.equal('0x010404')
    })

    it('rejects non-router step recipients before calldata encoding', () => {
      expect(() =>
        SwapRouter.encodeSwaps(buildSpec(), [
          buildV3ExactInStep({
            recipient: TEST_RECIPIENT,
          }),
        ])
      ).to.throw('STEP_RECIPIENT_MUST_BE_ROUTER')
    })
  })

  describe('behavioral parity with swapCallParameters', () => {
    const pool = makeV3Pool(USDC, WETH)
    const slippageTolerance = new Percent(25, 1000)

    it('matches exact-input safety bounds for a simple V3 route', () => {
      const route = new V3RouteSDK([pool], USDC, WETH)
      const trade = new RouterTrade({
        v2Routes: [],
        v3Routes: [
          {
            routev3: route,
            inputAmount: CurrencyAmount.fromRawAmount(USDC, '1000000'),
            outputAmount: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
          },
        ],
        v4Routes: [],
        mixedRoutes: [],
        tradeType: TradeType.EXACT_INPUT,
      })

      const legacy = decodeExecute(
        SwapRouter.swapCallParameters(trade, swapOptions({ slippageTolerance, recipient: TEST_RECIPIENT })).calldata
      )
      const next = decodeExecute(
        SwapRouter.encodeSwaps(
          buildSpec(
            { slippageTolerance },
            {
              amount: CurrencyAmount.fromRawAmount(USDC, '1000000'),
              quote: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
            }
          ),
          [buildV3ExactInStep({ amountIn: '1000000' })]
        ).calldata
      )

      const legacySwap = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], legacy.inputs[0])
      const nextIngress = defaultAbiCoder.decode(['address', 'address', 'uint160'], next.inputs[0])
      const nextSettlement = defaultAbiCoder.decode(['address', 'address', 'uint256'], next.inputs[2])

      expect(nextIngress[2].toString()).to.equal(legacySwap[1].toString())
      expect(nextSettlement[2].toString()).to.equal(legacySwap[2].toString())
    })

    it('matches exact-output safety bounds for a simple V3 route', () => {
      const route = new V3RouteSDK([pool], USDC, WETH)
      const trade = new RouterTrade({
        v2Routes: [],
        v3Routes: [
          {
            routev3: route,
            inputAmount: CurrencyAmount.fromRawAmount(USDC, '1050000'),
            outputAmount: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
          },
        ],
        v4Routes: [],
        mixedRoutes: [],
        tradeType: TradeType.EXACT_OUTPUT,
      })

      const legacy = decodeExecute(
        SwapRouter.swapCallParameters(trade, swapOptions({ slippageTolerance, recipient: TEST_RECIPIENT })).calldata
      )
      const next = decodeExecute(
        SwapRouter.encodeSwaps(
          buildSpec(
            { tradeType: TradeType.EXACT_OUTPUT, slippageTolerance },
            {
              amount: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
              quote: CurrencyAmount.fromRawAmount(USDC, '1050000'),
            }
          ),
          [
            buildV3ExactOutStep({
              amountOut: '500000000000000000',
              amountInMax: exactOutputMaxIn(BigNumber.from('1050000'), slippageTolerance).toString(),
            }),
          ]
        ).calldata
      )

      const legacySwap = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], legacy.inputs[0])
      const nextIngress = defaultAbiCoder.decode(['address', 'address', 'uint160'], next.inputs[0])
      const nextSettlement = defaultAbiCoder.decode(['address', 'address', 'uint256'], next.inputs[2])

      expect(nextIngress[2].toString()).to.equal(legacySwap[2].toString())
      expect(nextSettlement[2].toString()).to.equal(legacySwap[1].toString())
    })
  })
})
