import { Ether, Token, WETH9 } from '@uniswap/sdk-core'
import { FeeAmount, encodeSqrtRatioX96 } from '@uniswap/v3-sdk'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import { ADDRESS_ZERO } from '../constants'
import { isValidTokenPath } from './isValidTokenPath'

describe('#isValidTokenPath', () => {
  const SQRT_RATIO_ONE = encodeSqrtRatioX96(1, 1)
  const ETHER = Ether.onChain(1)
  const token1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1')
  const weth = WETH9[1]

  const pool_v4_weth_eth = new V4Pool(weth, ETHER, 0, 0, ADDRESS_ZERO, 79228162514264337593543950336, 0, 0)
  const pool_v4_1_eth = new V4Pool(token1, ETHER, FeeAmount.MEDIUM, 60, ADDRESS_ZERO, SQRT_RATIO_ONE, 0, 0)

  it('v3 pool and v4 pool, with WETH and ETH unwrap', () => {
    expect(isValidTokenPath(pool_v4_weth_eth, pool_v4_1_eth, ETHER)).toBe(true)
  })
})
