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
        ...Object.values(addresses.lendingAdapters),
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

  test('undeployed chains resolve to undefined', () => {
    expect(getMarginAddresses(8453)).toBeUndefined()
    expect(isMarginSupportedChain(8453)).toBe(false)
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
