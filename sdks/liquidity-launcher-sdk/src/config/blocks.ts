import {
  BLOCK_TIME_SCHEDULE_BY_CHAIN,
  BLOCK_TIME_SECONDS_BY_CHAIN,
  type BlockTimeSegment,
  DEFAULT_BLOCK_TIME_SECONDS,
  DEFAULT_MIGRATION_DELAY_BLOCKS,
} from '../constants'
import { LauncherSdkError } from '../errors'

/**
 * Time → block conversions for an auction. RPC-dependent inputs (current block, block time) are
 * passed in so this module stays pure and unit-testable.
 */

/** Whether the SDK knows `chainId`'s block time (a schedule or a fixed-cadence entry). */
export function hasKnownBlockTime(chainId: number): boolean {
  return BLOCK_TIME_SCHEDULE_BY_CHAIN[chainId] !== undefined || BLOCK_TIME_SECONDS_BY_CHAIN[chainId] !== undefined
}

function fixedSchedule(seconds: number): readonly BlockTimeSegment[] {
  return [{ fromBlock: 0n, fromTimestamp: 0n, blockTimeMs: Math.round(seconds * 1000) }]
}

/** The chain's block-time schedule; throws `INVALID_TIME` for a chain the SDK has no block time for. */
function getBlockTimeSchedule(chainId: number): readonly BlockTimeSegment[] {
  const schedule = BLOCK_TIME_SCHEDULE_BY_CHAIN[chainId]
  if (schedule) {
    return schedule
  }
  const seconds = BLOCK_TIME_SECONDS_BY_CHAIN[chainId]
  if (seconds === undefined) {
    // No silent DEFAULT_BLOCK_TIME_SECONDS here: a wrong cadence writes wrong blocks on-chain.
    throw new LauncherSdkError('INVALID_TIME', `No block time known for chain ${chainId}`)
  }
  return fixedSchedule(seconds)
}

function gcd(a: bigint, b: bigint): bigint {
  return b === 0n ? a : gcd(b, a % b)
}

/** Common denominator for expressing elapsed time as an exact (scaled) block count. */
function scheduleDenominator(schedule: readonly BlockTimeSegment[]): bigint {
  return schedule.reduce((acc, { blockTimeMs }) => {
    const ms = BigInt(blockTimeMs)
    return (acc * ms) / gcd(acc, ms)
  }, 1n)
}

/** `Math.round` semantics (half toward +∞) for `num / den`, `den > 0`. */
function roundRatio(num: bigint, den: bigint): bigint {
  const n = 2n * num + den
  const d = 2n * den
  const q = n / d
  return n % d !== 0n && n < 0n ? q - 1n : q
}

/** Blocks produced between two unix-ms instants, scaled by `den` so the result is an exact integer. */
function scaledBlocksBetween(schedule: readonly BlockTimeSegment[], fromMs: bigint, toMs: bigint, den: bigint): bigint {
  if (toMs < fromMs) {
    return -scaledBlocksBetween(schedule, toMs, fromMs, den)
  }
  let scaled = 0n
  schedule.forEach((segment, i) => {
    const next = schedule[i + 1]
    const segStart = i === 0 ? undefined : segment.fromTimestamp * 1000n
    const segEnd = next === undefined ? undefined : next.fromTimestamp * 1000n
    const lo = segStart !== undefined && segStart > fromMs ? segStart : fromMs
    const hi = segEnd !== undefined && segEnd < toMs ? segEnd : toMs
    if (hi > lo) {
      scaled += (hi - lo) * (den / BigInt(segment.blockTimeMs))
    }
  })
  return scaled
}

/**
 * Rounded block count produced between two unix timestamps (seconds) on `chainId`. Throws
 * `INVALID_TIME` for a chain with no known block time.
 */
export function blocksBetweenTimestamps(chainId: number, fromUnix: bigint, toUnix: bigint): bigint {
  const schedule = getBlockTimeSchedule(chainId)
  const den = scheduleDenominator(schedule)
  return roundRatio(scaledBlocksBetween(schedule, fromUnix * 1000n, toUnix * 1000n, den), den)
}

/**
 * Block time (seconds) in effect on a chain at `atUnix` (default: **now**), falling back to
 * {@link DEFAULT_BLOCK_TIME_SECONDS} for a chain the SDK has no entry for.
 *
 * The result depends on the wall clock: on Base after Denim it returns `0.2`, so multiplying it by
 * a span of older (2s) blocks under-reads that span 10x. A single number cannot describe a span
 * that crosses a cadence change — use {@link blocksToSeconds} to convert historical block spans to
 * seconds, and {@link timeToBlockOnChain} / `deriveBlocks({ chainId })` for time → block.
 */
export function getBlockTimeSeconds(chainId: number, atUnix: bigint | number = Math.floor(Date.now() / 1000)): number {
  const at = typeof atUnix === 'bigint' ? atUnix : BigInt(Math.floor(atUnix))
  const schedule = hasKnownBlockTime(chainId) ? getBlockTimeSchedule(chainId) : fixedSchedule(DEFAULT_BLOCK_TIME_SECONDS)
  let active = schedule[0]!
  for (const segment of schedule) {
    if (segment.fromTimestamp <= at) {
      active = segment
    }
  }
  return active.blockTimeMs / 1000
}

/**
 * Real seconds elapsed from block `fromBlock` to block `toBlock` on `chainId`, following the chain's
 * block-time schedule (negative when `toBlock < fromBlock`). Throws `INVALID_TIME` for a chain
 * with no known block time.
 */
export function blocksToSeconds(chainId: number, fromBlock: bigint, toBlock: bigint): number {
  if (toBlock < fromBlock) {
    return -blocksToSeconds(chainId, toBlock, fromBlock)
  }
  const schedule = getBlockTimeSchedule(chainId)
  let elapsedMs = 0n
  schedule.forEach((segment, i) => {
    const next = schedule[i + 1]
    const lo = i > 0 && segment.fromBlock > fromBlock ? segment.fromBlock : fromBlock
    const hi = next !== undefined && next.fromBlock < toBlock ? next.fromBlock : toBlock
    if (hi > lo) {
      elapsedMs += (hi - lo) * BigInt(segment.blockTimeMs)
    }
  })
  return Number(elapsedMs) / 1000
}

/** Converts a future unix timestamp to a block number using the chain's block time. */
export function timeToBlock(
  targetUnix: bigint,
  currentBlock: bigint,
  nowUnix: bigint,
  blockTimeSeconds: number
): bigint {
  if (blockTimeSeconds <= 0) {
    throw new LauncherSdkError('INVALID_TIME', 'Invalid block time for chain')
  }
  const deltaSeconds = targetUnix - nowUnix
  const deltaBlocks = BigInt(Math.round(Number(deltaSeconds) / blockTimeSeconds))
  return assertNotPast(currentBlock + deltaBlocks, currentBlock)
}

/**
 * Converts a future unix timestamp to a block number on `chainId`, following the chain's
 * block-time schedule across any cadence change between `nowUnix` and `targetUnix`. Throws
 * `INVALID_TIME` for a chain with no known block time.
 */
export function timeToBlockOnChain(chainId: number, targetUnix: bigint, currentBlock: bigint, nowUnix: bigint): bigint {
  return assertNotPast(currentBlock + blocksBetweenTimestamps(chainId, nowUnix, targetUnix), currentBlock)
}

function assertNotPast(block: bigint, currentBlock: bigint): bigint {
  // A target in the past yields negative deltaBlocks; reject rather than silently snapping to now.
  if (block < currentBlock) {
    throw new LauncherSdkError('INVALID_TIME', 'Auction time cannot be in the past')
  }
  return block
}

interface DeriveBlocksBaseInput {
  startTimeUnix: bigint
  endTimeUnix: bigint
  currentBlock: bigint
  nowUnix: bigint
  migrationDelayBlocks?: bigint
}

/**
 * Pass exactly one of `chainId` (follows the chain's block-time schedule; required for windows that
 * cross a cadence change, e.g. Base Denim) or a fixed `blockTimeSeconds`. Passing both throws, so a
 * half-migrated caller is caught rather than one value silently winning.
 */
export type DeriveBlocksInput = DeriveBlocksBaseInput &
  ({ blockTimeSeconds: number; chainId?: undefined } | { chainId: number; blockTimeSeconds?: undefined })

export interface DerivedBlocks {
  startBlock: bigint
  endBlock: bigint
  claimBlock: bigint
  migrationBlock: bigint
}

/** Derives the auction's start / end / claim / migration blocks from its start and end times. */
export function deriveBlocks(input: DeriveBlocksInput): DerivedBlocks {
  const { startTimeUnix, endTimeUnix, currentBlock, nowUnix, chainId, blockTimeSeconds } = input
  if (endTimeUnix <= startTimeUnix) {
    throw new LauncherSdkError('INVALID_AUCTION_WINDOW', 'Auction end time must be after start time')
  }
  if (chainId !== undefined && blockTimeSeconds !== undefined) {
    throw new LauncherSdkError('INVALID_TIME', 'Pass either chainId or blockTimeSeconds, not both')
  }
  const toBlock = (targetUnix: bigint): bigint => {
    if (chainId !== undefined) {
      return timeToBlockOnChain(chainId, targetUnix, currentBlock, nowUnix)
    }
    if (blockTimeSeconds === undefined) {
      throw new LauncherSdkError('INVALID_TIME', 'Invalid block time for chain')
    }
    return timeToBlock(targetUnix, currentBlock, nowUnix, blockTimeSeconds)
  }
  const startBlock = toBlock(startTimeUnix)
  const endBlock = toBlock(endTimeUnix)
  if (endBlock <= startBlock) {
    throw new LauncherSdkError('INVALID_AUCTION_WINDOW', 'Auction window is too short for the chain block time')
  }
  // CCA requires claimBlock >= endBlock; the strategy requires migrationBlock > endBlock.
  const claimBlock = endBlock
  const migrationBlock = endBlock + (input.migrationDelayBlocks ?? DEFAULT_MIGRATION_DELAY_BLOCKS)
  return { startBlock, endBlock, claimBlock, migrationBlock }
}
