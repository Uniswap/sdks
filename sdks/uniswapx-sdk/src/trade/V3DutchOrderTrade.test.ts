import { Currency, CurrencyAmount, Ether, Price, Token, TradeType } from "@uniswap/sdk-core";
import { BigNumber, constants, ethers } from "ethers";

import { UnsignedV3DutchOrderInfo } from "../order/V3DutchOrder";

import { V3DutchOrderTrade } from "./V3DutchOrderTrade";
import { NativeAssets } from "./utils";

const USDC = new Token(
	1,
	"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
	6,
	"USDC"
);
const DAI = new Token(
	1,
	"0x6B175474E89094C44Da98b954EedeAC495271d0F",
	18,
	"DAI"
);

describe("V3DutchOrderTrade", () => {
	const NON_FEE_OUTPUT_AMOUNT = BigNumber.from("1000000000000000000");
	const NON_FEE_MINIMUM_AMOUNT_OUT = BigNumber.from("900000000000000000");

	const orderInfo: UnsignedV3DutchOrderInfo = {
		deadline: Math.floor(new Date().getTime() / 1000) + 1000,
		reactor: "0x0000000000000000000000000000000000000000",
		swapper: "0x0000000000000000000000000000000000000000",
		nonce: BigNumber.from(10),
		cosigner: "0x0000000000000000000000000000000000000000",
		startingBaseFee: BigNumber.from(0),
		additionalValidationContract: ethers.constants.AddressZero,
		additionalValidationData: "0x",
		input: {
			token: USDC.address,
			startAmount: BigNumber.from(1000),
			curve: {
				relativeBlocks: [],
				relativeAmounts: [],
			},
			maxAmount: BigNumber.from(1000),
			adjustmentPerGweiBaseFee: BigNumber.from(0),
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
				adjustmentPerGweiBaseFee: BigNumber.from(0),
			},
			{
				token: DAI.address,
				startAmount: BigNumber.from("1000"),
				curve: {
					relativeBlocks: [21],
					relativeAmounts: [BigInt("100")],
				},
				recipient: "0x0000000000000000000000000000000000000000",
				minAmount: BigNumber.from("900"),
				adjustmentPerGweiBaseFee: BigNumber.from(0),
			},
		],
	};

	const trade = new V3DutchOrderTrade<Currency, Currency, TradeType>({
		currencyIn: USDC,
		currenciesOut: [DAI],
		orderInfo,
		tradeType: TradeType.EXACT_INPUT,
	});

	describe("Exact input", () => {
		it("returns the right input amount for an exact-in trade", () => {
			expect(trade.inputAmount.quotient.toString()).toEqual(
				orderInfo.input.startAmount.toString()
			);
		});

		it("returns the correct non-fee output amount", () => {
			expect(trade.outputAmount.quotient.toString()).toEqual(
				NON_FEE_OUTPUT_AMOUNT.toString()
			);
		});

		it("returns the correct minimum amount out", () => {
			expect(trade.minimumAmountOut().quotient.toString()).toEqual(
				NON_FEE_MINIMUM_AMOUNT_OUT.toString()
			);
		});
	});

	describe("Exact output", () => {
		const outOrderInfo: UnsignedV3DutchOrderInfo = {
			deadline: Math.floor(new Date().getTime() / 1000) + 1000,
			reactor: "0x0000000000000000000000000000000000000000",
			swapper: "0x0000000000000000000000000000000000000000",
			nonce: BigNumber.from(10),
			cosigner: "0x0000000000000000000000000000000000000000",
			startingBaseFee: BigNumber.from(0),
			additionalValidationContract: ethers.constants.AddressZero,
			additionalValidationData: "0x",
			input: {
				token: USDC.address,
				startAmount: BigNumber.from(1000),
				curve: {
					relativeBlocks: [10],
					relativeAmounts: [BigInt(-100)],
				},
				maxAmount: BigNumber.from(1100),
				adjustmentPerGweiBaseFee: BigNumber.from(0),
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
					adjustmentPerGweiBaseFee: BigNumber.from(0),
				},
				{
					token: DAI.address,
					startAmount: BigNumber.from("1000"),
					curve: {
						relativeBlocks: [],
						relativeAmounts: [],
					},
					recipient: "0x0000000000000000000000000000000000000000",
					minAmount: BigNumber.from("1000"),
					adjustmentPerGweiBaseFee: BigNumber.from(0),
				},
			],
		};
		const trade = new V3DutchOrderTrade<Currency, Currency, TradeType>({
			currencyIn: USDC,
			currenciesOut: [DAI],
			orderInfo: outOrderInfo,
			tradeType: TradeType.EXACT_OUTPUT,
		});

		it("returns the correct maximum amount in", () => {
			expect(trade.maximumAmountIn().quotient.toString()).toEqual(
				outOrderInfo.input.maxAmount.toString()
			);
		});
	});

	describe("Qualitative tests", () => {
		it("works for native output trades", () => {
			const ethOutputOrderInfo = {
				...orderInfo,
				outputs: [
					{
						token: NativeAssets.ETH,
						startAmount: NON_FEE_OUTPUT_AMOUNT,
						curve: {
							relativeBlocks: [21],
							relativeAmounts: [BigInt("100000000000000000")],
						},
						recipient: "0x0000000000000000000000000000000000000000",
						minAmount: NON_FEE_MINIMUM_AMOUNT_OUT,
						adjustmentPerGweiBaseFee: BigNumber.from(0),
					},
				],
			};
			const ethOutputTrade = new V3DutchOrderTrade<Currency, Currency, TradeType>(
				{
					currencyIn: USDC,
					currenciesOut: [Ether.onChain(1)],
					orderInfo: ethOutputOrderInfo,
					tradeType: TradeType.EXACT_INPUT,
				}
			);
			expect(ethOutputTrade.outputAmount.currency).toEqual(Ether.onChain(1));
		});

		it("works for native output trades where order info has 0 address", () => {
			const ethOutputOrderInfo = {
				...orderInfo,
				outputs: [
					{
						token: constants.AddressZero,
						startAmount: NON_FEE_OUTPUT_AMOUNT,
						curve: {
							relativeBlocks: [21],
							relativeAmounts: [BigInt("100000000000000000")],
						},
						recipient: "0x0000000000000000000000000000000000000000",
						minAmount: NON_FEE_MINIMUM_AMOUNT_OUT,
						adjustmentPerGweiBaseFee: BigNumber.from(0),
					},
				],
			};
			const ethOutputTrade = new V3DutchOrderTrade<Currency, Currency, TradeType>(
				{
					currencyIn: USDC,
					currenciesOut: [Ether.onChain(1)],
					orderInfo: ethOutputOrderInfo,
					tradeType: TradeType.EXACT_INPUT,
				}
			);
			expect(ethOutputTrade.outputAmount.currency).toEqual(Ether.onChain(1));
		});
	});

	describe("Expected amounts", () => {
		const expectedAmounts = {
			expectedAmountIn: "800",
			expectedAmountOut: "900",
		};

		const tradeWithExpectedAmounts = new V3DutchOrderTrade<Currency, Currency, TradeType>({
			currencyIn: USDC,
			currenciesOut: [DAI],
			orderInfo,
			tradeType: TradeType.EXACT_INPUT,
			expectedAmounts,
		});

		it("uses expectedAmountIn when provided", () => {
			expect(tradeWithExpectedAmounts.inputAmount.quotient.toString()).toEqual(
				expectedAmounts.expectedAmountIn
			);
		});

		it("uses expectedAmountOut when provided", () => {
			expect(tradeWithExpectedAmounts.outputAmount.quotient.toString()).toEqual(
				expectedAmounts.expectedAmountOut
			);
		});

		it("falls back to order amounts when expectedAmounts is not provided", () => {
			expect(trade.inputAmount.quotient.toString()).toEqual(
				orderInfo.input.startAmount.toString()
			);
			expect(trade.outputAmount.quotient.toString()).toEqual(
				NON_FEE_OUTPUT_AMOUNT.toString()
			);
		});

		it("throws when accessing expectedAmountIn that wasn't provided", () => {
			const tradeWithoutExpected = new V3DutchOrderTrade<Currency, Currency, TradeType>({
				currencyIn: USDC,
				currenciesOut: [DAI],
				orderInfo,
				tradeType: TradeType.EXACT_INPUT,
			});

		// Using private method through any to test error case
		expect(() => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(tradeWithoutExpected as any).getExpectedAmountIn();
		}).toThrow("expectedAmountIn not set");
		});

		it("throws when accessing expectedAmountOut that wasn't provided", () => {
			const tradeWithoutExpected = new V3DutchOrderTrade<Currency, Currency, TradeType>({
				currencyIn: USDC,
				currenciesOut: [DAI],
				orderInfo,
				tradeType: TradeType.EXACT_INPUT,
			});

		// Using private method through any to test error case
		expect(() => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(tradeWithoutExpected as any).getExpectedAmountOut();
		}).toThrow("expectedAmountOut not set");
		});

		describe("Execution price", () => {
			it("expected amounts are used when provided", () => {
				const inputAmount = BigNumber.from(1000);
				const decay = 100000;
				const outOrderInfo: UnsignedV3DutchOrderInfo = {
					...orderInfo,
					input: {
						token: USDC.address,
						startAmount: inputAmount,
						curve: {
							relativeBlocks: [],
							relativeAmounts: [],
						},
						maxAmount: inputAmount,
						adjustmentPerGweiBaseFee: BigNumber.from(0),
					},
					outputs: [
						{
							token: DAI.address,
							startAmount: NON_FEE_OUTPUT_AMOUNT,
							curve: {
								relativeBlocks: [10],
								relativeAmounts: [BigInt(decay)],
							},
							recipient: "0x0000000000000000000000000000000000000000",
							minAmount: NON_FEE_OUTPUT_AMOUNT,
							adjustmentPerGweiBaseFee: BigNumber.from(0),
						},
					],
				};
				const exactInputTrade = new V3DutchOrderTrade<Currency, Currency, TradeType>({
					currencyIn: USDC,
					currenciesOut: [DAI],
					orderInfo: outOrderInfo,
					tradeType: TradeType.EXACT_INPUT,
					expectedAmounts: {
						expectedAmountIn: inputAmount.toString(),
						expectedAmountOut: NON_FEE_OUTPUT_AMOUNT.sub(BigNumber.from(decay).div(2)).toString(),
					},
				});
				expect(exactInputTrade.inputAmount.quotient.toString()).toEqual(inputAmount.toString());
				expect(exactInputTrade.outputAmount.quotient.toString()).toEqual(NON_FEE_OUTPUT_AMOUNT.sub(BigNumber.from(decay).div(2)).toString());
				const executionPrice = exactInputTrade.executionPrice;
				const inputCurrencyAmount = CurrencyAmount.fromRawAmount(USDC, inputAmount.toString());
				const outputCurrencyAmount = CurrencyAmount.fromRawAmount(DAI, NON_FEE_OUTPUT_AMOUNT.sub(BigNumber.from(decay).div(2)).toString());
				const expectedPrice = new Price(USDC, DAI, inputCurrencyAmount.quotient, outputCurrencyAmount.quotient);
				expect(executionPrice.quotient.toString()).toEqual(expectedPrice.quotient.toString());
			});

			it("order amounts are used when expected amounts are not provided", () => {
				
				expect(trade.inputAmount.quotient.toString()).toEqual(trade.order.info.input.startAmount.toString());
				expect(trade.outputAmount.quotient.toString()).toEqual(trade.order.info.outputs[0].startAmount.toString());
			});
			
		});

		describe("Worst execution price", () => {
			it("calculates worst execution price correctly for exact input", () => {
				const decay = 100000;
				const exactInputOrderInfo: UnsignedV3DutchOrderInfo = {
					...orderInfo,
					input: {
						token: USDC.address,
						startAmount: BigNumber.from(1000),
						curve: {
							relativeBlocks: [],
							relativeAmounts: [],
						},
						maxAmount: BigNumber.from(1000),
						adjustmentPerGweiBaseFee: BigNumber.from(0),
					},
					outputs: [
						{
							token: DAI.address,
							startAmount: NON_FEE_OUTPUT_AMOUNT,
							curve: {
								relativeBlocks: [10],
								relativeAmounts: [BigInt(decay)],
							},
							recipient: "0x0000000000000000000000000000000000000000",
							minAmount: NON_FEE_OUTPUT_AMOUNT.sub(BigNumber.from(decay)),
							adjustmentPerGweiBaseFee: BigNumber.from(0),
						},
					],
				};
				const halfDecay = BigNumber.from(decay).div(2);
				const exactInputTrade = new V3DutchOrderTrade<Currency, Currency, TradeType>({
					currencyIn: USDC,
					currenciesOut: [DAI],
					orderInfo: exactInputOrderInfo,
					tradeType: TradeType.EXACT_INPUT,
					expectedAmounts: {
						expectedAmountIn: "1000",
						expectedAmountOut: NON_FEE_OUTPUT_AMOUNT.sub(halfDecay).toString(),
					},
				});
				const worstPrice = exactInputTrade.worstExecutionPrice();
				const maxAmountIn = 1000;
				const minAmountOut = NON_FEE_OUTPUT_AMOUNT.sub(decay);

				expect(worstPrice.quotient.toString()).toEqual(
					minAmountOut.div(maxAmountIn).toString()
				);

				// Verify worst price is worse than execution price
				expect(worstPrice.lessThan(exactInputTrade.executionPrice)).toBe(true);
				expect(worstPrice.baseCurrency).toEqual(USDC);
				expect(worstPrice.quoteCurrency).toEqual(DAI);
			});

			it("matches execution price when min/max amounts equal start amounts", () => {
				const orderInfoNoSlippage = {
					...orderInfo,
					input: {
						...orderInfo.input,
						maxAmount: orderInfo.input.startAmount, // Same as start amount
					},
					outputs: [
						{
							...orderInfo.outputs[0],
							minAmount: orderInfo.outputs[0].startAmount, // Same as start amount
							curve: {
								relativeBlocks: [],
								relativeAmounts: [],
							},
						},
					],
				};

				const tradeNoSlippage = new V3DutchOrderTrade<Currency, Currency, TradeType>({
					currencyIn: USDC,
					currenciesOut: [DAI],
					orderInfo: orderInfoNoSlippage,
					tradeType: TradeType.EXACT_INPUT,
					expectedAmounts: {
						expectedAmountIn: orderInfo.input.startAmount.toString(),
						expectedAmountOut: orderInfo.outputs[0].startAmount.toString(),
					},
				});

				expect(tradeNoSlippage.worstExecutionPrice().quotient.toString())
					.toEqual(tradeNoSlippage.executionPrice.quotient.toString());
			});
		});
	});

	describe("Worst execution price", () => {
		it("calculates worst execution price correctly for exact output", () => {
			const outOrderInfo: UnsignedV3DutchOrderInfo = {
				...orderInfo,
				input: {
					token: USDC.address,
					startAmount: BigNumber.from(1000),
					curve: {
						relativeBlocks: [10],
						relativeAmounts: [BigInt(-100)],
					},
					maxAmount: BigNumber.from(1100),
					adjustmentPerGweiBaseFee: BigNumber.from(0),
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
						adjustmentPerGweiBaseFee: BigNumber.from(0),
					},
				],
			};

			const exactOutputTrade = new V3DutchOrderTrade<Currency, Currency, TradeType>({
				currencyIn: USDC,
				currenciesOut: [DAI],
				orderInfo: outOrderInfo,
				tradeType: TradeType.EXACT_OUTPUT,
				expectedAmounts: {
					expectedAmountIn: "1050",
					expectedAmountOut: NON_FEE_OUTPUT_AMOUNT.toString(),
				},
			});

			const worstPrice = exactOutputTrade.worstExecutionPrice();
			const maxAmountIn = 1100;
			const minAmountOut = NON_FEE_OUTPUT_AMOUNT;

			expect(worstPrice.quotient.toString()).toEqual(
				minAmountOut.div(maxAmountIn).toString()
			);

			// Verify worst price is worse than execution price
			expect(worstPrice.lessThan(exactOutputTrade.executionPrice)).toBe(true);
			expect(worstPrice.baseCurrency).toEqual(USDC);
			expect(worstPrice.quoteCurrency).toEqual(DAI);
		});
	});
});
