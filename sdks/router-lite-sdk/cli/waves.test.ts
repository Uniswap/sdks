import { afterEach, beforeAll, describe, expect, it } from 'bun:test'
import type { Address } from 'viem'

import type { PoolRef, QuotedRoute, QuoteResult, SearchReport } from '../src/index'
import { emptyReport } from '../src/internal/testing'

import { setColorEnabled } from './ansi'
import type { RenderCtx, TradeContext } from './report'
import { firstRouteReporter, iterateWaves } from './waves'

// ---------------------------------------------------------------------------
// The `--watch`/`--verbose` stream, as a stream: what lands on stdout, in what
// order, and how a machine consumer tells the two kinds of line apart.
//
// `report.test.ts` owns how each individual line is FORMATTED. What is only
// visible here is the sequencing — the `first` line has to arrive before wave 1
// even though it is produced by a callback the SDK fires from inside the search
// rather than by the loop that prints the wave lines.
// ---------------------------------------------------------------------------

beforeAll(() => setColorEnabled(false))

const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const POOL: Address = '0xE0554a476A092703abdB3Ef35c80e0D76d32939F'

const V3_POOL: PoolRef = {
  id: `v3:${POOL.toLowerCase()}`,
  currencies: [USDC, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
  protocol: 'v3',
  address: POOL,
  token0: USDC,
  token1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  fee: 500,
}

const CTX: RenderCtx = {
  views: new Map([
    ['native', { symbol: 'ETH', decimals: 18 }],
    [USDC.toLowerCase(), { symbol: 'USDC', decimals: 6 }],
  ]),
}

const TRADE: TradeContext = { tokenIn: 'native', tokenOut: USDC, amountIn: 10n ** 18n }

/**
 * A structurally-complete report. Nothing this file asserts reads it — the wave line quotes its
 * `quoting` counters and nothing else — so it is the SDK's own all-zero one rather than a
 * hand-rolled literal that would have to be edited every time `SearchReport` grows a field.
 */
const EMPTY_REPORT: SearchReport = { ...emptyReport(), quoting: { ...emptyReport().quoting, attempted: 3, succeeded: 3 } }

function routeAt(amountOut: bigint): QuotedRoute {
  return {
    route: { legs: [{ pool: V3_POOL, currencyIn: 'native', currencyOut: USDC }] },
    quote: { amountIn: 10n ** 18n, amountOut, intermediateAmounts: [] },
  }
}

function quoteAt(amountOut: bigint): QuoteResult {
  return { status: 'quote', best: routeAt(amountOut), alternatives: [], search: EMPTY_REPORT }
}

const realLog = console.log

/** Collects every `console.log` line the stream writes. */
function captureStdout(): string[] {
  const lines: string[] = []
  console.log = (...args: unknown[]): void => {
    lines.push(args.map(String).join(' '))
  }
  return lines
}

afterEach(() => {
  console.log = realLog
})

/** An SDK-shaped iterable that fires `onFirstRoute` before its first yield, exactly as the engine
 * does (its wave-0 probes price a route while the wave's log scan is still running). */
function searchYielding(results: QuoteResult[], onFirstRoute?: (route: QuotedRoute) => void): AsyncIterable<QuoteResult> {
  return (async function* () {
    onFirstRoute?.(routeAt(3_912_401_234n))
    for (const result of results) yield result
  })()
}

const NO_HYDRATE = async (): Promise<void> => {}

describe('the wave stream', () => {
  it('prints the early `first` line BEFORE wave 1, and prints it once', async () => {
    const lines = captureStdout()
    const reporter = firstRouteReporter({ json: false, started: Date.now(), tradeCtx: TRADE, renderCtx: CTX })

    await iterateWaves(searchYielding([quoteAt(3_912_401_234n), quoteAt(3_920_000_000n)], reporter), TRADE, CTX, {
      json: false,
      started: Date.now(),
      stopAt: () => false,
      hydrate: NO_HYDRATE,
    })

    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatch(/^first /)
    expect(lines[0]).toContain('3,912.401234 USDC')
    expect(lines[1]).toMatch(/^wave 1/)
    expect(lines[2]).toMatch(/^wave 2/)
  })

  it('never prints a second `first` line, even if the SDK were to call back twice', async () => {
    // The engine promises once per search; this is the host's own latch, because a duplicated line in
    // a live stream is a worse failure than a missing one (see `firstRouteReporter`).
    const lines = captureStdout()
    const reporter = firstRouteReporter({ json: false, started: Date.now(), tradeCtx: TRADE, renderCtx: CTX })

    reporter(routeAt(3_912_401_234n))
    reporter(routeAt(9_999_999_999n))

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('3,912.401234 USDC')
  })

  it('emits a TYPED NDJSON event, discriminable from a wave object on one field', async () => {
    const lines = captureStdout()
    const reporter = firstRouteReporter({ json: true, started: Date.now(), tradeCtx: TRADE, renderCtx: CTX })

    await iterateWaves(searchYielding([quoteAt(3_912_401_234n)], reporter), TRADE, CTX, {
      json: true,
      started: Date.now(),
      stopAt: () => false,
      hydrate: NO_HYDRATE,
    })

    const events = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(events).toHaveLength(2)
    expect(events[0]!.event).toBe('first-route')
    expect(typeof events[0]!.elapsedMs).toBe('number')
    // The route travels whole, with bigints as decimal strings like every other number this CLI emits.
    expect((events[0]!.route as any).quote.amountOut).toBe('3912401234')
    expect(events[0]!.wave).toBeUndefined() // it is not a wave, and does not pretend to be one

    expect(events[1]!.event).toBe('wave')
    expect(events[1]!.wave).toBe(1)
    expect((events[1]!.result as any).status).toBe('quote')
  })

  it('says nothing at all when the search never prices anything', async () => {
    const lines = captureStdout()
    const noRoute: QuoteResult = {
      status: 'no-route',
      reason: { code: 'no-viable-route', detail: 'search complete: no viable route found' },
      alternatives: [],
      search: EMPTY_REPORT,
    }
    // `onFirstRoute` is simply never called by the engine in this case — the reporter is built and
    // handed over exactly as always, and contributes no line.
    firstRouteReporter({ json: false, started: Date.now(), tradeCtx: TRADE, renderCtx: CTX })

    await iterateWaves(searchYielding([noRoute]), TRADE, CTX, {
      json: false,
      started: Date.now(),
      stopAt: () => false,
      hydrate: NO_HYDRATE,
    })

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^wave 1/)
    expect(lines[0]).toContain('no route yet')
  })
})
