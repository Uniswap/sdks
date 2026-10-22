import { BigNumber } from "ethers";

/*
Port of UniswapX's MathExt.sol and the solmate fixed point helpers it builds on.
These mirror the onchain implementations exactly - including rounding direction
and saturation behaviour - so that offchain resolution produces the same amounts
the reactor settles with.
*/

export const UINT256_MAX = BigNumber.from(2).pow(256).sub(1);
export const INT256_MAX = BigNumber.from(2).pow(255).sub(1);

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

/**
 * Multiplies with the same guards solmate's FixedPointMathLib applies: it
 * reverts on a zero denominator or when `x * y` would exceed uint256. Onchain
 * these are checked in assembly; here `x` and `y` are non-negative amounts and
 * block/gwei factors, so a full-precision product compared against uint256 max
 * reproduces the overflow revert. Throwing keeps resolution faithful - a filler
 * sees a thrown error where the reactor would revert, instead of a bogus amount
 * from arbitrary-precision math for a transaction that can only revert.
 */
function mulOrRevert(
  x: BigNumber,
  y: BigNumber,
  denominator: BigNumber
): BigNumber {
  if (denominator.isZero()) {
    throw new Error("mulDiv: division by zero");
  }
  const product = x.mul(y);
  if (product.gt(UINT256_MAX)) {
    throw new Error("mulDiv: uint256 overflow");
  }
  return product;
}

/** Mirrors solmate's FixedPointMathLib.mulDivDown. */
export function mulDivDown(
  x: BigNumber,
  y: BigNumber,
  denominator: BigNumber
): BigNumber {
  return mulOrRevert(x, y, denominator).div(denominator);
}

/** Mirrors solmate's FixedPointMathLib.mulDivUp. */
export function mulDivUp(
  x: BigNumber,
  y: BigNumber,
  denominator: BigNumber
): BigNumber {
  const product = mulOrRevert(x, y, denominator);
  const quotient = product.div(denominator);
  return product.mod(denominator).isZero() ? quotient : quotient.add(1);
}

/**
 * Subtracts two unsigned values into a signed result, mirroring
 * MathExt.sub(uint256, uint256). The reactor casts the magnitude with
 * SafeCast.toInt256, which reverts once it exceeds int256 max; this reproduces
 * that revert rather than returning a value the reactor never would.
 */
export function subToInt256(a: BigNumber, b: BigNumber): BigNumber {
  const magnitude = a.gt(b) ? a.sub(b) : b.sub(a);
  if (magnitude.gt(INT256_MAX)) {
    throw new Error("SafeCast: int256 overflow");
  }
  return a.lt(b) ? magnitude.mul(-1) : magnitude;
}
