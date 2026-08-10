import { DEFAULT_DEADLINE_SECONDS, DEFAULT_SLIPPAGE_BPS, PREFLIGHT_TOP_K } from '../constants'
import { encoderFor } from '../encode'
import { UnsupportedRouteError } from '../errors'
import { requireExecution } from '../manifest'
import { compileExecutionPlan } from '../plan/compile'
import { routeId } from '../protocols'
import { rankRoutes } from '../quote/quote'
import type { EncodedTx, QuotedRoute, RankedRoute } from '../types'
import { preflightTx } from '../verify/preflight'

import { buildReport } from './report'
import type { InternalResult, Run } from './waves'

// ---------------------------------------------------------------------------
// Leader evaluation: rank, compile, encode, simulate.
//
// This is the stage that turns "the best quote we found" into "the tx we are
// willing to hand back, and what we are willing to claim about it". Quoting
// says a route is *profitable*; only this file says it is *executable*, and
// the difference is the whole `execution` axis (`verified` / `needs-action` /
// `failed` / `unverified`) the facade classifies off.
//
// CRITICAL INVARIANT — DO NOT REORDER `verifyLeader`'s BODY. Two things about
// its shape are load-bearing for the facade's needs-action-vs-verified gating
// (`classifySwap` in `router.ts`), and both are invisible from the call site:
//
//  1. THE REQUIREMENTS EARLY RETURN COMES BEFORE THE SIMULATION. An unfunded
//     or unapproved trader cannot be honestly simulated (this package rejects
//     state overrides), so a non-empty requirement list short-circuits
//     verification and returns the candidate with `needs-action` — the tx is
//     still compiled and returned. Moving the `preflightTx` call above that
//     check would make every unfunded trader's leader `failed` on a revert
//     that says nothing about the route, and `classifySwap` would report a
//     confident `no-route` to a trader who merely has to approve first.
//     (The `readinessDegraded` branch inside it is the same rule one notch
//     weaker: a requirement list assembled from reads that did not all land is
//     not a to-do list, so the route stays `unverified` and the facade says
//     `inconclusive` rather than inventing an errand.)
//
//  2. REQUIREMENTS ARE COMPUTED ONCE, IN WAVE 0, AND NEVER RECOMPUTED. The
//     readiness reads run in `wave0a` (concurrently with the probes) and land in
//     `state.requirements`; every later wave reads that same snapshot at the
//     same pinned block. That is what makes the gating *stable*: a route
//     verified in wave 1 and a route gated `needs-action` in wave 3 were judged
//     against identical funding state, so the yielded sequence can never flip
//     `needs-action` -> `verified` (or back) because of a re-read rather than a
//     better route. Re-reading readiness per wave would break that, in addition
//     to costing round trips the lazy generator exists to avoid.
//
// A revert and a transport failure are also not the same evidence here (see
// `waves.ts`'s header): a revert fails the candidate, a lost `eth_call` leaves
// it `unverified` and sets `verificationDegraded` so the search is reported
// `inconclusive` instead of ruling the route out.
// ---------------------------------------------------------------------------

/**
 * viem's `IntegerOutOfRangeError`, however deeply the encoder wrapped it.
 *
 * Matched by `name` rather than `instanceof`: viem's error classes are not part of this package's
 * public contract, the concrete constructor is not exported from a stable path, and an
 * `instanceof` against a duplicated viem copy in a consumer's tree would silently stop matching.
 * The `cause` chain is walked (bounded) because `encodeFunctionData`/`encodeAbiParameters` may
 * re-wrap the range error on the way out.
 */
function isIntegerOutOfRange(err: unknown): boolean {
  let current: unknown = err
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (current.name === 'IntegerOutOfRangeError') return true
    const next: unknown = (current as { cause?: unknown }).cause
    if (next === current) return false
    current = next
  }
  return false
}

/**
 * Compiles + encodes a route, memoized per routeId. UnsupportedRouteError (a route the closed
 * command set cannot express) is a business outcome: returns undefined and the caller falls through.
 * Any other error (TypeError, viem ABI errors, etc.) is a bug and propagates loudly.
 *
 * ONE VIEM ERROR IS TREATED AS A BUSINESS OUTCOME TOO: `IntegerOutOfRangeError`. The request's own
 * `amountIn` is bounded below 2^128 up front (see `constants.ts#MAX_AMOUNT_IN`), but a *quote* is
 * a number the chain handed back — a hostile or broken quoter, or a hooked pool answering with an
 * absurd `amountOut`, can produce a `minAmountOut` that does not fit the `uint128` fields of the
 * Universal Router's v4 swap params. That is a fact about this candidate, not a bug in this
 * package: the correct response is to degrade the candidate (it cannot be encoded, so it cannot be
 * executed) and let the search continue to the next one, exactly as for an unsupported route shape.
 * Re-throwing would let one poisoned quote abort an otherwise healthy search.
 */
export function compileAndEncode(run: Extract<Run, { kind: 'swap' }>, quoted: QuotedRoute): EncodedTx | undefined {
  const { ctx, req, state } = run
  const id = routeId(quoted.route)
  const cached = state.compiledById.get(id)
  if (cached) return cached.tx

  try {
    // Safe to require here: `compileAndEncode` only ever runs on a swap `Run`, and
    // `validateSwapRequest` already rejected a swap request against an execution-less manifest,
    // synchronously, before this search started (C4-P3).
    const execution = requireExecution(ctx.manifest)
    const plan = compileExecutionPlan({
      quoted,
      tokenIn: req.tokenIn,
      tokenOut: req.tokenOut,
      trader: req.trader,
      recipient: req.recipient ?? req.trader,
      slippageBps: req.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
      ...(req.permit !== undefined && { permit: req.permit }),
      wrappedNative: ctx.manifest.wrappedNative,
      modules: ctx.modules,
    })
    const deadline = state.block.timestamp + BigInt(req.deadlineSeconds ?? DEFAULT_DEADLINE_SECONDS)
    const tx = encoderFor(execution.commandSet)(plan, execution, deadline)
    // The limits are echoed onto the public result (C4-P7) straight from the plan and the deadline
    // this call just used, so there is no second derivation of either number to drift from the
    // calldata they were encoded into.
    state.compiledById.set(id, { tx, limits: { minAmountOut: plan.deliverOutput.minAmountOut, deadline } })
    return tx
  } catch (err) {
    // Both arms are "this candidate cannot be executed", and both keep their reason: a search whose
    // every candidate lands here classifies `no-route`, and without the message the caller is told
    // only that nothing worked, never that (say) its own recipient collided with the route's pool.
    if (err instanceof UnsupportedRouteError) {
      state.firstCompileError ??= err.message
      return undefined
    }
    if (isIntegerOutOfRange(err)) {
      state.firstCompileError ??= 'a quoted amount does not fit the Universal Router\'s uint128 fields'
      return undefined
    }
    throw err
  }
}

export function withExecution(run: Run, quoted: QuotedRoute): RankedRoute {
  const existing = run.state.execution.get(routeId(quoted.route))
  return {
    ...quoted,
    execution: existing?.status ?? 'unverified',
    ...(existing?.revertData !== undefined && { revertData: existing.revertData }),
  }
}

/**
 * Verifies the leader for a swap: compile, encode, then simulate as the real trader at the pinned
 * block, falling through to the next candidate on failure for at most `PREFLIGHT_TOP_K` attempts
 * per wave.
 *
 * A revert fails that candidate (keeping its revert data verbatim, never interpreted). A *transport*
 * failure does not: the simulation never happened, so the route stays `unverified` — it may be
 * perfectly executable and nobody found out — and `verificationDegraded` is set so the facade
 * classifies the search `inconclusive` instead of ruling the route out. Fall-through still continues
 * (only this candidate's call was lost; the next one may well answer), and a candidate that *does*
 * verify afterwards is still honestly `ready`: that tx really was simulated at this block.
 *
 * Degraded *readiness* (a balance/allowance read that never landed) changes two decisions on top of
 * that: no `needs-action` is promised from a requirement list that is known-incomplete, and a revert
 * is not blamed on the route, since an unread funding gap explains it just as well.
 *
 * The order of the checks below is an invariant, not a style — see this file's header.
 *
 * Returns the routeId that should lead the result, if one was established this wave.
 */
export async function verifyLeader(
  run: Extract<Run, { kind: 'swap' }>,
  ranked: QuotedRoute[],
  allowPreflight: boolean,
): Promise<string | undefined> {
  const { state } = run
  const requirements = state.requirements ?? []
  let attempts = 0
  // Reset for THIS wave's call — `exhausted` reflects only what this call did, mirroring
  // `enumeration`'s pruning counters ("last wave wins"). Only the cap-break branch below may set it
  // true; every other exit (a leader resolved before the budget ran out, or never needed it) leaves
  // it at this default.
  //
  // THE ABORT PATH ALWAYS LEAVES IT `false`, BY DESIGN. `allowPreflight` is `!state.aborted`
  // (`waves.ts`'s `evaluate` call site), and `if (!allowPreflight) return id` below fires for the
  // very first eligible candidate — before the loop ever reaches the cap-check branch that could set
  // this `true`. So an aborted search never reports a preflight budget as exhausted, however many
  // candidates are actually sitting untried: the caller's abort is what stopped the search, not a
  // simulation budget, and `preflightBudgetExhausted` exists to name the latter specifically.
  state.verification.preflightBudgetExhausted = false

  for (let i = 0; i < ranked.length; i++) {
    if (attempts >= PREFLIGHT_TOP_K) {
      // The cap stopped us with candidates still on the table (`ranked.slice(i)`). Whether that is a
      // real exhaustion — SearchReport.verification's contract — depends on whether any of them might
      // still have gone somewhere: one already known `'failed'` OR `'verified'` from an earlier wave
      // contributes nothing new no matter how much budget it got (a `'verified'` one is already the
      // answer — `pickLeader`'s own fallback finds it regardless of whether `verifyLeader` returned an
      // id — and re-simulating it would not change that), so neither counts as "untried" here. Without
      // excluding `'verified'` too, a cap that happened to land just before an already-verified
      // candidate reported `preflightBudgetExhausted: true` on what `classifySwap` still correctly
      // resolves to `ready` — a report that contradicts its own result.
      state.verification.preflightBudgetExhausted = ranked.slice(i).some((r) => {
        const status = state.execution.get(routeId(r.route))?.status
        return status !== 'failed' && status !== 'verified'
      })
      break
    }
    const quoted = ranked[i]!
    const id = routeId(quoted.route)
    const known = state.execution.get(id)
    if (known?.status === 'failed') continue
    if (known?.status === 'verified') return id

    const tx = compileAndEncode(run, quoted)
    if (!tx) {
      // Nothing about this route is encodable, at this block or any other. That costs no
      // simulation, so it must not consume one of the fall-through slots — `PREFLIGHT_TOP_K`
      // budgets round trips, not disqualifications.
      state.execution.set(id, { status: 'failed' })
      continue
    }

    // An unfunded or unapproved trader cannot be honestly simulated (we reject state overrides), so
    // requirements short-circuit verification entirely — the tx is still compiled and returned.
    //
    // Unless the readiness reads themselves are incomplete: then this list is not a to-do list, and
    // `needs-action` ("do exactly these things and you're set") would be a promise built on a read
    // that never landed. The route stays `unverified`, the tx is still compiled, and the facade
    // classifies `inconclusive`/`rpc-degraded` — "ask again", not a fabricated errand.
    if (requirements.length > 0) {
      if (state.readinessDegraded) return id
      state.execution.set(id, { status: 'needs-action' })
      return id
    }
    if (!allowPreflight) return id

    attempts++
    state.verification.preflightAttempted++
    const result = await preflightTx(run.ctx.client, tx, run.req.trader, state.block.number, run.ctx.semaphore)
    if (result.ok) {
      state.execution.set(id, { status: 'verified' })
      return id
    }
    if (result.kind === 'transport') {
      state.verificationDegraded = true
      state.execution.set(id, { status: 'unverified' })
      continue
    }
    if (state.readinessDegraded) {
      // It reverted, but with the trader's funding state partly unread there is no telling whether
      // the route is broken or the trader simply is not ready — and "the route is broken" is the
      // claim that would stick in `alternatives` as `failed`. Leave it unverified instead.
      state.execution.set(id, { status: 'unverified' })
      continue
    }
    state.execution.set(id, { status: 'failed', ...(result.revertData !== undefined && { revertData: result.revertData }) })
  }

  return undefined
}

/**
 * Which evaluated route leads the result: the one `verifyLeader` established this wave, else the
 * best-ranked route that has not been ruled out, else the best-ranked route regardless.
 *
 * The last fallback is deliberate. A search whose every candidate `failed` still hands back its
 * leader (and its compiled tx) — the facade needs something to report `no-route` *about*, and the
 * caller deserves to see what was tried rather than an empty result.
 */
export function pickLeader(evaluated: RankedRoute[], leaderId: string | undefined): RankedRoute {
  return (
    (leaderId !== undefined ? evaluated.find((e) => routeId(e.route) === leaderId) : undefined) ??
    evaluated.find((e) => e.execution !== 'failed') ??
    evaluated[0]!
  )
}

export async function evaluate(run: Run, done: boolean): Promise<InternalResult> {
  const { state } = run
  const ranked = rankRoutes([...state.quoted.values()])

  // VERIFICATION RUNS BEFORE THE REPORT IS BUILT (C4-P7). `verifyLeader` mutates
  // `state.verification` (attempts/exhaustion), and `buildReport` reads it — building the report
  // first would snapshot last wave's verification counts under this wave's report, exactly the kind
  // of stale-report bug `SearchReport` exists to never produce (see `report.ts`'s header).
  const leaderId = ranked.length > 0 && run.kind === 'swap' ? await verifyLeader(run, ranked, !state.aborted) : undefined

  const report = buildReport(run)
  const base = {
    report,
    done,
    ...(state.requirements !== undefined && { requirements: state.requirements }),
    ...(state.firstCompileError !== undefined && { compileError: state.firstCompileError }),
  }

  if (ranked.length === 0) return { alternatives: [], ...base }

  if (run.kind === 'quote') {
    const evaluated = ranked.map((q) => withExecution(run, q))
    return { best: evaluated[0]!, alternatives: evaluated.slice(1), ...base }
  }

  const evaluated = ranked.map((q) => withExecution(run, q))
  const best = pickLeader(evaluated, leaderId)
  const alternatives = evaluated.filter((e) => e !== best)
  const compiled = state.compiledById.get(routeId(best.route))

  return { best, alternatives, ...base, ...(compiled !== undefined && { tx: compiled.tx, limits: compiled.limits }) }
}
