// ---------------------------------------------------------------------------
// Fixtures the CLI's own tests share.
//
// WHY A MODULE AND NOT A COPY PER FILE. The two index builders below were
// written twice — `cache.test.ts`'s one-pool `warmIndex` and
// `poolList.test.ts`'s four-pool `sourceIndex`, the first a strict PREFIX of
// the second, down to the same pool address, the same `createdAtBlock` and the
// same first coverage range. Two copies of one fixture is two things to keep in
// step, and the pair had already drifted in the only way that matters: nothing
// said the prefix relationship was deliberate, so a change to either was a
// silent change to what the other file was testing. Stated once, it is a fact
// the reader can see — a cache holds ONE scope's worth of what a publisher's
// index holds, which is exactly the relationship `--pool-list` exists to
// exploit.
//
// It sits in `cli/` rather than under a test file because two test files import
// it; `src/internal/testing.ts` is the same idea one level down, and this file
// borrows its `emptyReport` rather than restating a `SearchReport`.
// ---------------------------------------------------------------------------

import type { Address } from 'viem'

import { PoolIndex, v2PoolRef, v3PoolRef, type PoolIndexSnapshot } from '../src/experimental/index'
import { manifestFor } from '../src/index'

import { buildEnvelope, curate, serializeEnvelope } from './poolList'

export const MAINNET = manifestFor(1)

export const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address
export const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
export const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F' as Address
export const LONGTAIL = '0x1111111111111111111111111111111111111111' as Address

export const POOL_WETH_USDC = '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc' as Address
const POOL_WETH_DAI = '0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11' as Address
export const POOL_WETH_LONGTAIL = '0xcccccccccccccccccccccccccccccccccccccccc' as Address
export const POOL_USDC_DAI = '0xdddddddddddddddddddddddddddddddddddddddd' as Address

/** The block a warm index's coverage reaches. */
const WARM_TO_BLOCK = 21_000_000n

/**
 * What a {@link warmIndex} still has to scan when a search asks for `10_000_835..21_000_100`: the
 * blocks past its coverage, plus the standing 32-block reorg overlap re-scanned behind them
 * (`21_000_000 - 32 + 1`).
 *
 * ONE SPELLING OF IT, because it is the whole point of both the cache and a trusted pool list —
 * `cache.test.ts` asserts a restored snapshot produces it and `poolList.test.ts` asserts an ADOPTED
 * coverage claim produces the same thing, which is only a meaningful pair if the two are literally
 * the same range rather than two literals that happen to agree today.
 */
export const WARM_DELTA = [{ fromBlock: 20_999_969n, toBlock: WARM_TO_BLOCK + 100n }]

/** An index with one pool and a covered range — the smallest thing worth caching. */
export function warmIndex(): PoolIndex {
  const index = new PoolIndex(WETH)
  index.upsert({ pool: v2PoolRef(POOL_WETH_USDC, USDC, WETH), source: 'event', createdAtBlock: 10_008_355n })
  index.addCoverage('v2', WETH, { fromBlock: 10_000_835n, toBlock: WARM_TO_BLOCK })
  return index
}

/**
 * The publisher's-eye view: {@link warmIndex} plus three more pools across three more scopes, one of
 * which (the long-tail adjacency) is exactly the kind of one-off scan curation is supposed to drop.
 */
export function sourceIndex(): PoolIndex {
  const index = warmIndex()
  index.upsert({ pool: v3PoolRef(POOL_WETH_DAI, DAI, WETH, 3000), source: 'event', createdAtBlock: 12_400_000n })
  index.upsert({ pool: v2PoolRef(POOL_WETH_LONGTAIL, LONGTAIL, WETH), source: 'event', createdAtBlock: 15_000_000n })
  index.upsert({ pool: v2PoolRef(POOL_USDC_DAI, USDC, DAI), source: 'event', createdAtBlock: 11_000_000n })
  // Adjacency coverage for a second core intermediate, plus a pair scope, plus a long-tail scope.
  index.addCoverage('v3', WETH, { fromBlock: 12_369_621n, toBlock: WARM_TO_BLOCK })
  index.addCoverage('v2', USDC, { fromBlock: 10_000_835n, toBlock: 20_900_000n })
  index.addCoverage('v2', index.pairScope(USDC, DAI), { fromBlock: 10_000_835n, toBlock: WARM_TO_BLOCK })
  index.addCoverage('v2', LONGTAIL, { fromBlock: 15_000_000n, toBlock: WARM_TO_BLOCK })
  // The fee-discovery scan's own scope: keyed by FACTORY, not by a token endpoint, and holding no
  // pools at all (a factory is never one of a pool's currencies).
  index.addCoverage('v3', MAINNET.v3!.factory, { fromBlock: 12_369_621n, toBlock: WARM_TO_BLOCK })
  index.addEnabledFees('v3', MAINNET.v3!.factory, [100, 500, 3000, 10_000])
  return index
}

/** {@link sourceIndex}, curated for publication against the mainnet manifest. */
export function curatedList(): { body: PoolIndexSnapshot; claimed: string[] } {
  const { body, stats } = curate(sourceIndex().toSnapshot(), {
    coreIntermediates: MAINNET.coreIntermediates ?? [],
    factories: [MAINNET.v2!.factory, MAINNET.v3!.factory, MAINNET.v4!.poolManager],
    wrappedNative: MAINNET.wrappedNative,
    topPairs: 25,
  })
  return { body, claimed: stats.claimedScopes }
}

/** A published mainnet pool list, exactly as a consumer receives it: four pools, `asOfBlock`
 * 20,900,000 (v2:USDC is the least current scope). */
export function publishedListText(): string {
  return serializeEnvelope(buildEnvelope({ chainId: 1, manifest: MAINNET, body: curatedList().body }))
}
