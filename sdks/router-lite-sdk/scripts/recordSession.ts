#!/usr/bin/env bun
/* eslint-disable no-console */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

import { createPublicClient, custom, http } from 'viem'
import type { PublicClient } from 'viem'

import { redactKeyedUrl } from '../cli/redact'
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
// is block-pinned); a mismatch warns loudly and keeps the FIRST answer.
// ---------------------------------------------------------------------------

const SESSIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'internal', '__fixtures__', 'sessions')
const GZIP_THRESHOLD_BYTES = 2 * 1024 * 1024

type Args = {
  label?: string
  rpc?: string
  chain?: number
  tokenIn?: string
  tokenOut?: string
  amountIn?: string
  notes?: string
  all: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { all: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!
    const next = (): string => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`missing value for ${flag}`)
      return v
    }
    switch (flag) {
      case '--label':
        args.label = next()
        break
      case '--rpc':
        args.rpc = next()
        break
      case '--chain':
        args.chain = Number(next())
        break
      case '--token-in':
        args.tokenIn = next()
        break
      case '--token-out':
        args.tokenOut = next()
        break
      case '--amount-in':
        args.amountIn = next()
        break
      case '--notes':
        args.notes = next()
        break
      case '--all':
        args.all = true
        break
      default:
        throw new Error(`unknown flag ${flag}`)
    }
  }
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
 * A recording client over the live endpoint. `fallback: true` answers map-first (so replays of a
 * pinned head stay pinned) and records only the misses.
 */
function recordingClient(url: string, store: Map<string, SessionEntry>, fallback: boolean): PublicClient {
  const inner = http(url, { timeout: 120_000 })({})
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
          remember(store, method, params, { method, params: canonical, error: captureError(err, redactKeyedUrl) })
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
  const rpc = args.rpc ?? process.env.RPC_URL ?? process.env.ETH_RPC_URL
  if (!rpc) throw new Error('no RPC URL: pass --rpc @rpc via `chainz exec <chain> -- ...`, or set RPC_URL/ETH_RPC_URL')

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

const args = parseArgs(process.argv.slice(2))
if (args.all) {
  await recordAll()
} else {
  await recordOne(args)
}
