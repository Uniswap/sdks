import type { TickFillRatio } from '@uniswap/liquidity-launcher-sdk'
import type { Address } from 'viem'

/**
 * Value and argument types for the launch-lifecycle sources. These sources are built against
 * blockfeed's OWN engine contract (`Source`, `TickData`, `ContractCall` from `../../types`); the read
 * descriptors, decoders, and `TickFillRatio` shape are imported from `@uniswap/liquidity-launcher-sdk`.
 */

export type LaunchPhase = 'auction' | 'graduated' | 'failed'

/** The composite launch lifecycle value emitted by {@link launchAssetSource}. */
export interface LaunchAssetState {
  phase: LaunchPhase
  /**
   * Q96 raw-currency-per-raw-token clearing price during the auction (from the auction's
   * `checkpoint()`); after graduation, the pool-sqrt-derived currency-per-token price (see
   * `launchAssetSource` for the orientation assumption). Absent only if never yet derivable.
   */
  priceX96?: bigint
  /** Raw v4 `getSlot0` sqrtPriceX96 of the graduated pool; present from the graduation tick onward. */
  poolSqrtPriceX96?: bigint
  currencyRaised: bigint
  remainingSupply: bigint
  /** Per-tick bid-distribution fill ratios; present while `phase !== 'graduated'`. */
  tickFillRatios?: TickFillRatio[]
}

/** The cumulative-bid-count value emitted by {@link ccaBidsSource}. */
export interface CcaBidsState {
  /** Monotonic count of `BidSubmitted` logs seen since first subscribe. Retractions do NOT decrement. */
  bidCount: number
}

export interface LaunchAssetSourceArgs {
  chainId: number
  auction: Address
  /** Version-specific TickDataLens address (resolve via `getTickDataLensForFactory`). */
  tickDataLens: Address
  /** Deterministic graduated pool key (from launch params / poolId derivation). */
  poolKey: { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }
  /** Auction end block, in the auction's own block domain (see `deriveAuctionOutcome`). */
  endBlock: bigint
}
