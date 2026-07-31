import { describe, expect, it } from 'bun:test'
import { getAddress, zeroAddress } from 'viem'

import { SupportedChainId } from './chains'
import { getBlockTimeSeconds } from './config/blocks'
import {
  PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS,
  PERMANENT_TIMELOCK_REQUEST_SECONDS,
  PERMANENT_UNLOCK_BLOCK_THRESHOLD,
  QUICK_LAUNCH_DURATION_SECONDS,
  QUICK_LAUNCH_FLOOR_FDV_USD,
  QUICK_LAUNCH_GRADUATION_FDV_USD,
  QUICK_LAUNCH_GRADUATION_RAISE_USD,
  QUICK_LAUNCH_PRESET,
  QUICK_LAUNCH_RESERVED_FOR_LP_RAW,
  QUICK_LAUNCH_SOLD_SUPPLY_SHARE,
  QUICK_LAUNCH_TOTAL_SUPPLY_RAW,
  getQuickLaunchDurationBlocks,
  getQuickLaunchFloorPricePerToken,
  getQuickLaunchGraduationPricePerToken,
  isPermanentTimelock,
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

describe('isQuickLaunch — reserve refinement null/undefined semantics', () => {
  it('leaves the 50/50 split unasserted when the reserve is null (unknown)', () => {
    expect(isQuickLaunch(presetAuction({ reservedTokenAmountForLP: null }))).toBe(true)
  })

  it('does not treat a zeroed strategy-getter read (0n) as a passing reserve', () => {
    expect(isQuickLaunch(presetAuction({ reservedTokenAmountForLP: 0n }))).toBe(false)
  })

  it('rejects a reserve that is half the preset split', () => {
    expect(isQuickLaunch(presetAuction({ reservedTokenAmountForLP: QUICK_LAUNCH_RESERVED_FOR_LP_RAW / 2n }))).toBe(
      false
    )
  })
})

describe('isQuickLaunch — lock refinement null/undefined semantics', () => {
  it('fails when the auction is known to have no lock (null)', () => {
    expect(isQuickLaunch(presetAuction({ lock: null }))).toBe(false)
  })

  it('leaves the lock unasserted when it has not been resolved yet (undefined)', () => {
    expect(isQuickLaunch(presetAuction({ lock: undefined }))).toBe(true)
  })

  it('rejects a permanent feesForwarder lock — the preset is buyback-&-burn', () => {
    expect(isQuickLaunch(presetAuction({ lock: { mode: 'feesForwarder', permanentTimelock: true } }))).toBe(false)
  })

  it('still fails the base fingerprint even when both refinements pass', () => {
    expect(
      isQuickLaunch(presetAuction({ currency: getAddress('0x15d0e0c55a3e7Ee67152ad7E89AcF164253Ff68D') }))
    ).toBe(false)
  })
})

describe('isPermanentTimelock', () => {
  const endBlock = END
  // The block delta that makes a timelock permanent on this chain. Derived from the block-time
  // table and the threshold, not hardcoded, so a change to either keeps these tests honest.
  const permanentUnlockBlock =
    endBlock + BigInt(Math.ceil(PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS / getBlockTimeSeconds(CHAIN)))
  const nearlyPermanentUnlockBlock =
    endBlock + BigInt(Math.floor(PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS / getBlockTimeSeconds(CHAIN)) - 1)

  it('encodes a 1000-year horizon', () => {
    expect(PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS).toBe(1000 * 365 * 86_400)
  })

  it('accepts an unlock block at or past the permanence horizon', () => {
    expect(isPermanentTimelock({ chainId: CHAIN, endBlock, unlockBlock: permanentUnlockBlock }))
      .toBe(true)
  })

  it('rejects an unlock block one block short of the horizon', () => {
    expect(isPermanentTimelock({ chainId: CHAIN, endBlock, unlockBlock: nearlyPermanentUnlockBlock }))
      .toBe(false)
  })

  it('rejects a lock that unlocks right after the auction ends', () => {
    expect(isPermanentTimelock({ chainId: CHAIN, endBlock, unlockBlock: endBlock + 1n })).toBe(false)
  })

  it('judges the horizon from the auction end, matching how the create flow derives it', () => {
    // The same unlock block fails when the auction ends later.
    expect(
      isPermanentTimelock({ chainId: CHAIN, endBlock: permanentUnlockBlock - 1n, unlockBlock: permanentUnlockBlock })
    ).toBe(false)
  })

  it('accepts a legacy max-uint256 sentinel unlock block (block form)', () => {
    const maxUint256 = 2n ** 256n - 1n
    expect(isPermanentTimelock({ chainId: CHAIN, endBlock, unlockBlock: maxUint256 })).toBe(true)
  })

  it('composes with the matcher: permanence derived from an unlock block feeds the lock descriptor', () => {
    expect(
      isQuickLaunch(
        presetAuction({
          lock: {
            mode: 'buybackBurn',
            permanentTimelock: isPermanentTimelock({ chainId: CHAIN, endBlock, unlockBlock: permanentUnlockBlock }),
          },
        })
      )
    ).toBe(true)
    expect(
      isQuickLaunch(
        presetAuction({
          lock: {
            mode: 'buybackBurn',
            permanentTimelock: isPermanentTimelock({
              chainId: CHAIN,
              endBlock,
              unlockBlock: nearlyPermanentUnlockBlock,
            }),
          },
        })
      )
    ).toBe(false)
  })
})

describe('isPermanentTimelock — timestamp form (create flow)', () => {
  const endTimeSeconds = 1_753_000_000n // an ordinary auction end time

  it('accepts the horizon the create flow requests (PERMANENT_TIMELOCK_REQUEST_SECONDS)', () => {
    expect(
      isPermanentTimelock({ endTimeSeconds, unlockTimeSeconds: endTimeSeconds + PERMANENT_TIMELOCK_REQUEST_SECONDS })
    ).toBe(true)
  })

  it('encodes the ~100k-year request as exactly 100x the classification threshold', () => {
    expect(PERMANENT_TIMELOCK_REQUEST_SECONDS).toBe(365n * 100_000n * 86_400n)
    expect(Number(PERMANENT_TIMELOCK_REQUEST_SECONDS)).toBe(100 * PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS)
  })

  it('accepts a horizon exactly at the threshold', () => {
    expect(
      isPermanentTimelock({
        endTimeSeconds,
        unlockTimeSeconds: endTimeSeconds + BigInt(PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS),
      })
    ).toBe(true)
  })

  it('rejects a horizon one second short of the threshold', () => {
    expect(
      isPermanentTimelock({
        endTimeSeconds,
        unlockTimeSeconds: endTimeSeconds + BigInt(PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS) - 1n,
      })
    ).toBe(false)
  })

  it('accepts plain number timestamps', () => {
    expect(
      isPermanentTimelock({ endTimeSeconds: 1_753_000_000, unlockTimeSeconds: 1_753_000_000 + 1001 * 365 * 86_400 })
    ).toBe(true)
  })
})

describe('isPermanentTimelock — raw-block sentinel form (chain-agnostic serving)', () => {
  it('accepts an unlock block at the sentinel threshold', () => {
    expect(isPermanentTimelock({ unlockBlock: PERMANENT_UNLOCK_BLOCK_THRESHOLD })).toBe(true)
  })

  it('rejects an unlock block one below the sentinel threshold', () => {
    expect(isPermanentTimelock({ unlockBlock: PERMANENT_UNLOCK_BLOCK_THRESHOLD - 1n })).toBe(false)
  })

  it('accepts a legacy max-uint256 sentinel unlock block', () => {
    expect(isPermanentTimelock({ unlockBlock: 2n ** 256n - 1n })).toBe(true)
  })

  it('rejects an ordinary near-term unlock block', () => {
    expect(isPermanentTimelock({ unlockBlock: 25_000_000n })).toBe(false)
  })
})

describe('isPermanentTimelock — burn is structurally permanent', () => {
  it('accepts a burn lock at unlock block 0 (block form), as burn rows carry', () => {
    expect(isPermanentTimelock({ lockMode: 'burn', chainId: CHAIN, endBlock: END, unlockBlock: 0n })).toBe(true)
  })

  it('accepts a burn lock at unlock block 0 (sentinel form)', () => {
    expect(isPermanentTimelock({ lockMode: 'burn', unlockBlock: 0n })).toBe(true)
  })

  it('accepts a burn lock regardless of the timestamp horizon', () => {
    expect(isPermanentTimelock({ lockMode: 'burn', endTimeSeconds: 1_753_000_000n, unlockTimeSeconds: 0n })).toBe(true)
  })

  it('does not treat other modes as structurally permanent', () => {
    expect(isPermanentTimelock({ lockMode: 'buybackBurn', chainId: CHAIN, endBlock: END, unlockBlock: 0n })).toBe(
      false
    )
    expect(isPermanentTimelock({ lockMode: 'timelock', unlockBlock: 0n })).toBe(false)
  })
})

describe('isQuickLaunch — burn lock qualifies', () => {
  it('matches a burn lock — strictly stronger than the preset buyback-&-burn', () => {
    expect(isQuickLaunch(presetAuction({ lock: { mode: 'burn', permanentTimelock: true } }))).toBe(true)
  })

  it('matches a burn lock even when the caller derived permanentTimelock=false from unlock_block 0', () => {
    expect(isQuickLaunch(presetAuction({ lock: { mode: 'burn', permanentTimelock: false } }))).toBe(true)
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

describe('graduation threshold constants', () => {
  it('graduation FDV is $10k (signed off 2026-07-31), decoupled from the $1k floor', () => {
    expect(QUICK_LAUNCH_GRADUATION_FDV_USD).toBe(10_000)
    expect(QUICK_LAUNCH_FLOOR_FDV_USD).toBe(1_000)
  })

  it('required raise = graduation FDV x sold share ($5k at the 50%-sold preset), never FDV 1:1', () => {
    expect(QUICK_LAUNCH_SOLD_SUPPLY_SHARE).toBe(0.5)
    expect(QUICK_LAUNCH_GRADUATION_RAISE_USD).toBe(5_000)
    expect(QUICK_LAUNCH_GRADUATION_RAISE_USD).not.toBe(QUICK_LAUNCH_GRADUATION_FDV_USD)
  })
})

describe('FDV -> price-per-token request derivation', () => {
  it('derives the floor price per token: floorFDV / 1B tokens / ethUsd', () => {
    // $1k FDV over 1B tokens at $2,000/ETH = 1e-6 / 2000 = 5e-10 ETH per token.
    expect(getQuickLaunchFloorPricePerToken(2_000)).toBe('0.0000000005')
  })

  it('derives the graduation price per token with the same derivation as the floor', () => {
    // $10k FDV over 1B tokens at $2,500/ETH = 1e-5 / 2500 = 4e-9 ETH per token.
    expect(getQuickLaunchGraduationPricePerToken(2_500)).toBe('0.000000004')
  })

  it('keeps graduation/floor at the FDV ratio', () => {
    const ethUsd = 3_123.45
    const floor = Number(getQuickLaunchFloorPricePerToken(ethUsd))
    const graduation = Number(getQuickLaunchGraduationPricePerToken(ethUsd))
    expect(graduation / floor).toBeCloseTo(QUICK_LAUNCH_GRADUATION_FDV_USD / QUICK_LAUNCH_FLOOR_FDV_USD, 6)
  })

  it('throws on a missing/invalid ETH price so callers choose their own fallback', () => {
    expect(() => getQuickLaunchFloorPricePerToken(0)).toThrow()
    expect(() => getQuickLaunchGraduationPricePerToken(Number.NaN)).toThrow()
  })
})
