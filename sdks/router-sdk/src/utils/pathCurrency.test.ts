import { Ether, Token } from '@uniswap/sdk-core'
import { encodeSqrtRatioX96 } from '@uniswap/v3-sdk'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import { ADDRESS_ZERO } from '../constants'
import { getPathCurrency } from './pathCurrency'

describe('#getPathCurrency', () => {
  const SQRT_RATIO_ONE = encodeSqrtRatioX96(1, 1)
  const ETHER = Ether.onChain(1)
  const token1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1')

  const pool_v4_eth_token1 = new V4Pool(token1, ETHER, 0, 0, ADDRESS_ZERO, SQRT_RATIO_ONE, 0, 0)

  it('returns eth input', () => {
    expect(getPathCurrency(ETHER, pool_v4_eth_token1)).toEqual(ETHER)
  })
})
