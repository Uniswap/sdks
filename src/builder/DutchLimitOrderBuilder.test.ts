import { BigNumber } from "ethers";

import { encodeExclusiveFillerData, ValidationType } from "../order/validation";

import { DutchLimitOrderBuilder } from "./DutchLimitOrderBuilder";

describe("DutchLimitOrderBuilder", () => {
  let builder: DutchLimitOrderBuilder;

  beforeEach(() => {
    builder = new DutchLimitOrderBuilder(1);
  });

  it("Builds a valid order", () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 100)
      .offerer("0x0000000000000000000000000000000000000001")
      .nonce(BigNumber.from(100))
      .input({
        token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1000000"),
      })
      .output({
        token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("900000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
        isFeeOutput: false,
      })
      .build();

    expect(order.info.startTime).toEqual(deadline - 100);
    expect(order.info.outputs.length).toEqual(1);
  });

  it("Builds a valid order with validation", () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const fillerAddress = "0x1111111111111111111111111111111111111111";
    const validationContract = "0x2222222222222222222222222222222222222222";
    const timestamp = Math.floor(new Date().getTime() / 1000) + 100;
    const validationInfo = encodeExclusiveFillerData(
      fillerAddress,
      timestamp,
      1,
      validationContract
    );
    const order = builder
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 100)
      .offerer("0x0000000000000000000000000000000000000001")
      .nonce(BigNumber.from(100))
      .input({
        token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1000000"),
      })
      .validation(validationInfo)
      .output({
        token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("900000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
        isFeeOutput: false,
      })
      .build();

    expect(order.info.startTime).toEqual(deadline - 100);
    expect(order.info.outputs.length).toEqual(1);
    expect(order.validation).toEqual({
      type: ValidationType.ExclusiveFiller,
      data: {
        filler: fillerAddress,
        lastExclusiveTimestamp: timestamp,
      },
    });
  });

  it("Builds a valid order with multiple outputs", () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .endTime(deadline)
      .startTime(deadline - 100)
      .offerer("0x0000000000000000000000000000000000000000")
      .nonce(BigNumber.from(100))
      .input({
        token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1000000"),
      })
      .output({
        token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("900000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
        isFeeOutput: false,
      })
      .output({
        token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("900000000000000000"),
        recipient: "0x0000000000000000000000000000000000000001",
        isFeeOutput: false,
      })
      .build();

    expect(order.info.startTime).toEqual(deadline - 100);
    expect(order.info.outputs.length).toEqual(2);
  });

  it("startAmount <= endAmount", () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    expect(() =>
      builder
        .deadline(deadline)
        .endTime(deadline)
        .startTime(deadline - 100)
        .offerer("0x0000000000000000000000000000000000000001")
        .nonce(BigNumber.from(100))
        .input({
          token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          startAmount: BigNumber.from("1000000"),
          endAmount: BigNumber.from("1000000"),
        })
        .output({
          token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          startAmount: BigNumber.from("100"),
          endAmount: BigNumber.from("110"),
          recipient: "0x0000000000000000000000000000000000000000",
          isFeeOutput: false,
        })
        .build()
    ).toThrow("startAmount must be greater than endAmount: 100");
  });

  it("Deadline already passed", () => {
    expect(() => builder.deadline(1234)).toThrow(
      "Deadline must be in the future: 1234"
    );
  });

  it("Start time must be before deadline", () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    expect(() => builder.deadline(deadline).startTime(deadline + 1)).toThrow(
      `startTime must be before deadline: ${deadline + 1}`
    );
  });

  it("Unknown chainId", () => {
    const chainId = 99999999;
    expect(() => new DutchLimitOrderBuilder(chainId)).toThrow(
      `Missing configuration for reactor: ${chainId}`
    );
  });

  it("Must set offerer", () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    expect(() =>
      builder
        .deadline(deadline)
        .endTime(deadline)
        .startTime(deadline - 100)
        .nonce(BigNumber.from(100))
        .input({
          token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          startAmount: BigNumber.from("1000000"),
          endAmount: BigNumber.from("1000000"),
        })
        .output({
          token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          startAmount: BigNumber.from("1000000000000000000"),
          endAmount: BigNumber.from("900000000000000000"),
          recipient: "0x0000000000000000000000000000000000000000",
          isFeeOutput: false,
        })
        .build()
    ).toThrow("Invariant failed: offerer not set");
  });

  it("Must set deadline or endTime", () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    expect(() =>
      builder
        .startTime(deadline - 100)
        .offerer("0x0000000000000000000000000000000000000000")
        .nonce(BigNumber.from(100))
        .input({
          token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          startAmount: BigNumber.from("1000000"),
          endAmount: BigNumber.from("1000000"),
        })
        .output({
          token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          startAmount: BigNumber.from("1000000000000000000"),
          endAmount: BigNumber.from("900000000000000000"),
          recipient: "0x0000000000000000000000000000000000000000",
          isFeeOutput: false,
        })
        .build()
    ).toThrow("Invariant failed: endTime not set");
  });

  it("endTime defaults to deadline", () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const order = builder
      .startTime(deadline - 100)
      .deadline(deadline)
      .offerer("0x0000000000000000000000000000000000000000")
      .nonce(BigNumber.from(100))
      .input({
        token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1000000"),
      })
      .output({
        token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("900000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
        isFeeOutput: false,
      })
      .build();
    expect(order.info.endTime).toEqual(deadline);
  });

  it("endTime after deadline", () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    expect(() =>
      builder
        .startTime(deadline - 100)
        .endTime(deadline + 1)
        .deadline(deadline)
        .offerer("0x0000000000000000000000000000000000000000")
        .nonce(BigNumber.from(100))
        .input({
          token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          startAmount: BigNumber.from("1000000"),
          endAmount: BigNumber.from("1000000"),
        })
        .output({
          token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          startAmount: BigNumber.from("1000000000000000000"),
          endAmount: BigNumber.from("900000000000000000"),
          recipient: "0x0000000000000000000000000000000000000000",
          isFeeOutput: false,
        })
        .build()
    ).toThrow(
      `Invariant failed: endTime must be before deadline: ${deadline + 1}`
    );
  });

  it("deadline defaults to endTime", () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    const order = builder
      .startTime(deadline - 100)
      .endTime(deadline)
      .offerer("0x0000000000000000000000000000000000000000")
      .nonce(BigNumber.from(100))
      .input({
        token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1000000"),
      })
      .output({
        token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("900000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
        isFeeOutput: false,
      })
      .build();
    expect(order.info.deadline).toEqual(deadline);
  });

  it("Must set nonce", () => {
    const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
    expect(() =>
      builder
        .deadline(deadline)
        .startTime(deadline - 100)
        .offerer("0x0000000000000000000000000000000000000000")
        .input({
          token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          startAmount: BigNumber.from("1000000"),
          endAmount: BigNumber.from("1000000"),
        })
        .output({
          token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          startAmount: BigNumber.from("1000000000000000000"),
          endAmount: BigNumber.from("900000000000000000"),
          recipient: "0x0000000000000000000000000000000000000000",
          isFeeOutput: false,
        })
        .build()
    ).toThrow("Invariant failed: nonce not set");
  });
});
