import { BLOCK_TIME_SECONDS_BY_CHAIN, DEFAULT_BLOCK_TIME_SECONDS, DEFAULT_MIGRATION_DELAY_BLOCKS } from '../constants'
import { LauncherSdkError } from '../errors'

/**
 * Time → block conversions for an auction. RPC-dependent inputs (current block, block time) are
 * passed in so this module stays pure and unit-testable.
 */

/** Block time (seconds) for a chain, falling back to {@link DEFAULT_BLOCK_TIME_SECONDS}. */
export function getBlockTimeSeconds(chainId: number): number {
  return BLOCK_TIME_SECONDS_BY_CHAIN[chainId] ?? DEFAULT_BLOCK_TIME_SECONDS
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
  const block = currentBlock + deltaBlocks
  // A target in the past yields negative deltaBlocks; reject rather than silently snapping to now.
  if (block < currentBlock) {
    throw new LauncherSdkError('INVALID_TIME', 'Auction time cannot be in the past')
  }
  return block
}

export interface DeriveBlocksInput {
  startTimeUnix: bigint
  endTimeUnix: bigint
  currentBlock: bigint
  nowUnix: bigint
  blockTimeSeconds: number
  migrationDelayBlocks?: bigint
}

export interface DerivedBlocks {
  startBlock: bigint
  endBlock: bigint
  claimBlock: bigint
  migrationBlock: bigint
}

/** Derives the auction's start / end / claim / migration blocks from its start and end times. */
export function deriveBlocks(input: DeriveBlocksInput): DerivedBlocks {
  const { startTimeUnix, endTimeUnix, currentBlock, nowUnix, blockTimeSeconds } = input
  if (endTimeUnix <= startTimeUnix) {
    throw new LauncherSdkError('INVALID_AUCTION_WINDOW', 'Auction end time must be after start time')
  }
  const startBlock = timeToBlock(startTimeUnix, currentBlock, nowUnix, blockTimeSeconds)
  const endBlock = timeToBlock(endTimeUnix, currentBlock, nowUnix, blockTimeSeconds)
  if (endBlock <= startBlock) {
    throw new LauncherSdkError('INVALID_AUCTION_WINDOW', 'Auction window is too short for the chain block time')
  }
  // CCA requires claimBlock >= endBlock; the strategy requires migrationBlock > endBlock.
  const claimBlock = endBlock
  const migrationBlock = endBlock + (input.migrationDelayBlocks ?? DEFAULT_MIGRATION_DELAY_BLOCKS)
  return { startBlock, endBlock, claimBlock, migrationBlock }
}
