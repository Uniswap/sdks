"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_core_1 = require("@uniswap/sdk-core");
const ethers_1 = require("ethers");
const utils_1 = require("./utils");
const _1 = require(".");
const USDC = new sdk_core_1.Token(1, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6, "USDC");
const DAI = new sdk_core_1.Token(1, "0x6B175474E89094C44Da98b954EedeAC495271d0F", 18, "DAI");
describe("V2DutchOrderTrade", () => {
    const NON_FEE_OUTPUT_AMOUNT = ethers_1.BigNumber.from("1000000000000000000");
    const NON_FEE_MINIMUM_AMOUNT_OUT = ethers_1.BigNumber.from("900000000000000000");
    const orderInfo = {
        deadline: Math.floor(new Date().getTime() / 1000) + 1000,
        reactor: "0x0000000000000000000000000000000000000000",
        swapper: "0x0000000000000000000000000000000000000000",
        nonce: ethers_1.BigNumber.from(10),
        cosigner: "0x0000000000000000000000000000000000000000",
        additionalValidationContract: ethers_1.ethers.constants.AddressZero,
        additionalValidationData: "0x",
        input: {
            token: USDC.address,
            startAmount: ethers_1.BigNumber.from(1000),
            endAmount: ethers_1.BigNumber.from(1000),
        },
        outputs: [
            {
                token: DAI.address,
                startAmount: NON_FEE_OUTPUT_AMOUNT,
                endAmount: NON_FEE_MINIMUM_AMOUNT_OUT,
                recipient: "0x0000000000000000000000000000000000000000",
            },
            {
                token: DAI.address,
                startAmount: ethers_1.BigNumber.from("1000"),
                endAmount: ethers_1.BigNumber.from("2000"),
                recipient: "0x0000000000000000000000000000000000000000",
            },
        ],
    };
    const trade = new _1.V2DutchOrderTrade({
        currencyIn: USDC,
        currenciesOut: [DAI],
        orderInfo,
        tradeType: sdk_core_1.TradeType.EXACT_INPUT,
    });
    it("returns the right input amount for an exact-in trade", () => {
        expect(trade.inputAmount.quotient.toString()).toEqual(orderInfo.input.startAmount.toString());
    });
    it("returns the correct non-fee output amount", () => {
        expect(trade.outputAmount.quotient.toString()).toEqual(NON_FEE_OUTPUT_AMOUNT.toString());
    });
    it("returns the correct minimum amount out", () => {
        expect(trade.minimumAmountOut().quotient.toString()).toEqual(NON_FEE_MINIMUM_AMOUNT_OUT.toString());
    });
    it("works for native output trades", () => {
        const ethOutputOrderInfo = {
            ...orderInfo,
            outputs: [
                {
                    token: utils_1.NativeAssets.ETH,
                    startAmount: NON_FEE_OUTPUT_AMOUNT,
                    endAmount: NON_FEE_MINIMUM_AMOUNT_OUT,
                    recipient: "0x0000000000000000000000000000000000000000",
                },
            ],
        };
        const ethOutputTrade = new _1.V2DutchOrderTrade({
            currencyIn: USDC,
            currenciesOut: [sdk_core_1.Ether.onChain(1)],
            orderInfo: ethOutputOrderInfo,
            tradeType: sdk_core_1.TradeType.EXACT_INPUT,
        });
        expect(ethOutputTrade.outputAmount.currency).toEqual(sdk_core_1.Ether.onChain(1));
    });
    it("works for native output trades where order info has 0 address", () => {
        const ethOutputOrderInfo = {
            ...orderInfo,
            outputs: [
                {
                    token: ethers_1.constants.AddressZero,
                    startAmount: NON_FEE_OUTPUT_AMOUNT,
                    endAmount: NON_FEE_MINIMUM_AMOUNT_OUT,
                    recipient: "0x0000000000000000000000000000000000000000",
                },
            ],
        };
        const ethOutputTrade = new _1.V2DutchOrderTrade({
            currencyIn: USDC,
            currenciesOut: [sdk_core_1.Ether.onChain(1)],
            orderInfo: ethOutputOrderInfo,
            tradeType: sdk_core_1.TradeType.EXACT_INPUT,
        });
        expect(ethOutputTrade.outputAmount.currency).toEqual(sdk_core_1.Ether.onChain(1));
    });
});
//# sourceMappingURL=V2DutchOrderTrade.test.js.map