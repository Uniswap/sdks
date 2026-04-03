import { BigNumber } from 'ethers'
import { TradeType } from '@uniswap/sdk-core'
import { SwapSpecification } from '../types/encodeSwaps'

export type EncodeSwapsAmounts = {
  maxAmountIn: BigNumber
  grossMinOrExactOut: BigNumber
  netMinOrExactOut: BigNumber
}

export function computeEncodeSwapsAmounts(spec: SwapSpecification): EncodeSwapsAmounts {
  const routingAmount = BigNumber.from(spec.routing.amount.quotient.toString())
  const routingQuote = BigNumber.from(spec.routing.quote.quotient.toString())
  const slippageNumerator = BigNumber.from(spec.slippageTolerance.numerator.toString())
  const slippageDenominator = BigNumber.from(spec.slippageTolerance.denominator.toString())

  if (spec.tradeType === TradeType.EXACT_INPUT) {
    const grossMinOrExactOut = routingQuote.mul(slippageDenominator).div(slippageDenominator.add(slippageNumerator))

    if (spec.fee?.kind === 'portion') {
      const feeAmount = grossMinOrExactOut
        .mul(spec.fee.fee.numerator.toString())
        .div(spec.fee.fee.denominator.toString())

      return {
        maxAmountIn: routingAmount,
        grossMinOrExactOut,
        netMinOrExactOut: grossMinOrExactOut.sub(feeAmount),
      }
    }

    return {
      maxAmountIn: routingAmount,
      grossMinOrExactOut,
      netMinOrExactOut: grossMinOrExactOut,
    }
  }

  const maxAmountIn = routingQuote.mul(slippageDenominator.add(slippageNumerator)).div(slippageDenominator)
  const grossMinOrExactOut = routingAmount
  const netMinOrExactOut =
    spec.fee?.kind === 'flat' ? grossMinOrExactOut.sub(BigNumber.from(spec.fee.amount)) : grossMinOrExactOut

  return {
    maxAmountIn,
    grossMinOrExactOut,
    netMinOrExactOut,
  }
}
