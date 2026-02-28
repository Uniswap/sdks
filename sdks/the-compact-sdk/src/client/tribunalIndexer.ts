/**
 * Tribunal Indexer Client
 *
 * A lightweight GraphQL client for querying the Tribunal indexer.
 * Uses native fetch with no external dependencies to minimize bundle size.
 */

import { Address, Hex } from 'viem'

import { graphqlFetch, toBigInt, fromBigInt } from '../indexer/fetch'
import {
  GET_ACCOUNT_QUERY,
  GET_ACCOUNTS_QUERY,
  GET_ADJUSTER_QUERY,
  GET_ADJUSTERS_QUERY,
  GET_ARBITER_QUERY,
  GET_ARBITERS_QUERY,
  GET_CANCELLATION_QUERY,
  GET_CANCELLATIONS_QUERY,
  GET_CHAIN_STATISTICS_LIST_QUERY,
  GET_CHAIN_STATISTICS_QUERY,
  GET_DISPATCH_QUERY,
  GET_DISPATCHES_QUERY,
  GET_FILL_QUERY,
  GET_FILLS_QUERY,
  GET_MANDATE_QUERY,
  GET_MANDATES_QUERY,
  GET_META_QUERY,
} from '../indexer/queries'
import {
  AccountFilter,
  AdjusterFilter,
  ArbiterFilter,
  CancellationFilter,
  ChainStatistics,
  ChainStatisticsFilter,
  DispatchFilter,
  FillFilter,
  IndexedAccount,
  IndexedAdjuster,
  IndexedArbiter,
  IndexedCancellation,
  IndexedDispatch,
  IndexedFill,
  IndexedMandate,
  IndexerMeta,
  MandateFilter,
  Page,
  PageInfo,
  QueryOptions,
} from '../types/indexer'

/**
 * Default Tribunal Indexer endpoint
 */
export const DEFAULT_TRIBUNAL_INDEXER_ENDPOINT = 'https://tribunal-indexer.marble.live/'

/**
 * Configuration for the Tribunal Indexer client
 */
export interface TribunalIndexerConfig {
  /**
   * The GraphQL endpoint URL
   * @default 'https://tribunal-indexer.marble.live/'
   */
  endpoint?: string
}

// =============================================================================
// Raw Response Types (matching GraphQL schema exactly)
// =============================================================================

interface RawPageInfo {
  hasNextPage: boolean
  hasPreviousPage: boolean
  startCursor?: string | null
  endCursor?: string | null
}

interface RawPage<T> {
  items: T[]
  pageInfo: RawPageInfo
  totalCount: number
}

interface RawAccount {
  address: string
  firstSeenAt: string
}

interface RawAdjuster {
  address: string
  firstSeenAt: string
}

interface RawArbiter {
  address: string
  firstSeenAt: string
}

interface RawMandate {
  mandateHash: string
  chainId: string
  sponsorAddress: string
  adjusterAddress: string
  arbiterAddress: string
  firstSeenAt: string
  blockNumber: string
  transactionHash: string
  totalFills: string
  totalCancellations: string
}

interface RawFill {
  id: string
  claimHash: string
  mandateHash: string
  chainId: string
  sponsorAddress: string
  fillerAddress: string
  claimant: string
  targetBlock: string
  originalMinimumFillAmounts: string
  originalMaximumClaimAmounts: string
  fillAmounts: string
  claimAmounts: string
  fillPriceImprovements: string
  claimPriceImprovements: string
  fillRecipients: string
  claimantLockTag?: string | null
  claimantRecipient?: string | null
  blockNumber: string
  timestamp: string
  transactionHash: string
  logIndex: number
  arbiterAddress: string
}

interface RawCancellation {
  id: string
  claimHash: string
  mandateHash?: string | null
  chainId: string
  sponsorAddress: string
  blockNumber: string
  timestamp: string
  transactionHash: string
  logIndex: number
}

interface RawDispatch {
  id: string
  claimHash: string
  chainId: string
  targetChainId: string
  targetAddress: string
  claimant: string
  blockNumber: string
  timestamp: string
  transactionHash: string
  logIndex: number
}

interface RawChainStatistics {
  chainId: string
  totalFills: string
  totalCancellations: string
  uniqueFillers: string
  uniqueSponsors: string
  lastUpdated: string
}

// =============================================================================
// Transform Functions
// =============================================================================

function transformPageInfo(raw: RawPageInfo): PageInfo {
  return {
    hasNextPage: raw.hasNextPage,
    hasPreviousPage: raw.hasPreviousPage,
    startCursor: raw.startCursor ?? undefined,
    endCursor: raw.endCursor ?? undefined,
  }
}

function transformAccount(raw: RawAccount): IndexedAccount {
  return {
    address: raw.address as Address,
    firstSeenAt: toBigInt(raw.firstSeenAt),
  }
}

function transformAdjuster(raw: RawAdjuster): IndexedAdjuster {
  return {
    address: raw.address as Address,
    firstSeenAt: toBigInt(raw.firstSeenAt),
  }
}

function transformArbiter(raw: RawArbiter): IndexedArbiter {
  return {
    address: raw.address as Address,
    firstSeenAt: toBigInt(raw.firstSeenAt),
  }
}

function transformMandate(raw: RawMandate): IndexedMandate {
  return {
    mandateHash: raw.mandateHash as Hex,
    chainId: toBigInt(raw.chainId),
    sponsorAddress: raw.sponsorAddress as Address,
    adjusterAddress: raw.adjusterAddress as Address,
    arbiterAddress: raw.arbiterAddress as Address,
    firstSeenAt: toBigInt(raw.firstSeenAt),
    blockNumber: toBigInt(raw.blockNumber),
    transactionHash: raw.transactionHash as Hex,
    totalFills: toBigInt(raw.totalFills),
    totalCancellations: toBigInt(raw.totalCancellations),
  }
}

function transformFill(raw: RawFill): IndexedFill {
  return {
    id: raw.id,
    claimHash: raw.claimHash as Hex,
    mandateHash: raw.mandateHash as Hex,
    chainId: toBigInt(raw.chainId),
    sponsorAddress: raw.sponsorAddress as Address,
    fillerAddress: raw.fillerAddress as Address,
    claimant: raw.claimant as Hex,
    targetBlock: toBigInt(raw.targetBlock),
    originalMinimumFillAmounts: raw.originalMinimumFillAmounts,
    originalMaximumClaimAmounts: raw.originalMaximumClaimAmounts,
    fillAmounts: raw.fillAmounts,
    claimAmounts: raw.claimAmounts,
    fillPriceImprovements: raw.fillPriceImprovements,
    claimPriceImprovements: raw.claimPriceImprovements,
    fillRecipients: raw.fillRecipients,
    claimantLockTag: raw.claimantLockTag ? (raw.claimantLockTag as Hex) : undefined,
    claimantRecipient: raw.claimantRecipient ? (raw.claimantRecipient as Address) : undefined,
    blockNumber: toBigInt(raw.blockNumber),
    timestamp: toBigInt(raw.timestamp),
    transactionHash: raw.transactionHash as Hex,
    logIndex: raw.logIndex,
    arbiterAddress: raw.arbiterAddress as Address,
  }
}

function transformCancellation(raw: RawCancellation): IndexedCancellation {
  return {
    id: raw.id,
    claimHash: raw.claimHash as Hex,
    mandateHash: raw.mandateHash ? (raw.mandateHash as Hex) : undefined,
    chainId: toBigInt(raw.chainId),
    sponsorAddress: raw.sponsorAddress as Address,
    blockNumber: toBigInt(raw.blockNumber),
    timestamp: toBigInt(raw.timestamp),
    transactionHash: raw.transactionHash as Hex,
    logIndex: raw.logIndex,
  }
}

function transformDispatch(raw: RawDispatch): IndexedDispatch {
  return {
    id: raw.id,
    claimHash: raw.claimHash as Hex,
    chainId: toBigInt(raw.chainId),
    targetChainId: toBigInt(raw.targetChainId),
    targetAddress: raw.targetAddress as Address,
    claimant: raw.claimant as Hex,
    blockNumber: toBigInt(raw.blockNumber),
    timestamp: toBigInt(raw.timestamp),
    transactionHash: raw.transactionHash as Hex,
    logIndex: raw.logIndex,
  }
}

function transformChainStatistics(raw: RawChainStatistics): ChainStatistics {
  return {
    chainId: toBigInt(raw.chainId),
    totalFills: toBigInt(raw.totalFills),
    totalCancellations: toBigInt(raw.totalCancellations),
    uniqueFillers: toBigInt(raw.uniqueFillers),
    uniqueSponsors: toBigInt(raw.uniqueSponsors),
    lastUpdated: toBigInt(raw.lastUpdated),
  }
}

// =============================================================================
// Filter Transform Functions
// =============================================================================

type FilterValue = string | bigint | number | boolean | undefined

function transformFilter(filter: Record<string, FilterValue> | undefined): Record<string, unknown> | undefined {
  if (!filter) return undefined

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue
    if (typeof value === 'bigint') {
      result[key] = fromBigInt(value)
    } else {
      result[key] = value
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

// =============================================================================
// Client Implementation
// =============================================================================

/**
 * Tribunal Indexer Client
 *
 * A lightweight GraphQL client for querying indexed Tribunal data including:
 * - Fills, cancellations, and dispatches
 * - Mandates and their activity
 * - Account, adjuster, and arbiter lookups
 * - Chain-level statistics
 *
 * @example
 * ```typescript
 * import { createTribunalIndexerClient } from '@uniswap/the-compact-sdk'
 *
 * // Create with default endpoint
 * const indexer = createTribunalIndexerClient()
 *
 * // Or with custom endpoint
 * const indexer = createTribunalIndexerClient({
 *   endpoint: 'https://custom-indexer.example.com/'
 * })
 *
 * // Query fills
 * const fills = await indexer.getFills({
 *   where: { sponsorAddress: '0x...' },
 *   orderBy: 'timestamp',
 *   orderDirection: 'desc',
 *   limit: 10
 * })
 * ```
 */
export class TribunalIndexerClient {
  private readonly endpoint: string

  /**
   * Create a new Tribunal Indexer client
   *
   * @param config - Configuration options
   */
  constructor(config?: TribunalIndexerConfig) {
    this.endpoint = config?.endpoint ?? DEFAULT_TRIBUNAL_INDEXER_ENDPOINT
  }

  /**
   * Get the endpoint URL
   */
  getEndpoint(): string {
    return this.endpoint
  }

  // ===========================================================================
  // Single Entity Lookups
  // ===========================================================================

  /**
   * Get an account by address
   *
   * @param address - The account address
   * @returns The account or null if not found
   */
  async getAccount(address: Address): Promise<IndexedAccount | null> {
    const data = await graphqlFetch<{ account: RawAccount | null }>(this.endpoint, GET_ACCOUNT_QUERY, {
      address: address.toLowerCase(),
    })
    return data.account ? transformAccount(data.account) : null
  }

  /**
   * Get an adjuster by address
   *
   * @param address - The adjuster address
   * @returns The adjuster or null if not found
   */
  async getAdjuster(address: Address): Promise<IndexedAdjuster | null> {
    const data = await graphqlFetch<{ adjuster: RawAdjuster | null }>(this.endpoint, GET_ADJUSTER_QUERY, {
      address: address.toLowerCase(),
    })
    return data.adjuster ? transformAdjuster(data.adjuster) : null
  }

  /**
   * Get an arbiter by address
   *
   * @param address - The arbiter address
   * @returns The arbiter or null if not found
   */
  async getArbiter(address: Address): Promise<IndexedArbiter | null> {
    const data = await graphqlFetch<{ arbiter: RawArbiter | null }>(this.endpoint, GET_ARBITER_QUERY, {
      address: address.toLowerCase(),
    })
    return data.arbiter ? transformArbiter(data.arbiter) : null
  }

  /**
   * Get a mandate by hash and chain ID
   *
   * @param mandateHash - The mandate hash
   * @param chainId - The chain ID
   * @returns The mandate or null if not found
   */
  async getMandate(mandateHash: Hex, chainId: bigint): Promise<IndexedMandate | null> {
    const data = await graphqlFetch<{ mandate: RawMandate | null }>(this.endpoint, GET_MANDATE_QUERY, {
      mandateHash: mandateHash.toLowerCase(),
      chainId: fromBigInt(chainId),
    })
    return data.mandate ? transformMandate(data.mandate) : null
  }

  /**
   * Get a fill by ID
   *
   * @param id - The fill ID (typically chainId-txHash-logIndex)
   * @returns The fill or null if not found
   */
  async getFill(id: string): Promise<IndexedFill | null> {
    const data = await graphqlFetch<{ fill: RawFill | null }>(this.endpoint, GET_FILL_QUERY, { id })
    return data.fill ? transformFill(data.fill) : null
  }

  /**
   * Get a cancellation by ID
   *
   * @param id - The cancellation ID (typically chainId-txHash-logIndex)
   * @returns The cancellation or null if not found
   */
  async getCancellation(id: string): Promise<IndexedCancellation | null> {
    const data = await graphqlFetch<{ cancellation: RawCancellation | null }>(this.endpoint, GET_CANCELLATION_QUERY, {
      id,
    })
    return data.cancellation ? transformCancellation(data.cancellation) : null
  }

  /**
   * Get a dispatch by ID
   *
   * @param id - The dispatch ID (typically chainId-txHash-logIndex)
   * @returns The dispatch or null if not found
   */
  async getDispatch(id: string): Promise<IndexedDispatch | null> {
    const data = await graphqlFetch<{ dispatch: RawDispatch | null }>(this.endpoint, GET_DISPATCH_QUERY, { id })
    return data.dispatch ? transformDispatch(data.dispatch) : null
  }

  /**
   * Get chain statistics by chain ID
   *
   * @param chainId - The chain ID
   * @returns The chain statistics or null if not found
   */
  async getChainStatistics(chainId: bigint): Promise<ChainStatistics | null> {
    const data = await graphqlFetch<{ chainStatistics: RawChainStatistics | null }>(
      this.endpoint,
      GET_CHAIN_STATISTICS_QUERY,
      { chainId: fromBigInt(chainId) }
    )
    return data.chainStatistics ? transformChainStatistics(data.chainStatistics) : null
  }

  /**
   * Get indexer metadata
   *
   * @returns The indexer meta information
   */
  async getMeta(): Promise<IndexerMeta> {
    const data = await graphqlFetch<{ _meta: { status: unknown } }>(this.endpoint, GET_META_QUERY)
    return { status: data._meta.status }
  }

  // ===========================================================================
  // Paginated List Queries
  // ===========================================================================

  /**
   * Get paginated list of accounts
   *
   * @param options - Query options (filter, ordering, pagination)
   * @returns Paginated list of accounts
   */
  async getAccounts(options?: QueryOptions<AccountFilter>): Promise<Page<IndexedAccount>> {
    const data = await graphqlFetch<{ accounts: RawPage<RawAccount> }>(this.endpoint, GET_ACCOUNTS_QUERY, {
      where: transformFilter(options?.where as Record<string, FilterValue>),
      orderBy: options?.orderBy,
      orderDirection: options?.orderDirection,
      before: options?.before,
      after: options?.after,
      limit: options?.limit,
    })
    return {
      items: data.accounts.items.map(transformAccount),
      pageInfo: transformPageInfo(data.accounts.pageInfo),
      totalCount: data.accounts.totalCount,
    }
  }

  /**
   * Get paginated list of adjusters
   *
   * @param options - Query options (filter, ordering, pagination)
   * @returns Paginated list of adjusters
   */
  async getAdjusters(options?: QueryOptions<AdjusterFilter>): Promise<Page<IndexedAdjuster>> {
    const data = await graphqlFetch<{ adjusters: RawPage<RawAdjuster> }>(this.endpoint, GET_ADJUSTERS_QUERY, {
      where: transformFilter(options?.where as Record<string, FilterValue>),
      orderBy: options?.orderBy,
      orderDirection: options?.orderDirection,
      before: options?.before,
      after: options?.after,
      limit: options?.limit,
    })
    return {
      items: data.adjusters.items.map(transformAdjuster),
      pageInfo: transformPageInfo(data.adjusters.pageInfo),
      totalCount: data.adjusters.totalCount,
    }
  }

  /**
   * Get paginated list of arbiters
   *
   * @param options - Query options (filter, ordering, pagination)
   * @returns Paginated list of arbiters
   */
  async getArbiters(options?: QueryOptions<ArbiterFilter>): Promise<Page<IndexedArbiter>> {
    const data = await graphqlFetch<{ arbiters: RawPage<RawArbiter> }>(this.endpoint, GET_ARBITERS_QUERY, {
      where: transformFilter(options?.where as Record<string, FilterValue>),
      orderBy: options?.orderBy,
      orderDirection: options?.orderDirection,
      before: options?.before,
      after: options?.after,
      limit: options?.limit,
    })
    return {
      items: data.arbiters.items.map(transformArbiter),
      pageInfo: transformPageInfo(data.arbiters.pageInfo),
      totalCount: data.arbiters.totalCount,
    }
  }

  /**
   * Get paginated list of mandates
   *
   * @param options - Query options (filter, ordering, pagination)
   * @returns Paginated list of mandates
   */
  async getMandates(options?: QueryOptions<MandateFilter>): Promise<Page<IndexedMandate>> {
    const data = await graphqlFetch<{ mandates: RawPage<RawMandate> }>(this.endpoint, GET_MANDATES_QUERY, {
      where: transformFilter(options?.where as Record<string, FilterValue>),
      orderBy: options?.orderBy,
      orderDirection: options?.orderDirection,
      before: options?.before,
      after: options?.after,
      limit: options?.limit,
    })
    return {
      items: data.mandates.items.map(transformMandate),
      pageInfo: transformPageInfo(data.mandates.pageInfo),
      totalCount: data.mandates.totalCount,
    }
  }

  /**
   * Get paginated list of fills
   *
   * @param options - Query options (filter, ordering, pagination)
   * @returns Paginated list of fills
   *
   * @example
   * ```typescript
   * // Get recent fills for a sponsor
   * const fills = await indexer.getFills({
   *   where: { sponsorAddress: '0x...' },
   *   orderBy: 'timestamp',
   *   orderDirection: 'desc',
   *   limit: 10
   * })
   *
   * // Paginate through results
   * const nextPage = await indexer.getFills({
   *   after: fills.pageInfo.endCursor,
   *   limit: 10
   * })
   * ```
   */
  async getFills(options?: QueryOptions<FillFilter>): Promise<Page<IndexedFill>> {
    const data = await graphqlFetch<{ fills: RawPage<RawFill> }>(this.endpoint, GET_FILLS_QUERY, {
      where: transformFilter(options?.where as Record<string, FilterValue>),
      orderBy: options?.orderBy,
      orderDirection: options?.orderDirection,
      before: options?.before,
      after: options?.after,
      limit: options?.limit,
    })
    return {
      items: data.fills.items.map(transformFill),
      pageInfo: transformPageInfo(data.fills.pageInfo),
      totalCount: data.fills.totalCount,
    }
  }

  /**
   * Get paginated list of cancellations
   *
   * @param options - Query options (filter, ordering, pagination)
   * @returns Paginated list of cancellations
   */
  async getCancellations(options?: QueryOptions<CancellationFilter>): Promise<Page<IndexedCancellation>> {
    const data = await graphqlFetch<{ cancellations: RawPage<RawCancellation> }>(
      this.endpoint,
      GET_CANCELLATIONS_QUERY,
      {
        where: transformFilter(options?.where as Record<string, FilterValue>),
        orderBy: options?.orderBy,
        orderDirection: options?.orderDirection,
        before: options?.before,
        after: options?.after,
        limit: options?.limit,
      }
    )
    return {
      items: data.cancellations.items.map(transformCancellation),
      pageInfo: transformPageInfo(data.cancellations.pageInfo),
      totalCount: data.cancellations.totalCount,
    }
  }

  /**
   * Get paginated list of dispatches
   *
   * @param options - Query options (filter, ordering, pagination)
   * @returns Paginated list of dispatches
   */
  async getDispatches(options?: QueryOptions<DispatchFilter>): Promise<Page<IndexedDispatch>> {
    // Note: The GraphQL API uses "dispatchs" (typo in schema)
    const data = await graphqlFetch<{ dispatchs: RawPage<RawDispatch> }>(this.endpoint, GET_DISPATCHES_QUERY, {
      where: transformFilter(options?.where as Record<string, FilterValue>),
      orderBy: options?.orderBy,
      orderDirection: options?.orderDirection,
      before: options?.before,
      after: options?.after,
      limit: options?.limit,
    })
    return {
      items: data.dispatchs.items.map(transformDispatch),
      pageInfo: transformPageInfo(data.dispatchs.pageInfo),
      totalCount: data.dispatchs.totalCount,
    }
  }

  /**
   * Get paginated list of chain statistics
   *
   * @param options - Query options (filter, ordering, pagination)
   * @returns Paginated list of chain statistics
   */
  async getAllChainStatistics(options?: QueryOptions<ChainStatisticsFilter>): Promise<Page<ChainStatistics>> {
    // Note: The GraphQL API uses "chainStatisticss" (typo in schema)
    const data = await graphqlFetch<{ chainStatisticss: RawPage<RawChainStatistics> }>(
      this.endpoint,
      GET_CHAIN_STATISTICS_LIST_QUERY,
      {
        where: transformFilter(options?.where as Record<string, FilterValue>),
        orderBy: options?.orderBy,
        orderDirection: options?.orderDirection,
        before: options?.before,
        after: options?.after,
        limit: options?.limit,
      }
    )
    return {
      items: data.chainStatisticss.items.map(transformChainStatistics),
      pageInfo: transformPageInfo(data.chainStatisticss.pageInfo),
      totalCount: data.chainStatisticss.totalCount,
    }
  }
}

/**
 * Create a Tribunal Indexer client
 *
 * This is the recommended way to create a client instance.
 *
 * @param config - Configuration options
 * @returns A new TribunalIndexerClient instance
 *
 * @example
 * ```typescript
 * import { createTribunalIndexerClient } from '@uniswap/the-compact-sdk'
 *
 * // Create with default endpoint
 * const indexer = createTribunalIndexerClient()
 *
 * // Create with custom endpoint
 * const indexer = createTribunalIndexerClient({
 *   endpoint: 'https://custom-indexer.example.com/'
 * })
 * ```
 */
export function createTribunalIndexerClient(config?: TribunalIndexerConfig): TribunalIndexerClient {
  return new TribunalIndexerClient(config)
}
