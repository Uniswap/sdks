import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'

import { DEFAULT_REORG_OVERLAP_BLOCKS, HINT_DISCREDIT_FAILURE_BLOCKS, MIN_CHUNK, NEGATIVE_CACHE_BLOCKS } from '../constants'
import { RouterConfigError } from '../errors'
import { v2Ref, v4Ref } from '../internal/testing'
import type { PoolRecord, PoolRef } from '../types'

import { isDiscredited, parseSnapshot, PoolIndex, POOL_INDEX_SCHEMA_VERSION, serializeSnapshot } from './poolIndex'
import type { PoolIndexSnapshot } from './poolIndex'

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address
const A = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address
const B = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as Address
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address

const rec = (addr: string, created?: bigint): PoolRecord => ({
  pool: v2Ref(addr as Address, A, B),
  createdAtBlock: created,
  source: 'event',
})

describe('PoolIndex', () => {
  test('upsert dedupes and merges metadata', () => {
    const idx = new PoolIndex(WETH)
    idx.upsert(rec('0xP1', 5n))
    idx.upsert(rec('0xP1', undefined))
    expect(idx.pair(A, B)).toHaveLength(1)
    expect(idx.pair(A, B)[0]!.createdAtBlock).toBe(5n)
  })

  test('native family collapses in neighbor keys', () => {
    const idx = new PoolIndex(WETH)
    idx.upsert({ pool: v2Ref('0xP2' as Address, A, WETH), source: 'event' })
    expect(idx.neighbors('native').get(A.toLowerCase())).toHaveLength(1)
  })

  test('coverage merges and uncovered subtracts with reorg overlap', () => {
    const idx = new PoolIndex(WETH)
    idx.addCoverage('v4', A, { fromBlock: 100n, toBlock: 200n })
    idx.addCoverage('v4', A, { fromBlock: 201n, toBlock: 300n })
    const un = idx.uncovered('v4', A, 0n, 400n)
    expect(un).toEqual([
      { fromBlock: 0n, toBlock: 99n },
      { fromBlock: 269n, toBlock: 400n },
    ]) // 300-32+1 re-opened
  })

  test('enabled fees accumulate per factory, deduped and sorted', () => {
    const idx = new PoolIndex(WETH)
    expect(idx.enabledFees('v3', A)).toEqual([])
    idx.addEnabledFees('v3', A, [3000, 250])
    idx.addEnabledFees('v3', A, [250, 100])
    expect(idx.enabledFees('v3', A)).toEqual([100, 250, 3000])
    // Keyed by factory *and* protocol — another factory's tiers are not this one's.
    expect(idx.enabledFees('v3', B)).toEqual([])
    expect(idx.enabledFees('v2', A)).toEqual([])
  })

  test('negative cache is block-scoped', () => {
    const idx = new PoolIndex(WETH)
    const ref = rec('0xP3').pool
    idx.markNegative(ref, 10n)
    expect(idx.isNegative(ref, 10n)).toBe(true)
    expect(idx.isNegative(ref, 11n)).toBe(false)
  })

  // -------------------------------------------------------------------------
  // C4-H3: the negative cache must actually be bounded, not merely keyed by block.
  // -------------------------------------------------------------------------

  test('negative cache evicts entries older than NEGATIVE_CACHE_BLOCKS on every mark', () => {
    const idx = new PoolIndex(WETH)
    const ref = rec('0xP6').pool

    idx.markNegative(ref, 100n)
    idx.markNegative(ref, 101n)
    idx.markNegative(ref, 102n)
    expect(idx.isNegative(ref, 100n)).toBe(true)
    expect(idx.stats().negativeCacheBlocks).toBe(3)

    // Marking block 103 evicts anything older than 103 - NEGATIVE_CACHE_BLOCKS = 101, i.e. block 100.
    idx.markNegative(ref, 103n)
    expect(idx.isNegative(ref, 100n)).toBe(false) // evicted — gone, not merely stale
    expect(idx.isNegative(ref, 101n)).toBe(true)
    expect(idx.isNegative(ref, 102n)).toBe(true)
    expect(idx.isNegative(ref, 103n)).toBe(true)
    expect(idx.stats().negativeCacheBlocks).toBe(Number(NEGATIVE_CACHE_BLOCKS) + 1)
  })

  test('negative cache memory does not grow monotonically across many blocks', () => {
    const idx = new PoolIndex(WETH)
    const ref = rec('0xP7').pool

    for (let b = 0n; b < 1000n; b++) idx.markNegative(ref, b)

    // Only the trailing NEGATIVE_CACHE_BLOCKS + 1 blocks are ever retained, however many blocks were
    // ever marked — this is the assertion that would have caught the un-evicted map growing forever.
    expect(idx.stats().negativeCacheBlocks).toBeLessThanOrEqual(Number(NEGATIVE_CACHE_BLOCKS) + 1)
    expect(idx.isNegative(ref, 999n)).toBe(true)
    expect(idx.isNegative(ref, 0n)).toBe(false) // long evicted
  })

  // -------------------------------------------------------------------------
  // C4-H4: a hint is an unverifiable assertion, so its top-rank provenance is
  // provisional — the chain gets to contradict it.
  // -------------------------------------------------------------------------

  describe('hint discrediting', () => {
    const hintRec = (addr: string): PoolRecord => ({ ...rec(addr), source: 'hint' })

    test('takes failures at HINT_DISCREDIT_FAILURE_BLOCKS distinct blocks — repeats within one block count once', () => {
      const idx = new PoolIndex(WETH)
      const hinted = hintRec('0xH1')
      idx.upsert(hinted)
      expect(isDiscredited(idx.pair(A, B)[0]!)).toBe(false)

      // Concurrent requests at the same head, or a later wave re-quoting, must not stack up as
      // independent evidence — otherwise one block's failure discredits a legitimate hint.
      idx.markNegative(hinted.pool, 100n)
      idx.markNegative(hinted.pool, 100n)
      idx.markNegative(hinted.pool, 100n)
      expect(idx.pair(A, B)[0]!.quoteFailureBlocks).toBe(1)
      expect(isDiscredited(idx.pair(A, B)[0]!)).toBe(false)

      idx.markNegative(hinted.pool, 101n)
      expect(idx.pair(A, B)[0]!.quoteFailureBlocks).toBe(HINT_DISCREDIT_FAILURE_BLOCKS)
      expect(isDiscredited(idx.pair(A, B)[0]!)).toBe(true)
    })

    test('re-sending the same hint does not launder the failure history', () => {
      const idx = new PoolIndex(WETH)
      const hinted = hintRec('0xH2')
      idx.upsert(hinted)
      idx.markNegative(hinted.pool, 100n)
      idx.markNegative(hinted.pool, 101n)
      expect(isDiscredited(idx.pair(A, B)[0]!)).toBe(true)

      // The one move a hostile caller gets for free. It must not reset anything.
      idx.upsert(hinted)
      idx.upsert(hinted)
      expect(idx.pair(A, B)[0]!.source).toBe('hint')
      expect(isDiscredited(idx.pair(A, B)[0]!)).toBe(true)
    })

    test('an event-sourced upsert (a creation log) clears the failure history; a factory-sourced one does not', () => {
      const idx = new PoolIndex(WETH)
      const hinted = hintRec('0xH5')
      idx.upsert(hinted)
      idx.markNegative(hinted.pool, 100n)
      idx.markNegative(hinted.pool, 101n)
      expect(isDiscredited(idx.pair(A, B)[0]!)).toBe(true)

      // A quote probe that merely responded is not proof the *asserted* pool exists — 'factory'
      // provenance is the weakest there is, and letting it clear the counters would hand a hostile
      // caller a free reset via any pool on the pair.
      idx.upsert({ ...rec('0xH5'), source: 'factory' })
      expect(isDiscredited(idx.pair(A, B)[0]!)).toBe(true)

      // A creation log is proof, and it answers exactly the question the counter stood in for.
      idx.upsert({ ...rec('0xH5'), createdAtBlock: 50n })
      const restored = idx.pair(A, B)[0]!
      expect(restored.quoteFailureBlocks).toBe(0)
      expect(restored.lastQuoteFailureBlock).toBeUndefined()
      expect(restored.source).toBe('hint') // top-tier provenance kept, not downgraded to 'event'
      expect(isDiscredited(restored)).toBe(false)
    })

    test('one successful quote restores it, and a discredited pool is never a non-hint source', () => {
      const idx = new PoolIndex(WETH)
      const hinted = hintRec('0xH3')
      idx.upsert(hinted)
      idx.markNegative(hinted.pool, 100n)
      idx.markNegative(hinted.pool, 101n)
      expect(isDiscredited(idx.pair(A, B)[0]!)).toBe(true)

      // A hint may legitimately name a pool that only starts working later (pre-launch, unfunded,
      // a hook that opens at a set block) — so the demotion is reversible, on the first success.
      idx.markSuccess(hinted.pool, 102n)
      expect(isDiscredited(idx.pair(A, B)[0]!)).toBe(false)

      // Event/factory records accumulate the same counters, but are never discredited by them:
      // their provenance was proved, not asserted, so there is nothing provisional to withdraw.
      const proved = new PoolIndex(WETH)
      proved.upsert(rec('0xH4'))
      proved.markNegative(rec('0xH4').pool, 100n)
      proved.markNegative(rec('0xH4').pool, 101n)
      expect(proved.pair(A, B)[0]!.quoteFailureBlocks).toBe(2)
      expect(isDiscredited(proved.pair(A, B)[0]!)).toBe(false)
    })
  })

  test('v4 native pool (currency0 = address(0)) links to the native graph node, not a phantom zero-address node', () => {
    const idx = new PoolIndex(WETH)
    const v4NativePool: PoolRef = v4Ref({ currency0: zeroAddress, currency1: USDC, fee: 500, tickSpacing: 10, hooks: zeroAddress })
    idx.upsert({ pool: v4NativePool, source: 'event' })

    // (a) reachable via the 'native' CurrencyRef
    const viaNative = idx.pair('native', USDC)
    expect(viaNative).toHaveLength(1)
    expect(viaNative[0]!.pool).toEqual(v4NativePool)

    // (b) reachable via the wrapped-native address too (family collapse)
    const viaWrapped = idx.pair(WETH, USDC)
    expect(viaWrapped).toHaveLength(1)
    expect(viaWrapped[0]!.pool).toEqual(v4NativePool)

    // (c) neighbors('native') surfaces USDC
    const nativeNeighbors = idx.neighbors('native')
    expect(nativeNeighbors.get(USDC.toLowerCase())).toHaveLength(1)
    expect(nativeNeighbors.get(USDC.toLowerCase())![0]!.pool).toEqual(v4NativePool)

    // (d) neighbors(USDC) is keyed by the wrapped-native graph node, not the zero address
    const usdcNeighbors = idx.neighbors(USDC)
    expect(usdcNeighbors.has(WETH.toLowerCase())).toBe(true)
    expect(usdcNeighbors.has(zeroAddress.toLowerCase())).toBe(false)
  })

  test('upsert never downgrades a hint, but does upgrade factory -> event', () => {
    // hint beats a later factory probe and a later event log alike.
    const hinted = new PoolIndex(WETH)
    hinted.upsert({ ...rec('0xP4'), source: 'hint' })
    hinted.upsert({ ...rec('0xP4'), source: 'event' })
    expect(hinted.pair(A, B)[0]!.source).toBe('hint')
    hinted.upsert({ ...rec('0xP4'), source: 'factory' })
    expect(hinted.pair(A, B)[0]!.source).toBe('hint')

    // an on-chain event log is stronger provenance than a mere quote probe.
    const probed = new PoolIndex(WETH)
    probed.upsert({ ...rec('0xP5'), source: 'factory' })
    probed.upsert({ ...rec('0xP5'), source: 'event' })
    expect(probed.pair(A, B)[0]!.source).toBe('event')
  })

  // C4-T1 redundancy pass: an independent angle on the SOURCE_PRIORITY comparison from the test
  // above, which only ever starts from 'hint' or 'factory'. This starts from 'event' instead — the
  // one baseline the test above never protects — and upserts a later 'factory' record over it. The
  // comparison is `rank(incoming) < rank(existing)`, so this is the direction that would silently
  // pass even if a mutant flipped the two operands (both cases above happen to still hold under that
  // particular flip; this one does not).
  test('upsert never downgrades an event-sourced pool to a later factory probe (SOURCE_PRIORITY, independent baseline)', () => {
    const idx = new PoolIndex(WETH)
    idx.upsert({ ...rec('0xP8'), source: 'event' })
    idx.upsert({ ...rec('0xP8'), source: 'factory' })
    expect(idx.pair(A, B)[0]!.source).toBe('event')
  })

  test('coverage algebra: covered ∪ uncovered = [deploy, head], disjoint, overlap re-opened', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.bigInt(0n, 1000n), fc.bigInt(0n, 1000n)), { maxLength: 20 }), (pairs) => {
        const idx = new PoolIndex(WETH)
        for (const [a, b] of pairs) if (a <= b) idx.addCoverage('v4', A, { fromBlock: a, toBlock: b })
        const un = idx.uncovered('v4', A, 0n, 1000n)
        // disjoint + sorted
        for (let i = 1; i < un.length; i++) if (un[i]!.fromBlock <= un[i - 1]!.toBlock) return false
        // every block ≥ head - DEFAULT_REORG_OVERLAP_BLOCKS must be uncovered (overlap re-scan)
        if (pairs.length > 0 && !un.some((r) => r.toBlock === 1000n)) return false
        return true
      }),
    )
  })

  // -------------------------------------------------------------------------
  // C4-P1: the reorg overlap is a per-chain fact, injected at construction.
  // -------------------------------------------------------------------------

  describe('reorgOverlapBlocks', () => {
    test('defaults to the mainnet 32 when the constructor is not told otherwise', () => {
      expect(new PoolIndex(WETH).reorgOverlapBlocks).toBe(DEFAULT_REORG_OVERLAP_BLOCKS)
      expect(DEFAULT_REORG_OVERLAP_BLOCKS).toBe(32n)
    })

    test('uncovered re-opens exactly the injected overlap, not the mainnet default', () => {
      // Fully covered [0, 1000]: the ONLY thing left uncovered is the standing tip re-scan, so its
      // width is a direct read of the overlap the index was built with.
      const deep = new PoolIndex(WETH, { reorgOverlapBlocks: 600n }) // an L2-shaped unsafe-head rewind
      deep.addCoverage('v4', A, { fromBlock: 0n, toBlock: 1000n })
      expect(deep.uncovered('v4', A, 0n, 1000n)).toEqual([{ fromBlock: 401n, toBlock: 1000n }])

      const shallow = new PoolIndex(WETH) // mainnet default: 32
      shallow.addCoverage('v4', A, { fromBlock: 0n, toBlock: 1000n })
      expect(shallow.uncovered('v4', A, 0n, 1000n)).toEqual([{ fromBlock: 969n, toBlock: 1000n }])
    })

    test('a zero overlap re-opens nothing at all — fully covered means fully covered', () => {
      const idx = new PoolIndex(WETH, { reorgOverlapBlocks: 0n })
      idx.addCoverage('v4', A, { fromBlock: 0n, toBlock: 1000n })
      expect(idx.uncovered('v4', A, 0n, 1000n)).toEqual([])
    })

    test('the re-open is clamped to deployBlock — a deep overlap never reaches before the deployment', () => {
      const idx = new PoolIndex(WETH, { reorgOverlapBlocks: 10_000n })
      idx.addCoverage('v4', A, { fromBlock: 500n, toBlock: 1000n })
      expect(idx.uncovered('v4', A, 500n, 1000n)).toEqual([{ fromBlock: 500n, toBlock: 1000n }])
    })
  })

  // -------------------------------------------------------------------------
  // C4-H5: PoolIndex lifecycle — `stats()` and bounded mode (`maxPools`).
  // -------------------------------------------------------------------------

  describe('stats()', () => {
    test('counts pools, adjacency edges, coverage scopes, negative-cache blocks, and fee factories accurately', () => {
      const idx = new PoolIndex(WETH)
      expect(idx.stats()).toEqual({ pools: 0, adjacencyEdges: 0, coverageScopes: 0, negativeCacheBlocks: 0, enabledFeeFactories: 0 })

      idx.upsert(rec('0xS1', 10n)) // A<->B
      idx.upsert(rec('0xS2', 10n)) // a second pool on the same A<->B pair — one more pool, no new edges
      idx.upsert({ pool: v2Ref('0xS3' as Address, A, USDC), source: 'event', createdAtBlock: 10n }) // A<->USDC

      idx.addCoverage('v2', A, { fromBlock: 0n, toBlock: 100n })
      idx.addCoverage('v2', B, { fromBlock: 0n, toBlock: 100n })
      idx.addEnabledFees('v3', A, [500])

      idx.markNegative(rec('0xS1').pool, 200n)
      idx.markNegative(rec('0xS1').pool, 201n)

      const s = idx.stats()
      expect(s.pools).toBe(3)
      // A<->B (2 directed edges, shared by S1 and S2) + A<->USDC (2 directed edges) = 4 — edges are
      // counted per distinct (node, neighbor) relationship, never per pool sitting on that relationship.
      expect(s.adjacencyEdges).toBe(4)
      expect(s.coverageScopes).toBe(2)
      expect(s.negativeCacheBlocks).toBe(2)
      expect(s.enabledFeeFactories).toBe(1)
    })
  })

  describe('maxPools (bounded mode)', () => {
    test('unbounded by default: no maxPools means no eviction, however many pools are upserted', () => {
      const idx = new PoolIndex(WETH)
      for (let i = 0; i < 50; i++) {
        idx.upsert({
          pool: v2Ref(`0x${i.toString(16).padStart(40, '0')}` as Address, A, B),
          source: 'event',
          createdAtBlock: BigInt(i),
        })
      }
      expect(idx.stats().pools).toBe(50)
    })

    test('exceeding the cap evicts the least-recently-touched pool; adjacency/pair lookups leave no dangling entry', () => {
      const idx = new PoolIndex(WETH, { maxPools: 2 })
      const p1 = v2Ref('0xE1' as Address, A, B)
      const p2 = v2Ref('0xE2' as Address, A, USDC)
      const p3 = v2Ref('0xE3' as Address, B, USDC)

      idx.upsert({ pool: p1, source: 'event', createdAtBlock: 10n })
      idx.upsert({ pool: p2, source: 'event', createdAtBlock: 11n })
      expect(idx.stats().pools).toBe(2)

      // p3 arrives later (block 12) and pushes the index over cap: p1, touched at block 10, is the
      // oldest and is evicted — p2 (11) and p3 (12, this block) both survive.
      idx.upsert({ pool: p3, source: 'event', createdAtBlock: 12n })

      expect(idx.stats().pools).toBe(2)
      expect(idx.pair(A, B)).toEqual([]) // p1 is gone...
      expect(idx.pair(A, USDC)).toHaveLength(1) // ...p2 survives...
      expect(idx.pair(B, USDC)).toHaveLength(1) // ...and p3 made it in.

      // No dangling adjacency: the A<->B edge p1 owned is gone from BOTH directions, not just one.
      expect(idx.neighbors(A).has(B.toLowerCase())).toBe(false)
      expect(idx.neighbors(B).has(A.toLowerCase())).toBe(false)
      expect(idx.neighbors(A).has(USDC.toLowerCase())).toBe(true)
      expect(idx.neighbors(B).has(USDC.toLowerCase())).toBe(true)
    })

    test('never evicts a pool touched at the block the triggering upsert itself named, even left over cap', () => {
      const idx = new PoolIndex(WETH, { maxPools: 1 })
      const p1 = v2Ref('0xE4' as Address, A, B)
      const p2 = v2Ref('0xE5' as Address, A, USDC)

      idx.upsert({ pool: p1, source: 'event', createdAtBlock: 500n })
      // p2 arrives at the SAME block p1 was touched at: p1 is protected (current-block), eviction has
      // nothing safe left to evict, and leaves the index one over cap rather than break that rule.
      idx.upsert({ pool: p2, source: 'event', createdAtBlock: 500n })

      expect(idx.stats().pools).toBe(2)
      expect(idx.pair(A, B)).toHaveLength(1)
      expect(idx.pair(A, USDC)).toHaveLength(1)
    })

    test('a pool touched more recently via markSuccess survives an untouched hint with the same cap', () => {
      const idx = new PoolIndex(WETH, { maxPools: 2 })
      const hinted = { pool: v2Ref('0xE6' as Address, A, B), source: 'hint' as const } // no block info: never touched
      const proved = { pool: v2Ref('0xE7' as Address, A, USDC), source: 'event' as const, createdAtBlock: 100n }
      idx.upsert(hinted)
      idx.upsert(proved)
      idx.markSuccess(proved.pool, 300n) // touches `proved` at block 300

      const third = { pool: v2Ref('0xE8' as Address, B, USDC), source: 'event' as const, createdAtBlock: 300n }
      idx.upsert(third) // arrives at block 300 too, over cap: both `proved` and `third` are now protected

      // The untouched hint — never quoted, no block information at all — is the first eviction
      // candidate under the "never touched sorts oldest" rule, ahead of a pool merely touched earlier.
      expect(idx.pair(A, B)).toEqual([])
      expect(idx.pair(A, USDC)).toHaveLength(1)
      expect(idx.pair(B, USDC)).toHaveLength(1)
    })

    // -------------------------------------------------------------------------
    // Reviewer follow-up to C4-H5: a discredited hint's accumulated failure history is the valuable,
    // hard-won part of an otherwise-tiny record — eviction must not throw it away just because it
    // happens to have the oldest touch, when a non-discredited pool is available to evict instead.
    // -------------------------------------------------------------------------

    test('a discredited hint is the LAST eviction candidate: an ordinary pool with a fresher touch is evicted first', () => {
      const idx = new PoolIndex(WETH, { maxPools: 2 })

      // D: a hint, discredited via two distinct-block failures (the ordinary C4-H4 path) — its
      // failure history is exactly the evidence that took two real searches to accumulate. Its last
      // touch (via `markNegative`) is block 101, the OLDEST touch of anything in this test.
      const discreditedHint = v2Ref('0xD1' as Address, A, B)
      idx.upsert({ pool: discreditedHint, source: 'hint' })
      idx.markNegative(discreditedHint, 100n)
      idx.markNegative(discreditedHint, 101n)
      expect(isDiscredited(idx.pair(A, B)[0]!)).toBe(true)

      // E: an ordinary, non-discredited pool, touched at block 200 — newer than D's 101, so under
      // the plain "evict the lowest touch" rule alone D would be the victim.
      const ordinary = v2Ref('0xE9' as Address, A, USDC)
      idx.upsert({ pool: ordinary, source: 'event', createdAtBlock: 200n })
      expect(idx.stats().pools).toBe(2) // at cap, nothing evicted yet

      // F arrives at block 300, pushing the index over cap. F protects itself (touched THIS block);
      // between D (discredited, touch 101) and E (ordinary, touch 200), E — not D — is evicted:
      // a discredited hint is reached for only when nothing else is eligible.
      const fresh = v2Ref('0xF1' as Address, B, USDC)
      idx.upsert({ pool: fresh, source: 'event', createdAtBlock: 300n })

      expect(idx.stats().pools).toBe(2)
      expect(idx.pair(A, B)).toHaveLength(1) // the discredited hint survived...
      expect(isDiscredited(idx.pair(A, B)[0]!)).toBe(true) // ...with its failure history intact
      expect(idx.pair(A, USDC)).toEqual([]) // ...the ordinary pool was evicted instead...
      expect(idx.pair(B, USDC)).toHaveLength(1) // ...and the new arrival is in.
    })

    test('a discredited hint IS evicted once it is the only eligible candidate left', () => {
      const idx = new PoolIndex(WETH, { maxPools: 1 })

      const discreditedHint = v2Ref('0xD2' as Address, A, B)
      idx.upsert({ pool: discreditedHint, source: 'hint' })
      idx.markNegative(discreditedHint, 100n)
      idx.markNegative(discreditedHint, 101n)
      expect(isDiscredited(idx.pair(A, B)[0]!)).toBe(true)

      // The only other pool in the index arrives much later — nothing protects the discredited hint
      // (it is not touched at the current block, and it is the only eligible candidate), so it is
      // evicted despite being the "last resort": a last resort is still reachable, not unevictable.
      const fresh = v2Ref('0xF2' as Address, A, USDC)
      idx.upsert({ pool: fresh, source: 'event', createdAtBlock: 999n })

      expect(idx.stats().pools).toBe(1)
      expect(idx.pair(A, B)).toEqual([])
      expect(idx.pair(A, USDC)).toHaveLength(1)
    })
  })
})

// ---------------------------------------------------------------------------
// P2: snapshots — the index outliving its process.
//
// The contract these pin is BEHAVIORAL, not structural: a restored index must
// answer every question the original one would have, which is what actually
// makes a second CLI invocation warm. Comparing internal maps would pass while
// (say) adjacency was rebuilt against the wrong graph node, and would fail on
// harmless representation changes; comparing ANSWERS cannot do either.
//
// The negative cache is the one thing deliberately absent, and its two halves
// have to part company here: the block-scoped mark evaporates (it would be
// evicted on first use anyway), while the durable failure counters that
// `isDiscredited` reads have to survive, or a process restart would launder
// every hint the chain has already contradicted.
// ---------------------------------------------------------------------------

describe('PoolIndexSnapshot', () => {
  /** The universe the property below draws from: small enough that collisions and merges happen. */
  const NODES: Address[] = [A, B, USDC, WETH]

  /** Applies `ops` to a fresh index — the arbitrary state generator's interpreter. */
  function build(ops: SnapshotOp[]): PoolIndex {
    const idx = new PoolIndex(WETH, { reorgOverlapBlocks: 16n })
    for (const op of ops) {
      if (op.kind === 'pool') {
        idx.upsert({
          pool: v2Ref(`0x${op.n.toString(16).padStart(40, '0')}` as Address, NODES[op.a]!, NODES[op.b]!),
          source: op.source,
          createdAtBlock: BigInt(op.block),
        })
      } else if (op.kind === 'v4') {
        idx.upsert({
          // Lowercased: a PoolKey is ABI-encoded to derive the poolId, and viem rejects a
          // non-checksummed mixed-case address there. (The graph nodes are lowercase anyway.)
          pool: v4Ref({
            currency0: zeroAddress,
            currency1: NODES[op.a]!.toLowerCase() as Address,
            fee: op.n,
            tickSpacing: 60,
            hooks: zeroAddress,
          }),
          source: 'event',
          createdAtBlock: BigInt(op.block),
        })
      } else if (op.kind === 'coverage') {
        idx.addCoverage(op.protocol, NODES[op.a]!, { fromBlock: BigInt(op.block), toBlock: BigInt(op.block + op.n) })
      } else {
        idx.addEnabledFees('v3', NODES[op.a]!, [op.n])
      }
    }
    return idx
  }

  type SnapshotOp =
    | { kind: 'pool'; a: number; b: number; n: number; block: number; source: PoolRecord['source'] }
    | { kind: 'v4'; a: number; n: number; block: number }
    | { kind: 'coverage'; protocol: 'v2' | 'v3' | 'v4'; a: number; n: number; block: number }
    | { kind: 'fees'; a: number; n: number }

  const nodeIndex = fc.integer({ min: 0, max: NODES.length - 1 })
  const opArb: fc.Arbitrary<SnapshotOp> = fc.oneof(
    fc.record({
      kind: fc.constant('pool' as const),
      a: nodeIndex,
      b: nodeIndex,
      n: fc.integer({ min: 1, max: 40 }),
      block: fc.integer({ min: 0, max: 5_000 }),
      source: fc.constantFrom<PoolRecord['source']>('event', 'factory', 'hint'),
    }),
    fc.record({ kind: fc.constant('v4' as const), a: nodeIndex, n: fc.integer({ min: 100, max: 10_000 }), block: fc.integer({ min: 0, max: 5_000 }) }),
    fc.record({
      kind: fc.constant('coverage' as const),
      protocol: fc.constantFrom('v2' as const, 'v3' as const, 'v4' as const),
      a: nodeIndex,
      n: fc.integer({ min: 0, max: 800 }),
      block: fc.integer({ min: 0, max: 5_000 }),
    }),
    fc.record({ kind: fc.constant('fees' as const), a: nodeIndex, n: fc.integer({ min: 100, max: 10_000 }) }),
  )

  /** Every answer the index can give, as a comparable value — the actual definition of "identical". */
  function answers(idx: PoolIndex): unknown {
    const pairs: unknown[] = []
    for (const a of [...NODES, 'native' as const]) {
      for (const b of [...NODES, 'native' as const]) pairs.push([a, b, idx.pair(a, b).map((r) => r.pool.id).sort()])
    }
    const neighborhoods: unknown[] = []
    for (const a of [...NODES, 'native' as const]) {
      neighborhoods.push([a, [...idx.neighbors(a)].map(([n, recs]) => [n, recs.map((r) => r.pool.id).sort()]).sort()])
    }
    const uncovered: unknown[] = []
    for (const p of ['v2', 'v3', 'v4'] as const) {
      for (const a of NODES) uncovered.push([p, a, idx.uncovered(p, a, 0n, 6_000n)])
      for (const a of NODES) uncovered.push([`${p}:pair`, a, idx.uncovered(p, idx.pairScope(a, WETH), 0n, 6_000n)])
    }
    const fees = NODES.map((a) => [a, idx.enabledFees('v3', a)])
    // Records themselves, so provenance/merge/discredit state is compared too, not just topology.
    const records = [...idx.neighbors(A).values(), ...idx.neighbors(B).values(), ...idx.neighbors(USDC).values()]
      .flat()
      .map((r) => JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
      .sort()
    return { pairs, neighborhoods, uncovered, fees, records, stats: idx.stats() }
  }

  test('round-trips through JSON: a restored index answers identically to the one it came from', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 40 }), (ops) => {
        const original = build(ops)
        const restored = PoolIndex.fromSnapshot(parseSnapshot(serializeSnapshot(original.toSnapshot())))

        expect(restored.wrappedNative).toBe(original.wrappedNative)
        expect(restored.reorgOverlapBlocks).toBe(original.reorgOverlapBlocks)
        expect(answers(restored)).toEqual(answers(original))
      }),
      { numRuns: 60 },
    )
  })

  test('the bigint round trip survives JSON, which cannot represent one at all', () => {
    const idx = new PoolIndex(WETH)
    idx.upsert({ pool: v2Ref('0xP9' as Address, A, B), source: 'event', createdAtBlock: 21_000_000n })
    idx.addCoverage('v3', A, { fromBlock: 12_369_621n, toBlock: 21_000_000n })

    // The naive alternative fails loudly, which is exactly why the pair exists — a caller who reaches
    // for JSON.stringify directly cannot silently ship a broken cache, they get this.
    expect(() => JSON.stringify(idx.toSnapshot())).toThrow(TypeError)

    const restored = PoolIndex.fromSnapshot(parseSnapshot(serializeSnapshot(idx.toSnapshot())))
    const rec = restored.pair(A, B)[0]!
    expect(rec.createdAtBlock).toBe(21_000_000n) // a bigint, not the string "21000000"
    expect(typeof rec.createdAtBlock).toBe('bigint')
    expect(restored.uncovered('v3', A, 12_369_621n, 21_000_000n)).toEqual([
      { fromBlock: 20_999_969n, toBlock: 21_000_000n }, // only the reorg overlap, i.e. the cache WORKS
    ])
  })

  test('the coverage cache is the payload: a restored index re-scans the delta, not the history', () => {
    const idx = new PoolIndex(WETH, { reorgOverlapBlocks: 32n })
    idx.addCoverage('v3', A, { fromBlock: 0n, toBlock: 1_000n })
    const restored = PoolIndex.fromSnapshot(parseSnapshot(serializeSnapshot(idx.toSnapshot())))

    // Same head: nothing but the standing reorg overlap. This is the whole reason a snapshot exists.
    expect(restored.uncovered('v3', A, 0n, 1_000n)).toEqual([{ fromBlock: 969n, toBlock: 1_000n }])
    // Moved head: the delta plus the overlap, and NOT the 969 blocks already scanned.
    expect(restored.uncovered('v3', A, 0n, 1_500n)).toEqual([{ fromBlock: 969n, toBlock: 1_500n }])
  })

  test('the block-scoped negative mark does NOT survive, but the durable discredit evidence does', () => {
    const idx = new PoolIndex(WETH)
    const hint = v2Ref('0xH1' as Address, A, B)
    idx.upsert({ pool: hint, source: 'hint' })
    idx.markNegative(hint, 100n)
    idx.markNegative(hint, 101n)
    expect(idx.isNegative(hint, 101n)).toBe(true)
    expect(isDiscredited(idx.pair(A, B)[0]!)).toBe(true)

    const restored = PoolIndex.fromSnapshot(parseSnapshot(serializeSnapshot(idx.toSnapshot())))

    // Gone, and rightly: "could not quote at block 101" says nothing about any block a later process
    // will ask about, and `markNegative` would have evicted it within NEGATIVE_CACHE_BLOCKS anyway.
    expect(restored.isNegative(hint, 101n)).toBe(false)
    expect(restored.stats().negativeCacheBlocks).toBe(0)
    // Kept, and rightly: this is accumulated evidence about the pool, not about a block. Losing it
    // would hand a caller who resubmits the same junk hint its full, un-discredited rank right back.
    expect(isDiscredited(restored.pair(A, B)[0]!)).toBe(true)
    expect(restored.pair(A, B)[0]!.quoteFailureBlocks).toBe(2)
  })

  // -------------------------------------------------------------------------
  // F2: a snapshot that PARSES but is structurally wrong.
  //
  // The dangerous band is not truncated JSON (JSON.parse catches that) or a
  // bumped schemaVersion (checked below) — it is a payload that loads perfectly
  // happily and then detonates deep inside the engine, mid-search, in a stack
  // that names nothing about caches. A coverage bound that came back as the
  // string 'abc' is the canonical one: `fromSnapshot` used to accept it, and
  // `uncovered`'s bigint comparisons threw on the next search.
  //
  // Every case below is one that ESCAPED the old checks — schemaVersion alone.
  // Each must fail at the door, as a RouterConfigError the caller can turn into
  // "discard and start fresh", never as a TypeError from three layers down.
  // -------------------------------------------------------------------------

  describe('malformed payloads are refused at the door, not mid-search', () => {
    const valid = (): PoolIndexSnapshot => {
      const idx = new PoolIndex(WETH)
      idx.upsert({ pool: v2Ref('0xM1' as Address, A, B), source: 'event', createdAtBlock: 7n })
      idx.addCoverage('v3', A, { fromBlock: 1n, toBlock: 100n })
      idx.addEnabledFees('v3', A, [500])
      return idx.toSnapshot()
    }

    /** A well-formed v4 key, so the v4 cases below differ from a legitimate ref in exactly one field.
     * Lowercased: `computeV4PoolId` hashes real addresses, and `A`/`B` are not checksum-valid. */
    const V4_KEY = { currency0: A.toLowerCase() as Address, currency1: B.toLowerCase() as Address, fee: 3000, tickSpacing: 60, hooks: zeroAddress }

    /** `valid()` with its single pool replaced by a v4 ref patched by `patch` (`replace` drops the base ref's fields). */
    const withV4Pool = (s: PoolIndexSnapshot, patch: Record<string, unknown>, replace = false): unknown => ({
      ...s,
      pools: [{ ...s.pools[0]!, pool: replace ? patch : { ...v4Ref(V4_KEY), ...patch } }],
    })

    const cases: [string, () => unknown][] = [
      // The one that motivated all of this: loads clean, throws inside `uncovered`.
      ['a coverage bound that is a string', () => ({ ...valid(), coverage: [['v3:x', [{ fromBlock: 'abc', toBlock: 9n }]]] })],
      ['a coverage bound that is a number', () => ({ ...valid(), coverage: [['v3:x', [{ fromBlock: 0n, toBlock: 9 }]]] })],
      ['a coverage range that is not an object', () => ({ ...valid(), coverage: [['v3:x', ['nope']]] })],
      ['a coverage key that is not a string', () => ({ ...valid(), coverage: [[7, []]] })],
      ['coverage that is not an array', () => ({ ...valid(), coverage: { 'v3:x': [] } })],
      // `wrappedNative` is `.toLowerCase()`d by `cli/cache.ts`'s manifest cross-check — this is the
      // exact payload that used to escape as an uncaught TypeError and an exit-4 stack trace.
      ['wrappedNative that is not a string', () => ({ ...valid(), wrappedNative: 12345 })],
      ['wrappedNative that is missing', () => { const s = valid() as Record<string, unknown>; delete s.wrappedNative; return s }],
      // Subtracted from a block number on every `uncovered` call.
      ['reorgOverlapBlocks that is a string', () => ({ ...valid(), reorgOverlapBlocks: '32' })],
      // `id` is the primary map key; `currencies` is destructured into both adjacency links.
      ['a pool ref with a non-string id', () => { const s = valid(); return { ...s, pools: [{ ...s.pools[0]!, pool: { ...s.pools[0]!.pool, id: 42 } }] } }],
      ['a pool ref with one currency', () => { const s = valid(); return { ...s, pools: [{ ...s.pools[0]!, pool: { ...s.pools[0]!.pool, currencies: [A] } }] } }],
      ['a pool record that is not an object', () => ({ ...valid(), pools: ['nope'] })],
      ['a createdAtBlock that is a string', () => { const s = valid(); return { ...s, pools: [{ ...s.pools[0]!, createdAtBlock: '7' }] } }],
      ['pools that is not an array', () => ({ ...valid(), pools: {} })],
      ['an enabledFees tier that is not a number', () => ({ ...valid(), enabledFees: [['v3:x', ['500']]] })],
      // Same class as `reorgOverlapBlocks`: `minBig`/`maxBig`d with block counts on the first
      // request of every scan, so a string here poisons the scanner rather than the coverage cache.
      ['a learnedScanWidth that is a string', () => ({ ...valid(), learnedScanWidth: '10000' })],
      ['a learnedScanWidth that is a number', () => ({ ...valid(), learnedScanWidth: 10000 })],
      // Zero or negative would make `chunkSize` non-positive, which inverts the chunk arithmetic and
      // burns the whole per-scan request budget on a range that can never be asked for (the same
      // failure `createRouter` rejects `logChunkBlocks < MIN_CHUNK` for).
      ['a learnedScanWidth of zero', () => ({ ...valid(), learnedScanWidth: 0n })],
      ['a negative learnedScanWidth', () => ({ ...valid(), learnedScanWidth: -1n })],
      // AND MERELY POSITIVE IS NOT ENOUGH. `learnedScanWidth` becomes the next scan's FIRST WINDOW,
      // and `MIN_CHUNK` is the narrowest window that scanner will ever ask for — so a positive value
      // beneath it names no window the machine can use. It does not fail loudly either: the endpoint
      // happily serves a 32-block request, so nothing ever refuses, nothing halves, nothing is given
      // up, and the scan spends its whole `MAX_REQUESTS_PER_SCAN` budget walking a multi-million-
      // block range 32 blocks at a time. Every scan, for the life of the router.
      ['a learnedScanWidth just below MIN_CHUNK', () => ({ ...valid(), learnedScanWidth: MIN_CHUNK - 1n })],
      ['a learnedScanWidth of 32 (the width a reorg re-scan used to record)', () => ({ ...valid(), learnedScanWidth: 32n })],
      // --- the DISCRIMINANT, and the per-arm identity fields it promises -------------------
      // `protocol` is what every consumer switches on before touching an arm-specific field, and
      // nothing checked it: `{ protocol: 'v4' }` with no `poolKey` loads clean and then detonates
      // as a TypeError in `quote/rank.ts#isComplex` (via `isHooked`, which reads
      // `ref.poolKey.hooks`) or as a viem `InvalidAddressError` in `plan/compile.ts`'s
      // recipient-vs-pool check — both mid-search, both outside `cli/cache.ts`'s try.
      ['a pool ref with no protocol', () => { const s = valid(); const { protocol: _p, ...rest } = s.pools[0]!.pool; return { ...s, pools: [{ ...s.pools[0]!, pool: rest }] } }],
      ['a pool ref with a non-string protocol', () => { const s = valid(); return { ...s, pools: [{ ...s.pools[0]!, pool: { ...s.pools[0]!.pool, protocol: 4 } }] } }],
      ['a pool ref with a protocol nothing implements', () => { const s = valid(); return { ...s, pools: [{ ...s.pools[0]!, pool: { ...s.pools[0]!.pool, protocol: 'v5' } }] } }],
      // v4: `poolKey` is read by `isHooked` (ranking), `protocols/v4.ts#toPathKeys` (quoting) and
      // `encode/ur20.ts#encodeV4PathKeys` (calldata) — `hooks` through `isAddressEqual`, which
      // THROWS on a non-address, and `fee`/`tickSpacing` straight into ABI encoding.
      ['a v4 ref with no poolKey', () => { const { poolKey: _k, ...rest } = v4Ref(V4_KEY); return withV4Pool(valid(), rest, true) }],
      ['a v4 ref whose poolKey is not an object', () => withV4Pool(valid(), { poolKey: 'nope' })],
      ['a v4 ref whose poolKey.hooks is not a string', () => withV4Pool(valid(), { poolKey: { ...V4_KEY, hooks: 0 } })],
      ['a v4 ref whose poolKey.currency0 is not a string', () => withV4Pool(valid(), { poolKey: { ...V4_KEY, currency0: null } })],
      ['a v4 ref whose poolKey.currency1 is not a string', () => withV4Pool(valid(), { poolKey: { ...V4_KEY, currency1: 7 } })],
      ['a v4 ref whose poolKey.fee is not a number', () => withV4Pool(valid(), { poolKey: { ...V4_KEY, fee: '3000' } })],
      ['a v4 ref whose poolKey.tickSpacing is not a number', () => withV4Pool(valid(), { poolKey: { ...V4_KEY, tickSpacing: null } })],
      // v2/v3: `address` reaches `isAddressEqual` in `plan/compile.ts`'s recipient check and becomes
      // the `to` of every reserves/quote `eth_call`.
      ['a v2 ref with no address', () => { const s = valid(); const { address: _a, ...rest } = s.pools[0]!.pool as Record<string, unknown>; return { ...s, pools: [{ ...s.pools[0]!, pool: rest }] } }],
      ['a v2 ref whose address is not a string', () => { const s = valid(); return { ...s, pools: [{ ...s.pools[0]!, pool: { ...s.pools[0]!.pool, address: 42 } }] } }],
      ['a v3 ref whose address is not a string', () => { const s = valid(); return { ...s, pools: [{ ...s.pools[0]!, pool: { ...s.pools[0]!.pool, protocol: 'v3', address: null } }] } }],
    ]

    for (const [what, build] of cases) {
      test(`refuses ${what}`, () => {
        expect(() => PoolIndex.fromSnapshot(build() as PoolIndexSnapshot)).toThrow(RouterConfigError)
        expect(() => PoolIndex.fromSnapshot(build() as PoolIndexSnapshot)).toThrow(/malformed/)
      })
    }

    test('the poisoned-coverage payload used to load clean and throw LATER — now it cannot load at all', () => {
      // The regression in full: this is the shape that made it all the way into a live index.
      const poisoned = { ...valid(), coverage: [['v3:x', [{ fromBlock: 'abc', toBlock: 9n }]]] } as unknown as PoolIndexSnapshot
      expect(() => PoolIndex.fromSnapshot(poisoned)).toThrow(RouterConfigError)

      // ...and a legitimate snapshot with the same fields still round-trips, so the check is a filter
      // and not a wall.
      const good = PoolIndex.fromSnapshot(parseSnapshot(serializeSnapshot(valid())))
      expect(good.uncovered('v3', A, 1n, 100n)).toEqual([{ fromBlock: 69n, toBlock: 100n }])
    })

    test('a v4-claiming ref with no poolKey used to load clean and detonate in RANKING — now it cannot load at all', () => {
      // The discriminant's own version of the poisoned-coverage regression, and the reason
      // `protocol` has to be checked alongside the arm it selects. `comparePoolPriority`
      // (`quote/rank.ts`) calls `isHooked`, which reads `ref.poolKey.hooks` the instant
      // `protocol === 'v4'` — so this payload restores into a perfectly ordinary-looking index and
      // then throws a bare TypeError from the middle of candidate enumeration, in a stack that
      // names nothing about caches and outside `cli/cache.ts`'s try.
      const { poolKey: _k, ...noKey } = v4Ref(V4_KEY)
      const poisoned = withV4Pool(valid(), noKey, true) as PoolIndexSnapshot
      expect(() => PoolIndex.fromSnapshot(poisoned)).toThrow(RouterConfigError)
      expect(() => PoolIndex.fromSnapshot(poisoned)).toThrow(/malformed/)

      // ...and a genuine v4 snapshot still round-trips, so this is a filter and not a wall.
      const idx = new PoolIndex(WETH)
      idx.upsert({ pool: v4Ref(V4_KEY), source: 'event' })
      const restored = PoolIndex.fromSnapshot(parseSnapshot(serializeSnapshot(idx.toSnapshot())))
      expect(restored.pair(A, B)).toHaveLength(1)
      expect(restored.pair(A, B)[0]!.pool).toEqual(v4Ref(V4_KEY))
    })

    test('the shape check survives the JSON round trip it exists to guard', () => {
      // A hand-edited cache file is the real threat model, so the payload must be rejected after
      // going through `parseSnapshot` exactly as a file would — not only as an in-memory literal.
      const onDisk = serializeSnapshot(valid()).replace('"$bigint:1"', '"abc"')
      expect(() => PoolIndex.fromSnapshot(parseSnapshot(onDisk))).toThrow(RouterConfigError)
    })
  })

  // -------------------------------------------------------------------------
  // The scan-width memory (see `internal/logScan.ts#ScanWidthMemory`).
  //
  // It rides in the index because it answers the same question the coverage
  // cache does from the other end — coverage is WHICH blocks a scan can skip,
  // this is HOW WIDE a request for the rest may be — and because the index is
  // already what crosses the process boundary.
  // -------------------------------------------------------------------------
  test('the width memory is handed out BY REFERENCE, so what a scan learns is what the next scan sees', () => {
    const idx = new PoolIndex(WETH)
    expect(idx.scanWidth()).toEqual({})
    idx.scanWidth().learnedScanWidth = 10_000n
    // Not a copy: a copy would make every scan's discovery invisible to the next, which is the
    // entire mechanism.
    expect(idx.scanWidth().learnedScanWidth).toBe(10_000n)
  })

  test('the learned width survives a snapshot round trip; the declared cap deliberately does NOT', () => {
    const idx = new PoolIndex(WETH)
    idx.scanWidth().learnedScanWidth = 10_000n
    idx.scanWidth().declaredScanCap = 10_000n

    const restored = PoolIndex.fromSnapshot(parseSnapshot(serializeSnapshot(idx.toSnapshot())))

    expect(restored.scanWidth().learnedScanWidth).toBe(10_000n)
    // THE ASYMMETRY IS THE POINT. A snapshot is keyed by CHAIN, so two providers on one chain share
    // it (`cli/cache.ts`). A stale HINT costs the regrowth ratchet a few doublings; a stale CEILING
    // would cap every scan the other provider ever runs, at up to 1,300x the requests, with nothing
    // anywhere saying why.
    expect(restored.scanWidth().declaredScanCap).toBeUndefined()
  })

  test('an index that never scanned anything writes no width field at all', () => {
    const snap = new PoolIndex(WETH).toSnapshot()
    expect('learnedScanWidth' in snap).toBe(false)
    expect(PoolIndex.fromSnapshot(snap).scanWidth()).toEqual({})
  })

  test('a schemaVersion mismatch is refused outright — no migration, no partial restore', () => {
    const snap = new PoolIndex(WETH).toSnapshot()
    expect(snap.schemaVersion).toBe(POOL_INDEX_SCHEMA_VERSION)

    expect(() => PoolIndex.fromSnapshot({ ...snap, schemaVersion: POOL_INDEX_SCHEMA_VERSION + 1 })).toThrow(
      RouterConfigError,
    )
    expect(() => PoolIndex.fromSnapshot({ ...snap, schemaVersion: 0 })).toThrow(
      new RegExp(`schemaVersion 0.*reads ${POOL_INDEX_SCHEMA_VERSION}`),
    )
  })

  test('a snapshot is a detached copy — the index it came from can keep changing', () => {
    const idx = new PoolIndex(WETH)
    idx.upsert({ pool: v2Ref('0xS1' as Address, A, B), source: 'event' })
    idx.addCoverage('v2', A, { fromBlock: 0n, toBlock: 10n })
    const snap = idx.toSnapshot()

    idx.upsert({ pool: v2Ref('0xS2' as Address, A, USDC), source: 'event' })
    idx.addCoverage('v2', A, { fromBlock: 11n, toBlock: 20n })

    expect(snap.pools).toHaveLength(1)
    expect(snap.coverage.find(([k]) => k === `v2:${A.toLowerCase()}`)![1]).toEqual([{ fromBlock: 0n, toBlock: 10n }])
  })

  test('fromSnapshot takes the RESTORING host maxPools — it is memory policy, not snapshot data', () => {
    const idx = new PoolIndex(WETH) // unbounded while it was built
    for (let i = 1; i <= 5; i++) {
      idx.upsert({ pool: v2Ref(`0x${i}` as Address, A, B), source: 'event', createdAtBlock: BigInt(i) })
    }
    const snap = idx.toSnapshot()
    expect(snap.pools).toHaveLength(5)
    expect('maxPools' in snap).toBe(false)

    const bounded = PoolIndex.fromSnapshot(snap, { maxPools: 2 })
    expect(bounded.stats().pools).toBe(2) // trimmed on the way in, rather than blowing past the cap
    expect(PoolIndex.fromSnapshot(snap).stats().pools).toBe(5) // and unbounded by default
  })
})
