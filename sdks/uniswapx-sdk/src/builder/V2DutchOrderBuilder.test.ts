import { BigNumber, constants } from "ethers";

import { CosignedV2DutchOrder } from "../order";
import { encodeExclusiveFillerData, ValidationType } from "../order/validation";

import { V2DutchOrderBuilder } from "./V2DutchOrderBuilder";

const INPUT_TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const OUTPUT_TOKEN = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

const INPUT_START_AMOUNT = BigNumber.from("1000000");
const OUTPUT_START_AMOUNT = BigNumber.from("1000000000000000000");

describe("V2DutchOrderBuilder", () => {
  let builder: V2DutchOrderBuilder;

  beforeEach(() => {
    builder = new V2DutchOrderBuilder(1, constants.AddressZero);
  });

  it("builds a valid order", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    const order = builder
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
        endAmount: OUTPUT_START_AMOUNT.mul(90).div(100),
        recipient: constants.AddressZero,
      })
      .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
      .outputOverrides([OUTPUT_START_AMOUNT])
      .build();

    expect(order.info.cosignerData.decayStartTime).toEqual(deadline - 100);
    expect(order.info.outputs.length).toEqual(1);
  });

  it("Builds a valid order with validation", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    const fillerAddress = "0x1111111111111111111111111111111111111111";
    const additionalValidationContract =
      "0x2222222222222222222222222222222222222222";
    const timestamp = Math.floor(Date.now() / 1000) + 100;
    const validationInfo = encodeExclusiveFillerData(
      fillerAddress,
      timestamp,
      1,
      additionalValidationContract
    );
    const order = builder
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
        endAmount: OUTPUT_START_AMOUNT.mul(90).div(100),
        recipient: constants.AddressZero,
      })
      .inputOverride(INPUT_START_AMOUNT)
      .outputOverrides([OUTPUT_START_AMOUNT.mul(102).div(100)])
      .validation(validationInfo)
      .build();

    expect(order.info.cosignerData.decayStartTime).toEqual(deadline - 100);
    expect(order.info.outputs.length).toEqual(1);
    expect(order.validation).toEqual({
      type: ValidationType.ExclusiveFiller,
      data: {
        filler: fillerAddress,
        lastExclusiveTimestamp: timestamp,
      },
    });
  });

  it("Regenerates builder from order json", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    const fillerAddress = "0x1111111111111111111111111111111111111111";
    const additionalValidationContract =
      "0x2222222222222222222222222222222222222222";
    const timestamp = Math.floor(Date.now() / 1000) + 100;
    const validationInfo = encodeExclusiveFillerData(
      fillerAddress,
      timestamp,
      1,
      additionalValidationContract
    );
    const order = builder
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
        endAmount: OUTPUT_START_AMOUNT.mul(90).div(100),
        recipient: constants.AddressZero,
      })
      .inputOverride(INPUT_START_AMOUNT.mul(98).div(100))
      .outputOverrides([OUTPUT_START_AMOUNT.mul(102).div(100)])
      .validation(validationInfo)
      .build();

    const json = order.toJSON();
    const regenerated = V2DutchOrderBuilder.fromOrder(
      CosignedV2DutchOrder.fromJSON(json, 1)
    ).build();
    expect(regenerated.toJSON()).toMatchObject(order.toJSON());
  });

  it("Regenerates builder allows modification", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    const fillerAddress = "0x1111111111111111111111111111111111111111";
    const additionalValidationContract =
      "0x2222222222222222222222222222222222222222";
    const timestamp = Math.floor(Date.now() / 1000) + 100;
    const validationInfo = encodeExclusiveFillerData(
      fillerAddress,
      timestamp,
      1,
      additionalValidationContract
    );
    const order = builder
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
        endAmount: OUTPUT_START_AMOUNT.mul(90).div(100),
        recipient: constants.AddressZero,
      })
      .inputOverride(INPUT_START_AMOUNT.mul(98).div(100))
      .outputOverrides([OUTPUT_START_AMOUNT.mul(102).div(100)])
      .validation(validationInfo)
      .build();

    const regenerated = V2DutchOrderBuilder.fromOrder(order)
      .decayStartTime(order.info.cosignerData.decayStartTime + 1)
      .build();
    expect(regenerated.info.cosignerData.decayStartTime).toEqual(
      order.info.cosignerData.decayStartTime + 1
    );
  });

  it("builds a valid order with multiple outputs", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    const order = builder
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
        endAmount: OUTPUT_START_AMOUNT.mul(90).div(100),
        recipient: constants.AddressZero,
      })
      .output({
        token: OUTPUT_TOKEN,
        startAmount: OUTPUT_START_AMOUNT.mul(10).div(100),
        endAmount: OUTPUT_START_AMOUNT.mul(9).div(100),
        recipient: constants.AddressZero,
      })
      .inputOverride(INPUT_START_AMOUNT.mul(98).div(100))
      .outputOverrides([OUTPUT_START_AMOUNT.mul(102).div(100)])
      .build();

    expect(order.info.cosignerData.decayStartTime).toEqual(deadline - 100);
    expect(order.info.outputs.length).toEqual(2);
  });

  it("cosigner not set", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
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
        .inputOverride(INPUT_START_AMOUNT.mul(98).div(100))
        .outputOverrides([OUTPUT_START_AMOUNT.mul(102).div(100)])
        .build()
    ).toThrow("Invariant failed: cosigner not set");
  });

  it("swapper not set", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
        .cosigner(constants.AddressZero)
        .cosignature("0x")
        .deadline(deadline)
        .decayEndTime(deadline)
        .decayStartTime(deadline - 100)
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
        .inputOverride(INPUT_START_AMOUNT.mul(98).div(100))
        .outputOverrides([OUTPUT_START_AMOUNT.mul(102).div(100)])
        .build()
    ).toThrow("Invariant failed: swapper not set");
  });

  it("neither deadline or decayEndTime is set", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
        .cosigner(constants.AddressZero)
        .cosignature("0x")
        .decayStartTime(deadline - 100)
        .nonce(BigNumber.from(100))
        .swapper(constants.AddressZero)
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
        .inputOverride(INPUT_START_AMOUNT.mul(98).div(100))
        .outputOverrides([OUTPUT_START_AMOUNT.mul(102).div(100)])
        .build()
    ).toThrow("Invariant failed: deadline not set");
  });

  it("nonce not set", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
        .cosigner(constants.AddressZero)
        .cosignature("0x")
        .deadline(deadline)
        .decayEndTime(deadline)
        .decayStartTime(deadline - 100)
        .swapper(constants.AddressZero)
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
        .inputOverride(INPUT_START_AMOUNT.mul(98).div(100))
        .outputOverrides([OUTPUT_START_AMOUNT.mul(102).div(100)])
        .build()
    ).toThrow("Invariant failed: nonce not set");
  });

  it("inputOverride larger than input", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
        .cosigner(constants.AddressZero)
        .cosignature("0x")
        .nonce(BigNumber.from(1))
        .deadline(deadline)
        .decayEndTime(deadline)
        .decayStartTime(deadline - 100)
        .swapper(constants.AddressZero)
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
        .inputOverride(INPUT_START_AMOUNT.mul(102).div(100))
        .outputOverrides([OUTPUT_START_AMOUNT.mul(102).div(100)])
        .build()
    ).toThrow(
      "Invariant failed: inputOverride not set or larger than original input"
    );
  });

  it("outputOverride smaller than output", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
        .cosigner(constants.AddressZero)
        .cosignature("0x")
        .nonce(BigNumber.from(1))
        .deadline(deadline)
        .decayEndTime(deadline)
        .decayStartTime(deadline - 100)
        .swapper(constants.AddressZero)
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
        .inputOverride(INPUT_START_AMOUNT.mul(98).div(100))
        .outputOverrides([OUTPUT_START_AMOUNT.mul(98).div(100)])
        .build()
    ).toThrow(
      "Invariant failed: outputOverride must be larger than or equal to original output"
    );
  });

  it("decayEndTime defaults to deadline", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    const order = builder
      .cosigner(constants.AddressZero)
      .cosignature("0x")
      .deadline(deadline)
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
        endAmount: OUTPUT_START_AMOUNT.mul(90).div(100),
        recipient: constants.AddressZero,
      })
      .inputOverride(INPUT_START_AMOUNT.mul(98).div(100))
      .outputOverrides([OUTPUT_START_AMOUNT.mul(102).div(100)])
      .build();

    expect(order.info.cosignerData.decayEndTime).toEqual(deadline);
    expect(order.info.outputs.length).toEqual(1);
  });

  it("deadline defaults to decayEndTime", () => {
    const decayEndTime = Math.floor(Date.now() / 1000) + 1000;
    const order = builder
      .cosigner(constants.AddressZero)
      .cosignature("0x")
      .decayEndTime(decayEndTime)
      .decayStartTime(decayEndTime - 100)
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
        endAmount: OUTPUT_START_AMOUNT.mul(90).div(100),
        recipient: constants.AddressZero,
      })
      .inputOverride(INPUT_START_AMOUNT.mul(98).div(100))
      .outputOverrides([OUTPUT_START_AMOUNT.mul(102).div(100)])
      .build();

    expect(order.info.deadline).toEqual(decayEndTime);
    expect(order.info.outputs.length).toEqual(1);
  });

  it("startAmount <= endAmount", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
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
          endAmount: OUTPUT_START_AMOUNT.add(100),
          recipient: constants.AddressZero,
        })
        .inputOverride(INPUT_START_AMOUNT.mul(98).div(100))
        .outputOverrides([OUTPUT_START_AMOUNT.mul(102).div(100)])
        .build()
    ).toThrow("startAmount must be greater than endAmount: 100");
  });

  it("deadline already passed", () => {
    const deadline = 1234;
    expect(() =>
      builder
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
        .inputOverride(INPUT_START_AMOUNT.mul(89).div(100))
        .outputOverrides([OUTPUT_START_AMOUNT.mul(102).div(100)])
        .build()
    ).toThrow("Invariant failed: Deadline must be in the future: 1234");
  });

  it("Start time after deadline", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
        .cosigner(constants.AddressZero)
        .cosignature("0x")
        .deadline(deadline)
        .decayEndTime(deadline)
        .decayStartTime(deadline + 100)
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
        .inputOverride(INPUT_START_AMOUNT.mul(98).div(100))
        .outputOverrides([OUTPUT_START_AMOUNT.mul(102).div(100)])
        .build()
    ).toThrow(
      `Invariant failed: decayStartTime must be before or same as deadline: ${
        deadline + 100
      }`
    );
  });

  it("decayEndTime after deadline", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
        .cosigner(constants.AddressZero)
        .cosignature("0x")
        .deadline(deadline)
        .decayEndTime(deadline + 100)
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
        .inputOverride(INPUT_START_AMOUNT.mul(98).div(100))
        .outputOverrides([OUTPUT_START_AMOUNT.mul(102).div(100)])
        .build()
    ).toThrow(
      `Invariant failed: decayEndTime must be before or same as deadline: ${
        deadline + 100
      }`
    );
  });

  it("Does not throw before an order has not been finished building", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder.deadline(deadline).decayStartTime(deadline + 1)
    ).not.toThrowError();
  });

  it("Unknown chainId", () => {
    const chainId = 99999999;
    expect(() => new V2DutchOrderBuilder(chainId)).toThrow(
      `Missing configuration for reactor: ${chainId}`
    );
  });

  describe("partial order tests", () => {
    it("builds an unsigned partial order with default cosignerData values", () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000;
      const order = builder
        .cosigner(constants.AddressZero)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .deadline(deadline)
        .input({
          token: INPUT_TOKEN,
          startAmount: INPUT_START_AMOUNT,
          endAmount: INPUT_START_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          startAmount: OUTPUT_START_AMOUNT,
          endAmount: OUTPUT_START_AMOUNT.mul(90).div(100),
          recipient: constants.AddressZero,
        })
        .buildPartial();

      expect(order.info.outputs.length).toEqual(1);
    });

    it("builds an unsigned partial order with incomplete cosignerData values", () => {
      const deadline = Math.floor(Date.now() / 1000) + 1000;
      const order = builder
        .cosigner(constants.AddressZero)
        .swapper(constants.AddressZero)
        .nonce(BigNumber.from(100))
        .deadline(deadline)
        .decayStartTime(1)
        .input({
          token: INPUT_TOKEN,
          startAmount: INPUT_START_AMOUNT,
          endAmount: INPUT_START_AMOUNT,
        })
        .output({
          token: OUTPUT_TOKEN,
          startAmount: OUTPUT_START_AMOUNT,
          endAmount: OUTPUT_START_AMOUNT.mul(90).div(100),
          recipient: constants.AddressZero,
        })
        .inputOverride(INPUT_START_AMOUNT.mul(98).div(100))
        .buildPartial();

      expect(order.info.outputs.length).toEqual(1);
    });
  });
});
