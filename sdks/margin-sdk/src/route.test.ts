import { describe, expect, test } from 'bun:test'
import { type Address, decodeAbiParameters } from 'viem'

import { MarginSdkError } from './errors.js'
import { UR_COMMAND_V4_SWAP, buildV4ExactOutRoute } from './route.js'
import { type PoolKey } from './types.js'

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
const ZERO: Address = '0x0000000000000000000000000000000000000000'

const POOL: PoolKey = { currency0: USDC, currency1: WETH, fee: 500, tickSpacing: 10, hooks: ZERO }

/**
 * Ground truth generated with `cast abi-encode` against the same shapes the Universal Router
 * decodes (`abi.encode(v4Actions, v4Params)` with SWAP_EXACT_OUT_SINGLE / SETTLE / TAKE params),
 * mirroring v4-periphery `test/shared/MarginRouteHelpers.buildV4ExactOutRoute`.
 */
const CAST_ROUTE_INPUT =
  '0x000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000003080b0e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000028000000000000000000000000000000000000000000000000000000000000001800000000000000000000000000000000000000000000000000000000000000020000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc200000000000000000000000000000000000000000000000000000000000001f4000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000b2d05e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000060000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc200000000000000000000000022222222222222222222222222222222222222220000000000000000000000000000000000000000000000000000000000000000'

describe('buildV4ExactOutRoute', () => {
  test('matches cast abi-encode ground truth byte-for-byte (buy WETH with USDC)', () => {
    const route = buildV4ExactOutRoute({
      poolKey: POOL,
      input: USDC,
      output: WETH,
      amountOut: 10n ** 18n,
      amountInMaximum: 3_000n * 10n ** 6n,
      recipient: ACCOUNT,
    })
    expect(route.commands).toBe('0x10')
    expect(UR_COMMAND_V4_SWAP).toBe(0x10)
    expect(route.inputs).toHaveLength(1)
    expect(route.inputs[0]).toBe(CAST_ROUTE_INPUT as `0x${string}`)
  })

  test('derives zeroForOne from the input side of the pool', () => {
    const decode = (input: Address, output: Address) => {
      const route = buildV4ExactOutRoute({
        poolKey: POOL,
        input,
        output,
        amountOut: 1n,
        amountInMaximum: 1n,
        recipient: ACCOUNT,
      })
      const [actions, params] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], route.inputs[0]!)
      expect(actions).toBe('0x080b0e') // SWAP_EXACT_OUT_SINGLE, SETTLE, TAKE
      const [swap] = decodeAbiParameters(
        [
          {
            type: 'tuple',
            components: [
              {
                name: 'poolKey',
                type: 'tuple',
                components: [
                  { name: 'currency0', type: 'address' },
                  { name: 'currency1', type: 'address' },
                  { name: 'fee', type: 'uint24' },
                  { name: 'tickSpacing', type: 'int24' },
                  { name: 'hooks', type: 'address' },
                ],
              },
              { name: 'zeroForOne', type: 'bool' },
              { name: 'amountOut', type: 'uint128' },
              { name: 'amountInMaximum', type: 'uint128' },
              { name: 'minHopPriceX36', type: 'uint256' },
              { name: 'hookData', type: 'bytes' },
            ],
          },
        ],
        params[0]!
      )
      return (swap as { zeroForOne: boolean }).zeroForOne
    }
    expect(decode(USDC, WETH)).toBe(true) // USDC is currency0: selling it is zeroForOne
    expect(decode(WETH, USDC)).toBe(false)
  })

  test('rejects an input/output pair that is not the pool pair', () => {
    expect(() =>
      buildV4ExactOutRoute({
        poolKey: POOL,
        input: USDC,
        output: ACCOUNT,
        amountOut: 1n,
        amountInMaximum: 1n,
        recipient: ACCOUNT,
      })
    ).toThrow(MarginSdkError)
    expect(() =>
      buildV4ExactOutRoute({
        poolKey: POOL,
        input: USDC,
        output: USDC,
        amountOut: 1n,
        amountInMaximum: 1n,
        recipient: ACCOUNT,
      })
    ).toThrow(MarginSdkError)
  })

  test('rejects a zero recipient (the output must reach the MarginAccount)', () => {
    expect(() =>
      buildV4ExactOutRoute({
        poolKey: POOL,
        input: USDC,
        output: WETH,
        amountOut: 1n,
        amountInMaximum: 1n,
        recipient: ZERO,
      })
    ).toThrow(MarginSdkError)
  })

  test('rejects amounts above uint128', () => {
    expect(() =>
      buildV4ExactOutRoute({
        poolKey: POOL,
        input: USDC,
        output: WETH,
        amountOut: 1n << 128n,
        amountInMaximum: 1n,
        recipient: ACCOUNT,
      })
    ).toThrow(MarginSdkError)
  })
})
