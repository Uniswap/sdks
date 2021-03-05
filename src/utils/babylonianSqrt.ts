import JSBI from 'jsbi'
import { ONE, THREE, TWO, ZERO } from '../constants'

// computes floor(babylonianSqrt(y)) using the babylonian method (not the fastest way)
export default function babylonianSqrt(y: JSBI): JSBI {
  let z: JSBI = ZERO
  let x: JSBI
  if (y > THREE) {
    z = y
    x = JSBI.add(JSBI.divide(y, TWO), ONE)
    while (x < z) {
      z = x
      x = JSBI.divide(JSBI.add(JSBI.divide(y, x), x), TWO)
    }
  } else if (y !== ZERO) {
    z = ONE
  }
  return z
}
