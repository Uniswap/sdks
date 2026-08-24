import { BigNumber } from "ethers";

import { NonlinearDutchDecay, V3DutchInput, V3DutchOutput } from "../order/types";

import { decayInput, decayOutput } from "./dutchBlockDecay";

const TOKEN = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const RECIPIENT = "0x0000000000000000000000000000000000000001";
const UINT256_MAX = BigNumber.from(2).pow(256).sub(1);

function input(
  startAmount: number | BigNumber,
  curve: NonlinearDutchDecay,
  maxAmount: number | BigNumber
): V3DutchInput {
  return {
    token: TOKEN,
    startAmount: BigNumber.from(startAmount),
    curve,
    maxAmount: BigNumber.from(maxAmount),
    adjustmentPerGweiBaseFee: BigNumber.from(0),
  };
}

function output(
  startAmount: number | BigNumber,
  curve: NonlinearDutchDecay,
  minAmount: number | BigNumber
): V3DutchOutput {
  return {
    token: TOKEN,
    startAmount: BigNumber.from(startAmount),
    curve,
    recipient: RECIPIENT,
    minAmount: BigNumber.from(minAmount),
    adjustmentPerGweiBaseFee: BigNumber.from(0),
  };
}

const UNBOUNDED_INPUT_MAX = UINT256_MAX;
const UNBOUNDED_OUTPUT_MIN = 0;

describe("dutchBlockDecay", () => {
  describe("linear interpolation", () => {
    it("interpolates evenly divisible decay identically for input and output", () => {
      const curve = { relativeBlocks: [10], relativeAmounts: [BigInt(50)] };
      expect(decayInput(input(100, curve, UNBOUNDED_INPUT_MAX), 0, 5).toString()).toEqual("75");
      expect(decayOutput(output(100, curve, UNBOUNDED_OUTPUT_MIN), 0, 5).toString()).toEqual("75");
    });

    it("rounds a decaying curve in favor of the swapper", () => {
      // curve delta at the midpoint is 12.5
      const curve = { relativeBlocks: [10], relativeAmounts: [BigInt(25)] };
      // input rounds the delta up, so the swapper pays less
      expect(decayInput(input(100, curve, UNBOUNDED_INPUT_MAX), 0, 5).toString()).toEqual("87");
      // output rounds the delta down, so the swapper receives more
      expect(decayOutput(output(100, curve, UNBOUNDED_OUTPUT_MIN), 0, 5).toString()).toEqual("88");
    });

    it("rounds an increasing curve in favor of the swapper", () => {
      // curve delta at the midpoint is -12.5
      const curve = { relativeBlocks: [10], relativeAmounts: [BigInt(-25)] };
      expect(decayInput(input(100, curve, UNBOUNDED_INPUT_MAX), 0, 5).toString()).toEqual("112");
      expect(decayOutput(output(100, curve, UNBOUNDED_OUTPUT_MIN), 0, 5).toString()).toEqual("113");
    });

    it("interpolates between two curve points", () => {
      const curve = { relativeBlocks: [4, 6], relativeAmounts: [BigInt(40), BigInt(20)] };
      expect(decayOutput(output(100, curve, UNBOUNDED_OUTPUT_MIN), 0, 5).toString()).toEqual("70");
    });
  });

  describe("curve boundaries", () => {
    const curve = { relativeBlocks: [4], relativeAmounts: [BigInt(40)] };

    it("returns the start amount before decay begins", () => {
      expect(decayOutput(output(100, curve, UNBOUNDED_OUTPUT_MIN), 10, 10).toString()).toEqual("100");
    });

    it("returns the start amount for an empty curve", () => {
      const empty = { relativeBlocks: [], relativeAmounts: [] };
      expect(decayOutput(output(100, empty, UNBOUNDED_OUTPUT_MIN), 0, 99).toString()).toEqual("100");
    });

    it("holds the end amount past the end of the curve", () => {
      expect(decayOutput(output(100, curve, UNBOUNDED_OUTPUT_MIN), 0, 400).toString()).toEqual("60");
    });

    it("caps the block delta at uint16 max rather than overflowing", () => {
      // onchain blockDelta is a uint16; a delta of 65536 must express a full
      // decay rather than wrapping around to 0
      const longCurve = { relativeBlocks: [65535], relativeAmounts: [BigInt(40)] };
      expect(decayOutput(output(100, longCurve, UNBOUNDED_OUTPUT_MIN), 0, 65536).toString()).toEqual("60");
    });

    it("throws on a curve with more than 16 points", () => {
      const tooLong = {
        relativeBlocks: Array.from({ length: 17 }, (_, i) => i + 1),
        relativeAmounts: Array.from({ length: 17 }, () => BigInt(1)),
      };
      expect(() => decayOutput(output(100, tooLong, UNBOUNDED_OUTPUT_MIN), 0, 5)).toThrow(
        "InvalidDecayCurve"
      );
    });
  });

  describe("bounds", () => {
    it("clamps an input curve that would resolve above maxAmount", () => {
      // curve resolves to 1_000_000 but the signed maxAmount is 1
      const curve = { relativeBlocks: [1], relativeAmounts: [BigInt(-999_999)] };
      expect(decayInput(input(1, curve, 1), 0, 1).toString()).toEqual("1");
    });

    it("clamps an input curve that would resolve below zero", () => {
      const curve = { relativeBlocks: [1], relativeAmounts: [BigInt(500)] };
      expect(decayInput(input(100, curve, 1000), 0, 1).toString()).toEqual("0");
    });

    it("clamps an output curve that would resolve below minAmount", () => {
      // curve resolves to 1 but the signed minAmount is 1_000_000
      const curve = { relativeBlocks: [1], relativeAmounts: [BigInt(999_999)] };
      expect(decayOutput(output(1_000_000, curve, 1_000_000), 0, 1).toString()).toEqual("1000000");
    });

    it("bounds the start amount even when there is no decay", () => {
      const empty = { relativeBlocks: [], relativeAmounts: [] };
      expect(decayInput(input(1000, empty, 1), 0, 5).toString()).toEqual("1");
      expect(decayOutput(output(1, empty, 1000), 0, 5).toString()).toEqual("1000");
    });
  });

  // Tempo (chainId 4217) has ~0.5s blocks, so a realistic Dutch_V3 decay window
  // of ~30s wallclock corresponds to 60 blocks. The block-delta math is
  // chain-agnostic: it operates purely on block deltas, so no source change is
  // required for Tempo support. These tests exercise that math at
  // Tempo-realistic block lengths to guard against regressions.
  describe("Tempo-realistic decay (60 blocks @ 0.5s ~= 30s wallclock)", () => {
    const TEMPO_DECAY_BLOCKS = 60;
    const decayStartBlock = 1_000_000;
    const startAmount = BigNumber.from("1000000000000000000"); // 1e18
    const decayDelta = BigInt("100000000000000000"); // 0.1e18
    const curve = {
      relativeBlocks: [TEMPO_DECAY_BLOCKS],
      relativeAmounts: [decayDelta],
    };
    const tempoOutput = output(startAmount, curve, UNBOUNDED_OUTPUT_MIN);

    it("returns startAmount at decayStartBlock", () => {
      expect(decayOutput(tempoOutput, decayStartBlock, decayStartBlock).toString()).toEqual(
        startAmount.toString()
      );
    });

    it("returns endAmount after the full Tempo decay window", () => {
      expect(
        decayOutput(tempoOutput, decayStartBlock, decayStartBlock + TEMPO_DECAY_BLOCKS).toString()
      ).toEqual(startAmount.sub(decayDelta.toString()).toString());
    });

    it("linearly interpolates at the midpoint of the Tempo decay window", () => {
      expect(
        decayOutput(
          tempoOutput,
          decayStartBlock,
          decayStartBlock + TEMPO_DECAY_BLOCKS / 2
        ).toString()
      ).toEqual(startAmount.sub((decayDelta / BigInt(2)).toString()).toString());
    });

    it("clamps to endAmount past the Tempo decay window", () => {
      expect(
        decayOutput(
          tempoOutput,
          decayStartBlock,
          decayStartBlock + TEMPO_DECAY_BLOCKS * 10
        ).toString()
      ).toEqual(startAmount.sub(decayDelta.toString()).toString());
    });
  });
});
