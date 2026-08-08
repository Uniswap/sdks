import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { Address } from 'viem'

import { PoolIndex, serializeSnapshot, v2PoolRef, v3PoolRef, type PoolIndexSnapshot } from '../src/experimental/index'
import { manifestFor } from '../src/index'

import {
  applyPoolList,
  asOfBlockOf,
  assertPoolsCoverageInseparable,
  buildEnvelope,
  curate,
  fingerprintOf,
  hydratePoolList,
  parsePoolList,
  PoolListError,
  poolInScope,
  serializeEnvelope,
  splitCoverageKey,
  stripEndpointSpecific,
  verifyPoolList,
  type PoolListEnvelope,
} from './poolList'

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F' as Address
const LONGTAIL = '0x1111111111111111111111111111111111111111' as Address

const POOL_WETH_USDC = '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc' as Address
const POOL_WETH_DAI = '0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11' as Address
const POOL_WETH_LONGTAIL = '0xcccccccccccccccccccccccccccccccccccccccc' as Address
const POOL_USDC_DAI = '0xdddddddddddddddddddddddddddddddddddddddd' as Address

const MAINNET = manifestFor(1)

/**
 * The publisher's-eye view: an index holding four pools across three scopes, one of which (the
 * long-tail adjacency) is exactly the kind of one-off scan curation is supposed to drop.
 */
function sourceIndex(): PoolIndex {
  const index = new PoolIndex(WETH)
  index.upsert({ pool: v2PoolRef(POOL_WETH_USDC, USDC, WETH), source: 'event', createdAtBlock: 10_008_355n })
  index.upsert({ pool: v3PoolRef(POOL_WETH_DAI, DAI, WETH, 3000), source: 'event', createdAtBlock: 12_400_000n })
  index.upsert({ pool: v2PoolRef(POOL_WETH_LONGTAIL, LONGTAIL, WETH), source: 'event', createdAtBlock: 15_000_000n })
  index.upsert({ pool: v2PoolRef(POOL_USDC_DAI, USDC, DAI), source: 'event', createdAtBlock: 11_000_000n })
  // Adjacency coverage for two core intermediates, plus a pair scope, plus a long-tail scope.
  index.addCoverage('v2', WETH, { fromBlock: 10_000_835n, toBlock: 21_000_000n })
  index.addCoverage('v3', WETH, { fromBlock: 12_369_621n, toBlock: 21_000_000n })
  index.addCoverage('v2', USDC, { fromBlock: 10_000_835n, toBlock: 20_900_000n })
  index.addCoverage('v2', index.pairScope(USDC, DAI), { fromBlock: 10_000_835n, toBlock: 21_000_000n })
  index.addCoverage('v2', LONGTAIL, { fromBlock: 15_000_000n, toBlock: 21_000_000n })
  // The fee-discovery scan's own scope: keyed by FACTORY, not by a token endpoint, and holding no
  // pools at all (a factory is never one of a pool's currencies).
  index.addCoverage('v3', MAINNET.v3!.factory, { fromBlock: 12_369_621n, toBlock: 21_000_000n })
  index.addEnabledFees('v3', MAINNET.v3!.factory, [100, 500, 3000, 10_000])
  return index
}

function curated(): { body: PoolIndexSnapshot; claimed: string[] } {
  const { body, stats } = curate(sourceIndex().toSnapshot(), {
    coreIntermediates: MAINNET.coreIntermediates ?? [],
    factories: [MAINNET.v2!.factory, MAINNET.v3!.factory, MAINNET.v4!.poolManager],
    wrappedNative: MAINNET.wrappedNative,
    topPairs: 25,
  })
  return { body, claimed: stats.claimedScopes }
}

function publishedText(): string {
  return serializeEnvelope(buildEnvelope({ chainId: 1, manifest: MAINNET, body: curated().body }))
}

describe('coverage scope keys', () => {
  it('splits `${protocol}:${scope}` and rejects anything no protocol owns', () => {
    expect(splitCoverageKey('v3:0xabc')).toEqual({ protocol: 'v3', scope: '0xabc' })
    expect(splitCoverageKey('v2:pair:0xa-0xb')).toEqual({ protocol: 'v2', scope: 'pair:0xa-0xb' })
    expect(splitCoverageKey('v9:0xabc')).toBeUndefined()
    expect(splitCoverageKey('nocolon')).toBeUndefined()
  })

  it('distinguishes adjacency membership from the strictly narrower pair membership', () => {
    const rec = { pool: v2PoolRef(POOL_WETH_USDC, USDC, WETH), source: 'event' as const }
    expect(poolInScope(rec, { protocol: 'v2', scope: WETH.toLowerCase() }, WETH)).toBe(true)
    expect(poolInScope(rec, { protocol: 'v2', scope: USDC.toLowerCase() }, WETH)).toBe(true)
    expect(poolInScope(rec, { protocol: 'v2', scope: DAI.toLowerCase() }, WETH)).toBe(false)
    // A v2 pool is not evidence about v3's factory logs, so a v3 scope never contains it.
    expect(poolInScope(rec, { protocol: 'v3', scope: WETH.toLowerCase() }, WETH)).toBe(false)
    const [n0, n1] = [USDC.toLowerCase(), WETH.toLowerCase()].sort()
    expect(poolInScope(rec, { protocol: 'v2', scope: `pair:${n0}-${n1}` }, WETH)).toBe(true)
    expect(poolInScope(rec, { protocol: 'v2', scope: `pair:${DAI.toLowerCase()}-${WETH.toLowerCase()}` }, WETH)).toBe(false)
  })
})

describe('curation', () => {
  it('claims the core-intermediate adjacency scopes and drops the long-tail one, pools and all', () => {
    const { body, stats } = curate(sourceIndex().toSnapshot(), {
      coreIntermediates: [WETH, USDC],
      factories: [],
      wrappedNative: WETH,
      topPairs: 25,
    })
    expect(stats.claimedScopes.sort()).toEqual(
      [`v2:${WETH.toLowerCase()}`, `v3:${WETH.toLowerCase()}`, `v2:${USDC.toLowerCase()}`, `v2:pair:${[USDC.toLowerCase(), DAI.toLowerCase()].sort().join('-')}`].sort(),
    )
    // The long-tail adjacency scope is gone — but its pool SURVIVES, because it is also a WETH pool
    // and the WETH adjacency scope is claimed. Dropping it would break inseparability.
    expect(stats.claimedScopes.some((k) => k.includes(LONGTAIL.toLowerCase()))).toBe(false)
    expect(body.pools.map((r) => r.pool.id)).toContain(`v2:${POOL_WETH_LONGTAIL.toLowerCase()}`)
  })

  it('drops pools that no claimed scope contains', () => {
    // Claim only v3 WETH: the three v2 pools are outside every claimed scope and must not ship.
    const { body, stats } = curate(sourceIndex().toSnapshot(), {
      coreIntermediates: [WETH],
      factories: [],
      wrappedNative: WETH,
      topPairs: 0,
    })
    expect(stats.claimedScopes).toContain(`v3:${WETH.toLowerCase()}`)
    expect(stats.claimedScopes).not.toContain(`v2:pair:${[USDC.toLowerCase(), DAI.toLowerCase()].sort().join('-')}`)
    // USDC-DAI holds no WETH, so no claimed scope contains it.
    expect(body.pools.map((r) => r.pool.id)).not.toContain(`v2:${POOL_USDC_DAI.toLowerCase()}`)
    expect(stats.droppedPools).toBe(1)
  })

  it('satisfies --max-pools by dropping whole scopes, never by truncating one', () => {
    const source = sourceIndex().toSnapshot()
    const { body, stats } = curate(source, {
      coreIntermediates: [WETH, USDC],
      factories: [],
      wrappedNative: WETH,
      topPairs: 25,
      maxPools: 2,
    })
    expect(stats.scopesDroppedForSize.length).toBeGreaterThan(0)
    expect(body.pools.length).toBeLessThanOrEqual(2)
    // Whatever survived is still inseparable — the whole point of dropping scopes rather than pools.
    assertPoolsCoverageInseparable({
      source,
      claimedKeys: stats.claimedScopes,
      keptPoolIds: new Set(body.pools.map((r) => r.pool.id)),
      wrappedNative: WETH,
    })
  })

  it('strips endpoint-specific fields and downgrades hint provenance', () => {
    const index = new PoolIndex(WETH)
    index.upsert({
      pool: v2PoolRef(POOL_WETH_USDC, USDC, WETH),
      source: 'hint',
      createdAtBlock: 10_008_355n,
      lastQuoteSuccessBlock: 20_000_000n,
      quoteFailureBlocks: 5,
      lastQuoteFailureBlock: 20_000_001n,
    })
    index.addCoverage('v2', WETH, { fromBlock: 1n, toBlock: 100n })
    const { body, stats } = curate(index.toSnapshot(), { coreIntermediates: [WETH], factories: [], wrappedNative: WETH, topPairs: 0 })

    expect(stats.hintsDowngraded).toBe(1)
    const [rec] = body.pools
    // 'hint' is the TOP of SOURCE_PRIORITY — a foreign caller's private assertion must never enter a
    // stranger's ranking ahead of pools their own chain reads proved.
    expect(rec!.source).toBe('factory')
    expect(rec!.createdAtBlock).toBe(10_008_355n) // a chain fact, keeps travelling
    expect(rec!.lastQuoteSuccessBlock).toBeUndefined()
    expect(rec!.quoteFailureBlocks).toBeUndefined()
    expect(rec!.lastQuoteFailureBlock).toBeUndefined()
  })

  it("claims the fee-discovery FACTORY scope, whose pool set is empty by construction", () => {
    // Without this the consumer re-runs a full-history sweep of the factory's own FeeAmountEnabled
    // logs to rediscover the tiers the list already handed it.
    const { body, claimed } = curated()
    expect(claimed).toContain(`v3:${MAINNET.v3!.factory.toLowerCase()}`)
    expect(body.enabledFees).toEqual([[`v3:${MAINNET.v3!.factory.toLowerCase()}`, [100, 500, 3000, 10_000]]])
  })

  it('never publishes the endpoint-specific learnedScanWidth', () => {
    const index = sourceIndex()
    index.scanWidth().learnedScanWidth = 100_000n
    const { body } = curate(index.toSnapshot(), { coreIntermediates: [WETH], factories: [], wrappedNative: WETH, topPairs: 0 })
    expect(body.learnedScanWidth).toBeUndefined()
  })

  it('leaves stripEndpointSpecific alone for a non-hint record', () => {
    const rec = { pool: v2PoolRef(POOL_WETH_USDC, USDC, WETH), source: 'event' as const, createdAtBlock: 7n }
    expect(stripEndpointSpecific(rec)).toEqual(rec)
  })
})

describe('the pools/coverage inseparability assertion', () => {
  // The one rule a publisher can break invisibly: a coverage claim makes the consumer SKIP the scan,
  // so a scope shipped with a partial pool set is a permanent hole in that consumer's index.
  it('fires when a claimed scope is missing one of its pools', () => {
    const source = sourceIndex().toSnapshot()
    const claimed = [`v2:${WETH.toLowerCase()}`]
    const complete = new Set(source.pools.filter((r) => r.pool.protocol === 'v2').map((r) => r.pool.id))
    // Sanity: the honest set passes.
    expect(() =>
      assertPoolsCoverageInseparable({ source, claimedKeys: claimed, keptPoolIds: complete, wrappedNative: WETH }),
    ).not.toThrow()

    // Now the plausible-looking optimization: keep the "interesting" pools, keep the coverage.
    const pruned = new Set(complete)
    pruned.delete(`v2:${POOL_WETH_LONGTAIL.toLowerCase()}`)
    expect(() =>
      assertPoolsCoverageInseparable({ source, claimedKeys: claimed, keptPoolIds: pruned, wrappedNative: WETH }),
    ).toThrow(/inseparability violated/)
    expect(() =>
      assertPoolsCoverageInseparable({ source, claimedKeys: claimed, keptPoolIds: pruned, wrappedNative: WETH }),
    ).toThrow(new RegExp(POOL_WETH_LONGTAIL.toLowerCase()))
  })

  it('refuses a claim under a key no protocol owns', () => {
    expect(() =>
      assertPoolsCoverageInseparable({
        source: sourceIndex().toSnapshot(),
        claimedKeys: ['v9:0xabc'],
        keptPoolIds: new Set(),
        wrappedNative: WETH,
      }),
    ).toThrow(/no known protocol/)
  })
})

describe('the envelope', () => {
  it('round-trips: the body re-serializes to exactly the bytes the integrity hash covers', () => {
    const { body } = curated()
    const env = buildEnvelope({ chainId: 1, manifest: MAINNET, body })
    const parsed = parsePoolList(serializeEnvelope(env))
    expect(parsed.envelope.integrity).toBe(env.integrity)
    expect(parsed.body.pools.map((r) => r.pool.id)).toEqual(body.pools.map((r) => r.pool.id))
    // The bigints really came back as bigints, not as `"$bigint:…"` strings or decimal strings.
    expect(typeof parsed.body.reorgOverlapBlocks).toBe('bigint')
    expect(typeof parsed.body.pools[0]!.createdAtBlock).toBe('bigint')
    expect(typeof parsed.body.coverage[0]![1][0]!.fromBlock).toBe('bigint')
  })

  it('pretty-prints the header a human reads and keeps the body compact', () => {
    const text = publishedText()
    const header = text.slice(0, text.indexOf('"body"'))
    expect(header).toContain('\n  "chainId": 1,')
    expect(header).toContain('\n  "manifestFingerprint": {')
    // The body — the hundreds of megabytes nobody reads — carries no indentation at all.
    expect(text.slice(text.indexOf('"body"'))).not.toContain('\n  ')
    // …and it is still ordinary JSON on the way back in.
    expect(parsePoolList(text).body.pools.length).toBe(4)
  })

  it('reports asOfBlock as the LEAST current claim, not the most', () => {
    // v2:USDC only reaches 20.9M while everything else reaches 21M — the list is only as current as
    // the scope a consumer would be most surprised to find behind.
    const { body } = curated()
    expect(asOfBlockOf(body.coverage)).toBe(20_900_000n)
    expect(buildEnvelope({ chainId: 1, manifest: MAINNET, body }).asOfBlock).toBe('20900000')
    expect(asOfBlockOf([])).toBe(0n)
  })

  it('fingerprints the factories and deployment blocks, and nothing else about the manifest', () => {
    const fp = fingerprintOf(MAINNET)
    expect(fp.v2).toEqual({ factory: MAINNET.v2!.factory.toLowerCase(), deploymentBlock: MAINNET.v2!.deploymentBlock.toString() })
    expect(fp.v4).toEqual({
      poolManager: MAINNET.v4!.poolManager.toLowerCase(),
      deploymentBlock: MAINNET.v4!.deploymentBlock.toString(),
    })
    // A quote-only manifest with no v2 bundle simply has no v2 arm to compare.
    expect(fingerprintOf({ chainId: 99, wrappedNative: WETH }).v2).toBeUndefined()
  })
})

describe('verification failures', () => {
  function tamper(mutate: (env: PoolListEnvelope) => void): string {
    const env = buildEnvelope({ chainId: 1, manifest: MAINNET, body: curated().body })
    mutate(env)
    return serializeEnvelope(env)
  }

  it('rejects a corrupted body (integrity)', () => {
    const text = tamper((env) => {
      ;(env.body as { pools: unknown[] }).pools.pop()
    })
    expect(() => parsePoolList(text)).toThrow(/integrity check FAILED/)
  })

  it('rejects a tampered integrity field just the same', () => {
    expect(() => parsePoolList(tamper((env) => (env.integrity = 'deadbeef')))).toThrow(/integrity check FAILED/)
  })

  it('rejects an unknown envelope schemaVersion before hashing anything', () => {
    expect(() => parsePoolList(tamper((env) => (env.schemaVersion = 99)))).toThrow(/schemaVersion 99/)
  })

  it('rejects a malformed body even when the hash agrees', () => {
    // Re-hashed after poisoning, so integrity passes and the SDK's own shape gate is what has to fire.
    const body = curated().body
    const poisoned = { ...body, coverage: [['v2:0xabc', [{ fromBlock: 'abc', toBlock: 1n }]]] } as unknown as PoolIndexSnapshot
    const env = buildEnvelope({ chainId: 1, manifest: MAINNET, body: poisoned })
    expect(() => parsePoolList(serializeEnvelope(env))).toThrow(/body is malformed/)
  })

  it('rejects a list built for another chain', () => {
    const { envelope, body } = parsePoolList(publishedText())
    expect(() => verifyPoolList(envelope, body, { chainId: 8453, manifest: manifestFor(8453) })).toThrow(
      /built for chain 1, but this run resolved chain 8453/,
    )
  })

  it('rejects a list whose factory fingerprint disagrees with the manifest', () => {
    const { envelope, body } = parsePoolList(publishedText())
    envelope.manifestFingerprint.v3 = { factory: '0x' + '11'.repeat(20), deploymentBlock: '1' }
    expect(() => verifyPoolList(envelope, body, { chainId: 1, manifest: MAINNET })).toThrow(/v3 manifestFingerprint/)
  })

  it('rejects a list whose deployment block disagrees, even with the right factory', () => {
    const { envelope, body } = parsePoolList(publishedText())
    envelope.manifestFingerprint.v2 = { factory: MAINNET.v2!.factory.toLowerCase(), deploymentBlock: '0' }
    expect(() => verifyPoolList(envelope, body, { chainId: 1, manifest: MAINNET })).toThrow(/v2 manifestFingerprint/)
  })

  it('rejects an envelope edited to disagree with its own (hash-covered) body', () => {
    const { envelope, body } = parsePoolList(publishedText())
    envelope.wrappedNative = USDC.toLowerCase()
    expect(() => verifyPoolList(envelope, body, { chainId: 1, manifest: MAINNET })).toThrow(/wrappedNative disagrees with its body/)

    const second = parsePoolList(publishedText())
    second.envelope.reorgOverlapBlocks = '999'
    expect(() => verifyPoolList(second.envelope, second.body, { chainId: 1, manifest: MAINNET })).toThrow(
      /reorgOverlapBlocks disagrees with its body/,
    )
  })

  it('accepts an honest list', () => {
    const { envelope, body } = parsePoolList(publishedText())
    expect(() => verifyPoolList(envelope, body, { chainId: 1, manifest: MAINNET })).not.toThrow()
  })
})

describe('hydration and trust tiers', () => {
  it('imports pools and DISCARDS coverage by default (Tier B)', () => {
    const { body } = parsePoolList(publishedText())
    const index = new PoolIndex(WETH)
    const summary = hydratePoolList(index, body, { trustCoverage: false })

    expect(summary.added).toBe(body.pools.length)
    expect(summary.coverageAdopted).toBe(false)
    expect(index.pair(USDC, WETH).length).toBe(1)
    // No coverage means the consumer still scans the whole history — which is the point: a Tier B
    // list can only make the consumer find MORE than it knew, never less.
    expect(index.stats().coverageScopes).toBe(0)
    expect(index.uncovered('v2', WETH, 10_000_835n, 21_000_000n)).toEqual([{ fromBlock: 10_000_835n, toBlock: 21_000_000n }])
    expect(index.enabledFees('v3', MAINNET.v3!.factory)).toEqual([])
  })

  it('adopts coverage and enabled fees under --trust-coverage (Tier A)', () => {
    const { body } = parsePoolList(publishedText())
    const index = new PoolIndex(WETH)
    const summary = hydratePoolList(index, body, { trustCoverage: true })

    expect(summary.coverageAdopted).toBe(true)
    expect(summary.scopes).toBe(body.coverage.length)
    // Now the same query collapses to the delta plus the standing reorg overlap.
    expect(index.uncovered('v2', WETH, 10_000_835n, 21_000_100n)).toEqual([{ fromBlock: 20_999_969n, toBlock: 21_000_100n }])
    expect(index.enabledFees('v3', MAINNET.v3!.factory)).toEqual([100, 500, 3000, 10_000])
  })

  it('merges with an existing (cache-restored) index rather than replacing it', () => {
    const { body } = parsePoolList(publishedText())
    // A cache that already knows a pool the list does not, and one the list also has.
    const index = new PoolIndex(WETH)
    index.upsert({ pool: v2PoolRef(POOL_USDC_DAI, USDC, DAI), source: 'event', createdAtBlock: 11_000_000n })
    index.upsert({ pool: v2PoolRef(POOL_WETH_USDC, USDC, WETH), source: 'event', createdAtBlock: 10_008_355n })
    index.addCoverage('v2', DAI, { fromBlock: 1n, toBlock: 500n })

    const summary = hydratePoolList(index, body, { trustCoverage: true })

    // Neither of the two pools the cache already held was duplicated, and the list's other two
    // arrived: `added` counts growth, `offered` counts what the list carried.
    expect(summary.offered).toBe(4)
    expect(summary.added).toBe(2)
    expect(index.stats().pools).toBe(4)
    expect(index.pair(USDC, DAI).length).toBe(1)
    // Coverage is a UNION: the cache's DAI scope survives the list's adoption untouched.
    expect(index.uncovered('v2', DAI, 1n, 500n)).toEqual([{ fromBlock: 469n, toBlock: 500n }])
    expect(index.stats().coverageScopes).toBe(body.coverage.length + 1)
  })

  it('never lets a list demote a pool the cache holds at stronger provenance', () => {
    // `upsert` resolves provenance by SOURCE_PRIORITY, not by arrival order, so a list arriving
    // second cannot overwrite what the consumer's own chain reads established.
    const { body } = parsePoolList(publishedText())
    const index = new PoolIndex(WETH)
    index.upsert({ pool: v2PoolRef(POOL_WETH_USDC, USDC, WETH), source: 'event', createdAtBlock: 10_008_355n })
    hydratePoolList(index, body, { trustCoverage: false })
    expect(index.pair(USDC, WETH)[0]!.source).toBe('event')
  })
})

describe('applyPoolList (the CLI path)', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rl-poollist-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  async function write(name: string, text: string): Promise<string> {
    const path = join(dir, name)
    await writeFile(path, text, 'utf8')
    return path
  }

  it('loads, hydrates, and reports what it did — naming the trust decision', async () => {
    const path = await write('1.poollist.json', publishedText())
    const index = new PoolIndex(WETH)
    const line = await applyPoolList(index, path, { chainId: 1, manifest: MAINNET, trustCoverage: false })
    expect(line).toMatch(/^pool-list: 4 pools \(4 new\)/)
    expect(line).toMatch(/coverage scopes discarded \(pass --trust-coverage to adopt\)/)
    expect(line).toMatch(/as of block 20900000/)
  })

  it('says ADOPTED when coverage is trusted', async () => {
    const path = await write('1.poollist.json', publishedText())
    const line = await applyPoolList(new PoolIndex(WETH), path, { chainId: 1, manifest: MAINNET, trustCoverage: true })
    expect(line).toMatch(/coverage scopes ADOPTED \(--trust-coverage\)/)
  })

  it('throws PoolListError (never a bare crash) for a missing file', async () => {
    await expect(
      applyPoolList(new PoolIndex(WETH), join(dir, 'nope.json'), { chainId: 1, manifest: MAINNET, trustCoverage: false }),
    ).rejects.toBeInstanceOf(PoolListError)
  })

  it('refuses plaintext http', async () => {
    await expect(
      applyPoolList(new PoolIndex(WETH), 'http://example.com/1.poollist.json', {
        chainId: 1,
        manifest: MAINNET,
        trustCoverage: false,
      }),
    ).rejects.toThrow(/refusing to fetch a pool list over plaintext http/)
  })

  it('fails a corrupted list before hydrating anything', async () => {
    const text = publishedText().replace('"pools"', '"poolz"')
    const path = await write('1.poollist.json', text)
    const index = new PoolIndex(WETH)
    await expect(applyPoolList(index, path, { chainId: 1, manifest: MAINNET, trustCoverage: false })).rejects.toThrow(
      /integrity check FAILED/,
    )
    expect(index.stats().pools).toBe(0)
  })

  it('fails a wrong-chain list before hydrating anything', async () => {
    const path = await write('1.poollist.json', publishedText())
    const index = new PoolIndex(WETH)
    await expect(
      applyPoolList(index, path, { chainId: 8453, manifest: manifestFor(8453), trustCoverage: false }),
    ).rejects.toThrow(/built for chain 1/)
    expect(index.stats().pools).toBe(0)
  })

  it('rejects a file that is not a pool list at all', async () => {
    // A raw snapshot (what `cli/cache.ts` writes) is not a pool list: no envelope, no integrity.
    const path = await write('raw.json', serializeSnapshot(sourceIndex().toSnapshot()))
    await expect(applyPoolList(new PoolIndex(WETH), path, { chainId: 1, manifest: MAINNET, trustCoverage: false })).rejects.toThrow(
      /schemaVersion/,
    )
  })
})
