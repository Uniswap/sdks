import { beforeAll, describe, expect, it } from 'bun:test'
import type { Address } from 'viem'

import type { PoolRef, QuoteResult, SearchReport } from '../src/index'
import { REASON_CODES } from '../src/index'

import { setColorEnabled } from './ansi'
import { explainReason } from './reasons'
import {
  amountFor,
  describePool,
  exitCodeFor,
  formatFee,
  jsonify,
  renderQuoteResult,
  renderRoute,
  renderSearchReport,
  renderWaveLine,
  type RenderCtx,
} from './report'


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

/** A canned report exercising every axis: complete/disabled/partial discovery, pruning, reverts. */
const REPORT: SearchReport = {
  block: {
    number: 23_456_789n,
    hash: '0x12ab00000000000000000000000000000000000000000000000000000000cd34',
    timestamp: 1_735_689_600n, // 2025-01-01T00:00:00Z
  },
  discovery: {
    v2: { status: 'complete', coveredRanges: [{ fromBlock: 10_000_830n, toBlock: 23_456_789n }] },
    v3: { status: 'disabled', coveredRanges: [] },
    v4: {
      status: 'partial',
      coveredRanges: [
        { fromBlock: 21_400_000n, toBlock: 21_500_000n },
        { fromBlock: 22_000_000n, toBlock: 23_456_789n },
      ],
    },
  },
  enumeration: {
    exhaustiveWithinMaxHops: true,
    intermediatesDiscovered: 7,
    intermediatesSelected: 3,
    candidatesGenerated: 14,
    poolsPruned: 2,
    candidatesPruned: 0,
    intermediatesPruned: 4,
  },
  quoting: { attempted: 18, succeeded: 12, failed: 6, transportFailed: 0, unattempted: 0 },
  aborted: false,
  verificationDegraded: false,
  headRegressed: false,
  verification: { preflightAttempted: 2, preflightBudgetExhausted: false },
}

describe('renderSearchReport', () => {
  it('renders the full panel — snapshot against the canned report', () => {
    expect(renderSearchReport(REPORT)).toEqual([
      'search report',
      '  block         #23456789 0x12ab…cd34 2025-01-01T00:00:00Z',
      '  discovery  v2 ▰▰▰▰▰▰▰▰▰▰ complete',
      '             v3 ▱▱▱▱▱▱▱▱▱▱ disabled (no bundle in manifest)',
      '             v4 ▰▰▰▰▰▰▰▰▱▱ partial — 75.6% of blocks since #21400000 (2 ranges)',
      '  enumeration   14 candidates · 3/7 intermediates · exhaustive within 2 hops',
      '                pruned: 2 pools, 4 intermediates, 0 candidates',
      '  quoting       18 attempted = 12 ok + 6 reverted + 0 transport-lost',
      '  verification  2 preflight simulations',
    ])
  })

  it('lists anomaly flags only when set', () => {
    const noisy = {
      ...REPORT,
      aborted: true,
      headRegressed: true,
      verification: { preflightAttempted: 5, preflightBudgetExhausted: true },
    }
    const lines = renderSearchReport(noisy)
    expect(lines[lines.length - 1]).toBe('  flags         aborted · head-regressed · preflight-budget-exhausted')
  })
})

describe('route and pool rendering', () => {
  it('describes pools per protocol, fees in percent', () => {
    expect(formatFee(500)).toBe('0.05%')
    expect(formatFee(3000)).toBe('0.3%')
    expect(describePool(V3_POOL)).toBe('v3 0.05% 0xE055…939F')
  })

  it('labels the v4 dynamic-fee sentinel instead of rendering 838.8608%', () => {
    const hooks: Address = '0xb4d2000000000000000000000000000000000abc'
    const poolId = '0x9e99000000000000000000000000000000000000000000000000000000000bb0'
    const pool: PoolRef = {
      id: `v4:${poolId}`,
      currencies: ['native', USDC],
      protocol: 'v4',
      poolId,
      poolKey: { currency0: '0x0000000000000000000000000000000000000000', currency1: USDC, fee: 0x800000, tickSpacing: 60, hooks },
    }
    expect(describePool(pool)).toBe('v4 dynamic/60 0x9e99…0bb0 hooks 0xb4d2…0abc')
  })

  it('renders a route through its legs with resolved symbols', () => {
    const route = { legs: [{ pool: V3_POOL, currencyIn: 'native' as const, currencyOut: USDC }] }
    expect(renderRoute(route, CTX)).toBe('ETH ─(v3 0.05% 0xE055…939F)→ USDC')
  })

  it('falls back to raw units (marked) for a currency with unknown decimals', () => {
    const unknown: Address = '0x0000000000000000000000000000000000000123'
    expect(amountFor(CTX, unknown, 42n)).toBe('42 raw 0x0000…0123')
  })
})

describe('result rendering', () => {
  const trade = { tokenIn: 'native' as const, tokenOut: USDC, amountIn: 10n ** 18n }

  it('pairs a terminal reason with its explanation', () => {
    const result: QuoteResult = {
      status: 'no-route',
      reason: { code: 'no-viable-route', detail: 'no candidate priced' },
      search: REPORT,
      alternatives: [],
    }
    const lines = renderQuoteResult(result, trade, CTX)
    expect(lines[0]).toBe('✖ no-route  1 ETH → USDC')
    expect(lines[1]).toBe('reason no-viable-route — no candidate priced')
    expect(lines[2]).toContain('bounded search completed and priced nothing')
  })

  it('renders a successful quote with the route inline', () => {
    const result: QuoteResult = {
      status: 'quote',
      best: {
        route: { legs: [{ pool: V3_POOL, currencyIn: 'native', currencyOut: USDC }] },
        quote: { amountIn: 10n ** 18n, amountOut: 3_912_401_234n, intermediateAmounts: [3_912_401_234n] },
      },
      search: REPORT,
      alternatives: [],
    }
    const lines = renderQuoteResult(result, trade, CTX, 412)
    expect(lines[0]).toBe('✔ quote  1 ETH → USDC: 3,912.401234 USDC  (412ms)')
    expect(lines[1]).toBe('  ETH ─(v3 0.05% 0xE055…939F)→ USDC')
  })

  it('marks an improving wave line', () => {
    const result: QuoteResult = {
      status: 'quote',
      best: {
        route: { legs: [{ pool: V3_POOL, currencyIn: 'native', currencyOut: USDC }] },
        quote: { amountIn: 10n ** 18n, amountOut: 3_912_401_234n, intermediateAmounts: [] },
      },
      search: REPORT,
      alternatives: [],
    }
    expect(renderWaveLine(2, 181, result, trade, CTX, 3_900_000_000n)).toBe(
      'wave 2  +181ms  ▲ 3,912.401234 USDC  ETH ─(v3 0.05% 0xE055…939F)→ USDC [12/18 quoted]',
    )
  })
})

describe('scripting surface', () => {
  it('maps statuses to the documented exit codes', () => {
    expect(exitCodeFor('quote')).toBe(0)
    expect(exitCodeFor('ready')).toBe(0)
    expect(exitCodeFor('needs-action')).toBe(0)
    expect(exitCodeFor('no-route')).toBe(1)
    expect(exitCodeFor('inconclusive')).toBe(2)
  })

  it('serializes bigints as decimal strings', () => {
    expect(jsonify({ amountOut: 3_912_401_234n }, false)).toBe('{"amountOut":"3912401234"}')
  })

  it('explains every reason code the SDK can emit', () => {
    for (const code of REASON_CODES) {
      expect(explainReason(code).length).toBeGreaterThan(20)
    }
  })
})
