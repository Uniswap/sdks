import { describe, expect, it } from 'bun:test'

import { SupportedChainId } from '../chains'
import { BLOCK_TIME_SCHEDULE_BY_CHAIN, BLOCK_TIME_SECONDS_BY_CHAIN, DEFAULT_BLOCK_TIME_SECONDS } from '../constants'
import { LauncherSdkError } from '../errors'

import {
  blocksBetweenTimestamps,
  blocksToSeconds,
  deriveBlocks,
  type DeriveBlocksInput,
  getBlockTimeSeconds,
  hasKnownBlockTime,
  timeToBlock,
  timeToBlockOnChain,
} from './blocks'

// Base Denim activation, written out rather than read from the schedule: the first 200ms block and
// its timestamp on Base mainnet / Base Sepolia.
const BASE_DENIM_BLOCK = 53_556_127n
const BASE_DENIM_UNIX = 1_793_901_601n
const BASE_SEPOLIA_DENIM_BLOCK = 48_418_656n
const BASE_SEPOLIA_DENIM_UNIX = 1_792_605_600n

describe('getBlockTimeSeconds', () => {
  it('uses the sub-second L2 cadence for Arbitrum-family chains, not the 12s default', () => {
    // The CCA advances on blocknumberish._getBlockNumberish(), which is arbBlockNumber (L2) on
    // these chains — far faster than 12s. Falling back to the default silently shortens auctions.
    expect(getBlockTimeSeconds(SupportedChainId.ARBITRUM_ONE)).toBe(0.25)
    expect(getBlockTimeSeconds(SupportedChainId.ROBINHOOD)).toBe(0.1)
    expect(getBlockTimeSeconds(SupportedChainId.ARBITRUM_ONE)).toBeLessThan(DEFAULT_BLOCK_TIME_SECONDS)
    expect(getBlockTimeSeconds(SupportedChainId.ROBINHOOD)).toBeLessThan(DEFAULT_BLOCK_TIME_SECONDS)
  })

  it('uses the Arc cadence', () => {
    expect(getBlockTimeSeconds(SupportedChainId.ARC)).toBe(0.5)
    expect(getBlockTimeSeconds(SupportedChainId.ARC)).toBeLessThan(DEFAULT_BLOCK_TIME_SECONDS)
  })

  it('keeps the expected cadence for the other launch chains and defaults unknown chains', () => {
    expect(getBlockTimeSeconds(SupportedChainId.MAINNET)).toBe(12)
    expect(getBlockTimeSeconds(SupportedChainId.BASE, 1_793_000_000n)).toBe(2)
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

  it('spans a 14h auction correctly on Arc', () => {
    const { startBlock, endBlock } = deriveBlocks({
      startTimeUnix: start,
      endTimeUnix: end,
      currentBlock: CURRENT_BLOCK,
      nowUnix: NOW,
      blockTimeSeconds: getBlockTimeSeconds(SupportedChainId.ARC),
    })
    // 50400s / 0.5s = 100800 blocks; the 12s default would yield only 4200 (~35min of real time).
    expect(endBlock - startBlock).toBe(100_800n)
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

describe('Base Denim block-time schedule', () => {
  it('anchors each segment where the previous cadence lands it', () => {
    for (const schedule of Object.values(BLOCK_TIME_SCHEDULE_BY_CHAIN)) {
      for (let i = 1; i < schedule.length; i++) {
        const prev = schedule[i - 1]!
        const seg = schedule[i]!
        expect(seg.fromBlock).toBeGreaterThan(prev.fromBlock)
        expect((seg.fromTimestamp - prev.fromTimestamp) * 1000n).toBe(
          (seg.fromBlock - prev.fromBlock) * BigInt(prev.blockTimeMs)
        )
      }
    }
  })

  it('places the first Denim block where the chain derives it from genesis', () => {
    expect(blocksBetweenTimestamps(SupportedChainId.BASE, 1_686_789_347n, BASE_DENIM_UNIX)).toBe(BASE_DENIM_BLOCK)
    expect(blocksBetweenTimestamps(SupportedChainId.BASE_SEPOLIA, 1_695_768_288n, BASE_SEPOLIA_DENIM_UNIX)).toBe(
      BASE_SEPOLIA_DENIM_BLOCK
    )
  })

  it('reports the cadence in effect at a given time', () => {
    expect(getBlockTimeSeconds(SupportedChainId.BASE, BASE_DENIM_UNIX - 1n)).toBe(2)
    expect(getBlockTimeSeconds(SupportedChainId.BASE, BASE_DENIM_UNIX)).toBe(0.2)
    expect(getBlockTimeSeconds(SupportedChainId.BASE, 1_800_000_000)).toBe(0.2)
    expect(getBlockTimeSeconds(SupportedChainId.BASE_SEPOLIA, BASE_SEPOLIA_DENIM_UNIX - 1n)).toBe(2)
    expect(getBlockTimeSeconds(SupportedChainId.BASE_SEPOLIA, BASE_SEPOLIA_DENIM_UNIX)).toBe(0.2)
  })

  it('leaves chains without a schedule on their fixed cadence at any time', () => {
    expect(getBlockTimeSeconds(SupportedChainId.MAINNET, BASE_DENIM_UNIX)).toBe(12)
    expect(getBlockTimeSeconds(SupportedChainId.ROBINHOOD, 0)).toBe(0.1)
    expect(getBlockTimeSeconds(999_999, BASE_DENIM_UNIX)).toBe(DEFAULT_BLOCK_TIME_SECONDS)
  })
})

describe('timeToBlockOnChain', () => {
  const CURRENT_BLOCK = 50_000_000n

  it('uses 2s blocks when the whole span is before Denim', () => {
    const now = BASE_DENIM_UNIX - 86_400n
    expect(timeToBlockOnChain(SupportedChainId.BASE, now + 3_600n, CURRENT_BLOCK, now)).toBe(CURRENT_BLOCK + 1_800n)
  })

  it('uses 200ms blocks when the whole span is after Denim', () => {
    const now = BASE_DENIM_UNIX + 86_400n
    expect(timeToBlockOnChain(SupportedChainId.BASE, now + 3_600n, CURRENT_BLOCK, now)).toBe(CURRENT_BLOCK + 18_000n)
  })

  it('splits a span that crosses activation at the activation timestamp', () => {
    const now = BASE_DENIM_UNIX - 3_600n
    // 1h at 2s (1,800) + 2h at 200ms (36,000)
    expect(timeToBlockOnChain(SupportedChainId.BASE, now + 10_800n, CURRENT_BLOCK, now)).toBe(CURRENT_BLOCK + 37_800n)
  })

  it('follows the Base Sepolia activation', () => {
    const now = BASE_SEPOLIA_DENIM_UNIX - 60n
    // 60s at 2s (30) + 60s at 200ms (300)
    expect(timeToBlockOnChain(SupportedChainId.BASE_SEPOLIA, now + 120n, 0n, now)).toBe(330n)
  })

  it('counts 200ms blocks exactly over long horizons (no float drift)', () => {
    const now = BASE_DENIM_UNIX
    const hundredYears = 100n * 365n * 86_400n
    expect(timeToBlockOnChain(SupportedChainId.BASE, now + hundredYears, 0n, now)).toBe(15_768_000_000n)
  })

  it('matches the fixed-cadence conversion on chains without a schedule', () => {
    for (const chainId of [SupportedChainId.MAINNET, SupportedChainId.ROBINHOOD, SupportedChainId.ARBITRUM_ONE]) {
      for (const delta of [0n, 1n, 7n, 3_600n, 50_401n, 2_592_000n]) {
        expect(timeToBlockOnChain(chainId, 1_000n + delta, 5n, 1_000n)).toBe(
          timeToBlock(1_000n + delta, 5n, 1_000n, getBlockTimeSeconds(chainId))
        )
      }
    }
  })

  it('rounds half a block up, like the fixed-cadence conversion', () => {
    const now = BASE_DENIM_UNIX - 1_000n
    expect(timeToBlockOnChain(SupportedChainId.BASE, now + 1n, 10n, now)).toBe(11n)
  })

  it('rejects a target in the past', () => {
    const now = BASE_DENIM_UNIX + 100n
    expect(() => timeToBlockOnChain(SupportedChainId.BASE, now - 10n, CURRENT_BLOCK, now)).toThrow(LauncherSdkError)
  })
})

describe('unknown chains on the chainId path', () => {
  const UNKNOWN = 999_999

  it('every SupportedChainId has a block-time schedule or a fixed-cadence entry', () => {
    const chainIds = Object.values(SupportedChainId).filter((v): v is number => typeof v === 'number')
    expect(chainIds.length).toBeGreaterThan(0)
    for (const chainId of chainIds) {
      const known = BLOCK_TIME_SCHEDULE_BY_CHAIN[chainId] !== undefined || BLOCK_TIME_SECONDS_BY_CHAIN[chainId] !== undefined
      expect({ chainId, known }).toEqual({ chainId, known: true })
      expect(hasKnownBlockTime(chainId)).toBe(true)
      expect(() => blocksBetweenTimestamps(chainId, 0n, 3_600n)).not.toThrow()
    }
  })

  it('throws INVALID_TIME rather than silently using the 12s default', () => {
    expect(hasKnownBlockTime(UNKNOWN)).toBe(false)
    const expectInvalidTime = (fn: () => unknown) => {
      try {
        fn()
      } catch (error) {
        expect(error).toBeInstanceOf(LauncherSdkError)
        expect((error as LauncherSdkError).code).toBe('INVALID_TIME')
        return
      }
      throw new Error('expected INVALID_TIME')
    }
    expectInvalidTime(() => blocksBetweenTimestamps(UNKNOWN, 0n, 3_600n))
    expectInvalidTime(() => blocksToSeconds(UNKNOWN, 0n, 300n))
    expectInvalidTime(() => timeToBlockOnChain(UNKNOWN, 3_600n, 0n, 0n))
  })
})

describe('blocksToSeconds', () => {
  it('converts blocks before, after and across Base Denim', () => {
    expect(blocksToSeconds(SupportedChainId.BASE, BASE_DENIM_BLOCK - 1_800n, BASE_DENIM_BLOCK)).toBe(3_600)
    expect(blocksToSeconds(SupportedChainId.BASE, BASE_DENIM_BLOCK, BASE_DENIM_BLOCK + 18_000n)).toBe(3_600)
    expect(blocksToSeconds(SupportedChainId.BASE, BASE_DENIM_BLOCK - 900n, BASE_DENIM_BLOCK + 9_000n)).toBe(3_600)
    expect(
      blocksToSeconds(SupportedChainId.BASE_SEPOLIA, BASE_SEPOLIA_DENIM_BLOCK - 1n, BASE_SEPOLIA_DENIM_BLOCK + 5n)
    ).toBe(3)
  })

  it('uses the fixed cadence on chains without a schedule', () => {
    expect(blocksToSeconds(SupportedChainId.MAINNET, 100n, 400n)).toBe(3_600)
    expect(blocksToSeconds(SupportedChainId.ROBINHOOD, 0n, 36_000n)).toBe(3_600)
  })

  it('is signed and zero for an empty range', () => {
    expect(blocksToSeconds(SupportedChainId.BASE, BASE_DENIM_BLOCK + 10n, BASE_DENIM_BLOCK - 10n)).toBe(-22)
    expect(blocksToSeconds(SupportedChainId.BASE, 5n, 5n)).toBe(0)
  })
})

describe('deriveBlocks — chain-aware', () => {
  const CURRENT_BLOCK = 53_000_000n

  it('spans a 3-day Base auction that crosses Denim at both cadences', () => {
    const now = BASE_DENIM_UNIX - 86_400n
    const start = now + 3_600n
    const end = start + 259_200n
    const blocks = deriveBlocks({
      startTimeUnix: start,
      endTimeUnix: end,
      currentBlock: CURRENT_BLOCK,
      nowUnix: now,
      chainId: SupportedChainId.BASE,
    })
    // start: 1h at 2s. end: 1d at 2s (43,200) + 2d1h at 200ms (882,000).
    expect(blocks.startBlock).toBe(CURRENT_BLOCK + 1_800n)
    expect(blocks.endBlock).toBe(CURRENT_BLOCK + 925_200n)
    expect(blocks.claimBlock).toBe(blocks.endBlock)
    expect(blocks.migrationBlock).toBe(blocks.endBlock + 1n)
  })

  it('rejects a half-migrated caller that passes both chainId and blockTimeSeconds', () => {
    const now = BASE_DENIM_UNIX + 10n
    const input = {
      startTimeUnix: now + 60n,
      endTimeUnix: now + 3_660n,
      currentBlock: CURRENT_BLOCK,
      nowUnix: now,
      chainId: SupportedChainId.BASE,
      blockTimeSeconds: 2,
    } as unknown as DeriveBlocksInput
    expect(() => deriveBlocks(input)).toThrow(/either chainId or blockTimeSeconds/)
  })

  it('rejects a chain with no known block time instead of assuming the 12s default', () => {
    const input = { startTimeUnix: 1_003_600n, endTimeUnix: 1_054_000n, currentBlock: 5_000_000n, nowUnix: 1_000_000n }
    expect(() => deriveBlocks({ ...input, chainId: 999_999 })).toThrow(LauncherSdkError)
  })

  it('matches the fixed-cadence path on chains without a schedule', () => {
    const input = { startTimeUnix: 1_003_600n, endTimeUnix: 1_054_000n, currentBlock: 5_000_000n, nowUnix: 1_000_000n }
    expect(deriveBlocks({ ...input, chainId: SupportedChainId.ROBINHOOD })).toEqual(
      deriveBlocks({ ...input, blockTimeSeconds: 0.1 })
    )
  })

  it('rejects input with neither a chain nor a block time', () => {
    const input = {
      startTimeUnix: 10n,
      endTimeUnix: 20n,
      currentBlock: 0n,
      nowUnix: 0n,
    } as unknown as DeriveBlocksInput
    expect(() => deriveBlocks(input)).toThrow(LauncherSdkError)
  })
})
