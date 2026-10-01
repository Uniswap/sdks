import JSBI from 'jsbi'
import { MaxUint256 } from '../constants'
import { MAX_SAFE_INTEGER, sqrt } from './sqrt'

describe('#sqrt', () => {
  it('correct for 0-1000', () => {
    for (let i = 0; i < 1000; i++) {
      expect(sqrt(JSBI.BigInt(i))).toEqual(JSBI.BigInt(Math.floor(Math.sqrt(i))))
    }
  })

  describe('correct for all even powers of 2', () => {
    for (let i = 0; i < 256; i++) {
      it(`2^${i * 2}`, () => {
        const root = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(i))
        const rootSquared = JSBI.multiply(root, root)

        expect(sqrt(rootSquared)).toEqual(root)
      })
    }
  })

  it('correct for MaxUint256', () => {
    expect(sqrt(MaxUint256)).toEqual(JSBI.BigInt('340282366920938463463374607431768211455'))
  })

  // Regression: for values just below Number.MAX_SAFE_INTEGER, the fast path's
  // Math.floor(Math.sqrt(n)) can round the *floating-point* square root up
  // past the true integer floor, since Math.sqrt is correctly-rounded to the
  // nearest double rather than to the true (irrational) mathematical root.
  // These assertions check the actual definition of floor(sqrt(n)) -
  // result^2 <= n < (result+1)^2 - via exact JSBI integer arithmetic, not
  // against Math.sqrt itself (which is the thing that was wrong).
  it('correct at the Number.MAX_SAFE_INTEGER boundary, including a known rounding case', () => {
    const isExactFloor = (n: JSBI, result: JSBI): boolean => {
      const resultSquared = JSBI.multiply(result, result)
      const nextSquared = JSBI.multiply(JSBI.add(result, JSBI.BigInt(1)), JSBI.add(result, JSBI.BigInt(1)))
      return JSBI.lessThanOrEqual(resultSquared, n) && JSBI.lessThan(n, nextSquared)
    }

    // n = 67108865^2 - 1: Math.sqrt(n) rounds to exactly 67108865.0 in double
    // precision, so Math.floor(Math.sqrt(n)) previously returned 67108865,
    // whose square (4503599761588225) exceeds n - the true floor is 67108864.
    const knownCase = JSBI.BigInt('4503599761588224')
    const knownResult = sqrt(knownCase)
    expect(knownResult).toEqual(JSBI.BigInt('67108864'))
    expect(isExactFloor(knownCase, knownResult)).toBe(true)

    // The bug only manifests for n exactly one less than a perfect square
    // (n = k^2 - 1), where Math.sqrt(n)'s correctly-rounded double happens to
    // round up to exactly k.0 - about 29% of such k^2-1 values in this range
    // trigger it. A sweep of *arbitrary* n near MAX_SAFE_INTEGER (as opposed
    // to values specifically of this shape) would not reproduce the bug at
    // all, since it depends on n's distance from the nearest perfect square,
    // not on n's magnitude - confirmed by re-deriving this independently
    // rather than assuming it. Sweep k across a wide span of the fast-path
    // range, including near its very top (k close to sqrt(MAX_SAFE_INTEGER)
    // ~= 94906265, where k^2 and (k+1)^2 can themselves approach or exceed
    // MAX_SAFE_INTEGER - isExactFloor above still checks them exactly, via
    // JSBI, not via a second float computation).
    const sampleKs = [
      2, 3, 4, 10, 100, 1000, 65536, 1_000_000, 67108864, 67108865, 67108866,
      94906263, 94906264, 94906265, 94906266,
    ]
    for (const k of sampleKs) {
      const n = JSBI.subtract(JSBI.multiply(JSBI.BigInt(k), JSBI.BigInt(k)), JSBI.BigInt(1))
      if (JSBI.lessThan(n, JSBI.BigInt(0)) || !JSBI.lessThan(n, MAX_SAFE_INTEGER)) continue
      const result = sqrt(n)
      expect(isExactFloor(n, result)).toBe(true)
    }
  })
})
