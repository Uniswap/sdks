import { expect } from 'chai'
import { BigNumber, utils } from 'ethers'
import { Trade as RouterTrade, MixedRouteSDK } from '@uniswap/router-sdk'
import { Pool as V4Pool, Route as V4Route, Trade as V4Trade, V4BaseActionsParser } from '@uniswap/v4-sdk'
import { Currency, CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core'
import { encodeSqrtRatioX96 } from '@uniswap/v3-sdk'
import { SwapRouter } from '../../src/swapRouter'
import { CommandType } from '../../src/utils/routerCommands'
import { CONTRACT_BALANCE, ETH_ADDRESS, ROUTER_AS_RECIPIENT, SENDER_AS_RECIPIENT } from '../../src/utils/constants'
import { ETHER, USDC, makeV3Pool, makeV4Pool, parseCommands, swapOptions } from '../utils/uniswapData'
import { TEST_FEE_RECIPIENT_ADDRESS, TEST_RECIPIENT_ADDRESS } from '../utils/addresses'

// The Monad SPYx ERC-4626 wrapper hook and its vault-share token, in their EIP-55 casing.
const WRAPPER_HOOK = '0xcb1Baa4592cb90BD2FE3Ca540ABe95983168A888'
const SPYX = new Token(1, '0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48', 18, 'SPYx', 'SPYx')
const WSPYX = new Token(1, '0xE7E553Cd128F0011777323A0b44a7b96EA1CB540', 18, 'wSPYx', 'wSPYx')
const OTHER_HOOK = '0x0000000000000000000000000000000000000888'

const ONE_SPYX = utils.parseEther('1').toString()
const ONE_WSPYX = utils.parseEther('0.99').toString()
const ONE_USDC = utils.parseUnits('700', 6).toString()

function makeHookedV4Pool(tokenA: Currency, tokenB: Currency, hooks: string): V4Pool {
  return new V4Pool(tokenA, tokenB, 0, 60, hooks, encodeSqrtRatioX96(1, 1), 0, 0)
}

const WRAP_POOL = makeHookedV4Pool(SPYX, WSPYX, WRAPPER_HOOK)
const WSPYX_USDC = makeV4Pool(WSPYX, USDC)
const SPYX_USDC = makeV4Pool(SPYX, USDC)
const ETH_SPYX_HOOKED = makeHookedV4Pool(ETHER, SPYX, WRAPPER_HOOK)
// a second pool through the same hook, so one route crosses it twice with two input currencies
const WSPYX_USDC_HOOKED = makeHookedV4Pool(WSPYX, USDC, WRAPPER_HOOK)

function v4Swap(pools: V4Pool[], input: Currency, output: Currency, amountIn: string, amountOut: string) {
  const trade = V4Trade.createUncheckedTrade({
    route: new V4Route(pools, input, output),
    inputAmount: CurrencyAmount.fromRawAmount(input, amountIn),
    outputAmount: CurrencyAmount.fromRawAmount(output, amountOut),
    tradeType: TradeType.EXACT_INPUT,
  })
  return { routev4: trade.route, inputAmount: trade.inputAmount, outputAmount: trade.outputAmount }
}

function exactInTrade(...swaps: ReturnType<typeof v4Swap>[]) {
  return new RouterTrade({ v4Routes: swaps, tradeType: TradeType.EXACT_INPUT })
}

function v4SwapInputs(calldata: string): string[] {
  const { commandTypes, inputs } = parseCommands(calldata)
  return inputs.filter((_, index) => commandTypes[index] === CommandType.V4_SWAP)
}

function actionsOf(v4SwapInput: string) {
  return V4BaseActionsParser.parseCalldata(v4SwapInput).actions
}

function actionNames(v4SwapInput: string): string[] {
  return actionsOf(v4SwapInput).map((action) => action.actionName)
}

function param(v4SwapInput: string, actionName: string, paramName: string): any {
  const action = actionsOf(v4SwapInput).find((a) => a.actionName === actionName)
  expect(action, `expected ${actionName}`).to.not.be.undefined
  return action!.params.find((p) => p.name === paramName)!.value
}

/** Each TAKE of a V4_SWAP input, in order, with the currency and recipient lowercased. */
function takes(v4SwapInput: string): { currency: string; recipient: string; amount: string }[] {
  return actionsOf(v4SwapInput)
    .filter((action) => action.actionName === 'TAKE')
    .map((action) => {
      const value = (name: string) => action.params.find((p) => p.name === name)!.value
      return {
        currency: (value('currency') as string).toLowerCase(),
        recipient: (value('recipient') as string).toLowerCase(),
        amount: BigNumber.from(value('amount')).toString(),
      }
    })
}

/** The TAKE that collects a listed hook's unspent input: `currency` on the open delta to `recipient`. */
function remainderTake(currency: string, recipient: string = TEST_RECIPIENT_ADDRESS) {
  return { currency: currency.toLowerCase(), recipient: recipient.toLowerCase(), amount: '0' }
}

describe('settleBeforeSwapHooks', () => {
  it('settles the exact input before a single-hop swap through a listed hook', () => {
    const trade = exactInTrade(v4Swap([WRAP_POOL], SPYX, WSPYX, ONE_SPYX, ONE_WSPYX))
    const options = swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] })

    const [v4Input] = v4SwapInputs(SwapRouter.swapCallParameters(trade, options).calldata)

    expect(actionNames(v4Input)).to.deep.equal(['SETTLE', 'SWAP_EXACT_IN', 'TAKE', 'TAKE'])
    expect((param(v4Input, 'SETTLE', 'currency') as string).toLowerCase()).to.equal(SPYX.address.toLowerCase())
    expect((param(v4Input, 'SETTLE', 'amount') as BigNumber).toString()).to.equal(ONE_SPYX)
    expect(param(v4Input, 'SETTLE', 'payerIsUser')).to.equal(true)
    const swap = param(v4Input, 'SWAP_EXACT_IN', 'swap')
    expect(swap.amountIn.toString()).to.equal('0')
    expect(swap.amountOutMinimum.toString()).to.equal(
      trade.minimumAmountOut(options.slippageTolerance).quotient.toString()
    )
    // the output first, then whatever input the hook credited back
    expect(takes(v4Input)).to.deep.equal([remainderTake(WSPYX.address), remainderTake(SPYX.address)])
  })

  it('settles first when the listed hook is on a later hop of a multi-hop route', () => {
    const trade = exactInTrade(v4Swap([WSPYX_USDC, WRAP_POOL], USDC, SPYX, ONE_USDC, ONE_SPYX))

    const [v4Input] = v4SwapInputs(
      SwapRouter.swapCallParameters(trade, swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] })).calldata
    )

    expect(actionNames(v4Input)).to.deep.equal(['SETTLE', 'SWAP_EXACT_IN', 'TAKE', 'TAKE'])
    expect((param(v4Input, 'SETTLE', 'currency') as string).toLowerCase()).to.equal(USDC.address.toLowerCase())
    expect((param(v4Input, 'SETTLE', 'amount') as BigNumber).toString()).to.equal(ONE_USDC)
    // the listed hop is paid in wSPYx, the intermediate currency, so that is what it can credit back
    expect(takes(v4Input)[1]).to.deep.equal(remainderTake(WSPYX.address))
  })

  it('matches listed hooks case-insensitively', () => {
    const trade = exactInTrade(v4Swap([WRAP_POOL, WSPYX_USDC], SPYX, USDC, ONE_SPYX, ONE_USDC))

    const [v4Input] = v4SwapInputs(
      SwapRouter.swapCallParameters(trade, swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK.toLowerCase()] }))
        .calldata
    )

    expect(actionNames(v4Input)).to.deep.equal(['SETTLE', 'SWAP_EXACT_IN', 'TAKE', 'TAKE'])
  })

  it('takes back only the input of the hop through the listed hook', () => {
    const trade = exactInTrade(v4Swap([WRAP_POOL, WSPYX_USDC], SPYX, USDC, ONE_SPYX, ONE_USDC))

    const [v4Input] = v4SwapInputs(
      SwapRouter.swapCallParameters(trade, swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] })).calldata
    )

    // the unhooked second hop is paid in wSPYx and credits nothing back, so wSPYx is not taken
    expect(takes(v4Input)).to.deep.equal([remainderTake(USDC.address), remainderTake(SPYX.address)])
  })

  it('takes back each listed hop input once, in route order', () => {
    const trade = exactInTrade(v4Swap([WRAP_POOL, WSPYX_USDC_HOOKED], SPYX, USDC, ONE_SPYX, ONE_USDC))

    const [v4Input] = v4SwapInputs(
      SwapRouter.swapCallParameters(trade, swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] })).calldata
    )

    expect(actionNames(v4Input)).to.deep.equal(['SETTLE', 'SWAP_EXACT_IN', 'TAKE', 'TAKE', 'TAKE'])
    expect(takes(v4Input).slice(1)).to.deep.equal([remainderTake(SPYX.address), remainderTake(WSPYX.address)])
  })

  it('keeps the swap-then-settle encoding byte-identical when no route hook is listed', () => {
    const trade = exactInTrade(v4Swap([WRAP_POOL, WSPYX_USDC], SPYX, USDC, ONE_SPYX, ONE_USDC))

    const unlisted = SwapRouter.swapCallParameters(trade, swapOptions({ settleBeforeSwapHooks: [OTHER_HOOK] }))
    const baseline = SwapRouter.swapCallParameters(trade, swapOptions({}))

    expect(unlisted.calldata).to.equal(baseline.calldata)
    expect(actionNames(v4SwapInputs(baseline.calldata)[0])).to.deep.equal(['SWAP_EXACT_IN', 'SETTLE', 'TAKE'])
  })

  it('reorders only the split leg that goes through a listed hook', () => {
    const trade = exactInTrade(
      v4Swap([WRAP_POOL, WSPYX_USDC], SPYX, USDC, ONE_SPYX, ONE_USDC),
      v4Swap([SPYX_USDC], SPYX, USDC, ONE_SPYX, ONE_USDC)
    )

    const [hookedLeg, unhookedLeg] = v4SwapInputs(
      SwapRouter.swapCallParameters(trade, swapOptions({ settleBeforeSwapHooks: [OTHER_HOOK, WRAPPER_HOOK] })).calldata
    )

    expect(actionNames(hookedLeg)).to.deep.equal(['SETTLE', 'SWAP_EXACT_IN', 'TAKE', 'TAKE'])
    expect(actionNames(unhookedLeg)).to.deep.equal(['SWAP_EXACT_IN', 'SETTLE', 'TAKE'])
  })

  it('settles native input with the attached value before the swap', () => {
    const trade = exactInTrade(v4Swap([ETH_SPYX_HOOKED], ETHER, SPYX, ONE_SPYX, ONE_SPYX))

    const methodParameters = SwapRouter.swapCallParameters(
      trade,
      swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] })
    )
    const [v4Input] = v4SwapInputs(methodParameters.calldata)

    expect(actionNames(v4Input)).to.deep.equal(['SETTLE', 'SWAP_EXACT_IN', 'TAKE', 'TAKE'])
    expect(param(v4Input, 'SETTLE', 'currency')).to.equal(ETH_ADDRESS)
    expect((param(v4Input, 'SETTLE', 'amount') as BigNumber).toString()).to.equal(ONE_SPYX)
    expect(BigNumber.from(methodParameters.value).toString()).to.equal(ONE_SPYX)
    // unspent native input comes back as native
    expect(takes(v4Input)[1]).to.deep.equal(remainderTake(ETH_ADDRESS))
  })

  it('keeps settling the whole router balance when routerBalanceInput is also set', () => {
    const trade = exactInTrade(v4Swap([WRAP_POOL], SPYX, WSPYX, ONE_SPYX, ONE_WSPYX))

    const [v4Input] = v4SwapInputs(
      SwapRouter.swapCallParameters(
        trade,
        swapOptions({
          settleBeforeSwapHooks: [WRAPPER_HOOK],
          routerBalanceInput: {},
          recipient: TEST_RECIPIENT_ADDRESS,
        })
      ).calldata
    )

    expect(actionNames(v4Input)).to.deep.equal(['SETTLE', 'SWAP_EXACT_IN', 'TAKE', 'TAKE'])
    expect((param(v4Input, 'SETTLE', 'amount') as BigNumber).toString()).to.equal(CONTRACT_BALANCE.toString())
    expect(param(v4Input, 'SETTLE', 'payerIsUser')).to.equal(false)
    // the funder is a third party, so unspent input goes to the recipient, never back to the router
    expect(takes(v4Input)[1]).to.deep.equal(remainderTake(SPYX.address))
  })

  it('sends unspent input to the recipient while the router custodies the output', () => {
    const trade = exactInTrade(v4Swap([WRAP_POOL], SPYX, WSPYX, ONE_SPYX, ONE_WSPYX))

    const [v4Input] = v4SwapInputs(
      SwapRouter.swapCallParameters(
        trade,
        swapOptions({
          settleBeforeSwapHooks: [WRAPPER_HOOK],
          fee: { fee: new Percent(5, 1000), recipient: TEST_FEE_RECIPIENT_ADDRESS },
        })
      ).calldata
    )

    // a portion fee makes the router take the output to pay it; the input remainder is not output
    expect(takes(v4Input)).to.deep.equal([
      remainderTake(WSPYX.address, ROUTER_AS_RECIPIENT),
      remainderTake(SPYX.address),
    ])
  })

  it('sends unspent input to the caller when no recipient is given', () => {
    const trade = exactInTrade(v4Swap([WRAP_POOL], SPYX, WSPYX, ONE_SPYX, ONE_WSPYX))
    const options = swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] })
    delete options.recipient

    const [v4Input] = v4SwapInputs(SwapRouter.swapCallParameters(trade, options).calldata)

    expect(takes(v4Input)[1]).to.deep.equal(remainderTake(SPYX.address, SENDER_AS_RECIPIENT))
  })

  it('takes back a listed hook remainder in a mixed-route v4 section', () => {
    const mixedRoute = new MixedRouteSDK([makeV3Pool(USDC, WSPYX), WRAP_POOL], USDC, SPYX)
    const trade = new RouterTrade({
      mixedRoutes: [
        {
          mixedRoute,
          inputAmount: CurrencyAmount.fromRawAmount(USDC, ONE_USDC),
          outputAmount: CurrencyAmount.fromRawAmount(SPYX, ONE_SPYX),
        },
      ],
      tradeType: TradeType.EXACT_INPUT,
    })

    const listed = SwapRouter.swapCallParameters(trade, swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] }))
    const [v4Input] = v4SwapInputs(listed.calldata)

    // the v4 section settles the V3 output from the router first, then takes back what the hook left
    expect(actionNames(v4Input)).to.deep.equal(['SETTLE', 'SWAP_EXACT_IN', 'TAKE', 'TAKE'])
    expect((param(v4Input, 'SETTLE', 'amount') as BigNumber).toString()).to.equal(CONTRACT_BALANCE.toString())
    expect(takes(v4Input)[1]).to.deep.equal(remainderTake(WSPYX.address))

    // unlisted, the section keeps its encoding
    const unlisted = SwapRouter.swapCallParameters(trade, swapOptions({}))
    expect(actionNames(v4SwapInputs(unlisted.calldata)[0])).to.deep.equal(['SETTLE', 'SWAP_EXACT_IN', 'TAKE'])
  })

  it('refuses an exact-output route through a listed hook', () => {
    const trade = new RouterTrade({
      v4Routes: [
        {
          routev4: new V4Route([WRAP_POOL], SPYX, WSPYX),
          inputAmount: CurrencyAmount.fromRawAmount(SPYX, ONE_SPYX),
          outputAmount: CurrencyAmount.fromRawAmount(WSPYX, ONE_WSPYX),
        },
      ],
      tradeType: TradeType.EXACT_OUTPUT,
    })

    expect(() => SwapRouter.swapCallParameters(trade, swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] }))).to.throw(
      'SETTLE_BEFORE_SWAP_HOOK_EXACT_INPUT_ONLY'
    )
  })
})
