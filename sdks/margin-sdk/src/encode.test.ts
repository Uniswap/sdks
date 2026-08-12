import { describe, expect, test } from 'bun:test'
import { type Address, decodeFunctionData, toFunctionSelector } from 'viem'

import { MARGIN_ACCOUNT_ABI, MARGIN_ROUTER_ABI } from './abis.js'
import { ADDRESS_THIS, FULL_CLOSE, MSG_SENDER, WAD } from './constants.js'
import {
  accountBorrowCall,
  accountRepayCall,
  accountSupplyCollateralCall,
  accountSweepCall,
  accountWithdrawCollateralCall,
  addCollateralCall,
  closePositionCall,
  decreasePositionCall,
  encodeAccountBorrow,
  encodeAccountRepay,
  encodeAccountSupplyCollateral,
  encodeAccountSweep,
  encodeAccountWithdrawCollateral,
  encodeAddCollateral,
  encodeDecreasePosition,
  encodeExecute,
  encodeIncreasePosition,
  encodeRouterMulticall,
  increasePositionCall,
} from './encode.js'
import { MarginSdkError } from './errors.js'
import { type IncreaseParams } from './types.js'

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const ADAPTER: Address = '0x9A7f8F5A9496D3c9dc0BEEfb44cCaC17CAAF28fa'
const ROUTER: Address = '0x000000000075e82F7B7DdC5DD1B4984b560eF5D4'
const UNIVERSAL_ROUTER: Address = '0x1111111111111111111111111111111111111111'
const ZERO: Address = '0x0000000000000000000000000000000000000000'

function expectCode(fn: () => unknown, code: string): void {
  let thrown: unknown
  try {
    fn()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(MarginSdkError)
  expect((thrown as MarginSdkError).code).toBe(code as never)
}

const LONG_MARKET = { collateral: WETH, debt: USDC }
const ROUTE = { universalRouter: UNIVERSAL_ROUTER, routeCommands: '0x10', routeInputs: ['0xdead'] } as const

const BASE_INCREASE: IncreaseParams = {
  adapter: ADAPTER,
  market: LONG_MARKET,
  equity: 10n ** 18n,
  collateralToBuy: 10n ** 18n,
  maxDebtIn: 10_000n * 10n ** 6n,
  ...ROUTE,
  routeInputs: [...ROUTE.routeInputs],
  deadline: 1n,
}

/**
 * Ground-truth calldata generated with `cast calldata` from the deployed contract's signatures;
 * each selector was additionally confirmed against the live mainnet router at
 * 0x000000000075e82F7B7DdC5DD1B4984b560eF5D4 (an expired deadline reverts `DeadlinePassed(1)`,
 * proving the selector dispatched).
 */
const CAST_INCREASE_CALLDATA =
  '0x084a1ed300000000000000000000000000000000000000000000000000000000000000200000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000002540be4000000000000000000000000001111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000011000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002dead000000000000000000000000000000000000000000000000000000000000'

const CAST_DECREASE_CALLDATA =
  '0x9b30450500000000000000000000000000000000000000000000000000000000000000200000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000001111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000000000000000000009b6e64a8ec600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000011000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002dead000000000000000000000000000000000000000000000000000000000000'

const CAST_ADD_COLLATERAL_CALLDATA =
  '0x434f7ded0000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001'

const CAST_EXECUTE_CALLDATA =
  '0xab5898e80000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000006300000000000000000000000000000000000000000000000000000000000000021234000000000000000000000000000000000000000000000000000000000000'

describe('entry point selectors (verified against the live mainnet router)', () => {
  const selectors: Record<string, string> = {
    increasePosition: '0x084a1ed3',
    decreasePosition: '0x9b304505',
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
    const data = encodeIncreasePosition({ ...BASE_INCREASE, maxLtvAfter: 7n, subId: 9n })
    const { functionName, args } = decodeFunctionData({ abi: MARGIN_ROUTER_ABI, data })
    expect(functionName).toBe('increasePosition')
    const params = (args as readonly [Record<string, unknown>])[0]
    expect(params.universalRouter).toBe(UNIVERSAL_ROUTER)
    expect(params.routeCommands).toBe('0x10')
    expect(params.routeInputs).toEqual(['0xdead'])
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

  test('rejects a zero Universal Router (UniversalRouterNotSet mirror)', () => {
    expectCode(() => encodeIncreasePosition({ ...BASE_INCREASE, universalRouter: ZERO }), 'UNIVERSAL_ROUTER_REQUIRED')
  })

  test('rejects an empty route', () => {
    expect(() => encodeIncreasePosition({ ...BASE_INCREASE, routeCommands: '0x' })).toThrow(MarginSdkError)
    expect(() => encodeIncreasePosition({ ...BASE_INCREASE, routeInputs: [] })).toThrow(MarginSdkError)
  })

  test('rejects an unbindable maxLtvAfter (IneffectiveLtvBound mirror)', () => {
    expectCode(() => encodeIncreasePosition({ ...BASE_INCREASE, maxLtvAfter: WAD }), 'INEFFECTIVE_LTV_BOUND')
    expect(() => encodeIncreasePosition({ ...BASE_INCREASE, maxLtvAfter: WAD - 1n })).not.toThrow()
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
    debtToRepay: 10n ** 6n,
    maxCollateralIn: 10n ** 18n,
    ...ROUTE,
    routeInputs: [...ROUTE.routeInputs],
    maxLtvAfter: 7n * 10n ** 17n,
    deadline: 1n,
  }

  test('matches cast-generated calldata byte-for-byte', () => {
    expect(encodeDecreasePosition(partial)).toBe(CAST_DECREASE_CALLDATA as `0x${string}`)
  })

  test('partial decrease requires maxLtvAfter', () => {
    expect(() => encodeDecreasePosition({ ...partial, maxLtvAfter: 0n })).toThrow(MarginSdkError)
  })

  test('partial decrease rejects an unbindable maxLtvAfter', () => {
    expectCode(() => encodeDecreasePosition({ ...partial, maxLtvAfter: WAD }), 'INEFFECTIVE_LTV_BOUND')
  })

  test('partial decrease requires maxCollateralIn', () => {
    expect(() => encodeDecreasePosition({ ...partial, maxCollateralIn: 0n })).toThrow(MarginSdkError)
  })

  test('partial decrease requires the Universal Router route', () => {
    expectCode(() => encodeDecreasePosition({ ...partial, universalRouter: ZERO }), 'UNIVERSAL_ROUTER_REQUIRED')
    expect(() => encodeDecreasePosition({ ...partial, universalRouter: undefined })).toThrow(MarginSdkError)
    expect(() => encodeDecreasePosition({ ...partial, routeCommands: '0x' })).toThrow(MarginSdkError)
  })

  test('full close allows an omitted route and zero bounds (zero-debt swap-free path)', () => {
    const data = encodeDecreasePosition({
      adapter: ADAPTER,
      market: LONG_MARKET,
      debtToRepay: FULL_CLOSE,
      maxCollateralIn: 0n,
      deadline: 1n,
    })
    const { args } = decodeFunctionData({ abi: MARGIN_ROUTER_ABI, data })
    const params = (args as readonly [Record<string, unknown>])[0]
    expect(params.debtToRepay).toBe(FULL_CLOSE)
    expect(params.universalRouter).toBe(ZERO)
    expect(params.routeCommands).toBe('0x')
  })

  test('full close with a route requires a Universal Router for it', () => {
    expectCode(
      () =>
        encodeDecreasePosition({
          adapter: ADAPTER,
          market: LONG_MARKET,
          debtToRepay: FULL_CLOSE,
          maxCollateralIn: 10n ** 18n,
          routeCommands: '0x10',
          routeInputs: ['0xdead'],
          deadline: 1n,
        }),
      'UNIVERSAL_ROUTER_REQUIRED'
    )
  })

  test('closePositionCall sets the FULL_CLOSE sentinel', () => {
    const call = closePositionCall({
      marginRouter: ROUTER,
      params: {
        adapter: ADAPTER,
        market: LONG_MARKET,
        maxCollateralIn: 5n * 10n ** 18n,
        ...ROUTE,
        routeInputs: [...ROUTE.routeInputs],
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

describe('deadline validation', () => {
  test('rejects zero and negative deadlines', () => {
    expect(() => encodeIncreasePosition({ ...BASE_INCREASE, deadline: 0n })).toThrow(MarginSdkError)
    expect(() => encodeExecute('0x1234', -1n)).toThrow(MarginSdkError)
  })

  test('rejects millisecond timestamps (Date.now() footgun)', () => {
    const ms = BigInt(1_784_900_000_000) // a Date.now()-scale value
    expect(() => encodeIncreasePosition({ ...BASE_INCREASE, deadline: ms })).toThrow(/milliseconds/)
    expect(() => encodeAddCollateral({ adapter: ADAPTER, market: LONG_MARKET, amount: 1n, deadline: ms })).toThrow(
      MarginSdkError
    )
  })

  test('accepts plausible second timestamps', () => {
    expect(() => encodeIncreasePosition({ ...BASE_INCREASE, deadline: 1_784_900_000n })).not.toThrow()
  })
})

describe('account-direct withdrawCollateral (owner escape hatch)', () => {
  const OWNER: Address = '0x1111111111111111111111111111111111111111'
  const ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
  const params = { adapter: ADAPTER, market: LONG_MARKET, amount: 10n ** 18n, to: OWNER }

  /** `cast calldata "withdrawCollateral(address,(address,address),uint256,address)" ...` */
  const CAST_WITHDRAW_CALLDATA =
    '0xe3f81c670000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000001111111111111111111111111111111111111111'

  test('selector matches the pinned account ABI', () => {
    const item = MARGIN_ACCOUNT_ABI.find((e) => e.type === 'function' && e.name === 'withdrawCollateral')
    expect(item).toBeDefined()
    expect(toFunctionSelector(item as never)).toBe('0xe3f81c67')
  })

  test('matches cast-generated calldata byte-for-byte', () => {
    expect(encodeAccountWithdrawCollateral(params)).toBe(CAST_WITHDRAW_CALLDATA as `0x${string}`)
  })

  test('descriptor targets the account, not the router', () => {
    const call = accountWithdrawCollateralCall({ account: ACCOUNT, params })
    expect(call.address).toBe(ACCOUNT)
    expect(call.functionName).toBe('withdrawCollateral')
    expect(call.args).toEqual([ADAPTER, LONG_MARKET, 10n ** 18n, OWNER])
  })

  test('round-trips through decodeFunctionData', () => {
    const decoded = decodeFunctionData({
      abi: MARGIN_ACCOUNT_ABI,
      data: encodeAccountWithdrawCollateral(params),
    })
    expect(decoded.functionName).toBe('withdrawCollateral')
    expect(decoded.args?.[3]).toBe(OWNER)
  })

  test('rejects the sentinels the account cannot resolve', () => {
    // ReceiverNotAllowed onchain: ACCOUNT_* recipients are never mapped through _mapRecipient.
    expect(() => encodeAccountWithdrawCollateral({ ...params, to: MSG_SENDER })).toThrow(/sentinel/)
    expect(() => encodeAccountWithdrawCollateral({ ...params, to: ADDRESS_THIS })).toThrow(/sentinel/)
  })

  test('rejects a zero recipient and a non-positive amount', () => {
    expect(() => encodeAccountWithdrawCollateral({ ...params, to: ZERO })).toThrow(MarginSdkError)
    expect(() => encodeAccountWithdrawCollateral({ ...params, amount: 0n })).toThrow(MarginSdkError)
    expect(() => encodeAccountWithdrawCollateral({ ...params, amount: -1n })).toThrow(MarginSdkError)
  })

  test('rejects a native-ETH market (collateral must be an ERC-20)', () => {
    expect(() => encodeAccountWithdrawCollateral({ ...params, market: { collateral: ZERO, debt: USDC } })).toThrow(
      MarginSdkError
    )
  })
})

describe('account-direct sibling primitives (owner escape hatch)', () => {
  const OWNER: Address = '0x1111111111111111111111111111111111111111'
  const ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
  const base = { adapter: ADAPTER, market: LONG_MARKET, amount: 10n ** 18n }

  /** Ground truth from `cast calldata` against the IMarginAccount signatures. */
  const CAST = {
    supplyCollateral:
      '0x785e28ab0000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000de0b6b3a7640000',
    repayFull:
      '0x004e7e480000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    borrow:
      '0x2cefd3210000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000b2d05e000000000000000000000000001111111111111111111111111111111111111111',
    sweepNative:
      '0xdc2c256f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000001111111111111111111111111111111111111111',
  } as const

  test('supplyCollateral matches cast ground truth', () => {
    expect(encodeAccountSupplyCollateral(base)).toBe(CAST.supplyCollateral as `0x${string}`)
  })

  test('repay accepts FULL_CLOSE for a share-based full repay', () => {
    expect(encodeAccountRepay({ ...base, amount: FULL_CLOSE })).toBe(CAST.repayFull as `0x${string}`)
  })

  test('supplyCollateral rejects the max sentinel (no such semantics there)', () => {
    expect(() => encodeAccountSupplyCollateral({ ...base, amount: FULL_CLOSE })).toThrow(/no max-amount sentinel/)
  })

  test('borrow matches cast ground truth and validates the recipient', () => {
    expect(encodeAccountBorrow({ ...base, amount: 3_000n * 10n ** 6n, to: OWNER })).toBe(CAST.borrow as `0x${string}`)
    expect(() => encodeAccountBorrow({ ...base, to: MSG_SENDER })).toThrow(/sentinel/)
    expect(() => encodeAccountBorrow({ ...base, to: ZERO })).toThrow(MarginSdkError)
  })

  test('sweep matches cast ground truth and allows native ETH as the currency', () => {
    expect(encodeAccountSweep({ currency: ZERO, amount: 10n ** 18n, to: OWNER })).toBe(
      CAST.sweepNative as `0x${string}`
    )
  })

  test('sweep still rejects a sentinel recipient and a zero amount', () => {
    expect(() => encodeAccountSweep({ currency: WETH, amount: 1n, to: ADDRESS_THIS })).toThrow(/sentinel/)
    expect(() => encodeAccountSweep({ currency: WETH, amount: 0n, to: OWNER })).toThrow(MarginSdkError)
  })

  test('descriptors target the account with the account ABI', () => {
    for (const call of [
      accountSupplyCollateralCall({ account: ACCOUNT, params: base }),
      accountRepayCall({ account: ACCOUNT, params: base }),
      accountBorrowCall({ account: ACCOUNT, params: { ...base, to: OWNER } }),
      accountSweepCall({ account: ACCOUNT, params: { currency: WETH, amount: 1n, to: OWNER } }),
    ]) {
      expect(call.address).toBe(ACCOUNT)
      expect(call.abi).toBe(MARGIN_ACCOUNT_ABI)
    }
  })
})

describe('address validation', () => {
  test('rejects a malformed adapter address', () => {
    expect(() => encodeIncreasePosition({ ...BASE_INCREASE, adapter: '0x1234' as never })).toThrow(MarginSdkError)
  })

  test('rejects a malformed market token address', () => {
    expect(() =>
      encodeIncreasePosition({ ...BASE_INCREASE, market: { collateral: 'not-an-address' as never, debt: USDC } })
    ).toThrow(MarginSdkError)
  })

  test('rejects a malformed universalRouter address', () => {
    expect(() => encodeIncreasePosition({ ...BASE_INCREASE, universalRouter: '0xbad' as never })).toThrow(
      MarginSdkError
    )
  })
})
