import { DYNAMIC_FEE_FLAG, MAX_LP_FEE, MAX_TICK_SPACING } from '../constants'
import { LauncherSdkError } from '../errors'
import { formatFeePercent } from '../format'

/**
 * The launcher's own fee → tick-spacing table for the v4 pools it opens.
 *
 * v4 has no protocol-level fee→tickSpacing map, so each caller picks a spacing when it initializes a
 * pool. This table is the launcher's canonical choice per well-known tier and the single source of
 * truth for {@link resolveNewPoolTickSpacing}; fees not listed here fall through to the derivation
 * below. It intentionally does not track the v3 `TICK_SPACINGS` table — v3 pools and the pools this
 * launcher opens are separate populations, and each side is free to move without the other.
 *
 * Every entry the v3 table covers resolves to the same spacing it did before this table existed; the
 * 0.25% (2500) tier is the one entry with no v3 counterpart, and it is pinned to 25.
 */
export const LAUNCHER_V4_FEE_TICK_SPACINGS: Readonly<Record<number, number>> = {
  100: 1,
  200: 4,
  300: 6,
  400: 8,
  500: 10,
  2_500: 25,
  3_000: 60,
  10_000: 200,
}

/**
 * Resolves the tick spacing a **new** pool should be opened with, from its fee.
 *
 * Consults {@link LAUNCHER_V4_FEE_TICK_SPACINGS} first, then falls back to the derivation the
 * Uniswap interface uses (`max(round(2*fee/100), 1)`). Any fee up to {@link MAX_LP_FEE} is accepted;
 * only a fee whose resolved spacing exceeds the v4 maximum is rejected.
 *
 * Contract — this function decides the spacing of a pool that does not exist yet. It must NEVER be
 * used to reconstruct, hash, or look up the key of a pool that already exists: an existing pool's
 * spacing is a property of that pool, fixed when it was initialized, and this table can change
 * independently of it. Resolve an existing pool's spacing from the pool's own stored, served, or
 * on-chain key, or — when no key is available — by racing every entry of the relevant
 * `*_ALLOWED_POOL_TICK_SPACINGS` grandfather set.
 */
export function resolveNewPoolTickSpacing(fee: number): number {
  const tickSpacing = LAUNCHER_V4_FEE_TICK_SPACINGS[fee] ?? Math.max(Math.round((2 * fee) / 100), 1)
  if (tickSpacing > MAX_TICK_SPACING) {
    throw new LauncherSdkError('INVALID_FEE', `Fee tier ${formatFeePercent(fee)} is not supported.`)
  }
  return tickSpacing
}

/**
 * @deprecated Use {@link resolveNewPoolTickSpacing}, which carries the same behaviour under a name
 * that states what the result is for. Kept as an alias so existing imports keep working.
 */
export const feeToTickSpacing = resolveNewPoolTickSpacing

/** Resolves the pool `fee` field: the dynamic-fee flag, or the static fee in hundredths of a bip. */
export function resolvePoolFee(fee: number, dynamic: boolean): number {
  if (dynamic) {
    return DYNAMIC_FEE_FLAG
  }
  if (fee > MAX_LP_FEE) {
    throw new LauncherSdkError(
      'INVALID_FEE',
      `Fee ${formatFeePercent(fee)} exceeds the maximum of ${formatFeePercent(MAX_LP_FEE)}.`
    )
  }
  return fee
}
