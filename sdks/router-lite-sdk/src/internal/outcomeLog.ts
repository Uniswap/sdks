import type { Address, Hex } from 'viem'

import { manifestFor } from '../manifest'
import { BIGINT_TAG, PoolIndex } from '../pools/poolIndex'
import type { PoolIndexSnapshot } from '../pools/poolIndex'
import { PROTOCOL_MODULES, routeId } from '../protocols'
import { classifyQuote, classifySwap, foldEvent } from '../router'
import { search } from '../search/loop'
import type { EngineEvent, SearchContext } from '../search/loop'
import { composeRoutes, foldRoundInLegs, inLegIntermediate } from '../search/pump'
import type { PumpCtx, RoundInLeg } from '../search/pump'
import { buildReport } from '../search/report'
import { applyAbort, applyCoverage, applyMeasurement, applyPreflight, applyReadiness, createState } from '../search/state'
import type { OutcomeEntry, SearchState } from '../search/state'
import { compileAndEncode, pickLeader, withExecution } from '../search/verifier'
import type {
  BlockRef,
  ChainManifest,
  CurrencyRef,
  QuoteRequest,
  QuoteResult,
  QuotedRoute,
  RankedRoute,
  SearchReport,
  SwapRequest,
  SwapResult,
} from '../types'

import { toGraphNode } from './currency'
import { assertResultCoherent } from './resultCoherence'

// ---------------------------------------------------------------------------
// THE OUTCOME-LOG GOLDEN FORMAT — a golden that records what the search
// LEARNED, not which RPCs it made.
//
// Its predecessor recorded one search's complete RPC conversation and replayed
// the engine against it. That golden asserted the right thing (the ANSWER) but
// was keyed on the wrong thing (the QUESTIONS): the event-driven cutover
// changed what the search asks — leg-measurement rounds and coverage-worker
// scans instead of wave batches — and every recorded conversation became
// unreplayable in one commit, with no `--regold` able to help, because bytes
// recorded for old request shapes assert nothing about new ones.
//
// An outcome log is the other half of that seam. `search/state.ts` already
// routes EVERY state change through five `apply*` functions; with recording on,
// each application appends its own input to `state.outcomeLog`. That log is the
// engine's knowledge, stated in a vocabulary the transport cannot reach:
// "this leg priced at this amount", "this scope's scan completed", "this route
// reverted in preflight". A change to how the engine ASKS moves nothing here; a
// change to what it CONCLUDES moves everything.
//
// REPLAY IS A FOLD ({@link foldOutcomes}): push the entries back through the
// real `apply*`, compose with the real `search/pump.ts#composeRoutes`, fold the
// real `search/report.ts#buildReport`, and classify through the real
// `router.ts#classifyQuote`/`classifySwap`. Nothing is re-implemented here; the
// fixture supplies inputs, the package supplies behavior.
//
// ---------------------------------------------------------------------------
// WHAT THE FOLD REPRODUCES, AND WHAT THE FIXTURE HAS TO CARRY
//
// The log is complete for everything `apply*` owns, and ONLY for that. Three
// classes of search state are written outside `apply*`, so a pure fold of the
// log cannot reproduce them and the fixture carries them as `context`:
//
//  1. THE PINNED BLOCK AND THE HEAD VERDICT (`block`, `headRegressed`) — decided
//     by `loop.ts#fetchBlock` before any outcome exists.
//  2. THE FRONTIER AND THE PAIR CEILING (`intermediates`, `pairCeilingHit`) —
//     written by `loop.ts#advanceIntermediates` and `pump.ts#measurablePools`.
//     `buildReport` reads both (the selected/discovered ratio, the
//     exhaustiveness axis), so a fixture that omitted them would fold a report
//     that describes a different search.
//  3. THE INDEX (`index`, a `PoolIndexSnapshot` taken as the search left it) —
//     the coverage cache `buildReport` derives `coveredRanges` from, and the
//     negative cache `composeRoutes` excludes routes by. Both are CROSS-SEARCH
//     state living in a shared `PoolIndex`; neither is derivable from one
//     search's outcomes.
//
// Two `SearchState` fields are deliberately NOT reproduced, because nothing the
// golden asserts reads them: `gateOpened` (a coverage-worker latch, reported
// nowhere) and `indexVersion` (the pump's own re-plan cursor). Both are written
// outside `apply*`; a deferred ledger note in `state.ts` records the same fact.
//
// The one derived quantity the fold DOES rebuild is `m_X`, the best in-leg per
// intermediate — see {@link replayEntries} for why it is a re-derivation rather
// than a recorded field, and why it is exact.
//
// ---------------------------------------------------------------------------
// REDACTION: STRUCTURAL, NOT A PASS.
//
// An outcome log holds pool identities, currency refs, amounts, block numbers,
// route ids, revert DATA (raw bytes, never message text) and a compile
// disqualification reason this package itself wrote. There is no field anywhere
// in `OutcomeEntry` that carries a provider error message, a URL, a header, or
// a hostname — the vocabulary simply has no slot for one, which is why the old
// format's `captureError`-plus-redact round trip has no successor here.
// `outcome.golden.test.ts` asserts the corpus over that claim rather than
// trusting it.
// ---------------------------------------------------------------------------

/**
 * Bumped whenever the SHAPE of a fixture changes in a way that makes an older one unfoldable — a new
 * required `context` field, a changed entry encoding, a different bigint marker. There is no
 * migration path: fixtures are re-recorded, which is cheap for the hermetic corpus and one `chainz
 * exec` for the live one.
 */
export const OUTCOME_LOG_SCHEMA_VERSION = 1

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

/** The request, JSON-shaped. `amountIn` is a tagged bigint like every other; `hints` ride verbatim. */
export type FixtureRequest = {
  tokenIn: CurrencyRef
  tokenOut: CurrencyRef
  amountIn: bigint
  hints?: QuoteRequest['hints']
  /** Swap-only. Present exactly when `kind === 'swap'`. */
  trader?: Address
  recipient?: Address
  slippageBps?: number
  deadlineSeconds?: number
}

/** The search facts written outside `apply*` — see the module header's three classes. */
export type FixtureContext = {
  block: BlockRef
  headRegressed: boolean
  intermediates: { selected: string[]; discovered: number; notch: number }
  pairCeilingHit: boolean
  /** `req.hints`' v4 hookData, keyed by lowercased poolId — stamped onto v4 legs at composition. */
  hookData: [string, Hex][]
  /** The shared `PoolIndex` as this search left it: the coverage cache and the negative cache. */
  index: PoolIndexSnapshot
}

export type OutcomeFixture = {
  schemaVersion: number
  label: string
  chainId: number
  kind: 'quote' | 'swap'
  recordedAt: string
  /** Free-form provenance/why-this-fixture prose. Never a URL, never a vendor name. */
  notes?: string
  /**
   * The manifest this search ran against, inline — for a HERMETIC fixture, whose fake chain has no
   * built-in manifest. Absent for a live recording, which folds against `manifestFor(chainId)` on
   * purpose: the built-in manifest is production input, and a golden that pinned a private copy of it
   * would keep passing after the real one changed underneath every caller.
   */
  manifest?: ChainManifest
  request: FixtureRequest
  context: FixtureContext
  /** Every applied outcome, in order — `state.outcomeLog`. */
  log: OutcomeEntry[]
  /** What folding this fixture must produce. Written by the recorder FROM THE FOLD, after proving the
   * fold reproduces the live search's own result (see `scripts/recordOutcomes.ts`). */
  golden: CanonicalResult
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * A fixture as JSON, with every `bigint` encoded as a tagged string.
 *
 * The tag is `pools/poolIndex.ts`'s own {@link BIGINT_TAG}, imported rather than re-declared: a
 * fixture EMBEDS a `PoolIndexSnapshot`, so a second marker would mean one file whose bigints need two
 * revivers to read. Every string a fixture contains is a pool ref id, a `0x` address/poolId/hex
 * payload, `'native'`, an enum member, a label, or free-text `notes` — and `notes` is written by
 * whoever runs the recorder, which is the one place the collision is worth naming: a note beginning
 * `$bigint:` would revive as a number. It is not caller-controlled input, and the round-trip test
 * pins the behavior rather than leaving it to be rediscovered.
 */
export function serializeFixture(fixture: OutcomeFixture): string {
  return JSON.stringify(fixture, (_key, value: unknown) =>
    typeof value === 'bigint' ? `${BIGINT_TAG}${value.toString()}` : value,
  )
}

/** The inverse of {@link serializeFixture}. A deserializer, not a validator — {@link foldOutcomes}
 * checks the one thing that decides whether the shape can be trusted at all (the schema version). */
export function parseFixture(json: string): OutcomeFixture {
  return JSON.parse(json, (_key, value: unknown) =>
    typeof value === 'string' && value.startsWith(BIGINT_TAG) ? BigInt(value.slice(BIGINT_TAG.length)) : value,
  ) as OutcomeFixture
}

// ---------------------------------------------------------------------------
// Canonical (golden) shapes — JSON-safe, bigint-free, order-normalized.
// ---------------------------------------------------------------------------

export type CanonicalRoute = {
  routeId: string
  protocols: string[]
  /** The currency path, `tokenIn` first: `[legs[0].currencyIn, ...legs[i].currencyOut]`. */
  path: string[]
  amountIn: string
  amountOut: string
  intermediateAmounts: string[]
  /**
   * The quoter's own gas word for this route, when it reported one — decimal string, absent for a
   * route with a v2 leg (see `RouteQuote.gasEstimate`). It is a return slot of the quoter calls these
   * searches make and was discarded on decode for most of this package's life, so a change that
   * silently stopped reporting it — a decode reading the wrong slot, a two-segment sum quietly
   * dropped — must fail a golden exactly as an amount regression does.
   */
  gasEstimate?: string
  promotedOverComplex?: true
  /** Verification's verdict on this route. Present on every route of a SWAP result and on none of a
   * quote's (`router.ts#toQuoted` strips it) — asserted as that iff by the schema-pin test. */
  execution?: string
  /** The raw return data of a reverted preflight, verbatim. */
  revertData?: string
}

export type CanonicalReport = {
  block: { number: string; timestamp: string }
  discovery: Record<string, { status: string; coveredRanges: { fromBlock: string; toBlock: string }[]; demandFloor: string }>
  enumeration: SearchReport['enumeration']
  quoting: SearchReport['quoting']
  aborted: boolean
  verificationDegraded: boolean
  headRegressed: boolean
  verification: { preflightAttempted: number; preflightBudgetExhausted: boolean }
}

export type CanonicalResult = {
  status: QuoteResult['status'] | SwapResult['status']
  reason?: { code: string; detail: string }
  best?: CanonicalRoute
  alternatives: CanonicalRoute[]
  /** A swap's calldata, when one was compiled — the most golden-worthy bytes in the package. */
  tx?: { to: string; data: string; value: string }
  limits?: { minAmountOut: string; deadline: string }
  requirements?: { kind: string; token: string; spender?: string; minimumAmount?: string; required?: string; available?: string }[]
  report: CanonicalReport
}

function ref(c: CurrencyRef): string {
  return c === 'native' ? 'native' : c.toLowerCase()
}

function canonicalRoute(q: QuotedRoute | RankedRoute): CanonicalRoute {
  const legs = q.route.legs
  const ranked = q as Partial<RankedRoute>
  return {
    routeId: routeId(q.route),
    protocols: legs.map((l) => l.pool.protocol),
    path: [ref(legs[0]!.currencyIn), ...legs.map((l) => ref(l.currencyOut))],
    amountIn: q.quote.amountIn.toString(),
    amountOut: q.quote.amountOut.toString(),
    intermediateAmounts: q.quote.intermediateAmounts.map((a) => a.toString()),
    ...(q.quote.gasEstimate !== undefined && { gasEstimate: q.quote.gasEstimate.toString() }),
    ...(q.promotedOverComplex !== undefined && { promotedOverComplex: q.promotedOverComplex }),
    ...(ranked.execution !== undefined && { execution: ranked.execution }),
    ...(ranked.revertData !== undefined && { revertData: ranked.revertData.toLowerCase() }),
  }
}

function canonicalReport(r: SearchReport): CanonicalReport {
  const discovery: CanonicalReport['discovery'] = {}
  for (const [protocol, d] of Object.entries(r.discovery)) {
    discovery[protocol] = {
      status: d.status,
      // Sorted for stability: covered ranges are merged sets, and their ORDER is an artifact of scan
      // completion order even when their contents are identical.
      coveredRanges: [...d.coveredRanges]
        .sort((a, b) => (a.fromBlock < b.fromBlock ? -1 : a.fromBlock > b.fromBlock ? 1 : 0))
        .map((range) => ({ fromBlock: range.fromBlock.toString(), toBlock: range.toBlock.toString() })),
      demandFloor: d.demandFloor.toString(),
    }
  }
  return {
    // `hash` is deliberately omitted: it adds nothing over `number` for a pinned fold and makes
    // goldens gratuitously noisy to eyeball.
    block: { number: r.block.number.toString(), timestamp: r.block.timestamp.toString() },
    discovery,
    enumeration: { ...r.enumeration },
    quoting: { ...r.quoting },
    aborted: r.aborted,
    verificationDegraded: r.verificationDegraded,
    headRegressed: r.headRegressed,
    verification: { ...r.verification },
  }
}

/**
 * The golden shape: everything deterministic a `QuoteResult`/`SwapResult` asserts, bigints stringified.
 *
 * The four status-dependent fields are read through one widened view rather than by narrowing the
 * union arm by arm. Each is present on some arms of `SwapResult` and none of `QuoteResult`, and every
 * one of them is OPTIONAL in the canonical shape anyway — so a per-arm walk would be eight branches
 * spelling out a rule this states once: whatever the result carries, the golden carries.
 */
export function canonicalizeResult(result: QuoteResult | SwapResult): CanonicalResult {
  const r = result as {
    best?: QuotedRoute | RankedRoute
    reason?: { code: string; detail: string }
    tx?: { to: Address; data: Hex; value: bigint }
    limits?: { minAmountOut: bigint; deadline: bigint }
    requirements?: SwapRequirement[]
  }
  return {
    status: result.status,
    ...(r.reason !== undefined && { reason: { code: r.reason.code, detail: r.reason.detail } }),
    ...(r.best !== undefined && { best: canonicalRoute(r.best) }),
    alternatives: result.alternatives.map(canonicalRoute),
    ...(r.tx !== undefined && {
      tx: { to: r.tx.to.toLowerCase(), data: r.tx.data.toLowerCase(), value: r.tx.value.toString() },
    }),
    ...(r.limits !== undefined && {
      limits: { minAmountOut: r.limits.minAmountOut.toString(), deadline: r.limits.deadline.toString() },
    }),
    ...(r.requirements !== undefined && { requirements: r.requirements.map(canonicalRequirement) }),
    report: canonicalReport(result.search),
  }
}

type SwapRequirement = Extract<SwapResult, { status: 'needs-action' }>['requirements'][number]

function canonicalRequirement(req: SwapRequirement): NonNullable<CanonicalResult['requirements']>[number] {
  if (req.kind === 'insufficient-balance') {
    return { kind: req.kind, token: ref(req.token), required: req.required.toString(), available: req.available.toString() }
  }
  return {
    kind: req.kind,
    token: ref(req.token),
    spender: req.spender.toLowerCase(),
    minimumAmount: req.minimumAmount.toString(),
  }
}

// ---------------------------------------------------------------------------
// The fold
// ---------------------------------------------------------------------------

/** Everything a fold needs beyond the entries themselves — the fixture's own `context`, plus what
 * decides which classification the result goes through. */
export type FoldContext = {
  kind: 'quote' | 'swap'
  request: QuoteRequest | SwapRequest
  manifest: ChainManifest
  context: FixtureContext
}

export type FoldOutcome = {
  /** The composed, ranked routes — `pump.ts#composeRoutes` over the replayed measurement ledger. */
  routes: QuotedRoute[]
  /** Those routes dressed with verification's verdicts, leader first. */
  ranked: RankedRoute[]
  report: SearchReport
  result: QuoteResult | SwapResult
  /** The rebuilt state, for a caller that wants to assert on a counter the report does not print. */
  state: SearchState
}

/** A client that cannot be called. Composition and report assembly are pure over the ledger; if a
 * fold ever reaches for the wire, that is a bug and it should say so by name rather than by hanging. */
const NO_CLIENT = {
  request: () => {
    throw new Error('foldOutcomes: the fold is hermetic — nothing in it may issue an RPC')
  },
} as unknown as PumpCtx['client']

/**
 * Rebuilds the search's knowledge by pushing every recorded outcome back through the real `apply*`,
 * and re-derives `m_X` — the best in-leg per intermediate — with `pump.ts`'s OWN round-fold.
 *
 * WHY `m_X` IS RE-DERIVED RATHER THAN RECORDED. It is not state a source reports; it is the pump's
 * own fold over the measurements it has, so recording it would put a derived quantity in a fixture
 * and let a composition regression be papered over by a golden that already knew the answer.
 *
 * NOTHING ABOUT THAT FOLD IS RE-IMPLEMENTED HERE. Both halves come from `pump.ts`:
 * {@link foldRoundInLegs} is the amount policy (best-per-X, strict improvement, stale-out-leg
 * invalidation) and {@link inLegIntermediate} is the role derivation. A private copy of either would
 * mean a pump policy change leaving this fold on the old rule — every committed golden staying green
 * while production composed differently, with the drift surfacing only at the next re-record.
 *
 * WHAT THIS FILE STILL OWNS IS THE ROUND BOUNDARY, and it is part of the fixture contract: `pump()`
 * applies a whole round's outcomes in one synchronous loop and folds once afterwards, so a round's
 * entries are CONTIGUOUS in the log. This walk therefore flushes at every non-measurement entry and
 * at the end. Two adjacent rounds with nothing logged between them fold as one block — which lands on
 * the same answer, because "first-occurring strict maximum" is what a per-round fold and a merged
 * fold both select, and the invalidation is monotone: it deletes exactly the out-legs priced at an
 * amount that is no longer `m_X`, whether that is decided once or twice on the way there.
 *
 * The invalidation is replayed rather than skipped because it is observable in the REPORT: a deleted
 * key that is measured again settles again, and `legsMeasured` counts that second settlement.
 */
function replayEntries(state: SearchState, entries: OutcomeEntry[], manifest: ChainManifest, req: QuoteRequest): void {
  const wrappedNative = manifest.wrappedNative
  const inNode = toGraphNode(req.tokenIn, wrappedNative)
  const outNode = toGraphNode(req.tokenOut, wrappedNative)

  let round: RoundInLeg[] = []
  const flush = (): void => {
    if (round.length === 0) return
    const batch = round
    round = []
    foldRoundInLegs(state, batch, wrappedNative, outNode)
  }

  for (const entry of entries) {
    if (entry.t !== 'measurement') flush()
    switch (entry.t) {
      case 'measurement': {
        applyMeasurement(state, entry.o)
        if (entry.o.kind === 'success') {
          const m = entry.o.m
          const x = inLegIntermediate(m, wrappedNative, inNode, outNode)
          if (x !== undefined) round.push({ x, amountOut: m.amountOut, poolId: m.pool.id })
        }
        break
      }
      case 'coverage':
        applyCoverage(state, entry.p, entry.endpoint, entry.o)
        break
      case 'readiness':
        applyReadiness(state, entry.r)
        break
      case 'preflight':
        applyPreflight(state, entry.routeId, entry.o)
        break
      case 'abort':
        applyAbort(state)
        break
    }
  }
  flush()
}

/**
 * The verifier's sticky leader, as far as the log can name it: the last route it settled `verified`
 * or `needs-action`. Both are the arms that set `Verifier.leader` AND write an outcome; the three
 * that set it without writing one (a `readinessDegraded` requirement gate, an abort mid-walk, and the
 * re-entry short-circuit over an already-settled verdict) leave no trace, and for those
 * `pickLeader`'s own fallback — the best-ranked route nothing ruled out — is what a fold gets.
 */
function leaderFromLog(entries: OutcomeEntry[]): string | undefined {
  let leader: string | undefined
  for (const entry of entries) {
    if (entry.t !== 'preflight') continue
    if (entry.o.kind === 'verified' || entry.o.kind === 'needs-action') leader = entry.routeId
  }
  return leader
}

/**
 * Replays an outcome log into the result and report it produced.
 *
 * Everything below the fixture is the REAL engine: `apply*` rebuilds the ledger and every counter,
 * `composeRoutes` composes, `withExecution`/`pickLeader` rank, `compileAndEncode` produces the
 * leader's calldata, `buildReport` folds the report, and `classifyQuote`/`classifySwap` decide the
 * status. A regression in any of them changes the answer here.
 *
 * THE LEADER IS COMPILED, NOT RECORDED. `state.compiledById` is a verifier memo, written outside
 * `apply*`, and `router.ts#foldEvent` reads exactly one entry out of it — the leader's. Compilation
 * is a pure function of (route, request, manifest, block), so the fold recompiles rather than
 * carrying bytes in the fixture: a golden whose `tx` came from the fixture would assert that the
 * recorder once encoded something, not that this build still encodes it the same way. It runs only
 * for a leader verification actually settled (`verified`/`needs-action`) — the only states reachable
 * downstream of a successful compile.
 */
export function foldOutcomes(entries: OutcomeEntry[], ctx: FoldContext): FoldOutcome {
  const { manifest, request, context } = ctx
  const modules = PROTOCOL_MODULES
  const index = PoolIndex.fromSnapshot(context.index)

  const state = createState(context.block, context.headRegressed)
  state.intermediates = {
    selected: [...context.intermediates.selected],
    discovered: context.intermediates.discovered,
    notch: context.intermediates.notch,
  }
  state.pairCeilingHit = context.pairCeilingHit

  replayEntries(state, entries, manifest, request)

  const pumpCtx: PumpCtx = {
    index,
    modules,
    manifest,
    hookData: new Map(context.hookData),
    hints: request.hints ?? [],
    client: NO_CLIENT,
  }
  const routes = composeRoutes(state, pumpCtx, request)
  const evaluated = routes.map((q) => withExecution(state, q))
  const best = evaluated.length > 0 ? pickLeader(evaluated, leaderFromLog(entries)) : undefined
  const ranked = best === undefined ? [] : [best, ...evaluated.filter((e) => e !== best)]

  if (ctx.kind === 'swap' && best !== undefined && (best.execution === 'verified' || best.execution === 'needs-action')) {
    compileAndEncode(state, { manifest, modules }, request as SwapRequest, best)
  }

  const report = buildReport(state, { modules, manifest, index }, request)
  const outcome = foldEvent(ranked, state, report)
  const result = ctx.kind === 'swap' ? classifySwap(outcome) : classifyQuote(outcome)
  return { routes, ranked, report, result, state }
}

/** The request a fixture describes, as the engine's own `QuoteRequest`/`SwapRequest`. */
export function requestFromFixture(fixture: OutcomeFixture): QuoteRequest | SwapRequest {
  const { request } = fixture
  const base: QuoteRequest = {
    tokenIn: request.tokenIn,
    tokenOut: request.tokenOut,
    amountIn: request.amountIn,
    ...(request.hints !== undefined && { hints: request.hints }),
  }
  if (fixture.kind === 'quote') return base
  if (request.trader === undefined) throw new Error(`fixture '${fixture.label}': a swap fixture must carry a trader`)
  return {
    ...base,
    trader: request.trader,
    ...(request.recipient !== undefined && { recipient: request.recipient }),
    ...(request.slippageBps !== undefined && { slippageBps: request.slippageBps }),
    ...(request.deadlineSeconds !== undefined && { deadlineSeconds: request.deadlineSeconds }),
  }
}

/** The manifest a fixture folds against: its own inline one (hermetic), else the built-in for its
 * chain (live) — see {@link OutcomeFixture.manifest} for why a live fixture stores none. */
export function manifestFromFixture(fixture: OutcomeFixture): ChainManifest {
  return fixture.manifest ?? manifestFor(fixture.chainId)
}

/** Folds a whole fixture — the one call a golden test makes. Refuses a schema it cannot read, by
 * name, rather than folding a shape whose missing `context` field would silently change the answer. */
export function foldFixture(fixture: OutcomeFixture): FoldOutcome {
  if (fixture.schemaVersion !== OUTCOME_LOG_SCHEMA_VERSION) {
    throw new Error(
      `outcome fixture '${fixture.label}' has schemaVersion ${String(fixture.schemaVersion)}, this build reads ` +
        `${OUTCOME_LOG_SCHEMA_VERSION} — re-record it (there is deliberately no migration path)`,
    )
  }
  return foldOutcomes(fixture.log, {
    kind: fixture.kind,
    request: requestFromFixture(fixture),
    manifest: manifestFromFixture(fixture),
    context: fixture.context,
  })
}

// ---------------------------------------------------------------------------
// The recorder
// ---------------------------------------------------------------------------

type RecordArgs = {
  label: string
  chainId: number
  kind: 'quote' | 'swap'
  ctx: SearchContext
  request: QuoteRequest | SwapRequest
  notes?: string
  inlineManifest?: boolean
}

/** Copies everything a fold will need out of the LIVE state, synchronously, at one instant. */
function snapshotFixture(args: RecordArgs, state: SearchState, live: QuoteResult | SwapResult): OutcomeFixture {
  const { ctx, request, kind } = args
  if (state.outcomeLog === undefined) throw new Error(`[record:${args.label}] recording was not enabled on the search context`)
  return {
    schemaVersion: OUTCOME_LOG_SCHEMA_VERSION,
    label: args.label,
    chainId: args.chainId,
    kind,
    recordedAt: new Date().toISOString(),
    ...(args.notes !== undefined && { notes: args.notes }),
    ...(args.inlineManifest === true && { manifest: ctx.manifest }),
    request: {
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      amountIn: request.amountIn,
      ...(request.hints !== undefined && { hints: request.hints }),
      ...('trader' in request && { trader: request.trader }),
      ...('recipient' in request && request.recipient !== undefined && { recipient: request.recipient }),
      ...('slippageBps' in request && request.slippageBps !== undefined && { slippageBps: request.slippageBps }),
      ...('deadlineSeconds' in request && request.deadlineSeconds !== undefined && { deadlineSeconds: request.deadlineSeconds }),
    },
    context: {
      block: state.block,
      headRegressed: state.headRegressed,
      intermediates: {
        selected: [...state.intermediates.selected],
        discovered: state.intermediates.discovered,
        notch: state.intermediates.notch,
      },
      pairCeilingHit: state.pairCeilingHit,
      hookData: [...ctx.hookData],
      index: ctx.index.toSnapshot(),
    },
    log: [...state.outcomeLog],
    golden: canonicalizeResult(live),
  }
}

/**
 * Runs ONE search with recording on and returns the fixture it produced — the only way an outcome
 * fixture is ever made, hermetic worlds and live chains alike.
 *
 * IT PROVES THE FIXTURE BEFORE HANDING IT BACK. The golden is canonicalized from the LIVE search's
 * own result (through `router.ts#foldEvent` + the real classifier — the same three lines
 * `getQuote`/`getSwap` take), and then the fixture is folded and compared against it. A disagreement
 * throws instead of writing: it means the recorded `context` is missing something the live search
 * knew, and a fixture that fails its own fold on the day it is written would otherwise be committed
 * as a golden asserting a fold nobody has run.
 *
 * `stopAt` is the one knob, and it exists because the two corpora want different moments:
 *
 *  - `'final'` (hermetic) — the settled answer, with the frontier at its limit and coverage
 *    converged. A fake world's whole history is a handful of empty `eth_getLogs`, so this is free.
 *  - `'actionable-lead'` (live) — exactly where `getQuote`/`getSwap` stop: the first `lead` whose
 *    result is a `quote` / `ready` / `needs-action`. Driving a live mainnet search to `final` would
 *    mean walking every factory's full deployment history for a golden about the ANSWER, which is
 *    neither affordable nor more assertive — the fold reproduces whichever moment was recorded.
 *
 * THE SNAPSHOT IS TAKEN INSIDE THE LOOP, before the `break` that returns the generator. `state` is
 * live by contract (spec §5) and an in-flight preflight may still write through it while `finally`
 * runs; a fixture assembled after that would carry a log the classified result never saw.
 */
export async function recordOutcomeFixture(args: {
  label: string
  chainId: number
  kind: 'quote' | 'swap'
  ctx: SearchContext
  request: QuoteRequest | SwapRequest
  stopAt: 'final' | 'actionable-lead'
  notes?: string
  /** Write the manifest into the fixture — for a fake chain that `manifestFor` cannot produce. */
  inlineManifest?: boolean
}): Promise<OutcomeFixture> {
  const { ctx, request, kind } = args
  const classify = (event: Extract<EngineEvent, { type: 'lead' | 'final' }>): QuoteResult | SwapResult => {
    const outcome = foldEvent(event.ranked, event.state, event.report)
    return kind === 'swap' ? classifySwap(outcome) : classifyQuote(outcome)
  }
  const actionable = (result: QuoteResult | SwapResult): boolean =>
    result.status === 'quote' || result.status === 'ready' || result.status === 'needs-action'

  let fixture: OutcomeFixture | undefined
  let live: QuoteResult | SwapResult | undefined
  for await (const event of search({ ...ctx, recording: true }, request, kind)) {
    if (event.type === 'progress') continue
    const result = classify(event)
    if (event.type !== 'final' && !(args.stopAt === 'actionable-lead' && actionable(result))) continue
    live = result
    fixture = snapshotFixture(args, event.state, result)
    break
  }
  if (fixture === undefined || live === undefined) {
    throw new Error(`[record:${args.label}] the search ended without an event to record (no final, no actionable lead)`)
  }
  assertResultCoherent(live)

  // The fixed-point proof, through the SERIALIZED form: a fixture is only ever read back off disk,
  // so anything the encoding loses (a bigint that became a string, an undefined that vanished) must
  // fail here and not in CI a commit later.
  const replayed = foldFixture(parseFixture(serializeFixture(fixture)))
  assertResultCoherent(replayed.result)
  const folded = canonicalizeResult(replayed.result)
  if (JSON.stringify(folded) !== JSON.stringify(fixture.golden)) {
    throw new Error(
      `[record:${args.label}] the fold does not reproduce the live search — not writing.\n` +
        `  live:   ${JSON.stringify(fixture.golden)}\n` +
        `  folded: ${JSON.stringify(folded)}`,
    )
  }
  return fixture
}

// Re-exported so a fixture's `log` type is nameable without reaching into `search/state.ts` — every
// consumer of this module already imports the rest of the fixture shape from here.
export type { OutcomeEntry }
