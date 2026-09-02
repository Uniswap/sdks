import { describe, expect, test } from 'bun:test'
import { type Address, decodeAbiParameters } from 'viem'

import { MarginAction, V4RouterAction } from './actions.js'
import { ADDRESS_THIS, CONTRACT_BALANCE, MSG_SENDER, OPEN_DELTA } from './constants.js'
import { MarginSdkError } from './errors.js'
import { MarginPlanner, withdrawCollateralPlan } from './planner.js'
import { type PoolKey } from './types.js'

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const ADAPTER: Address = '0x9A7f8F5A9496D3c9dc0BEEfb44cCaC17CAAF28fa'
const UR: Address = '0x1111111111111111111111111111111111111111'
const ZERO: Address = '0x0000000000000000000000000000000000000000'
const OWNER: Address = '0x1111111111111111111111111111111111111111'
const ROUTER: Address = '0x0000000004BBC92D0657580CAe35aEBF054E5CDC'

const MARKET = { collateral: WETH, debt: USDC }
const POOL: PoolKey = { currency0: USDC, currency1: WETH, fee: 3000, tickSpacing: 60, hooks: ZERO }

/** Ground-truth blobs generated with `cast abi-encode` against the decoder signatures. */
const CAST = {
  setAccount7: '0x0000000000000000000000000000000000000000000000000000000000000007',
  pullWeth1e18True:
    '0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000001',
  supplyOpenDelta:
    '0x0000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000000000000',
  // `to` is the LITERAL router address, not the ADDRESS_THIS sentinel: the router forwards
  // ACCOUNT_BORROW recipients to the account unmapped, and the account's _requireReceiver only
  // accepts its baked-in {owner, manager}. The curated increase encodes `address(this)` here too.
  borrow3e9ToRouter:
    '0x0000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000b2d05e000000000000000000000000000000000004bbc92d0657580cae35aebf054e5cdc',
  assertHealth07:
    '0x0000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000009b6e64a8ec60000',
  assertFillWeth1e18:
    '0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000de0b6b3a7640000',
  withdrawWeth1e18ToOwner:
    '0x0000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000001111111111111111111111111111111111111111',
  routeSwapWeth1e18:
    '0x0000000000000000000000001111111111111111111111111111111111111111000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000011000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002dead000000000000000000000000000000000000000000000000000000000000',
  swapExactOutSingle:
    '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000003c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000b3b53fc0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000000',
  settleUsdcOpenDeltaRouter:
    '0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  sweepWethMsgSender:
    '0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000000000000000001',
  unlockDataSetAccountPull:
    '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000023738000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000000000000060000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000001',
} as const

describe('MarginPlanner action encodings (vs cast abi-encode ground truth)', () => {
  test('setAccount', () => {
    const p = new MarginPlanner().setAccount(7n)
    expect(p.actions).toEqual([MarginAction.SET_ACCOUNT])
    expect(p.params[0]).toBe(CAST.setAccount7 as `0x${string}`)
  })

  test('pullToAccount', () => {
    const p = new MarginPlanner().setAccount(7n).pullToAccount(WETH, 10n ** 18n, true)
    expect(p.params[1]).toBe(CAST.pullWeth1e18True as `0x${string}`)
  })

  test('supplyCollateral with OPEN_DELTA', () => {
    const p = new MarginPlanner().setAccount(0n).supplyCollateral(ADAPTER, MARKET, OPEN_DELTA)
    expect(p.params[1]).toBe(CAST.supplyOpenDelta as `0x${string}`)
  })

  test('borrow to the literal router address', () => {
    const p = new MarginPlanner().setAccount(0n).borrow(ADAPTER, MARKET, 3_000n * 10n ** 6n, ROUTER)
    expect(p.params[1]).toBe(CAST.borrow3e9ToRouter as `0x${string}`)
  })

  test('assertHealth', () => {
    const p = new MarginPlanner().setAccount(0n).assertHealth(ADAPTER, MARKET, 7n * 10n ** 17n)
    expect(p.params[1]).toBe(CAST.assertHealth07 as `0x${string}`)
  })

  test('assertFill', () => {
    const p = new MarginPlanner().assertFill(WETH, 10n ** 18n)
    expect(p.params[0]).toBe(CAST.assertFillWeth1e18 as `0x${string}`)
  })

  test('routeSwap (vs cast abi-encode of the decodeRouteSwap shape)', () => {
    const p = new MarginPlanner().routeSwap({
      universalRouter: UR,
      input: WETH,
      maxIn: 10n ** 18n,
      commands: '0x10',
      inputs: ['0xdead'],
    })
    expect(p.actions).toEqual([MarginAction.ROUTE_SWAP])
    expect(MarginAction.ROUTE_SWAP).toBe(0x39)
    expect(p.params[0]).toBe(CAST.routeSwapWeth1e18 as `0x${string}`)
  })

  test('assertAccountBalance shares the (currency, minAmount) shape with assertFill', () => {
    const p = new MarginPlanner().setAccount(0n).assertAccountBalance(WETH, 10n ** 18n)
    expect(p.actions[1]).toBe(MarginAction.ASSERT_ACCOUNT_BALANCE)
    expect(MarginAction.ASSERT_ACCOUNT_BALANCE).toBe(0x3a)
    expect(p.params[1]).toBe(CAST.assertFillWeth1e18 as `0x${string}`)
  })

  test('routeSwap rejects a zero Universal Router and a zero maxIn', () => {
    const route = { input: WETH, maxIn: 1n, commands: '0x10' as const, inputs: ['0xdead' as const] }
    expect(() => new MarginPlanner().routeSwap({ ...route, universalRouter: ZERO })).toThrow(MarginSdkError)
    expect(() => new MarginPlanner().routeSwap({ ...route, universalRouter: UR, maxIn: 0n })).toThrow(MarginSdkError)
  })

  test('swapExactOutSingle', () => {
    const p = new MarginPlanner().swapExactOutSingle({
      poolKey: POOL,
      zeroForOne: true,
      amountOut: 10n ** 18n,
      amountInMaximum: 3_015n * 10n ** 6n,
    })
    expect(p.params[0]).toBe(CAST.swapExactOutSingle as `0x${string}`)
  })

  test('settle with OPEN_DELTA from router balance', () => {
    const p = new MarginPlanner().settle(USDC, OPEN_DELTA, false)
    expect(p.params[0]).toBe(CAST.settleUsdcOpenDeltaRouter as `0x${string}`)
  })

  test('sweep to MSG_SENDER', () => {
    const p = new MarginPlanner().sweep(WETH, MSG_SENDER)
    expect(p.params[0]).toBe(CAST.sweepWethMsgSender as `0x${string}`)
  })
})

describe('MarginPlanner.finalize', () => {
  test('unlockData matches cast abi-encode(bytes,bytes[]) ground truth', () => {
    const unlockData = new MarginPlanner()
      .setAccount(7n)
      .pullToAccount(WETH, 10n ** 18n, true)
      .finalize()
    expect(unlockData).toBe(CAST.unlockDataSetAccountPull as `0x${string}`)
  })

  test('packs one opcode byte per action in order', () => {
    const unlockData = new MarginPlanner()
      .setAccount(0n)
      .swapExactOutSingle({ poolKey: POOL, zeroForOne: true, amountOut: 1n, amountInMaximum: 1n })
      .assertFill(WETH, 1n)
      .supplyCollateral(ADAPTER, MARKET, OPEN_DELTA)
      .borrow(ADAPTER, MARKET, 1n, ROUTER)
      .settle(USDC, OPEN_DELTA, false)
      .assertHealth(ADAPTER, MARKET, 7n * 10n ** 17n)
      .sweep(WETH, MSG_SENDER)
      .finalize()
    const [actions, params] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], unlockData)
    expect(actions).toBe(
      `0x${[
        MarginAction.SET_ACCOUNT,
        V4RouterAction.SWAP_EXACT_OUT_SINGLE,
        MarginAction.ASSERT_FILL,
        MarginAction.ACCOUNT_SUPPLY_COLLATERAL,
        MarginAction.ACCOUNT_BORROW,
        V4RouterAction.SETTLE,
        MarginAction.ASSERT_HEALTH,
        V4RouterAction.SWEEP,
      ]
        .map((a) => a.toString(16).padStart(2, '0'))
        .join('')}`
    )
    expect(params).toHaveLength(8)
  })

  test('rejects an empty plan', () => {
    expect(() => new MarginPlanner().finalize()).toThrow(MarginSdkError)
  })

  test('rejects account-scoped actions before SET_ACCOUNT (NoActiveAccount mirror)', () => {
    expect(() => new MarginPlanner().supplyCollateral(ADAPTER, MARKET, 0n).finalize()).toThrow(MarginSdkError)
    expect(() => new MarginPlanner().assertAccountBalance(WETH, 1n).finalize()).toThrow(MarginSdkError)
    // ASSERT_FILL, ROUTE_SWAP, and plain routing actions are not account-scoped
    expect(() => new MarginPlanner().assertFill(WETH, 1n).finalize()).not.toThrow()
    expect(() =>
      new MarginPlanner()
        .routeSwap({ universalRouter: UR, input: WETH, maxIn: 1n, commands: '0x10', inputs: ['0xdead'] })
        .finalize()
    ).not.toThrow()
    expect(() => new MarginPlanner().sweep(WETH, MSG_SENDER).finalize()).not.toThrow()
  })

  test('pullToAccount guards the zero-amount and CONTRACT_BALANCE-from-user footguns', () => {
    const p = new MarginPlanner().setAccount(0n)
    expect(() => p.pullToAccount(WETH, 0n, true)).toThrow(MarginSdkError)
    expect(() => p.pullToAccount(WETH, CONTRACT_BALANCE, true)).toThrow(MarginSdkError)
    expect(() => p.pullToAccount(WETH, CONTRACT_BALANCE, false)).not.toThrow()
  })

  test('multi-hop swaps default per-hop bounds to zero entries', () => {
    const p = new MarginPlanner().swapExactIn({
      currencyIn: USDC,
      path: [{ intermediateCurrency: WETH, fee: 3000, tickSpacing: 60, hooks: ZERO, hookData: '0x' }],
      amountIn: 1n,
      amountOutMinimum: 1n,
    })
    expect(p.actions).toEqual([V4RouterAction.SWAP_EXACT_IN])
  })
})

describe('zero-recipient guards on fund-out actions', () => {
  const planner = () => new MarginPlanner().setAccount(0n)

  test('account fund-out actions reject the zero address', () => {
    expect(() => planner().withdrawCollateral(ADAPTER, MARKET, 1n, ZERO)).toThrow(MarginSdkError)
    expect(() => planner().borrow(ADAPTER, MARKET, 1n, ZERO)).toThrow(MarginSdkError)
    expect(() => planner().accountSweep(WETH, 1n, ZERO)).toThrow(MarginSdkError)
  })

  test('account fund-out actions reject the unmapped v4 sentinels', () => {
    // The router passes ACCOUNT_* recipients straight to the account without _mapRecipient, so a
    // sentinel arrives as the literal 0x…01/0x…02 and reverts ReceiverNotAllowed.
    for (const sentinel of [MSG_SENDER, ADDRESS_THIS]) {
      expect(() => planner().withdrawCollateral(ADAPTER, MARKET, 1n, sentinel)).toThrow(/sentinel/)
      expect(() => planner().borrow(ADAPTER, MARKET, 1n, sentinel)).toThrow(/sentinel/)
      expect(() => planner().accountSweep(WETH, 1n, sentinel)).toThrow(/sentinel/)
    }
  })

  test('router fund-out actions reject the zero address', () => {
    expect(() => planner().take(WETH, ZERO, 1n)).toThrow(MarginSdkError)
    expect(() => planner().takePortion(WETH, ZERO, 100n)).toThrow(MarginSdkError)
    expect(() => planner().sweep(WETH, ZERO)).toThrow(MarginSdkError)
  })

  test('the MSG_SENDER / ADDRESS_THIS sentinels remain valid ROUTER-level recipients', () => {
    // Only the router-level opcodes resolve them (via _mapRecipient); the account-scoped ones do
    // not, which is what the sentinel-rejection test above pins.
    expect(() => planner().take(WETH, MSG_SENDER, 1n).sweep(WETH, MSG_SENDER)).not.toThrow()
    expect(() => planner().take(WETH, ADDRESS_THIS, 1n).takePortion(WETH, ADDRESS_THIS, 100n)).not.toThrow()
  })
})

describe('withdrawCollateralPlan', () => {
  const base = { adapter: ADAPTER, market: MARKET, amount: 10n ** 18n, to: OWNER, maxLtvAfter: 8n * 10n ** 17n }

  test('composes SET_ACCOUNT → ACCOUNT_WITHDRAW_COLLATERAL → ASSERT_HEALTH', () => {
    const [actions] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], withdrawCollateralPlan(base))
    expect(actions).toBe(
      `0x${[MarginAction.SET_ACCOUNT, MarginAction.ACCOUNT_WITHDRAW_COLLATERAL, MarginAction.ASSERT_HEALTH]
        .map((a) => a.toString(16).padStart(2, '0'))
        .join('')}`
    )
  })

  test('the withdraw params match cast-generated ground truth', () => {
    const [, params] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], withdrawCollateralPlan(base))
    expect(params[1]).toBe(CAST.withdrawWeth1e18ToOwner)
  })

  test('threads subId through SET_ACCOUNT', () => {
    const [, params] = decodeAbiParameters(
      [{ type: 'bytes' }, { type: 'bytes[]' }],
      withdrawCollateralPlan({ ...base, subId: 7n })
    )
    expect(params[0]).toBe(CAST.setAccount7)
  })

  test('rejects a zero amount — there is no full-balance sentinel on this action', () => {
    expect(() => withdrawCollateralPlan({ ...base, amount: OPEN_DELTA })).toThrow(/no full-balance sentinel/)
    expect(() => withdrawCollateralPlan({ ...base, amount: -1n })).toThrow(MarginSdkError)
  })

  test('requires a non-zero maxLtvAfter (ASSERT_HEALTH skips a zero bound)', () => {
    expect(() => withdrawCollateralPlan({ ...base, maxLtvAfter: 0n })).toThrow(/mandatory/)
  })

  test('rejects recipients the account would reject', () => {
    expect(() => withdrawCollateralPlan({ ...base, to: ZERO })).toThrow(MarginSdkError)
    expect(() => withdrawCollateralPlan({ ...base, to: MSG_SENDER })).toThrow(/sentinel/)
  })

  test('rejects a native-ETH market', () => {
    expect(() => withdrawCollateralPlan({ ...base, market: { collateral: ZERO, debt: USDC } })).toThrow(MarginSdkError)
  })
})
