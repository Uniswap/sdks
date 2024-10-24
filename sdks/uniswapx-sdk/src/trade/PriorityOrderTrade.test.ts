import { Currency, Ether, Token, TradeType } from "@uniswap/sdk-core";
import { BigNumber, constants, ethers } from "ethers";

import { UnsignedPriorityOrderInfo } from "../order";

import { NativeAssets } from "./utils";

import { PriorityOrderTrade } from ".";

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

describe("PriorityOrderTrade", () => {
  const NON_FEE_OUTPUT_AMOUNT = BigNumber.from("1000000000000000000");

  const orderInfo: UnsignedPriorityOrderInfo = {
    deadline: Math.floor(new Date().getTime() / 1000) + 1000,
    reactor: "0x0000000000000000000000000000000000000000",
    swapper: "0x0000000000000000000000000000000000000000",
    nonce: BigNumber.from(10),
    cosigner: "0x0000000000000000000000000000000000000000",
    additionalValidationContract: ethers.constants.AddressZero,
    additionalValidationData: "0x",
    auctionStartBlock: BigNumber.from(100000),
    baselinePriorityFeeWei: BigNumber.from(2),
    input: {
      token: USDC.address,
      amount: BigNumber.from(1000),
      mpsPerPriorityFeeWei: BigNumber.from(0),
    },
    outputs: [
      {
        token: DAI.address,
        amount: NON_FEE_OUTPUT_AMOUNT,
        mpsPerPriorityFeeWei: BigNumber.from(5),
        recipient: "0x0000000000000000000000000000000000000000",
      },
      {
        token: DAI.address,
        amount: BigNumber.from("1000"),
        mpsPerPriorityFeeWei: BigNumber.from(5),
        recipient: "0x0000000000000000000000000000000000000000",
      },
    ],
  };

  const trade = new PriorityOrderTrade<Currency, Currency, TradeType>({
    currencyIn: USDC,
    currenciesOut: [DAI],
    orderInfo,
    tradeType: TradeType.EXACT_INPUT,
  });

  it("returns the right input amount for an exact-in trade", () => {
    expect(trade.inputAmount.quotient.toString()).toEqual(
      orderInfo.input.amount.toString()
    );
  });

  it("returns the correct non-fee output amount", () => {
    expect(trade.outputAmount.quotient.toString()).toEqual(
      NON_FEE_OUTPUT_AMOUNT.toString()
    );
  });

  it("returns the correct minimum amount out", () => {
    expect(trade.minimumAmountOut().quotient.toString()).toEqual(
      NON_FEE_OUTPUT_AMOUNT.toString()
    );
  });

  it("works for native output trades", () => {
    const ethOutputOrderInfo = {
      ...orderInfo,
      outputs: [
        {
          token: NativeAssets.ETH,
          amount: NON_FEE_OUTPUT_AMOUNT,
          mpsPerPriorityFeeWei: BigNumber.from(5),
          recipient: "0x0000000000000000000000000000000000000000",
        },
      ],
    };
    const ethOutputTrade = new PriorityOrderTrade<Currency, Currency, TradeType>(
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
          amount: NON_FEE_OUTPUT_AMOUNT,
          mpsPerPriorityFeeWei: BigNumber.from(5),
          recipient: "0x0000000000000000000000000000000000000000",
        },
      ],
    };
    const ethOutputTrade = new PriorityOrderTrade<Currency, Currency, TradeType>(
      {
        currencyIn: USDC,
        currenciesOut: [Ether.onChain(1)],
        orderInfo: ethOutputOrderInfo,
        tradeType: TradeType.EXACT_INPUT,
      }
    );
    expect(ethOutputTrade.outputAmount.currency).toEqual(Ether.onChain(1));
  });

  it("returns the correct amountIn and amountOut with classic quote data", () => {
    const classicAmounts = {
      classicAmountInGasAndPortionAdjusted: "1",
      classicAmountOutGasAndPortionAdjusted: "1",
    };
    const classicAmountTrade = new PriorityOrderTrade<Currency, Currency, TradeType>(
      {
        currencyIn: USDC,
        currenciesOut: [DAI],
        orderInfo,
        tradeType: TradeType.EXACT_INPUT,
        classicAmounts,
      }
    );
    expect(classicAmountTrade.inputAmount.quotient.toString()).toEqual(
      classicAmounts.classicAmountInGasAndPortionAdjusted
    );
    expect(classicAmountTrade.outputAmount.quotient.toString()).toEqual(
      classicAmounts.classicAmountOutGasAndPortionAdjusted
    );
  });
});
