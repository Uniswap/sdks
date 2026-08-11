// ---------------------------------------------------------------------------
// `rl discover <token>` — what pools does the SDK actually see for a token?
//
// Mechanism: the CLI always injects its own `PoolIndex` into the router
// (`context.ts`), so this command runs one full bounded search (token → a
// counterparty, which is what puts the token's own neighborhood on the
// search's coverage demand) and then reads the index back: every pool
// discovery proved, probed, or was hinted into existence, per protocol, with
// each pool's provenance (`event`/`factory`/`hint`) and quote history —
// including hints the chain has discredited. This answers the question a
// `no-route` alone can't: "is my pool invisible, or visible and failing?"
// ---------------------------------------------------------------------------

import type { Address } from 'viem'

import { blockTimeSecondsOf, isDiscredited, sameFamily } from '../../src/experimental/index'
import { PROTOCOLS } from '../../src/index'
import type { CurrencyRef, PoolRecord, Protocol, QuoteResult } from '../../src/index'
import { bold, cyan, dim, green, red, shortHex, yellow } from '../ansi'
import { parseArgs, UsageError } from '../args'
import { describePool, jsonify, renderConfidencePanel, viewKey, type RenderCtx, type TokenView } from '../report'
import { fetchTokenMeta, resolveToken, type ResolvedToken } from '../tokens'

import { buildChainContext, COMMON_FLAGS, hydrateViews, startBudget, type ChainContext } from './context'

const DISCOVER_FLAGS = {
  ...COMMON_FLAGS,
  via: { kind: 'string' as const },
}

export async function cmdDiscover(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, DISCOVER_FLAGS)
  const [tokenArg] = parsed.positionals
  if (!tokenArg) throw new UsageError('expected: <token> — e.g. `rl discover 0xTOKEN --chain base`')

  const ctx = await buildChainContext(parsed)
  const token = await resolveToken(ctx.client, ctx.chain.manifest, tokenArg)
  const via = await resolveCounterparty(ctx, token, parsed.strings.get('via'))
  const json = parsed.booleans.has('json')
  // `--budget` bounds the search, so its clock starts here — after chain detection, the cache load
  // and both tokens' metadata reads, none of which this command's budget is meant to pay for.
  const budget = startBudget(ctx.budgetMs)
  const signal = budget.signal
  // The budget's timer is REF'D on purpose (see `context.ts`), so it is cleared here on every exit
  // path — a command that finishes, or throws, before its budget expires must not hold the process
  // open for the remainder of it.
  try {
    // One unit of the token is enough to drive discovery; the amount only shapes quotes, not coverage.
    const request = {
      tokenIn: token.ref,
      tokenOut: via.ref,
      amountIn: 10n ** BigInt(token.decimals),
      ...(signal ? { signal } : {}),
    }

    let final: QuoteResult | undefined
    // Every event, to the end of the bounded search — this command wants the INDEX the search fills,
    // not its answer, so it never stops early. `--verbose` narrates each event with the two numbers
    // that actually move here: legs settled and pools learned.
    for await (const event of ctx.router.quotes(request)) {
      const search = event.type === 'progress' ? event.search : event.result.search
      if (event.type !== 'progress') final = event.result
      if (!json && parsed.booleans.has('verbose')) {
        console.log(
          dim(`${event.type}: ${search.quoting.succeeded}/${search.enumeration.legsMeasured} legs priced, ${ctx.index.stats().pools} pools indexed`),
        )
      }
    }

    const neighbors = ctx.index.neighbors(token.ref)
    const records = [...neighbors.values()].flat()
    const byProtocol = new Map<Protocol, PoolRecord[]>()
    for (const p of PROTOCOLS) byProtocol.set(p, [])
    for (const rec of records) byProtocol.get(rec.pool.protocol)!.push(rec)

    if (json) {
      console.log(
        jsonify({
          token: { ref: token.ref, symbol: token.symbol },
          counterparty: { ref: via.ref, symbol: via.symbol },
          pools: records.map((rec) => ({ ...rec, discredited: isDiscredited(rec) })),
          stats: ctx.router.stats(),
          search: final?.search,
        }),
      )
      return 0
    }

    const wrappedNative = ctx.chain.manifest.wrappedNative
    const renderCtx = await counterpartyViews(ctx, token, records)
    console.log(bold(`pools seen for ${token.symbol} on ${ctx.chain.label} (${records.length} total)`))
    for (const p of PROTOCOLS) {
      const recs = byProtocol.get(p)!
      console.log(`  ${bold(p)} ${dim(`(${recs.length})`)}`)
      const shown = recs.slice(0, 50)
      for (const rec of shown) console.log(`    ${renderRecord(rec, token, renderCtx, wrappedNative)}`)
      if (recs.length > shown.length) console.log(dim(`    … and ${recs.length - shown.length} more`))
    }

    const stats = ctx.router.stats()
    console.log('')
    console.log(dim(`index: ${stats.pools} pools · ${stats.adjacencyEdges} adjacency edges · ${stats.coverageScopes} coverage scopes`))
    if (final) {
      console.log('')
      console.log(
        renderConfidencePanel(final.search, {
          mode: 'quote',
          blockTimeSeconds: blockTimeSecondsOf(ctx.chain.manifest),
          ...(ctx.budgetMs !== undefined ? { budgetMs: ctx.budgetMs } : {}),
        }).join('\n'),
      )
    }
    return 0
  } finally {
    budget.cancel()
  }
}

/**
 * `--via`, or the first core intermediate outside the token's own family.
 *
 * Native and wrapped-native are ONE graph family (the SDK's `sameFamily`, shared rather than
 * mirrored here), so discover never routes a token "against itself" and never mislabels a WETH pool
 * as a counterparty of ETH.
 */
async function resolveCounterparty(ctx: ChainContext, token: ResolvedToken, viaArg: string | undefined): Promise<ResolvedToken> {
  const wrappedNative = ctx.chain.manifest.wrappedNative
  if (viaArg) {
    const via = await resolveToken(ctx.client, ctx.chain.manifest, viaArg)
    if (sameFamily(via.ref, token.ref, wrappedNative)) {
      throw new UsageError(`--via ${viaArg} is the same currency family as the token`)
    }
    return via
  }
  if (!sameFamily(token.ref, 'native', wrappedNative)) return { ref: 'native', symbol: 'ETH', decimals: 18 }
  for (const addr of ctx.chain.manifest.coreIntermediates ?? []) {
    if (!sameFamily(addr, 'native', wrappedNative)) return fetchTokenMeta(ctx.client, ctx.chain.chainId, addr)
  }
  throw new UsageError('no default counterparty for the native family on this chain — pass --via <token>')
}

/** Cap for {@link counterpartyViews}: this command's whole output is a counterparty column, up to 50
 * rows PER PROTOCOL — an order of magnitude more distinct tokens on screen at once than a quote/swap
 * panel's route legs, which is why it fetches an order of magnitude more of them than
 * `hydrateLegSymbols` does. Addresses past the cap render as shortened hex. */
const MAX_COUNTERPARTY_METADATA_FETCHES = 40

/** Best-effort symbols for the counterparty side of every pool (bounded fetch, addresses beyond it). */
async function counterpartyViews(ctx: ChainContext, token: ResolvedToken, records: PoolRecord[]): Promise<RenderCtx> {
  const views = new Map<string, TokenView>()
  views.set('native', { symbol: 'ETH', decimals: 18 })
  views.set(viewKey(token.ref), { symbol: token.symbol, decimals: token.decimals })
  const renderCtx: RenderCtx = { views }
  const unknown = new Set<Address>()
  for (const rec of records) {
    const other = counterpartOf(rec, token, ctx.chain.manifest.wrappedNative)
    if (other !== 'native' && !views.has(viewKey(other))) unknown.add(other)
  }
  await hydrateViews(ctx, renderCtx, unknown, MAX_COUNTERPARTY_METADATA_FETCHES)
  return renderCtx
}

/**
 * The side of the pool that ISN'T the queried token — by currency FAMILY, never by exact identity.
 *
 * The distinction is the whole command's honesty: querying `eth` and finding a WETH/USDT pool, an
 * identity test ("which currency differs from `native`?") answers with whichever side the pool sorted
 * first, so half of a native query's rows named WETH — the queried token itself — as their own
 * counterparty. `sameFamily` is what the SDK's graph normalizes on, so it is what this reads by.
 */
function counterpartOf(rec: PoolRecord, token: ResolvedToken, wrappedNative: Address): CurrencyRef {
  const [a, b] = rec.pool.currencies
  return sameFamily(a, token.ref, wrappedNative) ? b : a
}

/** One pool's row. Exported for the counterparty regression test — a pure string, given a record. */
export function renderRecord(rec: PoolRecord, token: ResolvedToken, renderCtx: RenderCtx, wrappedNative: Address): string {
  const other = counterpartOf(rec, token, wrappedNative)
  const otherView = renderCtx.views.get(viewKey(other))
  const counterpart = otherView?.symbol ?? (other === 'native' ? 'native' : shortHex(other))
  const provenance = rec.source === 'hint' ? cyan('hint') : dim(rec.source)
  const created = rec.createdAtBlock !== undefined ? dim(`created #${rec.createdAtBlock}`) : ''
  const quoteMark =
    rec.lastQuoteSuccessBlock !== undefined
      ? green(`✔ quoted #${rec.lastQuoteSuccessBlock}`)
      : isDiscredited(rec)
        ? red(`✖ discredited (${rec.quoteFailureBlocks} failed blocks)`)
        : (rec.quoteFailureBlocks ?? 0) > 0
          ? yellow(`${rec.quoteFailureBlocks} failed block(s)`)
          : dim('never quoted')
  // `discover` exists to answer "which pools does the SDK see" — the address IS the answer here,
  // unlike a route line where it is demoted detail, so this always renders it inline.
  return [describePool(rec.pool, { addresses: true }), `↔ ${counterpart}`, provenance, created, quoteMark].filter(Boolean).join('  ')
}
