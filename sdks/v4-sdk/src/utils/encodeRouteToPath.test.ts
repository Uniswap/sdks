import { Ether, Token, WETH9 } from '@uniswap/sdk-core'
import { encodeSqrtRatioX96 } from '@uniswap/v3-sdk'
import { Route } from '../entities/route'
import { Pool } from '../entities/pool'
import { encodeRouteToPath } from './encodeRouteToPath'
import { ADDRESS_ZERO, FEE_AMOUNT_MEDIUM, TICK_SPACING_TEN } from '../internalConstants'

const eth = Ether.onChain(1)
const weth = WETH9[1]
const currency1 = new Token(1, '0x1111111111111111111111111111111111111111', 18, 't1')
const currency2 = new Token(1, '0x2222222222222222222222222222222222222222', 18, 't2')
const currency3 = new Token(1, '0x3333333333333333333333333333333333333333', 18, 't3')

const pool_eth_1 = new Pool(
  eth,
  currency1,
  FEE_AMOUNT_MEDIUM,
  TICK_SPACING_TEN,
  ADDRESS_ZERO,
  encodeSqrtRatioX96(1, 1),
  0,
  0,
  []
)

const pool_1_2 = new Pool(
  currency1,
  currency2,
  FEE_AMOUNT_MEDIUM,
  TICK_SPACING_TEN,
  ADDRESS_ZERO,
  encodeSqrtRatioX96(1, 1),
  0,
  0,
  []
)

const pool_2_3 = new Pool(
  currency2,
  currency3,
  FEE_AMOUNT_MEDIUM,
  TICK_SPACING_TEN,
  ADDRESS_ZERO,
  encodeSqrtRatioX96(1, 1),
  0,
  0,
  []
)

const route = new Route([pool_eth_1, pool_1_2, pool_2_3], eth, currency3)

describe('RouterPlanner', () => {
  it('encodes the correct route for exactIn', async () => {
    const expected = [
      {
        intermediateCurrency: '0x1111111111111111111111111111111111111111',
        fee: 3000,
        tickSpacing: 10,
        hooks: '0x0000000000000000000000000000000000000000',
        hookData: '0x',
      },
      {
        intermediateCurrency: '0x2222222222222222222222222222222222222222',
        fee: 3000,
        tickSpacing: 10,
        hooks: '0x0000000000000000000000000000000000000000',
        hookData: '0x',
      },
      {
        intermediateCurrency: '0x3333333333333333333333333333333333333333',
        fee: 3000,
        tickSpacing: 10,
        hooks: '0x0000000000000000000000000000000000000000',
        hookData: '0x',
      },
    ]

    expect(encodeRouteToPath(route)).toEqual(expected)
  })

  it('encodes the correct route for exactOut', async () => {
    const exactOutput = true
    const expected = [
      {
        intermediateCurrency: '0x0000000000000000000000000000000000000000',
        fee: 3000,
        tickSpacing: 10,
        hooks: '0x0000000000000000000000000000000000000000',
        hookData: '0x',
      },
      {
        intermediateCurrency: '0x1111111111111111111111111111111111111111',
        fee: 3000,
        tickSpacing: 10,
        hooks: '0x0000000000000000000000000000000000000000',
        hookData: '0x',
      },
      {
        intermediateCurrency: '0x2222222222222222222222222222222222222222',
        fee: 3000,
        tickSpacing: 10,
        hooks: '0x0000000000000000000000000000000000000000',
        hookData: '0x',
      },
    ]

    expect(encodeRouteToPath(route, exactOutput)).toEqual(expected)
  })

  it('encodes the correct path when route has a different output than route.pathOutput', async () => {
    const newRoute = new Route([pool_1_2, pool_eth_1], currency2, weth)
    const exactOutput = true
    const expected = [
      {
        intermediateCurrency: '0x2222222222222222222222222222222222222222',
        fee: 3000,
        tickSpacing: 10,
        hooks: '0x0000000000000000000000000000000000000000',
        hookData: '0x',
      },
      {
        intermediateCurrency: '0x1111111111111111111111111111111111111111',
        fee: 3000,
        tickSpacing: 10,
        hooks: '0x0000000000000000000000000000000000000000',
        hookData: '0x',
      },
    ]

    expect(encodeRouteToPath(newRoute, exactOutput)).toEqual(expected)
  })

  it('encodes the correct path when route has a different input than route.pathInput', async () => {
    const newRoute = new Route([pool_eth_1, pool_1_2], weth, currency2)
    const exactOutput = false
    const expected = [
      {
        intermediateCurrency: '0x1111111111111111111111111111111111111111',
        fee: 3000,
        tickSpacing: 10,
        hooks: '0x0000000000000000000000000000000000000000',
        hookData: '0x',
      },
      {
        intermediateCurrency: '0x2222222222222222222222222222222222222222',
        fee: 3000,
        tickSpacing: 10,
        hooks: '0x0000000000000000000000000000000000000000',
        hookData: '0x',
      },
    ]

    expect(encodeRouteToPath(newRoute, exactOutput)).toEqual(expected)
  })
})
