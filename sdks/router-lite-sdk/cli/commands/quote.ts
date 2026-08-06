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

import type { QuoteRequest } from '../../src/index'
import { parseArgs } from '../args'
import { exitCodeFor, jsonify, renderQuoteResult, type TradeContext } from '../report'
import { iterateWaves } from '../waves'

import { buildChainContext, hydrateLegSymbols, resolveTrade, TRADE_FLAGS } from './context'


export async function cmdQuote(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, TRADE_FLAGS)
  const ctx = await buildChainContext(parsed)
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

  const final = await iterateWaves(ctx.router.quotes(request), tradeCtx, trade.renderCtx, {
    json,
    started,
    // `--watch` drains the whole bounded search; `--verbose` alone stops at the first actionable
    // wave, which for a quote is any result carrying a leader.
    stopAt: (result) => !watch && result.status === 'quote',
    hydrate: (routes) => hydrateLegSymbols(ctx, trade.renderCtx, routes),
  })
  if (!final) return 2
  if (!json) {
    await hydrateLegSymbols(ctx, trade.renderCtx, [...('best' in final && final.best ? [final.best] : []), ...final.alternatives])
    console.log('')
    console.log(renderQuoteResult(final, tradeCtx, trade.renderCtx, Date.now() - started).join('\n'))
  }
  return exitCodeFor(final.status)
}
