import { SwapMath } from './swapMath'
import { LiquidityMath } from './liquidityMath'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { TickMath } from './tickMath'
import { NEGATIVE_ONE, ONE, ZERO } from '../internalConstants'
import { TickDataProvider } from '../entities/tickDataProvider'

interface StepComputations {
  sqrtPriceStartX96: JSBI
  tickNext: number
  initialized: boolean
  sqrtPriceNextX96: JSBI
  amountIn: JSBI
  amountOut: JSBI
  feeAmount: JSBI
}

export async function v3Swap(
  fee: JSBI,
  sqrtRatioX96: JSBI,
  tickCurrent: number,
  liquidity: JSBI,
  tickSpacing: number,
  tickDataProvider: TickDataProvider,
  zeroForOne: boolean,
  amountSpecified: JSBI,
  sqrtPriceLimitX96?: JSBI
): Promise<{ amountCalculated: JSBI; sqrtRatioX96: JSBI; liquidity: JSBI; tickCurrent: number }> {
  if (!sqrtPriceLimitX96)
    sqrtPriceLimitX96 = zeroForOne
      ? JSBI.add(TickMath.MIN_SQRT_RATIO, ONE)
      : JSBI.subtract(TickMath.MAX_SQRT_RATIO, ONE)

  if (zeroForOne) {
    invariant(JSBI.greaterThan(sqrtPriceLimitX96, TickMath.MIN_SQRT_RATIO), 'RATIO_MIN')
    invariant(JSBI.lessThan(sqrtPriceLimitX96, sqrtRatioX96), 'RATIO_CURRENT')
  } else {
    invariant(JSBI.lessThan(sqrtPriceLimitX96, TickMath.MAX_SQRT_RATIO), 'RATIO_MAX')
    invariant(JSBI.greaterThan(sqrtPriceLimitX96, sqrtRatioX96), 'RATIO_CURRENT')
  }

  const exactInput = JSBI.greaterThanOrEqual(amountSpecified, ZERO)

  // keep track of swap state

  const state = {
    amountSpecifiedRemaining: amountSpecified,
    amountCalculated: ZERO,
    sqrtPriceX96: sqrtRatioX96,
    tick: tickCurrent,
    liquidity: liquidity,
  }

  // start swap while loop
  while (JSBI.notEqual(state.amountSpecifiedRemaining, ZERO) && state.sqrtPriceX96 !== sqrtPriceLimitX96) {
    let step: Partial<StepComputations> = {}
    step.sqrtPriceStartX96 = state.sqrtPriceX96

    // because each iteration of the while loop rounds, we can't optimize this code (relative to the smart contract)
    // by simply traversing to the next available tick, we instead need to exactly replicate
    // tickBitmap.nextInitializedTickWithinOneWord
    ;[step.tickNext, step.initialized] = await tickDataProvider.nextInitializedTickWithinOneWord(
      state.tick,
      zeroForOne,
      tickSpacing
    )

    if (step.tickNext < TickMath.MIN_TICK) {
      step.tickNext = TickMath.MIN_TICK
    } else if (step.tickNext > TickMath.MAX_TICK) {
      step.tickNext = TickMath.MAX_TICK
    }

    step.sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(step.tickNext)
    ;[state.sqrtPriceX96, step.amountIn, step.amountOut, step.feeAmount] = SwapMath.computeSwapStep(
      state.sqrtPriceX96,
      (
        zeroForOne
          ? JSBI.lessThan(step.sqrtPriceNextX96, sqrtPriceLimitX96)
          : JSBI.greaterThan(step.sqrtPriceNextX96, sqrtPriceLimitX96)
      )
        ? sqrtPriceLimitX96
        : step.sqrtPriceNextX96,
      state.liquidity,
      state.amountSpecifiedRemaining,
      fee
    )

    if (exactInput) {
      state.amountSpecifiedRemaining = JSBI.subtract(
        state.amountSpecifiedRemaining,
        JSBI.add(step.amountIn, step.feeAmount)
      )
      state.amountCalculated = JSBI.subtract(state.amountCalculated, step.amountOut)
    } else {
      state.amountSpecifiedRemaining = JSBI.add(state.amountSpecifiedRemaining, step.amountOut)
      state.amountCalculated = JSBI.add(state.amountCalculated, JSBI.add(step.amountIn, step.feeAmount))
    }

    // TODO
    if (JSBI.equal(state.sqrtPriceX96, step.sqrtPriceNextX96)) {
      // if the tick is initialized, run the tick transition
      if (step.initialized) {
        let liquidityNet = JSBI.BigInt((await tickDataProvider.getTick(step.tickNext)).liquidityNet)
        // if we're moving leftward, we interpret liquidityNet as the opposite sign
        // safe because liquidityNet cannot be type(int128).min
        if (zeroForOne) liquidityNet = JSBI.multiply(liquidityNet, NEGATIVE_ONE)

        state.liquidity = LiquidityMath.addDelta(state.liquidity, liquidityNet)
      }

      state.tick = zeroForOne ? step.tickNext - 1 : step.tickNext
    } else if (JSBI.notEqual(state.sqrtPriceX96, step.sqrtPriceStartX96)) {
      // updated comparison function
      // recompute unless we're on a lower tick boundary (i.e. already transitioned ticks), and haven't moved
      state.tick = TickMath.getTickAtSqrtRatio(state.sqrtPriceX96)
    }
  }

  return {
    amountCalculated: state.amountCalculated,
    sqrtRatioX96: state.sqrtPriceX96,
    liquidity: state.liquidity,
    tickCurrent: state.tick,
  }
}
