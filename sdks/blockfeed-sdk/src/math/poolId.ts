import { computeV4PoolId } from '@uniswap/liquidity-launcher-sdk'
import type { Hex } from 'viem'

import type { PoolKeyStruct, PoolRef } from '../types'

/**
 * Compute the Uniswap v4 PoolId from a {@link PoolKeyStruct}, matching the on-chain `PoolKey.toId()`:
 * `keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))`.
 *
 * The struct's `currency0`/`currency1` are assumed already address-sorted (native `address(0)` sorts
 * first), exactly as a real v4 `PoolKey` is constructed. This id is what `StateView.getSlot0(poolId)`
 * is keyed by. A thin delegate to `liquidity-launcher-sdk`'s `computeV4PoolId` (the single source of
 * the encoding).
 */
export function poolIdFromPoolKey(poolKey: PoolKeyStruct): Hex {
  return computeV4PoolId(poolKey)
}

/** A pool's on-chain identifier for deterministic keying/sorting: pair/pool address, or v4 poolId. */
export function poolRefIdentifier(ref: PoolRef): string {
  switch (ref.protocol) {
    case 'v2':
      return ref.pair.toLowerCase()
    case 'v3':
      return ref.pool.toLowerCase()
    case 'v4':
      return poolIdFromPoolKey(ref.poolKey).toLowerCase()
  }
}
