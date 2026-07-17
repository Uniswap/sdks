import { QUICK_LAUNCH_LP_FEE, feeToTickSpacing, getTickDataLensForFactory } from '@uniswap/liquidity-launcher-sdk'
import { type Address, zeroAddress } from 'viem'

import { BlockfeedError } from '../../errors'
import type { Source } from '../../types'

import { launchAssetSource } from './launchAssetSource'
import type { LaunchAssetState } from './types'

/**
 * Convenience builder over {@link launchAssetSource} for the canonical quick-launch shape: a
 * native-ETH raise whose graduated v4 pool is `(native, token)` at the quick-launch LP fee. It fills
 * in everything `launchAssetSource` needs from just the auction/token/factory:
 *
 * - `tickDataLens` — resolved from `auctionFactory` via `getTickDataLensForFactory` (throws
 *   {@link BlockfeedError} if the factory is not a known deployment).
 * - `poolKey` — `currency0 = address(0)` (native sorts first), `currency1 = token`, `hooks = 0`, the
 *   fee defaulting to the launcher's `QUICK_LAUNCH_LP_FEE`, and `tickSpacing` from the launcher's
 *   `feeToTickSpacing` mapping.
 * - the v4 StateView address — resolved internally by `launchAssetSource` from `chainId`.
 *
 * The lower-level {@link launchAssetSource} remains available for power users with non-native raises
 * or bespoke pool keys.
 */
export function quickLaunchAssetSource(args: {
  chainId: number
  auction: Address
  token: Address
  auctionFactory: Address
  endBlock: bigint
  fee?: number
}): Source<LaunchAssetState> {
  const { chainId, auction, token, auctionFactory, endBlock } = args
  const fee = args.fee ?? QUICK_LAUNCH_LP_FEE

  const tickDataLens = getTickDataLensForFactory(auctionFactory)
  if (tickDataLens === undefined) {
    throw new BlockfeedError(
      `Cannot resolve a TickDataLens for auction factory ${auctionFactory}: not a known deployment.`
    )
  }

  // Native raise → currency0 is address(0) (sorts first), currency1 is the launched token; hookless.
  const poolKey = {
    currency0: zeroAddress as Address,
    currency1: token,
    fee,
    tickSpacing: feeToTickSpacing(fee),
    hooks: zeroAddress as Address,
  }

  return launchAssetSource({ chainId, auction, tickDataLens, poolKey, endBlock })
}
