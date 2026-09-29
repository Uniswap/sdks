import { CurrencyAmount, Ether, Token, WETH9 } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { encodeSqrtRatioX96 } from '@uniswap/v3-sdk'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import { ADDRESS_ZERO } from '../constants'
import { MixedRouteSDK } from '../entities/mixedRoute/route'
import { getOutputOfPools, partitionMixedRouteByProtocol } from './index'

describe('utils', () => {
  const SQRT_RATIO_ONE = encodeSqrtRatioX96(1, 1)
  const ETHER = Ether.onChain(1)
  const weth = WETH9[1]
  const token0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0')
  const token1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1')

  const pool_v4_0_eth = new V4Pool(token0, ETHER, 0, 60, ADDRESS_ZERO, SQRT_RATIO_ONE, 0, 0)
  const pool_v4_1_weth = new V4Pool(token1, weth, 0, 60, ADDRESS_ZERO, SQRT_RATIO_ONE, 0, 0)
  const pool_v4_eth_weth = new V4Pool(ETHER, weth, 0, 60, ADDRESS_ZERO, SQRT_RATIO_ONE, 0, 0)
  const pair_0_weth = new Pair(CurrencyAmount.fromRawAmount(token0, '100'), CurrencyAmount.fromRawAmount(weth, '100'))
  const pair_1_weth = new Pair(CurrencyAmount.fromRawAmount(token1, '100'), CurrencyAmount.fromRawAmount(weth, '100'))

  describe('#partitionMixedRouteByProtocol', () => {
    it('splits two v4 pools at a native/wrapped boundary', () => {
      const route = new MixedRouteSDK([pool_v4_0_eth, pool_v4_1_weth], token0, token1)

      const sections = partitionMixedRouteByProtocol(route)
      expect(sections).toEqual([[pool_v4_0_eth], [pool_v4_1_weth]])
    })

    it('keeps a v4 section together when connected through a genuine ETH/WETH pool', () => {
      const route = new MixedRouteSDK([pool_v4_0_eth, pool_v4_eth_weth, pool_v4_1_weth], token0, token1)

      const sections = partitionMixedRouteByProtocol(route)
      expect(sections).toEqual([[pool_v4_0_eth, pool_v4_eth_weth, pool_v4_1_weth]])
    })

    it('still splits by protocol', () => {
      const route = new MixedRouteSDK([pool_v4_0_eth, pair_1_weth], token0, token1)

      const sections = partitionMixedRouteByProtocol(route)
      expect(sections).toEqual([[pool_v4_0_eth], [pair_1_weth]])
    })
  })

  describe('#getOutputOfPools', () => {
    it('walks exact matches', () => {
      expect(getOutputOfPools([pool_v4_0_eth], token0)).toEqual(ETHER)
    })

    it('bridges a native/wrapped boundary', () => {
      expect(getOutputOfPools([pool_v4_0_eth, pool_v4_1_weth], token0)).toEqual(token1)
      expect(getOutputOfPools([pair_0_weth], ETHER)).toEqual(token0)
    })

    it('prefers the exact side of a genuine ETH/WETH pool', () => {
      expect(getOutputOfPools([pool_v4_eth_weth], ETHER)).toEqual(weth)
      expect(getOutputOfPools([pool_v4_eth_weth], weth)).toEqual(ETHER)
    })

    it('throws for an unrelated input', () => {
      expect(() => getOutputOfPools([pool_v4_1_weth], token0)).toThrow('PATH')
    })
  })
})
