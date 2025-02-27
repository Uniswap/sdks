import { Currency, CurrencyAmount, Price, TradeType } from "@uniswap/sdk-core";
import { UnsignedV2DutchOrder, UnsignedV2DutchOrderInfo } from "../order";
export declare class V2DutchOrderTrade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
    readonly tradeType: TTradeType;
    readonly order: UnsignedV2DutchOrder;
    private _inputAmount;
    private _outputAmounts;
    private _currencyIn;
    private _currenciesOut;
    constructor({ currencyIn, currenciesOut, orderInfo, tradeType, }: {
        currencyIn: TInput;
        currenciesOut: TOutput[];
        orderInfo: UnsignedV2DutchOrderInfo;
        tradeType: TTradeType;
    });
    get inputAmount(): CurrencyAmount<TInput>;
    get outputAmounts(): CurrencyAmount<TOutput>[];
    private _firstNonFeeOutputStartEndAmounts;
    private getFirstNonFeeOutputStartEndAmounts;
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
}
