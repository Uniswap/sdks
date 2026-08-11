import { beforeAll, describe, expect, it } from 'bun:test'
import type { Address } from 'viem'

import { v2PoolRef, v3PoolRef } from '../../src/experimental/index'
import type { PoolRecord } from '../../src/index'
import { setColorEnabled } from '../ansi'
import type { RenderCtx } from '../report'
import type { ResolvedToken } from '../tokens'

import { renderRecord } from './discover'

// ---------------------------------------------------------------------------
// `discover`'s counterparty column, which is the whole point of every row: for
// a pool the SDK sees, WHICH OTHER currency does it hold?
//
// The answer is a currency-FAMILY question, not an identity one, and getting
// that wrong is invisible on most rows and wrong on half of them: native and
// wrapped-native are one graph node to the SDK, so a `discover eth` run finds
// WETH pools, and an identity test ("which side isn't `native`?") answers with
// whichever side the pool happened to sort first — naming WETH, the queried
// token itself, as its own counterparty.
// ---------------------------------------------------------------------------

beforeAll(() => setColorEnabled(false))

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const POOL: Address = '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852'

const NATIVE_QUERY: ResolvedToken = { ref: 'native', symbol: 'ETH', decimals: 18 }

const CTX: RenderCtx = {
  views: new Map([
    ['native', { symbol: 'ETH', decimals: 18 }],
    [WETH.toLowerCase(), { symbol: 'WETH', decimals: 18 }],
    [USDT.toLowerCase(), { symbol: 'USDT', decimals: 6 }],
    [USDC.toLowerCase(), { symbol: 'USDC', decimals: 6 }],
  ]),
}

function record(pool: PoolRecord['pool']): PoolRecord {
  return { pool, source: 'event', createdAtBlock: 10_008_355n }
}

describe('discover’s counterparty column', () => {
  it('names the real counterpart of a WETH pool under a native query — never WETH itself', () => {
    // WETH (0xC02a…) sorts BEFORE USDT (0xdAC1…), so an identity test picks WETH here. That is the
    // bug: the row would read `↔ WETH` for a run whose whole subject is the native family.
    const row = renderRecord(record(v2PoolRef(POOL, WETH, USDT)), NATIVE_QUERY, CTX, WETH)
    expect(row).toContain('↔ USDT')
    expect(row).not.toContain('↔ WETH')
  })

  it('is order-independent — a counterpart that sorts first reads the same way', () => {
    // USDC (0xA0b8…) sorts BEFORE WETH, which is the arrangement the identity test got right by luck.
    const row = renderRecord(record(v3PoolRef(POOL, USDC, WETH, 500)), NATIVE_QUERY, CTX, WETH)
    expect(row).toContain('↔ USDC')
  })

  it('names the counterpart of an ordinary ERC-20 query too', () => {
    const usdt: ResolvedToken = { ref: USDT, symbol: 'USDT', decimals: 6 }
    const row = renderRecord(record(v2PoolRef(POOL, WETH, USDT)), usdt, CTX, WETH)
    expect(row).toContain('↔ WETH')
  })

  it('carries the pool’s provenance and quote history alongside the counterpart', () => {
    const rec: PoolRecord = { ...record(v2PoolRef(POOL, WETH, USDT)), source: 'hint', quoteFailureBlocks: 1, lastQuoteFailureBlock: 21_000_000n }
    const row = renderRecord(rec, NATIVE_QUERY, CTX, WETH)
    expect(row).toContain('hint')
    expect(row).toContain('1 failed block(s)')
  })
})
