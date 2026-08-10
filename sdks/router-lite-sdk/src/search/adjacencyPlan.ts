import type { Address } from 'viem'

import { mergeRanges } from '../internal/ranges'
import { adjacencyQueries } from '../protocols/adjacency'
import type { AdjacencyShape } from '../protocols/adjacency'
import type { BlockRange, MergedLogQuery, Protocol } from '../types'

// ---------------------------------------------------------------------------
// WHICH SCOPES MAY SHARE ONE `eth_getLogs`, AND OVER EXACTLY WHICH BLOCKS.
//
// This file is pure — no client, no index, no `Run` — because the thing it
// decides is the one thing in the merged-scan design that can silently LOSE
// POOLS, which is the worst failure class this package has: a merged query
// issued over blocks one of its constituents had not actually asked for would
// record coverage nobody scanned, and every later search would then skip that
// gap as done.
//
// THE TWO FACTS THAT MAKE MERGING LEGAL. `eth_getLogs` accepts an ADDRESS ARRAY
// and an ARRAY WITHIN ONE TOPIC POSITION, so one request can span several
// emitters and several accepted values in the token slot. What it cannot span
// is several BLOCK RANGES — one request has one `fromBlock`/`toBlock` — and the
// constituents of a merge do not generally want the same range:
//
//   * v2 and v3 have DIFFERENT DEPLOYMENT BLOCKS (v2 predates v3 by ~18 months
//     on mainnet). Flooring a merged query at the LATER one silently drops v2's
//     earlier history and then records it as covered — pools lost, permanently,
//     for every search that shares the cache. Flooring at the earlier one is
//     merely wasteful. Neither is what happens here: the pre-v3 stretch is a
//     segment of its own, scanned v2-only.
//   * the two endpoints' coverage caches routinely DISAGREE — a warm router has
//     WETH's adjacency cached from an earlier search and the long-tail token's
//     not at all — so "both endpoints, one query" is only true over the blocks
//     where both are genuinely unscanned.
//
// SO THE PLAN IS A SEGMENTATION, NOT A UNION. Every scope's uncovered ranges
// are cut at every other scope's boundaries, giving maximal segments over which
// the SET of scopes still wanting these blocks is constant; each distinct set
// gets one merged query pair, over exactly its own segments. Where only one
// scope is uncovered, that set has one member and the "merged" query is the
// narrow single-protocol single-endpoint filter — same construction, one-element
// arrays (`protocols/adjacency.ts`), no second code path.
//
// AND THE COVERAGE CLAIM IS THE CROSS PRODUCT, deliberately. A query built for
// {(v2, A), (v3, B)} asks `[v2Factory, v3Factory]` x `[A, B]`, which also
// matches every (v2, B) and (v3, A) log in the range — so those scopes really
// are covered by it, and saying so is honest bookkeeping rather than a
// widening. `adjacencyQueries` builds its token set over the same cross product
// precisely so this claim can never outrun the filter.
// ---------------------------------------------------------------------------

/** One (protocol, endpoint) coverage scope — the granularity `PoolIndex`'s coverage cache is keyed at. */
export type AdjacencyScope = { protocol: Protocol; endpoint: Address }

/** A scope, its protocol's event shape, and the blocks it still needs. */
export type ScopeDemand = AdjacencyScope & { shape: AdjacencyShape; uncovered: BlockRange[] }

/**
 * One merged request chain: two topic-slot filters, the ranges to walk with them, and every scope
 * the pair of them covers.
 *
 * BOTH `queries` MUST COVER A RANGE before any scope may claim it — a pool whose creation event put
 * the endpoint in the other currency slot is invisible to the first filter — which is why they are
 * returned together rather than as two independent scans.
 */
export type MergedScan = {
  queries: MergedLogQuery[]
  ranges: BlockRange[]
  covers: AdjacencyScope[]
}

export function scopeKey(scope: AdjacencyScope): string {
  return `${scope.protocol}:${scope.endpoint.toLowerCase()}`
}

function contains(ranges: BlockRange[], block: bigint): boolean {
  return ranges.some((r) => block >= r.fromBlock && block <= r.toBlock)
}

/**
 * Cuts `demands`' uncovered ranges into maximal segments over which the set of demanding scopes is
 * constant, returning one entry per distinct set.
 *
 * Boundaries are every range's start and every range's end + 1, so membership cannot change inside a
 * segment; segments sharing a set are collected (and merged) into one entry, because they are asked
 * for with the same query pair and only differ in which blocks they walk.
 */
function byDemandSet(demands: ScopeDemand[]): { indices: number[]; ranges: BlockRange[] }[] {
  const points = new Set<bigint>()
  for (const demand of demands) {
    for (const range of demand.uncovered) {
      points.add(range.fromBlock)
      points.add(range.toBlock + 1n)
    }
  }
  const sorted = [...points].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  const groups = new Map<string, { indices: number[]; ranges: BlockRange[] }>()
  for (let i = 0; i + 1 < sorted.length; i++) {
    const fromBlock = sorted[i]!
    const toBlock = sorted[i + 1]! - 1n
    if (toBlock < fromBlock) continue
    const indices = demands.map((d, idx) => (contains(d.uncovered, fromBlock) ? idx : -1)).filter((idx) => idx >= 0)
    if (indices.length === 0) continue
    const key = indices.join(',')
    const group = groups.get(key) ?? { indices, ranges: [] }
    group.ranges.push({ fromBlock, toBlock })
    groups.set(key, group)
  }

  return [...groups.values()].map((g) => ({ indices: g.indices, ranges: mergeRanges(g.ranges) }))
}

/**
 * The scans that answer every demand in `demands`, merging as far as the two hard constraints allow:
 * only scopes whose currencies sit at the same TOPIC SLOTS can share a filter (v2+v3 do; v4 does
 * not — see {@link AdjacencyShape}), and only over blocks every constituent actually still wants.
 *
 * A scope with no uncovered blocks contributes nothing and appears in no scan — the caller reads
 * that as "already complete" rather than as a scan that did nothing.
 */
export function planAdjacencyScans(demands: ScopeDemand[]): MergedScan[] {
  const bySlot = new Map<number, ScopeDemand[]>()
  for (const demand of demands) {
    if (demand.uncovered.length === 0) continue
    const group = bySlot.get(demand.shape.slot) ?? []
    group.push(demand)
    bySlot.set(demand.shape.slot, group)
  }

  const scans: MergedScan[] = []
  for (const group of bySlot.values()) {
    for (const { indices, ranges } of byDemandSet(group)) {
      const members = indices.map((i) => group[i]!)
      // One shape per protocol (every scope of a protocol shares it), one entry per endpoint.
      const shapes = [...new Map(members.map((m) => [m.protocol, m.shape])).values()]
      const protocols = [...new Map(members.map((m) => [m.protocol, m.protocol])).values()]
      const endpoints = [...new Map(members.map((m) => [m.endpoint.toLowerCase(), m.endpoint])).values()]
      scans.push({
        queries: adjacencyQueries(shapes, endpoints),
        ranges,
        // The cross product, not `members`: the query really does match every one of these scopes'
        // logs over these ranges (see this file's header), so claiming less would leave a warm
        // router re-scanning blocks it has already paid for.
        covers: protocols.flatMap((protocol) => endpoints.map((endpoint) => ({ protocol, endpoint }))),
      })
    }
  }
  return scans
}
