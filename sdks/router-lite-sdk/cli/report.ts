// ---------------------------------------------------------------------------
// Result + SearchReport rendering — the reason this CLI exists.
//
// The page reads as a STORY, in this order:
//   1. the answer (headline: amount out, implied price when it's informative)
//   2. the route, as a path — no addresses inline; the leading route's own
//      pool address(es) demoted to a dim detail line beneath it (`--addresses`
//      restores them inline everywhere, alternatives included)
//   3. "how it went" — a short timeline: the first (unverified) lead, the
//      wave that confirmed it on-chain, then whatever later waves changed
//   4. "runners-up" — the alternatives as a delta table (Δ amount + Δ bps
//      vs. the best, aligned columns)
//   5. "confidence" — the SDK's `SearchReport` (four independent completeness
//      axes; see `src/types.ts`), reworded so each axis reads as a plain
//      sentence instead of a field dump
//
// Everything here is pure (strings in, lines out) so the whole page is
// snapshot-tested against canned data with color forced off. The command
// layer (`commands/quote.ts`/`swap.ts`) owns the only two things a pure
// renderer cannot know on its own: whether an abort came from ITS OWN
// `--budget` timer (vs. an external signal), and the per-wave timestamps
// that make the timeline retrospectively renderable even outside `--watch`.
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

import { adaptiveFractionDigits, formatAmount, formatFixed } from './amounts'
import { bar, bold, cyan, dim, green, padEndVisible, red, shortHex, yellow } from './ansi'
import { abbreviateBlock, approxMonthYear, groupThousands, humanizeAge, humanizeDuration } from './format'
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

/** `amountFor`, but a non-negative delta is given an explicit `+` — for "what this gave up/gained"
 * lines (the runners-up table, the timeline's "found a better route" note) where the sign IS the
 * information; `amountFor` alone only ever marks a negative one. */
function signedAmountFor(ctx: RenderCtx, ref: CurrencyRef, delta: bigint): string {
  const rendered = amountFor(ctx, ref, delta)
  return delta >= 0n && !rendered.startsWith('-') ? `+${rendered}` : rendered
}

// ---------------------------------------------------------------------------
// Pools and routes
// ---------------------------------------------------------------------------

/** `fee` in the protocols' native millionths: 500 → `0.05%`, 3000 → `0.3%`. */
export function formatFee(fee: number): string {
  const pct = fee / 10_000
  return `${Number(pct.toFixed(4))}%`
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/**
 * A pool, as it appears INLINE in a route: `v3 0.01%`, `v4 0%+hooks`, `v4 dyn+hooks`. No address —
 * that is the whole point of this shape, and the reason it is a different function from
 * {@link poolAddressLabel} (via {@link renderPoolDetailLines}) rather than one function with a
 * formatting flag buried in the middle of a switch. `opts.addresses` restores the OLD inline shape
 * (fee/tickSpacing plus the address, and for v4 the hooks address too) for a reader who wants it
 * back on every line — `--addresses`.
 */
export function describePool(pool: PoolRef, opts: { addresses?: boolean } = {}): string {
  if (!opts.addresses) return describePoolCompact(pool)
  switch (pool.protocol) {
    case 'v2':
      return `v2 ${shortHex(pool.address)}`
    case 'v3':
      return `v3 ${formatFee(pool.fee)} ${shortHex(pool.address)}`
    case 'v4': {
      const hooked = pool.poolKey.hooks !== ZERO_ADDRESS
      const hooks = hooked ? ` hooks ${shortHex(pool.poolKey.hooks)}` : ''
      // 0x800000 is v4's dynamic-fee sentinel, not a real 838.8608% tier — the hook sets the fee.
      const fee = pool.poolKey.fee === 0x800000 ? 'dynamic' : formatFee(pool.poolKey.fee)
      return `v4 ${fee}/${pool.poolKey.tickSpacing} ${shortHex(pool.poolId)}${hooks}`
    }
  }
}

function describePoolCompact(pool: PoolRef): string {
  switch (pool.protocol) {
    case 'v2':
      return 'v2'
    case 'v3':
      return `v3 ${formatFee(pool.fee)}`
    case 'v4': {
      const hooked = pool.poolKey.hooks !== ZERO_ADDRESS
      const fee = pool.poolKey.fee === 0x800000 ? 'dyn' : formatFee(pool.poolKey.fee)
      return `v4 ${fee}${hooked ? '+hooks' : ''}`
    }
  }
}

/** `ETH ─ v3 0.05% → USDC`, chaining through intermediates for two-hop routes — or, with
 * `opts.addresses`, the pre-existing address-inclusive shape on every leg. */
export function renderRoute(route: QuotedRoute['route'], ctx: RenderCtx, opts: { addresses?: boolean } = {}): string {
  const parts: string[] = []
  for (const [i, leg] of route.legs.entries()) {
    if (i === 0) parts.push(bold(symbolFor(ctx, leg.currencyIn)))
    parts.push(dim(`─ ${describePool(leg.pool, opts)} →`))
    parts.push(bold(symbolFor(ctx, leg.currencyOut)))
  }
  return parts.join(' ')
}

/** One hop's address line, for {@link renderPoolDetailLines}: `pool 0x…`, plus the hooks address
 * when the hop is a hooked v4 pool (the one place `--addresses`'s inline `hooks 0x…` moves to when
 * addresses are demoted). */
function poolAddressLabel(pool: PoolRef): string {
  switch (pool.protocol) {
    case 'v2':
    case 'v3':
      return `pool ${shortHex(pool.address)}`
    case 'v4': {
      const hooked = pool.poolKey.hooks !== ZERO_ADDRESS
      return `pool ${shortHex(pool.poolId)}${hooked ? ` hooks ${shortHex(pool.poolKey.hooks)}` : ''}`
    }
  }
}

/**
 * The dim detail line(s) beneath the LEADING route only — never printed for alternatives, and never
 * printed at all under `--addresses` (the address is already inline there, and repeating it below
 * would just be noise). Hop-numbered once a route has two legs, since "pool 0x…" alone would not say
 * which hop it belongs to.
 */
export function renderPoolDetailLines(route: QuotedRoute['route'], opts: { addresses?: boolean } = {}): string[] {
  if (opts.addresses) return []
  const { legs } = route
  if (legs.length === 1) return [dim(`        ${poolAddressLabel(legs[0]!.pool)}`)]
  return legs.map((leg, i) => dim(`        hop ${i + 1}  ${poolAddressLabel(leg.pool)}`))
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

// ---------------------------------------------------------------------------
// Runners-up: the alternatives as a delta table.
// ---------------------------------------------------------------------------

/**
 * The alternatives, as a delta table against `best`: signed Δ amount + Δ bps, columns aligned to the
 * widest cell in each, route notation matching the leader's (compact by default, addressed under
 * `--addresses`) padded so the trailing gas note lines up too. Capped at 5 rows, same as before.
 *
 * `adaptiveFractionDigits` picks one fraction-digit count for the WHOLE column — not one per row —
 * because a table where each row rounds to a different number of decimals is not aligned, it just
 * looks aligned at a glance.
 */
export function renderRunnersUp(
  best: QuotedRoute | RankedRoute,
  alternatives: (QuotedRoute | RankedRoute)[],
  out: CurrencyRef,
  ctx: RenderCtx,
  opts: { addresses?: boolean } = {},
): string[] {
  if (alternatives.length === 0) return []
  const shown = alternatives.slice(0, 5)
  const overflow = alternatives.length - shown.length

  const view = ctx.views.get(viewKey(out))
  const deltas = shown.map((alt) => alt.quote.amountOut - best.quote.amountOut)

  const amountCells = view
    ? (() => {
        const digits = adaptiveFractionDigits(
          deltas.map((d) => (d < 0n ? -d : d)),
          view.decimals,
        )
        return deltas.map((d) => `${formatFixed(d, view.decimals, digits)} ${view.symbol}`)
      })()
    : deltas.map((d) => `${d} raw ${symbolFor(ctx, out)}`)

  const bpsCells = deltas.map((d) => {
    if (best.quote.amountOut === 0n) return '0.0 bps'
    // Three decimal digits of bps precision BEFORE the final `toFixed(1)` rounding — the same
    // `*10_000_000n / 1000` shape `promotionNote` uses below. A single division straight to
    // tenths-of-a-bps (`*100_000n`) truncates (bigint division rounds toward zero) before rounding
    // ever gets a chance to run, which is how `-1.5977` bps silently became a displayed `-1.5`
    // instead of the correct `-1.6`.
    const milliBps = (d * 10_000_000n) / best.quote.amountOut
    return `${(Number(milliBps) / 1000).toFixed(1)} bps`
  })

  const amountWidth = Math.max(...amountCells.map((c) => c.length))
  const bpsWidth = Math.max(...bpsCells.map((c) => c.length))

  const routeCells = shown.map((alt) => renderRoute(alt.route, ctx, opts))
  const routeWidth = Math.max(...routeCells.map((c) => visibleLength(c)))

  const lines = [`${dim('runners-up')}                ${dim('Δ vs best')}`]
  shown.forEach((alt, i) => {
    const amount = amountCells[i]!.padStart(amountWidth, ' ')
    const bps = bpsCells[i]!.padStart(bpsWidth, ' ')
    const route = padEndVisible(routeCells[i]!, routeWidth)
    const badge = isRanked(alt) ? `  ${executionBadge(alt)}` : ''
    lines.push(`    ${amount}   ${bps}   ${route}${gasNote(alt)}${badge}`)
  })
  if (overflow > 0) lines.push(dim(`    … and ${overflow} more`))
  return lines
}

/** `visibleWidth`, spelled once here for a string that is never itself styled at this call site
 * (route cells already carry their own `dim`/`bold` codes) — kept local so `renderRunnersUp` reads
 * as one self-contained algorithm. */
function visibleLength(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length
}

// ---------------------------------------------------------------------------
// "How it went" — the timeline.
// ---------------------------------------------------------------------------

/** Where the search's first (unverified) lead came from — classified by the command layer, which is
 * the only place that knows what the index held BEFORE the search started and what the trade's own
 * `--hint`s named (see `commands/context.ts`). */
export type LeadOrigin = 'cache' | 'hint' | 'probe'

export type FirstLeadInfo = { elapsedMs: number; route: QuotedRoute; origin: LeadOrigin }

/** One search wave's result plus the elapsed time it landed at — exactly what `iterateWaves`
 * (`waves.ts`) already collects per wave, just handed to a renderer instead of printed on the spot. */
export type WaveEvent = { elapsedMs: number; result: QuoteResult | SwapResult }

const LEAD_ORIGIN_LABEL: Record<LeadOrigin, string> = {
  cache: 'lead from cache',
  hint: 'lead from a hinted pool',
  probe: 'lead from a fresh probe',
}

/** Right-pads a humanized duration so every timeline line's narrative text starts in the same
 * column, whatever the duration's own width (`82ms` vs `1m 03s`). */
function timelineTiming(elapsedMs: number): string {
  return padEndVisible(humanizeDuration(elapsedMs), 8)
}

/**
 * The trailing "(budget reached — Ns)" a wave's line earns when ITS OWN report says `aborted`.
 * Needs no "is this the last wave" bookkeeping at either call site (the retrospective render or
 * `waves.ts`'s live stream): `aborted` can only be `true` on the wave a bounded search actually
 * stopped at, by construction — the generator never yields again after that.
 */
export function budgetNoteFor(result: QuoteResult | SwapResult, budgetMs: number | undefined): string {
  if (!result.search.aborted || budgetMs === undefined) return ''
  return ` ${yellow(`(budget reached — ${humanizeDuration(budgetMs)})`)}`
}

/**
 * The full "how it went" block: the first unverified lead (if the engine ever reported one), the
 * wave that turned it into a real on-chain-priced result, and every wave after that framed as "did
 * this beat what we had". Empty (no header, nothing) when the search reported no waves at all — an
 * `rpc-unavailable` short-circuit before a single wave ran has no story to tell.
 *
 * Used BOTH retrospectively (the command layer renders this once, after the search, from the wave
 * history it collected regardless of `--watch`) and as the source of truth `--watch`'s live stream
 * mirrors line-for-line ({@link renderTimelineWaveLine}) — the two are the same wording so a
 * `--watch` run and its own retrospective summary never disagree.
 */
export function renderTimeline(
  first: FirstLeadInfo | undefined,
  waves: WaveEvent[],
  trade: TradeContext,
  ctx: RenderCtx,
  opts: { budgetMs?: number } = {},
): string[] {
  if (!first && waves.length === 0) return []
  const lines = [bold('how it went')]
  if (first) lines.push(renderFirstLeadLine(first))

  let previousBest: bigint | undefined = first?.route.quote.amountOut
  waves.forEach((wave, i) => {
    const budgetNote = budgetNoteFor(wave.result, opts.budgetMs)
    lines.push(renderTimelineWaveLine(i, wave, previousBest, first !== undefined, trade, ctx, budgetNote))
    const best = 'best' in wave.result && wave.result.best
    if (best) previousBest = best.quote.amountOut
  })
  return lines
}

/**
 * The timeline's first line, standalone — exported so `waves.ts`'s LIVE `--watch`/`--verbose` stream
 * can print it at the moment `onFirstRoute` fires, using the exact wording {@link renderTimeline}
 * would produce for it retrospectively.
 */
export function renderFirstLeadLine(first: FirstLeadInfo): string {
  return `  ${timelineTiming(first.elapsedMs)}${dim(`${LEAD_ORIGIN_LABEL[first.origin]} (unverified)`)}`
}

function renderConfirmationLine(
  wave: WaveEvent,
  leadBefore: bigint | undefined,
  hadFirst: boolean,
  budgetNote: string,
): string {
  const { result } = wave
  const q = result.search.quoting
  const best = 'best' in result && result.best
  const timing = `  ${timelineTiming(wave.elapsedMs)}`
  if (!best) {
    return `${timing}still nothing priced — ${groupThousands(q.succeeded)} of ${groupThousands(q.attempted)} candidate routes checked${budgetNote}`
  }
  const holdNote = !hadFirst ? '' : best.quote.amountOut === leadBefore ? ', lead holds' : ', lead changed'
  return `${timing}confirmed on-chain — ${groupThousands(q.succeeded)} of ${groupThousands(q.attempted)} candidate routes priced${holdNote}${budgetNote}`
}

/**
 * One timeline line for wave index `i` — the confirmation wording for the first wave, the scan
 * wording for every one after. Exported so `waves.ts`'s live stream and {@link renderTimeline}'s
 * retrospective render share one implementation and can never disagree about wording.
 */
export function renderTimelineWaveLine(
  i: number,
  wave: WaveEvent,
  previousBest: bigint | undefined,
  hadFirst: boolean,
  trade: TradeContext,
  ctx: RenderCtx,
  budgetNote: string,
): string {
  return i === 0
    ? renderConfirmationLine(wave, previousBest, hadFirst, budgetNote)
    : renderScanLine(wave, previousBest, trade.tokenOut, ctx, budgetNote)
}

function renderScanLine(wave: WaveEvent, previousBest: bigint | undefined, out: CurrencyRef, ctx: RenderCtx, budgetNote: string): string {
  const { result } = wave
  const best = 'best' in result && result.best
  const timing = `  ${timelineTiming(wave.elapsedMs)}`
  if (!best) return `${timing}scanned pool history for anything better — nothing priced yet${budgetNote}`
  const improved = previousBest !== undefined && best.quote.amountOut > previousBest
  const outcome = improved
    ? `found a better route: ${bold(signedAmountFor(ctx, out, best.quote.amountOut - previousBest!))}`
    : 'nothing beat it'
  return `${timing}scanned pool history for anything better — ${outcome}${budgetNote}`
}

// ---------------------------------------------------------------------------
// Confidence panel (formerly "search report")
// ---------------------------------------------------------------------------

/** One protocol's segment of the `pool knowledge` line — a bar plus a plain-language status, with
 * the demanded floor's approximate calendar age appended only while the protocol is `partial` (a
 * `complete`/`disabled`/`failed` protocol has nothing an age would add to). */
function poolKnowledgeSegment(
  protocol: string,
  status: SearchReport['discovery'][keyof SearchReport['discovery']],
  head: SearchReport['block'],
  blockTimeSeconds: number,
): string {
  switch (status.status) {
    case 'complete':
      return `${protocol} ${green(bar(1))} ${green('complete')}`
    case 'disabled':
      return `${protocol} ${dim(bar(0))} ${dim('disabled')}`
    case 'failed':
      return `${protocol} ${red(bar(0))} ${red('failed')}`
    case 'partial': {
      const { coveredRanges: ranges, demandFloor } = status
      const covered = ranges.reduce((sum, r) => sum + (r.toBlock - r.fromBlock + 1n), 0n)
      const span = head.number - demandFloor + 1n
      const fraction = span > 0n ? Number((covered * 1000n) / span) / 1000 : 0
      const pct = (fraction * 100).toFixed(1)
      const age = approxMonthYear(demandFloor, head, blockTimeSeconds)
      return `${protocol} ${yellow(bar(fraction))} ${yellow(`${pct}% since #${abbreviateBlock(demandFloor)} (${age})`)}`
    }
  }
}

function humanUtc(timestamp: bigint): string {
  const iso = new Date(Number(timestamp) * 1000).toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

export type ConfidencePanelOpts = {
  /** `'quote'` dims the verification line to a mode note instead of a (always-zero) preflight count. */
  mode: 'quote' | 'swap'
  /** Present only for a budgeted run — see the `notes` line's abort phrasing below. */
  budgetMs?: number
  /** From the chain manifest (`chain.manifest.chain?.blockTimeSeconds`) — drives the pool-knowledge
   * age approximation. Falls back to the SDK's own mainnet default when the manifest names none. */
  blockTimeSeconds?: number
  /** Surfaces the pruning counters that otherwise live under `--verbose` only. */
  verbose?: boolean
}

/**
 * The full diagnostics panel for one search — see the module header for the layout rationale, and
 * each field's own doc in `src/types.ts` for what it actually measures.
 */
export function renderConfidencePanel(report: SearchReport, opts: ConfidencePanelOpts): string[] {
  const lines: string[] = []
  lines.push(bold('confidence'))
  lines.push(`  priced at block #${groupThousands(report.block.number)} · ${humanUtc(report.block.timestamp)}`)

  const blockTimeSeconds = opts.blockTimeSeconds ?? 12
  const knowledge = PROTOCOLS.map((p) => poolKnowledgeSegment(p, report.discovery[p], report.block, blockTimeSeconds)).join(' · ')
  lines.push(`  pool knowledge   ${knowledge}`)

  const q = report.quoting
  const reverted = q.failed > 0 ? `${groupThousands(q.failed)} probed pools that don't exist` : dim("0 probed pools that don't exist")
  const lost = q.transportFailed > 0 ? yellow(`${groupThousands(q.transportFailed)} lost to RPC`) : dim('0 lost to RPC')
  const unattempted = q.unattempted > 0 ? yellow(` · ${groupThousands(q.unattempted)} never attempted`) : ''
  lines.push(
    `  routes checked   ${groupThousands(q.attempted)} = ${green(`${groupThousands(q.succeeded)} priced`)} · ${reverted} · ${lost}${unattempted}`,
  )

  const e = report.enumeration
  const exhaustive = e.exhaustiveWithinMaxHops ? green('exhaustive within 2 hops') : yellow('not exhaustive')
  lines.push(
    `  breadth          explored ${groupThousands(e.intermediatesSelected)} of ${groupThousands(e.intermediatesDiscovered)} intermediate tokens — ${exhaustive}`,
  )
  if (opts.verbose && e.poolsPruned + e.candidatesPruned + e.intermediatesPruned > 0) {
    lines.push(
      dim(
        `                   ${groupThousands(e.candidatesGenerated)} candidates generated · pruned: ${e.poolsPruned} pools, ${e.intermediatesPruned} intermediates, ${e.candidatesPruned} candidates`,
      ),
    )
  }

  const v = report.verification
  if (v.preflightAttempted === 0 && opts.mode === 'quote') {
    lines.push(`  verification     ${dim('none (quote mode — use swap or --simulate to preflight)')}`)
  } else {
    lines.push(`  verification     ${v.preflightAttempted} preflight simulation${v.preflightAttempted === 1 ? '' : 's'}`)
  }

  const notes: string[] = []
  if (report.aborted) notes.push(opts.budgetMs !== undefined ? yellow(`budget reached (${humanizeDuration(opts.budgetMs)})`) : red('aborted'))
  if (report.headRegressed) notes.push(red('head-regressed'))
  if (report.verificationDegraded) notes.push(red('verification-degraded'))
  if (v.preflightBudgetExhausted) notes.push(yellow('preflight-budget-exhausted'))
  if (notes.length > 0) lines.push(`  notes            ${notes.join(' · ')}`)

  return lines
}

// ---------------------------------------------------------------------------
// The on-disk cache summary line — `cache.ts#summarizeCacheCoverage` does the
// (pure) math against the loaded snapshot; this is the (pure) formatting.
// ---------------------------------------------------------------------------

export type CacheLineInfo = {
  chainId: number
  pools: number
  /** Per protocol, from `cache.ts#summarizeCacheCoverage` — a key absent entirely (not `0`) means
   * the manifest has no bundle for that protocol at all, rendered `disabled`. */
  perProtocol: Partial<Record<(typeof PROTOCOLS)[number], { pct: number; complete: boolean }>>
  /** `undefined` when there was no on-disk file to date (a cold start) — the line then simply omits
   * an age rather than claiming one. */
  ageMs?: number
  loadMs: number
}

/**
 * `cache: chain 1 · 1,204 pools · v2 34% v3 61% v4 ✓ · updated 3m ago · 0.7s load` — see the module
 * header on `cache.ts#summarizeCacheCoverage` for what the percentages are (and are not) measuring.
 *
 * UNCOLORED ON PURPOSE: `context.ts` prints the whole line via `console.error(dim(...))`, the same
 * as it always has — so the line reads as one dim unit, and this function does not fight that by
 * pre-styling pieces of it in colors a `dim()` wrapper would then have to fight with.
 */
export function renderCacheLine(info: CacheLineInfo): string {
  const parts = [`chain ${info.chainId}`, `${groupThousands(info.pools)} pools`]
  parts.push(
    PROTOCOLS.map((p) => {
      const cov = info.perProtocol[p]
      if (!cov) return `${p} disabled`
      return cov.complete ? `${p} ✓` : `${p} ${Math.round(cov.pct * 100)}%`
    }).join(' '),
  )
  if (info.ageMs !== undefined) parts.push(`updated ${humanizeAge(info.ageMs)} ago`)
  if (info.loadMs > 500) parts.push(`${(info.loadMs / 1_000).toFixed(1)}s load`)
  return `cache: ${parts.join(' · ')}`
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

/**
 * The headline for a result that HAS a leading route (`quote`/`ready`/`needs-action`, or an
 * `inconclusive` carrying a best-so-far): the glyph, the trade, the best amount bolded, an implied
 * unit price when it says something the amount alone does not (skipped at `amountIn === 1` of the
 * in-token, where "1 ETH = 1,877.84 USDC" is the same number already on the line), and — trailing,
 * dimmed — how many routes this search actually weighed and how long it took.
 */
function renderHeadline(
  status: Status,
  trade: TradeContext,
  best: QuotedRoute | RankedRoute,
  totalRoutes: number,
  ctx: RenderCtx,
  elapsedMs: number | undefined,
): string {
  const amountOut = amountFor(ctx, trade.tokenOut, best.quote.amountOut)
  const left = `${STATUS_HEADER[status](STATUS_GLYPH[status])} ${amountFor(ctx, trade.tokenIn, trade.amountIn)} → ${bold(amountOut)}`
  const implied = impliedPriceNote(trade, best, ctx)
  if (elapsedMs === undefined) return `${left}${implied}`
  const summary = `best of ${groupThousands(totalRoutes)} route${totalRoutes === 1 ? '' : 's'} · ${humanizeDuration(elapsedMs)}`
  return `${left}${implied}  ${dim(summary)}`
}

/** `1 ETH = 1,877.84 USDC` — skipped when `amountIn` is exactly `1` of the in-token's own units (the
 * headline's own amount already says that) or when either side's decimals are unknown. */
function impliedPriceNote(trade: TradeContext, best: QuotedRoute | RankedRoute, ctx: RenderCtx): string {
  const inView = ctx.views.get(viewKey(trade.tokenIn))
  if (!inView) return ''
  const oneIn = 10n ** BigInt(inView.decimals)
  if (trade.amountIn === oneIn) return ''
  if (trade.amountIn === 0n) return ''
  const unitOut = (best.quote.amountOut * oneIn) / trade.amountIn
  return `  ${dim(`(1 ${inView.symbol} = ${amountFor(ctx, trade.tokenOut, unitOut)})`)}`
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

/** Everything a result render needs beyond the result itself — every field optional so a caller with
 * nothing extra (a bare unit test) can pass `{}` and get the same shape the old positional
 * `elapsedMs` argument used to produce. */
export type RenderOpts = {
  elapsedMs?: number
  /** Restores inline pool addresses on every route line (best AND alternatives) and suppresses the
   * best route's dim detail line(s), which exist only to hold the address this puts back inline. */
  addresses?: boolean
  /** Present only for a budgeted run — threads through to {@link renderConfidencePanel}'s abort
   * phrasing and the timeline's final "budget reached" note. */
  budgetMs?: number
  blockTimeSeconds?: number
  verbose?: boolean
  /** The first unverified lead and the per-wave history — both optional because a caller that never
   * streamed the search (a plain unit test constructing a result by hand) has neither, and the
   * timeline simply renders as nothing. */
  first?: FirstLeadInfo
  waves?: WaveEvent[]
}

function renderTimelineBlock(trade: TradeContext, ctx: RenderCtx, opts: RenderOpts): string[] {
  const timeline = renderTimeline(opts.first, opts.waves ?? [], trade, ctx, opts.budgetMs !== undefined ? { budgetMs: opts.budgetMs } : {})
  return timeline.length > 0 ? ['', ...timeline] : []
}

/** Builds {@link ConfidencePanelOpts} from a `RenderOpts`, omitting (never `undefined`-assigning)
 * whichever optional fields are unset — required under `exactOptionalPropertyTypes`. */
function confidenceOpts(mode: ConfidencePanelOpts['mode'], opts: RenderOpts): ConfidencePanelOpts {
  return {
    mode,
    ...(opts.budgetMs !== undefined ? { budgetMs: opts.budgetMs } : {}),
    ...(opts.blockTimeSeconds !== undefined ? { blockTimeSeconds: opts.blockTimeSeconds } : {}),
    ...(opts.verbose !== undefined ? { verbose: opts.verbose } : {}),
  }
}

export function renderQuoteResult(result: QuoteResult, trade: TradeContext, ctx: RenderCtx, opts: RenderOpts = {}): string[] {
  const lines: string[] = []
  const pair = `${amountFor(ctx, trade.tokenIn, trade.amountIn)} → ${symbolFor(ctx, trade.tokenOut)}`

  if (result.status === 'quote') {
    const totalRoutes = result.alternatives.length + 1
    lines.push(renderHeadline('quote', trade, result.best, totalRoutes, ctx, opts.elapsedMs))
    lines.push(`  ${renderRoute(result.best.route, ctx, opts)}${gasNote(result.best)}`)
    lines.push(...renderPoolDetailLines(result.best.route, opts))
    lines.push(...promotionNote(result.best, result.alternatives, trade.tokenOut, ctx))
  } else {
    // No "best so far" panel on the quote side, unlike `renderSwapResult` below. A quote with a
    // leader is reported `status: 'quote'` however incomplete the search that found it (`types.ts`
    // spells out the asymmetry), so `inconclusive` here means nothing priced — there has never been
    // a leader to render, and the branch that tried to render one was unreachable.
    lines.push(`${STATUS_HEADER[result.status](`${STATUS_GLYPH[result.status]} ${result.status}`)}  ${pair}`)
    lines.push(...renderReason(result.reason))
  }

  lines.push(...renderTimelineBlock(trade, ctx, opts))
  const runnersUp = 'best' in result && result.best ? renderRunnersUp(result.best, result.alternatives, trade.tokenOut, ctx, opts) : []
  if (runnersUp.length > 0) lines.push('', ...runnersUp)
  lines.push('')
  lines.push(...renderConfidencePanel(result.search, confidenceOpts('quote', opts)))
  return lines
}

export function renderSwapResult(result: SwapResult, trade: TradeContext, ctx: RenderCtx, opts: RenderOpts = {}): string[] {
  const lines: string[] = []
  const pair = `${amountFor(ctx, trade.tokenIn, trade.amountIn)} → ${symbolFor(ctx, trade.tokenOut)}`

  if (result.status === 'ready' || result.status === 'needs-action') {
    const totalRoutes = result.alternatives.length + 1
    lines.push(renderHeadline(result.status, trade, result.best, totalRoutes, ctx, opts.elapsedMs))
    lines.push(`  ${renderRoute(result.best.route, ctx, opts)}${gasNote(result.best)}  ${executionBadge(result.best)}`)
    lines.push(...renderPoolDetailLines(result.best.route, opts))
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
      `${bold('limits')} minAmountOut ${amountFor(ctx, trade.tokenOut, result.limits.minAmountOut)} · deadline ${humanUtc(result.limits.deadline)}`,
    )
  } else {
    lines.push(`${STATUS_HEADER[result.status](`${STATUS_GLYPH[result.status]} ${result.status}`)}  ${pair}`)
    lines.push(...renderReason(result.reason))
    if (result.status === 'inconclusive' && result.best) {
      lines.push(
        `${bold('best so far')} ${amountFor(ctx, trade.tokenOut, result.best.quote.amountOut)} ${dim('(unverified — search was cut short)')}`,
      )
      lines.push(`  ${renderRoute(result.best.route, ctx, opts)}${gasNote(result.best)}  ${executionBadge(result.best)}`)
      lines.push(...renderPoolDetailLines(result.best.route, opts))
      lines.push(...promotionNote(result.best, result.alternatives, trade.tokenOut, ctx))
      if (result.tx) lines.push(dim(`  unverified tx available — rerun with a bigger --budget to verify, or use --json to extract it`))
    }
  }

  lines.push(...renderTimelineBlock(trade, ctx, opts))
  const runnersUp = 'best' in result && result.best ? renderRunnersUp(result.best, result.alternatives, trade.tokenOut, ctx, opts) : []
  if (runnersUp.length > 0) lines.push('', ...runnersUp)
  lines.push('')
  lines.push(...renderConfidencePanel(result.search, confidenceOpts('swap', opts)))
  return lines
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
