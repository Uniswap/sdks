#!/usr/bin/env bun
/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// compare — quotes a matrix of pairs through BOTH this package's router
// (`src/`, straight from source, same convention as `cli/rl.ts`) and the
// Uniswap Trading API, and reports amount-out deltas, latency, and route
// shapes side by side.
//
// Usage:
//
//   cd sdks/router-lite-sdk
//   chainz exec 1 -- bun scripts/compare.ts --rpc @rpc
//   ETH_RPC_URL=https://… UNISWAP_API_KEY=… bun scripts/compare.ts
//   bun scripts/compare.ts --rpc https://… --dry-run                # no key needed
//   bun scripts/compare.ts --rpc https://… --pair "USDC/WETH:5000"  # override the matrix
//
// Chain detection, the RPC transport, `--rpc-header`/`$ETH_RPC_HEADERS`
// redaction, `--budget`'s transport shaping, and the on-disk pool cache are
// all `cli/commands/context.ts#buildChainContext` — the exact seam
// `cli/commands/quote.ts` builds on — rather than re-derived here. What is
// genuinely new is: the built-in pair matrix, on-chain symbol/decimals
// verification for it, the Trading API client, and the side-by-side report.
//
// TRADING API REQUEST SHAPE — CORRECTED AGAINST THE LIVE API. The obvious
// AMM-only request (`routingPreference: "CLASSIC"`) is REJECTED outright: the
// field only accepts `BEST_PRICE`/`FASTEST`. The mechanism that actually
// restricts routing to classic AMM pools is `protocols: ["V2","V3","V4"]`
// (confirmed HTTP 200 against a live key, response echoes `routing:
// "CLASSIC"`), so that is the ONLY body shape this script ever sends — no
// retry ladder, because there is nothing to fall back from. Native ETH as the
// zero address is confirmed working and is the only form sent.
//
// THE API CAN RETURN A SPLIT ROUTE — `quote.route` is an ARRAY OF ARRAYS
// (parallel paths, e.g. three ways for 1 ETH → USDC), never a single list of
// legs. This script never re-derives a route STRING from that structure —
// `quote.routeString` is already the API's own human-readable rendering — but
// it does read the outer array's length to report a split count, because
// `router-lite` never splits (single best route, by design) and a reader
// comparing route SHAPES needs to see that difference rather than either
// silently drop it or mis-render the parallel paths as one path.
// ---------------------------------------------------------------------------

import { fileURLToPath } from 'node:url'

import type { Address } from 'viem'

import type { CurrencyRef, QuoteRequest, QuoteResult } from '../src/index'

import { AmountError, parseAmount, parseBudget } from '../cli/amounts'
import { bold, cyan, dim, green, red, setColorEnabled, yellow } from '../cli/ansi'
import { parseArgs, UsageError, type FlagSpec } from '../cli/args'
import { CACHE_FLAGS, flushCacheSave } from '../cli/cache'
import { buildChainContext, hydrateLegSymbols, startBudget, type ChainContext } from '../cli/commands/context'
import { redact } from '../cli/redact'
import { amountFor, jsonify, renderRoute, viewKey, type RenderCtx } from '../cli/report'
import { fetchTokenMeta, resolveToken, RpcError, type ResolvedToken } from '../cli/tokens'

// ---------------------------------------------------------------------------
// Built-in mainnet pair matrix
// ---------------------------------------------------------------------------

const NATIVE: CurrencyRef = 'native'
const NATIVE_TOKEN: ResolvedToken = { ref: 'native', symbol: 'ETH', decimals: 18 }

type BuiltinTokenSpec = { ref: CurrencyRef; expectedSymbol?: string }
type BuiltinPairSpec = { label: string; tokenIn: BuiltinTokenSpec; tokenOut: BuiltinTokenSpec; amountHuman: string; notes: string }

/** Mainnet only (see the chain-mismatch guard in {@link main}). Addresses/expected symbols per the
 * script's spec; verified on-chain at startup by {@link verifyBuiltinTokens} before anything quotes
 * against them — see that function for what a mismatch does. */
const BUILTIN_PAIRS: BuiltinPairSpec[] = [
  {
    label: 'ETH→USDC',
    tokenIn: { ref: NATIVE },
    tokenOut: { ref: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address, expectedSymbol: 'USDC' },
    amountHuman: '1',
    notes: 'baseline bluechip',
  },
  {
    label: 'USDC→USDT',
    tokenIn: { ref: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address, expectedSymbol: 'USDC' },
    tokenOut: { ref: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address, expectedSymbol: 'USDT' },
    amountHuman: '10000',
    notes: 'stable/stable',
  },
  {
    label: 'WBTC→ETH',
    tokenIn: { ref: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as Address, expectedSymbol: 'WBTC' },
    tokenOut: { ref: NATIVE },
    amountHuman: '0.5',
    notes: '',
  },
  {
    label: 'wstETH→ETH',
    tokenIn: { ref: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0' as Address, expectedSymbol: 'wstETH' },
    tokenOut: { ref: NATIVE },
    amountHuman: '10',
    notes: 'correlated pair',
  },
  {
    label: 'PEPE→ETH',
    tokenIn: { ref: '0x6982508145454Ce325dDbE47a25d4ec3d2311933' as Address, expectedSymbol: 'PEPE' },
    tokenOut: { ref: NATIVE },
    amountHuman: '1000000000',
    notes: 'memecoin',
  },
  {
    label: 'ETH→MOG',
    tokenIn: { ref: NATIVE },
    tokenOut: { ref: '0xaaeE1A9723aaDB7afA2810263653A34bA2C21C7a' as Address, expectedSymbol: 'MOG' },
    amountHuman: '1',
    notes: 'memecoin',
  },
  {
    label: 'SHIB→PEPE',
    tokenIn: { ref: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE' as Address, expectedSymbol: 'SHIB' },
    tokenOut: { ref: '0x6982508145454Ce325dDbE47a25d4ec3d2311933' as Address, expectedSymbol: 'PEPE' },
    amountHuman: '100000000',
    notes: 'memecoin→memecoin, forces an intermediate',
  },
  {
    label: 'TURBO→USDC',
    tokenIn: { ref: '0xA35923162C49cF95e6BF26623385eb431aD920D3' as Address, expectedSymbol: 'TURBO' },
    tokenOut: { ref: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address, expectedSymbol: 'USDC' },
    amountHuman: '1000000',
    notes: 'long-tail',
  },
  {
    label: 'UNI→AAVE',
    tokenIn: { ref: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' as Address, expectedSymbol: 'UNI' },
    tokenOut: { ref: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9' as Address, expectedSymbol: 'AAVE' },
    amountHuman: '1000',
    notes: 'midcap→midcap',
  },
  {
    label: 'LINK→WBTC',
    tokenIn: { ref: '0x514910771AF9Ca656af840dff83E8264EcF986CA' as Address, expectedSymbol: 'LINK' },
    tokenOut: { ref: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as Address, expectedSymbol: 'WBTC' },
    amountHuman: '1000',
    notes: '',
  },
  {
    label: 'ENA→ETH',
    tokenIn: { ref: '0x57e114B691Db790C35207b2e685D4A43181e6061' as Address, expectedSymbol: 'ENA' },
    tokenOut: { ref: NATIVE },
    amountHuman: '10000',
    notes: '',
  },
  {
    label: 'BITCOIN→ETH',
    tokenIn: { ref: '0x72e4f9F808C49A2a61dE9C5896298920Dc4EEEa9' as Address, expectedSymbol: 'BITCOIN' },
    tokenOut: { ref: NATIVE },
    amountHuman: '100000',
    notes: 'v2-only long-tail (HarryPotterObamaSonic10Inu)',
  },
]

/**
 * Verifies every distinct non-native address the built-in matrix names, in one batch
 * (`Promise.allSettled` over `fetchTokenMeta`, which itself issues `symbol()`/`decimals()` together —
 * see `cli/tokens.ts`), and cross-checks the on-chain symbol against what the matrix expects.
 *
 * A mismatch or an unreadable token is reported as an `Error` in the returned map, never thrown —
 * {@link resolvePairs} drops the one or two pairs that named it, with a warning, rather than aborting
 * the whole run. That asymmetry with `resolveToken` (used for user-supplied `--pair`s, which throws)
 * is deliberate and matches this script's contract: a stale hardcoded address in ITS OWN matrix must
 * not block every other pair in the run, while a user who typed something that does not resolve
 * needs to know immediately.
 */
async function verifyBuiltinTokens(ctx: ChainContext): Promise<Map<string, ResolvedToken | Error>> {
  const expected = new Map<string, string | undefined>()
  for (const spec of BUILTIN_PAIRS) {
    for (const t of [spec.tokenIn, spec.tokenOut]) {
      if (t.ref === 'native') continue
      const key = t.ref.toLowerCase()
      if (!expected.has(key)) expected.set(key, t.expectedSymbol)
    }
  }
  const entries = [...expected.entries()]
  const settled = await Promise.allSettled(entries.map(([addr]) => fetchTokenMeta(ctx.client, ctx.chain.chainId, addr as Address)))
  const out = new Map<string, ResolvedToken | Error>()
  settled.forEach((result, i) => {
    const [addr, expectedSymbol] = entries[i]!
    if (result.status === 'rejected') {
      const reason = result.reason instanceof Error ? result.reason : new Error(String(result.reason))
      out.set(addr, reason)
      return
    }
    if (expectedSymbol !== undefined && result.value.symbol.toLowerCase() !== expectedSymbol.toLowerCase()) {
      out.set(addr, new Error(`on-chain symbol '${result.value.symbol}' does not match expected '${expectedSymbol}'`))
      return
    }
    out.set(addr, result.value)
  })
  return out
}

// ---------------------------------------------------------------------------
// `--pair "TOKENA/TOKENB[:amount]"` parsing — pure, unit-tested.
// ---------------------------------------------------------------------------

export type PairSpecInput = { tokenInArg: string; tokenOutArg: string; amountHuman: string }

/** Amount defaults to `'1'` (human units) when the spec carries no `:amount` suffix. */
export function parsePairSpec(spec: string): PairSpecInput {
  const trimmed = spec.trim()
  const slash = trimmed.indexOf('/')
  if (slash <= 0 || slash === trimmed.length - 1) {
    throw new UsageError(`malformed --pair '${spec}' — expected 'TOKENA/TOKENB[:amount]'`)
  }
  const tokenInArg = trimmed.slice(0, slash).trim()
  const rest = trimmed.slice(slash + 1)
  const colon = rest.lastIndexOf(':')
  const tokenOutArg = (colon >= 0 ? rest.slice(0, colon) : rest).trim()
  const amountHuman = (colon >= 0 ? rest.slice(colon + 1) : '1').trim()
  if (tokenOutArg.length === 0) throw new UsageError(`malformed --pair '${spec}' — expected 'TOKENA/TOKENB[:amount]'`)
  if (amountHuman.length === 0) throw new UsageError(`malformed --pair '${spec}' — empty amount after ':'`)
  return { tokenInArg, tokenOutArg, amountHuman }
}

// ---------------------------------------------------------------------------
// Resolved pairs: what both sides quote against.
// ---------------------------------------------------------------------------

export type ResolvedPair = { label: string; tokenIn: ResolvedToken; tokenOut: ResolvedToken; amountIn: bigint; notes: string }

async function resolvePairs(ctx: ChainContext, userPairSpecs: string[]): Promise<ResolvedPair[]> {
  if (userPairSpecs.length > 0) {
    const pairs: ResolvedPair[] = []
    for (const spec of userPairSpecs) {
      const { tokenInArg, tokenOutArg, amountHuman } = parsePairSpec(spec)
      // `resolveToken` THROWS on a bad symbol/address (see cli/tokens.ts) — deliberately not caught
      // here, unlike the built-in matrix below: a user-supplied pair that does not resolve is an
      // argument mistake to fix, not a stale fixture to drop and move on from.
      const [tokenIn, tokenOut] = await Promise.all([
        resolveToken(ctx.client, ctx.chain.manifest, tokenInArg),
        resolveToken(ctx.client, ctx.chain.manifest, tokenOutArg),
      ])
      const amountIn = parseAmount(amountHuman, tokenIn.decimals)
      pairs.push({ label: `${tokenIn.symbol}→${tokenOut.symbol}`, tokenIn, tokenOut, amountIn, notes: 'user-supplied' })
    }
    return pairs
  }

  const verified = await verifyBuiltinTokens(ctx)
  const pairs: ResolvedPair[] = []
  for (const spec of BUILTIN_PAIRS) {
    const resolve = (t: BuiltinTokenSpec): ResolvedToken | Error =>
      t.ref === 'native' ? NATIVE_TOKEN : (verified.get(t.ref.toLowerCase()) ?? new Error('not verified'))
    const tokenIn = resolve(spec.tokenIn)
    const tokenOut = resolve(spec.tokenOut)
    if (tokenIn instanceof Error || tokenOut instanceof Error) {
      const reasons = [tokenIn, tokenOut].filter((t): t is Error => t instanceof Error).map((e) => e.message)
      console.error(yellow(`[compare] dropping built-in pair '${spec.label}': ${reasons.join('; ')}`))
      continue
    }
    const amountIn = parseAmount(spec.amountHuman, tokenIn.decimals)
    pairs.push({ label: spec.label, tokenIn, tokenOut, amountIn, notes: spec.notes })
  }
  return pairs
}

function registerViews(renderCtx: RenderCtx, pairs: ResolvedPair[]): void {
  for (const pair of pairs) {
    renderCtx.views.set(viewKey(pair.tokenIn.ref), { symbol: pair.tokenIn.symbol, decimals: pair.tokenIn.decimals })
    renderCtx.views.set(viewKey(pair.tokenOut.ref), { symbol: pair.tokenOut.symbol, decimals: pair.tokenOut.decimals })
  }
  if (!renderCtx.views.has('native')) renderCtx.views.set('native', { symbol: 'ETH', decimals: 18 })
}

// ---------------------------------------------------------------------------
// router-lite side
// ---------------------------------------------------------------------------

export type LiteFlags = { aborted: boolean; headRegressed: boolean; verificationDegraded: boolean; transportFailed: number }

export type LiteSideResult =
  | {
      kind: 'quote'
      amountOut: bigint
      gasEstimate?: bigint
      route: string
      firstActionableMs?: number
      finalMs: number
      flags: LiteFlags
    }
  | { kind: 'no-route' | 'inconclusive'; reasonCode: string; reasonDetail: string; firstActionableMs?: number; finalMs: number; flags: LiteFlags }
  | { kind: 'error'; message: string; finalMs: number }

/**
 * Runs one pair through the router's `quotes()` iterator to the end of its OWN budget (like
 * `rl quote --watch`), recording the first-actionable moment via `onFirstRoute` (like `rl quote
 * --verbose`'s `first` line) and the final best after the budget expires. Each pair gets its own
 * fresh budget clock (`startBudget`, `cli/commands/context.ts`) rather than sharing one across the
 * whole matrix — a slow pair must not eat into the next pair's allowance.
 */
async function quoteLite(ctx: ChainContext, renderCtx: RenderCtx, pair: ResolvedPair, budgetMs: number): Promise<LiteSideResult> {
  const budget = startBudget(budgetMs)
  const started = Date.now()
  let firstActionableMs: number | undefined
  let final: QuoteResult | undefined
  try {
    const request: QuoteRequest = {
      tokenIn: pair.tokenIn.ref,
      tokenOut: pair.tokenOut.ref,
      amountIn: pair.amountIn,
      ...(budget.signal ? { signal: budget.signal } : {}),
    }
    const iter = ctx.router.quotes(request, {
      onFirstRoute: () => {
        if (firstActionableMs === undefined) firstActionableMs = Date.now() - started
      },
    })
    for await (const result of iter) final = result
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err), finalMs: Date.now() - started }
  } finally {
    budget.cancel()
  }

  const finalMs = Date.now() - started
  if (!final) return { kind: 'error', message: 'search yielded no result', finalMs }

  const flags: LiteFlags = {
    aborted: final.search.aborted,
    headRegressed: final.search.headRegressed,
    verificationDegraded: final.search.verificationDegraded,
    transportFailed: final.search.quoting.transportFailed,
  }

  if (final.status === 'quote') {
    await hydrateLegSymbols(ctx, renderCtx, [final.best, ...final.alternatives])
    return {
      kind: 'quote',
      amountOut: final.best.quote.amountOut,
      ...(final.best.quote.gasEstimate !== undefined ? { gasEstimate: final.best.quote.gasEstimate } : {}),
      route: renderRoute(final.best.route, renderCtx),
      ...(firstActionableMs !== undefined ? { firstActionableMs } : {}),
      finalMs,
      flags,
    }
  }
  return {
    kind: final.status,
    reasonCode: final.reason.code,
    reasonDetail: final.reason.detail,
    ...(firstActionableMs !== undefined ? { firstActionableMs } : {}),
    finalMs,
    flags,
  }
}

// ---------------------------------------------------------------------------
// Trading API side
// ---------------------------------------------------------------------------

export const TRADING_API_URL = 'https://trade-api.gateway.uniswap.org/v1/quote'
/** A syntactically valid, never-funded address — the API requires a `swapper` but never moves funds
 * for a `/quote` call. */
export const TRADING_API_SWAPPER = '0x37305B1cD40574E4C5Ce33f8e8306Be057fD7341'
const NATIVE_ETH_ADDRESS = '0x0000000000000000000000000000000000000000'
/** Generous but bounded — this script's own request must never hang the whole matrix run. */
const API_REQUEST_TIMEOUT_MS = 30_000

export type TradingApiRequestBody = {
  type: 'EXACT_INPUT'
  amount: string
  tokenInChainId: number
  tokenOutChainId: number
  tokenIn: string
  tokenOut: string
  swapper: string
  slippageTolerance: number
  protocols: string[]
}

function tokenAddressForApi(ref: CurrencyRef): string {
  return ref === 'native' ? NATIVE_ETH_ADDRESS : ref
}

/**
 * The ONLY request shape this script sends — see the module header for why `routingPreference:
 * "CLASSIC"` (the spec's original guess) is not: the live API rejects it outright, and
 * `protocols: ["V2","V3","V4"]` is the confirmed way to get AMM-only routing, so there is no
 * fallback ladder to build.
 */
export function buildTradingApiBody(pair: Pick<ResolvedPair, 'tokenIn' | 'tokenOut' | 'amountIn'>, chainId: number): TradingApiRequestBody {
  return {
    type: 'EXACT_INPUT',
    amount: pair.amountIn.toString(),
    tokenInChainId: chainId,
    tokenOutChainId: chainId,
    tokenIn: tokenAddressForApi(pair.tokenIn.ref),
    tokenOut: tokenAddressForApi(pair.tokenOut.ref),
    swapper: TRADING_API_SWAPPER,
    slippageTolerance: 0.5,
    protocols: ['V2', 'V3', 'V4'],
  }
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
}

/** `quote.output.amount` first (the confirmed live path), then a defensive scan of shapes an
 * unannounced API change might take — never a crash on an unfamiliar response. */
function extractAmountOut(json: unknown): bigint | undefined {
  const root = asRecord(json)
  if (!root) return undefined
  const quote = asRecord(root.quote)
  const candidates: unknown[] = [
    asRecord(quote?.output)?.amount,
    asRecord(root.output)?.amount,
    quote?.amountOut,
    root.amountOut,
    quote?.amount,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && /^\d+$/.test(c)) return BigInt(c)
    if (typeof c === 'number' && Number.isFinite(c)) return BigInt(Math.trunc(c))
  }
  return undefined
}

export type ParsedApiQuote = {
  amountOut?: bigint
  routing?: string
  routeString?: string
  /** Length of `quote.route` (an ARRAY OF ARRAYS — parallel paths, not legs of one path) when
   * present; `1` means a single path, `> 1` a split. Absent when the field is missing/malformed. */
  splitCount?: number
  gasUseEstimate?: string
  gasFeeWei?: string
  gasFeeUSD?: string
  priceImpact?: number
}

/** Parses a successful (2xx) Trading API body against the confirmed field paths — see this file's
 * header. Never throws: an unfamiliar shape simply yields fewer fields, all optional. */
export function parseTradingApiResponse(json: unknown): ParsedApiQuote {
  const root = asRecord(json)
  const quote = asRecord(root?.quote)
  const amountOut = extractAmountOut(json)
  const routing = typeof root?.routing === 'string' ? root.routing : undefined
  const routeString = typeof quote?.routeString === 'string' ? quote.routeString : undefined
  const splitCount = Array.isArray(quote?.route) ? quote.route.length : undefined
  const gasUseEstimate = typeof quote?.gasUseEstimate === 'string' ? quote.gasUseEstimate : undefined
  const gasFeeWei = typeof quote?.gasFee === 'string' ? quote.gasFee : undefined
  const gasFeeUSDRaw = quote?.gasFeeUSD
  const gasFeeUSD = typeof gasFeeUSDRaw === 'string' ? gasFeeUSDRaw : typeof gasFeeUSDRaw === 'number' ? String(gasFeeUSDRaw) : undefined
  const priceImpact = typeof quote?.priceImpact === 'number' ? quote.priceImpact : undefined
  return {
    ...(amountOut !== undefined ? { amountOut } : {}),
    ...(routing !== undefined ? { routing } : {}),
    ...(routeString !== undefined ? { routeString } : {}),
    ...(splitCount !== undefined ? { splitCount } : {}),
    ...(gasUseEstimate !== undefined ? { gasUseEstimate } : {}),
    ...(gasFeeWei !== undefined ? { gasFeeWei } : {}),
    ...(gasFeeUSD !== undefined ? { gasFeeUSD } : {}),
    ...(priceImpact !== undefined ? { priceImpact } : {}),
  }
}

/** The confirmed 400 shape: `{"errorCode":"RequestValidationError","detail":"..."}`. Returns
 * `undefined` for anything else (not JSON, or JSON without a `detail` string) so the caller falls
 * back to the raw (redacted) body. */
function extractApiErrorDetail(text: string): string | undefined {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return undefined
  }
  const root = asRecord(json)
  if (!root || typeof root.detail !== 'string') return undefined
  const code = typeof root.errorCode === 'string' ? `${root.errorCode}: ` : ''
  return `${code}${root.detail}`
}

/** Scrubs a literal API key out of anything about to be printed/persisted — a SEPARATE registry
 * from `cli/redact.ts`'s RPC-header-value scrub (a different credential, on a different transport),
 * composed with it via {@link redact} at every call site below. */
function redactApiKey(message: string, apiKey: string): string {
  return apiKey.length > 0 ? message.split(apiKey).join('<UNISWAP_API_KEY: redacted>') : message
}

type ApiHttpResult =
  | { ok: true; json: unknown; latencyMs: number }
  | { ok: false; httpStatus: number; text: string; detail?: string; latencyMs: number }
  | { ok: false; error: string; latencyMs: number }

/** One POST, wall-clock timed. The API key is sent only as the `x-api-key` header value — never in
 * the body, and never logged: every text this function returns to a `false` branch is already run
 * through {@link redactApiKey} composed with `redact` before it leaves this module. */
async function postTradingApiQuote(body: TradingApiRequestBody, apiKey: string): Promise<ApiHttpResult> {
  const started = Date.now()
  let res: Response
  try {
    res = await fetch(TRADING_API_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: redact(redactApiKey(message, apiKey)), latencyMs: Date.now() - started }
  }
  const latencyMs = Date.now() - started
  const text = await res.text()
  const scrubbed = redact(redactApiKey(text, apiKey))
  if (!res.ok) {
    const detail = extractApiErrorDetail(text)
    return {
      ok: false,
      httpStatus: res.status,
      text: scrubbed,
      ...(detail !== undefined ? { detail: redact(redactApiKey(detail, apiKey)) } : {}),
      latencyMs,
    }
  }
  try {
    return { ok: true, json: JSON.parse(text), latencyMs }
  } catch {
    // 2xx with a body that isn't JSON at all: report it as the error it is rather than crash.
    return { ok: false, httpStatus: res.status, text: scrubbed, latencyMs }
  }
}

export type ApiSideResult =
  | { kind: 'skipped' }
  | ({ kind: 'ok'; latencyMs: number; raw: unknown } & ParsedApiQuote)
  | { kind: 'error'; latencyMs: number; httpStatus?: number; message: string; raw?: string }

async function quoteTradingApi(pair: ResolvedPair, chainId: number, apiKey: string): Promise<ApiSideResult> {
  const body = buildTradingApiBody(pair, chainId)
  const attempt = await postTradingApiQuote(body, apiKey)
  if (attempt.ok) return { kind: 'ok', ...parseTradingApiResponse(attempt.json), latencyMs: attempt.latencyMs, raw: attempt.json }
  if ('httpStatus' in attempt) {
    return {
      kind: 'error',
      latencyMs: attempt.latencyMs,
      httpStatus: attempt.httpStatus,
      message: attempt.detail ?? attempt.text,
      raw: attempt.text,
    }
  }
  return { kind: 'error', latencyMs: attempt.latencyMs, message: attempt.error }
}

// ---------------------------------------------------------------------------
// Delta math — pure, unit-tested.
// ---------------------------------------------------------------------------

/**
 * `(lite - api) / api` in bps, signed: positive means router-lite found MORE output. `undefined`
 * when either side has no amount, or the API side is zero (nothing to divide by) — a delta is a
 * claim about a comparison that actually happened, not a fabricated number for a side that failed.
 * Three decimal places of precision (matches `cli/report.ts`'s own promoted-route bps note).
 */
export function deltaBps(liteOut: bigint | undefined, apiOut: bigint | undefined): number | undefined {
  if (liteOut === undefined || apiOut === undefined || apiOut === 0n) return undefined
  return Number(((liteOut - apiOut) * 10_000_000n) / apiOut) / 1000
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

export type ComparisonRow = { pair: ResolvedPair; lite: LiteSideResult; api: ApiSideResult }

export type Summary = {
  pairsTotal: number
  pairsCompared: number
  wins: number
  ties: number
  losses: number
  medianDeltaBps?: number
  /** The most NEGATIVE delta observed (router-lite's biggest shortfall vs the API), not the largest
   * absolute value — that is the number a reader chasing a regression actually wants. */
  worstDeltaBps?: number
  liteFirstActionableMedianMs?: number
  liteFinalMedianMs?: number
  apiMedianMs?: number
  /** Always present: router-lite quotes a single best route by design, so a Trading API response
   * with more than one path in `quote.route` is an expected structural difference, not a discrepancy. */
  note: string
}

const SPLIT_ROUTE_NOTE =
  'router-lite always quotes a single best route by design; the Trading API can return a split route ' +
  '(quote.route as multiple parallel paths) — a split alone is not a discrepancy, it is a different execution model.'

export function summarize(rows: ComparisonRow[]): Summary {
  const deltas: number[] = []
  let wins = 0
  let ties = 0
  let losses = 0
  const liteFinalMs: number[] = []
  const liteFirstMs: number[] = []
  const apiMs: number[] = []

  for (const { lite, api } of rows) {
    if (lite.kind === 'quote') {
      liteFinalMs.push(lite.finalMs)
      if (lite.firstActionableMs !== undefined) liteFirstMs.push(lite.firstActionableMs)
    }
    if (api.kind === 'ok') {
      apiMs.push(api.latencyMs)
      if (lite.kind === 'quote') {
        const d = deltaBps(lite.amountOut, api.amountOut)
        if (d !== undefined) {
          deltas.push(d)
          if (Math.abs(d) < 1) ties++
          else if (d > 0) wins++
          else losses++
        }
      }
    }
  }

  const worst = deltas.length > 0 ? deltas.reduce((min, d) => (d < min ? d : min)) : undefined
  const medianDelta = median(deltas)
  const liteFinalMedian = median(liteFinalMs)
  const liteFirstMedian = median(liteFirstMs)
  const apiMedian = median(apiMs)

  return {
    pairsTotal: rows.length,
    pairsCompared: deltas.length,
    wins,
    ties,
    losses,
    ...(medianDelta !== undefined ? { medianDeltaBps: medianDelta } : {}),
    ...(worst !== undefined ? { worstDeltaBps: worst } : {}),
    ...(liteFirstMedian !== undefined ? { liteFirstActionableMedianMs: liteFirstMedian } : {}),
    ...(liteFinalMedian !== undefined ? { liteFinalMedianMs: liteFinalMedian } : {}),
    ...(apiMedian !== undefined ? { apiMedianMs: apiMedian } : {}),
    note: SPLIT_ROUTE_NOTE,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderLiteSide(lite: LiteSideResult, pair: ResolvedPair, renderCtx: RenderCtx): string[] {
  const lines: string[] = []
  if (lite.kind === 'quote') {
    const first = lite.firstActionableMs !== undefined ? `${lite.firstActionableMs}ms` : 'n/a'
    lines.push(`  lite   ${bold(amountFor(renderCtx, pair.tokenOut.ref, lite.amountOut))}  first ${first} · final ${lite.finalMs}ms`)
    lines.push(`         ${dim(lite.route)}`)
  } else if (lite.kind === 'error') {
    lines.push(`  lite   ${red('error')} ${lite.message} (${lite.finalMs}ms)`)
  } else {
    lines.push(`  lite   ${yellow(lite.kind)} ${lite.reasonCode} — ${lite.reasonDetail} (${lite.finalMs}ms)`)
  }
  if (lite.kind !== 'error') {
    const flagList = [
      lite.flags.aborted && 'aborted',
      lite.flags.headRegressed && 'head-regressed',
      lite.flags.verificationDegraded && 'verification-degraded',
      lite.flags.transportFailed > 0 && `${lite.flags.transportFailed} transport-lost`,
    ].filter((f): f is string => Boolean(f))
    if (flagList.length > 0) lines.push(`         ${dim(`flags: ${flagList.join(' · ')}`)}`)
  }
  return lines
}

function renderApiSide(api: ApiSideResult, pair: ResolvedPair, renderCtx: RenderCtx): string[] {
  if (api.kind === 'skipped') return [`  api    ${dim('skipped (no UNISWAP_API_KEY)')}`]
  if (api.kind === 'error') {
    const status = api.httpStatus !== undefined ? `HTTP ${api.httpStatus}` : 'request failed'
    return [`  api    ${red(status)} ${api.message} (${api.latencyMs}ms)`]
  }
  const amount = api.amountOut !== undefined ? amountFor(renderCtx, pair.tokenOut.ref, api.amountOut) : dim('[no amount in response]')
  const split = api.splitCount !== undefined && api.splitCount > 1 ? cyan(` (${api.splitCount}-way split)`) : ''
  const lines = [`  api    ${bold(amount)}  ${api.latencyMs}ms  ${dim(api.routing ?? '')}`]
  lines.push(`         ${dim(api.routeString ?? '[no routeString in response]')}${split}`)
  return lines
}

function printRow(row: ComparisonRow, renderCtx: RenderCtx): void {
  const { pair, lite, api } = row
  const amountInStr = amountFor(renderCtx, pair.tokenIn.ref, pair.amountIn)
  const bps = lite.kind === 'quote' && api.kind === 'ok' ? deltaBps(lite.amountOut, api.amountOut) : undefined
  const bpsStr = bps !== undefined ? (bps >= 0 ? green(`+${bps} bps`) : red(`${bps} bps`)) : dim('n/a')
  console.log('')
  console.log(`${bold(pair.label)}  ${dim(amountInStr)}${pair.notes ? dim(` — ${pair.notes}`) : ''}  ${dim('delta')} ${bpsStr}`)
  for (const line of renderLiteSide(lite, pair, renderCtx)) console.log(line)
  for (const line of renderApiSide(api, pair, renderCtx)) console.log(line)
}

function printSummary(summary: Summary): void {
  console.log('')
  console.log(bold('summary'))
  console.log(`  pairs         ${summary.pairsCompared}/${summary.pairsTotal} compared (both sides answered)`)
  console.log(`  lite record   ${summary.wins} win${summary.wins === 1 ? '' : 's'} · ${summary.ties} tie${summary.ties === 1 ? '' : 's'} · ${summary.losses} loss${summary.losses === 1 ? '' : 'es'} (|Δ| < 1 bps is a tie)`)
  if (summary.medianDeltaBps !== undefined) console.log(`  delta bps     median ${summary.medianDeltaBps} · worst ${summary.worstDeltaBps}`)
  if (summary.liteFirstActionableMedianMs !== undefined) {
    console.log(`  lite latency  first-actionable median ${summary.liteFirstActionableMedianMs}ms · final median ${summary.liteFinalMedianMs}ms`)
  }
  if (summary.apiMedianMs !== undefined) console.log(`  api latency   median ${summary.apiMedianMs}ms`)
  console.log(dim(`  note: ${summary.note}`))
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const FLAGS: FlagSpec = {
  rpc: { kind: 'string' },
  'rpc-header': { kind: 'strings' },
  budget: { kind: 'string' },
  json: { kind: 'boolean' },
  'dry-run': { kind: 'boolean' },
  pair: { kind: 'strings' },
  ...CACHE_FLAGS,
}

/** `--budget`'s default for this script — PER PAIR, unlike `rl`'s unbounded default, because a
 * comparison matrix that could hang forever on one long-tail pair defeats the point of a tool meant
 * to be run repeatedly while iterating on the search. */
const DEFAULT_BUDGET_MS = 10_000

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2), FLAGS)
  const json = parsed.booleans.has('json')
  const dryRun = parsed.booleans.has('dry-run')
  if (json) setColorEnabled(false)
  const userPairSpecs = parsed.lists.get('pair') ?? []

  // `buildChainContext` does the chain-touching setup this script shares with `rl quote`: resolves
  // the RPC endpoint, resolves+REGISTERS `--rpc-header`/`$ETH_RPC_HEADERS` for redaction (before its
  // own `eth_chainId` probe — the first network call), detects the chain, builds the client/router,
  // and loads/schedules the on-disk pool cache (respecting `--no-cache`). See that function for why
  // each of those happens in that order.
  const ctx = await buildChainContext(parsed)
  try {
    if (ctx.chain.chainId !== 1 && userPairSpecs.length === 0) {
      throw new UsageError(
        `compare.ts's built-in pair matrix is mainnet-only, but the connected RPC serves chain ${ctx.chain.chainId} — ` +
          'pass --pair "TOKENA/TOKENB[:amount]" to compare pairs on this chain instead',
      )
    }

    const pairs = await resolvePairs(ctx, userPairSpecs)
    if (pairs.length === 0) throw new UsageError('no pairs survived verification — nothing to compare')

    const renderCtx: RenderCtx = { views: new Map() }
    registerViews(renderCtx, pairs)

    if (dryRun) {
      const requests = pairs.map((pair) => ({ label: pair.label, body: buildTradingApiBody(pair, ctx.chain.chainId) }))
      if (json) {
        console.log(jsonify({ dryRun: true, chainId: ctx.chain.chainId, requests }))
      } else {
        console.log(bold(`compare — dry run: ${requests.length} Trading API request bod${requests.length === 1 ? 'y' : 'ies'} (chain ${ctx.chain.chainId})`))
        for (const { label, body } of requests) {
          console.log('')
          console.log(bold(label))
          console.log(JSON.stringify(body, null, 2))
        }
      }
      return 0
    }

    const apiKey = process.env.UNISWAP_API_KEY
    if (!apiKey && !json) console.log(dim('note: $UNISWAP_API_KEY is unset — running router-lite only; the api column will read "skipped"'))

    const budgetArg = parsed.strings.get('budget')
    const budgetMs = budgetArg !== undefined ? parseBudget(budgetArg) : DEFAULT_BUDGET_MS

    // Sequential, deliberately: each pair gets the search's full attention (and its own budget
    // clock) rather than N searches contending for one client's concurrency limit at once, which
    // would make every pair's latency measurement a function of how many OTHER pairs happened to be
    // running at the same moment instead of a property of that pair alone.
    const rows: ComparisonRow[] = []
    for (const pair of pairs) {
      const lite = await quoteLite(ctx, renderCtx, pair, budgetMs)
      const api = apiKey ? await quoteTradingApi(pair, ctx.chain.chainId, apiKey) : { kind: 'skipped' as const }
      rows.push({ pair, lite, api })
      if (!json) printRow(rows[rows.length - 1]!, renderCtx)
    }

    const summary = summarize(rows)
    if (json) {
      console.log(jsonify({ chainId: ctx.chain.chainId, apiKeyPresent: Boolean(apiKey), rows, summary }))
    } else {
      printSummary(summary)
    }

    // Deltas are DATA, not a failure — the scripting contract here is "did the run complete", not
    // "did router-lite win". The one exception: every attempted API call coming back 401 is not a
    // comparison result at all, it is `$UNISWAP_API_KEY` being wrong, and that is an infra failure a
    // script should be able to tell apart from "the run completed and found a regression".
    const attempted = rows.map((r) => r.api).filter((a): a is Extract<ApiSideResult, { kind: 'error' }> => a.kind === 'error')
    if (apiKey && attempted.length > 0 && attempted.length === rows.length && attempted.every((a) => a.httpStatus === 401)) {
      console.error(red('compare: every Trading API call returned 401 — check $UNISWAP_API_KEY'))
      return 1
    }
    return 0
  } finally {
    await flushCacheSave()
  }
}

// Runs `main()` only when this file is the process's entry point (`bun scripts/compare.ts …`), never
// when `compare.test.ts` imports its pure functions — mirrors Node's `require.main === module` idiom
// rather than `import.meta.main`, which needs `bun-types`/`@types/bun` that this repo deliberately
// does not depend on (see `typings/bun-test.d.ts`'s header for why: hoisting `bun-types` into the
// root `node_modules` breaks sibling packages still on TypeScript 4.x).
const isEntryPoint = process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)

if (isEntryPoint) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((err) => {
      // Mirrors `cli/rl.ts`'s own top-level mapping, collapsed to this script's simpler exit
      // contract (0 = completed, nonzero = infra/usage failure — see the module header).
      if (err instanceof UsageError || err instanceof AmountError || err instanceof RpcError) {
        console.error(red('compare: ') + redact(err.message))
      } else {
        const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
        console.error(red('compare: unexpected error:'))
        console.error(redact(message))
      }
      process.exitCode = 1
    })
}
