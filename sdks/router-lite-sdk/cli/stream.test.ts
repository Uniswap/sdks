import { afterEach, beforeAll, describe, expect, it } from 'bun:test'
import type { Address } from 'viem'

import { emptyReport } from '../src/experimental/index'
import type { PoolRef, QuotedRoute, QuoteResult, SearchEvent, SearchReport } from '../src/index'

import { setColorEnabled } from './ansi'
import type { RenderCtx, TradeContext } from './report'
import { consumeSearch, type ConsumeOptions } from './stream'

// ---------------------------------------------------------------------------
// The `--watch`/`--verbose` stream, as a stream: which SDK events become which
// lines, in what order, and how a machine consumer tells them apart.
//
// `report.test.ts` owns how each individual line is FORMATTED (including the
// timeline's narrative wording, which this module's `stream: true` path calls
// straight into). What is only visible here is the FOLD — that the first
// `lead` becomes the classified opening line rather than an ordinary
// improvement, that `progress` is printed live but never collected, that
// `stopAt` ends the stream, and that `stream: false` prints NOTHING regardless
// of `json` (the byte-compatibility requirement for a default `--json` run).
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
 * A structurally-complete report. Only the measurement counters are read by the lines this file
 * asserts, so the rest is the SDK's own all-zero one rather than a hand-rolled literal that would
 * have to be edited every time `SearchReport` grows a field.
 */
const REPORT: SearchReport = {
  ...emptyReport(),
  enumeration: { ...emptyReport().enumeration, legsMeasured: 3 },
  quoting: { ...emptyReport().quoting, attempted: 3, succeeded: 3 },
}

function routeAt(amountOut: bigint): QuotedRoute {
  return {
    route: { legs: [{ pool: V3_POOL, currencyIn: 'native', currencyOut: USDC }] },
    quote: { amountIn: 10n ** 18n, amountOut, intermediateAmounts: [] },
  }
}

function quoteAt(amountOut: bigint): QuoteResult {
  return { status: 'quote', best: routeAt(amountOut), alternatives: [], search: REPORT }
}

function lead(amountOut: bigint): SearchEvent<QuoteResult> {
  return { type: 'lead', result: quoteAt(amountOut) }
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

function events(...list: SearchEvent<QuoteResult>[]): AsyncIterable<SearchEvent<QuoteResult>> {
  return (async function* () {
    for (const event of list) yield event
  })()
}

/** The common bones of every `consumeSearch` call in this file — only `stream`/`json`/`stopAt` vary. */
function baseOpts(stream: boolean): ConsumeOptions<QuoteResult> {
  return {
    json: false,
    started: Date.now(),
    stopAt: () => false,
    stream,
    trade: TRADE,
    renderCtx: CTX,
    classify: () => 'cache',
  }
}

describe('the search event stream', () => {
  it('turns the first lead into the classified opening line, and later leads into improvements', async () => {
    const lines = captureStdout()
    const { first, timeline, final } = await consumeSearch(
      events(lead(3_912_401_234n), lead(3_920_000_000n), { type: 'final', result: quoteAt(3_920_000_000n) }),
      baseOpts(true),
    )

    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('lead from cache')
    expect(lines[0]).toContain('3,912.401234 USDC')
    expect(lines[1]).toContain('found a better route')
    expect(lines[2]).toContain('search complete')
    // The opening lead is RECORDED, not collected: `renderTimeline` prints it from `first` and folds
    // the rest against it, so collecting it too would print it twice.
    expect(first?.origin).toBe('cache')
    expect(timeline.map((e) => e.type)).toEqual(['lead', 'final'])
    expect(final?.status).toBe('quote')
  })

  it('prints progress live but never collects it — the retrospective panel is the answer’s history', async () => {
    const lines = captureStdout()
    const { timeline } = await consumeSearch(
      events(lead(3_912_401_234n), { type: 'progress', search: REPORT }, { type: 'final', result: quoteAt(3_912_401_234n) }),
      baseOpts(true),
    )

    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('still searching')
    expect(timeline.map((e) => e.type)).toEqual(['final'])
  })

  it('suppresses a narrative progress line whose counters did not move, but keeps every NDJSON one', async () => {
    const moved: SearchReport = { ...REPORT, enumeration: { ...REPORT.enumeration, legsMeasured: 9 } }
    const stream = (): SearchEvent<QuoteResult>[] => [
      lead(3_912_401_234n),
      { type: 'progress', search: REPORT },
      { type: 'progress', search: REPORT }, // identical counters — nothing a reader could act on
      { type: 'progress', search: moved },
      { type: 'final', result: quoteAt(3_912_401_234n) },
    ]

    const narrative = captureStdout()
    await consumeSearch(events(...stream()), baseOpts(true))
    expect(narrative.filter((line) => line.includes('still searching'))).toHaveLength(2)

    const ndjson = captureStdout()
    await consumeSearch(events(...stream()), { ...baseOpts(true), json: true })
    expect(ndjson.map((line) => (JSON.parse(line) as { event: string }).event)).toEqual([
      'lead',
      'progress',
      'progress',
      'progress',
      'final',
    ])
  })

  it('stops at the first result `stopAt` accepts — the default/`--verbose` path', async () => {
    const lines = captureStdout()
    const { final, timeline } = await consumeSearch(events(lead(3_912_401_234n), lead(3_920_000_000n)), {
      ...baseOpts(true),
      stopAt: (result) => result.status === 'quote',
    })

    expect(lines).toHaveLength(1)
    expect(final?.status === 'quote' && final.best.quote.amountOut).toBe(3_912_401_234n)
    expect(timeline).toHaveLength(0)
  })

  it('streams NDJSON when stream+json are both true, discriminable on `event` alone', async () => {
    const lines = captureStdout()
    await consumeSearch(events(lead(3_912_401_234n), { type: 'progress', search: REPORT }, { type: 'final', result: quoteAt(3_912_401_234n) }), {
      ...baseOpts(true),
      json: true,
      classify: () => 'hint',
    })

    const parsed = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(parsed.map((e) => e.event)).toEqual(['lead', 'progress', 'final'])
    // The opening lead is the only event that carries an origin — it is the only one classified.
    expect(parsed[0]!.origin).toBe('hint')
    expect(parsed[2]!.origin).toBeUndefined()
    expect(typeof parsed[0]!.elapsedMs).toBe('number')
    // Results travel whole, with bigints as decimal strings like every other number this CLI emits.
    expect((parsed[0]!.result as any).best.quote.amountOut).toBe('3912401234')
    expect((parsed[1]!.search as any).quoting.attempted).toBe(3)
  })

  it('emits NOTHING per event when json is true but stream is false — the default `--json` path', async () => {
    const lines = captureStdout()
    const { first, timeline } = await consumeSearch(
      events(lead(3_912_401_234n), { type: 'progress', search: REPORT }, { type: 'final', result: quoteAt(3_920_000_000n) }),
      { ...baseOpts(false), json: true },
    )

    // Nothing on stdout — a default `rl quote … --json` run's ONLY output is the final
    // `jsonify(final)` the command layer prints itself.
    expect(lines).toHaveLength(0)
    // The history and the first-lead classification still happened, silently.
    expect(first).toBeDefined()
    expect(timeline).toHaveLength(1)
  })

  it('says nothing about a lead when the search never priced anything', async () => {
    const lines = captureStdout()
    const noRoute: QuoteResult = {
      status: 'no-route',
      reason: { code: 'no-viable-route', detail: 'search complete: no viable route found' },
      alternatives: [],
      search: REPORT,
    }
    const { first, timeline } = await consumeSearch(events({ type: 'final', result: noRoute }), baseOpts(true))

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('nothing priced')
    expect(first).toBeUndefined()
    expect(timeline).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// The interrupt path: ^C stops CONSUMING immediately — the pending pull is
// raced against the interrupt signal, the iterator is abandoned (its own
// teardown cancels the engine), and the caller renders the last lead's
// snapshot. Only the interactive interrupt takes this path; a budget expiry
// arrives as ordinary events and keeps the drained-final semantics.
// ---------------------------------------------------------------------------

/** An iterator a test can park and observe: yields `list` one per pull, then PARKS forever — the
 * shape of an engine mid-drain — recording every pull and whether the consumer abandoned it. */
function parkedAfter(list: SearchEvent<QuoteResult>[]): {
  iterable: AsyncIterable<SearchEvent<QuoteResult>>
  pulls: () => number
  wasReturned: () => boolean
} {
  let pulls = 0
  let returned = false
  const it: AsyncIterator<SearchEvent<QuoteResult>> = {
    next: () => {
      pulls++
      if (pulls <= list.length) return Promise.resolve({ done: false, value: list[pulls - 1]! })
      return new Promise(() => {}) // parked forever: the drain the consumer must NOT wait out
    },
    return: () => {
      returned = true
      return Promise.resolve({ done: true, value: undefined })
    },
  }
  return { iterable: { [Symbol.asyncIterator]: () => it }, pulls: () => pulls, wasReturned: () => returned }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('the interrupt path', () => {
  it('an interrupt mid-search returns the last lead IMMEDIATELY — stamped aborted, iterator abandoned, no further pulls', async () => {
    captureStdout()
    const interrupt = new AbortController()
    const { iterable, pulls, wasReturned } = parkedAfter([lead(3_912_401_234n)])

    const consuming = consumeSearch(iterable, { ...baseOpts(true), interrupt: interrupt.signal })
    await tick() // the lead is consumed; the next pull is parked — the engine is "draining"
    interrupt.abort()
    const { final, first, interrupted } = await consuming // resolves off the race, not the parked pull

    expect(interrupted).toBe(true)
    expect(first).toBeDefined()
    expect(final?.status === 'quote' && final.best.quote.amountOut).toBe(3_912_401_234n) // the last lead's snapshot
    expect(final?.search.aborted).toBe(true) // stamped on the way out, so the abort note renders on it
    expect(wasReturned()).toBe(true) // abandoned: the SDK generator's finally cancels everything in flight
    expect(pulls()).toBe(2) // the lead + the parked pull it was already waiting on — and NOTHING after
  })

  it('an interrupt before any lead reports interrupted with no result — and carries the last heartbeat', async () => {
    captureStdout()
    const interrupt = new AbortController()
    const { iterable, wasReturned } = parkedAfter([{ type: 'progress', search: REPORT }])

    const consuming = consumeSearch(iterable, { ...baseOpts(false), interrupt: interrupt.signal })
    await tick()
    interrupt.abort()
    const { final, first, interrupted, lastProgress } = await consuming

    expect(interrupted).toBe(true)
    expect(final).toBeUndefined() // nothing to render: the caller prints the one-line notice instead
    expect(first).toBeUndefined()
    expect(lastProgress).toContain('3 of 3 legs priced') // what the search was doing when it died
    expect(wasReturned()).toBe(true)
  })

  it('an interrupt that already fired stops the stream before its FIRST pull', async () => {
    captureStdout()
    const interrupt = new AbortController()
    interrupt.abort()
    const { iterable, pulls, wasReturned } = parkedAfter([lead(3_912_401_234n)])

    const { final, interrupted } = await consumeSearch(iterable, { ...baseOpts(false), interrupt: interrupt.signal })

    expect(interrupted).toBe(true)
    expect(final).toBeUndefined()
    expect(pulls()).toBe(0) // the loop-top check: an interrupt never buys the engine one more pull
    expect(wasReturned()).toBe(true)
  })

  it('a budget abort keeps the drained-final path: an unfired interrupt changes nothing', async () => {
    captureStdout()
    const interrupt = new AbortController() // present, never fired — every real command passes it
    const abortedFinal: QuoteResult = { ...quoteAt(3_912_401_234n), search: { ...REPORT, aborted: true } }
    const { final, interrupted } = await consumeSearch(events(lead(3_912_401_234n), { type: 'final', result: abortedFinal }), {
      ...baseOpts(true),
      interrupt: interrupt.signal,
    })

    expect(interrupted).toBe(false)
    expect(final?.search.aborted).toBe(true) // the ENGINE's drained final, not a stamped snapshot
  })
})
