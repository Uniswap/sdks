import { CurrencyAmount, Ether, Token, WETH9 } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { encodeSqrtRatioX96, FeeAmount, Pool as V3Pool } from '@uniswap/v3-sdk'
import { Pool as V4Pool } from '@uniswap/v4-sdk'
import { MixedRouteSDK } from '../entities/mixedRoute/route'
import { encodeMixedRouteToPath } from './encodeMixedRouteToPath'
import { ADDRESS_ZERO } from '../constants'

describe('#encodeMixedRouteToPath', () => {
  const ETHER = Ether.onChain(1)
  const token0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0', 'token0')
  const token1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1', 'token1')
  const token2 = new Token(1, '0x0000000000000000000000000000000000000003', 18, 't2', 'token2')

  const weth = WETH9[1]

  const pool_V3_0_1_medium = new V3Pool(token0, token1, FeeAmount.MEDIUM, encodeSqrtRatioX96(1, 1), 0, 0, [])
  const pool_V3_1_2_low = new V3Pool(token1, token2, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, [])
  const pool_V3_0_weth = new V3Pool(token0, weth, FeeAmount.MEDIUM, encodeSqrtRatioX96(1, 1), 0, 0, [])
  const pool_V3_1_weth = new V3Pool(token1, weth, FeeAmount.MEDIUM, encodeSqrtRatioX96(1, 1), 0, 0, [])

  const pool_V4_0_1 = new V4Pool(token0, token1, FeeAmount.MEDIUM, 30, ADDRESS_ZERO, encodeSqrtRatioX96(1, 1), 0, 0, [])
  const pool_V4_0_eth = new V4Pool(
    token0,
    ETHER,
    FeeAmount.MEDIUM,
    30,
    ADDRESS_ZERO,
    encodeSqrtRatioX96(1, 1),
    0,
    0,
    []
  )
  const fake_v4_eth_weth_pool = new V4Pool(
    weth,
    ETHER,
    FeeAmount.MEDIUM,
    0,
    ADDRESS_ZERO,
    encodeSqrtRatioX96(1, 1),
    0,
    0
  )

  const pair_0_1 = new Pair(CurrencyAmount.fromRawAmount(token0, '100'), CurrencyAmount.fromRawAmount(token1, '200'))
  const pair_1_2 = new Pair(CurrencyAmount.fromRawAmount(token1, '150'), CurrencyAmount.fromRawAmount(token2, '150'))
  const pair_0_weth = new Pair(CurrencyAmount.fromRawAmount(token0, '100'), CurrencyAmount.fromRawAmount(weth, '100'))
  const pair_1_weth = new Pair(CurrencyAmount.fromRawAmount(token1, '175'), CurrencyAmount.fromRawAmount(weth, '100'))
  const pair_2_weth = new Pair(CurrencyAmount.fromRawAmount(token2, '150'), CurrencyAmount.fromRawAmount(weth, '100'))

  const route_0_V3_1 = new MixedRouteSDK([pool_V3_0_1_medium], token0, token1)
  const route_0_V3_1_V3_2 = new MixedRouteSDK([pool_V3_0_1_medium, pool_V3_1_2_low], token0, token2)
  const route_0_V3_weth = new MixedRouteSDK([pool_V3_0_weth], token0, ETHER)
  const route_0_V3_1_V3_weth = new MixedRouteSDK([pool_V3_0_1_medium, pool_V3_1_weth], token0, ETHER)
  const route_weth_V3_0 = new MixedRouteSDK([pool_V3_0_weth], ETHER, token0)
  const route_weth_V3_0_V3_1 = new MixedRouteSDK([pool_V3_0_weth, pool_V3_0_1_medium], ETHER, token1)

  const route_0_V4_1 = new MixedRouteSDK([pool_V4_0_1], token0, token1)

  const route_0_V2_1 = new MixedRouteSDK([pair_0_1], token0, token1)
  const route_0_V2_1_V2_2 = new MixedRouteSDK([pair_0_1, pair_1_2], token0, token2)
  const route_weth_V2_0 = new MixedRouteSDK([pair_0_weth], ETHER, token0)
  const route_weth_V2_0_V2_1 = new MixedRouteSDK([pair_0_weth, pair_0_1], ETHER, token1)
  const route_0_V2_weth = new MixedRouteSDK([pair_0_weth], token0, ETHER)
  const route_0_V2_1_V2_weth = new MixedRouteSDK([pair_0_1, pair_1_weth], token0, ETHER)

  const route_0_V3_1_V2_weth = new MixedRouteSDK([pool_V3_0_1_medium, pair_1_weth], token0, ETHER)
  const route_0_V3_weth_V2_1_V2_2 = new MixedRouteSDK([pool_V3_0_weth, pair_1_weth, pair_1_2], token0, token2)
  const route_0_V3_1_v3_weth_V2_2 = new MixedRouteSDK([pool_V3_0_1_medium, pool_V3_1_weth, pair_2_weth], token0, token2)
  const route_0_V3_weth_V4_1 = new MixedRouteSDK([pool_V3_0_weth, pool_V4_0_1], ETHER, token1)
  const route_eth_V4_0_V3_1 = new MixedRouteSDK([pool_V4_0_eth, pool_V3_0_1_medium], ETHER, token1)
  const route_eth_V3_0_V4_1 = new MixedRouteSDK([pool_V3_0_weth, pool_V4_0_1], ETHER, token1)

  const route_1_v2_weth_v0_eth_v4_token0 = new MixedRouteSDK(
    [pair_1_weth, fake_v4_eth_weth_pool, pool_V4_0_eth],
    token1,
    token0,
    true
  )

  describe('pure V3', () => {
    it('packs them for exact input single hop', () => {
      expect(encodeMixedRouteToPath(route_0_V3_1)).toEqual(
        '0x0000000000000000000000000000000000000001000bb80000000000000000000000000000000000000002'
      )
    })

    it('packs them correctly for multihop exact input', () => {
      expect(encodeMixedRouteToPath(route_0_V3_1_V3_2)).toEqual(
        '0x0000000000000000000000000000000000000001000bb800000000000000000000000000000000000000020001f40000000000000000000000000000000000000003'
      )
    })

    it('wraps ether input for exact input single hop', () => {
      expect(encodeMixedRouteToPath(route_weth_V3_0)).toEqual(
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000bb80000000000000000000000000000000000000001'
      )
    })

    it('wraps ether input for exact input multihop', () => {
      expect(encodeMixedRouteToPath(route_weth_V3_0_V3_1)).toEqual(
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000bb80000000000000000000000000000000000000001000bb80000000000000000000000000000000000000002'
      )
    })

    it('wraps ether output for exact input single hop', () => {
      expect(encodeMixedRouteToPath(route_0_V3_weth)).toEqual(
        '0x0000000000000000000000000000000000000001000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
      )
    })

    it('wraps ether output for exact input multihop', () => {
      expect(encodeMixedRouteToPath(route_0_V3_1_V3_weth)).toEqual(
        '0x0000000000000000000000000000000000000001000bb80000000000000000000000000000000000000002000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
      )
    })
  })

  describe('pure v4', () => {
    it('packs them for exact input single hop', () => {
      expect(encodeMixedRouteToPath(route_0_V4_1)).toEqual(
        '0x0000000000000000000000000000000000000001400bb800001e00000000000000000000000000000000000000000000000000000000000000000000000000000002'
      )
    })
  })

  describe('pure V2', () => {
    it('packs them for exact input single hop', () => {
      expect(encodeMixedRouteToPath(route_0_V2_1)).toEqual(
        '0x00000000000000000000000000000000000000018000000000000000000000000000000000000000000002'
      )
    })

    it('packs them correctly for multihop exact input', () => {
      expect(encodeMixedRouteToPath(route_0_V2_1_V2_2)).toEqual(
        '0x000000000000000000000000000000000000000180000000000000000000000000000000000000000000028000000000000000000000000000000000000000000003'
      )
    })

    it('wraps ether input for exact input single hop', () => {
      expect(encodeMixedRouteToPath(route_weth_V2_0)).toEqual(
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc28000000000000000000000000000000000000000000001'
      )
    })

    it('wraps ether input for exact input multihop', () => {
      expect(encodeMixedRouteToPath(route_weth_V2_0_V2_1)).toEqual(
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc280000000000000000000000000000000000000000000018000000000000000000000000000000000000000000002'
      )
    })

    it('wraps ether output for exact input single hop', () => {
      expect(encodeMixedRouteToPath(route_0_V2_weth)).toEqual(
        '0x0000000000000000000000000000000000000001800000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
      )
    })

    it('wraps ether output for exact input multihop', () => {
      expect(encodeMixedRouteToPath(route_0_V2_1_V2_weth)).toEqual(
        '0x00000000000000000000000000000000000000018000000000000000000000000000000000000000000002800000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
      )
    })
  })

  describe('mixed route', () => {
    it('packs them for exact input v3 -> v2 with wrapped ether output', () => {
      expect(encodeMixedRouteToPath(route_0_V3_1_V2_weth)).toEqual(
        '0x0000000000000000000000000000000000000001000bb80000000000000000000000000000000000000002800000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
      )
    })

    it('packs them for exact input v3 -> v2 -> v2', () => {
      expect(encodeMixedRouteToPath(route_0_V3_weth_V2_1_V2_2)).toEqual(
        '0x0000000000000000000000000000000000000001000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc280000000000000000000000000000000000000000000028000000000000000000000000000000000000000000003'
      )
    })

    it('packs them for exact input v3 -> v3 -> v2', () => {
      expect(encodeMixedRouteToPath(route_0_V3_1_v3_weth_V2_2)).toEqual(
        '0x0000000000000000000000000000000000000001000bb80000000000000000000000000000000000000002000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc28000000000000000000000000000000000000000000003'
      )
    })

    it('packs them for exact input v3 -> v4', () => {
      expect(encodeMixedRouteToPath(route_0_V3_weth_V4_1)).toEqual(
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2300bb80000000000000000000000000000000000000001400bb800001e00000000000000000000000000000000000000000000000000000000000000000000000000000002'
      )
    })

    it('packs them for exact input native eth v4 -> v3', () => {
      expect(encodeMixedRouteToPath(route_eth_V4_0_V3_1)).toEqual(
        '0x0000000000000000000000000000000000000000400bb800001e00000000000000000000000000000000000000000000000000000000000000000000000000000001300bb80000000000000000000000000000000000000002'
      )
    })

    it('packs them for exact input native eth v3 -> v4', () => {
      expect(encodeMixedRouteToPath(route_eth_V3_0_V4_1)).toEqual(
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2300bb80000000000000000000000000000000000000001400bb800001e00000000000000000000000000000000000000000000000000000000000000000000000000000002'
      )
    })

    it('encodes the mixed route with an unwrap, token1 v2 -> v4 token0 through an unwrap', () => {
      expect(encodeMixedRouteToPath(route_1_v2_weth_v0_eth_v4_token0)).toEqual(
        '0x000000000000000000000000000000000000000220c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000000000000000000000400bb800001e00000000000000000000000000000000000000000000000000000000000000000000000000000001'
      )
      // comments left for future reference, to show special cased eth-weth v4 (version0) encoding in the mixed route quoter
      // // first path address - token1
      // 0x0000000000000000000000000000000000000002
      // // first path fee - v2 "version"
      // 0x20
      // // first path second address - weth
      // 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
      // // second path - fake v4 pool, "version"
      // 0x00
      // // second path - fake v4 pool, second address - eth
      // 0x0000000000000000000000000000000000000000
      // // last path - v4 pool, with Fee.MEDIUM
      // 0x400bb8
      // // last path - v4, tick spacing of 30
      // 0x00001e
      // // last path - v4, hook address
      // 0x0000000000000000000000000000000000000000
      // // last path address - v4 pool, token0
      // 0x0000000000000000000000000000000000000001
    })
  })
})
