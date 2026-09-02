import { describe, expect, it } from 'bun:test'
import { getAddress, zeroAddress } from 'viem'

import { isCreatorFeesPositionRecipient } from './addresses'
import { SupportedChainId } from './chains'
import { getBlockTimeSeconds } from './config/blocks'
import { resolveNewPoolTickSpacing } from './config/fees'
import { fdvUsdToPricePerToken } from './config/price'
import {
  PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS,
  PERMANENT_TIMELOCK_REQUEST_SECONDS,
  QUICK_LAUNCH_ALLOWED_GRADUATION_FDV_USD,
  QUICK_LAUNCH_ALLOWED_POOL_TICK_SPACINGS,
  QUICK_LAUNCH_DURATION_SECONDS,
  QUICK_LAUNCH_FLOOR_FDV_USD,
  QUICK_LAUNCH_GRADUATION_FDV_TOLERANCE_RATIO,
  QUICK_LAUNCH_GRADUATION_FDV_USD,
  QUICK_LAUNCH_GRADUATION_RAISE_USD,
  QUICK_LAUNCH_LP_FEE,
  QUICK_LAUNCH_POOL_TICK_SPACING,
  QUICK_LAUNCH_PRESET,
  QUICK_LAUNCH_RESERVED_FOR_LP_RAW,
  QUICK_LAUNCH_SOLD_SUPPLY_SHARE,
  QUICK_LAUNCH_TOTAL_SUPPLY,
  QUICK_LAUNCH_TOTAL_SUPPLY_RAW,
  getQuickLaunchDurationBlocks,
  getQuickLaunchFloorPricePerToken,
  getQuickLaunchGraduationPricePerToken,
  isPermanentTimelock,
  isQuickLaunch,
  isStructurallyPermanentLockMode,
  STRUCTURALLY_PERMANENT_LOCK_MODES,
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
    expect(QUICK_LAUNCH_PRESET.lp.fee).toBe(2_500)
    expect(QUICK_LAUNCH_PRESET.lp.tickSpacing).toBe(25)
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

describe('isPermanentTimelock — the horizon is re-derived, not read off the raw block', () => {
  // A stored unlock block encodes the block time believed when the lock was created. Chain 4663
  // has one converted at 12 s/block, a day before its 0.1 s cadence was registered: auction
  // 4663_0xC5EdF1… (2026-07-08), horizon exactly PERMANENT_TIMELOCK_REQUEST_SECONDS / 12. At the
  // real cadence that is 833 years, so it is finite — matching what the classifier already stored
  // for it (is_quick_launch = false).
  const endBlock = 4_731_535n
  const unlockBlock = endBlock + PERMANENT_TIMELOCK_REQUEST_SECONDS / 12n

  it('reports a mis-converted legacy horizon as finite, on the chain it actually runs at', () => {
    expect(isPermanentTimelock({ chainId: SupportedChainId.ROBINHOOD, endBlock, unlockBlock })).toBe(false)
  })

  it('accepts the same request converted at the correct cadence', () => {
    const correct = endBlock + PERMANENT_TIMELOCK_REQUEST_SECONDS * 10n // 0.1 s/block
    expect(isPermanentTimelock({ chainId: SupportedChainId.ROBINHOOD, endBlock, unlockBlock: correct })).toBe(true)
  })

  it('accepts a permanent lock on a slow chain, where the raw block number is small', () => {
    const end = 21_000_000n
    const unlock =
      end + BigInt(Math.ceil(PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS / getBlockTimeSeconds(SupportedChainId.MAINNET)))
    expect(unlock).toBeLessThan(3_000_000_000n) // ~2.6e9 blocks — no raw-block bound could see this
    expect(isPermanentTimelock({ chainId: SupportedChainId.MAINNET, endBlock: end, unlockBlock: unlock })).toBe(true)
  })
})

describe('isPermanentTimelock — burn is structurally permanent', () => {
  it('accepts a burn lock at unlock block 0 (block form), as burn rows carry', () => {
    expect(isPermanentTimelock({ lockMode: 'burn', chainId: CHAIN, endBlock: END, unlockBlock: 0n })).toBe(true)
  })

  it('accepts a burn lock regardless of the timestamp horizon', () => {
    expect(isPermanentTimelock({ lockMode: 'burn', endTimeSeconds: 1_753_000_000n, unlockTimeSeconds: 0n })).toBe(true)
  })

  it('does not treat other modes as structurally permanent', () => {
    expect(isPermanentTimelock({ lockMode: 'buybackBurn', chainId: CHAIN, endBlock: END, unlockBlock: 0n })).toBe(
      false
    )
    expect(isPermanentTimelock({ lockMode: 'timelock', chainId: CHAIN, endBlock: END, unlockBlock: 0n })).toBe(
      false
    )
  })
})

describe('isPermanentTimelock — creatorFees is structurally permanent', () => {
  it('accepts a creatorFees position at unlock block 0 (block form), as splitter rows carry', () => {
    expect(isPermanentTimelock({ lockMode: 'creatorFees', chainId: CHAIN, endBlock: END, unlockBlock: 0n })).toBe(true)
  })


  it('exposes the structural set: burn and creatorFees only', () => {
    expect([...STRUCTURALLY_PERMANENT_LOCK_MODES].sort()).toEqual(['burn', 'creatorFees'])
    expect(isStructurallyPermanentLockMode('creatorFees')).toBe(true)
    expect(isStructurallyPermanentLockMode('burn')).toBe(true)
    expect(isStructurallyPermanentLockMode('buybackBurn')).toBe(false)
    expect(isStructurallyPermanentLockMode('timelock')).toBe(false)
    expect(isStructurallyPermanentLockMode('feesForwarder')).toBe(false)
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

describe('isQuickLaunch — creatorFees custody qualifies', () => {
  // Callers derive this descriptor by matching MigratorParameters.positionRecipient against the
  // registry's fees-enabled splitter via isCreatorFeesPositionRecipient (addresses.ts); the fees-off
  // splitter does not qualify there, so it never reaches the matcher as 'creatorFees' — it stays an
  // unrecognized recipient, i.e. lock: null, which fails below.
  it('matches a position parked at the fee splitter — structurally permanent custody', () => {
    expect(isQuickLaunch(presetAuction({ lock: { mode: 'creatorFees', permanentTimelock: true } }))).toBe(true)
  })

  it('matches even when the caller derived permanentTimelock=false from unlock_block 0', () => {
    expect(isQuickLaunch(presetAuction({ lock: { mode: 'creatorFees', permanentTimelock: false } }))).toBe(true)
  })

  it('still rejects an unrecognized recipient (resolved as no lock)', () => {
    expect(isQuickLaunch(presetAuction({ lock: null }))).toBe(false)
  })
})

describe('isQuickLaunch — composition with the registry recipient matcher', () => {
  // How a classifier derives the 'creatorFees' descriptor from an indexed positionRecipient. The
  // matcher itself stays address-free; the registry lookup happens here, at the call site.
  const LAUNCH_CHAIN = SupportedChainId.ROBINHOOD
  const LAUNCH_START = 1_000_000n
  const LAUNCH_END = LAUNCH_START + getQuickLaunchDurationBlocks(LAUNCH_CHAIN)

  function lockFromPositionRecipient(recipient: string): QuickLaunchMatchParams['lock'] {
    return isCreatorFeesPositionRecipient(LAUNCH_CHAIN, recipient)
      ? { mode: 'creatorFees', permanentTimelock: true }
      : null
  }

  function launchWithRecipient(recipient: string): QuickLaunchMatchParams {
    return presetAuction({
      chainId: LAUNCH_CHAIN,
      startBlock: LAUNCH_START,
      endBlock: LAUNCH_END,
      lock: lockFromPositionRecipient(recipient),
    })
  }

  it('accepts a launch whose position recipient is the fees-enabled splitter', () => {
    expect(isQuickLaunch(launchWithRecipient('0x7198C32a497c09497e04C86cf8F77A244A9E4b8F'))).toBe(true)
  })

  it('rejects a launch whose position recipient is the fees-off splitter (no creator claim path)', () => {
    expect(isQuickLaunch(launchWithRecipient('0xDF50f4ea2207F9D2A753a3DaE729B36FDEF13b23'))).toBe(false)
  })

  it('rejects a launch with an unknown position recipient', () => {
    expect(isQuickLaunch(launchWithRecipient('0x0000000000000000000000000000000000000001'))).toBe(false)
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
  it('graduation FDV is $10k, decoupled from the $1k floor', () => {
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
  it('derives the floor price per token: floorFDV / 1B tokens / nativeUsd', () => {
    // $1k FDV over 1B tokens at $2,000/ETH = 1e-6 / 2000 = 5e-10 ETH per token.
    expect(getQuickLaunchFloorPricePerToken(2_000)).toBe('0.0000000005')
  })

  it('derives the graduation price per token with the same derivation as the floor', () => {
    // $10k FDV over 1B tokens at $2,500/ETH = 1e-5 / 2500 = 4e-9 ETH per token.
    expect(getQuickLaunchGraduationPricePerToken(2_500)).toBe('0.000000004')
  })

  it('is chain-neutral: on Arc (5042) the native currency is USDC, so nativeUsdPrice ≈ 1 yields a USDC-denominated floor', () => {
    const nativeUsdPrice = 1
    // $1k FDV over 1B tokens at $1/USDC = 1e-6 USDC per token.
    expect(getQuickLaunchFloorPricePerToken(nativeUsdPrice)).toBe(
      fdvUsdToPricePerToken(QUICK_LAUNCH_FLOOR_FDV_USD, QUICK_LAUNCH_TOTAL_SUPPLY, nativeUsdPrice)
    )
    expect(getQuickLaunchFloorPricePerToken(nativeUsdPrice)).toBe('0.000001')
  })

  it('keeps graduation/floor at the FDV ratio', () => {
    const nativeUsd = 3_123.45
    const floor = Number(getQuickLaunchFloorPricePerToken(nativeUsd))
    const graduation = Number(getQuickLaunchGraduationPricePerToken(nativeUsd))
    expect(graduation / floor).toBeCloseTo(QUICK_LAUNCH_GRADUATION_FDV_USD / QUICK_LAUNCH_FLOOR_FDV_USD, 6)
  })

  it('throws on a missing/invalid native-currency price so callers choose their own fallback', () => {
    expect(() => getQuickLaunchFloorPricePerToken(0)).toThrow()
    expect(() => getQuickLaunchGraduationPricePerToken(Number.NaN)).toThrow()
  })
})

describe('graduation-pool tick spacing constants', () => {
  it('matches the canonical derivation for the quick-launch fee tier', () => {
    // The 2026-08-05 chain-4663 redeploy mints graduation pools at spacing 25, and
    // `resolveNewPoolTickSpacing` maps the 2500 tier to 25, so the preset and the derivation agree.
    expect(QUICK_LAUNCH_POOL_TICK_SPACING).toBe(25)
    expect(QUICK_LAUNCH_POOL_TICK_SPACING).toBe(resolveNewPoolTickSpacing(QUICK_LAUNCH_LP_FEE))
    expect(QUICK_LAUNCH_PRESET.lp.tickSpacing).toBe(QUICK_LAUNCH_POOL_TICK_SPACING)
  })

  it('grandfathers every spacing pools were ever minted at — pools are permanent', () => {
    expect([...QUICK_LAUNCH_ALLOWED_POOL_TICK_SPACINGS]).toEqual([25, 50])
    // The current preset value is in the allowed set.
    expect(QUICK_LAUNCH_ALLOWED_POOL_TICK_SPACINGS).toContain(QUICK_LAUNCH_POOL_TICK_SPACING)
  })

  it('contains the spacing new pools are opened at, as resolved from the fee tier', () => {
    expect(QUICK_LAUNCH_ALLOWED_POOL_TICK_SPACINGS).toContain(resolveNewPoolTickSpacing(QUICK_LAUNCH_LP_FEE))
  })

  it('keeps 50: pre-redeploy graduation pools on chain 4663 are only routable through that entry when the served pool key is absent', () => {
    // 50 is not the spacing of any pool opened today, but pools are permanent: a consumer that has
    // only a token address, and no stored/served/on-chain pool key, reaches every pre-redeploy
    // graduation pool by racing this entry. Removing it makes those pools unreachable on that path.
    expect(QUICK_LAUNCH_ALLOWED_POOL_TICK_SPACINGS).toContain(50)
  })
})

describe('graduation-FDV gate constants', () => {
  it('grandfathers both the $5k historical cohort and the $10k current preset', () => {
    expect([...QUICK_LAUNCH_ALLOWED_GRADUATION_FDV_USD]).toEqual([5_000, 10_000])
    // The current preset value is in the allowed set.
    expect(QUICK_LAUNCH_ALLOWED_GRADUATION_FDV_USD).toContain(QUICK_LAUNCH_GRADUATION_FDV_USD)
  })

  it('uses a ±10% tolerance, mirroring the duration ratio', () => {
    expect(QUICK_LAUNCH_GRADUATION_FDV_TOLERANCE_RATIO).toBe(0.1)
  })
})

describe('isQuickLaunch — graduation-FDV gate', () => {
  it('leaves the assertion off when graduationFdvUsd is undefined (unresolved)', () => {
    // Structural match still classifies — nothing regresses before the backend populates the field.
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: undefined }))).toBe(true)
  })

  it('leaves the assertion off when graduationFdvUsd is null (unresolved)', () => {
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: null }))).toBe(true)
  })

  it('treats a non-finite FDV (NaN) as unresolved — a price-resolution miss must not demote', () => {
    // NaN is the natural output of a failed Number() on the native amount at ingest. Folding it into
    // the unresolved branch avoids the worse error (a false negative on an otherwise-legit launch).
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: Number.NaN }))).toBe(true)
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: Number.POSITIVE_INFINITY }))).toBe(true)
  })

  it('still asserts on 0 — 0 is finite and a real mismatch, NOT unresolved', () => {
    // Distinct from NaN: 0 is a resolved value that simply does not match any allowed preset.
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: 0 }))).toBe(false)
  })

  it('matches an exact in-set $5k graduation FDV', () => {
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: 5_000 }))).toBe(true)
  })

  it('matches an exact in-set $10k graduation FDV', () => {
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: 10_000 }))).toBe(true)
  })

  it('matches a value within tolerance of an allowed preset (±10%)', () => {
    // Accepted bands at ratio 0.1: [4500, 5500] and [9000, 11000].
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: 11_000 }))).toBe(true) // exactly at the $10k edge
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: 10_900 }))).toBe(true)
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: 9_000 }))).toBe(true) // low edge of the $10k band
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: 5_500 }))).toBe(true) // high edge of the $5k band
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: 4_500 }))).toBe(true) // low edge of the $5k band
  })

  it('rejects $12,500 — inside the old ±25% band but outside the tightened ±10%', () => {
    // At 0.25 this used to badge (10_000 edge was 12_500); at 0.1 the $10k band tops out at 11_000,
    // so $12,500 is rejected — the impersonation room the tightening removes.
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: 12_500 }))).toBe(false)
  })

  it('rejects a value that falls between the allowed presets, outside both tolerances', () => {
    // 7_000 is above the $5k band (5500) and below the $10k band (9000).
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: 7_000 }))).toBe(false)
    // 6_000 was within the old ±25% of 5_000; at ±10% (band tops at 5500) it now rejects.
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: 6_000 }))).toBe(false)
  })

  it("rejects RTH's ~$3.7B graduation FDV — the impersonation this gate closes", () => {
    // required_currency_raised = 1,000,000 ETH at the 50%-sold preset => ~$3.7B FDV, ~375,000x over
    // the $10k preset. Structurally it looks like a quick launch; the graduation gate demotes it.
    const rth = presetAuction({ graduationFdvUsd: 3_700_000_000 })
    expect(isQuickLaunch(rth)).toBe(false)
    // Proof the gate is the ONLY reason it fails: drop the FDV and it matches structurally.
    expect(isQuickLaunch(presetAuction({ ...rth, graduationFdvUsd: undefined }))).toBe(true)
  })

  it('is USD-denominated, so a legit $5k launch on a non-ETH chain passes (chain-agnostic)', () => {
    // PHILAVAX raises ~378 AVAX = ~$5k. The matcher never sees the native amount — only the USD FDV —
    // so it classifies identically regardless of chain / native token.
    const avaxLaunch = presetAuction({ chainId: SupportedChainId.MAINNET, startBlock: 20_000n })
    const withWindow = {
      ...avaxLaunch,
      endBlock: 20_000n + getQuickLaunchDurationBlocks(SupportedChainId.MAINNET),
      graduationFdvUsd: 5_000,
    }
    expect(isQuickLaunch(withWindow)).toBe(true)
  })

  it('is an ADDITIONAL gate: a good FDV cannot rescue a broken structural fingerprint', () => {
    expect(
      isQuickLaunch(presetAuction({ totalSupplyRaw: 500_000_000n * 10n ** 18n, graduationFdvUsd: 10_000 }))
    ).toBe(false)
  })

  it('honors an overridden allowed set (same mechanism as allowedDurationsSeconds)', () => {
    // $50k is not in the default set, so it fails by default...
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: 50_000 }))).toBe(false)
    // ...but passes when the caller widens the allowed set explicitly.
    expect(
      isQuickLaunch(presetAuction({ graduationFdvUsd: 50_000 }), { allowedGraduationFdvUsd: [50_000] })
    ).toBe(true)
  })

  it('honors an overridden tolerance ratio', () => {
    // 20_000 is 100% over 10_000 — far outside the default ±25%...
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: 20_000 }))).toBe(false)
    // ...but within a widened ±100% tolerance.
    expect(
      isQuickLaunch(presetAuction({ graduationFdvUsd: 20_000 }), { graduationFdvToleranceRatio: 1.0 })
    ).toBe(true)
  })
})

describe('isQuickLaunch — real prod cohort (graduation FDVs as of 2026-08-04, verified by Bruno)', () => {
  // The live auctions that motivated this gate. Each ACCEPT lands within tolerance of an allowed
  // preset ({5_000, 10_000} at ratio 0.25); the single REJECT is the $3.7B impersonation the gate
  // exists to demote. Named so the fixtures cite the real auctions.

  // ACCEPT — clustered within 0.1% of the $10k preset.
  const AROUND_10K: ReadonlyArray<readonly [name: string, fdvUsd: number]> = [
    ['COCO', 9_993],
    ['BING', 10_002],
    ['LILY', 10_077],
    ['JAM', 10_000],
    ['SKRMP', 10_000],
    ['HBD', 10_000],
    ['PCHOWD', 10_000],
    ['TEST', 10_000],
  ]

  // ACCEPT — grandfathered $5k historical cohort.
  const AROUND_5K: ReadonlyArray<readonly [name: string, fdvUsd: number]> = [
    ['CHWDR', 4_878],
    ['TOYODA', 4_870],
    ['PHIL', 4_889],
  ]

  it.each(AROUND_10K)('accepts %s ($%d) — within 0.1%% of the $10k preset', (_name, fdvUsd) => {
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: fdvUsd }))).toBe(true)
  })

  it.each(AROUND_5K)('accepts %s ($%d) — grandfathered $5k cohort', (_name, fdvUsd) => {
    expect(isQuickLaunch(presetAuction({ graduationFdvUsd: fdvUsd }))).toBe(true)
  })

  it('accepts PHILAVAX ($5,073 = 378.09 AVAX x $6.71) — proves the gate must be USD, not native', () => {
    // 378 native units would look like an outlier against an ETH-shaped threshold, but the USD FDV
    // is a legit $5k. The matcher only ever sees the USD number, so it classifies chain-agnostically.
    const philAvax = presetAuction({
      chainId: SupportedChainId.MAINNET,
      startBlock: 20_000n,
      endBlock: 20_000n + getQuickLaunchDurationBlocks(SupportedChainId.MAINNET),
      graduationFdvUsd: 5_073,
    })
    expect(isQuickLaunch(philAvax)).toBe(true)
  })

  it('rejects RTH ($3,747,000,000) — the ~375,000x impersonation this gate closes', () => {
    const rth = presetAuction({ graduationFdvUsd: 3_747_000_000 })
    expect(isQuickLaunch(rth)).toBe(false)
    // The graduation gate is the ONLY reason RTH fails — it matches the preset structurally.
    expect(isQuickLaunch(presetAuction({ ...rth, graduationFdvUsd: undefined }))).toBe(true)
  })

  it('confirms the tolerance math: the whole legit cohort [$4,870 … $10,077] passes', () => {
    const cohort = [...AROUND_10K, ...AROUND_5K, ['PHILAVAX', 5_073] as const]
    for (const [name, fdvUsd] of cohort) {
      const withinTolerance = QUICK_LAUNCH_ALLOWED_GRADUATION_FDV_USD.some(
        (allowed) => Math.abs(fdvUsd - allowed) / allowed <= QUICK_LAUNCH_GRADUATION_FDV_TOLERANCE_RATIO
      )
      expect({ name, withinTolerance }).toEqual({ name, withinTolerance: true })
    }
    // ...and RTH's $3.7B is nowhere near either allowed value.
    const rthWithin = QUICK_LAUNCH_ALLOWED_GRADUATION_FDV_USD.some(
      (allowed) => Math.abs(3_747_000_000 - allowed) / allowed <= QUICK_LAUNCH_GRADUATION_FDV_TOLERANCE_RATIO
    )
    expect(rthWithin).toBe(false)
  })
})
