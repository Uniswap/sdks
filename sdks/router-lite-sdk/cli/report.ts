// ---------------------------------------------------------------------------
// Result + SearchReport rendering — the reason this CLI exists.
//
// The SDK's `SearchReport` is its richest diagnostic (four independent
// completeness axes; see `src/types.ts`), and reading it as raw JSON at a
// terminal is where debugging time actually goes. This module renders it as
// a compact, honest panel:
//
//  - one coverage line per protocol, with a proportional bar for `partial`
//    (denominator: pinned head minus the protocol's demanded floor —
//    `SearchReport.discovery[p].demandFloor`, the deployment block, fixed per
//    protocol so the percentage cannot drift between runs depending on which
//    sub-range happened to get scanned; there is no absolute "total history"
//    denominator that wouldn't mislead more). `coveredRanges` is cumulative
//    index knowledge at search end, not this run's own scan traffic, so a
//    fully-cached protocol that scanned nothing this run still renders full;
//  - quoting stats in the SDK's own invariant form
//    (`attempted = ok + reverted + transport-lost`), because a revert and a
//    429 are different evidence and the report keeps them apart on purpose;
//  - anomaly flags (aborted / head-regressed / verification-degraded /
//    preflight-budget-exhausted) listed only when set — a clean search prints
//    no noise;
//  - every `reason` code paired with its `reasons.ts` explanation.
//
// Everything here is pure (strings in, lines out) so the whole panel is
// snapshot-tested against a canned report with color forced off.
// ---------------------------------------------------------------------------

import { PROTOCOLS } from '../src/index'
import type {
  CurrencyRef,
  ExecutionRequirement,
  PoolRef,
  QuoteResult,
  QuotedRoute,
  RankedRoute,
  Reason,
  SearchReport,
  SwapResult,
} from '../src/index'

import { formatAmount } from './amounts'
import { bar, bold, cyan, dim, green, red, shortHex, yellow } from './ansi'
import { explainReason } from './reasons'


// ---------------------------------------------------------------------------
// Render context: how currencies are shown. Built by the command layer from
// whatever it has resolved; anything unknown falls back to a shortened
// address, never a crash and never a fabricated number of decimals.
// ---------------------------------------------------------------------------

export type TokenView = { symbol: string; decimals: number }

export type RenderCtx = {
  /** Key: `'native'` or a LOWERCASED address. */
  views: Map<string, TokenView>
}

export function viewKey(ref: CurrencyRef): string {
  return ref === 'native' ? 'native' : ref.toLowerCase()
}

export function symbolFor(ctx: RenderCtx, ref: CurrencyRef): string {
  return ctx.views.get(viewKey(ref))?.symbol ?? (ref === 'native' ? 'native' : shortHex(ref))
}

/** Formatted amount with symbol; falls back to raw units (marked as such) when decimals are unknown. */
export function amountFor(ctx: RenderCtx, ref: CurrencyRef, amount: bigint): string {
  const view = ctx.views.get(viewKey(ref))
  if (!view) return `${amount} raw ${symbolFor(ctx, ref)}`
  return `${formatAmount(amount, view.decimals)} ${view.symbol}`
}

// ---------------------------------------------------------------------------
// Pools and routes
// ---------------------------------------------------------------------------

/** `fee` in the protocols' native millionths: 500 → `0.05%`, 3000 → `0.3%`. */
export function formatFee(fee: number): string {
  const pct = fee / 10_000
  return `${Number(pct.toFixed(4))}%`
}

export function describePool(pool: PoolRef): string {
  switch (pool.protocol) {
    case 'v2':
      return `v2 ${shortHex(pool.address)}`
    case 'v3':
      return `v3 ${formatFee(pool.fee)} ${shortHex(pool.address)}`
    case 'v4': {
      const hooked = pool.poolKey.hooks !== '0x0000000000000000000000000000000000000000'
      const hooks = hooked ? ` hooks ${shortHex(pool.poolKey.hooks)}` : ''
      // 0x800000 is v4's dynamic-fee sentinel, not a real 838.8608% tier — the hook sets the fee.
      const fee = pool.poolKey.fee === 0x800000 ? 'dynamic' : formatFee(pool.poolKey.fee)
      return `v4 ${fee}/${pool.poolKey.tickSpacing} ${shortHex(pool.poolId)}${hooks}`
    }
  }
}

/** `ETH ─(v3 0.05% 0xE055…6640)→ USDC`, chaining through intermediates for two-hop routes. */
export function renderRoute(route: QuotedRoute['route'], ctx: RenderCtx): string {
  const parts: string[] = []
  for (const [i, leg] of route.legs.entries()) {
    if (i === 0) parts.push(bold(symbolFor(ctx, leg.currencyIn)))
    parts.push(dim(`─(${describePool(leg.pool)})→`))
    parts.push(bold(symbolFor(ctx, leg.currencyOut)))
  }
  return parts.join(' ')
}

/**
 * The quoter's gas figure, dimmed, as a route line's trailing note — `~90k gas`, or nothing at all
 * when the route has none (every v2 route, and any two-segment route with a v2 leg; see
 * `RouteQuote.gasEstimate`).
 *
 * ROUNDED ON PURPOSE, AND ROUNDED HARD. The underlying word is envelope-dependent to a few percent
 * (measured: −7.2% for a v3 quote aggregated behind another call to the same pool), so printing
 * `90,012 gas` would spend six digits of precision on a number that does not have six digits of
 * meaning. Three significant figures is what the reader can actually use: which routes are cheap,
 * which are two-hop expensive, and roughly by how much.
 */
function gasNote(route: QuotedRoute | RankedRoute): string {
  const gas = route.quote.gasEstimate
  if (gas === undefined) return ''
  const n = Number(gas)
  const label = n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}k` : `${n}`
  return ` ${dim(`~${label} gas`)}`
}

const EXECUTION_BADGE: Record<RankedRoute['execution'], (s: string) => string> = {
  verified: green,
  'needs-action': yellow,
  unverified: dim,
  failed: red,
}

function executionBadge(route: RankedRoute): string {
  const marks: string[] = [EXECUTION_BADGE[route.execution](route.execution)]
  if (route.revertData) marks.push(dim(`revert ${shortHex(route.revertData)}`))
  if (route.promotedOverComplex) marks.push(cyan('promoted-over-complex'))
  return marks.join(' ')
}

/**
 * The line that explains a leader priced BELOW one of its own alternatives.
 *
 * `rankRoutes`' simplicity margin (`SIMPLICITY_MARGIN_BPS`, 5 bps) is the only thing in the SDK that
 * can produce that ordering, and the route it promoted says so (`promotedOverComplex`). The panel
 * used to print neither: `renderQuoteResult`'s best line carried no badge at all — unlike
 * `renderSwapResult`'s, which has always had one — so a live Base quote showed 1,906.256081 USDC
 * leading a listed 1,906.567949 from a hooked v4 pool with nothing to read it by. Empty for the
 * ordinary case (no promotion, or a promoted route that also happens to be the highest-priced one),
 * so a clean quote gains no noise.
 */
function promotionNote(best: QuotedRoute | RankedRoute, alternatives: (QuotedRoute | RankedRoute)[], out: CurrencyRef, ctx: RenderCtx): string[] {
  if (!best.promotedOverComplex) return []
  const outpriced = alternatives.reduce<QuotedRoute | RankedRoute | undefined>(
    (top, alt) => (alt.quote.amountOut > best.quote.amountOut && (!top || alt.quote.amountOut > top.quote.amountOut) ? alt : top),
    undefined,
  )
  const label = cyan('promoted-over-complex')
  if (!outpriced) return [`  ${label} ${dim('— kept ahead of a hooked/mixed-protocol route inside the simplicity margin')}`]
  const delta = outpriced.quote.amountOut - best.quote.amountOut
  // The margin is reported as the bps ACTUALLY given up, not as the constant that allowed it: the
  // constant is a bound the reader would still have to compare against, and this is the comparison.
  const bps = Number((delta * 10_000_000n) / outpriced.quote.amountOut) / 1000
  return [
    `  ${label} ${dim(`— a hooked/mixed-protocol route quoted ${amountFor(ctx, out, outpriced.quote.amountOut)}`)}`,
    dim(`  giving up ${amountFor(ctx, out, delta)} (${bps} bps) to stay on a simple route — see alternatives below`),
  ]
}

function isRanked(route: QuotedRoute | RankedRoute): route is RankedRoute {
  return 'execution' in route
}

function renderAlternatives(alternatives: (QuotedRoute | RankedRoute)[], out: CurrencyRef, ctx: RenderCtx): string[] {
  if (alternatives.length === 0) return []
  const lines = [dim(`alternatives (${alternatives.length})`)]
  const shown = alternatives.slice(0, 5)
  for (const alt of shown) {
    const badge = isRanked(alt) ? `  ${executionBadge(alt)}` : ''
    lines.push(`  ${amountFor(ctx, out, alt.quote.amountOut)}  ${renderRoute(alt.route, ctx)}${gasNote(alt)}${badge}`)
  }
  if (alternatives.length > shown.length) lines.push(dim(`  … and ${alternatives.length - shown.length} more`))
  return lines
}

// ---------------------------------------------------------------------------
// SearchReport panel
// ---------------------------------------------------------------------------

function coverageLine(status: SearchReport['discovery'][keyof SearchReport['discovery']], head: bigint): string {
  switch (status.status) {
    case 'complete':
      return `${green(bar(1))} ${green('complete')}`
    case 'disabled':
      return `${dim(bar(0))} ${dim('disabled (no bundle in manifest)')}`
    case 'failed':
      return `${red(bar(0))} ${red('failed — no coverage claimed')}`
    case 'partial': {
      const { coveredRanges: ranges, demandFloor } = status
      // The denominator is the DEMANDED floor (the protocol's deployment block), never
      // `min(coveredRanges)` — that would make the percentage self-referential to whichever
      // sub-range this run happened to scan, drifting between otherwise-identical runs as the cache
      // warms. `demandFloor` is fixed per protocol, so this fraction is stable and can only grow
      // across searches that share a cache.
      if (ranges.length === 0) return `${yellow(bar(0))} ${yellow(`partial — nothing covered yet since #${demandFloor}`)}`
      const covered = ranges.reduce((sum, r) => sum + (r.toBlock - r.fromBlock + 1n), 0n)
      const span = head - demandFloor + 1n
      const fraction = span > 0n ? Number((covered * 1000n) / span) / 1000 : 0
      const pct = (fraction * 100).toFixed(1)
      return `${yellow(bar(fraction))} ${yellow(`partial — ${pct}% of blocks since #${demandFloor} (${ranges.length} range${ranges.length === 1 ? '' : 's'})`)}`
    }
  }
}

function isoUtc(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** The full diagnostics panel for one search — see the module header for the layout rationale. */
export function renderSearchReport(report: SearchReport): string[] {
  const lines: string[] = []
  lines.push(bold('search report'))
  lines.push(
    `  block         #${report.block.number} ${dim(shortHex(report.block.hash))} ${dim(isoUtc(report.block.timestamp))}`,
  )

  for (const protocol of PROTOCOLS) {
    const label = protocol === 'v2' ? 'discovery  v2' : `           ${protocol}`
    lines.push(`  ${label} ${coverageLine(report.discovery[protocol], report.block.number)}`)
  }

  const e = report.enumeration
  const exhaustive = e.exhaustiveWithinMaxHops ? green('exhaustive within 2 hops') : yellow('not exhaustive')
  lines.push(
    `  enumeration   ${e.candidatesGenerated} candidates · ${e.intermediatesSelected}/${e.intermediatesDiscovered} intermediates · ${exhaustive}`,
  )
  if (e.poolsPruned + e.candidatesPruned + e.intermediatesPruned > 0) {
    lines.push(
      dim(`                pruned: ${e.poolsPruned} pools, ${e.intermediatesPruned} intermediates, ${e.candidatesPruned} candidates`),
    )
  }

  const q = report.quoting
  const reverted = q.failed > 0 ? yellow(`${q.failed} reverted`) : `${q.failed} reverted`
  const lost = q.transportFailed > 0 ? red(`${q.transportFailed} transport-lost`) : `${q.transportFailed} transport-lost`
  const unattempted = q.unattempted > 0 ? yellow(`· ${q.unattempted} never attempted`) : ''
  lines.push(`  quoting       ${q.attempted} attempted = ${green(`${q.succeeded} ok`)} + ${reverted} + ${lost} ${unattempted}`.trimEnd())

  const v = report.verification
  lines.push(`  verification  ${v.preflightAttempted} preflight simulation${v.preflightAttempted === 1 ? '' : 's'}`)

  const flags: string[] = []
  if (report.aborted) flags.push(red('aborted'))
  if (report.headRegressed) flags.push(red('head-regressed'))
  if (report.verificationDegraded) flags.push(red('verification-degraded'))
  if (v.preflightBudgetExhausted) flags.push(yellow('preflight-budget-exhausted'))
  if (flags.length > 0) lines.push(`  flags         ${flags.join(' · ')}`)

  return lines
}

// ---------------------------------------------------------------------------
// Full results
// ---------------------------------------------------------------------------

/**
 * Every status either result union can carry — the CLI's own name for the closed set, derived from
 * the SDK's types rather than restated as strings.
 *
 * The two tables below are `Record<Status, …>`, not `Record<string, …>`, and that is the whole
 * point: a new status added to `QuoteResult`/`SwapResult` upstream becomes a COMPILE ERROR here
 * (a missing key), instead of a silent `?? '·'` fallback rendering an uncolored bullet next to a
 * verdict nobody taught this CLI to explain. With the tables total, the fallbacks are unreachable
 * and are gone.
 */
type Status = QuoteResult['status'] | SwapResult['status']

const STATUS_HEADER: Record<Status, (s: string) => string> = {
  quote: green,
  ready: green,
  'needs-action': yellow,
  'no-route': red,
  inconclusive: yellow,
}

const STATUS_GLYPH: Record<Status, string> = {
  quote: '✔',
  ready: '✔',
  'needs-action': '●',
  'no-route': '✖',
  inconclusive: '◐',
}

function header(status: Status, summary: string, elapsedMs?: number): string {
  const elapsed = elapsedMs !== undefined ? dim(`  (${elapsedMs}ms)`) : ''
  return `${STATUS_HEADER[status](`${STATUS_GLYPH[status]} ${status}`)}  ${summary}${elapsed}`
}

function renderReason(reason: Reason): string[] {
  return [`${bold('reason')} ${reason.code} — ${reason.detail}`, dim(`  ${explainReason(reason.code)}`)]
}

function renderRequirement(req: ExecutionRequirement, ctx: RenderCtx): string {
  switch (req.kind) {
    case 'erc20-approval':
      return `approve ${symbolFor(ctx, req.token)} to Permit2 ${shortHex(req.spender)} for ≥ ${amountFor(ctx, req.token, req.minimumAmount)}`
    case 'permit2-allowance':
      return `set Permit2 allowance ${symbolFor(ctx, req.token)} → ${shortHex(req.spender)} for ≥ ${amountFor(ctx, req.token, req.minimumAmount)}`
    case 'insufficient-balance':
      return `insufficient balance: need ${amountFor(ctx, req.token, req.required)}, have ${amountFor(ctx, req.token, req.available)}`
  }
}

export type TradeContext = { tokenIn: CurrencyRef; tokenOut: CurrencyRef; amountIn: bigint }

export function renderQuoteResult(result: QuoteResult, trade: TradeContext, ctx: RenderCtx, elapsedMs?: number): string[] {
  const lines: string[] = []
  const pair = `${amountFor(ctx, trade.tokenIn, trade.amountIn)} → ${symbolFor(ctx, trade.tokenOut)}`

  if (result.status === 'quote') {
    lines.push(header('quote', `${pair}: ${bold(amountFor(ctx, trade.tokenOut, result.best.quote.amountOut))}`, elapsedMs))
    lines.push(`  ${renderRoute(result.best.route, ctx)}${gasNote(result.best)}`)
    lines.push(...promotionNote(result.best, result.alternatives, trade.tokenOut, ctx))
  } else {
    // No "best so far" panel on the quote side, unlike `renderSwapResult` below. A quote with a
    // leader is reported `status: 'quote'` however incomplete the search that found it (`types.ts`
    // spells out the asymmetry), so `inconclusive` here means nothing priced — there has never been
    // a leader to render, and the branch that tried to render one was unreachable.
    lines.push(header(result.status, pair, elapsedMs))
    lines.push(...renderReason(result.reason))
  }

  lines.push(...renderAlternatives(result.alternatives, trade.tokenOut, ctx))
  lines.push('')
  lines.push(...renderSearchReport(result.search))
  return lines
}

export function renderSwapResult(result: SwapResult, trade: TradeContext, ctx: RenderCtx, elapsedMs?: number): string[] {
  const lines: string[] = []
  const pair = `${amountFor(ctx, trade.tokenIn, trade.amountIn)} → ${symbolFor(ctx, trade.tokenOut)}`

  if (result.status === 'ready' || result.status === 'needs-action') {
    lines.push(header(result.status, `${pair}: ${bold(amountFor(ctx, trade.tokenOut, result.best.quote.amountOut))}`, elapsedMs))
    lines.push(`  ${renderRoute(result.best.route, ctx)}${gasNote(result.best)}  ${executionBadge(result.best)}`)
    lines.push(...promotionNote(result.best, result.alternatives, trade.tokenOut, ctx))
    if (result.status === 'needs-action') {
      lines.push(bold('before sending:'))
      for (const req of result.requirements) lines.push(`  • ${renderRequirement(req, ctx)}`)
    }
    lines.push(bold('tx'))
    lines.push(`  to    ${result.tx.to}`)
    lines.push(`  value ${amountFor(ctx, 'native', result.tx.value)}`)
    lines.push(`  data  ${dim(result.tx.data)}`)
    lines.push(
      `${bold('limits')} minAmountOut ${amountFor(ctx, trade.tokenOut, result.limits.minAmountOut)} · deadline ${isoUtc(result.limits.deadline)}`,
    )
  } else {
    lines.push(header(result.status, pair, elapsedMs))
    lines.push(...renderReason(result.reason))
    if (result.status === 'inconclusive' && result.best) {
      lines.push(
        `${bold('best so far')} ${amountFor(ctx, trade.tokenOut, result.best.quote.amountOut)} ${dim('(unverified — search was cut short)')}`,
      )
      lines.push(`  ${renderRoute(result.best.route, ctx)}${gasNote(result.best)}  ${executionBadge(result.best)}`)
      lines.push(...promotionNote(result.best, result.alternatives, trade.tokenOut, ctx))
      if (result.tx) lines.push(dim(`  unverified tx available — rerun with a bigger --budget to verify, or use --json to extract it`))
    }
  }

  lines.push(...renderAlternatives(result.alternatives, trade.tokenOut, ctx))
  lines.push('')
  lines.push(...renderSearchReport(result.search))
  return lines
}

/**
 * The `first` line: the moment the search HAS a price, which lands before wave 0a yields
 * (`src/router.ts#IterateOptions.onFirstRoute`).
 *
 * Shaped like a wave line on purpose — same columns, same `+Nms` origin — so the stream reads as one
 * timeline rather than two. It carries no `[n/m quoted]` counters and no improvement marker, because
 * neither exists yet: this fires from inside the engine, before any `SearchReport` has been built,
 * and there is nothing before it to have improved on.
 *
 * INTERMEDIATE SYMBOLS MAY RENDER AS SHORTENED ADDRESSES here and resolve properly on the wave line
 * that follows. Filling them in means an `eth_call` per unknown token — a round trip, which is the
 * entire quantity this line exists to save. A hex leg for a few hundred milliseconds is the right
 * trade; blocking the fast line on metadata would defeat it.
 */
export function renderFirstRouteLine(elapsedMs: number, route: QuotedRoute, trade: TradeContext, ctx: RenderCtx): string {
  const amount = amountFor(ctx, trade.tokenOut, route.quote.amountOut)
  const promoted = route.promotedOverComplex ? ` ${cyan('promoted')}` : ''
  return `${dim('first ')}  ${dim(`+${elapsedMs}ms`)}  ${bold(amount)}  ${renderRoute(route.route, ctx)}${promoted} ${dim('[unverified lead]')}`
}

/**
 * One line per search wave for `--watch`/`--verbose`: wave number, elapsed time, the improving
 * best, and the two counters that move between waves. `▲` marks a wave that improved the output.
 */
export function renderWaveLine(
  wave: number,
  elapsedMs: number,
  result: QuoteResult | SwapResult,
  trade: TradeContext,
  ctx: RenderCtx,
  previousBest: bigint | undefined,
): string {
  const best = 'best' in result && result.best ? result.best : undefined
  const q = result.search.quoting
  const stats = dim(`[${q.succeeded}/${q.attempted} quoted]`)
  if (!best) return `${dim(`wave ${wave}`)}  ${dim(`+${elapsedMs}ms`)}  ${dim('no route yet')} ${stats}`
  const improved = previousBest === undefined || best.quote.amountOut > previousBest
  const marker = improved ? green('▲') : dim('=')
  const amount = amountFor(ctx, trade.tokenOut, best.quote.amountOut)
  // A wave whose leader only leads because of the simplicity margin says so here too, compactly. The
  // full explanation (what was given up, and to whom) belongs to the panel at the end; what this line
  // owes a `--watch` reader is that the number in front of them is not simply the highest one found.
  const promoted = best.promotedOverComplex ? ` ${cyan('promoted')}` : ''
  return `${dim(`wave ${wave}`)}  ${dim(`+${elapsedMs}ms`)}  ${marker} ${improved ? bold(amount) : amount}  ${renderRoute(best.route, ctx)}${promoted} ${stats}`
}

// ---------------------------------------------------------------------------
// JSON output + exit codes
// ---------------------------------------------------------------------------

/** `JSON.stringify` with bigints as decimal strings — every result type carries them. */
export function jsonify(value: unknown, pretty = true): string {
  return JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), pretty ? 2 : undefined)
}

/**
 * Scripting contract (documented in the README): 0 = actionable (quote/ready/needs-action),
 * 1 = no-route, 2 = inconclusive. Config/usage errors exit 3 (set by `rl.ts`).
 */
export function exitCodeFor(status: QuoteResult['status'] | SwapResult['status']): number {
  switch (status) {
    case 'quote':
    case 'ready':
    case 'needs-action':
      return 0
    case 'no-route':
      return 1
    case 'inconclusive':
      return 2
  }
}
