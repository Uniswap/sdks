import type { Hex } from 'viem'
import { keccak256, encodeAbiParameters } from 'viem'

import type { PoolKey } from '../types'

/**
 * Computes the pool ID for a v4 pool by keccak256 hashing the encoded pool key.
 * This matches the v4-sdk Pool.getPoolId computation.
 */
export function computeV4PoolId(key: PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'uint24' },
        { type: 'int24' },
        { type: 'address' },
      ],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  )
}
