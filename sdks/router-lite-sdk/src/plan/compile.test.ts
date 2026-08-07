import { expect, test } from 'bun:test'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'

import { UR_ADDRESS_THIS, UR_MSG_SENDER } from '../constants'
import { UnsupportedRouteError } from '../errors'
import { v2Ref, v3Ref, v4Ref } from '../internal/testing'
import type { ProtocolModule } from '../protocols/types'
import { v2Module } from '../protocols/v2'
import { v3Module } from '../protocols/v3'
import { v4Module } from '../protocols/v4'
import type { ExecutionOperation, ExecutionPlan, PoolKey, PoolRef, Protocol, QuotedRoute, RouteLeg } from '../types'

import type { CompileExecutionPlanArgs } from './compile'
import { assertPlanInvariants, compileExecutionPlan } from './compile'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F' as Address
const TOKA = '0x1111111111111111111111111111111111111111' as Address
const TRADER = '0x2222222222222222222222222222222222222222' as Address

const modules: Record<Protocol, ProtocolModule> = { v2: v2Module, v3: v3Module, v4: v4Module }

// ---------------------------------------------------------------------------
// Fixture pools and routes
// ---------------------------------------------------------------------------

const v3UsdcWeth: PoolRef = v3Ref('0x00000000000000000000000000000000000a0001', USDC, WETH, 3000)
const v3WethUsdc: PoolRef = v3Ref('0x00000000000000000000000000000000000a0002', USDC, WETH, 500)
const v3UsdcDai: PoolRef = v3Ref('0x00000000000000000000000000000000000a0003', DAI, USDC, 100)
const v2WethUsdc: PoolRef = v2Ref('0x00000000000000000000000000000000000b0001', USDC, WETH)
const v2DaiUsdc: PoolRef = v2Ref('0x00000000000000000000000000000000000b0002', DAI, USDC)

const v4TokaNativeKey: PoolKey = { currency0: zeroAddress, currency1: TOKA, fee: 3000, tickSpacing: 60, hooks: zeroAddress }
const v4TokaNative: PoolRef = v4Ref(v4TokaNativeKey)
const v4NativeUsdcKey: PoolKey = { currency0: zeroAddress, currency1: USDC, fee: 500, tickSpacing: 10, hooks: zeroAddress }
const v4NativeUsdc: PoolRef = v4Ref(v4NativeUsdcKey)

function quoted(legs: RouteLeg[], amountOut = 1000n, intermediateAmounts: bigint[] = []): QuotedRoute {
  return { route: { legs }, quote: { amountIn: 1000n, amountOut, intermediateAmounts } }
}

/** v3 USDC -> WETH, single hop, single segment. */
const v3Single = quoted([{ pool: v3UsdcWeth, currencyIn: USDC, currencyOut: WETH }])

/** v4 TOKA -> native, then v3 WETH -> USDC: the mixed route that needs an intermediate wrap. */
const v4NativeThenV3 = quoted(
  [
    { pool: v4TokaNative, currencyIn: TOKA, currencyOut: 'native' },
    { pool: v3WethUsdc, currencyIn: WETH, currencyOut: USDC },
  ],
  1000n,
  [500n],
)

/** v2 native(→WETH) -> USDC, single hop. */
const v2Single = quoted([{ pool: v2WethUsdc, currencyIn: 'native', currencyOut: USDC }])

/** USDC -> DAI -> WETH where both legs reuse the same pool — structurally impossible. */
const duplicatePoolRoute = quoted([
  { pool: v3UsdcDai, currencyIn: USDC, currencyOut: DAI },
  { pool: v3UsdcDai, currencyIn: DAI, currencyOut: WETH },
])

function base(overrides: Partial<CompileExecutionPlanArgs> = {}): CompileExecutionPlanArgs {
  return {
    quoted: v3Single,
    tokenIn: USDC,
    tokenOut: WETH,
    trader: TRADER,
    recipient: TRADER,
    slippageBps: 100,
    wrappedNative: WETH,
    modules,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Brief tests
// ---------------------------------------------------------------------------

test('v3 single-hop erc20→erc20', () => {
  const plan = compileExecutionPlan(base({ quoted: v3Single, tokenIn: USDC, tokenOut: WETH }))
  expect(plan.acquireInput.kind).toBe('permit2-pull')
  expect(plan.operations).toHaveLength(1)
  expect(plan.operations[0]).toMatchObject({ kind: 'v3-swap', payer: 'trader-via-permit2', recipient: 'final' })
  expect(plan.deliverOutput.minAmountOut).toBe(990n) // amountOut 1000, 100bps
})

test('v4-native → v3-WETH mixed inserts an INTERMEDIATE wrap', () => {
  const plan = compileExecutionPlan(base({ quoted: v4NativeThenV3, tokenIn: TOKA, tokenOut: USDC }))
  expect(plan.operations.map((o) => o.kind)).toEqual(['v4-swap', 'wrap-native', 'v3-swap'])
  expect((plan.operations[1] as any).amount).toBe('router-balance')
})

test('native input to v2 wraps first, payer router', () => {
  const plan = compileExecutionPlan(base({ quoted: v2Single, tokenIn: 'native', tokenOut: USDC }))
  expect(plan.acquireInput.kind).toBe('native-value')
  expect(plan.operations.map((o) => o.kind)).toEqual(['wrap-native', 'v2-swap'])
  expect((plan.operations[1] as any).payer).toBe('router')
})

test('invariants: duplicate pool rejected; sentinel recipient rejected', () => {
  expect(() => compileExecutionPlan(base({ quoted: duplicatePoolRoute }))).toThrow(UnsupportedRouteError)
  expect(() => compileExecutionPlan(base({ recipient: UR_ADDRESS_THIS }))).toThrow(UnsupportedRouteError)
})

test('invariants: the recipient may not be a pool the plan itself trades through (C4-H4)', () => {
  // The request-level recipient checks in `router.ts` can only name addresses known before a route
  // exists (the tokens, the UR, Permit2, WETH). A pool address is only knowable once a route has
  // been picked — and delivering the output into a pool the plan just swapped through donates it to
  // that pool's LPs, irreversibly. The legs are in hand here, so this is the layer that can see it.
  const poolAddress = (v3UsdcWeth as Extract<PoolRef, { protocol: 'v3' }>).address
  expect(() => compileExecutionPlan(base({ recipient: poolAddress }))).toThrow(UnsupportedRouteError)
  // Case is not a loophole, and it holds for a second-leg pool too, not just the one that delivers.
  expect(() => compileExecutionPlan(base({ recipient: poolAddress.toUpperCase().replace('0X', '0x') as Address }))).toThrow(
    UnsupportedRouteError,
  )
  const secondLegPool = (v3WethUsdc as Extract<PoolRef, { protocol: 'v3' }>).address
  expect(() =>
    compileExecutionPlan(base({ quoted: v4NativeThenV3, tokenIn: TOKA, tokenOut: USDC, recipient: secondLegPool })),
  ).toThrow(UnsupportedRouteError)
  // An unrelated pool address is fine — this rejects the plan's OWN pools, not every pool on chain.
  const unrelated = (v2DaiUsdc as Extract<PoolRef, { protocol: 'v2' }>).address
  expect(() => compileExecutionPlan(base({ recipient: unrelated }))).not.toThrow()
})

// ---------------------------------------------------------------------------
// Custody and conversion placement
// ---------------------------------------------------------------------------

test('acquireInput carries the quoted amountIn and the permit', () => {
  const permit = {
    details: { token: USDC, amount: 5000n, expiration: 0, nonce: 0 },
    spender: TRADER,
    sigDeadline: 0n,
    signature: '0xdead' as const,
  }
  const plan = compileExecutionPlan(base({ permit }))
  expect(plan.acquireInput).toEqual({ kind: 'permit2-pull', token: USDC, amount: 1000n, permit })
})

test('erc20 input without a permit omits the permit field entirely', () => {
  const plan = compileExecutionPlan(base())
  expect(plan.acquireInput).toEqual({ kind: 'permit2-pull', token: USDC, amount: 1000n })
})

test('a permit on a native-value input is rejected', () => {
  const permit = {
    details: { token: WETH, amount: 5000n, expiration: 0, nonce: 0 },
    spender: TRADER,
    sigDeadline: 0n,
    signature: '0xdead' as const,
  }
  expect(() => compileExecutionPlan(base({ quoted: v2Single, tokenIn: 'native', tokenOut: USDC, permit }))).toThrow(
    UnsupportedRouteError,
  )
})

test('native input to v4 needs no leading wrap and settles from the router', () => {
  const route = quoted([{ pool: v4NativeUsdc, currencyIn: 'native', currencyOut: USDC }])
  const plan = compileExecutionPlan(base({ quoted: route, tokenIn: 'native', tokenOut: USDC }))
  expect(plan.acquireInput).toEqual({ kind: 'native-value', amount: 1000n })
  expect(plan.operations).toHaveLength(1)
  expect(plan.operations[0]).toMatchObject({ kind: 'v4-swap', settleFrom: 'router', takeTo: 'final' })
})

test('the leading wrap uses the exact input amount, not the router balance', () => {
  const plan = compileExecutionPlan(base({ quoted: v2Single, tokenIn: 'native', tokenOut: USDC }))
  expect(plan.operations[0]).toEqual({ kind: 'wrap-native', amount: 1000n })
})

test('WETH input into a native v4 pool unwraps first, then settles from the router', () => {
  const route = quoted([{ pool: v4NativeUsdc, currencyIn: 'native', currencyOut: USDC }])
  const plan = compileExecutionPlan(base({ quoted: route, tokenIn: WETH, tokenOut: USDC }))
  expect(plan.acquireInput).toMatchObject({ kind: 'permit2-pull', token: WETH })
  expect(plan.operations.map((o) => o.kind)).toEqual(['unwrap-native', 'v4-swap'])
  expect(plan.operations[0]).toEqual({ kind: 'unwrap-native', amount: 1000n })
  expect(plan.operations[1]).toMatchObject({ settleFrom: 'router', takeTo: 'final' })
})

test('native tokenOut out of a v3 leg appends a trailing unwrap', () => {
  const route = quoted([{ pool: v3UsdcWeth, currencyIn: USDC, currencyOut: WETH }])
  const plan = compileExecutionPlan(base({ quoted: route, tokenIn: USDC, tokenOut: 'native' }))
  expect(plan.operations.map((o) => o.kind)).toEqual(['v3-swap', 'unwrap-native'])
  expect(plan.operations[0]).toMatchObject({ recipient: 'router' })
  expect(plan.operations[1]).toEqual({ kind: 'unwrap-native', amount: 'router-balance' })
  expect(plan.deliverOutput).toEqual({ recipient: TRADER, currency: 'native', minAmountOut: 990n })
})

test('WETH tokenOut out of a native v4 leg appends a trailing wrap', () => {
  const route = quoted([{ pool: v4NativeUsdc, currencyIn: USDC, currencyOut: 'native' }])
  const plan = compileExecutionPlan(base({ quoted: route, tokenIn: USDC, tokenOut: WETH }))
  expect(plan.operations.map((o) => o.kind)).toEqual(['v4-swap', 'wrap-native'])
  expect(plan.operations[0]).toMatchObject({ takeTo: 'router' })
  expect(plan.operations[1]).toEqual({ kind: 'wrap-native', amount: 'router-balance' })
  expect(plan.deliverOutput).toEqual({ recipient: TRADER, currency: WETH, minAmountOut: 990n })
})

test('a v3 leg materialized with a native currency is compiled in wrapped form', () => {
  const route = quoted([{ pool: v3UsdcWeth, currencyIn: USDC, currencyOut: 'native' }])
  const plan = compileExecutionPlan(base({ quoted: route, tokenIn: USDC, tokenOut: 'native' }))
  expect(plan.operations.map((o) => o.kind)).toEqual(['v3-swap', 'unwrap-native'])
  expect((plan.operations[0] as any).legs[0].currencyOut).toBe(WETH)
})

test('a wrapped-native v3 → native v4 boundary inserts an intermediate unwrap', () => {
  const route = quoted(
    [
      { pool: v3UsdcWeth, currencyIn: USDC, currencyOut: WETH },
      { pool: v4TokaNative, currencyIn: 'native', currencyOut: TOKA },
    ],
    1000n,
    [500n],
  )
  const plan = compileExecutionPlan(base({ quoted: route, tokenIn: USDC, tokenOut: TOKA }))
  expect(plan.operations.map((o) => o.kind)).toEqual(['v3-swap', 'unwrap-native', 'v4-swap'])
  expect(plan.operations[1]).toEqual({ kind: 'unwrap-native', amount: 'router-balance' })
  expect(plan.operations[0]).toMatchObject({ payer: 'trader-via-permit2', recipient: 'router' })
  expect(plan.operations[2]).toMatchObject({ settleFrom: 'router', takeTo: 'final' })
})

test('two v2 legs compile to two solo operations, the middle one router→router', () => {
  const route = quoted(
    [
      { pool: v2DaiUsdc, currencyIn: DAI, currencyOut: USDC },
      { pool: v2WethUsdc, currencyIn: USDC, currencyOut: WETH },
    ],
    1000n,
    [500n],
  )
  const plan = compileExecutionPlan(base({ quoted: route, tokenIn: DAI, tokenOut: WETH }))
  expect(plan.operations.map((o) => o.kind)).toEqual(['v2-swap', 'v2-swap'])
  expect(plan.operations[0]).toMatchObject({ payer: 'trader-via-permit2', recipient: 'router' })
  expect(plan.operations[1]).toMatchObject({ payer: 'router', recipient: 'final' })
})

test('contiguous v3 legs stay in one whole-path operation', () => {
  const route = quoted(
    [
      { pool: v3UsdcDai, currencyIn: USDC, currencyOut: DAI },
      { pool: v3WethUsdc, currencyIn: DAI, currencyOut: WETH },
    ],
    1000n,
    [500n],
  )
  const plan = compileExecutionPlan(base({ quoted: route, tokenIn: USDC, tokenOut: WETH }))
  expect(plan.operations).toHaveLength(1)
  expect((plan.operations[0] as any).legs).toHaveLength(2)
})

test('minAmountOut floors rather than rounds', () => {
  const plan = compileExecutionPlan(base({ quoted: quoted([{ pool: v3UsdcWeth, currencyIn: USDC, currencyOut: WETH }], 999n), slippageBps: 33 }))
  expect(plan.deliverOutput.minAmountOut).toBe(995n) // 999 * 9967 / 10000 = 995.6...
})

test('zero slippage keeps the full quote as the minimum', () => {
  const plan = compileExecutionPlan(base({ slippageBps: 0 }))
  expect(plan.deliverOutput.minAmountOut).toBe(1000n)
})

test('out-of-range slippage is rejected', () => {
  expect(() => compileExecutionPlan(base({ slippageBps: -1 }))).toThrow(UnsupportedRouteError)
  expect(() => compileExecutionPlan(base({ slippageBps: 10_001 }))).toThrow(UnsupportedRouteError)
  expect(() => compileExecutionPlan(base({ slippageBps: 12.5 }))).toThrow(UnsupportedRouteError)
})

// ---------------------------------------------------------------------------
// Compiler guards
// ---------------------------------------------------------------------------

test('tokenIn === tokenOut is rejected, family-normalized', () => {
  expect(() => compileExecutionPlan(base({ tokenIn: USDC, tokenOut: USDC }))).toThrow(UnsupportedRouteError)
  expect(() => compileExecutionPlan(base({ tokenIn: 'native', tokenOut: WETH }))).toThrow(UnsupportedRouteError)
  expect(() => compileExecutionPlan(base({ tokenIn: WETH, tokenOut: 'native' }))).toThrow(UnsupportedRouteError)
})

test('a route with no legs is rejected', () => {
  expect(() => compileExecutionPlan(base({ quoted: quoted([]) }))).toThrow(UnsupportedRouteError)
})

test('a route whose endpoints do not match tokenIn/tokenOut is rejected', () => {
  expect(() => compileExecutionPlan(base({ tokenIn: DAI, tokenOut: WETH }))).toThrow(UnsupportedRouteError)
  expect(() => compileExecutionPlan(base({ tokenIn: USDC, tokenOut: DAI }))).toThrow(UnsupportedRouteError)
})

test('a route with a broken leg chain is rejected', () => {
  const broken = quoted(
    [
      { pool: v3UsdcDai, currencyIn: USDC, currencyOut: DAI },
      { pool: v2WethUsdc, currencyIn: USDC, currencyOut: WETH },
    ],
    1000n,
    [500n],
  )
  expect(() => compileExecutionPlan(base({ quoted: broken, tokenIn: USDC, tokenOut: WETH }))).toThrow(UnsupportedRouteError)
})

test('a non-positive amountIn is rejected', () => {
  const zeroIn: QuotedRoute = { route: v3Single.route, quote: { amountIn: 0n, amountOut: 1000n, intermediateAmounts: [] } }
  expect(() => compileExecutionPlan(base({ quoted: zeroIn }))).toThrow(UnsupportedRouteError)
})

test('a non-positive amountOut is rejected', () => {
  const zeroOut: QuotedRoute = { route: v3Single.route, quote: { amountIn: 1000n, amountOut: 0n, intermediateAmounts: [] } }
  expect(() => compileExecutionPlan(base({ quoted: zeroOut }))).toThrow(UnsupportedRouteError)
  const negativeOut: QuotedRoute = { route: v3Single.route, quote: { amountIn: 1000n, amountOut: -1n, intermediateAmounts: [] } }
  expect(() => compileExecutionPlan(base({ quoted: negativeOut }))).toThrow(UnsupportedRouteError)
})

test('a sentinel trader is rejected', () => {
  expect(() => compileExecutionPlan(base({ trader: UR_MSG_SENDER }))).toThrow(UnsupportedRouteError)
})

test('the zero address is never a usable recipient', () => {
  expect(() => compileExecutionPlan(base({ recipient: zeroAddress }))).toThrow(UnsupportedRouteError)
})

// ---------------------------------------------------------------------------
// assertPlanInvariants — every invariant, tested on a hand-built plan so the
// check is exercised independently of whether the compiler can produce the
// violation today.
// ---------------------------------------------------------------------------

const usdcToWeth: RouteLeg = { pool: v3UsdcWeth, currencyIn: USDC, currencyOut: WETH }
const usdcToDai: RouteLeg = { pool: v3UsdcDai, currencyIn: USDC, currencyOut: DAI }
const daiToWeth: RouteLeg = { pool: v2DaiUsdc, currencyIn: DAI, currencyOut: WETH }
const nativeToUsdc: RouteLeg = { pool: v4NativeUsdc, currencyIn: 'native', currencyOut: USDC }

function planWith(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    acquireInput: { kind: 'permit2-pull', token: USDC, amount: 1000n },
    operations: [{ kind: 'v3-swap', legs: [usdcToWeth], payer: 'trader-via-permit2', recipient: 'final' }],
    deliverOutput: { recipient: TRADER, currency: WETH, minAmountOut: 990n },
    ...overrides,
  }
}

function withOperations(operations: ExecutionOperation[], overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return planWith({ operations, ...overrides })
}

test('the baseline hand-built plan satisfies every invariant', () => {
  expect(() => assertPlanInvariants(planWith(), WETH)).not.toThrow()
})

test('invariant: single consumer per intermediate output — two operations may not both deliver', () => {
  const plan = withOperations([
    { kind: 'v3-swap', legs: [usdcToDai], payer: 'trader-via-permit2', recipient: 'final' },
    { kind: 'v2-swap', legs: [daiToWeth], payer: 'router', recipient: 'final' },
  ])
  expect(() => assertPlanInvariants(plan, WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: single consumer per intermediate output — a v4 take-to-final mid-plan is rejected', () => {
  const plan = withOperations(
    [
      { kind: 'v4-swap', legs: [nativeToUsdc], settleFrom: 'router', takeTo: 'final' },
      { kind: 'v3-swap', legs: [usdcToWeth], payer: 'router', recipient: 'final' },
    ],
    { acquireInput: { kind: 'native-value', amount: 1000n } },
  )
  expect(() => assertPlanInvariants(plan, WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: single consumer per intermediate output — a currency-mismatched hand-off strands funds', () => {
  // Regression: operation 0 leaves DAI in the router and operation 1 expects WETH, so the DAI has
  // no consumer at all and the v2 swap is funded by nothing.
  const plan = withOperations([
    { kind: 'v3-swap', legs: [usdcToDai], payer: 'trader-via-permit2', recipient: 'router' },
    { kind: 'v2-swap', legs: [{ pool: v2WethUsdc, currencyIn: WETH, currencyOut: USDC }], payer: 'router', recipient: 'final' },
  ])
  expect(() => assertPlanInvariants(plan, WETH)).toThrow(/produces .* but operation 1 consumes/)
})

test('invariant: exactly one deliverOutput — the last operation may not strand its output', () => {
  const plan = withOperations([{ kind: 'v3-swap', legs: [usdcToWeth], payer: 'trader-via-permit2', recipient: 'router' }])
  expect(() => assertPlanInvariants(plan, WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: exactly one deliverOutput — the delivered currency is the one actually produced', () => {
  expect(() => assertPlanInvariants(planWith({ deliverOutput: { recipient: TRADER, currency: DAI, minAmountOut: 990n } }), WETH)).toThrow(
    UnsupportedRouteError,
  )
  const unwrapping = withOperations(
    [
      { kind: 'v3-swap', legs: [usdcToWeth], payer: 'trader-via-permit2', recipient: 'router' },
      { kind: 'unwrap-native', amount: 'router-balance' },
    ],
    { deliverOutput: { recipient: TRADER, currency: WETH, minAmountOut: 990n } },
  )
  expect(() => assertPlanInvariants(unwrapping, WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: a trailing wrap can only deliver wrapped native', () => {
  const plan = withOperations(
    [
      { kind: 'v4-swap', legs: [{ pool: v4NativeUsdc, currencyIn: USDC, currencyOut: 'native' }], settleFrom: 'trader-via-permit2', takeTo: 'router' },
      { kind: 'wrap-native', amount: 'router-balance' },
    ],
    { deliverOutput: { recipient: TRADER, currency: DAI, minAmountOut: 990n } },
  )
  // A trailing wrap can only ever produce wrapped native, so a plan delivering anything else is
  // pinned as broken against the wrapped-native address every real caller supplies.
  expect(() => assertPlanInvariants(plan, WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: a conversion counterpart must be the wrapped native', () => {
  const plan = withOperations(
    [
      { kind: 'v4-swap', legs: [{ pool: v4NativeUsdc, currencyIn: USDC, currencyOut: 'native' }], settleFrom: 'trader-via-permit2', takeTo: 'router' },
      { kind: 'wrap-native', amount: 'router-balance' },
      { kind: 'v3-swap', legs: [{ pool: v3UsdcDai, currencyIn: DAI, currencyOut: USDC }], payer: 'router', recipient: 'final' },
    ],
    { deliverOutput: { recipient: TRADER, currency: USDC, minAmountOut: 990n } },
  )
  expect(() => assertPlanInvariants(plan, WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: exactly one deliverOutput — a plan with no operations or no swaps is rejected', () => {
  expect(() => assertPlanInvariants(withOperations([]), WETH)).toThrow(UnsupportedRouteError)
  expect(() => assertPlanInvariants(withOperations([{ kind: 'wrap-native', amount: 1000n }]), WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: no duplicate pool in legs', () => {
  const plan = withOperations([
    { kind: 'v3-swap', legs: [usdcToDai, { pool: v3UsdcDai, currencyIn: DAI, currencyOut: WETH }], payer: 'trader-via-permit2', recipient: 'final' },
  ])
  expect(() => assertPlanInvariants(plan, WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: recipients are never UR sentinels', () => {
  for (const sentinel of [UR_MSG_SENDER, UR_ADDRESS_THIS, zeroAddress as Address]) {
    expect(() => assertPlanInvariants(planWith({ deliverOutput: { recipient: sentinel, currency: WETH, minAmountOut: 990n } }), WETH)).toThrow(
      UnsupportedRouteError,
    )
  }
})

test('invariant: wrap/unwrap only next to an operation needing the conversion — unwrap before v3', () => {
  const plan = withOperations([
    { kind: 'unwrap-native', amount: 1000n },
    { kind: 'v3-swap', legs: [usdcToWeth], payer: 'router', recipient: 'final' },
  ])
  expect(() => assertPlanInvariants(plan, WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: wrap/unwrap only next to an operation needing the conversion — wrap before a native v4 swap', () => {
  const plan = withOperations(
    [
      { kind: 'wrap-native', amount: 1000n },
      { kind: 'v4-swap', legs: [nativeToUsdc], settleFrom: 'router', takeTo: 'final' },
    ],
    { acquireInput: { kind: 'native-value', amount: 1000n }, deliverOutput: { recipient: TRADER, currency: USDC, minAmountOut: 990n } },
  )
  expect(() => assertPlanInvariants(plan, WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: wrap/unwrap only next to an operation needing the conversion — wrap after a non-native producer', () => {
  const plan = withOperations(
    [
      { kind: 'v3-swap', legs: [usdcToDai], payer: 'trader-via-permit2', recipient: 'router' },
      { kind: 'wrap-native', amount: 'router-balance' },
    ],
    { deliverOutput: { recipient: TRADER, currency: WETH, minAmountOut: 990n } },
  )
  expect(() => assertPlanInvariants(plan, WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: wrap/unwrap only next to an operation needing the conversion — never back to back', () => {
  const plan = withOperations(
    [
      { kind: 'wrap-native', amount: 1000n },
      { kind: 'unwrap-native', amount: 'router-balance' },
      { kind: 'v4-swap', legs: [nativeToUsdc], settleFrom: 'router', takeTo: 'final' },
    ],
    { acquireInput: { kind: 'native-value', amount: 1000n }, deliverOutput: { recipient: TRADER, currency: USDC, minAmountOut: 990n } },
  )
  expect(() => assertPlanInvariants(plan, WETH)).toThrow(/adjacent/)
})

test('invariant: a leading conversion must match how the input was acquired', () => {
  const wrapAfterPull = withOperations([
    { kind: 'wrap-native', amount: 1000n },
    { kind: 'v3-swap', legs: [usdcToWeth], payer: 'router', recipient: 'final' },
  ])
  expect(() => assertPlanInvariants(wrapAfterPull, WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: permit only on the first operation — only the first swap may be trader-paid', () => {
  const plan = withOperations([
    { kind: 'v3-swap', legs: [usdcToDai], payer: 'trader-via-permit2', recipient: 'router' },
    { kind: 'v2-swap', legs: [daiToWeth], payer: 'trader-via-permit2', recipient: 'final' },
  ])
  expect(() => assertPlanInvariants(plan, WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: permit only on the first operation — a trader-paid swap needs a Permit2 pull', () => {
  const plan = planWith({ acquireInput: { kind: 'native-value', amount: 1000n } })
  expect(() => assertPlanInvariants(plan, WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: permit only on the first operation — the permit must match the pull', () => {
  const permitFor = (token: Address, amount: bigint) => ({
    details: { token, amount, expiration: 0, nonce: 0 },
    spender: TRADER,
    sigDeadline: 0n,
    signature: '0xdead' as const,
  })
  expect(() =>
    assertPlanInvariants(planWith({ acquireInput: { kind: 'permit2-pull', token: USDC, amount: 1000n, permit: permitFor(DAI, 5000n) } }), WETH),
  ).toThrow(UnsupportedRouteError)
  expect(() =>
    assertPlanInvariants(planWith({ acquireInput: { kind: 'permit2-pull', token: USDC, amount: 1000n, permit: permitFor(USDC, 999n) } }), WETH),
  ).toThrow(UnsupportedRouteError)
  expect(() =>
    assertPlanInvariants(planWith({ acquireInput: { kind: 'permit2-pull', token: USDC, amount: 1000n, permit: permitFor(USDC, 1000n) } }), WETH),
  ).not.toThrow()
})

test('invariant: v2/v3 operations never hold native, and their legs match their protocol', () => {
  const nativeLegOnV3 = withOperations([
    { kind: 'v3-swap', legs: [{ pool: v3UsdcWeth, currencyIn: USDC, currencyOut: 'native' }], payer: 'trader-via-permit2', recipient: 'final' },
  ])
  expect(() => assertPlanInvariants(nativeLegOnV3, WETH)).toThrow(UnsupportedRouteError)

  const wrongProtocol = withOperations([{ kind: 'v3-swap', legs: [daiToWeth], payer: 'trader-via-permit2', recipient: 'final' }])
  expect(() => assertPlanInvariants(wrongProtocol, WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: a v2 operation is single-leg, and every operation chains internally', () => {
  const multiLegV2 = withOperations([
    {
      kind: 'v2-swap',
      legs: [
        { pool: v2DaiUsdc, currencyIn: DAI, currencyOut: USDC },
        { pool: v2WethUsdc, currencyIn: USDC, currencyOut: WETH },
      ],
      payer: 'trader-via-permit2',
      recipient: 'final',
    },
  ])
  expect(() => assertPlanInvariants(multiLegV2, WETH)).toThrow(UnsupportedRouteError)

  const brokenChain = withOperations([
    {
      kind: 'v3-swap',
      legs: [usdcToDai, { pool: v3WethUsdc, currencyIn: USDC, currencyOut: WETH }],
      payer: 'trader-via-permit2',
      recipient: 'final',
    },
  ])
  expect(() => assertPlanInvariants(brokenChain, WETH)).toThrow(UnsupportedRouteError)
})

test('invariant: amounts are positive and the minimum is not negative', () => {
  expect(() => assertPlanInvariants(planWith({ acquireInput: { kind: 'permit2-pull', token: USDC, amount: 0n } }), WETH)).toThrow(
    UnsupportedRouteError,
  )
  expect(() => assertPlanInvariants(planWith({ deliverOutput: { recipient: TRADER, currency: WETH, minAmountOut: -1n } }), WETH)).toThrow(
    UnsupportedRouteError,
  )
  const zeroWrap = withOperations(
    [
      { kind: 'wrap-native', amount: 0n },
      { kind: 'v3-swap', legs: [usdcToWeth], payer: 'router', recipient: 'final' },
    ],
    { acquireInput: { kind: 'native-value', amount: 1000n } },
  )
  expect(() => assertPlanInvariants(zeroWrap, WETH)).toThrow(UnsupportedRouteError)
})

test('every plan the compiler produces passes the invariants it enforces', () => {
  const cases: CompileExecutionPlanArgs[] = [
    base(),
    base({ quoted: v2Single, tokenIn: 'native', tokenOut: USDC }),
    base({ quoted: v4NativeThenV3, tokenIn: TOKA, tokenOut: USDC }),
    base({ quoted: quoted([{ pool: v3UsdcWeth, currencyIn: USDC, currencyOut: WETH }]), tokenIn: USDC, tokenOut: 'native' }),
    base({ quoted: quoted([{ pool: v4NativeUsdc, currencyIn: USDC, currencyOut: 'native' }]), tokenIn: USDC, tokenOut: WETH }),
    base({ quoted: quoted([{ pool: v4NativeUsdc, currencyIn: 'native', currencyOut: USDC }]), tokenIn: WETH, tokenOut: USDC }),
  ]
  for (const args of cases) expect(() => assertPlanInvariants(compileExecutionPlan(args), WETH)).not.toThrow()
})
