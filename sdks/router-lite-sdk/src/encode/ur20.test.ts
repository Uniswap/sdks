import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'bun:test'
import type { Address } from 'viem'
import { decodeAbiParameters, decodeFunctionData, parseAbiParameters, zeroAddress } from 'viem'

import { UR_ADDRESS_THIS } from '../constants'
import { UnsupportedRouteError } from '../errors'
import { UR_ABI } from '../internal/abis'
import { v3Ref, v4Ref } from '../internal/testing'
import type { CompileExecutionPlanArgs } from '../plan/compile'
import { compileExecutionPlan } from '../plan/compile'
import type { ProtocolModule } from '../protocols/types'
import { v2Module } from '../protocols/v2'
import { v3Module } from '../protocols/v3'
import { v4Module } from '../protocols/v4'
import type {
  ExecutionOperation,
  ExecutionPlan,
  Permit2PermitSingle,
  PoolKey,
  PoolRef,
  Protocol,
  QuotedRoute,
  RouteLeg,
  UniversalRouterDeployment,
} from '../types'

import { encodeExecutionPlan } from './ur20'

const modules: Record<Protocol, ProtocolModule> = { v2: v2Module, v3: v3Module, v4: v4Module }

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F' as Address
const TRADER = '0x2222222222222222222222222222222222222222' as Address
const UR = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af' as Address
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address

const deployment: UniversalRouterDeployment = {
  address: UR,
  commandSet: 'ur-2.0',
  permit2: PERMIT2,
  wrappedNative: WETH,
}

const DEADLINE = 1_700_000_000n

const v3UsdcWeth: PoolRef = v3Ref('0x00000000000000000000000000000000000a0001', USDC, WETH, 3000)
const v3WethDai: PoolRef = v3Ref('0x00000000000000000000000000000000000a0002', DAI, WETH, 500)
const v3DaiUsdc: PoolRef = v3Ref('0x00000000000000000000000000000000000a0003', DAI, USDC, 100)
const v4NativeUsdcKey: PoolKey = { currency0: zeroAddress, currency1: USDC, fee: 500, tickSpacing: 10, hooks: zeroAddress }
const v4NativeUsdc: PoolRef = v4Ref(v4NativeUsdcKey)

function quoted(legs: RouteLeg[], amountIn = 1000n, amountOut = 1000n): QuotedRoute {
  return { route: { legs }, quote: { amountIn, amountOut, intermediateAmounts: [] } }
}

const permit: Permit2PermitSingle = {
  details: { token: USDC, amount: 1000n, expiration: 2_000_000_000, nonce: 0 },
  spender: UR,
  sigDeadline: 1_900_000_000n,
  signature: `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`,
}

function base(overrides: Partial<CompileExecutionPlanArgs> = {}): CompileExecutionPlanArgs {
  return {
    quoted: quoted([{ pool: v3UsdcWeth, currencyIn: USDC, currencyOut: WETH }]),
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

/** The `commands` byte string of an encoded plan, as an array of command bytes. */
function commandsOf(data: `0x${string}`): number[] {
  const { args } = decodeFunctionData({ abi: UR_ABI, data })
  const commands = args![0] as string
  const bytes: number[] = []
  for (let i = 2; i < commands.length; i += 2) bytes.push(parseInt(commands.slice(i, i + 2), 16))
  return bytes
}

function inputsOf(data: `0x${string}`): readonly `0x${string}`[] {
  const { args } = decodeFunctionData({ abi: UR_ABI, data })
  return args![1] as readonly `0x${string}`[]
}

// ---------------------------------------------------------------------------
// Hand-verifiable unit tests
// ---------------------------------------------------------------------------

test('PERMIT2_PERMIT is the first command, before any swap', () => {
  const plan = compileExecutionPlan(base({ permit }))
  const tx = encodeExecutionPlan(plan, deployment, DEADLINE)
  // 0x0a = PERMIT2_PERMIT, 0x00 = V3_SWAP_EXACT_IN
  expect(commandsOf(tx.data)).toEqual([0x0a, 0x00])

  const [decodedPermit, signature] = decodeAbiParameters(
    parseAbiParameters(
      '((address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline), bytes',
    ),
    inputsOf(tx.data)[0]!,
  )
  expect(decodedPermit.details.token).toBe(USDC)
  expect(decodedPermit.details.amount).toBe(1000n)
  expect(decodedPermit.spender).toBe(UR)
  expect(decodedPermit.sigDeadline).toBe(1_900_000_000n)
  expect(signature).toBe(permit.signature)
})

test('WRAP_ETH recipient is ADDRESS_THIS and its amount is the exact acquired input', () => {
  const plan = compileExecutionPlan(
    base({
      quoted: quoted([{ pool: v3UsdcWeth, currencyIn: 'native', currencyOut: USDC }]),
      tokenIn: 'native',
      tokenOut: USDC,
    }),
  )
  const tx = encodeExecutionPlan(plan, deployment, DEADLINE)
  // 0x0b = WRAP_ETH, 0x00 = V3_SWAP_EXACT_IN
  expect(commandsOf(tx.data)).toEqual([0x0b, 0x00])

  const [recipient, amount] = decodeAbiParameters(
    parseAbiParameters('address recipient, uint256 amount'),
    inputsOf(tx.data)[0]!,
  )
  expect(recipient).toBe(UR_ADDRESS_THIS)
  expect(amount).toBe(1000n)
  // native input is paid as msg.value, never pulled through Permit2
  expect(tx.value).toBe(1000n)
})

test('the deadline lands in the execute() args and `to` is the deployment address', () => {
  const plan = compileExecutionPlan(base())
  const tx = encodeExecutionPlan(plan, deployment, DEADLINE)
  const { functionName, args } = decodeFunctionData({ abi: UR_ABI, data: tx.data })
  expect(functionName).toBe('execute')
  expect(args).toHaveLength(3)
  expect(args![2]).toBe(DEADLINE)
  expect(tx.to).toBe(UR)
  expect(tx.value).toBe(0n)
})

test('an unknown commandSet is rejected', () => {
  const plan = compileExecutionPlan(base())
  expect(() =>
    encodeExecutionPlan(plan, { ...deployment, commandSet: 'ur-9.9' as UniversalRouterDeployment['commandSet'] }, DEADLINE),
  ).toThrow(UnsupportedRouteError)
})

test('a permit naming anyone but this router is rejected', () => {
  const attacker = '0x4444444444444444444444444444444444444444' as Address
  const plan = compileExecutionPlan(base({ permit: { ...permit, spender: attacker } }))
  // The plan itself is coherent — only the encoder knows which router the calldata is bound for,
  // and a permit is an allowance grant that outlives the swap.
  expect(() => encodeExecutionPlan(plan, deployment, DEADLINE)).toThrow(
    /permit grants an allowance to 0x4444444444444444444444444444444444444444, not to the Universal Router/,
  )
})

test('a permit spender is matched to the router case-insensitively', () => {
  const plan = compileExecutionPlan(base({ permit: { ...permit, spender: UR.toLowerCase() as Address } }))
  expect(commandsOf(encodeExecutionPlan(plan, deployment, DEADLINE).data)).toEqual([0x0a, 0x00])
})

test('a leading unwrap that pulls something other than the wrapped native is rejected', () => {
  const plan = compileExecutionPlan(
    base({
      quoted: quoted([{ pool: v4NativeUsdc, currencyIn: 'native', currencyOut: USDC }]),
      tokenIn: WETH,
      tokenOut: USDC,
    }),
  )
  expect(plan.operations[0]).toMatchObject({ kind: 'unwrap-native' })
  // Retarget the pull at DAI: UNWRAP_WETH always withdraws the router's own WETH, so the DAI would
  // land in the router and stay there while the swap ran on an incidental native balance.
  const strandsDai: ExecutionPlan = {
    ...plan,
    acquireInput: { kind: 'permit2-pull', token: DAI, amount: 1000n },
  }
  expect(() => encodeExecutionPlan(strandsDai, deployment, DEADLINE)).toThrow(
    /a leading unwrap must pull the router's wrapped native/,
  )
})

test('a plan whose first-operation payer disagrees with the encoded payerIsUser is rejected', () => {
  const plan = compileExecutionPlan(base())
  const swap = plan.operations[0] as Extract<ExecutionOperation, { kind: 'v3-swap' }>
  expect(swap.payer).toBe('trader-via-permit2')
  // Nothing precedes the swap, so the encoding would say payerIsUser=true while the plan expects the
  // router to self-fund from a balance it was never given.
  const disagrees: ExecutionPlan = { ...plan, operations: [{ ...swap, payer: 'router' }] }
  expect(() => encodeExecutionPlan(disagrees, deployment, DEADLINE)).toThrow(
    /plan funds its first v3-swap from 'router' but the operation sequence encodes payerIsUser=true/,
  )
})

test('the one sanctioned payer disagreement — native input straight into v4 — still encodes', () => {
  const plan = compileExecutionPlan(
    base({
      quoted: quoted([{ pool: v4NativeUsdc, currencyIn: 'native', currencyOut: USDC }]),
      tokenIn: 'native',
      tokenOut: USDC,
    }),
  )
  // The plan says 'router' (a Permit2 payer is meaningless for ETH); a native v4 SETTLE ignores the
  // payer entirely, so the encoder is free to match universal-router-sdk's payerIsUser=true.
  expect(plan.operations[0]).toMatchObject({ kind: 'v4-swap', settleFrom: 'router' })
  expect(commandsOf(encodeExecutionPlan(plan, deployment, DEADLINE).data)).toEqual([0x10])
})

test('a non-positive deadline is rejected', () => {
  const plan = compileExecutionPlan(base())
  expect(() => encodeExecutionPlan(plan, deployment, 0n)).toThrow(UnsupportedRouteError)
})

test('a plan that fails the compiler invariants is rejected before anything is encoded', () => {
  const plan = compileExecutionPlan(base())
  // The final operation now strands its output in the router, which no encoding can rescue.
  const stranded: ExecutionPlan = {
    ...plan,
    operations: [{ ...(plan.operations[0] as Extract<ExecutionOperation, { kind: 'v3-swap' }>), recipient: 'router' }],
  }
  expect(() => encodeExecutionPlan(stranded, deployment, DEADLINE)).toThrow(UnsupportedRouteError)
})

test('more than two swap groups is outside the closed supported set', () => {
  const plan = compileExecutionPlan(base())
  const swap = plan.operations[0] as Extract<ExecutionOperation, { kind: 'v3-swap' }>
  // Three v3 groups chained USDC -> WETH -> DAI -> USDC, all custody-coherent, but not encodable.
  const threeGroups: ExecutionPlan = {
    ...plan,
    operations: [
      { ...swap, recipient: 'router' },
      {
        ...swap,
        legs: [{ pool: v3WethDai, currencyIn: WETH, currencyOut: DAI }],
        payer: 'router',
        recipient: 'router',
      },
      {
        ...swap,
        legs: [{ pool: v3DaiUsdc, currencyIn: DAI, currencyOut: USDC }],
        payer: 'router',
        recipient: 'final',
      },
    ],
    deliverOutput: { ...plan.deliverOutput, currency: USDC },
  }
  expect(() => encodeExecutionPlan(threeGroups, deployment, DEADLINE)).toThrow(
    /more than two swap groups are not encodable/,
  )
})

test('a trailing unwrap carries the single slippage floor and pays the recipient', () => {
  const plan = compileExecutionPlan(
    base({
      quoted: quoted([{ pool: v3WethDai, currencyIn: DAI, currencyOut: WETH }]),
      tokenIn: DAI,
      tokenOut: 'native',
    }),
  )
  const tx = encodeExecutionPlan(plan, deployment, DEADLINE)
  // 0x00 = V3_SWAP_EXACT_IN (to the router, no floor), 0x0c = UNWRAP_WETH (to the recipient, with the floor)
  expect(commandsOf(tx.data)).toEqual([0x00, 0x0c])

  const [swapRecipient, , swapMinOut] = decodeAbiParameters(
    parseAbiParameters('address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser'),
    inputsOf(tx.data)[0]!,
  )
  expect(swapRecipient).toBe(UR_ADDRESS_THIS)
  expect(swapMinOut).toBe(0n)

  const [unwrapRecipient, amountMin] = decodeAbiParameters(
    parseAbiParameters('address recipient, uint256 amountMin'),
    inputsOf(tx.data)[1]!,
  )
  expect(unwrapRecipient).toBe(TRADER)
  expect(amountMin).toBe(990n)
})

// ---------------------------------------------------------------------------
// Goldens
//
// `goldens.json` is written by the differential suite from the run that proved
// every shape byte-identical with universal-router-sdk. Replaying it here pins
// plan -> calldata directly: the differential suite can only catch a drift it
// still knows how to build, while a golden catches any change to the encoder at
// all, including one that moves our fixtures and the oracle together.
//
// See differential.test.ts for how to regenerate.
// ---------------------------------------------------------------------------

type Golden = { plan: unknown; calldata: string; value: string }

/** Inverse of the differential suite's bigint tagging. */
function reviveBigints(json: string): Record<string, Golden> {
  return JSON.parse(json, (_key, value) =>
    value !== null && typeof value === 'object' && typeof (value as { $bigint?: string }).$bigint === 'string'
      ? BigInt((value as { $bigint: string }).$bigint)
      : value,
  )
}

const goldens = reviveBigints(readFileSync(fileURLToPath(new URL('./goldens.json', import.meta.url)), 'utf8'))

test('goldens.json is a non-empty set of distinct encodings', () => {
  const entries = Object.entries(goldens)
  expect(entries.length).toBeGreaterThan(50)
  expect(new Set(entries.map(([, golden]) => golden.calldata)).size).toBe(entries.length)
})

for (const [name, golden] of Object.entries(goldens)) {
  test(`golden: ${name}`, () => {
    const tx = encodeExecutionPlan(golden.plan as ExecutionPlan, deployment, DEADLINE)
    expect(tx.data).toBe(golden.calldata as `0x${string}`)
    expect(tx.value).toBe(BigInt(golden.value))
  })
}

test('a v4 group settles and takes around the swap, native currencies as address(0)', () => {
  const plan = compileExecutionPlan(
    base({
      quoted: quoted([{ pool: v4NativeUsdc, currencyIn: USDC, currencyOut: 'native' }]),
      tokenIn: USDC,
      tokenOut: 'native',
    }),
  )
  const tx = encodeExecutionPlan(plan, deployment, DEADLINE)
  expect(commandsOf(tx.data)).toEqual([0x10]) // V4_SWAP only: v4 delivers native directly

  const [actions] = decodeAbiParameters(parseAbiParameters('bytes actions, bytes[] params'), inputsOf(tx.data)[0]!)
  // SWAP_EXACT_IN(0x07), SETTLE(0x0b), TAKE(0x0e) — the whole-route ordering
  expect(actions).toBe('0x070b0e')
})
