import type { Address, Hex } from 'viem'
import { pad } from 'viem'

import type { MergedLogQuery } from '../types'

// ---------------------------------------------------------------------------
// Adjacency queries — ONE builder, for one protocol or for several at once.
//
// "Every pool touching X" is, for every protocol this package knows, the same
// shape of question about a creation event: which contract emits it, which
// topic0 identifies it, and which two adjacent topic slots hold the pool's two
// currencies. A module states those four facts as an {@link AdjacencyShape}
// and never builds a filter itself; `adjacencyQueries` below turns any set of
// shapes and any set of endpoints into the `eth_getLogs` filters that answer
// them.
//
// WHY THE SHAPE REPLACED A PER-MODULE `adjacency()` (C5-C). `eth_getLogs`
// accepts an ADDRESS ARRAY and an ARRAY WITHIN A TOPIC POSITION (OR-matching),
// which means the v2 factory and the v3 factory can be asked in ONE request —
// and both of the trade's endpoints in that same request, because the endpoint
// sits in a single topic slot that may hold either value. Measured live on
// mainnet: v2+v3 merged returned 29+3 = 32 logs in one 49ms request against
// 134ms for the two separate ones, with exact set equality against the union of
// the individual queries. A module that builds its own filter cannot express
// that; a module that states its SHAPE composes with every other module whose
// currencies sit in the same slots, for free.
//
// A merged query is not a different KIND of query, which is the other half of
// the design: the narrow one-protocol-one-endpoint filter this file builds for
// the ranges only one scope still needs is the SAME construction with
// one-element arrays, so there is no second code path to keep honest.
// ---------------------------------------------------------------------------

/**
 * Where a protocol's pool-creation events live and how they index the pool's currencies.
 *
 * `slot` is the topic index of the pool's FIRST currency; the second always sits at `slot + 1`.
 * v2's `PairCreated(token0, token1, pair, count)` and v3's `PoolCreated(token0, token1, fee, ...)`
 * both index the pair at topics 1/2 — which is exactly why they merge. v4's
 * `Initialize(id, currency0, currency1, ...)` indexes the pool id first, so its currencies sit one
 * slot deeper (topics 2/3) and it merges only with itself.
 */
export type AdjacencyShape = {
  /** The contract that emits the creation event — a factory, or v4's PoolManager singleton. */
  emitter: Address
  /** topic0 of that creation event. */
  topic0: Hex
  /** Topic index of the pool's first currency. The second currency is at `slot + 1`. */
  slot: 1 | 2
  /**
   * The address this protocol's topics index a graph-node endpoint under.
   *
   * Identity for v2/v3. NOT for v4: the pool graph folds the native family onto `wrappedNative`,
   * while v4's `Initialize` topics carry the raw on-chain currency — `address(0)` for native — so
   * the wrapped-native endpoint has to be mapped back before it can match anything.
   */
  topicAddress(endpoint: Address): Address
}

/** Deduped, order-preserving. */
function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

/**
 * The two topic-slot filters that answer "every pool touching any of `endpoints`" for every protocol
 * in `shapes` at once — one for the endpoint sitting in the first currency slot, one for the second.
 *
 * BOTH ARE NEEDED FOR COVERAGE, always: a pool whose creation event put the endpoint in the other
 * slot is invisible to the first filter, so a block range is only genuinely covered for an endpoint
 * where BOTH filters succeeded (`search/discovery.ts` intersects them, and has since long before
 * they were merged).
 *
 * EVERY `shapes` ENTRY MUST AGREE ON `slot` — they are the same two topic positions in one filter,
 * so a v4 shape cannot ride along with a v2/v3 one. The planner groups by `slot` before it ever gets
 * here; the throw is a structural guard, not a runtime case.
 *
 * The token-slot values are the union over the full CROSS PRODUCT of shapes and endpoints, not just
 * the pairs a caller happens to be asking for. That is what makes the coverage claim downstream
 * sound: whatever (protocol, endpoint) pair you name from these two sets, its logs match this
 * filter, so the range this query covers is covered for all of them (see
 * `search/adjacencyPlan.ts#planAdjacencyScans`).
 */
export function adjacencyQueries(shapes: readonly AdjacencyShape[], endpoints: readonly Address[]): MergedLogQuery[] {
  if (shapes.length === 0 || endpoints.length === 0) return []
  const slot = shapes[0]!.slot
  if (shapes.some((s) => s.slot !== slot)) {
    throw new Error('adjacencyQueries: every shape in one merged query must index its currencies at the same topic slot')
  }

  const address = unique(shapes.map((s) => s.emitter.toLowerCase() as Address))
  const topic0 = unique(shapes.map((s) => s.topic0.toLowerCase() as Hex))
  const tokens = unique(
    shapes.flatMap((shape) => endpoints.map((endpoint) => pad(shape.topicAddress(endpoint).toLowerCase() as Hex, { size: 32 }))),
  )

  // One filter per currency slot: `slot - 1 + offset` nulls stand in for the topics between topic0
  // and the slot this filter binds (none for v2/v3's first slot, one for v4's, one more for each
  // second slot).
  return [0, 1].map((offset) => ({
    address,
    topics: [topic0, ...Array<null>(slot - 1 + offset).fill(null), tokens],
  }))
}
