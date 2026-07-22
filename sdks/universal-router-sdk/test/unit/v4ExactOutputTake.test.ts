import { expect } from 'chai'
import { BigNumber, utils } from 'ethers'
import { defaultAbiCoder } from 'ethers/lib/utils'
import { Trade as RouterTrade } from '@uniswap/router-sdk'
import { Route as V3Route, Trade as V3Trade } from '@uniswap/v3-sdk'
import { Route as V4Route, Trade as V4Trade, V4BaseActionsParser, V4Planner } from '@uniswap/v4-sdk'
import { CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core'
import { SwapRouter } from '../../src/swapRouter'
import { CommandType, RoutePlanner } from '../../src/utils/routerCommands'
import { CONTRACT_BALANCE, ETH_ADDRESS, ROUTER_AS_RECIPIENT, UniversalRouterVersion } from '../../src/utils/constants'
import { ETHER, WETH, USDC, makeV3Pool, makeV4Pool, parseCommands, swapOptions } from '../utils/uniswapData'
import { TEST_FEE_RECIPIENT_ADDRESS, TEST_RECIPIENT_ADDRESS } from '../utils/addresses'

const WETH_USDC_V3 = makeV3Pool(WETH, USDC)
const WETH_USDC_V4 = makeV4Pool(WETH, USDC)
const ETH_USDC_V4 = makeV4Pool(ETHER, USDC)

const ONE_ETH = utils.parseEther('1').toString()
const ONE_USDC = utils.parseUnits('1', 6).toString()

function buildV4RouterTrade(v4Trade: V4Trade<any, any, TradeType>, tradeType: TradeType) {
  return new RouterTrade({
    v4Routes: [
      {
        routev4: v4Trade.route,
        inputAmount: v4Trade.inputAmount,
        outputAmount: v4Trade.outputAmount,
      },
    ],
    tradeType,
  })
}

function getV4Actions(calldata: string) {
  const { commandTypes, inputs } = parseCommands(calldata)
  const v4Idx = commandTypes.indexOf(CommandType.V4_SWAP)
  expect(v4Idx).to.not.equal(-1)
  return V4BaseActionsParser.parseCalldata(inputs[v4Idx]).actions
}

function getAction(actions: ReturnType<typeof getV4Actions>, actionName: string) {
  const action = actions.find((a) => a.actionName === actionName)
  expect(action, `expected ${actionName} action`).to.not.be.undefined
  return action!
}

function getParam(action: ReturnType<typeof getAction>, paramName: string) {
  const param = action.params.find((p) => p.name === paramName)
  expect(param, `expected ${paramName} param`).to.not.be.undefined
  return param!.value
}

function expectTake(actions: ReturnType<typeof getV4Actions>, currency: string, recipient: string, amount: string) {
  const take = getAction(actions, 'TAKE')
  expect((getParam(take, 'currency') as string).toLowerCase()).to.equal(currency.toLowerCase())
  expect((getParam(take, 'recipient') as string).toLowerCase()).to.equal(recipient.toLowerCase())
  expect((getParam(take, 'amount') as BigNumber).toString()).to.equal(amount)
}

describe('V4 exact output TAKE floors', () => {
  it('single-route V4 exact output TAKE amount equals the encoded amountOut', () => {
    const v4Trade = V4Trade.createUncheckedTrade({
      route: new V4Route([WETH_USDC_V4], WETH, USDC),
      inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
      outputAmount: CurrencyAmount.fromRawAmount(USDC, ONE_USDC),
      tradeType: TradeType.EXACT_OUTPUT,
    })

    const methodParameters = SwapRouter.swapCallParameters(buildV4RouterTrade(v4Trade, TradeType.EXACT_OUTPUT), {
      ...swapOptions({}),
      recipient: TEST_RECIPIENT_ADDRESS,
    })
    const actions = getV4Actions(methodParameters.calldata)
    const swap = getParam(getAction(actions, 'SWAP_EXACT_OUT'), 'swap') as any

    expect(swap.amountOut.toString()).to.equal(ONE_USDC)
    expectTake(actions, USDC.address, TEST_RECIPIENT_ADDRESS, ONE_USDC)
  })

  it('split V3+V4 exact output with native ETH input floors the V4 leg TAKE', () => {
    const v3Trade = V3Trade.createUncheckedTrade({
      route: new V3Route([WETH_USDC_V3], ETHER, USDC),
      inputAmount: CurrencyAmount.fromRawAmount(ETHER, ONE_ETH),
      outputAmount: CurrencyAmount.fromRawAmount(USDC, ONE_USDC),
      tradeType: TradeType.EXACT_OUTPUT,
    })
    const v4Trade = V4Trade.createUncheckedTrade({
      route: new V4Route([WETH_USDC_V4], ETHER, USDC),
      inputAmount: CurrencyAmount.fromRawAmount(ETHER, ONE_ETH),
      outputAmount: CurrencyAmount.fromRawAmount(USDC, ONE_USDC),
      tradeType: TradeType.EXACT_OUTPUT,
    })
    const trade = new RouterTrade({
      v3Routes: [
        {
          routev3: v3Trade.route,
          inputAmount: v3Trade.inputAmount,
          outputAmount: v3Trade.outputAmount,
        },
      ],
      v4Routes: [
        {
          routev4: v4Trade.route,
          inputAmount: v4Trade.inputAmount,
          outputAmount: v4Trade.outputAmount,
        },
      ],
      tradeType: TradeType.EXACT_OUTPUT,
    })

    const methodParameters = SwapRouter.swapCallParameters(trade, swapOptions({}))
    const { commandTypes } = parseCommands(methodParameters.calldata)

    expect(commandTypes).to.deep.equal([
      CommandType.WRAP_ETH,
      CommandType.V3_SWAP_EXACT_OUT,
      CommandType.V4_SWAP,
      CommandType.UNWRAP_WETH,
    ])
    expectTake(getV4Actions(methodParameters.calldata), USDC.address, TEST_RECIPIENT_ADDRESS, ONE_USDC)
  })

  it('exact output with a fee floors TAKE to the router and leaves aggregate SWEEP minimum unchanged', () => {
    const v4Trade = V4Trade.createUncheckedTrade({
      route: new V4Route([WETH_USDC_V4], WETH, USDC),
      inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
      outputAmount: CurrencyAmount.fromRawAmount(USDC, ONE_USDC),
      tradeType: TradeType.EXACT_OUTPUT,
    })
    const fee = new Percent(5, 100)
    const methodParameters = SwapRouter.swapCallParameters(buildV4RouterTrade(v4Trade, TradeType.EXACT_OUTPUT), {
      ...swapOptions({ fee: { fee, recipient: TEST_FEE_RECIPIENT_ADDRESS } }),
      recipient: TEST_RECIPIENT_ADDRESS,
    })
    const { commandTypes, inputs } = parseCommands(methodParameters.calldata)
    const sweepIdx = commandTypes.indexOf(CommandType.SWEEP)
    expect(sweepIdx).to.not.equal(-1)
    const sweep = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[sweepIdx])

    expectTake(getV4Actions(methodParameters.calldata), USDC.address, ROUTER_AS_RECIPIENT, ONE_USDC)
    expect(sweep[0].toLowerCase()).to.equal(USDC.address.toLowerCase())
    expect(sweep[1].toLowerCase()).to.equal(TEST_RECIPIENT_ADDRESS.toLowerCase())
    expect((sweep[2] as BigNumber).toString()).to.equal(BigNumber.from(ONE_USDC).mul(95).div(100).toString())
  })

  it('exact output ETH-to-WETH output wrap transition floors TAKE before WRAP_ETH(CONTRACT_BALANCE)', () => {
    const v4Trade = V4Trade.createUncheckedTrade({
      route: new V4Route([ETH_USDC_V4], USDC, WETH),
      inputAmount: CurrencyAmount.fromRawAmount(USDC, ONE_USDC),
      outputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
      tradeType: TradeType.EXACT_OUTPUT,
    })
    const methodParameters = SwapRouter.swapCallParameters(buildV4RouterTrade(v4Trade, TradeType.EXACT_OUTPUT), {
      ...swapOptions({}),
      recipient: TEST_RECIPIENT_ADDRESS,
    })
    const { commandTypes, inputs } = parseCommands(methodParameters.calldata)
    const wrapIdx = commandTypes.indexOf(CommandType.WRAP_ETH)
    expect(wrapIdx).to.not.equal(-1)
    const wrap = defaultAbiCoder.decode(['address', 'uint256'], inputs[wrapIdx])

    expectTake(getV4Actions(methodParameters.calldata), ETH_ADDRESS, ROUTER_AS_RECIPIENT, ONE_ETH)
    expect(wrap[0].toLowerCase()).to.equal(TEST_RECIPIENT_ADDRESS.toLowerCase())
    expect((wrap[1] as BigNumber).toString()).to.equal(CONTRACT_BALANCE.toString())
  })

  it('exact input V4 encoding remains byte-identical to OPEN_DELTA TAKE encoding', () => {
    const v4Trade = V4Trade.createUncheckedTrade({
      route: new V4Route([WETH_USDC_V4], WETH, USDC),
      inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
      outputAmount: CurrencyAmount.fromRawAmount(USDC, ONE_USDC),
      tradeType: TradeType.EXACT_INPUT,
    })
    const opts = swapOptions({ urVersion: UniversalRouterVersion.V2_0 })
    const methodParameters = SwapRouter.swapCallParameters(buildV4RouterTrade(v4Trade, TradeType.EXACT_INPUT), opts)
    const { commandTypes, inputs } = parseCommands(methodParameters.calldata)
    const v4Idx = commandTypes.indexOf(CommandType.V4_SWAP)

    const v4Planner = new V4Planner()
    v4Planner.addTrade(v4Trade, opts.slippageTolerance)
    v4Planner.addSettle(v4Trade.route.pathInput, true)
    v4Planner.addTake(v4Trade.route.pathOutput, TEST_RECIPIENT_ADDRESS)
    const planner = new RoutePlanner()
    planner.addCommand(CommandType.V4_SWAP, [v4Planner.finalize()])

    expect(inputs[v4Idx]).to.equal(planner.inputs[0])
    expectTake(getV4Actions(methodParameters.calldata), USDC.address, TEST_RECIPIENT_ADDRESS, '0')
  })

  it('rejects zero exact output amounts before encoding a zero-sentinel TAKE', () => {
    const v4Trade = V4Trade.createUncheckedTrade({
      route: new V4Route([WETH_USDC_V4], WETH, USDC),
      inputAmount: CurrencyAmount.fromRawAmount(WETH, ONE_ETH),
      outputAmount: CurrencyAmount.fromRawAmount(USDC, 0),
      tradeType: TradeType.EXACT_OUTPUT,
    })

    expect(() =>
      SwapRouter.swapCallParameters(buildV4RouterTrade(v4Trade, TradeType.EXACT_OUTPUT), swapOptions({}))
    ).to.throw('ZERO_EXACT_OUTPUT_AMOUNT')
  })
})
