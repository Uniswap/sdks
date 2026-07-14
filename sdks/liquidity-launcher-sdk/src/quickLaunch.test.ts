import { describe, expect, it } from 'bun:test'
import { getAddress, zeroAddress } from 'viem'

import { SupportedChainId } from './chains'
import { getBlockTimeSeconds } from './config/blocks'
import {
  QUICK_LAUNCH_DURATION_SECONDS,
  QUICK_LAUNCH_PRESET,
  QUICK_LAUNCH_RESERVED_FOR_LP_RAW,
  QUICK_LAUNCH_TOTAL_SUPPLY_RAW,
  getQuickLaunchDurationBlocks,
  isQuickLaunch,
  type QuickLaunchMatchParams,
} from './quickLaunch'

const CHAIN = SupportedChainId.BASE // 2s blocks
const START = 1_000_000n
// A 4h window as a block count on Base.
const END = START + getQuickLaunchDurationBlocks(CHAIN)

// An auction built straight from the preset.
function presetAuction(overrides: Partial<QuickLaunchMatchParams> = {}): QuickLaunchMatchParams {
  return {
    chainId: CHAIN,
    currency: zeroAddress,
    startBlock: START,
    endBlock: END,
    totalSupplyRaw: QUICK_LAUNCH_TOTAL_SUPPLY_RAW,
    reservedTokenAmountForLP: QUICK_LAUNCH_RESERVED_FOR_LP_RAW,
    lock: { mode: 'buybackBurn', permanentTimelock: true },
    ...overrides,
  }
}

describe('QUICK_LAUNCH_PRESET', () => {
  it('encodes the canonical defining values', () => {
    expect(QUICK_LAUNCH_PRESET.auctionType).toBe('CCA')
    expect(QUICK_LAUNCH_PRESET.durationSeconds).toBe(14_400)
    expect(QUICK_LAUNCH_DURATION_SECONDS).toBe(14_400)
    expect(QUICK_LAUNCH_PRESET.totalSupplyRaw).toBe(10n ** 27n)
    expect(QUICK_LAUNCH_PRESET.auctionSupplyRaw).toBe(5n * 10n ** 26n)
    expect(QUICK_LAUNCH_PRESET.reservedForLpRaw).toBe(5n * 10n ** 26n)
    expect(QUICK_LAUNCH_PRESET.raiseCurrency).toBe(zeroAddress)
    expect(QUICK_LAUNCH_PRESET.lp.range).toBe('CONCENTRATED_FULL_RANGE')
    expect(QUICK_LAUNCH_PRESET.lp.lockMode).toBe('buybackBurn')
    expect(QUICK_LAUNCH_PRESET.lp.permanentTimelock).toBe(true)
  })
})

describe('isQuickLaunch — a preset-built auction matches', () => {
  it('matches with the full fingerprint (supply + duration + native + reserve + lock)', () => {
    expect(isQuickLaunch(presetAuction())).toBe(true)
  })

  it('matches on the core fingerprint alone (reserve + lock omitted)', () => {
    expect(isQuickLaunch(presetAuction({ reservedTokenAmountForLP: undefined, lock: undefined }))).toBe(true)
  })

  it('matches across chains with different block times', () => {
    const chain = SupportedChainId.MAINNET // 12s blocks
    const start = 20_000n
    const end = start + getQuickLaunchDurationBlocks(chain)
    expect(isQuickLaunch(presetAuction({ chainId: chain, startBlock: start, endBlock: end }))).toBe(true)
  })
})

describe('isQuickLaunch — near-misses do NOT match', () => {
  it('wrong supply', () => {
    expect(isQuickLaunch(presetAuction({ totalSupplyRaw: 500_000_000n * 10n ** 18n }))).toBe(false)
  })

  it('wrong duration (2h instead of 4h)', () => {
    const halfWindow = getQuickLaunchDurationBlocks(CHAIN) / 2n
    expect(isQuickLaunch(presetAuction({ endBlock: START + halfWindow }))).toBe(false)
  })

  it('wrong raise denomination (an ERC20, not native)', () => {
    expect(isQuickLaunch(presetAuction({ currency: getAddress('0x15d0e0c55a3e7Ee67152ad7E89AcF164253Ff68D') }))).toBe(
      false
    )
  })

  it('missing permanent timelock (finite lock)', () => {
    expect(isQuickLaunch(presetAuction({ lock: { mode: 'buybackBurn', permanentTimelock: false } }))).toBe(false)
  })

  it('wrong lock mode (plain timelock, not buyback-&-burn)', () => {
    expect(isQuickLaunch(presetAuction({ lock: { mode: 'timelock', permanentTimelock: true } }))).toBe(false)
  })

  it('wrong LP reserve (not a 50/50 split)', () => {
    expect(isQuickLaunch(presetAuction({ reservedTokenAmountForLP: 3n * 10n ** 26n }))).toBe(false)
  })

  it('degenerate window (endBlock <= startBlock)', () => {
    expect(isQuickLaunch(presetAuction({ endBlock: START }))).toBe(false)
  })
})

describe('isQuickLaunch — duration policy', () => {
  it('rejects historical 1h auctions by default (4h-only)', () => {
    const oneHourWindow = getQuickLaunchDurationBlocks(CHAIN) / 4n
    expect(isQuickLaunch(presetAuction({ endBlock: START + oneHourWindow }))).toBe(false)
  })

  it('recognizes historical 30m/1h/4h auctions when explicitly opted in', () => {
    const oneHourWindow = BigInt(Math.round(3600 / getBlockTimeSeconds(CHAIN)))
    expect(
      isQuickLaunch(presetAuction({ endBlock: START + oneHourWindow }), {
        allowedDurationsSeconds: [1800, 3600, 14400],
      })
    ).toBe(true)
  })
})

describe('isQuickLaunch — purity', () => {
  it('is deterministic and does not mutate its input', () => {
    const params = presetAuction()
    const snapshot = JSON.stringify(params, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
    const first = isQuickLaunch(params)
    const second = isQuickLaunch(params)
    expect(first).toBe(second)
    expect(JSON.stringify(params, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(snapshot)
  })
})
