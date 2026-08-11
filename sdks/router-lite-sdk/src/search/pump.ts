import type { Address, Hex, PublicClient } from 'viem'

import { MEASUREMENT_PAIR_CEILING, PUMP_ROUND_CAP, PUMP_VANGUARD_LEGS } from '../constants'
import { sortAddresses, toGraphNode } from '../internal/currency'
import type { Semaphore } from '../internal/rpc'
import type { PoolIndex } from '../pools/poolIndex'
import { v2PoolRef, v3PoolRef, v4PoolRef } from '../protocols/poolRef'
import type { ProtocolModule } from '../protocols/types'
import { computeV2PairAddress } from '../protocols/v2'
import { computeV3PoolAddress } from '../protocols/v3'
import type { LegOutcome, LegRequest } from '../quote/measure'
import { measureLegs } from '../quote/measure'
import { rankRoutes } from '../quote/rank'
import type {
  ChainManifest,
  CurrencyRef,
  PoolHint,
  PoolRef,
  Protocol,
  QuotedRoute,
  QuoteRequest,
  RouteLeg,
} from '../types'
import { PROTOCOLS } from '../types'

import type { Notifier } from './notify'
import type { LegDirection, Measurement, SearchState } from './state'
import { applyMeasurement, measurementKey } from './state'

// ---------------------------------------------------------------------------
// The pricing pump (spec §3.2) — the engine's one convergence process over
// prices. It converges the measurement ledger toward: every measurable leg of
// every relevant pair, priced at the pinned block, at the amount the leg would
// actually see.
//
//   - RELEVANT PAIRS: the direct pair, plus (in, X) and (X, out) for each
//     intermediate the frontier has selected. The pump only READS the selected
//     list — growth is the solver loop's frontier advance — and refreshes
//     `state.intermediates.discovered` from `orderedIntermediates` so the
//     report's pruned count always describes the index at this instant.
//   - MEASURABLE LEGS: every pool the index knows on the pair, plus HYPOTHESES
//     — identities derivable without discovery: the modules' `hypotheses()`
//     (v2/v3 CREATE2 at standard + fee-scan tiers, v4 standard configs) and
//     the request's hints, whose identity derives locally from `validateHint`'s
//     pure half. A hint is proven or refuted BY MEASUREMENT: success upserts it
//     (source 'hint'), a data-less revert feeds `markNegative` and the existing
//     discredit history. There are no separate probe/validation channels —
//     everything is a measurement.
//   - AMOUNTS: direct and in-legs at `amountIn`; out-legs for X at `m_X`, the
//     best realized in-leg output for X, DEFERRED until an in-leg answers.
//     When `m_X` improves, X's stale out-leg entries are deleted from the
//     ledger (they were exact answers to a question no route asks anymore) and
//     re-plan at the new amount; quoting counters stay put — they count
//     dispatches, which happened.
//   - DEDUP IS THE LEDGER ITSELF: a leg's key (pool, direction, amount) is the
//     work queue's own key, so a leg is measured once per search by
//     construction — `measurements`/`measuredKeys`/`inFlightKeys` are the only
//     gate, and the one transport re-release per key comes from `state.ts`'s
//     own settle rules, not from any bookkeeping here.
//
// COMPOSITION rides on monotonicity: AMM legs never give less out for more in,
// so (best in-leg) chained with (any out-leg measured at that in-leg's realized
// output) dominates every other (in, out) combination through X. Composed
// two-hops are therefore EXACT chained on-chain numbers, not estimates, and
// dominated combinations are provably inferior rather than unpriced-and-hidden.
//
// This module is pull-driven and RPC-bounded: one `pump()` call plans over
// current knowledge and dispatches at most PUMP_ROUND_CAP legs as ONE
// `measureLegs` round. With a waker (`ctx.wake` — the live loop) the round is
// DETACHED and outcomes apply per settled envelope, each application poking
// the wake — leads at envelope cadence, with `inFlightKeys` holding `pumpDry`
// false until the last answer lands (see `pump`'s docstring for the full
// contract, including abort inertness and bug containment). Without one, the
// round is awaited whole and nothing outlives the call. No timers either way.
// ---------------------------------------------------------------------------

export type PumpCtx = {
  index: PoolIndex
  modules: Record<Protocol, ProtocolModule>
  manifest: ChainManifest
  /** Request-scoped v4 hook data, keyed by lowercased poolId (`search/hookData.ts#buildHookData`).
   * Threaded onto every v4 `LegRequest` — a hooked pool measured without its hookData is priced
   * against a call the swap will never make. */
  hookData: Map<string, Hex>
  /** `req.hints` — caller-supplied hypotheses, planned with 'hint' provenance. */
  hints: PoolHint[]
  client: Pick<PublicClient, 'request'>
  semaphore?: Semaphore | undefined
  multicall3?: Address | undefined
  signal?: AbortSignal | undefined
  /**
   * The search's wake notifier, when a loop is driving this pump. Present, a round is dispatched
   * DETACHED and its outcomes apply per settled envelope (see {@link pump} — leads at envelope
   * cadence); absent (unit pumps, golden replays, any caller without an event loop to wake), the
   * round is awaited whole and `pump()` returns with every outcome applied, exactly the pre-seam
   * behavior.
   */
  wake?: Notifier | undefined
}

/** Where a planned leg's pool identity came from — decides the on-success index bookkeeping
 * (`index` pools are merely re-touched; proven hypotheses upsert as 'factory', hints as 'hint').
 * 'factory' IS this vocabulary's 'hypothesis' under the older wire name `PoolRecord.source` uses —
 * see `types.ts#PoolRecord.source`. */
type Provenance = 'index' | 'hypothesis' | 'hint'

export type PlannedLeg = {
  leg: LegRequest
  provenance: Provenance
  /** Which amount rule priced this leg, and (for two-hop legs) through which intermediate node. */
  role: { kind: 'direct' } | { kind: 'in'; x: string } | { kind: 'out'; x: string }
}

/**
 * The pump's early-exit cursor: what the last planning pass saw, per search. `dirty` means the last
 * cycle dispatched something — its outcomes may have created new due legs (a fresh `m_X` wakes
 * deferred out-legs, a transport loss re-releases its key), so the next cycle must re-plan. A clean
 * cursor whose inputs (`indexVersion`, the frontier's selected count) have not moved makes the next
 * `pump()`/`pumpDry()` O(1) — a storm of wakes with no new knowledge costs one planning pass, total.
 *
 * A WeakMap keyed by the state rather than a field ON the state: this is the pump's private memo of
 * its own last look, not search knowledge — nothing else may read it, and replaying an outcome log
 * through `apply*` must not need to reproduce it.
 */
type PumpCursor = { indexVersion: number; selectedCount: number; dirty: boolean }

const cursors = new WeakMap<SearchState, PumpCursor>()

function cursorClean(state: SearchState): boolean {
  const cursor = cursors.get(state)
  return (
    cursor !== undefined &&
    !cursor.dirty &&
    cursor.indexVersion === state.indexVersion &&
    cursor.selectedCount === state.intermediates.selected.length
  )
}

/**
 * True when a `pump()` call right now would find nothing to do AND nothing it already asked for is
 * still in flight — the loop's gate for opening full coverage and advancing the intermediates
 * frontier, and one leg of its termination check. Structural, not speculative: the first half is
 * exactly the pump's own early-exit predicate, so the two can never disagree about what "dry"
 * means; the second half (`inFlightKeys`) is what keeps a DETACHED round's pending answers counted
 * as work — without it a search could open the gate, or terminate, over measurements whose
 * outcomes were one envelope away from arriving.
 */
export function pumpDry(state: SearchState, _ctx: PumpCtx): boolean {
  return cursorClean(state) && state.inFlightKeys.size === 0
}

/**
 * A hint's pool identity, derived by `validateHint`'s PURE half — no RPC from planning, ever. v2 and
 * v4 identities are pure derivations already; v3's fee rides in the hint, so its CREATE2 address is
 * local too (the on-chain `getPool` lookup the old resolver made was only ever an existence check,
 * and existence is now the measurement's job). A hint that names a `pool` disagreeing with its own
 * derivation is dropped, exactly as the impure validators dropped it.
 */
function hintRef(hint: PoolHint, m: ChainManifest): PoolRef | undefined {
  if (hint.protocol === 'v2') {
    if (!m.v2) return undefined
    const address = computeV2PairAddress(m.v2.factory, hint.token0, hint.token1, m.v2.initCodeHash)
    if (hint.pool !== undefined && hint.pool.toLowerCase() !== address.toLowerCase()) return undefined
    return v2PoolRef(address, hint.token0, hint.token1)
  }
  if (hint.protocol === 'v3') {
    if (!m.v3) return undefined
    const address = computeV3PoolAddress(m.v3.factory, hint.token0, hint.token1, hint.fee, m.v3.poolInitCodeHash)
    if (hint.pool !== undefined && hint.pool.toLowerCase() !== address.toLowerCase()) return undefined
    return v3PoolRef(address, hint.token0, hint.token1, hint.fee)
  }
  if (!m.v4) return undefined
  const { fee, tickSpacing, hooks } = hint.poolKey
  const [currency0, currency1] = sortAddresses(hint.poolKey.currency0, hint.poolKey.currency1)
  return v4PoolRef({ currency0, currency1, fee, tickSpacing, hooks })
}

function hintHypotheses(ctx: PumpCtx): PoolRef[] {
  const seen = new Set<string>()
  const refs: PoolRef[] = []
  for (const hint of ctx.hints) {
    const ref = hintRef(hint, ctx.manifest)
    if (ref !== undefined && !seen.has(ref.id)) {
      seen.add(ref.id)
      refs.push(ref)
    }
  }
  return refs
}

/**
 * Materializes a leg for `pool` oriented so `currencyIn`'s graph node is `fromNode`, keeping the
 * currency FORM of the pool's own `currencies` (a v4 native side stays the 'native' CurrencyRef;
 * v2/v3 sides are always concrete addresses) — two legs either side of a protocol boundary may
 * therefore differ in form, and the plan compiler inserts conversions later. `hookData` (keyed by
 * lowercased poolId) is stamped onto v4 legs only. The same rules as the enumeration this replaces.
 */
function materializeLeg(pool: PoolRef, fromNode: Address, wrappedNative: Address, hookData: Map<string, Hex>): RouteLeg {
  const [c0, c1] = pool.currencies
  const [currencyIn, currencyOut] = toGraphNode(c0, wrappedNative) === fromNode ? [c0, c1] : [c1, c0]
  return stampHookData({ pool, currencyIn, currencyOut }, hookData)
}

/**
 * Stamps the caller's `hookData` (keyed by lowercased poolId) onto a v4 leg, in place, and hands the
 * leg back. THE ONLY PLACE THE STAMP HAPPENS: planning materializes a leg from a pool ref
 * ({@link materializeLeg}), composition rebuilds one from a measurement ({@link legOf}), and both
 * must produce byte-identical hookData or the leg the search PRICED is not the leg it ENCODES.
 * Non-v4 legs have no hookData slot and pass through untouched.
 */
function stampHookData(leg: RouteLeg, hookData: Map<string, Hex>): RouteLeg {
  if (leg.pool.protocol !== 'v4') return leg
  const stamped = hookData.get(leg.pool.poolId.toLowerCase())
  if (stamped !== undefined) leg.hookData = stamped
  return leg
}

/**
 * The pump's discovered intermediates ordering — hinted tokens, then manifest cores, then
 * neighbor-intersection nodes newest-touching-pool first — which is the one selection heuristic that
 * survives from the old enumeration (spec §3.2: a measurement-based ordering is dimensionally
 * impossible up front). The frontier grows `state.intermediates.selected` from exactly this list,
 * one batch per advance; the pump itself only reports its length as `discovered`.
 *
 * Endpoints are excluded (a token is never its own intermediate) and the list is deduped, so
 * `selected.length === discovered` really does mean "everything eligible is selected".
 */
export function orderedIntermediates(ctx: PumpCtx, req: QuoteRequest): string[] {
  const wrappedNative = ctx.manifest.wrappedNative
  const inNode = toGraphNode(req.tokenIn, wrappedNative)
  const outNode = toGraphNode(req.tokenOut, wrappedNative)
  const seen = new Set<string>([inNode, outNode])
  const ordered: string[] = []
  const push = (node: string): void => {
    if (!seen.has(node)) {
      seen.add(node)
      ordered.push(node)
    }
  }

  for (const ref of hintHypotheses(ctx)) {
    for (const currency of ref.currencies) push(toGraphNode(currency, wrappedNative))
  }
  for (const core of ctx.manifest.coreIntermediates ?? [wrappedNative]) push(core.toLowerCase())

  const neighborsIn = ctx.index.neighbors(req.tokenIn)
  const neighborsOut = ctx.index.neighbors(req.tokenOut)
  const newestOf = (node: string): bigint | undefined => {
    let best: bigint | undefined
    for (const rec of [...(neighborsIn.get(node) ?? []), ...(neighborsOut.get(node) ?? [])]) {
      if (rec.createdAtBlock !== undefined && (best === undefined || rec.createdAtBlock > best)) best = rec.createdAtBlock
    }
    return best
  }
  const eligible = [...neighborsIn.keys()].filter((node) => neighborsOut.has(node) && !seen.has(node))
  eligible.sort((a, b) => {
    const aNewest = newestOf(a)
    const bNewest = newestOf(b)
    if (aNewest !== bNewest) {
      if (aNewest === undefined) return 1
      if (bNewest === undefined) return -1
      return aNewest > bNewest ? -1 : 1
    }
    return a < b ? -1 : a > b ? 1 : 0
  })
  for (const node of eligible) push(node)
  return ordered
}

/**
 * The measurable pool set for one pair: `index.pair(...)` ∪ the modules' `hypotheses()` (with
 * fee-scan `extraFees` for v3) ∪ the request's hint-derived refs on this pair — deduped by
 * `pool.id`, minus pools negative at the pinned block, capped at MEASUREMENT_PAIR_CEILING.
 *
 * Hints are merged FIRST, for two reasons that are really one: a pool the caller asserted keeps
 * 'hint' provenance even when the index or a hypothesis also produces it (so its success upserts at
 * hint rank, exactly as the old resolver did), and the ceiling — which slices this list's tail —
 * can never silently drop a caller's own hint to keep a spam pool.
 *
 * THE REST OF THE ORDER IS EVIDENCE-FIRST, and it is load-bearing for latency rather than for
 * coverage: index pools sort by most recent proven quote (`lastQuoteSuccessBlock`), then newest
 * creation — the same two priors the old selection ranked on — with never-proven pools and then
 * bare hypotheses after. Planning order is dispatch order is ENVELOPE order (a detached round's
 * vanguard is exactly this list's head — see {@link pump}), so on a warm pair the first envelope
 * to settle carries last search's winner, and the first lead a `getQuote` stops at is the best
 * KNOWN answer rather than whichever fifty legs happened to answer first. An ordering, never a
 * selection: everything below the ceiling still measures; only WHEN moves. It also aims the
 * ceiling's tail-slice at the least-evidenced pools, which is the only defensible thing for an
 * abuse backstop to drop.
 */
function measurablePools(state: SearchState, ctx: PumpCtx, a: CurrencyRef, b: CurrencyRef, hintRefs: PoolRef[]): { ref: PoolRef; provenance: Provenance }[] {
  const wrappedNative = ctx.manifest.wrappedNative
  const aNode = toGraphNode(a, wrappedNative)
  const bNode = toGraphNode(b, wrappedNative)
  const byId = new Map<string, { ref: PoolRef; provenance: Provenance }>()

  for (const ref of hintRefs) {
    const [n0, n1] = [toGraphNode(ref.currencies[0], wrappedNative), toGraphNode(ref.currencies[1], wrappedNative)]
    if ((n0 === aNode && n1 === bNode) || (n0 === bNode && n1 === aNode)) byId.set(ref.id, { ref, provenance: 'hint' })
  }
  const proven = (block: bigint | undefined): bigint => block ?? -1n
  const indexed = [...ctx.index.pair(a, b)].sort((p, q) => {
    const bySuccess = proven(q.lastQuoteSuccessBlock) - proven(p.lastQuoteSuccessBlock)
    if (bySuccess !== 0n) return bySuccess > 0n ? 1 : -1
    const byCreation = proven(q.createdAtBlock) - proven(p.createdAtBlock)
    return byCreation === 0n ? 0 : byCreation > 0n ? 1 : -1
  })
  for (const rec of indexed) {
    if (!byId.has(rec.pool.id)) byId.set(rec.pool.id, { ref: rec.pool, provenance: 'index' })
  }
  for (const protocol of PROTOCOLS) {
    const module = ctx.modules[protocol]
    if (!module.enabled(ctx.manifest)) continue
    const extraFees = protocol === 'v3' && ctx.manifest.v3 ? ctx.index.enabledFees('v3', ctx.manifest.v3.factory) : undefined
    for (const ref of module.hypotheses(a, b, ctx.manifest, extraFees)) {
      if (!byId.has(ref.id)) byId.set(ref.id, { ref, provenance: 'hypothesis' })
    }
  }

  const alive = [...byId.values()].filter(({ ref }) => !ctx.index.isNegative(ref, state.block.number))
  if (alive.length <= MEASUREMENT_PAIR_CEILING) return alive
  state.pairCeilingHit = true
  return alive.slice(0, MEASUREMENT_PAIR_CEILING)
}

/**
 * Plans every due leg over current knowledge — pure over the chain (no RPC; the index is read, and
 * the two planning verdicts `intermediates.discovered` / `pairCeilingHit` are refreshed on state).
 *
 * Due = a (pool, direction, amount) key not yet settled (`measuredKeys`), not priced
 * (`measurements`), and not in flight — which is also what re-releases a transport-lost key exactly
 * once: `state.ts` settles it on the second loss, and settled keys are never planned again. Out-legs
 * for an X with no `m_X` are NOT planned (deferred, not skipped): they become due the cycle after an
 * in-leg for X first answers.
 */
export function planDueLegs(state: SearchState, ctx: PumpCtx, req: QuoteRequest): PlannedLeg[] {
  const wrappedNative = ctx.manifest.wrappedNative
  const inNode = toGraphNode(req.tokenIn, wrappedNative)
  const outNode = toGraphNode(req.tokenOut, wrappedNative)
  const hintRefs = hintHypotheses(ctx)
  state.intermediates.discovered = orderedIntermediates(ctx, req).length

  const planned: PlannedLeg[] = []
  const dueKeys = new Set<string>()
  const planPair = (a: CurrencyRef, b: CurrencyRef, fromNode: Address, amountIn: bigint, role: PlannedLeg['role']): void => {
    for (const { ref, provenance } of measurablePools(state, ctx, a, b, hintRefs)) {
      const shaped = materializeLeg(ref, fromNode, wrappedNative, ctx.hookData)
      // Keyed through the SAME function `applyMeasurement` keys the answer with, so "a dispatcher and
      // `applyMeasurement` can never key one leg two ways" is structural rather than two call sites
      // that happen to agree on a format.
      const key = measurementKey({ pool: ref, currencyIn: shaped.currencyIn, currencyOut: shaped.currencyOut, amountIn })
      if (state.measurements.has(key) || state.measuredKeys.has(key) || state.inFlightKeys.has(key) || dueKeys.has(key)) continue
      dueKeys.add(key)
      const leg: LegRequest = {
        key,
        pool: ref,
        currencyIn: shaped.currencyIn,
        currencyOut: shaped.currencyOut,
        amountIn,
        ...(shaped.hookData !== undefined && { hookData: shaped.hookData }),
      }
      planned.push({ leg, provenance, role })
    }
  }

  planPair(req.tokenIn, req.tokenOut, inNode, req.amountIn, { kind: 'direct' })
  for (const x of state.intermediates.selected) {
    if (x === inNode || x === outNode) continue
    planPair(req.tokenIn, x as Address, inNode, req.amountIn, { kind: 'in', x })
    const mx = state.mX.get(x)
    if (mx !== undefined) planPair(x as Address, req.tokenOut, x as Address, mx.amount, { kind: 'out', x })
  }
  return planned
}

/** The on-success index bookkeeping: existing pools are marked, proven hypotheses are upserted at
 * their provenance's rank — and a NEW pool is new knowledge, so `indexVersion` moves with it (the
 * proven pool's adjacency can surface intermediates the next planning pass should see). */
function recordSuccess(state: SearchState, ctx: PumpCtx, planned: PlannedLeg): void {
  if (planned.provenance === 'index') {
    ctx.index.markSuccess(planned.leg.pool, state.block.number)
    return
  }
  ctx.index.upsert({
    pool: planned.leg.pool,
    source: planned.provenance === 'hint' ? 'hint' : 'factory',
    lastQuoteSuccessBlock: state.block.number,
  })
  state.indexVersion++
}

// ---------------------------------------------------------------------------
// The m_X round-fold — SHARED with golden replay
// ---------------------------------------------------------------------------

/** One round's successful in-leg: which intermediate it reached, with how much, through which pool. */
export type RoundInLeg = { x: string; amountOut: bigint; poolId: string }

/** The `SearchState` fields the round-fold writes — structural, so `internal/outcomeLog.ts` can fold a
 * replayed ledger with the same function that folds a live round. */
type MXLedger = Pick<SearchState, 'mX' | 'measurements' | 'measuredKeys'>

/**
 * Folds ONE round's in-leg answers into `m_X` and invalidates whatever the improvement outdated —
 * the composition step's entire amount policy, in one function.
 *
 *   - BEST PER X, first-occurring strict maximum: a tie is won by the leg that answered first, and an
 *     incumbent `m_X` is only displaced by a strictly better one.
 *   - A better `m_X` OUTDATES every out-leg priced at the old one. They were exact answers to a
 *     question no route asks any more, so they leave the ledger and re-plan at the new amount.
 *     Counters stay put — they count dispatches, which happened.
 *
 * WHY IT IS EXPORTED. `internal/outcomeLog.ts` replays a recorded outcome log through the same
 * `apply*` functions a live search used, and it has to fold `m_X` exactly as `pump()` does or the
 * composition it verifies is not the composition that ran. Held as a second copy there, a change to
 * this policy would leave the fold on the old rule — and every committed golden would stay green
 * while production composed differently, with the drift surfacing only at the next re-record. That is
 * precisely the blind spot the goldens exist to close, so there is one implementation and both call
 * it.
 */
export function foldRoundInLegs(state: MXLedger, round: Iterable<RoundInLeg>, wrappedNative: Address, outNode: string): void {
  const bestIn = new Map<string, { amount: bigint; fromPoolId: string }>()
  for (const leg of round) {
    const current = bestIn.get(leg.x)
    if (current === undefined || leg.amountOut > current.amount) bestIn.set(leg.x, { amount: leg.amountOut, fromPoolId: leg.poolId })
  }

  for (const [x, candidate] of bestIn) {
    const current = state.mX.get(x)
    if (current !== undefined && candidate.amount <= current.amount) continue
    state.mX.set(x, candidate)
    for (const [key, m] of [...state.measurements]) {
      if (m.amountIn === candidate.amount) continue // already at the new amount — still exact
      if (toGraphNode(m.currencyIn, wrappedNative) !== x || toGraphNode(m.currencyOut, wrappedNative) !== outNode) continue
      state.measurements.delete(key)
      state.measuredKeys.delete(key)
    }
  }
}

/**
 * The intermediate a measured leg is an IN-LEG for, or `undefined` when it is not one — read off the
 * leg's own DIRECTION rather than off the planner's role.
 *
 * THE STRUCTURAL INVERSE OF `planDueLegs`' ROLE ASSIGNMENT, and equal to it by construction:
 *
 *   - an in-leg is planned as `planPair(tokenIn, x, inNode, …)`, so it is oriented out of `inNode`
 *     and its far side IS `x` — and the frontier loop skips `x === outNode`, so `to !== outNode`;
 *   - a direct leg runs `inNode -> outNode`, which this rejects on the second test;
 *   - an out-leg is planned as `planPair(x, tokenOut, x, …)` and the same loop skips `x === inNode`,
 *     so it never leaves `inNode` and this rejects it on the first.
 *
 * The three role kinds are therefore disjoint under this rule, with no leg that is both. It exists
 * because a recorded outcome carries a `Measurement` — pool, direction, amounts — and not the
 * planner's `role`: the role is a fact about why a leg was DISPATCHED, which `applyMeasurement`'s
 * vocabulary deliberately has no slot for. Widening that vocabulary to carry it would put a planning
 * detail in the single-writer seam every source reports through, for one consumer's benefit.
 * `pump.test.ts` pins the equivalence against real planned legs instead, so a change to the role
 * assignment fails there rather than silently in a fold.
 */
export function inLegIntermediate(leg: LegDirection, wrappedNative: Address, inNode: string, outNode: string): string | undefined {
  const from = toGraphNode(leg.currencyIn, wrappedNative)
  const to = toGraphNode(leg.currencyOut, wrappedNative)
  return from === inNode && to !== outNode ? to : undefined
}

/**
 * One pump cycle: plan due legs over current knowledge, dispatch at most PUMP_ROUND_CAP of them as
 * one `measureLegs` round, apply the outcomes, and fold new in-leg answers into `m_X` (invalidating
 * any out-leg entries a better in-leg just made stale). Returns true if a round was dispatched;
 * false when there was nothing to do — including the O(1) early exit when neither the index version
 * nor the frontier has moved since the last look (see {@link PumpCursor}).
 *
 * WITH A WAKER (`ctx.wake` — the live loop), THE ROUND IS DETACHED AND OUTCOMES APPLY PER SETTLED
 * ENVELOPE: `pump()` returns at dispatch, each `MULTICALL_CHUNK`-sized group's outcomes are applied
 * (and its in-legs folded, exactly as a smaller round) the moment that group settles, and every
 * application pokes `wake` — so the loop recomposes and can emit a lead after the FIRST envelope
 * instead of after the whole round. This is the measurement half of the design's granularity
 * principle (spec §3: improvement at data-arrival cadence), and it is what keeps a dense warm
 * pair's first lead from costing a full 250-leg round. Bookkeeping makes it safe by construction:
 * `inFlightKeys` (set here, cleared per applied outcome) keeps {@link pumpDry} false — no gate, no
 * termination — until every answer has landed, and the per-round `applied` set is the guarantee an
 * outcome delivered both through the seam and the final return applies exactly once. Without a
 * waker (unit pumps, golden replays), the round is awaited whole — the pre-seam behavior,
 * byte-for-byte.
 *
 * ON THE CALLER'S ABORT the loop DRAINS the round before its `final` (its termination check holds
 * while `inFlightKeys` is non-empty) — the same harvest the awaited round provided structurally, so
 * an abort still keeps every price the wire already paid for. The drain is BOUNDED because the
 * loop's dispatch signal (`ctx.signal`) aborts WITH the caller's signal: every call still queued
 * for the wire settles 'unattempted' unsent (`AbortedCallError`), and only the requests already in
 * flight are waited on. Iterator ABANDONMENT settles the same way after the fact — the loop's
 * `finally` aborts the dispatch signal, its unsent calls become 'unattempted' outcomes whose
 * application writes through `applyMeasurement` into a state nobody reads again, poking a notifier
 * nobody awaits — the same inertness argument as spec §5's preflight carve-out, documented
 * alongside it in the loop's `finally`. An aborted search never dispatches a NEW round, so the
 * same planned key can still never settle 'unattempted' twice.
 *
 * A rejected round is a bug — `measureLegs` is total by contract — but a bug must not park the
 * search: `inFlightKeys` would never drain and the loop could never go dry. Mirroring
 * `Verifier.dispatch`'s rule, every key the rejection stranded settles as the channel that means
 * "we learned nothing": transport.
 */
export async function pump(state: SearchState, ctx: PumpCtx, req: QuoteRequest): Promise<boolean> {
  if (state.aborted || ctx.signal?.aborted === true) return false
  if (cursorClean(state)) return false

  const planned = planDueLegs(state, ctx, req)
  const selectedCount = state.intermediates.selected.length
  if (planned.length === 0) {
    cursors.set(state, { indexVersion: state.indexVersion, selectedCount, dirty: false })
    return false
  }

  const round = planned.slice(0, PUMP_ROUND_CAP)
  const byKey = new Map(round.map((p) => [p.leg.key, p]))
  for (const p of round) state.inFlightKeys.add(p.leg.key)
  // Being planned as a leg IS evidence a pool is worth keeping — the LRU touch that keeps a
  // two-hop-only pool alive under `maxPools`, independent of how its quote turns out.
  ctx.index.touchAll(
    round.map((p) => p.leg.pool),
    state.block.number,
  )

  const wrappedNative = ctx.manifest.wrappedNative
  const outNode = toGraphNode(req.tokenOut, wrappedNative)
  /** Keys already applied, whichever channel delivered them first — the seam's dedup contract. */
  const applied = new Set<string>()

  // Applies one batch's outcomes and folds ITS in-legs into m_X — a batch is just a smaller round,
  // and `foldRoundInLegs` is incremental by construction (a later batch's better in-leg still
  // outdates an earlier batch's out-legs; an out-leg applied after its amount was already outdated
  // is simply never composed, because composition reads out-legs at exactly m_X). Within one batch,
  // every outcome applies BEFORE the fold, so an out-leg and the in-leg that outdates it landing in
  // the same envelope still resolve exactly as they did in a whole-round fold.
  const applyBatch = (outcomes: LegOutcome[]): void => {
    const inLegs: RoundInLeg[] = []
    for (const outcome of outcomes) {
      if (applied.has(outcome.key)) continue
      applied.add(outcome.key)
      const p = byKey.get(outcome.key)!
      if (outcome.kind === 'success') {
        const m: Measurement = {
          pool: p.leg.pool,
          currencyIn: p.leg.currencyIn,
          currencyOut: p.leg.currencyOut,
          amountIn: p.leg.amountIn,
          amountOut: outcome.amountOut,
          ...(outcome.gasEstimate !== undefined && { gasEstimate: outcome.gasEstimate }),
        }
        applyMeasurement(state, { kind: 'success', m })
        recordSuccess(state, ctx, p)
        if (p.role.kind === 'in') inLegs.push({ x: p.role.x, amountOut: outcome.amountOut, poolId: p.leg.pool.id })
      } else if (outcome.kind === 'reverted') {
        applyMeasurement(state, { kind: 'reverted', key: outcome.key, pool: p.leg.pool, amountIndependent: outcome.amountIndependent })
        // Only the amount-independent (pool-absent) shape is negative-cacheable — and `markNegative`
        // is also what feeds the hint-discredit history (`recordQuoteFailure`) for indexed pools.
        if (outcome.amountIndependent) ctx.index.markNegative(p.leg.pool, state.block.number)
      } else if (outcome.kind === 'transport') {
        applyMeasurement(state, { kind: 'transport', key: outcome.key, candidateRetry: true })
      } else {
        applyMeasurement(state, { kind: 'unattempted', key: outcome.key })
      }
    }
    foldRoundInLegs(state, inLegs, wrappedNative, outNode)
    // Dirty: this batch's outcomes may have made new legs due (a fresh m_X, a released transport
    // loss, a leftover past the round cap) — the next cycle must plan to find out.
    cursors.set(state, { indexVersion: state.indexVersion, selectedCount: state.intermediates.selected.length, dirty: true })
  }

  const wake = ctx.wake
  const dispatch = {
    client: ctx.client,
    modules: ctx.modules,
    manifest: ctx.manifest,
    blockNumber: state.block.number,
    semaphore: ctx.semaphore,
    multicall3: ctx.multicall3,
    signal: ctx.signal,
  }

  if (wake === undefined) {
    applyBatch(await measureLegs({ ...dispatch, legs: round.map((p) => p.leg) }))
    return true
  }

  const launch = (group: PlannedLeg[]): void => {
    void measureLegs({
      ...dispatch,
      legs: group.map((p) => p.leg),
      onOutcomes: (batch) => {
        applyBatch(batch)
        wake.poke()
      },
    })
      // The final, index-aligned return: every outcome the seam already delivered dedupes on
      // `applied`; anything a delivery path skipped applies here.
      .then(applyBatch)
      .catch(() => {
        // The bug-containment channel (see the docstring): settle every stranded key as transport.
        applyBatch(group.filter((p) => !applied.has(p.leg.key)).map((p) => ({ key: p.leg.key, kind: 'transport' as const })))
      })
      // This dispatch is over — dry may now be decidable, so the loop must look again even if the
      // last envelope's poke already coalesced into a cycle that ran before this settled.
      .finally(() => wake.poke())
  }

  // THE VANGUARD: a round wider than one small envelope leads with its evidence-ordered head
  // (`measurablePools` plans proven pools first) as its own PUMP_VANGUARD_LEGS-sized dispatch,
  // concurrent with the rest — a dozen light calls settle well before the MULTICALL_CHUNK-wide
  // envelopes, so the first lead is both FAST and drawn from the best-evidenced legs instead of
  // from whichever heavy envelope won the race. Costs at most one extra envelope per round.
  if (round.length > PUMP_VANGUARD_LEGS) {
    launch(round.slice(0, PUMP_VANGUARD_LEGS))
    launch(round.slice(PUMP_VANGUARD_LEGS))
  } else {
    launch(round)
  }
  return true
}

/** The v4 hookData stamp for a measurement's leg, applied at composition exactly as at planning —
 * literally the same {@link stampHookData} call, so "exactly as" is structural. */
function legOf(m: Measurement, ctx: PumpCtx): RouteLeg {
  return stampHookData({ pool: m.pool, currencyIn: m.currencyIn, currencyOut: m.currencyOut }, ctx.hookData)
}

/**
 * Pure composition over the measurement ledger (spec §3.2): direct routes from each direct pool's
 * own measurement; per intermediate X with an `m_X`, the best in-leg chained with every out-leg
 * measured at exactly `m_X.amount` — so every composed `amountOut` is an exact on-chain number, the
 * out-leg having been asked at precisely the amount that route delivers to it. By leg monotonicity
 * that best-in composition dominates every (in, out) combination through X, which is why the
 * dominated ones are not priced and not reported as priced.
 *
 * `intermediateAmounts` carries `[m_X]`; `gasEstimate` is the two legs' sum, absent if either leg
 * lacks one (v2 legs never carry one — a v2 quote is local reserve math and measures no gas). A route with any leg negative at the pinned block is excluded. Ranking — order,
 * tie-breaks, and the simplicity margin — is `rankRoutes`, unchanged.
 */
export function composeRoutes(state: SearchState, ctx: PumpCtx, req: QuoteRequest): QuotedRoute[] {
  const wrappedNative = ctx.manifest.wrappedNative
  const inNode = toGraphNode(req.tokenIn, wrappedNative)
  const outNode = toGraphNode(req.tokenOut, wrappedNative)
  const negative = (ref: PoolRef): boolean => ctx.index.isNegative(ref, state.block.number)

  const directs: Measurement[] = []
  const inByX = new Map<string, Measurement[]>()
  const outByX = new Map<string, Measurement[]>()
  const file = (map: Map<string, Measurement[]>, node: string, m: Measurement): void => {
    const list = map.get(node)
    if (list) list.push(m)
    else map.set(node, [m])
  }
  for (const m of state.measurements.values()) {
    const from = toGraphNode(m.currencyIn, wrappedNative)
    const to = toGraphNode(m.currencyOut, wrappedNative)
    if (from === inNode && to === outNode) {
      if (m.amountIn === req.amountIn) directs.push(m)
    } else if (from === inNode) {
      if (m.amountIn === req.amountIn) file(inByX, to, m)
    } else if (to === outNode) {
      if (m.amountIn === state.mX.get(from)?.amount) file(outByX, from, m)
    }
  }

  const quoted: QuotedRoute[] = []
  for (const m of directs) {
    if (negative(m.pool)) continue
    quoted.push({
      route: { legs: [legOf(m, ctx)] },
      quote: {
        amountIn: req.amountIn,
        amountOut: m.amountOut,
        intermediateAmounts: [],
        ...(m.gasEstimate !== undefined && { gasEstimate: m.gasEstimate }),
      },
    })
  }
  for (const [x, mx] of state.mX) {
    const bestIn = inByX.get(x)?.find((m) => m.pool.id === mx.fromPoolId)
    if (bestIn === undefined || negative(bestIn.pool)) continue
    const inLeg = legOf(bestIn, ctx)
    for (const out of outByX.get(x) ?? []) {
      if (out.pool.id === bestIn.pool.id || negative(out.pool)) continue
      const gasEstimate = bestIn.gasEstimate !== undefined && out.gasEstimate !== undefined ? bestIn.gasEstimate + out.gasEstimate : undefined
      quoted.push({
        route: { legs: [inLeg, legOf(out, ctx)] },
        quote: {
          amountIn: req.amountIn,
          amountOut: out.amountOut,
          intermediateAmounts: [mx.amount],
          ...(gasEstimate !== undefined && { gasEstimate }),
        },
      })
    }
  }
  return rankRoutes(quoted)
}
