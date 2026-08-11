// ---------------------------------------------------------------------------
// `rl swap <tokenIn> <tokenOut> <amount> --trader 0x…` — build (and
// optionally prove) executable Universal Router calldata.
//
// Same event semantics as `quote` (see that file's header for why every mode
// — default, `--verbose`, `--watch` — iterates the same event stream and
// always collects the "how it went" timeline), plus:
//  - the full tx (to / value / calldata) and the compiled limits the SDK
//    asserts inside it (`minAmountOut`, `deadline` — echoed, not re-derived);
//  - `needs-action` requirements as a checklist;
//  - `--simulate`: a keyless, fundless execution proof over `eth_simulateV1`
//    (see `../simulate.ts`), run against the final result when the endpoint
//    supports the method.
// ---------------------------------------------------------------------------

import { isAddress, type Address } from 'viem'

import { blockTimeSecondsOf } from '../../src/experimental/index'
import type { SwapRequest, SwapResult } from '../../src/index'
import { bold, dim, green, red, yellow } from '../ansi'
import { parseArgs, UsageError } from '../args'
import { amountFor, exitCodeFor, jsonify, renderSwapResult, type TradeContext } from '../report'
import { isSkipped, probeSimulateV1Support, simulateSwap } from '../simulate'
import { consumeSearch } from '../stream'

import { buildChainContext, hydrateLegSymbols, interruptSignal, makeLeadClassifier, resolveTrade, startBudget, TRADE_FLAGS, type ChainContext } from './context'


const SWAP_FLAGS = {
  ...TRADE_FLAGS,
  trader: { kind: 'string' as const, alias: 't' },
  recipient: { kind: 'string' as const },
  'slippage-bps': { kind: 'string' as const },
  'deadline-secs': { kind: 'string' as const },
  simulate: { kind: 'boolean' as const, alias: 's' },
}

/** `strict: false` — the 20-byte hex shape, without demanding EIP-55 casing the user does not have;
 * the same call and the same reasoning as the SDK's own trader/recipient check (`src/router.ts`). */
function parseAddress(value: string | undefined, flag: string): Address | undefined {
  if (value === undefined) return undefined
  if (!isAddress(value, { strict: false })) throw new UsageError(`--${flag} '${value}' is not a valid address`)
  return value
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

  const json = parsed.booleans.has('json')
  const watch = parsed.booleans.has('watch')
  const verbose = parsed.booleans.has('verbose')
  const addresses = parsed.booleans.has('addresses')
  // Same placement as `quote`'s: `--budget` bounds the SEARCH, so its clock (and the elapsed-time
  // origin that shares it) starts here rather than back in `buildChainContext`.
  const budget = startBudget(ctx.budgetMs)
  const signal = budget.signal
  // The budget's timer is REF'D on purpose (see `context.ts`), so it is cleared here on every exit
  // path — a command that finishes, or throws, before its budget expires must not hold the process
  // open for the remainder of it.
  try {
    const started = Date.now()

    const request: SwapRequest = {
      tokenIn: trade.tokenIn.ref,
      tokenOut: trade.tokenOut.ref,
      amountIn: trade.amountIn,
      trader,
      ...(recipient ? { recipient } : {}),
      ...(slippageBps !== undefined ? { slippageBps } : {}),
      ...(deadlineSeconds !== undefined ? { deadlineSeconds } : {}),
      ...(trade.hints.length > 0 ? { hints: trade.hints } : {}),
      signal,
    }
    const tradeCtx: TradeContext = { tokenIn: trade.tokenIn.ref, tokenOut: trade.tokenOut.ref, amountIn: trade.amountIn }

    const classify = makeLeadClassifier(ctx, trade)
    // `--watch`/`--verbose` PRINT per event (NDJSON under `--json`, a narrative line otherwise); the
    // default path stays silent until the end either way — see `stream.ts`'s header for why that is
    // what keeps a default `--json` run byte-identical to `jsonify(final)` alone.
    const stream = watch || verbose

    // A swap's first priced route is a LEAD, not an executable answer (nothing is compiled or
    // simulated yet) — the timeline's `(unverified)` suffix says so, and the later lead that turns
    // it into a `ready`/`needs-action` result is the one that reads "confirmed executable on-chain".
    const { final, first, timeline, interrupted, lastProgress } = await consumeSearch(ctx.router.swaps(request), {
      json,
      started,
      // `--watch` drains the whole bounded search; the default path and `--verbose` both stop at the
      // first actionable lead whose first measurement round has settled — the same answer `getSwap`
      // would give (see `quote.ts`'s header).
      stopAt: (result) =>
        !watch && (result.status === 'ready' || result.status === 'needs-action') && result.search.firstRoundComplete,
      stream,
      trade: tradeCtx,
      renderCtx: trade.renderCtx,
      classify,
      ...(ctx.budgetMs !== undefined ? { budgetMs: ctx.budgetMs } : {}),
      abortCause: budget.cause,
      // ^C stops CONSUMING immediately — the panel renders the last lead's snapshot rather than
      // waiting out the engine's drain (see `stream.ts#consumeSearch`). Budget expiry is not routed
      // here and keeps the drained-final path.
      interrupt: interruptSignal(),
    })
    if (!final) {
      if (interrupted) {
        // The interrupt beat the first lead: nothing to render but honesty. One line (rl.ts exits
        // 130 on top of whatever is returned here), plus the last heartbeat when nothing streamed.
        if (!stream && lastProgress !== undefined) console.error(dim(`  ${lastProgress}`))
        console.error(yellow('interrupted before any route was found'))
      }
      return 2
    }
    const cause = budget.cause() // settled by now — the search is over

    if (json) {
      if (!stream) console.log(jsonify(final))
    } else {
      await hydrateLegSymbols(ctx, trade.renderCtx, [...('best' in final && final.best ? [final.best] : []), ...final.alternatives])
      if (stream) console.log('')
      console.log(
        renderSwapResult(final, tradeCtx, trade.renderCtx, {
          elapsedMs: Date.now() - started,
          addresses,
          ...(ctx.budgetMs !== undefined ? { budgetMs: ctx.budgetMs } : {}),
          ...(cause !== undefined ? { abortCause: cause } : {}),
          blockTimeSeconds: blockTimeSecondsOf(ctx.chain.manifest),
          ...(first !== undefined ? { first } : {}),
          timeline,
        }).join('\n'),
      )
    }

    // `--simulate` is skipped on an interrupted run: the user asked the process to stop, and a
    // fresh round of simulation RPC after the panel is exactly the post-^C dawdling this path
    // exists to end. The rendered result already says `interrupted`.
    if (parsed.booleans.has('simulate') && !interrupted) {
      const verdict = await runSimulation(ctx, final, trader, recipient ?? trader, tradeCtx, trade.renderCtx, json)
      // A simulation that DISPROVED the tx must not exit 0 — a script gating on "swap --simulate"
      // would otherwise treat a proven-broken transaction as a success. Dedicated code 5 (documented
      // in rl.ts/README) keeps it distinguishable from `inconclusive` (2): the chain gave a verdict.
      if (verdict === 'disproved') return 5
    }

    return exitCodeFor(final.status)
  } finally {
    budget.cancel()
  }
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
  // A routing/liquidity outcome on the FUNDING leg — same class as the unsupported-endpoint skip
  // above, and deliberately not an error: the tx under test was built and nothing disproved it.
  if (isSkipped(outcome)) {
    if (!json) console.log(yellow(`--simulate skipped: ${outcome.skipped}`))
    else console.log(jsonify({ simulate: outcome }, false))
    return 'skipped'
  }
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
