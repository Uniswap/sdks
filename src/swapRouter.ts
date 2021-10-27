import JSBI from 'jsbi'
import { Interface } from '@ethersproject/abi'
import { Currency, CurrencyAmount, Percent, TradeType, validateAndParseAddress } from '@uniswap/sdk-core'
import invariant from 'tiny-invariant'
import { abi } from '@uniswap/swap-router-contracts/artifacts/contracts/interfaces/ISwapRouter02.sol/ISwapRouter02.json'
import { FeeOptions, MethodParameters, Payments, PermitOptions, SelfPermit, toHex } from '@uniswap/v3-sdk'
import { Validation } from './multicallExtended'
import { Trade } from '@uniswap/v2-sdk'
import { ADDRESS_THIS, MSG_SENDER, MulticallExtended, PaymentsExtended } from '.'

const ZERO = JSBI.BigInt(0)

/**
 * Options for producing the arguments to send calls to the router.
 */
export interface V2SwapOptions {
  /**
   * How much the execution price is allowed to move unfavorably from the trade execution price.
   */
  slippageTolerance: Percent

  /**
   * The account that should receive the output. If omitted, output is sent to msg.sender.
   */
  recipient?: string

  /**
   * Either deadline (when the transaction expires, in epoch seconds), or previousBlockhash.
   */
  deadlineOrPreviousBlockhash?: Validation

  /**
   * The optional permit parameters for spending the input.
   */
  inputTokenPermit?: PermitOptions

  /**
   * Optional information for taking a fee on output.
   */
  fee?: FeeOptions
}

/**
 * Represents the Uniswap V2 + V3 SwapRouter02, and has static methods for helping execute trades.
 */
export abstract class SwapRouter {
  public static INTERFACE: Interface = new Interface(abi)

  /**
   * Cannot be constructed.
   */
  private constructor() {}

  /**
   * Produces the on-chain method name to call and the hex encoded parameters to pass as arguments for a given trade.
   * @param trade to produce call parameters for
   * @param options options for the call parameters
   */
  public static v2SwapCallParameters(
    trades: Trade<Currency, Currency, TradeType> | Trade<Currency, Currency, TradeType>[],
    options: V2SwapOptions
  ): MethodParameters {
    if (!Array.isArray(trades)) {
      trades = [trades]
    }

    const sampleTrade = trades[0]

    // All trades should have the same starting/ending currency and trade type
    invariant(
      trades.every(trade => trade.inputAmount.currency.equals(sampleTrade.inputAmount.currency)),
      'TOKEN_IN_DIFF'
    )
    invariant(
      trades.every(trade => trade.outputAmount.currency.equals(sampleTrade.outputAmount.currency)),
      'TOKEN_OUT_DIFF'
    )
    invariant(
      trades.every(trade => trade.tradeType === sampleTrade.tradeType),
      'TRADE_TYPE_DIFF'
    )

    const calldatas: string[] = []

    const ZERO_IN: CurrencyAmount<Currency> = CurrencyAmount.fromRawAmount(sampleTrade.inputAmount.currency, 0)
    const ZERO_OUT: CurrencyAmount<Currency> = CurrencyAmount.fromRawAmount(sampleTrade.outputAmount.currency, 0)

    const totalAmountOut: CurrencyAmount<Currency> = trades.reduce(
      (sum, trade) => sum.add(trade.minimumAmountOut(options.slippageTolerance)),
      ZERO_OUT
    )

    const inputIsNative = sampleTrade.inputAmount.currency.isNative
    const outputIsNative = sampleTrade.outputAmount.currency.isNative

    // flag for whether a refund needs to happen
    //   1. when paying in ETH, but with an uncertain input amount
    const mustRefund = inputIsNative && sampleTrade.tradeType === TradeType.EXACT_OUTPUT
    // flag for whether funds should be send first to the router
    //   1. when receiving ETH (which much be unwrapped from WETH)
    //   2. when a fee on the output is being taken
    //   3. when there are >1 exact input trades. this one isn't strictly necessary,
    //      but typically we want to perform an aggregated slippage check
    const routerMustCustody = outputIsNative || !!options.fee || (trades.length > 1 && sampleTrade.tradeType === TradeType.EXACT_INPUT)

    const totalValue: CurrencyAmount<Currency> = inputIsNative
      ? trades.reduce((sum, trade) => sum.add(trade.maximumAmountIn(options.slippageTolerance)), ZERO_IN)
      : ZERO_IN

    // encode permit if necessary
    if (options.inputTokenPermit) {
      invariant(sampleTrade.inputAmount.currency.isToken, 'NON_TOKEN_PERMIT')
      calldatas.push(SelfPermit.encodePermit(sampleTrade.inputAmount.currency, options.inputTokenPermit))
    }

    for (const trade of trades) {
      const amountIn: string = toHex(trade.maximumAmountIn(options.slippageTolerance).quotient)
      const amountOut: string = toHex(trade.minimumAmountOut(options.slippageTolerance).quotient)

      const path = trade.route.path.map(token => token.address)
      const recipient = routerMustCustody ? ADDRESS_THIS : (options.recipient ? validateAndParseAddress(options.recipient) : MSG_SENDER)

      if (trade.tradeType === TradeType.EXACT_INPUT) {
        const exactInputParams = [
          amountIn,
          // save gas by only passing slippage check if we can't check it later
          // not a pure win, as sometimes this will cost us more when it would have caused an earlier failure
          routerMustCustody ? 0 : amountOut,
          path,
          recipient
        ]

        calldatas.push(SwapRouter.INTERFACE.encodeFunctionData('swapExactTokensForTokens', exactInputParams))
      } else {
        const exactOutputParams = [
          amountOut,
          amountIn,
          path,
          recipient
        ]

        calldatas.push(SwapRouter.INTERFACE.encodeFunctionData('swapTokensForExactTokens', exactOutputParams))
      }
    }

    // unwrap
    if (routerMustCustody) {
      // if all trades are exact output, we can save gas by not passing a slippage check
      const canOmitSlippageCheck = sampleTrade.tradeType === TradeType.EXACT_OUTPUT
      const amountNecessary = canOmitSlippageCheck ? ZERO : totalAmountOut.quotient

      if (outputIsNative) {
        calldatas.push(PaymentsExtended.encodeUnwrapWETH9(amountNecessary, options.recipient, options.fee))
      } else {
        calldatas.push(
          PaymentsExtended.encodeSweepToken(
            sampleTrade.outputAmount.currency,
            amountNecessary,
            options.recipient,
            options.fee
          )
        )
      }
    }

    // refund
    if (mustRefund) {
      calldatas.push(Payments.encodeRefundETH())
    }

    return {
      calldata: MulticallExtended.encodeMulticall(calldatas, options.deadlineOrPreviousBlockhash),
      value: toHex(totalValue.quotient)
    }
  }
}
