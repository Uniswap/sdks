import { expect } from 'chai'
import { BigNumber, utils } from 'ethers'
import { Trade as RouterTrade } from '@uniswap/router-sdk'
import { Pool as V4Pool, Route as V4Route, Trade as V4Trade, V4BaseActionsParser } from '@uniswap/v4-sdk'
import { Currency, CurrencyAmount, Token, TradeType } from '@uniswap/sdk-core'
import { encodeSqrtRatioX96 } from '@uniswap/v3-sdk'
import { SwapRouter } from '../../src/swapRouter'
import { CommandType } from '../../src/utils/routerCommands'
import { CONTRACT_BALANCE, ETH_ADDRESS } from '../../src/utils/constants'
import { ETHER, USDC, makeV4Pool, parseCommands, swapOptions } from '../utils/uniswapData'
import { TEST_RECIPIENT_ADDRESS } from '../utils/addresses'

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

describe('settleBeforeSwapHooks', () => {
  it('settles the exact input before a single-hop swap through a listed hook', () => {
    const trade = exactInTrade(v4Swap([WRAP_POOL], SPYX, WSPYX, ONE_SPYX, ONE_WSPYX))
    const options = swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] })

    const [v4Input] = v4SwapInputs(SwapRouter.swapCallParameters(trade, options).calldata)

    expect(actionNames(v4Input)).to.deep.equal(['SETTLE', 'SWAP_EXACT_IN', 'TAKE'])
    expect((param(v4Input, 'SETTLE', 'currency') as string).toLowerCase()).to.equal(SPYX.address.toLowerCase())
    expect((param(v4Input, 'SETTLE', 'amount') as BigNumber).toString()).to.equal(ONE_SPYX)
    expect(param(v4Input, 'SETTLE', 'payerIsUser')).to.equal(true)
    const swap = param(v4Input, 'SWAP_EXACT_IN', 'swap')
    expect(swap.amountIn.toString()).to.equal('0')
    expect(swap.amountOutMinimum.toString()).to.equal(
      trade.minimumAmountOut(options.slippageTolerance).quotient.toString()
    )
  })

  it('settles first when the listed hook is on a later hop of a multi-hop route', () => {
    const trade = exactInTrade(v4Swap([WSPYX_USDC, WRAP_POOL], USDC, SPYX, ONE_USDC, ONE_SPYX))

    const [v4Input] = v4SwapInputs(
      SwapRouter.swapCallParameters(trade, swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] })).calldata
    )

    expect(actionNames(v4Input)).to.deep.equal(['SETTLE', 'SWAP_EXACT_IN', 'TAKE'])
    expect((param(v4Input, 'SETTLE', 'currency') as string).toLowerCase()).to.equal(USDC.address.toLowerCase())
    expect((param(v4Input, 'SETTLE', 'amount') as BigNumber).toString()).to.equal(ONE_USDC)
  })

  it('matches listed hooks case-insensitively', () => {
    const trade = exactInTrade(v4Swap([WRAP_POOL, WSPYX_USDC], SPYX, USDC, ONE_SPYX, ONE_USDC))

    const [v4Input] = v4SwapInputs(
      SwapRouter.swapCallParameters(trade, swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK.toLowerCase()] }))
        .calldata
    )

    expect(actionNames(v4Input)).to.deep.equal(['SETTLE', 'SWAP_EXACT_IN', 'TAKE'])
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

    expect(actionNames(hookedLeg)).to.deep.equal(['SETTLE', 'SWAP_EXACT_IN', 'TAKE'])
    expect(actionNames(unhookedLeg)).to.deep.equal(['SWAP_EXACT_IN', 'SETTLE', 'TAKE'])
  })

  it('settles native input with the attached value before the swap', () => {
    const trade = exactInTrade(v4Swap([ETH_SPYX_HOOKED], ETHER, SPYX, ONE_SPYX, ONE_SPYX))

    const methodParameters = SwapRouter.swapCallParameters(
      trade,
      swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] })
    )
    const [v4Input] = v4SwapInputs(methodParameters.calldata)

    expect(actionNames(v4Input)).to.deep.equal(['SETTLE', 'SWAP_EXACT_IN', 'TAKE'])
    expect(param(v4Input, 'SETTLE', 'currency')).to.equal(ETH_ADDRESS)
    expect((param(v4Input, 'SETTLE', 'amount') as BigNumber).toString()).to.equal(ONE_SPYX)
    expect(BigNumber.from(methodParameters.value).toString()).to.equal(ONE_SPYX)
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

    expect(actionNames(v4Input)).to.deep.equal(['SETTLE', 'SWAP_EXACT_IN', 'TAKE'])
    expect((param(v4Input, 'SETTLE', 'amount') as BigNumber).toString()).to.equal(CONTRACT_BALANCE.toString())
    expect(param(v4Input, 'SETTLE', 'payerIsUser')).to.equal(false)
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
