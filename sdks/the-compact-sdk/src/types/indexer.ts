/**
 * TypeScript types for the Tribunal Indexer GraphQL API
 *
 * These types match the schema at https://tribunal-indexer.marble.live/
 */

import { Address, Hex } from 'viem'

// =============================================================================
// Pagination Types
// =============================================================================

/**
 * Pagination info returned with paginated queries
 */
export interface PageInfo {
  /** Whether there are more results after this page */
  hasNextPage: boolean
  /** Whether there are results before this page */
  hasPreviousPage: boolean
  /** Cursor for the first item in this page */
  startCursor?: string
  /** Cursor for the last item in this page */
  endCursor?: string
}

/**
 * Generic paginated response
 */
export interface Page<T> {
  /** Items in this page */
  items: T[]
  /** Pagination info */
  pageInfo: PageInfo
  /** Total count of items across all pages */
  totalCount: number
}

/**
 * Common query options for paginated queries
 */
export interface QueryOptions<TFilter = unknown> {
  /** Filter conditions */
  where?: TFilter
  /** Field to order by */
  orderBy?: string
  /** Order direction: 'asc' or 'desc' */
  orderDirection?: 'asc' | 'desc'
  /** Cursor to fetch results before */
  before?: string
  /** Cursor to fetch results after */
  after?: string
  /** Maximum number of results to return */
  limit?: number
}

// =============================================================================
// Core Entity Types
// =============================================================================

/**
 * An indexed account (sponsor or filler)
 */
export interface IndexedAccount {
  /** Account address */
  address: Address
  /** Timestamp when first seen */
  firstSeenAt: bigint
}

/**
 * An indexed adjuster
 */
export interface IndexedAdjuster {
  /** Adjuster address */
  address: Address
  /** Timestamp when first seen */
  firstSeenAt: bigint
}

/**
 * An indexed arbiter
 */
export interface IndexedArbiter {
  /** Arbiter address */
  address: Address
  /** Timestamp when first seen */
  firstSeenAt: bigint
}

/**
 * An indexed mandate
 */
export interface IndexedMandate {
  /** The mandate hash (unique identifier with chainId) */
  mandateHash: Hex
  /** Chain ID where the mandate exists */
  chainId: bigint
  /** Address of the sponsor */
  sponsorAddress: Address
  /** Address of the adjuster */
  adjusterAddress: Address
  /** Address of the arbiter */
  arbiterAddress: Address
  /** Timestamp when first seen */
  firstSeenAt: bigint
  /** Block number when first seen */
  blockNumber: bigint
  /** Transaction hash when first seen */
  transactionHash: Hex
  /** Total number of fills for this mandate */
  totalFills: bigint
  /** Total number of cancellations for this mandate */
  totalCancellations: bigint
}

/**
 * An indexed fill event
 */
export interface IndexedFill {
  /** Unique identifier (typically chainId-txHash-logIndex) */
  id: string
  /** The claim hash */
  claimHash: Hex
  /** The mandate hash */
  mandateHash: Hex
  /** Chain ID where the fill occurred */
  chainId: bigint
  /** Address of the sponsor */
  sponsorAddress: Address
  /** Address of the filler */
  fillerAddress: Address
  /** Encoded claimant data */
  claimant: Hex
  /** Target block for price curve evaluation */
  targetBlock: bigint
  /** Original minimum fill amounts (JSON-encoded array) */
  originalMinimumFillAmounts: string
  /** Original maximum claim amounts (JSON-encoded array) */
  originalMaximumClaimAmounts: string
  /** Actual fill amounts (JSON-encoded array) */
  fillAmounts: string
  /** Actual claim amounts (JSON-encoded array) */
  claimAmounts: string
  /** Fill price improvements (JSON-encoded array) */
  fillPriceImprovements: string
  /** Claim price improvements (JSON-encoded array) */
  claimPriceImprovements: string
  /** Fill recipients (JSON-encoded array) */
  fillRecipients: string
  /** Optional claimant lock tag */
  claimantLockTag?: Hex
  /** Optional claimant recipient */
  claimantRecipient?: Address
  /** Block number of the fill */
  blockNumber: bigint
  /** Timestamp of the fill */
  timestamp: bigint
  /** Transaction hash */
  transactionHash: Hex
  /** Log index within the transaction */
  logIndex: number
  /** Address of the arbiter */
  arbiterAddress: Address
}

/**
 * An indexed cancellation event
 */
export interface IndexedCancellation {
  /** Unique identifier (typically chainId-txHash-logIndex) */
  id: string
  /** The claim hash that was cancelled */
  claimHash: Hex
  /** The mandate hash (optional) */
  mandateHash?: Hex
  /** Chain ID where the cancellation occurred */
  chainId: bigint
  /** Address of the sponsor */
  sponsorAddress: Address
  /** Block number of the cancellation */
  blockNumber: bigint
  /** Timestamp of the cancellation */
  timestamp: bigint
  /** Transaction hash */
  transactionHash: Hex
  /** Log index within the transaction */
  logIndex: number
}

/**
 * An indexed dispatch event (cross-chain)
 */
export interface IndexedDispatch {
  /** Unique identifier (typically chainId-txHash-logIndex) */
  id: string
  /** The claim hash */
  claimHash: Hex
  /** Source chain ID */
  chainId: bigint
  /** Target chain ID */
  targetChainId: bigint
  /** Target address on the destination chain */
  targetAddress: Address
  /** Encoded claimant data */
  claimant: Hex
  /** Block number of the dispatch */
  blockNumber: bigint
  /** Timestamp of the dispatch */
  timestamp: bigint
  /** Transaction hash */
  transactionHash: Hex
  /** Log index within the transaction */
  logIndex: number
}

/**
 * Chain-level statistics
 */
export interface ChainStatistics {
  /** Chain ID */
  chainId: bigint
  /** Total number of fills on this chain */
  totalFills: bigint
  /** Total number of cancellations on this chain */
  totalCancellations: bigint
  /** Number of unique fillers */
  uniqueFillers: bigint
  /** Number of unique sponsors */
  uniqueSponsors: bigint
  /** Timestamp of last update */
  lastUpdated: bigint
}

/**
 * Indexer metadata
 */
export interface IndexerMeta {
  /** Status information (structure varies) */
  status: unknown
}

// =============================================================================
// Filter Types
// =============================================================================

/**
 * Filter options for account queries
 */
export interface AccountFilter {
  /** Filter by address */
  address?: Address
  /** Filter by firstSeenAt greater than */
  firstSeenAt_gt?: bigint
  /** Filter by firstSeenAt less than */
  firstSeenAt_lt?: bigint
}

/**
 * Filter options for adjuster queries
 */
export interface AdjusterFilter {
  /** Filter by address */
  address?: Address
  /** Filter by firstSeenAt greater than */
  firstSeenAt_gt?: bigint
  /** Filter by firstSeenAt less than */
  firstSeenAt_lt?: bigint
}

/**
 * Filter options for arbiter queries
 */
export interface ArbiterFilter {
  /** Filter by address */
  address?: Address
  /** Filter by firstSeenAt greater than */
  firstSeenAt_gt?: bigint
  /** Filter by firstSeenAt less than */
  firstSeenAt_lt?: bigint
}

/**
 * Filter options for mandate queries
 */
export interface MandateFilter {
  /** Filter by mandate hash */
  mandateHash?: Hex
  /** Filter by chain ID */
  chainId?: bigint
  /** Filter by sponsor address */
  sponsorAddress?: Address
  /** Filter by adjuster address */
  adjusterAddress?: Address
  /** Filter by arbiter address */
  arbiterAddress?: Address
  /** Filter by block number greater than */
  blockNumber_gt?: bigint
  /** Filter by block number less than */
  blockNumber_lt?: bigint
}

/**
 * Filter options for fill queries
 */
export interface FillFilter {
  /** Filter by fill ID */
  id?: string
  /** Filter by claim hash */
  claimHash?: Hex
  /** Filter by mandate hash */
  mandateHash?: Hex
  /** Filter by chain ID */
  chainId?: bigint
  /** Filter by sponsor address */
  sponsorAddress?: Address
  /** Filter by filler address */
  fillerAddress?: Address
  /** Filter by arbiter address */
  arbiterAddress?: Address
  /** Filter by block number greater than */
  blockNumber_gt?: bigint
  /** Filter by block number less than */
  blockNumber_lt?: bigint
  /** Filter by timestamp greater than */
  timestamp_gt?: bigint
  /** Filter by timestamp less than */
  timestamp_lt?: bigint
}

/**
 * Filter options for cancellation queries
 */
export interface CancellationFilter {
  /** Filter by cancellation ID */
  id?: string
  /** Filter by claim hash */
  claimHash?: Hex
  /** Filter by mandate hash */
  mandateHash?: Hex
  /** Filter by chain ID */
  chainId?: bigint
  /** Filter by sponsor address */
  sponsorAddress?: Address
  /** Filter by block number greater than */
  blockNumber_gt?: bigint
  /** Filter by block number less than */
  blockNumber_lt?: bigint
  /** Filter by timestamp greater than */
  timestamp_gt?: bigint
  /** Filter by timestamp less than */
  timestamp_lt?: bigint
}

/**
 * Filter options for dispatch queries
 */
export interface DispatchFilter {
  /** Filter by dispatch ID */
  id?: string
  /** Filter by claim hash */
  claimHash?: Hex
  /** Filter by source chain ID */
  chainId?: bigint
  /** Filter by target chain ID */
  targetChainId?: bigint
  /** Filter by target address */
  targetAddress?: Address
  /** Filter by block number greater than */
  blockNumber_gt?: bigint
  /** Filter by block number less than */
  blockNumber_lt?: bigint
  /** Filter by timestamp greater than */
  timestamp_gt?: bigint
  /** Filter by timestamp less than */
  timestamp_lt?: bigint
}

/**
 * Filter options for chain statistics queries
 */
export interface ChainStatisticsFilter {
  /** Filter by chain ID */
  chainId?: bigint
}
