import { describe, expect, it } from 'bun:test'

import { getInstantLaunchStrategy } from './addresses'
import { SupportedChainId } from './chains'
import { creatorFeesAccumulated, creatorFeesClaimable, feesCompounded } from './instantLaunchFees'

const FEES_ON = getInstantLaunchStrategy(SupportedChainId.ROBINHOOD, { creatorFeesEnabled: true })!
const FEES_OFF = getInstantLaunchStrategy(SupportedChainId.ROBINHOOD, { creatorFeesEnabled: false })!

describe('creatorFeesAccumulated', () => {
  it('sums the vault leg of each FeesCollected with per-event flooring (fees-on splitter: 4000/0 bps)', () => {
    const events = [
      { nativeAmount: 1_000_000n, tokenAmount: 500n },
      { nativeAmount: 3n, tokenAmount: 999_999n },
    ]
    // floor(1_000_000 * 4000 / 10000) = 400_000; floor(3 * 4000 / 10000) = floor(1.2) = 1.
    const accumulated = creatorFeesAccumulated(events, FEES_ON)
    expect(accumulated.native).toBe(400_001n)
    // Token side: 0 bps on the fees-on splitter — the creator share is native-only.
    expect(accumulated.token).toBe(0n)
  })

  it('floors per event, not on the total (matches the on-chain per-collect forwarding)', () => {
    // Two 4-wei events at 40%: per-event floor(1.6) = 1 each → 2; a total-based floor(3.2) would be 3.
    const events = [
      { nativeAmount: 4n, tokenAmount: 0n },
      { nativeAmount: 4n, tokenAmount: 0n },
    ]
    expect(creatorFeesAccumulated(events, FEES_ON).native).toBe(2n)
  })

  it('is always zero through the fees-off splitter (0/0 bps)', () => {
    const events = [{ nativeAmount: 10n ** 18n, tokenAmount: 10n ** 21n }]
    expect(creatorFeesAccumulated(events, FEES_OFF)).toEqual({ native: 0n, token: 0n })
  })

  it('returns zero for no events', () => {
    expect(creatorFeesAccumulated([], FEES_ON)).toEqual({ native: 0n, token: 0n })
  })

  it('rejects invalid bps and negative amounts', () => {
    expect(() => creatorFeesAccumulated([], { creatorFeeNativeBps: 10_001, creatorFeeTokenBps: 0 })).toThrow(
      'must be an integer'
    )
    expect(() => creatorFeesAccumulated([], { creatorFeeNativeBps: -1, creatorFeeTokenBps: 0 })).toThrow(
      'must be an integer'
    )
    expect(() => creatorFeesAccumulated([], { creatorFeeNativeBps: 0.5, creatorFeeTokenBps: 0 })).toThrow(
      'must be an integer'
    )
    expect(() => creatorFeesAccumulated([{ nativeAmount: -1n, tokenAmount: 0n }], FEES_ON)).toThrow('negative')
  })
})

describe('creatorFeesClaimable', () => {
  it('is accumulated minus claimed', () => {
    expect(creatorFeesClaimable(1_000n, 300n)).toBe(700n)
    expect(creatorFeesClaimable(1_000n, 0n)).toBe(1_000n)
    expect(creatorFeesClaimable(1_000n, 1_000n)).toBe(0n)
  })

  it('clamps at zero when payouts (e.g. donation-backed) exceed event-derived accumulation', () => {
    expect(creatorFeesClaimable(100n, 150n)).toBe(0n)
  })

  it('rejects negative inputs', () => {
    expect(() => creatorFeesClaimable(-1n, 0n)).toThrow('negative')
    expect(() => creatorFeesClaimable(0n, -1n)).toThrow('negative')
  })
})

describe('feesCompounded', () => {
  it('sums the compounding recipient Claimed amounts per side', () => {
    const claims = [
      { currency0Amount: 100n, currency1Amount: 5_000n },
      { currency0Amount: 23n, currency1Amount: 77n },
    ]
    expect(feesCompounded(claims)).toEqual({ native: 123n, token: 5_077n })
  })

  it('returns zero for no claims', () => {
    expect(feesCompounded([])).toEqual({ native: 0n, token: 0n })
  })

  it('rejects negative amounts', () => {
    expect(() => feesCompounded([{ currency0Amount: -1n, currency1Amount: 0n }])).toThrow('negative')
  })
})
