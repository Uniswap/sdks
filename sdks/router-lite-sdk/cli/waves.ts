// ---------------------------------------------------------------------------
// The search-wave stream, shared by `quote` and `swap`.
//
// EVERY invocation — default, `--verbose`, and `--watch` alike — now iterates
// this the same way: `ctx.router.quotes()`/`swaps()` rather than the
// promise-shaped `getQuote`/`getSwap`. `src/router.ts` proves the two are the
// same search (`getQuote`/`getSwap` are themselves `for await (const e of
// searchWaves(...))` with an early return at the identical stop condition —
// see that file's header), so this changes NOTHING about what a default run
// returns or how long it takes; it only keeps the per-wave history the
// command layer needs for the "how it went" timeline, which used to be
// thrown away by `getQuote`/`getSwap` before the CLI ever saw it. That is the
// whole reason `report.ts`'s timeline can be "always printed, not just
// `--watch`" — see that module's header.
//
// `stopAt` is the one thing that still differs: default/`--verbose` stop at
// the first actionable result (`quote` for a quote, `ready`/`needs-action`
// for a swap); `--watch` passes `() => false` to drain the whole bounded
// search instead. `stream` (`--watch`/`--verbose`) controls whether anything
// is PRINTED per wave as it arrives — NDJSON under `--json`, a narrative line
// otherwise — versus collected silently for a single retrospective render
// (the default path). Either way the wording/shape is identical to what the
// retrospective render would produce, so a `--watch` run's live stream and
// its own final recap can never disagree, and — the byte-compatibility
// requirement — a default (non-streaming) `--json` run emits EXACTLY the
// final result object it always did, no wave/first-route events mixed in.
//
// NEITHER PATH HYDRATES PER WAVE, UNLIKE THE OLD ONE. The old live wave line
// rendered the CURRENT leader's full route inline every wave, which needed
// every leg's symbol resolved before it could print. The narrative lines
// this module prints now (`report.ts#renderTimelineWaveLine`) name amounts
// and counts, never a route — so the per-wave `hydrateLegSymbols` round trip
// the old code paid on every single wave (live or not) is gone; the command
// layer hydrates once, for the final leading route, after the loop ends.
// ---------------------------------------------------------------------------

import type { QuotedRoute, QuoteResult, SwapResult } from '../src/index'

import {
  budgetNoteFor,
  jsonify,
  renderFirstLeadLine,
  renderTimelineWaveLine,
  type FirstLeadInfo,
  type LeadOrigin,
  type RenderCtx,
  type TradeContext,
  type WaveEvent,
} from './report'

/** Anything `renderTimelineWaveLine` can render: either result union the SDK's two search generators yield. */
export type WaveResult = QuoteResult | SwapResult

export type IterateWavesOptions<R extends WaveResult> = {
  /** NDJSON one object per wave instead of a rendered line — `--json`. Only actually EMITTED when
   * `stream` is also true; see this module's header. */
  json: boolean
  /** `Date.now()` the command started, so the per-wave elapsed time is measured from the same origin
   * the final panel's elapsed time is. */
  started: number
  /** Stops the stream after the first result this accepts. `--watch` passes `() => false` to drain
   * the whole bounded search instead. */
  stopAt: (result: R) => boolean
  /** `--watch`/`--verbose`: print each wave's event (NDJSON or narrative, per `json`) as it lands.
   * `false` — the default path — collects the identical `history` silently; the command layer
   * renders it once, retrospectively, at the end. Independent of `json`: a `false` here must print
   * NOTHING per wave in EITHER mode, which is what keeps a default `--json` run's output identical
   * to `jsonify(final)` alone. */
  stream: boolean
  trade: TradeContext
  renderCtx: RenderCtx
  /** The moment `onFirstRoute` fired, if it has by the time a given wave is handled — read via a
   * getter (not a value) because it is set by a callback firing concurrently with this loop, and a
   * value captured at `iterateWaves`' call site would still be `undefined` when wave 0 arrives. */
  getFirst: () => FirstLeadInfo | undefined
  budgetMs?: number
}

export type IterateWavesResult<R extends WaveResult> = {
  /** The last result the iterator yielded, or `undefined` if it yielded none. */
  final: R | undefined
  /** Every wave's result plus its elapsed time, in order — the "how it went" timeline's raw
   * material, always collected (this is what makes the timeline available outside `--watch` too). */
  history: WaveEvent[]
}

/**
 * Builds the `onFirstRoute` handler (`src/router.ts#IterateOptions`) both streaming commands hand to
 * the SDK: classifies where the lead came from, records it (via `record`, a plain setter the caller
 * reads back through `getFirst` above — ALWAYS, regardless of `stream`, since the retrospective
 * render needs it exactly as much as a live one does) and, only when `stream`, prints the event for
 * it on the spot.
 *
 * WHY THE STREAM NEEDED A SECOND KIND OF LINE AT ALL. The engine's wave 0a fires its speculative
 * route probes concurrently with everything else it awaits, and its stage does not close until the
 * enumeration, compilation and (for a swap) preflight that follow have run — so it holds a printable
 * price before the wave, and therefore the first wave line, lands. Everything in that gap is a
 * `--watch` reader looking at a blank terminal while the answer already exists. (The gap used to
 * also span wave 0's exact-pair log scan, which is wave 0b's now — see `search/waves.ts`' header.)
 *
 * The `emitted` latch is this module's own, not a restatement of the SDK's: the engine already
 * promises to call this once per search, and a host that prints a duplicate line the day that
 * promise slips is a worse failure than a silent one. It costs a boolean.
 */
export function firstRouteReporter(opts: {
  json: boolean
  stream: boolean
  /** Same `Date.now()` origin the wave lines use, so `first` and the confirmation wave are on one
   * timeline. */
  started: number
  /** Classifies where the lead came from — see `commands/context.ts#classifyLeadOrigin` for how a
   * command builds this from what the index already knew and what `--hint` named. */
  classify: (route: QuotedRoute) => LeadOrigin
  record: (info: FirstLeadInfo) => void
}): (route: QuotedRoute) => void {
  let emitted = false
  return (route: QuotedRoute): void => {
    if (emitted) return
    emitted = true
    const elapsedMs = Date.now() - opts.started
    const origin = opts.classify(route)
    const info: FirstLeadInfo = { elapsedMs, route, origin }
    opts.record(info)
    if (!opts.stream) return
    if (opts.json) {
      // A TYPED event, not a wave-shaped object with fields missing: an NDJSON consumer reading this
      // stream must be able to tell "the search's first price" from "a completed wave" by looking at
      // one field, rather than by inferring it from the absence of `wave`/`result`.
      console.log(jsonify({ event: 'first-route', elapsedMs, origin, route }, false))
      return
    }
    console.log(renderFirstLeadLine(info))
  }
}

/**
 * Streams (or silently collects) one entry per search wave; returns the last result the iterator
 * yielded plus the full per-wave history, regardless of `stream`.
 */
export async function iterateWaves<R extends WaveResult>(results: AsyncIterable<R>, opts: IterateWavesOptions<R>): Promise<IterateWavesResult<R>> {
  const history: WaveEvent[] = []
  let previousBest: bigint | undefined
  let final: R | undefined
  for await (const result of results) {
    final = result
    const elapsedMs = Date.now() - opts.started
    if (opts.stream) {
      if (opts.json) {
        // `event` names what this object IS, so the wave stream and the `first-route` event above can
        // be discriminated on one field. Additive: `wave`/`elapsedMs`/`result` are unchanged.
        console.log(jsonify({ event: 'wave', wave: history.length + 1, elapsedMs, result }, false))
      } else {
        const first = opts.getFirst()
        const seed = previousBest ?? first?.route.quote.amountOut
        const budgetNote = budgetNoteFor(result, opts.budgetMs)
        console.log(renderTimelineWaveLine(history.length, { elapsedMs, result }, seed, first !== undefined, opts.trade, opts.renderCtx, budgetNote))
      }
    }
    history.push({ elapsedMs, result })
    if ('best' in result && result.best) previousBest = result.best.quote.amountOut
    if (opts.stopAt(result)) break
  }
  return { final, history }
}
