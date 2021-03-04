import { ONE, THREE, TWO, ZERO } from '../constants'

// computes floor(babylonianSqrt(y)) using the babylonian method (not the fastest way)
export default function babylonianSqrt(y: bigint): bigint {
  let z: bigint = ZERO
  let x: bigint
  if (y > THREE) {
    z = y
    x = y / TWO + ONE
    while (x < z) {
      z = x
      x = (y / x + x) / TWO
    }
  } else if (y !== ZERO) {
    z = ONE
  }
  return z
}
