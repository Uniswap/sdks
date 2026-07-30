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
 * The canonical "quick launch" definition — the single source of truth that client-side (create
 * flow + discovery badge) and server-side (classification) consumers share, replacing the two
 * drifting client copies that existed before.
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

// ---------------------------------------------------------------------------
// Permanence (LP-1362): the ONE definition of a "permanent" lock
// ---------------------------------------------------------------------------
// "Permanent" used to be defined independently in three places — the create
// flow's requested horizon (rh-cca's local `PERMANENT_TIMELOCK_SECONDS`), the
// data-api classifier's threshold (`PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS`,
// backend#11194), and this SDK's bare `permanentTimelock: true` declaration —
// plus a fourth, chain-agnostic raw-block sentinel serving `lockedForever`
// (data-api's `PERMANENT_UNLOCK_BLOCK_THRESHOLD`). They now all live here,
// next to {@link QUICK_LAUNCH_LOCK_MODE}, and every consumer imports them:
// changing one in isolation is no longer possible.

/**
 * Minimum lock horizon past the auction end, in real seconds, for a timelock to count as
 * *permanent* (1000 years). The preset declares `permanentTimelock: true`; this is the canonical
 * operational threshold shared by every consumer (create flow, liquidity service, server-side
 * classifier) so they cannot drift on what "permanent" means.
 *
 * The create flow requests {@link PERMANENT_TIMELOCK_REQUEST_SECONDS} (~100k years) past the
 * auction end, which the liquidity service converts to a block number the lock recipient stores as
 * an immutable. Only that block number is observable on-chain, so permanence is re-derived from it
 * — see {@link isPermanentTimelock}. 1000 years sits in a very wide empty band — exactly 100x
 * under what the flow requests, ~100x over the longest plausible real lock — so block-time drift
 * cannot move an auction across it.
 */
export const PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS = 1000 * 365 * 86_400

/**
 * The lock horizon the create flow *requests* for a permanent lock: `unlockTimeUnix = auctionEnd +
 * 365 * 100_000 days` (~100k years — apps/web's `TimeLockPreset.Permanent`; previously duplicated
 * as rh-cca's local `PERMANENT_TIMELOCK_SECONDS`). Deliberately ~100x over the classification
 * threshold ({@link PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS}) so a requested-permanent lock can
 * never be classified finite, on any plausible block-time table.
 */
export const PERMANENT_TIMELOCK_REQUEST_SECONDS = 365n * 100_000n * 86_400n

/**
 * Chain-AGNOSTIC approximation: a raw unlock block at or past this threshold counts as permanent
 * without consulting the chain's block time (previously data-api's serving-side
 * `PERMANENT_UNLOCK_BLOCK_THRESHOLD`, gating the `lockedForever` proto field).
 *
 * Use the chain-aware forms of {@link isPermanentTimelock} whenever the chain id and auction end
 * are available — a single block count cannot express "1000 years" on every chain (on a 0.1s
 * chain this threshold is only ~600 years). This form exists for call sites that only have the
 * stored unlock block, and it still catches every real permanent lock: the create flow's ~100k-year
 * request converts to far more than 2e11 blocks on any chain, and legacy max-uint sentinel unlock
 * blocks trivially exceed it.
 */
export const PERMANENT_UNLOCK_BLOCK_THRESHOLD = 200_000_000_000n

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

/**
 * Lock-recipient modes ({@link LockRecipientInput}) plus `'burn'`: the LP position minted straight
 * to the burn address, with no recipient contract at all. `'burn'` is not a buildable
 * {@link LockRecipientInput} mode — there is nothing to deploy — but it is a first-class lock mode
 * for classification: a burned position is irrecoverable, i.e. *structurally* permanent, and such
 * rows carry `unlock_block = 0` (there is no timelock to expire), so permanence for `'burn'` must
 * never be derived from an unlock horizon — {@link isPermanentTimelock} short-circuits on it.
 *
 * PRODUCT DECISION (LP-1345/LP-1362, Bruno on backend#11194): a burn lock QUALIFIES as a quick
 * launch — strictly stronger than the preset's buyback-&-burn lock — so {@link isQuickLaunch}
 * accepts it and consumers no longer need a local `'burn'` → `'buybackBurn'` fold.
 */
export type QuickLaunchLockMode = LockRecipientInput['mode'] | 'burn'

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

/**
 * Inputs to {@link isPermanentTimelock} — the one permanence predicate, accepting each of the forms
 * its call sites actually hold, so no consumer needs a local reformulation of the rule:
 *
 * 1. **Block form** (`{chainId, endBlock, unlockBlock}`) — the canonical, chain-aware check used by
 *    classifiers over indexed data: the block horizon past the auction end, converted to real
 *    seconds via the chain block time, must reach
 *    {@link PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS}. Legacy max-uint sentinel unlock blocks pass
 *    naturally (their horizon is astronomically large).
 * 2. **Timestamp form** (`{endTimeSeconds, unlockTimeSeconds}`) — the same horizon rule over real
 *    seconds, for the create flow, which reasons in unix time *before* the liquidity service
 *    converts its request to a block number.
 * 3. **Raw-block sentinel form** (`{unlockBlock}` alone) — the chain-agnostic
 *    {@link PERMANENT_UNLOCK_BLOCK_THRESHOLD} approximation, for serving-side call sites that have
 *    only the stored unlock block. Prefer the chain-aware forms when possible.
 *
 * `lockMode` may accompany any form: `'burn'` is *structurally* permanent (the position is
 * irrecoverable and such rows carry `unlock_block = 0`), so it short-circuits to `true` before any
 * horizon math.
 */
export type PermanentTimelockParams = {
  /** When supplied, `'burn'` is permanent by construction regardless of the block/time inputs. */
  lockMode?: QuickLaunchLockMode
} & (
  | { chainId: number; endBlock: bigint; unlockBlock: bigint }
  | { endTimeSeconds: bigint | number; unlockTimeSeconds: bigint | number }
  | { chainId?: undefined; endBlock?: undefined; unlockBlock: bigint }
)

/**
 * The canonical predicate for whether a liquidity lock is *permanent* (LP-1362) — judged past the
 * auction end because that is how the create flow derives `unlockTimeUnix` before it is converted
 * to the block number the recipient stores as an immutable. See {@link PermanentTimelockParams}
 * for the three accepted input forms and the `'burn'` structural short-circuit.
 */
export function isPermanentTimelock(params: PermanentTimelockParams): boolean {
  // A burned position has no timelock to expire — permanence is structural, not derived. Burn rows
  // carry unlock_block = 0, so falling through to the horizon math would wrongly report finite.
  if (params.lockMode === 'burn') {
    return true
  }
  // Timestamp form: the create flow's real-seconds horizon past the auction end.
  if ('endTimeSeconds' in params) {
    return Number(params.unlockTimeSeconds) - Number(params.endTimeSeconds) >= PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS
  }
  // Block form: chain-aware horizon via the chain block time.
  if (params.chainId !== undefined && params.endBlock !== undefined) {
    const horizonSeconds = Number(params.unlockBlock - params.endBlock) * getBlockTimeSeconds(params.chainId)
    return horizonSeconds >= PERMANENT_TIMELOCK_MIN_HORIZON_SECONDS
  }
  // Sentinel form: chain-agnostic raw-block approximation.
  return params.unlockBlock >= PERMANENT_UNLOCK_BLOCK_THRESHOLD
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
 * maps to already-indexed on-chain data, so the matcher is usable both client-side and
 * server-side (classifying from on-chain params).
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
   * `MigratorParameters.reservedTokenAmountForLP` (readable from the LBP strategy's
   * `initializers(initializer)` getter, or the flat `reserves(initializer)` on later revisions), if
   * decoded. When present it must equal the preset's 50% LP reserve; `undefined` and `null` both
   * mean *unknown* and leave the 50/50 split unasserted (the core fingerprint still classifies).
   * NOTE: the strategy getter returns a zeroed struct for an unset/consumed entry — callers must map
   * such a read to `null`/`undefined`, never pass the raw `0n`, which is a real (failing) value.
   */
  reservedTokenAmountForLP?: bigint | null
  /**
   * The liquidity lock decoded from `MigratorParameters.positionRecipient`, when resolved.
   * `undefined` means *not resolved yet* and leaves the lock unasserted; `null` means *resolved: this
   * auction has no lock*, which fails the match — an unlocked LP position is not the preset. When
   * present it must be a permanent buyback-&-burn lock (see {@link isPermanentTimelock} for deriving
   * permanence from the recipient's immutable unlock block) — or a `'burn'` lock, which is strictly
   * stronger and structurally permanent (see {@link QuickLaunchLockMode}).
   */
  lock?: QuickLaunchLockDescriptor | null
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
 * when supplied — with one asymmetry: a `null` lock is a *resolved* answer (known to have no lock)
 * and fails, while a `null` reserve is merely unknown and stays unasserted. Since a refinement can
 * only turn a match into a non-match, classifying without them is a safe over-approximation that a
 * later pass can tighten.
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

  // 50/50 supply split (MigratorParameters.reservedTokenAmountForLP) — asserted only when the LP
  // reserve is known; undefined/null both mean unknown and leave it unasserted.
  if (
    params.reservedTokenAmountForLP !== undefined &&
    params.reservedTokenAmountForLP !== null &&
    params.reservedTokenAmountForLP !== QUICK_LAUNCH_RESERVED_FOR_LP_RAW
  ) {
    return false
  }

  // Permanent buyback-&-burn LP lock (decoded from MigratorParameters.positionRecipient).
  // `null` is a resolved answer — the auction is known to have no lock, which the preset forbids.
  if (params.lock === null) {
    return false
  }
  // Asserted only when a lock descriptor is supplied; undefined = not resolved yet, unasserted.
  // A 'burn' lock qualifies (strictly stronger than the preset — see QuickLaunchLockMode) and is
  // structurally permanent, so it passes regardless of the caller-derived permanentTimelock flag
  // (burn rows carry unlock_block = 0, from which a horizon derivation would report finite).
  if (params.lock !== undefined && params.lock.mode !== 'burn') {
    if (params.lock.mode !== QUICK_LAUNCH_LOCK_MODE || !params.lock.permanentTimelock) {
      return false
    }
  }

  return true
}
