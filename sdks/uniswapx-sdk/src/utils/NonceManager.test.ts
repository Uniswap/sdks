import { BigNumber, ethers } from "ethers";

import {
  buildNonce,
  getCancelMultipleParams,
  getCancelSingleParams,
  getFirstUnsetBit,
  setBit,
} from "./NonceManager";

describe("NonceManager", () => {
  describe("buildNonce", () => {
    it("0, 0", () => {
      expect(buildNonce(BigNumber.from(0), 0)).toEqual(BigNumber.from(0));
    });

    it("0, 1", () => {
      expect(buildNonce(BigNumber.from(0), 1)).toEqual(BigNumber.from(1));
    });

    it("0, 12", () => {
      expect(buildNonce(BigNumber.from(0), 12)).toEqual(BigNumber.from(12));
    });

    it("1, 0", () => {
      expect(buildNonce(BigNumber.from(1), 0)).toEqual(BigNumber.from(256));
    });

    it("1, 1", () => {
      expect(buildNonce(BigNumber.from(1), 1)).toEqual(BigNumber.from(257));
    });

    it("4, 1", () => {
      expect(buildNonce(BigNumber.from(4), 1)).toEqual(BigNumber.from(1025));
    });

    it("8, 1", () => {
      expect(buildNonce(BigNumber.from(8), 1)).toEqual(BigNumber.from(2049));
    });
  });

  describe("setBit", () => {
    it("0, 0", () => {
      expect(setBit(BigNumber.from(0), 0)).toEqual(BigNumber.from(1));
    });

    it("0, 1", () => {
      expect(setBit(BigNumber.from(0), 1)).toEqual(BigNumber.from(2));
    });

    it("0, 8", () => {
      expect(setBit(BigNumber.from(0), 8)).toEqual(BigNumber.from(256));
    });

    it("1, 0", () => {
      expect(setBit(BigNumber.from(1), 0)).toEqual(BigNumber.from(1));
    });

    it("1, 1", () => {
      expect(setBit(BigNumber.from(1), 1)).toEqual(BigNumber.from(3));
    });

    it("16756735, 12", () => {
      expect(setBit(BigNumber.from(16756735), 12)).toEqual(
        BigNumber.from(16760831)
      );
    });
  });

  describe("getFirstUnsetBit", () => {
    it("0", () => {
      expect(getFirstUnsetBit(BigNumber.from(0))).toEqual(0);
    });

    it("1", () => {
      expect(getFirstUnsetBit(BigNumber.from(1))).toEqual(1);
    });

    it("2", () => {
      expect(getFirstUnsetBit(BigNumber.from(2))).toEqual(0);
    });

    it("128", () => {
      expect(getFirstUnsetBit(BigNumber.from(128))).toEqual(0);
    });

    it("127", () => {
      expect(getFirstUnsetBit(BigNumber.from(127))).toEqual(7);
    });

    it("MaxUint256", () => {
      expect(getFirstUnsetBit(ethers.constants.MaxUint256)).toEqual(-1);
    });

    it("16756735", () => {
      expect(getFirstUnsetBit(BigNumber.from(16756735))).toEqual(12);
    });
  });

  describe("getCancelSingleParams", () => {
    it("0", () => {
      expect(getCancelSingleParams(BigNumber.from(0)).word.toString()).toEqual(
        "0"
      );
      expect(getCancelSingleParams(BigNumber.from(0)).mask.toString()).toEqual(
        "1"
      );
    });

    it("1", () => {
      expect(getCancelSingleParams(BigNumber.from(1)).word.toString()).toEqual(
        "0"
      );
      expect(getCancelSingleParams(BigNumber.from(1)).mask.toString()).toEqual(
        "2"
      );
    });

    it("2", () => {
      expect(getCancelSingleParams(BigNumber.from(2)).word.toString()).toEqual(
        "0"
      );
      expect(getCancelSingleParams(BigNumber.from(2)).mask.toString()).toEqual(
        "4"
      );
    });

    it("3", () => {
      expect(getCancelSingleParams(BigNumber.from(3)).word.toString()).toEqual(
        "0"
      );
      expect(getCancelSingleParams(BigNumber.from(3)).mask.toString()).toEqual(
        "8"
      );
    });

    it("255", () => {
      expect(
        getCancelSingleParams(BigNumber.from(256)).word.toString()
      ).toEqual("1");
      expect(
        getCancelSingleParams(BigNumber.from(256)).mask.toString()
      ).toEqual("1");
    });

    it("257", () => {
      expect(
        getCancelSingleParams(BigNumber.from(257)).word.toString()
      ).toEqual("1");
      expect(
        getCancelSingleParams(BigNumber.from(257)).mask.toString()
      ).toEqual("2");
    });
  });

  describe("getCancelMultipleParams", () => {
    it("0, 1", () => {
      expect(
        getCancelMultipleParams([BigNumber.from(0), BigNumber.from(1)]).length
      ).toEqual(1);
      expect(
        getCancelMultipleParams([
          BigNumber.from(0),
          BigNumber.from(1),
        ])[0].word.toString()
      ).toEqual("0");
      expect(
        getCancelMultipleParams([
          BigNumber.from(0),
          BigNumber.from(1),
        ])[0].mask.toString()
      ).toEqual("3");
    });

    it("0, 256", () => {
      expect(
        getCancelMultipleParams([BigNumber.from(0), BigNumber.from(256)]).length
      ).toEqual(2);
      expect(
        getCancelMultipleParams([
          BigNumber.from(0),
          BigNumber.from(256),
        ])[0].word.toString()
      ).toEqual("0");
      expect(
        getCancelMultipleParams([
          BigNumber.from(0),
          BigNumber.from(256),
        ])[1].word.toString()
      ).toEqual("1");
      expect(
        getCancelMultipleParams([
          BigNumber.from(0),
          BigNumber.from(256),
        ])[0].mask.toString()
      ).toEqual("1");
      expect(
        getCancelMultipleParams([
          BigNumber.from(0),
          BigNumber.from(256),
        ])[1].mask.toString()
      ).toEqual("1");
    });
  });
});
