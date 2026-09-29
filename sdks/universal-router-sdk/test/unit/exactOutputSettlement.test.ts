import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { defaultAbiCoder } from 'ethers/lib/utils'
import { Trade as RouterTrade } from '@uniswap/router-sdk'
import { Pair, Route as V2RouteSDK } from '@uniswap/v2-sdk'
import { Route as V3RouteSDK } from '@uniswap/v3-sdk'
import { Route as V4RouteSDK } from '@uniswap/v4-sdk'
import { CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core'
import { SwapRouter } from '../../src/swapRouter'
import { CommandType } from '../../src/utils/routerCommands'
import { ROUTER_AS_RECIPIENT, UniversalRouterVersion } from '../../src/utils/constants'
import { ETHER, WETH, USDC, DAI, makeV3Pool, makeV4Pool, parseCommands, swapOptions } from '../utils/uniswapData'

// v2SwapExactOutput has no on-chain output check, so V2 exact-out legs must settle through router
// custody with a SWEEP floored at amountOut. V3/V4-only exact-output keeps the direct-recipient
// shape. Custodied legs carry no per-leg minimum, so the settlement SWEEP must always be floored,
// including when the output is wrapped first.

const USDC_DAI_V2 = new Pair(
  CurrencyAmount.fromRawAmount(USDC, '1000000000000'),
  CurrencyAmount.fromRawAmount(DAI, '1000000000000000000000000')
)
const USDC_DAI_V3 = makeV3Pool(USDC, DAI)
const ETH_USDC_V4 = makeV4Pool(ETHER, USDC)

const THOUSAND_USDC = '1000000000'
const THOUSAND_DAI = '1000000000000000000000'
const ONE_ETH = '1000000000000000000'
const RECIPIENT = '0x0000000000000000000000000000000000000001'
const SLIPPAGE = new Percent(5, 100)

// V2_0 layouts; V2_1_1+ appends a uint256[] minHopPriceX36 to the swap commands
const V2_SWAP_ABI = ['address', 'uint256', 'uint256', 'address[]', 'bool']
const V3_SWAP_ABI = ['address', 'uint256', 'uint256', 'bytes', 'bool']
const WRAP_ETH_ABI = ['address', 'uint256']
const SWEEP_ABI = ['address', 'address', 'uint256']

function v2Leg(amountIn: string, amountOut: string) {
  return {
    routev2: new V2RouteSDK([USDC_DAI_V2], USDC, DAI),
    inputAmount: CurrencyAmount.fromRawAmount(USDC, amountIn),
    outputAmount: CurrencyAmount.fromRawAmount(DAI, amountOut),
  }
}

function v3Leg(amountIn: string, amountOut: string) {
  return {
    routev3: new V3RouteSDK([USDC_DAI_V3], USDC, DAI),
    inputAmount: CurrencyAmount.fromRawAmount(USDC, amountIn),
    outputAmount: CurrencyAmount.fromRawAmount(DAI, amountOut),
  }
}

// USDC -> native ETH pool with WETH as the trade output, so the SDK wraps after the swap.
function v4NativeToWethLeg(amountIn: string, amountOut: string) {
  return {
    routev4: new V4RouteSDK([ETH_USDC_V4], USDC, WETH),
    inputAmount: CurrencyAmount.fromRawAmount(USDC, amountIn),
    outputAmount: CurrencyAmount.fromRawAmount(WETH, amountOut),
  }
}

function encode(trade: RouterTrade<any, any, TradeType>) {
  const { calldata } = SwapRouter.swapCallParameters(
    trade,
    swapOptions({ recipient: RECIPIENT, slippageTolerance: SLIPPAGE, urVersion: UniversalRouterVersion.V2_0 })
  )
  return parseCommands(calldata)
}

function decodeSingle(inputs: string[], commandTypes: number[], command: CommandType, abi: string[]) {
  const idx = commandTypes.indexOf(command)
  expect(idx, `expected command ${command}`).to.not.equal(-1)
  return defaultAbiCoder.decode(abi, inputs[idx])
}

function expectSweep(inputs: string[], commandTypes: number[], token: string, recipient: string, minimum: string) {
  const sweep = decodeSingle(inputs, commandTypes, CommandType.SWEEP, SWEEP_ABI)
  expect(sweep[0].toLowerCase()).to.equal(token.toLowerCase())
  expect(sweep[1].toLowerCase()).to.equal(recipient.toLowerCase())
  expect((sweep[2] as BigNumber).toString()).to.equal(minimum)
}

describe('Exact output settlement', () => {
  it('routes a V2 exact-out swap through the router and floors the SWEEP at amountOut', () => {
    const trade = new RouterTrade({
      v2Routes: [v2Leg(THOUSAND_USDC, THOUSAND_DAI)],
      tradeType: TradeType.EXACT_OUTPUT,
    })
    const { commandTypes, inputs } = encode(trade)

    const swap = decodeSingle(inputs, commandTypes, CommandType.V2_SWAP_EXACT_OUT, V2_SWAP_ABI)
    expect(swap[0].toLowerCase()).to.equal(ROUTER_AS_RECIPIENT.toLowerCase())
    expect((swap[1] as BigNumber).toString()).to.equal(THOUSAND_DAI)

    expect(commandTypes[commandTypes.length - 1]).to.equal(CommandType.SWEEP)
    expectSweep(inputs, commandTypes, DAI.address, RECIPIENT, THOUSAND_DAI)
  })

  it('custodies every leg of a split exact-out containing a V2 leg and floors the SWEEP at the total', () => {
    const trade = new RouterTrade({
      v2Routes: [v2Leg('600000000', '600000000000000000000')],
      v3Routes: [v3Leg('400000000', '400000000000000000000')],
      tradeType: TradeType.EXACT_OUTPUT,
    })
    const { commandTypes, inputs } = encode(trade)

    const v2 = decodeSingle(inputs, commandTypes, CommandType.V2_SWAP_EXACT_OUT, V2_SWAP_ABI)
    const v3 = decodeSingle(inputs, commandTypes, CommandType.V3_SWAP_EXACT_OUT, V3_SWAP_ABI)
    expect(v2[0].toLowerCase()).to.equal(ROUTER_AS_RECIPIENT.toLowerCase())
    expect(v3[0].toLowerCase()).to.equal(ROUTER_AS_RECIPIENT.toLowerCase())

    expectSweep(inputs, commandTypes, DAI.address, RECIPIENT, THOUSAND_DAI)
  })

  it('wraps into the router and floors the SWEEP at amountOut for an exact-out whose output must be wrapped', () => {
    const trade = new RouterTrade({
      v4Routes: [v4NativeToWethLeg(THOUSAND_USDC, ONE_ETH)],
      tradeType: TradeType.EXACT_OUTPUT,
    })
    const { commandTypes, inputs } = encode(trade)

    const wrap = decodeSingle(inputs, commandTypes, CommandType.WRAP_ETH, WRAP_ETH_ABI)
    expect(wrap[0].toLowerCase()).to.equal(ROUTER_AS_RECIPIENT.toLowerCase())
    expect(commandTypes.indexOf(CommandType.WRAP_ETH)).to.be.lessThan(commandTypes.indexOf(CommandType.SWEEP))

    expectSweep(inputs, commandTypes, WETH.address, RECIPIENT, ONE_ETH)
  })

  it('floors the SWEEP at the slippage minimum for an exact-in whose output must be wrapped', () => {
    const trade = new RouterTrade({
      v4Routes: [v4NativeToWethLeg(THOUSAND_USDC, ONE_ETH)],
      tradeType: TradeType.EXACT_INPUT,
    })
    const { commandTypes, inputs } = encode(trade)

    const wrap = decodeSingle(inputs, commandTypes, CommandType.WRAP_ETH, WRAP_ETH_ABI)
    expect(wrap[0].toLowerCase()).to.equal(ROUTER_AS_RECIPIENT.toLowerCase())

    // 5% slippage on 1 ETH; previously the custodied leg had amountOutMinimum 0 and WRAP_ETH had no floor
    expectSweep(inputs, commandTypes, WETH.address, RECIPIENT, '950000000000000000')
  })

  it('leaves a V3-only exact-out swap direct to the recipient with no SWEEP', () => {
    const trade = new RouterTrade({
      v3Routes: [v3Leg(THOUSAND_USDC, THOUSAND_DAI)],
      tradeType: TradeType.EXACT_OUTPUT,
    })
    const { commandTypes, inputs } = encode(trade)

    const swap = decodeSingle(inputs, commandTypes, CommandType.V3_SWAP_EXACT_OUT, V3_SWAP_ABI)
    expect(swap[0].toLowerCase()).to.equal(RECIPIENT.toLowerCase())
    expect(commandTypes).to.not.include(CommandType.SWEEP)
  })

  it('leaves a V2 exact-in swap direct to the recipient with its own amountOutMin', () => {
    const trade = new RouterTrade({
      v2Routes: [v2Leg(THOUSAND_USDC, THOUSAND_DAI)],
      tradeType: TradeType.EXACT_INPUT,
    })
    const { commandTypes, inputs } = encode(trade)

    const swap = decodeSingle(inputs, commandTypes, CommandType.V2_SWAP_EXACT_IN, V2_SWAP_ABI)
    expect(swap[0].toLowerCase()).to.equal(RECIPIENT.toLowerCase())
    expect((swap[2] as BigNumber).isZero()).to.equal(false)
    expect(commandTypes).to.not.include(CommandType.SWEEP)
  })
})
