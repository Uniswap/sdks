import { MIN_LP_ALLOCATION_PERCENT, MPS_TOTAL } from '../constants'
import { LauncherSdkError } from '../errors'
import type { LiquidityAllocationBracket } from '../types'

/**
 * Post-auction LP allocation → on-chain `LiquidityAllocationBracket[]`. Each bracket pairs an
 * inclusive lower bound on cumulative currency raised with an LP rate (mps).
 */

export type LpAllocationInput =
  | { kind: 'single'; percent: number }
  | {
      kind: 'tiered'
      /** Decimals of the auction raise currency; milestones are human decimals in this unit. */
      raiseCurrencyDecimals: number
      tiers: TieredLpAllocationTier[]
    }

export type TieredLpAllocationTier = { raiseMilestone: string; percent: number }

/** Sentinel for the final tier: all cumulative raises at/above the prior bound use this percent. */
export const LP_ALLOCATION_UNBOUNDED_RAISE_MILESTONE = 'unbounded' as const

const MAX_LP_ALLOCATION_UPPER_BOUND = (1n << 128n) - 1n
const MAX_LP_ALLOCATION_TIERS = 32

function percentToRate(percent: number): number {
  if (!Number.isFinite(percent) || percent < MIN_LP_ALLOCATION_PERCENT || percent > 100) {
    throw new LauncherSdkError(
      'INVALID_LP_ALLOCATION',
      `Liquidity allocation must be between ${MIN_LP_ALLOCATION_PERCENT}% and 100%.`
    )
  }
  return Math.round(percent * (MPS_TOTAL / 100))
}

function isUnboundedRaiseMilestone(raw: string): boolean {
  const t = raw.trim().toLowerCase()
  return t === '' || t === LP_ALLOCATION_UNBOUNDED_RAISE_MILESTONE
}

/**
 * Parses a non-negative human decimal amount into raw base units, with at most
 * `raiseCurrencyDecimals` digits after the decimal point (e.g. USDC 6, ETH 18).
 */
function parseRaiseMilestoneToRawUnits(raw: string, raiseCurrencyDecimals: number): bigint {
  if (!Number.isInteger(raiseCurrencyDecimals) || raiseCurrencyDecimals < 0 || raiseCurrencyDecimals > 36) {
    throw new LauncherSdkError('INVALID_LP_ALLOCATION', 'The raise currency has an unsupported number of decimals.')
  }
  const t = raw.trim()
  if (!/^\d+(\.\d+)?$/.test(t)) {
    throw new LauncherSdkError(
      'INVALID_LP_ALLOCATION',
      'Each liquidity allocation milestone must be a positive number.'
    )
  }
  const dot = t.indexOf('.')
  const intPart = dot === -1 ? t : t.slice(0, dot)
  const fracPart = dot === -1 ? '' : t.slice(dot + 1)
  if (fracPart.length > raiseCurrencyDecimals) {
    throw new LauncherSdkError(
      'INVALID_LP_ALLOCATION',
      `Each liquidity allocation milestone can have at most ${raiseCurrencyDecimals} decimal place(s) for this currency.`
    )
  }
  const intBig = BigInt(intPart)
  const scale = 10n ** BigInt(raiseCurrencyDecimals)
  const fracPadded = fracPart.padEnd(raiseCurrencyDecimals, '0')
  const fracBig = raiseCurrencyDecimals === 0 ? 0n : BigInt(fracPadded)
  const out = intBig * scale + fracBig
  if (out > MAX_LP_ALLOCATION_UPPER_BOUND) {
    throw new LauncherSdkError('INVALID_LP_ALLOCATION', 'A liquidity allocation milestone is too large.')
  }
  return out
}

/**
 * Bounded tiers may arrive in any order; sort by inclusive upper bound, then append the single
 * unbounded tail tier.
 */
function normalizeTieredLpAllocationTiers(
  tiers: TieredLpAllocationTier[],
  raiseCurrencyDecimals: number
): TieredLpAllocationTier[] {
  const boundedParsed: { tier: TieredLpAllocationTier; upper: bigint }[] = []
  const unbounded: TieredLpAllocationTier[] = []
  for (const tier of tiers) {
    if (isUnboundedRaiseMilestone(tier.raiseMilestone)) {
      unbounded.push(tier)
    } else {
      boundedParsed.push({ tier, upper: parseRaiseMilestoneToRawUnits(tier.raiseMilestone, raiseCurrencyDecimals) })
    }
  }
  if (unbounded.length === 0) {
    throw new LauncherSdkError(
      'INVALID_LP_ALLOCATION',
      'A tiered liquidity allocation must have exactly one open-ended final tier.'
    )
  }
  if (unbounded.length > 1) {
    throw new LauncherSdkError(
      'INVALID_LP_ALLOCATION',
      'A tiered liquidity allocation can have only one open-ended final tier.'
    )
  }
  boundedParsed.sort((a, b) => (a.upper < b.upper ? -1 : a.upper > b.upper ? 1 : 0))
  return [...boundedParsed.map((b) => b.tier), unbounded[0]!]
}

/**
 * Builds on-chain `LiquidityAllocationBracket[]` (`lowerThreshold` + `rate`).
 *
 * Each bounded tier's `raiseMilestone` is an INCLUSIVE upper bound on cumulative currency raised, as
 * a human-readable non-negative decimal in the raise currency (at most `raiseCurrencyDecimals`
 * fractional digits). Exactly one tier must use `''` or {@link LP_ALLOCATION_UNBOUNDED_RAISE_MILESTONE}
 * for the open-ended tail. Bounded tiers may be listed in any order.
 *
 * The contract uses inclusive lower thresholds (`raised >= lowerThreshold`). The first bracket is
 * always 0; each subsequent bracket uses `priorInclusiveUpper + 1` so the prior tier still applies
 * at exactly the user's milestone. Each bracket's percent must be at least {@link MIN_LP_ALLOCATION_PERCENT}.
 */
export function buildLpAllocationSchedule(allocation: LpAllocationInput): LiquidityAllocationBracket[] {
  if (allocation.kind === 'single') {
    return [{ lowerThreshold: 0n, rate: percentToRate(allocation.percent) }]
  }
  if (allocation.tiers.length === 0 || allocation.tiers.length > MAX_LP_ALLOCATION_TIERS) {
    throw new LauncherSdkError(
      'INVALID_LP_ALLOCATION',
      `A tiered liquidity allocation must have between 1 and ${MAX_LP_ALLOCATION_TIERS} tiers.`
    )
  }
  const { raiseCurrencyDecimals } = allocation
  const tiers = normalizeTieredLpAllocationTiers(allocation.tiers, raiseCurrencyDecimals)
  const upperBounds: bigint[] = []
  for (let i = 0; i < tiers.length - 1; i++) {
    upperBounds.push(parseRaiseMilestoneToRawUnits(tiers[i]!.raiseMilestone, raiseCurrencyDecimals))
  }
  for (const u of upperBounds) {
    if (u >= MAX_LP_ALLOCATION_UPPER_BOUND) {
      throw new LauncherSdkError('INVALID_LP_ALLOCATION', 'A liquidity allocation milestone is too large.')
    }
  }
  for (let i = 1; i < upperBounds.length; i++) {
    if (upperBounds[i]! <= upperBounds[i - 1]!) {
      throw new LauncherSdkError('INVALID_LP_ALLOCATION', 'Each liquidity allocation milestone must be unique.')
    }
  }
  return tiers.map((tier, i) => ({
    lowerThreshold: i === 0 ? 0n : upperBounds[i - 1]! + 1n,
    rate: percentToRate(tier.percent),
  }))
}
