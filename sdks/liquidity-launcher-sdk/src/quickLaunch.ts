import { type Address } from 'viem'

import { getBlockTimeSeconds } from './config/blocks'
import type { PriceRangeKind } from './config/positions'
import {
  DEFAULT_AUCTION_STEPS,
  DEFAULT_CONVEXITY_ALPHA,
  DEFAULT_FINAL_BLOCK_PCT,
  NEW_TOKEN_DECIMALS,
  ZERO_ADDRESS,
} from './constants'
import type { LockRecipientInput } from './lock'

/**
 * The canonical "quick launch" definition — the single source of truth both universe (create flow +
 * discovery badge) and data-api (server-side classification) consume, replacing the two drifting
 * client copies that existed before.
 *
 * A quick launch is not a separate contract: it is a {@link AuctionParameters CCA auction} created
 * with this fixed, non-negotiable parameter set. Classification is therefore purely by parameters —
 * see {@link isQuickLaunch}.
 *
 * SECURITY NOTE: this classifier is a cosmetic / discovery descriptor only. Because the preset is
 * reproducible by construction (anyone can create a CCA matching these exact pure params), a positive
 * match MUST NOT gate suppression of Blockaid / token-protection warnings — it is not a trust signal.
 */

// ---------------------------------------------------------------------------
// Defining preset constants
// ---------------------------------------------------------------------------

/** Quick launches run for 4h only (14400s). Supersedes the earlier 30m/1h/4h set. */
export const QUICK_LAUNCH_DURATION_SECONDS = 14_400

/** Fixed, standardized total supply: 1,000,000,000 (1B) whole tokens (minted via the Token Factory). */
export const QUICK_LAUNCH_TOTAL_SUPPLY = 1_000_000_000n

/** Total supply in raw base units: 1B @ {@link NEW_TOKEN_DECIMALS} (18) decimals = 1e27. */
export const QUICK_LAUNCH_TOTAL_SUPPLY_RAW = QUICK_LAUNCH_TOTAL_SUPPLY * 10n ** BigInt(NEW_TOKEN_DECIMALS)

/** 50% of the total supply is auctioned. */
export const QUICK_LAUNCH_SUPPLY_AUCTIONED_PERCENT = 50

/** The auctioned half of the supply, in raw base units (5e26). */
export const QUICK_LAUNCH_AUCTION_SUPPLY_RAW = QUICK_LAUNCH_TOTAL_SUPPLY_RAW / 2n

/**
 * The other half, paired with 100% of the raised proceeds to seed the LP — i.e. the CCA's
 * `MigratorParameters.reservedTokenAmountForLP` (5e26).
 */
export const QUICK_LAUNCH_RESERVED_FOR_LP_RAW = QUICK_LAUNCH_TOTAL_SUPPLY_RAW / 2n

/** Raise denomination: ETH / the network's native token only (`address(0)` sentinel). */
export const QUICK_LAUNCH_RAISE_CURRENCY: Address = ZERO_ADDRESS

/** Starting clearing price floor, expressed as a target FDV in USD (~$5k, cheap enough to deter spam). */
export const QUICK_LAUNCH_FLOOR_FDV_USD = 5_000

/**
 * Graduation threshold as a target FDV in USD ($50k FDV clearing price → ~$25k raised, since 50% of
 * supply is auctioned).
 * PENDING SIGN-OFF: the $50k figure is not final (open product debate on failed-graduation risk).
 */
export const QUICK_LAUNCH_GRADUATION_FDV_USD = 50_000

/**
 * V4 LP fee tier in hundredths of a bip (2500 = 0.25%).
 * PENDING SIGN-OFF: 0.25% vs 0.3% is unresolved (v4 additive fees / possible higher protocol fee is a
 * governance decision). Encoding the spec's current stated value; revisit before GA.
 */
export const QUICK_LAUNCH_LP_FEE = 2_500

/** V4 LP price-range strategy: full-range + concentrated. */
export const QUICK_LAUNCH_LP_RANGE: PriceRangeKind = 'CONCENTRATED_FULL_RANGE'

/** The migrated LP is locked forever (permanent timelock) via a buyback-&-burn lock recipient. */
export const QUICK_LAUNCH_LOCK_MODE: QuickLaunchLockMode = 'buybackBurn'

/**
 * Buyback-&-burn searcher threshold: a searcher burns ~0.05% of supply to claim the accrued ETH
 * (the token portion is burned in the same call). tokenJar-style; auto-compounding was rejected.
 */
export const QUICK_LAUNCH_SEARCHER_BURN_THRESHOLD_PERCENT = 0.05

/** Default fractional tolerance when comparing a derived auction duration to the 4h target (±10%). */
export const QUICK_LAUNCH_DURATION_TOLERANCE_RATIO = 0.1

// ---------------------------------------------------------------------------
// Preset object
// ---------------------------------------------------------------------------

/** Lock-recipient modes, reused from {@link LockRecipientInput}. */
export type QuickLaunchLockMode = LockRecipientInput['mode']

/**
 * The canonical quick-launch parameter set. Every field here is chain-independent (factory tokens are
 * always 18 decimals, native raise is `address(0)` on every chain, the duration is a fixed real-time
 * window), so the preset is a frozen constant rather than a `getQuickLaunchPreset(chainId)` function.
 * The two values that ARE chain-dependent — the duration in blocks and the floor price — are
 * *derived* at build time from the chain block time / live ETH price, not stored here; see
 * {@link getQuickLaunchDurationBlocks}.
 */
export interface QuickLaunchPreset {
  /** Quick launches are always CCA auctions. */
  readonly auctionType: 'CCA'
  /** Start is instant / on-launch (not a structural match field — needs the creation block to verify). */
  readonly instantStart: true
  readonly durationSeconds: number
  readonly tokenDecimals: number
  readonly totalSupplyRaw: bigint
  readonly auctionSupplyRaw: bigint
  readonly reservedForLpRaw: bigint
  readonly supplyAuctionedPercent: number
  readonly raiseCurrency: Address
  readonly floorFdvUsd: number
  readonly graduationFdvUsd: number
  readonly lp: {
    readonly fee: number
    readonly range: PriceRangeKind
    readonly lockMode: QuickLaunchLockMode
    /** Locked forever. */
    readonly permanentTimelock: true
    readonly searcherBurnThresholdPercent: number
  }
  /** Fixed, non-configurable server-side convex emission curve (anti-snipe fairness backbone). */
  readonly emission: {
    readonly numSteps: number
    readonly finalBlockPct: number
    readonly alpha: number
  }
}

export const QUICK_LAUNCH_PRESET: QuickLaunchPreset = {
  auctionType: 'CCA',
  instantStart: true,
  durationSeconds: QUICK_LAUNCH_DURATION_SECONDS,
  tokenDecimals: NEW_TOKEN_DECIMALS,
  totalSupplyRaw: QUICK_LAUNCH_TOTAL_SUPPLY_RAW,
  auctionSupplyRaw: QUICK_LAUNCH_AUCTION_SUPPLY_RAW,
  reservedForLpRaw: QUICK_LAUNCH_RESERVED_FOR_LP_RAW,
  supplyAuctionedPercent: QUICK_LAUNCH_SUPPLY_AUCTIONED_PERCENT,
  raiseCurrency: QUICK_LAUNCH_RAISE_CURRENCY,
  floorFdvUsd: QUICK_LAUNCH_FLOOR_FDV_USD,
  graduationFdvUsd: QUICK_LAUNCH_GRADUATION_FDV_USD,
  lp: {
    fee: QUICK_LAUNCH_LP_FEE,
    range: QUICK_LAUNCH_LP_RANGE,
    lockMode: QUICK_LAUNCH_LOCK_MODE,
    permanentTimelock: true,
    searcherBurnThresholdPercent: QUICK_LAUNCH_SEARCHER_BURN_THRESHOLD_PERCENT,
  },
  emission: {
    numSteps: DEFAULT_AUCTION_STEPS,
    finalBlockPct: DEFAULT_FINAL_BLOCK_PCT,
    alpha: DEFAULT_CONVEXITY_ALPHA,
  },
}

/** The 4h window as a block count on `chainId` (uses the chain's block time). */
export function getQuickLaunchDurationBlocks(chainId: number): bigint {
  return BigInt(Math.round(QUICK_LAUNCH_DURATION_SECONDS / getBlockTimeSeconds(chainId)))
}

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

/**
 * Decoded liquidity-lock descriptor for the matcher: the lock mode plus whether the timelock is
 * permanent. Derived from an auction's `MigratorParameters.positionRecipient` lock recipient (the
 * caller decodes it; the matcher never compares against specific contract/migrator addresses — see
 * {@link isQuickLaunch}).
 */
export interface QuickLaunchLockDescriptor {
  mode: QuickLaunchLockMode
  /** Locked forever. */
  permanentTimelock: boolean
}

/**
 * The structural, address-free fields {@link isQuickLaunch} compares against the preset. Each field
 * maps to already-indexed on-chain data, so the matcher is usable both client-side (universe) and
 * server-side (data-api classifying from on-chain params).
 */
export interface QuickLaunchMatchParams {
  /** Launch chain id — needed to convert the block window into real seconds. */
  chainId: number
  /** CCA raise currency (`AuctionParameters.currency`); `address(0)` = native. */
  currency: Address
  /** CCA `AuctionParameters.startBlock`. */
  startBlock: bigint
  /** CCA `AuctionParameters.endBlock`. */
  endBlock: bigint
  /** The token's total supply in raw base units (18dp). */
  totalSupplyRaw: bigint
  /**
   * `MigratorParameters.reservedTokenAmountForLP`, if decoded. When present it must equal the preset's
   * 50% LP reserve; when omitted the 50/50 split is not asserted (the core fingerprint still classifies).
   */
  reservedTokenAmountForLP?: bigint
  /**
   * The decoded liquidity lock, if available. When present it must be a permanent buyback-&-burn lock;
   * when omitted the lock is not asserted. data-api should pass it once the migrator params are decoded
   * for a stronger match.
   */
  lock?: QuickLaunchLockDescriptor
}

export interface QuickLaunchMatchOptions {
  /** Fractional tolerance on the duration comparison. Default {@link QUICK_LAUNCH_DURATION_TOLERANCE_RATIO}. */
  durationToleranceRatio?: number
  /**
   * Durations (seconds) accepted as quick-launch. Defaults to the current canonical preset (4h only).
   *
   * POLICY: the create preset is 4h-only going forward, so new launches must match exactly 4h. This
   * matcher also classifies auctions that already exist on-chain; the earlier POC created 30m/1h/4h
   * auctions. Recognizing those historical windows is opt-in via this override
   * (`[1800, 3600, 14400]`) so callers make the choice explicitly — the default stays strict on 4h.
   */
  allowedDurationsSeconds?: readonly number[]
}

/**
 * Pure, deterministic matcher: returns whether a CCA auction's on-chain parameters match the canonical
 * {@link QUICK_LAUNCH_PRESET}. No I/O, no network, and no comparisons against specific contract/migrator
 * addresses (classification stays address-independent). Checking the raise `currency` against the native
 * zero-address sentinel is a denomination check, not an address-identity comparison.
 *
 * Presumes a CCA (v2) auction — the caller should gate on the auction version first (e.g. via the
 * factory→lens registry in `addresses`), since `AuctionParameters` is inherently CCA. The floor /
 * clearing price is intentionally NOT matched: it is derived from the live ETH price and so is not a
 * stable structural field.
 *
 * Required fingerprint (always available from indexed data): native raise currency, 1B total supply,
 * and the 4h duration. The 50/50 LP reserve and the permanent buyback-&-burn lock are matched only
 * when supplied.
 */
export function isQuickLaunch(params: QuickLaunchMatchParams, options: QuickLaunchMatchOptions = {}): boolean {
  const {
    durationToleranceRatio = QUICK_LAUNCH_DURATION_TOLERANCE_RATIO,
    allowedDurationsSeconds = [QUICK_LAUNCH_DURATION_SECONDS],
  } = options

  // Raise denomination: native only.
  if (params.currency.toLowerCase() !== QUICK_LAUNCH_RAISE_CURRENCY.toLowerCase()) {
    return false
  }

  // Total supply: exactly 1B @ 18dp.
  if (params.totalSupplyRaw !== QUICK_LAUNCH_TOTAL_SUPPLY_RAW) {
    return false
  }

  // Duration: the block window, converted to real seconds, must match an allowed duration within tolerance.
  if (params.endBlock <= params.startBlock) {
    return false
  }
  const blockDelta = params.endBlock - params.startBlock
  const durationSeconds = Number(blockDelta) * getBlockTimeSeconds(params.chainId)
  const durationMatches = allowedDurationsSeconds.some(
    (target) => Math.abs(durationSeconds - target) <= target * durationToleranceRatio
  )
  if (!durationMatches) {
    return false
  }

  // 50/50 supply split — asserted only when the LP reserve is supplied.
  if (
    params.reservedTokenAmountForLP !== undefined &&
    params.reservedTokenAmountForLP !== QUICK_LAUNCH_RESERVED_FOR_LP_RAW
  ) {
    return false
  }

  // Permanent buyback-&-burn LP lock — asserted only when a lock descriptor is supplied.
  if (params.lock !== undefined && (params.lock.mode !== QUICK_LAUNCH_LOCK_MODE || !params.lock.permanentTimelock)) {
    return false
  }

  return true
}
