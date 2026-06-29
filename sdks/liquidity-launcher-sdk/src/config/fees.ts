import { TICK_SPACINGS } from '@uniswap/v3-sdk'

import { DYNAMIC_FEE_FLAG, MAX_LP_FEE, MAX_TICK_SPACING } from '../constants'
import { LauncherSdkError } from '../errors'
import { formatFeePercent } from '../format'

/**
 * Resolves a pool's tick spacing from its fee. v4 has no fixed fee→tickSpacing map, so prefer the
 * canonical v3 `TICK_SPACINGS` for the well-known tiers (keeps e.g. the 0.01% pool at spacing 1) and
 * otherwise derive it the way the Uniswap interface does (`max(round(2*fee/100), 1)`). Any fee up to
 * {@link MAX_LP_FEE} is accepted; only a fee whose derived spacing exceeds the v4 maximum is rejected.
 */
export function feeToTickSpacing(fee: number): number {
  const canonical = (TICK_SPACINGS as Readonly<Record<number, number>>)[fee]
  const tickSpacing = canonical ?? Math.max(Math.round((2 * fee) / 100), 1)
  if (tickSpacing > MAX_TICK_SPACING) {
    throw new LauncherSdkError('INVALID_FEE', `Fee tier ${formatFeePercent(fee)} is not supported.`)
  }
  return tickSpacing
}

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
