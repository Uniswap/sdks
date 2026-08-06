// ---------------------------------------------------------------------------
// Shared command setup: flags every trade-shaped command takes, and the
// chain → client → router → tokens pipeline they all run before doing
// anything interesting.
//
// The router is built from `../src` DIRECTLY (see `rl.ts`'s header): this is
// a local-testing tool, so it must always exercise the working tree's current
// source, never a possibly-stale `dist/`.
// ---------------------------------------------------------------------------

import { createPublicClient, http, type Address, type PublicClient } from 'viem'

import { PoolIndex } from '../../src/experimental/index'
import { createRouter, type PoolHint, type QuotedRoute, type Router } from '../../src/index'
import { parseAmount, parseBudget } from '../amounts'
import { dim } from '../ansi'
import { UsageError, type FlagSpec, type ParsedArgs } from '../args'
import { CACHE_FLAGS, cacheEnabled, cachePath, loadCache, saveCache, scheduleCacheSave } from '../cache'
import {
  assertChainMatches,
  clientTimeoutMs,
  parseChainAssertion,
  resolveManifest,
  resolveRpcUrl,
  type ResolvedChain,
} from '../chains'
import { parseHint } from '../hints'
import { redactKeyedUrl } from '../redact'
import { viewKey, type RenderCtx, type TokenView } from '../report'
import { fetchTokenMeta, resolveToken, type ResolvedToken } from '../tokens'

/** Flags shared by every command that talks to a chain. */
export const COMMON_FLAGS: FlagSpec = {
  chain: { kind: 'string', alias: 'c' },
  rpc: { kind: 'string' },
  json: { kind: 'boolean' },
  budget: { kind: 'string', alias: 'b' },
  verbose: { kind: 'boolean', alias: 'v' },
  ...CACHE_FLAGS,
}

/** Additional flags shared by the trade-shaped commands (quote/swap). */
export const TRADE_FLAGS: FlagSpec = {
  ...COMMON_FLAGS,
  watch: { kind: 'boolean', alias: 'w' },
  hint: { kind: 'strings' },
}

export type ChainContext = {
  chain: ResolvedChain
  client: PublicClient
  router: Router
  /** The injected index, exposed so `discover` can read back what a search learned. */
  index: PoolIndex
  signal?: AbortSignal
}

/**
 * Chain + client + router for `parsed`'s common flags.
 *
 * The endpoint comes from `--rpc`/`$ETH_RPC_URL` and the chain identifies itself: one
 * `eth_chainId` probe (fail-fast, no retries) detects what the endpoint serves, `--chain <id>` —
 * when given — is asserted against that answer, and the detected id picks the built-in manifest.
 * The router always gets a CLI-owned `PoolIndex` injected (constructed to match the manifest, as
 * `createRouter` requires) so commands that want to inspect what a search learned — `discover` —
 * can read it back afterwards.
 */
export async function buildChainContext(parsed: ParsedArgs): Promise<ChainContext> {
  const rpcUrl = resolveRpcUrl(parsed.strings.get('rpc'))
  const asserted = parseChainAssertion(parsed.strings.get('chain'))
  const budgetArg = parsed.strings.get('budget')
  const budgetMs = budgetArg !== undefined ? parseBudget(budgetArg) : undefined

  // Detect the chain with a short, unretried probe — an unreachable/misconfigured endpoint should
  // be a friendly one-liner in seconds, not viem's full retry ladder ending in a stack.
  const probe = createPublicClient({ transport: http(rpcUrl, { timeout: 10_000, retryCount: 0 }) }) as PublicClient
  let chainId: number
  try {
    chainId = await probe.getChainId()
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\n')[0]! : String(err)
    throw new UsageError(
      `the RPC endpoint did not answer eth_chainId — check --rpc/$ETH_RPC_URL (${redactKeyedUrl(message)})`,
    )
  }
  assertChainMatches(asserted, chainId)
  const chain = resolveManifest(chainId)

  // `--budget` is a COOPERATIVE bound: the SDK consults its AbortSignal between waves, but a
  // single stalled transport call would otherwise sit through viem's full per-request timeout
  // times its default retries before the signal is ever looked at — measured at ~2 minutes of
  // real time under `--budget 3s` against a stalled endpoint. So a budgeted run also derives the
  // transport's behaviour from the budget: each request is capped at the budget itself (floored
  // at 1s so a tight budget still lets one round trip through) and never retried. An unbudgeted
  // run keeps viem's defaults plus the chain-shaped timeout.
  const timeout =
    budgetMs !== undefined ? Math.max(1_000, Math.min(budgetMs, clientTimeoutMs(chain.chainId))) : clientTimeoutMs(chain.chainId)
  // `batch: false` IS THE MEASUREMENT, NOT THE DEFAULT-BY-OMISSION. This used to be `batch: true`, on
  // the reasonable-sounding theory that coalescing concurrent JSON-RPC calls into one POST is
  // strictly cheaper than making them separately. Against a real endpoint it is the opposite, and by
  // a lot, because of what this tool's heaviest phase looks like: an adjacency wave runs six scans at
  // once, each dispatching up to `SCAN_CHUNK_CONCURRENCY` chunks, so ~20 `eth_getLogs` are in flight
  // together — and viem's batcher turns those into ONE request that the provider serves more or less
  // serially and that cannot return until its slowest member does. Twenty independent requests over a
  // keep-alive pool genuinely overlap; one batch of twenty does not.
  //
  // Measured, 20s of six concurrent adjacency scans, blocks covered per second:
  //
  //     endpoint                   batch: true    batch: false
  //     quicknode  Base (8453)          71,161         437,435     6.1x
  //     alchemy    Mainnet (1)       2,472,779       3,316,227     1.34x
  //
  // It is not merely slower, either: an un-abortable multi-second batch POST is also why `--budget`
  // overshot — a 20s window returned at 29s, because the signal cannot interrupt a request whose
  // twenty members the transport has already fused into one.
  const client = createPublicClient({
    transport: http(rpcUrl, { batch: false, timeout, ...(budgetMs !== undefined ? { retryCount: 0 } : {}) }),
  }) as PublicClient
  const fresh = new PoolIndex(chain.manifest.wrappedNative, {
    reorgOverlapBlocks: chain.manifest.chain?.reorgOverlapBlocks,
  })

  // The on-disk cache (P2): a process is exactly the lifetime of a `PoolIndex`, so without this every
  // invocation re-scans the same block history to re-learn the same pools. Restoring one is safe
  // BECAUSE coverage is block-ranged — a snapshot from last week claims to have scanned up to block
  // N, so the next search asks the chain for N+1..head plus the standing reorg overlap, which is the
  // same incremental path a long-lived in-process router already takes. Every failure resolves to
  // "start fresh with a note"; see `cache.ts`.
  // Everything the cache says goes to STDERR, never stdout: `--json` output must stay machine-clean
  // no matter what the cache did.
  const verbose = parsed.booleans.has('verbose')
  const note = (line: string): void => {
    if (verbose) console.error(dim(line))
  }

  let index = fresh
  if (cacheEnabled(parsed.booleans)) {
    const started = Date.now()
    const loaded = await loadCache(chain.chainId, fresh)
    const loadMs = Date.now() - started
    if (loaded.index) index = loaded.index

    // ONE UNCONDITIONAL LINE, not gated on --verbose. A cache that reads and writes a file the user
    // never named, silently, is one they cannot reason about: the only way to notice it had resolved
    // a DIFFERENT chain than intended (and was therefore neither reading nor writing the file they
    // expected) was to go looking. Naming the resolved chain id and the exact path on every cached
    // run makes that self-evident, and costs one dim line on stderr. The load time is appended only
    // when it is large enough to be felt — a multi-hundred-megabyte snapshot adds real seconds before
    // the search starts, and an unexplained pause is the other thing a user cannot reason about.
    const slow = loadMs > 500 ? ` · ${(loadMs / 1000).toFixed(1)}s load` : ''
    console.error(dim(`cache: chain ${chain.chainId} · ${cachePath(chain.chainId)}${slow}`))
    // The detail (hit/miss, why it was discarded, what was saved) stays under --verbose.
    note(loaded.note)

    // Registered here rather than at each command's end so no command can forget it, and flushed by
    // `rl.ts` in a `finally` (and by its signal handler) so a partial, failed, or Ctrl-C'd search
    // still banks the coverage it really learned.
    scheduleCacheSave(async () => note(await saveCache(chain.chainId, index)))
  } else {
    note('cache: disabled (--no-cache)')
  }

  const router = createRouter({ client, manifest: chain.manifest, index })
  const base = { chain, client, router, index }
  return budgetMs !== undefined ? { ...base, signal: budgetSignal(budgetMs) } : base
}

// ---------------------------------------------------------------------------
// `--budget`'s clock.
//
// This is deliberately NOT `AbortSignal.timeout(ms)`, which is what it used to
// be and which reads as the obvious answer. That signal's timer is UNREF'D, and
// an unref'd timer is not reliably serviced by this runtime's loop while the
// loop is saturated with network I/O — which is precisely the state a budgeted
// search spends its whole life in.
//
// OBSERVED, NOT INFERRED. `rl quote eth usdc 1 --watch --budget 60s` against
// Base's quicknode endpoint: four consecutive runs never saw `aborted` flip at
// all — the search was still issuing `eth_getLogs` at t=180s, ~7,700 requests
// deep and climbing, with the signal reporting `aborted === false` the entire
// time and RSS past 13 GB on the longest one. The identical run with an
// explicit `AbortController` behind an ordinary ref'd `setTimeout` aborted at
// t=60.4s and exited. Shorter budgets (20s, 45s) fired reliably either way,
// which is why this went unnoticed: the failure needs a loop that has been
// busy for long enough, and until the fee-discovery scan stopped eating whole
// budgets (`constants.ts#FEE_DISCOVERY_MAX_REQUESTS`) nothing here ever ran the
// adjacency waves that keep it that busy.
//
// A ref'd timer would hold the process open for the remainder of the budget
// after a fast command finishes, so {@link cancelBudget} clears it — from
// `rl.ts`'s `finally` and from its signal handlers, next to the cache flush
// that already runs there for the same "one invocation, one context" reason.
//
// THE SDK IS NOT AFFECTED and needs no change: it consumes whatever
// `AbortSignal` it is handed and never manufactures one. This is a fact about
// how a HOST should build the signal, so it belongs in the host.
// ---------------------------------------------------------------------------

let pendingBudgetTimer: ReturnType<typeof setTimeout> | undefined

function budgetSignal(budgetMs: number): AbortSignal {
  const controller = new AbortController()
  pendingBudgetTimer = setTimeout(() => controller.abort(), budgetMs)
  return controller.signal
}

/** Clears the budget timer so a finished command exits immediately. Idempotent; never throws. */
export function cancelBudget(): void {
  if (pendingBudgetTimer !== undefined) clearTimeout(pendingBudgetTimer)
  pendingBudgetTimer = undefined
}

export type TradeContextResolved = {
  tokenIn: ResolvedToken
  tokenOut: ResolvedToken
  amountIn: bigint
  hints: PoolHint[]
  renderCtx: RenderCtx
}

/** Resolves `<tokenIn> <tokenOut> <amount>` positionals plus `--hint`s into SDK request inputs. */
export async function resolveTrade(ctx: ChainContext, parsed: ParsedArgs): Promise<TradeContextResolved> {
  const [tokenInArg, tokenOutArg, amountArg] = parsed.positionals
  if (!tokenInArg || !tokenOutArg || !amountArg) {
    throw new UsageError('expected: <tokenIn> <tokenOut> <amount> — e.g. `rl quote eth usdc 1`')
  }
  const [tokenIn, tokenOut] = await Promise.all([
    resolveToken(ctx.client, ctx.chain.manifest, tokenInArg),
    resolveToken(ctx.client, ctx.chain.manifest, tokenOutArg),
  ])
  const amountIn = parseAmount(amountArg, tokenIn.decimals)
  const hints = (parsed.lists.get('hint') ?? []).map((spec) =>
    parseHint(spec, tokenIn.ref, tokenOut.ref, ctx.chain.manifest.wrappedNative),
  )

  const views = new Map<string, TokenView>()
  views.set(viewKey(tokenIn.ref), { symbol: tokenIn.symbol, decimals: tokenIn.decimals })
  views.set(viewKey(tokenOut.ref), { symbol: tokenOut.symbol, decimals: tokenOut.decimals })
  if (!views.has('native')) views.set('native', { symbol: 'ETH', decimals: 18 })

  return { tokenIn, tokenOut, amountIn, hints, renderCtx: { views } }
}

/**
 * Resolves up to `cap` of `unknown`'s addresses and records what came back in `renderCtx.views`.
 *
 * Bounded and best-effort by construction: `Promise.allSettled`, so one dead token contract never
 * takes the render down, and an address that stays unresolved simply renders as a shortened hex
 * string. `cap` is the caller's, because the two callers are rendering different amounts of surface
 * (see each call site) — the fetch shape is what's shared, not the budget.
 */
export async function hydrateViews(
  ctx: ChainContext,
  renderCtx: RenderCtx,
  unknown: Iterable<Address>,
  cap: number,
): Promise<void> {
  const targets = [...unknown].slice(0, cap)
  const metas = await Promise.allSettled(targets.map((addr) => fetchTokenMeta(ctx.client, ctx.chain.chainId, addr)))
  for (const meta of metas) {
    if (meta.status !== 'fulfilled' || meta.value.ref === 'native') continue
    renderCtx.views.set(viewKey(meta.value.ref), { symbol: meta.value.symbol, decimals: meta.value.decimals })
  }
}

/** Cap for {@link hydrateLegSymbols}: a wave line and a result panel render ONE route plus a handful
 * of alternatives, each at most two hops — a dozen distinct leg tokens already covers every token
 * that can appear on screen, and every fetch beyond that is latency the user waits on for nothing. */
const MAX_LEG_METADATA_FETCHES = 12

/**
 * Fills the render context with symbols/decimals for every intermediate token appearing in the
 * results' route legs (two-hop routes traverse tokens the user never named). Bounded and
 * best-effort: an unresolvable leg token renders as a shortened address, never an error.
 */
export async function hydrateLegSymbols(ctx: ChainContext, renderCtx: RenderCtx, routes: QuotedRoute[]): Promise<void> {
  const unknown = new Set<Address>()
  for (const { route } of routes) {
    for (const leg of route.legs) {
      for (const ref of [leg.currencyIn, leg.currencyOut]) {
        if (ref !== 'native' && !renderCtx.views.has(viewKey(ref))) unknown.add(ref)
      }
    }
  }
  await hydrateViews(ctx, renderCtx, unknown, MAX_LEG_METADATA_FETCHES)
}
