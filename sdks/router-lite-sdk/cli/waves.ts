// ---------------------------------------------------------------------------
// The `--verbose`/`--watch` wave loop, shared by `quote` and `swap`.
//
// Both commands stream the SDK's bounded search the same way — one line (or
// one NDJSON object) per wave, the improving best carried forward so
// `renderWaveLine` can mark a wave that actually improved — and differed in
// exactly one thing: WHICH status ends the stream early (`quote` for a quote,
// `ready`/`needs-action` for a swap). That difference is the `stopAt`
// predicate; everything else was the same twenty lines twice.
// ---------------------------------------------------------------------------

import type { QuotedRoute, QuoteResult, SwapResult } from '../src/index'

import { jsonify, renderFirstRouteLine, renderWaveLine, type RenderCtx, type TradeContext } from './report'

/** Anything `renderWaveLine` can render: either result union the SDK's two search generators yield. */
export type WaveResult = QuoteResult | SwapResult

export type IterateWavesOptions<R extends WaveResult> = {
  /** NDJSON one object per wave instead of a rendered line — `--json`. */
  json: boolean
  /** `Date.now()` the command started, so the per-wave `+Nms` is measured from the same origin the
   * final panel's elapsed time is. */
  started: number
  /** Stops the stream after the first result this accepts. `--watch` passes `() => false` to drain
   * the whole bounded search instead. */
  stopAt: (result: R) => boolean
  /** Fills in symbols/decimals for route legs the command never named, before the line is rendered.
   * Only called on the render path — NDJSON carries raw refs and needs no views. */
  hydrate: (routes: QuotedRoute[]) => Promise<void>
}

/**
 * Builds the `onFirstRoute` handler (`src/router.ts#IterateOptions`) both streaming commands hand to
 * the SDK: one `first` line, on the same clock as the wave lines that follow.
 *
 * WHY THE STREAM NEEDED A SECOND KIND OF LINE AT ALL. The engine's wave 0 fires its speculative
 * route probes concurrently with a log scan, so on a warm mainnet index it holds a printable price
 * seconds before the wave — and therefore the first wave line — lands. Everything in that gap is a
 * `--watch` reader looking at a blank terminal while the answer already exists.
 *
 * The `emitted` latch is this module's own, not a restatement of the SDK's: the engine already
 * promises to call this once per search, and a host that prints a duplicate line the day that
 * promise slips is a worse failure than a silent one. It costs a boolean.
 */
export function firstRouteReporter(opts: {
  json: boolean
  /** Same `Date.now()` origin the wave lines use, so `first` and `wave 1` are on one timeline. */
  started: number
  tradeCtx: TradeContext
  renderCtx: RenderCtx
}): (route: QuotedRoute) => void {
  let emitted = false
  return (route: QuotedRoute): void => {
    if (emitted) return
    emitted = true
    const elapsedMs = Date.now() - opts.started
    if (opts.json) {
      // A TYPED event, not a wave-shaped object with fields missing: an NDJSON consumer reading this
      // stream must be able to tell "the search's first price" from "a completed wave" by looking at
      // one field, rather than by inferring it from the absence of `wave`/`result`.
      console.log(jsonify({ event: 'first-route', elapsedMs, route }, false))
      return
    }
    console.log(renderFirstRouteLine(elapsedMs, route, opts.tradeCtx, opts.renderCtx))
  }
}

/**
 * Streams one line (or NDJSON object) per search wave; returns the last result the iterator
 * yielded, or `undefined` if it yielded none.
 */
export async function iterateWaves<R extends WaveResult>(
  results: AsyncIterable<R>,
  tradeCtx: TradeContext,
  renderCtx: RenderCtx,
  opts: IterateWavesOptions<R>,
): Promise<R | undefined> {
  let wave = 0
  let previousBest: bigint | undefined
  let final: R | undefined
  for await (const result of results) {
    wave++
    final = result
    const elapsed = Date.now() - opts.started
    if (opts.json) {
      // `event` names what this object IS, so the wave stream and the `first-route` event above can
      // be discriminated on one field. Additive: `wave`/`elapsedMs`/`result` are unchanged.
      console.log(jsonify({ event: 'wave', wave, elapsedMs: elapsed, result }, false))
    } else {
      const best = 'best' in result && result.best ? [result.best] : []
      await opts.hydrate(best)
      console.log(renderWaveLine(wave, elapsed, result, tradeCtx, renderCtx, previousBest))
    }
    if ('best' in result && result.best) previousBest = result.best.quote.amountOut
    if (opts.stopAt(result)) break
  }
  return final
}
