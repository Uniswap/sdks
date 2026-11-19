import { describe, expect, test } from 'bun:test'
import { getAddress } from 'viem'

import { MARGIN_ADDRESSES, getMarginAddresses } from './addresses.js'
import { SupportedChainId, isMarginSupportedChain } from './chains.js'
import { MarginSdkError, isMarginSdkError } from './errors.js'

describe('addresses', () => {
  test('every address is checksummed', () => {
    for (const addresses of Object.values(MARGIN_ADDRESSES)) {
      if (!addresses) continue
      const flat = [
        addresses.marginRouter,
        addresses.marginAccountImplementation,
        addresses.permit2,
        addresses.poolManager,
        addresses.weth9,
        ...Object.values(addresses.lendingAdapters).flat(),
      ]
      for (const address of flat) {
        expect(address).toBe(getAddress(address))
      }
    }
  })

  test('mainnet stack resolves with all four deployed venues', () => {
    const mainnet = getMarginAddresses(SupportedChainId.MAINNET)
    expect(mainnet).toBeDefined()
    expect(mainnet!.lendingAdapters.morphoBlue).toBeDefined()
    expect(mainnet!.lendingAdapters.aaveV3).toBeDefined()
    expect(mainnet!.lendingAdapters.aaveV4).toBeDefined()
    expect(mainnet!.lendingAdapters.compoundV3).toBeDefined()
    expect(isMarginSupportedChain(1)).toBe(true)
  })

  test('Base and Arbitrum One have Morpho Blue, Aave v3 and Compound v3, no Aave v4', () => {
    for (const chainId of [SupportedChainId.BASE, SupportedChainId.ARBITRUM_ONE]) {
      const addresses = getMarginAddresses(chainId)
      expect(addresses).toBeDefined()
      expect(addresses!.lendingAdapters.morphoBlue).toBeDefined()
      expect(addresses!.lendingAdapters.aaveV3).toBeDefined()
      expect(addresses!.lendingAdapters.compoundV3).toBeDefined()
      expect(addresses!.lendingAdapters.aaveV4).toBeUndefined()
      expect(isMarginSupportedChain(chainId)).toBe(true)
    }
  })

  test('Robinhood Chain has Morpho Blue only', () => {
    const robinhood = getMarginAddresses(SupportedChainId.ROBINHOOD_CHAIN)
    expect(robinhood).toBeDefined()
    expect(Object.keys(robinhood!.lendingAdapters)).toEqual(['morphoBlue'])
    expect(isMarginSupportedChain(4663)).toBe(true)
  })

  test('the suite contracts share one address on every chain', () => {
    const mainnet = getMarginAddresses(SupportedChainId.MAINNET)!
    for (const addresses of Object.values(MARGIN_ADDRESSES)) {
      if (!addresses) continue
      expect(addresses.marginRouter).toBe(mainnet.marginRouter)
      expect(addresses.marginAccountImplementation).toBe(mainnet.marginAccountImplementation)
      expect(addresses.permit2).toBe(mainnet.permit2)
      for (const [venue, adapters] of Object.entries(addresses.lendingAdapters)) {
        expect(adapters).toEqual(mainnet.lendingAdapters[venue as keyof typeof mainnet.lendingAdapters])
      }
    }
  })

  test('undeployed chains resolve to undefined', () => {
    expect(getMarginAddresses(10)).toBeUndefined()
    expect(isMarginSupportedChain(10)).toBe(false)
  })
})

describe('errors', () => {
  test('MarginSdkError carries a stable code and survives structural checks', () => {
    const error = new MarginSdkError('INVALID_AMOUNT', 'nope')
    expect(error.code).toBe('INVALID_AMOUNT')
    expect(isMarginSdkError(error)).toBe(true)
    expect(isMarginSdkError({ name: 'MarginSdkError', code: 'INVALID_AMOUNT' })).toBe(true)
    expect(isMarginSdkError(new Error('nope'))).toBe(false)
  })
})
