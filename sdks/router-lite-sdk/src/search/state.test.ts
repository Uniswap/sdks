import { expect, test } from 'bun:test'
import fc from 'fast-check'
import type { Address } from 'viem'
import { zeroHash } from 'viem'

import type { BlockRef, PoolRef } from '../types'

import type { Measurement, MeasurementOutcome, SearchState } from './state'
import {
  applyAbort,
  applyCoverage,
  applyMeasurement,
  applyPreflight,
  applyReadiness,
  createState,
  legKey,
  measurementKey,
} from './state'

const TOKEN_A = `0x${'aa'.repeat(20)}` as Address
const TOKEN_B = `0x${'bb'.repeat(20)}` as Address
const BLOCK: BlockRef = { number: 1_000n, hash: zeroHash, timestamp: 1_700_000_000n }

function pool(id: string): PoolRef {
  return {
    id,
    currencies: [TOKEN_A, TOKEN_B],
    protocol: 'v2',
    address: `0x${'11'.repeat(20)}` as Address,
    token0: TOKEN_A,
    token1: TOKEN_B,
  }
}

function measurement(id: string, amountIn = 1_000n): Measurement {
  return { pool: pool(id), currencyIn: TOKEN_A, currencyOut: TOKEN_B, amountIn, amountOut: 2n * amountIn }
}

/** The three counters `attempted` is the sum of, plus the one that sits outside it. */
function counters(s: SearchState) {
  return { ...s.quoting, legsMeasured: s.legsMeasured }
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

test('legKey separates pool, direction, and amount', () => {
  expect(legKey('p1', TOKEN_A, 1n)).toBe(legKey('p1', TOKEN_A, 1n))
  expect(legKey('p1', TOKEN_A, 1n)).not.toBe(legKey('p2', TOKEN_A, 1n))
  expect(legKey('p1', TOKEN_A, 1n)).not.toBe(legKey('p1', TOKEN_B, 1n))
  expect(legKey('p1', TOKEN_A, 1n)).not.toBe(legKey('p1', TOKEN_A, 2n))
})

test('measurementKey is legKey over a leg — dispatcher and applyMeasurement cannot disagree', () => {
  const m = measurement('p1')
  expect(measurementKey(m)).toBe(legKey(m.pool.id, m.currencyIn.toLowerCase(), m.amountIn))
})

// ---------------------------------------------------------------------------
// createState
// ---------------------------------------------------------------------------

test('createState: every counter at zero, every axis unset, no outcome log unless recording', () => {
  const s = createState(BLOCK, false)
  expect(s.block).toBe(BLOCK)
  expect(s.headRegressed).toBe(false)
  expect(s.aborted).toBe(false)
  expect(counters(s)).toEqual({ attempted: 0, succeeded: 0, failed: 0, transportFailed: 0, unattempted: 0, legsMeasured: 0 })
  expect(s.pairCeilingHit).toBe(false)
  // Written by the LOOP at the pump's first dry moment — never by any `apply*` writer here.
  expect(s.firstRoundComplete).toBe(false)
  expect(s.intermediates).toEqual({ selected: [], discovered: 0, notch: 0 })
  expect(s.discovery.v2).toEqual({ complete: new Set(), failed: false })
  expect(s.verification).toEqual({ preflightAttempted: 0, preflightBudgetExhausted: false })
  expect(s.outcomeLog).toBeUndefined()

  expect(createState(BLOCK, true, true).outcomeLog).toEqual([])
  expect(createState(BLOCK, true).headRegressed).toBe(true)
})

// ---------------------------------------------------------------------------
// applyMeasurement — the only mover of the quoting counters
// ---------------------------------------------------------------------------

test('applyMeasurement success: attempted + succeeded, the measurement is kept, the key is settled', () => {
  const s = createState(BLOCK, false)
  const m = measurement('p1')
  s.inFlightKeys.add(measurementKey(m))

  applyMeasurement(s, { kind: 'success', m })

  expect(counters(s)).toEqual({ attempted: 1, succeeded: 1, failed: 0, transportFailed: 0, unattempted: 0, legsMeasured: 1 })
  expect(s.measurements.get(measurementKey(m))).toBe(m)
  expect(s.measuredKeys.has(measurementKey(m))).toBe(true)
  expect(s.inFlightKeys.size).toBe(0)
})

test('applyMeasurement reverted: attempted + failed, the key settles with nothing measured', () => {
  const s = createState(BLOCK, false)
  const key = legKey('p1', TOKEN_A, 1n)
  s.inFlightKeys.add(key)

  applyMeasurement(s, { kind: 'reverted', key, pool: pool('p1'), amountIndependent: true })

  expect(counters(s)).toEqual({ attempted: 1, succeeded: 0, failed: 1, transportFailed: 0, unattempted: 0, legsMeasured: 1 })
  expect(s.measurements.size).toBe(0)
  expect(s.measuredKeys.has(key)).toBe(true)
  expect(s.inFlightKeys.size).toBe(0)
})

test('applyMeasurement transport: the key is released for ONE retry, then the loss is terminal', () => {
  const s = createState(BLOCK, false)
  const key = legKey('p1', TOKEN_A, 1n)
  s.inFlightKeys.add(key)

  applyMeasurement(s, { kind: 'transport', key, candidateRetry: true })
  // Released: not settled, so the pump may dispatch it again — and that is the ONLY reason
  // `legsMeasured` has not moved.
  expect(counters(s)).toEqual({ attempted: 1, succeeded: 0, failed: 0, transportFailed: 1, unattempted: 0, legsMeasured: 0 })
  expect(s.measuredKeys.has(key)).toBe(false)
  expect(s.transportRetried.has(key)).toBe(true)
  expect(s.inFlightKeys.size).toBe(0)

  s.inFlightKeys.add(key)
  applyMeasurement(s, { kind: 'transport', key, candidateRetry: true })
  // The second loss settles it: an endpoint refusing every call must not be re-asked forever.
  expect(counters(s)).toEqual({ attempted: 2, succeeded: 0, failed: 0, transportFailed: 2, unattempted: 0, legsMeasured: 1 })
  expect(s.measuredKeys.has(key)).toBe(true)
  expect(s.inFlightKeys.size).toBe(0)
})

test('applyMeasurement transport with candidateRetry false settles immediately', () => {
  const s = createState(BLOCK, false)
  const key = legKey('p1', TOKEN_A, 1n)

  applyMeasurement(s, { kind: 'transport', key, candidateRetry: false })

  expect(s.transportRetried.has(key)).toBe(false)
  expect(s.measuredKeys.has(key)).toBe(true)
  expect(s.legsMeasured).toBe(1)
})

test('applyMeasurement unattempted: counted outside `attempted`, and never settled', () => {
  const s = createState(BLOCK, false)
  const key = legKey('p1', TOKEN_A, 1n)
  s.inFlightKeys.add(key)

  applyMeasurement(s, { kind: 'unattempted', key })

  expect(counters(s)).toEqual({ attempted: 0, succeeded: 0, failed: 0, transportFailed: 0, unattempted: 1, legsMeasured: 0 })
  expect(s.measuredKeys.has(key)).toBe(false)
  expect(s.inFlightKeys.size).toBe(0)
})

test('a key settles exactly once: legsMeasured never double-counts a re-applied outcome', () => {
  const s = createState(BLOCK, false)
  const m = measurement('p1')

  applyMeasurement(s, { kind: 'success', m })
  applyMeasurement(s, { kind: 'reverted', key: measurementKey(m), pool: m.pool, amountIndependent: false })

  expect(s.legsMeasured).toBe(1)
  expect(s.measuredKeys.size).toBe(1)
  expect(s.quoting.attempted).toBe(2)
})

// ---------------------------------------------------------------------------
// The other writers
// ---------------------------------------------------------------------------

test('applyCoverage records completeness per protocol and endpoint, and failure per protocol', () => {
  const s = createState(BLOCK, false)

  applyCoverage(s, 'v3', TOKEN_A.toLowerCase(), { kind: 'complete' })
  expect(s.discovery.v3.complete.has(TOKEN_A.toLowerCase())).toBe(true)
  expect(s.discovery.v3.failed).toBe(false)
  expect(s.discovery.v2.complete.size).toBe(0)

  applyCoverage(s, 'v3', TOKEN_B.toLowerCase(), { kind: 'failed' })
  expect(s.discovery.v3.failed).toBe(true)
  expect(s.discovery.v3.complete.has(TOKEN_B.toLowerCase())).toBe(false)
})

test('applyReadiness: a degraded read degrades verification too — readiness IS the read-only half of it', () => {
  const s = createState(BLOCK, false)
  const requirements = [
    { kind: 'erc20-approval' as const, token: TOKEN_A, spender: TOKEN_B, minimumAmount: 5n },
  ]

  applyReadiness(s, { requirements, degraded: false })
  expect(s.requirements).toEqual(requirements)
  expect(s.readinessDegraded).toBe(false)
  expect(s.verificationDegraded).toBe(false)

  applyReadiness(s, { requirements, degraded: true })
  expect(s.readinessDegraded).toBe(true)
  expect(s.verificationDegraded).toBe(true)
})

test('applyPreflight maps each settlement onto an execution status, and spends the budget for all but needs-action', () => {
  const s = createState(BLOCK, false)

  applyPreflight(s, 'r-verified', { kind: 'verified' })
  applyPreflight(s, 'r-reverted', { kind: 'reverted', revertData: '0xdead' })
  applyPreflight(s, 'r-transport', { kind: 'transport' })
  applyPreflight(s, 'r-unverified', { kind: 'unverified' })
  applyPreflight(s, 'r-needs-action', { kind: 'needs-action' })

  expect(s.execution.get('r-verified')).toEqual({ status: 'verified' })
  // Revert data travels verbatim, uninterpreted.
  expect(s.execution.get('r-reverted')).toEqual({ status: 'failed', revertData: '0xdead' })
  expect(s.execution.get('r-transport')).toEqual({ status: 'unverified' })
  expect(s.execution.get('r-unverified')).toEqual({ status: 'unverified' })
  expect(s.execution.get('r-needs-action')).toEqual({ status: 'needs-action' })
  // The simulation never happened, so the route is not ruled out — and the search is degraded.
  expect(s.verificationDegraded).toBe(true)
  expect(s.verification.preflightAttempted).toBe(4)
})

test('applyPreflight: an uncompilable route fails at zero budget cost, keeping the FIRST reason', () => {
  const s = createState(BLOCK, false)

  applyPreflight(s, 'r1', { kind: 'uncompilable', reason: 'the recipient is the v2 pool this plan trades through' })
  applyPreflight(s, 'r2', { kind: 'uncompilable', reason: 'a quoted amount does not fit' })

  expect(s.execution.get('r1')).toEqual({ status: 'failed' })
  expect(s.execution.get('r2')).toEqual({ status: 'failed' })
  // The leader's reason, not the last candidate's — it is the one the caller most likely caused.
  expect(s.firstCompileError).toBe('the recipient is the v2 pool this plan trades through')
  // A disqualification, not a simulation: `PREFLIGHT_TOP_K` budgets round trips.
  expect(s.verification.preflightAttempted).toBe(0)
})

test('applyPreflight: a revert with no data records the failure without inventing one', () => {
  const s = createState(BLOCK, false)
  applyPreflight(s, 'r1', { kind: 'reverted' })
  expect(s.execution.get('r1')).toEqual({ status: 'failed' })
  expect(Object.keys(s.execution.get('r1')!)).toEqual(['status'])
})

test('applyAbort sets the axis', () => {
  const s = createState(BLOCK, false)
  applyAbort(s)
  expect(s.aborted).toBe(true)
})

// ---------------------------------------------------------------------------
// The outcome log
// ---------------------------------------------------------------------------

test('every apply appends to the outcome log when recording, and to nothing when not', () => {
  const s = createState(BLOCK, false, true)
  const m = measurement('p1')

  applyMeasurement(s, { kind: 'success', m })
  applyCoverage(s, 'v2', TOKEN_A.toLowerCase(), { kind: 'complete' })
  applyReadiness(s, { requirements: [], degraded: false })
  applyPreflight(s, 'r1', { kind: 'verified' })
  applyAbort(s)

  expect(s.outcomeLog).toEqual([
    { t: 'measurement', o: { kind: 'success', m } },
    { t: 'coverage', p: 'v2', endpoint: TOKEN_A.toLowerCase(), o: { kind: 'complete' } },
    { t: 'readiness', r: { requirements: [], degraded: false } },
    { t: 'preflight', routeId: 'r1', o: { kind: 'verified' } },
    { t: 'abort' },
  ])

  const quiet = createState(BLOCK, false)
  applyMeasurement(quiet, { kind: 'success', m })
  applyAbort(quiet)
  expect(quiet.outcomeLog).toBeUndefined()
})

// ---------------------------------------------------------------------------
// Conservation, as a fold property over arbitrary outcome sequences
// ---------------------------------------------------------------------------

const KEYS = ['k0', 'k1', 'k2'].map((id) => legKey(id, TOKEN_A, 1_000n))

const arbOutcome: fc.Arbitrary<MeasurementOutcome> = fc.oneof(
  fc.integer({ min: 0, max: KEYS.length - 1 }).map((i) => ({ kind: 'success' as const, m: measurement(`k${i}`) })),
  fc
    .tuple(fc.constantFrom(...KEYS), fc.boolean())
    .map(([key, amountIndependent]) => ({ kind: 'reverted' as const, key, pool: pool('p'), amountIndependent })),
  fc
    .tuple(fc.constantFrom(...KEYS), fc.boolean())
    .map(([key, candidateRetry]) => ({ kind: 'transport' as const, key, candidateRetry })),
  fc.constantFrom(...KEYS).map((key) => ({ kind: 'unattempted' as const, key })),
)

test('property: for ANY sequence of outcomes the counters conserve, stay monotone, and settle each key once', () => {
  fc.assert(
    fc.property(fc.array(arbOutcome, { maxLength: 60 }), (outcomes) => {
      const s = createState(BLOCK, false)
      let previous = counters(s)

      for (const o of outcomes) {
        applyMeasurement(s, o)
        const now = counters(s)

        // The invariant the single switch exists to make unviolable.
        expect(now.attempted).toBe(now.succeeded + now.failed + now.transportFailed)
        // Counters only ever move up, one step at a time.
        for (const k of Object.keys(now) as (keyof typeof now)[]) expect(now[k]).toBeGreaterThanOrEqual(previous[k])
        expect(now.attempted + now.unattempted).toBe(previous.attempted + previous.unattempted + 1)
        // A settled key is settled once, and only a settled key was ever measured.
        expect(now.legsMeasured).toBe(s.measuredKeys.size)
        expect(now.legsMeasured).toBeLessThanOrEqual(now.attempted)
        expect(s.measurements.size).toBeLessThanOrEqual(s.measuredKeys.size)
        // `unattempted` counts legs nobody dispatched, so it never enters the settled ledger.
        expect(now.unattempted + now.legsMeasured).toBeLessThanOrEqual(outcomes.length)

        previous = now
      }

      expect([...s.measurements.keys()].every((k) => s.measuredKeys.has(k))).toBe(true)
    }),
    { numRuns: 300 },
  )
})
