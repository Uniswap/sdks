import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  CHUNK_REGROWTH_SUCCESSES,
  DESCENT_TIMEOUT_FALLBACK,
  MAX_CONSECUTIVE_MIN_FAILURES,
  MAX_BACKOFF_TOTAL_MS,
  MAX_SCAN_WINDOW,
  MIN_CHUNK,
  SCAN_CHUNK_CONCURRENCY,
} from '../constants'

import { maxBig, minBig } from './ranges'
import type { RpcFailureKind } from './rpcErrors'
import { classifyRpcError, parseDeclaredCap } from './rpcErrors'

// ---------------------------------------------------------------------------
// The width-policy state machine for `logScan.ts#scanLogs`, as a pure reducer.
//
// `scanLogs` walks a block range backward and has to decide, after every batch
// of `eth_getLogs` settles, HOW WIDE the next request should be and WHERE it
// should point: keep walking, jump to a cap the provider just declared,
// collapse past an expensive refusal, halve, retry the minimum window with a
// backoff, or give the sub-range up. Those decisions are pure — they are a
// function of what the machine already believes about the endpoint and of what
// just happened — and this module holds all of them, so the loop that owns the
// wire (semaphore, abort, budget accounting, coverage, `onLogs`) never has to
// reason about widths and the policy never has to touch I/O.
//
// The machine's states, in the order a cold scan visits them:
//
//   establishing-width  — `widthEstablished` is false; every chunk goes out
//                         alone, because nothing has proven the current width.
//   batched-walk        — a chunk at this width was served; same-width chunks
//                         go out `batchLimit` at a time.
//   descend             — a refusal arrived. Three flavors, tried in order:
//                         declared-cap (the provider stated its window — jump
//                         to it, or give up if it is below `MIN_CHUNK`),
//                         expensive-refusal (transport/timeout at a wide
//                         window — collapse to `DESCENT_TIMEOUT_FALLBACK` in
//                         one step), and plain halving.
//   min-chunk-backoff   — failing at the narrowest window this scanner will
//                         ever ask for: retry with exponential backoff.
//   give-up-subrange    — enough consecutive minimum-window failures (or a
//                         declared cap below `MIN_CHUNK`): skip the sub-range
//                         and move on to older blocks.
//
// Every transition is a row in `logScanPolicy.test.ts`; the WHY behind each
// rule lives on the branch that implements it, ported verbatim from the loop
// this was extracted out of (see `logScan.ts`'s header for the scan-level
// story: wide start S1, declared caps R2, batching P1, and the measured costs
// behind each).
// ---------------------------------------------------------------------------

/**
 * Everything the policy believes about the endpoint and the current descent. A plain immutable
 * value: `nextStep` returns a new one and never mutates its input, which is what makes the machine
 * table-testable — a row is `(state, outcome) -> (state', action)` with nothing hidden.
 */
export type PolicyState = {
  /**
   * The widest window this scan may ever ask for: the caller's override when they know their
   * provider's cap, otherwise the empirical ceiling — narrowed further by any cap the endpoint has
   * DECLARED (this scan, or an earlier one through `ScanWidthMemory`). Never exceeded, by the first
   * request or by any regrowth doubling after it.
   *
   * LOWERED BY A DECLARED SPAN CAP, WHICH IS THE POINT (see the declared-cap branch below).
   * Clamping the ceiling — rather than only the current width — is what stops the regrowth ratchet
   * from doubling past a ceiling the endpoint has already named, failing, and re-establishing,
   * forever: at `chunkSize >= ceiling` the doubling is a no-op, so `widthEstablished` survives it
   * and the batching stays whole.
   */
  ceiling: bigint
  /** The window the next request will span (clamped by the remaining range at dispatch time). */
  chunkSize: bigint
  /**
   * P1: whether the LAST chunk asked for at the current `chunkSize` was served. False at the start
   * (nothing is known yet) and reset by every failure and by every regrowth that actually changes
   * the width — so it is exactly "this width is known-good right now", which is the only state
   * under which asking for several of them at once is not a gamble.
   */
  widthEstablished: boolean
  /** Clean chunks since the last width change: drives the regrowth ratchet. */
  consecutiveSuccesses: number
  /** Failures at MIN_CHUNK on the *current* sub-range: drives when to give that sub-range up. */
  consecutiveMinFailures: number
  /**
   * Failures at MIN_CHUNK since the last success *anywhere*: drives the backoff exponent. Kept
   * apart from the counter above because giving a sub-range up is not progress — the endpoint is
   * still the same endpoint, and moving on to older blocks must not reset the escalation.
   */
  minFailuresSinceSuccess: number
  /** Backoff already spent, so the per-scan sleep budget ({@link MAX_BACKOFF_TOTAL_MS}) is exact. */
  backoffSpentMs: number
}

/**
 * What one batch settlement taught the machine. Exactly one of these reaches `nextStep` per
 * settled batch — plus a leading `served` when a batch failed partway through, for the contiguous
 * prefix that WAS served (the loop keeps those chunks; the policy must see the success before the
 * failure, because a served prefix resets the backoff escalation exactly as any success does).
 */
export type Outcome =
  /** `chunks` contiguous chunks at the current width came back served. */
  | { kind: 'served'; chunks: number }
  /** The endpoint refused a chunk. `facts` is `refusalFactsOf(err)` — the pure residue of the error. */
  | { kind: 'refused'; facts: RefusalFacts }
  /**
   * A chunk was never sent (the abort fired while it held a queued semaphore permit). NOT
   * evidence: it neither covers anything nor says anything about the endpoint, so the policy is
   * unchanged — no halving, no backoff, no give-up. The loop's own top-of-iteration abort check is
   * what ends the scan.
   */
  | { kind: 'skipped' }

/**
 * The two pure decisions a refusal carries, extracted once so the reducer needs no error object:
 * what window (if any) the provider DECLARED it would serve, and which channel the failure came in
 * on. Both parsers are pure and total over `unknown` (`internal/rpcErrors.ts`).
 */
export type RefusalFacts = {
  /** The provider's stated window, when the error names one (`parseDeclaredCap`). */
  capBlocks?: bigint | undefined
  /** Whether that stated window is a durable SPAN policy or a one-off DENSITY observation. */
  capKind?: 'span' | 'density' | undefined
  /** Which channel the failure came in on (`classifyRpcError`) — drives the expensive-refusal collapse. */
  failureKind: RpcFailureKind
}

/** Reads {@link RefusalFacts} off a raw provider error. The only error-shaped input the policy has. */
export function refusalFactsOf(err: unknown): RefusalFacts {
  const { capBlocks, capKind } = parseDeclaredCap(err)
  return { capBlocks, capKind, failureKind: classifyRpcError(err) }
}

/**
 * What the loop does next. The policy names the move; the loop owns the cursor, the wire and the
 * clock, so "where exactly" (which blocks) and "when" (the sleep) are applied there.
 *
 * Only two fields carry loop-visible payload: `giveUpSubrange` moves the cursor past the failed
 * chunk (everything else retries it, via the loop re-planning from the same cursor at the new
 * `chunkSize`), and `backoffMs` — present only on the minimum-window outcomes — is how long to
 * sleep before the next request (0 = the per-scan sleep budget is spent; keep going without
 * waiting). The remaining kinds are distinct so a table row can assert WHICH rule fired, not just
 * its side effects.
 */
export type Action =
  /** Keep walking at `policy.chunkSize` (also the no-op reply to `served`/`skipped`). */
  | { kind: 'walk' }
  /** Retry the same sub-range at the width the provider just declared. A cap, not an outage: no backoff. */
  | { kind: 'jumpToDeclaredCap' }
  /** Retry the same sub-range at {@link DESCENT_TIMEOUT_FALLBACK} — one expensive failure buys the whole descent. */
  | { kind: 'collapseToFallback' }
  /** Retry the same sub-range at half the width. A cap, not an outage: no backoff. */
  | { kind: 'halve' }
  /** Retry the same sub-range at MIN_CHUNK after `backoffMs` — the endpoint is failing, not capping. */
  | { kind: 'retryMinChunk'; backoffMs: number }
  /** Skip past the failed chunk: leave it out of `covered` and move on to older blocks. */
  | { kind: 'giveUpSubrange'; backoffMs: number }

/**
 * The state a scan opens in, from what is known before the first request goes out.
 *
 * The ceiling is `initialChunk ?? MAX_SCAN_WINDOW`, narrowed by any cap the endpoint DECLARED to an
 * earlier scan (`ScanWidthMemory.declaredScanCap`) — a caller's own bound is never widened by
 * anything remembered.
 *
 * The first width starts at the whole range when it fits under the ceiling — asking for 16M blocks
 * of a 5,000-block re-scan would be a guaranteed-wasted probe on any endpoint that validates the
 * span it was handed. A `learnedScanWidth` from an earlier scan narrows the start the same way, and
 * for the same reason: it is the widest window this endpoint is known to serve, so anything above
 * it is a probe whose answer is already in hand. It is only a hint — the halving still corrects it
 * downward and the regrowth ratchet still climbs back to `ceiling` — so a stale one costs a probe,
 * never coverage. `maxBig(..., 1n)` only guards an inverted range, whose scan loop never runs
 * anyway.
 */
export function initialPolicy(args: {
  /** `toBlock - fromBlock + 1n` — the whole range, so a narrow re-scan never over-asks. */
  rangeSpan: bigint
  /** The caller's `initialChunk` ceiling override, when they know their provider's cap. */
  ceilingOverride?: bigint | undefined
  /** `ScanWidthMemory.declaredScanCap` — a ceiling an earlier scan was TOLD. A bound. */
  declaredScanCap?: bigint | undefined
  /** `ScanWidthMemory.learnedScanWidth` — the widest window an earlier scan was SERVED. A hint. */
  learnedScanWidth?: bigint | undefined
}): PolicyState {
  const ceiling = minBig(args.ceilingOverride ?? MAX_SCAN_WINDOW, args.declaredScanCap ?? MAX_SCAN_WINDOW)
  return {
    ceiling,
    chunkSize: minBig(minBig(maxBig(args.rangeSpan, 1n), ceiling), args.learnedScanWidth ?? ceiling),
    widthEstablished: false,
    consecutiveSuccesses: 0,
    consecutiveMinFailures: 0,
    minFailuresSinceSuccess: 0,
    backoffSpentMs: 0,
  }
}

/**
 * How many chunks the loop may dispatch together right now (P1).
 *
 * One, until a chunk at this exact width has been served. After that, up to
 * {@link SCAN_CHUNK_CONCURRENCY} — bounded further by two things that are not about concurrency at
 * all: the request budget (`budgetLeft`; a batch may not overshoot it, so `MAX_REQUESTS_PER_SCAN`
 * stays an exact count rather than an approximate one), and the regrowth boundary. The latter is
 * what keeps the ratchet's cadence identical to the sequential one: below the ceiling the window
 * must still double after exactly {@link CHUNK_REGROWTH_SUCCESSES} clean chunks, so a batch stops
 * short of that count rather than sailing past it. AT the ceiling, doubling is a no-op — there is
 * no boundary to respect and no reason to break the batch up.
 */
export function batchLimit(policy: PolicyState, budgetLeft: number): number {
  if (!policy.widthEstablished) return 1
  const regrowthRoom =
    policy.chunkSize >= policy.ceiling ? SCAN_CHUNK_CONCURRENCY : CHUNK_REGROWTH_SUCCESSES - policy.consecutiveSuccesses
  return Math.max(1, Math.min(SCAN_CHUNK_CONCURRENCY, regrowthRoom, budgetLeft))
}

/**
 * The transition function: one settled outcome in, the next belief-state and the loop's next move
 * out. Pure — no I/O, no clock, no mutation — so every branch below is a table row in
 * `logScanPolicy.test.ts` rather than a fake-client choreography.
 */
export function nextStep(policy: PolicyState, outcome: Outcome): { policy: PolicyState; action: Action } {
  switch (outcome.kind) {
    case 'served': {
      // Any success resets BOTH failure counters: the sub-range one trivially (this sub-range is
      // done), and the backoff exponent because the endpoint just demonstrated it is serving again.
      let chunkSize = policy.chunkSize
      let widthEstablished = true
      let consecutiveSuccesses = policy.consecutiveSuccesses + outcome.chunks
      if (consecutiveSuccesses >= CHUNK_REGROWTH_SUCCESSES) {
        // Probe for a wider window. If the earlier failure was transient this restores full speed;
        // if the cap is real the next request fails and halves straight back, costing one request.
        // A width that actually changed is a width nothing has served yet, so the probe goes out
        // alone (P1) exactly as the very first chunk of the scan did.
        const grown = minBig(chunkSize * 2n, policy.ceiling)
        if (grown !== chunkSize) widthEstablished = false
        chunkSize = grown
        consecutiveSuccesses = 0
      }
      return {
        policy: {
          ...policy,
          chunkSize,
          widthEstablished,
          consecutiveSuccesses,
          consecutiveMinFailures: 0,
          minFailuresSinceSuccess: 0,
        },
        action: { kind: 'walk' },
      }
    }

    // A skipped chunk was never sent: not coverage, not evidence. The identity transition.
    case 'skipped':
      return { policy, action: { kind: 'walk' } }

    case 'refused': {
      // Every refusal, whatever else it means, un-establishes the width (a width that just failed
      // is a width nothing has proven) and ends the current clean-chunk streak.
      const base = { ...policy, consecutiveSuccesses: 0, widthEstablished: false }
      const { capBlocks, capKind, failureKind } = outcome.facts

      // --- the declared-cap fast path (R2) -------------------------------------------------
      // Some providers state the window they WOULD have served, right there in the error (see
      // `internal/rpcErrors.ts#parseDeclaredCap` and the live captures it is built from). When they
      // do, the bisection below is searching for an answer already in hand. A cap only explains
      // THIS failure if it is narrower than what was asked for — a provider quoting its (generous)
      // ceiling while failing for an unrelated reason must not suppress the halving that will
      // actually get past it.
      if (capBlocks !== undefined && capBlocks < base.chunkSize) {
        // A SPAN cap is a POLICY, not a data point, so it lowers the CEILING and not merely the
        // current width — and that distinction is worth more than every probe the fast path skips.
        // Left as only a width, the ratchet doubles straight back past the stated cap after
        // CHUNK_REGROWTH_SUCCESSES clean chunks, fails, un-establishes the width, and sends the
        // next chunk out alone: measured against quicknode's Base endpoint, that cycle spends three
        // sequential round trips per four chunks of real work and never stops. Clamped,
        // `grown === chunkSize` at the ceiling, `widthEstablished` survives, and the walk runs at a
        // full SCAN_CHUNK_CONCURRENCY-wide batch per round trip — 1.39x on a six-scan adjacency
        // fan-out, live.
        //
        // A `'density'` CAP MUST NOT CLAMP, and getting this wrong would be far more expensive than
        // never having read the message at all. Alchemy answers a too-wide WETH adjacency query
        // with "you can make eth_getLogs requests with up to a 10,000 block range … or you can
        // request any block range with a cap of 10K logs … this block range should work:
        // [8,000,000 blocks]" — a stated 10,000 alongside a demonstration that it will serve 8M for
        // this very query. Clamping there pins every mainnet scan 800x too narrow for the rest of
        // its life. The WIDTH jump below still applies to both kinds (it is only this attempt's
        // guess, and the regrowth ratchet climbs back out of it, which is exactly the recovery a
        // density observation needs); only the durable ceiling is withheld. See
        // `internal/rpcErrors.ts#DeclaredCap.capKind`.
        //
        // Only ever NARROWS (`minBig`), so a provider that declares different span caps for
        // different queries leaves this scan at the tightest one it was actually told about, and an
        // `initialChunk` override is never widened by anything a provider says.
        const ceiling = capKind === 'span' ? minBig(base.ceiling, capBlocks) : base.ceiling
        if (capBlocks < MIN_CHUNK) {
          // The endpoint's own ceiling is BELOW the smallest window this scanner will ask for, so
          // no amount of halving, retrying or backing off can reach it — MIN_CHUNK is the floor,
          // and the provider has just said the floor is too high. Give the sub-range up on the
          // spot: leave it out of `covered` (partial discovery, reported honestly, exactly as an
          // exhausted retry budget would) and move on to older blocks. Without this, a
          // 10-block-cap endpoint costs MAX_CONSECUTIVE_MIN_FAILURES requests AND a full backoff
          // escalation per sub-range to rediscover the same sentence, burning the request budget
          // and up to MAX_BACKOFF_TOTAL_MS of deliberate sleeping on a scan that was never going
          // to cover anything. No backoff either — capping, not failing.
          return {
            policy: { ...base, ceiling, consecutiveMinFailures: 0 },
            action: { kind: 'giveUpSubrange', backoffMs: 0 },
          }
        }
        // A real, serveable cap: jump straight to it instead of halving toward it. No backoff —
        // this is an endpoint capping, not an endpoint failing, which is the same reason the
        // blind-halving branch below does not sleep either.
        return {
          policy: { ...base, ceiling, chunkSize: capBlocks, consecutiveMinFailures: 0 },
          action: { kind: 'jumpToDeclaredCap' },
        }
      }

      // --- the expensive-refusal fast path (S1) ---------------------------------------------
      // Halving assumes a refusal is free. It is, for a provider that VALIDATES the span — and it
      // is not, for one that executed the query before refusing (a result-size cap) or simply hung
      // until viem gave up (a timeout, which viem has already retried 3 times at ~10s before this
      // reducer ever sees the outcome). On those, thirteen halvings from MAX_SCAN_WINDOW is minutes
      // of no progress. So when the failure classifies as transport/unavailable — precisely those
      // two shapes — collapse the window to DESCENT_TIMEOUT_FALLBACK in one step. Guarded by `>` so
      // it can fire at most once per descent and can only ever NARROW: below that width, ordinary
      // halving takes over and every termination guarantee is exactly as it was.
      if (base.chunkSize > DESCENT_TIMEOUT_FALLBACK && (failureKind === 'transport' || failureKind === 'unavailable')) {
        return {
          policy: { ...base, chunkSize: DESCENT_TIMEOUT_FALLBACK, consecutiveMinFailures: 0 },
          action: { kind: 'collapseToFallback' },
        }
      }

      if (base.chunkSize <= MIN_CHUNK) {
        // Failing at the narrowest window this scanner will ever ask for: the endpoint is failing,
        // not capping. Retry the same window MAX_CONSECUTIVE_MIN_FAILURES times, then give the
        // sub-range up (leave it out of `covered`) and move on to older blocks.
        const minFailuresSinceSuccess = base.minFailuresSinceSuccess + 1
        let consecutiveMinFailures = base.consecutiveMinFailures + 1
        const giveUp = consecutiveMinFailures >= MAX_CONSECUTIVE_MIN_FAILURES
        if (giveUp) consecutiveMinFailures = 0
        // Either way the next request goes to an endpoint that just failed at the smallest window
        // this scanner will ask for, so it waits first — moving on to an older sub-range is not a
        // reason to stop backing off, the endpoint is the thing that is unwell, not the range.
        // Waiting stops once MAX_BACKOFF_TOTAL_MS is spent: an endpoint still failing after a
        // solid minute of deliberate quiet is not going to be nursed back by more of it, and the
        // request budget — not the sleeping — is what stops the scan.
        const wait = Math.min(
          BACKOFF_BASE_MS * 2 ** (minFailuresSinceSuccess - 1),
          BACKOFF_MAX_MS,
          MAX_BACKOFF_TOTAL_MS - base.backoffSpentMs,
        )
        const backoffSpentMs = wait > 0 ? base.backoffSpentMs + wait : base.backoffSpentMs
        return {
          policy: { ...base, consecutiveMinFailures, minFailuresSinceSuccess, backoffSpentMs },
          action: giveUp ? { kind: 'giveUpSubrange', backoffMs: wait } : { kind: 'retryMinChunk', backoffMs: wait },
        }
      }

      // Blind halving: retry the same sub-range with the smaller window — a cap, not an outage,
      // so no backoff.
      return {
        policy: { ...base, chunkSize: maxBig(base.chunkSize / 2n, MIN_CHUNK), consecutiveMinFailures: 0 },
        action: { kind: 'halve' },
      }
    }
  }
}
