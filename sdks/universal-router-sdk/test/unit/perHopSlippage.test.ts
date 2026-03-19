import { expect } from 'chai'
import { BigNumber, utils } from 'ethers'
import { defaultAbiCoder } from 'ethers/lib/utils'
import { RoutePlanner, CommandType, createCommand } from '../../src/utils/routerCommands'
import { URVersion, Route as V4Route, Trade as V4Trade, V4BaseActionsParser } from '@uniswap/v4-sdk'
import { Trade as RouterTrade, MixedRouteSDK } from '@uniswap/router-sdk'
import { Route as V3RouteSDK } from '@uniswap/v3-sdk'
import { Pair, Route as V2RouteSDK } from '@uniswap/v2-sdk'
import { CurrencyAmount, TradeType } from '@uniswap/sdk-core'
import { SwapRouter } from '../../src/swapRouter'
import { WETH, USDC, DAI, makeV3Pool, makeV4Pool, parseCommands, swapOptions } from '../utils/uniswapData'

// ─── Pools ───────────────────────────────────────────────────────────────────

const WETH_USDC_V3 = makeV3Pool(WETH, USDC)
const USDC_DAI_V3 = makeV3Pool(USDC, DAI)

const WETH_USDC_V2 = new Pair(
  CurrencyAmount.fromRawAmount(WETH, '1000000000000000000'),
  CurrencyAmount.fromRawAmount(USDC, '1000000000000')
)
const USDC_DAI_V2 = new Pair(
  CurrencyAmount.fromRawAmount(USDC, '1000000000000'),
  CurrencyAmount.fromRawAmount(DAI, '1000000000000000000000000')
)

const WETH_USDC_V4 = makeV4Pool(WETH, USDC)
const USDC_DAI_V4 = makeV4Pool(USDC, DAI)

const ONE_ETH = '1000000000000000000'
const ONE_USDC = '1000000'
const RECIPIENT = '0x0000000000000000000000000000000000000001'

// =============================================================================

describe('Per-Hop Slippage', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. V2 routes — per-hop slippage with V2_1_1
  // ─────────────────────────────────────────────────────────────────────────

  describe('V2 routes with V2_1_1', () => {
    it('exact input: encodes maxHopSlippage array', () => {
      const v2Route = new V2RouteSDK([WETH_USDC_V2, USDC_DAI_V2], WETH, DAI)
      const trade = new RouterTrade({
        v2Routes: [
          {
            routev2: v2Route,
            inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
            outputAmount: CurrencyAmount.fromRawAmount(DAI, ONE_ETH),
            maxHopSlippage: [BigInt(500), BigInt(600)],
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_1_1 })).calldata
      )

      const v2Idx = commandTypes.indexOf(CommandType.V2_SWAP_EXACT_IN)
      expect(v2Idx).to.not.equal(-1)

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool', 'uint256[]'],
        inputs[v2Idx]
      )
      expect(decoded[5].map((v: BigNumber) => v.toString())).to.deep.equal(['500', '600'])
    })

    it('exact output: encodes maxHopSlippage array', () => {
      const v2Route = new V2RouteSDK([WETH_USDC_V2], WETH, USDC)
      const trade = new RouterTrade({
        v2Routes: [
          {
            routev2: v2Route,
            inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
            outputAmount: CurrencyAmount.fromRawAmount(USDC, ONE_USDC),
            maxHopSlippage: [BigInt(250)],
          },
        ],
        tradeType: TradeType.EXACT_OUTPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_1_1 })).calldata
      )

      const v2Idx = commandTypes.indexOf(CommandType.V2_SWAP_EXACT_OUT)
      expect(v2Idx).to.not.equal(-1)

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool', 'uint256[]'],
        inputs[v2Idx]
      )
      expect(decoded[5].map((v: BigNumber) => v.toString())).to.deep.equal(['250'])
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 2. V3 routes — per-hop slippage with V2_1_1
  // ─────────────────────────────────────────────────────────────────────────

  describe('V3 routes with V2_1_1', () => {
    it('exact input: encodes maxHopSlippage array', () => {
      const v3Route = new V3RouteSDK([WETH_USDC_V3, USDC_DAI_V3], WETH, DAI)
      const trade = new RouterTrade({
        v3Routes: [
          {
            routev3: v3Route,
            inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
            outputAmount: CurrencyAmount.fromRawAmount(DAI, ONE_ETH),
            maxHopSlippage: [BigInt(300), BigInt(400)],
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_1_1 })).calldata
      )

      const v3Idx = commandTypes.indexOf(CommandType.V3_SWAP_EXACT_IN)
      expect(v3Idx).to.not.equal(-1)

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool', 'uint256[]'],
        inputs[v3Idx]
      )
      expect(decoded[5].map((v: BigNumber) => v.toString())).to.deep.equal(['300', '400'])
    })

    it('exact output: encodes maxHopSlippage array', () => {
      const v3Route = new V3RouteSDK([WETH_USDC_V3], WETH, USDC)
      const trade = new RouterTrade({
        v3Routes: [
          {
            routev3: v3Route,
            inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
            outputAmount: CurrencyAmount.fromRawAmount(USDC, ONE_USDC),
            maxHopSlippage: [BigInt(750)],
          },
        ],
        tradeType: TradeType.EXACT_OUTPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_1_1 })).calldata
      )

      const v3Idx = commandTypes.indexOf(CommandType.V3_SWAP_EXACT_OUT)
      expect(v3Idx).to.not.equal(-1)

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool', 'uint256[]'],
        inputs[v3Idx]
      )
      expect(decoded[5].map((v: BigNumber) => v.toString())).to.deep.equal(['750'])
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 3. V4 routes — per-hop slippage with V2_1_1
  // ─────────────────────────────────────────────────────────────────────────

  describe('V4 routes with V2_1_1', () => {
    it('exact input: encodes maxHopSlippage in V4 swap action', () => {
      const v4Route = new V4Route([WETH_USDC_V4, USDC_DAI_V4], WETH, DAI)
      const v4Trade = V4Trade.createUncheckedTrade({
        route: v4Route,
        inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
        outputAmount: CurrencyAmount.fromRawAmount(DAI, ONE_ETH),
        tradeType: TradeType.EXACT_INPUT,
      })

      const trade = new RouterTrade({
        v4Routes: [
          {
            routev4: v4Trade.route,
            inputAmount: v4Trade.inputAmount,
            outputAmount: v4Trade.outputAmount,
            maxHopSlippage: [BigInt(1000), BigInt(2000)],
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_1_1 })).calldata
      )

      const v4Idx = commandTypes.indexOf(CommandType.V4_SWAP)
      expect(v4Idx).to.not.equal(-1)

      const parsed = V4BaseActionsParser.parseCalldata(inputs[v4Idx], URVersion.V2_1_1)
      const swapAction = parsed.actions.find((a) => a.actionName === 'SWAP_EXACT_IN')
      expect(swapAction).to.not.be.undefined
      const swapParams = swapAction!.params[0].value as any
      expect(swapParams.maxHopSlippage.map((v: any) => v.toString())).to.deep.equal(['1000', '2000'])
    })

    it('exact output: encodes maxHopSlippage in V4 swap action', () => {
      const v4Route = new V4Route([WETH_USDC_V4], WETH, USDC)
      const v4Trade = V4Trade.createUncheckedTrade({
        route: v4Route,
        inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
        outputAmount: CurrencyAmount.fromRawAmount(USDC, ONE_USDC),
        tradeType: TradeType.EXACT_OUTPUT,
      })

      const trade = new RouterTrade({
        v4Routes: [
          {
            routev4: v4Trade.route,
            inputAmount: v4Trade.inputAmount,
            outputAmount: v4Trade.outputAmount,
            maxHopSlippage: [BigInt(3000)],
          },
        ],
        tradeType: TradeType.EXACT_OUTPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_1_1 })).calldata
      )

      const v4Idx = commandTypes.indexOf(CommandType.V4_SWAP)
      expect(v4Idx).to.not.equal(-1)

      const parsed = V4BaseActionsParser.parseCalldata(inputs[v4Idx], URVersion.V2_1_1)
      const swapAction = parsed.actions.find((a) => a.actionName === 'SWAP_EXACT_OUT')
      expect(swapAction).to.not.be.undefined
      const swapParams = swapAction!.params[0].value as any
      expect(swapParams.maxHopSlippage.toString()).to.equal('3000')
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Mixed routes — per-hop slippage with V2_1_1
  // ─────────────────────────────────────────────────────────────────────────

  describe('Mixed routes with V2_1_1', () => {
    it('slices maxHopSlippage across V3 and V2 sections', () => {
      const mixedRoute = new MixedRouteSDK([WETH_USDC_V3, USDC_DAI_V2], WETH, DAI)
      const trade = new RouterTrade({
        mixedRoutes: [
          {
            mixedRoute,
            inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
            outputAmount: CurrencyAmount.fromRawAmount(DAI, ONE_ETH),
            maxHopSlippage: [BigInt(100), BigInt(200)],
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_1_1 })).calldata
      )

      const v3Idx = commandTypes.indexOf(CommandType.V3_SWAP_EXACT_IN)
      const v2Idx = commandTypes.indexOf(CommandType.V2_SWAP_EXACT_IN)
      expect(v3Idx).to.not.equal(-1, 'expected a V3_SWAP_EXACT_IN command')
      expect(v2Idx).to.not.equal(-1, 'expected a V2_SWAP_EXACT_IN command')

      const v3Decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool', 'uint256[]'],
        inputs[v3Idx]
      )
      expect(v3Decoded[5].map((v: BigNumber) => v.toString())).to.deep.equal(['100'])

      const v2Decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool', 'uint256[]'],
        inputs[v2Idx]
      )
      expect(v2Decoded[5].map((v: BigNumber) => v.toString())).to.deep.equal(['200'])
    })

    it('undefined maxHopSlippage encodes empty arrays per section', () => {
      const mixedRoute = new MixedRouteSDK([WETH_USDC_V3, USDC_DAI_V2], WETH, DAI)
      const trade = new RouterTrade({
        mixedRoutes: [
          {
            mixedRoute,
            inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
            outputAmount: CurrencyAmount.fromRawAmount(DAI, ONE_ETH),
            maxHopSlippage: undefined,
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_1_1 })).calldata
      )

      const v3Idx = commandTypes.indexOf(CommandType.V3_SWAP_EXACT_IN)
      const v2Idx = commandTypes.indexOf(CommandType.V2_SWAP_EXACT_IN)

      const v3Decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool', 'uint256[]'],
        inputs[v3Idx]
      )
      expect(v3Decoded[5]).to.deep.equal([])

      const v2Decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool', 'uint256[]'],
        inputs[v2Idx]
      )
      expect(v2Decoded[5]).to.deep.equal([])
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Backwards compatibility — V2_0 never encodes maxHopSlippage
  // ─────────────────────────────────────────────────────────────────────────

  describe('Backwards compatibility: V2_0', () => {
    it('V2 route with V2_0: maxHopSlippage is dropped', () => {
      const v2Route = new V2RouteSDK([WETH_USDC_V2, USDC_DAI_V2], WETH, DAI)
      const trade = new RouterTrade({
        v2Routes: [
          {
            routev2: v2Route,
            inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
            outputAmount: CurrencyAmount.fromRawAmount(DAI, ONE_ETH),
            maxHopSlippage: [BigInt(500), BigInt(600)],
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_0 })).calldata
      )

      const v2Idx = commandTypes.indexOf(CommandType.V2_SWAP_EXACT_IN)
      expect(v2Idx).to.not.equal(-1)

      const decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'address[]', 'bool'], inputs[v2Idx])
      expect(decoded.length).to.equal(5)
    })

    it('V3 route with V2_0: maxHopSlippage is dropped', () => {
      const v3Route = new V3RouteSDK([WETH_USDC_V3, USDC_DAI_V3], WETH, DAI)
      const trade = new RouterTrade({
        v3Routes: [
          {
            routev3: v3Route,
            inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
            outputAmount: CurrencyAmount.fromRawAmount(DAI, ONE_ETH),
            maxHopSlippage: [BigInt(300), BigInt(400)],
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_0 })).calldata
      )

      const v3Idx = commandTypes.indexOf(CommandType.V3_SWAP_EXACT_IN)
      expect(v3Idx).to.not.equal(-1)

      const decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], inputs[v3Idx])
      expect(decoded.length).to.equal(5)
    })

    it('V3 exact output with V2_0: maxHopSlippage is dropped', () => {
      const v3Route = new V3RouteSDK([WETH_USDC_V3], WETH, USDC)
      const trade = new RouterTrade({
        v3Routes: [
          {
            routev3: v3Route,
            inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
            outputAmount: CurrencyAmount.fromRawAmount(USDC, ONE_USDC),
            maxHopSlippage: [BigInt(750)],
          },
        ],
        tradeType: TradeType.EXACT_OUTPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_0 })).calldata
      )

      const v3Idx = commandTypes.indexOf(CommandType.V3_SWAP_EXACT_OUT)
      expect(v3Idx).to.not.equal(-1)

      const decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], inputs[v3Idx])
      expect(decoded.length).to.equal(5)
    })

    it('mixed route with V2_0: maxHopSlippage is dropped from all sections', () => {
      const mixedRoute = new MixedRouteSDK([WETH_USDC_V3, USDC_DAI_V2], WETH, DAI)
      const trade = new RouterTrade({
        mixedRoutes: [
          {
            mixedRoute,
            inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
            outputAmount: CurrencyAmount.fromRawAmount(DAI, ONE_ETH),
            maxHopSlippage: [BigInt(100), BigInt(200)],
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_0 })).calldata
      )

      const v3Idx = commandTypes.indexOf(CommandType.V3_SWAP_EXACT_IN)
      const v2Idx = commandTypes.indexOf(CommandType.V2_SWAP_EXACT_IN)
      expect(v3Idx).to.not.equal(-1)
      expect(v2Idx).to.not.equal(-1)

      const v3Decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], inputs[v3Idx])
      expect(v3Decoded.length).to.equal(5)

      const v2Decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'address[]', 'bool'], inputs[v2Idx])
      expect(v2Decoded.length).to.equal(5)
    })

    it('default (no urVersion) drops maxHopSlippage — same as V2_0', () => {
      const v2Route = new V2RouteSDK([WETH_USDC_V2, USDC_DAI_V2], WETH, DAI)
      const trade = new RouterTrade({
        v2Routes: [
          {
            routev2: v2Route,
            inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
            outputAmount: CurrencyAmount.fromRawAmount(DAI, ONE_ETH),
            maxHopSlippage: [BigInt(500), BigInt(600)],
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { commandTypes, inputs } = parseCommands(SwapRouter.swapCallParameters(trade, swapOptions({})).calldata)

      const v2Idx = commandTypes.indexOf(CommandType.V2_SWAP_EXACT_IN)
      expect(v2Idx).to.not.equal(-1)

      const decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'address[]', 'bool'], inputs[v2Idx])
      expect(decoded.length).to.equal(5)
    })

    it('explicit V2_0 produces identical encoding to default (no urVersion)', () => {
      const planner1 = new RoutePlanner()
      planner1.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        RECIPIENT,
        utils.parseEther('1'),
        utils.parseEther('1'),
        [WETH.address, USDC.address],
        true,
      ])

      const planner2 = new RoutePlanner()
      planner2.addCommand(
        CommandType.V2_SWAP_EXACT_IN,
        [RECIPIENT, utils.parseEther('1'), utils.parseEther('1'), [WETH.address, USDC.address], true],
        false,
        URVersion.V2_0
      )

      expect(planner1.inputs[0]).to.equal(planner2.inputs[0])
      expect(planner1.commands).to.equal(planner2.commands)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 6. V2_1_1 without maxHopSlippage — should not break
  // ─────────────────────────────────────────────────────────────────────────

  describe('V2_1_1 without maxHopSlippage', () => {
    it('V2 route: encodes empty maxHopSlippage array', () => {
      const v2Route = new V2RouteSDK([WETH_USDC_V2, USDC_DAI_V2], WETH, DAI)
      const trade = new RouterTrade({
        v2Routes: [
          {
            routev2: v2Route,
            inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
            outputAmount: CurrencyAmount.fromRawAmount(DAI, ONE_ETH),
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_1_1 })).calldata
      )

      const v2Idx = commandTypes.indexOf(CommandType.V2_SWAP_EXACT_IN)
      expect(v2Idx).to.not.equal(-1)

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool', 'uint256[]'],
        inputs[v2Idx]
      )
      expect(decoded[5]).to.deep.equal([])
    })

    it('V3 route: encodes empty maxHopSlippage array', () => {
      const v3Route = new V3RouteSDK([WETH_USDC_V3, USDC_DAI_V3], WETH, DAI)
      const trade = new RouterTrade({
        v3Routes: [
          {
            routev3: v3Route,
            inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
            outputAmount: CurrencyAmount.fromRawAmount(DAI, ONE_ETH),
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_1_1 })).calldata
      )

      const v3Idx = commandTypes.indexOf(CommandType.V3_SWAP_EXACT_IN)
      expect(v3Idx).to.not.equal(-1)

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool', 'uint256[]'],
        inputs[v3Idx]
      )
      expect(decoded[5]).to.deep.equal([])
    })

    it('V4 route: encodes empty maxHopSlippage in V4 swap action', () => {
      const v4Route = new V4Route([WETH_USDC_V4], WETH, USDC)
      const v4Trade = V4Trade.createUncheckedTrade({
        route: v4Route,
        inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
        outputAmount: CurrencyAmount.fromRawAmount(USDC, ONE_USDC),
        tradeType: TradeType.EXACT_INPUT,
      })

      const trade = new RouterTrade({
        v4Routes: [{ routev4: v4Trade.route, inputAmount: v4Trade.inputAmount, outputAmount: v4Trade.outputAmount }],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_1_1 })).calldata
      )

      const v4Idx = commandTypes.indexOf(CommandType.V4_SWAP)
      expect(v4Idx).to.not.equal(-1)

      const parsed = V4BaseActionsParser.parseCalldata(inputs[v4Idx], URVersion.V2_1_1)
      const swapAction = parsed.actions.find((a) => a.actionName === 'SWAP_EXACT_IN')
      expect(swapAction).to.not.be.undefined
      const swapValue = swapAction!.params[0].value as any
      expect(swapValue.maxHopSlippage).to.deep.equal([])
    })

    it('mixed route: encodes empty arrays per section', () => {
      const mixedRoute = new MixedRouteSDK([WETH_USDC_V3, USDC_DAI_V2], WETH, DAI)
      const trade = new RouterTrade({
        mixedRoutes: [
          {
            mixedRoute,
            inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
            outputAmount: CurrencyAmount.fromRawAmount(DAI, ONE_ETH),
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { commandTypes, inputs } = parseCommands(
        SwapRouter.swapCallParameters(trade, swapOptions({ urVersion: URVersion.V2_1_1 })).calldata
      )

      const v3Idx = commandTypes.indexOf(CommandType.V3_SWAP_EXACT_IN)
      const v2Idx = commandTypes.indexOf(CommandType.V2_SWAP_EXACT_IN)

      const v3Decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool', 'uint256[]'],
        inputs[v3Idx]
      )
      expect(v3Decoded[5]).to.deep.equal([])

      const v2Decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool', 'uint256[]'],
        inputs[v2Idx]
      )
      expect(v2Decoded[5]).to.deep.equal([])
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Low-level encoding: RoutePlanner & createCommand
  // ─────────────────────────────────────────────────────────────────────────

  describe('Low-level encoding: RoutePlanner & createCommand', () => {
    const amount = utils.parseEther('1')
    const v3Path = '0x' + WETH.address.slice(2) + '000bb8' + USDC.address.slice(2)

    it('V2_1_1 RoutePlanner encodes V2_SWAP_EXACT_IN with 6 params', () => {
      const hopSlippage = ['1000', '2000']
      const planner = new RoutePlanner()
      planner.addCommand(
        CommandType.V2_SWAP_EXACT_IN,
        [RECIPIENT, amount, amount, [WETH.address, USDC.address], true, hopSlippage],
        false,
        URVersion.V2_1_1
      )

      expect(planner.inputs.length).to.equal(1)

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool', 'uint256[]'],
        planner.inputs[0]
      )
      expect(decoded[5].map((v: BigNumber) => v.toString())).to.deep.equal(hopSlippage)
    })

    it('V2_1_1 RoutePlanner encodes V3_SWAP_EXACT_IN with 6 params', () => {
      const hopSlippage = ['3000', '4000', '5000']
      const planner = new RoutePlanner()
      planner.addCommand(
        CommandType.V3_SWAP_EXACT_IN,
        [RECIPIENT, amount, amount, v3Path, true, hopSlippage],
        false,
        URVersion.V2_1_1
      )

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool', 'uint256[]'],
        planner.inputs[0]
      )
      expect(decoded[5].map((v: BigNumber) => v.toString())).to.deep.equal(hopSlippage)
    })

    it('V2_0 RoutePlanner encodes only 5 params (no maxHopSlippage)', () => {
      const planner = new RoutePlanner()
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [RECIPIENT, amount, amount, [WETH.address, USDC.address], true])

      const decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'address[]', 'bool'], planner.inputs[0])
      expect(decoded.length).to.equal(5)
    })

    it('createCommand with V2_1_1 uses extended ABI', () => {
      const hopSlippage = ['1000']
      const command = createCommand(
        CommandType.V2_SWAP_EXACT_IN,
        [RECIPIENT, amount, amount, [WETH.address, USDC.address], true, hopSlippage],
        URVersion.V2_1_1
      )

      expect(command.type).to.equal(CommandType.V2_SWAP_EXACT_IN)
      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool', 'uint256[]'],
        command.encodedInput
      )
      expect(decoded[5].map((v: BigNumber) => v.toString())).to.deep.equal(hopSlippage)
    })

    it('createCommand without urVersion uses base ABI (5 params)', () => {
      const command = createCommand(CommandType.V2_SWAP_EXACT_IN, [
        RECIPIENT,
        amount,
        amount,
        [WETH.address, USDC.address],
        true,
      ])

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool'],
        command.encodedInput
      )
      expect(decoded.length).to.equal(5)
    })

    it('non-swap commands are unaffected by V2_1_1', () => {
      const command = createCommand(CommandType.WRAP_ETH, [RECIPIENT, amount], URVersion.V2_1_1)

      const decoded = defaultAbiCoder.decode(['address', 'uint256'], command.encodedInput)
      expect(decoded.length).to.equal(2)
    })
  })
})
