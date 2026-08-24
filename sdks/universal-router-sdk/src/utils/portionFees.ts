import { Fraction, Percent } from '@uniswap/sdk-core'
import { FeeOptions } from '@uniswap/v3-sdk'

export interface ScaledPortionFee {
  recipient: string
  /** The caller-supplied fee, read as a fraction of the gross swap output. */
  grossFee: Percent
  /**
   * The fee rescaled against the router's remaining balance at the time its
   * PAY_PORTION executes, so the recipient receives exactly `grossFee` of the
   * gross output despite the on-chain command paying a portion of what's left.
   */
  scaledFee: Percent
}

const ONE = new Fraction(1)

/**
 * Rescales portion fees from "fraction of gross output" (what callers specify) to
 * "fraction of the router's remaining balance" (what PAY_PORTION actually pays).
 *
 * On-chain, each PAY_PORTION pays a portion of the router's *current* balance, which the
 * previous portions have already shrunk. To make every recipient receive exactly their
 * stated fraction of the gross output, fee i is encoded as
 *   scaled_i = f_i / (1 - sum(f_0..f_{i-1}))
 * where f are the caller-supplied fractions of gross. All math is exact Fraction
 * arithmetic; no floating point.
 *
 * Throws if the fees together exceed 100% of the output.
 */
export function scalePortionFees(fees: FeeOptions[]): ScaledPortionFee[] {
  let remaining: Fraction = ONE
  return fees.map(({ fee, recipient }) => {
    if (fee.greaterThan(remaining)) throw new Error('Portion fees together exceed 100% of the swap output')
    // remaining can only be 0 here when fee is also 0 (a >0 fee would have thrown above)
    const scaled = remaining.equalTo(0) ? new Fraction(0) : fee.divide(remaining)
    remaining = remaining.subtract(fee)
    return {
      recipient,
      grossFee: new Percent(fee.numerator, fee.denominator),
      scaledFee: new Percent(scaled.numerator, scaled.denominator),
    }
  })
}
