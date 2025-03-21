import { RoutePlanner, CommandType } from '../../utils/routerCommands'
import { Trade as V2Trade, Pair } from '@uniswap/v2-sdk'
import { Trade as V3Trade, Pool as V3Pool, encodeRouteToPath } from '@uniswap/v3-sdk'
import {
  Route as V4Route,
  Trade as V4Trade,
  Pool as V4Pool,
  V4Planner,
  encodeRouteToPath as encodeV4RouteToPath,
  Actions,
} from '@uniswap/v4-sdk'
import {
  Trade as RouterTrade,
  MixedRouteTrade,
  Protocol,
  IRoute,
  RouteV2,
  RouteV3,
  MixedRouteSDK,
  MixedRoute,
  SwapOptions as RouterSwapOptions,
  getOutputOfPools,
  encodeMixedRouteToPath,
  partitionMixedRouteByProtocol,
} from '@uniswap/router-sdk'
import { Permit2Permit } from '../../utils/inputTokens'
import { getPathCurrency } from '../../utils/pathCurrency'
import { Currency, TradeType, Token, CurrencyAmount, Percent } from '@uniswap/sdk-core'
import { Command, RouterActionType, TradeConfig } from '../Command'
import { SENDER_AS_RECIPIENT, ROUTER_AS_RECIPIENT, CONTRACT_BALANCE, ETH_ADDRESS } from '../../utils/constants'
import { getCurrencyAddress } from '../../utils/getCurrencyAddress'
import { encodeFeeBips } from '../../utils/numbers'
import { BigNumber, BigNumberish } from 'ethers'
import { TPool } from '@uniswap/router-sdk'

export type FlatFeeOptions = {
  amount: BigNumberish
  recipient: string
}

// the existing router permit object doesn't include enough data for permit2
// so we extend swap options with the permit2 permit
// when safe mode is enabled, the SDK will add an extra ETH sweep for security
// when useRouterBalance is enabled the SDK will use the balance in the router for the swap
export type SwapOptions = Omit<RouterSwapOptions, 'inputTokenPermit'> & {
  useRouterBalance?: boolean
  inputTokenPermit?: Permit2Permit
  flatFee?: FlatFeeOptions
  safeMode?: boolean
}

const REFUND_ETH_PRICE_IMPACT_THRESHOLD = new Percent(50, 100)

interface Swap<TInput extends Currency, TOutput extends Currency> {
  route: IRoute<TInput, TOutput, TPool>
  inputAmount: CurrencyAmount<TInput>
  outputAmount: CurrencyAmount<TOutput>
}

// Wrapper for uniswap router-sdk trade entity to encode swaps for Universal Router
// also translates trade objects from previous (v2, v3) SDKs
export class UniswapTrade implements Command {
  readonly tradeType: RouterActionType = RouterActionType.UniswapTrade
  readonly payerIsUser: boolean

  constructor(public trade: RouterTrade<Currency, Currency, TradeType>, public options: SwapOptions) {
    if (!!options.fee && !!options.flatFee) throw new Error('Only one fee option permitted')

    if (this.inputRequiresWrap || this.inputRequiresUnwrap || this.options.useRouterBalance) {
      this.payerIsUser = false
    } else {
      this.payerIsUser = true
    }
  }

  get isAllV4(): boolean {
    let result = true
    for (const swap of this.trade.swaps) {
      result = result && swap.route.protocol == Protocol.V4
    }
    return result
  }

  get inputRequiresWrap(): boolean {
    if (this.isAllV4) {
      return (
        this.trade.inputAmount.currency.isNative &&
        !(this.trade.swaps[0].route as unknown as V4Route<Currency, Currency>).pathInput.isNative
      )
    } else {
      return this.trade.inputAmount.currency.isNative
    }
  }

  get inputRequiresUnwrap(): boolean {
    if (this.isAllV4) {
      return (
        !this.trade.inputAmount.currency.isNative &&
        (this.trade.swaps[0].route as unknown as V4Route<Currency, Currency>).pathInput.isNative
      )
    }
    return false
  }

  get outputRequiresWrap(): boolean {
    if (this.isAllV4) {
      return (
        !this.trade.outputAmount.currency.isNative &&
        (this.trade.swaps[0].route as unknown as V4Route<Currency, Currency>).pathOutput.isNative
      )
    }
    return false
  }

  get outputRequiresUnwrap(): boolean {
    if (this.isAllV4) {
      return (
        this.trade.outputAmount.currency.isNative &&
        !(this.trade.swaps[0].route as unknown as V4Route<Currency, Currency>).pathOutput.isNative
      )
    } else {
      return this.trade.outputAmount.currency.isNative
    }
  }

  get outputRequiresTransition(): boolean {
    return this.outputRequiresWrap || this.outputRequiresUnwrap
  }

  encode(planner: RoutePlanner, _config: TradeConfig): void {
    // If the input currency is the native currency, we need to wrap it with the router as the recipient
    if (this.inputRequiresWrap) {
      // TODO: optimize if only one v2 pool we can directly send this to the pool
      planner.addCommand(CommandType.WRAP_ETH, [
        ROUTER_AS_RECIPIENT,
        this.trade.maximumAmountIn(this.options.slippageTolerance).quotient.toString(),
      ])
    } else if (this.inputRequiresUnwrap) {
      // send wrapped token to router to unwrap
      planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [
        (this.trade.inputAmount.currency as Token).address,
        ROUTER_AS_RECIPIENT,
        this.trade.maximumAmountIn(this.options.slippageTolerance).quotient.toString(),
      ])
      planner.addCommand(CommandType.UNWRAP_WETH, [ROUTER_AS_RECIPIENT, 0])
    }
    // The overall recipient at the end of the trade, SENDER_AS_RECIPIENT uses the msg.sender
    this.options.recipient = this.options.recipient ?? SENDER_AS_RECIPIENT

    // flag for whether we want to perform slippage check on aggregate output of multiple routes
    //   1. when there are >2 exact input trades. this is only a heuristic,
    //      as it's still more gas-expensive even in this case, but has benefits
    //      in that the reversion probability is lower
    const performAggregatedSlippageCheck =
      this.trade.tradeType === TradeType.EXACT_INPUT && this.trade.routes.length > 2
    const routerMustCustody =
      performAggregatedSlippageCheck || this.outputRequiresTransition || hasFeeOption(this.options)

    for (const swap of this.trade.swaps) {
      switch (swap.route.protocol) {
        case Protocol.V2:
          addV2Swap(planner, swap, this.trade.tradeType, this.options, this.payerIsUser, routerMustCustody)
          break
        case Protocol.V3:
          addV3Swap(planner, swap, this.trade.tradeType, this.options, this.payerIsUser, routerMustCustody)
          break
        case Protocol.V4:
          addV4Swap(planner, swap, this.trade.tradeType, this.options, this.payerIsUser, routerMustCustody)
          break
        case Protocol.MIXED:
          addMixedSwap(planner, swap, this.trade.tradeType, this.options, this.payerIsUser, routerMustCustody)
          break
        default:
          throw new Error('UNSUPPORTED_TRADE_PROTOCOL')
      }
    }

    let minimumAmountOut: BigNumber = BigNumber.from(
      this.trade.minimumAmountOut(this.options.slippageTolerance).quotient.toString()
    )
    // The router custodies for 3 reasons: to unwrap, to take a fee, and/or to do a slippage check
    if (routerMustCustody) {
      const pools = this.trade.swaps[0].route.pools
      const pathOutputCurrencyAddress = getCurrencyAddress(
        getPathCurrency(this.trade.outputAmount.currency, pools[pools.length - 1])
      )

      // If there is a fee, that percentage is sent to the fee recipient
      // In the case where ETH is the output currency, the fee is taken in WETH (for gas reasons)
      if (!!this.options.fee) {
        const feeBips = encodeFeeBips(this.options.fee.fee)
        planner.addCommand(CommandType.PAY_PORTION, [pathOutputCurrencyAddress, this.options.fee.recipient, feeBips])

        // If the trade is exact output, and a fee was taken, we must adjust the amount out to be the amount after the fee
        // Otherwise we continue as expected with the trade's normal expected output
        if (this.trade.tradeType === TradeType.EXACT_OUTPUT) {
          minimumAmountOut = minimumAmountOut.sub(minimumAmountOut.mul(feeBips).div(10000))
        }
      }

      // If there is a flat fee, that absolute amount is sent to the fee recipient
      // In the case where ETH is the output currency, the fee is taken in WETH (for gas reasons)
      if (!!this.options.flatFee) {
        const feeAmount = this.options.flatFee.amount
        if (minimumAmountOut.lt(feeAmount)) throw new Error('Flat fee amount greater than minimumAmountOut')

        planner.addCommand(CommandType.TRANSFER, [pathOutputCurrencyAddress, this.options.flatFee.recipient, feeAmount])

        // If the trade is exact output, and a fee was taken, we must adjust the amount out to be the amount after the fee
        // Otherwise we continue as expected with the trade's normal expected output
        if (this.trade.tradeType === TradeType.EXACT_OUTPUT) {
          minimumAmountOut = minimumAmountOut.sub(feeAmount)
        }
      }

      // The remaining tokens that need to be sent to the user after the fee is taken will be caught
      // by this if-else clause.
      if (this.outputRequiresUnwrap) {
        planner.addCommand(CommandType.UNWRAP_WETH, [this.options.recipient, minimumAmountOut])
      } else if (this.outputRequiresWrap) {
        planner.addCommand(CommandType.WRAP_ETH, [this.options.recipient, CONTRACT_BALANCE])
      } else {
        planner.addCommand(CommandType.SWEEP, [
          getCurrencyAddress(this.trade.outputAmount.currency),
          this.options.recipient,
          minimumAmountOut,
        ])
      }
    }

    // for exactOutput swaps with native input or that perform an inputToken transition (wrap or unwrap)
    // we need to send back the change to the user
    if (this.trade.tradeType === TradeType.EXACT_OUTPUT || riskOfPartialFill(this.trade)) {
      if (this.inputRequiresWrap) {
        planner.addCommand(CommandType.UNWRAP_WETH, [this.options.recipient, 0])
      } else if (this.inputRequiresUnwrap) {
        planner.addCommand(CommandType.WRAP_ETH, [this.options.recipient, CONTRACT_BALANCE])
      } else if (this.trade.inputAmount.currency.isNative) {
        // must refund extra native currency sent along for native v4 trades (no input transition)
        planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, this.options.recipient, 0])
      }
    }

    if (this.options.safeMode) planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, this.options.recipient, 0])
  }
}

// encode a uniswap v2 swap
function addV2Swap<TInput extends Currency, TOutput extends Currency>(
  planner: RoutePlanner,
  { route, inputAmount, outputAmount }: Swap<TInput, TOutput>,
  tradeType: TradeType,
  options: SwapOptions,
  payerIsUser: boolean,
  routerMustCustody: boolean
): void {
  const trade = new V2Trade(
    route as RouteV2<TInput, TOutput>,
    tradeType == TradeType.EXACT_INPUT ? inputAmount : outputAmount,
    tradeType
  )

  if (tradeType == TradeType.EXACT_INPUT) {
    planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
      // if native, we have to unwrap so keep in the router for now
      routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient,
      trade.maximumAmountIn(options.slippageTolerance).quotient.toString(),
      // if router will custody funds, we do aggregated slippage check from router
      routerMustCustody ? 0 : trade.minimumAmountOut(options.slippageTolerance).quotient.toString(),
      route.path.map((token) => token.wrapped.address),
      payerIsUser,
    ])
  } else if (tradeType == TradeType.EXACT_OUTPUT) {
    planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
      routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient,
      trade.minimumAmountOut(options.slippageTolerance).quotient.toString(),
      trade.maximumAmountIn(options.slippageTolerance).quotient.toString(),
      route.path.map((token) => token.wrapped.address),
      payerIsUser,
    ])
  }
}

// encode a uniswap v3 swap
function addV3Swap<TInput extends Currency, TOutput extends Currency>(
  planner: RoutePlanner,
  { route, inputAmount, outputAmount }: Swap<TInput, TOutput>,
  tradeType: TradeType,
  options: SwapOptions,
  payerIsUser: boolean,
  routerMustCustody: boolean
): void {
  const trade = V3Trade.createUncheckedTrade({
    route: route as RouteV3<TInput, TOutput>,
    inputAmount,
    outputAmount,
    tradeType,
  })

  const path = encodeRouteToPath(route as RouteV3<TInput, TOutput>, trade.tradeType === TradeType.EXACT_OUTPUT)
  if (tradeType == TradeType.EXACT_INPUT) {
    planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
      routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient,
      trade.maximumAmountIn(options.slippageTolerance).quotient.toString(),
      routerMustCustody ? 0 : trade.minimumAmountOut(options.slippageTolerance).quotient.toString(),
      path,
      payerIsUser,
    ])
  } else if (tradeType == TradeType.EXACT_OUTPUT) {
    planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [
      routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient,
      trade.minimumAmountOut(options.slippageTolerance).quotient.toString(),
      trade.maximumAmountIn(options.slippageTolerance).quotient.toString(),
      path,
      payerIsUser,
    ])
  }
}

function addV4Swap<TInput extends Currency, TOutput extends Currency>(
  planner: RoutePlanner,
  { inputAmount, outputAmount, route }: Swap<TInput, TOutput>,
  tradeType: TradeType,
  options: SwapOptions,
  payerIsUser: boolean,
  routerMustCustody: boolean
): void {
  // create a deep copy of pools since v4Planner encoding tampers with array
  const pools = route.pools.map((p) => p) as V4Pool[]
  const v4Route = new V4Route(pools, inputAmount.currency, outputAmount.currency)
  const trade = V4Trade.createUncheckedTrade({
    route: v4Route,
    inputAmount,
    outputAmount,
    tradeType,
  })

  const slippageToleranceOnSwap =
    routerMustCustody && tradeType == TradeType.EXACT_INPUT ? undefined : options.slippageTolerance

  const v4Planner = new V4Planner()
  v4Planner.addTrade(trade, slippageToleranceOnSwap)
  v4Planner.addSettle(trade.route.pathInput, payerIsUser)
  v4Planner.addTake(
    trade.route.pathOutput,
    routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient ?? SENDER_AS_RECIPIENT
  )
  planner.addCommand(CommandType.V4_SWAP, [v4Planner.finalize()])
}

// encode a mixed route swap, i.e. including both v2 and v3 pools
function addMixedSwap<TInput extends Currency, TOutput extends Currency>(
  planner: RoutePlanner,
  swap: Swap<TInput, TOutput>,
  tradeType: TradeType,
  options: SwapOptions,
  payerIsUser: boolean,
  routerMustCustody: boolean
): void {
  const route = swap.route as MixedRoute<TInput, TOutput>
  const inputAmount = swap.inputAmount
  const outputAmount = swap.outputAmount
  const tradeRecipient = routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient ?? SENDER_AS_RECIPIENT

  // single hop, so it can be reduced to plain swap logic for one protocol version
  if (route.pools.length === 1) {
    if (route.pools[0] instanceof V4Pool) {
      return addV4Swap(planner, swap, tradeType, options, payerIsUser, routerMustCustody)
    } else if (route.pools[0] instanceof V3Pool) {
      return addV3Swap(planner, swap, tradeType, options, payerIsUser, routerMustCustody)
    } else if (route.pools[0] instanceof Pair) {
      return addV2Swap(planner, swap, tradeType, options, payerIsUser, routerMustCustody)
    } else {
      throw new Error('Invalid route type')
    }
  }

  const trade = MixedRouteTrade.createUncheckedTrade({
    route: route as MixedRoute<TInput, TOutput>,
    inputAmount,
    outputAmount,
    tradeType,
  })

  const amountIn = trade.maximumAmountIn(options.slippageTolerance, inputAmount).quotient.toString()
  const amountOut = routerMustCustody
    ? 0
    : trade.minimumAmountOut(options.slippageTolerance, outputAmount).quotient.toString()

  // logic from
  // https://github.com/Uniswap/router-sdk/blob/d8eed164e6c79519983844ca8b6a3fc24ebcb8f8/src/swapRouter.ts#L276
  const sections = partitionMixedRouteByProtocol(route as MixedRoute<TInput, TOutput>)
  const isLastSectionInRoute = (i: number) => {
    return i === sections.length - 1
  }

  let inputToken = route.pathInput

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const routePool = section[0]
    const outputToken = getOutputOfPools(section, inputToken)
    const subRoute = new MixedRoute(new MixedRouteSDK([...section], inputToken, outputToken))

    let nextInputToken
    let swapRecipient

    if (isLastSectionInRoute(i)) {
      nextInputToken = outputToken
      swapRecipient = tradeRecipient
    } else {
      const nextPool = sections[i + 1][0]
      nextInputToken = getPathCurrency(outputToken, nextPool)

      const v2PoolIsSwapRecipient = nextPool instanceof Pair && outputToken.equals(nextInputToken)
      swapRecipient = v2PoolIsSwapRecipient ? (nextPool as Pair).liquidityToken.address : ROUTER_AS_RECIPIENT
    }

    if (routePool instanceof V4Pool) {
      const v4Planner = new V4Planner()
      const v4SubRoute = new V4Route(section as V4Pool[], subRoute.input, subRoute.output)

      v4Planner.addSettle(inputToken, payerIsUser && i === 0, (i == 0 ? amountIn : CONTRACT_BALANCE) as BigNumber)
      v4Planner.addAction(Actions.SWAP_EXACT_IN, [
        {
          currencyIn: inputToken.isNative ? ETH_ADDRESS : inputToken.address,
          path: encodeV4RouteToPath(v4SubRoute),
          amountIn: 0, // denotes open delta, amount set in v4Planner.addSettle()
          amountOutMinimum: !isLastSectionInRoute(i) ? 0 : amountOut,
        },
      ])
      v4Planner.addTake(outputToken, swapRecipient)

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.finalize()])
    } else if (routePool instanceof V3Pool) {
      planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
        swapRecipient, // recipient
        i == 0 ? amountIn : CONTRACT_BALANCE, // amountIn
        !isLastSectionInRoute(i) ? 0 : amountOut, // amountOut
        encodeMixedRouteToPath(subRoute), // path
        payerIsUser && i === 0, // payerIsUser
      ])
    } else if (routePool instanceof Pair) {
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        swapRecipient, // recipient
        i === 0 ? amountIn : CONTRACT_BALANCE, // amountIn
        !isLastSectionInRoute(i) ? 0 : amountOut, // amountOutMin
        subRoute.path.map((token) => token.wrapped.address), // path
        payerIsUser && i === 0,
      ])
    } else {
      throw new Error('Unexpected Pool Type')
    }

    // perform a token transition (wrap/unwrap if necessary)
    if (!isLastSectionInRoute(i)) {
      if (outputToken.isNative && !nextInputToken.isNative) {
        planner.addCommand(CommandType.WRAP_ETH, [ROUTER_AS_RECIPIENT, CONTRACT_BALANCE])
      } else if (!outputToken.isNative && nextInputToken.isNative) {
        planner.addCommand(CommandType.UNWRAP_WETH, [ROUTER_AS_RECIPIENT, 0])
      }
    }

    inputToken = nextInputToken
  }
}

// if price impact is very high, there's a chance of hitting max/min prices resulting in a partial fill of the swap
function riskOfPartialFill(trade: RouterTrade<Currency, Currency, TradeType>): boolean {
  return trade.priceImpact.greaterThan(REFUND_ETH_PRICE_IMPACT_THRESHOLD)
}

function hasFeeOption(swapOptions: SwapOptions): boolean {
  return !!swapOptions.fee || !!swapOptions.flatFee
}
