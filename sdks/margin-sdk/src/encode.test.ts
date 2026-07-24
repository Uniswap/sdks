import { describe, expect, test } from 'bun:test'
import { type Address, decodeFunctionData, toFunctionSelector } from 'viem'

import { MARGIN_ROUTER_ABI } from './abis'
import { FULL_CLOSE } from './constants'
import {
  addCollateralCall,
  closePositionCall,
  decreasePositionCall,
  encodeAddCollateral,
  encodeDecreasePosition,
  encodeExecute,
  encodeIncreasePosition,
  encodeRouterMulticall,
  increasePositionCall,
} from './encode'
import { MarginSdkError } from './errors'
import { type IncreaseParams, type PoolKey } from './types'

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const ADAPTER: Address = '0x9A7f8F5A9496D3c9dc0BEEfb44cCaC17CAAF28fa'
const ROUTER: Address = '0x0000000004BBC92D0657580CAe35aEBF054E5CDC'
const ZERO: Address = '0x0000000000000000000000000000000000000000'

const LONG_MARKET = { collateral: WETH, debt: USDC }
const POOL: PoolKey = { currency0: USDC, currency1: WETH, fee: 3000, tickSpacing: 60, hooks: ZERO }

const BASE_INCREASE: IncreaseParams = {
  adapter: ADAPTER,
  market: LONG_MARKET,
  poolKey: POOL,
  equity: 10n ** 18n,
  collateralToBuy: 10n ** 18n,
  maxDebtIn: 10_000n * 10n ** 6n,
  deadline: 1n,
}

/**
 * Ground-truth calldata generated with `cast calldata` from the deployed contract's signatures;
 * each selector was additionally confirmed against the live mainnet router (an expired deadline
 * reverts `DeadlinePassed`, proving the selector dispatched).
 */
const CAST_INCREASE_CALLDATA =
  '0xba63804f0000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000003c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000002540be4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001'

const CAST_DECREASE_CALLDATA =
  '0x12d833730000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000003c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009b6e64a8ec6000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001'

const CAST_ADD_COLLATERAL_CALLDATA =
  '0x434f7ded0000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001'

const CAST_EXECUTE_CALLDATA =
  '0xab5898e80000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000006300000000000000000000000000000000000000000000000000000000000000021234000000000000000000000000000000000000000000000000000000000000'

describe('entry point selectors (verified against the live mainnet router)', () => {
  const selectors: Record<string, string> = {
    increasePosition: '0xba63804f',
    decreasePosition: '0x12d83373',
    addCollateral: '0x434f7ded',
    execute: '0xab5898e8',
    accountOf: '0x0c1905e5',
    createAccount: '0x5fbfb9cf',
    multicall: '0xac9650d8',
    permit: '0x2b67b570',
  }
  for (const [name, selector] of Object.entries(selectors)) {
    test(`${name} → ${selector}`, () => {
      const item = MARGIN_ROUTER_ABI.find((entry) => entry.type === 'function' && entry.name === name)
      expect(item).toBeDefined()
      expect(toFunctionSelector(item as never)).toBe(selector)
    })
  }
})

describe('encodeIncreasePosition', () => {
  test('matches cast-generated calldata byte-for-byte', () => {
    expect(encodeIncreasePosition(BASE_INCREASE)).toBe(CAST_INCREASE_CALLDATA as `0x${string}`)
  })

  test('round-trips through decodeFunctionData', () => {
    const data = encodeIncreasePosition({ ...BASE_INCREASE, minHopPriceX36: 5n, maxLtvAfter: 7n, subId: 9n })
    const { functionName, args } = decodeFunctionData({ abi: MARGIN_ROUTER_ABI, data })
    expect(functionName).toBe('increasePosition')
    const params = (args as readonly [Record<string, unknown>])[0]
    expect(params.minHopPriceX36).toBe(5n)
    expect(params.maxLtvAfter).toBe(7n)
    expect(params.subId).toBe(9n)
  })

  test('rejects zero maxDebtIn (the binding slippage cap)', () => {
    expect(() => encodeIncreasePosition({ ...BASE_INCREASE, maxDebtIn: 0n })).toThrow(MarginSdkError)
  })

  test('rejects zero collateralToBuy', () => {
    expect(() => encodeIncreasePosition({ ...BASE_INCREASE, collateralToBuy: 0n })).toThrow(MarginSdkError)
  })

  test('rejects amounts above uint128', () => {
    expect(() => encodeIncreasePosition({ ...BASE_INCREASE, collateralToBuy: 1n << 128n })).toThrow(MarginSdkError)
  })

  test('rejects a pool that does not trade the market pair', () => {
    const wrongPool: PoolKey = { ...POOL, currency1: ADAPTER }
    expect(() => encodeIncreasePosition({ ...BASE_INCREASE, poolKey: wrongPool })).toThrow(MarginSdkError)
  })

  test('rejects a native-ETH market currency', () => {
    expect(() => encodeIncreasePosition({ ...BASE_INCREASE, market: { collateral: ZERO, debt: USDC } })).toThrow(
      MarginSdkError
    )
  })

  test('native equity: value is set and a non-zero equity field is rejected', () => {
    const call = increasePositionCall({
      marginRouter: ROUTER,
      params: { ...BASE_INCREASE, equity: 0n },
      nativeEquity: 10n ** 18n,
    })
    expect(call.value).toBe(10n ** 18n)
    expect(call.address).toBe(ROUTER)
    expect(() => increasePositionCall({ marginRouter: ROUTER, params: BASE_INCREASE, nativeEquity: 1n })).toThrow(
      MarginSdkError
    )
  })
})

describe('encodeDecreasePosition', () => {
  const partial = {
    adapter: ADAPTER,
    market: LONG_MARKET,
    poolKey: POOL,
    debtToRepay: 10n ** 6n,
    maxCollateralIn: 10n ** 18n,
    maxLtvAfter: 7n * 10n ** 17n,
    deadline: 1n,
  }

  test('matches cast-generated calldata byte-for-byte', () => {
    expect(encodeDecreasePosition(partial)).toBe(CAST_DECREASE_CALLDATA as `0x${string}`)
  })

  test('partial decrease requires maxLtvAfter', () => {
    expect(() => encodeDecreasePosition({ ...partial, maxLtvAfter: 0n })).toThrow(MarginSdkError)
  })

  test('partial decrease requires maxCollateralIn', () => {
    expect(() => encodeDecreasePosition({ ...partial, maxCollateralIn: 0n })).toThrow(MarginSdkError)
  })

  test('full close ignores maxLtvAfter and allows zero maxCollateralIn (zero-debt path)', () => {
    const data = encodeDecreasePosition({ ...partial, debtToRepay: FULL_CLOSE, maxLtvAfter: 0n, maxCollateralIn: 0n })
    const { args } = decodeFunctionData({ abi: MARGIN_ROUTER_ABI, data })
    expect((args as readonly [Record<string, unknown>])[0].debtToRepay).toBe(FULL_CLOSE)
  })

  test('closePositionCall sets the FULL_CLOSE sentinel', () => {
    const call = closePositionCall({
      marginRouter: ROUTER,
      params: {
        adapter: ADAPTER,
        market: LONG_MARKET,
        poolKey: POOL,
        maxCollateralIn: 5n * 10n ** 18n,
        deadline: 1n,
      },
    })
    const params = (call.args as readonly [Record<string, unknown>])[0]
    expect(params.debtToRepay).toBe(FULL_CLOSE)
    expect(params.maxLtvAfter).toBe(0n)
    expect(call.value).toBeUndefined()
    expect(decreasePositionCall({ marginRouter: ROUTER, params: partial }).functionName).toBe('decreasePosition')
  })
})

describe('encodeAddCollateral', () => {
  const params = { adapter: ADAPTER, market: LONG_MARKET, amount: 10n ** 18n, deadline: 1n }

  test('matches cast-generated calldata byte-for-byte', () => {
    expect(encodeAddCollateral(params)).toBe(CAST_ADD_COLLATERAL_CALLDATA as `0x${string}`)
  })

  test('rejects a zero amount without native value', () => {
    expect(() => encodeAddCollateral({ ...params, amount: 0n })).toThrow(MarginSdkError)
  })

  test('native amount: value set, zero amount field required', () => {
    const call = addCollateralCall({
      marginRouter: ROUTER,
      params: { ...params, amount: 0n },
      nativeAmount: 2n * 10n ** 18n,
    })
    expect(call.value).toBe(2n * 10n ** 18n)
    expect(() => addCollateralCall({ marginRouter: ROUTER, params, nativeAmount: 1n })).toThrow(MarginSdkError)
  })
})

describe('encodeExecute / multicall', () => {
  test('execute matches cast-generated calldata byte-for-byte', () => {
    expect(encodeExecute('0x1234', 99n)).toBe(CAST_EXECUTE_CALLDATA as `0x${string}`)
  })

  test('multicall wraps inner calldata', () => {
    const inner = encodeAddCollateral({ adapter: ADAPTER, market: LONG_MARKET, amount: 1n, deadline: 1n })
    const data = encodeRouterMulticall([inner])
    const { functionName, args } = decodeFunctionData({ abi: MARGIN_ROUTER_ABI, data })
    expect(functionName).toBe('multicall')
    expect((args as readonly [readonly `0x${string}`[]])[0][0]).toBe(inner)
  })

  test('multicall rejects an empty batch', () => {
    expect(() => encodeRouterMulticall([])).toThrow(MarginSdkError)
  })
})
