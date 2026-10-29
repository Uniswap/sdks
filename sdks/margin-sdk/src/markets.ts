import { type Address, type PublicClient, isAddressEqual, zeroAddress } from 'viem'

import {
  AAVE_LENDING_ADAPTER_ABI,
  AAVE_V3_DATA_PROVIDER_ABI,
  AAVE_V4_LENDING_ADAPTER_ABI,
  AAVE_V4_SPOKE_RESERVES_ABI,
  COMPOUND_V3_COMET_ASSETS_ABI,
  COMPOUND_V3_LENDING_ADAPTER_ABI,
} from './abis.js'
import { type LendingVenue, type MarginAddresses } from './addresses.js'
import { EMPTY_MARKET_DATA, encodeAaveV4MarketData, encodeMorphoMarketData } from './market.js'
import { type Market } from './types.js'

/**
 * Market discovery: enumerates the markets each lending venue actually supports, independent of
 * the expected-cost ranking in `selection.ts` (which prices a caller-supplied `MarketCandidate`
 * snapshot rather than discovering one). Aave v3, Aave v4, and Compound v3 are discovered onchain
 * from their own reserve/asset lists; Morpho Blue has no onchain market registry (anyone can
 * permissionlessly create one with an arbitrary oracle/irm), so it is discovered from Morpho's
 * public API instead.
 */

export interface DiscoveredMarket {
  venue: LendingVenue
  market: Market
}

export interface MarketDiscoveryFilter {
  /** Restrict to markets with this exact collateral token. */
  collateralToken?: Address
  /** Restrict to markets with this exact debt token. */
  debtToken?: Address
}

function marketPasses(collateral: Address, debt: Address, filter?: MarketDiscoveryFilter): boolean {
  if (filter?.collateralToken && !isAddressEqual(collateral, filter.collateralToken)) return false
  if (filter?.debtToken && !isAddressEqual(debt, filter.debtToken)) return false
  return true
}

// ---------------------------------------------------------------------------
// Aave v3: any reserve can sit on either side of a market. Discovery enumerates every reserve via
// the adapter's own data provider and gates on the flags the router cares about (active, not
// frozen, and collateral- or borrow-enabled).
// ---------------------------------------------------------------------------

/**
 * Discovers every (collateral, debt) pair the Aave v3 adapter can route, by enumerating all Aave
 * reserves through the data provider the adapter itself resolves (`adapter.dataProvider()`) and
 * keeping only active, unfrozen reserves on each side. `market.data` is always empty: Aave v3 has
 * one market per asset pair, fully determined by the Pool the adapter is bound to.
 */
export async function discoverAaveV3Markets(
  client: PublicClient,
  adapter: Address,
  filter?: MarketDiscoveryFilter
): Promise<DiscoveredMarket[]> {
  const dataProvider = await client.readContract({
    address: adapter,
    abi: AAVE_LENDING_ADAPTER_ABI,
    functionName: 'dataProvider',
  })
  const tokens = await client.readContract({
    address: dataProvider,
    abi: AAVE_V3_DATA_PROVIDER_ABI,
    functionName: 'getAllReservesTokens',
  })
  const configs = await client.multicall({
    contracts: tokens.map(
      (t) =>
        ({
          address: dataProvider,
          abi: AAVE_V3_DATA_PROVIDER_ABI,
          functionName: 'getReserveConfigurationData',
          args: [t.tokenAddress],
        } as const)
    ),
    allowFailure: false,
  })

  // getReserveConfigurationData has ten separate top-level outputs (not one struct), so viem
  // decodes it as a positional tuple: [decimals, ltv, liquidationThreshold, liquidationBonus,
  // reserveFactor, usageAsCollateralEnabled, borrowingEnabled, stableBorrowRateEnabled, isActive,
  // isFrozen] — verified against the live mainnet DataProvider.
  const collateralEligible: Address[] = []
  const debtEligible: Address[] = []
  tokens.forEach((token, i) => {
    const [, , , , , usageAsCollateralEnabled, borrowingEnabled, , isActive, isFrozen] = configs[i]
    const usable = isActive && !isFrozen
    if (usable && usageAsCollateralEnabled) collateralEligible.push(token.tokenAddress)
    if (usable && borrowingEnabled) debtEligible.push(token.tokenAddress)
  })

  const out: DiscoveredMarket[] = []
  for (const collateral of collateralEligible) {
    for (const debt of debtEligible) {
      if (isAddressEqual(collateral, debt)) continue
      if (!marketPasses(collateral, debt, filter)) continue
      out.push({ venue: 'aaveV3', market: { collateral, debt, data: EMPTY_MARKET_DATA } })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Aave v4: reserves are keyed by a dense `reserveId` sequence starting at 0 with no enumeration
// method; an unused id reverts `ReserveNotListed` (verified onchain), so discovery scans ids until
// the scan limit and keeps only the ones that resolved.
// ---------------------------------------------------------------------------

/** Reserve ids scanned by {@link discoverAaveV4Markets} when `opts.maxReserveId` is not set. */
export const AAVE_V4_DEFAULT_MAX_RESERVE_ID = 256

/**
 * Discovers every (collateral, debt) reserve pair the Aave v4 adapter can route, by scanning
 * reserve ids on the Spoke the adapter is bound to (`adapter.spoke()`) and keeping pairs where
 * both reserves are unpaused/unfrozen, the collateral side has a nonzero collateral factor, and
 * the debt side is borrowable. `market.data` encodes `(collateralReserveId, debtReserveId)`.
 */
export async function discoverAaveV4Markets(
  client: PublicClient,
  adapter: Address,
  filter?: MarketDiscoveryFilter,
  opts?: { maxReserveId?: number }
): Promise<DiscoveredMarket[]> {
  const spoke = await client.readContract({
    address: adapter,
    abi: AAVE_V4_LENDING_ADAPTER_ABI,
    functionName: 'spoke',
  })
  const maxReserveId = opts?.maxReserveId ?? AAVE_V4_DEFAULT_MAX_RESERVE_ID

  const reserveResults = await client.multicall({
    contracts: Array.from(
      { length: maxReserveId },
      (_, id) =>
        ({
          address: spoke,
          abi: AAVE_V4_SPOKE_RESERVES_ABI,
          functionName: 'getReserve',
          args: [BigInt(id)],
        } as const)
    ),
    allowFailure: true,
  })

  const liveIds = reserveResults
    .map((r, id) => (r.status === 'success' && !isAddressEqual(r.result.underlying, zeroAddress) ? id : -1))
    .filter((id) => id >= 0)
  if (liveIds.length === 0) return []

  const underlyingOf = (id: number): Address => {
    const r = reserveResults[id]
    if (r.status !== 'success') throw new Error(`unreachable: reserve ${id} was not live`)
    return r.result.underlying
  }
  const dynamicConfigKeyOf = (id: number): number => {
    const r = reserveResults[id]
    if (r.status !== 'success') throw new Error(`unreachable: reserve ${id} was not live`)
    return r.result.dynamicConfigKey
  }

  const [configResults, dynamicResults] = await Promise.all([
    client.multicall({
      contracts: liveIds.map(
        (id) =>
          ({
            address: spoke,
            abi: AAVE_V4_SPOKE_RESERVES_ABI,
            functionName: 'getReserveConfig',
            args: [BigInt(id)],
          } as const)
      ),
      allowFailure: false,
    }),
    client.multicall({
      contracts: liveIds.map(
        (id) =>
          ({
            address: spoke,
            abi: AAVE_V4_SPOKE_RESERVES_ABI,
            functionName: 'getDynamicReserveConfig',
            args: [BigInt(id), dynamicConfigKeyOf(id)],
          } as const)
      ),
      allowFailure: false,
    }),
  ])

  const collateralEligible: number[] = []
  const debtEligible: number[] = []
  liveIds.forEach((id, i) => {
    const config = configResults[i]
    const dynamic = dynamicResults[i]
    const usable = !config.paused && !config.frozen
    if (usable && dynamic.collateralFactor > 0) collateralEligible.push(id)
    if (usable && config.borrowable) debtEligible.push(id)
  })

  const out: DiscoveredMarket[] = []
  for (const collateralReserveId of collateralEligible) {
    for (const debtReserveId of debtEligible) {
      if (collateralReserveId === debtReserveId) continue
      const collateral = underlyingOf(collateralReserveId)
      const debt = underlyingOf(debtReserveId)
      if (!marketPasses(collateral, debt, filter)) continue
      out.push({
        venue: 'aaveV4',
        market: {
          collateral,
          debt,
          data: encodeAaveV4MarketData({
            collateralReserveId: BigInt(collateralReserveId),
            debtReserveId: BigInt(debtReserveId),
          }),
        },
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Compound v3: single-base-asset Comet. Debt is fixed to the Comet's base token; collateral
// options are the Comet's registered asset list.
// ---------------------------------------------------------------------------

/**
 * Discovers every (collateral, debt) pair the Compound v3 adapter can route. The debt side is
 * always the Comet's base token (`adapter.baseToken()`); collateral options are the Comet's
 * registered assets (`numAssets()` / `getAssetInfo(i)`, read from `adapter.comet()`). `market.data`
 * is always empty: Compound v3 has one market per Comet, fully determined by the Comet address.
 */
export async function discoverCompoundV3Markets(
  client: PublicClient,
  adapter: Address,
  filter?: MarketDiscoveryFilter
): Promise<DiscoveredMarket[]> {
  const [comet, debt] = await Promise.all([
    client.readContract({ address: adapter, abi: COMPOUND_V3_LENDING_ADAPTER_ABI, functionName: 'comet' }),
    client.readContract({ address: adapter, abi: COMPOUND_V3_LENDING_ADAPTER_ABI, functionName: 'baseToken' }),
  ])
  if (filter?.debtToken && !isAddressEqual(debt, filter.debtToken)) return []

  const numAssets = await client.readContract({
    address: comet,
    abi: COMPOUND_V3_COMET_ASSETS_ABI,
    functionName: 'numAssets',
  })
  const assets = await client.multicall({
    contracts: Array.from(
      { length: numAssets },
      (_, i) =>
        ({ address: comet, abi: COMPOUND_V3_COMET_ASSETS_ABI, functionName: 'getAssetInfo', args: [i] } as const)
    ),
    allowFailure: false,
  })

  const out: DiscoveredMarket[] = []
  for (const info of assets) {
    if (!marketPasses(info.asset, debt, filter)) continue
    out.push({ venue: 'compoundV3', market: { collateral: info.asset, debt, data: EMPTY_MARKET_DATA } })
  }
  return out
}

// ---------------------------------------------------------------------------
// Morpho Blue: no onchain market registry (anyone can permissionlessly create a market with an
// arbitrary oracle/irm), so discovery queries Morpho's public API instead of the chain.
// ---------------------------------------------------------------------------

export interface MorphoMarketFilter extends MarketDiscoveryFilter {
  /**
   * Restrict to markets Morpho's own curation shows in its app (the `listed` flag). Default true:
   * Blue markets are permissionless, so an unlisted market can carry an arbitrary or broken oracle
   * (verified: the API has returned unlisted markets with a zero IRM address). Pass false for the
   * full permissionless universe.
   */
  listedOnly?: boolean
  /** Overrides the Morpho API base URL (e.g. a self-hosted mirror). Default `https://api.morpho.org`. */
  apiUrl?: string
}

const MORPHO_DEFAULT_API_URL = 'https://api.morpho.org'
const MORPHO_PAGE_LIMIT = 100
/** Caps pagination for an unfiltered query; narrow with `collateralToken`/`debtToken` instead of raising this. */
const MORPHO_MAX_PAGES = 20

interface MorphoRestMarket {
  loan_token: Address
  collateral_token: Address
  oracle_address: Address
  irm_address: Address
  lltv_wad: string
}

interface MorphoRestMarketsResponse {
  data: MorphoRestMarket[]
  cursor: string | null
}

/**
 * Discovers Morpho Blue markets via Morpho's public REST API (`GET /v1/blue/markets`), the
 * documented default over its GraphQL counterpart. `market.data` encodes `(oracle, irm, lltv)`.
 */
export async function discoverMorphoMarkets(chainId: number, filter?: MorphoMarketFilter): Promise<DiscoveredMarket[]> {
  const baseUrl = filter?.apiUrl ?? MORPHO_DEFAULT_API_URL
  const listedOnly = filter?.listedOnly ?? true

  const out: DiscoveredMarket[] = []
  let cursor: string | undefined
  for (let page = 0; page < MORPHO_MAX_PAGES; page++) {
    const params = new URLSearchParams({ chain_id: String(chainId), limit: String(MORPHO_PAGE_LIMIT) })
    if (listedOnly) params.set('listed', 'true')
    // The API's two token filters take different shapes: collateral_token is a bare address
    // (chain_id supplies the chain), loan_token must be the combined `<chain_id>:<address>`
    // selector even when chain_id is also present — both verified live against api.morpho.org.
    if (filter?.collateralToken) params.set('collateral_token', filter.collateralToken)
    if (filter?.debtToken) params.set('loan_token', `${chainId}:${filter.debtToken}`)
    if (cursor) params.set('cursor', cursor)

    const response = await fetch(`${baseUrl}/v1/blue/markets?${params.toString()}`, {
      headers: { accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`Morpho API request failed: ${response.status} ${response.statusText}`)
    }
    const body = (await response.json()) as MorphoRestMarketsResponse
    for (const m of body.data) {
      out.push({
        venue: 'morphoBlue',
        market: {
          collateral: m.collateral_token,
          debt: m.loan_token,
          data: encodeMorphoMarketData({ oracle: m.oracle_address, irm: m.irm_address, lltv: BigInt(m.lltv_wad) }),
        },
      })
    }
    if (!body.cursor) break
    cursor = body.cursor
  }
  return out
}

// ---------------------------------------------------------------------------
// All venues
// ---------------------------------------------------------------------------

export interface DiscoverAllMarketsOptions extends MarketDiscoveryFilter {
  /** Morpho-specific overrides (`listedOnly`, `apiUrl`); the shared token filter applies to it too. */
  morpho?: Pick<MorphoMarketFilter, 'listedOnly' | 'apiUrl'>
  /** Aave v4-specific overrides (how many reserve ids to scan). */
  aaveV4?: { maxReserveId?: number }
}

/**
 * Discovers every market across every venue `addresses.lendingAdapters` actually has deployed.
 * Venues run concurrently; a venue absent from `addresses` (not yet deployed on this chain) is
 * skipped rather than erroring.
 */
export async function discoverAllMarkets(
  client: PublicClient,
  chainId: number,
  addresses: MarginAddresses,
  opts?: DiscoverAllMarketsOptions
): Promise<DiscoveredMarket[]> {
  const filter: MarketDiscoveryFilter = { collateralToken: opts?.collateralToken, debtToken: opts?.debtToken }
  const tasks: Promise<DiscoveredMarket[]>[] = []

  if (addresses.lendingAdapters.morphoBlue) {
    tasks.push(discoverMorphoMarkets(chainId, { ...filter, ...opts?.morpho }))
  }
  if (addresses.lendingAdapters.aaveV3) {
    tasks.push(discoverAaveV3Markets(client, addresses.lendingAdapters.aaveV3, filter))
  }
  if (addresses.lendingAdapters.aaveV4) {
    tasks.push(discoverAaveV4Markets(client, addresses.lendingAdapters.aaveV4, filter, opts?.aaveV4))
  }
  if (addresses.lendingAdapters.compoundV3) {
    tasks.push(discoverCompoundV3Markets(client, addresses.lendingAdapters.compoundV3, filter))
  }

  const results = await Promise.all(tasks)
  return results.flat()
}
