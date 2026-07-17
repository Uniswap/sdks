import { type Hex, encodeAbiParameters, keccak256 } from 'viem'

import type { PoolKeyStruct } from '../types'

/**
 * Compute the Uniswap v4 PoolId from a {@link PoolKeyStruct}, matching the on-chain `PoolKey.toId()`:
 * `keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))`.
 *
 * The struct's `currency0`/`currency1` are assumed already address-sorted (native `address(0)` sorts
 * first), exactly as a real v4 `PoolKey` is constructed. This id is what `StateView.getSlot0(poolId)`
 * is keyed by. Mirrors `liquidity-launcher-sdk`'s `computeLbpPoolId`.
 */
export function poolIdFromPoolKey(poolKey: PoolKeyStruct): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
      [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
    )
  )
}
