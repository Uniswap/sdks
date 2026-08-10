import { beforeAll, describe, expect, it } from 'bun:test'
import type { Address } from 'viem'

import type { PoolRef, QuoteResult, SearchReport, SwapResult } from '../src/index'
import { REASON_CODES } from '../src/index'
import { assertResultCoherent, emptyReport } from '../src/internal/testing'

import { setColorEnabled } from './ansi'
import { explainReason } from './reasons'
import {
  amountFor,
  describePool,
  exitCodeFor,
  formatFee,
  jsonify,
  renderCacheLine,
  renderConfidencePanel,
  renderPoolDetailLines,
  renderQuoteResult,
  renderRoute,
  renderRunnersUp,
  renderSwapResult,
  renderTimeline,
  type FirstLeadInfo,
  type RenderCtx,
  type WaveEvent,
} from './report'


beforeAll(() => setColorEnabled(false))

const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const POOL: Address = '0xE0554a476A092703abdB3Ef35c80e0D76d32939F'
const POOL2: Address = '0x1234000000000000000000000000000000005678'

const V3_POOL: PoolRef = {
  id: `v3:${POOL.toLowerCase()}`,
  currencies: [USDC, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
  protocol: 'v3',
  address: POOL,
  token0: USDC,
  token1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  fee: 500,
}

const V2_POOL: PoolRef = {
  id: `v2:${POOL2.toLowerCase()}`,
  currencies: [USDC, USDT],
  protocol: 'v2',
  address: POOL2,
  token0: USDC,
  token1: USDT,
}

const HOOKS: Address = '0xb4d2000000000000000000000000000000000abc'
const V4_HOOKED_POOL_ID = '0x9e99000000000000000000000000000000000000000000000000000000000bb0'
const V4_HOOKED_POOL: PoolRef = {
  id: `v4:${V4_HOOKED_POOL_ID}`,
  currencies: ['native', USDC],
  protocol: 'v4',
  poolId: V4_HOOKED_POOL_ID,
  poolKey: { currency0: '0x0000000000000000000000000000000000000000', currency1: USDC, fee: 0x800000, tickSpacing: 60, hooks: HOOKS },
}

const CTX: RenderCtx = {
  views: new Map([
    ['native', { symbol: 'ETH', decimals: 18 }],
    [USDC.toLowerCase(), { symbol: 'USDC', decimals: 6 }],
    [USDT.toLowerCase(), { symbol: 'USDT', decimals: 6 }],
  ]),
}

/**
 * A canned report exercising every axis: complete/disabled/partial discovery, pruning, reverts.
 *
 * Every field the RENDERER reads is spelled out — that is the point of the snapshot below. The
 * SDK's `emptyReport()` underneath supplies the ones that are not (the anomaly flags, all false
 * here), so a new `SearchReport` field arrives with a default rather than as a type error in a
 * fixture that was never about it.
 */
const REPORT: SearchReport = {
  ...emptyReport(),
  block: {
    number: 23_456_789n,
    hash: '0x12ab00000000000000000000000000000000000000000000000000000000cd34',
    timestamp: 1_735_689_600n, // 2025-01-01T00:00:00Z
  },
  discovery: {
    v2: { status: 'complete', coveredRanges: [{ fromBlock: 10_000_830n, toBlock: 23_456_789n }], demandFloor: 10_000_830n },
    v3: { status: 'disabled', coveredRanges: [], demandFloor: 0n },
    v4: {
      status: 'partial',
      coveredRanges: [
        { fromBlock: 21_400_000n, toBlock: 21_500_000n },
        { fromBlock: 22_000_000n, toBlock: 23_456_789n },
      ],
      // Deliberately EARLIER than the first covered range's `fromBlock` (21,400,000): the
      // denominator is the demanded deployment floor, never `min(coveredRanges)` — a regression
      // back to the latter would still pass a fixture where the two happen to coincide.
      demandFloor: 21_000_000n,
    },
  },
  enumeration: {
    exhaustiveWithinMaxHops: true,
    intermediatesDiscovered: 5_992,
    intermediatesSelected: 8,
    candidatesGenerated: 14,
    poolsPruned: 2,
    candidatesPruned: 0,
    intermediatesPruned: 4,
  },
  quoting: { attempted: 127, succeeded: 90, failed: 37, transportFailed: 0, unattempted: 0 },
  verification: { preflightAttempted: 2, preflightBudgetExhausted: false },
}

describe('renderConfidencePanel', () => {
  it('renders the full panel — snapshot against the canned report', () => {
    expect(renderConfidencePanel(REPORT, { mode: 'swap' })).toEqual([
      'confidence',
      '  priced at block #23,456,789 · 2025-01-01 00:00 UTC',
      '  pool knowledge   v2 ▰▰▰▰▰▰▰▰▰▰ complete · v3 ▱▱▱▱▱▱▱▱▱▱ disabled · v4 ▰▰▰▰▰▰▱▱▱▱ 63.3% since #21.0M (~Jan 2024)',
      "  routes checked   127 = 90 priced · 37 probed pools that don't exist · 0 lost to RPC",
      '  breadth          explored 8 of 5,992 intermediate tokens — exhaustive within 2 hops',
      '  verification     2 preflight simulations',
    ])
  })

  it('dims the zero-valued revert/transport-loss terms while keeping the invariant sum visible', () => {
    const clean = { ...REPORT, quoting: { attempted: 90, succeeded: 90, failed: 0, transportFailed: 0, unattempted: 0 } }
    const lines = renderConfidencePanel(clean, { mode: 'swap' })
    const routesLine = lines.find((l) => l.startsWith('  routes checked'))!
    expect(routesLine).toBe("  routes checked   90 = 90 priced · 0 probed pools that don't exist · 0 lost to RPC")
  })

  it('keeps the never-attempted warning only when nonzero', () => {
    const withUnattempted = { ...REPORT, quoting: { ...REPORT.quoting, unattempted: 3 } }
    const lines = renderConfidencePanel(withUnattempted, { mode: 'swap' })
    expect(lines.find((l) => l.startsWith('  routes checked'))).toContain('3 never attempted')
    expect(renderConfidencePanel(REPORT, { mode: 'swap' }).find((l) => l.startsWith('  routes checked'))).not.toContain('never attempted')
  })

  it('quote mode dims the verification line to a mode note instead of a zero count', () => {
    const noPreflight = { ...REPORT, verification: { preflightAttempted: 0, preflightBudgetExhausted: false } }
    const quoteLines = renderConfidencePanel(noPreflight, { mode: 'quote' })
    expect(quoteLines.find((l) => l.includes('verification'))).toContain('quote mode')
    const swapLines = renderConfidencePanel(noPreflight, { mode: 'swap' })
    expect(swapLines.find((l) => l.includes('verification'))).toBe('  verification     0 preflight simulations')
  })

  it('renders budget-origin abort as a yellow "budget reached" note, not red "aborted"', () => {
    const aborted = { ...REPORT, aborted: true }
    const budgeted = renderConfidencePanel(aborted, { mode: 'swap', budgetMs: 60_000 })
    expect(budgeted.find((l) => l.startsWith('  notes'))).toBe('  notes            budget reached (60.0s)')
  })

  it('renders a non-budgeted abort (external signal) as plain "aborted"', () => {
    const aborted = { ...REPORT, aborted: true }
    const external = renderConfidencePanel(aborted, { mode: 'swap' })
    expect(external.find((l) => l.startsWith('  notes'))).toBe('  notes            aborted')
  })

  it('lists every other anomaly flag under notes only when set', () => {
    const noisy = {
      ...REPORT,
      headRegressed: true,
      verificationDegraded: true,
      verification: { preflightAttempted: 5, preflightBudgetExhausted: true },
    }
    const lines = renderConfidencePanel(noisy, { mode: 'swap' })
    expect(lines.find((l) => l.startsWith('  notes'))).toBe('  notes            head-regressed · verification-degraded · preflight-budget-exhausted')
  })

  it('a `complete` protocol renders full/complete even with empty coveredRanges — never "nothing covered yet"', () => {
    // The degenerate case the coverage-honesty fix rules out: a protocol fully known from an earlier
    // search can finish a run with nothing NEW walked (so `coveredRanges` may legitimately be empty
    // for a scope that needed no scanning at all) while still being `complete`. The renderer's
    // `complete` branch must key off `status` alone, never treat an empty `coveredRanges` as "nothing
    // is known".
    const zeroScanButComplete = {
      ...REPORT,
      discovery: { ...REPORT.discovery, v2: { status: 'complete' as const, coveredRanges: [], demandFloor: 0n } },
    }
    const lines = renderConfidencePanel(zeroScanButComplete, { mode: 'swap' })
    expect(lines.some((l) => l.includes('v2 ▰▰▰▰▰▰▰▰▰▰ complete'))).toBe(true)
    expect(lines.some((l) => l.includes('nothing covered yet'))).toBe(false)
  })

  it('shows pruning counters only under --verbose', () => {
    const quiet = renderConfidencePanel(REPORT, { mode: 'swap' })
    expect(quiet.some((l) => l.includes('pruned'))).toBe(false)
    const loud = renderConfidencePanel(REPORT, { mode: 'swap', verbose: true })
    expect(loud.some((l) => l.includes('pruned: 2 pools, 4 intermediates, 0 candidates'))).toBe(true)
  })

  it('approximates a partial protocol\'s demand floor age from the pinned block\'s own timestamp', () => {
    // Mainnet-shaped: 12s/block. #21.0M sits ~2.46M blocks behind #23,456,789, at 12s/block that is
    // ~342 days — from 2025-01-01 that lands in January 2024.
    const lines = renderConfidencePanel(REPORT, { mode: 'swap', blockTimeSeconds: 12 })
    expect(lines.some((l) => /since #21\.0M \(~\w{3} 202[34]\)/.test(l))).toBe(true)
  })
})

describe('route and pool rendering', () => {
  it('formats fees in percent', () => {
    expect(formatFee(500)).toBe('0.05%')
    expect(formatFee(3000)).toBe('0.3%')
  })

  it('describePool is compact (no address) by default', () => {
    expect(describePool(V3_POOL)).toBe('v3 0.05%')
    expect(describePool(V2_POOL)).toBe('v2')
  })

  it('--addresses restores the address-inclusive shape', () => {
    expect(describePool(V3_POOL, { addresses: true })).toBe('v3 0.05% 0xE055…939F')
    expect(describePool(V2_POOL, { addresses: true })).toBe('v2 0x1234…5678')
  })

  it('compacts a hooked v4 pool to `v4 <fee>+hooks`, and dynamic fee to `dyn`', () => {
    expect(describePool(V4_HOOKED_POOL)).toBe('v4 dyn+hooks')
    const unhooked: PoolRef = {
      ...V4_HOOKED_POOL,
      poolKey: { ...V4_HOOKED_POOL.poolKey, fee: 3000, hooks: '0x0000000000000000000000000000000000000000' },
    }
    expect(describePool(unhooked)).toBe('v4 0.3%')
  })

  it('labels the v4 dynamic-fee sentinel (and hooks address) under --addresses instead of rendering 838.8608%', () => {
    expect(describePool(V4_HOOKED_POOL, { addresses: true })).toBe('v4 dynamic/60 0x9e99…0bb0 hooks 0xb4d2…0abc')
  })

  it('renders a route through its legs, compactly, with resolved symbols', () => {
    const route = { legs: [{ pool: V3_POOL, currencyIn: 'native' as const, currencyOut: USDC }] }
    expect(renderRoute(route, CTX)).toBe('ETH ─ v3 0.05% → USDC')
  })

  it('renders a two-hop route chaining through the intermediate', () => {
    const route = {
      legs: [
        { pool: V4_HOOKED_POOL, currencyIn: 'native' as const, currencyOut: USDC },
        { pool: V2_POOL, currencyIn: USDC, currencyOut: USDT },
      ],
    }
    expect(renderRoute(route, CTX)).toBe('ETH ─ v4 dyn+hooks → USDC ─ v2 → USDT')
  })

  it('falls back to raw units (marked) for a currency with unknown decimals', () => {
    const unknown: Address = '0x0000000000000000000000000000000000000123'
    expect(amountFor(CTX, unknown, 42n)).toBe('42 raw 0x0000…0123')
  })

  describe('pool detail lines (address demotion)', () => {
    it('shows one dim address line for a single-hop route', () => {
      const route = { legs: [{ pool: V3_POOL, currencyIn: 'native' as const, currencyOut: USDC }] }
      expect(renderPoolDetailLines(route)).toEqual(['        pool 0xE055…939F'])
    })

    it('hop-numbers a two-hop route, and includes the hooks address on the hooked hop', () => {
      const route = {
        legs: [
          { pool: V3_POOL, currencyIn: 'native' as const, currencyOut: USDC },
          { pool: V4_HOOKED_POOL, currencyIn: USDC, currencyOut: USDC },
        ],
      }
      expect(renderPoolDetailLines(route)).toEqual(['        hop 1  pool 0xE055…939F', '        hop 2  pool 0x9e99…0bb0 hooks 0xb4d2…0abc'])
    })

    it('is suppressed entirely under --addresses — the address is already inline', () => {
      const route = { legs: [{ pool: V3_POOL, currencyIn: 'native' as const, currencyOut: USDC }] }
      expect(renderPoolDetailLines(route, { addresses: true })).toEqual([])
    })
  })
})

describe('renderRunnersUp — the delta table', () => {
  const best = {
    route: { legs: [{ pool: V3_POOL, currencyIn: 'native' as const, currencyOut: USDC }] },
    quote: { amountIn: 10n ** 18n, amountOut: 1_877_840_000n, intermediateAmounts: [] },
  }

  it('renders nothing for zero alternatives', () => {
    expect(renderRunnersUp(best, [], USDC, CTX)).toEqual([])
  })

  it('computes signed Δ amount + Δ bps against best, with adaptive precision and aligned columns', () => {
    const alt1 = {
      route: {
        legs: [
          { pool: V4_HOOKED_POOL, currencyIn: 'native' as const, currencyOut: USDC },
          { pool: V2_POOL, currencyIn: USDC, currencyOut: USDT },
        ],
      },
      quote: { amountIn: 10n ** 18n, amountOut: 1_877_540_000n, intermediateAmounts: [] }, // -0.30 USDC
    }
    const alt2 = {
      route: { legs: [{ pool: V3_POOL, currencyIn: 'native' as const, currencyOut: USDC }] },
      quote: { amountIn: 10n ** 18n, amountOut: 1_877_420_000n, intermediateAmounts: [] }, // -0.42 USDC
    }
    const lines = renderRunnersUp(best, [alt1, alt2], USDC, CTX)
    expect(lines[0]).toBe('runners-up                Δ vs best')
    // -0.30/1,877.84 * 10000 ≈ -1.598 bps; -0.42/1,877.84 * 10000 ≈ -2.236 bps
    expect(lines[1]).toBe('    -0.30 USDC   -1.6 bps   ETH ─ v4 dyn+hooks → USDC ─ v2 → USDT')
    // Route column padded (trailing spaces) to the widest cell — alt1's two-hop route — since
    // neither alternative carries a gas note here.
    expect(lines[2]).toMatch(/^ {4}-0\.42 USDC {3}-2\.2 bps {3}ETH ─ v3 0\.05% → USDC\s*$/)
  })

  it('caps at 5 rows and reports the overflow count', () => {
    const alts = Array.from({ length: 8 }, (_, i) => ({
      route: { legs: [{ pool: V3_POOL, currencyIn: 'native' as const, currencyOut: USDC }] },
      quote: { amountIn: 10n ** 18n, amountOut: best.quote.amountOut - BigInt(i + 1) * 1_000n, intermediateAmounts: [] },
    }))
    const lines = renderRunnersUp(best, alts, USDC, CTX)
    expect(lines).toHaveLength(1 + 5 + 1)
    expect(lines[lines.length - 1]).toBe('    … and 3 more')
  })

  it('aligns the trailing gas note to the widest route cell', () => {
    const alt1 = {
      route: {
        legs: [
          { pool: V4_HOOKED_POOL, currencyIn: 'native' as const, currencyOut: USDC },
          { pool: V2_POOL, currencyIn: USDC, currencyOut: USDT },
        ],
      },
      quote: { amountIn: 10n ** 18n, amountOut: 1_877_540_000n, intermediateAmounts: [], gasEstimate: 424_000n },
    }
    const alt2 = {
      route: { legs: [{ pool: V3_POOL, currencyIn: 'native' as const, currencyOut: USDC }] },
      quote: { amountIn: 10n ** 18n, amountOut: 1_877_420_000n, intermediateAmounts: [], gasEstimate: 89_000n },
    }
    const lines = renderRunnersUp(best, [alt1, alt2], USDC, CTX)
    const gasCol1 = lines[1]!.indexOf('~424k gas')
    const gasCol2 = lines[2]!.indexOf('~89k gas')
    expect(gasCol1).toBe(gasCol2)
  })

  it('restores inline addresses on alternative routes under --addresses', () => {
    const alt = {
      route: { legs: [{ pool: V3_POOL, currencyIn: 'native' as const, currencyOut: USDC }] },
      quote: { amountIn: 10n ** 18n, amountOut: 1_877_420_000n, intermediateAmounts: [] },
    }
    const lines = renderRunnersUp(best, [alt], USDC, CTX, { addresses: true })
    expect(lines[1]).toContain('0xE055…939F')
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

  it('renders a successful quote headline with the route inline and its own detail line', () => {
    const result: QuoteResult = {
      status: 'quote',
      best: {
        route: { legs: [{ pool: V3_POOL, currencyIn: 'native', currencyOut: USDC }] },
        quote: { amountIn: 10n ** 18n, amountOut: 3_912_401_234n, intermediateAmounts: [3_912_401_234n] },
      },
      search: REPORT,
      alternatives: [],
    }
    const lines = renderQuoteResult(result, trade, CTX, { elapsedMs: 412 })
    expect(lines[0]).toBe('✔ 1 ETH → 3,912.401234 USDC  best of 1 route · 412ms')
    expect(lines[1]).toBe('  ETH ─ v3 0.05% → USDC')
    expect(lines[2]).toBe('        pool 0xE055…939F')
  })

  it('appends an implied unit price when amountIn is not exactly 1 of the in-token', () => {
    const result: QuoteResult = {
      status: 'quote',
      best: {
        route: { legs: [{ pool: V3_POOL, currencyIn: 'native', currencyOut: USDC }] },
        quote: { amountIn: 2n * 10n ** 18n, amountOut: 3_755_680_000n, intermediateAmounts: [] },
      },
      search: REPORT,
      alternatives: [],
    }
    const twoEth = { ...trade, amountIn: 2n * 10n ** 18n }
    const lines = renderQuoteResult(result, twoEth, CTX)
    expect(lines[0]).toContain('(1 ETH = 1,877.84 USDC)')
  })

  it('skips the implied price when amountIn is exactly 1 of the in-token — it would be redundant', () => {
    const result: QuoteResult = {
      status: 'quote',
      best: {
        route: { legs: [{ pool: V3_POOL, currencyIn: 'native', currencyOut: USDC }] },
        quote: { amountIn: 10n ** 18n, amountOut: 1_877_840_000n, intermediateAmounts: [] },
      },
      search: REPORT,
      alternatives: [],
    }
    const lines = renderQuoteResult(result, trade, CTX)
    expect(lines[0]).not.toContain('=')
  })

  it('--addresses restores inline addresses and drops the detail line', () => {
    const result: QuoteResult = {
      status: 'quote',
      best: {
        route: { legs: [{ pool: V3_POOL, currencyIn: 'native', currencyOut: USDC }] },
        quote: { amountIn: 10n ** 18n, amountOut: 3_912_401_234n, intermediateAmounts: [] },
      },
      search: REPORT,
      alternatives: [],
    }
    const lines = renderQuoteResult(result, trade, CTX, { addresses: true })
    expect(lines[1]).toBe('  ETH ─ v3 0.05% 0xE055…939F → USDC')
    expect(lines.some((l) => l.includes('pool 0xE055'))).toBe(false)
  })

  it('explains a best that its own alternatives outprice, instead of rendering a broken sort', () => {
    // Live regression, Base, `rl quote eth usdc 1 --watch --budget 60s`: `best` came back at
    // 1,906.256081 USDC with `alternatives[0]` — a hooked v4 pool — at 1,906.567949. The ranking was
    // right (`rankRoutes`' 5-bps simplicity margin, 1.6 bps here) but the panel said nothing about
    // it. What reached the terminal was a leader beaten by its own runner-up with no explanation.
    const hooked: PoolRef = {
      id: 'v4:0x964600000000000000000000000000000000000000000000000000000000c7ab',
      currencies: ['native', USDC],
      protocol: 'v4',
      poolId: '0x964600000000000000000000000000000000000000000000000000000000c7ab',
      poolKey: {
        currency0: '0x0000000000000000000000000000000000000000',
        currency1: USDC,
        fee: 0,
        tickSpacing: 1,
        hooks: '0x1Df600000000000000000000000000000000658b',
      },
    }
    const result: QuoteResult = {
      status: 'quote',
      best: {
        route: { legs: [{ pool: V3_POOL, currencyIn: 'native', currencyOut: USDC }] },
        quote: { amountIn: 10n ** 18n, amountOut: 1_906_256_081n, intermediateAmounts: [] },
        promotedOverComplex: true,
      },
      alternatives: [
        {
          route: { legs: [{ pool: hooked, currencyIn: 'native', currencyOut: USDC }] },
          quote: { amountIn: 10n ** 18n, amountOut: 1_906_567_949n, intermediateAmounts: [] },
        },
      ],
      search: REPORT,
    }
    const lines = renderQuoteResult(result, trade, CTX)
    expect(lines[0]).toBe('✔ 1 ETH → 1,906.256081 USDC')
    expect(lines[1]).toBe('  ETH ─ v3 0.05% → USDC')
    expect(lines[3]).toBe('  promoted-over-complex — a hooked/mixed-protocol route quoted 1,906.567949 USDC')
    expect(lines[4]).toBe('  giving up 0.311868 USDC (1.635 bps) to stay on a simple route — see alternatives below')
    // The engine's honesty invariant agrees: an inversion is legal only while the marker survives.
    expect(() => assertResultCoherent(result)).not.toThrow()
  })

  it('prints the quoter gas figure, dimmed and rounded, on the best line', () => {
    const result: QuoteResult = {
      status: 'quote',
      best: {
        route: { legs: [{ pool: V3_POOL, currencyIn: 'native', currencyOut: USDC }] },
        quote: { amountIn: 10n ** 18n, amountOut: 3_912_401_234n, intermediateAmounts: [], gasEstimate: 186_412n },
      },
      search: REPORT,
      alternatives: [],
    }
    const lines = renderQuoteResult(result, trade, CTX)
    expect(lines[1]).toBe('  ETH ─ v3 0.05% → USDC ~186k gas')
  })

  it('says nothing about gas when the route carries no estimate', () => {
    const result: QuoteResult = {
      status: 'quote',
      best: {
        route: { legs: [{ pool: V3_POOL, currencyIn: 'native', currencyOut: USDC }] },
        quote: { amountIn: 10n ** 18n, amountOut: 3_912_401_234n, intermediateAmounts: [] },
      },
      search: REPORT,
      alternatives: [],
    }
    expect(renderQuoteResult(result, trade, CTX).join('\n')).not.toContain('gas')
  })

})

describe('the "how it went" timeline', () => {
  const trade = { tokenIn: 'native' as const, tokenOut: USDC, amountIn: 10n ** 18n }
  const bestRoute = {
    route: { legs: [{ pool: V3_POOL, currencyIn: 'native' as const, currencyOut: USDC }] },
    quote: { amountIn: 10n ** 18n, amountOut: 1_877_840_000n, intermediateAmounts: [] },
  }

  function quoteWith(amountOut: bigint, attempted: number, succeeded: number, aborted = false): QuoteResult {
    return {
      status: 'quote',
      best: { ...bestRoute, quote: { ...bestRoute.quote, amountOut } },
      alternatives: [],
      search: { ...REPORT, quoting: { ...REPORT.quoting, attempted, succeeded }, aborted },
    }
  }

  it('renders nothing when there is no first lead and no waves', () => {
    expect(renderTimeline(undefined, [], trade, CTX)).toEqual([])
  })

  it('renders the first-lead line, labeled by origin, always marked unverified', () => {
    const first: FirstLeadInfo = { elapsedMs: 82, route: bestRoute, origin: 'cache' }
    const lines = renderTimeline(first, [], trade, CTX)
    expect(lines[0]).toBe('how it went')
    expect(lines[1]).toContain('lead from cache')
    expect(lines[1]).toContain('unverified')
  })

  it('labels a hinted vs. a freshly-probed lead differently', () => {
    const hint: FirstLeadInfo = { elapsedMs: 10, route: bestRoute, origin: 'hint' }
    const probe: FirstLeadInfo = { elapsedMs: 10, route: bestRoute, origin: 'probe' }
    expect(renderTimeline(hint, [], trade, CTX)[1]).toContain('lead from a hinted pool')
    expect(renderTimeline(probe, [], trade, CTX)[1]).toContain('lead from a fresh probe')
  })

  it('the confirmation wave (index 0) reports quoting counters and whether the lead held', () => {
    const first: FirstLeadInfo = { elapsedMs: 82, route: bestRoute, origin: 'cache' }
    const held: WaveEvent = { elapsedMs: 700, result: quoteWith(1_877_840_000n, 124, 86) }
    const lines = renderTimeline(first, [held], trade, CTX)
    expect(lines[2]).toContain('confirmed on-chain')
    expect(lines[2]).toContain('86 of 124 candidate routes priced')
    expect(lines[2]).toContain('lead holds')
  })

  it('reports "lead changed" when the confirmed wave leader differs from the first lead', () => {
    const first: FirstLeadInfo = { elapsedMs: 82, route: bestRoute, origin: 'cache' }
    const changed: WaveEvent = { elapsedMs: 700, result: quoteWith(1_900_000_000n, 124, 86) }
    const lines = renderTimeline(first, [changed], trade, CTX)
    expect(lines[2]).toContain('lead changed')
  })

  it('a scan wave after confirmation reports "nothing beat it" when the leader is unchanged', () => {
    const first: FirstLeadInfo = { elapsedMs: 82, route: bestRoute, origin: 'cache' }
    const confirm: WaveEvent = { elapsedMs: 700, result: quoteWith(1_877_840_000n, 124, 86) }
    const scan: WaveEvent = { elapsedMs: 62_600, result: quoteWith(1_877_840_000n, 127, 90, true) }
    const lines = renderTimeline(first, [confirm, scan], trade, CTX, { budgetMs: 60_000 })
    expect(lines[3]).toContain('scanned pool history for anything better')
    expect(lines[3]).toContain('nothing beat it')
    expect(lines[3]).toContain('budget reached')
    expect(lines[3]).toContain('60.0s')
  })

  it('a scan wave reports the signed improvement when a later wave beats the leader', () => {
    const first: FirstLeadInfo = { elapsedMs: 82, route: bestRoute, origin: 'cache' }
    const confirm: WaveEvent = { elapsedMs: 700, result: quoteWith(1_877_840_000n, 124, 86) }
    const better: WaveEvent = { elapsedMs: 5_000, result: quoteWith(1_880_000_000n, 130, 95) }
    const lines = renderTimeline(first, [confirm, better], trade, CTX)
    expect(lines[3]).toContain('found a better route')
    expect(lines[3]).toContain('+2.16 USDC')
  })

  it('never appends a budget note to a wave the search did not actually abort on', () => {
    const first: FirstLeadInfo = { elapsedMs: 82, route: bestRoute, origin: 'cache' }
    const confirm: WaveEvent = { elapsedMs: 700, result: quoteWith(1_877_840_000n, 124, 86, false) }
    const lines = renderTimeline(first, [confirm], trade, CTX, { budgetMs: 60_000 })
    expect(lines[2]).not.toContain('budget')
  })
})

describe('renderSwapResult', () => {
  const UR: Address = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af'
  const PERMIT2: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3'

  it('renders the needs-action checklist, tx, and limits panel — snapshot', () => {
    const result: SwapResult = {
      status: 'needs-action',
      best: {
        route: { legs: [{ pool: V3_POOL, currencyIn: USDC, currencyOut: 'native' }] },
        quote: { amountIn: 250_000_000n, amountOut: 100_000_000_000_000_000n, intermediateAmounts: [] },
        execution: 'needs-action',
      },
      tx: { to: UR, data: '0xdeadbeef', value: 0n },
      requirements: [
        { kind: 'erc20-approval', token: USDC, spender: PERMIT2, minimumAmount: 250_000_000n },
        { kind: 'permit2-allowance', token: USDC, spender: UR, minimumAmount: 250_000_000n },
      ],
      limits: { minAmountOut: 99_000_000_000_000_000n, deadline: 2_000_000_000n },
      search: REPORT,
      alternatives: [],
    }
    const trade = { tokenIn: USDC, tokenOut: 'native' as const, amountIn: 250_000_000n }
    expect(renderSwapResult(result, trade, CTX, { elapsedMs: 412 })).toEqual([
      '● 250 USDC → 0.1 ETH  (1 USDC = 0.0004 ETH)  best of 1 route · 412ms',
      '  USDC ─ v3 0.05% → ETH  needs-action',
      '        pool 0xE055…939F',
      'before sending:',
      '  • approve USDC to Permit2 0x0000…8BA3 for ≥ 250 USDC',
      '  • set Permit2 allowance USDC → 0x66a9…A8Af for ≥ 250 USDC',
      'tx',
      `  to    ${UR}`,
      '  value 0 ETH',
      '  data  0xdeadbeef',
      'limits minAmountOut 0.099 ETH · deadline 2033-05-18 03:33 UTC',
      '',
      ...renderConfidencePanel(REPORT, { mode: 'swap' }),
    ])
  })
})

describe('renderCacheLine', () => {
  it('renders pools, per-protocol coverage, age, and slow-load — the full line', () => {
    const line = renderCacheLine({
      chainId: 1,
      pools: 1_204,
      perProtocol: { v2: { pct: 0.34, complete: false }, v3: { pct: 0.61, complete: false }, v4: { pct: 1, complete: true } },
      ageMs: 3 * 60_000,
      loadMs: 700,
    })
    expect(line).toBe('cache: chain 1 · 1,204 pools · v2 34% v3 61% v4 ✓ · updated 3m ago · 0.7s load')
  })

  it('renders a protocol with no manifest bundle as "disabled", distinct from a real 0%', () => {
    const line = renderCacheLine({
      chainId: 8453,
      pools: 0,
      perProtocol: { v2: { pct: 0, complete: false }, v4: { pct: 0, complete: false } },
      loadMs: 10,
    })
    expect(line).toContain('v3 disabled')
    expect(line).toContain('v2 0%')
  })

  it('omits the age when there was nothing on disk to date it, and the load time when it was fast', () => {
    const line = renderCacheLine({ chainId: 1, pools: 0, perProtocol: {}, loadMs: 3 })
    expect(line).not.toContain('updated')
    expect(line).not.toContain('load')
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
