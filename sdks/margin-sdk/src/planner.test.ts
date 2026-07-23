import { describe, expect, test } from 'bun:test'
import { type Address, decodeAbiParameters } from 'viem'

import { MarginAction, V4RouterAction } from './actions'
import { CONTRACT_BALANCE, MSG_SENDER, OPEN_DELTA } from './constants'
import { MarginSdkError } from './errors'
import { MarginPlanner } from './planner'
import { type PoolKey } from './types'

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const ADAPTER: Address = '0x9A7f8F5A9496D3c9dc0BEEfb44cCaC17CAAF28fa'
const ZERO: Address = '0x0000000000000000000000000000000000000000'
const ADDR2: Address = '0x0000000000000000000000000000000000000002'

const MARKET = { collateral: WETH, debt: USDC }
const POOL: PoolKey = { currency0: USDC, currency1: WETH, fee: 3000, tickSpacing: 60, hooks: ZERO }

/** Ground-truth blobs generated with `cast abi-encode` against the decoder signatures. */
const CAST = {
  setAccount7: '0x0000000000000000000000000000000000000000000000000000000000000007',
  pullWeth1e18True:
    '0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000001',
  supplyOpenDelta:
    '0x0000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000000000000',
  borrow3e9ToRouter:
    '0x0000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000b2d05e000000000000000000000000000000000000000000000000000000000000000002',
  assertHealth07:
    '0x0000000000000000000000009a7f8f5a9496d3c9dc0beefb44ccac17caaf28fa000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000009b6e64a8ec60000',
  assertFillWeth1e18:
    '0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000de0b6b3a7640000',
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

  test('borrow to ADDRESS_THIS', () => {
    const p = new MarginPlanner().setAccount(0n).borrow(ADAPTER, MARKET, 3_000n * 10n ** 6n, ADDR2)
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
      .borrow(ADAPTER, MARKET, 1n, ADDR2)
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
    // ASSERT_FILL and plain routing actions are not account-scoped
    expect(() => new MarginPlanner().assertFill(WETH, 1n).finalize()).not.toThrow()
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
