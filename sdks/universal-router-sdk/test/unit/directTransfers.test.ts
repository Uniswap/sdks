import { expect } from 'chai'
import { BigNumber, utils } from 'ethers'
import { defaultAbiCoder } from 'ethers/lib/utils'
import { CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core'
import { URVersion, V4BaseActionsParser } from '@uniswap/v4-sdk'
import { SwapRouter } from '../../src/swapRouter'
import { TokenTransferMode } from '../../src/entities/actions/uniswap'
import {
  NormalizedSwapSpecification,
  SwapSpecification,
  SwapStep,
  V2SwapExactIn,
  V2SwapExactOut,
  V3SwapExactIn,
  V3SwapExactOut,
  V4Settle,
  V4Swap,
} from '../../src/types/encodeSwaps'
import {
  stepUserPaidPulls,
  sumDirectOutputMin,
  sumUserPaidMax,
  v3PathFirstToken,
  v3PathLastToken,
} from '../../src/utils/directTransfers'
import { encodeSwapStep } from '../../src/utils/encodeSwapStep'
import { encodeV4Action } from '../../src/utils/encodeV4Action'
import { validateEncodeSwaps } from '../../src/utils/validateEncodeSwaps'
import { normalizeEncodeSwapsSpec } from '../../src/utils/normalizeEncodeSwapsSpec'
import { CommandType, RoutePlanner } from '../../src/utils/routerCommands'
import {
  CONTRACT_BALANCE,
  ETH_ADDRESS,
  ROUTER_AS_RECIPIENT,
  SENDER_AS_RECIPIENT,
  UniversalRouterVersion,
} from '../../src/utils/constants'
import { TEST_FEE_RECIPIENT_ADDRESS, TEST_RECIPIENT_ADDRESS } from '../utils/addresses'
import { DAI, ETHER as ETH, USDC, WETH, parseCommands } from '../utils/uniswapData'
import routingSamples from './fixtures/routingSwapSteps.json'

const TEST_RECIPIENT = TEST_RECIPIENT_ADDRESS
const FEE_RECIPIENT = TEST_FEE_RECIPIENT_ADDRESS

const TEST_PERMIT = {
  details: { token: USDC.address, amount: '999999', expiration: '2000000000', nonce: 0 },
  spender: '0x0000000000000000000000000000000000000001',
  sigDeadline: '2000000000',
  signature: '0x' + '00'.repeat(65),
}

function packV3Path(tokens: string[], fees: number[]): string {
  const types: string[] = ['address']
  const values: Array<string | number> = [tokens[0]]
  for (let i = 0; i < fees.length; i++) {
    types.push('uint24', 'address')
    values.push(fees[i], tokens[i + 1])
  }
  return utils.solidityPack(types, values)
}

// exact-out paths are encoded output-first
function packV3ExactOutPath(tokens: string[], fees: number[]): string {
  const types: string[] = ['address']
  const values: Array<string | number> = [tokens[tokens.length - 1]]
  for (let i = fees.length - 1; i >= 0; i--) {
    types.push('uint24', 'address')
    values.push(fees[i], tokens[i])
  }
  return utils.solidityPack(types, values)
}

function buildSpec(
  overrides: Partial<SwapSpecification> = {},
  routingOverrides: Partial<SwapSpecification['routing']> = {}
): NormalizedSwapSpecification {
  const base: NormalizedSwapSpecification = {
    tradeType: TradeType.EXACT_INPUT,
    routing: {
      inputToken: USDC,
      outputToken: WETH,
      amount: CurrencyAmount.fromRawAmount(USDC, '1000000'),
      quote: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
    },
    recipient: TEST_RECIPIENT,
    slippageTolerance: new Percent(5, 100),
    tokenTransferMode: TokenTransferMode.Permit2,
    urVersion: UniversalRouterVersion.V2_0,
    safeMode: false,
    allowDirectTransfers: false,
  }
  return {
    ...base,
    ...overrides,
    recipient: overrides.recipient ?? base.recipient,
    tokenTransferMode: overrides.tokenTransferMode ?? base.tokenTransferMode,
    urVersion: overrides.urVersion ?? base.urVersion,
    safeMode: overrides.safeMode ?? base.safeMode,
    allowDirectTransfers: overrides.allowDirectTransfers ?? base.allowDirectTransfers,
    routing: { ...base.routing, ...routingOverrides },
  }
}

// exact-output mirror of buildSpec: 0.5 WETH out exact, 1 USDC quote, 5% slippage -> maxIn 1_050_000
function buildExactOutSpec(overrides: Partial<SwapSpecification> = {}): NormalizedSwapSpecification {
  return buildSpec(
    { tradeType: TradeType.EXACT_OUTPUT, ...overrides },
    {
      amount: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
      quote: CurrencyAmount.fromRawAmount(USDC, '1000000'),
    }
  )
}

function buildV3ExactInStep(overrides: Partial<V3SwapExactIn> = {}): V3SwapExactIn {
  return {
    type: 'V3_SWAP_EXACT_IN',
    recipient: ROUTER_AS_RECIPIENT,
    amountIn: '1000000',
    amountOutMin: '0',
    path: packV3Path([USDC.address, WETH.address], [500]),
    ...overrides,
  }
}

function buildV3ExactOutStep(overrides: Partial<V3SwapExactOut> = {}): V3SwapExactOut {
  return {
    type: 'V3_SWAP_EXACT_OUT',
    recipient: ROUTER_AS_RECIPIENT,
    amountOut: '500000000000000000',
    amountInMax: '1050000',
    path: packV3ExactOutPath([USDC.address, WETH.address], [500]),
    ...overrides,
  }
}

function buildV2ExactInStep(overrides: Partial<V2SwapExactIn> = {}): V2SwapExactIn {
  return {
    type: 'V2_SWAP_EXACT_IN',
    recipient: ROUTER_AS_RECIPIENT,
    amountIn: '1000000',
    amountOutMin: '0',
    path: [USDC.address, WETH.address],
    ...overrides,
  }
}

function buildV2ExactOutStep(overrides: Partial<V2SwapExactOut> = {}): V2SwapExactOut {
  return {
    type: 'V2_SWAP_EXACT_OUT',
    recipient: ROUTER_AS_RECIPIENT,
    amountOut: '500000000000000000',
    amountInMax: '1050000',
    path: [USDC.address, WETH.address],
    ...overrides,
  }
}

function buildV4SettleSwap(settleOverrides: Partial<V4Settle> = {}): V4Swap {
  return {
    type: 'V4_SWAP',
    v4Actions: [
      {
        action: 'SWAP_EXACT_IN_SINGLE',
        poolKey: {
          currency0: USDC.address,
          currency1: WETH.address,
          fee: 500,
          tickSpacing: 10,
          hooks: ETH_ADDRESS,
        },
        zeroForOne: true,
        amountIn: '1000000',
        amountOutMinimum: '0',
        hookData: '0x',
      },
      { action: 'SETTLE', currency: USDC.address, amount: '1000000', ...settleOverrides },
      { action: 'TAKE', currency: WETH.address, recipient: ROUTER_AS_RECIPIENT, amount: '0' },
    ],
  }
}

describe('allowDirectTransfers', () => {
  describe('normalizeEncodeSwapsSpec', () => {
    it('defaults allowDirectTransfers to false', () => {
      const spec: SwapSpecification = {
        tradeType: TradeType.EXACT_INPUT,
        routing: {
          inputToken: USDC,
          outputToken: WETH,
          amount: CurrencyAmount.fromRawAmount(USDC, '1000000'),
          quote: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
        },
        slippageTolerance: new Percent(5, 100),
      }
      expect(normalizeEncodeSwapsSpec(spec).allowDirectTransfers).to.equal(false)
    })

    it('preserves allowDirectTransfers when set', () => {
      const spec: SwapSpecification = {
        tradeType: TradeType.EXACT_INPUT,
        routing: {
          inputToken: USDC,
          outputToken: WETH,
          amount: CurrencyAmount.fromRawAmount(USDC, '1000000'),
          quote: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
        },
        slippageTolerance: new Percent(5, 100),
        allowDirectTransfers: true,
      }
      expect(normalizeEncodeSwapsSpec(spec).allowDirectTransfers).to.equal(true)
    })
  })

  describe('encodeSwapStep payerIsUser threading', () => {
    let planner: RoutePlanner

    beforeEach(() => {
      planner = new RoutePlanner()
    })

    it('encodes V3 exact-in payerIsUser=true', () => {
      encodeSwapStep(planner, buildV3ExactInStep({ payerIsUser: true }), UniversalRouterVersion.V2_0)
      const decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], planner.inputs[0])
      expect(decoded[4]).to.equal(true)
    })

    it('defaults V3 exact-in payerIsUser to false', () => {
      encodeSwapStep(planner, buildV3ExactInStep(), UniversalRouterVersion.V2_0)
      const decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], planner.inputs[0])
      expect(decoded[4]).to.equal(false)
    })

    it('encodes V3 exact-out payerIsUser=true', () => {
      encodeSwapStep(planner, buildV3ExactOutStep({ payerIsUser: true }), UniversalRouterVersion.V2_0)
      const decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], planner.inputs[0])
      expect(decoded[4]).to.equal(true)
    })

    it('encodes V2 exact-in payerIsUser=true', () => {
      encodeSwapStep(planner, buildV2ExactInStep({ payerIsUser: true }), UniversalRouterVersion.V2_0)
      const decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'address[]', 'bool'], planner.inputs[0])
      expect(decoded[4]).to.equal(true)
    })

    it('encodes V2 exact-out payerIsUser=true', () => {
      encodeSwapStep(planner, buildV2ExactOutStep({ payerIsUser: true }), UniversalRouterVersion.V2_0)
      const decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'address[]', 'bool'], planner.inputs[0])
      expect(decoded[4]).to.equal(true)
    })

    it('defaults V2 exact-out payerIsUser to false', () => {
      encodeSwapStep(planner, buildV2ExactOutStep(), UniversalRouterVersion.V2_0)
      const decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'address[]', 'bool'], planner.inputs[0])
      expect(decoded[4]).to.equal(false)
    })

    it('encodes payerIsUser=true alongside minHopPriceX36 on UR 2.1.1', () => {
      encodeSwapStep(
        planner,
        buildV3ExactInStep({ payerIsUser: true, minHopPriceX36: ['123'] }),
        UniversalRouterVersion.V2_1_1
      )
      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool', 'uint256[]'],
        planner.inputs[0]
      )
      expect(decoded[4]).to.equal(true)
      expect(decoded[5][0].toString()).to.equal('123')
    })

    it('encodes non-boolean payerIsUser values as false (fail closed on wire garbage)', () => {
      encodeSwapStep(planner, buildV3ExactInStep({ payerIsUser: 'false' as any }), UniversalRouterVersion.V2_0)
      const decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], planner.inputs[0])
      expect(decoded[4]).to.equal(false)
    })
  })

  describe('encodeV4Action SETTLE payerIsUser threading', () => {
    it('encodes SETTLE payerIsUser=true', () => {
      const { params } = encodeV4Action(
        { action: 'SETTLE', currency: USDC.address, amount: '1000000', payerIsUser: true },
        UniversalRouterVersion.V2_1_1
      )
      expect(params[2]).to.equal(true)
    })

    it('defaults SETTLE payerIsUser to false', () => {
      const { params } = encodeV4Action(
        { action: 'SETTLE', currency: USDC.address, amount: '1000000' },
        UniversalRouterVersion.V2_1_1
      )
      expect(params[2]).to.equal(false)
    })

    it('round-trips SETTLE payerIsUser=true through V4_SWAP calldata', () => {
      const planner = new RoutePlanner()
      encodeSwapStep(planner, buildV4SettleSwap({ payerIsUser: true }), UniversalRouterVersion.V2_1_1)
      const parsed = V4BaseActionsParser.parseCalldata(planner.inputs[0], URVersion.V2_1_1)
      // action order: SWAP_EXACT_IN_SINGLE, SETTLE, TAKE
      expect(parsed.actions[1].params[2].value).to.equal(true)
    })
  })

  describe('safe mode (allowDirectTransfers=false)', () => {
    it('rejects V3 exact-in payerIsUser', () => {
      expect(() => validateEncodeSwaps(buildSpec(), [buildV3ExactInStep({ payerIsUser: true })])).to.throw(
        'PAYER_IS_USER_REQUIRES_DIRECT_TRANSFERS'
      )
    })

    it('rejects V3 exact-out payerIsUser', () => {
      expect(() => validateEncodeSwaps(buildExactOutSpec(), [buildV3ExactOutStep({ payerIsUser: true })])).to.throw(
        'PAYER_IS_USER_REQUIRES_DIRECT_TRANSFERS'
      )
    })

    it('rejects V2 exact-in payerIsUser', () => {
      expect(() => validateEncodeSwaps(buildSpec(), [buildV2ExactInStep({ payerIsUser: true })])).to.throw(
        'PAYER_IS_USER_REQUIRES_DIRECT_TRANSFERS'
      )
    })

    it('rejects V2 exact-out payerIsUser', () => {
      expect(() => validateEncodeSwaps(buildExactOutSpec(), [buildV2ExactOutStep({ payerIsUser: true })])).to.throw(
        'PAYER_IS_USER_REQUIRES_DIRECT_TRANSFERS'
      )
    })

    it('rejects v4 SETTLE payerIsUser', () => {
      expect(() => validateEncodeSwaps(buildSpec(), [buildV4SettleSwap({ payerIsUser: true })])).to.throw(
        'PAYER_IS_USER_REQUIRES_DIRECT_TRANSFERS'
      )
    })

    it('rejects v4 SETTLE_ALL', () => {
      const step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [{ action: 'SETTLE_ALL', currency: USDC.address, maxAmount: '1000000' }],
      }
      expect(() => validateEncodeSwaps(buildSpec(), [step])).to.throw('SETTLE_ALL_REQUIRES_DIRECT_TRANSFERS')
    })

    it('rejects v4 TAKE_ALL', () => {
      const step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [{ action: 'TAKE_ALL', currency: WETH.address, minAmount: '1' }],
      }
      expect(() => validateEncodeSwaps(buildSpec(), [step])).to.throw('TAKE_ALL_REQUIRES_DIRECT_TRANSFERS')
    })

    it('still accepts a plain custody plan', () => {
      expect(() => validateEncodeSwaps(buildSpec(), [buildV3ExactInStep()])).to.not.throw()
    })

    it('accepts the same shapes when allowDirectTransfers is set', () => {
      const flagOn = { allowDirectTransfers: true }
      expect(() => validateEncodeSwaps(buildSpec(flagOn), [buildV3ExactInStep({ payerIsUser: true })])).to.not.throw()
      expect(() =>
        validateEncodeSwaps(buildSpec(flagOn), [
          { type: 'V4_SWAP', v4Actions: [{ action: 'SETTLE_ALL', currency: USDC.address, maxAmount: '1000000' }] },
        ])
      ).to.not.throw()
      expect(() =>
        validateEncodeSwaps(buildSpec({ ...flagOn, recipient: SENDER_AS_RECIPIENT }), [
          { type: 'V4_SWAP', v4Actions: [{ action: 'TAKE_ALL', currency: WETH.address, minAmount: '1' }] },
        ])
      ).to.not.throw()
    })

    it('accepts plain v4 SETTLE plans in safe mode (no over-rejection near the boundary)', () => {
      expect(() => validateEncodeSwaps(buildSpec(), [buildV4SettleSwap()])).to.not.throw()
      expect(() => validateEncodeSwaps(buildSpec(), [buildV3ExactInStep({ payerIsUser: false })])).to.not.throw()
    })
  })

  describe('directTransfers inbound helpers', () => {
    describe('v3 path token extraction', () => {
      it('extracts first and last tokens from an exact-in path', () => {
        const path = packV3Path([USDC.address, WETH.address, DAI.address], [500, 3000])
        expect(v3PathFirstToken(path)!.toLowerCase()).to.equal(USDC.address.toLowerCase())
        expect(v3PathLastToken(path)!.toLowerCase()).to.equal(DAI.address.toLowerCase())
      })

      it('returns undefined for malformed paths', () => {
        expect(v3PathFirstToken('0x1234')).to.equal(undefined)
        expect(v3PathLastToken('nope')).to.equal(undefined)
      })

      it('returns undefined for hop-misaligned and single-address paths', () => {
        const valid = packV3Path([USDC.address, WETH.address, DAI.address], [500, 3000])
        const truncated = valid.slice(0, valid.length - 2) // drop one byte: no longer 20 + N*23 aligned
        expect(v3PathFirstToken(truncated)).to.equal(undefined)
        expect(v3PathLastToken(truncated)).to.equal(undefined)
        expect(v3PathFirstToken('0x' + USDC.address.slice(2))).to.equal(undefined)
        expect(v3PathLastToken('0x' + USDC.address.slice(2))).to.equal(undefined)
      })

      it('preserves address casing from checksummed paths', () => {
        const path = '0x' + DAI.address.slice(2) + '0001f4' + WETH.address.slice(2)
        expect(v3PathFirstToken(path)).to.equal('0x' + DAI.address.slice(2))
        expect(v3PathLastToken(path)).to.equal('0x' + WETH.address.slice(2))
      })
    })

    describe('stepUserPaidPulls / sumUserPaidMax', () => {
      it('router-funded steps produce no pulls', () => {
        expect(stepUserPaidPulls(buildV3ExactInStep())).to.deep.equal([])
        expect(sumUserPaidMax([buildV3ExactInStep(), buildV2ExactInStep()]).toString()).to.equal('0')
      })

      it('counts V3 exact-in at amountIn with the first path token', () => {
        const pulls = stepUserPaidPulls(buildV3ExactInStep({ payerIsUser: true, amountIn: '600000' }))
        expect(pulls.length).to.equal(1)
        expect(pulls[0].maxAmount.toString()).to.equal('600000')
        expect(pulls[0].token!.toLowerCase()).to.equal(USDC.address.toLowerCase())
      })

      it('counts V3 exact-out at amountInMax with the LAST path token (reversed encoding)', () => {
        const pulls = stepUserPaidPulls(buildV3ExactOutStep({ payerIsUser: true }))
        expect(pulls[0].maxAmount.toString()).to.equal('1050000')
        expect(pulls[0].token!.toLowerCase()).to.equal(USDC.address.toLowerCase())
      })

      it('counts V2 pulls with path[0]', () => {
        const inPulls = stepUserPaidPulls(buildV2ExactInStep({ payerIsUser: true }))
        expect(inPulls[0].token!.toLowerCase()).to.equal(USDC.address.toLowerCase())
        expect(inPulls[0].maxAmount.toString()).to.equal('1000000')
        const outPulls = stepUserPaidPulls(buildV2ExactOutStep({ payerIsUser: true }))
        expect(outPulls[0].maxAmount.toString()).to.equal('1050000')
      })

      it('counts v4 SETTLE only when flagged, SETTLE_ALL always', () => {
        expect(stepUserPaidPulls(buildV4SettleSwap())).to.deep.equal([])
        const settle = stepUserPaidPulls(buildV4SettleSwap({ payerIsUser: true }))
        expect(settle.length).to.equal(1)
        expect(settle[0].maxAmount.toString()).to.equal('1000000')
        expect(settle[0].token!.toLowerCase()).to.equal(USDC.address.toLowerCase())
        const settleAll: V4Swap = {
          type: 'V4_SWAP',
          v4Actions: [{ action: 'SETTLE_ALL', currency: USDC.address, maxAmount: '400000' }],
        }
        expect(stepUserPaidPulls(settleAll)[0].maxAmount.toString()).to.equal('400000')
      })

      it('sums pull maxima across steps', () => {
        const steps: SwapStep[] = [
          buildV3ExactInStep({ payerIsUser: true, amountIn: '600000' }),
          buildV2ExactInStep({ payerIsUser: true, amountIn: '150000' }),
          buildV3ExactInStep(),
        ]
        expect(sumUserPaidMax(steps).toString()).to.equal('750000')
      })

      it('wrap/unwrap and settle-free v4 steps produce no pulls', () => {
        expect(stepUserPaidPulls({ type: 'WRAP_ETH', recipient: ROUTER_AS_RECIPIENT, amount: '1' })).to.deep.equal([])
        expect(
          stepUserPaidPulls({ type: 'UNWRAP_WETH', recipient: ROUTER_AS_RECIPIENT, amountMin: '1' })
        ).to.deep.equal([])
        expect(
          stepUserPaidPulls({
            type: 'V4_SWAP',
            v4Actions: [{ action: 'TAKE', currency: WETH.address, recipient: ROUTER_AS_RECIPIENT, amount: '0' }],
          })
        ).to.deep.equal([])
      })
    })
  })

  describe('budgeted mode — inbound', () => {
    const flagOn = { allowDirectTransfers: true }

    it('accepts a user-paid exact-in step consuming the whole budget', () => {
      expect(() => validateEncodeSwaps(buildSpec(flagOn), [buildV3ExactInStep({ payerIsUser: true })])).to.not.throw()
    })

    it('rejects user-paid pulls above the budget', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec(flagOn), [buildV3ExactInStep({ payerIsUser: true, amountIn: '1000001' })])
      ).to.throw('USER_PAID_EXCEEDS_MAX_INPUT')
    })

    it('sums pulls across steps against the budget', () => {
      const steps: SwapStep[] = [
        buildV3ExactInStep({ payerIsUser: true, amountIn: '600000' }),
        buildV2ExactInStep({ payerIsUser: true, amountIn: '400001' }),
      ]
      expect(() => validateEncodeSwaps(buildSpec(flagOn), steps)).to.throw('USER_PAID_EXCEEDS_MAX_INPUT')
    })

    it('counts SETTLE_ALL maxAmount toward the budget', () => {
      const steps: SwapStep[] = [
        buildV3ExactInStep({ payerIsUser: true, amountIn: '700000' }),
        { type: 'V4_SWAP', v4Actions: [{ action: 'SETTLE_ALL', currency: USDC.address, maxAmount: '300001' }] },
      ]
      expect(() => validateEncodeSwaps(buildSpec(flagOn), steps)).to.throw('USER_PAID_EXCEEDS_MAX_INPUT')
    })

    it('exact-output budget uses the slippage-padded max input', () => {
      // maxIn = 1_050_000: amountInMax at the cap passes, one above fails
      expect(() =>
        validateEncodeSwaps(buildExactOutSpec(flagOn), [buildV3ExactOutStep({ payerIsUser: true })])
      ).to.not.throw()
      expect(() =>
        validateEncodeSwaps(buildExactOutSpec(flagOn), [
          buildV3ExactOutStep({ payerIsUser: true, amountInMax: '1050001' }),
        ])
      ).to.throw('USER_PAID_EXCEEDS_MAX_INPUT')
    })

    it('rejects zero and sentinel amounts on user-paid steps', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec(flagOn), [buildV3ExactInStep({ payerIsUser: true, amountIn: '0' })])
      ).to.throw('USER_PAID_AMOUNT_OUT_OF_RANGE')
      expect(() =>
        validateEncodeSwaps(buildSpec(flagOn), [
          buildV3ExactInStep({ payerIsUser: true, amountIn: CONTRACT_BALANCE.toString() }),
        ])
      ).to.throw('USER_PAID_AMOUNT_OUT_OF_RANGE')
    })

    it('rejects user-paid steps whose input token is not the spec input token', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec(flagOn), [
          buildV3ExactInStep({ payerIsUser: true, path: packV3Path([DAI.address, WETH.address], [500]) }),
        ])
      ).to.throw('USER_PAID_INPUT_TOKEN_MISMATCH')
    })

    it('binds V3 exact-out user-paid steps to the path tail (reversed encoding)', () => {
      expect(() =>
        validateEncodeSwaps(buildExactOutSpec(flagOn), [
          buildV3ExactOutStep({ payerIsUser: true, path: packV3ExactOutPath([DAI.address, WETH.address], [500]) }),
        ])
      ).to.throw('USER_PAID_INPUT_TOKEN_MISMATCH')
    })

    it('rejects malformed paths on user-paid steps', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec(flagOn), [buildV3ExactInStep({ payerIsUser: true, path: '0x1234' })])
      ).to.throw('USER_PAID_MALFORMED_PATH')
    })

    it('names the offending step in the error', () => {
      const steps: SwapStep[] = [
        buildV3ExactInStep({ payerIsUser: true, amountIn: '400000' }),
        buildV3ExactInStep({ payerIsUser: true, path: '0x1234' }),
      ]
      expect(() => validateEncodeSwaps(buildSpec(flagOn), steps)).to.throw('USER_PAID_MALFORMED_PATH (step 1)')
    })

    it('rejects user-paid steps with native input', () => {
      const spec = buildSpec(flagOn, {
        inputToken: ETH,
        outputToken: USDC,
        amount: CurrencyAmount.fromRawAmount(ETH, '1000000000000000000'),
        quote: CurrencyAmount.fromRawAmount(USDC, '1000000'),
      })
      const step = buildV3ExactInStep({
        payerIsUser: true,
        amountIn: '1000000000000000000',
        path: packV3Path([WETH.address, USDC.address], [500]),
      })
      expect(() => validateEncodeSwaps(spec, [step])).to.throw('DIRECT_TRANSFERS_NATIVE_INPUT')
    })

    it('rejects user-paid steps with nativeErc20Input', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec({ ...flagOn, nativeErc20Input: true }), [
          buildV3ExactInStep({ payerIsUser: true }),
        ])
      ).to.throw('DIRECT_TRANSFERS_NATIVE_ERC20_INPUT')
    })

    it('rejects user-paid steps under ApproveProxy', () => {
      const spec = buildSpec({ ...flagOn, tokenTransferMode: TokenTransferMode.ApproveProxy, chainId: 1 })
      expect(() => validateEncodeSwaps(spec, [buildV3ExactInStep({ payerIsUser: true })])).to.throw(
        'DIRECT_TRANSFERS_REQUIRES_PERMIT2'
      )
    })

    it('rejects undersized permits when user-paid pulls exist', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec({ ...flagOn, permit: { ...TEST_PERMIT } }), [
          buildV3ExactInStep({ payerIsUser: true }),
        ])
      ).to.throw('PERMIT_AMOUNT_INSUFFICIENT')
    })

    it('accepts permits covering the budget', () => {
      const permit = { ...TEST_PERMIT, details: { ...TEST_PERMIT.details, amount: '1000000' } }
      expect(() =>
        validateEncodeSwaps(buildSpec({ ...flagOn, permit }), [buildV3ExactInStep({ payerIsUser: true })])
      ).to.not.throw()
    })

    it('skips inbound gating when no user-paid pulls exist (flag on, custody steps, native input)', () => {
      const spec = buildSpec(flagOn, {
        inputToken: ETH,
        outputToken: USDC,
        amount: CurrencyAmount.fromRawAmount(ETH, '1000000000000000000'),
        quote: CurrencyAmount.fromRawAmount(USDC, '1000000'),
      })
      const step = buildV3ExactInStep({
        amountIn: '1000000000000000000',
        path: packV3Path([WETH.address, USDC.address], [500]),
      })
      expect(() => validateEncodeSwaps(spec, [step])).to.not.throw()
    })

    it('rejects invalid v4 hookData with a clear code (routing emits "")', () => {
      const step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [
          {
            action: 'SWAP_EXACT_IN_SINGLE',
            poolKey: {
              currency0: USDC.address,
              currency1: WETH.address,
              fee: 500,
              tickSpacing: 10,
              hooks: ETH_ADDRESS,
            },
            zeroForOne: true,
            amountIn: '1000000',
            amountOutMinimum: '0',
            hookData: '',
          },
        ],
      }
      expect(() => validateEncodeSwaps(buildSpec(), [step])).to.throw('V4_HOOK_DATA_INVALID')
      expect(() => validateEncodeSwaps(buildSpec({ allowDirectTransfers: true }), [step])).to.throw(
        'V4_HOOK_DATA_INVALID'
      )
    })

    it('rejects permits for a token other than the input token', () => {
      const permit = { ...TEST_PERMIT, details: { ...TEST_PERMIT.details, token: WETH.address, amount: '99999999999' } }
      expect(() =>
        validateEncodeSwaps(buildSpec({ allowDirectTransfers: true, permit }), [
          buildV3ExactInStep({ payerIsUser: true }),
        ])
      ).to.throw('PERMIT_TOKEN_MISMATCH')
    })

    it('rejects invalid per-hop hookData in v4 path-form swaps', () => {
      const step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [
          {
            action: 'SWAP_EXACT_IN',
            currencyIn: USDC.address,
            path: [{ intermediateCurrency: WETH.address, fee: 500, tickSpacing: 10, hooks: ETH_ADDRESS, hookData: '' }],
            amountIn: '1000000',
            amountOutMinimum: '0',
          },
        ],
      }
      expect(() => validateEncodeSwaps(buildSpec(), [step])).to.throw('V4_HOOK_DATA_INVALID')
    })

    it('counts flagged SETTLE and SETTLE_ALL together against the budget', () => {
      const step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [
          { action: 'SETTLE', currency: USDC.address, amount: '600000', payerIsUser: true },
          { action: 'SETTLE_ALL', currency: USDC.address, maxAmount: '400001' },
        ],
      }
      expect(() => validateEncodeSwaps(buildSpec({ allowDirectTransfers: true }), [step])).to.throw(
        'USER_PAID_EXCEEDS_MAX_INPUT'
      )
    })

    it('rejects non-string path tokens on user-paid steps as malformed', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec({ allowDirectTransfers: true }), [
          buildV2ExactInStep({ payerIsUser: true, path: [123 as any, WETH.address] }),
        ])
      ).to.throw('USER_PAID_MALFORMED_PATH (step 0)')
    })
  })

  describe('budgeted mode — ingress remainder', () => {
    const flagOn = { allowDirectTransfers: true }

    it('omits PERMIT2_TRANSFER_FROM when user-paid pulls consume the whole budget', () => {
      const result = SwapRouter.encodeSwaps(buildSpec(flagOn), [buildV3ExactInStep({ payerIsUser: true })])
      const { commandTypes } = parseCommands(result.calldata)
      expect(commandTypes).to.deep.equal([CommandType.V3_SWAP_EXACT_IN, CommandType.SWEEP])
    })

    it('pulls only the remainder when pulls cover part of the budget', () => {
      const steps: SwapStep[] = [
        buildV3ExactInStep({ payerIsUser: true, amountIn: '600000' }),
        buildV3ExactInStep({ amountIn: '400000' }),
      ]
      const result = SwapRouter.encodeSwaps(buildSpec(flagOn), steps)
      const { commandTypes, inputs } = parseCommands(result.calldata)
      expect(commandTypes).to.deep.equal([
        CommandType.PERMIT2_TRANSFER_FROM,
        CommandType.V3_SWAP_EXACT_IN,
        CommandType.V3_SWAP_EXACT_IN,
        CommandType.SWEEP,
      ])
      const transfer = defaultAbiCoder.decode(['address', 'address', 'uint160'], inputs[0])
      expect(transfer[2].toString()).to.equal('400000')
    })

    it('encodes byte-identically to safe mode when no direct-transfer steps are used', () => {
      const steps = [buildV3ExactInStep()]
      const on = SwapRouter.encodeSwaps(buildSpec(flagOn), steps)
      const off = SwapRouter.encodeSwaps(buildSpec(), steps)
      expect(on.calldata).to.equal(off.calldata)
      expect(on.value).to.equal(off.value)
    })

    it('fails closed when the ingress remainder exceeds uint160 (ethers abi bounds)', () => {
      const huge = BigNumber.from(2).pow(170).toString()
      const spec = buildSpec(
        { allowDirectTransfers: true },
        {
          amount: CurrencyAmount.fromRawAmount(USDC, huge),
          quote: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
        }
      )
      expect(() =>
        SwapRouter.encodeSwaps(spec, [buildV3ExactInStep({ payerIsUser: true, amountIn: '1000' })])
      ).to.throw(/out-of-bounds/)
    })
  })

  describe('budgeted mode — outbound recipients', () => {
    const flagOn = { allowDirectTransfers: true }
    const portionFee = { kind: 'portion' as const, recipient: FEE_RECIPIENT, fee: new Percent(5, 1000) }

    it('accepts steps paying the spec recipient directly', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec(flagOn), [buildV3ExactInStep({ recipient: TEST_RECIPIENT })])
      ).to.not.throw()
    })

    it('rejects recipients that are neither router nor the spec recipient', () => {
      expect(() => validateEncodeSwaps(buildSpec(flagOn), [buildV3ExactInStep({ recipient: FEE_RECIPIENT })])).to.throw(
        'STEP_RECIPIENT_NOT_ALLOWED'
      )
    })

    it('still rejects non-router recipients in safe mode with the legacy error', () => {
      expect(() => validateEncodeSwaps(buildSpec(), [buildV3ExactInStep({ recipient: TEST_RECIPIENT })])).to.throw(
        'STEP_RECIPIENT_MUST_BE_ROUTER'
      )
    })

    it('rejects direct-output steps when a portion fee is set', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec({ ...flagOn, fee: portionFee }), [
          buildV3ExactInStep({ recipient: TEST_RECIPIENT }),
        ])
      ).to.throw('PORTION_FEE_REQUIRES_ROUTER_CUSTODY')
    })

    it('allows user-paid input alongside a portion fee with custody output', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec({ ...flagOn, fee: portionFee }), [buildV3ExactInStep({ payerIsUser: true })])
      ).to.not.throw()
    })

    it('accepts v4 TAKE / TAKE_PORTION to the spec recipient', () => {
      const step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [
          { action: 'TAKE', currency: WETH.address, recipient: TEST_RECIPIENT, amount: '1' },
          { action: 'TAKE_PORTION', currency: WETH.address, recipient: TEST_RECIPIENT, bips: '100' },
        ],
      }
      expect(() => validateEncodeSwaps(buildSpec(flagOn), [step])).to.not.throw()
    })

    it('rejects v4 TAKE to an address that is neither router nor the spec recipient', () => {
      const step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [{ action: 'TAKE', currency: WETH.address, recipient: FEE_RECIPIENT, amount: '1' }],
      }
      expect(() => validateEncodeSwaps(buildSpec(flagOn), [step])).to.throw('STEP_RECIPIENT_NOT_ALLOWED')
    })

    it('accepts UNWRAP_WETH to the spec recipient but keeps WRAP_ETH router-only', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec(flagOn), [
          buildV3ExactInStep(),
          { type: 'UNWRAP_WETH', recipient: TEST_RECIPIENT, amountMin: '1' },
        ])
      ).to.not.throw()
      expect(() =>
        validateEncodeSwaps(buildSpec(flagOn), [
          { type: 'WRAP_ETH', recipient: TEST_RECIPIENT, amount: '1' },
          buildV3ExactInStep(),
        ])
      ).to.throw('STEP_RECIPIENT_MUST_BE_ROUTER')
    })

    it('requires the sender-sentinel recipient for TAKE_ALL', () => {
      const step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [{ action: 'TAKE_ALL', currency: WETH.address, minAmount: '1' }],
      }
      expect(() => validateEncodeSwaps(buildSpec(flagOn), [step])).to.throw('TAKE_ALL_REQUIRES_SENDER_RECIPIENT')
      expect(() => validateEncodeSwaps(buildSpec({ ...flagOn, recipient: SENDER_AS_RECIPIENT }), [step])).to.not.throw()
    })

    it('bans TAKE_ALL under a portion fee', () => {
      const step: V4Swap = {
        type: 'V4_SWAP',
        v4Actions: [{ action: 'TAKE_ALL', currency: WETH.address, minAmount: '1' }],
      }
      expect(() =>
        validateEncodeSwaps(buildSpec({ ...flagOn, recipient: SENDER_AS_RECIPIENT, fee: portionFee }), [step])
      ).to.throw('PORTION_FEE_REQUIRES_ROUTER_CUSTODY')
    })

    it('matches step recipients case-insensitively', () => {
      const upper = ('0x' + TEST_RECIPIENT.slice(2).toUpperCase()) as string
      expect(() => validateEncodeSwaps(buildSpec(flagOn), [buildV3ExactInStep({ recipient: upper })])).to.not.throw()
    })

    it('rejects the sender sentinel as a step recipient when the spec recipient is explicit', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec({ allowDirectTransfers: true }), [
          buildV3ExactInStep({ recipient: SENDER_AS_RECIPIENT }),
        ])
      ).to.throw('STEP_RECIPIENT_NOT_ALLOWED')
    })

    it('accepts the sender sentinel as a step recipient when the spec recipient is the sender', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec({ allowDirectTransfers: true, recipient: SENDER_AS_RECIPIENT }), [
          buildV3ExactInStep({ recipient: SENDER_AS_RECIPIENT }),
        ])
      ).to.not.throw()
    })

    it('rejects sender-sentinel step recipients under ApproveProxy (would pay the proxy)', () => {
      const spec = buildSpec({
        allowDirectTransfers: true,
        tokenTransferMode: TokenTransferMode.ApproveProxy,
        chainId: 1,
      })
      expect(() => validateEncodeSwaps(spec, [buildV3ExactInStep({ recipient: SENDER_AS_RECIPIENT })])).to.throw(
        'STEP_RECIPIENT_NOT_ALLOWED'
      )
      expect(() => validateEncodeSwaps(spec, [buildV3ExactInStep({ recipient: TEST_RECIPIENT })])).to.not.throw()
    })

    it('rejects non-string recipients with a clean invariant error', () => {
      expect(() =>
        validateEncodeSwaps(buildSpec({ allowDirectTransfers: true }), [buildV3ExactInStep({ recipient: 123 as any })])
      ).to.throw('STEP_RECIPIENT_MUST_BE_ROUTER')
    })
  })

  describe('directTransfers output coverage helpers', () => {
    it('counts V3 exact-in minimums delivered to the recipient in the output token', () => {
      const steps: SwapStep[] = [
        buildV3ExactInStep({ recipient: TEST_RECIPIENT, amountOutMin: '100' }),
        buildV3ExactInStep({ amountOutMin: '50' }), // router custody: not counted
      ]
      expect(sumDirectOutputMin(steps, TEST_RECIPIENT, WETH.address).toString()).to.equal('100')
    })

    it('counts V3 exact-out amounts via the path head (reversed encoding)', () => {
      const steps: SwapStep[] = [buildV3ExactOutStep({ recipient: TEST_RECIPIENT })]
      expect(sumDirectOutputMin(steps, TEST_RECIPIENT, WETH.address).toString()).to.equal('500000000000000000')
    })

    it('counts V2 credits via the last path token', () => {
      const steps: SwapStep[] = [buildV2ExactInStep({ recipient: TEST_RECIPIENT, amountOutMin: '9' })]
      expect(sumDirectOutputMin(steps, TEST_RECIPIENT, WETH.address).toString()).to.equal('9')
    })

    it('counts V2 exact-out amounts as credits', () => {
      const steps: SwapStep[] = [buildV2ExactOutStep({ recipient: TEST_RECIPIENT })]
      expect(sumDirectOutputMin(steps, TEST_RECIPIENT, WETH.address).toString()).to.equal('500000000000000000')
    })

    it('counts TAKE_PORTION to the recipient as zero (runtime-sized)', () => {
      const steps: SwapStep[] = [
        {
          type: 'V4_SWAP',
          v4Actions: [{ action: 'TAKE_PORTION', currency: WETH.address, recipient: TEST_RECIPIENT, bips: '100' }],
        },
      ]
      expect(sumDirectOutputMin(steps, TEST_RECIPIENT, WETH.address).toString()).to.equal('0')
    })

    it('ignores credits in tokens other than the output token', () => {
      const steps: SwapStep[] = [
        buildV3ExactInStep({
          recipient: TEST_RECIPIENT,
          amountOutMin: '100',
          path: packV3Path([USDC.address, DAI.address], [500]),
        }),
      ]
      expect(sumDirectOutputMin(steps, TEST_RECIPIENT, WETH.address).toString()).to.equal('0')
    })

    it('counts UNWRAP_WETH to the recipient as native', () => {
      const steps: SwapStep[] = [{ type: 'UNWRAP_WETH', recipient: TEST_RECIPIENT, amountMin: '77' }]
      expect(sumDirectOutputMin(steps, TEST_RECIPIENT, ETH_ADDRESS).toString()).to.equal('77')
      expect(sumDirectOutputMin(steps, TEST_RECIPIENT, WETH.address).toString()).to.equal('0')
    })

    it('counts concrete v4 TAKEs; OPEN_DELTA and CONTRACT_BALANCE takes count zero', () => {
      const steps: SwapStep[] = [
        {
          type: 'V4_SWAP',
          v4Actions: [
            { action: 'TAKE', currency: WETH.address, recipient: TEST_RECIPIENT, amount: '40' },
            { action: 'TAKE', currency: WETH.address, recipient: TEST_RECIPIENT, amount: '0' },
            { action: 'TAKE', currency: WETH.address, recipient: TEST_RECIPIENT, amount: CONTRACT_BALANCE.toString() },
          ],
        },
      ]
      expect(sumDirectOutputMin(steps, TEST_RECIPIENT, WETH.address).toString()).to.equal('40')
    })

    it('counts TAKE_ALL minAmount only for the sender-sentinel recipient', () => {
      const steps: SwapStep[] = [
        { type: 'V4_SWAP', v4Actions: [{ action: 'TAKE_ALL', currency: WETH.address, minAmount: '2' }] },
      ]
      expect(sumDirectOutputMin(steps, SENDER_AS_RECIPIENT, WETH.address).toString()).to.equal('2')
      expect(sumDirectOutputMin(steps, TEST_RECIPIENT, WETH.address).toString()).to.equal('0')
    })

    it('accumulates duplicate direct legs (each is independently contract-enforced)', () => {
      const leg = buildV3ExactInStep({ recipient: TEST_RECIPIENT, amountOutMin: '200000000000000000' })
      expect(sumDirectOutputMin([leg, leg], TEST_RECIPIENT, WETH.address).toString()).to.equal('400000000000000000')
    })
  })

  describe('budgeted mode — sweep floor', () => {
    const flagOn = { allowDirectTransfers: true }
    const NET_MIN = '475000000000000000' // 0.5 WETH quote less 5% slippage

    function sweepAmount(calldata: string): string {
      const { commandTypes, inputs } = parseCommands(calldata)
      const sweepIndex = commandTypes.indexOf(CommandType.SWEEP)
      expect(sweepIndex).to.be.greaterThan(-1)
      const sweep = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[sweepIndex])
      return sweep[2].toString()
    }

    it('keeps the full floor when nothing is delivered directly', () => {
      const result = SwapRouter.encodeSwaps(buildSpec(flagOn), [buildV3ExactInStep()])
      expect(sweepAmount(result.calldata)).to.equal(NET_MIN)
    })

    it('reduces the floor by direct-output minimums', () => {
      const direct = BigNumber.from(NET_MIN).sub(1000)
      const steps: SwapStep[] = [buildV3ExactInStep({ recipient: TEST_RECIPIENT, amountOutMin: direct.toString() })]
      const result = SwapRouter.encodeSwaps(buildSpec(flagOn), steps)
      expect(sweepAmount(result.calldata)).to.equal('1000')
    })

    it('clamps the floor at zero when direct minimums exceed netMin', () => {
      const steps: SwapStep[] = [
        buildV3ExactInStep({ recipient: TEST_RECIPIENT, amountOutMin: BigNumber.from(NET_MIN).add(5).toString() }),
      ]
      const result = SwapRouter.encodeSwaps(buildSpec(flagOn), steps)
      expect(sweepAmount(result.calldata)).to.equal('0')
    })

    it('does not reduce the floor for direct deliveries in other tokens', () => {
      const steps: SwapStep[] = [
        buildV3ExactInStep(),
        buildV3ExactInStep({
          recipient: TEST_RECIPIENT,
          amountOutMin: '999',
          path: packV3Path([USDC.address, DAI.address], [500]),
        }),
      ]
      const result = SwapRouter.encodeSwaps(buildSpec(flagOn), steps)
      expect(sweepAmount(result.calldata)).to.equal(NET_MIN)
    })

    it('safe-mode floor is unchanged', () => {
      const result = SwapRouter.encodeSwaps(buildSpec(), [buildV3ExactInStep()])
      expect(sweepAmount(result.calldata)).to.equal(NET_MIN)
    })

    it('flat fee with a direct exact-out leg: TRANSFER, residual SWEEP, refund sweep', () => {
      // exact-out 0.5 WETH with flat fee 0.01 WETH -> netMin 0.49; a direct leg delivers 0.2
      const fee = { kind: 'flat' as const, recipient: FEE_RECIPIENT, amount: '10000000000000000' }
      const steps: SwapStep[] = [
        buildV3ExactOutStep({ recipient: TEST_RECIPIENT, amountOut: '200000000000000000', amountInMax: '400000' }),
        buildV3ExactOutStep({ amountOut: '300000000000000000', amountInMax: '650000' }),
      ]
      const result = SwapRouter.encodeSwaps(buildExactOutSpec({ ...flagOn, fee }), steps)
      const { commandTypes, inputs } = parseCommands(result.calldata)
      expect(commandTypes).to.deep.equal([
        CommandType.PERMIT2_TRANSFER_FROM,
        CommandType.V3_SWAP_EXACT_OUT,
        CommandType.V3_SWAP_EXACT_OUT,
        CommandType.TRANSFER,
        CommandType.SWEEP,
        CommandType.SWEEP,
      ])
      const residual = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[4])
      // netMin (0.5 - 0.01 fee) minus 0.2 direct = 0.29 WETH
      expect(residual[2].toString()).to.equal('290000000000000000')
    })
  })

  describe('real routing corpus', () => {
    const USDT = new Token(1, '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6, 'USDT')
    const normalizeHookData = (steps: SwapStep[]): SwapStep[] =>
      steps.map((s) =>
        s.type === 'V4_SWAP'
          ? {
              ...s,
              v4Actions: s.v4Actions.map((a) => ('hookData' in a && a.hookData === '' ? { ...a, hookData: '0x' } : a)),
            }
          : s
      )
    const usdtEthSpec = (amount: string, quote: string, allowDirectTransfers: boolean): NormalizedSwapSpecification =>
      buildSpec(
        { allowDirectTransfers, urVersion: UniversalRouterVersion.V2_1_1 },
        {
          inputToken: USDT,
          outputToken: ETH,
          amount: CurrencyAmount.fromRawAmount(USDT, amount),
          quote: CurrencyAmount.fromRawAmount(ETH, quote),
        }
      )

    it('encodes the custody+unwrap sample identically in both regimes', () => {
      const steps = routingSamples.custodyUnwrap as SwapStep[]
      const spec = usdtEthSpec('100000', '60175820634906', false)
      const off = SwapRouter.encodeSwaps(spec, steps)
      const on = SwapRouter.encodeSwaps(usdtEthSpec('100000', '60175820634906', true), steps)
      expect(on.calldata).to.equal(off.calldata)
    })

    it('rejects the multi-protocol sample raw (hookData "") and encodes it normalized, byte-identical across regimes', () => {
      const raw = routingSamples.multiProtocolSplit as SwapStep[]
      const spec = usdtEthSpec('10000000000', '5551980093360789420', false)
      expect(() => validateEncodeSwaps(spec, raw)).to.throw('V4_HOOK_DATA_INVALID')

      const steps = normalizeHookData(raw)
      const off = SwapRouter.encodeSwaps(spec, steps)
      const on = SwapRouter.encodeSwaps(usdtEthSpec('10000000000', '5551980093360789420', true), steps)
      expect(off.calldata.length).to.be.greaterThan(2000) // 9-step plan, ~5kB calldata
      expect(on.calldata).to.equal(off.calldata)
    })
  })
})
