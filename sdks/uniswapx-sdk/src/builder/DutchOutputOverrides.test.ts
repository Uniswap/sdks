import { BigNumber, constants } from "ethers";

import { V2DutchOrderBuilder } from "./V2DutchOrderBuilder";
import { V3DutchOrderBuilder } from "./V3DutchOrderBuilder";

const INPUT_TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const OUTPUT_TOKEN = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const OUTPUT_TOKEN_2 = "0x6b175474e89094c44da98b954eedeac495271d0f";

const INPUT_START_AMOUNT = BigNumber.from("1000000");
const OUTPUT_START_AMOUNT = BigNumber.from("1000000000000000000");

// V2 and V3 share the gap but not the builder API, so each gets its own fixture
// built the way that builder's own tests build one.

function v2Builder(outputs: number, overrideCount: number) {
  const builder = new V2DutchOrderBuilder(1, constants.AddressZero);
  const d = Math.floor(Date.now() / 1000) + 1000;

  builder
    .cosigner(constants.AddressZero)
    .cosignature("0x")
    .deadline(d)
    .decayEndTime(d)
    .decayStartTime(d - 100)
    .swapper(constants.AddressZero)
    .nonce(BigNumber.from(100))
    .input({
      token: INPUT_TOKEN,
      startAmount: INPUT_START_AMOUNT,
      endAmount: INPUT_START_AMOUNT,
    });

  const tokens =
    outputs === 1 ? [OUTPUT_TOKEN] : [OUTPUT_TOKEN, OUTPUT_TOKEN_2];
  for (const token of tokens) {
    builder.output({
      token,
      startAmount: OUTPUT_START_AMOUNT,
      endAmount: OUTPUT_START_AMOUNT.mul(90).div(100),
      recipient: constants.AddressZero,
    });
  }

  return builder.cosignerData({
    decayStartTime: d - 100,
    decayEndTime: d,
    exclusiveFiller: constants.AddressZero,
    exclusivityOverrideBps: BigNumber.from(0),
    inputOverride: INPUT_START_AMOUNT,
    outputOverrides: Array.from({ length: overrideCount }, () =>
      BigNumber.from(OUTPUT_START_AMOUNT)
    ),
  });
}

function v3Builder(outputs: number, overrideCount: number) {
  const builder = new V3DutchOrderBuilder(1, constants.AddressZero);

  builder
    .cosigner(constants.AddressZero)
    .cosignature("0x")
    .deadline(Math.floor(Date.now() / 1000) + 1000)
    .decayStartBlock(212121)
    .swapper(constants.AddressZero)
    .nonce(BigNumber.from(100))
    .startingBaseFee(BigNumber.from(0))
    .input({
      token: INPUT_TOKEN,
      startAmount: INPUT_START_AMOUNT,
      curve: { relativeBlocks: [], relativeAmounts: [] },
      maxAmount: INPUT_START_AMOUNT.add(1),
      adjustmentPerGweiBaseFee: BigNumber.from(0),
    });

  for (let i = 0; i < outputs; i++) {
    builder.output({
      token: i === 0 ? OUTPUT_TOKEN : OUTPUT_TOKEN_2,
      startAmount: OUTPUT_START_AMOUNT,
      curve: { relativeBlocks: [4 + i], relativeAmounts: [BigInt(4 + i)] },
      recipient: constants.AddressZero,
      minAmount: OUTPUT_START_AMOUNT.sub(4 + i),
      adjustmentPerGweiBaseFee: BigNumber.from(0),
    });
  }

  return builder
    .inputOverride(INPUT_START_AMOUNT)
    .outputOverrides(
      Array.from({ length: overrideCount }, () =>
        BigNumber.from(OUTPUT_START_AMOUNT)
      )
    );
}

const MSG = "Invariant failed: outputOverrides length must match outputs length";

describe("outputOverrides must match outputs", () => {
  it("V2 rejects fewer overrides than outputs", () => {
    // Resolving this order indexes outputOverrides[idx] per output, so a short
    // array hands undefined to originalIfZero, which expects a BigNumber.
    expect(() => v2Builder(2, 1).build()).toThrow(MSG);
  });

  it("V2 rejects more overrides than outputs", () => {
    // Without a length check the per-override validation reads outputs![idx] on a
    // single-output order, which is an unguarded TypeError instead of a message.
    expect(() => v2Builder(1, 2).build()).toThrow(MSG);
  });

  it("V2 accepts a matching pair", () => {
    expect(() => v2Builder(2, 2).build()).not.toThrow();
    expect(() => v2Builder(1, 1).build()).not.toThrow();
  });

  it("V3 rejects fewer overrides than outputs", () => {
    expect(() => v3Builder(2, 1).build()).toThrow(MSG);
  });

  it("V3 rejects more overrides than outputs", () => {
    expect(() => v3Builder(1, 2).build()).toThrow(MSG);
  });

  it("V3 accepts a matching pair", () => {
    expect(() => v3Builder(2, 2).build()).not.toThrow();
    expect(() => v3Builder(1, 1).build()).not.toThrow();
  });
});
