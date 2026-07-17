import { BLOCK_TIME_SECONDS_BY_CHAIN } from '@uniswap/liquidity-launcher-sdk'
import type { Address } from 'viem'

/** Canonical Multicall3, deployed at the same CREATE2 address on every supported chain. */
export const MULTICALL3_ADDRESS: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'

/** Blocks of already-delivered logs re-scanned each tick to reconcile reorgs. */
export const DEFAULT_TRAILING_LOG_WINDOW = 3

/** Default rolling emission buffer length retained by a feed store. */
export const DEFAULT_BUFFER_SIZE = 120

/** Max calls packed into a single multicall chunk before splitting (internal; not a public option). */
export const DEFAULT_MAX_CALLS_PER_CHUNK = 200

/**
 * Default upper bound on the trailing log window's catch-up growth: after a stall, the union `getLogs`
 * looks back at most this many blocks so a long gap recovers recent logs without an unbounded scan.
 */
export const DEFAULT_MAX_CATCHUP_BLOCKS = 20

/** Default heartbeat poll interval per chain id, milliseconds. These three are hand-tuned. */
export const DEFAULT_POLL_INTERVAL_MS: Record<number, number> = { 1: 3_000, 8453: 1_000, 130: 500 }

/** Flat poll interval used only when no tuned value and no launcher block time exist for a chain. */
export const FALLBACK_POLL_INTERVAL_MS = 1_000

/** Floor for a block-time-derived poll interval, milliseconds (sub-second chains poll at most twice/block). */
export const MIN_DERIVED_POLL_INTERVAL_MS = 500

/**
 * Resolves the heartbeat poll interval (milliseconds) for a chain:
 *   1. a hand-tuned {@link DEFAULT_POLL_INTERVAL_MS} entry, else
 *   2. derived from the launcher's per-chain block time as `max(500, blockTimeSeconds * 1000 / 2)`
 *      (poll ~twice per block, floored so sub-second chains don't hammer the RPC), else
 *   3. the flat {@link FALLBACK_POLL_INTERVAL_MS}.
 *
 * Reads `BLOCK_TIME_SECONDS_BY_CHAIN` directly rather than the launcher's `getBlockTimeSeconds`,
 * because that helper masks "no entry" with its own 12s default — which would make step 3 unreachable.
 */
export function resolvePollIntervalMs(chainId: number): number {
  const tuned = DEFAULT_POLL_INTERVAL_MS[chainId]
  if (tuned !== undefined) return tuned
  const blockTimeSeconds = BLOCK_TIME_SECONDS_BY_CHAIN[chainId]
  if (blockTimeSeconds !== undefined) {
    return Math.max(MIN_DERIVED_POLL_INTERVAL_MS, Math.round((blockTimeSeconds * 1_000) / 2))
  }
  return FALLBACK_POLL_INTERVAL_MS
}

/** Consecutive heartbeat failures before a feed is marked stale. */
export const STALE_AFTER_CONSECUTIVE_FAILURES = 3

/** Exponential-backoff base delay, milliseconds. */
export const BACKOFF_BASE_MS = 500

/** Exponential-backoff ceiling, milliseconds. */
export const BACKOFF_MAX_MS = 30_000
