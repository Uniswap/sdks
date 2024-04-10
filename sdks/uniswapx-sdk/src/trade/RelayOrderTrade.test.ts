import { Currency, CurrencyAmount, Token, TradeType } from "@uniswap/sdk-core";
import { BigNumber, ethers } from "ethers";

import { RelayOrderInfo } from "../order";

import { RelayOrderTrade } from "./RelayOrderTrade";

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

describe("RelayOrderTrade", () => {
  const FEE_START_AMOUNT = BigNumber.from(100);
  const FEE_END_AMOUNT = BigNumber.from(200);
  const INPUT_AMOUNT = BigNumber.from(1000);

  // 1000 DAI
  const MOCK_SWAP_OUTPUT_AMOUNT = CurrencyAmount.fromRawAmount(
    DAI,
    "1000000000000000000000"
  );
  const OUTPUT_AMOUNT = BigNumber.from("1000000000000000000000");

  const getOrderInfo = (data: Partial<RelayOrderInfo>): RelayOrderInfo => {
    const feeStartTime = Math.floor(new Date().getTime() / 1000);
    const feeEndTime = Math.floor(new Date().getTime() / 1000) + 1000;
    return Object.assign(
      {
        deadline: feeEndTime,
        reactor: "0x0000000000000000000000000000000000000000",
        swapper: "0x0000000000000000000000000000000000000000",
        nonce: BigNumber.from(10),
        universalRouterCalldata: [],
        fee: {
          token: USDC.address,
          startAmount: FEE_START_AMOUNT,
          endAmount: FEE_END_AMOUNT,
          feeStartTime,
          feeEndTime,
          recipient: ethers.constants.AddressZero,
        },
        input: {
          token: USDC.address,
          amount: INPUT_AMOUNT,
          recipient: "0x0000000000000000000000000000000000000001",
        },
      },
      data
    );
  };

  const orderInfo = getOrderInfo({});

  const trade = new RelayOrderTrade<Currency, Currency, TradeType>({
    currenciesIn: [USDC],
    outputAmount: MOCK_SWAP_OUTPUT_AMOUNT,
    orderInfo,
    tradeType: TradeType.EXACT_INPUT,
  });

  it("returns the right amountIn for an exact-in trade", () => {
    expect(trade.amountIn.quotient.toString()).toEqual("1000");
  });

  it("returns the correct output amount", () => {
    expect(trade.outputAmount.quotient.toString()).toEqual(
      OUTPUT_AMOUNT.toString()
    );
  });

  it("returns the correct feeAmountIn", () => {
    expect(trade.amountInFee.quotient.toString()).toEqual(
      FEE_START_AMOUNT.toString()
    );
  });

  it("returns the correct feeMaximumAmountIn", () => {
    expect(trade.maximumAmountInFee.quotient.toString()).toEqual(
      FEE_END_AMOUNT.toString()
    );
  });

  describe("inputs are the same token", () => {
    it("returns the correct execution price", () => {
      // non fee inputs: 1000 = 1000
      // outputs: 1000
      // expected execution price: 1000 / 1000 = 1
      expect(trade.executionPrice.quotient.toString()).toEqual(
        "1000000000000000000"
      );
    });

    it("returns the correct worst execution price", () => {
      expect(trade.worstExecutionPrice().quotient.toString()).toEqual(
        "1000000000000000000"
      );
    });
  });

  describe("input and fee are different tokens", () => {
    const feeStartTime = Math.floor(new Date().getTime() / 1000);
    const feeEndTime = Math.floor(new Date().getTime() / 1000) + 1000;
    const orderInfo = getOrderInfo({
      fee: {
        token: USDC.address,
        startAmount: FEE_START_AMOUNT,
        endAmount: FEE_END_AMOUNT,
        startTime: feeStartTime,
        endTime: feeEndTime,
      },
      input: {
        token: DAI.address,
        amount: INPUT_AMOUNT,
        recipient: "0x0000000000000000000000000000000000000001",
      },
    });
    const trade = new RelayOrderTrade<Currency, Currency, TradeType>({
      currenciesIn: [USDC, DAI],
      outputAmount: MOCK_SWAP_OUTPUT_AMOUNT,
      orderInfo,
      tradeType: TradeType.EXACT_INPUT,
    });

    it("returns the correct execution price", () => {
      // non fee inputs: 1000 = 1000
      // outputs: 1000
      // expected execution price: 1000 / 1000 = 1
      expect(trade.executionPrice.quotient.toString()).toEqual(
        "1000000000000000000"
      );
    });

    it("returns the correct worst execution price", () => {
      expect(trade.worstExecutionPrice().quotient.toString()).toEqual(
        "1000000000000000000"
      );
    });
  });
});
