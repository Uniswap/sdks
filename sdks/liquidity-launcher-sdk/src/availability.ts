import { CHAIN_TO_ADDRESSES_MAP } from '@uniswap/sdk-core'
import { type Address, type Hex, type PublicClient, zeroAddress } from 'viem'

import { getLauncherAddresses } from './addresses'
import { LauncherSdkError } from './errors'
import { computeLbpPoolId } from './poolId'
import { getRegisteredInitializer, isV4PoolInitialized } from './reads'

/**
 * A fee tier to check, identified by its pool fee and tick spacing. (Dynamic-fee tiers have no fixed
 * pool id and can't be checked this way — filter them out before calling.)
 */
export interface FeeTierQuery {
  feeAmount: number
  tickSpacing: number
}

export interface FeeTierAvailability extends FeeTierQuery {
  poolId: Hex
  /** True only when neither launch-blocking condition is set. */
  available: boolean
  /** Why the tier is unavailable, if it is. */
  reason?: 'pool-reserved' | 'pool-initialized'
  /** The initializer holding the reservation, when `reason === 'pool-reserved'`. */
  reservedBy?: Address
}

function getV4StateView(chainId: number): Address | undefined {
  const entry = CHAIN_TO_ADDRESSES_MAP[chainId as keyof typeof CHAIN_TO_ADDRESSES_MAP] as
    | { v4StateView?: string }
    | undefined
  return entry?.v4StateView as Address | undefined
}

/**
 * Resolves, for each candidate fee tier, whether a launch can use it — by checking BOTH on-chain
 * conditions the launcher enforces:
 *  - `LBPStrategy.registeredPoolIds(poolId) != 0` — the pool id is reserved by a live (not-yet-migrated)
 *    auction. This is the gap a `getSlot0`-only check misses.
 *  - `StateView.getSlot0(poolId).sqrtPriceX96 != 0` — the v4 pool already exists.
 *
 * Pool ids use the standard hookless launch pool (`hook = address(0)`) unless `hook` is given. Throws
 * {@link LauncherSdkError} `UNSUPPORTED_CHAIN` if the launcher isn't deployed on `chainId`.
 */
export async function getFeeTierAvailability(
  client: PublicClient,
  p: { chainId: number; currency: Address; token: Address; hook?: Address; feeTiers: FeeTierQuery[] }
): Promise<FeeTierAvailability[]> {
  const addresses = getLauncherAddresses(p.chainId)
  if (!addresses) {
    throw new LauncherSdkError('UNSUPPORTED_CHAIN', `The liquidity launcher is not deployed on chain ${p.chainId}`)
  }
  const hook = p.hook ?? zeroAddress
  const stateView = getV4StateView(p.chainId)

  return Promise.all(
    p.feeTiers.map(async (tier) => {
      const poolId = computeLbpPoolId(p.currency, p.token, tier.feeAmount, tier.tickSpacing, hook)
      const reservedBy = await getRegisteredInitializer(client, { lbpStrategy: addresses.lbpStrategy, poolId })
      if (reservedBy !== zeroAddress) {
        return { ...tier, poolId, available: false, reason: 'pool-reserved' as const, reservedBy }
      }
      // Only spend a second read when the reservation slot is free.
      const initialized = stateView ? await isV4PoolInitialized(client, { stateView, poolId }) : false
      if (initialized) {
        return { ...tier, poolId, available: false, reason: 'pool-initialized' as const }
      }
      return { ...tier, poolId, available: true }
    })
  )
}
