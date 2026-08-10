import type { Address } from 'viem'

import { intersectAll, subtractRanges } from '../internal/ranges'
import type { BlockRange, Protocol, SearchReport } from '../types'
import { protocolRecord } from '../types'

import { deploymentBlockOf, node } from './context'
import type { Run } from './waves'

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
 * Completeness is judged against *this trade's two endpoints by name*. A count of scanned endpoints
 * would let any two scans (say, a focus token that is not an endpoint, plus one endpoint) satisfy
 * it while the other endpoint's adjacency was never touched — reporting `complete` for a search
 * that never looked, which the facade would then classify as an authoritative `no-route`.
 */
export function discoveryStatus(
  run: Run,
  protocol: Protocol,
  endpointNodes: [Address, Address],
): SearchReport['discovery'][Protocol]['status'] {
  const { ctx, state } = run
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
function coveredRangesFor(run: Run, protocol: Protocol, endpointNodes: Address[], deployBlock: bigint | undefined): BlockRange[] {
  const { ctx, state } = run
  if (deployBlock === undefined) return []
  const head = state.block.number
  const endpoints = new Map(endpointNodes.map((n) => [n.toLowerCase(), n]))
  const demand = [{ fromBlock: deployBlock, toBlock: head }]
  return intersectAll(
    [...endpoints.values()].map((endpoint) => subtractRanges(demand, ctx.index.uncovered(protocol, endpoint, deployBlock, head))),
  )
}

export function buildReport(run: Run): SearchReport {
  const { ctx, req, state } = run

  const inNode = node(req.tokenIn, ctx.manifest)
  const outNode = node(req.tokenOut, ctx.manifest)

  const discovery = protocolRecord<SearchReport['discovery'][Protocol]>((p) => {
    const deployBlock = deploymentBlockOf(ctx.manifest, p)
    return {
      status: discoveryStatus(run, p, [inNode, outNode]),
      coveredRanges: coveredRangesFor(run, p, [inNode, outNode], deployBlock),
      // Fixed per protocol regardless of which sub-ranges this run scanned — the denominator a
      // percentage is built from must not wander between otherwise-identical runs.
      demandFloor: deployBlock ?? state.block.number,
    }
  })

  const discoveryComplete = Object.values(discovery).every((d) => d.status === 'complete' || d.status === 'disabled')

  return {
    block: state.block,
    discovery,
    enumeration: {
      exhaustiveWithinMaxHops:
        discoveryComplete &&
        !state.aborted &&
        // The per-pair cap and the total-candidate cap bite at different granularities (pools vs.
        // whole candidates); either one pruning anything means the enumeration wasn't exhaustive, so
        // both separated counters are checked rather than a single mixed-unit sum.
        state.enumeration.prunedPools === 0 &&
        state.enumeration.prunedCandidates === 0 &&
        state.enumeration.prunedIntermediates === 0 &&
        state.quoting.unattempted === 0 &&
        // A candidate whose quote never got an answer was enumerated but not evaluated.
        state.quoting.transportFailed === 0,
      // BOTH halves of the ratio come from the same `generateRoutes` call, threaded through
      // `state.enumeration`. `intermediatesSelected` always did; `intermediatesDiscovered` used to be
      // re-derived HERE, by re-walking the neighbor intersection against the index as it looked at
      // report-assembly time — which is the same drift the `intermediatesSelected` note has always
      // warned about, one field over. Two numbers rendered as one ratio (`selected/discovered`) must
      // be sampled from one moment by one piece of code, or the ratio describes nothing that ever
      // happened. `candidates.test.ts` pins that the two walks agreed, so this is the same number.
      //
      // The one place it now reads differently, and correctly so: a search aborted before its first
      // enumeration reports `0/0` rather than "0 selected out of N the index happened to hold" — the
      // enumeration never ran, so it discovered nothing.
      intermediatesDiscovered: state.enumeration.intermediatesDiscovered,
      intermediatesSelected: state.enumeration.intermediatesSelected,
      candidatesGenerated: state.enumeration.candidatesGenerated,
      poolsPruned: state.enumeration.prunedPools,
      candidatesPruned: state.enumeration.prunedCandidates,
      intermediatesPruned: state.enumeration.prunedIntermediates,
    },
    quoting: { ...state.quoting },
    aborted: state.aborted,
    verificationDegraded: state.verificationDegraded,
    headRegressed: state.headRegressed,
    verification: { ...state.verification },
  }
}
