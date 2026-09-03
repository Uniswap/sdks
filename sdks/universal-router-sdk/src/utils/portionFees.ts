import { BigNumber } from 'ethers'
import { Fraction, Percent } from '@uniswap/sdk-core'
import { FeeOptions } from '@uniswap/v3-sdk'
import { encodeFee1e18, encodeFeeBips } from './numbers'

export interface ScaledPortionFee {
  recipient: string
  /** The caller-supplied fee, read as a fraction of the gross swap output. */
  grossFee: Percent
  /** Rescaled against the balance remaining when its PAY_PORTION executes, so the recipient still gets `grossFee` of gross. */
  scaledFee: Percent
}

const ONE = new Fraction(1)

/** Gross fractions to remaining-balance fractions: scaled_i = f_i / (1 - sum(f_0..f_{i-1})), in exact Fraction arithmetic; throws at or past 100%, since a 100% total encodes a swap that pays the swapper nothing. */
export function scalePortionFees(fees: FeeOptions[]): ScaledPortionFee[] {
  let remaining: Fraction = ONE
  return fees.map(({ fee, recipient }) => {
    // Strictly less: remaining stays positive, so the swapper's sweep is always non-empty.
    if (!fee.lessThan(remaining)) throw new Error('Portion fees together exceed 100% of the swap output')
    const scaled = fee.divide(remaining)
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

/** Replays the cascade with the ENCODED portions, which is exact where sum(floor(gross * f_i)) is off by dust either way; reduces to the legacy quantized deduction for a single fee, never exceeds grossAmount, and holds for larger fills. */
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
