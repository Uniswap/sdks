import type { Address } from 'viem'

import { mergeRanges } from '../internal/ranges'
import type { Protocol, SearchReport } from '../types'
import { protocolRecord } from '../types'

import { node } from './context'
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

export function buildReport(run: Run): SearchReport {
  const { ctx, req, state } = run

  const inNode = node(req.tokenIn, ctx.manifest)
  const outNode = node(req.tokenOut, ctx.manifest)

  const discovery = protocolRecord<SearchReport['discovery'][Protocol]>((p) => ({
    status: discoveryStatus(run, p, [inNode, outNode]),
    coveredRanges: mergeRanges(state.discovery[p].covered),
  }))

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
