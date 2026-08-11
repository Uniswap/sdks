import type { PublicClient } from 'viem'

import { DEFAULT_DEADLINE_SECONDS, DEFAULT_SLIPPAGE_BPS, PREFLIGHT_TOP_K } from '../constants'
import { encoderFor } from '../encode'
import { UnsupportedRouteError } from '../errors'
import type { Semaphore } from '../internal/rpc'
import { requireExecution } from '../manifest'
import { compileExecutionPlan } from '../plan/compile'
import { routeId } from '../protocols'
import type { ProtocolModule } from '../protocols/types'
import type {
  BlockRef,
  ChainManifest,
  CompiledLimits,
  EncodedTx,
  Protocol,
  QuotedRoute,
  RankedRoute,
  SwapRequest,
} from '../types'
import { preflightTx } from '../verify/preflight'

import type { Notifier } from './notify'
import { applyPreflight } from './state'
import type { SearchState } from './state'

// ---------------------------------------------------------------------------
// THE VERIFIER (spec §3.4) — the step that turns "the best quote we found" into
// "the tx we are willing to hand back, and what we are willing to claim about
// it". The pump says a route is *profitable*; only this file says it is
// *executable*, and the difference is the whole `execution` axis
// (`verified` / `needs-action` / `failed` / `unverified`) the facade classifies
// off.
//
// A concurrent activity driven by leader changes: the loop hands it each
// recompose's ranked list, and it decides — without blocking the loop — what
// (if anything) deserves the next simulation round trip.
//
//   * AT MOST ONE PREFLIGHT IS IN FLIGHT. A leader change during flight queues
//     the NEW leader — the current one, not a backlog of every leader the pump
//     briefly produced. When the flight settles, the queued round runs; with
//     nothing queued the settlement pokes `wake` and the loop's next
//     `consider()` decides what (if anything) comes next.
//   * THE READINESS GATE IS STRUCTURAL. `consider()` cannot run before readiness
//     has settled, because the requirement list is what decides whether a
//     simulation may happen at all. The loop guarantees the ordering; this class
//     asserts it, and a violation THROWS — it is a bug in the loop, not a
//     business outcome, and every business outcome here is data.
//   * THE BUDGET IS PER SEARCH. `PREFLIGHT_TOP_K` simulations for the whole
//     search, counted by `state.verification.preflightAttempted`, which
//     `applyPreflight` owns. `preflightBudgetExhausted` is recomputed on
//     every walk, never accumulated.
//
// TWO ORDERING INVARIANTS INSIDE `advance()` ARE LOAD-BEARING for the facade's
// needs-action-vs-verified gating (`classifySwap` in `router.ts`), and both are
// invisible from the call site:
//
//  1. THE REQUIREMENTS EARLY RETURN COMES BEFORE THE SIMULATION. An unfunded or
//     unapproved trader cannot be honestly simulated (this package rejects state
//     overrides), so a non-empty requirement list short-circuits verification and
//     leaves the candidate `needs-action` — the tx is still compiled and kept.
//     Simulating first would make every unfunded trader's leader `failed` on a
//     revert that says nothing about the route, and `classifySwap` would report a
//     confident `no-route` to a trader who merely has to approve first. (The
//     `readinessDegraded` branch inside it is the same rule one notch weaker: a
//     requirement list assembled from reads that did not all land is not a to-do
//     list, so the route stays `unverified` and the facade says `inconclusive`
//     rather than inventing an errand.)
//  2. REQUIREMENTS ARE READ, NEVER RECOMPUTED. Readiness runs once per search, at
//     the pinned block, and lands in `state.requirements` through
//     `applyReadiness`; every `consider()` reads that same snapshot. That is what
//     makes the gating STABLE: two candidates judged at different moments were
//     judged against identical funding state, so the emitted sequence can never
//     flip `needs-action` -> `verified` (or back) because of a re-read rather
//     than a better route.
//
// A revert and a transport failure are also not the same evidence: a revert fails
// the candidate (with its revert data verbatim, never interpreted), a lost
// `eth_call` leaves it `unverified` and sets `verificationDegraded` so the search
// is reported `inconclusive` instead of ruling the route out.
// ---------------------------------------------------------------------------

export type VerifierCtx = {
  client: Pick<PublicClient, 'request'>
  manifest: ChainManifest
  modules: Record<Protocol, ProtocolModule>
  semaphore?: Semaphore | undefined
}

/** The two state fields compile+encode touches: the pinned block (whose timestamp the deadline is
 * measured from) and the per-routeId memo. Structural rather than `SearchState` so a test can hand
 * exactly these two fields to the memo without building a whole search. */
type CompileMemo = { block: BlockRef; compiledById: Map<string, { tx: EncodedTx; limits: CompiledLimits }> }

/** Either the calldata, or the reason this candidate can never be executed — both are answers about
 * the candidate, and the caller records the failure in whichever state vocabulary it speaks. */
export type CompileResult = { tx: EncodedTx } | { error: string }

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
 * command set cannot express) is a business outcome: returns `{ error }` and the caller falls
 * through. Any other error (TypeError, viem ABI errors, etc.) is a bug and propagates loudly.
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
export function compileAndEncode(
  state: CompileMemo,
  ctx: Pick<VerifierCtx, 'manifest' | 'modules'>,
  req: SwapRequest,
  quoted: QuotedRoute,
): CompileResult {
  const id = routeId(quoted.route)
  const cached = state.compiledById.get(id)
  if (cached) return { tx: cached.tx }

  try {
    // Safe to require here: this only ever runs for a swap, and `validateSwapRequest` already
    // rejected a swap request against an execution-less manifest, synchronously, before this search
    // started (C4-P3).
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
    return { tx }
  } catch (err) {
    // Both arms are "this candidate cannot be executed", and both keep their reason: a search whose
    // every candidate lands here classifies `no-route`, and without the message the caller is told
    // only that nothing worked, never that (say) its own recipient collided with the route's pool.
    if (err instanceof UnsupportedRouteError) return { error: err.message }
    if (isIntegerOutOfRange(err)) return { error: 'a quoted amount does not fit the Universal Router\'s uint128 fields' }
    throw err
  }
}

/** A quoted route dressed with whatever verification has learned about it — `unverified` when
 * nothing has, which is also what an untouched `execution` map means. */
export function withExecution(state: Pick<SearchState, 'execution'>, quoted: QuotedRoute): RankedRoute {
  const existing = state.execution.get(routeId(quoted.route))
  return {
    ...quoted,
    execution: existing?.status ?? 'unverified',
    ...(existing?.revertData !== undefined && { revertData: existing.revertData }),
  }
}

/**
 * Which evaluated route leads the result: the one the verifier established, else the best-ranked
 * route that has not been ruled out, else the best-ranked route regardless.
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

export class Verifier {
  private readonly state: SearchState
  private readonly ctx: VerifierCtx
  private readonly req: SwapRequest
  private readonly wake: Notifier
  /** The routeId whose preflight is out, if any — the "at most one in flight" rule, as a field. */
  private flying: string | undefined
  /** The newest ranked list handed to `consider()` while a preflight was out. Overwritten rather
   * than appended: a leader superseded before its turn came was never worth a round trip. */
  private queued: QuotedRoute[] | undefined
  private leader: string | undefined

  constructor(args: { state: SearchState; ctx: VerifierCtx; req: SwapRequest; wake: Notifier }) {
    this.state = args.state
    this.ctx = args.ctx
    this.req = args.req
    this.wake = args.wake
  }

  /**
   * Called by the loop after each recompose, with the ranked candidates. Returns immediately: the
   * simulation (if one is due) runs concurrently and pokes `wake` when it settles.
   */
  consider(ranked: QuotedRoute[]): void {
    if (this.state.requirements === undefined) {
      // A programmer error, not a business outcome: the requirement list decides whether a
      // simulation may happen at all, so a `consider()` before readiness settled would verify
      // against funding state nobody has read yet.
      throw new Error('Verifier.consider() ran before readiness settled — the loop must await the readiness outcome first')
    }
    if (this.flying !== undefined) {
      this.queued = ranked
      return
    }
    this.advance(ranked)
  }

  /**
   * True when this verifier is holding nothing: no preflight out, and no leader waiting for the
   * next slot. The loop's termination check reads it, so a `false` here is the only thing standing
   * between a still-verifying search and a premature `final`.
   */
  idle(): boolean {
    return this.flying === undefined && this.queued === undefined
  }

  /**
   * The routeId verification has established as the leader, if any — handed to {@link pickLeader}.
   * STICKY across rounds: a route that verified stays the established leader until a better one
   * verifies (or is gated `needs-action`), so a candidate that merely out-prices it while its own
   * simulation is still out cannot take the lead on an unverified promise.
   */
  leaderId(): string | undefined {
    return this.leader
  }

  /**
   * One walk down the ranked list. Skips what is already settled, compiles what is not, and stops
   * at the first candidate that needs a round trip — dispatching exactly one preflight.
   *
   * See the module header for why the requirements check precedes the simulation. An `unverified`
   * entry (a transport loss, or a revert with the trader's funding state partly unread) is passed
   * OVER rather than re-asked — only this candidate's call was lost; the next one may well answer —
   * and the fall-through is durable for the whole search. Such an entry can only have been written
   * by `applyPreflight`'s inconclusive arms; a candidate nobody has simulated has no entry at all.
   */
  private advance(ranked: QuotedRoute[]): void {
    const { state } = this
    const requirements = state.requirements ?? []
    // Recomputed by every walk — `exhausted` describes THIS look at the field. Only the cap branch
    // below may set it true.
    state.verification.preflightBudgetExhausted = false

    for (const quoted of ranked) {
      const id = routeId(quoted.route)
      const known = state.execution.get(id)?.status
      if (known === 'failed' || known === 'unverified') continue
      // Both are settled verdicts on this candidate, and both lead. Re-deriving `needs-action` would
      // reach the identical answer — requirements are a per-search snapshot (invariant 2) — so the
      // short-circuit only spares the outcome log a duplicate entry per loop cycle.
      if (known === 'verified' || known === 'needs-action') {
        this.leader = id
        return
      }

      // The cap stopped us at a candidate that is neither failed nor verified — one a simulation
      // might still have gone somewhere with. That, and only that, is what
      // `SearchReport.verification.preflightBudgetExhausted` claims: reaching it after the field is
      // exhausted of tryable candidates is not exhaustion, and neither is an ABORT, whose branch
      // below hands back the leader without ever consulting the budget (the caller's abort is what
      // stopped this search, and `preflightBudgetExhausted` exists to name a simulation budget
      // specifically).
      if (!state.aborted && state.verification.preflightAttempted >= PREFLIGHT_TOP_K) {
        state.verification.preflightBudgetExhausted = true
        return
      }

      const compiled = compileAndEncode(state, this.ctx, this.req, quoted)
      if ('error' in compiled) {
        // Nothing about this route is encodable, at this block or any other. That costs no
        // simulation, so it must not consume one of the fall-through slots — `PREFLIGHT_TOP_K`
        // budgets round trips, not disqualifications.
        applyPreflight(state, id, { kind: 'uncompilable', reason: compiled.error })
        continue
      }

      if (requirements.length > 0) {
        if (state.readinessDegraded) {
          this.leader = id
          return
        }
        applyPreflight(state, id, { kind: 'needs-action' })
        this.leader = id
        return
      }
      if (state.aborted) {
        // Nobody ruled this route out and nobody verified it; the tx is compiled and the leader is
        // handed back `unverified`, which the facade classifies `inconclusive`.
        this.leader = id
        return
      }

      this.dispatch(id, compiled.tx)
      return
    }
  }

  /** Sends the one in-flight preflight. `preflightTx` never throws, but a rejection must still not
   * leave `flying` set forever — that would hang the loop's termination check — so it settles as the
   * channel that means "we learned nothing": transport. */
  private dispatch(id: string, tx: EncodedTx): void {
    this.flying = id
    void preflightTx(this.ctx.client, tx, this.req.trader, this.state.block.number, this.ctx.semaphore).then(
      (result) => {
        if (result.ok) {
          applyPreflight(this.state, id, { kind: 'verified' })
          this.leader = id
        } else if (result.kind === 'transport') {
          applyPreflight(this.state, id, { kind: 'transport' })
        } else if (this.state.readinessDegraded) {
          // It reverted, but with the trader's funding state partly unread there is no telling
          // whether the route is broken or the trader simply is not ready — and "the route is
          // broken" is the claim that would stick in `alternatives` as `failed`.
          applyPreflight(this.state, id, { kind: 'unverified' })
        } else {
          applyPreflight(this.state, id, {
            kind: 'reverted',
            ...(result.revertData !== undefined && { revertData: result.revertData }),
          })
        }
        this.settle()
      },
      () => {
        applyPreflight(this.state, id, { kind: 'transport' })
        this.settle()
      },
    )
  }

  /** Frees the slot, gives it to the queued leader if one is waiting, and wakes the loop either way
   * (the outcome just applied may have changed the lead, the report, or both). */
  private settle(): void {
    this.flying = undefined
    const queued = this.queued
    this.queued = undefined
    if (queued !== undefined) this.advance(queued)
    this.wake.poke()
  }
}
