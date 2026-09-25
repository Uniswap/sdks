import { BigNumber } from "ethers";

import {
  bound,
  boundedAdd,
  boundedSub,
  INT256_MAX,
  mulDivDown,
  mulDivUp,
  subToInt256,
  UINT256_MAX,
} from "./mathExt";

describe("mathExt", () => {
  describe("bound", () => {
    it("clamps to [min, max]", () => {
      expect(
        bound(
          BigNumber.from(5),
          BigNumber.from(0),
          BigNumber.from(10)
        ).toString()
      ).toEqual("5");
      expect(
        bound(
          BigNumber.from(-1),
          BigNumber.from(0),
          BigNumber.from(10)
        ).toString()
      ).toEqual("0");
      expect(
        bound(
          BigNumber.from(11),
          BigNumber.from(0),
          BigNumber.from(10)
        ).toString()
      ).toEqual("10");
    });

    it("resolves to max when min > max, like Math.min(Math.max(...))", () => {
      expect(
        bound(
          BigNumber.from(5),
          BigNumber.from(10),
          BigNumber.from(1)
        ).toString()
      ).toEqual("1");
    });
  });

  describe("boundedSub", () => {
    it("saturates to max instead of overflowing on a large negative subtrahend", () => {
      expect(
        boundedSub(
          UINT256_MAX,
          BigNumber.from(-1),
          BigNumber.from(0),
          UINT256_MAX
        ).toString()
      ).toEqual(UINT256_MAX.toString());
    });

    it("caps at min instead of underflowing", () => {
      expect(
        boundedSub(
          BigNumber.from(1),
          BigNumber.from(5),
          BigNumber.from(0),
          UINT256_MAX
        ).toString()
      ).toEqual("0");
    });
  });

  describe("boundedAdd", () => {
    it("adds within bounds", () => {
      expect(
        boundedAdd(
          BigNumber.from(5),
          BigNumber.from(3),
          BigNumber.from(0),
          BigNumber.from(10)
        ).toString()
      ).toEqual("8");
    });

    it("clamps to max", () => {
      expect(
        boundedAdd(
          BigNumber.from(5),
          BigNumber.from(100),
          BigNumber.from(0),
          BigNumber.from(10)
        ).toString()
      ).toEqual("10");
    });
  });

  describe("mulDivDown / mulDivUp", () => {
    it("rounds down and up respectively", () => {
      // 7 * 1 / 2 = 3.5
      expect(
        mulDivDown(
          BigNumber.from(7),
          BigNumber.from(1),
          BigNumber.from(2)
        ).toString()
      ).toEqual("3");
      expect(
        mulDivUp(
          BigNumber.from(7),
          BigNumber.from(1),
          BigNumber.from(2)
        ).toString()
      ).toEqual("4");
    });

    it("does not round when the division is exact", () => {
      expect(
        mulDivUp(
          BigNumber.from(6),
          BigNumber.from(1),
          BigNumber.from(2)
        ).toString()
      ).toEqual("3");
    });

    it("reverts on a zero denominator, matching solmate", () => {
      expect(() =>
        mulDivDown(BigNumber.from(1), BigNumber.from(1), BigNumber.from(0))
      ).toThrow("division by zero");
      expect(() =>
        mulDivUp(BigNumber.from(1), BigNumber.from(1), BigNumber.from(0))
      ).toThrow("division by zero");
    });

    it("reverts when x * y exceeds uint256, matching solmate", () => {
      const half = BigNumber.from(2).pow(200);
      // 2^200 * 2^200 = 2^400 > uint256 max
      expect(() => mulDivDown(half, half, BigNumber.from(1))).toThrow(
        "overflow"
      );
      expect(() => mulDivUp(half, half, BigNumber.from(1))).toThrow("overflow");
    });

    it("does not revert right up to the uint256 boundary", () => {
      // UINT256_MAX * 1 / 1 is exactly representable
      expect(
        mulDivDown(UINT256_MAX, BigNumber.from(1), BigNumber.from(1)).toString()
      ).toEqual(UINT256_MAX.toString());
    });
  });

  describe("subToInt256", () => {
    it("returns a signed difference in both directions", () => {
      expect(
        subToInt256(BigNumber.from(10), BigNumber.from(3)).toString()
      ).toEqual("7");
      expect(
        subToInt256(BigNumber.from(3), BigNumber.from(10)).toString()
      ).toEqual("-7");
      expect(
        subToInt256(BigNumber.from(5), BigNumber.from(5)).toString()
      ).toEqual("0");
    });

    it("reverts when the magnitude exceeds int256 max, matching SafeCast", () => {
      // difference is INT256_MAX + 1
      expect(() => subToInt256(INT256_MAX.add(1), BigNumber.from(0))).toThrow(
        "int256 overflow"
      );
    });

    it("does not revert at the int256 boundary", () => {
      expect(subToInt256(INT256_MAX, BigNumber.from(0)).toString()).toEqual(
        INT256_MAX.toString()
      );
    });
  });
});
