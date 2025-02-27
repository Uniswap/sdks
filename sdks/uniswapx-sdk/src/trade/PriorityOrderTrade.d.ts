import { Currency, CurrencyAmount, Price, TradeType } from "@uniswap/sdk-core";
import { UnsignedPriorityOrder, UnsignedPriorityOrderInfo } from "../order";
export declare class PriorityOrderTrade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
    readonly tradeType: TTradeType;
    readonly order: UnsignedPriorityOrder;
    readonly expectedAmounts: {
        expectedAmountIn: string;
        expectedAmountOut: string;
    } | undefined;
    private _inputAmount;
    private _outputAmounts;
    private _currencyIn;
    private _currenciesOut;
    constructor({ currencyIn, currenciesOut, orderInfo, tradeType, expectedAmounts, }: {
        currencyIn: TInput;
        currenciesOut: TOutput[];
        orderInfo: UnsignedPriorityOrderInfo;
        tradeType: TTradeType;
        expectedAmounts?: {
            expectedAmountIn: string;
            expectedAmountOut: string;
        };
    });
    get inputAmount(): CurrencyAmount<TInput>;
    get outputAmounts(): CurrencyAmount<TOutput>[];
    private _firstNonFeeOutputAmount;
    private getFirstNonFeeOutputAmount;
    get outputAmount(): CurrencyAmount<TOutput>;
    minimumAmountOut(): CurrencyAmount<TOutput>;
    maximumAmountIn(): CurrencyAmount<TInput>;
    private _executionPrice;
    /**
     * The price expressed in terms of output amount/input amount.
     */
    get executionPrice(): Price<TInput, TOutput>;
    /**
     * Return the execution price after accounting for slippage tolerance
     * @returns The execution price
     */
    worstExecutionPrice(): Price<TInput, TOutput>;
    private getExpectedAmountIn;
    private getExpectedAmountOut;
}
