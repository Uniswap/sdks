import { describe, expect, it } from 'bun:test'
import { zeroAddress } from 'viem'

import type { PoolKeyStruct } from '../types'

import { poolIdFromPoolKey } from './poolId'

describe('poolIdFromPoolKey', () => {
  // Golden vector cross-checked against liquidity-launcher-sdk's `computeLbpPoolId` test, which was
  // itself read back from LBPStrategy.registeredPoolIds on a real Unichain launch: native ETH /
  // token 0x15d0…, fee 10001, tickSpacing 200, hookless. currency0/currency1 are address-sorted
  // (native 0x0 sorts first).
  it('matches the on-chain v4 pool id (keccak256 of the abi-encoded PoolKey)', () => {
    const poolKey: PoolKeyStruct = {
      currency0: zeroAddress,
      currency1: '0x15d0e0c55a3e7ee67152ad7e89acf164253ff68d',
      fee: 10001,
      tickSpacing: 200,
      hooks: zeroAddress,
    }
    expect(poolIdFromPoolKey(poolKey)).toBe('0xcdb29fb7957c966296b36530969aa5f6fcf936e37519fb7ff2eb6147508b9fd7')
  })
})
