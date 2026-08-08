import { expect, test } from 'bun:test'
import type { Address } from 'viem'
import { decodeAbiParameters, decodeFunctionData, parseAbiParameters, zeroAddress } from 'viem'

import { UnsupportedRouteError } from '../errors'
import { UR_ABI } from '../internal/abis'
import { v3Ref, v4Ref } from '../internal/testing'
import type { CompileExecutionPlanArgs } from '../plan/compile'
import { compileExecutionPlan } from '../plan/compile'
import type { ProtocolModule } from '../protocols/types'
import { v2Module } from '../protocols/v2'
import { v3Module } from '../protocols/v3'
import { v4Module } from '../protocols/v4'
import type { PoolKey, PoolRef, Protocol, QuotedRoute, RouteLeg, UniversalRouterDeployment } from '../types'

import { loadGoldenCalldata, loadGoldens } from './testing'
import { encodeExecutionPlan } from './ur20'
import { encodeExecutionPlanUr21 } from './ur21'

// ---------------------------------------------------------------------------
// `ur-2.1` unit tests. The heavy lifting — 73 shapes byte-identical with
// `universal-router-sdk` pinned to `V2_1_1` — lives in `differential.test.ts`;
// what belongs here is what belonged in `ur20.test.ts` for the first set:
// hand-verifiable decodes of the three payloads 2.1 changed, the pin check,
// and the goldens replay for `goldens-ur21.json`.
// ---------------------------------------------------------------------------

const modules: Record<Protocol, ProtocolModule> = { v2: v2Module, v3: v3Module, v4: v4Module }

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address
const TRADER = '0x2222222222222222222222222222222222222222' as Address
const UR = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af' as Address
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address

const deployment: UniversalRouterDeployment = {
  address: UR,
  commandSet: 'ur-2.1',
  permit2: PERMIT2,
  wrappedNative: WETH,
}

const DEADLINE = 1_700_000_000n

const v3UsdcWeth: PoolRef = v3Ref('0x00000000000000000000000000000000000a0001', USDC, WETH, 3000)
const v4NativeUsdcKey: PoolKey = { currency0: zeroAddress, currency1: USDC, fee: 500, tickSpacing: 10, hooks: zeroAddress }
const v4NativeUsdc: PoolRef = v4Ref(v4NativeUsdcKey)

function quoted(legs: RouteLeg[], amountIn = 1000n, amountOut = 1000n): QuotedRoute {
  return { route: { legs }, quote: { amountIn, amountOut, intermediateAmounts: [] } }
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

function inputsOf(data: `0x${string}`): readonly `0x${string}`[] {
  const { args } = decodeFunctionData({ abi: UR_ABI, data })
  return args![1] as readonly `0x${string}`[]
}

// ---------------------------------------------------------------------------
// The pin: each encoder accepts ONLY its own command set. The ur-2.0 pin is
// tested in `ur20.test.ts`; what is new here is the crossing in both
// directions, because "plausible calldata against the wrong router version"
// is exactly the fund-loss shape the pin exists to prevent (the deployed
// 2.1.1 router reverts `SliceOutOfBounds` on a 2.0 payload — see `ur21.ts`).
// ---------------------------------------------------------------------------

test('the ur-2.1 encoder rejects a ur-2.0 deployment, and vice versa', () => {
  const plan = compileExecutionPlan(base())
  expect(() => encodeExecutionPlanUr21(plan, { ...deployment, commandSet: 'ur-2.0' }, DEADLINE)).toThrow(
    UnsupportedRouteError,
  )
  expect(() => encodeExecutionPlan(plan, deployment, DEADLINE)).toThrow(UnsupportedRouteError)
})

// ---------------------------------------------------------------------------
// Hand-verifiable decodes of the three payloads 2.1 changed.
// ---------------------------------------------------------------------------

test('V3_SWAP_EXACT_IN carries a sixth minHopPriceX36 parameter, empty, with everything else as in ur-2.0', () => {
  const plan = compileExecutionPlan(base())
  const tx21 = encodeExecutionPlanUr21(plan, deployment, DEADLINE)
  const tx20 = encodeExecutionPlan(plan, { ...deployment, commandSet: 'ur-2.0' }, DEADLINE)

  const [recipient21, amountIn21, minOut21, path21, payer21, minHop] = decodeAbiParameters(
    parseAbiParameters(
      'address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser, uint256[] minHopPriceX36',
    ),
    inputsOf(tx21.data)[0]!,
  )
  const [recipient20, amountIn20, minOut20, path20, payer20] = decodeAbiParameters(
    parseAbiParameters('address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser'),
    inputsOf(tx20.data)[0]!,
  )

  expect(minHop).toEqual([])
  expect(recipient21).toBe(recipient20)
  expect(amountIn21).toBe(amountIn20)
  expect(minOut21).toBe(minOut20)
  expect(path21).toBe(path20)
  expect(payer21).toBe(payer20)
})

test('the v4 SWAP_EXACT_IN struct carries minHopPriceX36 between path and amountIn, empty', () => {
  const plan = compileExecutionPlan(
    base({
      quoted: quoted([{ pool: v4NativeUsdc, currencyIn: 'native', currencyOut: USDC }]),
      tokenIn: 'native',
      tokenOut: USDC,
    }),
  )
  const tx = encodeExecutionPlanUr21(plan, deployment, DEADLINE)

  const [actions, params] = decodeAbiParameters(
    parseAbiParameters('bytes actions, bytes[] params'),
    inputsOf(tx.data)[0]!,
  )
  // Same action bytes and ordering as ur-2.0: SWAP_EXACT_IN(0x07), SETTLE(0x0b), TAKE(0x0e).
  expect(actions).toBe('0x070b0e')

  const [swap] = decodeAbiParameters(
    parseAbiParameters(
      '(address currencyIn, (address intermediateCurrency, uint256 fee, int24 tickSpacing, address hooks, bytes hookData)[] path, uint256[] minHopPriceX36, uint128 amountIn, uint128 amountOutMinimum) swap',
    ),
    params[0]!,
  )
  expect(swap.currencyIn).toBe(zeroAddress)
  expect(swap.minHopPriceX36).toEqual([])
  expect(swap.amountIn).toBe(1000n)
  expect(swap.amountOutMinimum).toBe(990n)
  expect(swap.path).toHaveLength(1)
  expect(swap.path[0]!.intermediateCurrency).toBe(USDC)
})

test('command bytes are identical to ur-2.0 for every shape the two sets share', () => {
  // 2.1 changed payload ABIs, never the dispatch table — the command byte string of any plan must
  // be byte-identical across the two encoders. (Each set's bytes are asserted against
  // universal-router-sdk's CommandType in ur20.test.ts; this pins the two sets to EACH OTHER.)
  const plans = [
    compileExecutionPlan(base()),
    compileExecutionPlan(
      base({
        quoted: quoted([{ pool: v4NativeUsdc, currencyIn: 'native', currencyOut: USDC }]),
        tokenIn: 'native',
        tokenOut: USDC,
      }),
    ),
  ]
  for (const plan of plans) {
    const commands = (tx: { data: `0x${string}` }) =>
      (decodeFunctionData({ abi: UR_ABI, data: tx.data }).args![0] as string).toLowerCase()
    expect(commands(encodeExecutionPlanUr21(plan, deployment, DEADLINE))).toBe(
      commands(encodeExecutionPlan(plan, { ...deployment, commandSet: 'ur-2.0' }, DEADLINE)),
    )
  }
})

// ---------------------------------------------------------------------------
// Goldens — `goldens-ur21.json` holds ur-2.1's wire bytes per shape, joined
// against the plan corpus it shares with ur-2.0 (`encode/testing.ts` explains
// the split). Written by the differential suite from the run that proved every
// shape byte-identical with universal-router-sdk pinned to V2_1_1; see there
// for how to regenerate, and `ur20.test.ts` for why one replay row rather than
// seventy-three.
// ---------------------------------------------------------------------------

const goldens = loadGoldens('./goldens-ur21.json')

test('goldens-ur21.json is a non-empty set of distinct encodings, shape-for-shape with goldens.json', () => {
  const entries = Object.entries(goldens)
  expect(entries.length).toBeGreaterThan(50)
  expect(new Set(entries.map(([, golden]) => golden.calldata)).size).toBe(entries.length)
  // The two sets cover the SAME closed shape matrix — a shape in one calldata file but not the
  // other means the differential suite's per-set loops drifted apart. (Both now join against ONE
  // plan corpus, and `loadGoldens` throws on a join miss, so this is the remaining axis: two
  // calldata files that agree with the plans but not with each other.)
  expect(Object.keys(goldens).sort()).toEqual(Object.keys(loadGoldenCalldata('./goldens.json')).sort())
})

/** One row, for the same reason and on the same terms as `ur20.test.ts`'s — see its docstring for
 * why the other 72 replays were redundant with the differential suite rather than merely slow. The
 * shape is the same one, so the two smoke tests differ in exactly the axis under test: the encoder. */
const SMOKE_SHAPE = 'v4→v3 erc20-in erc20-out via-native +permit'

test(`golden replay smoke [ur-2.1]: ${SMOKE_SHAPE}`, () => {
  const golden = goldens[SMOKE_SHAPE]
  expect(golden, `${SMOKE_SHAPE} is missing from the golden corpus`).toBeDefined()
  const tx = encodeExecutionPlanUr21(golden!.plan, deployment, DEADLINE)
  expect(tx.data).toBe(golden!.calldata as `0x${string}`)
  expect(tx.value).toBe(BigInt(golden!.value))
  // ...and really is a different encoding of the same plan, which is the whole point of the split
  // corpus: same plan, same value, different bytes.
  expect(tx.data).not.toBe(loadGoldenCalldata('./goldens.json')[SMOKE_SHAPE])
})
