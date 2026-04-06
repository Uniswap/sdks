import { BigNumber } from 'ethers'
import { TradeType } from '@uniswap/sdk-core'
import { isAtLeastV2_1_1 } from './constants'
import { encodeFee1e18, encodeFeeBips } from './numbers'
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
      const feeAmount = isAtLeastV2_1_1(spec.urVersion)
        ? grossMinOrExactOut
            .mul(BigNumber.from(encodeFee1e18(spec.fee.fee)))
            .div(BigNumber.from(10).pow(18))
        : grossMinOrExactOut.mul(BigNumber.from(encodeFeeBips(spec.fee.fee))).div(10_000)

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
