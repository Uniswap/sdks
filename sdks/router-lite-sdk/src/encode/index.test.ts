import { expect, test } from 'bun:test'
import type { Address } from 'viem'

import { UnsupportedRouteError } from '../errors'
import { v2Ref, v3Ref } from '../internal/testing'
import type { CommandSet, ExecutionPlan, PoolRef, UniversalRouterDeployment } from '../types'
import { COMMAND_SETS } from '../types'

import { encodeExecutionPlan } from './ur20'

import { encoderFor } from './index'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address
const UR = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af' as Address
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address

const deployment: UniversalRouterDeployment = { address: UR, commandSet: 'ur-2.0', permit2: PERMIT2, wrappedNative: WETH }

const v3UsdcWeth: PoolRef = v3Ref('0x00000000000000000000000000000000000a0001', USDC, WETH, 3000)

const plan: ExecutionPlan = {
  acquireInput: { kind: 'permit2-pull', token: USDC, amount: 1000n },
  operations: [
    { kind: 'v3-swap', legs: [{ pool: v3UsdcWeth, currencyIn: USDC, currencyOut: WETH }], payer: 'trader-via-permit2', recipient: 'final' },
  ],
  deliverOutput: { recipient: UR, currency: WETH, minAmountOut: 990n },
}

test('encoderFor(\'ur-2.0\') dispatches to the ur-2.0 encoder', () => {
  const encoder = encoderFor('ur-2.0')
  expect(encoder).toBe(encodeExecutionPlan)
  expect(encoder(plan, deployment, 1_700_000_000n)).toEqual(encodeExecutionPlan(plan, deployment, 1_700_000_000n))
})

test('encoderFor throws UnsupportedRouteError for an unregistered command set', () => {
  expect(() => encoderFor('ur-9.9' as CommandSet)).toThrow(UnsupportedRouteError)
})

// ---------------------------------------------------------------------------
// C4-T1 redundancy pass: two independent angles on `encoderFor`'s registry dispatch, neither a copy
// of the pair above.
// ---------------------------------------------------------------------------

// Iterates the real `COMMAND_SETS` list rather than the hardcoded `'ur-2.0'` literal both tests
// above use — this is the one fixture that would still fail if the registry silently dropped an
// entry (or the dispatch were hardcoded to a value that only coincidentally equals the literal every
// other test in this file happens to pass).
test('encoderFor resolves every registered CommandSet in COMMAND_SETS, not just the literal used elsewhere in this file', () => {
  for (const commandSet of COMMAND_SETS) {
    expect(typeof encoderFor(commandSet)).toBe('function')
  }
})

// A second, unrelated route shape (a v2 leg over different tokens/addresses) — dispatch correctness
// checked against a fixture that shares nothing with `plan`/`v3UsdcWeth` above, so a mutant that
// happened to special-case the first fixture's shape cannot hide behind it.
const v2WethUsdc: PoolRef = v2Ref('0x00000000000000000000000000000000000b0002', WETH, USDC)
const secondPlan: ExecutionPlan = {
  acquireInput: { kind: 'permit2-pull', token: WETH, amount: 500n },
  operations: [
    { kind: 'v2-swap', legs: [{ pool: v2WethUsdc, currencyIn: WETH, currencyOut: USDC }], payer: 'trader-via-permit2', recipient: 'final' },
  ],
  deliverOutput: { recipient: UR, currency: USDC, minAmountOut: 400n },
}

test('encoderFor(\'ur-2.0\') dispatch holds for a second, unrelated route shape (v2, distinct tokens/addresses)', () => {
  const encoder = encoderFor('ur-2.0')
  expect(encoder(secondPlan, deployment, 1_700_000_100n)).toEqual(encodeExecutionPlan(secondPlan, deployment, 1_700_000_100n))
})
