"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelayOrderTrade = void 0;
const sdk_core_1 = require("@uniswap/sdk-core");
const order_1 = require("../order");
const utils_1 = require("./utils");
/// A high level Trade object that representes a Relay order
/// It requires an output amount to be provided in order to calculate execution price
/// @dev the execution price does not take into account gas fees
class RelayOrderTrade {
    tradeType;
    order;
    _outputAmount;
    _currenciesIn;
    // Since Relay orders have no concept of an output amount, it must be provided as a constructor param
    // this is the output amount from the encoded swap, or the value to be used for execution price
    constructor({ currenciesIn, outputAmount, orderInfo, tradeType, }) {
        this._currenciesIn = currenciesIn;
        this._outputAmount = outputAmount;
        this.tradeType = tradeType;
        // assume single chain
        this.order = new order_1.RelayOrder(orderInfo, outputAmount.currency.chainId);
    }
    get outputAmount() {
        return this._outputAmount;
    }
    _feeStartEndAmounts;
    _inputAmount;
    // This is the "tip" given to fillers of the order
    getFeeInputStartEndAmounts() {
        if (this._feeStartEndAmounts)
            return this._feeStartEndAmounts;
        if (!this.order.info.fee) {
            throw new Error("no fee found");
        }
        // assume single chain ids across all outputs for now
        const currencyIn = this._currenciesIn.find((currency) => (0, utils_1.areCurrenciesEqual)(currency, this.order.info.fee.token, currency.chainId));
        if (!currencyIn) {
            throw new Error("currency output from order must exist in currenciesOut list");
        }
        const startEndAmounts = {
            startAmount: sdk_core_1.CurrencyAmount.fromRawAmount(currencyIn, this.order.info.fee.startAmount.toString()),
            endAmount: sdk_core_1.CurrencyAmount.fromRawAmount(currencyIn, this.order.info.fee.endAmount.toString()),
        };
        this._feeStartEndAmounts = startEndAmounts;
        return startEndAmounts;
    }
    // This is the input for the order
    getInputAmount() {
        if (this._inputAmount)
            return this._inputAmount;
        if (!this.order.info.input) {
            throw new Error("no input found");
        }
        // assume single chain ids across all outputs for now
        const currencyIn = this._currenciesIn.find((currency) => (0, utils_1.areCurrenciesEqual)(currency, this.order.info.input.token, currency.chainId));
        if (!currencyIn) {
            throw new Error("currency input from order must exist in currenciesIn list");
        }
        const inputAmount = sdk_core_1.CurrencyAmount.fromRawAmount(currencyIn, this.order.info.input.amount.toString());
        this._inputAmount = inputAmount;
        return inputAmount;
    }
    // Gets the start amount for the first non-fee input
    // Relay order inputs only increase, so maximum denotes endAmount
    get amountIn() {
        return this.getInputAmount();
    }
    get amountInFee() {
        return this.getFeeInputStartEndAmounts().startAmount;
    }
    get maximumAmountInFee() {
        return this.getFeeInputStartEndAmounts().endAmount;
    }
    _executionPrice;
    /**
     * The price expressed in terms of output amount/input amount.
     * @dev this only takes into account non fee inputs (does not include gas)
     */
    get executionPrice() {
        return (this._executionPrice ??
            (this._executionPrice = new sdk_core_1.Price(this.amountIn.currency, this.outputAmount.currency, this.amountIn.quotient, this.outputAmount.quotient)));
    }
    /**
     * Return the execution price after accounting for slippage tolerance
     * @dev this only takes into account non fee inputs (does not include gas)
     * @returns The execution price
     */
    worstExecutionPrice() {
        return new sdk_core_1.Price(this.amountIn.currency, this.outputAmount.currency, this.amountIn.quotient, this.outputAmount.quotient);
    }
}
exports.RelayOrderTrade = RelayOrderTrade;
//# sourceMappingURL=RelayOrderTrade.js.map