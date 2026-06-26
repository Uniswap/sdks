import { DEFAULT_AUCTION_STEPS, DEFAULT_CONVEXITY_ALPHA, DEFAULT_FINAL_BLOCK_PCT, MPS_TOTAL } from '../constants'
import { LauncherSdkError } from '../errors'
import type { AuctionStepInput } from '../types'

export interface AuctionScheduleOptions {
  /** Leading window where nothing is emitted (mps = 0). Default 0. */
  prebidBlocks?: bigint
  /** Number of equal-token ramp steps before the final block. Default {@link DEFAULT_AUCTION_STEPS}. */
  numSteps?: number
  /** Fraction (0,1) of supply reserved for the single final block. Default {@link DEFAULT_FINAL_BLOCK_PCT}. */
  finalBlockPct?: number
  /** Convexity exponent for C(t) = t^alpha (alpha > 1 is convex). Default {@link DEFAULT_CONVEXITY_ALPHA}. */
  alpha?: number
}

/**
 * Builds the CCA emission schedule as a moderately convex curve with a large final block:
 *
 *  - an optional leading prebid window emits nothing (`mps = 0`);
 *  - the gradual ramp releases EQUAL token amounts across `numSteps` steps whose block durations
 *    DECREASE over time (boundaries from the inverse of C(t) = t^alpha);
 *  - a single final block releases the reserved `finalBlockPct` (~30%) to anchor a
 *    manipulation-resistant clearing price.
 *
 * Invariants required on-chain: every step's blockDelta >= 1, per-block `mps` sums to exactly
 * {@link MPS_TOTAL}, and blockDeltas sum to exactly `endBlock - startBlock`.
 */
export function deriveConvexAuctionSteps(
  startBlock: bigint,
  endBlock: bigint,
  options: AuctionScheduleOptions = {}
): AuctionStepInput[] {
  const {
    prebidBlocks = 0n,
    numSteps = DEFAULT_AUCTION_STEPS,
    finalBlockPct = DEFAULT_FINAL_BLOCK_PCT,
    alpha = DEFAULT_CONVEXITY_ALPHA,
  } = options

  if (endBlock <= startBlock) {
    throw new LauncherSdkError('INVALID_AUCTION_WINDOW', 'Auction must span at least one block')
  }
  if (prebidBlocks < 0n) {
    throw new LauncherSdkError('INVALID_EMISSION_SCHEDULE', 'Prebid window cannot be negative')
  }
  if (!Number.isInteger(numSteps) || numSteps < 1) {
    throw new LauncherSdkError('INVALID_EMISSION_SCHEDULE', 'Auction must have at least one emission step')
  }
  if (!(finalBlockPct > 0) || !(finalBlockPct < 1)) {
    throw new LauncherSdkError('INVALID_EMISSION_SCHEDULE', 'Final block percentage must be in (0, 1)')
  }
  if (!(alpha > 0)) {
    throw new LauncherSdkError('INVALID_EMISSION_SCHEDULE', 'Convexity alpha must be positive')
  }

  // Reserve exactly one block for the large final emission; the remainder (after prebid) is the ramp.
  const rampBlocks = endBlock - startBlock - prebidBlocks - 1n
  if (rampBlocks < 1n) {
    throw new LauncherSdkError('INVALID_AUCTION_WINDOW', 'The auction window is too short. Choose a longer window.')
  }

  const steps: AuctionStepInput[] = []
  let cursor = startBlock

  if (prebidBlocks > 0n) {
    steps.push({ mps: 0, startBlock: cursor, endBlock: cursor + prebidBlocks })
    cursor += prebidBlocks
  }

  // Clamp ramp steps so each spans at least one block (tiny windows degrade gracefully).
  const rampSteps = Math.min(numSteps, Number(rampBlocks))
  const stepTokens = ((1 - finalBlockPct) / rampSteps) * MPS_TOTAL

  // Convex block boundaries within the ramp, forced strictly increasing and ending exactly at
  // `rampBlocks` (leaving one block per remaining step so no duration collapses to zero).
  const boundaries: bigint[] = [0n]
  for (let i = 1; i < rampSteps; i++) {
    const t = Math.pow(i / rampSteps, 1 / alpha)
    const raw = BigInt(Math.round(t * Number(rampBlocks)))
    const lo = boundaries[i - 1]! + 1n
    const hi = rampBlocks - BigInt(rampSteps - i)
    boundaries.push(raw < lo ? lo : raw > hi ? hi : raw)
  }
  boundaries.push(rampBlocks)

  let emittedMps = 0
  for (let i = 0; i < rampSteps; i++) {
    const duration = boundaries[i + 1]! - boundaries[i]! // >= 1 by construction
    const mps = Math.max(1, Math.round(stepTokens / Number(duration)))
    steps.push({ mps, startBlock: cursor, endBlock: cursor + duration })
    cursor += duration
    emittedMps += mps * Number(duration)
  }

  // Final block: a single block absorbing the remainder so per-block mps sums to exactly MPS_TOTAL.
  const finalMps = MPS_TOTAL - emittedMps
  if (finalMps <= 0) {
    throw new LauncherSdkError('INVALID_EMISSION_SCHEDULE', 'Emission schedule overshot the supply target')
  }
  steps.push({ mps: finalMps, startBlock: cursor, endBlock: cursor + 1n })
  cursor += 1n

  if (cursor !== endBlock) {
    throw new LauncherSdkError('INVALID_EMISSION_SCHEDULE', 'Emission schedule did not cover the auction window')
  }
  return steps
}
