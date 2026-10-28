import { BigNumber, ethers } from "ethers";

import {
  applyExclusivityOverride,
  ExclusivityParams,
  hasFillingRights,
} from "./exclusivity";

const EXCLUSIVE = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

function params(overrides: Partial<ExclusivityParams> = {}): ExclusivityParams {
  return {
    exclusiveFiller: EXCLUSIVE,
    exclusivityEnd: 100,
    exclusivityOverrideBps: BigNumber.from(100),
    currentPosition: 99,
    filler: OTHER,
    ...overrides,
  };
}

const outputs = [{ token: OTHER, amount: BigNumber.from(1000) }];

describe("exclusivity", () => {
  describe("hasFillingRights", () => {
    it("grants rights when there is no exclusive filler", () => {
      expect(
        hasFillingRights(
          params({ exclusiveFiller: ethers.constants.AddressZero })
        )
      ).toBe(true);
    });

    it("grants rights past the exclusivity end", () => {
      expect(hasFillingRights(params({ currentPosition: 101 }))).toBe(true);
    });

    it("withholds rights at the exclusivity end", () => {
      expect(hasFillingRights(params({ currentPosition: 100 }))).toBe(false);
    });

    it("grants rights to the exclusive filler", () => {
      expect(hasFillingRights(params({ filler: EXCLUSIVE }))).toBe(true);
    });

    it("compares filler addresses case insensitively", () => {
      expect(
        hasFillingRights(params({ filler: EXCLUSIVE.toUpperCase() }))
      ).toBe(true);
      expect(
        hasFillingRights(
          params({
            exclusiveFiller: ethers.utils.getAddress(EXCLUSIVE),
            filler: EXCLUSIVE.toLowerCase(),
          })
        )
      ).toBe(true);
    });

    it("withholds rights when no filler is given", () => {
      expect(hasFillingRights(params({ filler: undefined }))).toBe(false);
    });
  });

  describe("applyExclusivityOverride", () => {
    it("returns outputs untouched when the filler has rights", () => {
      expect(
        applyExclusivityOverride(outputs, params({ filler: EXCLUSIVE }))
      ).toBe(outputs);
    });

    it("scales every output by the override, rounding up", () => {
      const scaled = applyExclusivityOverride(
        [
          { token: OTHER, amount: BigNumber.from(1000) },
          // 1 * 10100 / 10000 rounds up to 2 rather than truncating to 1
          { token: OTHER, amount: BigNumber.from(1) },
        ],
        params()
      );
      expect(scaled[0].amount.toString()).toEqual("1010");
      expect(scaled[1].amount.toString()).toEqual("2");
    });

    it("preserves other output fields", () => {
      const scaled = applyExclusivityOverride(
        [{ token: OTHER, amount: BigNumber.from(1000), recipient: EXCLUSIVE }],
        params()
      );
      expect(scaled[0].recipient).toEqual(EXCLUSIVE);
      expect(scaled[0].token).toEqual(OTHER);
    });

    it("throws on strict exclusivity", () => {
      expect(() =>
        applyExclusivityOverride(
          outputs,
          params({ exclusivityOverrideBps: BigNumber.from(0) })
        )
      ).toThrow("NoExclusiveOverride");
    });

    it("does not throw on strict exclusivity when the filler has rights", () => {
      expect(
        applyExclusivityOverride(
          outputs,
          params({
            exclusivityOverrideBps: BigNumber.from(0),
            filler: EXCLUSIVE,
          })
        )
      ).toBe(outputs);
    });
  });
});
