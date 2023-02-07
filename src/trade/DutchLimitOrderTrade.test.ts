import { Currency, Token, TradeType } from "@uniswap/sdk-core"
import { BigNumber, ethers } from "ethers"

import { DutchLimitOrderInfo } from "../order"

import { DutchLimitOrderTrade } from "./DutchLimitOrderTrade"

const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC')
const DAI =  new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI')

describe("DutchLimitOrderTrade", () => {
    const NON_FEE_OUTPUT_AMOUNT = BigNumber.from("1000000000000000000")
    const NON_FEE_MINIMUM_AMOUNT_OUT = BigNumber.from("900000000000000000")

    const orderInfo: DutchLimitOrderInfo = {
        deadline: Math.floor(new Date().getTime() / 1000) + 1000,
        reactor: "0x0000000000000000000000000000000000000000",
        offerer: "0x0000000000000000000000000000000000000000",
        nonce: BigNumber.from(10),
        validationContract: ethers.constants.AddressZero,
        validationData: "0x",
        startTime: Math.floor(new Date().getTime() / 1000),
        endTime: Math.floor(new Date().getTime() / 1000) + 1000,
        input: {
            token: USDC.address,
            startAmount: BigNumber.from(1000),
            endAmount: BigNumber.from(1000),
        },
        outputs: [
            {
              token: DAI.address,
              startAmount: NON_FEE_OUTPUT_AMOUNT,
              endAmount: NON_FEE_MINIMUM_AMOUNT_OUT,
              recipient: "0x0000000000000000000000000000000000000000",
              isFeeOutput: false,
            },{
                token: DAI.address,
                startAmount: BigNumber.from("1000"),
                endAmount: BigNumber.from("2000"),
                recipient: "0x0000000000000000000000000000000000000000",
                isFeeOutput: true,
              },
          ]
    }

    const trade = new DutchLimitOrderTrade<Currency, Currency, TradeType>({
        currencyIn: USDC,
        currenciesOut: [DAI],
        orderInfo,
        tradeType: TradeType.EXACT_INPUT
    })

    it("returns the right input amount for an exact-in trade", () => {
        expect(trade.inputAmount.quotient.toString()).toEqual(orderInfo.input.startAmount.toString())
    })

    it('returns the correct non-fee output amount', () => {
        expect(trade.outputAmount.quotient.toString()).toEqual(NON_FEE_OUTPUT_AMOUNT.toString())
    })

    it('returns the correct minimum amount out', () => {
        expect(trade.minimumAmountOut().quotient.toString()).toEqual(NON_FEE_MINIMUM_AMOUNT_OUT.toString())
    })
})
