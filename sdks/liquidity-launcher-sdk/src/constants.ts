import { DYNAMIC_FEE_FLAG } from '@uniswap/v4-sdk'
import { type Address, zeroAddress } from 'viem'

/** address(0). The native-currency sentinel and the hookless-pool hook. */
export const ZERO_ADDRESS = zeroAddress

/** 2^96 — the fixed-point scale used by the CCA price model (currency-per-token in Q96). */
export const Q96 = 2n ** 96n

/** New tokens launched through the factory are fixed at 18 decimals. */
export const NEW_TOKEN_DECIMALS = 18

/** Native currency (ETH) decimals; used when the raise currency is the zero address. */
export const NATIVE_CURRENCY_DECIMALS = 18

/**
 * address(1) — v4 `ActionConstants.MSG_SENDER`. The CCA factory rewrites this sentinel to
 * `msg.sender` (the strategy) when it is set as the auction `fundsRecipient`.
 */
export const FUNDS_RECIPIENT_SENTINEL = '0x0000000000000000000000000000000000000001' as Address

/**
 * The canonical CREATE2 deployer (same address on every chain) used to deterministically deploy a
 * per-launch liquidity-lock recipient. Calldata convention: `salt(32 bytes) ++ initCode`.
 */
export const CANONICAL_CREATE2_DEPLOYER = '0x4e59b44847b379578588920cA78FbF26c0B4956C' as Address

/** 1e7 = 100%, the milli-percent (mps) denominator used across the launcher contracts. */
export const MPS_TOTAL = 10_000_000

/** Minimum LP allocation percent for each bracket (single schedule or every tiered tier). */
export const MIN_LP_ALLOCATION_PERCENT = 25

/** Matches `@uniswap/v4-sdk` `Pool` static fee bound (`fee < 1_000_000` or dynamic). */
export const MAX_LP_FEE = 1_000_000

/** v4 PoolManager bound: tick spacing must be `<= type(int16).max`. */
export const MAX_TICK_SPACING = 32_767

/** Sentinel max percent meaning "+Infinity" (unbounded upper price). */
export const UNBOUNDED_PERCENT = 1e9

/**
 * Default gap (in blocks) between auction end and when migration may begin. The LBP strategy
 * requires `migrationBlock > endBlock` (reverts `InvalidEndBlock` otherwise), so the minimum is 1.
 */
export const DEFAULT_MIGRATION_DELAY_BLOCKS = 1n

/**
 * Divisor for the CCA price-tick granularity. Distinct from the pool tick spacing and not derivable
 * from the fee tier. v1 default: 1% of the floor price (the canonical CCA configurator value).
 */
export const AUCTION_TICK_DIVISOR = 100n

/** Number of equal-token ramp steps before the single large final block. */
export const DEFAULT_AUCTION_STEPS = 12

/** Fraction of supply released in the single large final block (anti-manipulation anchor). */
export const DEFAULT_FINAL_BLOCK_PCT = 0.3

/** Convexity exponent alpha for the normalized supply curve C(t) = t^alpha (alpha > 1). */
export const DEFAULT_CONVEXITY_ALPHA = 1.2

/** Fallback block time (seconds) for chains without an explicit entry. */
export const DEFAULT_BLOCK_TIME_SECONDS = 12

/**
 * Approximate block time (seconds) per chain, used to convert auction start/end times to blocks.
 * Chains without an entry fall back to {@link DEFAULT_BLOCK_TIME_SECONDS}. Arbitrum is intentionally
 * omitted: its `block.number` tracks the L1 block cadence (~12s), which the default already matches.
 */
export const BLOCK_TIME_SECONDS_BY_CHAIN: Record<number, number> = {
  1: 12, // mainnet
  130: 1, // unichain
  1301: 1, // unichain sepolia
  8453: 2, // base
  84532: 2, // base sepolia
  11155111: 12, // sepolia
}

/** Re-exported so callers building pool params don't need a direct v4-sdk import. */
export { DYNAMIC_FEE_FLAG }
