import { DYNAMIC_FEE_FLAG, MAX_LP_FEE, MAX_TICK_SPACING } from '../constants'
import { LauncherSdkError } from '../errors'
import { formatFeePercent } from '../format'

/**
 * Resolves the tick spacing a **new** v4 pool opened by this launcher is initialized with, from its
 * fee: `max(round(fee / 100), 1)` — one tick of spacing per bip of fee, floored at 1.
 *
 * The governing rule: a new pool's tick spacing equals its LP fee expressed in basis points — the
 * `fee` field is denominated in hundredths of a basis point, so `fee / 100` is that conversion.
 * Fees that are not a whole number of basis points round to the nearest integer, and the result is
 * floored at 1.
 *
 * v4 has no protocol-level fee→tickSpacing map, so each caller picks a spacing when it initializes a
 * pool; this derivation is the launcher's single source of truth for that choice (2500 → 25,
 * 3000 → 30, 10000 → 100). It deliberately does not consult the v3 `TICK_SPACINGS` table: v3's
 * fee→spacing pairs are factory-enforced on-chain and describe v3 pools, not the pools this
 * launcher opens.
 *
 * Any fee up to {@link MAX_LP_FEE} is accepted; only a fee whose resolved spacing exceeds the v4
 * maximum is rejected.
 *
 * Contract — this function decides the spacing of a pool that does not exist yet. It must NEVER be
 * used to reconstruct, hash, or look up the key of a pool that already exists: an existing pool's
 * spacing is a property of that pool, fixed when it was initialized, and this derivation can change
 * independently of it. Resolve an existing pool's spacing from the pool's own stored, served, or
 * on-chain key, or — when no key is available — by racing every entry of the relevant
 * `*_ALLOWED_POOL_TICK_SPACINGS` grandfather set.
 */
export function resolveNewPoolTickSpacing(fee: number): number {
  const tickSpacing = Math.max(Math.round(fee / 100), 1)
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
