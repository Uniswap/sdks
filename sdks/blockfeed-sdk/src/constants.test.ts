import { BLOCK_TIME_SECONDS_BY_CHAIN } from '@uniswap/liquidity-launcher-sdk'
import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_POLL_INTERVAL_MS,
  FALLBACK_POLL_INTERVAL_MS,
  MIN_DERIVED_POLL_INTERVAL_MS,
  resolvePollIntervalMs,
} from './constants'

describe('resolvePollIntervalMs', () => {
  it('returns the hand-tuned value for tuned chains', () => {
    expect(resolvePollIntervalMs(1)).toBe(DEFAULT_POLL_INTERVAL_MS[1]!)
    expect(resolvePollIntervalMs(8453)).toBe(DEFAULT_POLL_INTERVAL_MS[8453]!)
    expect(resolvePollIntervalMs(130)).toBe(DEFAULT_POLL_INTERVAL_MS[130]!)
  })

  it('derives max(500, blockTimeSeconds * 1000 / 2) for untuned chains the launcher knows', () => {
    // Sepolia (11155111): 12s block time, untuned here → 6000ms.
    expect(BLOCK_TIME_SECONDS_BY_CHAIN[11155111]).toBe(12)
    expect(resolvePollIntervalMs(11155111)).toBe(6_000)

    // Avalanche (43114): 1s block time → 500ms (exactly at the floor).
    expect(BLOCK_TIME_SECONDS_BY_CHAIN[43114]).toBe(1)
    expect(resolvePollIntervalMs(43114)).toBe(500)
  })

  it('floors sub-second chains at MIN_DERIVED_POLL_INTERVAL_MS', () => {
    // Arbitrum One (42161): 0.25s block time → 125ms raw, floored to 500ms.
    expect(BLOCK_TIME_SECONDS_BY_CHAIN[42161]).toBe(0.25)
    expect(resolvePollIntervalMs(42161)).toBe(MIN_DERIVED_POLL_INTERVAL_MS)
    // Robinhood (4663): 0.1s → 50ms raw, floored.
    expect(resolvePollIntervalMs(4663)).toBe(MIN_DERIVED_POLL_INTERVAL_MS)
  })

  it('falls back to the flat interval when the launcher has no block time for the chain', () => {
    const unknownChain = 987654
    expect(DEFAULT_POLL_INTERVAL_MS[unknownChain]).toBeUndefined()
    expect(BLOCK_TIME_SECONDS_BY_CHAIN[unknownChain]).toBeUndefined()
    expect(resolvePollIntervalMs(unknownChain)).toBe(FALLBACK_POLL_INTERVAL_MS)
  })
})
