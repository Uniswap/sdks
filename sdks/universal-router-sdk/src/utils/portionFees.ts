import { BigNumber } from 'ethers'
import { Fraction, Percent } from '@uniswap/sdk-core'
import { FeeOptions } from '@uniswap/v3-sdk'
import { encodeFee1e18, encodeFeeBips } from './numbers'

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

const FEE_1E18_DENOMINATOR = BigNumber.from(10).pow(18)
const FEE_BIPS_DENOMINATOR = BigNumber.from(10_000)

/**
 * Computes the total the encoded fee commands actually pay when the router holds exactly
 * `grossAmount` of the output token.
 *
 * On-chain, each PAY_PORTION floors against the router's *running* balance using the portion
 * value that gets ABI-encoded (the fraction truncated to 1e18 or bips precision), so dust left
 * by an earlier fee's floor can be captured by a later (rescaled-larger) portion. Summing
 * floor(grossAmount * f_i) over the caller-supplied fractions can therefore differ from the
 * on-chain payments by a few wei in either direction — understating them makes a sweep floor
 * derived from it unmeetable. Replaying the cascade with the encoded values is exact.
 *
 * For a single fee this reduces to floor(grossAmount * encodedFee / SCALE), the quantized
 * deduction the single-fee path has always used, keeping its calldata byte-identical.
 *
 * Every payment is at most the running balance, so the result never exceeds `grossAmount`; and
 * because each step leaves a (weakly) larger remainder from a larger balance, a router holding
 * more than `grossAmount` keeps at least `grossAmount` minus this deduction — the floor also
 * holds for any fill above `grossAmount`.
 */
export function simulatePortionFeeDeduction(
  grossAmount: BigNumber,
  scaledFees: ScaledPortionFee[],
  useFullPrecision: boolean
): BigNumber {
  let remainingBalance = grossAmount
  for (const { scaledFee } of scaledFees) {
    const encodedPortion = BigNumber.from(useFullPrecision ? encodeFee1e18(scaledFee) : encodeFeeBips(scaledFee))
    const portionDenominator = useFullPrecision ? FEE_1E18_DENOMINATOR : FEE_BIPS_DENOMINATOR
    remainingBalance = remainingBalance.sub(remainingBalance.mul(encodedPortion).div(portionDenominator))
  }
  return grossAmount.sub(remainingBalance)
}
