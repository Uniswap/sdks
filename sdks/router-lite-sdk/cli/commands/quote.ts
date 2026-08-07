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
import { firstRouteReporter, iterateWaves } from '../waves'

import { buildChainContext, hydrateLegSymbols, resolveTrade, startBudget, TRADE_FLAGS } from './context'


export async function cmdQuote(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, TRADE_FLAGS)
  const ctx = await buildChainContext(parsed)
  const trade = await resolveTrade(ctx, parsed)

  const json = parsed.booleans.has('json')
  const watch = parsed.booleans.has('watch')
  const verbose = parsed.booleans.has('verbose')
  // The budget clock and the elapsed-time origin start together, HERE — everything above this line
  // is setup (chain detection, cache load, token metadata) and is not what `--budget` bounds.
  const budget = startBudget(ctx.budgetMs)
  const signal = budget.signal
  // The budget's timer is REF'D on purpose (see `context.ts`), so it is cleared here on every exit
  // path — a command that finishes, or throws, before its budget expires must not hold the process
  // open for the remainder of it.
  try {
    const started = Date.now()

    const request: QuoteRequest = {
      tokenIn: trade.tokenIn.ref,
      tokenOut: trade.tokenOut.ref,
      amountIn: trade.amountIn,
      ...(trade.hints.length > 0 ? { hints: trade.hints } : {}),
      ...(signal ? { signal } : {}),
    }
    const tradeCtx: TradeContext = { tokenIn: trade.tokenIn.ref, tokenOut: trade.tokenOut.ref, amountIn: trade.amountIn }

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

    // The SDK prices a direct route a whole wave before wave 0 yields (its probes are one round trip;
    // the wave also waits on a log scan). `onFirstRoute` is how a streaming view gets to say so at the
    // moment it becomes true instead of seconds later — see `src/router.ts#IterateOptions`.
    const results = ctx.router.quotes(request, {
      onFirstRoute: firstRouteReporter({ json, started, tradeCtx, renderCtx: trade.renderCtx }),
    })
    const final = await iterateWaves(results, tradeCtx, trade.renderCtx, {
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
  } finally {
    budget.cancel()
  }
}
