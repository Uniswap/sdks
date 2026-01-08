import { BigNumber } from "ethers";

import { RelayOrder } from "../order/RelayOrder";

import { RelayOrderBuilder } from "./RelayOrderBuilder";

describe("RelayOrderBuilder", () => {
  let builder: RelayOrderBuilder;

  beforeEach(() => {
    builder = new RelayOrderBuilder(1);
  });

  const DEFAULT_INPUT = {
    token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    amount: BigNumber.from("1000000"),
    recipient: "0x0000000000000000000000000000000000000000",
  };

  const DEFAULT_FEE = (deadline: number) => {
    return {
      token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      startAmount: BigNumber.from("1000000"),
      endAmount: BigNumber.from("1000000"),
      startTime: deadline - 100,
      endTime: deadline,
    };
  };

  it("Builds a valid order", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .swapper("0x0000000000000000000000000000000000000001")
      .nonce(BigNumber.from(100))
      .universalRouterCalldata("0x")
      .input(DEFAULT_INPUT)
      .fee(DEFAULT_FEE(deadline))
      .build();

    expect(order.info.fee.startTime).toEqual(deadline - 100);
    expect(order.info.fee.endTime).toEqual(deadline);
    expect(order.info.deadline).toEqual(deadline);
  });

  it("Regenerates builder from order", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .swapper("0x0000000000000000000000000000000000000001")
      .universalRouterCalldata("0x")
      .nonce(BigNumber.from(100))
      .input(DEFAULT_INPUT)
      .fee(DEFAULT_FEE(deadline))
      .build();

    const regenerated = RelayOrderBuilder.fromOrder(order).build();
    expect(regenerated.toJSON()).toMatchObject(order.toJSON());
  });

  it("Regenerates builder from order json", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .swapper("0x0000000000000000000000000000000000000001")
      .nonce(BigNumber.from(100))
      .universalRouterCalldata("0x")
      .input(DEFAULT_INPUT)
      .fee(DEFAULT_FEE(deadline))
      .build();

    const json = order.toJSON();
    const regenerated = RelayOrderBuilder.fromOrder(
      RelayOrder.fromJSON(json, 1)
    ).build();
    expect(regenerated.toJSON()).toMatchObject(order.toJSON());
  });

  it("Regenerates builder allows modification", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .swapper("0x0000000000000000000000000000000000000001")
      .nonce(BigNumber.from(100))
      .universalRouterCalldata("0x")
      .input(DEFAULT_INPUT)
      .fee(DEFAULT_FEE(deadline))
      .build();

    const regenerated = RelayOrderBuilder.fromOrder(order)
      .universalRouterCalldata("new action")
      .build();
    expect(regenerated.info.universalRouterCalldata).toEqual("new action");
  });

  it("allows for changing of fee params", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .swapper("0x0000000000000000000000000000000000000001")
      .nonce(BigNumber.from(100))
      .input(DEFAULT_INPUT)
      .fee(DEFAULT_FEE(deadline))
      .universalRouterCalldata("0x")
      .build();

    const regenerated = RelayOrderBuilder.fromOrder(order)
      .feeStartTime(deadline - 200)
      .build();

    expect(regenerated.info.fee.startTime).toEqual(deadline - 200);
  });

  it("startAmount >= maxAmount", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
        .deadline(deadline)
        .swapper("0x0000000000000000000000000000000000000001")
        .nonce(BigNumber.from(100))
        .input(DEFAULT_INPUT)
        .fee({
          token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          startAmount: BigNumber.from("100"),
          endAmount: BigNumber.from("99"),
          startTime: deadline - 100,
          endTime: deadline,
        })
        .universalRouterCalldata("0x")
        .build()
    ).toThrow("startAmount must be less than or equal than endAmount: 100");
  });

  it("Deadline already passed", () => {
    const expiredDeadline = 1234;
    expect(() => builder.deadline(expiredDeadline)).not.toThrow();
    expect(() =>
      builder
        .deadline(expiredDeadline)
        .swapper("0x0000000000000000000000000000000000000001")
        .nonce(BigNumber.from(100))
        .input(DEFAULT_INPUT)
        .fee({
          token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          startAmount: BigNumber.from("1000000"),
          endAmount: BigNumber.from("1000000"),
          startTime: expiredDeadline - 100,
          endTime: expiredDeadline,
        })
        .universalRouterCalldata("0x")
        .build()
    ).toThrow(`Deadline must be in the future: ${expiredDeadline}`);
  });

  it("Start time must be before deadline", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    const order = builder
      .deadline(deadline)
      .swapper("0x0000000000000000000000000000000000000000")
      .nonce(BigNumber.from(100))
      .universalRouterCalldata("0x")
      .input(DEFAULT_INPUT)
      .fee({
        token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1200000"),
        startTime: deadline + 1,
        endTime: deadline + 1,
      });

    expect(() => order.build()).toThrow(
      `feeStartTime must be before or same as deadline: ${deadline + 1}`
    );
  });

  it("Does not throw before an order has not been finished building", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
        .deadline(deadline)
        .nonce(BigNumber.from(100))
        .fee(DEFAULT_FEE(deadline))
        .feeStartTime(deadline + 1)
    ).not.toThrowError();
  });

  it("Unknown chainId", () => {
    const chainId = 99999999;
    expect(() => new RelayOrderBuilder(chainId)).toThrow(
      `Missing configuration for reactor: ${chainId}`
    );
  });

  it("Must set swapper", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
        .deadline(deadline)
        .nonce(BigNumber.from(100))
        .input(DEFAULT_INPUT)
        .fee(DEFAULT_FEE(deadline))
        .universalRouterCalldata("0x")
        .build()
    ).toThrow("Invariant failed: swapper not set");
  });

  it("must set input", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
        .deadline(deadline)
        .nonce(BigNumber.from(100))
        .swapper("0x0000000000000000000000000000000000000000")
        .fee(DEFAULT_FEE(deadline))
        .universalRouterCalldata("0x")
        .build()
    ).toThrow("Invariant failed: input not set");
  });

  it("must set universalRouterCalldata", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
        .deadline(deadline)
        .nonce(BigNumber.from(100))
        .swapper("0x0000000000000000000000000000000000000000")
        .input(DEFAULT_INPUT)
        .fee(DEFAULT_FEE(deadline))
        .build()
    ).toThrow("Invariant failed: universalRouterCalldata not set");
  });

  it("must set fee", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
        .deadline(deadline)
        .nonce(BigNumber.from(100))
        .swapper("0x0000000000000000000000000000000000000000")
        .input(DEFAULT_INPUT)
        .universalRouterCalldata("0x")
        .build()
    ).toThrow("Invariant failed: fee not set");
  });

  it("feeEndTime after deadline", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
        .deadline(deadline)
        .swapper("0x0000000000000000000000000000000000000000")
        .nonce(BigNumber.from(100))
        .input(DEFAULT_INPUT)
        .fee(DEFAULT_FEE(deadline))
        .feeStartTime(deadline - 100)
        .feeEndTime(deadline + 1)
        .universalRouterCalldata("0x")
        .build()
    ).toThrow(
      `Invariant failed: feeEndTime must be before or same as deadline: ${
        deadline + 1
      }`
    );
  });

  it("Must set nonce", () => {
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    expect(() =>
      builder
        .deadline(deadline)
        .swapper("0x0000000000000000000000000000000000000000")
        .input(DEFAULT_INPUT)
        .fee(DEFAULT_FEE(deadline))
        .universalRouterCalldata("0x")
        .build()
    ).toThrow("Invariant failed: nonce not set");
  });
});
