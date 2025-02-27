"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_core_1 = require("@uniswap/sdk-core");
const ethers_1 = require("ethers");
const V3DutchOrderTrade_1 = require("./V3DutchOrderTrade");
const utils_1 = require("./utils");
const USDC = new sdk_core_1.Token(1, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6, "USDC");
const DAI = new sdk_core_1.Token(1, "0x6B175474E89094C44Da98b954EedeAC495271d0F", 18, "DAI");
describe("V3DutchOrderTrade", () => {
    const NON_FEE_OUTPUT_AMOUNT = ethers_1.BigNumber.from("1000000000000000000");
    const NON_FEE_MINIMUM_AMOUNT_OUT = ethers_1.BigNumber.from("900000000000000000");
    const orderInfo = {
        deadline: Math.floor(new Date().getTime() / 1000) + 1000,
        reactor: "0x0000000000000000000000000000000000000000",
        swapper: "0x0000000000000000000000000000000000000000",
        nonce: ethers_1.BigNumber.from(10),
        cosigner: "0x0000000000000000000000000000000000000000",
        startingBaseFee: ethers_1.BigNumber.from(0),
        additionalValidationContract: ethers_1.ethers.constants.AddressZero,
        additionalValidationData: "0x",
        input: {
            token: USDC.address,
            startAmount: ethers_1.BigNumber.from(1000),
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: ethers_1.BigNumber.from(1000),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        },
        outputs: [
            {
                token: DAI.address,
                startAmount: NON_FEE_OUTPUT_AMOUNT,
                curve: {
                    relativeBlocks: [21],
                    relativeAmounts: [BigInt("100000000000000000")],
                },
                recipient: "0x0000000000000000000000000000000000000000",
                minAmount: NON_FEE_MINIMUM_AMOUNT_OUT,
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
            },
            {
                token: DAI.address,
                startAmount: ethers_1.BigNumber.from("1000"),
                curve: {
                    relativeBlocks: [21],
                    relativeAmounts: [BigInt("100")],
                },
                recipient: "0x0000000000000000000000000000000000000000",
                minAmount: ethers_1.BigNumber.from("900"),
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
            },
        ],
    };
    const trade = new V3DutchOrderTrade_1.V3DutchOrderTrade({
        currencyIn: USDC,
        currenciesOut: [DAI],
        orderInfo,
        tradeType: sdk_core_1.TradeType.EXACT_INPUT,
    });
    describe("Exact input", () => {
        it("returns the right input amount for an exact-in trade", () => {
            expect(trade.inputAmount.quotient.toString()).toEqual(orderInfo.input.startAmount.toString());
        });
        it("returns the correct non-fee output amount", () => {
            expect(trade.outputAmount.quotient.toString()).toEqual(NON_FEE_OUTPUT_AMOUNT.toString());
        });
        it("returns the correct minimum amount out", () => {
            expect(trade.minimumAmountOut().quotient.toString()).toEqual(NON_FEE_MINIMUM_AMOUNT_OUT.toString());
        });
    });
    describe("Exact output", () => {
        const outOrderInfo = {
            deadline: Math.floor(new Date().getTime() / 1000) + 1000,
            reactor: "0x0000000000000000000000000000000000000000",
            swapper: "0x0000000000000000000000000000000000000000",
            nonce: ethers_1.BigNumber.from(10),
            cosigner: "0x0000000000000000000000000000000000000000",
            startingBaseFee: ethers_1.BigNumber.from(0),
            additionalValidationContract: ethers_1.ethers.constants.AddressZero,
            additionalValidationData: "0x",
            input: {
                token: USDC.address,
                startAmount: ethers_1.BigNumber.from(1000),
                curve: {
                    relativeBlocks: [10],
                    relativeAmounts: [BigInt(-100)],
                },
                maxAmount: ethers_1.BigNumber.from(1100),
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
            },
            outputs: [
                {
                    token: DAI.address,
                    startAmount: NON_FEE_OUTPUT_AMOUNT,
                    curve: {
                        relativeBlocks: [],
                        relativeAmounts: [],
                    },
                    recipient: "0x0000000000000000000000000000000000000000",
                    minAmount: NON_FEE_OUTPUT_AMOUNT,
                    adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
                },
                {
                    token: DAI.address,
                    startAmount: ethers_1.BigNumber.from("1000"),
                    curve: {
                        relativeBlocks: [],
                        relativeAmounts: [],
                    },
                    recipient: "0x0000000000000000000000000000000000000000",
                    minAmount: ethers_1.BigNumber.from("1000"),
                    adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
                },
            ],
        };
        const trade = new V3DutchOrderTrade_1.V3DutchOrderTrade({
            currencyIn: USDC,
            currenciesOut: [DAI],
            orderInfo: outOrderInfo,
            tradeType: sdk_core_1.TradeType.EXACT_OUTPUT,
        });
        it("returns the correct maximum amount in", () => {
            expect(trade.maximumAmountIn().quotient.toString()).toEqual(outOrderInfo.input.maxAmount.toString());
        });
    });
    describe("Qualitative tests", () => {
        it("works for native output trades", () => {
            const ethOutputOrderInfo = {
                ...orderInfo,
                outputs: [
                    {
                        token: utils_1.NativeAssets.ETH,
                        startAmount: NON_FEE_OUTPUT_AMOUNT,
                        curve: {
                            relativeBlocks: [21],
                            relativeAmounts: [BigInt("100000000000000000")],
                        },
                        recipient: "0x0000000000000000000000000000000000000000",
                        minAmount: NON_FEE_MINIMUM_AMOUNT_OUT,
                        adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
                    },
                ],
            };
            const ethOutputTrade = new V3DutchOrderTrade_1.V3DutchOrderTrade({
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
                        curve: {
                            relativeBlocks: [21],
                            relativeAmounts: [BigInt("100000000000000000")],
                        },
                        recipient: "0x0000000000000000000000000000000000000000",
                        minAmount: NON_FEE_MINIMUM_AMOUNT_OUT,
                        adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
                    },
                ],
            };
            const ethOutputTrade = new V3DutchOrderTrade_1.V3DutchOrderTrade({
                currencyIn: USDC,
                currenciesOut: [sdk_core_1.Ether.onChain(1)],
                orderInfo: ethOutputOrderInfo,
                tradeType: sdk_core_1.TradeType.EXACT_INPUT,
            });
            expect(ethOutputTrade.outputAmount.currency).toEqual(sdk_core_1.Ether.onChain(1));
        });
    });
});
//# sourceMappingURL=V3DutchOrderTrade.test.js.map