import { Currency, CurrencyAmount, Price, TradeType } from "@uniswap/sdk-core";
import { RelayOrder, RelayOrderInfo } from "../order";
export declare class RelayOrderTrade<TInput extends Currency, TOutput extends Currency, TTradeType extends TradeType> {
    readonly tradeType: TTradeType;
    readonly order: RelayOrder;
    private _outputAmount;
    private _currenciesIn;
    constructor({ currenciesIn, outputAmount, orderInfo, tradeType, }: {
        currenciesIn: TInput[];
        outputAmount: CurrencyAmount<TOutput>;
        orderInfo: RelayOrderInfo;
        tradeType: TTradeType;
    });
    get outputAmount(): CurrencyAmount<TOutput>;
    private _feeStartEndAmounts;
    private _inputAmount;
    private getFeeInputStartEndAmounts;
    private getInputAmount;
    get amountIn(): CurrencyAmount<TInput>;
    get amountInFee(): CurrencyAmount<TInput>;
    get maximumAmountInFee(): CurrencyAmount<TInput>;
    private _executionPrice;
    /**
     * The price expressed in terms of output amount/input amount.
     * @dev this only takes into account non fee inputs (does not include gas)
     */
    get executionPrice(): Price<TInput, TOutput>;
    /**
     * Return the execution price after accounting for slippage tolerance
     * @dev this only takes into account non fee inputs (does not include gas)
     * @returns The execution price
     */
    worstExecutionPrice(): Price<TInput, TOutput>;
}
