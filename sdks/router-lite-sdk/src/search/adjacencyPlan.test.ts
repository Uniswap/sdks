import { describe, expect, test } from 'bun:test'
import type { Address, Hex } from 'viem'
import { pad } from 'viem'

import type { AdjacencyShape } from '../protocols/adjacency'
import type { BlockRange, Protocol } from '../types'

import { planAdjacencyScans, scopeKey } from './adjacencyPlan'
import type { AdjacencyScope, ScopeDemand } from './adjacencyPlan'

// ---------------------------------------------------------------------------
// THE PLANNER, WHICH IS THE ONLY PLACE MERGING CAN LOSE POOLS.
//
// A merged `eth_getLogs` records its covered range under EVERY scope it
// claims. If it was ever issued over blocks one of those scopes had not
// actually asked for, that scope's coverage cache is now permanently wrong —
// every later search, in this process and in every process that loads the same
// snapshot, skips the gap as done. There is no error, no retry, and no way to
// notice: the router simply reports fewer pools forever.
//
// So the assertions below are almost all of one shape: for every scope, the
// blocks credited to it are EXACTLY the blocks it demanded, and every block it
// demanded is asked about by some scan. The two ways that goes wrong in
// practice have their own sections —
//
//   * DIFFERING DEPLOYMENT FLOORS. v2 predates v3 by ~2.4M blocks on mainnet.
//     Flooring a v2+v3 merge at v3's block silently drops v2's early history;
//     flooring at v2's is merely wasteful.
//   * DIFFERING CACHE STATES. A warm router has WETH's adjacency cached and a
//     long-tail token's not at all, so the two endpoints of one trade rarely
//     want the same blocks.
//
// The plan is pure, which is what lets all of this be asserted without a
// client, an index or a search engine anywhere near it.
// ---------------------------------------------------------------------------

const V2_FACTORY = `0x${'22'.repeat(20)}` as Address
const V3_FACTORY = `0x${'33'.repeat(20)}` as Address
const POOL_MANAGER = `0x${'44'.repeat(20)}` as Address
const TOKEN_A = `0x${'aa'.repeat(20)}` as Address
const TOKEN_B = `0x${'bb'.repeat(20)}` as Address

const shapes: Record<Protocol, AdjacencyShape> = {
  v2: { emitter: V2_FACTORY, topic0: `0x${'f2'.repeat(32)}` as Hex, slot: 1, topicAddress: (e) => e },
  v3: { emitter: V3_FACTORY, topic0: `0x${'f3'.repeat(32)}` as Hex, slot: 1, topicAddress: (e) => e },
  v4: { emitter: POOL_MANAGER, topic0: `0x${'f4'.repeat(32)}` as Hex, slot: 2, topicAddress: (e) => e },
}

function demand(protocol: Protocol, endpoint: Address, uncovered: BlockRange[]): ScopeDemand {
  return { protocol, endpoint, shape: shapes[protocol], uncovered }
}

const range = (fromBlock: bigint, toBlock: bigint): BlockRange => ({ fromBlock, toBlock })

const word = (a: Address): Hex => pad(a.toLowerCase() as Hex, { size: 32 })

/** Every block some scan asks about ON BEHALF OF `scope`, i.e. every scan whose `covers` names it. */
function askedFor(plan: ReturnType<typeof planAdjacencyScans>, scope: AdjacencyScope): BlockRange[] {
  return plan
    .filter((scan) => scan.covers.some((c) => scopeKey(c) === scopeKey(scope)))
    .flatMap((scan) => scan.ranges)
    .sort((a, b) => (a.fromBlock < b.fromBlock ? -1 : 1))
}

/** The total block count of a range list, for "not one block more than demanded" assertions. */
function blocks(ranges: BlockRange[]): bigint {
  return ranges.reduce((sum, r) => sum + (r.toBlock - r.fromBlock + 1n), 0n)
}

// ---------------------------------------------------------------------------
// (a) The happy case: everything wants the same blocks, so everything merges.
// ---------------------------------------------------------------------------

describe('the cold search: identical demands merge as far as topic slots allow', () => {
  const WHOLE = [range(1_000n, 2_000n)]
  const plan = planAdjacencyScans([
    demand('v2', TOKEN_A, WHOLE),
    demand('v2', TOKEN_B, WHOLE),
    demand('v3', TOKEN_A, WHOLE),
    demand('v3', TOKEN_B, WHOLE),
    demand('v4', TOKEN_A, WHOLE),
    demand('v4', TOKEN_B, WHOLE),
  ])

  test('six scopes become TWO scans — v2+v3 together, v4 alone one slot deeper', () => {
    // The headline number: 12 query chains (6 scopes x 2 topic slots) become 4 (2 scans x 2), which
    // is the whole of C5-C stated as a count. This is the SAME-FLOOR case; the differing-floor
    // describe below is where mainnet's cold search pays 6 instead, and pins why.
    expect(plan).toHaveLength(2)
    expect(plan.flatMap((s) => s.queries)).toHaveLength(4)

    const merged = plan.find((s) => s.covers.some((c) => c.protocol === 'v2'))!
    const v4Scan = plan.find((s) => s.covers.every((c) => c.protocol === 'v4'))!

    expect(merged.queries[0]!.address).toEqual([V2_FACTORY.toLowerCase() as Address, V3_FACTORY.toLowerCase() as Address])
    expect(merged.queries[0]!.topics[0]).toEqual([shapes.v2.topic0, shapes.v3.topic0])
    expect(merged.queries[0]!.topics[1]).toEqual([word(TOKEN_A), word(TOKEN_B)])

    // v4's currencies sit behind the pool-id topic, so it can never share a filter with v2/v3 —
    // the planner groups by `AdjacencyShape.slot` and this is what that grouping buys.
    expect(v4Scan.queries[0]!.address).toEqual([POOL_MANAGER.toLowerCase() as Address])
    expect(v4Scan.queries[0]!.topics[1]).toBeNull()
    expect(v4Scan.queries[0]!.topics[2]).toEqual([word(TOKEN_A), word(TOKEN_B)])
  })

  test('every scope is covered, over exactly the blocks it demanded', () => {
    for (const protocol of ['v2', 'v3', 'v4'] as const) {
      for (const endpoint of [TOKEN_A, TOKEN_B]) {
        expect(askedFor(plan, { protocol, endpoint })).toEqual(WHOLE)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// (b) Differing deployment floors — the worst failure class, verbatim.
// ---------------------------------------------------------------------------

describe('differing deployment floors: the pre-v3 stretch is scanned v2-only', () => {
  // Mainnet's real gap: v2 at 10,000,835 and v3 at 12,369,621, ~2.4M blocks apart.
  const V2_DEPLOY = 10_000_835n
  const V3_DEPLOY = 12_369_621n
  const HEAD = 20_000_000n

  const plan = planAdjacencyScans([
    demand('v2', TOKEN_A, [range(V2_DEPLOY, HEAD)]),
    demand('v3', TOKEN_A, [range(V3_DEPLOY, HEAD)]),
  ])

  test('v2 is asked about its WHOLE history, v3 only about its own', () => {
    // The pool-losing bug this exists to prevent: flooring the merge at v3's block would leave v2's
    // first 2.4M blocks unscanned AND recorded as covered.
    expect(askedFor(plan, { protocol: 'v2', endpoint: TOKEN_A })).toEqual([range(V2_DEPLOY, V3_DEPLOY - 1n), range(V3_DEPLOY, HEAD)])
    expect(askedFor(plan, { protocol: 'v3', endpoint: TOKEN_A })).toEqual([range(V3_DEPLOY, HEAD)])
  })

  test('the pre-v3 segment asks the v2 factory ALONE — never v3 below its own deployment', () => {
    const preV3 = plan.find((s) => s.ranges.some((r) => r.fromBlock === V2_DEPLOY))!

    expect(preV3.ranges).toEqual([range(V2_DEPLOY, V3_DEPLOY - 1n)])
    expect(preV3.covers).toEqual([{ protocol: 'v2', endpoint: TOKEN_A }])
    expect(preV3.queries[0]!.address).toEqual([V2_FACTORY.toLowerCase() as Address])
    expect(preV3.queries[0]!.topics[0]).toEqual([shapes.v2.topic0])
  })

  test('and the shared stretch above v3’s floor really is merged', () => {
    const shared = plan.find((s) => s.ranges.some((r) => r.fromBlock === V3_DEPLOY))!

    expect(shared.queries[0]!.address).toEqual([V2_FACTORY.toLowerCase() as Address, V3_FACTORY.toLowerCase() as Address])
    expect(shared.covers.map(scopeKey).sort()).toEqual(
      [scopeKey({ protocol: 'v2', endpoint: TOKEN_A }), scopeKey({ protocol: 'v3', endpoint: TOKEN_A })].sort(),
    )
  })

  test('nothing is asked about below either floor, and nothing above the head', () => {
    for (const scan of plan) {
      for (const r of scan.ranges) {
        expect(r.fromBlock).toBeGreaterThanOrEqual(V2_DEPLOY)
        expect(r.toBlock).toBeLessThanOrEqual(HEAD)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// (c) Differing cache states — the ordinary warm-router shape.
// ---------------------------------------------------------------------------

describe('differing cache states: endpoint A warm, endpoint B cold', () => {
  // A warm router that has scanned WETH before and has never heard of the long-tail token.
  const WARM = [range(9_000n, 10_000n)] // only the recent delta plus the reorg tail
  const COLD = [range(1_000n, 10_000n)] // the whole history

  const plan = planAdjacencyScans([demand('v2', TOKEN_A, WARM), demand('v2', TOKEN_B, COLD)])

  test('the shared tail merges, and B’s remainder gets its OWN narrower query', () => {
    expect(plan).toHaveLength(2)

    const shared = plan.find((s) => s.covers.length === 2)!
    const remainder = plan.find((s) => s.covers.length === 1)!

    expect(shared.ranges).toEqual(WARM)
    expect(shared.queries[0]!.topics[1]).toEqual([word(TOKEN_A), word(TOKEN_B)])

    expect(remainder.ranges).toEqual([range(1_000n, 8_999n)])
    expect(remainder.covers).toEqual([{ protocol: 'v2', endpoint: TOKEN_B }])
    // ONE endpoint in the token slot. A merged filter here would ask about blocks A has already
    // paid for, and — far worse — would let the bookkeeping credit A with them a second time under
    // a different plan. The narrow query is what makes the credit exact.
    expect(remainder.queries[0]!.topics[1]).toEqual([word(TOKEN_B)])
  })

  test('the warm endpoint is never asked about a block it already has', () => {
    const asked = askedFor(plan, { protocol: 'v2', endpoint: TOKEN_A })
    expect(asked).toEqual(WARM)
    expect(blocks(asked)).toBe(blocks(WARM)) // not one block more
  })

  test('the cold endpoint’s whole history is asked about, across the two scans', () => {
    expect(askedFor(plan, { protocol: 'v2', endpoint: TOKEN_B })).toEqual([range(1_000n, 8_999n), range(9_000n, 10_000n)])
  })
})

// ---------------------------------------------------------------------------
// (d) The general invariant, over the awkward shapes.
// ---------------------------------------------------------------------------

describe('the coverage invariant holds over fragmented and disjoint demands', () => {
  test('a scope is asked about every block it demanded and no block it did not — with holes on both sides', () => {
    // Fragmented uncovered lists are the ordinary warm shape, not a contrived one: a search that
    // gave up on a sub-range leaves exactly this.
    const aRanges = [range(100n, 200n), range(400n, 500n), range(900n, 1_000n)]
    const bRanges = [range(150n, 450n), range(950n, 1_200n)]
    const plan = planAdjacencyScans([demand('v3', TOKEN_A, aRanges), demand('v3', TOKEN_B, bRanges)])

    for (const [endpoint, demanded] of [
      [TOKEN_A, aRanges],
      [TOKEN_B, bRanges],
    ] as const) {
      const asked = askedFor(plan, { protocol: 'v3', endpoint })
      // Same total block count, and every asked block falls inside a demanded range — together that
      // is set equality without needing the segmentation's exact cut points spelled out.
      expect(blocks(asked)).toBe(blocks(demanded))
      for (const r of asked) {
        expect(demanded.some((d) => r.fromBlock >= d.fromBlock && r.toBlock <= d.toBlock)).toBe(true)
      }
    }
  })

  test('the merged segment really is the INTERSECTION, and it is asked once', () => {
    const plan = planAdjacencyScans([demand('v3', TOKEN_A, [range(100n, 500n)]), demand('v3', TOKEN_B, [range(300n, 900n)])])
    const shared = plan.find((s) => s.covers.length === 2)!

    expect(shared.ranges).toEqual([range(300n, 500n)])
    // ...and the two remainders are separate, narrow scans rather than a widened merge.
    expect(plan.filter((s) => s.covers.length === 1).flatMap((s) => s.ranges)).toEqual([range(100n, 299n), range(501n, 900n)])
  })

  test('disjoint demands never merge, however close they sit', () => {
    // Adjacent but not overlapping: 200 and 201. A segmentation that cut on the wrong side of a
    // boundary would fuse these, and the fused query would cover blocks neither scope asked for.
    const plan = planAdjacencyScans([demand('v3', TOKEN_A, [range(100n, 200n)]), demand('v3', TOKEN_B, [range(201n, 300n)])])

    expect(plan.every((s) => s.covers.length === 1)).toBe(true)
    expect(askedFor(plan, { protocol: 'v3', endpoint: TOKEN_A })).toEqual([range(100n, 200n)])
    expect(askedFor(plan, { protocol: 'v3', endpoint: TOKEN_B })).toEqual([range(201n, 300n)])
  })
})

// ---------------------------------------------------------------------------
// (e) Nothing to do is no scan — a warm router's ordinary answer.
// ---------------------------------------------------------------------------

describe('a scope with nothing left to want', () => {
  test('contributes no scan at all', () => {
    expect(planAdjacencyScans([demand('v2', TOKEN_A, []), demand('v3', TOKEN_B, [])])).toEqual([])
  })

  test('and does not ride along on someone else’s query', () => {
    // The `covers` cross product is honest bookkeeping (the filter really does match these scopes'
    // logs), but a scope that demanded nothing must not be listed as covered by a scan built without
    // its endpoint in the token slot — that would be a claim the filter cannot back.
    const plan = planAdjacencyScans([demand('v2', TOKEN_A, []), demand('v2', TOKEN_B, [range(1n, 10n)])])

    expect(plan).toHaveLength(1)
    expect(plan[0]!.covers).toEqual([{ protocol: 'v2', endpoint: TOKEN_B }])
    expect(plan[0]!.queries[0]!.topics[1]).toEqual([word(TOKEN_B)])
  })
})

// ---------------------------------------------------------------------------
// (f) The cross-product claim, which is what the coverage bookkeeping reads.
// ---------------------------------------------------------------------------

test('`covers` is the CROSS PRODUCT of the merge’s protocols and endpoints, and the filter backs it', () => {
  // Only two of the four (protocol, endpoint) pairs actually demanded this range. The merged filter
  // asks `[v2F, v3F] x [A, B]` regardless — so it genuinely answers for all four, and saying so is
  // what keeps a warm router from re-scanning blocks it has already paid for.
  const plan = planAdjacencyScans([demand('v2', TOKEN_A, [range(1n, 10n)]), demand('v3', TOKEN_B, [range(1n, 10n)])])

  expect(plan).toHaveLength(1)
  expect(plan[0]!.covers.map(scopeKey).sort()).toEqual(
    [
      scopeKey({ protocol: 'v2', endpoint: TOKEN_A }),
      scopeKey({ protocol: 'v2', endpoint: TOKEN_B }),
      scopeKey({ protocol: 'v3', endpoint: TOKEN_A }),
      scopeKey({ protocol: 'v3', endpoint: TOKEN_B }),
    ].sort(),
  )
  // The claim is backed by the filter itself: both factories, both endpoints, in both slot filters.
  for (const query of plan[0]!.queries) {
    expect(query.address).toEqual([V2_FACTORY.toLowerCase() as Address, V3_FACTORY.toLowerCase() as Address])
    expect(query.topics.at(-1)).toEqual([word(TOKEN_A), word(TOKEN_B)])
  }
})

test('scopeKey is case-insensitive in the endpoint — the same token spelled two ways is one scope', () => {
  expect(scopeKey({ protocol: 'v3', endpoint: TOKEN_A.toUpperCase() as Address })).toBe(scopeKey({ protocol: 'v3', endpoint: TOKEN_A }))
})
