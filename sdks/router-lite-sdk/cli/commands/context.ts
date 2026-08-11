// ---------------------------------------------------------------------------
// Shared command setup: flags every trade-shaped command takes, and the
// chain → client → router → tokens pipeline they all run before doing
// anything interesting.
//
// The router is built from `../src` DIRECTLY (see `rl.ts`'s header): this is
// a local-testing tool, so it must always exercise the working tree's current
// source, never a possibly-stale `dist/`.
// ---------------------------------------------------------------------------

import { stat } from 'node:fs/promises'

import { createPublicClient, http, type Address, type PublicClient } from 'viem'

// deep import: deliberately unblessed — `DEFAULT_CONCURRENCY`/`MAX_CONCURRENCY` are the SDK's own
// bounds for the option `--concurrency` maps to, imported by relative path so `--help` and the
// flag's validation can never disagree with `createRouter`'s. Plain internal constants with no
// consumer-facing story of their own (unlike `MULTICALL3_ADDRESS`/`MULTICALL3_ABI`, which name a
// real, externally-meaningful deployment), so they stay a deep import rather than joining
// `experimental/index.ts`'s bless list.
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from '../../src/constants'
import { PoolIndex } from '../../src/experimental/index'
import { createRouter, type PoolHint, type QuotedRoute, type Router } from '../../src/index'
import { parseAmount, parseBudget } from '../amounts'
import { dim } from '../ansi'
import { UsageError, type FlagSpec, type ParsedArgs } from '../args'
import { CACHE_FLAGS, cacheEnabled, cachePath, loadCache, saveCache, scheduleCacheSave, summarizeCacheCoverage } from '../cache'
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
import { renderCacheLine, viewKey, type RenderCtx, type TokenView } from '../report'
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
  'log-chunk': { kind: 'string' },
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
  // Restores pool addresses inline on every route line (best and alternatives alike), and
  // suppresses the best route's dim detail line(s) that exist only to hold the address this puts
  // back inline — see `report.ts#describePool`/`renderPoolDetailLines`.
  addresses: { kind: 'boolean' },
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
  const logChunkBlocks = parseLogChunk(parsed.strings.get('log-chunk'))
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

  // `--budget` is a COOPERATIVE bound: the SDK observes its AbortSignal between search cycles, but a
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
  // a lot, because of what this tool's heaviest phase looks like: an adjacency round runs six scans at
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
    // run makes that self-evident. It now also carries what the cache actually KNOWS — pool count,
    // per-protocol coverage, and how stale the file is — computed purely from the loaded snapshot
    // (`summarizeCacheCoverage`; see its header for why that is a proxy for "caught up", not "caught
    // up with the live chain") since the real head is a search's own read, one round trip away.
    //
    // `ageMs` comes from a SEPARATE `stat`, not `loadMs`/`loaded`: neither the load path nor
    // `CacheLoad` carries the file's mtime, and reaching for it is best-effort — a failed `stat`
    // (the file vanished between `loadCache`'s read and this line, a sandboxed FS) simply omits the
    // age rather than failing a command over a cosmetic line.
    let ageMs: number | undefined
    if (loaded.index) {
      try {
        ageMs = Date.now() - (await stat(cachePath(chain.chainId))).mtimeMs
      } catch {
        // best-effort — see above
      }
    }
    const demandFloors = {
      v2: chain.manifest.v2?.deploymentBlock,
      v3: chain.manifest.v3?.deploymentBlock,
      v4: chain.manifest.v4?.deploymentBlock,
    }
    const perProtocol = summarizeCacheCoverage(index.toSnapshot().coverage, demandFloors)
    console.error(
      dim(
        renderCacheLine({
          chainId: chain.chainId,
          pools: index.stats().pools,
          perProtocol,
          loadMs,
          ...(ageMs !== undefined ? { ageMs } : {}),
        }),
      ),
    )
    // The detail (hit/miss, why it was discarded, what was saved, the exact path) stays under
    // --verbose — `cachePath` is still named there so a curious reader can still find the file.
    note(`${loaded.note} (${cachePath(chain.chainId)})`)
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
    ...(logChunkBlocks !== undefined ? { logChunkBlocks } : {}),
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

/**
 * `--log-chunk`, the CLI's knob for `createRouter`'s `logChunkBlocks`: a ceiling override for the
 * `eth_getLogs` window `scanLogs` starts (and regrows toward) on every scan this router issues,
 * instead of letting the scanner discover a provider's cap by bisecting down from its own wide
 * default. Worth exposing for the same reason as `--concurrency` — the right value is a property of
 * the ENDPOINT — but here it is a known CEILING rather than a preference: a provider that caps
 * `eth_getLogs` to a few thousand blocks (Ankr's public endpoint, ~3k) turns every cold scan into a
 * multi-step bisection before the first request succeeds, and pinning the known cap skips the
 * descent entirely.
 *
 * Only shape-validated here (a positive integer, `--log-chunk`'s own usage error, exit 3): the
 * SDK's own floor (`MIN_CHUNK`, currently 128 blocks) is enforced by `createRouter` itself — a
 * value that parses fine here but is too small surfaces as `RouterConfigError`, which exits 3 all
 * the same, and re-stating that floor here would just be a second copy of the SDK's own bound to
 * keep in sync.
 */
function parseLogChunk(raw: string | undefined): bigint | undefined {
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw.trim())) {
    throw new UsageError(`--log-chunk '${raw}' must be a positive integer (number of blocks)`)
  }
  const value = BigInt(raw.trim())
  if (value < 1n) {
    throw new UsageError(`--log-chunk '${raw}' must be a positive integer (number of blocks)`)
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
// search call at t=16.7s — the search was born aborted and the run
// returned `inconclusive/aborted` having never issued a quote. `--budget`
// names a SEARCH budget in `--help` and in the README, and a bound that can be
// consumed entirely by setup does not mean that.
//
// So the parse stays in `buildChainContext` (it also shapes the transport's
// timeout, which must be decided when the client is built) and only the TIMER
// moves: each command calls {@link startBudget} on the line before it starts
// iterating, which is also the origin its `+Nms` timeline lines are measured from.
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
// budgets nothing here ever ran the adjacency scans that keep it that busy.
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

// ---------------------------------------------------------------------------
// The process-wide interrupt (^C).
//
// One module-level controller, aborted exactly once by the FIRST SIGINT/SIGTERM
// (`cli/interrupt.ts`, wired in `rl.ts`). `startBudget` composes it into every
// signal it hands out, so every command's search — budgeted or not — actually
// STOPS when the user interrupts, instead of streaming on while the handler's
// cache flush serializes a multi-hundred-megabyte snapshot behind it. Before
// this existed, ^C on a long `discover` looked like an infinite hang: the
// search kept issuing requests, the flush waited its turn, and a second ^C
// just re-entered the same handler.
//
// An unbudgeted run now gets THIS signal rather than `undefined`. The SDK
// reads signal absence as "unbounded search", but it never branches on
// presence for anything except abort observation (`req.signal?.…` throughout),
// so an inert signal that fires only on ^C means exactly the same thing —
// unbounded until the user says stop — and it is what makes the unbudgeted
// case interruptible at all.
// ---------------------------------------------------------------------------

let interrupt = new AbortController()

/** Aborts the process-wide interrupt signal — the first-^C half of `cli/interrupt.ts`'s contract.
 * Idempotent: aborting an aborted controller is a no-op. */
export function triggerInterrupt(): void {
  interrupt.abort()
}

/** Test seam: swaps in a fresh controller so one test's interrupt cannot leak into the next.
 * Budgets started BEFORE the reset keep the old (composed) signal, exactly like a real process
 * would if it could un-interrupt itself — which it cannot, hence the seam. */
export function resetInterruptForTests(): void {
  interrupt = new AbortController()
}

/**
 * `--budget`'s live clock: the `AbortSignal` the search carries, and the handle that stops the timer
 * holding the process open once the command is done with it.
 */
export type Budget = {
  /** The search's signal: budget timer + interrupt for a budgeted run, the bare interrupt signal
   * (inert until ^C) for an unbudgeted one — see {@link startBudget}. */
  signal: AbortSignal
  /** Clears the timer. Idempotent, never throws, and a no-op for an unbudgeted run. */
  cancel: () => void
}

/**
 * Starts `--budget`'s clock. The returned signal always exists and always composes the process-wide
 * interrupt: for a budgeted run it aborts on whichever fires first (the budget's ref'd timer, or
 * ^C); for an unbudgeted run it IS the interrupt signal — inert until the user interrupts, which
 * to the SDK is indistinguishable from an unbounded search until that moment.
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
  if (budgetMs === undefined) return { signal: interrupt.signal, cancel: () => {} }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), budgetMs)
  return { signal: AbortSignal.any([controller.signal, interrupt.signal]), cancel: () => clearTimeout(timer) }
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

/** Cap for {@link hydrateLegSymbols}: a result panel renders ONE route plus a handful
 * of alternatives, each at most two hops — a dozen distinct leg tokens already covers every token
 * that can appear on screen, and every fetch beyond that is latency the user waits on for nothing. */
const MAX_LEG_METADATA_FETCHES = 12

/**
 * Classifies the search's first (unverified) lead for the "how it went" timeline — `cache` when its
 * leg-0 pool was already known BEFORE this search started, `hint` as a best-effort fallback when the
 * trade carried a `--hint` and the pool was not pre-known, `probe` otherwise.
 *
 * A BEST-EFFORT APPROXIMATION, NAMED AS ONE. Distinguishing "the index already had this exact pool"
 * from "this exact pool is new" is precise — `preExistingDirect` is a snapshot of `index.pair(tokenIn,
 * tokenOut)` taken before the search runs, and pool identity is exact-match. Distinguishing a hint
 * from a fresh speculative probe is NOT: `PoolHint` is an unvalidated, pre-identity shape (no `id` —
 * see `types.ts`), so re-deriving whether THIS SPECIFIC pool matches a given hint would mean
 * reimplementing the SDK's own hint-to-`PoolRef` normalization here, for a line whose entire job is
 * "roughly where did this come from". `hasHints` is the cheaper, honest proxy: a trade run with a
 * `--hint` and a fresh (non-cached) first lead is overwhelmingly that hint confirming itself, and a
 * wrong label here costs a reader one word on an ALREADY-`(unverified)` line, never a wrong quote.
 */
export function classifyLeadOrigin(route: QuotedRoute, preExistingDirect: ReadonlySet<string>, hasHints: boolean): 'cache' | 'hint' | 'probe' {
  const leadPoolId = route.route.legs[0]?.pool.id
  if (leadPoolId !== undefined && preExistingDirect.has(leadPoolId)) return 'cache'
  return hasHints ? 'hint' : 'probe'
}

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
