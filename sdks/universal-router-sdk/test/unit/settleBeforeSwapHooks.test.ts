import { expect } from 'chai'
import { BigNumber, utils } from 'ethers'
import { defaultAbiCoder } from 'ethers/lib/utils'
import { Interface } from '@ethersproject/abi'
import { Trade as RouterTrade, MixedRouteSDK } from '@uniswap/router-sdk'
import { Pool as V4Pool, Route as V4Route, Trade as V4Trade, V4BaseActionsParser } from '@uniswap/v4-sdk'
import { Currency, CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core'
import { encodeSqrtRatioX96 } from '@uniswap/v3-sdk'
import { SwapRouter } from '../../src/swapRouter'
import { TokenTransferMode } from '../../src/entities/actions/uniswap'
import { CommandType } from '../../src/utils/routerCommands'
import { CONTRACT_BALANCE, ETH_ADDRESS, ROUTER_AS_RECIPIENT, SENDER_AS_RECIPIENT } from '../../src/utils/constants'
import { DAI, ETHER, USDC, WETH, makeV3Pool, makeV4Pool, parseCommands, swapOptions } from '../utils/uniswapData'
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
// a listed pool paired with WETH, so native ETH input is wrapped by the router before the swap
const WETH_SPYX_HOOKED = makeHookedV4Pool(WETH, SPYX, WRAPPER_HOOK)

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

/** The router commands in order, each with its input. */
function commandsOf(calldata: string): { type: number; input: string }[] {
  const { commandTypes, inputs } = parseCommands(calldata)
  return commandTypes.map((type, index) => ({ type, input: inputs[index] }))
}

/** The `(recipient, amount)` of an UNWRAP_WETH or WRAP_ETH command, recipient lowercased. */
function recipientAndAmount(input: string): [string, string] {
  const [recipient, amount] = defaultAbiCoder.decode(['address', 'uint256'], input)
  return [(recipient as string).toLowerCase(), BigNumber.from(amount).toString()]
}

const PROXY_INTERFACE = new Interface([
  'function execute(address router, address token, uint256 amount, bytes commands, bytes[] inputs, uint256 deadline) external payable',
])

/** The V4_SWAP inputs of a SwapProxy `execute` call, which wraps the router's commands. */
function proxyV4SwapInputs(calldata: string): string[] {
  const decoded = PROXY_INTERFACE.decodeFunctionData('execute', calldata)
  const commandTypes = (decoded.commands as string)
    .slice(2)
    .match(/../g)!
    .map((byte) => parseInt(byte, 16) & 0x3f)
  return (decoded.inputs as string[]).filter((_, index) => commandTypes[index] === CommandType.V4_SWAP)
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

/** A TAKE of `currency` on the open delta to `recipient`. */
function openTake(currency: string, recipient: string) {
  return { currency: currency.toLowerCase(), recipient: recipient.toLowerCase(), amount: '0' }
}

/** The swap's output TAKE, to the trade recipient unless the router custodies the output. */
function outputTake(currency: string, recipient: string = TEST_RECIPIENT_ADDRESS) {
  return openTake(currency, recipient)
}

/** The TAKE that collects a listed hook's unspent input: back to the payer unless a third party funded the swap. */
function remainderTake(currency: string, recipient: string = SENDER_AS_RECIPIENT) {
  return openTake(currency, recipient)
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
    // the output to the recipient, then whatever input the hook credited back to the payer
    expect(takes(v4Input)).to.deep.equal([outputTake(WSPYX.address), remainderTake(SPYX.address)])
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
    expect(takes(v4Input)).to.deep.equal([outputTake(USDC.address), remainderTake(SPYX.address)])
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
    // the funder is a third party, not the swapper, so unspent input goes to the recipient
    expect(takes(v4Input)[1]).to.deep.equal(remainderTake(SPYX.address, TEST_RECIPIENT_ADDRESS))
  })

  it('sends unspent input to the payer while the router custodies the output', () => {
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
    expect(takes(v4Input)).to.deep.equal([outputTake(WSPYX.address, ROUTER_AS_RECIPIENT), remainderTake(SPYX.address)])
  })

  it('returns unspent input to the payer, not to a recipient that only expects the output', () => {
    const trade = exactInTrade(v4Swap([WRAP_POOL], SPYX, WSPYX, ONE_SPYX, ONE_WSPYX))

    const [v4Input] = v4SwapInputs(
      SwapRouter.swapCallParameters(
        trade,
        swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK], recipient: TEST_FEE_RECIPIENT_ADDRESS })
      ).calldata
    )

    // e.g. a bridge or payment contract: it gets the output, and the payer's leftover goes back to the payer
    expect(takes(v4Input)).to.deep.equal([
      outputTake(WSPYX.address, TEST_FEE_RECIPIENT_ADDRESS),
      remainderTake(SPYX.address, SENDER_AS_RECIPIENT),
    ])
  })

  it('sends unspent input to the recipient when a proxy pays for the swap', () => {
    const trade = exactInTrade(v4Swap([WRAP_POOL], SPYX, WSPYX, ONE_SPYX, ONE_WSPYX))

    const [v4Input] = proxyV4SwapInputs(
      SwapRouter.swapCallParameters(
        trade,
        swapOptions({
          settleBeforeSwapHooks: [WRAPPER_HOOK],
          tokenTransferMode: TokenTransferMode.ApproveProxy,
          chainId: 1,
        })
      ).calldata
    )

    // the caller is the proxy, so the swapper is the recipient
    expect(param(v4Input, 'SETTLE', 'payerIsUser')).to.equal(false)
    expect(takes(v4Input)[1]).to.deep.equal(remainderTake(SPYX.address, TEST_RECIPIENT_ADDRESS))
  })

  it('refunds unspent wrapped input to the payer as ETH when the router wraps native input', () => {
    const trade = exactInTrade(v4Swap([WETH_SPYX_HOOKED], ETHER, SPYX, ONE_SPYX, ONE_SPYX))

    const { calldata } = SwapRouter.swapCallParameters(trade, swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] }))
    const [v4Input] = v4SwapInputs(calldata)
    const commands = commandsOf(calldata)

    // the router wraps the ETH and pays the pool in WETH, so the hook credits WETH back: the router keeps it,
    // then unwraps all of it to the caller who sent the ETH
    expect((param(v4Input, 'SETTLE', 'currency') as string).toLowerCase()).to.equal(WETH.address.toLowerCase())
    expect(takes(v4Input)[1]).to.deep.equal(remainderTake(WETH.address, ROUTER_AS_RECIPIENT))
    expect(commands.map((c) => c.type)).to.deep.equal([
      CommandType.WRAP_ETH,
      CommandType.V4_SWAP,
      CommandType.UNWRAP_WETH,
    ])
    expect(recipientAndAmount(commands[2].input)).to.deep.equal([SENDER_AS_RECIPIENT, '0'])
  })

  it('refunds unspent unwrapped input to the payer as WETH when the router unwraps WETH input', () => {
    const trade = exactInTrade(v4Swap([ETH_SPYX_HOOKED], WETH, SPYX, ONE_SPYX, ONE_SPYX))

    const { calldata } = SwapRouter.swapCallParameters(trade, swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] }))
    const [v4Input] = v4SwapInputs(calldata)
    const commands = commandsOf(calldata)

    // the router unwraps the WETH and pays the native pool in ETH, so the hook credits ETH back: the router keeps it,
    // then wraps all of it back to the caller who paid in WETH
    expect(param(v4Input, 'SETTLE', 'currency')).to.equal(ETH_ADDRESS)
    expect(takes(v4Input)[1]).to.deep.equal(remainderTake(ETH_ADDRESS, ROUTER_AS_RECIPIENT))
    const last = commands[commands.length - 1]
    expect(last.type).to.equal(CommandType.WRAP_ETH)
    expect(recipientAndAmount(last.input)).to.deep.equal([SENDER_AS_RECIPIENT, CONTRACT_BALANCE.toString()])
  })

  it('refunds unspent wrapped input to the recipient when a third party funds native input', () => {
    const trade = exactInTrade(v4Swap([WETH_SPYX_HOOKED], ETHER, SPYX, ONE_SPYX, ONE_SPYX))

    const { calldata } = SwapRouter.swapCallParameters(
      trade,
      swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK], routerBalanceInput: {}, recipient: TEST_RECIPIENT_ADDRESS })
    )
    const commands = commandsOf(calldata)

    // the funder is not the swapper, so the unwrapped remainder goes to the recipient
    const unwrap = commands.find((c) => c.type === CommandType.UNWRAP_WETH)!
    expect(recipientAndAmount(unwrap.input)).to.deep.equal([TEST_RECIPIENT_ADDRESS.toLowerCase(), '0'])
  })

  it('adds no input refund command when the router does not convert the input', () => {
    const trade = exactInTrade(v4Swap([WRAP_POOL], SPYX, WSPYX, ONE_SPYX, ONE_WSPYX))

    const { calldata } = SwapRouter.swapCallParameters(trade, swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] }))

    expect(commandsOf(calldata).map((c) => c.type)).to.deep.equal([CommandType.V4_SWAP])
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

  it('takes back a listed hook remainder in a first mixed-route section whose output stays on the router', () => {
    const mixedRoute = new MixedRouteSDK([WRAP_POOL, makeV3Pool(WSPYX, USDC)], SPYX, USDC)
    const trade = new RouterTrade({
      mixedRoutes: [
        {
          mixedRoute,
          inputAmount: CurrencyAmount.fromRawAmount(SPYX, ONE_SPYX),
          outputAmount: CurrencyAmount.fromRawAmount(USDC, ONE_USDC),
        },
      ],
      tradeType: TradeType.EXACT_INPUT,
    })

    const [v4Input] = v4SwapInputs(
      SwapRouter.swapCallParameters(trade, swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] })).calldata
    )

    // the payer's own SPYx is settled first; wSPYx stays on the router for the V3 section, the SPYx remainder goes back
    expect(param(v4Input, 'SETTLE', 'payerIsUser')).to.equal(true)
    expect(takes(v4Input)).to.deep.equal([outputTake(WSPYX.address, ROUTER_AS_RECIPIENT), remainderTake(SPYX.address)])
  })

  it('takes back a listed hook remainder in a middle mixed-route section', () => {
    const mixedRoute = new MixedRouteSDK([makeV3Pool(USDC, WSPYX), WRAP_POOL, makeV3Pool(SPYX, DAI)], USDC, DAI)
    const trade = new RouterTrade({
      mixedRoutes: [
        {
          mixedRoute,
          inputAmount: CurrencyAmount.fromRawAmount(USDC, ONE_USDC),
          outputAmount: CurrencyAmount.fromRawAmount(DAI, ONE_SPYX),
        },
      ],
      tradeType: TradeType.EXACT_INPUT,
    })

    const [v4Input] = v4SwapInputs(
      SwapRouter.swapCallParameters(trade, swapOptions({ settleBeforeSwapHooks: [WRAPPER_HOOK] })).calldata
    )

    // the section spends the router's wSPYx and leaves SPYx on the router for the last V3 section; the wSPYx it did
    // not spend is an intermediate token, returned to the payer
    expect((param(v4Input, 'SETTLE', 'amount') as BigNumber).toString()).to.equal(CONTRACT_BALANCE.toString())
    expect(takes(v4Input)).to.deep.equal([outputTake(SPYX.address, ROUTER_AS_RECIPIENT), remainderTake(WSPYX.address)])
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
