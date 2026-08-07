import type { BlockRange } from '../types'

// ---------------------------------------------------------------------------
// Block-range set arithmetic — the one definition of it in this package.
//
// Three call sites need the same algebra for different reasons: the log
// scanner folds the chunks it actually covered, the pool index maintains its
// per-(protocol, scope) coverage cache, and the wave engine reasons about what
// *this* search observed (which is not the index's merged view). They used to
// carry three near-identical private copies, one of which seeded its
// accumulator with the caller's own first range object and then mutated it —
// so merging a caller's array quietly rewrote the caller's data. Every
// function here is pure: no input array or range object is ever mutated, and
// every range these functions *widen* is a fresh object.
//
// Ranges are inclusive on both ends, and `toBlock + 1n` counts as adjacent
// (blocks are discrete), so [1,5] and [6,9] merge into [1,9].
// ---------------------------------------------------------------------------

export function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b
}

/** Merges a set of ranges (in any order) into the minimal sorted set of disjoint ranges. */
export function mergeRanges(ranges: BlockRange[]): BlockRange[] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => (a.fromBlock < b.fromBlock ? -1 : a.fromBlock > b.fromBlock ? 1 : 0))
  const merged: BlockRange[] = [{ ...sorted[0]! }]
  for (const r of sorted.slice(1)) {
    const last = merged[merged.length - 1]!
    if (r.fromBlock <= last.toBlock + 1n) {
      if (r.toBlock > last.toBlock) last.toBlock = r.toBlock
    } else {
      merged.push({ ...r })
    }
  }
  return merged
}

/** Ranges covered by *both* inputs. Adjacency needs two topic-position queries per endpoint, and an
 * endpoint range is only genuinely covered where every one of those queries succeeded. */
export function intersectRanges(a: BlockRange[], b: BlockRange[]): BlockRange[] {
  const out: BlockRange[] = []
  for (const x of a) {
    for (const y of b) {
      const from = x.fromBlock > y.fromBlock ? x.fromBlock : y.fromBlock
      const to = x.toBlock < y.toBlock ? x.toBlock : y.toBlock
      if (from <= to) out.push({ fromBlock: from, toBlock: to })
    }
  }
  return mergeRanges(out)
}

/** `from` minus `remove` — used to keep one search from asking for the same blocks twice. */
export function subtractRanges(from: BlockRange[], remove: BlockRange[]): BlockRange[] {
  let result = from
  for (const cut of mergeRanges(remove)) {
    const next: BlockRange[] = []
    for (const range of result) {
      if (cut.toBlock < range.fromBlock || cut.fromBlock > range.toBlock) {
        next.push(range)
        continue
      }
      if (range.fromBlock < cut.fromBlock) next.push({ fromBlock: range.fromBlock, toBlock: cut.fromBlock - 1n })
      if (range.toBlock > cut.toBlock) next.push({ fromBlock: cut.toBlock + 1n, toBlock: range.toBlock })
    }
    result = next
  }
  return result
}

export function intersectAll(ranges: BlockRange[][]): BlockRange[] {
  if (ranges.length === 0) return []
  return ranges.reduce((acc, r) => intersectRanges(acc, r))
}
