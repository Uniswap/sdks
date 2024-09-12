import { Currency, CurrencyAmount, Price, TradeType } from "@uniswap/sdk-core";

import { UnsignedV3DutchOrder, UnsignedV3DutchOrderInfo } from "../order/V3DutchOrder";

import { areCurrenciesEqual } from "./utils";
import { V3DutchOutput } from "../order";
import { BigNumber } from "ethers";

export class V3DutchOrderTrade<
    TInput extends Currency,
    TOutput extends Currency,
    TTradeType extends TradeType
> {
    public readonly tradeType: TTradeType
    public readonly order: UnsignedV3DutchOrder

    private _inputAmount: CurrencyAmount<TInput> | undefined
    private _outputAmounts: CurrencyAmount<TOutput>[] | undefined

    private _currencyIn: TInput
    private _currenciesOut: TOutput[]

    public constructor({
        currencyIn,
        currenciesOut,
        orderInfo,
        tradeType,
    }: {
        currencyIn: TInput
        currenciesOut: TOutput[]
        orderInfo: UnsignedV3DutchOrderInfo
        tradeType: TTradeType
    }) {
        this._currencyIn = currencyIn
        this._currenciesOut = currenciesOut
        this.tradeType = tradeType

        // Assuming not cross-chain
        this.order = new UnsignedV3DutchOrder(orderInfo, currencyIn.chainId)
    }

    public get inputAmount(): CurrencyAmount<TInput> {
        if (this._inputAmount) return this._inputAmount

        const amount = CurrencyAmount.fromRawAmount(
            this._currencyIn,
            this.order.info.input.startAmount.toString()
        )
        this._inputAmount = amount
        return amount
    }

    public get outputAmounts(): CurrencyAmount<TOutput>[] {
        if (this._outputAmounts) return this._outputAmounts

        const amounts = this.order.info.outputs.map((output) => {
            // Assuming all outputs on the same chain
            const currencyOut = this._currenciesOut.find((currency) =>
                areCurrenciesEqual(currency, output.token, currency.chainId)
            )

            if (!currencyOut) {
                throw new Error("Currency out not found")
            }

            return CurrencyAmount.fromRawAmount(currencyOut, output.startAmount.toString())
        })

        this._outputAmounts = amounts
        return amounts
    }
    
    // Same assumption as V2 that there is only one non-fee output at a time, and it exists at index 0
  public get outputAmount(): CurrencyAmount<TOutput> {
    return this.outputAmounts[0];
  }

  public minimumAmountOut(): CurrencyAmount<TOutput> {
    const nonFeeOutput: V3DutchOutput = this.order.info.outputs[0];
    const relativeAmounts: bigint[] = nonFeeOutput.curve.relativeAmounts;
    const startAmount: BigNumber = nonFeeOutput.startAmount;
    // Get the maximum of the relative amounts
    const maxRelativeAmount = relativeAmounts.reduce((max, amount) => amount > max ? amount : max, BigInt(0));
    // minimum is the start - the max of the relative amounts
    const minOut = startAmount.sub(maxRelativeAmount.toString());
    return CurrencyAmount.fromRawAmount(this.outputAmount.currency, minOut.toString());
  }

  public maximumAmountIn(): CurrencyAmount<TInput> {
    const maxAmountIn = this.order.info.input.maxAmount;
    return CurrencyAmount.fromRawAmount(
      this._currencyIn,
      maxAmountIn.toString()
    );
  }

  private _executionPrice: Price<TInput, TOutput> | undefined;

  /**
   * The price expressed in terms of output amount/input amount.
   */
  public get executionPrice(): Price<TInput, TOutput> {
    return (
      this._executionPrice ??
      (this._executionPrice = new Price(
        this.inputAmount.currency,
        this.outputAmount.currency,
        this.inputAmount.quotient,
        this.outputAmount.quotient
      ))
    );
  }

  /**
   * Return the execution price after accounting for slippage tolerance
   * @returns The execution price
   */
  public worstExecutionPrice(): Price<TInput, TOutput> {
    return new Price(
      this.inputAmount.currency,
      this.outputAmount.currency,
      this.maximumAmountIn().quotient,
      this.minimumAmountOut().quotient
    );
  }
}