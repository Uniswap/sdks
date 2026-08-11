import type { Hex } from 'viem'

import type {
  BlockRef,
  CompiledLimits,
  CurrencyRef,
  EncodedTx,
  ExecutionRequirement,
  PoolRef,
  Protocol,
  RankedRoute,
  SearchReport,
} from '../types'
import { protocolRecord, zeroQuoting, zeroVerification } from '../types'

// ---------------------------------------------------------------------------
// SearchState: everything one search knows, and the only functions permitted to
// change it. Sources report OUTCOMES (`apply*`); nothing else writes. Counters
// therefore move in one place each, which is what makes the report's
// conservation invariants structural rather than a convention three modules
// have to keep.
// ---------------------------------------------------------------------------

export type LegDirection = { currencyIn: CurrencyRef; currencyOut: CurrencyRef }

/** One pool priced in one direction at one amount — the unit of work the whole engine deals in. */
export type Measurement = LegDirection & {
  pool: PoolRef
  amountIn: bigint
  amountOut: bigint
  gasEstimate?: bigint
}

/**
 * The identity of a leg measurement: pool, direction, amount. Dedup, in-flight tracking, and the
 * measurement ledger are all keyed by it.
 *
 * `currencyInNode` is the leg's `currencyIn` lowercased — build it through {@link measurementKey}
 * rather than by hand, so a dispatcher and `applyMeasurement` can never key the same leg two ways.
 */
export function legKey(poolId: string, currencyInNode: string, amountIn: bigint): string {
  return `${poolId}|${currencyInNode}|${amountIn}`
}

export function measurementKey(leg: LegDirection & { pool: PoolRef; amountIn: bigint }): string {
  return legKey(leg.pool.id, leg.currencyIn.toLowerCase(), leg.amountIn)
}

export type SearchState = {
  block: BlockRef
  headRegressed: boolean
  aborted: boolean
  /** Bumped when the index gains pools; the pump's cursor for "is there anything new to plan". */
  indexVersion: number
  gateOpened: boolean
  /** legKey -> the measurement that succeeded. */
  measurements: Map<string, Measurement>
  /** Every legKey that reached a terminal state (priced, reverted, or transport-lost past its one
   * retry). A key in here is never dispatched again. */
  measuredKeys: Set<string>
  inFlightKeys: Set<string>
  /** Keys already given their one re-release after a transport loss. */
  transportRetried: Set<string>
  /** Graph node -> the best in-leg reaching it. Written by the pump's composition step. */
  mX: Map<string, { amount: bigint; fromPoolId: string }>
  /** The two-hop intermediates frontier: what it has selected so far, how many it can see, and the
   * batch notch it grows by. */
  intermediates: { selected: string[]; discovered: number; notch: number }
  quoting: SearchReport['quoting']
  legsMeasured: number
  pairCeilingHit: boolean
  requirements?: ExecutionRequirement[] | undefined
  /** The narrower half of `verificationDegraded`: `requirements` is known-incomplete, so no
   * `needs-action` may be promised from it and no revert may be blamed on the route. */
  readinessDegraded: boolean
  verificationDegraded: boolean
  execution: Map<string, { status: RankedRoute['execution']; revertData?: Hex }>
  compiledById: Map<string, { tx: EncodedTx; limits: CompiledLimits }>
  firstCompileError?: string | undefined
  verification: SearchReport['verification']
  discovery: Record<Protocol, { complete: Set<string>; failed: boolean }>
  /**
   * Present only when recording (`loop.ts`'s `SearchContext.recording`): every applied outcome, in
   * order — the golden format `internal/outcomeLog.ts` folds back through the `apply*` functions
   * below.
   *
   * IT IS COMPLETE FOR WHAT `apply*` OWNS AND NOTHING ELSE, which is the honest boundary rather than
   * an omission. Five fields on this type are written by their owners directly — `indexVersion` and
   * `pairCeilingHit` (the pump), `gateOpened` (the coverage worker's `demandFull`), `intermediates`
   * (two loop-cycle-synchronous writers: `loop.ts`'s `advanceIntermediates` AND `pump.ts`'s
   * `planDueLegs`, pump.ts:330), and `verification.preflightBudgetExhausted` (written directly by the
   * verifier at `verifier.ts:274,296`) — plus the `compiledById` memo. A fold therefore reproduces
   * every counter, measurement and verdict from the log alone, and takes the rest from the fixture;
   * see `internal/outcomeLog.ts`'s header for which of them the golden actually reads.
   */
  outcomeLog?: OutcomeEntry[] | undefined
}

export function createState(block: BlockRef, headRegressed: boolean, recording?: boolean): SearchState {
  return {
    block,
    headRegressed,
    aborted: false,
    indexVersion: 0,
    gateOpened: false,
    measurements: new Map(),
    measuredKeys: new Set(),
    inFlightKeys: new Set(),
    transportRetried: new Set(),
    mX: new Map(),
    intermediates: { selected: [], discovered: 0, notch: 0 },
    quoting: zeroQuoting(),
    legsMeasured: 0,
    pairCeilingHit: false,
    readinessDegraded: false,
    verificationDegraded: false,
    execution: new Map(),
    compiledById: new Map(),
    verification: zeroVerification(),
    discovery: protocolRecord(() => ({ complete: new Set<string>(), failed: false })),
    ...(recording === true && { outcomeLog: [] }),
  }
}

// ---------------------------------------------------------------------------
// Outcomes — the vocabulary every source reports in, and the outcome log's
// entries, which mirror the `apply*` inputs one for one.
// ---------------------------------------------------------------------------

export type MeasurementOutcome =
  | { kind: 'success'; m: Measurement }
  /** `amountIndependent` distinguishes "this pool cannot price at all" (negative-cache evidence)
   * from "not at this size". */
  | { kind: 'reverted'; key: string; pool: PoolRef; amountIndependent: boolean }
  /** `candidateRetry`: the loss is re-dispatchable at all (an inner failure on a live search). */
  | { kind: 'transport'; key: string; candidateRetry: boolean }
  /** An abort landed before the call went out — planned, never asked. */
  | { kind: 'unattempted'; key: string }

export type CoverageOutcome = { kind: 'complete' } | { kind: 'failed' }

export type ReadinessOutcome = { requirements: ExecutionRequirement[]; degraded: boolean }

export type PreflightOutcome =
  | { kind: 'verified' }
  | { kind: 'needs-action' }
  | { kind: 'reverted'; revertData?: Hex }
  | { kind: 'transport' }
  | { kind: 'unverified' }
  /** The route cannot be turned into calldata at all — an unsupported shape, or a quoted amount that
   * overruns the Universal Router's `uint128` fields. A disqualification rather than a simulation:
   * it rules the candidate out at zero cost, and its `reason` is the one the facade appends to a
   * `no-route` so the caller learns the cause and not only the verdict. */
  | { kind: 'uncompilable'; reason: string }

export type OutcomeEntry =
  | { t: 'measurement'; o: MeasurementOutcome }
  | { t: 'coverage'; p: Protocol; endpoint: string; o: CoverageOutcome }
  | { t: 'readiness'; r: ReadinessOutcome }
  | { t: 'preflight'; routeId: string; o: PreflightOutcome }
  | { t: 'abort' }

function record(s: SearchState, entry: OutcomeEntry): void {
  s.outcomeLog?.push(entry)
}

/** A key reaches a terminal state exactly once, so `legsMeasured === measuredKeys.size` always. */
function settle(s: SearchState, key: string): void {
  s.inFlightKeys.delete(key)
  if (s.measuredKeys.has(key)) return
  s.measuredKeys.add(key)
  s.legsMeasured++
}

// ---------------------------------------------------------------------------
// The writers
// ---------------------------------------------------------------------------

export function applyMeasurement(s: SearchState, o: MeasurementOutcome): void {
  record(s, { t: 'measurement', o })
  // THE CONSERVATION INVARIANT, enforced by there being exactly one switch: every arm moves
  // `attempted` together with exactly one of `succeeded`/`failed`/`transportFailed`, or moves
  // `unattempted` (which sits outside that sum) and nothing else. No other code may touch
  // `state.quoting`, so `attempted === succeeded + failed + transportFailed` cannot be broken.
  switch (o.kind) {
    case 'success': {
      const key = measurementKey(o.m)
      s.quoting.attempted++
      s.quoting.succeeded++
      s.measurements.set(key, o.m)
      settle(s, key)
      break
    }
    case 'reverted':
      s.quoting.attempted++
      s.quoting.failed++
      settle(s, o.key)
      break
    case 'transport':
      s.quoting.attempted++
      s.quoting.transportFailed++
      s.inFlightKeys.delete(o.key)
      // One re-release per key, then the loss is terminal: re-dispatch driven by a provider that is
      // already refusing would be a retry storm aimed at it.
      if (o.candidateRetry && !s.transportRetried.has(o.key)) s.transportRetried.add(o.key)
      else settle(s, o.key)
      break
    case 'unattempted':
      s.quoting.unattempted++
      s.inFlightKeys.delete(o.key)
      break
  }
}

/** `endpoint` is the graph node the scan covered, lowercased — completeness is judged by name. */
export function applyCoverage(s: SearchState, p: Protocol, endpoint: string, o: CoverageOutcome): void {
  record(s, { t: 'coverage', p, endpoint, o })
  if (o.kind === 'complete') s.discovery[p].complete.add(endpoint)
  else s.discovery[p].failed = true
}

export function applyReadiness(s: SearchState, r: ReadinessOutcome): void {
  record(s, { t: 'readiness', r })
  s.requirements = r.requirements
  if (!r.degraded) return
  // Readiness IS verification, just the read-only half of it.
  s.readinessDegraded = true
  s.verificationDegraded = true
}

/**
 * Two arms are verdicts reached WITHOUT a round trip and so spend no budget: `needs-action` (the
 * readiness gate's, decided before any simulation) and `uncompilable` (the encoder's, decided
 * without one). Every other arm is the settlement of a real preflight call and costs one attempt —
 * `PREFLIGHT_TOP_K` budgets round trips, not disqualifications.
 */
export function applyPreflight(s: SearchState, routeId: string, o: PreflightOutcome): void {
  record(s, { t: 'preflight', routeId, o })
  if (o.kind !== 'needs-action' && o.kind !== 'uncompilable') s.verification.preflightAttempted++
  if (o.kind === 'verified') s.execution.set(routeId, { status: 'verified' })
  else if (o.kind === 'needs-action') s.execution.set(routeId, { status: 'needs-action' })
  else if (o.kind === 'uncompilable') {
    // First rather than last: it is the leader's failure, the one the caller most likely caused,
    // and later candidates tend to fail for the same reason anyway.
    s.firstCompileError ??= o.reason
    s.execution.set(routeId, { status: 'failed' })
  } else if (o.kind === 'reverted')
    s.execution.set(routeId, { status: 'failed', ...(o.revertData !== undefined && { revertData: o.revertData }) })
  else {
    // A simulation that never happened rules nothing out: the route stays `unverified`, and a lost
    // call degrades verification so the search can never be an authoritative `no-route`.
    s.execution.set(routeId, { status: 'unverified' })
    if (o.kind === 'transport') s.verificationDegraded = true
  }
}

export function applyAbort(s: SearchState): void {
  record(s, { t: 'abort' })
  s.aborted = true
}
