import { BigNumber, constants } from "ethers";

import { V2DutchOrderBuilder } from "./V2DutchOrderBuilder";
import { V3DutchOrderBuilder } from "./V3DutchOrderBuilder";

const INPUT_TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const OUTPUT_TOKEN = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const INPUT_START_AMOUNT = BigNumber.from("1000000");
const OUTPUT_START_AMOUNT = BigNumber.from("1000000000000000000");

function buildV2(outputOverrides: BigNumber[]) {
  const deadline = Math.floor(Date.now() / 1000) + 1000;
  return new V2DutchOrderBuilder(1, constants.AddressZero)
    .cosigner(constants.AddressZero)
    .cosignature("0x")
    .deadline(deadline)
    .decayEndTime(deadline)
    .decayStartTime(deadline - 100)
    .swapper(constants.AddressZero)
    .nonce(BigNumber.from(100))
    .input({
      token: INPUT_TOKEN,
      startAmount: INPUT_START_AMOUNT,
      endAmount: INPUT_START_AMOUNT,
    })
    .output({
      token: OUTPUT_TOKEN,
      startAmount: OUTPUT_START_AMOUNT,
      endAmount: OUTPUT_START_AMOUNT,
      recipient: constants.AddressZero,
    })
    .output({
      token: OUTPUT_TOKEN,
      startAmount: OUTPUT_START_AMOUNT,
      endAmount: OUTPUT_START_AMOUNT,
      recipient: constants.AddressZero,
    })
    .inputOverride(INPUT_START_AMOUNT)
    .outputOverrides(outputOverrides)
    .build();
}

function buildV3(outputOverrides: BigNumber[]) {
  const deadline = Math.floor(Date.now() / 1000) + 1000;
  return new V3DutchOrderBuilder(1, constants.AddressZero)
    .cosigner(constants.AddressZero)
    .cosignature("0x")
    .decayStartBlock(212121)
    .startingBaseFee(BigNumber.from(0))
    .input({
      token: INPUT_TOKEN,
      startAmount: INPUT_START_AMOUNT,
      curve: { relativeBlocks: [], relativeAmounts: [] },
      maxAmount: INPUT_START_AMOUNT,
      adjustmentPerGweiBaseFee: BigNumber.from(0),
    })
    .output({
      token: OUTPUT_TOKEN,
      startAmount: OUTPUT_START_AMOUNT,
      curve: { relativeBlocks: [4], relativeAmounts: [BigInt(4)] },
      recipient: constants.AddressZero,
      minAmount: OUTPUT_START_AMOUNT.sub(4),
      adjustmentPerGweiBaseFee: BigNumber.from(0),
    })
    .output({
      token: OUTPUT_TOKEN,
      startAmount: OUTPUT_START_AMOUNT,
      curve: { relativeBlocks: [17], relativeAmounts: [BigInt(17)] },
      recipient: constants.AddressZero,
      minAmount: OUTPUT_START_AMOUNT.sub(17),
      adjustmentPerGweiBaseFee: BigNumber.from(0),
    })
    .inputOverride(INPUT_START_AMOUNT)
    .outputOverrides(outputOverrides)
    .deadline(deadline)
    .swapper(constants.AddressZero)
    .nonce(BigNumber.from(100))
    .build();
}

describe("cosigned output override alignment", () => {
  it("rejects too few V2 output overrides", () => {
    expect(() => buildV2([OUTPUT_START_AMOUNT])).toThrow(
      "Invariant failed: outputOverrides length must match outputs length"
    );
  });

  it("rejects too many V2 output overrides", () => {
    expect(() =>
      buildV2([OUTPUT_START_AMOUNT, OUTPUT_START_AMOUNT, OUTPUT_START_AMOUNT])
    ).toThrow("Invariant failed: outputOverrides length must match outputs length");
  });

  it("rejects too few V3 output overrides", () => {
    expect(() => buildV3([OUTPUT_START_AMOUNT])).toThrow(
      "Invariant failed: outputOverrides length must match outputs length"
    );
  });

  it("rejects too many V3 output overrides", () => {
    expect(() =>
      buildV3([OUTPUT_START_AMOUNT, OUTPUT_START_AMOUNT, OUTPUT_START_AMOUNT])
    ).toThrow("Invariant failed: outputOverrides length must match outputs length");
  });
});
