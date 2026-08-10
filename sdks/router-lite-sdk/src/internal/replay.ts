import { createPublicClient, custom } from 'viem'
import type { PublicClient } from 'viem'

import { routeId } from '../protocols'
import type { CurrencyRef, QuoteRequest, QuoteResult, QuotedRoute, SearchReport } from '../types'

// ---------------------------------------------------------------------------
// Recorded-replay harness — the hermetic half of the golden e2e suite.
//
// A SESSION is one real `getQuote` run's complete RPC conversation, captured by
// `scripts/recordSession.ts` and stored under `__fixtures__/sessions/`. This
// module owns everything both sides of that seam share: the canonical request
// key, the session's JSON shape, the error capture/rebuild round trip, the
// replay transport, and the canonical (JSON-safe, bigint-free) result shape
// the goldens are written and compared in.
//
// THE CANONICAL KEY IS THE WHOLE DESIGN. Requests are keyed by
// (method, canonicalized params) — key order sorted, strings lowercased,
// bigints hexed — NEVER by sequence number, because the engine's concurrency
// makes request ORDER nondeterministic (semaphore scheduling, real-network
// completion order during recording, microtask order during replay) while the
// request SET is not. Every identical request collapses to one entry, which is
// sound because a session is block-pinned by construction: the engine pins
// `eth_getBlockByNumber('latest')` exactly once per search and issues every
// other read at that block, so one real run's answers are self-consistent and
// an entry's result is THE answer for its key, however many times or in
// whatever order it is asked for.
//
// WHAT VARIANCE THE KEY ABSORBS, AND WHAT REMAINS. Absorbed: request order and
// interleaving (semaphore/batch scheduling), duplicate requests, and retries —
// a retried key is idempotent by construction. Remaining, by design of the
// engine itself: the package has NO `Date.now`/`Math.random` anywhere in `src`
// (verified; the log-scan backoff is un-jittered and its width policy is a
// pure reducer over the response sequence), so the only wall-clock behavior is
// `quoteWhileDiscovering`'s interleave timer (`QUOTE_INTERLEAVE_MS` = 5s).
// Under replay every response resolves in a microtask, so a scan-bound wave
// finishes long before the first 5s tick and the interleave is QUIESCENT —
// deterministically zero mid-wave passes on every replay run. (During a live
// RECORDING the timer does fire, which can quote a superset of what replay
// quotes; `scripts/recordSession.ts` closes that gap by deriving the golden
// from a strict replay of the recording, then proving the replay reproduces
// itself, so the committed golden is a fixed point of the hermetic path.)
//
// AN UNRECORDED KEY THROWS, LOUDLY AND BY NAME. That refusal is the regression
// detector this harness exists for: a code change that alters WHAT the search
// asks (a new probe, a different scan window, a reordered descent) is a
// deliberate golden regeneration, not something to paper over with a default
// response. Recorded-but-unrequested keys are the harmless direction (the
// search asked for less) and are surfaced as info via `unrequestedKeys()`.
//
// REDACTION CONTRACT: nothing in this module ever sees an RPC URL — sessions
// carry only `chainId` + a label, and the recorder strips/redacts transport
// identity (including URLs inside provider error messages) before an entry is
// written. See `scripts/recordSession.ts`.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Canonical request keys
// ---------------------------------------------------------------------------

/**
 * Canonicalizes a JSON-RPC params value: object keys sorted, strings lowercased, bigints rendered
 * as `0x` hex, `undefined` object fields dropped. Lowercasing is safe for every method this package
 * issues (`eth_chainId`, `eth_getBlockByNumber`, `eth_getCode`, `eth_call`, `eth_getLogs`,
 * `eth_getBalance`): their params are exclusively addresses, hex quantities/data, and block tags,
 * all of which are case-insensitive.
 */
export function canonicalParams(value: unknown): unknown {
  if (typeof value === 'bigint') return `0x${value.toString(16)}`
  if (typeof value === 'string') return value.toLowerCase()
  if (Array.isArray(value)) return value.map(canonicalParams)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v === undefined) continue
      out[key] = canonicalParams(v)
    }
    return out
  }
  return value
}

/** The order-independent identity of one JSON-RPC request. */
export function canonicalKey(method: string, params: unknown): string {
  return `${method} ${JSON.stringify(canonicalParams(params ?? []))}`
}

// ---------------------------------------------------------------------------
// Session shape
// ---------------------------------------------------------------------------

/**
 * One frame of a captured provider error — the exact fields
 * `internal/rpcErrors.ts#collectFacts` reads, so a rebuilt error classifies
 * (`classifyRpcError`), yields its revert bytes (`revertDataOf`), and parses its declared scan cap
 * (`parseDeclaredCap`) identically to the live original. `data` is a top-level `data: '0x…'` string;
 * `nestedData` is geth's `data.data` position — kept apart because `collectFacts` treats a
 * zero-length `'0x'` differently at the two positions.
 */
type RecordedErrorFrame = {
  message?: string
  details?: string
  name?: string
  code?: number | string
  status?: number
  data?: string
  nestedData?: string
}

/** A captured error's `cause` chain, outermost frame first. */
type RecordedError = { frames: RecordedErrorFrame[] }

/** One recorded (method, canonical params) → result | error entry. */
export type SessionEntry = {
  method: string
  /** Stored in canonical form (see {@link canonicalParams}); the replay map is keyed off it. */
  params: unknown
  result?: unknown
  error?: RecordedError
}

export type RecordedSession = {
  label: string
  chainId: number
  recordedAt: string
  /** Free-form provenance/why-this-session prose. Never a URL, never a vendor name. */
  notes?: string
  request: { tokenIn: string; tokenOut: string; amountIn: string }
  /** The expected canonical result of replaying this session — written by the recorder from a
   * strict replay (not from the live run), so it is a fixed point of the hermetic path. */
  golden: CanonicalResult
  entries: SessionEntry[]
}

/** The session's `QuoteRequest`, with `amountIn` revived to bigint. */
export function requestFromSession(session: RecordedSession): QuoteRequest {
  return {
    tokenIn: session.request.tokenIn === 'native' ? 'native' : (session.request.tokenIn as CurrencyRef),
    tokenOut: session.request.tokenOut === 'native' ? 'native' : (session.request.tokenOut as CurrencyRef),
    amountIn: BigInt(session.request.amountIn),
  }
}

// ---------------------------------------------------------------------------
// Error round trip
// ---------------------------------------------------------------------------

const MAX_ERROR_DEPTH = 8

/**
 * Flattens a live error's `cause` chain into {@link RecordedErrorFrame}s — the recorder's half of
 * the round trip. `redact` is run over every message-bearing string (viem embeds the full request
 * URL in most of its error messages); the recorder passes the keyed-URL redaction rule.
 */
export function captureError(err: unknown, redact: (s: string) => string): RecordedError {
  const frames: RecordedErrorFrame[] = []
  let node: unknown = err
  for (let depth = 0; node !== null && node !== undefined && depth < MAX_ERROR_DEPTH; depth++) {
    if (typeof node === 'string') {
      frames.push({ message: redact(node) })
      break
    }
    const n = node as Record<string, unknown>
    const frame: RecordedErrorFrame = {}
    if (typeof n.message === 'string') frame.message = redact(n.message)
    // `collectFacts` reads `message`, `shortMessage`, `details` and `reason` per frame; folding the
    // last three into `details` preserves every dialect regex's ability to match without carrying
    // four fields per frame.
    const extra = [n.shortMessage, n.details, n.reason].filter((s): s is string => typeof s === 'string')
    if (extra.length > 0) frame.details = redact(extra.join('\n'))
    if (typeof n.name === 'string' && n.name !== 'Error') frame.name = n.name
    if (typeof n.code === 'number' || typeof n.code === 'string') frame.code = n.code
    if (typeof n.status === 'number') frame.status = n.status
    if (typeof n.data === 'string' && n.data.startsWith('0x')) frame.data = n.data
    const nested = n.data as Record<string, unknown> | null | undefined
    if (nested !== null && typeof nested === 'object' && typeof nested.data === 'string' && nested.data.startsWith('0x')) {
      frame.nestedData = nested.data
    }
    frames.push(frame)
    node = n.cause
  }
  if (frames.length === 0) frames.push({ message: 'recorded error with no capturable shape' })
  return { frames }
}

/**
 * Rebuilds a thrown error (with its `cause` chain) from recorded frames — the replay half.
 *
 * NOT THE SAME JOB as `providerConformance.test.ts#rebuildCapturedError`, which reads ONE provider
 * capture's message text and reconstructs the viem wrapper it must have arrived in (status out of
 * the `Status:` line, code off `causeCode`). This one replays a chain that was already walked and
 * written down frame by frame, and invents nothing. Two inputs, two round trips; neither can be
 * expressed in terms of the other, which is why both exist.
 *
 * TOTAL BY CONSTRUCTION. `captureError` always writes at least one frame, so an empty `frames` can
 * only come from a hand-edited or truncated session — and the loop below would then return
 * `undefined`, which `replayClient` throws, leaving a `TypeError: undefined is not an object` far
 * from the malformed file that caused it. An error is always returned; only its wording says the
 * session is at fault.
 */
export function rebuildError(recorded: RecordedError): Error {
  if (recorded.frames.length === 0) return new Error('recorded error with no frames')
  let cause: unknown
  for (let i = recorded.frames.length - 1; i >= 0; i--) {
    const frame = recorded.frames[i]!
    const err = new Error(frame.message ?? '') as Error & Record<string, unknown>
    if (frame.name !== undefined) err.name = frame.name
    if (frame.details !== undefined) err.details = frame.details
    if (frame.code !== undefined) err.code = frame.code
    if (frame.status !== undefined) err.status = frame.status
    if (frame.nestedData !== undefined) err.data = { data: frame.nestedData }
    else if (frame.data !== undefined) err.data = frame.data
    if (cause !== undefined) err.cause = cause
    cause = err
  }
  return cause as Error
}

// ---------------------------------------------------------------------------
// Replay transport
// ---------------------------------------------------------------------------

type ReplayHarness = {
  client: PublicClient
  /** Canonical keys the replay has served so far. */
  requestedKeys: ReadonlySet<string>
  /** Recorded entries the replay never asked for — harmless (the search asked for LESS than the
   * recording holds), reported as info rather than asserted on. */
  unrequestedKeys(): string[]
}

/**
 * A `PublicClient` that answers every request from the session and refuses — loudly, naming the
 * method and canonical params — anything the recording never saw. `retryCount: 0` so a refusal (or
 * a recorded error) surfaces once instead of three times through viem's transport retry.
 */
export function replayClient(session: RecordedSession): ReplayHarness {
  const byKey = new Map<string, SessionEntry>()
  for (const entry of session.entries) byKey.set(canonicalKey(entry.method, entry.params), entry)

  const requested = new Set<string>()
  const transport = custom(
    {
      async request({ method, params }: { method: string; params?: unknown }) {
        const key = canonicalKey(method, params)
        const entry = byKey.get(key)
        if (!entry) {
          throw new Error(
            `[replay:${session.label}] UNRECORDED REQUEST — the search asked something the recording never did.\n` +
              `  method: ${method}\n` +
              `  params: ${JSON.stringify(canonicalParams(params ?? []))}\n` +
              `If the change to what the search asks is intentional, regenerate this session:\n` +
              `  chainz exec ${session.chainId} -- bun scripts/recordSession.ts --label ${session.label}`,
          )
        }
        requested.add(key)
        if (entry.error) throw rebuildError(entry.error)
        return entry.result
      },
    },
    { retryCount: 0 },
  )

  return {
    client: createPublicClient({ transport }) as PublicClient,
    requestedKeys: requested,
    unrequestedKeys: () => [...byKey.keys()].filter((k) => !requested.has(k)),
  }
}

// ---------------------------------------------------------------------------
// Canonical (golden) result shape — JSON-safe, bigint-free, order-normalized.
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
   * v2-only route (see `RouteQuote.gasEstimate`).
   *
   * IT IS GOLDEN-WORTHY AND IT COST NOTHING TO MAKE SO. The word has always been in the recorded
   * responses (it is a return slot of the very quoter calls these sessions replay); the engine
   * simply discarded it on decode. Canonicalizing it means a change that silently stopped reporting
   * gas — a decode reading the wrong slot, a two-segment sum quietly dropped — fails the deep-equal
   * here, exactly as an amount regression does. Adding it moved every golden's ROUTE entries with no
   * session re-recording whatsoever (`scripts/recordSession.ts --regold`), because no new bytes were
   * needed: the goldens were rebuilt from the same recorded conversations.
   */
  gasEstimate?: string
  promotedOverComplex?: true
}

type CanonicalReport = {
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
  status: QuoteResult['status']
  reason?: { code: string; detail: string }
  best?: CanonicalRoute
  alternatives: CanonicalRoute[]
  report: CanonicalReport
}

function canonicalRoute(q: QuotedRoute): CanonicalRoute {
  const legs = q.route.legs
  const ref = (c: CurrencyRef): string => (c === 'native' ? 'native' : c.toLowerCase())
  return {
    routeId: routeId(q.route),
    protocols: legs.map((l) => l.pool.protocol),
    path: [ref(legs[0]!.currencyIn), ...legs.map((l) => ref(l.currencyOut))],
    amountIn: q.quote.amountIn.toString(),
    amountOut: q.quote.amountOut.toString(),
    intermediateAmounts: q.quote.intermediateAmounts.map((a) => a.toString()),
    ...(q.quote.gasEstimate !== undefined && { gasEstimate: q.quote.gasEstimate.toString() }),
    ...(q.promotedOverComplex !== undefined && { promotedOverComplex: q.promotedOverComplex }),
  }
}

function canonicalReport(r: SearchReport): CanonicalReport {
  const discovery: CanonicalReport['discovery'] = {}
  for (const [protocol, d] of Object.entries(r.discovery)) {
    discovery[protocol] = {
      status: d.status,
      // Sorted for stability: covered ranges are merged sets, and their ORDER is an artifact of
      // scan completion order even when their contents are identical.
      coveredRanges: [...d.coveredRanges]
        .sort((a, b) => (a.fromBlock < b.fromBlock ? -1 : a.fromBlock > b.fromBlock ? 1 : 0))
        .map((range) => ({ fromBlock: range.fromBlock.toString(), toBlock: range.toBlock.toString() })),
      demandFloor: d.demandFloor.toString(),
    }
  }
  return {
    // `hash` is deliberately omitted: it adds nothing over `number` for a pinned replay and makes
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

/** The golden shape: everything deterministic a `QuoteResult` asserts, bigints stringified. */
export function canonicalizeResult(result: QuoteResult): CanonicalResult {
  return {
    status: result.status,
    ...(result.status === 'no-route' || result.status === 'inconclusive'
      ? { reason: { code: result.reason.code, detail: result.reason.detail } }
      : {}),
    ...(result.status === 'quote' ? { best: canonicalRoute(result.best) } : {}),
    alternatives: result.alternatives.map(canonicalRoute),
    report: canonicalReport(result.search),
  }
}
