import { describe, expect, it } from 'bun:test'
import type { Address } from 'viem'

import type { ProbeResult } from './probe'
import { pickBest, scoreProbe } from './rank'
import type { CandidatePool } from './types'

const cand = (pool: string): CandidatePool =>
  ({ ref: { protocol: 'v3', pool: pool as Address }, currencyA: {}, currencyB: {} }) as unknown as CandidatePool

const probe = (pool: string, buyOut: bigint, roundTripOut: bigint): ProbeResult => ({
  candidate: cand(pool),
  buyOut,
  roundTripOut,
})

const POOL_A = ('0x' + 'a1'.repeat(20)) as string
const POOL_B = ('0x' + 'b2'.repeat(20)) as string

describe('scoreProbe', () => {
  it('is buyOut * (roundTripOut / notional)', () => {
    // buyOut 2000, roundTrip 900, notional 1000 → 2000 * 0.9 = 1800
    expect(scoreProbe(probe(POOL_A, 2000n, 900n), 1000n)).toBe(1800)
  })

  it('is zero when the buy leg failed/quoted zero', () => {
    expect(scoreProbe(probe(POOL_A, 0n, 900n), 1000n)).toBe(0)
  })

  it('is zero when the round-trip leg failed/quoted zero', () => {
    expect(scoreProbe(probe(POOL_A, 2000n, 0n), 1000n)).toBe(0)
  })

  it('is zero when notional is non-positive', () => {
    expect(scoreProbe(probe(POOL_A, 2000n, 900n), 0n)).toBe(0)
  })
})

describe('pickBest', () => {
  it('returns the highest-scoring probe', () => {
    const worse = probe(POOL_A, 1000n, 900n) // score 900
    const better = probe(POOL_B, 2000n, 900n) // score 1800
    expect(pickBest([worse, better], 1000n)!.candidate).toBe(better.candidate)
  })

  it('resolves ties to the first candidate at that score', () => {
    const first = probe(POOL_A, 2000n, 900n)
    const second = probe(POOL_B, 2000n, 900n)
    expect(pickBest([first, second], 1000n)!.candidate).toBe(first.candidate)
  })

  it('returns undefined when the set is empty', () => {
    expect(pickBest([], 1000n)).toBeUndefined()
  })

  it('returns undefined when every candidate scores zero', () => {
    expect(pickBest([probe(POOL_A, 0n, 900n), probe(POOL_B, 2000n, 0n)], 1000n)).toBeUndefined()
  })
})
