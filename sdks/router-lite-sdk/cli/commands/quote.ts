// ---------------------------------------------------------------------------
// `rl quote <tokenIn> <tokenOut> <amount>` — price a trade and show how the
// search got there.
//
// Every mode — default, `--verbose`, `--watch` — iterates the SAME
// `ctx.router.quotes()` event stream (see `stream.ts`'s header for why that
// is provably identical to the old default path's `getQuote` call), so the
// "how it went" timeline is available whether or not it is also streamed
// live:
//  - default: stop at the first actionable `lead` — same answer `getQuote`
//    would give, timeline rendered once at the end;
//  - `--verbose`: identical stop condition, timeline streamed live too;
//  - `--watch`: drains the whole bounded search, timeline streamed live and
//    then recapped in the final panel.
// ---------------------------------------------------------------------------

import { blockTimeSecondsOf } from '../../src/experimental/index'
import type { QuoteRequest } from '../../src/index'
import { parseArgs } from '../args'
import { exitCodeFor, jsonify, renderQuoteResult, type TradeContext } from '../report'
import { consumeSearch } from '../stream'

import { buildChainContext, hydrateLegSymbols, makeLeadClassifier, resolveTrade, startBudget, TRADE_FLAGS } from './context'


export async function cmdQuote(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, TRADE_FLAGS)
  const ctx = await buildChainContext(parsed)
  const trade = await resolveTrade(ctx, parsed)

  const json = parsed.booleans.has('json')
  const watch = parsed.booleans.has('watch')
  const verbose = parsed.booleans.has('verbose')
  const addresses = parsed.booleans.has('addresses')
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
      signal,
    }
    const tradeCtx: TradeContext = { tokenIn: trade.tokenIn.ref, tokenOut: trade.tokenOut.ref, amountIn: trade.amountIn }

    const classify = makeLeadClassifier(ctx, trade)
    // `--watch`/`--verbose` PRINT per event (NDJSON under `--json`, a narrative line otherwise); the
    // default path stays silent until the end either way — see `stream.ts`'s header for why that is
    // what keeps a default `--json` run byte-identical to `jsonify(final)` alone.
    const stream = watch || verbose

    const { final, first, timeline } = await consumeSearch(ctx.router.quotes(request), {
      json,
      started,
      // `--watch` drains the whole bounded search; the default path and `--verbose` both stop at the
      // first actionable lead — the same answer `getQuote` would give (see this file's header).
      stopAt: (result) => !watch && result.status === 'quote',
      stream,
      trade: tradeCtx,
      renderCtx: trade.renderCtx,
      classify,
      ...(ctx.budgetMs !== undefined ? { budgetMs: ctx.budgetMs } : {}),
    })
    if (!final) return 2

    if (json) {
      if (!stream) console.log(jsonify(final))
      // `--watch`/`--verbose` already streamed every event as NDJSON; nothing more to print.
      return exitCodeFor(final.status)
    }

    await hydrateLegSymbols(ctx, trade.renderCtx, [...('best' in final && final.best ? [final.best] : []), ...final.alternatives])
    if (stream) console.log('')
    console.log(
      renderQuoteResult(final, tradeCtx, trade.renderCtx, {
        elapsedMs: Date.now() - started,
        addresses,
        ...(ctx.budgetMs !== undefined ? { budgetMs: ctx.budgetMs } : {}),
        blockTimeSeconds: blockTimeSecondsOf(ctx.chain.manifest),
        ...(first !== undefined ? { first } : {}),
        timeline,
      }).join('\n'),
    )
    return exitCodeFor(final.status)
  } finally {
    budget.cancel()
  }
}
