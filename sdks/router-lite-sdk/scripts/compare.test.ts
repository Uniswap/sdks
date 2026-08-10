import { describe, expect, it } from 'bun:test'

import { UsageError } from '../cli/args'

import {
  buildTradingApiBody,
  deltaBps,
  parsePairSpec,
  parseTradingApiResponse,
  summarize,
  TRADING_API_SWAPPER,
  type ComparisonRow,
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

describe('summarize', () => {
  const pair = (label: string) => ({
    label,
    tokenIn: { ref: 'native' as const, symbol: 'ETH', decimals: 18 },
    tokenOut: { ref: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const, symbol: 'USDC', decimals: 6 },
    amountIn: 1_000_000_000_000_000_000n,
    notes: '',
  })

  const okLite = (amountOut: bigint): ComparisonRow['lite'] => ({
    kind: 'quote',
    amountOut,
    route: 'ETH -> USDC',
    finalMs: 500,
    firstActionableMs: 200,
    flags: { aborted: false, headRegressed: false, verificationDegraded: false, transportFailed: 0 },
  })

  const okApi = (amountOut: bigint): ComparisonRow['api'] => ({ kind: 'ok', amountOut, latencyMs: 300, raw: {} })

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
  })

  it('excludes skipped/error/no-route sides from the comparison count without throwing', () => {
    const rows: ComparisonRow[] = [
      { pair: pair('skipped'), lite: okLite(100n), api: { kind: 'skipped' } },
      { pair: pair('api-error'), lite: okLite(100n), api: { kind: 'error', latencyMs: 50, message: 'boom' } },
      {
        pair: pair('no-route'),
        lite: { kind: 'no-route', reasonCode: 'x', reasonDetail: 'y', finalMs: 10, flags: { aborted: false, headRegressed: false, verificationDegraded: false, transportFailed: 0 } },
        api: okApi(100n),
      },
      { pair: pair('lite-error'), lite: { kind: 'error', message: 'timeout', finalMs: 999 }, api: okApi(100n) },
    ]
    const summary = summarize(rows)
    expect(summary.pairsTotal).toBe(4)
    expect(summary.pairsCompared).toBe(0)
    expect(summary.medianDeltaBps).toBeUndefined()
    expect(summary.worstDeltaBps).toBeUndefined()
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

  it('handles an empty row set', () => {
    const summary = summarize([])
    expect(summary.pairsTotal).toBe(0)
    expect(summary.pairsCompared).toBe(0)
    expect(summary.wins).toBe(0)
    expect(summary.medianDeltaBps).toBeUndefined()
  })
})
