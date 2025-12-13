import { Currency, CurrencyAmount, Price, TradeType } from "@uniswap/sdk-core";
import { BigNumber } from "ethers";

import { CosignedHybridOrder } from "../order/v4/HybridOrder";
import { CosignedHybridOrderInfo, HybridOutput } from "../order/v4/types";

import { areCurrenciesEqual } from "./utils";

const BASE_SCALING_FACTOR = BigNumber.from("1000000000000000000"); // 1e18

export class HybridOrderTrade<
  TInput extends Currency,
  TOutput extends Currency,
  TTradeType extends TradeType
> {
  public readonly tradeType: TTradeType;
  public readonly order: CosignedHybridOrder;
  public readonly expectedAmounts:
    | {
        expectedAmountIn: string;
        expectedAmountOut: string;
      }
    | undefined;

  private _inputAmount: CurrencyAmount<TInput> | undefined;
  private _outputAmounts: CurrencyAmount<TOutput>[] | undefined;

  private _currencyIn: TInput;
  private _currenciesOut: TOutput[];

  public constructor({
    currencyIn,
    currenciesOut,
    orderInfo,
    chainId,
    resolver,
    permit2Address,
    tradeType,
    expectedAmounts,
  }: {
    currencyIn: TInput;
    currenciesOut: TOutput[];
    orderInfo: CosignedHybridOrderInfo;
    chainId: number;
    resolver: string;
    permit2Address?: string;
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

    this.order = new CosignedHybridOrder(
      orderInfo,
      chainId,
      resolver,
      permit2Address
    );
  }

  public get inputAmount(): CurrencyAmount<TInput> {
    if (this._inputAmount) return this._inputAmount;

    const amount = this.expectedAmounts?.expectedAmountIn
      ? this.getExpectedAmountIn()
      : CurrencyAmount.fromRawAmount(
          this._currencyIn,
          this.order.info.input.maxAmount.toString()
        );
    this._inputAmount = amount;
    return amount;
  }

  public get outputAmounts(): CurrencyAmount<TOutput>[] {
    if (this._outputAmounts) return this._outputAmounts;

    const amounts = this.order.info.outputs.map((output: HybridOutput) => {
      const currencyOut = this._currenciesOut.find((currency) =>
        areCurrenciesEqual(currency, output.token, currency.chainId)
      );

      if (!currencyOut) {
        throw new Error("Currency out not found");
      }

      return CurrencyAmount.fromRawAmount(
        currencyOut,
        output.minAmount.toString()
      );
    });

    this._outputAmounts = amounts;
    return amounts;
  }

  // Same assumption as V3 that there is only one non-fee output at a time, and it exists at index 0
  public get outputAmount(): CurrencyAmount<TOutput> {
    return this.expectedAmounts?.expectedAmountOut
      ? this.getExpectedAmountOut()
      : this.outputAmounts[0];
  }

  /**
   * For exact-in orders: minimum amount out is the minAmount from the order
   * For exact-out orders: minimum amount out is the fixed output amount
   */
  public minimumAmountOut(): CurrencyAmount<TOutput> {
    const firstOutput = this.order.info.outputs[0];
    return CurrencyAmount.fromRawAmount(
      this.outputAmount.currency,
      firstOutput.minAmount.toString()
    );
  }

  /**
   * For exact-in orders: maximum amount in is the fixed maxAmount
   * For exact-out orders: maximum amount in is the maxAmount (worst case)
   */
  public maximumAmountIn(): CurrencyAmount<TInput> {
    return CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.order.info.input.maxAmount.toString()
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
   * @returns The worst execution price (max in / min out)
   */
  public worstExecutionPrice(): Price<TInput, TOutput> {
    return new Price(
      this.inputAmount.currency,
      this.outputAmount.currency,
      this.maximumAmountIn().quotient,
      this.minimumAmountOut().quotient
    );
  }

  /**
   * Determine if this is an exact-in order based on the scalingFactor
   */
  public isExactIn(): boolean {
    return (
      this.order.info.scalingFactor.gt(BASE_SCALING_FACTOR) ||
      this.order.info.scalingFactor.eq(BASE_SCALING_FACTOR)
    );
  }

  /**
   * Determine if this is an exact-out order based on the scalingFactor
   */
  public isExactOut(): boolean {
    return this.order.info.scalingFactor.lt(BASE_SCALING_FACTOR);
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
