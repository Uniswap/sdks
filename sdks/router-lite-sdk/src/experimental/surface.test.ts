import { expect, test } from 'bun:test'
import type { Address, Hex } from 'viem'
import { encodeEventTopics, encodeFunctionResult, pad } from 'viem'

import { MAINNET_MANIFEST } from '../index'
import type { BlockRange, PoolRecord, PoolRef, QuotedRoute, QuoteResult, RouteLeg, UniversalRouterDeployment } from '../index'

import type {
  AdjacencyShape,
  Custody,
  FeeDiscovery,
  MergedLogQuery,
  PoolIndexOptions,
  PoolIndexSnapshot,
  ProtocolModule,
  QuoteProbe,
  RpcFailureKind,
} from './index'
import * as experimentalModule from './index'
import {
  DEFAULT_SLIPPAGE_BPS,
  MULTICALL3_ABI,
  MULTICALL3_ADDRESS,
  PROTOCOL_MODULES,
  PoolIndex,
  V4_POOL_MANAGER_ABI,
  adjacencyQueries,
  aggregateCalls,
  assertResultCoherent,
  blockTimeSecondsOf,
  buildHookData,
  classifyRpcError,
  compileExecutionPlan,
  emptyReport,
  encoderFor,
  ethCall,
  generateRoutes,
  intersectRanges,
  isDiscredited,
  isHooked,
  mapConcurrent,
  parseSnapshot,
  sameFamily,
  scanLogs,
  serializeSnapshot,
  sortAddresses,
  toGraphNode,
  v2PoolRef,
  v4PoolRef,
} from './index'

// ---------------------------------------------------------------------------
// Compile-time + minimal-execution guard that `@uniswap/router-lite-sdk/experimental`
// stays externally callable.
//
// Every value and type below is built ONLY from this subpath's own exports
// (`./index`, i.e. what a real consumer imports as `.../experimental`) plus
// the public types re-exported from the package root (`../index`) — never
// from an internal path like `../search/candidates` or `../protocols/types`.
// If a future edit to `experimental/index.ts` drops an export, or adds a
// required argument type that isn't reachable from here, this file stops
// compiling — that's the point: it is the regression test for the shipped
// defect this file fixes (generateRoutes/compileExecutionPlan's argument
// types were unconstructible from outside the package).
//
// WHAT THE CASES BELOW CANNOT DO IS NOTICE AN ARRIVAL. Each one names what it
// uses, so it fails when an export goes missing and stays perfectly green when
// one appears — which is how the root subpath shipped an undocumented value
// export. The exhaustive pin directly below is the other direction: adding an
// export to `experimental/index.ts` fails here until someone updates the pin
// and the README table it mirrors. Deliberate, not automatic — "no stability
// guarantee" is about the SEMANTICS of these primitives, not a license for the
// name list to drift unread.
// ---------------------------------------------------------------------------

/** Every VALUE export of the `/experimental` subpath, sorted. */
const EXPERIMENTAL_VALUE_EXPORTS = [
  'DEFAULT_SLIPPAGE_BPS',
  'MULTICALL3_ABI',
  'MULTICALL3_ADDRESS',
  'POOL_INDEX_SCHEMA_VERSION',
  'PROTOCOL_MODULES',
  'PoolIndex',
  'V4_POOL_MANAGER_ABI',
  'adjacencyQueries',
  'aggregateCalls',
  'assertResultCoherent',
  'blockTimeSecondsOf',
  'buildHookData',
  'classifyRpcError',
  'compileExecutionPlan',
  'emptyReport',
  'encoderFor',
  'ethCall',
  'generateRoutes',
  'intersectRanges',
  'isDiscredited',
  'isHooked',
  'mapConcurrent',
  'parseSnapshot',
  'sameFamily',
  'scanLogs',
  'serializeSnapshot',
  'sortAddresses',
  'toGraphNode',
  'v2Module',
  'v2PoolRef',
  'v3Module',
  'v3PoolRef',
  'v4Module',
  'v4PoolRef',
] as const

test('/experimental exports EXACTLY these values — an addition fails here, not silently in a release', () => {
  expect(Object.keys(experimentalModule).sort()).toEqual([...EXPERIMENTAL_VALUE_EXPORTS])
})

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address
const TRADER = '0x2222222222222222222222222222222222222222' as Address
const V2_POOL = '0x00000000000000000000000000000000000b0001' as Address
const HOOK = '0x0000000000000000000000000000000000000088' as Address
/** v4 spells native as address(0) on-chain; `zeroAddress` lives in viem, not in this package's surface. */
const NATIVE_ONCHAIN = '0x0000000000000000000000000000000000000000' as Address

// A `PoolRef` carries derived fields no caller can be expected to fill in by hand, so the
// constructors have to be reachable from here too — an external caller with `PoolIndex.upsert` and
// no way to build its argument would have the same defect this file was written to catch.
const v2WethUsdc: PoolRef = v2PoolRef(V2_POOL, USDC, WETH)

test('PoolIndex is constructible and upsert-able from only public/`.../experimental` types', () => {
  const index = new PoolIndex(WETH)
  const record: PoolRecord = { pool: v2WethUsdc, source: 'hint' }
  index.upsert(record)
  expect(index.pair(USDC, WETH)).toHaveLength(1)
})

// `PoolIndexOptions` is `PoolIndex`'s own constructor's second-argument type — a caller building
// that argument up separately (rather than as an inline literal) needs to name it from this same
// subpath, exactly like `PoolRecord`/`PoolRef` above for `upsert`'s argument.
test('PoolIndexOptions is nameable from `.../experimental` for PoolIndex\'s constructor', () => {
  const options: PoolIndexOptions = { maxPools: 10 }
  const index = new PoolIndex(WETH, options)
  expect(index.stats().pools).toBe(0)
})

test('generateRoutes is callable without hookData — it defaults to an empty map', () => {
  const index = new PoolIndex(WETH)
  index.upsert({ pool: v2WethUsdc, source: 'hint' })
  const { candidates } = generateRoutes({ tokenIn: USDC, tokenOut: WETH, index, wrappedNative: WETH })
  expect(candidates).toHaveLength(1)
  expect(candidates[0]!.legs[0]!.pool).toEqual(v2WethUsdc)
})

test('the PoolRef constructors are reachable, and derive the ref\'s id/currencies', () => {
  expect(v2WethUsdc.id).toBe(`v2:${V2_POOL.toLowerCase()}`)
  expect(v2WethUsdc.currencies).toEqual([USDC, WETH])

  const hooked = v4PoolRef({ currency0: NATIVE_ONCHAIN, currency1: USDC, fee: 3000, tickSpacing: 60, hooks: HOOK })
  // v4's on-chain address(0) surfaces as the domain's 'native', and hooks are readable protocol-agnostically.
  expect(hooked.currencies).toEqual(['native', USDC])
  expect(isHooked(hooked)).toBe(true)
  expect(isHooked(v2WethUsdc)).toBe(false)
})

test('buildHookData is directly callable and usable to build a v4 hookData map', () => {
  expect(buildHookData([]).size).toBe(0)
  expect(buildHookData(undefined).size).toBe(0)
})

test('PROTOCOL_MODULES and the individual protocol modules satisfy ProtocolModule', () => {
  const modules: Record<string, ProtocolModule> = PROTOCOL_MODULES
  expect(modules.v2!.id).toBe('v2')
  expect(modules.v3!.id).toBe('v3')
  expect(modules.v4!.id).toBe('v4')
})

test('AdjacencyShape is nameable, and adjacencyQueries builds a merged filter from shapes alone', () => {
  // The constructibility rule this file exists for: a caller writing its own `ProtocolModule` must
  // be able to spell `adjacencyShape`'s return type, and to turn shapes into the filters the engine
  // issues, using nothing but this subpath.
  const shape: AdjacencyShape | undefined = PROTOCOL_MODULES.v3.adjacencyShape(MAINNET_MANIFEST)
  expect(shape).toBeDefined()
  const v2Shape = PROTOCOL_MODULES.v2.adjacencyShape(MAINNET_MANIFEST)!

  // Both factories in one address array, both selectors OR-ed in topic0 — the merge, from the
  // public surface.
  const [first] = adjacencyQueries([v2Shape, shape!], [USDC])
  expect(first!.address).toHaveLength(2)
  expect(first!.topics[0]).toHaveLength(2)
  expect(first!.topics[1]).toEqual([pad(USDC.toLowerCase() as Hex, { size: 32 })])
})

test('FeeDiscovery and QuoteProbe are reachable, importable types', () => {
  const feeDiscovery: FeeDiscovery | undefined = PROTOCOL_MODULES.v3.feeDiscovery
  expect(feeDiscovery === undefined || typeof feeDiscovery.query === 'function').toBe(true)
  const probes: QuoteProbe[] = []
  expect(probes).toHaveLength(0)
})

test('Custody is constructible and usable directly against ProtocolModule.compileOperation', () => {
  const custody: Custody = { payer: 'trader-via-permit2', recipient: 'final' }
  const leg: RouteLeg = { pool: v2WethUsdc, currencyIn: USDC, currencyOut: WETH }
  const op = PROTOCOL_MODULES.v2.compileOperation([leg], custody)
  expect(op.kind).toBe('v2-swap')
})

test('compileExecutionPlan is callable without modules — it defaults to PROTOCOL_MODULES — and its plan encodes', () => {
  const leg: RouteLeg = { pool: v2WethUsdc, currencyIn: USDC, currencyOut: WETH }
  const quotedRoute: QuotedRoute = { route: { legs: [leg] }, quote: { amountIn: 1000n, amountOut: 900n, intermediateAmounts: [] } }

  const plan = compileExecutionPlan({
    quoted: quotedRoute,
    tokenIn: USDC,
    tokenOut: WETH,
    trader: TRADER,
    recipient: TRADER,
    slippageBps: 100,
    wrappedNative: WETH,
  })
  expect(plan.operations).toHaveLength(1)
  expect(plan.deliverOutput.minAmountOut).toBe(891n) // 900 at 100bps slippage

  const deployment: UniversalRouterDeployment = {
    address: '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af' as Address,
    commandSet: 'ur-2.0',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
    wrappedNative: WETH,
  }
  const tx = encoderFor(deployment.commandSet)(plan, deployment, 9_999_999_999n)
  expect(tx.to).toBe(deployment.address)
})

test('a PoolIndex snapshot round-trips using only `.../experimental` exports (P2)', () => {
  // The whole point of shipping `serializeSnapshot`/`parseSnapshot` alongside the type: a caller who
  // has `toSnapshot()` and reaches for `JSON.stringify` gets a `TypeError` on the first bigint, and
  // the obvious workaround silently turns block numbers into strings. An external consumer must be
  // able to do the round trip with nothing but this subpath.
  const index = new PoolIndex(WETH)
  index.upsert({ pool: v2WethUsdc, source: 'event', createdAtBlock: 21_000_000n })
  index.addCoverage('v2', WETH, { fromBlock: 0n, toBlock: 21_000_000n })

  const snapshot: PoolIndexSnapshot = index.toSnapshot()
  const restored = PoolIndex.fromSnapshot(parseSnapshot(serializeSnapshot(snapshot)))

  expect(restored.pair(USDC, WETH)).toHaveLength(1)
  expect(restored.pair(USDC, WETH)[0]!.createdAtBlock).toBe(21_000_000n)
  expect(restored.uncovered('v2', WETH, 0n, 21_000_000n)).toEqual([
    { fromBlock: 20_999_969n, toBlock: 21_000_000n }, // only the standing reorg overlap
  ])
})

// ---------------------------------------------------------------------------
// BLESSED FOR canary/ AND cli/ — reachability/callability checks for the second export block in
// `experimental/index.ts`, the same minimal-execution guard as above but for internal helpers those
// two tools used to reach only via a relative `../src/internal/*` import.
// ---------------------------------------------------------------------------

test('emptyReport builds a coherent all-zero SearchReport, and assertResultCoherent accepts a minimal result built from it', () => {
  const result: QuoteResult = {
    status: 'no-route',
    reason: { code: 'no-viable-route', detail: 'no test route' },
    alternatives: [],
    search: emptyReport(),
  }
  expect(() => assertResultCoherent(result)).not.toThrow()
})

test('DEFAULT_SLIPPAGE_BPS names the default slippage a SwapRequest uses when unset', () => {
  expect(DEFAULT_SLIPPAGE_BPS).toBe(100)
})

test('scanLogs is callable against a minimal client using a MergedLogQuery, and V4_POOL_MANAGER_ABI names v4 PoolManager events', async () => {
  const topic0 = encodeEventTopics({ abi: V4_POOL_MANAGER_ABI, eventName: 'Initialize' })[0]!
  const query: MergedLogQuery = { address: [MAINNET_MANIFEST.v4!.poolManager], topics: [topic0] }
  const client: any = { request: async () => [] }
  const result = await scanLogs(client, query, { fromBlock: 0n, toBlock: 10n }, {})
  expect(result.complete).toBe(true)
  expect(result.logs).toEqual([])
})

test('MULTICALL3_ADDRESS and MULTICALL3_ABI name the canonical Multicall3 deployment', () => {
  expect(MULTICALL3_ADDRESS).toBe('0xcA11bde05977b3631167028862bE2a173976CA11')
  expect(MULTICALL3_ABI.some((f) => f.type === 'function' && f.name === 'aggregate3')).toBe(true)
})

test('aggregateCalls, ethCall, and mapConcurrent are callable against a minimal client — the RPC-dispatch stage primitives', async () => {
  const aggregate3Result = encodeFunctionResult({
    abi: MULTICALL3_ABI,
    functionName: 'aggregate3',
    result: [{ success: true, returnData: '0x' as Hex }],
  })
  const client: any = { request: async () => aggregate3Result }
  const calls = [{ to: MULTICALL3_ADDRESS, data: '0x1234' as Hex }]

  const [viaMulticall] = await aggregateCalls({ client, multicall3: MULTICALL3_ADDRESS, calls, blockNumber: 1n })
  expect(viaMulticall).toBe('0x')

  const viaDirectCall = await ethCall(client, calls[0]!, 1n)
  expect(typeof viaDirectCall).toBe('string')

  expect(await mapConcurrent([1, 2, 3], 2, async (n) => n * 2)).toEqual([2, 4, 6])
})

test('classifyRpcError classifies a failed call into a channel, and RpcFailureKind names the result', () => {
  const kind: RpcFailureKind = classifyRpcError(new Error('execution reverted'))
  expect(kind).toBe('execution')
})

test('toGraphNode, sameFamily, and sortAddresses normalize currencies the way PoolIndex itself does', () => {
  expect(toGraphNode('native', WETH)).toBe(WETH.toLowerCase())
  expect(sameFamily('native', WETH, WETH)).toBe(true)
  expect(sameFamily(USDC, WETH, WETH)).toBe(false)
  expect(sortAddresses(WETH, USDC)).toEqual(sortAddresses(USDC, WETH))
})

test("isDiscredited reads a PoolRecord's own ranking judgment", () => {
  const record: PoolRecord = { pool: v2WethUsdc, source: 'hint' }
  expect(isDiscredited(record)).toBe(false)
})

test("intersectRanges intersects two block-range sets — the range algebra behind PoolIndex's coverage cache", () => {
  const a: BlockRange[] = [{ fromBlock: 0n, toBlock: 100n }]
  const b: BlockRange[] = [{ fromBlock: 50n, toBlock: 150n }]
  expect(intersectRanges(a, b)).toEqual([{ fromBlock: 50n, toBlock: 100n }])
})

test("blockTimeSecondsOf reads a manifest's own chain-physics number", () => {
  expect(blockTimeSecondsOf(MAINNET_MANIFEST)).toBe(12)
})
