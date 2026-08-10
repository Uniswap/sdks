#!/usr/bin/env bun
/* eslint-disable no-console */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

import { createPublicClient, custom, http } from 'viem'
import type { PublicClient } from 'viem'

import { parseArgs, type FlagSpec } from '../cli/args'
import { resolveRpcUrl } from '../cli/chains'
import { redact, registerRpcHeaders } from '../cli/redact'
import { resolveRpcHeaders } from '../cli/rpcHeaders'
import type { QuoteResult } from '../src'
import { createRouter, manifestFor } from '../src'
import {
  canonicalKey,
  canonicalParams,
  canonicalizeResult,
  captureError,
  rebuildError,
  replayClient,
  requestFromSession,
} from '../src/internal/replay'
import type { CanonicalResult, RecordedSession, SessionEntry } from '../src/internal/replay'
import { assertResultCoherent } from '../src/internal/testing'

// ---------------------------------------------------------------------------
// Records one live `getQuote` run into a replayable session fixture + golden.
//
// Usage (ALWAYS through `chainz exec`, so the keyed RPC URL never touches a
// shell history or this script's output — the URL is read from argv/env and
// NEVER printed, logged, or written to the fixture):
//
//   chainz exec 1 -- bun scripts/recordSession.ts --label mainnet-eth-usdc \
//     --token-in native --token-out 0xA0b8...eB48 --amount-in 1000000000000000000 \
//     --notes "..."
//
//   # re-record ONE existing session (request/notes reused from the fixture):
//   chainz exec 8453 -- bun scripts/recordSession.ts --label base-eth-usdc
//
//   # re-record EVERY session (drives `chainz exec <chainId>` per session):
//   bun scripts/recordSession.ts --all
//
//   # rebuild every session's GOLDEN from the bytes already recorded — NO
//   # network, no RPC URL, no chainz (see `regoldAll` below). This only works
//   # when the recorded BYTES still answer what the search asks: a change to
//   # the SHAPE of a request retires the recording and needs a live re-record.
//   bun scripts/recordSession.ts --regold
//
//   # ...and `--force` overrides the one refusal this script has, which is
//   # writing a session that both shrank AND asserts less than the one it
//   # replaces (see `guardAgainstDegradedOverwrite`).
//
// HOW A SESSION BECOMES A FIXED POINT OF THE HERMETIC PATH. A live run and a
// replay can quote slightly different candidate SETS (the 5s interleave timer
// fires against real network latency and is quiescent against a map), so:
//
//   pass 1  live record — every (method, canonical params) -> result|error
//   pass 2+ strict replay; on an UNRECORDED KEY, run a map-first/live-fallback
//           pass that answers everything already recorded from the map (so
//           'latest' stays pinned to pass 1's head) and records only the
//           misses — all of which are block-pinned reads, still valid live
//   final   strict replay twice; both canonical results must be identical;
//           the GOLDEN is written from that replay result (never the live one)
//
// Identical requests during recording must return identical results (the run
// is block-pinned); a mismatch warns loudly and keeps the FIRST answer — with
// one exception, `healTransientErrors` below: a recorded ERROR is re-asked once,
// because a block-pinned read that succeeds on a second ask never had an error
// as its true answer, and baking one in made every later replay strictly worse
// than the live run it came from.
// ---------------------------------------------------------------------------

const SESSIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'internal', '__fixtures__', 'sessions')
const GZIP_THRESHOLD_BYTES = 2 * 1024 * 1024

/** Per-request timeout for {@link healTransientErrors}' re-ask pass — short by design; see there. */
const HEAL_TIMEOUT_MS = 15_000

type Args = {
  label?: string
  rpc?: string
  chain?: number
  tokenIn?: string
  tokenOut?: string
  amountIn?: string
  notes?: string
  all: boolean
  regold: boolean
  force: boolean
}

const FLAGS: FlagSpec = {
  label: { kind: 'string' },
  rpc: { kind: 'string' },
  chain: { kind: 'string' },
  'token-in': { kind: 'string' },
  'token-out': { kind: 'string' },
  'amount-in': { kind: 'string' },
  notes: { kind: 'string' },
  all: { kind: 'boolean' },
  force: { kind: 'boolean' },
  regold: { kind: 'boolean' },
}

function readArgs(argv: string[]): Args {
  const parsed = parseArgs(argv, FLAGS)
  const args: Args = { all: parsed.booleans.has('all'), regold: parsed.booleans.has('regold'), force: parsed.booleans.has('force') }
  const label = parsed.strings.get('label')
  if (label !== undefined) args.label = label
  const rpc = parsed.strings.get('rpc')
  if (rpc !== undefined) args.rpc = rpc
  const chain = parsed.strings.get('chain')
  if (chain !== undefined) args.chain = Number(chain)
  const tokenIn = parsed.strings.get('token-in')
  if (tokenIn !== undefined) args.tokenIn = tokenIn
  const tokenOut = parsed.strings.get('token-out')
  if (tokenOut !== undefined) args.tokenOut = tokenOut
  const amountIn = parsed.strings.get('amount-in')
  if (amountIn !== undefined) args.amountIn = amountIn
  const notes = parsed.strings.get('notes')
  if (notes !== undefined) args.notes = notes
  return args
}

function sessionPath(label: string): { json: string; gz: string } {
  return { json: join(SESSIONS_DIR, `${label}.json`), gz: join(SESSIONS_DIR, `${label}.json.gz`) }
}

function loadExistingSession(label: string): RecordedSession | undefined {
  const { json, gz } = sessionPath(label)
  if (existsSync(json)) return JSON.parse(readFileSync(json, 'utf8')) as RecordedSession
  if (existsSync(gz)) return JSON.parse(gunzipSync(readFileSync(gz)).toString('utf8')) as RecordedSession
  return undefined
}

/**
 * Re-asks every key whose recorded answer is an ERROR, and keeps the success if one comes back.
 *
 * WHY A REPLAY WAS OTHERWISE STRICTLY WORSE THAN THE LIVE RUN IT CAME FROM. A block-pinned read has
 * one true answer, so an error recorded for it is one of two very different things: a FACT about the
 * endpoint (a declared `eth_getLogs` cap — "query exceeds max block range 100000" — which re-errors
 * every time and must be replayed, since the scanner's descent is exactly the behavior these
 * sessions exist to pin), or a TRANSIENT transport failure (a 2s gateway timeout on a window the
 * same endpoint serves hundreds of times over). `remember` keeps the first answer, so a transient
 * failure was baked in permanently — and because the live run's own retry then succeeded at a
 * DIFFERENT key, nothing ever overwrote it. Measured on the mainnet two-hop session: 8 timeouts at a
 * 50,400-block span that succeeded 927 times, each becoming a permanent coverage hole, which is what
 * turned a live `quote` into a replayed `inconclusive — rpc-degraded`.
 *
 * Re-asking separates the two by the only test that can: real caps re-error identically and stay,
 * transient failures heal. One extra request per errored key, at the same pinned block.
 *
 * BOUNDED, BECAUSE THIS PASS IS PURE UPSIDE AND MUST NOT BECOME THE COST. A capped endpoint can
 * leave hundreds of errored keys (227 on the mainnet two-hop session), and re-asking them at the
 * recorder's ordinary 120s timeout would let a handful of hanging requests add half an hour to a
 * recording to heal nothing. {@link HEAL_TIMEOUT_MS} is deliberately short: a re-ask that does not
 * come back promptly is itself evidence the failure was not the cheap transient kind this pass
 * exists for, so giving up on it and keeping the recorded error is the right answer, not a
 * compromise. Sequential on purpose — this runs against an endpoint that has just been refusing
 * requests, and firing hundreds at it concurrently is how a heal pass becomes a rate-limit.
 */
async function healTransientErrors(url: string, store: Map<string, SessionEntry>, label: string): Promise<void> {
  const errored = [...store].filter(([, entry]) => entry.error)
  if (errored.length === 0) return
  const inner = http(url, { timeout: HEAL_TIMEOUT_MS, fetchOptions: { headers: rpcHeaders() } })({})
  let healed = 0
  for (const [key, entry] of errored) {
    try {
      const result = await inner.request({ method: entry.method, params: entry.params } as never)
      store.set(key, { method: entry.method, params: entry.params, result: result ?? null })
      healed++
    } catch {
      // Re-errored: a fact about this endpoint at this window, and the session should replay it.
    }
  }
  if (healed > 0) console.log(`[record:${label}]   healed ${healed}/${errored.length} recorded error(s) that re-asked cleanly`)
}

/** Records into `store`; identical keys must agree (block-pinned run) — a mismatch warns, first wins. */
function remember(store: Map<string, SessionEntry>, method: string, params: unknown, entry: SessionEntry): void {
  const key = canonicalKey(method, params)
  const existing = store.get(key)
  if (existing) {
    const a = JSON.stringify(existing.result ?? existing.error)
    const b = JSON.stringify(entry.result ?? entry.error)
    if (a !== b) {
      console.warn(`WARNING: identical request returned different results (keeping first): ${key.slice(0, 160)}`)
    }
    return
  }
  store.set(key, entry)
}

/**
 * `ETH_RPC_HEADERS` as viem `fetchOptions.headers`, or `{}` when it is unset.
 *
 * `chainz exec` hands the endpoint over as a URL **plus** headers when the gateway authenticates by
 * header rather than by a key in the path — and this script's whole usage contract is "always through
 * `chainz exec`", so ignoring them meant every recording against such a gateway came back
 * `rpc-unavailable` and wrote a two-entry fixture over a good one. Parsed by `cli/rpcHeaders.ts`'s
 * `resolveRpcHeaders` — the SAME parser `rl`'s chain-touching commands use for `--rpc-header`/
 * `$ETH_RPC_HEADERS` — rather than a second copy of it here: it is chainz's exact wire format
 * (comma-separated `Name: value` pairs; see that file's header for why a comma cannot be part of a
 * value), and one parser is the only way this script and the CLI can't drift on what counts as
 * well-formed.
 *
 * REGISTERED FOR REDACTION, not just parsed: `registerRpcHeaders` (below) makes every header VALUE
 * scrubbable out of anything this script prints or writes afterwards — see `remember`/`recordingClient`,
 * which capture errors THROUGH that same redaction on their way into a fixture. NOTHING FROM A
 * SESSION CAN CARRY A HEADER VALUE OTHERWISE: a session holds only (method, canonical params) ->
 * result|error, and `captureError`'s frames carry a message/name/status/code — never request
 * headers — but a gateway's own error text can echo back the value it rejected (the same shape a
 * keyed URL's failure takes), which is exactly the leak `redactHeaderValues` exists to close.
 */
function rpcHeaders(): Record<string, string> {
  const headers = resolveRpcHeaders(process.env.ETH_RPC_HEADERS, [])
  registerRpcHeaders(headers)
  return headers
}

/**
 * A recording client over the live endpoint. `fallback: true` answers map-first (so replays of a
 * pinned head stay pinned) and records only the misses.
 */
function recordingClient(url: string, store: Map<string, SessionEntry>, fallback: boolean): PublicClient {
  const inner = http(url, { timeout: 120_000, fetchOptions: { headers: rpcHeaders() } })({})
  const transport = custom(
    {
      async request({ method, params }: { method: string; params?: unknown }) {
        if (fallback) {
          const hit = store.get(canonicalKey(method, params))
          if (hit) {
            if (hit.error) throw rebuildError(hit.error)
            return hit.result
          }
        }
        const canonical = canonicalParams(params ?? [])
        try {
          const result = await inner.request({ method, params } as never)
          remember(store, method, params, { method, params: canonical, result: result ?? null })
          return result
        } catch (err) {
          remember(store, method, params, { method, params: canonical, error: captureError(err, redact) })
          throw err
        }
      },
    },
    { retryCount: 0 },
  )
  return createPublicClient({ transport }) as PublicClient
}

function summarize(result: QuoteResult): string {
  if (result.status === 'quote') {
    const legs = result.best.route.legs.map((l) => l.pool.protocol).join('>')
    const promoted = result.best.promotedOverComplex ? ' promotedOverComplex' : ''
    return `quote best=[${legs}] out=${result.best.quote.amountOut}${promoted} alts=${result.alternatives.length}`
  }
  return `${result.status} reason=${result.reason.code} alts=${result.alternatives.length}`
}

async function runQuote(client: PublicClient, session: RecordedSession): Promise<QuoteResult> {
  const router = createRouter({ client, manifest: manifestFor(session.chainId) })
  const result = await router.getQuote(requestFromSession(session))
  assertResultCoherent(result)
  return result
}

async function strictReplay(session: RecordedSession): Promise<{ result: QuoteResult; unrequested: string[] }> {
  const harness = replayClient(session)
  const result = await runQuote(harness.client, session)
  return { result, unrequested: harness.unrequestedKeys() }
}

async function recordOne(args: Args): Promise<void> {
  const label = args.label
  if (!label) throw new Error('--label is required')
  const rpc = resolveRpcUrl(args.rpc)

  const existing = loadExistingSession(label)
  const chainId = args.chain ?? existing?.chainId
  const tokenIn = args.tokenIn ?? existing?.request.tokenIn
  const tokenOut = args.tokenOut ?? existing?.request.tokenOut
  const amountIn = args.amountIn ?? existing?.request.amountIn
  if (chainId === undefined || !tokenIn || !tokenOut || !amountIn) {
    throw new Error(`session '${label}' does not exist yet: --chain, --token-in, --token-out and --amount-in are all required`)
  }

  const store = new Map<string, SessionEntry>()
  const notes = args.notes ?? existing?.notes
  const session: RecordedSession = {
    label,
    chainId,
    recordedAt: new Date().toISOString(),
    ...(notes !== undefined ? { notes } : {}),
    request: { tokenIn, tokenOut, amountIn },
    golden: undefined as unknown as CanonicalResult, // filled from the strict replay below
    entries: [],
  }

  console.log(`[record:${label}] pass 1: live recording (chain ${chainId})...`)
  const liveResult = await runQuote(recordingClient(rpc, store, false), session)
  console.log(`[record:${label}]   live: ${summarize(liveResult)} @ block ${liveResult.search.block.number}`)
  await healTransientErrors(rpc, store, label)
  session.entries = [...store.values()]

  // Converge: strict replay; on an unrecorded key, run a map-first/live-fallback pass to record the
  // block-pinned misses, then try again. Three rounds has always been plenty; more means the search
  // is genuinely nondeterministic in what it asks, which must fail here rather than in CI.
  let replayResult: QuoteResult | undefined
  let unrequested: string[] = []
  for (let round = 0; round < 4; round++) {
    try {
      const replay = await strictReplay(session)
      replayResult = replay.result
      unrequested = replay.unrequested
      break
    } catch (err) {
      if (round === 3 || !(err instanceof Error) || !err.message.includes('UNRECORDED REQUEST')) throw err
      console.log(`[record:${label}] pass ${round + 2}: replay missed a key; recording the gap live (map-first, head stays pinned)...`)
      await runQuote(recordingClient(rpc, store, true), session)
      await healTransientErrors(rpc, store, label)
      session.entries = [...store.values()]
    }
  }
  if (!replayResult) throw new Error('replay never converged')

  // Determinism proof at record time: a second strict replay must produce the identical canonical result.
  const second = await strictReplay(session)
  const golden = canonicalizeResult(replayResult)
  if (JSON.stringify(golden) !== JSON.stringify(canonicalizeResult(second.result))) {
    throw new Error(`[record:${label}] two strict replays disagreed — the session is not deterministic; not writing it`)
  }
  session.golden = golden

  console.log(`[record:${label}]   replay: ${summarize(replayResult)} @ block ${replayResult.search.block.number}`)
  if (liveResult.status === 'quote' && replayResult.status === 'quote') {
    if (liveResult.best.quote.amountOut !== replayResult.best.quote.amountOut) {
      console.warn(
        `[record:${label}] NOTE: live best amountOut ${liveResult.best.quote.amountOut} != replay ${replayResult.best.quote.amountOut} (interleave-timing candidate-set difference; the golden is the replay's)`,
      )
    }
  } else if (liveResult.status !== replayResult.status) {
    console.warn(`[record:${label}] NOTE: live status ${liveResult.status} != replay status ${replayResult.status}`)
  }
  if (unrequested.length > 0) {
    console.log(`[record:${label}]   info: ${unrequested.length} recorded-but-unrequested key(s) under strict replay (live-only interleave quotes; harmless)`)
  }

  guardAgainstDegradedOverwrite(label, session, args.force)
  writeSession(label, session)
}

/**
 * How much a golden ASSERTS, so a rewrite that asserts less can be recognized as one.
 *
 * `quote` pins a route and an amount; `no-route` is an authoritative negative that only a COMPLETE
 * discovery can claim; `inconclusive` pins neither and is what a session decays into when the
 * endpoint underneath it degrades.
 */
function goldenRank(status: string): number {
  return status === 'quote' ? 3 : status === 'no-route' ? 2 : 1
}

/**
 * Refuses to overwrite an existing session when the new one both SHRANK and asserts LESS.
 *
 * The failure this exists for is silent and was hit for real: a recording run against a
 * misconfigured or refusing endpoint completes "successfully", writes a two-entry session whose
 * golden is `inconclusive — rpc-unavailable`, and replaces a good fixture with something that still
 * passes its own replay. Nothing errors, the suite stays green, and the corpus has quietly stopped
 * asserting an answer — the same class of loss the golden-shape guard in `replay.golden.test.ts`
 * was written for, arriving through the recorder instead.
 *
 * BOTH conditions, deliberately. A session that GREW while degrading is the honest shape of a
 * provider that now caps `eth_getLogs` (more requests, less complete discovery) and is a legitimate
 * re-record; a session that shrank while asserting the same thing or more is a scanner that got
 * cheaper, which is the point of most of this package's work. Only the two together mean the
 * recording bought less with less. `--force` is the deliberate override.
 */
function guardAgainstDegradedOverwrite(label: string, session: RecordedSession, force: boolean): void {
  const existing = loadExistingSession(label)
  if (!existing || force) return
  const shrank = session.entries.length * 2 < existing.entries.length
  const degraded = goldenRank(session.golden.status) < goldenRank(existing.golden.status)
  if (!shrank || !degraded) return
  throw new Error(
    `[record:${label}] REFUSING TO OVERWRITE: the new session has ${session.entries.length} entries against ` +
      `${existing.entries.length}, and its golden degraded from '${existing.golden.status}' to '${session.golden.status}'. ` +
      `That is what a recording against a refusing or misconfigured endpoint looks like — check the RPC URL and any ` +
      `required headers first. Pass --force if the loss is genuinely intended.`,
  )
}

/** Writes a session to disk (gzipped past {@link GZIP_THRESHOLD_BYTES}), removing the other form. */
function writeSession(label: string, session: RecordedSession): void {
  mkdirSync(SESSIONS_DIR, { recursive: true })
  const { json, gz } = sessionPath(label)
  const body = JSON.stringify(session, null, 2)
  const bytes = Buffer.byteLength(body)
  if (bytes > GZIP_THRESHOLD_BYTES) {
    writeFileSync(gz, gzipSync(Buffer.from(body)))
    if (existsSync(json)) unlinkSync(json)
    console.log(`[record:${label}] wrote ${gz.split('/').slice(-1)[0]} (${bytes} bytes raw, gzipped) — ${session.entries.length} entries`)
  } else {
    writeFileSync(json, `${body}\n`)
    if (existsSync(gz)) unlinkSync(gz)
    console.log(`[record:${label}] wrote ${label}.json (${bytes} bytes) — ${session.entries.length} entries`)
  }
}

/** Re-records every existing session by driving `chainz exec <chainId>` per session. */
async function recordAll(): Promise<void> {
  const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json') || f.endsWith('.json.gz'))
  if (files.length === 0) throw new Error(`no sessions found in ${SESSIONS_DIR}`)
  for (const file of files) {
    const label = file.replace(/\.json(\.gz)?$/, '')
    const session = loadExistingSession(label)
    if (!session) continue
    console.log(`\n=== re-recording ${label} (chain ${session.chainId}) ===`)
    const proc = spawnSync(
      'chainz',
      ['exec', String(session.chainId), '--', 'bun', fileURLToPath(import.meta.url), '--label', label, '--rpc', '@rpc'],
      { stdio: 'inherit' },
    )
    if (proc.status !== 0) throw new Error(`re-recording ${label} failed (exit ${proc.status})`)
  }
}

/**
 * Rebuilds every session's GOLDEN from the conversation already on disk — the update path for a
 * change to what `canonicalizeResult` REPORTS, as opposed to a change to what the search asks the
 * chain.
 *
 * NO NETWORK, BY CONSTRUCTION: it runs the same strict replay `replay.golden.test.ts` runs, twice,
 * against the recorded entries, and refuses to write if the two disagree — the identical determinism
 * proof `recordOne` makes before committing a fresh recording. Re-recording for a reporting change
 * would be strictly worse: it would move every amount in every golden (the chain has moved on) and
 * bury the one field that actually changed in a diff of thousands of unrelated lines, while
 * spending real RPC to learn nothing new.
 *
 * A session whose golden does NOT change is left byte-identical on disk.
 */
async function regoldAll(): Promise<void> {
  const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json') || f.endsWith('.json.gz'))
  if (files.length === 0) throw new Error(`no sessions found in ${SESSIONS_DIR}`)
  let changed = 0
  for (const file of files) {
    const label = file.replace(/\.json(\.gz)?$/, '')
    const session = loadExistingSession(label)
    if (!session) continue
    const first = await strictReplay(session)
    const second = await strictReplay(session)
    const golden = canonicalizeResult(first.result)
    if (JSON.stringify(golden) !== JSON.stringify(canonicalizeResult(second.result))) {
      throw new Error(`[regold:${label}] two strict replays disagreed — not writing`)
    }
    if (JSON.stringify(golden) === JSON.stringify(session.golden)) {
      console.log(`[regold:${label}] unchanged`)
      continue
    }
    session.golden = golden
    writeSession(label, session)
    changed++
  }
  console.log(`\n[regold] ${changed} of ${files.length} session golden(s) updated (no RPC was used)`)
}

const args = readArgs(process.argv.slice(2))
if (args.regold) {
  await regoldAll()
} else if (args.all) {
  await recordAll()
} else {
  await recordOne(args)
}
