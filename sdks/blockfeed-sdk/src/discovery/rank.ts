import type { ProbeResult } from './probe'

/**
 * Executable quality of a two-way probe, as a unitless float used only for ranking:
 * `Number(buyOut) * (Number(roundTripOut) / Number(notional))`. The first factor rewards raw output
 * (depth), the second is the round-trip retention ratio — a pool that quotes poorly in either
 * direction, or reverts, scores low. Returns `0` whenever either leg failed or quoted zero (a broken
 * probe is never a viable path). Float precision is acceptable: this value orders candidates, it is
 * never used for execution amounts.
 */
export function scoreProbe(p: ProbeResult, notional: bigint): number {
  if (p.buyOut <= 0n || p.roundTripOut <= 0n || notional <= 0n) return 0
  return Number(p.buyOut) * (Number(p.roundTripOut) / Number(notional))
}

/**
 * The highest-scoring probe, or `undefined` when the set is empty or every candidate scores `0`
 * (nothing viable). Ties resolve to the first candidate at that score, preserving input order.
 */
export function pickBest(results: ProbeResult[], notional: bigint): ProbeResult | undefined {
  let best: ProbeResult | undefined
  let bestScore = 0
  for (const r of results) {
    const score = scoreProbe(r, notional)
    if (score > bestScore) {
      bestScore = score
      best = r
    }
  }
  return best
}
