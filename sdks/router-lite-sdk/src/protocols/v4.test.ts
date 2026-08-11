import { expect, test } from 'bun:test'
import type { Hex, Log } from 'viem'
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, pad, zeroAddress } from 'viem'

import { V4_POOL_MANAGER_ABI, V4_QUOTER_ABI } from '../internal/abis'
import { computeV4PoolId } from '../internal/poolId'
import { v4Ref } from '../internal/testing'
import { MAINNET_MANIFEST } from '../manifest'
import type { PoolKey, PoolRef, RouteLeg } from '../types'

import initFixture from './__fixtures__/v4Initialize.mainnet.json'
import quoterFixture from './__fixtures__/v4Quoter.mainnet.json'
import { adjacencyQueries } from './adjacency'
import { STANDARD_V4_CONFIGS, toPathKeys, v4Module } from './v4'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const
const POOL_MANAGER = MAINNET_MANIFEST.v4!.poolManager

const ethUsdcKey: PoolKey = { currency0: zeroAddress, currency1: USDC, fee: 500, tickSpacing: 10, hooks: zeroAddress }

/** unsorted on purpose: currency0 (USDC) > currency1 (address(0)), the reverse of on-chain order. */
const unsortedKey: PoolKey = { currency0: USDC, currency1: zeroAddress, fee: 500, tickSpacing: 10, hooks: zeroAddress }

function nonIndexedData(key: PoolKey): Hex {
  return encodeAbiParameters(
    [{ type: 'uint24' }, { type: 'int24' }, { type: 'address' }, { type: 'uint160' }, { type: 'int24' }],
    [key.fee, key.tickSpacing, key.hooks, 0n, 0],
  )
}

function initializeLog(key: PoolKey): Log {
  const id = computeV4PoolId(key)
  const topics = encodeEventTopics({ abi: V4_POOL_MANAGER_ABI, eventName: 'Initialize', args: { id, currency0: key.currency0, currency1: key.currency1 } })
  return { address: POOL_MANAGER, topics, data: nonIndexedData(key), blockNumber: 12345n } as unknown as Log
}

function initializeLogWithWrongId(key: PoolKey): Log {
  const wrongId = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
  const topics = encodeEventTopics({
    abi: V4_POOL_MANAGER_ABI,
    eventName: 'Initialize',
    args: { id: wrongId, currency0: key.currency0, currency1: key.currency1 },
  })
  return { address: POOL_MANAGER, topics, data: nonIndexedData(key), blockNumber: 12345n } as unknown as Log
}

test('parsePoolLog decodes Initialize and verifies poolId', () => {
  const rec = v4Module.parsePoolLog(initializeLog(ethUsdcKey), MAINNET_MANIFEST)!
  expect((rec.pool as any).poolId).toBe(computeV4PoolId(ethUsdcKey))
  expect(v4Module.parsePoolLog(initializeLogWithWrongId(ethUsdcKey), MAINNET_MANIFEST)).toBeNull()
})

test('validateHint sorts currencies and needs no RPC', async () => {
  const calls: unknown[] = []
  const rec = await v4Module.validateHint(
    { protocol: 'v4', poolKey: unsortedKey },
    async (c) => {
      calls.push(c)
      return '0x'
    },
    MAINNET_MANIFEST,
  )
  expect(calls).toHaveLength(0)
  expect((rec!.pool as any).poolKey.currency0 < (rec!.pool as any).poolKey.currency1).toBe(true)
})

test('speculativeDirect probes standard no-hook configs', () => {
  const probes = v4Module.speculativeDirect('native', USDC, 10n ** 18n, MAINNET_MANIFEST)
  expect(probes).toHaveLength(4)
  for (const p of probes) expect((p.candidate.legs[0]!.pool as any).poolKey.hooks).toBe(zeroAddress)
})

test('hypotheses returns the same standard-config pool ids speculativeDirect probes today', () => {
  const probes = v4Module.speculativeDirect('native', USDC, 10n ** 18n, MAINNET_MANIFEST)
  const hypotheses = v4Module.hypotheses('native', USDC, MAINNET_MANIFEST)
  expect(new Set(hypotheses.map((h) => h.id))).toEqual(new Set(probes.map((p) => p.candidate.legs[0]!.pool.id)))
  expect(hypotheses).toHaveLength(4)
})

test('hypotheses ignores extraFees (v4 carries fee in the PoolKey, not a scan)', () => {
  const withExtra = v4Module.hypotheses('native', USDC, MAINNET_MANIFEST, [123])
  const without = v4Module.hypotheses('native', USDC, MAINNET_MANIFEST)
  expect(withExtra).toEqual(without)
})

const legsWithHookData: RouteLeg[] = [
  {
    pool: v4Ref(ethUsdcKey),
    currencyIn: 'native',
    currencyOut: USDC,
    hookData: '0xbeef',
  },
]

test('encodeQuote builds PathKey[] with hookData', () => {
  const qc = v4Module.encodeQuote(legsWithHookData, 1n, MAINNET_MANIFEST)
  const decoded = decodeFunctionData({ abi: V4_QUOTER_ABI, data: qc.call.data })
  expect((decoded.args[0] as any).path[0].hookData).toBe('0xbeef')
})

test('STANDARD_V4_CONFIGS matches the four genesis fee tiers and their canonical tick spacings', () => {
  expect(STANDARD_V4_CONFIGS).toEqual([
    { fee: 100, tickSpacing: 1 },
    { fee: 500, tickSpacing: 10 },
    { fee: 3000, tickSpacing: 60 },
    { fee: 10000, tickSpacing: 200 },
  ])
})

test('speculativeDirect sorts native (address(0)) before the counter-token', () => {
  // address(0) sorts first lexicographically, so 'native' as `a` should still land in currency0
  // regardless of argument order.
  const [probe] = v4Module.speculativeDirect('native', USDC, 10n ** 18n, MAINNET_MANIFEST)
  const poolKey = (probe!.candidate.legs[0]!.pool as any).poolKey
  expect(poolKey.currency0).toBe(zeroAddress)
  expect(poolKey.currency1.toLowerCase()).toBe(USDC.toLowerCase())

  const [probeReversed] = v4Module.speculativeDirect(USDC, 'native', 10n ** 18n, MAINNET_MANIFEST)
  const reversedKey = (probeReversed!.candidate.legs[0]!.pool as any).poolKey
  expect(reversedKey.currency0).toBe(zeroAddress)
  expect(reversedKey.currency1.toLowerCase()).toBe(USDC.toLowerCase())
})

test('toPathKeys maps each leg to its output currency, resolving native to address(0)', () => {
  const legs: RouteLeg[] = [
    { pool: v4Ref(ethUsdcKey), currencyIn: 'native', currencyOut: USDC },
  ]
  const pathKeys = toPathKeys(legs)
  expect(pathKeys).toEqual([{ intermediateCurrency: USDC, fee: 500, tickSpacing: 10, hooks: zeroAddress, hookData: '0x' }])
})

test('the adjacency shape maps the wrapped-native endpoint back to address(0) for v4 topics', () => {
  const shape = v4Module.adjacencyShape(MAINNET_MANIFEST)!
  expect(shape.topicAddress(MAINNET_MANIFEST.wrappedNative)).toBe(zeroAddress)
  expect(shape.topicAddress(zeroAddress)).toBe(zeroAddress)
  // Everything else passes straight through — only the native family is folded.
  expect(shape.topicAddress(USDC)).toBe(USDC)
})

test('adjacency shifts one slot right of v2/v3 for the poolId topic', () => {
  // Initialize indexes (id, currency0, currency1) — the pool id occupies topic1, so the token
  // pair sits one slot further right (topic2) than v2's PairCreated/v3's PoolCreated (topic1).
  // The shape says so via `slot`, which is also what keeps v4 out of the v2+v3 merge.
  const shape = v4Module.adjacencyShape(MAINNET_MANIFEST)!
  expect(shape.slot).toBe(2)
  const [asCurrency0] = adjacencyQueries([shape], [USDC])
  expect(asCurrency0!.topics[1]).toBeNull() // id
  expect(asCurrency0!.topics[2]).toEqual([pad(USDC).toLowerCase() as Hex])
})

test('exactPair builds a sorted v4 Initialize query', () => {
  const query = v4Module.exactPair!('native', USDC, MAINNET_MANIFEST)
  expect(query.address.toLowerCase()).toBe(POOL_MANAGER.toLowerCase())
})

test('the adjacency shape pins the Initialize selector and the PoolManager emitter (drift guard)', () => {
  const shape = v4Module.adjacencyShape(MAINNET_MANIFEST)!
  expect(shape.topic0).toBe('0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438')
  expect(shape.emitter.toLowerCase()).toBe(POOL_MANAGER.toLowerCase())
})

test('parsePoolLog returns null when log address does not match the configured PoolManager', () => {
  const log = initializeLog(ethUsdcKey)
  const badLog = { ...log, address: '0x0000000000000000000000000000000000000bad' as const }
  expect(v4Module.parsePoolLog(badLog as any, MAINNET_MANIFEST)).toBeNull()
})

test('compileOperation maps custody to settleFrom/takeTo', () => {
  const legs: RouteLeg[] = [
    { pool: v4Ref(ethUsdcKey), currencyIn: 'native', currencyOut: USDC },
  ]
  const op = v4Module.compileOperation(legs, { payer: 'trader-via-permit2', recipient: 'final' })
  expect(op).toMatchObject({ kind: 'v4-swap', settleFrom: 'trader-via-permit2', takeTo: 'final' })
})

test('decode matches a recorded mainnet V4Quoter returndata fixture', () => {
  const key: PoolKey = {
    currency0: zeroAddress,
    currency1: quoterFixture.path[0]!.intermediateCurrency as `0x${string}`,
    fee: quoterFixture.path[0]!.fee,
    tickSpacing: quoterFixture.path[0]!.tickSpacing,
    hooks: zeroAddress,
  }
  const legs: RouteLeg[] = [{ pool: v4Ref(key), currencyIn: 'native', currencyOut: key.currency1 }]
  const decoded = v4Module
    .encodeQuote(legs, BigInt(quoterFixture.amountIn), MAINNET_MANIFEST)
    .decode(quoterFixture.returnData as `0x${string}`)
  expect(decoded.amountOut).toBe(BigInt(quoterFixture.amountOut))
  // V4Quoter's second return word, from the same recorded bytes (see the v3 twin of this test).
  expect(decoded.gasEstimate).toBe(64_798n)
})

test('parsePoolLog reconstructs a recorded mainnet Initialize log with a matching recomputed poolId', () => {
  // JSON has no bigint literal, so `blockNumber` is re-hydrated from the fixture's decimal string.
  const log = { ...initFixture.log, blockNumber: BigInt(initFixture.log.blockNumber) } as unknown as Log
  const rec = v4Module.parsePoolLog(log, MAINNET_MANIFEST)!
  expect(rec).not.toBeNull()
  const pool = rec.pool as Extract<PoolRef, { protocol: 'v4' }>
  expect(pool.poolId).toBe(initFixture.expected.poolId as `0x${string}`)
  expect(pool.poolKey.currency0.toLowerCase()).toBe(initFixture.expected.poolKey.currency0.toLowerCase())
  expect(pool.poolKey.currency1.toLowerCase()).toBe(initFixture.expected.poolKey.currency1.toLowerCase())
  expect(pool.poolKey.fee).toBe(initFixture.expected.poolKey.fee)
  expect(pool.poolKey.tickSpacing).toBe(initFixture.expected.poolKey.tickSpacing)
  expect(rec.createdAtBlock).toBe(BigInt(initFixture.blockNumber))
})
