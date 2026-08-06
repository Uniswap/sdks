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

import { jsonify, renderWaveLine, type RenderCtx, type TradeContext } from './report'

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
      console.log(jsonify({ wave, elapsedMs: elapsed, result }, false))
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
