import { expect, test } from 'bun:test'
import fc from 'fast-check'

import type { BlockRange } from '../types'

import { intersectAll, intersectRanges, maxBig, mergeRanges, minBig, subtractRanges } from './ranges'

const r = (fromBlock: bigint, toBlock: bigint): BlockRange => ({ fromBlock, toBlock })

test('maxBig picks the larger bigint', () => {
  expect(maxBig(1n, 2n)).toBe(2n)
  expect(maxBig(2n, 1n)).toBe(2n)
  expect(maxBig(2n, 2n)).toBe(2n)
})

test('minBig picks the smaller bigint', () => {
  expect(minBig(1n, 2n)).toBe(1n)
  expect(minBig(2n, 1n)).toBe(1n)
  expect(minBig(2n, 2n)).toBe(2n)
})

test('mergeRanges sorts, merges overlaps, and closes adjacent (n, n+1) gaps', () => {
  expect(mergeRanges([])).toEqual([])
  expect(mergeRanges([r(10n, 20n), r(1n, 5n)])).toEqual([r(1n, 5n), r(10n, 20n)])
  // overlapping, adjacent, and fully-contained all collapse into one range
  expect(mergeRanges([r(1n, 5n), r(4n, 9n), r(10n, 12n), r(6n, 7n)])).toEqual([r(1n, 12n)])
})

// Regression pin: one of the three former copies of this function seeded its accumulator with the
// CALLER'S first range object instead of a copy, so merging an array quietly rewrote the caller's
// data (a scan's `covered`, the index's cached coverage) as it widened ranges.
test('mergeRanges does not mutate its input array or the range objects in it', () => {
  const first = r(1n, 5n)
  const second = r(4n, 9n)
  const input = [first, second]

  const merged = mergeRanges(input)

  expect(merged).toEqual([r(1n, 9n)])
  expect(first).toEqual(r(1n, 5n))
  expect(second).toEqual(r(4n, 9n))
  expect(input).toEqual([r(1n, 5n), r(4n, 9n)])
  expect(merged[0]).not.toBe(first)
})

test('intersectRanges keeps only blocks both sides cover', () => {
  expect(intersectRanges([r(1n, 10n)], [r(5n, 20n)])).toEqual([r(5n, 10n)])
  expect(intersectRanges([r(1n, 4n)], [r(5n, 9n)])).toEqual([])
  expect(intersectRanges([], [r(1n, 9n)])).toEqual([])
  // pieces that meet after intersection come back merged, not fragmented
  expect(intersectRanges([r(1n, 5n), r(6n, 10n)], [r(1n, 10n)])).toEqual([r(1n, 10n)])
})

test('subtractRanges removes covered blocks, splitting a range when the cut is interior', () => {
  expect(subtractRanges([r(1n, 10n)], [r(4n, 6n)])).toEqual([r(1n, 3n), r(7n, 10n)])
  expect(subtractRanges([r(1n, 10n)], [r(1n, 10n)])).toEqual([])
  expect(subtractRanges([r(1n, 10n)], [])).toEqual([r(1n, 10n)])
  expect(subtractRanges([r(1n, 10n)], [r(20n, 30n)])).toEqual([r(1n, 10n)])
})

test('subtractRanges never hands back the caller\'s own array — the module\'s no-aliasing promise', () => {
  // The one path that used to leak it: nothing to cut, so the loop body never ran and the seed
  // (`from` itself) fell straight out. A caller pushing onto the result then grew its own input,
  // which is exactly the mutation-through-a-returned-value bug this module's header says none of
  // these functions has. `remove: []` and a fully-disjoint `remove` are the two ways to reach it.
  const from = [r(1n, 10n)]
  for (const remove of [[], [r(20n, 30n)]]) {
    const result = subtractRanges(from, remove)
    expect(result).not.toBe(from)
    result.push(r(100n, 200n))
    expect(from).toEqual([r(1n, 10n)])
  }
})

test('intersectAll intersects every set; empty input is empty', () => {
  expect(intersectAll([])).toEqual([])
  expect(intersectAll([[r(1n, 10n)]])).toEqual([r(1n, 10n)])
  expect(intersectAll([[r(1n, 10n)], [r(5n, 20n)], [r(6n, 8n)]])).toEqual([r(6n, 8n)])
  // one query covering nothing means the endpoint is covered nowhere
  expect(intersectAll([[r(1n, 10n)], []])).toEqual([])
})

// ---------------------------------------------------------------------------
// C4-T1 mutation-audit kills: R2 (mergeRanges' `+1n` adjacency literal
// widened to `+2n`, over-merging across a genuine one-block gap) and R5
// (intersectRanges' `from <= to` boundary narrowed to `from < to`, dropping
// an exact single-block intersection). Both mutants are confirmed surviving
// the pre-existing example-based suite above (verified locally: each literal
// mutated in turn, full package suite still green) — a hand-picked example
// test only ever probes the exact numbers it was written with, so a mutant
// one off from those numbers slips through. A property over an arbitrary set
// of ranges, checked at BLOCK-LEVEL MEMBERSHIP across the whole domain, has
// no such blind spot: any block the mutant reports differently from the
// straightforward definition (mergeRanges' set = the union of the inputs;
// intersectRanges' set = the AND of the two inputs) fails the property,
// wherever in the domain it happens to fall.
// ---------------------------------------------------------------------------

/** The whole domain small ranges are drawn over: small enough that 100 random trials collide on
 * exact adjacency/single-block-overlap edges routinely (this is the birthday-paradox lever — a
 * 0..200 domain would make R5's single-block-overlap case a near-miss most runs), large enough to
 * still exercise multi-range merging/intersection with room to spare. */
const DOMAIN_MAX = 24n

/** An arbitrary array of well-formed (fromBlock <= toBlock) ranges over `[0, DOMAIN_MAX]`. */
function rangesArb(): fc.Arbitrary<BlockRange[]> {
  return fc
    .array(fc.tuple(fc.bigInt(0n, DOMAIN_MAX), fc.bigInt(0n, DOMAIN_MAX)), { maxLength: 10 })
    .map((pairs) => pairs.map(([a, b]) => (a <= b ? r(a, b) : r(b, a))))
}

/** Every block in `[0, DOMAIN_MAX]` covered by at least one of `ranges` — the ground truth
 * `mergeRanges`'/`intersectRanges`' own output is checked against, computed the dumbest possible
 * way (one-by-one) rather than with any of this file's own set arithmetic. */
function coveredBlocks(ranges: BlockRange[]): Set<bigint> {
  const covered = new Set<bigint>()
  for (const range of ranges) for (let b = range.fromBlock; b <= range.toBlock; b++) covered.add(b)
  return covered
}

function membershipOf(ranges: BlockRange[], block: bigint): boolean {
  return ranges.some((range) => block >= range.fromBlock && block <= range.toBlock)
}

test('mergeRanges property: the merged set covers exactly the union of the input blocks — no block more, no block less (R2)', () => {
  fc.assert(
    fc.property(rangesArb(), (ranges) => {
      const merged = mergeRanges(ranges)
      const want = coveredBlocks(ranges)
      for (let b = 0n; b <= DOMAIN_MAX; b++) {
        if (membershipOf(merged, b) !== want.has(b)) return false
      }
      // A genuine set-arithmetic property, not just membership: also disjoint and sorted, which is
      // `mergeRanges`' other half of the contract (membership alone would not fail a merge that
      // stayed correct but re-fragmented, e.g. reported [1,9] as two overlapping [1,5]+[4,9]).
      for (let i = 1; i < merged.length; i++) {
        if (merged[i]!.fromBlock <= merged[i - 1]!.toBlock + 1n) return false
      }
      return true
    }),
  )
})

test('intersectRanges property: membership is the AND of the two inputs\' memberships (R5)', () => {
  fc.assert(
    fc.property(rangesArb(), rangesArb(), (a, b) => {
      const intersected = intersectRanges(a, b)
      for (let block = 0n; block <= DOMAIN_MAX; block++) {
        const want = membershipOf(a, block) && membershipOf(b, block)
        if (membershipOf(intersected, block) !== want) return false
      }
      return true
    }),
  )
})
