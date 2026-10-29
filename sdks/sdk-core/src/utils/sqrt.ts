import JSBI from 'jsbi'
import invariant from 'tiny-invariant'

export const MAX_SAFE_INTEGER = JSBI.BigInt(Number.MAX_SAFE_INTEGER)

const ZERO = JSBI.BigInt(0)
const ONE = JSBI.BigInt(1)
const TWO = JSBI.BigInt(2)

/**
 * Computes floor(sqrt(value))
 * @param value the value for which to compute the square root, rounded down
 */
export function sqrt(value: JSBI): JSBI {
  invariant(JSBI.greaterThanOrEqual(value, ZERO), 'NEGATIVE')

  // rely on built in sqrt if possible
  if (JSBI.lessThan(value, MAX_SAFE_INTEGER)) {
    const n = JSBI.toNumber(value)
    // Math.sqrt is correctly-rounded to the nearest double, not to the true
    // integer square root, so Math.floor(Math.sqrt(n)) can be one too high
    // when the true (irrational) square root is extremely close to an
    // integer from below - e.g. n = 4503599761588224 rounds up to 67108865,
    // whose square (4503599761588225) exceeds n. Correct the boundary with
    // exact integer arithmetic: with a correctly-rounded Math.sqrt, the
    // initial estimate can only be exact or one too high in this range, so
    // the decrement loop below runs at most once; the increment loop is
    // defensive.
    //
    // z*z is always exactly representable as a JS number here: n < MAX_SAFE_
    // INTEGER (2^53 - 1) by the guard above, so z = floor(sqrt(n)) is always
    // < sqrt(2^53), meaning z*z < 2^53 and is exact regardless of parity.
    // (z+1)*(z+1) can exceed 2^53 - 1 only in the single case z = 94906265
    // (the maximum z reachable in this range), where z+1 = 94906266 is even
    // - so (z+1)*(z+1) is a multiple of 4 and stays exactly representable in
    // the [2^53, 2^54) range, where doubles can only exactly represent even
    // integers.
    let z = Math.floor(Math.sqrt(n))
    while (z * z > n) z--
    while ((z + 1) * (z + 1) <= n) z++
    return JSBI.BigInt(z)
  }

  let z: JSBI
  let x: JSBI
  z = value
  x = JSBI.add(JSBI.divide(value, TWO), ONE)
  while (JSBI.lessThan(x, z)) {
    z = x
    x = JSBI.divide(JSBI.add(JSBI.divide(value, x), x), TWO)
  }
  return z
}
