// ---------------------------------------------------------------------------
// The search event stream, shared by `quote` and `swap`.
//
// EVERY invocation — default, `--verbose`, and `--watch` alike — iterates
// `ctx.router.quotes()`/`swaps()` and folds the SDK's own `SearchEvent`s
// (`src/types.ts`) into the CLI's timeline. `src/router.ts` proves this is the
// same search the promise surface runs (`getQuote`/`getSwap` are themselves
// consumers of this stream, stopping at the first actionable `lead` — see that
// file's header), so this changes NOTHING about what a default run returns or
// how long it takes; it only keeps the event history the command layer needs
// for the "how it went" timeline, which `getQuote`/`getSwap` throw away before
// the CLI ever sees it. That is the whole reason `report.ts`'s timeline can be
// "always printed, not just `--watch`" — see that module's header.
//
// THE THREE EVENT ARMS, AND WHAT EACH IS FOR HERE:
//  - `lead`: the answer improved. The FIRST one opens the timeline (with the
//    origin the command layer classifies for it); every later one is an
//    improvement line. This is what the deleted `onFirstRoute` callback used to
//    approximate out-of-band — the stream now carries it in order, so there is
//    no callback to latch, no getter to read a concurrently-set value through,
//    and no way for the two to disagree about ordering.
//  - `progress`: a report axis moved without the answer moving. LIVE-ONLY:
//    printed under `--watch`/`--verbose`, never collected, because a
//    retrospective panel wants the answer's history rather than the engine's
//    heartbeat.
//  - `final`: the search settled. Closes the timeline.
//
// `stopAt` is the one thing that still differs per mode: default/`--verbose`
// stop at the first actionable lead (`quote` for a quote, `ready`/
// `needs-action` for a swap); `--watch` passes `() => false` to drain the whole
// bounded search instead. `stream` (`--watch`/`--verbose`) controls whether
// anything is PRINTED per event as it arrives — NDJSON under `--json`, a
// narrative line otherwise — versus collected silently for a single
// retrospective render (the default path). Either way the wording/shape is
// identical to what the retrospective render would produce, so a `--watch`
// run's live stream and its own final recap can never disagree, and — the
// byte-compatibility requirement — a default (non-streaming) `--json` run emits
// EXACTLY the final result object it always did, no event lines mixed in.
//
// NOTHING HYDRATES PER EVENT. The narrative lines this module prints
// (`report.ts#renderTimelineLine`) name amounts and counts, never a route, so
// no leg symbol has to be resolved before one can print; the command layer
// hydrates once, for the final leading route, after the loop ends.
// ---------------------------------------------------------------------------

import type { QuotedRoute, QuoteResult, SearchEvent, SwapResult } from '../src/index'

import {
  budgetNoteFor,
  jsonify,
  renderFirstLeadLine,
  renderTimelineLine,
  searchOf,
  type FirstLeadInfo,
  type LeadOrigin,
  type RenderCtx,
  type TimelineEvent,
  type TradeContext,
} from './report'

/** Either result union the SDK's two search generators carry. */
export type SearchResult = QuoteResult | SwapResult

export type ConsumeOptions<R extends SearchResult> = {
  /** NDJSON one object per event instead of a rendered line — `--json`. Only actually EMITTED when
   * `stream` is also true; see this module's header. */
  json: boolean
  /** `Date.now()` the command started, so each event's elapsed time is measured from the same origin
   * the final panel's elapsed time is. */
  started: number
  /** Stops the stream after the first result this accepts. `--watch` passes `() => false` to drain
   * the whole bounded search instead. */
  stopAt: (result: R) => boolean
  /** `--watch`/`--verbose`: print each event (NDJSON or narrative, per `json`) as it lands. `false`
   * — the default path — collects the identical `timeline` silently; the command layer renders it
   * once, retrospectively, at the end. Independent of `json`: a `false` here must print NOTHING in
   * EITHER mode, which is what keeps a default `--json` run's output identical to `jsonify(final)`
   * alone. */
  stream: boolean
  trade: TradeContext
  renderCtx: RenderCtx
  /** Classifies where the first lead came from — see `commands/context.ts#classifyLeadOrigin` for
   * how a command builds this from what the index already knew and what `--hint` named. */
  classify: (route: QuotedRoute) => LeadOrigin
  budgetMs?: number
}

export type ConsumeResult<R extends SearchResult> = {
  /** The last result the stream carried (`lead` or `final`), or `undefined` if it carried none. */
  final: R | undefined
  /** The first `lead`, classified — the timeline's opening line. */
  first: FirstLeadInfo | undefined
  /** Every event AFTER the first lead, in order, `progress` excluded — the "how it went" timeline's
   * raw material, always collected (this is what makes the timeline available outside `--watch`). */
  timeline: TimelineEvent[]
}

function leaderOf(result: SearchResult): QuotedRoute | undefined {
  return 'best' in result && result.best ? result.best : undefined
}

/**
 * Streams (or silently collects) one entry per search event; returns the last result the stream
 * carried, the classified first lead, and the event history after it — regardless of `stream`.
 */
export async function consumeSearch<R extends SearchResult>(
  events: AsyncIterable<SearchEvent<R>>,
  opts: ConsumeOptions<R>,
): Promise<ConsumeResult<R>> {
  const timeline: TimelineEvent[] = []
  let first: FirstLeadInfo | undefined
  let final: R | undefined
  let previousBest: bigint | undefined

  for await (const event of events) {
    const elapsedMs = Date.now() - opts.started

    if (event.type === 'progress') {
      if (opts.stream) print({ type: 'progress', elapsedMs, search: event.search }, previousBest, opts)
      continue
    }

    final = event.result
    const best = leaderOf(event.result)

    // The first lead opens the timeline as its own (origin-labelled) line, so it is recorded rather
    // than collected — `renderTimeline` prints it from `first` and folds the rest against it.
    if (event.type === 'lead' && first === undefined && best) {
      first = { elapsedMs, route: best, origin: opts.classify(best) }
      if (opts.stream) {
        console.log(
          opts.json
            ? jsonify({ event: 'lead', elapsedMs, origin: first.origin, result: event.result }, false)
            : renderFirstLeadLine(first, opts.trade.tokenOut, opts.renderCtx),
        )
      }
    } else {
      const entry: TimelineEvent = { type: event.type, elapsedMs, result: event.result }
      timeline.push(entry)
      if (opts.stream) print(entry, previousBest, opts)
    }

    if (best) previousBest = best.quote.amountOut
    if (opts.stopAt(event.result)) break
  }

  return { final, first, timeline }
}

/** One event, as the stream shows it: an NDJSON object under `--json`, otherwise the same narrative
 * line the retrospective timeline would render for it. */
function print<R extends SearchResult>(entry: TimelineEvent, previousBest: bigint | undefined, opts: ConsumeOptions<R>): void {
  if (opts.json) {
    // `event` names what this object IS — a consumer discriminates the three arms on that one field,
    // exactly as an SDK consumer discriminates `SearchEvent.type`.
    console.log(
      entry.type === 'progress'
        ? jsonify({ event: 'progress', elapsedMs: entry.elapsedMs, search: entry.search }, false)
        : jsonify({ event: entry.type, elapsedMs: entry.elapsedMs, result: entry.result }, false),
    )
    return
  }
  console.log(renderTimelineLine(entry, previousBest, opts.trade, opts.renderCtx, budgetNoteFor(searchOf(entry), opts.budgetMs)))
}
