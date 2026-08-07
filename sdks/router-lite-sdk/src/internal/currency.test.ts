import { describe, expect, test } from 'bun:test'

import { isNative, sameFamily, sortAddresses, toGraphNode } from './currency'

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const

describe('currency utilities', () => {
  test('native normalizes to wrapped for the graph', () => {
    expect(isNative('native')).toBe(true)
    expect(toGraphNode('native', WETH)).toBe(WETH.toLowerCase())
    expect(toGraphNode(USDC, WETH)).toBe(USDC.toLowerCase())
  })
  test('sortAddresses is stable and case-insensitive', () => {
    expect(sortAddresses(WETH, USDC)).toEqual([USDC, WETH])
    expect(sortAddresses(USDC, WETH)).toEqual([USDC, WETH])
  })
  test('sameFamily unifies native and wrapped only', () => {
    expect(sameFamily('native', WETH, WETH)).toBe(true)
    expect(sameFamily('native', USDC, WETH)).toBe(false)
    expect(sameFamily(USDC, USDC, WETH)).toBe(true)
  })
})
