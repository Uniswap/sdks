// ---------------------------------------------------------------------------
// `rl swap <tokenIn> <tokenOut> <amount> --trader 0x…` — build (and
// optionally prove) executable Universal Router calldata.
//
// Same wave semantics as `quote` (`--verbose` streams to first actionable,
// `--watch` drains the bounded search), plus:
//  - the full tx (to / value / calldata) and the compiled limits the SDK
//    asserts inside it (`minAmountOut`, `deadline` — echoed, not re-derived);
//  - `needs-action` requirements as a checklist;
//  - `--simulate`: a keyless, fundless execution proof over `eth_simulateV1`
//    (see `../simulate.ts`), run against the final result when the endpoint
//    supports the method.
// ---------------------------------------------------------------------------

import { type Address } from 'viem'

import type { SwapRequest, SwapResult } from '../../src/index'
import { bold, dim, green, red, yellow } from '../ansi'
import { parseArgs, UsageError } from '../args'
import { amountFor, exitCodeFor, jsonify, renderSwapResult, renderWaveLine, type TradeContext } from '../report'
import { probeSimulateV1Support, simulateSwap } from '../simulate'

import { buildChainContext, hydrateLegSymbols, resolveTrade, TRADE_FLAGS, type ChainContext } from './context'


const SWAP_FLAGS = {
  ...TRADE_FLAGS,
  trader: { kind: 'string' as const, alias: 't' },
  recipient: { kind: 'string' as const },
  'slippage-bps': { kind: 'string' as const },
  'deadline-secs': { kind: 'string' as const },
  simulate: { kind: 'boolean' as const, alias: 's' },
}

function parseAddress(value: string | undefined, flag: string): Address | undefined {
  if (value === undefined) return undefined
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new UsageError(`--${flag} '${value}' is not a valid address`)
  return value as Address
}

function parseIntFlag(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined
  if (!/^\d+$/.test(value)) throw new UsageError(`--${flag} '${value}' is not a non-negative integer`)
  return Number(value)
}

export async function cmdSwap(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, SWAP_FLAGS)
  const trader = parseAddress(parsed.strings.get('trader'), 'trader')
  if (!trader) {
    throw new UsageError('swap needs --trader 0x… — the tx is simulated from (and encoded for) that account')
  }

  const ctx = await buildChainContext(parsed)
  if (!ctx.chain.swaps) {
    throw new UsageError(
      `${ctx.chain.label} is quote-only (its manifest ships no Universal Router execution bundle) — use \`rl quote\``,
    )
  }
  const trade = await resolveTrade(ctx, parsed)

  const recipient = parseAddress(parsed.strings.get('recipient'), 'recipient')
  const slippageBps = parseIntFlag(parsed.strings.get('slippage-bps'), 'slippage-bps')
  const deadlineSeconds = parseIntFlag(parsed.strings.get('deadline-secs'), 'deadline-secs')

  const request: SwapRequest = {
    tokenIn: trade.tokenIn.ref,
    tokenOut: trade.tokenOut.ref,
    amountIn: trade.amountIn,
    trader,
    ...(recipient ? { recipient } : {}),
    ...(slippageBps !== undefined ? { slippageBps } : {}),
    ...(deadlineSeconds !== undefined ? { deadlineSeconds } : {}),
    ...(trade.hints.length > 0 ? { hints: trade.hints } : {}),
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  }
  const tradeCtx: TradeContext = { tokenIn: trade.tokenIn.ref, tokenOut: trade.tokenOut.ref, amountIn: trade.amountIn }

  const json = parsed.booleans.has('json')
  const watch = parsed.booleans.has('watch')
  const verbose = parsed.booleans.has('verbose')
  const started = Date.now()

  let final: SwapResult | undefined
  if (!watch && !verbose) {
    final = await ctx.router.getSwap(request)
  } else {
    let wave = 0
    let previousBest: bigint | undefined
    for await (const result of ctx.router.swaps(request)) {
      wave++
      final = result
      const elapsed = Date.now() - started
      if (json) {
        console.log(jsonify({ wave, elapsedMs: elapsed, result }, false))
      } else {
        const best = 'best' in result && result.best ? [result.best] : []
        await hydrateLegSymbols(ctx, trade.renderCtx, best)
        console.log(renderWaveLine(wave, elapsed, result, tradeCtx, trade.renderCtx, previousBest))
      }
      if ('best' in result && result.best) previousBest = result.best.quote.amountOut
      if (!watch && (result.status === 'ready' || result.status === 'needs-action')) break
    }
    if (!json && final) console.log('')
  }
  if (!final) return 2

  const elapsed = Date.now() - started
  if (json && !watch && !verbose) {
    console.log(jsonify(final))
  } else if (!json) {
    await hydrateLegSymbols(ctx, trade.renderCtx, [...('best' in final && final.best ? [final.best] : []), ...final.alternatives])
    console.log(renderSwapResult(final, tradeCtx, trade.renderCtx, elapsed).join('\n'))
  }

  if (parsed.booleans.has('simulate')) {
    const verdict = await runSimulation(ctx, final, trader, recipient ?? trader, tradeCtx, trade.renderCtx, json)
    // A simulation that DISPROVED the tx must not exit 0 — a script gating on "swap --simulate"
    // would otherwise treat a proven-broken transaction as a success. Dedicated code 5 (documented
    // in rl.ts/README) keeps it distinguishable from `inconclusive` (2): the chain gave a verdict.
    if (verdict === 'disproved') return 5
  }

  return exitCodeFor(final.status)
}

/** The `--simulate` leg: probe for eth_simulateV1, then prove the final tx end to end. Returns
 * `proved`/`disproved` when a simulation actually ran, `skipped` otherwise (nothing executable,
 * or the endpoint lacks the method) — `skipped` never changes the exit code. */
async function runSimulation(
  ctx: ChainContext,
  final: SwapResult,
  trader: Address,
  recipient: Address,
  tradeCtx: TradeContext,
  renderCtx: Parameters<typeof renderSwapResult>[2],
  json: boolean,
): Promise<'proved' | 'disproved' | 'skipped'> {
  if (final.status !== 'ready' && final.status !== 'needs-action') {
    if (!json) console.log(dim(`--simulate skipped: nothing executable on a '${final.status}' result`))
    return 'skipped'
  }
  const supported = await probeSimulateV1Support(ctx.client)
  if (!supported) {
    if (!json) console.log(yellow('--simulate skipped: this endpoint does not serve eth_simulateV1'))
    else console.log(jsonify({ simulate: { skipped: 'eth_simulateV1 unsupported' } }, false))
    return 'skipped'
  }
  const outcome = await simulateSwap(ctx.client, ctx.router, final, trader, recipient)
  if (json) {
    console.log(jsonify({ simulate: outcome }, false))
    return outcome.ok ? 'proved' : 'disproved'
  }
  console.log('')
  if (outcome.ok) {
    console.log(
      `${green('✔ simulation')} the full ${outcome.callCount}-call chain executed; recipient received ${bold(
        amountFor(renderCtx, tradeCtx.tokenOut, outcome.outputReceived),
      )} ${dim(`(floor: ${amountFor(renderCtx, tradeCtx.tokenOut, final.limits.minAmountOut)})`)}`,
    )
    return 'proved'
  }
  if (outcome.failedCallIndex !== undefined) {
    console.log(red(`✖ simulation: call ${outcome.failedCallIndex + 1}/${outcome.callCount} of the chain reverted`))
  } else {
    console.log(
      red(
        `✖ simulation: executed but delivered ${amountFor(renderCtx, tradeCtx.tokenOut, outcome.outputReceived)} — below the tx's own floor ${amountFor(renderCtx, tradeCtx.tokenOut, final.limits.minAmountOut)}`,
      ),
    )
  }
  return 'disproved'
}
