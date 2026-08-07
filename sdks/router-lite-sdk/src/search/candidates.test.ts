import { describe, expect, test } from 'bun:test'
import fc from 'fast-check'
import type { Address, Hex } from 'viem'
import { keccak256, toHex, zeroAddress } from 'viem'

import { MAX_INTERMEDIATES, MAX_POOLS_DIRECT, MAX_POOLS_PER_LEG, MAX_QUOTE_CANDIDATES } from '../constants'
import { sameFamily } from '../internal/currency'
import { v2Ref, v3Ref, v4Ref } from '../internal/testing'
import { PoolIndex } from '../pools/poolIndex'
import type { GenerateRoutesArgs } from '../search/candidates'
import type { PoolKey, PoolRecord, PoolRef } from '../types'

import { generateRoutes, routeId } from './candidates'

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const NEW = '0x1111111111111111111111111111111111111111' as Address
const TOKEN_A = '0x2222222222222222222222222222222222222222' as Address

function sorted(a: Address, b: Address): [Address, Address] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a]
}

/** A deterministic pool address derived from every field that distinguishes one test pool from
 * another. Hashing (rather than truncating the ASCII bytes of a concatenated string, as an earlier
 * version of this helper did) mixes the whole seed into every output byte, so two pools that agree
 * on a long leading field (e.g. the same `a`) and differ only in a later one (`b`, `fee`) still get
 * distinct addresses instead of silently colliding. */
function hashAddress(seed: string): Address {
  return keccak256(toHex(seed)).slice(0, 42) as Address
}

function v2Rec(a: Address, b: Address, opts: Partial<PoolRecord> = {}): PoolRecord {
  const [token0, token1] = sorted(a, b)
  const address = hashAddress(`v2:${a}:${b}:${opts.createdAtBlock ?? ''}`)
  return { pool: v2Ref(address, token0, token1), source: 'event', ...opts }
}

function v3Rec(a: Address, b: Address, fee: number, opts: Partial<PoolRecord> = {}): PoolRecord {
  const [token0, token1] = sorted(a, b)
  const address = hashAddress(`v3:${a}:${b}:${fee}:${opts.createdAtBlock ?? ''}`)
  return { pool: v3Ref(address, token0, token1, fee), source: 'event', ...opts }
}

function v4Rec(a: Address, b: Address, opts: Partial<PoolRecord> & { hooks?: Address } = {}): PoolRecord {
  const [currency0, currency1] = sorted(a, b)
  const poolKey: PoolKey = { currency0, currency1, fee: 3000, tickSpacing: 60, hooks: opts.hooks ?? zeroAddress }
  const { hooks: _hooks, ...rest } = opts
  return { pool: v4Ref(poolKey), source: 'event', ...rest }
}

describe('generateRoutes', () => {
  test('direct + shared-neighbor two-hops, mixed protocols', () => {
    const index = new PoolIndex(WETH)
    index.upsert(v3Rec(USDC, WETH, 3000))
    index.upsert(v4Rec(NEW, WETH))
    index.upsert(v2Rec(NEW, USDC))

    const { candidates } = generateRoutes({ tokenIn: NEW, tokenOut: USDC, index, hookData: new Map(), wrappedNative: WETH })
    const ids = candidates.map(routeId)

    expect(candidates.some((c) => c.legs.length === 1 && c.legs[0]!.pool.protocol === 'v2')).toBe(true)
    expect(candidates.some((c) => c.legs.length === 2 && c.legs[0]!.pool.protocol === 'v4' && c.legs[1]!.pool.protocol === 'v3')).toBe(true)
    expect(new Set(ids).size).toBe(ids.length) // deterministic + unique
  })

  test('newest pool always survives the per-pair (direct) cap', () => {
    const index = new PoolIndex(WETH)
    // MAX_POOLS_DIRECT older pools, each with a lastQuoteSuccessBlock (outranks pure recency) —
    // plus one newer pool with neither a success block nor age going for it under ordinary
    // priority, so only the reserved newest-pool slot can save it.
    const older = Array.from({ length: MAX_POOLS_DIRECT }, (_, i) =>
      v3Rec(NEW, USDC, 500 + i, { createdAtBlock: BigInt(i + 1), lastQuoteSuccessBlock: BigInt(90 + i) }),
    )
    const newest = v4Rec(NEW, USDC, { createdAtBlock: BigInt(MAX_POOLS_DIRECT + 1) })
    for (const rec of [...older, newest]) index.upsert(rec)
    // The cap only means something if the pair actually holds more distinct pools than that.
    expect(index.pair(NEW, USDC)).toHaveLength(MAX_POOLS_DIRECT + 1)

    const args: GenerateRoutesArgs = { tokenIn: NEW, tokenOut: USDC, index, hookData: new Map(), wrappedNative: WETH }
    const { candidates } = generateRoutes(args)
    const kept = candidates.map((c) => c.legs[0]!.pool)
    expect(kept).toHaveLength(MAX_POOLS_DIRECT)
    expect(kept.some((p) => (p as any).poolId === (newest.pool as any).poolId)).toBe(true)
  })

  test('a 6th direct pool (v2 + 4 v3 tiers + v4) all get quoted on a major pair — the reconciled direct cap admits it', () => {
    // C4-P7: MAX_POOLS_DIRECT was raised from 3 to 6 specifically so a realistic major pair (one v2
    // pool, the four standard v3 fee tiers, and a v4 pool) enumerates every one of its direct pools
    // with nothing pruned — the shape this cap actually has to serve in production.
    const index = new PoolIndex(WETH)
    const v2Pool = v2Rec(NEW, USDC)
    const v3Pools = [500, 3000, 10000, 100].map((fee) => v3Rec(NEW, USDC, fee))
    const v4Pool = v4Rec(NEW, USDC)
    for (const rec of [v2Pool, ...v3Pools, v4Pool]) index.upsert(rec)
    expect(index.pair(NEW, USDC)).toHaveLength(6)

    const { candidates, pruned } = generateRoutes({ tokenIn: NEW, tokenOut: USDC, index, hookData: new Map(), wrappedNative: WETH })
    const directCandidates = candidates.filter((c) => c.legs.length === 1)
    expect(directCandidates).toHaveLength(6)
    expect(pruned.pools).toBe(0)
  })

  test('intermediate equal to an endpoint is excluded; native family counts as one node', () => {
    const index = new PoolIndex(WETH)
    // native (WETH family) <-> TOKEN_A, and WETH <-> USDC (tokenOut): WETH is a common neighbor
    // but must be excluded as an intermediate since it's the same family as tokenIn ('native').
    index.upsert(v2Rec(WETH, TOKEN_A))
    index.upsert(v3Rec(WETH, USDC, 3000))
    // A genuine two-hop path through TOKEN_A should still be produced.
    index.upsert(v2Rec(TOKEN_A, USDC))

    const { candidates } = generateRoutes({ tokenIn: 'native', tokenOut: USDC, index, hookData: new Map(), wrappedNative: WETH })
    for (const c of candidates) {
      if (c.legs.length === 2) {
        expect(sameFamily(c.legs[0]!.currencyOut, 'native', WETH)).toBe(false)
        expect(sameFamily(c.legs[0]!.currencyOut, WETH, WETH)).toBe(false)
      }
    }
    expect(candidates.some((c) => c.legs.length === 2)).toBe(true)
  })

  test('routeId is deterministic and stable across calls', () => {
    const index = new PoolIndex(WETH)
    index.upsert(v2Rec(NEW, USDC))
    index.upsert(v4Rec(NEW, WETH))
    index.upsert(v3Rec(WETH, USDC, 3000))
    const args: GenerateRoutesArgs = { tokenIn: NEW, tokenOut: USDC, index, hookData: new Map(), wrappedNative: WETH }
    const idsA = generateRoutes(args).candidates.map(routeId)
    const idsB = generateRoutes(args).candidates.map(routeId)
    expect(idsA).toEqual(idsB)
  })

  test('hookData is stamped onto v4 legs only, keyed by lowercased poolId', () => {
    const index = new PoolIndex(WETH)
    const rec = v4Rec(NEW, WETH)
    index.upsert(rec)
    index.upsert(v2Rec(NEW, USDC)) // unrelated direct pool, just to ensure no cross-contamination
    const hookData = new Map<string, Hex>([[(rec.pool as Extract<PoolRef, { protocol: 'v4' }>).poolId.toLowerCase(), '0xbeef']])
    const { candidates } = generateRoutes({ tokenIn: NEW, tokenOut: WETH, index, hookData, wrappedNative: WETH })
    const v4Candidate = candidates.find((c) => c.legs.length === 1 && c.legs[0]!.pool.protocol === 'v4')!
    expect(v4Candidate.legs[0]!.hookData).toBe('0xbeef')
    const v2Candidate = candidates.find((c) => c.legs[0]!.pool.protocol === 'v2')
    expect(v2Candidate?.legs[0]!.hookData).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // C4-H4: hint provenance is provisional. A caller can assert any well-formed
  // v4 PoolKey and (with no on-chain check available for v2/v4 hints) it enters
  // ranking ahead of every pool discovery actually proved exists. That must not
  // survive the chain repeatedly refusing to quote it.
  // -------------------------------------------------------------------------

  describe('discredited hints', () => {
    /** The direct-pool order `generateRoutes` produces for the NEW/USDC pair, by pool id. */
    function directOrder(index: PoolIndex): string[] {
      const args: GenerateRoutesArgs = { tokenIn: NEW, tokenOut: USDC, index, hookData: new Map(), wrappedNative: WETH }
      return generateRoutes(args)
        .candidates.filter((c) => c.legs.length === 1)
        .map((c) => c.legs[0]!.pool.id)
    }

    test('a junk hint that never quotes is outranked by a real event-sourced pool after two failing blocks', () => {
      const index = new PoolIndex(WETH)
      // A fabricated v4 key: `v4Module.validateHint` does no RPC at all (a poolId is just the hash
      // of the caller's own key), so this "validates" and enters at the top of the provenance order.
      const junk = v4Rec(NEW, USDC, { source: 'hint' })
      // A pool an actual `Initialize`/`PairCreated` log proved exists.
      const real = v2Rec(NEW, USDC, { createdAtBlock: 10n })
      index.upsert(junk)
      index.upsert(real)

      // As designed, and the whole point of hints: before any evidence, the caller's assertion leads.
      expect(directOrder(index)[0]).toBe(junk.pool.id)

      // One block's failure is not evidence — transient state (an unfunded brand-new pool being
      // seeded in the very next block) looks exactly like this.
      index.markNegative(junk.pool, 100n)
      expect(directOrder(index)[0]).toBe(junk.pool.id)

      // Two distinct blocks, still no lifetime success: the assertion is discredited and sinks
      // BELOW the proved pool, not merely level with it.
      index.markNegative(junk.pool, 101n)
      expect(directOrder(index)).toEqual([real.pool.id, junk.pool.id])
    })

    test('a discredited hint that later succeeds is restored to hint rank', () => {
      const index = new PoolIndex(WETH)
      const hinted = v4Rec(NEW, USDC, { source: 'hint' })
      const real = v2Rec(NEW, USDC, { createdAtBlock: 10n })
      index.upsert(hinted)
      index.upsert(real)

      index.markNegative(hinted.pool, 100n)
      index.markNegative(hinted.pool, 101n)
      expect(directOrder(index)[0]).toBe(real.pool.id)

      // The pre-launch case: the hint named a pool that only became quoteable later. Demotion is a
      // ranking penalty, never a deletion, so the pool is still enumerated and still gets quoted —
      // which is exactly how it earns its rank back.
      index.markSuccess(hinted.pool, 102n)
      expect(directOrder(index)[0]).toBe(hinted.pool.id)
    })

    // The two-hop/intermediate consequence of the same demotion is asserted in
    // `search/waves.test.ts`, driven end to end by a real `searchWaves` run whose own discovery
    // probes contradict the hint — deliberately NOT here. `markNegative` is a fair stand-in for the
    // per-pair ordering above (the pool being ranked is the pool that failed), but for the
    // intermediate case it would have been a stand-in for the very wiring under test: the engine
    // used to record nothing at all from the probes that quote half-pair legs, so a version of that
    // test written against this index passed while the demotion could never fire in production.
  })
})

// ---------------------------------------------------------------------------
// Pruning counters — each cap bites at a different granularity (whole
// intermediates, individual pools, whole candidates), and the three counters
// must never bleed into one another.
// ---------------------------------------------------------------------------

/** A distinct token address per index, for building many intermediates without collisions. */
function distinctAddr(n: number): Address {
  return `0x${(0x10000 + n).toString(16).padStart(40, '0')}` as Address
}

/** A v3 pool record at an explicit, monotonically-assigned address — used here instead of `v3Rec`
 * purely to keep this section's many-pools setup trivially collision-free by construction, without
 * relying on `v3Rec`'s (already-collision-free) hash. */
let nextPoolAddr = 1
function uniqueV3Rec(a: Address, b: Address, fee: number): PoolRecord {
  const [token0, token1] = sorted(a, b)
  const address = `0x${(nextPoolAddr++).toString(16).padStart(40, '0')}` as Address
  return { pool: v3Ref(address, token0, token1, fee), source: 'event' }
}

describe('generateRoutes — pruning counters', () => {
  test('MAX_QUOTE_CANDIDATES exactly bounds the full enumeration space — the reconciled ceiling admits it all (C4-P7)', () => {
    // The whole point of deriving MAX_QUOTE_CANDIDATES from MAX_POOLS_DIRECT/MAX_INTERMEDIATES/
    // MAX_POOLS_PER_LEG (constants.ts) is that the theoretical maximum enumeration — every
    // intermediate at its per-leg cap, plus a full direct pair — fits with room to spare: nothing
    // gets trimmed by the total-candidate cap, and `intermediatesSelected` reports the true count
    // instead of silently capping mid-way (the C4-P7 bug: at the old shared MAX_POOLS_PER_PAIR = 3,
    // this exact setup produced 75 candidates against a cap of 48, so intermediates 6-8 contributed
    // zero despite `intermediatesSelected` claiming all 8).
    const index = new PoolIndex(WETH)
    // Direct pair at its own cap: v2 + 4 v3 tiers + v4 = MAX_POOLS_DIRECT (6).
    const v2Pool = v2Rec(NEW, USDC)
    const v3DirectPools = [500, 3000, 10000, 100].map((fee) => v3Rec(NEW, USDC, fee))
    const v4Pool = v4Rec(NEW, USDC)
    for (const rec of [v2Pool, ...v3DirectPools, v4Pool]) index.upsert(rec)

    // MAX_INTERMEDIATES intermediates, each at MAX_POOLS_PER_LEG pools on both the in-leg and out-leg.
    const legFees = [100, 500, 3000]
    const intermediates = Array.from({ length: MAX_INTERMEDIATES }, (_, i) => distinctAddr(i))
    for (const mid of intermediates) {
      for (const fee of legFees) {
        index.upsert(uniqueV3Rec(NEW, mid, fee))
        index.upsert(uniqueV3Rec(mid, USDC, fee))
      }
    }

    const { candidates, pruned, intermediatesSelected } = generateRoutes({
      tokenIn: NEW,
      tokenOut: USDC,
      index,
      hookData: new Map(),
      wrappedNative: WETH,
    })

    // MAX_POOLS_DIRECT direct + MAX_INTERMEDIATES * MAX_POOLS_PER_LEG² two-hop == MAX_QUOTE_CANDIDATES
    // exactly — the derivation's whole claim.
    expect(MAX_QUOTE_CANDIDATES).toBe(MAX_POOLS_DIRECT + MAX_INTERMEDIATES * MAX_POOLS_PER_LEG ** 2)
    expect(candidates).toHaveLength(MAX_QUOTE_CANDIDATES)
    expect(pruned.candidates).toBe(0) // the reconciled cap admits the whole space — nothing trimmed
    expect(pruned.pools).toBe(0) // every pair sat exactly at its own cap — nothing pool-level dropped
    expect(pruned.intermediates).toBe(0) // MAX_INTERMEDIATES eligible == MAX_INTERMEDIATES, none dropped
    expect(intermediatesSelected).toBe(MAX_INTERMEDIATES)
  })

  test('exceeding MAX_POOLS_DIRECT is counted in pruned.pools, not pruned.candidates', () => {
    const index = new PoolIndex(WETH)
    // One more direct pool than MAX_POOLS_DIRECT, and nothing else.
    const fees = [100, 500, 3000, 10000, 100000, 1000000, 10000000]
    for (const fee of fees.slice(0, MAX_POOLS_DIRECT + 1)) index.upsert(uniqueV3Rec(NEW, USDC, fee))

    const { candidates, pruned } = generateRoutes({ tokenIn: NEW, tokenOut: USDC, index, hookData: new Map(), wrappedNative: WETH })

    expect(candidates).toHaveLength(MAX_POOLS_DIRECT) // capped, well under MAX_QUOTE_CANDIDATES
    expect(pruned.pools).toBe(1) // the one pool over the direct cap
    expect(pruned.candidates).toBe(0) // total candidate count never approached the cap
    expect(pruned.intermediates).toBe(0)
  })

  test('a per-pair prune does not leak into pruned.candidates', () => {
    const index = new PoolIndex(WETH)
    // The direct pair: one pool over MAX_POOLS_DIRECT.
    const fees = [100, 500, 3000, 10000, 100000, 1000000, 10000000]
    for (const fee of fees.slice(0, MAX_POOLS_DIRECT + 1)) index.upsert(uniqueV3Rec(NEW, USDC, fee))
    // MAX_INTERMEDIATES intermediates at exactly the per-leg cap — the full two-hop space, which the
    // reconciled MAX_QUOTE_CANDIDATES admits entirely on its own (see the test above).
    const legFees = [100, 500, 3000]
    const intermediates = Array.from({ length: MAX_INTERMEDIATES }, (_, i) => distinctAddr(i))
    for (const mid of intermediates) {
      for (const fee of legFees) {
        index.upsert(uniqueV3Rec(NEW, mid, fee))
        index.upsert(uniqueV3Rec(mid, USDC, fee))
      }
    }

    const { candidates, pruned } = generateRoutes({ tokenIn: NEW, tokenOut: USDC, index, hookData: new Map(), wrappedNative: WETH })

    // MAX_POOLS_DIRECT (capped from MAX_POOLS_DIRECT + 1) + the full two-hop space == MAX_QUOTE_CANDIDATES.
    expect(candidates).toHaveLength(MAX_QUOTE_CANDIDATES)
    expect(pruned.pools).toBe(1) // only the direct pair's excess pool — none of the two-hop pairs went over cap
    expect(pruned.candidates).toBe(0) // the reconciled total cap was never actually approached
  })
})

// ---------------------------------------------------------------------------
// Property tests — arbitrary pool graphs of ≤30 random pools over ≤8 tokens.
// ---------------------------------------------------------------------------

const TOKEN_POOL: Address[] = Array.from(
  { length: 8 },
  (_, i) => `0x${(i + 1).toString(16).padStart(40, '0')}` as Address,
)

type ArbPool = { a: Address; b: Address; protocol: 'v2' | 'v3' | 'v4'; fee: number; createdAtBlock: number; hooked: boolean }

const arbPool = fc
  .record({
    aIdx: fc.integer({ min: 0, max: 7 }),
    bIdx: fc.integer({ min: 0, max: 7 }),
    protocol: fc.constantFrom<'v2' | 'v3' | 'v4'>('v2', 'v3', 'v4'),
    fee: fc.constantFrom(500, 3000, 10000),
    createdAtBlock: fc.integer({ min: 1, max: 100000 }),
    hooked: fc.boolean(),
  })
  .filter((p) => p.aIdx !== p.bIdx)
  .map(
    (p): ArbPool => ({
      a: TOKEN_POOL[p.aIdx]!,
      b: TOKEN_POOL[p.bIdx]!,
      protocol: p.protocol,
      fee: p.fee,
      createdAtBlock: p.createdAtBlock,
      hooked: p.hooked,
    }),
  )

function buildIndex(pools: ArbPool[], wrappedNative: Address): PoolIndex {
  const index = new PoolIndex(wrappedNative)
  const seen = new Set<string>()
  for (const p of pools) {
    let rec: PoolRecord
    if (p.protocol === 'v2') {
      const key = `v2:${sorted(p.a, p.b).join(':')}`
      if (seen.has(key)) continue
      seen.add(key)
      rec = v2Rec(p.a, p.b, { createdAtBlock: BigInt(p.createdAtBlock) })
    } else if (p.protocol === 'v3') {
      const key = `v3:${sorted(p.a, p.b).join(':')}:${p.fee}`
      if (seen.has(key)) continue
      seen.add(key)
      rec = v3Rec(p.a, p.b, p.fee, { createdAtBlock: BigInt(p.createdAtBlock) })
    } else {
      const hooks = p.hooked ? ('0x00000000000000000000000000000000000000bb' as Address) : zeroAddress
      const key = `v4:${sorted(p.a, p.b).join(':')}:${p.fee}:${hooks}`
      if (seen.has(key)) continue
      seen.add(key)
      rec = v4Rec(p.a, p.b, { createdAtBlock: BigInt(p.createdAtBlock), hooks })
    }
    index.upsert(rec)
  }
  return index
}

describe('generateRoutes — property tests', () => {
  test('invariants hold over arbitrary pool graphs', () => {
    fc.assert(
      fc.property(
        fc.array(arbPool, { minLength: 0, maxLength: 30 }),
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 7 }),
        (pools, tokenInIdx, tokenOutIdx) => {
          fc.pre(tokenInIdx !== tokenOutIdx)
          const wrappedNative = TOKEN_POOL[0]!
          const index = buildIndex(pools, wrappedNative)
          const tokenIn = TOKEN_POOL[tokenInIdx]!
          const tokenOut = TOKEN_POOL[tokenOutIdx]!
          const args: GenerateRoutesArgs = { tokenIn, tokenOut, index, hookData: new Map(), wrappedNative }

          const { candidates } = generateRoutes(args)

          // (a) no candidate exceeds 2 legs
          if (candidates.some((c) => c.legs.length > 2 || c.legs.length < 1)) return false

          // (b) no candidate reuses a pool
          for (const c of candidates) {
            const keys = c.legs.map((l) => `${l.pool.protocol}:${l.pool.protocol === 'v4' ? l.pool.poolId : l.pool.address}`.toLowerCase())
            if (new Set(keys).size !== keys.length) return false
          }

          // (c) no intermediate equals an endpoint after family normalization
          for (const c of candidates) {
            if (c.legs.length === 2) {
              const mid = c.legs[0]!.currencyOut
              if (sameFamily(mid, tokenIn, wrappedNative) || sameFamily(mid, tokenOut, wrappedNative)) return false
            }
          }

          // (d) candidate count <= MAX_QUOTE_CANDIDATES
          if (candidates.length > MAX_QUOTE_CANDIDATES) return false

          // (e) determinism: same input -> identical routeId sequence
          const idsA = candidates.map(routeId)
          const idsB = generateRoutes(args).candidates.map(routeId)
          if (idsA.join('|') !== idsB.join('|')) return false

          // (f) if any direct pool exists, at least one direct candidate survives
          const hasDirect = index.pair(tokenIn, tokenOut).length > 0
          if (hasDirect && !candidates.some((c) => c.legs.length === 1)) return false

          return true
        },
      ),
      { numRuns: 200 },
    )
  })
})
