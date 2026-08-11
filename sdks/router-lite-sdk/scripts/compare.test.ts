import { describe, expect, it } from 'bun:test'

import { UsageError } from '../cli/args'

import {
  buildTradingApiBody,
  classifyMiss,
  defaultTheBudgetFlag,
  deltaBps,
  findMisses,
  liteEvidence,
  MISS_DELTA_BPS,
  parsePairSpec,
  parseTradingApiResponse,
  summarize,
  TRADING_API_SWAPPER,
  type ComparisonRow,
  type LiteEvidence,
} from './compare'

// ---------------------------------------------------------------------------
// No network anywhere in this file — every case here is pure functions and
// hand-written fixture JSON, per this script's own testing contract.
// ---------------------------------------------------------------------------

describe('parsePairSpec', () => {
  it('parses TOKENA/TOKENB with an explicit amount', () => {
    expect(parsePairSpec('USDC/WETH:5000')).toEqual({ tokenInArg: 'USDC', tokenOutArg: 'WETH', amountHuman: '5000' })
  })

  it('defaults the amount to 1 when no :amount suffix is given', () => {
    expect(parsePairSpec('eth/usdc')).toEqual({ tokenInArg: 'eth', tokenOutArg: 'usdc', amountHuman: '1' })
  })

  it('accepts addresses on either side', () => {
    const spec = parsePairSpec('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/0xdAC17F958D2ee523a2206206994597C13D831ec7:10000')
    expect(spec.tokenInArg).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
    expect(spec.tokenOutArg).toBe('0xdAC17F958D2ee523a2206206994597C13D831ec7')
    expect(spec.amountHuman).toBe('10000')
  })

  it('trims whitespace around each part', () => {
    expect(parsePairSpec(' USDC / WETH : 5 ')).toEqual({ tokenInArg: 'USDC', tokenOutArg: 'WETH', amountHuman: '5' })
  })

  it('rejects a spec with no slash', () => {
    expect(() => parsePairSpec('USDCWETH')).toThrow(UsageError)
  })

  it('rejects a spec with nothing before or after the slash', () => {
    expect(() => parsePairSpec('/WETH')).toThrow(UsageError)
    expect(() => parsePairSpec('USDC/')).toThrow(UsageError)
  })

  it('rejects an empty amount after a trailing colon', () => {
    expect(() => parsePairSpec('USDC/WETH:')).toThrow(UsageError)
  })
})

describe('defaultTheBudgetFlag', () => {
  it('writes the default when --budget was not given', () => {
    const strings = new Map<string, string>()
    defaultTheBudgetFlag(strings)
    // The default must be in `--budget`'s OWN syntax, so `parseBudget` accepts it downstream.
    expect(strings.get('budget')).toBe('10000ms')
  })

  it('never overrides a caller-supplied --budget', () => {
    const strings = new Map([['budget', '45s']])
    defaultTheBudgetFlag(strings)
    expect(strings.get('budget')).toBe('45s')
  })

  it('returns the effective spec — `main` reads the return value, not the map, for its own budget clock', () => {
    // Both arms: the default just written, and a caller-supplied value passed straight through.
    expect(defaultTheBudgetFlag(new Map())).toBe('10000ms')
    expect(defaultTheBudgetFlag(new Map([['budget', '45s']]))).toBe('45s')
  })
})

describe('buildTradingApiBody', () => {
  const pair = {
    tokenIn: { ref: 'native' as const, symbol: 'ETH', decimals: 18 },
    tokenOut: { ref: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const, symbol: 'USDC', decimals: 6 },
    amountIn: 1_000_000_000_000_000_000n,
  }

  it('sends the zero address for native ETH and protocols (never routingPreference)', () => {
    const body = buildTradingApiBody(pair, 1)
    expect(body.tokenIn).toBe('0x0000000000000000000000000000000000000000')
    expect(body.tokenOut).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
    expect(body.protocols).toEqual(['V2', 'V3', 'V4'])
    expect(body).not.toHaveProperty('routingPreference')
    expect(body.type).toBe('EXACT_INPUT')
    expect(body.amount).toBe('1000000000000000000')
    expect(body.tokenInChainId).toBe(1)
    expect(body.tokenOutChainId).toBe(1)
    expect(body.swapper).toBe(TRADING_API_SWAPPER)
    expect(body.slippageTolerance).toBe(0.5)
  })

  it('passes ERC-20 addresses through unchanged on both sides', () => {
    const erc20Pair = {
      tokenIn: { ref: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as const, symbol: 'USDT', decimals: 6 },
      tokenOut: { ref: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const, symbol: 'USDC', decimals: 6 },
      amountIn: 10_000_000_000n,
    }
    const body = buildTradingApiBody(erc20Pair, 1)
    expect(body.tokenIn).toBe('0xdAC17F958D2ee523a2206206994597C13D831ec7')
    expect(body.tokenOut).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
  })
})

describe('parseTradingApiResponse', () => {
  // A hand-written fixture shaped like the live API's confirmed 1 ETH -> USDC response: a 3-way
  // split route (`quote.route` is an ARRAY OF ARRAYS of legs, one array per parallel path).
  const successSplitRoute = {
    routing: 'CLASSIC',
    quote: {
      output: { amount: '3245123456' },
      gasUseEstimate: '184000',
      gasFee: '910000000000000',
      gasFeeUSD: '3.21',
      blockNumber: '21000000',
      routeString: '[V3] 60.00% ETH -> USDC, [V3] 25.00% ETH -> USDC, [V2] 15.00% ETH -> USDC',
      priceImpact: 0.02,
      txFailureReasons: [],
      route: [
        [{ type: 'v3-pool', tokenIn: 'ETH', tokenOut: 'USDC' }],
        [{ type: 'v3-pool', tokenIn: 'ETH', tokenOut: 'USDC' }],
        [{ type: 'v2-pool', tokenIn: 'ETH', tokenOut: 'USDC' }],
      ],
    },
  }

  it('reads the confirmed field paths, including a split-route count', () => {
    const parsed = parseTradingApiResponse(successSplitRoute)
    expect(parsed.amountOut).toBe(3_245_123_456n)
    expect(parsed.routing).toBe('CLASSIC')
    expect(parsed.routeString).toBe(successSplitRoute.quote.routeString)
    expect(parsed.splitCount).toBe(3)
    expect(parsed.gasUseEstimate).toBe('184000')
    expect(parsed.gasFeeWei).toBe('910000000000000')
    expect(parsed.gasFeeUSD).toBe('3.21')
    expect(parsed.priceImpact).toBe(0.02)
  })

  it('reports splitCount 1 for a single-path route (no split)', () => {
    const singlePath = { ...successSplitRoute, quote: { ...successSplitRoute.quote, route: [successSplitRoute.quote.route[0]] } }
    expect(parseTradingApiResponse(singlePath).splitCount).toBe(1)
  })

  it('falls back through defensive amount-out paths for a nonstandard shape', () => {
    expect(parseTradingApiResponse({ amountOut: '42' }).amountOut).toBe(42n)
    expect(parseTradingApiResponse({ quote: { amountOut: '7' } }).amountOut).toBe(7n)
    expect(parseTradingApiResponse({ output: { amount: '9' } }).amountOut).toBe(9n)
  })

  it('returns an empty object (no crash) for a wholly unknown shape', () => {
    expect(parseTradingApiResponse({ somethingElse: true })).toEqual({})
    expect(parseTradingApiResponse(null)).toEqual({})
    expect(parseTradingApiResponse('not even an object')).toEqual({})
  })

  it('never invents a routeString or splitCount when quote.route is absent', () => {
    const parsed = parseTradingApiResponse({ routing: 'CLASSIC', quote: { output: { amount: '1' } } })
    expect(parsed.routeString).toBeUndefined()
    expect(parsed.splitCount).toBeUndefined()
  })
})

describe('deltaBps', () => {
  it('is signed positive when lite finds MORE output than the API', () => {
    // lite = 101, api = 100 -> +1% = +100bps (allow floating rounding to 3 decimals)
    expect(deltaBps(101n, 100n)).toBeCloseTo(100, 5)
  })

  it('is signed negative when lite finds LESS output than the API', () => {
    expect(deltaBps(99n, 100n)).toBeCloseTo(-100, 5)
  })

  it('is ~0 for equal amounts', () => {
    expect(deltaBps(100n, 100n)).toBe(0)
  })

  it('is undefined when either side is missing (a failed quote)', () => {
    expect(deltaBps(undefined, 100n)).toBeUndefined()
    expect(deltaBps(100n, undefined)).toBeUndefined()
    expect(deltaBps(undefined, undefined)).toBeUndefined()
  })

  it('is undefined rather than a division-by-zero when the API side is zero', () => {
    expect(deltaBps(100n, 0n)).toBeUndefined()
  })

  it('handles a zero lite side against a nonzero API side (a real, reportable loss)', () => {
    expect(deltaBps(0n, 100n)).toBe(-10_000)
  })
})

// ---------------------------------------------------------------------------
// Shared fixtures for the row-shaped tests below.
// ---------------------------------------------------------------------------

const EVIDENCE: LiteEvidence = {
  discovery: 'v2:complete v3:complete v4:complete',
  legsMeasured: 4,
  pairCeilingHit: false,
  exhaustive: true,
  intermediatesSelected: 2,
  intermediatesDiscovered: 2,
  quoting: { attempted: 4, succeeded: 4, failed: 0, transportFailed: 0, unattempted: 0 },
  aborted: false,
}

const pair = (label: string) => ({
  label,
  pairLabel: label,
  amountHuman: '1',
  tokenIn: { ref: 'native' as const, symbol: 'ETH', decimals: 18 },
  tokenOut: { ref: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const, symbol: 'USDC', decimals: 6 },
  amountIn: 1_000_000_000_000_000_000n,
  notes: '',
})

// The QUOTE arm specifically, not the whole union: a test that spreads this fixture to vary one flag
// needs the arm's own shape back, and a union-typed helper widens it away.
const okLite = (amountOut: bigint): Extract<ComparisonRow['lite'], { kind: 'quote' }> => ({
  kind: 'quote',
  amountOut,
  route: 'ETH -> USDC',
  finalMs: 500,
  firstActionableMs: 200,
  flags: { aborted: false, headRegressed: false, verificationDegraded: false, transportFailed: 0, hardStopped: false },
  evidence: EVIDENCE,
})

const noRouteLite = (kind: 'no-route' | 'inconclusive' = 'no-route'): ComparisonRow['lite'] => ({
  kind,
  reasonCode: 'no-route-found',
  reasonDetail: 'nothing priced',
  finalMs: 10_000,
  flags: { aborted: true, headRegressed: false, verificationDegraded: false, transportFailed: 0, hardStopped: false },
  evidence: { ...EVIDENCE, discovery: 'v2:partial v3:partial v4:partial', exhaustive: false, aborted: true },
})

const okApi = (amountOut: bigint): ComparisonRow['api'] => ({ kind: 'ok', amountOut, latencyMs: 300, raw: {} })

describe('liteEvidence', () => {
  it('renders one status word per protocol, in PROTOCOLS order, and folds the counters through', () => {
    const evidence = liteEvidence({
      block: { number: 1n, hash: '0x00', timestamp: 0n },
      discovery: {
        v2: { status: 'complete', coveredRanges: [], demandFloor: 0n },
        v3: { status: 'partial', coveredRanges: [], demandFloor: 0n },
        v4: { status: 'disabled', coveredRanges: [], demandFloor: 0n },
      },
      enumeration: {
        exhaustiveWithinMaxHops: false,
        intermediatesDiscovered: 7,
        intermediatesSelected: 3,
        intermediatesPruned: 4,
        legsMeasured: 11,
        pairCeilingHit: true,
      },
      quoting: { attempted: 12, succeeded: 10, failed: 1, transportFailed: 1, unattempted: 2 },
      aborted: true,
      verificationDegraded: false,
      headRegressed: false,
      firstRoundComplete: true,
      verification: { preflightAttempted: 0, preflightBudgetExhausted: false },
    })
    expect(evidence.discovery).toBe('v2:complete v3:partial v4:disabled')
    expect(evidence.legsMeasured).toBe(11)
    expect(evidence.pairCeilingHit).toBe(true)
    expect(evidence.exhaustive).toBe(false)
    expect(evidence.intermediatesSelected).toBe(3)
    expect(evidence.intermediatesDiscovered).toBe(7)
    expect(evidence.quoting.transportFailed).toBe(1)
    expect(evidence.aborted).toBe(true)
  })
})

describe('classifyMiss', () => {
  it('is undefined when both sides quoted within the threshold', () => {
    expect(classifyMiss({ pair: pair('a'), lite: okLite(100n), api: okApi(100n) })).toBeUndefined()
  })

  it('calls a lite no-route/inconclusive against an API quote a no-route miss', () => {
    expect(classifyMiss({ pair: pair('a'), lite: noRouteLite('no-route'), api: okApi(100n) })).toBe('no-route')
    expect(classifyMiss({ pair: pair('a'), lite: noRouteLite('inconclusive'), api: okApi(100n) })).toBe('no-route')
  })

  it('calls a thrown lite side an error miss, separately from no-route', () => {
    const lite: ComparisonRow['lite'] = { kind: 'error', message: 'boom', finalMs: 5 }
    expect(classifyMiss({ pair: pair('a'), lite, api: okApi(100n) })).toBe('error')
  })

  it('calls a delta worse than the threshold a delta miss, in either direction, exclusive at the bound', () => {
    // 100 bps exactly is NOT a miss (the threshold is exclusive); 101 bps is, and so is +101.
    expect(classifyMiss({ pair: pair('a'), lite: okLite(9_900n), api: okApi(10_000n) })).toBeUndefined()
    expect(classifyMiss({ pair: pair('a'), lite: okLite(9_800n), api: okApi(10_000n) })).toBe('delta')
    expect(classifyMiss({ pair: pair('a'), lite: okLite(10_200n), api: okApi(10_000n) })).toBe('delta')
    expect(MISS_DELTA_BPS).toBe(100)
  })

  it('calls an API failure against a lite quote a reverse miss', () => {
    const api: ComparisonRow['api'] = { kind: 'error', latencyMs: 40, httpStatus: 404, message: 'no route' }
    expect(classifyMiss({ pair: pair('a'), lite: okLite(100n), api })).toBe('reverse')
  })

  it('treats a 200 with no readable amountOut as the API having no quote', () => {
    const api: ComparisonRow['api'] = { kind: 'ok', latencyMs: 40, raw: {} }
    expect(classifyMiss({ pair: pair('a'), lite: okLite(100n), api })).toBe('reverse')
    expect(classifyMiss({ pair: pair('a'), lite: noRouteLite(), api })).toBeUndefined()
  })

  it('is never a miss when the API side was skipped — nothing to be missing from', () => {
    const api: ComparisonRow['api'] = { kind: 'skipped' }
    expect(classifyMiss({ pair: pair('a'), lite: okLite(100n), api })).toBeUndefined()
    expect(classifyMiss({ pair: pair('a'), lite: noRouteLite(), api })).toBeUndefined()
  })

  it('reports both sides failing as no miss at all (no coverage claim either way)', () => {
    const api: ComparisonRow['api'] = { kind: 'error', latencyMs: 40, message: 'timeout' }
    expect(classifyMiss({ pair: pair('a'), lite: noRouteLite(), api })).toBeUndefined()
  })
})

describe('findMisses', () => {
  it('returns misses in row order, skipping non-misses', () => {
    const rows: ComparisonRow[] = [
      { pair: pair('fine'), lite: okLite(100n), api: okApi(100n) },
      { pair: pair('missing'), lite: noRouteLite(), api: okApi(100n) },
      { pair: pair('off'), lite: okLite(1n), api: okApi(100n) },
    ]
    expect(findMisses(rows).map((m) => [m.row.pair.label, m.missClass])).toEqual([
      ['missing', 'no-route'],
      ['off', 'delta'],
    ])
  })
})

describe('summarize', () => {
  it('counts wins/ties/losses and reports median/worst delta, signed', () => {
    const rows: ComparisonRow[] = [
      { pair: pair('win'), lite: okLite(101n), api: okApi(100n) }, // +100bps: win
      { pair: pair('tie'), lite: okLite(100n), api: okApi(100n) }, // 0bps: tie
      { pair: pair('loss'), lite: okLite(90n), api: okApi(100n) }, // -1000bps: loss
    ]
    const summary = summarize(rows)
    expect(summary.pairsTotal).toBe(3)
    expect(summary.pairsCompared).toBe(3)
    expect(summary.wins).toBe(1)
    expect(summary.ties).toBe(1)
    expect(summary.losses).toBe(1)
    expect(summary.medianDeltaBps).toBe(0)
    expect(summary.worstDeltaBps).toBeCloseTo(-1000, 5)
    expect(summary.note.length).toBeGreaterThan(0)
    // The -1000bps row is BOTH a loss and a delta miss: the win/loss record and the miss counts are
    // separate readings of the same row, not a partition of the rows.
    expect(summary.missCounts).toEqual({ 'no-route': 0, delta: 1, error: 0, reverse: 0 })
    expect(summary.missesTotal).toBe(1)
  })

  it('excludes skipped/error/no-route sides from the comparison count without throwing', () => {
    const rows: ComparisonRow[] = [
      { pair: pair('skipped'), lite: okLite(100n), api: { kind: 'skipped' } },
      { pair: pair('api-error'), lite: okLite(100n), api: { kind: 'error', latencyMs: 50, message: 'boom' } },
      { pair: pair('no-route'), lite: noRouteLite(), api: okApi(100n) },
      { pair: pair('lite-error'), lite: { kind: 'error', message: 'timeout', finalMs: 999 }, api: okApi(100n) },
    ]
    const summary = summarize(rows)
    expect(summary.pairsTotal).toBe(4)
    expect(summary.pairsCompared).toBe(0)
    expect(summary.medianDeltaBps).toBeUndefined()
    expect(summary.worstDeltaBps).toBeUndefined()
    // Every class a row that never produced a delta can still land in.
    expect(summary.missCounts).toEqual({ 'no-route': 1, delta: 0, error: 1, reverse: 1 })
    expect(summary.missesTotal).toBe(3)
  })

  it('reports latency medians independently of whether a delta could be computed', () => {
    const rows: ComparisonRow[] = [
      { pair: pair('a'), lite: okLite(100n), api: { kind: 'skipped' } },
      { pair: pair('b'), lite: okLite(200n), api: { kind: 'skipped' } },
    ]
    const summary = summarize(rows)
    expect(summary.liteFinalMedianMs).toBe(500)
    expect(summary.liteFirstActionableMedianMs).toBe(200)
    expect(summary.apiMedianMs).toBeUndefined()
  })

  it('counts hard-stopped rows separately from misses — a truncated search can still quote well', () => {
    const clean = okLite(100n)
    const stopped: ComparisonRow['lite'] = {
      ...okLite(100n),
      flags: { aborted: true, headRegressed: false, verificationDegraded: false, transportFailed: 0, hardStopped: true },
    }
    const rows: ComparisonRow[] = [
      { pair: pair('stopped'), lite: stopped, api: okApi(100n) },
      { pair: pair('clean'), lite: clean, api: okApi(100n) },
      { pair: pair('threw'), lite: { kind: 'error', message: 'boom', finalMs: 1 }, api: okApi(100n) },
    ]
    const summary = summarize(rows)
    expect(summary.hardStopped).toBe(1)
    expect(summary.ties).toBe(2)
    expect(summary.missesTotal).toBe(1) // the thrown row only
  })

  it('counts a thrown lite side as hard-stopped too, when the error itself carries the flag', () => {
    // `kind: 'error'` has no `flags` object to hang `hardStopped` off — it carries its own optional
    // field instead (see `LiteSideResult`'s error arm) — so this exercises the OTHER branch of
    // `summarize`'s hard-stopped check, the one the `flags.hardStopped` case above never reaches.
    const rows: ComparisonRow[] = [
      { pair: pair('threw-hard-stopped'), lite: { kind: 'error', message: 'stream ended past budget', finalMs: 12_000, hardStopped: true }, api: okApi(100n) },
      { pair: pair('threw-plain'), lite: { kind: 'error', message: 'boom', finalMs: 1 }, api: okApi(100n) },
    ]
    const summary = summarize(rows)
    expect(summary.hardStopped).toBe(1)
    // Hard-stopped is a separate reading from the miss count: both thrown rows are still `error` misses.
    expect(summary.missCounts.error).toBe(2)
  })

  it('handles an empty row set', () => {
    const summary = summarize([])
    expect(summary.pairsTotal).toBe(0)
    expect(summary.pairsCompared).toBe(0)
    expect(summary.wins).toBe(0)
    expect(summary.medianDeltaBps).toBeUndefined()
  })
})
