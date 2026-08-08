import type { Address, Hex } from 'viem'

import { MAX_INTERMEDIATES, MAX_POOLS_DIRECT, MAX_POOLS_PER_LEG, MAX_QUOTE_CANDIDATES } from '../constants'
import { toGraphNode } from '../internal/currency'
import type { PoolIndex } from '../pools/poolIndex'
import { isDiscredited } from '../pools/poolIndex'
import { isHooked } from '../protocols'
import type { CurrencyRef, PoolRecord, PoolRef, RouteCandidate, RouteLeg } from '../types'

// ---------------------------------------------------------------------------
// Candidate generation — bounded, deterministic enumeration over the pool
// graph.
//
// Direct pools (tokenIn <-> tokenOut) always come first; two-hop candidates
// are the intersection of tokenIn's and tokenOut's graph neighbors, one
// intermediate hop each side. Every cap lives here (MAX_POOLS_DIRECT for the
// direct pair, MAX_POOLS_PER_LEG for each two-hop leg selection,
// MAX_INTERMEDIATES intermediates, MAX_QUOTE_CANDIDATES total — the last one
// DERIVED from the first three, see constants.ts), with one per-pair slot
// always reserved for the newest pool so a fresh deployment is never starved
// out by an otherwise-full cap. Legs are
// materialized straight from their own pool's `currencies`, which are already
// in domain form: v4's native side is the 'native' CurrencyRef; v2/v3 have no
// native pools, so their native-family side is always the wrapped address (two
// legs either side of a protocol boundary may therefore differ in currency
// *form* — that's expected, the plan compiler inserts conversions later).
// `hookData` (keyed by lowercased poolId) is stamped onto v4 legs only.
// ---------------------------------------------------------------------------

export type GenerateRoutesArgs = {
  tokenIn: CurrencyRef
  tokenOut: CurrencyRef
  index: PoolIndex
  /** Defaults to an empty map — the common case for a caller with no v4 hookData to stamp. */
  hookData?: Map<string, Hex>
  wrappedNative: Address
  /** Priority order for two-hop intermediates: hinted tokens, then this list (the engine merges
   * successful and core intermediates into it, in priority order), then newest, then stable. */
  successfulIntermediates?: string[]
  /**
   * Best single-leg quoted `amountOut` observed THIS SEARCH, keyed by `pool.id` — the engine's own
   * probe/quote results fed back into selection (see `search/waves.ts#recordQuoteEvidence`).
   *
   * WHY SELECTION NEEDS IT (the warm-index regression this fixes): with no evidence, the per-pair
   * ranking below falls through to newest-`createdAtBlock`, which under slot pressure is not merely
   * liquidity-blind but liquidity-HOSTILE — on a dense mainnet index the junk/copycat pools of a
   * pair postdate the canonical liquid one, so a selection of 3-of-13 handed every slot to junk and
   * the pool that actually carries the pair was never quoted at all. A cold search dodged this only
   * by accident of arrival order (its wave-1 probes quoted the liquid pool while the index was
   * still sparse, and the success mark held the slot once density arrived); a warm index faces full
   * density from wave 0 and, measured live, routed 5.6x worse than cold on the same chain state.
   *
   * WHY THE VALUES ARE COMPARABLE, AND EXACTLY WHERE. Scores are compared ONLY between pools of the
   * same pair, inside one `selectPools` call — and within one search every single-leg quote of a
   * given pair used the same input amount, the same direction (each two-hop leg contains an
   * endpoint, so a pair's orientation is fixed for the whole search), and the same pinned block. A
   * bigger number is therefore a strictly better answer to the identical question, which is a
   * ranking signal no static heuristic (age, provenance, fee tier) can beat. It is deliberately
   * per-search and never persisted: across blocks/amounts the numbers stop being commensurable.
   */
  quoteEvidence?: ReadonlyMap<string, bigint>
}

export type GenerateRoutesResult = {
  candidates: RouteCandidate[]
  /** Three independent counters, each in its own unit — never summed together, since the caps they
   * report on bite at different granularities. `intermediates`: eligible two-hop intermediate nodes
   * dropped by `MAX_INTERMEDIATES`. `pools`: individual pools dropped by the per-pair cap
   * (`MAX_POOLS_DIRECT` for the direct pair, `MAX_POOLS_PER_LEG` for a two-hop leg selection), summed
   * across the direct pair and every two-hop leg selection. `candidates`: whole candidates dropped by
   * the total-candidate cap (`MAX_QUOTE_CANDIDATES`) once direct and two-hop candidates are combined —
   * see that constant's doc comment for why, at today's values, this counter can never actually fire:
   * the cap is derived to exactly bound what this function can produce. */
  pruned: { intermediates: number; pools: number; candidates: number }
  /**
   * Eligible two-hop intermediate nodes this enumeration SAW: the intersection of `tokenIn`'s and
   * `tokenOut`'s graph neighbors, minus either endpoint. Reported alongside
   * {@link GenerateRoutesResult.intermediatesSelected} (which is this, capped by `MAX_INTERMEDIATES`)
   * so the pair always describes the same index at the same instant — `search/report.ts` used to
   * re-walk the intersection itself at report-assembly time, which is the exact drift class the
   * `intermediatesSelected` comment above warns about, just in the other field.
   */
  intermediatesDiscovered: number
  /** The actual number of intermediate nodes selected for two-hop enumeration (≤ `MAX_INTERMEDIATES`) —
   * the real count the engine used, not re-derived downstream from `intermediatesDiscovered`. */
  intermediatesSelected: number
}

/** Materializes a leg for `pool`, orienting currencyIn/currencyOut so currencyIn's graph node matches `fromNode`. */
function materializeLeg(pool: PoolRef, fromNode: Address, wrappedNative: Address, hookData: Map<string, Hex>): RouteLeg {
  const [c0, c1] = pool.currencies
  const [currencyIn, currencyOut] = toGraphNode(c0, wrappedNative) === fromNode ? [c0, c1] : [c1, c0]
  const leg: RouteLeg = { pool, currencyIn, currencyOut }
  if (pool.protocol === 'v4') {
    const stamped = hookData.get(pool.poolId.toLowerCase())
    if (stamped !== undefined) leg.hookData = stamped
  }
  return leg
}

/**
 * The provenance tier a record ranks in — the first and strongest key of {@link comparePoolPriority}.
 *
 * Three tiers, not two, because a hint is an *unverified assertion* and the index has no way to
 * check it up front (v2/v4 `validateHint` is a pure local derivation; see
 * `pools/poolIndex.ts#isDiscredited`). A hint that the chain has since contradicted — never quoted,
 * failed at two distinct blocks — therefore sinks BELOW the pools discovery actually proved exist,
 * rather than merely losing its bonus. It is not dropped: it stays enumerable behind the real
 * pools, and one successful quote restores it to tier 0.
 */
function sourceTier(rec: PoolRecord): number {
  if (rec.source !== 'hint') return 1
  return isDiscredited(rec) ? 2 : 0
}

/**
 * Per-pair pool priority, as a total order: hinted first (unless discredited, which sinks below
 * everything — see {@link sourceTier}), then this search's own quote evidence (largest observed
 * single-leg output first, evidenced over unevidenced — see
 * {@link GenerateRoutesArgs.quoteEvidence}), then previously-successful (most recent success
 * first), then newest `createdAtBlock`, then unhooked v4 over hooked, then a fully deterministic
 * tie-break by pool identity. Used both to rank pools within the cap and (via `pickNewest`) to
 * decide who gets the reserved newest-pool slot.
 *
 * EVIDENCE OUTRANKS HISTORY OUTRANKS AGE, and the order is the point: `lastQuoteSuccessBlock` is
 * boolean-per-block — a junk pool that answered a quote with a terrible price carries the same
 * mark, at the same block, as the pool that carries the pair — so once several pools of one pair
 * have succeeded, success recency alone collapses back to the newest-created tie-break that
 * mis-ranks dense pairs in the first place. The quoted output is the only signal that separates
 * "answered" from "answered well", and it is fresher than any success block by construction (it
 * was measured at THIS search's pinned block, at this request's amount).
 */
function comparePoolPriority(a: PoolRecord, b: PoolRecord, quoteEvidence?: ReadonlyMap<string, bigint>): number {
  const aHint = sourceTier(a)
  const bHint = sourceTier(b)
  if (aHint !== bHint) return aHint - bHint

  const aOut = quoteEvidence?.get(a.pool.id)
  const bOut = quoteEvidence?.get(b.pool.id)
  if (aOut !== undefined || bOut !== undefined) {
    if (aOut === undefined) return 1
    if (bOut === undefined) return -1
    if (aOut !== bOut) return aOut > bOut ? -1 : 1
  }

  const aSucc = a.lastQuoteSuccessBlock
  const bSucc = b.lastQuoteSuccessBlock
  if (aSucc !== undefined || bSucc !== undefined) {
    if (aSucc === undefined) return 1
    if (bSucc === undefined) return -1
    if (aSucc !== bSucc) return aSucc > bSucc ? -1 : 1
  }

  const aCreated = a.createdAtBlock
  const bCreated = b.createdAtBlock
  if (aCreated !== undefined || bCreated !== undefined) {
    if (aCreated === undefined) return 1
    if (bCreated === undefined) return -1
    if (aCreated !== bCreated) return aCreated > bCreated ? -1 : 1
  }

  const aHooked = isHooked(a.pool) ? 1 : 0
  const bHooked = isHooked(b.pool) ? 1 : 0
  if (aHooked !== bHooked) return aHooked - bHooked

  return a.pool.id < b.pool.id ? -1 : a.pool.id > b.pool.id ? 1 : 0
}

/** The pool with the highest `createdAtBlock` (deterministic tie-break by pool identity); undefined if none has one. */
function pickNewest(records: PoolRecord[]): PoolRecord | undefined {
  let best: PoolRecord | undefined
  for (const r of records) {
    if (r.createdAtBlock === undefined) continue
    if (best === undefined) {
      best = r
      continue
    }
    // Invariant: whenever `best` is set, `best.createdAtBlock` is defined (only records that pass
    // the `undefined` check above ever become `best`).
    const bestBlock = best.createdAtBlock as bigint
    if (r.createdAtBlock > bestBlock || (r.createdAtBlock === bestBlock && r.pool.id < best.pool.id)) {
      best = r
    }
  }
  return best
}

/** Selects ≤ `cap` records by `comparePoolPriority`, with one slot always reserved for the newest `createdAtBlock` pool. */
function selectPools(
  records: PoolRecord[],
  cap: number,
  quoteEvidence?: ReadonlyMap<string, bigint>,
): { selected: PoolRecord[]; prunedCount: number } {
  const sorted = [...records].sort((a, b) => comparePoolPriority(a, b, quoteEvidence))
  if (sorted.length <= cap) return { selected: sorted, prunedCount: 0 }

  let selected = sorted.slice(0, cap)
  const newest = pickNewest(records)
  if (newest && !selected.some((r) => r.pool.id === newest.pool.id)) {
    selected = [...selected.slice(0, cap - 1), newest]
  }
  return { selected, prunedCount: records.length - cap }
}

function touchingRecords(node: string, neighborsIn: Map<string, PoolRecord[]>, neighborsOut: Map<string, PoolRecord[]>): PoolRecord[] {
  return [...(neighborsIn.get(node) ?? []), ...(neighborsOut.get(node) ?? [])]
}

/** A node is "hinted" only while at least one hint touching it is still credible — a discredited
 * hint must not keep buying its intermediate a top slot any more than it keeps its own pool one. */
function isHintedNode(node: string, neighborsIn: Map<string, PoolRecord[]>, neighborsOut: Map<string, PoolRecord[]>): boolean {
  return touchingRecords(node, neighborsIn, neighborsOut).some((r) => r.source === 'hint' && !isDiscredited(r))
}

function newestBlockForNode(node: string, neighborsIn: Map<string, PoolRecord[]>, neighborsOut: Map<string, PoolRecord[]>): bigint | undefined {
  let best: bigint | undefined
  for (const r of touchingRecords(node, neighborsIn, neighborsOut)) {
    if (r.createdAtBlock !== undefined && (best === undefined || r.createdAtBlock > best)) best = r.createdAtBlock
  }
  return best
}

/**
 * Orders eligible intermediate graph nodes: hinted first, then `successfulIntermediates` in the
 * given order (the engine merges core intermediates into this list before calling in), then
 * newest-touching-pool first, then a fully deterministic lexical tie-break.
 */
function orderIntermediates(
  nodes: string[],
  neighborsIn: Map<string, PoolRecord[]>,
  neighborsOut: Map<string, PoolRecord[]>,
  successfulIntermediates: string[],
): string[] {
  const successIndex = new Map<string, number>()
  successfulIntermediates.forEach((s, i) => {
    const key = s.toLowerCase()
    if (!successIndex.has(key)) successIndex.set(key, i)
  })

  return [...nodes].sort((a, b) => {
    const aHint = isHintedNode(a, neighborsIn, neighborsOut) ? 0 : 1
    const bHint = isHintedNode(b, neighborsIn, neighborsOut) ? 0 : 1
    if (aHint !== bHint) return aHint - bHint

    const aSucc = successIndex.get(a)
    const bSucc = successIndex.get(b)
    if (aSucc !== undefined || bSucc !== undefined) {
      if (aSucc === undefined) return 1
      if (bSucc === undefined) return -1
      if (aSucc !== bSucc) return aSucc - bSucc
    }

    const aNewest = newestBlockForNode(a, neighborsIn, neighborsOut)
    const bNewest = newestBlockForNode(b, neighborsIn, neighborsOut)
    if (aNewest !== bNewest) {
      if (aNewest === undefined) return 1
      if (bNewest === undefined) return -1
      return aNewest > bNewest ? -1 : 1
    }

    return a < b ? -1 : a > b ? 1 : 0
  })
}

/**
 * Generates ≤ `MAX_QUOTE_CANDIDATES` deterministic route candidates for `tokenIn -> tokenOut`:
 * direct pools first, then two-hop candidates through the graph-neighbor intersection. Every cap
 * is enforced here — the wave engine (Task 17) just quotes what comes back.
 */
export function generateRoutes(args: GenerateRoutesArgs): GenerateRoutesResult {
  const { tokenIn, tokenOut, index, hookData = new Map<string, Hex>(), wrappedNative, successfulIntermediates = [], quoteEvidence } = args

  const inNode = toGraphNode(tokenIn, wrappedNative)
  const outNode = toGraphNode(tokenOut, wrappedNative)

  let prunedPools = 0

  // Direct pools. Linear cost (one candidate per pool kept), so this gets the larger cap.
  const directRecords = index.pair(tokenIn, tokenOut)
  const directSelection = selectPools(directRecords, MAX_POOLS_DIRECT, quoteEvidence)
  prunedPools += directSelection.prunedCount
  const directCandidates: RouteCandidate[] = directSelection.selected.map((rec) => ({
    legs: [materializeLeg(rec.pool, inNode, wrappedNative, hookData)],
  }))

  // Two-hop: intersection of tokenIn's and tokenOut's graph neighbors, excluding either endpoint
  // (family-normalized — 'native' and the wrapped address share a graph node).
  const neighborsIn = index.neighbors(tokenIn)
  const neighborsOut = index.neighbors(tokenOut)
  const eligibleIntermediates: string[] = []
  for (const node of neighborsIn.keys()) {
    if (node === inNode || node === outNode) continue
    if (neighborsOut.has(node)) eligibleIntermediates.push(node)
  }

  const orderedIntermediates = orderIntermediates(eligibleIntermediates, neighborsIn, neighborsOut, successfulIntermediates)
  const selectedIntermediates = orderedIntermediates.slice(0, MAX_INTERMEDIATES)
  const prunedIntermediates = Math.max(0, eligibleIntermediates.length - selectedIntermediates.length)

  // Two-hop legs. Quadratic cost per intermediate (in-leg selection × out-leg selection), so this
  // gets the smaller cap — see MAX_POOLS_PER_LEG's doc comment.
  const twoHopCandidates: RouteCandidate[] = []
  for (const node of selectedIntermediates) {
    const inSelection = selectPools(neighborsIn.get(node)!, MAX_POOLS_PER_LEG, quoteEvidence)
    const outSelection = selectPools(neighborsOut.get(node)!, MAX_POOLS_PER_LEG, quoteEvidence)
    prunedPools += inSelection.prunedCount + outSelection.prunedCount

    for (const r1 of inSelection.selected) {
      const leg1 = materializeLeg(r1.pool, inNode, wrappedNative, hookData)
      for (const r2 of outSelection.selected) {
        if (r1.pool.id === r2.pool.id) continue // never reuse a pool within a candidate
        const leg2 = materializeLeg(r2.pool, node as Address, wrappedNative, hookData)
        twoHopCandidates.push({ legs: [leg1, leg2] })
      }
    }
  }

  // STRUCTURAL BACKSTOP, NOT AN EXPECTED TRIM (C4-P7). `MAX_QUOTE_CANDIDATES` is derived
  // (`constants.ts`) to exactly bound `directSelection.selected.length` (≤ MAX_POOLS_DIRECT) plus the
  // two-hop total (≤ MAX_INTERMEDIATES × MAX_POOLS_PER_LEG²), so `all.length` can never exceed it
  // through this function's own per-pair/intermediate caps alone — this branch only guards against
  // the derivation and the enumeration above drifting apart in some future change (a third hop, a
  // relaxed per-leg cap that outpaces the constant), rather than firing under today's constants.
  const all = [...directCandidates, ...twoHopCandidates]
  let candidates = all
  let prunedCandidates = 0
  if (all.length > MAX_QUOTE_CANDIDATES) {
    candidates = all.slice(0, MAX_QUOTE_CANDIDATES)
    prunedCandidates = all.length - MAX_QUOTE_CANDIDATES
  }

  return {
    candidates,
    pruned: { intermediates: prunedIntermediates, pools: prunedPools, candidates: prunedCandidates },
    intermediatesDiscovered: eligibleIntermediates.length,
    intermediatesSelected: selectedIntermediates.length,
  }
}
