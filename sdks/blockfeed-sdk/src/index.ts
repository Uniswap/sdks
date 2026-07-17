/**
 * @uniswap/blockfeed-sdk
 *
 * Block-latency on-chain data feeds — live prices, auction state, and logs over any viem
 * PublicClient.
 */

// Engine
export { createBlockFeed } from './engine'
export type { BlockFeed, BlockFeedOptions } from './engine'

// Scheduler (injectable time source for the engine)
export { realScheduler } from './internal/scheduler'
export type { Scheduler } from './internal/scheduler'

// Source-authoring contract (types.ts) — the full set consumers implement custom sources against.
export type {
  BlockfeedClient,
  ContractCall,
  SpeculativeCall,
  LogFilter,
  TickIdentity,
  CallResult,
  FeedLogRef,
  DecodedFeedLog,
  TickData,
  SourceEmission,
  TickContext,
  Source,
  FeedEvent,
  FeedSnapshot,
  FeedStore,
  PoolKeyStruct,
  PoolRef,
  PathLeg,
  PricePath,
} from './types'

// Price-path source
export { pricePathSource, pricePathKey } from './sources/pricePath'
export type { PricePathValue } from './sources/pricePath'

// Launch-lifecycle sources (Uniswap Liquidity Launcher auctions; moved in-package from the launcher SDK)
export { launchAssetSource, quickLaunchAssetSource, ccaBidsSource, decodeBidSubmitted } from './sources/launch'
export type { LaunchAssetState, CcaBidsState, LaunchPhase, LaunchAssetSourceArgs, BidSubmitted } from './sources/launch'

// Price math
export { priceFromSqrtPriceX96, priceFromV2Reserves } from './math/sqrtPrice'
export { poolIdFromPoolKey, poolRefIdentifier } from './math/poolId'
export { q96ToPrice } from './math/price'

// Visibility plugin
export { attachVisibilityPlugin, DEFAULT_MAX_CATCHUP_BLOCKS } from './plugins/visibility'
export type { VisibilityTarget } from './plugins/visibility'

// Chain addresses
export { getChainAddresses, CHAIN_ADDRESSES } from './addresses'
export type { ChainAddresses } from './addresses'

// Public constants: Multicall3 + the DEFAULT_* values BlockFeedOptions documents. Backoff/stale
// internals (BACKOFF_*, STALE_*) are deliberately NOT re-exported.
export {
  MULTICALL3_ADDRESS,
  DEFAULT_TRAILING_LOG_WINDOW,
  DEFAULT_BUFFER_SIZE,
  DEFAULT_MAX_CALLS_PER_CHUNK,
  DEFAULT_POLL_INTERVAL_MS,
  FALLBACK_POLL_INTERVAL_MS,
} from './constants'

// ABIs consumers need to build custom sources (factory/quoter ABIs stay discovery-internal).
export { V2_PAIR_ABI, V3_POOL_ABI, STATE_VIEW_ABI } from './abis'

// Errors
export { BlockfeedError, TickFailedError } from './errors'
