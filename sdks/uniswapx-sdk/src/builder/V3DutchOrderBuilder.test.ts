import { BigNumber, constants } from "ethers";
import { V3DutchOrderBuilder } from "./V3DutchOrderBuilder";

const INPUT_TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const OUTPUT_TOKEN = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

const INPUT_START_AMOUNT = BigNumber.from("1000000");
const OUTPUT_START_AMOUNT = BigNumber.from("1000000000000000000");

describe("V3DutchOrderBuilder", () => {
    let builder: V3DutchOrderBuilder;

    beforeEach(() => {
      builder = new V3DutchOrderBuilder(1, constants.AddressZero);
    });
  
    it("should build a valid order", () => {
        const deadline = Date.now() + 1000;
        const order = builder
            .cosigner(constants.AddressZero)
            .cosignature("0x")
            .decayStartBlock(212121)
            .input({
                token: INPUT_TOKEN,
                startAmount: INPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [1],
                    relativeAmounts: [BigNumber.from(0)],
                },
                maxAmount: INPUT_START_AMOUNT.add(1),
            })
            .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigNumber.from(4)],
                },
                recipient: constants.AddressZero,
            })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(constants.AddressZero)
            .nonce(BigNumber.from(100))
            .build();
        
        expect(order.info.cosignerData.decayStartBlock).toEqual(212121);
        expect(order.info.outputs.length).toEqual(1);
    });
});