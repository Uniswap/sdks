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

/** Default heartbeat poll interval per chain id, milliseconds. */
export const DEFAULT_POLL_INTERVAL_MS: Record<number, number> = { 1: 3_000, 8453: 1_000, 130: 500 }

/** Poll interval used for chains absent from {@link DEFAULT_POLL_INTERVAL_MS}. */
export const FALLBACK_POLL_INTERVAL_MS = 1_000

/** Consecutive heartbeat failures before a feed is marked stale. */
export const STALE_AFTER_CONSECUTIVE_FAILURES = 3

/** Exponential-backoff base delay, milliseconds. */
export const BACKOFF_BASE_MS = 500

/** Exponential-backoff ceiling, milliseconds. */
export const BACKOFF_MAX_MS = 30_000
