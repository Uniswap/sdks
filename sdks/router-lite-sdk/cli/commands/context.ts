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
import { CACHE_FLAGS, cacheEnabled, loadCache, saveCache, scheduleCacheSave } from '../cache'
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
  const client = createPublicClient({
    transport: http(rpcUrl, { batch: true, timeout, ...(budgetMs !== undefined ? { retryCount: 0 } : {}) }),
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
  // Cache notes go to STDERR, and only under `--verbose`: `--json` output must stay machine-clean on
  // stdout no matter what the cache did, and "why did this run scan from scratch?" must never be a
  // mystery when someone asks. A silent cache is one a user cannot tell from a broken one.
  const verbose = parsed.booleans.has('verbose')
  const note = (line: string): void => {
    if (verbose) console.error(dim(line))
  }

  let index = fresh
  if (cacheEnabled(parsed.booleans)) {
    const loaded = await loadCache(chain.chainId, fresh)
    note(loaded.note)
    if (loaded.index) index = loaded.index
    // Registered here rather than at each command's end so no command can forget it, and flushed by
    // `rl.ts` in a `finally` so a partial or failed search still banks the coverage it really learned.
    scheduleCacheSave(async () => note(await saveCache(chain.chainId, index)))
  } else {
    note('cache: disabled (--no-cache)')
  }

  const router = createRouter({ client, manifest: chain.manifest, index })
  const base = { chain, client, router, index }
  return budgetMs !== undefined ? { ...base, signal: AbortSignal.timeout(budgetMs) } : base
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

/** Cap on how many unknown route-leg tokens {@link hydrateLegSymbols} will fetch metadata for. */
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
  const targets = [...unknown].slice(0, MAX_LEG_METADATA_FETCHES)
  const metas = await Promise.allSettled(targets.map((addr) => fetchTokenMeta(ctx.client, ctx.chain.chainId, addr)))
  for (const meta of metas) {
    if (meta.status !== 'fulfilled' || meta.value.ref === 'native') continue
    renderCtx.views.set(viewKey(meta.value.ref), { symbol: meta.value.symbol, decimals: meta.value.decimals })
  }
}
