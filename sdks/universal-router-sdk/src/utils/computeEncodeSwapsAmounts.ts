import { BigNumber } from 'ethers'
import invariant from 'tiny-invariant'
import { TradeType } from '@uniswap/sdk-core'
import { isAtLeastV2_1_1 } from './constants'
import { encodeFee1e18, encodeFeeBips } from './numbers'
import { NormalizedSwapSpecification } from '../types/encodeSwaps'
import { toFlatFeeList, toPortionFeeList } from './normalizeEncodeSwapsSpec'

// gross = pre-fee (what the swap routes must produce)
// net = post-fee (what the recipient actually receives, used as the floor on the final SWEEP)
export type EncodeSwapsAmounts = {
  exactOrMaxAmountIn: BigNumber
  grossMinOrExactAmountOut: BigNumber
  netMinOrExactAmountOut: BigNumber
}

// Slippage is applied to the quote: scaled down to a floor for exact-input output,
// scaled up to a ceiling for exact-output input. The unscaled side is the user's exact value.
// Portion fees pair with exact-input (1e18 precision on >=v2.1.1, bps on v2.0); flat fees pair with exact-output.
export function computeEncodeSwapsAmounts(spec: NormalizedSwapSpecification): EncodeSwapsAmounts {
  const routingAmount = BigNumber.from(spec.routing.amount.quotient.toString())
  const routingQuote = BigNumber.from(spec.routing.quote.quotient.toString())
  const slippageNumerator = BigNumber.from(spec.slippageTolerance.numerator.toString())
  const slippageDenominator = BigNumber.from(spec.slippageTolerance.denominator.toString())

  if (spec.tradeType === TradeType.EXACT_INPUT) {
    const grossMinOrExactAmountOut = routingQuote
      .mul(slippageDenominator.sub(slippageNumerator))
      .div(slippageDenominator)

    // One deduction per recipient, each floored on its own exactly as the single-fee case always
    // has been, then summed. Every portion is measured against the same pre-fee gross amount,
    // while on-chain each PAY_PORTION reads the router's *current* balance and so the portions
    // compound downward — the sum is therefore an upper bound on what the recipients together
    // take, which can only make the sweep floor more conservative, never short.
    const useFullPrecision = isAtLeastV2_1_1(spec.urVersion)
    let feeAmount = BigNumber.from(0)
    for (const portionFee of toPortionFeeList(spec.fee)) {
      feeAmount = feeAmount.add(
        useFullPrecision
          ? grossMinOrExactAmountOut.mul(BigNumber.from(encodeFee1e18(portionFee.fee))).div(BigNumber.from(10).pow(18))
          : grossMinOrExactAmountOut.mul(BigNumber.from(encodeFeeBips(portionFee.fee))).div(10_000)
      )
    }

    // Several individually valid portions can sum past 100%. Without this the subtraction below
    // goes negative and fails deep inside ABI encoding instead of at the call site.
    invariant(feeAmount.lte(grossMinOrExactAmountOut), 'FEE_TOTAL_GT_AMOUNT_OUT')

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
