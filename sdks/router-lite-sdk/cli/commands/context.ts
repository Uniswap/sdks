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
import { UsageError, type FlagSpec, type ParsedArgs } from '../args'
import { clientTimeoutMs, resolveChain, type ResolvedChain } from '../chains'
import { parseHint } from '../hints'
import { viewKey, type RenderCtx, type TokenView } from '../report'
import { fetchTokenMeta, resolveToken, type ResolvedToken } from '../tokens'

/** Flags shared by every command that talks to a chain. */
export const COMMON_FLAGS: FlagSpec = {
  chain: { kind: 'string', alias: 'c' },
  rpc: { kind: 'string' },
  json: { kind: 'boolean' },
  budget: { kind: 'string', alias: 'b' },
  verbose: { kind: 'boolean', alias: 'v' },
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
 * Chain + client + router for `parsed`'s common flags. The router always gets a CLI-owned
 * `PoolIndex` injected (constructed to match the manifest, as `createRouter` requires) so commands
 * that want to inspect what a search learned — `discover` — can read it back afterwards.
 */
export function buildChainContext(parsed: ParsedArgs): ChainContext {
  const chain = resolveChain(parsed.strings.get('chain'), parsed.strings.get('rpc'))
  const budgetArg = parsed.strings.get('budget')
  const budgetMs = budgetArg !== undefined ? parseBudget(budgetArg) : undefined
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
    transport: http(chain.rpcUrl, { batch: true, timeout, ...(budgetMs !== undefined ? { retryCount: 0 } : {}) }),
  }) as PublicClient
  const index = new PoolIndex(chain.manifest.wrappedNative, {
    reorgOverlapBlocks: chain.manifest.chain?.reorgOverlapBlocks,
  })
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
