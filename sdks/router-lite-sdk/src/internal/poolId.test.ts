import { Ether, Token } from '@uniswap/sdk-core'
import { Pool } from '@uniswap/v4-sdk'
import { expect, test } from 'bun:test'

import { computeV4PoolId } from './poolId'

test('matches v4-sdk Pool.getPoolId', () => {
  const eth = Ether.onChain(1)
  const usdc = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6)
  const sdkId = Pool.getPoolId(eth, usdc, 500, 10, '0x0000000000000000000000000000000000000000')
  const ours = computeV4PoolId({
    currency0: '0x0000000000000000000000000000000000000000',
    currency1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    fee: 500, tickSpacing: 10, hooks: '0x0000000000000000000000000000000000000000',
  })
  expect(ours.toLowerCase()).toBe(sdkId.toLowerCase())
})
