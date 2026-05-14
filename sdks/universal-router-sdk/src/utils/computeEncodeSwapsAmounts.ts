import { BigNumber } from 'ethers'
import { TradeType } from '@uniswap/sdk-core'
import { isAtLeastV2_1_1 } from './constants'
import { encodeFee1e18, encodeFeeBips } from './numbers'
import { NormalizedSwapSpecification } from '../types/encodeSwaps'

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
      .mul(slippageDenominator)
      .div(slippageDenominator.add(slippageNumerator))

    if (spec.fee?.kind === 'portion') {
      const feeAmount = isAtLeastV2_1_1(spec.urVersion)
        ? grossMinOrExactAmountOut.mul(BigNumber.from(encodeFee1e18(spec.fee.fee))).div(BigNumber.from(10).pow(18))
        : grossMinOrExactAmountOut.mul(BigNumber.from(encodeFeeBips(spec.fee.fee))).div(10_000)

      return {
        exactOrMaxAmountIn: routingAmount,
        grossMinOrExactAmountOut,
        netMinOrExactAmountOut: grossMinOrExactAmountOut.sub(feeAmount),
      }
    }

    return {
      exactOrMaxAmountIn: routingAmount,
      grossMinOrExactAmountOut,
      netMinOrExactAmountOut: grossMinOrExactAmountOut,
    }
  }

  const exactOrMaxAmountIn = routingQuote.mul(slippageDenominator.add(slippageNumerator)).div(slippageDenominator)
  const grossMinOrExactAmountOut = routingAmount
  const netMinOrExactAmountOut =
    spec.fee?.kind === 'flat' ? grossMinOrExactAmountOut.sub(BigNumber.from(spec.fee.amount)) : grossMinOrExactAmountOut

  return {
    exactOrMaxAmountIn,
    grossMinOrExactAmountOut,
    netMinOrExactAmountOut,
  }
}
