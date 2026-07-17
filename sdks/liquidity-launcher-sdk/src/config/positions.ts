import { TickMath, encodeSqrtRatioX96 } from '@uniswap/v3-sdk'
import JSBI from 'jsbi'
import type { Address } from 'viem'

import { MPS_TOTAL, UNBOUNDED_PERCENT, ZERO_ADDRESS } from '../constants'
import { LauncherSdkError } from '../errors'
import type { PositionDefinition } from '../types'

/**
 * Price-range strategy → `PositionDefinition[]` (the LP positions the migrator opens). Offsets are
 * ticks relative to the final auction (clearing) tick. Validated end-to-end against testnet by
 * simulation; follows the CCA price model (currency-per-token in Q96).
 *
 * The raw offsets are computed in that currency-per-token frame. The v4 pool, however, expresses
 * price as currency1-per-currency0. When the raised `currency` sorts as `currency0` (`currency <
 * token`, always the case for native ETH), the pool price is the reciprocal of currency-per-token,
 * so a custom range must be mirrored onto the reciprocal band: negate and swap the tick offsets.
 * Full-range positions use the `(MIN_TICK, MAX_TICK)` sentinel and are mirror-invariant, so they are
 * left untouched. Callers must pass the ordering pair (`currency`, `token`) for this reason.
 */

export type PriceRangeKind = 'CONCENTRATED_FULL_RANGE' | 'FULL_RANGE' | 'CUSTOM_RANGE'

export interface CustomRangeInput {
  minPercentFromClearing: number
  maxPercentFromClearing: number
  liquidityPercent: number
}

function snapDown(tick: number, tickSpacing: number): number {
  return Math.floor(tick / tickSpacing) * tickSpacing
}
function snapUp(tick: number, tickSpacing: number): number {
  return Math.ceil(tick / tickSpacing) * tickSpacing
}

/**
 * Tick offset (from the clearing tick) for a percent change in price.
 * pct = 0 → 0; pct = +Inf sentinel → MAX_TICK; pct <= -100 → MIN_TICK.
 */
export function percentToTickOffset(pct: number): number {
  if (pct >= UNBOUNDED_PERCENT) {
    return TickMath.MAX_TICK
  }
  if (pct <= -100) {
    return TickMath.MIN_TICK
  }
  // The price ratio is (100 + pct) / 100. encodeSqrtRatioX96(amount1, amount0) takes integer
  // numerator/denominator, so scale both by 1000 to preserve fractional percents; the factor cancels.
  const num = Math.round((100 + pct) * 1000)
  const den = 100 * 1000
  if (num <= 0) {
    return TickMath.MIN_TICK
  }
  const sqrtRatioX96 = encodeSqrtRatioX96(JSBI.BigInt(num), JSBI.BigInt(den))
  return TickMath.getTickAtSqrtRatio(sqrtRatioX96)
}

// A single full-range position. overridePositionRecipient = address(0) defers to the migrator.
const FULL_RANGE_DEFINITION: PositionDefinition = {
  offsetLower: TickMath.MIN_TICK,
  offsetUpper: TickMath.MAX_TICK,
  weight: MPS_TOTAL,
  overridePositionRecipient: ZERO_ADDRESS,
}

/**
 * Builds the LP `PositionDefinition[]` for a price-range strategy.
 *
 * `currency`/`token` (the raised currency and the launched token) determine v4 currency ordering.
 * When `currency` sorts as `currency0` the custom offsets are mirrored onto the reciprocal price
 * band (see the module header). Native ETH is `ZERO_ADDRESS`, which always sorts as `currency0`.
 */
export function buildPositionDefinitions(
  strategy: PriceRangeKind,
  customRanges: CustomRangeInput[],
  tickSpacing: number,
  currency: Address,
  token: Address
): PositionDefinition[] {
  if (strategy !== 'CUSTOM_RANGE') {
    // Concentrated-full-range and full-range both resolve to a single full-range position for v1.
    // The full-range sentinel is mirror-invariant, so ordering does not affect it.
    return [{ ...FULL_RANGE_DEFINITION }]
  }
  // Matches the contract's `currency < token` (LBPStrategy) ordering; ZERO_ADDRESS (native) is always currency0.
  const currencyIsCurrency0 = BigInt(currency) < BigInt(token)
  if (customRanges.length === 0) {
    throw new LauncherSdkError('INVALID_PRICE_RANGE', 'Custom price range strategy requires at least one range')
  }
  if (customRanges.length > 10) {
    throw new LauncherSdkError('INVALID_PRICE_RANGE', 'At most 10 custom price ranges are allowed')
  }
  let weightSum = 0
  const definitions = customRanges.map((range) => {
    const spanLo = Math.min(range.minPercentFromClearing, range.maxPercentFromClearing)
    const spanHi = Math.max(range.minPercentFromClearing, range.maxPercentFromClearing)
    // Clearing settles at 0% offset; LP ticks must bracket that price, so the percent interval must
    // contain zero (e.g. neither [-100,-10] nor [3,40] is valid).
    if (spanLo > 0 || spanHi < 0) {
      throw new LauncherSdkError(
        'INVALID_PRICE_RANGE',
        'Custom price range must include the clearing price: min and max percent from clearing must bracket 0%'
      )
    }
    const weight = Math.round(range.liquidityPercent * (MPS_TOTAL / 100))
    weightSum += weight
    const rawLower = percentToTickOffset(range.minPercentFromClearing)
    const rawUpper = percentToTickOffset(range.maxPercentFromClearing)
    // Clamp to the valid tick range: snapping an unbounded range (±MAX_TICK) outward can push the
    // offset past MAX_TICK / below MIN_TICK, which reverts on-chain as an invalid tick.
    let offsetLower = Math.max(snapDown(rawLower, tickSpacing), TickMath.MIN_TICK)
    let offsetUpper = Math.min(snapUp(rawUpper, tickSpacing), TickMath.MAX_TICK)
    // When currency is currency0 the pool price is the reciprocal of currency-per-token, so mirror the
    // range onto the reciprocal band. Negate-and-swap keeps the values tick-aligned and in range
    // (MIN_TICK == -MAX_TICK), and preserves upper > lower.
    if (currencyIsCurrency0) {
      ;[offsetLower, offsetUpper] = [-offsetUpper, -offsetLower]
    }
    if (offsetUpper <= offsetLower) {
      throw new LauncherSdkError('INVALID_PRICE_RANGE', 'Custom price range upper bound must exceed the lower bound')
    }
    return { offsetLower, offsetUpper, weight, overridePositionRecipient: ZERO_ADDRESS }
  })
  if (weightSum > MPS_TOTAL) {
    throw new LauncherSdkError('INVALID_PRICE_RANGE', 'Custom price range liquidity percentages exceed 100%')
  }
  // Under-allocation is just as invalid: weights summing to less than MPS_TOTAL leave a slice of LP
  // liquidity with no destination position. Valid inputs summing to 100% land exactly on MPS_TOTAL.
  if (weightSum < MPS_TOTAL) {
    throw new LauncherSdkError('INVALID_PRICE_RANGE', 'Custom price range liquidity percentages must sum to 100%')
  }
  return definitions
}
