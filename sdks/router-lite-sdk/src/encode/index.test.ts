import { expect, test } from 'bun:test'
import type { Address } from 'viem'

import { UnsupportedRouteError } from '../errors'
import { v2Ref, v3Ref } from '../internal/testing'
import type { CommandSet, ExecutionPlan, PoolRef, UniversalRouterDeployment } from '../types'
import { COMMAND_SETS } from '../types'

import { encodeExecutionPlan } from './ur20'
import { encodeExecutionPlanUr21 } from './ur21'

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

// IDENTITY, NOT AGREEMENT. `expect(encoder(plan, ...)).toEqual(encodeExecutionPlan(plan, ...))` was
// the assertion here, and it is `f(x) === f(x)` — `encoder` IS `encodeExecutionPlan`, so the call
// compares a function's output with its own and passes for every possible registry. What has content
// is WHICH function came back, and that the two sets do not come back with the same one (below).
test('encoderFor(\'ur-2.0\') dispatches to the ur-2.0 encoder itself', () => {
  expect(encoderFor('ur-2.0')).toBe(encodeExecutionPlan)
})

// The ur-2.1 half was missing outright: the registry could have mapped 'ur-2.1' to the 2.0 encoder
// and every test in this file passed. The differential suite would eventually have caught it (it
// compares each set against its own `UniversalRouterVersion`), but only after building 73 shapes
// twice through universal-router-sdk — this is the one-line version of the same claim.
test('encoderFor(\'ur-2.1\') dispatches to the ur-2.1 encoder itself', () => {
  expect(encoderFor('ur-2.1')).toBe(encodeExecutionPlanUr21)
})

// And the two are genuinely different functions producing genuinely different calldata, which is what
// makes the identity assertions above discriminating rather than decorative: a registry that pointed
// both sets at one encoder would satisfy neither.
test('the two registered encoders are distinct, and encode the same plan differently', () => {
  const ur21Deployment: UniversalRouterDeployment = { ...deployment, commandSet: 'ur-2.1' }
  expect(encodeExecutionPlanUr21).not.toBe(encodeExecutionPlan)
  expect(encoderFor('ur-2.1')(plan, ur21Deployment, 1_700_000_000n).data).not.toBe(
    encoderFor('ur-2.0')(plan, deployment, 1_700_000_000n).data,
  )
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

// The same non-tautology applied to the second shape: what the fixture buys is that BOTH sets encode
// it, and encode it differently — a claim about the registry, not about a function agreeing with
// itself. (`encoderFor('ur-2.0') === encodeExecutionPlan` is already asserted above, so re-invoking
// one against the other here proved nothing about this shape either.)
test('both registered encoders handle a second, unrelated route shape (v2, distinct tokens/addresses) — and still disagree', () => {
  const ur21Deployment: UniversalRouterDeployment = { ...deployment, commandSet: 'ur-2.1' }
  const ur20 = encoderFor('ur-2.0')(secondPlan, deployment, 1_700_000_100n)
  const ur21 = encoderFor('ur-2.1')(secondPlan, ur21Deployment, 1_700_000_100n)
  expect(ur20.data.length).toBeGreaterThan(2)
  expect(ur21.data).not.toBe(ur20.data)
  expect(ur21.value).toBe(ur20.value)
})
