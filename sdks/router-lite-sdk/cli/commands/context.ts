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

// `DEFAULT_CONCURRENCY`/`MAX_CONCURRENCY` are the SDK's own bounds for the option `--concurrency`
// maps to; imported by relative path (the same escape hatch `discover.ts` documents) so `--help` and
// the flag's validation can never disagree with `createRouter`'s.
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from '../../src/constants'
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
import { applyPoolList } from '../poolList'
import { redactKeyedUrl, redactHeaderValues, registerRpcHeaders } from '../redact'
import { viewKey, type RenderCtx, type TokenView } from '../report'
import { resolveRpcHeaders } from '../rpcHeaders'
import { fetchTokenMeta, resolveToken, type ResolvedToken } from '../tokens'

/**
 * Flags shared by every command that talks to a chain.
 *
 * `--pool-list` / `--trust-coverage` live HERE rather than on the trade commands only, because
 * `discover` is the command a list most obviously helps: it exists to answer "what pools does the
 * SDK see", and a list changes that answer.
 */
export const COMMON_FLAGS: FlagSpec = {
  chain: { kind: 'string', alias: 'c' },
  rpc: { kind: 'string' },
  json: { kind: 'boolean' },
  budget: { kind: 'string', alias: 'b' },
  concurrency: { kind: 'string' },
  verbose: { kind: 'boolean', alias: 'v' },
  'pool-list': { kind: 'string' },
  'trust-coverage': { kind: 'boolean' },
  'rpc-header': { kind: 'strings' },
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
  /**
   * `--budget`, parsed — NOT a live clock. The command starts it, with {@link startBudget}, at the
   * moment its search does; see that function for why the difference is the whole point.
   */
  budgetMs?: number
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
  // `--rpc-header`/`$ETH_RPC_HEADERS`, resolved and registered for redaction BEFORE the chain probe
  // a few lines down — the first network request this function makes — so even a failure on THAT
  // request is covered. A malformed pair is a `UsageError` here too, next to the other argument
  // mistakes this function decides before anything is spent.
  const headers = resolveRpcHeaders(process.env.ETH_RPC_HEADERS, parsed.lists.get('rpc-header') ?? [])
  registerRpcHeaders(headers)
  const asserted = parseChainAssertion(parsed.strings.get('chain'))
  const budgetArg = parsed.strings.get('budget')
  const budgetMs = budgetArg !== undefined ? parseBudget(budgetArg) : undefined
  const concurrency = parseConcurrency(parsed.strings.get('concurrency'))
  const poolListSpec = parsed.strings.get('pool-list')
  const trustCoverage = parsed.booleans.has('trust-coverage')
  // ARGUMENT MISTAKES ARE DECIDED BEFORE ANYTHING IS SPENT, next to the other two pure parses above.
  // This check used to sit down beside the `applyPoolList` call it is about — after the chain probe,
  // after the full cache load, and after the save was registered — so `--trust-coverage` with no
  // `--pool-list` cost a round trip, a multi-hundred-megabyte snapshot read, and (via the registered
  // save that `rl.ts` flushes in its `finally`) a rewrite of that same snapshot, before printing a
  // one-line complaint about a flag combination that was decidable from `parsed` alone.
  if (trustCoverage && poolListSpec === undefined) {
    throw new UsageError('--trust-coverage only means something with --pool-list <path-or-https-url>')
  }

  // Detect the chain with a short, unretried probe — an unreachable/misconfigured endpoint should
  // be a friendly one-liner in seconds, not viem's full retry ladder ending in a stack.
  const probe = createPublicClient({
    transport: http(rpcUrl, { timeout: 10_000, retryCount: 0, fetchOptions: { headers } }),
  }) as PublicClient
  let chainId: number
  try {
    chainId = await probe.getChainId()
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\n')[0]! : String(err)
    throw new UsageError(
      `the RPC endpoint did not answer eth_chainId — check --rpc/$ETH_RPC_URL (${redactHeaderValues(redactKeyedUrl(message))})`,
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
    transport: http(rpcUrl, { batch: false, timeout, fetchOptions: { headers }, ...(budgetMs !== undefined ? { retryCount: 0 } : {}) }),
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
  // NAMES ONLY, under --verbose, same as everything else `note` reports. The values themselves
  // never reach this line (or any other): they go straight from `resolveRpcHeaders` into the two
  // transports above, and `redactHeaderValues` (registered on them a few lines up) is the backstop
  // for the one path that isn't this file printing on purpose — a value coming back inside an
  // error message from the endpoint it was sent to.
  const headerNames = Object.keys(headers)
  if (headerNames.length > 0) note(`rpc-header: ${headerNames.join(', ')}`)

  let index = fresh
  const cacheOn = cacheEnabled(parsed.booleans)
  if (cacheOn) {
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
  } else {
    note('cache: disabled (--no-cache)')
  }

  // `--pool-list` (phase 1): a published snapshot from somewhere else, merged INTO whatever the
  // cache just restored. It runs after the cache load, and deliberately not instead of it — both are
  // snapshot-shaped and `cli/poolList.ts#hydratePoolList` unions them through the index's own public
  // merge rules, so neither source shadows the other. Coverage is DISCARDED unless
  // `--trust-coverage` says otherwise; see `cli/poolList.ts` for why those two halves have different
  // trust tiers. Any failure here is fatal (exit 4 via `rl.ts`) rather than a note: unlike the cache,
  // a pool list is something the user explicitly asked for, so silently proceeding without it would
  // answer a different question than the one asked.
  if (poolListSpec !== undefined) {
    console.error(dim(await applyPoolList(index, poolListSpec, { chainId, manifest: chain.manifest, trustCoverage })))
  }

  // THE SAVE IS REGISTERED LAST, after every source that contributes to `index` has contributed.
  // Registered at all — rather than at each command's end — so no command can forget it, and flushed
  // by `rl.ts` in a `finally` (and by its signal handler) so a partial, failed, or Ctrl-C'd search
  // still banks the coverage it really learned. It used to be registered above, before the pool list
  // was applied, which was correct only because the list MUTATES the index in place rather than
  // replacing it: the closure and the merge agreed on an object identity nothing stated. Registering
  // after the last writer makes "the save sees everything the run assembled" true by position rather
  // than by that coincidence — and it means a `--pool-list` that fails its checks (exit 4) never
  // registers a save at all.
  if (cacheOn) scheduleCacheSave(async () => note(await saveCache(chain.chainId, index)))

  const router = createRouter({
    client,
    manifest: chain.manifest,
    index,
    // The chain id THIS client just answered, two dozen lines up. Without it `validateManifest` asks
    // the same endpoint the same question again on the first search — one more sequential round trip
    // (~0.9s on a real mainnet endpoint) in front of every single invocation, for an answer already
    // in hand. The cross-check itself is unchanged, and so is the execution-address fingerprint.
    assumeChainId: chainId,
    ...(concurrency !== undefined ? { concurrency } : {}),
  })
  const base = { chain, client, router, index }
  return budgetMs !== undefined ? { ...base, budgetMs } : base
}

/**
 * `--concurrency`, validated against the SDK's own bounds.
 *
 * Worth exposing because the right value is a property of the ENDPOINT, which only the person
 * running the command knows: measured against a keyed mainnet endpoint, 40 in-flight requests beat
 * the default 20 on wall time for the same search, while a stricter shared-quota endpoint wants
 * less. The default stays {@link DEFAULT_CONCURRENCY} — it is the one that fits comfortably under
 * every major public endpoint's connection-pool ceiling.
 */
function parseConcurrency(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!/^\d+$/.test(raw.trim()) || !Number.isInteger(value) || value < 1 || value > MAX_CONCURRENCY) {
    throw new UsageError(`--concurrency '${raw}' must be an integer in [1, ${MAX_CONCURRENCY}] (default: ${DEFAULT_CONCURRENCY})`)
  }
  return value
}

// ---------------------------------------------------------------------------
// `--budget`'s clock.
//
// IT STARTS WHEN THE SEARCH DOES, NOT WHEN THE PROCESS DOES, and that is a
// deliberate correction. The clock used to start inside `buildChainContext`,
// which meant the budget paid for everything BEFORE the search as well as the
// search: the chain-detection probe, the on-disk cache load (a 115 MB mainnet
// snapshot is real seconds), manifest validation, and both tokens' metadata
// reads. Measured on a warm mainnet cache, `--budget 15s` reached the first
// `searchWaves` call at t=16.7s — the search was born aborted and the run
// returned `inconclusive/aborted` having never issued a quote. `--budget`
// names a SEARCH budget in `--help` and in the README, and a bound that can be
// consumed entirely by setup does not mean that.
//
// So the parse stays in `buildChainContext` (it also shapes the transport's
// timeout, which must be decided when the client is built) and only the TIMER
// moves: each command calls {@link startBudget} on the line before it starts
// iterating, which is also the origin its `+Nms` wave lines are measured from.
// Setup latency is still visible — the final panel's elapsed time and
// `--verbose`'s cache line both report it — it is simply no longer charged to
// a budget the user asked to spend on searching.
//
// The signal is deliberately NOT `AbortSignal.timeout(ms)`, which is what it used to
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
// after a fast command finishes, so the caller must clear it — which is why
// {@link startBudget} hands back a `cancel` and every command runs it in a
// `finally`, the error paths included.
//
// THE TIMER IS RETURNED, NOT PARKED IN A MODULE. It used to live in a
// module-level `pendingBudgetTimer` that a module-level `cancelBudget()`
// cleared from `rl.ts`, which made the timer's owner (the command that started
// it) and its canceller (the process's exit path) two different things with a
// mutable global between them: a second `startBudget` overwrote the first
// handle and leaked it, the cancel applied to whichever call happened to be
// last, and tests had to scrub the global in an `afterEach` to stay
// independent. One invocation only ever starts one budget, so nothing was
// observably broken — but the shape said otherwise, and a lifetime that a
// `finally` can express does not need a global to hold it.
//
// THE SDK IS NOT AFFECTED and needs no change: it consumes whatever
// `AbortSignal` it is handed and never manufactures one. This is a fact about
// how a HOST should build the signal, so it belongs in the host.
// ---------------------------------------------------------------------------

/**
 * `--budget`'s live clock: the `AbortSignal` the search carries, and the handle that stops the timer
 * holding the process open once the command is done with it.
 */
export type Budget = {
  /** The search's signal, or `undefined` for an unbudgeted run (see {@link startBudget}). */
  signal: AbortSignal | undefined
  /** Clears the timer. Idempotent, never throws, and a no-op for an unbudgeted run. */
  cancel: () => void
}

/**
 * Starts `--budget`'s clock. `signal` is `undefined` for an unbudgeted run — absence is how the SDK
 * tells a bounded search from an unbounded one, so an unbudgeted run must get no signal at all
 * rather than one that never fires.
 *
 * CALL IT IMMEDIATELY BEFORE THE SEARCH, on the same line as the command's own `started` stamp: the
 * budget is a bound on searching, and everything between this call and the first `eth_call` is what
 * it is spent on. See this section's header for what starting it any earlier cost.
 *
 * CANCEL IT IN A `finally`. The timer is ref'd on purpose (that is the whole fix above), so a
 * command that finishes — or throws — before its budget expires would otherwise hold the runtime
 * open for the remainder of it.
 */
export function startBudget(budgetMs: number | undefined): Budget {
  if (budgetMs === undefined) return { signal: undefined, cancel: () => {} }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), budgetMs)
  return { signal: controller.signal, cancel: () => clearTimeout(timer) }
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
