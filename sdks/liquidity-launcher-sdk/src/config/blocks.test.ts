import { describe, expect, it } from 'bun:test'

import { SupportedChainId } from '../chains'
import { DEFAULT_BLOCK_TIME_SECONDS } from '../constants'

import { deriveBlocks, getBlockTimeSeconds } from './blocks'

describe('getBlockTimeSeconds', () => {
  it('uses the sub-second L2 cadence for Arbitrum-family chains, not the 12s default', () => {
    // The CCA advances on blocknumberish._getBlockNumberish(), which is arbBlockNumber (L2) on
    // these chains — far faster than 12s. Falling back to the default silently shortens auctions.
    expect(getBlockTimeSeconds(SupportedChainId.ARBITRUM_ONE)).toBe(0.25)
    expect(getBlockTimeSeconds(SupportedChainId.ROBINHOOD)).toBe(0.1)
    expect(getBlockTimeSeconds(SupportedChainId.ARBITRUM_ONE)).toBeLessThan(DEFAULT_BLOCK_TIME_SECONDS)
    expect(getBlockTimeSeconds(SupportedChainId.ROBINHOOD)).toBeLessThan(DEFAULT_BLOCK_TIME_SECONDS)
  })

  it('keeps the expected cadence for the other launch chains and defaults unknown chains', () => {
    expect(getBlockTimeSeconds(SupportedChainId.MAINNET)).toBe(12)
    expect(getBlockTimeSeconds(SupportedChainId.BASE)).toBe(2)
    expect(getBlockTimeSeconds(SupportedChainId.AVALANCHE)).toBe(1)
    expect(getBlockTimeSeconds(SupportedChainId.XLAYER)).toBe(1)
    expect(getBlockTimeSeconds(999_999)).toBe(DEFAULT_BLOCK_TIME_SECONDS)
  })
})

describe('deriveBlocks — real-time auction window is honored', () => {
  const NOW = 1_000_000n
  const CURRENT_BLOCK = 5_000_000n
  const start = NOW + 3600n // +1h
  const end = start + 50_400n // 14h window

  it('spans a 14h auction as ~14h of blocks on Robinhood (regression: was ~7min at the 12s default)', () => {
    const { startBlock, endBlock } = deriveBlocks({
      startTimeUnix: start,
      endTimeUnix: end,
      currentBlock: CURRENT_BLOCK,
      nowUnix: NOW,
      blockTimeSeconds: getBlockTimeSeconds(SupportedChainId.ROBINHOOD),
    })
    // 50400s / 0.1s = 504000 blocks; the 12s default would yield only 4200 (~7min of real time).
    expect(endBlock - startBlock).toBe(504_000n)
  })

  it('spans a 14h auction correctly on Arbitrum One', () => {
    const { startBlock, endBlock } = deriveBlocks({
      startTimeUnix: start,
      endTimeUnix: end,
      currentBlock: CURRENT_BLOCK,
      nowUnix: NOW,
      blockTimeSeconds: getBlockTimeSeconds(SupportedChainId.ARBITRUM_ONE),
    })
    // 50400s / 0.25s = 201600 blocks; the 12s default would yield only 4200 (~17min of real time).
    expect(endBlock - startBlock).toBe(201_600n)
  })
})
