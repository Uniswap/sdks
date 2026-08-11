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
//    heartbeat. A narrative line identical to the previous one is suppressed
//    (`progressKey`) — the engine's axes are finer-grained than the line, so a
//    cycle that moved one the line does not show would otherwise print a
//    duplicate. `--json` NDJSON is never suppressed: it mirrors the SDK's
//    event stream one-for-one.
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

import type { QuotedRoute, QuoteResult, SearchEvent, SearchReport, SwapResult } from '../src/index'

import {
  abortNoteFor,
  jsonify,
  progressBody,
  renderFirstLeadLine,
  renderTimelineLine,
  searchOf,
  type AbortCause,
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
  /** `Budget.cause`, LIVE (a getter, not a snapshot): which source aborted the search's signal, once
   * one has. Read per printed line, because the answer changes mid-stream — every line before the
   * abort renders no note, and the line the search stops at must name the source that stopped it. */
  abortCause?: () => AbortCause | undefined
  /** The process-wide INTERRUPT signal (`commands/context.ts#interruptSignal`) — the ^C half only,
   * never the composed budget signal. When it fires, this consumer stops pulling IMMEDIATELY (the
   * pending pull is raced against it, so a parked await cannot delay the break) and abandons the
   * iterator, whose own teardown cancels everything in flight. A budget expiry is deliberately NOT
   * routed here: it keeps the drain-then-`final` semantics, because nobody is sitting at a keyboard
   * waiting on it. See {@link consumeSearch}'s docstring for the whole contract. */
  interrupt?: AbortSignal
}

export type ConsumeResult<R extends SearchResult> = {
  /** The last result the stream carried (`lead` or `final`), or `undefined` if it carried none. On
   * an interrupted run this is the last LEAD's interim snapshot (a full result by the SDK's design),
   * with `search.aborted` stamped true — the search WAS aborted, even though this snapshot predates
   * the signal — so the abort note renders on it exactly as on a drained final. */
  final: R | undefined
  /** The first `lead`, classified — the timeline's opening line. */
  first: FirstLeadInfo | undefined
  /** Every event AFTER the first lead, in order, `progress` excluded — the "how it went" timeline's
   * raw material, always collected (this is what makes the timeline available outside `--watch`). */
  timeline: TimelineEvent[]
  /** True when `opts.interrupt` cut the stream short — the immediate-render path. `final` is then
   * the last lead's snapshot (or `undefined` if the interrupt beat the first lead). */
  interrupted: boolean
  /** The last progress line's body, for the interrupted-before-any-lead notice — the only thing a
   * leadless interrupted run has to say about what the search was doing when it died. */
  lastProgress?: string
}

function leaderOf(result: SearchResult): QuotedRoute | undefined {
  return 'best' in result && result.best ? result.best : undefined
}

/** The rendered `progress` line's own body (`report.ts#progressBody`) IS the dedup key: two events
 * with the same one render byte-identical lines but for the timing, by construction rather than by a
 * counter tuple somebody has to remember to extend. */
function progressKey(search: SearchReport): string {
  return progressBody(search)
}

/** The token {@link consumeSearch}'s interrupt race resolves to, distinguishable from any
 * `IteratorResult` by identity. */
const INTERRUPTED = Symbol('interrupted')

/**
 * Streams (or silently collects) one entry per search event; returns the last result the stream
 * carried, the classified first lead, and the event history after it — regardless of `stream`.
 *
 * THE INTERRUPT (`opts.interrupt`) STOPS CONSUMPTION NOW, NOT AT THE ENGINE'S `final`. A ^C user is
 * standing at a keyboard — worse, often behind a wrapper (chainz exec) whose own process dies on
 * the ^C instantly, handing the prompt back — so the seconds the engine's drain takes are seconds
 * the panel prints OVER a fresh shell prompt. The pending pull is therefore RACED against the
 * interrupt (a parked `it.next()` cannot delay the break), the loop exits with whatever the last
 * `lead` carried (a full interim snapshot by the SDK's design, stamped `aborted` on the way out),
 * and the iterator is ABANDONED — `it.return()`, fired without awaiting it, which runs the SDK
 * generator's own teardown (`sources.abortAll()`): every in-flight call cancels, and the coverage
 * learned so far is already in the shared index. A BUDGET expiry deliberately keeps the old
 * drain-then-`final` semantics — it reaches this loop as ordinary events, never as `interrupt`.
 */
export async function consumeSearch<R extends SearchResult>(
  events: AsyncIterable<SearchEvent<R>>,
  opts: ConsumeOptions<R>,
): Promise<ConsumeResult<R>> {
  const timeline: TimelineEvent[] = []
  let first: FirstLeadInfo | undefined
  let final: R | undefined
  let previousBest: bigint | undefined
  let lastProgress: string | undefined
  let interrupted = false

  const it = events[Symbol.asyncIterator]()
  const interrupt = opts.interrupt
  const interruptRace: Promise<typeof INTERRUPTED> | undefined =
    interrupt === undefined
      ? undefined
      : new Promise((resolve) => {
          if (interrupt.aborted) resolve(INTERRUPTED)
          else interrupt.addEventListener('abort', () => resolve(INTERRUPTED), { once: true })
        })

  try {
    while (true) {
      // Checked BEFORE each pull too: an interrupt landing while an event was being processed must
      // not buy the engine one more pull.
      if (interrupt?.aborted === true) {
        interrupted = true
        break
      }
      const step = interruptRace === undefined ? await it.next() : await Promise.race([it.next(), interruptRace])
      if (step === INTERRUPTED) {
        interrupted = true
        break
      }
      if (step.done === true) break
      const event = step.value
      const elapsedMs = Date.now() - opts.started

      if (event.type === 'progress') {
        // A narrative progress line whose counters read exactly as the previous one's says nothing a
        // reader can act on — the engine woke, an axis the LINE does not show moved. Suppressed for
        // the narrative stream only: `--json` NDJSON mirrors the SDK's event stream one-for-one.
        const key = progressKey(event.search)
        const repeat = !opts.json && key === lastProgress
        lastProgress = key
        if (opts.stream && !repeat) print({ type: 'progress', elapsedMs, search: event.search }, previousBest, opts)
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
  } finally {
    // Every exit path abandons the iterator — what `for await`'s own break used to do, now explicit
    // because the pull is manual. NOT awaited: on the interrupt path the generator may be parked
    // deep in an engine await, and its wind-down must not delay the panel the user is waiting on.
    // (After a normal `done` this resolves immediately as a no-op.)
    if (it.return !== undefined) void it.return(undefined).catch(() => {})
  }

  // The interrupted snapshot predates the signal, so its report says `aborted: false` — but the RUN
  // was aborted, and the abort note (rendered off `search.aborted` + `abortCause`) must say so.
  if (interrupted && final !== undefined) {
    final = { ...final, search: { ...final.search, aborted: true } }
  }
  return { final, first, timeline, interrupted, ...(lastProgress !== undefined ? { lastProgress } : {}) }
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
  console.log(renderTimelineLine(entry, previousBest, opts.trade, opts.renderCtx, abortNoteFor(searchOf(entry), opts.budgetMs, opts.abortCause?.())))
}
