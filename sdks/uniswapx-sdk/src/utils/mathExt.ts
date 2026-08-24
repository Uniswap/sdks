import { BigNumber } from "ethers";

/*
Port of UniswapX's MathExt.sol and the solmate fixed point helpers it builds on.
These mirror the onchain implementations exactly - including rounding direction
and saturation behaviour - so that offchain resolution produces the same amounts
the reactor settles with.
*/

export const UINT256_MAX = BigNumber.from(2).pow(256).sub(1);

/**
 * Bounds a value to [min, max].
 * Mirrors MathExt.bound, which is Math.min(Math.max(value, min), max) and so
 * resolves to `max` when the caller passes min > max.
 */
export function bound(
  value: BigNumber,
  min: BigNumber,
  max: BigNumber
): BigNumber {
  const atLeastMin = value.gt(min) ? value : min;
  return atLeastMin.lt(max) ? atLeastMin : max;
}

/**
 * Subtracts a signed value `b` from an unsigned value `a`, saturating rather
 * than reverting on over/underflow, and bounds the result to [min, max].
 * Mirrors MathExt.boundedSub.
 */
export function boundedSub(
  a: BigNumber,
  b: BigNumber,
  min: BigNumber,
  max: BigNumber
): BigNumber {
  let result: BigNumber;
  if (b.isNegative()) {
    const absB = b.mul(-1);
    // would overflow
    if (UINT256_MAX.sub(absB).lt(a)) {
      return max;
    }
    result = a.add(absB);
  } else {
    // would underflow, cap it at min
    if (a.lt(b)) {
      return min;
    }
    result = a.sub(b);
  }
  return bound(result, min, max);
}

/**
 * Adds a signed value `b` to an unsigned value `a`, bounded to [min, max].
 * Mirrors MathExt.boundedAdd.
 */
export function boundedAdd(
  a: BigNumber,
  b: BigNumber,
  min: BigNumber,
  max: BigNumber
): BigNumber {
  return boundedSub(a, b.mul(-1), min, max);
}

/** Mirrors solmate's FixedPointMathLib.mulDivDown. */
export function mulDivDown(
  x: BigNumber,
  y: BigNumber,
  denominator: BigNumber
): BigNumber {
  return x.mul(y).div(denominator);
}

/** Mirrors solmate's FixedPointMathLib.mulDivUp. */
export function mulDivUp(
  x: BigNumber,
  y: BigNumber,
  denominator: BigNumber
): BigNumber {
  const product = x.mul(y);
  const quotient = product.div(denominator);
  return product.mod(denominator).isZero() ? quotient : quotient.add(1);
}
