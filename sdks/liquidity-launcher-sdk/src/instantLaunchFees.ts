import { FEE_SPLIT_BPS_DENOMINATOR } from './addresses'
import { LauncherSdkError } from './errors'

/**
 * Pure fee math over indexed Instant Launch fee events. Dependency-light (native BigInt only) so
 * both indexer/backend and frontend consumers compute the three creator-fee metrics — accumulated,
 * claimable, compounded — from the same implementation:
 *
 * - **Accumulated**: `FeeSplitter.FeesCollected(tokenId, token, nativeAmount, tokenAmount)` fires
 *   once per collected position with the full realized amounts; the splitter then forwards each
 *   immutable split leg as `floor(amount * bps / 10000)` and attributes it in the recipient. Summing
 *   the per-event floors of the vault leg therefore reproduces the vault's on-chain attribution
 *   exactly (sub-bps dust stays in the splitter and is flushed into the NEXT FeesCollected amount).
 * - **Claimable**: attribution minus payouts — the vault's `Claimed(tokenId, ...)` events carry the
 *   actual paid amounts.
 * - **Compounded**: the CompoundingClaimRecipient enforces a same-transaction liquidity increase on
 *   the claimed position, so its `Claimed` events are proofs of compounding; summing them measures
 *   the fees released for compounding.
 *
 * The per-splitter bps live in the deployment registry
 * ({@link import('./addresses').InstantLaunchDeployment.creatorFeeNativeBps}): 4000 native / 0 token
 * on the fees-on splitter, 0 / 0 on the fees-off one.
 */

/** A `FeeSplitter.FeesCollected` event's amounts (both sides of one collect for one position). */
export interface FeesCollectedAmounts {
  /** The native ETH (currency0) fees collected. */
  nativeAmount: bigint
  /** The token (currency1) fees collected. */
  tokenAmount: bigint
}

/** A claim recipient `Claimed` event's amounts (vault or compounding recipient payout). */
export interface ClaimedAmounts {
  /** The native ETH (currency0) amount paid out. */
  currency0Amount: bigint
  /** The token (currency1) amount paid out. */
  currency1Amount: bigint
}

/** The creator's share of collected fees, in bps per currency side (see the deployment registry). */
export interface CreatorFeeSplitBps {
  /** Native-side (ETH) bps forwarded to the beneficiary vault. */
  creatorFeeNativeBps: number
  /** Token-side bps forwarded to the beneficiary vault. */
  creatorFeeTokenBps: number
}

/** A native + token amount pair. */
export interface NativeAndTokenAmounts {
  native: bigint
  token: bigint
}

/**
 * Creator fees accumulated for one position: the sum of the beneficiary-vault leg over its
 * `FeesCollected` events, floored per event exactly as the FeeSplitter forwards it
 * (`floor(amount * bps / 10000)` per collect). Pass the registry deployment entry (or its bps) of
 * the splitter that emitted the events — the fees-off splitter has 0 bps, so its launches always
 * accumulate 0. Exact vs the vault's on-chain per-tokenId attribution (donation-attribution aside).
 */
export function creatorFeesAccumulated(
  feesCollectedEvents: readonly FeesCollectedAmounts[],
  split: CreatorFeeSplitBps
): NativeAndTokenAmounts {
  const nativeBps = toBps(split.creatorFeeNativeBps, 'creatorFeeNativeBps')
  const tokenBps = toBps(split.creatorFeeTokenBps, 'creatorFeeTokenBps')
  let native = 0n
  let token = 0n
  for (const event of feesCollectedEvents) {
    requireNonNegative(event.nativeAmount, 'nativeAmount')
    requireNonNegative(event.tokenAmount, 'tokenAmount')
    // BigInt division floors, matching the on-chain per-event integer division.
    native += (event.nativeAmount * nativeBps) / BigInt(FEE_SPLIT_BPS_DENOMINATOR)
    token += (event.tokenAmount * tokenBps) / BigInt(FEE_SPLIT_BPS_DENOMINATOR)
  }
  return { native, token }
}

/**
 * Creator fees still claimable: accumulated minus already claimed, floored at zero. `claimed` is the
 * sum of the beneficiary vault's `Claimed` payouts for the position (one currency side at a time —
 * call once per side). Clamped because balance-backed donation attribution can push on-chain payouts
 * above the event-derived accumulation; a negative claimable is never meaningful.
 */
export function creatorFeesClaimable(accumulated: bigint, claimed: bigint): bigint {
  requireNonNegative(accumulated, 'accumulated')
  requireNonNegative(claimed, 'claimed')
  const remaining = accumulated - claimed
  return remaining > 0n ? remaining : 0n
}

/**
 * Fees auto-compounded for one position: the sum of the CompoundingClaimRecipient's `Claimed`
 * events. Each such claim is enforced on-chain to increase the same position's liquidity within the
 * same transaction, so this is the total released-for-compounding amount per side.
 */
export function feesCompounded(claimedEvents: readonly ClaimedAmounts[]): NativeAndTokenAmounts {
  let native = 0n
  let token = 0n
  for (const event of claimedEvents) {
    requireNonNegative(event.currency0Amount, 'currency0Amount')
    requireNonNegative(event.currency1Amount, 'currency1Amount')
    native += event.currency0Amount
    token += event.currency1Amount
  }
  return { native, token }
}

function toBps(bps: number, name: string): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > FEE_SPLIT_BPS_DENOMINATOR) {
    throw new LauncherSdkError('INVALID_INPUT', `${name} must be an integer between 0 and ${FEE_SPLIT_BPS_DENOMINATOR}`)
  }
  return BigInt(bps)
}

function requireNonNegative(amount: bigint, name: string): void {
  if (amount < 0n) {
    throw new LauncherSdkError('INVALID_INPUT', `${name} must not be negative`)
  }
}
