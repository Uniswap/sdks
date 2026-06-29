import { AUCTION_TICK_DIVISOR, Q96 } from '../constants'
import { LauncherSdkError } from '../errors'

/**
 * Floor-price → Q96 conversions and the CCA price-tick granularity. The CCA price model is
 * raw-currency-per-raw-token in Q96.
 */

function parseDecimalRatio(value: string): { num: bigint; den: bigint } {
  const trimmed = value.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new LauncherSdkError('INVALID_FLOOR_PRICE', 'Floor price must be a positive decimal')
  }
  const [whole, frac = ''] = trimmed.split('.')
  const num = BigInt(whole + frac)
  if (num <= 0n) {
    throw new LauncherSdkError('INVALID_FLOOR_PRICE', 'Floor price must be greater than zero')
  }
  return { num, den: 10n ** BigInt(frac.length) }
}

/**
 * CCA floor price = raw-currency-per-raw-token in Q96:
 * `floorX96 = humanFloor * 10^currencyDecimals / 10^tokenDecimals * 2^96`.
 */
export function floorPriceToX96(
  humanFloorRaisePerToken: string,
  tokenDecimals: number,
  currencyDecimals: number
): bigint {
  const { num, den } = parseDecimalRatio(humanFloorRaisePerToken)
  const numerator = num * 10n ** BigInt(currencyDecimals) * Q96
  const denominator = den * 10n ** BigInt(tokenDecimals)
  const floorX96 = numerator / denominator
  if (floorX96 <= 0n) {
    throw new LauncherSdkError('INVALID_FLOOR_PRICE', 'Floor price is too small. Raise the floor price and try again.')
  }
  return floorX96
}

/** Graduation threshold: currency needed to clear the whole auction supply at the floor. */
export function requiredCurrencyRaised(floorPriceX96: bigint, auctionSupply: bigint): bigint {
  return (floorPriceX96 * auctionSupply) / Q96
}

/** Derives the CCA price-tick granularity from the floor price (minimum 1). */
export function deriveAuctionTickSpacing(floorPriceX96: bigint): bigint {
  const tickSpacing = floorPriceX96 / AUCTION_TICK_DIVISOR
  return tickSpacing > 0n ? tickSpacing : 1n
}

/**
 * Derives the CCA tick spacing AND snaps the floor price DOWN to the nearest tick boundary. The CCA
 * constructor seeds the floor as the first tick and requires `floorPrice % tickSpacing == 0`
 * (otherwise it reverts `TickPriceNotAtBoundary`). The on-chain floor drifts at most one tick below
 * the requested price (< 1/AUCTION_TICK_DIVISOR).
 */
export function deriveAuctionPricing(rawFloorPriceX96: bigint): { floorPriceX96: bigint; tickSpacing: bigint } {
  const tickSpacing = deriveAuctionTickSpacing(rawFloorPriceX96)
  return { floorPriceX96: rawFloorPriceX96 - (rawFloorPriceX96 % tickSpacing), tickSpacing }
}
