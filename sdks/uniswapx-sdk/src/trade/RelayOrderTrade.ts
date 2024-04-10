import { Currency, CurrencyAmount, Price, TradeType } from "@uniswap/sdk-core";

import { RelayOrder, RelayOrderInfo } from "../order";

import { areCurrenciesEqual } from "./utils";

/// A high level Trade object that representes a Relay order
/// It requires an output amount to be provided in order to calculate execution price
/// @dev the execution price does not take into account gas fees
export class RelayOrderTrade<
  TInput extends Currency,
  TOutput extends Currency,
  TTradeType extends TradeType
> {
  public readonly tradeType: TTradeType;
  public readonly order: RelayOrder;

  private _outputAmount: CurrencyAmount<TOutput>;
  private _currenciesIn: TInput[];

  // Since Relay orders have no concept of an output amount, it must be provided as a constructor param
  // this is the output amount from the encoded swap, or the value to be used for execution price
  public constructor({
    currenciesIn,
    outputAmount,
    orderInfo,
    tradeType,
  }: {
    currenciesIn: TInput[];
    outputAmount: CurrencyAmount<TOutput>;
    orderInfo: RelayOrderInfo;
    tradeType: TTradeType;
  }) {
    this._currenciesIn = currenciesIn;
    this._outputAmount = outputAmount;
    this.tradeType = tradeType;

    // assume single chain
    this.order = new RelayOrder(orderInfo, outputAmount.currency.chainId);
  }

  public get outputAmount(): CurrencyAmount<TOutput> {
    return this._outputAmount;
  }

  private _feeStartEndAmounts:
    | {
        startAmount: CurrencyAmount<TInput>;
        endAmount: CurrencyAmount<TInput>;
      }
    | undefined;

  private _inputAmount: CurrencyAmount<TInput> | undefined;

  // This is the "tip" given to fillers of the order
  private getFeeInputStartEndAmounts(): {
    startAmount: CurrencyAmount<TInput>;
    endAmount: CurrencyAmount<TInput>;
  } {
    if (this._feeStartEndAmounts) return this._feeStartEndAmounts;

    if (!this.order.info.fee) {
      throw new Error("no fee found");
    }

    // assume single chain ids across all outputs for now
    const currencyIn = this._currenciesIn.find((currency) =>
      areCurrenciesEqual(currency, this.order.info.fee.token, currency.chainId)
    );

    if (!currencyIn) {
      throw new Error(
        "currency output from order must exist in currenciesOut list"
      );
    }

    const startEndAmounts = {
      startAmount: CurrencyAmount.fromRawAmount(
        currencyIn,
        this.order.info.fee.startAmount.toString()
      ),
      endAmount: CurrencyAmount.fromRawAmount(
        currencyIn,
        this.order.info.fee.endAmount.toString()
      ),
    };

    this._feeStartEndAmounts = startEndAmounts;
    return startEndAmounts;
  }

  // This is the input for the order
  private getInputAmount(): CurrencyAmount<TInput> {
    if (this._inputAmount) return this._inputAmount;

    if (!this.order.info.input) {
      throw new Error("no input found");
    }

    // assume single chain ids across all outputs for now
    const currencyIn = this._currenciesIn.find((currency) =>
      areCurrenciesEqual(
        currency,
        this.order.info.input.token,
        currency.chainId
      )
    );

    if (!currencyIn) {
      throw new Error(
        "currency input from order must exist in currenciesIn list"
      );
    }

    const inputAmount = CurrencyAmount.fromRawAmount(
      currencyIn,
      this.order.info.input.amount.toString()
    );

    this._inputAmount = inputAmount;
    return inputAmount;
  }

  // Gets the start amount for the first non-fee input
  // Relay order inputs only increase, so maximum denotes endAmount
  public get amountIn(): CurrencyAmount<TInput> {
    return this.getInputAmount();
  }

  public get amountInFee(): CurrencyAmount<TInput> {
    return this.getFeeInputStartEndAmounts().startAmount;
  }

  public get maximumAmountInFee(): CurrencyAmount<TInput> {
    return this.getFeeInputStartEndAmounts().endAmount;
  }

  private _executionPrice: Price<TInput, TOutput> | undefined;

  /**
   * The price expressed in terms of output amount/input amount.
   * @dev this only takes into account non fee inputs (does not include gas)
   */
  public get executionPrice(): Price<TInput, TOutput> {
    return (
      this._executionPrice ??
      (this._executionPrice = new Price(
        this.amountIn.currency,
        this.outputAmount.currency,
        this.amountIn.quotient,
        this.outputAmount.quotient
      ))
    );
  }

  /**
   * Return the execution price after accounting for slippage tolerance
   * @dev this only takes into account non fee inputs (does not include gas)
   * @returns The execution price
   */
  public worstExecutionPrice(): Price<TInput, TOutput> {
    return new Price(
      this.amountIn.currency,
      this.outputAmount.currency,
      this.amountIn.quotient,
      this.outputAmount.quotient
    );
  }
}
