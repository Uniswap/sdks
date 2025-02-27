"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.V3DutchOrderTrade = void 0;
const sdk_core_1 = require("@uniswap/sdk-core");
const V3DutchOrder_1 = require("../order/V3DutchOrder");
const utils_1 = require("./utils");
class V3DutchOrderTrade {
    tradeType;
    order;
    _inputAmount;
    _outputAmounts;
    _currencyIn;
    _currenciesOut;
    constructor({ currencyIn, currenciesOut, orderInfo, tradeType, }) {
        this._currencyIn = currencyIn;
        this._currenciesOut = currenciesOut;
        this.tradeType = tradeType;
        // Assuming not cross-chain
        this.order = new V3DutchOrder_1.UnsignedV3DutchOrder(orderInfo, currencyIn.chainId);
    }
    get inputAmount() {
        if (this._inputAmount)
            return this._inputAmount;
        const amount = sdk_core_1.CurrencyAmount.fromRawAmount(this._currencyIn, this.order.info.input.startAmount.toString());
        this._inputAmount = amount;
        return amount;
    }
    get outputAmounts() {
        if (this._outputAmounts)
            return this._outputAmounts;
        const amounts = this.order.info.outputs.map((output) => {
            // Assuming all outputs on the same chain
            const currencyOut = this._currenciesOut.find((currency) => (0, utils_1.areCurrenciesEqual)(currency, output.token, currency.chainId));
            if (!currencyOut) {
                throw new Error("Currency out not found");
            }
            return sdk_core_1.CurrencyAmount.fromRawAmount(currencyOut, output.startAmount.toString());
        });
        this._outputAmounts = amounts;
        return amounts;
    }
    // Same assumption as V2 that there is only one non-fee output at a time, and it exists at index 0
    get outputAmount() {
        return this.outputAmounts[0];
    }
    minimumAmountOut() {
        const nonFeeOutput = this.order.info.outputs[0];
        const relativeAmounts = nonFeeOutput.curve.relativeAmounts;
        const startAmount = nonFeeOutput.startAmount;
        // Get the maximum of the relative amounts
        const maxRelativeAmount = relativeAmounts.reduce((max, amount) => amount > max ? amount : max, BigInt(0));
        // minimum is the start - the max of the relative amounts
        const minOut = startAmount.sub(maxRelativeAmount.toString());
        return sdk_core_1.CurrencyAmount.fromRawAmount(this.outputAmount.currency, minOut.toString());
    }
    maximumAmountIn() {
        const maxAmountIn = this.order.info.input.maxAmount;
        return sdk_core_1.CurrencyAmount.fromRawAmount(this._currencyIn, maxAmountIn.toString());
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
}
exports.V3DutchOrderTrade = V3DutchOrderTrade;
//# sourceMappingURL=V3DutchOrderTrade.js.map