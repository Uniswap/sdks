import type { Address } from 'viem'

import { intersectAll, subtractRanges } from '../internal/ranges'
import type { BlockRange, BlockRef, Protocol, QuoteRequest, SearchReport } from '../types'
import { protocolRecord } from '../types'

import { deploymentBlockOf, node } from './context'
import type { EngineState, SearchContext } from './waves'

// ---------------------------------------------------------------------------
// Engine-side report assembly: what the finished (or abandoned) search can
// honestly say about itself.
//
// The `SearchReport` is not a diagnostic nicety — the facade classifies off it
// (`router.ts`'s `isSearchComplete`/`inconclusiveReason`), so every field here
// has to be *conservative in the same direction*: when in doubt, report less
// coverage, not more. A report that overstates completeness turns a search
// that never looked into an authoritative `no-route`; one that understates it
// only costs the caller an `inconclusive` they can retry.
//
// Verdicts live in `router.ts`, not here. This module reports the axes
// (discovery status, exhaustiveness, quoting stats, aborted, degraded
// verification); the facade is the only place that turns them into a status.
// ---------------------------------------------------------------------------

/**
 * The slice of `search/state.ts`'s `SearchState` a report is folded from — structural rather than a
 * `Pick`, so this module stays out of the event-core's import graph until the loop lands, and so the
 * wave engine can hand over its own state through one adapter until Task 9 deletes it.
 * `intermediates.selected` is read for its length alone: the report prints a count, never the nodes.
 */
export type ReportState = {
  block: BlockRef
  aborted: boolean
  headRegressed: boolean
  discovery: Record<Protocol, { complete: ReadonlySet<string>; failed: boolean }>
  intermediates: { selected: { length: number }; discovered: number }
  legsMeasured: number
  pairCeilingHit: boolean
  quoting: SearchReport['quoting']
  verificationDegraded: boolean
  verification: SearchReport['verification']
}

/**
 * TRANSITIONAL, deleted with `waves.ts` in Task 9: the wave engine's state folded into the shape the
 * report now reads.
 *
 * `legsMeasured` is its `quoting.attempted` — the wave engine keeps no leg ledger, so every quote
 * call it dispatched and got a settlement for counts as one (which double-counts a transport-retried
 * candidate, where the new engine settles a key once). `pairCeilingHit` carries its per-pair pool
 * caps: `MAX_POOLS_DIRECT`/`MAX_POOLS_PER_LEG` (and the derived total-candidate backstop) drop pools
 * from a pair without measuring them, which is the same forfeit of exhaustiveness the ceiling names.
 */
export function engineReportState(state: EngineState): ReportState {
  return {
    block: state.block,
    aborted: state.aborted,
    headRegressed: state.headRegressed,
    discovery: state.discovery,
    intermediates: {
      discovered: state.enumeration.intermediatesDiscovered,
      selected: { length: state.enumeration.intermediatesSelected },
    },
    legsMeasured: state.quoting.attempted,
    pairCeilingHit: state.enumeration.prunedPools > 0 || state.enumeration.prunedCandidates > 0,
    quoting: state.quoting,
    verificationDegraded: state.verificationDegraded,
    verification: state.verification,
  }
}

/**
 * Completeness is judged against *this trade's two endpoints by name*. A count of scanned endpoints
 * would let any two scans (say, a focus token that is not an endpoint, plus one endpoint) satisfy
 * it while the other endpoint's adjacency was never touched — reporting `complete` for a search
 * that never looked, which the facade would then classify as an authoritative `no-route`.
 */
export function discoveryStatus(
  ctx: SearchContext,
  state: ReportState,
  protocol: Protocol,
  endpointNodes: [Address, Address],
): SearchReport['discovery'][Protocol]['status'] {
  if (!ctx.modules[protocol].enabled(ctx.manifest)) return 'disabled'
  const d = state.discovery[protocol]
  if (d.failed) return 'failed'
  if (!endpointNodes.every((n) => d.complete.has(n))) return 'partial'
  return 'complete'
}

/**
 * Cumulative index coverage for one protocol over this search's demanded scopes: the two trade
 * endpoints, each queried against `ctx.index` (so this reads whatever the cache holds AFTER this
 * search's own scans landed, not what this run happened to walk), INTERSECTED across endpoints —
 * never unioned.
 *
 * This has to be AND, matching `discoveryStatus`'s own `endpointNodes.every(...)`: that function
 * calls a protocol `complete` only once BOTH endpoints' adjacency is fully known, because a route
 * needs every pool touching either endpoint, not just one of them. A bar built from the union would
 * disagree with the word next to it — reading near-full while the status still says `partial`,
 * indefinitely, whenever one endpoint is fully cached and the other has never been touched. The
 * intersection is what "the router knows this pair, here" actually means: the same reasoning
 * `discovery.ts#scanAdjacency` already applies one layer down, intersecting a single endpoint's two
 * topic-slot queries before it will call that endpoint's range covered at all.
 *
 * A protocol with no deployment block configured (disabled on this chain) reports no coverage: there
 * is no demand to measure against.
 */
function coveredRangesFor(
  ctx: SearchContext,
  state: ReportState,
  protocol: Protocol,
  endpointNodes: Address[],
  deployBlock: bigint | undefined,
): BlockRange[] {
  if (deployBlock === undefined) return []
  const head = state.block.number
  const endpoints = new Map(endpointNodes.map((n) => [n.toLowerCase(), n]))
  const demand = [{ fromBlock: deployBlock, toBlock: head }]
  return intersectAll(
    [...endpoints.values()].map((endpoint) => subtractRanges(demand, ctx.index.uncovered(protocol, endpoint, deployBlock, head))),
  )
}

export function buildReport(
  state: ReportState,
  ctx: SearchContext,
  req: Pick<QuoteRequest, 'tokenIn' | 'tokenOut'>,
): SearchReport {
  const inNode = node(req.tokenIn, ctx.manifest)
  const outNode = node(req.tokenOut, ctx.manifest)

  const discovery = protocolRecord<SearchReport['discovery'][Protocol]>((p) => {
    const deployBlock = deploymentBlockOf(ctx.manifest, p)
    return {
      status: discoveryStatus(ctx, state, p, [inNode, outNode]),
      coveredRanges: coveredRangesFor(ctx, state, p, [inNode, outNode], deployBlock),
      // Fixed per protocol regardless of which sub-ranges this run scanned — the denominator a
      // percentage is built from must not wander between otherwise-identical runs.
      demandFloor: deployBlock ?? state.block.number,
    }
  })

  const discoveryComplete = Object.values(discovery).every((d) => d.status === 'complete' || d.status === 'disabled')
  // Not "capped": the frontier grows in batches, so an intermediate it has not selected yet is one
  // this search has not reached — which is exactly why it forfeits exhaustiveness below.
  const intermediatesPruned = Math.max(0, state.intermediates.discovered - state.intermediates.selected.length)

  return {
    block: state.block,
    discovery,
    enumeration: {
      exhaustiveWithinMaxHops:
        discoveryComplete &&
        !state.aborted &&
        intermediatesPruned === 0 &&
        // The abuse backstop left pools on a pair unmeasured.
        !state.pairCeilingHit &&
        state.quoting.unattempted === 0 &&
        // A leg whose measurement never got an answer was planned but not evaluated.
        state.quoting.transportFailed === 0,
      // BOTH halves of the ratio come from one sample of the frontier. Two numbers rendered as one
      // ratio (`selected/discovered`) must be sampled from one moment by one piece of code, or the
      // ratio describes nothing that ever happened — so neither half is re-walked against the index
      // here. A search aborted before the frontier moved reports `0/0`: it discovered nothing.
      intermediatesDiscovered: state.intermediates.discovered,
      intermediatesSelected: state.intermediates.selected.length,
      intermediatesPruned,
      legsMeasured: state.legsMeasured,
      pairCeilingHit: state.pairCeilingHit,
    },
    quoting: { ...state.quoting },
    aborted: state.aborted,
    verificationDegraded: state.verificationDegraded,
    headRegressed: state.headRegressed,
    verification: { ...state.verification },
  }
}
