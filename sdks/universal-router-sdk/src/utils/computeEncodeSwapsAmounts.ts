import { BigNumber } from 'ethers'
import invariant from 'tiny-invariant'
import { TradeType } from '@uniswap/sdk-core'
import { NormalizedSwapSpecification } from '../types/encodeSwaps'
import { isAtLeastV2_1_1 } from './constants'
import { toFlatFeeList, toPortionFeeList } from './normalizeEncodeSwapsSpec'
import { scalePortionFees, simulatePortionFeeDeduction } from './portionFees'

// gross = pre-fee (what the swap routes must produce)
// net = post-fee (what the recipient actually receives, used as the floor on the final SWEEP)
export type EncodeSwapsAmounts = {
  exactOrMaxAmountIn: BigNumber
  grossMinOrExactAmountOut: BigNumber
  netMinOrExactAmountOut: BigNumber
}

// Slippage is applied to the quote: scaled down to a floor for exact-input output,
// scaled up to a ceiling for exact-output input. The unscaled side is the user's exact value.
// Portion fees are fractions of the gross output; flat fees pair with exact-output.
export function computeEncodeSwapsAmounts(spec: NormalizedSwapSpecification): EncodeSwapsAmounts {
  const routingAmount = BigNumber.from(spec.routing.amount.quotient.toString())
  const routingQuote = BigNumber.from(spec.routing.quote.quotient.toString())
  const slippageNumerator = BigNumber.from(spec.slippageTolerance.numerator.toString())
  const slippageDenominator = BigNumber.from(spec.slippageTolerance.denominator.toString())

  if (spec.tradeType === TradeType.EXACT_INPUT) {
    const grossMinOrExactAmountOut = routingQuote
      .mul(slippageDenominator.sub(slippageNumerator))
      .div(slippageDenominator)

    // The sweep floor must expect exactly what the encoded fee commands leave behind when the
    // router holds the gross minimum, so the deduction replays their cascade — same scaled
    // portions, same encoded precision as the encoder emits. It never exceeds the gross by
    // construction (each payment floors against the running balance), and portions that
    // together exceed 100% throw inside scalePortionFees before any subtraction can underflow.
    const feeAmount = simulatePortionFeeDeduction(
      grossMinOrExactAmountOut,
      scalePortionFees(toPortionFeeList(spec.fee)),
      isAtLeastV2_1_1(spec.urVersion)
    )

    return {
      exactOrMaxAmountIn: routingAmount,
      grossMinOrExactAmountOut,
      netMinOrExactAmountOut: grossMinOrExactAmountOut.sub(feeAmount),
    }
  }

  const exactOrMaxAmountIn = routingQuote.mul(slippageDenominator.add(slippageNumerator)).div(slippageDenominator)
  const grossMinOrExactAmountOut = routingAmount

  // Flat fees are absolute TRANSFERs, so unlike portions the sum is exact rather than an upper
  // bound; the router must hold every one of them on top of the settled amount.
  let flatFeeTotal = BigNumber.from(0)
  for (const flatFee of toFlatFeeList(spec.fee)) {
    flatFeeTotal = flatFeeTotal.add(BigNumber.from(flatFee.amount))
  }
  invariant(flatFeeTotal.lte(grossMinOrExactAmountOut), 'FEE_TOTAL_GT_AMOUNT_OUT')

  return {
    exactOrMaxAmountIn,
    grossMinOrExactAmountOut,
    netMinOrExactAmountOut: grossMinOrExactAmountOut.sub(flatFeeTotal),
  }
}
