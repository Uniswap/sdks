/**
 * GraphQL query strings for the Tribunal Indexer
 *
 * These are exported as constants for tree-shakeability.
 * Advanced users can import individual queries for custom use cases.
 */

// =============================================================================
// Fragment Definitions
// =============================================================================

export const PAGE_INFO_FRAGMENT = `
  pageInfo {
    hasNextPage
    hasPreviousPage
    startCursor
    endCursor
  }
  totalCount
`

export const ACCOUNT_FIELDS = `
  address
  firstSeenAt
`

export const ADJUSTER_FIELDS = `
  address
  firstSeenAt
`

export const ARBITER_FIELDS = `
  address
  firstSeenAt
`

export const MANDATE_FIELDS = `
  mandateHash
  chainId
  sponsorAddress
  adjusterAddress
  arbiterAddress
  firstSeenAt
  blockNumber
  transactionHash
  totalFills
  totalCancellations
`

export const FILL_FIELDS = `
  id
  claimHash
  mandateHash
  chainId
  sponsorAddress
  fillerAddress
  claimant
  targetBlock
  originalMinimumFillAmounts
  originalMaximumClaimAmounts
  fillAmounts
  claimAmounts
  fillPriceImprovements
  claimPriceImprovements
  fillRecipients
  claimantLockTag
  claimantRecipient
  blockNumber
  timestamp
  transactionHash
  logIndex
  arbiterAddress
`

export const CANCELLATION_FIELDS = `
  id
  claimHash
  mandateHash
  chainId
  sponsorAddress
  blockNumber
  timestamp
  transactionHash
  logIndex
`

export const DISPATCH_FIELDS = `
  id
  claimHash
  chainId
  targetChainId
  targetAddress
  claimant
  blockNumber
  timestamp
  transactionHash
  logIndex
`

export const CHAIN_STATISTICS_FIELDS = `
  chainId
  totalFills
  totalCancellations
  uniqueFillers
  uniqueSponsors
  lastUpdated
`

// =============================================================================
// Single Entity Queries
// =============================================================================

export const GET_ACCOUNT_QUERY = `
  query GetAccount($address: String!) {
    account(address: $address) {
      ${ACCOUNT_FIELDS}
    }
  }
`

export const GET_ADJUSTER_QUERY = `
  query GetAdjuster($address: String!) {
    adjuster(address: $address) {
      ${ADJUSTER_FIELDS}
    }
  }
`

export const GET_ARBITER_QUERY = `
  query GetArbiter($address: String!) {
    arbiter(address: $address) {
      ${ARBITER_FIELDS}
    }
  }
`

export const GET_MANDATE_QUERY = `
  query GetMandate($mandateHash: String!, $chainId: BigInt!) {
    mandate(mandateHash: $mandateHash, chainId: $chainId) {
      ${MANDATE_FIELDS}
    }
  }
`

export const GET_FILL_QUERY = `
  query GetFill($id: String!) {
    fill(id: $id) {
      ${FILL_FIELDS}
    }
  }
`

export const GET_CANCELLATION_QUERY = `
  query GetCancellation($id: String!) {
    cancellation(id: $id) {
      ${CANCELLATION_FIELDS}
    }
  }
`

export const GET_DISPATCH_QUERY = `
  query GetDispatch($id: String!) {
    dispatch(id: $id) {
      ${DISPATCH_FIELDS}
    }
  }
`

export const GET_CHAIN_STATISTICS_QUERY = `
  query GetChainStatistics($chainId: BigInt!) {
    chainStatistics(chainId: $chainId) {
      ${CHAIN_STATISTICS_FIELDS}
    }
  }
`

export const GET_META_QUERY = `
  query GetMeta {
    _meta {
      status
    }
  }
`

// =============================================================================
// Paginated List Queries
// =============================================================================

export const GET_ACCOUNTS_QUERY = `
  query GetAccounts(
    $where: accountFilter
    $orderBy: String
    $orderDirection: String
    $before: String
    $after: String
    $limit: Int
  ) {
    accounts(
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
      before: $before
      after: $after
      limit: $limit
    ) {
      items {
        ${ACCOUNT_FIELDS}
      }
      ${PAGE_INFO_FRAGMENT}
    }
  }
`

export const GET_ADJUSTERS_QUERY = `
  query GetAdjusters(
    $where: adjusterFilter
    $orderBy: String
    $orderDirection: String
    $before: String
    $after: String
    $limit: Int
  ) {
    adjusters(
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
      before: $before
      after: $after
      limit: $limit
    ) {
      items {
        ${ADJUSTER_FIELDS}
      }
      ${PAGE_INFO_FRAGMENT}
    }
  }
`

export const GET_ARBITERS_QUERY = `
  query GetArbiters(
    $where: arbiterFilter
    $orderBy: String
    $orderDirection: String
    $before: String
    $after: String
    $limit: Int
  ) {
    arbiters(
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
      before: $before
      after: $after
      limit: $limit
    ) {
      items {
        ${ARBITER_FIELDS}
      }
      ${PAGE_INFO_FRAGMENT}
    }
  }
`

export const GET_MANDATES_QUERY = `
  query GetMandates(
    $where: mandateFilter
    $orderBy: String
    $orderDirection: String
    $before: String
    $after: String
    $limit: Int
  ) {
    mandates(
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
      before: $before
      after: $after
      limit: $limit
    ) {
      items {
        ${MANDATE_FIELDS}
      }
      ${PAGE_INFO_FRAGMENT}
    }
  }
`

export const GET_FILLS_QUERY = `
  query GetFills(
    $where: fillFilter
    $orderBy: String
    $orderDirection: String
    $before: String
    $after: String
    $limit: Int
  ) {
    fills(
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
      before: $before
      after: $after
      limit: $limit
    ) {
      items {
        ${FILL_FIELDS}
      }
      ${PAGE_INFO_FRAGMENT}
    }
  }
`

export const GET_CANCELLATIONS_QUERY = `
  query GetCancellations(
    $where: cancellationFilter
    $orderBy: String
    $orderDirection: String
    $before: String
    $after: String
    $limit: Int
  ) {
    cancellations(
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
      before: $before
      after: $after
      limit: $limit
    ) {
      items {
        ${CANCELLATION_FIELDS}
      }
      ${PAGE_INFO_FRAGMENT}
    }
  }
`

export const GET_DISPATCHES_QUERY = `
  query GetDispatches(
    $where: dispatchFilter
    $orderBy: String
    $orderDirection: String
    $before: String
    $after: String
    $limit: Int
  ) {
    dispatchs(
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
      before: $before
      after: $after
      limit: $limit
    ) {
      items {
        ${DISPATCH_FIELDS}
      }
      ${PAGE_INFO_FRAGMENT}
    }
  }
`

export const GET_CHAIN_STATISTICS_LIST_QUERY = `
  query GetChainStatisticsList(
    $where: chainStatisticsFilter
    $orderBy: String
    $orderDirection: String
    $before: String
    $after: String
    $limit: Int
  ) {
    chainStatisticss(
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
      before: $before
      after: $after
      limit: $limit
    ) {
      items {
        ${CHAIN_STATISTICS_FIELDS}
      }
      ${PAGE_INFO_FRAGMENT}
    }
  }
`
