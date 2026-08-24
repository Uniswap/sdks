import { BigNumber } from "ethers";

import {
  NonlinearDutchDecay,
  V3DutchInput,
  V3DutchOutput,
} from "../order/types";

import {
  bound,
  boundedSub,
  mulDivDown,
  mulDivUp,
  UINT256_MAX,
} from "./mathExt";

/*
Port of UniswapX's NonlinearDutchDecayLib.sol.

These functions mirror the onchain implementation exactly so that a filler
resolving an order offchain sees the same amounts V3DutchOrderReactor will
settle with. In particular the decayed amount is always bounded - inputs to
[0, maxAmount] and outputs to [minAmount, uint256.max] - and inputs and outputs
round in opposite directions, both in favor of the swapper.
*/

// blockDelta is a uint16 onchain; larger deltas are capped to express a full decay
const UINT16_MAX = 65535;

// the curve is encoded as a packed uint16 array, so it holds at most 16 points
const MAX_CURVE_POINTS = 16;

/** Interpolates the relative curve amounts between two curve points. */
type DecayFunction = (
  startPoint: number,
  endPoint: number,
  currentPoint: number,
  startAmount: BigNumber,
  endAmount: BigNumber
) => BigNumber;

interface DecayParams {
  curve: NonlinearDutchDecay;
  startAmount: BigNumber;
  decayStartBlock: number;
  blockNumberish: number;
  minAmount: BigNumber;
  maxAmount: BigNumber;
  decayFunc: DecayFunction;
}

// relativeAmounts are signed, so they cannot be held as BigNumber upstream
function toBigNumber(relativeAmount: bigint): BigNumber {
  return BigNumber.from(relativeAmount.toString());
}

/**
 * Locates the curve segment containing `currentRelativeBlock` and returns its
 * bounding points along with their amounts relative to the start amount.
 * Mirrors NonlinearDutchDecayLib.locateCurvePosition.
 */
function locateCurvePosition(
  curve: NonlinearDutchDecay,
  currentRelativeBlock: number
): [number, number, BigNumber, BigNumber] {
  const { relativeBlocks, relativeAmounts } = curve;

  // position is before the start of the curve
  if (relativeBlocks[0] >= currentRelativeBlock) {
    return [
      0,
      relativeBlocks[0],
      BigNumber.from(0),
      toBigNumber(relativeAmounts[0]),
    ];
  }

  const lastCurveIndex = relativeAmounts.length - 1;
  for (let i = 1; i <= lastCurveIndex; i++) {
    if (relativeBlocks[i] >= currentRelativeBlock) {
      return [
        relativeBlocks[i - 1],
        relativeBlocks[i],
        toBigNumber(relativeAmounts[i - 1]),
        toBigNumber(relativeAmounts[i]),
      ];
    }
  }

  // position is past the end of the curve
  return [
    relativeBlocks[lastCurveIndex],
    relativeBlocks[lastCurveIndex],
    toBigNumber(relativeAmounts[lastCurveIndex]),
    toBigNumber(relativeAmounts[lastCurveIndex]),
  ];
}

/**
 * Linear interpolation for input curves.
 * Mirrors NonlinearDutchDecayLib.v3LinearInputDecay: the curve delta is
 * subtracted from the start amount, so maximizing it favors the swapper.
 */
export function v3LinearInputDecay(
  startPoint: number,
  endPoint: number,
  currentPoint: number,
  startAmount: BigNumber,
  endAmount: BigNumber
): BigNumber {
  if (currentPoint >= endPoint) {
    return endAmount;
  }
  const elapsed = BigNumber.from(currentPoint - startPoint);
  const duration = BigNumber.from(endPoint - startPoint);
  const delta = endAmount.lt(startAmount)
    ? mulDivDown(startAmount.sub(endAmount), elapsed, duration).mul(-1)
    : mulDivUp(endAmount.sub(startAmount), elapsed, duration);
  return startAmount.add(delta);
}

/**
 * Linear interpolation for output curves.
 * Mirrors NonlinearDutchDecayLib.v3LinearOutputDecay: the curve delta is
 * subtracted from the start amount, so minimizing it favors the swapper.
 */
export function v3LinearOutputDecay(
  startPoint: number,
  endPoint: number,
  currentPoint: number,
  startAmount: BigNumber,
  endAmount: BigNumber
): BigNumber {
  if (currentPoint >= endPoint) {
    return endAmount;
  }
  const elapsed = BigNumber.from(currentPoint - startPoint);
  const duration = BigNumber.from(endPoint - startPoint);
  const delta = endAmount.lt(startAmount)
    ? mulDivUp(startAmount.sub(endAmount), elapsed, duration).mul(-1)
    : mulDivDown(endAmount.sub(startAmount), elapsed, duration);
  return startAmount.add(delta);
}

/**
 * Calculates the bounded decayed amount for the given curve.
 * Mirrors NonlinearDutchDecayLib.decay.
 */
function decay(params: DecayParams): BigNumber {
  const {
    curve,
    startAmount,
    decayStartBlock,
    blockNumberish,
    minAmount,
    maxAmount,
    decayFunc,
  } = params;

  // mismatch of relativeAmounts and relativeBlocks
  if (curve.relativeAmounts.length > MAX_CURVE_POINTS) {
    throw new Error("InvalidDecayCurve");
  }

  // handle current block before decay or no decay
  if (decayStartBlock >= blockNumberish || curve.relativeAmounts.length === 0) {
    return bound(startAmount, minAmount, maxAmount);
  }

  // a blockDelta past uint16 max downcasts onchain, so it is capped to express a full decay
  const blockDelta = Math.min(blockNumberish - decayStartBlock, UINT16_MAX);
  const [startPoint, endPoint, relativeStart, relativeEnd] =
    locateCurvePosition(curve, blockDelta);

  // decay only the relative amounts, then apply the result within bounds
  const curveDelta = decayFunc(
    startPoint,
    endPoint,
    blockDelta,
    relativeStart,
    relativeEnd
  );

  return boundedSub(startAmount, curveDelta, minAmount, maxAmount);
}

/**
 * Resolves the input amount the reactor will transfer from the swapper.
 * Bounded to [0, maxAmount], matching NonlinearDutchDecayLib.decay(V3DutchInput).
 */
export function decayInput(
  input: V3DutchInput,
  decayStartBlock: number,
  blockNumberish: number
): BigNumber {
  return decay({
    curve: input.curve,
    startAmount: input.startAmount,
    decayStartBlock,
    blockNumberish,
    minAmount: BigNumber.from(0),
    maxAmount: input.maxAmount,
    decayFunc: v3LinearInputDecay,
  });
}

/**
 * Resolves the output amount the reactor will transfer from the filler.
 * Bounded to [minAmount, uint256.max], matching
 * NonlinearDutchDecayLib.decay(V3DutchOutput).
 */
export function decayOutput(
  output: V3DutchOutput,
  decayStartBlock: number,
  blockNumberish: number
): BigNumber {
  return decay({
    curve: output.curve,
    startAmount: output.startAmount,
    decayStartBlock,
    blockNumberish,
    minAmount: output.minAmount,
    maxAmount: UINT256_MAX,
    decayFunc: v3LinearOutputDecay,
  });
}

export interface DutchBlockDecayConfig {
  decayStartBlock: number;
  startAmount: BigNumber;
  relativeBlocks: number[];
  relativeAmounts: bigint[];
}

/**
 * Returns the raw amount at the end of the curve, ignoring the input/output
 * bounds. Only meaningful for describing the curve itself - use decayInput or
 * decayOutput to resolve the amount a reactor will actually settle with.
 */
export function getEndAmount(
  config: Partial<DutchBlockDecayConfig>
): BigNumber {
  const { startAmount, relativeAmounts } = config;
  if (!startAmount || !relativeAmounts) {
    throw new Error("Invalid config for getting V3 decay end amount");
  }
  return startAmount.sub(
    relativeAmounts[relativeAmounts.length - 1].toString()
  );
}
