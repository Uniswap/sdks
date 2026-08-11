#!/usr/bin/env bun
/* eslint-disable no-console */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createPublicClient, http } from 'viem'
import type { Address, PublicClient } from 'viem'

import { parseArgs, type FlagSpec } from '../cli/args'
import { resolveRpcUrl } from '../cli/chains'
import { registerRpcHeaders } from '../cli/redact'
import { resolveRpcHeaders } from '../cli/rpcHeaders'
import { manifestFor } from '../src'
import { MULTICALL3_ADDRESS } from '../src/internal/multicall'
import {
  canonicalizeResult,
  foldFixture,
  OUTCOME_LOG_SCHEMA_VERSION,
  parseFixture,
  recordOutcomeFixture,
  serializeFixture,
} from '../src/internal/outcomeLog'
import type { OutcomeFixture } from '../src/internal/outcomeLog'
import { PoolIndex } from '../src/pools/poolIndex'
import { PROTOCOL_MODULES } from '../src/protocols'
import { buildHookData } from '../src/search/hookData'
import type { SearchContext } from '../src/search/loop'
import type { CurrencyRef, QuoteRequest, SwapRequest } from '../src/types'

import { HERMETIC_SCENARIOS } from './hermeticWorlds'

// ---------------------------------------------------------------------------
// Writes the outcome-log golden corpus (`src/internal/__fixtures__/outcomes/`).
//
// A fixture is one search's OUTCOME LOG — every `apply*` input, in order — plus
// the handful of facts written outside `apply*` and the canonical result the
// fold must reproduce. See `src/internal/outcomeLog.ts` for the format, what the
// fold does and does not reproduce, and why redaction is structural here rather
// than a pass over strings.
//
// TWO CORPORA, ONE RECORDER (`recordOutcomeFixture`):
//
//   # the hermetic corpus — deterministic fake worlds, no network at all
//   bun scripts/recordOutcomes.ts --hermetic
//
//   # a live golden, ALWAYS through `chainz exec` so the keyed RPC URL never
//   # touches a shell history (it is read from argv/env and never printed,
//   # logged, or written to a fixture):
//   chainz exec 1 -- bun scripts/recordOutcomes.ts --label live-mainnet-eth-usdc \
//     --chain 1 --token-in native --token-out 0xA0b8...eB48 \
//     --amount-in 1000000000000000000 --rpc @rpc --notes "..."
//
//   # re-fold every committed fixture and rewrite its golden — NO network. The
//   # update path for a change to what `canonicalizeResult` REPORTS, as opposed
//   # to a change in what the search finds.
//   bun scripts/recordOutcomes.ts --regold
//
// A LIVE RECORDING STOPS WHERE `getQuote` STOPS: at the first actionable lead.
// Driving a mainnet search to `final` means walking every factory's whole
// deployment history for a golden that is about the ANSWER — unaffordable, and
// no more assertive, since the fold reproduces whichever moment was recorded.
// The hermetic worlds run to `final`, where a fake world's entire history is a
// few empty `eth_getLogs`.
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'internal', '__fixtures__', 'outcomes')

type Args = {
  label?: string
  rpc?: string
  chain?: number
  tokenIn?: string
  tokenOut?: string
  amountIn?: string
  trader?: string
  notes?: string
  budgetMs?: number
  hermetic: boolean
  regold: boolean
}

const FLAGS: FlagSpec = {
  label: { kind: 'string' },
  rpc: { kind: 'string' },
  chain: { kind: 'string' },
  'token-in': { kind: 'string' },
  'token-out': { kind: 'string' },
  'amount-in': { kind: 'string' },
  trader: { kind: 'string' },
  notes: { kind: 'string' },
  budget: { kind: 'string' },
  hermetic: { kind: 'boolean' },
  regold: { kind: 'boolean' },
}

function readArgs(argv: string[]): Args {
  const parsed = parseArgs(argv, FLAGS)
  const args: Args = { hermetic: parsed.booleans.has('hermetic'), regold: parsed.booleans.has('regold') }
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
  const trader = parsed.strings.get('trader')
  if (trader !== undefined) args.trader = trader
  const notes = parsed.strings.get('notes')
  if (notes !== undefined) args.notes = notes
  const budget = parsed.strings.get('budget')
  if (budget !== undefined) args.budgetMs = Number(budget)
  return args
}

function fixturePath(label: string): string {
  return join(FIXTURES_DIR, `${label}.json`)
}

function writeFixture(fixture: OutcomeFixture): void {
  mkdirSync(FIXTURES_DIR, { recursive: true })
  // Pretty-printed through the tagged-bigint encoder, so a golden diff is readable in review — the
  // corpus is small by construction (outcomes, not conversations), which is the whole point of it.
  const body = JSON.stringify(JSON.parse(serializeFixture(fixture)) as unknown, null, 2)
  writeFileSync(fixturePath(fixture.label), `${body}\n`)
  console.log(
    `[record:${fixture.label}] wrote ${fixture.label}.json — ${fixture.log.length} outcome(s), ` +
      `golden ${fixture.golden.status}, ${Buffer.byteLength(body)} bytes`,
  )
}

function summarize(fixture: OutcomeFixture): string {
  const { golden } = fixture
  const best = golden.best ? ` best=[${golden.best.protocols.join('>')}] out=${golden.best.amountOut}` : ''
  const reason = golden.reason ? ` reason=${golden.reason.code}` : ''
  return `${golden.status}${best}${reason} alts=${golden.alternatives.length}`
}

// ---------------------------------------------------------------------------
// Hermetic
// ---------------------------------------------------------------------------

async function recordHermetic(): Promise<void> {
  for (const scenario of HERMETIC_SCENARIOS) {
    const built = scenario.build()
    const fixture = await recordOutcomeFixture({
      label: scenario.label,
      chainId: built.ctx.manifest.chainId,
      kind: scenario.kind,
      ctx: built.ctx,
      request: built.request,
      stopAt: 'final',
      notes: scenario.notes,
      inlineManifest: true,
    })
    if (fixture.golden.status !== scenario.expect) {
      throw new Error(
        `[record:${scenario.label}] scenario claims '${scenario.expect}' but the search produced '${fixture.golden.status}' — ` +
          'the world no longer exercises what this fixture exists for; fix the world, not the claim',
      )
    }
    console.log(`[record:${scenario.label}] ${summarize(fixture)}`)
    writeFixture(fixture)
  }
}

// ---------------------------------------------------------------------------
// Live
// ---------------------------------------------------------------------------

/** `ETH_RPC_HEADERS` as viem `fetchOptions.headers`, registered for redaction on the way through —
 * `chainz exec` hands some gateways over as a URL plus authenticating headers, and a gateway's own
 * error text can echo back the value it rejected. Nothing an outcome fixture holds could carry one
 * (the log has no slot for provider text at all), but this script also PRINTS, and the registration
 * is what keeps a thrown transport error out of a terminal scrollback. */
function rpcHeaders(): Record<string, string> {
  const headers = resolveRpcHeaders(process.env.ETH_RPC_HEADERS, [])
  registerRpcHeaders(headers)
  return headers
}

/** The one probe `router.ts` makes that materially changes a live recording's cost: with Multicall3
 * present a measurement round is a few `aggregate3`s instead of one `eth_call` per leg. */
async function probeMulticall3(client: PublicClient, address: Address): Promise<Address | undefined> {
  try {
    const code = (await client.request({ method: 'eth_getCode', params: [address, 'latest'] } as never)) as unknown
    return typeof code === 'string' && code.length > 2 ? address : undefined
  } catch {
    return undefined
  }
}

async function recordLive(args: Args): Promise<void> {
  const label = args.label
  if (!label) throw new Error('--label is required')
  const existing = existsSync(fixturePath(label)) ? parseFixture(readFileSync(fixturePath(label), 'utf8')) : undefined
  const chainId = args.chain ?? existing?.chainId
  const tokenIn = args.tokenIn ?? existing?.request.tokenIn
  const tokenOut = args.tokenOut ?? existing?.request.tokenOut
  const amountIn = args.amountIn ?? existing?.request.amountIn?.toString()
  const trader = args.trader ?? existing?.request.trader
  if (chainId === undefined || !tokenIn || !tokenOut || !amountIn) {
    throw new Error(`fixture '${label}' does not exist yet: --chain, --token-in, --token-out and --amount-in are all required`)
  }

  const manifest = manifestFor(chainId)
  const transport = http(resolveRpcUrl(args.rpc), { timeout: 120_000, fetchOptions: { headers: rpcHeaders() } })
  const client = createPublicClient({ transport }) as PublicClient
  const multicall3 = await probeMulticall3(client, manifest.multicall3 ?? MULTICALL3_ADDRESS)

  const kind: 'quote' | 'swap' = trader === undefined ? 'quote' : 'swap'
  const base: QuoteRequest = {
    tokenIn: tokenIn === 'native' ? 'native' : (tokenIn as CurrencyRef),
    tokenOut: tokenOut === 'native' ? 'native' : (tokenOut as CurrencyRef),
    amountIn: BigInt(amountIn),
    ...(args.budgetMs !== undefined && { signal: AbortSignal.timeout(args.budgetMs) }),
  }
  const request: QuoteRequest | SwapRequest = kind === 'swap' ? { ...base, trader: trader as Address } : base

  const ctx: SearchContext = {
    client,
    manifest,
    modules: PROTOCOL_MODULES,
    index: new PoolIndex(manifest.wrappedNative),
    hookData: buildHookData(request.hints),
    ...(multicall3 !== undefined && { multicall3 }),
  }

  console.log(`[record:${label}] live ${kind} on chain ${chainId} (multicall3 ${multicall3 === undefined ? 'absent' : 'present'})...`)
  const notes = args.notes ?? existing?.notes
  const fixture = await recordOutcomeFixture({
    label,
    chainId,
    kind,
    ctx,
    request,
    stopAt: 'actionable-lead',
    ...(notes !== undefined && { notes }),
  })
  console.log(`[record:${label}] ${summarize(fixture)} @ block ${fixture.context.block.number}`)
  writeFixture(fixture)
}

// ---------------------------------------------------------------------------
// Regold
// ---------------------------------------------------------------------------

/**
 * Re-folds every committed fixture and rewrites its golden — no network, by construction.
 *
 * This is the path a reporting change takes (a new canonical field, a renamed reason code), and it
 * is exactly the path `outcome.golden.test.ts`'s schema-pin test exists to police: a golden rebuilt
 * from the same outcomes is self-consistent whatever it dropped, so the SHAPE has to be asserted
 * somewhere that a `--regold` cannot rewrite.
 */
function regoldAll(): void {
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'))
  if (files.length === 0) throw new Error(`no fixtures found in ${FIXTURES_DIR}`)
  let changed = 0
  for (const file of files.sort()) {
    const fixture = parseFixture(readFileSync(join(FIXTURES_DIR, file), 'utf8'))
    const golden = canonicalizeResult(foldFixture(fixture).result)
    if (JSON.stringify(golden) === JSON.stringify(fixture.golden)) {
      console.log(`[regold:${fixture.label}] unchanged`)
      continue
    }
    writeFixture({ ...fixture, golden })
    changed++
  }
  console.log(`\n[regold] ${changed} of ${files.length} golden(s) updated (no RPC was used, schema v${OUTCOME_LOG_SCHEMA_VERSION})`)
}

const args = readArgs(process.argv.slice(2))
if (args.regold) regoldAll()
else if (args.hermetic) await recordHermetic()
else await recordLive(args)
