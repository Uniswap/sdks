import { Currency, CurrencyAmount, Price, TradeType } from "@uniswap/sdk-core";

import { UnsignedV2DutchOrder, UnsignedV2DutchOrderInfo } from "../order";

import { areCurrenciesEqual } from "./utils";

export class V2DutchOrderTrade<
  TInput extends Currency,
  TOutput extends Currency,
  TTradeType extends TradeType
> {
  public readonly tradeType: TTradeType;
  public readonly order: UnsignedV2DutchOrder;

  private _inputAmount: CurrencyAmount<TInput> | undefined;
  private _outputAmounts: CurrencyAmount<TOutput>[] | undefined;

  private _currencyIn: TInput;
  private _currenciesOut: TOutput[];

  public constructor({
    currencyIn,
    currenciesOut,
    orderInfo,
    tradeType,
  }: {
    currencyIn: TInput;
    currenciesOut: TOutput[];
    orderInfo: UnsignedV2DutchOrderInfo;
    tradeType: TTradeType;
  }) {
    this._currencyIn = currencyIn;
    this._currenciesOut = currenciesOut;
    this.tradeType = tradeType;

    // assume single-chain for now
    this.order = new UnsignedV2DutchOrder(orderInfo, currencyIn.chainId);
  }

  public get inputAmount(): CurrencyAmount<TInput> {
    if (this._inputAmount) return this._inputAmount;

    const amount = CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.order.info.input.startAmount.toString()
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
        output.startAmount.toString()
      );
    });

    this._outputAmounts = amounts;
    return amounts;
  }

  private _firstNonFeeOutputStartEndAmounts:
    | {
        startAmount: CurrencyAmount<TOutput>;
        endAmount: CurrencyAmount<TOutput>;
      }
    | undefined;

  private getFirstNonFeeOutputStartEndAmounts(): {
    startAmount: CurrencyAmount<TOutput>;
    endAmount: CurrencyAmount<TOutput>;
  } {
    if (this._firstNonFeeOutputStartEndAmounts)
      return this._firstNonFeeOutputStartEndAmounts;

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

    const startEndAmounts = {
      startAmount: CurrencyAmount.fromRawAmount(
        currencyOut,
        output.startAmount.toString()
      ),
      endAmount: CurrencyAmount.fromRawAmount(
        currencyOut,
        output.endAmount.toString()
      ),
    };

    this._firstNonFeeOutputStartEndAmounts = startEndAmounts;
    return startEndAmounts;
  }

  // TODO: revise when there are actually multiple output amounts. for now, assume only one non-fee output at a time
  public get outputAmount(): CurrencyAmount<TOutput> {
    return this.getFirstNonFeeOutputStartEndAmounts().startAmount;
  }

  public minimumAmountOut(): CurrencyAmount<TOutput> {
    return this.getFirstNonFeeOutputStartEndAmounts().endAmount;
  }

  public maximumAmountIn(): CurrencyAmount<TInput> {
    return CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.order.info.input.endAmount.toString()
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
