import invariant from 'tiny-invariant'
import { abi } from '@uniswap/universal-router/artifacts/contracts/UniversalRouter.sol/UniversalRouter.json'
import { Interface } from '@ethersproject/abi'
import { BigNumber, BigNumberish } from 'ethers'
import { MethodParameters } from '@uniswap/v3-sdk'
import { Trade as RouterTrade } from '@uniswap/router-sdk'
import { Currency, TradeType } from '@uniswap/sdk-core'
import { UniswapTrade, SwapOptions } from './entities/actions/uniswap'
import { RoutePlanner } from './utils/routerCommands'

export type SwapRouterConfig = {
  sender?: string // address
  deadline?: BigNumberish
}

export abstract class SwapRouter {
  public static INTERFACE: Interface = new Interface(abi)

  public static swapCallParameters(
    trades: RouterTrade<Currency, Currency, TradeType>,
    options: SwapOptions
  ): MethodParameters {
    // TODO: use permit if signature included in swapOptions
    const planner = new RoutePlanner()

    const trade: UniswapTrade = new UniswapTrade(trades, options)

    const inputCurrency = trade.trade.inputAmount.currency
    invariant(!(inputCurrency.isNative && !!options.inputTokenPermit), 'NATIVE_INPUT_PERMIT')

    if (options.inputTokenPermit) {
      encodePermit(planner, options.inputTokenPermit)
    }

    const nativeCurrencyValue = inputCurrency.isNative
      ? BigNumber.from(trade.trade.maximumAmountIn(options.slippageTolerance).quotient.toString())
      : BigNumber.from(0)

    trade.encode(planner, { allowRevert: false })
    return SwapRouter.encodePlan(planner, nativeCurrencyValue, {
      deadline: options.deadlineOrPreviousBlockhash ? BigNumber.from(options.deadlineOrPreviousBlockhash) : undefined,
    })
  }

  /**
   * Encodes a planned route into a method name and parameters for the Router contract.
   * @param planner the planned route
   * @param nativeCurrencyValue the native currency value of the planned route
   * @param config the router config
   */
  private static encodePlan(
    planner: RoutePlanner,
    nativeCurrencyValue: BigNumber,
    config: SwapRouterConfig = {}
  ): MethodParameters {
    const { commands, inputs } = planner
    const functionSignature = !!config.deadline ? 'execute(bytes,bytes[],uint256)' : 'execute(bytes,bytes[])'
    const parameters = !!config.deadline ? [commands, inputs, config.deadline] : [commands, inputs]
    const calldata = SwapRouter.INTERFACE.encodeFunctionData(functionSignature, parameters)
    return { calldata, value: nativeCurrencyValue.toHexString() }
  }
}
