import { describe, expect, it } from 'bun:test'
import { zeroAddress } from 'viem'

import { computeGraffiti, computeLbpPoolId } from './poolId'

describe('computeLbpPoolId', () => {
  // Golden vector from a real Unichain launch: native ETH / token 0x15d0…, fee 10001, tickSpacing 200,
  // hookless. This pool id was read back from LBPStrategy.registeredPoolIds on-chain.
  it('matches the on-chain pool id for the canonical hookless launch pool', () => {
    const poolId = computeLbpPoolId(zeroAddress, '0x15d0e0c55a3e7ee67152ad7e89acf164253ff68d', 10001, 200, zeroAddress)
    expect(poolId).toBe('0xcdb29fb7957c966296b36530969aa5f6fcf936e37519fb7ff2eb6147508b9fd7')
  })

  it('is independent of currency/token argument order (currencies are sorted)', () => {
    const token = '0x15d0e0c55a3e7ee67152ad7e89acf164253ff68d' as const
    const a = computeLbpPoolId(zeroAddress, token, 10001, 200, zeroAddress)
    const b = computeLbpPoolId(token, zeroAddress, 10001, 200, zeroAddress)
    expect(a).toBe(b)
  })
})

describe('computeGraffiti', () => {
  it('is keccak256(abi.encode(address))', () => {
    // keccak256 of a left-padded address word.
    expect(computeGraffiti(zeroAddress)).toBe('0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563')
  })
})
