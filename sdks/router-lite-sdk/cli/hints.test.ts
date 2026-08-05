import { describe, expect, it } from 'bun:test'
import { zeroAddress, type Address } from 'viem'

import { UsageError } from './args'
import { parseHint } from './hints'

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const HOOK: Address = '0x1000000000000000000000000000000000000abc'

describe('parseHint', () => {
  it('builds a v2 hint with wrapped-native for the native side, tokens sorted', () => {
    expect(parseHint('v2', 'native', USDC, WETH)).toEqual({ protocol: 'v2', token0: USDC, token1: WETH })
  })

  it('builds a v3 hint with a fee', () => {
    expect(parseHint('v3@500', 'native', USDC, WETH)).toEqual({ protocol: 'v3', token0: USDC, token1: WETH, fee: 500 })
  })

  it('builds a v4 hint with address(0) for the native side, currencies sorted', () => {
    expect(parseHint('v4@3000/60', 'native', USDC, WETH)).toEqual({
      protocol: 'v4',
      poolKey: { currency0: zeroAddress, currency1: USDC, fee: 3000, tickSpacing: 60, hooks: zeroAddress },
    })
  })

  it('accepts hooks and hookData on v4', () => {
    expect(parseHint(`v4@8388608/60/${HOOK}:0xdeadbeef`, USDC, 'native', WETH)).toEqual({
      protocol: 'v4',
      poolKey: { currency0: zeroAddress, currency1: USDC, fee: 8388608, tickSpacing: 60, hooks: HOOK },
      hookData: '0xdeadbeef',
    })
  })

  it('rejects malformed specs with the spec named', () => {
    expect(() => parseHint('v3', 'native', USDC, WETH)).toThrow(UsageError) // v3 needs a fee
    expect(() => parseHint('v2@500', 'native', USDC, WETH)).toThrow(UsageError) // v2 takes none
    expect(() => parseHint('v4@3000', 'native', USDC, WETH)).toThrow(UsageError) // v4 needs tickSpacing
    expect(() => parseHint('v2:0xdead', 'native', USDC, WETH)).toThrow(UsageError) // hookData is v4-only
    expect(() => parseHint('v5@100', 'native', USDC, WETH)).toThrow(UsageError) // unknown protocol
    expect(() => parseHint('v4@3000/60/nothex', 'native', USDC, WETH)).toThrow(UsageError)
  })
})
