import { expect, test } from 'bun:test'

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  CHUNK_REGROWTH_SUCCESSES,
  DESCENT_TIMEOUT_FALLBACK,
  MAX_BACKOFF_TOTAL_MS,
  MAX_CONSECUTIVE_MIN_FAILURES,
  MAX_SCAN_WINDOW,
  MIN_CHUNK,
  SCAN_CHUNK_CONCURRENCY,
} from '../constants'

import providerErrors from './__fixtures__/providerErrors.json'
import type { Action, Outcome, PolicyState, RefusalFacts } from './logScanPolicy'
import { batchLimit, initialPolicy, nextStep, refusalFactsOf } from './logScanPolicy'

// ---------------------------------------------------------------------------
// The width-policy machine, tested as a TABLE: each row is one transition,
// (state, outcome) -> (state', action), with nothing to choreograph. The
// integration of these decisions with the wire — batching, coverage, budgets,
// abort — is `logScan.test.ts`'s job; this file pins the decisions themselves,
// including every one of the `consecutiveMinFailures` reset paths and the two
// fast paths that used to be trapped inside the I/O loop.
// ---------------------------------------------------------------------------

/** A fully-populated state to override per row, so rows only name what they are about. */
function S(over: Partial<PolicyState> = {}): PolicyState {
  return {
    ceiling: MAX_SCAN_WINDOW,
    chunkSize: 1_000_000n,
    widthEstablished: false,
    consecutiveSuccesses: 0,
    consecutiveMinFailures: 0,
    minFailuresSinceSuccess: 0,
    backoffSpentMs: 0,
    ...over,
  }
}

/** A refusal outcome; `failureKind` defaults to the channel that never fast-paths. */
function refused(facts: Partial<RefusalFacts> = {}): Outcome {
  return { kind: 'refused', facts: { failureKind: 'execution', ...facts } }
}

type Row = {
  name: string
  state: PolicyState
  outcome: Outcome
  /** Asserted as `{ ...row.state, ...expect }` — a row names exactly the fields the transition moves. */
  expectPolicy: Partial<PolicyState>
  expectAction: Action
}

const rows: Row[] = [
  // --- served: establishing the width, and the regrowth ratchet -----------------------------------
  {
    name: 'served: one chunk establishes the width and resets BOTH failure counters',
    state: S({ chunkSize: 5_000n, consecutiveMinFailures: 2, minFailuresSinceSuccess: 7 }),
    outcome: { kind: 'served', chunks: 1 },
    expectPolicy: { widthEstablished: true, consecutiveSuccesses: 1, consecutiveMinFailures: 0, minFailuresSinceSuccess: 0 },
    expectAction: { kind: 'walk' },
  },
  {
    name: 'served: a batch accumulates the streak; below the boundary nothing regrows',
    state: S({ chunkSize: 5_000n, widthEstablished: true, consecutiveSuccesses: 1 }),
    outcome: { kind: 'served', chunks: 2 },
    expectPolicy: { consecutiveSuccesses: 3 },
    expectAction: { kind: 'walk' },
  },
  {
    name: 'served: at the regrowth boundary the width doubles, the streak resets, and the width is UN-established (the probe goes out alone)',
    state: S({ chunkSize: 5_000n, widthEstablished: true, consecutiveSuccesses: CHUNK_REGROWTH_SUCCESSES - 1 }),
    outcome: { kind: 'served', chunks: 1 },
    expectPolicy: { chunkSize: 10_000n, widthEstablished: false, consecutiveSuccesses: 0 },
    expectAction: { kind: 'walk' },
  },
  {
    name: 'served: regrowth NEVER crosses the ceiling — doubling clamps to a known hard cap',
    state: S({ chunkSize: 6_000n, ceiling: 10_000n, widthEstablished: true, consecutiveSuccesses: CHUNK_REGROWTH_SUCCESSES - 1 }),
    outcome: { kind: 'served', chunks: 1 },
    expectPolicy: { chunkSize: 10_000n, widthEstablished: false, consecutiveSuccesses: 0 },
    expectAction: { kind: 'walk' },
  },
  {
    name: 'served: AT the ceiling the doubling is a no-op and widthEstablished SURVIVES — batches stay whole on a hard-capped endpoint',
    state: S({ chunkSize: 10_000n, ceiling: 10_000n, widthEstablished: true, consecutiveSuccesses: CHUNK_REGROWTH_SUCCESSES - 1 }),
    outcome: { kind: 'served', chunks: 1 },
    expectPolicy: { chunkSize: 10_000n, widthEstablished: true, consecutiveSuccesses: 0 },
    expectAction: { kind: 'walk' },
  },

  // --- skipped: an abort is not evidence -----------------------------------------------------------
  {
    name: 'skipped: the identity transition — no halving, no backoff, no give-up',
    state: S({ chunkSize: 512n, widthEstablished: true, consecutiveSuccesses: 2, consecutiveMinFailures: 1, minFailuresSinceSuccess: 3, backoffSpentMs: 1_000 }),
    outcome: { kind: 'skipped' },
    expectPolicy: {},
    expectAction: { kind: 'walk' },
  },

  // --- refused: the declared-cap fast path (R2) ----------------------------------------------------
  {
    name: 'declared SPAN cap below the width: the CEILING clamps and the width jumps straight to the cap',
    state: S({ chunkSize: 200_000n, widthEstablished: true, consecutiveSuccesses: 2, consecutiveMinFailures: 1 }),
    outcome: refused({ capBlocks: 10_000n, capKind: 'span' }),
    expectPolicy: { ceiling: 10_000n, chunkSize: 10_000n, widthEstablished: false, consecutiveSuccesses: 0, consecutiveMinFailures: 0 },
    expectAction: { kind: 'jumpToDeclaredCap' },
  },
  {
    name: 'the alchemy trap: a DENSITY cap (a volunteered retry range) jumps the width but must NOT clamp the ceiling',
    state: S({ chunkSize: 8_000_000n }),
    outcome: refused({ capBlocks: 10_000n, capKind: 'density' }),
    expectPolicy: { ceiling: MAX_SCAN_WINDOW, chunkSize: 10_000n, consecutiveMinFailures: 0 },
    expectAction: { kind: 'jumpToDeclaredCap' },
  },
  {
    name: 'a declared cap WIDER than the window in flight explains nothing: ordinary halving, no clamp',
    state: S({ chunkSize: 30_000n }),
    outcome: refused({ capBlocks: 50_000n, capKind: 'span' }),
    expectPolicy: { ceiling: MAX_SCAN_WINDOW, chunkSize: 15_000n },
    expectAction: { kind: 'halve' },
  },
  {
    name: 'a SPAN cap below MIN_CHUNK: give the sub-range up at once (no retries, no backoff) — and still clamp the ceiling',
    state: S({ chunkSize: 5_000n, consecutiveMinFailures: 2 }),
    outcome: refused({ capBlocks: 10n, capKind: 'span' }),
    expectPolicy: { ceiling: 10n, consecutiveMinFailures: 0 },
    expectAction: { kind: 'giveUpSubrange', backoffMs: 0 },
  },
  {
    name: 'a DENSITY cap below MIN_CHUNK: give up without touching the ceiling',
    state: S({ chunkSize: 5_000n }),
    outcome: refused({ capBlocks: 10n, capKind: 'density' }),
    expectPolicy: { ceiling: MAX_SCAN_WINDOW },
    expectAction: { kind: 'giveUpSubrange', backoffMs: 0 },
  },
  {
    name: 'a declared cap on a transport-shaped failure takes the CAP path, not the collapse — the answer in hand beats the heuristic',
    state: S({ chunkSize: 1_000_000n }),
    outcome: refused({ capBlocks: 10_000n, capKind: 'span', failureKind: 'transport' }),
    expectPolicy: { ceiling: 10_000n, chunkSize: 10_000n, consecutiveMinFailures: 0 },
    expectAction: { kind: 'jumpToDeclaredCap' },
  },

  // --- refused: the expensive-refusal fast path (S1) -----------------------------------------------
  {
    name: 'a transport failure above the fallback collapses to DESCENT_TIMEOUT_FALLBACK in ONE step',
    state: S({ chunkSize: MAX_SCAN_WINDOW, widthEstablished: true, consecutiveSuccesses: 2, consecutiveMinFailures: 2 }),
    outcome: refused({ failureKind: 'transport' }),
    expectPolicy: { chunkSize: DESCENT_TIMEOUT_FALLBACK, widthEstablished: false, consecutiveSuccesses: 0, consecutiveMinFailures: 0 },
    expectAction: { kind: 'collapseToFallback' },
  },
  {
    name: 'an unavailable failure collapses the same way — both are the executed-then-refused shapes',
    state: S({ chunkSize: 200_000n }),
    outcome: refused({ failureKind: 'unavailable' }),
    expectPolicy: { chunkSize: DESCENT_TIMEOUT_FALLBACK, consecutiveMinFailures: 0 },
    expectAction: { kind: 'collapseToFallback' },
  },
  {
    name: 'AT the fallback width a transport failure halves as usual — the collapse fires at most once per descent',
    state: S({ chunkSize: DESCENT_TIMEOUT_FALLBACK }),
    outcome: refused({ failureKind: 'transport' }),
    expectPolicy: { chunkSize: DESCENT_TIMEOUT_FALLBACK / 2n },
    expectAction: { kind: 'halve' },
  },
  {
    name: 'an execution-shaped refusal at a wide window halves, never collapses — a validation refusal is free',
    state: S({ chunkSize: 1_000_000n }),
    outcome: refused({ failureKind: 'execution' }),
    expectPolicy: { chunkSize: 500_000n },
    expectAction: { kind: 'halve' },
  },

  // --- refused: blind halving ----------------------------------------------------------------------
  {
    name: 'halving floors at MIN_CHUNK and resets the sub-range counter',
    state: S({ chunkSize: 200n, consecutiveMinFailures: 2 }),
    outcome: refused(),
    expectPolicy: { chunkSize: MIN_CHUNK, consecutiveMinFailures: 0 },
    expectAction: { kind: 'halve' },
  },

  // --- refused at MIN_CHUNK: the retry / backoff / give-up ladder ----------------------------------
  {
    name: 'at MIN_CHUNK: the first failure retries the same window after the base backoff',
    state: S({ chunkSize: MIN_CHUNK, widthEstablished: true, consecutiveSuccesses: 1 }),
    outcome: refused(),
    expectPolicy: { widthEstablished: false, consecutiveSuccesses: 0, consecutiveMinFailures: 1, minFailuresSinceSuccess: 1, backoffSpentMs: BACKOFF_BASE_MS },
    expectAction: { kind: 'retryMinChunk', backoffMs: BACKOFF_BASE_MS },
  },
  {
    name: 'the backoff exponent doubles with each failure since the last success',
    state: S({ chunkSize: MIN_CHUNK, consecutiveMinFailures: 1, minFailuresSinceSuccess: 1, backoffSpentMs: BACKOFF_BASE_MS }),
    outcome: refused(),
    expectPolicy: { consecutiveMinFailures: 2, minFailuresSinceSuccess: 2, backoffSpentMs: BACKOFF_BASE_MS * 3 },
    expectAction: { kind: 'retryMinChunk', backoffMs: BACKOFF_BASE_MS * 2 },
  },
  {
    name: 'MAX_CONSECUTIVE_MIN_FAILURES on one sub-range gives it up — and STILL backs off, because the endpoint is what is unwell',
    state: S({ chunkSize: MIN_CHUNK, consecutiveMinFailures: MAX_CONSECUTIVE_MIN_FAILURES - 1, minFailuresSinceSuccess: 2, backoffSpentMs: BACKOFF_BASE_MS * 3 }),
    outcome: refused(),
    expectPolicy: { consecutiveMinFailures: 0, minFailuresSinceSuccess: 3, backoffSpentMs: BACKOFF_BASE_MS * 7 },
    expectAction: { kind: 'giveUpSubrange', backoffMs: BACKOFF_BASE_MS * 4 },
  },
  {
    name: 'giving a sub-range up does NOT reset the escalation: the exponent keeps climbing on the next sub-range',
    state: S({ chunkSize: MIN_CHUNK, consecutiveMinFailures: 0, minFailuresSinceSuccess: 3, backoffSpentMs: BACKOFF_BASE_MS * 7 }),
    outcome: refused(),
    expectPolicy: { consecutiveMinFailures: 1, minFailuresSinceSuccess: 4, backoffSpentMs: BACKOFF_BASE_MS * 7 + BACKOFF_MAX_MS },
    expectAction: { kind: 'retryMinChunk', backoffMs: BACKOFF_MAX_MS },
  },
  {
    name: 'the per-retry wait caps at BACKOFF_MAX_MS however high the exponent climbs',
    state: S({ chunkSize: MIN_CHUNK, minFailuresSinceSuccess: 30, backoffSpentMs: 10_000 }),
    outcome: refused(),
    expectPolicy: { consecutiveMinFailures: 1, minFailuresSinceSuccess: 31, backoffSpentMs: 10_000 + BACKOFF_MAX_MS },
    expectAction: { kind: 'retryMinChunk', backoffMs: BACKOFF_MAX_MS },
  },
  {
    name: 'the TOTAL sleep budget clamps the wait to exactly what is left of MAX_BACKOFF_TOTAL_MS',
    state: S({ chunkSize: MIN_CHUNK, minFailuresSinceSuccess: 30, backoffSpentMs: MAX_BACKOFF_TOTAL_MS - 500 }),
    outcome: refused(),
    expectPolicy: { consecutiveMinFailures: 1, minFailuresSinceSuccess: 31, backoffSpentMs: MAX_BACKOFF_TOTAL_MS },
    expectAction: { kind: 'retryMinChunk', backoffMs: 500 },
  },
  {
    name: 'once the sleep budget is spent, retries continue WITHOUT waiting — the request budget is what ends the scan',
    state: S({ chunkSize: MIN_CHUNK, minFailuresSinceSuccess: 30, backoffSpentMs: MAX_BACKOFF_TOTAL_MS }),
    outcome: refused(),
    expectPolicy: { consecutiveMinFailures: 1, minFailuresSinceSuccess: 31, backoffSpentMs: MAX_BACKOFF_TOTAL_MS },
    expectAction: { kind: 'retryMinChunk', backoffMs: 0 },
  },
]

for (const row of rows) {
  test(row.name, () => {
    const before = structuredClone(row.state)
    const { policy, action } = nextStep(row.state, row.outcome)
    expect(policy).toEqual({ ...row.state, ...row.expectPolicy })
    expect(action).toEqual(row.expectAction)
    expect(row.state).toEqual(before) // pure: the input state is never mutated
  })
}

// ---------------------------------------------------------------------------
// initialPolicy: what is known before the first request goes out.
// ---------------------------------------------------------------------------

test('initialPolicy: a range wider than the ceiling starts at exactly MAX_SCAN_WINDOW, unestablished', () => {
  const p = initialPolicy({ rangeSpan: 50_000_000n })
  expect(p).toEqual(S({ chunkSize: MAX_SCAN_WINDOW }))
})

test('initialPolicy: a range narrower than the ceiling is asked for whole — nothing wider is ever useful', () => {
  expect(initialPolicy({ rangeSpan: 20_001n }).chunkSize).toBe(20_001n)
})

test('initialPolicy: the caller ceiling override bounds both the start and the ceiling', () => {
  const p = initialPolicy({ rangeSpan: 100_000n, ceilingOverride: 2_000n })
  expect(p.ceiling).toBe(2_000n)
  expect(p.chunkSize).toBe(2_000n)
})

test('initialPolicy: a remembered DECLARED cap is a bound — it narrows the ceiling before any request', () => {
  const p = initialPolicy({ rangeSpan: 100_000n, declaredScanCap: 10_000n })
  expect(p.ceiling).toBe(10_000n)
  expect(p.chunkSize).toBe(10_000n)
})

test('initialPolicy: a remembered LEARNED width is a hint — it narrows the start but never the ceiling', () => {
  const p = initialPolicy({ rangeSpan: 1_000_000n, learnedScanWidth: 10_000n })
  expect(p.chunkSize).toBe(10_000n)
  expect(p.ceiling).toBe(MAX_SCAN_WINDOW)
})

test('initialPolicy: the hint never widens a scan past its own ceiling', () => {
  const p = initialPolicy({ rangeSpan: 100_000n, ceilingOverride: 1_000n, learnedScanWidth: MAX_SCAN_WINDOW })
  expect(p.chunkSize).toBe(1_000n)
})

test('initialPolicy: an inverted range still yields a positive width (its scan loop never runs anyway)', () => {
  expect(initialPolicy({ rangeSpan: -5n }).chunkSize).toBe(1n)
})

// ---------------------------------------------------------------------------
// batchLimit: width-established-then-parallel, never across a regrowth boundary.
// ---------------------------------------------------------------------------

test('batchLimit: an unestablished width always goes out alone — a search is sequential', () => {
  expect(batchLimit(S({ widthEstablished: false }), 100)).toBe(1)
  expect(batchLimit(S({ widthEstablished: false, chunkSize: 10_000n, ceiling: 10_000n }), 100)).toBe(1)
})

test('batchLimit: at the ceiling there is no regrowth boundary to respect — full batches', () => {
  expect(batchLimit(S({ widthEstablished: true, chunkSize: 10_000n, ceiling: 10_000n, consecutiveSuccesses: 3 }), 100)).toBe(
    SCAN_CHUNK_CONCURRENCY,
  )
})

test('batchLimit: below the ceiling a batch stops at the regrowth boundary, so the ratchet cadence is exact', () => {
  expect(batchLimit(S({ widthEstablished: true, consecutiveSuccesses: 1 }), 100)).toBe(CHUNK_REGROWTH_SUCCESSES - 1)
  expect(batchLimit(S({ widthEstablished: true, consecutiveSuccesses: 0 }), 100)).toBe(
    Math.min(SCAN_CHUNK_CONCURRENCY, CHUNK_REGROWTH_SUCCESSES),
  )
})

test('batchLimit: the request budget clamps the batch — MAX_REQUESTS_PER_SCAN stays an exact count', () => {
  expect(batchLimit(S({ widthEstablished: true, chunkSize: 10_000n, ceiling: 10_000n }), 2)).toBe(2)
})

test('batchLimit: never below one', () => {
  expect(batchLimit(S({ widthEstablished: true, consecutiveSuccesses: CHUNK_REGROWTH_SUCCESSES }), 100)).toBe(1)
})

// ---------------------------------------------------------------------------
// refusalFactsOf: the pure residue of a provider error, off the live captures.
// ---------------------------------------------------------------------------

test('refusalFactsOf: quicknode’s stated range cap reads as a SPAN policy', () => {
  const facts = refusalFactsOf(new Error('eth_getLogs is limited to a 10,000 range'))
  expect(facts.capBlocks).toBe(10_000n)
  expect(facts.capKind).toBe('span')
})

test('refusalFactsOf: alchemy’s response-size refusal reads as DENSITY, never a span policy', () => {
  const facts = refusalFactsOf(new Error(providerErrors['eth-mainnet.g.alchemy.com'].message))
  expect(facts.capBlocks).toBeDefined()
  expect(facts.capKind).toBe('density')
})

test('refusalFactsOf: a viem timeout classifies as transport, with no cap', () => {
  const err = new Error('The request took too long to respond.')
  err.name = 'TimeoutError'
  const facts = refusalFactsOf(err)
  expect(facts.failureKind).toBe('transport')
  expect(facts.capBlocks).toBeUndefined()
})

test('refusalFactsOf: an unrecognized error carries no cap and defaults to the execution channel', () => {
  expect(refusalFactsOf(new Error('boom'))).toEqual({
    capBlocks: undefined,
    capKind: undefined,
    failureKind: 'execution',
  })
})
