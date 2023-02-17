import { BigNumber } from "ethers";

import { getDecayedAmount } from "./dutchDecay";

describe("Dutch Decay", () => {
  it("Returns endAmount if decay is over", () => {
    const endAmount = BigNumber.from("100000000");
    expect(
      getDecayedAmount(
        {
          startAmount: endAmount.div(2),
          endAmount: endAmount,
          startTime: 1,
          endTime: 10,
        },
        11
      )
    ).toEqual(endAmount);
  });

  it("Returns endAmount if eq to endTime", () => {
    const endAmount = BigNumber.from("100000000");
    expect(
      getDecayedAmount(
        {
          startAmount: endAmount.div(2),
          endAmount: endAmount,
          startTime: 1,
          endTime: 10,
        },
        10
      )
    ).toEqual(endAmount);
  });

  it("Returns startAmount if decay hasnt started", () => {
    const startAmount = BigNumber.from("100000000");
    expect(
      getDecayedAmount(
        {
          startAmount: startAmount,
          endAmount: startAmount.mul(2),
          startTime: 10,
          endTime: 100,
        },
        9
      )
    ).toEqual(startAmount);
  });

  it("Returns startAmount if eq to startTime", () => {
    const startAmount = BigNumber.from("100000000");
    expect(
      getDecayedAmount(
        {
          startAmount: startAmount,
          endAmount: startAmount.mul(2),
          startTime: 10,
          endTime: 100,
        },
        10
      )
    ).toEqual(startAmount);
  });

  it("Decays linearly upwards", () => {
    const startAmount = BigNumber.from("100000000");
    expect(
      getDecayedAmount(
        {
          startAmount: startAmount,
          endAmount: startAmount.mul(2),
          startTime: 10,
          endTime: 20,
        },
        15
      )
    ).toEqual(startAmount.mul(3).div(2));
  });

  it("Decays linearly downwrads", () => {
    const endAmount = BigNumber.from("100000000");
    expect(
      getDecayedAmount(
        {
          startAmount: endAmount.mul(2),
          endAmount: endAmount,
          startTime: 10,
          endTime: 20,
        },
        15
      )
    ).toEqual(endAmount.mul(3).div(2));
  });
});
