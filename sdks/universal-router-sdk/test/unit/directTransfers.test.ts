import { expect } from 'chai'
import { BigNumber, utils } from 'ethers'
import { defaultAbiCoder } from 'ethers/lib/utils'
import { CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core'
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
import { stepUserPaidPulls, sumUserPaidMax, v3PathFirstToken, v3PathLastToken } from '../../src/utils/directTransfers'
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

const TEST_RECIPIENT = TEST_RECIPIENT_ADDRESS
const FEE_RECIPIENT = TEST_FEE_RECIPIENT_ADDRESS

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
})
