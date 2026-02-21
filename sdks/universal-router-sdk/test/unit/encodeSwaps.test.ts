import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { Actions, URVersion } from '@uniswap/v4-sdk'
import { CurrencyAmount, Ether, Token, TradeType, Percent } from '@uniswap/sdk-core'
import { v4ActionToParams } from '../../src/utils/encodeV4Action'
import { RoutePlanner } from '../../src/utils/routerCommands'
import { encodeSwapStep } from '../../src/utils/encodeSwapStep'
import { SwapRouter } from '../../src/swapRouter'
import { SwapIntent } from '../../src/types/encodeSwaps'
import {
  V4Settle,
  V4Take,
  V4SwapExactIn,
  V2SwapExactIn,
  V3SwapExactIn,
  V4Swap,
  WrapEth,
} from '../../src/types/encodeSwaps'
import { ROUTER_AS_RECIPIENT } from '../../src/utils/constants'

describe('encodeV4Action', () => {
  describe('v4ActionToParams', () => {
    it('maps SETTLE action to correct params', () => {
      const action: V4Settle = {
        action: 'SETTLE',
        currency: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        amount: '1000000',
        payerIsUser: false,
      }
      const result = v4ActionToParams(action)
      expect(result.action).to.equal(Actions.SETTLE)
      expect(result.params).to.deep.equal([
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        '1000000',
        false,
      ])
    })

    it('maps TAKE action to correct params', () => {
      const action: V4Take = {
        action: 'TAKE',
        currency: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        recipient: '0x0000000000000000000000000000000000000002',
        amount: 0,
      }
      const result = v4ActionToParams(action)
      expect(result.action).to.equal(Actions.TAKE)
      expect(result.params).to.deep.equal([
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        '0x0000000000000000000000000000000000000002',
        0,
      ])
    })

    it('maps SWAP_EXACT_IN action to struct param (V2.0)', () => {
      const action: V4SwapExactIn = {
        action: 'SWAP_EXACT_IN',
        currencyIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        path: [
          {
            intermediateCurrency: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            fee: 3000,
            tickSpacing: 60,
            hooks: '0x0000000000000000000000000000000000000000',
            hookData: '0x',
          },
        ],
        amountIn: 0,
        amountOutMinimum: 0,
      }
      const result = v4ActionToParams(action)
      expect(result.action).to.equal(Actions.SWAP_EXACT_IN)
      expect(result.params).to.have.length(1)
      expect(result.params[0].currencyIn).to.equal('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
      expect(result.params[0].path).to.have.length(1)
      expect(result.params[0].amountIn).to.equal(0)
      expect(result.params[0].amountOutMinimum).to.equal(0)
      // V2.0: no maxHopSlippage field
      expect(result.params[0].maxHopSlippage).to.be.undefined
    })

    it('maps SWAP_EXACT_IN action with maxHopSlippage (V2.1)', () => {
      const action: V4SwapExactIn = {
        action: 'SWAP_EXACT_IN',
        currencyIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        path: [
          {
            intermediateCurrency: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            fee: 3000,
            tickSpacing: 60,
            hooks: '0x0000000000000000000000000000000000000000',
            hookData: '0x',
          },
        ],
        amountIn: 0,
        amountOutMinimum: 0,
        maxHopSlippage: [BigNumber.from('1000000000000000000')],
      }
      const result = v4ActionToParams(action, URVersion.V2_1)
      expect(result.params[0].maxHopSlippage).to.deep.equal([BigNumber.from('1000000000000000000')])
    })
  })
})

describe('encodeSwapStep', () => {
  let planner: RoutePlanner

  beforeEach(() => {
    planner = new RoutePlanner()
  })

  it('encodes V2_SWAP_EXACT_IN', () => {
    const step: V2SwapExactIn = {
      type: 'V2_SWAP_EXACT_IN',
      recipient: ROUTER_AS_RECIPIENT,
      amountIn: '1000000',
      amountOutMin: '0',
      path: [
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      ],
      payerIsUser: false,
    }
    encodeSwapStep(planner, step)
    expect(planner.commands).to.equal('0x08')
    expect(planner.inputs).to.have.length(1)
  })

  it('encodes V3_SWAP_EXACT_IN', () => {
    const step: V3SwapExactIn = {
      type: 'V3_SWAP_EXACT_IN',
      recipient: ROUTER_AS_RECIPIENT,
      amountIn: '1000000',
      amountOutMin: '0',
      path: '0xabcdef',
      payerIsUser: false,
    }
    encodeSwapStep(planner, step)
    expect(planner.commands).to.equal('0x00')
    expect(planner.inputs).to.have.length(1)
  })

  it('encodes V4_SWAP with actions', () => {
    const step: V4Swap = {
      type: 'V4_SWAP',
      v4Actions: [
        {
          action: 'SETTLE' as const,
          currency: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          amount: '1000000',
          payerIsUser: false,
        },
        {
          action: 'SWAP_EXACT_IN' as const,
          currencyIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          path: [
            {
              intermediateCurrency: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
              fee: 3000,
              tickSpacing: 60,
              hooks: '0x0000000000000000000000000000000000000000',
              hookData: '0x',
            },
          ],
          amountIn: 0,
          amountOutMinimum: 0,
        },
        {
          action: 'TAKE' as const,
          currency: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          recipient: '0x0000000000000000000000000000000000000002',
          amount: 0,
        },
      ],
    }
    encodeSwapStep(planner, step)
    expect(planner.commands).to.equal('0x10')
    expect(planner.inputs).to.have.length(1)
  })

  it('encodes WRAP_ETH', () => {
    const step: WrapEth = {
      type: 'WRAP_ETH',
      recipient: ROUTER_AS_RECIPIENT,
      amount: '1000000000000000000',
    }
    encodeSwapStep(planner, step)
    expect(planner.commands).to.equal('0x0b')
    expect(planner.inputs).to.have.length(1)
  })

  it('encodes multiple steps in sequence', () => {
    const step1: WrapEth = {
      type: 'WRAP_ETH',
      recipient: ROUTER_AS_RECIPIENT,
      amount: '1000000000000000000',
    }
    const step2: V3SwapExactIn = {
      type: 'V3_SWAP_EXACT_IN',
      recipient: ROUTER_AS_RECIPIENT,
      amountIn: '1000000',
      amountOutMin: '0',
      path: '0xabcdef',
      payerIsUser: false,
    }
    encodeSwapStep(planner, step1)
    encodeSwapStep(planner, step2)
    expect(planner.commands).to.equal('0x0b00')
    expect(planner.inputs).to.have.length(2)
  })
})

describe('SwapRouter.encodeSwaps', () => {
  const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC')
  const WETH = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WETH')
  const ETH = Ether.onChain(1)
  const ROUTER = '0x0000000000000000000000000000000000000002'

  describe('EXACT_INPUT: ERC20 -> ERC20', () => {
    it('wraps swap steps with permit2 transfer and sweep', () => {
      const intent: SwapIntent = {
        tradeType: TradeType.EXACT_INPUT,
        inputToken: USDC,
        outputToken: WETH,
        inputAmount: CurrencyAmount.fromRawAmount(USDC, '1000000'),
        outputAmount: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
        slippageTolerance: new Percent(50, 10_000), // 0.5%
      }

      const swapSteps = [
        {
          type: 'V3_SWAP_EXACT_IN' as const,
          recipient: ROUTER,
          amountIn: '1000000',
          amountOutMin: '0',
          path: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB480001f4C02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          payerIsUser: false,
        },
      ]

      const result = SwapRouter.encodeSwaps(intent, swapSteps)
      expect(result.calldata).to.be.a('string')
      expect(result.value).to.equal('0x00')

      // Decode and verify command sequence
      const decoded = SwapRouter.INTERFACE.decodeFunctionData('execute(bytes,bytes[])', result.calldata)
      const commands = decoded.commands as string
      // PERMIT2_TRANSFER_FROM (0x02) + V3_SWAP_EXACT_IN (0x00) + SWEEP (0x04)
      expect(commands).to.equal('0x020004')
      expect(decoded.inputs).to.have.length(3)
    })
  })

  describe('EXACT_INPUT: Native ETH -> ERC20', () => {
    it('wraps with WRAP_ETH and SWEEP', () => {
      const intent: SwapIntent = {
        tradeType: TradeType.EXACT_INPUT,
        inputToken: ETH,
        outputToken: USDC,
        inputAmount: CurrencyAmount.fromRawAmount(ETH, '1000000000000000000'),
        outputAmount: CurrencyAmount.fromRawAmount(USDC, '2000000000'),
        slippageTolerance: new Percent(50, 10_000),
      }

      const swapSteps = [
        {
          type: 'V3_SWAP_EXACT_IN' as const,
          recipient: ROUTER,
          amountIn: '1000000000000000000',
          amountOutMin: '0',
          path: '0xabcdef',
          payerIsUser: false,
        },
      ]

      const result = SwapRouter.encodeSwaps(intent, swapSteps)
      expect(BigNumber.from(result.value).gt(0)).to.be.true

      const decoded = SwapRouter.INTERFACE.decodeFunctionData('execute(bytes,bytes[])', result.calldata)
      const commands = decoded.commands as string
      // WRAP_ETH (0x0b) + V3_SWAP_EXACT_IN (0x00) + SWEEP (0x04)
      expect(commands).to.equal('0x0b0004')
    })
  })

  describe('EXACT_INPUT: ERC20 -> Native ETH', () => {
    it('uses UNWRAP_WETH for output', () => {
      const intent: SwapIntent = {
        tradeType: TradeType.EXACT_INPUT,
        inputToken: USDC,
        outputToken: ETH,
        inputAmount: CurrencyAmount.fromRawAmount(USDC, '2000000000'),
        outputAmount: CurrencyAmount.fromRawAmount(ETH, '1000000000000000000'),
        slippageTolerance: new Percent(50, 10_000),
      }

      const swapSteps = [
        {
          type: 'V3_SWAP_EXACT_IN' as const,
          recipient: ROUTER,
          amountIn: '2000000000',
          amountOutMin: '0',
          path: '0xabcdef',
          payerIsUser: false,
        },
      ]

      const result = SwapRouter.encodeSwaps(intent, swapSteps)

      const decoded = SwapRouter.INTERFACE.decodeFunctionData('execute(bytes,bytes[])', result.calldata)
      const commands = decoded.commands as string
      // PERMIT2_TRANSFER_FROM (0x02) + V3_SWAP_EXACT_IN (0x00) + UNWRAP_WETH (0x0c)
      expect(commands).to.equal('0x02000c')
    })
  })

  describe('EXACT_OUTPUT: ERC20 -> ERC20', () => {
    it('adds refund sweep for excess input', () => {
      const intent: SwapIntent = {
        tradeType: TradeType.EXACT_OUTPUT,
        inputToken: USDC,
        outputToken: WETH,
        inputAmount: CurrencyAmount.fromRawAmount(USDC, '1000000'),
        outputAmount: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
        slippageTolerance: new Percent(50, 10_000),
      }

      const swapSteps = [
        {
          type: 'V3_SWAP_EXACT_OUT' as const,
          recipient: ROUTER,
          amountOut: '500000000000000000',
          amountInMax: '1005000',
          path: '0xabcdef',
          payerIsUser: false,
        },
      ]

      const result = SwapRouter.encodeSwaps(intent, swapSteps)

      const decoded = SwapRouter.INTERFACE.decodeFunctionData('execute(bytes,bytes[])', result.calldata)
      const commands = decoded.commands as string
      // PERMIT2_TRANSFER_FROM (0x02) + V3_SWAP_EXACT_OUT (0x01) + SWEEP output (0x04) + SWEEP refund (0x04)
      expect(commands).to.equal('0x02010404')
    })
  })

  describe('EXACT_OUTPUT: Native ETH -> ERC20', () => {
    it('refunds excess ETH via UNWRAP_WETH', () => {
      const intent: SwapIntent = {
        tradeType: TradeType.EXACT_OUTPUT,
        inputToken: ETH,
        outputToken: USDC,
        inputAmount: CurrencyAmount.fromRawAmount(ETH, '1000000000000000000'),
        outputAmount: CurrencyAmount.fromRawAmount(USDC, '2000000000'),
        slippageTolerance: new Percent(50, 10_000),
      }

      const swapSteps = [
        {
          type: 'V3_SWAP_EXACT_OUT' as const,
          recipient: ROUTER,
          amountOut: '2000000000',
          amountInMax: '1005000000000000000',
          path: '0xabcdef',
          payerIsUser: false,
        },
      ]

      const result = SwapRouter.encodeSwaps(intent, swapSteps)

      const decoded = SwapRouter.INTERFACE.decodeFunctionData('execute(bytes,bytes[])', result.calldata)
      const commands = decoded.commands as string
      // WRAP_ETH (0x0b) + V3_SWAP_EXACT_OUT (0x01) + SWEEP output (0x04) + UNWRAP_WETH refund (0x0c)
      expect(commands).to.equal('0x0b01040c')
    })
  })

  describe('with Permit2 permit', () => {
    it('prepends PERMIT2_PERMIT command', () => {
      const mockPermit = {
        details: {
          token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          amount: '1000000',
          expiration: '1000000000',
          nonce: 0,
        },
        spender: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
        sigDeadline: '1000000000',
        signature: '0x' + '00'.repeat(65),
      }

      const intent: SwapIntent = {
        tradeType: TradeType.EXACT_INPUT,
        inputToken: USDC,
        outputToken: WETH,
        inputAmount: CurrencyAmount.fromRawAmount(USDC, '1000000'),
        outputAmount: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
        slippageTolerance: new Percent(50, 10_000),
        permit: mockPermit,
      }

      const swapSteps = [
        {
          type: 'V3_SWAP_EXACT_IN' as const,
          recipient: ROUTER,
          amountIn: '1000000',
          amountOutMin: '0',
          path: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB480001f4C02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          payerIsUser: false,
        },
      ]

      const result = SwapRouter.encodeSwaps(intent, swapSteps)

      const decoded = SwapRouter.INTERFACE.decodeFunctionData('execute(bytes,bytes[])', result.calldata)
      const commands = decoded.commands as string
      // PERMIT2_PERMIT (0x0a) + PERMIT2_TRANSFER_FROM (0x02) + V3_SWAP_EXACT_IN (0x00) + SWEEP (0x04)
      expect(commands).to.equal('0x0a020004')
      expect(decoded.inputs).to.have.length(4)
    })
  })

  describe('with deadline', () => {
    it('encodes execute with deadline', () => {
      const intent: SwapIntent = {
        tradeType: TradeType.EXACT_INPUT,
        inputToken: USDC,
        outputToken: WETH,
        inputAmount: CurrencyAmount.fromRawAmount(USDC, '1000000'),
        outputAmount: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
        slippageTolerance: new Percent(50, 10_000),
        deadline: 1700000000,
      }

      const swapSteps = [
        {
          type: 'V3_SWAP_EXACT_IN' as const,
          recipient: ROUTER,
          amountIn: '1000000',
          amountOutMin: '0',
          path: '0xabcdef',
          payerIsUser: false,
        },
      ]

      const result = SwapRouter.encodeSwaps(intent, swapSteps)
      // Should decode with deadline variant
      const decoded = SwapRouter.INTERFACE.decodeFunctionData('execute(bytes,bytes[],uint256)', result.calldata)
      expect(decoded.deadline).to.not.be.undefined
    })
  })
})
