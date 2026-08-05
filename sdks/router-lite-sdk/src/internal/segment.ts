import type { Protocol, RouteCandidate, RouteLeg } from '../types'

// ---------------------------------------------------------------------------
// Route segmentation — the one definition of "how a route splits into
// per-protocol units of work", shared by the quoting engine (one eth_call per
// segment) and the ExecutionPlan compiler (one ExecutionOperation per
// segment). Quoting and execution MUST agree on these boundaries: a realized
// intermediate amount is only observable where a segment ends, and a custody
// hand-off is only encodable where an operation ends.
//
// A v2 leg is always its own segment (`v2Module.encodeQuote` throws on more
// than one leg, and a multi-leg v2 operation is not encodable either —
// reserves compose leg-by-leg, not within one call); contiguous v3 or
// contiguous v4 legs group into a single whole-path segment.
// ---------------------------------------------------------------------------

export type Segment = { protocol: Protocol; legs: RouteLeg[] }

/** Splits a candidate's legs into contiguous same-protocol segments; v2 legs are always solo. */
export function segmentCandidate(candidate: RouteCandidate): Segment[] {
  const segments: Segment[] = []
  let current: RouteLeg[] = []
  let currentProtocol: Protocol | undefined

  const flush = (): void => {
    if (current.length > 0) segments.push({ protocol: currentProtocol!, legs: current })
    current = []
    currentProtocol = undefined
  }

  for (const leg of candidate.legs) {
    const protocol = leg.pool.protocol
    if (protocol === 'v2') {
      flush()
      segments.push({ protocol: 'v2', legs: [leg] })
      continue
    }
    if (currentProtocol !== protocol) flush()
    current.push(leg)
    currentProtocol = protocol
  }
  flush()

  return segments
}
