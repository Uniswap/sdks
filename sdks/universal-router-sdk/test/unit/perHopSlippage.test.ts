// Patch the published @uniswap/v4-sdk URVersion enum to include V2_1_1
// (not yet in the npm release). Must use require() so it runs before the
// ES-style imports which are hoisted by the TypeScript compiler.
/* eslint-disable @typescript-eslint/no-var-requires */
const { expect } = require('chai')
const { BigNumber, utils } = require('ethers')
const { defaultAbiCoder } = require('ethers/lib/utils')

const v4sdk = require('@uniswap/v4-sdk')
if (!v4sdk.URVersion.V2_1_1) {
  v4sdk.URVersion['V2_1_1'] = '2.1.1'
}
const URVersion = v4sdk.URVersion as { V2_0: string; V2_1_1: string }

const { RoutePlanner, CommandType, createCommand } = require('../../src/utils/routerCommands')
const JSBI = require('jsbi')
const { Trade: RouterTrade, MixedRouteSDK } = require('@uniswap/router-sdk')
const {
  Pool: V3Pool,
  FeeAmount,
  encodeSqrtRatioX96: v3EncodeSqrtRatioX96,
  nearestUsableTick,
  TickMath,
  TICK_SPACINGS,
} = require('@uniswap/v3-sdk')
const { Pair } = require('@uniswap/v2-sdk')
const { Token, CurrencyAmount, TradeType, Percent } = require('@uniswap/sdk-core')
const { SwapRouter } = require('../../src/swapRouter')

const addressOne = '0x0000000000000000000000000000000000000001'
const addressTwo = '0x0000000000000000000000000000000000000002'
const amount = utils.parseEther('1')

describe('Per-Hop Slippage', () => {
  describe('RoutePlanner: V2/V3 command encoding with V2.1.1 ABI', () => {
    it('encodes V2_SWAP_EXACT_IN with maxHopSlippage when urVersion is V2_1_1', () => {
      const hopSlippage = ['1000', '2000']
      const planner = new RoutePlanner()
      planner.addCommand(
        CommandType.V2_SWAP_EXACT_IN,
        [addressOne, amount, amount, [addressOne, addressTwo], true, hopSlippage],
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

    it('encodes V2_SWAP_EXACT_OUT with maxHopSlippage when urVersion is V2_1_1', () => {
      const hopSlippage = ['500']
      const planner = new RoutePlanner()
      planner.addCommand(
        CommandType.V2_SWAP_EXACT_OUT,
        [addressOne, amount, amount, [addressOne, addressTwo], true, hopSlippage],
        false,
        URVersion.V2_1_1
      )

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool', 'uint256[]'],
        planner.inputs[0]
      )
      expect(decoded[5].map((v: BigNumber) => v.toString())).to.deep.equal(hopSlippage)
    })

    it('encodes V3_SWAP_EXACT_IN with maxHopSlippage when urVersion is V2_1_1', () => {
      const hopSlippage = ['3000', '4000', '5000']
      const path = '0x' + addressOne.slice(2) + '000bb8' + addressTwo.slice(2)
      const planner = new RoutePlanner()
      planner.addCommand(
        CommandType.V3_SWAP_EXACT_IN,
        [addressOne, amount, amount, path, true, hopSlippage],
        false,
        URVersion.V2_1_1
      )

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool', 'uint256[]'],
        planner.inputs[0]
      )
      expect(decoded[5].map((v: BigNumber) => v.toString())).to.deep.equal(hopSlippage)
    })

    it('encodes V3_SWAP_EXACT_OUT with maxHopSlippage when urVersion is V2_1_1', () => {
      const hopSlippage = ['100']
      const path = '0x' + addressTwo.slice(2) + '000bb8' + addressOne.slice(2)
      const planner = new RoutePlanner()
      planner.addCommand(
        CommandType.V3_SWAP_EXACT_OUT,
        [addressOne, amount, amount, path, true, hopSlippage],
        false,
        URVersion.V2_1_1
      )

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool', 'uint256[]'],
        planner.inputs[0]
      )
      expect(decoded[5].map((v: BigNumber) => v.toString())).to.deep.equal(hopSlippage)
    })

    it('encodes V2_SWAP_EXACT_IN with empty maxHopSlippage array', () => {
      const planner = new RoutePlanner()
      planner.addCommand(
        CommandType.V2_SWAP_EXACT_IN,
        [addressOne, amount, amount, [addressOne, addressTwo], true, []],
        false,
        URVersion.V2_1_1
      )

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool', 'uint256[]'],
        planner.inputs[0]
      )
      expect(decoded[5]).to.deep.equal([])
    })

    it('encodes V2_SWAP_EXACT_IN WITHOUT maxHopSlippage when urVersion is V2_0', () => {
      const planner = new RoutePlanner()
      planner.addCommand(
        CommandType.V2_SWAP_EXACT_IN,
        [addressOne, amount, amount, [addressOne, addressTwo], true]
      )

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool'],
        planner.inputs[0]
      )
      expect(decoded.length).to.equal(5)
    })
  })

  describe('createCommand: ABI selection based on urVersion', () => {
    it('uses V2.1.1 ABI for V2 swap commands when urVersion is V2_1_1', () => {
      const hopSlippage = ['1000']
      const command = createCommand(
        CommandType.V2_SWAP_EXACT_IN,
        [addressOne, amount, amount, [addressOne, addressTwo], true, hopSlippage],
        URVersion.V2_1_1
      )

      expect(command.type).to.equal(CommandType.V2_SWAP_EXACT_IN)
      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool', 'uint256[]'],
        command.encodedInput
      )
      expect(decoded[5].map((v: BigNumber) => v.toString())).to.deep.equal(hopSlippage)
    })

    it('uses V2.1.1 ABI for V3 swap commands when urVersion is V2_1_1', () => {
      const hopSlippage = ['2000', '3000']
      const path = '0x' + addressOne.slice(2) + '000bb8' + addressTwo.slice(2)
      const command = createCommand(
        CommandType.V3_SWAP_EXACT_IN,
        [addressOne, amount, amount, path, true, hopSlippage],
        URVersion.V2_1_1
      )

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool', 'uint256[]'],
        command.encodedInput
      )
      expect(decoded[5].map((v: BigNumber) => v.toString())).to.deep.equal(hopSlippage)
    })

    it('uses V2.0 ABI for V2 swap commands when urVersion is undefined', () => {
      const command = createCommand(CommandType.V2_SWAP_EXACT_IN, [
        addressOne,
        amount,
        amount,
        [addressOne, addressTwo],
        true,
      ])

      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool'],
        command.encodedInput
      )
      expect(decoded.length).to.equal(5)
    })

    it('uses V2.0 ABI for non-swap commands even when urVersion is V2_1_1', () => {
      const command = createCommand(
        CommandType.WRAP_ETH,
        [addressOne, amount],
        URVersion.V2_1_1
      )

      const decoded = defaultAbiCoder.decode(['address', 'uint256'], command.encodedInput)
      expect(decoded.length).to.equal(2)
    })
  })

  describe('Backwards compatibility: V2.0 never uses V2.1.1 ABIs', () => {
    const v3Path = '0x' + addressOne.slice(2) + '000bb8' + addressTwo.slice(2)

    it('V2_SWAP_EXACT_IN with explicit V2_0 encodes 5 params (no maxHopSlippage)', () => {
      const planner = new RoutePlanner()
      planner.addCommand(
        CommandType.V2_SWAP_EXACT_IN,
        [addressOne, amount, amount, [addressOne, addressTwo], true],
        false,
        URVersion.V2_0
      )
      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool'],
        planner.inputs[0]
      )
      expect(decoded.length).to.equal(5)
    })

    it('V2_SWAP_EXACT_OUT with explicit V2_0 encodes 5 params (no maxHopSlippage)', () => {
      const planner = new RoutePlanner()
      planner.addCommand(
        CommandType.V2_SWAP_EXACT_OUT,
        [addressOne, amount, amount, [addressOne, addressTwo], true],
        false,
        URVersion.V2_0
      )
      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool'],
        planner.inputs[0]
      )
      expect(decoded.length).to.equal(5)
    })

    it('V3_SWAP_EXACT_IN with explicit V2_0 encodes 5 params (no maxHopSlippage)', () => {
      const planner = new RoutePlanner()
      planner.addCommand(
        CommandType.V3_SWAP_EXACT_IN,
        [addressOne, amount, amount, v3Path, true],
        false,
        URVersion.V2_0
      )
      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool'],
        planner.inputs[0]
      )
      expect(decoded.length).to.equal(5)
    })

    it('V3_SWAP_EXACT_OUT with explicit V2_0 encodes 5 params (no maxHopSlippage)', () => {
      const planner = new RoutePlanner()
      planner.addCommand(
        CommandType.V3_SWAP_EXACT_OUT,
        [addressOne, amount, amount, v3Path, true],
        false,
        URVersion.V2_0
      )
      const decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool'],
        planner.inputs[0]
      )
      expect(decoded.length).to.equal(5)
    })

    it('explicit V2_0 produces identical encoding to default (no urVersion)', () => {
      const plannerDefault = new RoutePlanner()
      plannerDefault.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        addressOne,
        amount,
        amount,
        [addressOne, addressTwo],
        true,
      ])

      const plannerExplicit = new RoutePlanner()
      plannerExplicit.addCommand(
        CommandType.V2_SWAP_EXACT_IN,
        [addressOne, amount, amount, [addressOne, addressTwo], true],
        false,
        URVersion.V2_0
      )

      expect(plannerDefault.inputs[0]).to.equal(plannerExplicit.inputs[0])
      expect(plannerDefault.commands).to.equal(plannerExplicit.commands)
    })
  })

  describe('Mixed route slippage slicing', () => {
    const WETH_TOKEN = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WETH')
    const USDC_TOKEN = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC')
    const DAI_TOKEN = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI')

    const V3_LIQUIDITY = JSBI.BigInt('1000000')
    const V3_TICK_SPACING = TICK_SPACINGS[FeeAmount.MEDIUM]
    const V3_TICK_LIST = [
      {
        index: nearestUsableTick(TickMath.MIN_TICK, V3_TICK_SPACING),
        liquidityNet: V3_LIQUIDITY,
        liquidityGross: V3_LIQUIDITY,
      },
      {
        index: nearestUsableTick(TickMath.MAX_TICK, V3_TICK_SPACING),
        liquidityNet: JSBI.multiply(V3_LIQUIDITY, JSBI.BigInt('-1')),
        liquidityGross: V3_LIQUIDITY,
      },
    ]
    const WETH_USDC_V3 = new V3Pool(
      WETH_TOKEN,
      USDC_TOKEN,
      FeeAmount.MEDIUM,
      v3EncodeSqrtRatioX96(1, 1),
      V3_LIQUIDITY,
      0,
      V3_TICK_LIST
    )
    const USDC_DAI_V2 = new Pair(
      CurrencyAmount.fromRawAmount(USDC_TOKEN, '1000000000000'),
      CurrencyAmount.fromRawAmount(DAI_TOKEN, '1000000000000000000000000')
    )

    function parseCommands(calldata: string): { commandTypes: number[]; inputs: string[] } {
      const decoded = SwapRouter.INTERFACE.decodeFunctionData('execute(bytes,bytes[])', calldata)
      const commands = decoded[0] as string
      const inputs = decoded[1] as string[]
      const cmdHex = commands.slice(2)
      const commandTypes: number[] = []
      for (let j = 0; j < cmdHex.length; j += 2) {
        commandTypes.push(parseInt(cmdHex.slice(j, j + 2), 16) & 0x3f)
      }
      return { commandTypes, inputs }
    }

    it('correctly slices maxHopSlippage across V3 and V2 sections', () => {
      // Route: V3(WETH->USDC) -> V2(USDC->DAI) = 2 pools
      // partitionMixedRouteByProtocol splits into: [[V3Pool]], [[V2Pair]]
      // maxHopSlippage[0]=100 → V3 section, maxHopSlippage[1]=200 → V2 section
      const mixedRoute = new MixedRouteSDK([WETH_USDC_V3, USDC_DAI_V2], WETH_TOKEN, DAI_TOKEN)
      const inputAmt = CurrencyAmount.fromRawAmount(WETH_TOKEN, '1000000000000000000')
      const outputAmt = CurrencyAmount.fromRawAmount(DAI_TOKEN, '1000000000000000000')

      const trade = new RouterTrade({
        mixedRoutes: [{ mixedRoute, inputAmount: inputAmt, outputAmount: outputAmt }],
        tradeType: TradeType.EXACT_INPUT,
      })
      // Patch maxHopSlippage onto the swap (not yet in the published @uniswap/router-sdk npm package)
      trade.swaps[0].maxHopSlippage = [BigInt(100), BigInt(200)]

      const methodParameters = SwapRouter.swapCallParameters(trade, {
        slippageTolerance: new Percent(5, 100),
        recipient: addressOne,
        urVersion: URVersion.V2_1_1,
      })

      const { commandTypes, inputs } = parseCommands(methodParameters.calldata)

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

    it('mixed route with V2.0 does not include maxHopSlippage in any section', () => {
      const mixedRoute = new MixedRouteSDK([WETH_USDC_V3, USDC_DAI_V2], WETH_TOKEN, DAI_TOKEN)
      const inputAmt = CurrencyAmount.fromRawAmount(WETH_TOKEN, '1000000000000000000')
      const outputAmt = CurrencyAmount.fromRawAmount(DAI_TOKEN, '1000000000000000000')

      const trade = new RouterTrade({
        mixedRoutes: [
          {
            mixedRoute: mixedRoute,
            inputAmount: inputAmt,
            outputAmount: outputAmt,
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })

      const methodParameters = SwapRouter.swapCallParameters(trade, {
        slippageTolerance: new Percent(5, 100),
        recipient: addressOne,
      })

      const { commandTypes, inputs } = parseCommands(methodParameters.calldata)

      const v3Idx = commandTypes.indexOf(CommandType.V3_SWAP_EXACT_IN)
      const v2Idx = commandTypes.indexOf(CommandType.V2_SWAP_EXACT_IN)
      expect(v3Idx).to.not.equal(-1)
      expect(v2Idx).to.not.equal(-1)

      // V2.0 ABI: 5 params, no maxHopSlippage
      const v3Decoded = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], inputs[v3Idx])
      expect(v3Decoded.length).to.equal(5)

      const v2Decoded = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool'],
        inputs[v2Idx]
      )
      expect(v2Decoded.length).to.equal(5)
    })

    it('mixed route with empty maxHopSlippage encodes empty arrays per section', () => {
      const mixedRoute = new MixedRouteSDK([WETH_USDC_V3, USDC_DAI_V2], WETH_TOKEN, DAI_TOKEN)
      const inputAmt = CurrencyAmount.fromRawAmount(WETH_TOKEN, '1000000000000000000')
      const outputAmt = CurrencyAmount.fromRawAmount(DAI_TOKEN, '1000000000000000000')

      const trade = new RouterTrade({
        mixedRoutes: [
          {
            mixedRoute: mixedRoute,
            inputAmount: inputAmt,
            outputAmount: outputAmt,
            maxHopSlippage: undefined,
          },
        ],
        tradeType: TradeType.EXACT_INPUT,
      })

      const methodParameters = SwapRouter.swapCallParameters(trade, {
        slippageTolerance: new Percent(5, 100),
        recipient: addressOne,
        urVersion: URVersion.V2_1_1,
      })

      const { commandTypes, inputs } = parseCommands(methodParameters.calldata)

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
})
