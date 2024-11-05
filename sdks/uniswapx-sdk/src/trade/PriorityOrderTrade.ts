import { Currency, CurrencyAmount, Price, TradeType } from "@uniswap/sdk-core";

import { UnsignedPriorityOrder, UnsignedPriorityOrderInfo } from "../order";

import { areCurrenciesEqual } from "./utils";

export class PriorityOrderTrade<
  TInput extends Currency,
  TOutput extends Currency,
  TTradeType extends TradeType
> {
  public readonly tradeType: TTradeType;
  public readonly order: UnsignedPriorityOrder;
  public readonly expectedAmounts: {
    expectedAmountIn: string;
    expectedAmountOut: string;
  } | undefined;

  private _inputAmount: CurrencyAmount<TInput> | undefined;
  private _outputAmounts: CurrencyAmount<TOutput>[] | undefined;

  private _currencyIn: TInput;
  private _currenciesOut: TOutput[];

  public constructor({
    currencyIn,
    currenciesOut,
    orderInfo,
    tradeType,
    expectedAmounts,
  }: {
    currencyIn: TInput;
    currenciesOut: TOutput[];
    orderInfo: UnsignedPriorityOrderInfo;
    tradeType: TTradeType;
    expectedAmounts?: {
      expectedAmountIn: string;
      expectedAmountOut: string;
    };
  }) {
    this._currencyIn = currencyIn;
    this._currenciesOut = currenciesOut;
    this.tradeType = tradeType;
    this.expectedAmounts = expectedAmounts;

    // assume single-chain for now
    this.order = new UnsignedPriorityOrder(orderInfo, currencyIn.chainId);
  }

  public get inputAmount(): CurrencyAmount<TInput> {
    if (this._inputAmount) return this._inputAmount;

    // If we have expected quote data use that, otherwise use the order input amount
    const amount = this.expectedAmounts?.expectedAmountIn
      ? this.getExpectedAmountIn()
      : CurrencyAmount.fromRawAmount(
          this._currencyIn,
          this.order.info.input.amount.toString()
        );
    this._inputAmount = amount;
    return amount;
  }

  public get outputAmounts(): CurrencyAmount<TOutput>[] {
    if (this._outputAmounts) return this._outputAmounts;

    const amounts = this.order.info.outputs.map((output) => {
      // assume single chain ids across all outputs for now
      const currencyOut = this._currenciesOut.find((currency) =>
        areCurrenciesEqual(currency, output.token, currency.chainId)
      );

      if (!currencyOut) {
        throw new Error("currency not found in output array");
      }

      return CurrencyAmount.fromRawAmount(
        currencyOut,
        output.amount.toString()
      );
    });

    this._outputAmounts = amounts;
    return amounts;
  }

  private _firstNonFeeOutputAmount:
    | CurrencyAmount<TOutput>
    | undefined;

  private getFirstNonFeeOutputAmount(): CurrencyAmount<TOutput> {
    if (this._firstNonFeeOutputAmount)
      return this._firstNonFeeOutputAmount;

    if (this.order.info.outputs.length === 0) {
      throw new Error("there must be at least one output token");
    }
    const output = this.order.info.outputs[0];

    // assume single chain ids across all outputs for now
    const currencyOut = this._currenciesOut.find((currency) =>
      areCurrenciesEqual(currency, output.token, currency.chainId)
    );

    if (!currencyOut) {
      throw new Error(
        "currency output from order must exist in currenciesOut list"
      );
    }

    const amount =
      CurrencyAmount.fromRawAmount(
        currencyOut,
        output.amount.toString()
      );

    this._firstNonFeeOutputAmount = amount;
    return amount;
  }

  // TODO: revise when there are actually multiple output amounts. for now, assume only one non-fee output at a time
  public get outputAmount(): CurrencyAmount<TOutput> {
    // If we have expected quote data use that, otherwise use the first non-fee output
    return this.expectedAmounts?.expectedAmountOut
      ? this.getExpectedAmountOut()
      : this.getFirstNonFeeOutputAmount();
  }

  public minimumAmountOut(): CurrencyAmount<TOutput> {
    return this.getFirstNonFeeOutputAmount();
  }

  public maximumAmountIn(): CurrencyAmount<TInput> {
    return CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.order.info.input.amount.toString()
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

  private getExpectedAmountIn(): CurrencyAmount<TInput> {
    if (!this.expectedAmounts?.expectedAmountIn) {
      throw new Error("expectedAmountIn not set");
    }

    return CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.expectedAmounts.expectedAmountIn
    );
  }

  private getExpectedAmountOut(): CurrencyAmount<TOutput> {
    if (!this.expectedAmounts?.expectedAmountOut) {
      throw new Error("expectedAmountOut not set");
    }

    return CurrencyAmount.fromRawAmount(
      this._currenciesOut[0],
      this.expectedAmounts.expectedAmountOut
    );
  }
}
