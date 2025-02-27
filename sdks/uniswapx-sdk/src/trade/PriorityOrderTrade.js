"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriorityOrderTrade = void 0;
const sdk_core_1 = require("@uniswap/sdk-core");
const order_1 = require("../order");
const utils_1 = require("./utils");
class PriorityOrderTrade {
    tradeType;
    order;
    expectedAmounts;
    _inputAmount;
    _outputAmounts;
    _currencyIn;
    _currenciesOut;
    constructor({ currencyIn, currenciesOut, orderInfo, tradeType, expectedAmounts, }) {
        this._currencyIn = currencyIn;
        this._currenciesOut = currenciesOut;
        this.tradeType = tradeType;
        this.expectedAmounts = expectedAmounts;
        // assume single-chain for now
        this.order = new order_1.UnsignedPriorityOrder(orderInfo, currencyIn.chainId);
    }
    get inputAmount() {
        if (this._inputAmount)
            return this._inputAmount;
        // If we have expected quote data use that, otherwise use the order input amount
        const amount = this.expectedAmounts?.expectedAmountIn
            ? this.getExpectedAmountIn()
            : sdk_core_1.CurrencyAmount.fromRawAmount(this._currencyIn, this.order.info.input.amount.toString());
        this._inputAmount = amount;
        return amount;
    }
    get outputAmounts() {
        if (this._outputAmounts)
            return this._outputAmounts;
        const amounts = this.order.info.outputs.map((output) => {
            // assume single chain ids across all outputs for now
            const currencyOut = this._currenciesOut.find((currency) => (0, utils_1.areCurrenciesEqual)(currency, output.token, currency.chainId));
            if (!currencyOut) {
                throw new Error("currency not found in output array");
            }
            return sdk_core_1.CurrencyAmount.fromRawAmount(currencyOut, output.amount.toString());
        });
        this._outputAmounts = amounts;
        return amounts;
    }
    _firstNonFeeOutputAmount;
    getFirstNonFeeOutputAmount() {
        if (this._firstNonFeeOutputAmount)
            return this._firstNonFeeOutputAmount;
        if (this.order.info.outputs.length === 0) {
            throw new Error("there must be at least one output token");
        }
        const output = this.order.info.outputs[0];
        // assume single chain ids across all outputs for now
        const currencyOut = this._currenciesOut.find((currency) => (0, utils_1.areCurrenciesEqual)(currency, output.token, currency.chainId));
        if (!currencyOut) {
            throw new Error("currency output from order must exist in currenciesOut list");
        }
        const amount = sdk_core_1.CurrencyAmount.fromRawAmount(currencyOut, output.amount.toString());
        this._firstNonFeeOutputAmount = amount;
        return amount;
    }
    // TODO: revise when there are actually multiple output amounts. for now, assume only one non-fee output at a time
    get outputAmount() {
        // If we have expected quote data use that, otherwise use the first non-fee output
        return this.expectedAmounts?.expectedAmountOut
            ? this.getExpectedAmountOut()
            : this.getFirstNonFeeOutputAmount();
    }
    minimumAmountOut() {
        return this.getFirstNonFeeOutputAmount();
    }
    maximumAmountIn() {
        return sdk_core_1.CurrencyAmount.fromRawAmount(this._currencyIn, this.order.info.input.amount.toString());
    }
    _executionPrice;
    /**
     * The price expressed in terms of output amount/input amount.
     */
    get executionPrice() {
        return (this._executionPrice ??
            (this._executionPrice = new sdk_core_1.Price(this.inputAmount.currency, this.outputAmount.currency, this.inputAmount.quotient, this.outputAmount.quotient)));
    }
    /**
     * Return the execution price after accounting for slippage tolerance
     * @returns The execution price
     */
    worstExecutionPrice() {
        return new sdk_core_1.Price(this.inputAmount.currency, this.outputAmount.currency, this.maximumAmountIn().quotient, this.minimumAmountOut().quotient);
    }
    getExpectedAmountIn() {
        if (!this.expectedAmounts?.expectedAmountIn) {
            throw new Error("expectedAmountIn not set");
        }
        return sdk_core_1.CurrencyAmount.fromRawAmount(this._currencyIn, this.expectedAmounts.expectedAmountIn);
    }
    getExpectedAmountOut() {
        if (!this.expectedAmounts?.expectedAmountOut) {
            throw new Error("expectedAmountOut not set");
        }
        return sdk_core_1.CurrencyAmount.fromRawAmount(this._currenciesOut[0], this.expectedAmounts.expectedAmountOut);
    }
}
exports.PriorityOrderTrade = PriorityOrderTrade;
//# sourceMappingURL=PriorityOrderTrade.js.map