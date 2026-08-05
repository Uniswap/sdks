import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'

import { DEFAULT_REORG_OVERLAP_BLOCKS, HINT_DISCREDIT_FAILURE_BLOCKS, NEGATIVE_CACHE_BLOCKS } from '../constants'
import { v2Ref, v4Ref } from '../internal/testing'
import type { PoolRecord, PoolRef } from '../types'

import { isDiscredited, PoolIndex } from './poolIndex'

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
