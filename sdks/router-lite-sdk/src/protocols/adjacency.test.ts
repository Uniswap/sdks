import { expect, test } from 'bun:test'
import type { Address, Hex } from 'viem'
import { pad, zeroAddress } from 'viem'

import { adjacencyQueries } from './adjacency'
import type { AdjacencyShape } from './adjacency'

// ---------------------------------------------------------------------------
// The merged-query CONSTRUCTION, on its own.
//
// `adjacencyQueries` is where the whole C5-C saving is spent or lost: it turns
// a set of protocol shapes and a set of endpoints into the two `eth_getLogs`
// filters that answer all of them at once. The properties worth pinning here
// are the ones a provider would silently punish rather than reject —
//
//   * a token slot that carries only ONE endpoint answers half the question
//     while the planner records coverage for both, which is the pool-losing
//     failure this whole design is arranged around;
//   * a topic0 or address array missing one constituent does the same, one
//     protocol at a time;
//   * and the v4 slot offset being wrong returns nothing at all, which at
//     least fails loudly, but only if something asserts the offset.
//
// The real modules' own shapes (selectors, emitters, slots) are pinned as
// drift guards in `v2.test.ts`/`v3.test.ts`/`v4.test.ts`; this file uses
// synthetic shapes so it tests the BUILDER rather than re-testing those.
// ---------------------------------------------------------------------------

const V2_FACTORY = `0x${'22'.repeat(20)}` as Address
const V3_FACTORY = `0x${'33'.repeat(20)}` as Address
const POOL_MANAGER = `0x${'44'.repeat(20)}` as Address
const WETH = `0x${'ee'.repeat(20)}` as Address
const TOKEN_A = `0x${'aa'.repeat(20)}` as Address
const TOKEN_B = `0x${'bb'.repeat(20)}` as Address

const PAIR_CREATED = `0x${'f2'.repeat(32)}` as Hex
const POOL_CREATED = `0x${'f3'.repeat(32)}` as Hex
const INITIALIZE = `0x${'f4'.repeat(32)}` as Hex

const v2Shape: AdjacencyShape = { emitter: V2_FACTORY, topic0: PAIR_CREATED, slot: 1, topicAddress: (e) => e }
const v3Shape: AdjacencyShape = { emitter: V3_FACTORY, topic0: POOL_CREATED, slot: 1, topicAddress: (e) => e }
/** v4's real fold: the graph's `wrappedNative` node is `address(0)` in an `Initialize` topic. */
const v4Shape: AdjacencyShape = {
  emitter: POOL_MANAGER,
  topic0: INITIALIZE,
  slot: 2,
  topicAddress: (e) => (e.toLowerCase() === WETH.toLowerCase() ? zeroAddress : e),
}

const word = (a: Address): Hex => pad(a.toLowerCase() as Hex, { size: 32 })

test('v2 + v3, both endpoints: ONE address array, ONE OR-topic0, both endpoints in the token slot', () => {
  const [first, second] = adjacencyQueries([v2Shape, v3Shape], [TOKEN_A, TOKEN_B])

  // Two filters and only two — one per currency slot, which is what four chains for the whole
  // search (rather than twelve) reduces to.
  expect(adjacencyQueries([v2Shape, v3Shape], [TOKEN_A, TOKEN_B])).toHaveLength(2)

  for (const query of [first!, second!]) {
    expect(query.address).toEqual([V2_FACTORY.toLowerCase() as Address, V3_FACTORY.toLowerCase() as Address])
    expect(query.topics[0]).toEqual([PAIR_CREATED, POOL_CREATED])
  }

  // topics 1/2 — the pair's slots for both events, which is exactly why they merge.
  expect(first!.topics[1]).toEqual([word(TOKEN_A), word(TOKEN_B)])
  expect(first!.topics[2]).toBeUndefined()
  expect(second!.topics[1]).toBeNull()
  expect(second!.topics[2]).toEqual([word(TOKEN_A), word(TOKEN_B)])
})

test('v4 sits one slot deeper: the pool-id topic is skipped with a null, in BOTH filters', () => {
  const [first, second] = adjacencyQueries([v4Shape], [TOKEN_A, TOKEN_B])

  expect(first!.topics[1]).toBeNull() // id
  expect(first!.topics[2]).toEqual([word(TOKEN_A), word(TOKEN_B)])
  expect(second!.topics[1]).toBeNull() // id
  expect(second!.topics[2]).toBeNull() // currency0
  expect(second!.topics[3]).toEqual([word(TOKEN_A), word(TOKEN_B)])
})

test('the token slot carries topicAddress’ output, not the graph node — v4’s native fold survives merging', () => {
  const [first] = adjacencyQueries([v4Shape], [WETH, TOKEN_A])
  // The graph asks about `wrappedNative`; the chain indexes `address(0)`. A filter that carried the
  // wrapped address would match no v4 native pool at all, while the planner recorded the range as
  // covered for that endpoint.
  expect(first!.topics[2]).toEqual([word(zeroAddress), word(TOKEN_A)])
})

test('the token slot is the full CROSS PRODUCT of shapes and endpoints — the planner’s coverage claim can never outrun it', () => {
  // A shape whose topic value differs from the graph node, merged with one whose does not. The
  // planner records coverage for every (protocol, endpoint) pair in the merge, so every one of those
  // pairs' topic values must be in this slot — the union over shapes, not over endpoints alone.
  const folding: AdjacencyShape = { ...v2Shape, topicAddress: (e) => (e.toLowerCase() === WETH.toLowerCase() ? zeroAddress : e) }
  const [first] = adjacencyQueries([folding, v3Shape], [WETH, TOKEN_A])

  expect(first!.topics[1]).toEqual([word(zeroAddress), word(TOKEN_A), word(WETH)])
})

test('a one-protocol, one-endpoint query is the SAME construction with one-element arrays', () => {
  // The narrow query the planner emits for a remainder nobody else wants is not a second code path;
  // this is what makes "merged" and "narrow" the same thing, and it is why there is no second
  // builder to keep honest.
  const [first, second] = adjacencyQueries([v3Shape], [TOKEN_A])

  expect(first!.address).toEqual([V3_FACTORY.toLowerCase() as Address])
  expect(first!.topics[0]).toEqual([POOL_CREATED])
  expect(first!.topics[1]).toEqual([word(TOKEN_A)])
  expect(second!.topics[2]).toEqual([word(TOKEN_A)])
})

test('duplicates collapse: the same endpoint twice, or two protocols sharing an emitter, ask once', () => {
  const [first] = adjacencyQueries([v2Shape, { ...v3Shape, emitter: V2_FACTORY }], [TOKEN_A, TOKEN_A])

  expect(first!.address).toEqual([V2_FACTORY.toLowerCase() as Address])
  expect(first!.topics[1]).toEqual([word(TOKEN_A)])
})

test('mixing topic slots in one query throws — it would silently ask the wrong question', () => {
  // v4's currencies sit at topics 2/3 and v2/v3's at 1/2. One filter binds ONE pair of positions, so
  // a mixed set would filter v4 on the pool id (matching nothing) or v2/v3 on nothing at all. The
  // planner groups by `slot` before it ever calls this; the throw is the structural guard.
  expect(() => adjacencyQueries([v2Shape, v4Shape], [TOKEN_A])).toThrow(/same topic slot/)
})

test('no shapes or no endpoints is no query, not an unfiltered one', () => {
  // An `eth_getLogs` with an empty token slot is a firehose over the factory's whole history.
  expect(adjacencyQueries([], [TOKEN_A])).toEqual([])
  expect(adjacencyQueries([v2Shape], [])).toEqual([])
})
