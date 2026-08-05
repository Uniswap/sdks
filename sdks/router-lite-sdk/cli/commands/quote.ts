// ---------------------------------------------------------------------------
// `rl quote <tokenIn> <tokenOut> <amount>` — price a trade and show how the
// search got there.
//
// Three speeds, mirroring the SDK's own two call shapes:
//  - default: `getQuote` — resolves at the first actionable wave, like a
//    production caller would;
//  - `--verbose`: iterate `quotes()`, streaming one line per wave, stopping
//    at the first actionable result (same answer as default, but showing the
//    road there);
//  - `--watch`: iterate `quotes()` to the very end of the bounded search —
//    every wave, including the ones that only improve the answer.
// ---------------------------------------------------------------------------

import type { QuoteRequest, QuoteResult } from '../../src/index'
import { parseArgs } from '../args'
import {
  exitCodeFor,
  jsonify,
  renderQuoteResult,
  renderWaveLine,
  type TradeContext,
} from '../report'

import { buildChainContext, hydrateLegSymbols, resolveTrade, TRADE_FLAGS, type ChainContext } from './context'


export async function cmdQuote(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, TRADE_FLAGS)
  const ctx = buildChainContext(parsed)
  const trade = await resolveTrade(ctx, parsed)

  const request: QuoteRequest = {
    tokenIn: trade.tokenIn.ref,
    tokenOut: trade.tokenOut.ref,
    amountIn: trade.amountIn,
    ...(trade.hints.length > 0 ? { hints: trade.hints } : {}),
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  }
  const tradeCtx: TradeContext = { tokenIn: trade.tokenIn.ref, tokenOut: trade.tokenOut.ref, amountIn: trade.amountIn }

  const json = parsed.booleans.has('json')
  const watch = parsed.booleans.has('watch')
  const verbose = parsed.booleans.has('verbose')
  const started = Date.now()

  if (!watch && !verbose) {
    const result = await ctx.router.getQuote(request)
    const elapsed = Date.now() - started
    if (json) {
      console.log(jsonify(result))
    } else {
      await hydrateLegSymbols(ctx, trade.renderCtx, [...('best' in result && result.best ? [result.best] : []), ...result.alternatives])
      console.log(renderQuoteResult(result, tradeCtx, trade.renderCtx, elapsed).join('\n'))
    }
    return exitCodeFor(result.status)
  }

  const final = await iterateWaves(ctx, request, tradeCtx, trade.renderCtx, { json, stopAtActionable: !watch, started })
  if (!final) return 2
  if (!json) {
    await hydrateLegSymbols(ctx, trade.renderCtx, [...('best' in final && final.best ? [final.best] : []), ...final.alternatives])
    console.log('')
    console.log(renderQuoteResult(final, tradeCtx, trade.renderCtx, Date.now() - started).join('\n'))
  }
  return exitCodeFor(final.status)
}

/** Streams one line (or NDJSON object) per wave; returns the last result the iterator yielded. */
async function iterateWaves(
  ctx: ChainContext,
  request: QuoteRequest,
  tradeCtx: TradeContext,
  renderCtx: Parameters<typeof renderWaveLine>[4],
  opts: { json: boolean; stopAtActionable: boolean; started: number },
): Promise<QuoteResult | undefined> {
  let wave = 0
  let previousBest: bigint | undefined
  let final: QuoteResult | undefined
  for await (const result of ctx.router.quotes(request)) {
    wave++
    final = result
    const elapsed = Date.now() - opts.started
    if (opts.json) {
      console.log(jsonify({ wave, elapsedMs: elapsed, result }, false))
    } else {
      const best = 'best' in result && result.best ? [result.best] : []
      await hydrateLegSymbols(ctx, renderCtx, best)
      console.log(renderWaveLine(wave, elapsed, result, tradeCtx, renderCtx, previousBest))
    }
    if ('best' in result && result.best) previousBest = result.best.quote.amountOut
    if (opts.stopAtActionable && result.status === 'quote') break
  }
  return final
}
