import { Token } from '@uniswap/sdk-core'
import { computePoolAddress, encodeRouteToPath, FeeAmount, Pool, Route as V3Route } from '@uniswap/v3-sdk'
import { expect, test } from 'bun:test'
import { encodeAbiParameters, encodeEventTopics, pad } from 'viem'

import { V3_FACTORY_ABI } from '../internal/abis'
import { v3Ref } from '../internal/testing'
import { MAINNET_MANIFEST } from '../manifest'
import type { PoolRef, RouteLeg } from '../types'

import quoterFixture from './__fixtures__/quoterV2.mainnet.json'
import { adjacencyQueries } from './adjacency'
import { computeV3PoolAddress, encodeV3Path, mergeEnabledFees, V3_POOL_INIT_CODE_HASH, v3Module } from './v3'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F' as const
const V3_FACTORY = MAINNET_MANIFEST.v3!.factory

const usdcToken = new Token(1, USDC, 6)
const wethToken = new Token(1, WETH, 18)

// Dummy slot0 for the differential test: tick 0's exact sqrtRatioX96, so the
// v3-sdk Pool constructor's PRICE_BOUNDS invariant (sqrtRatioX96 within
// [tickCurrent, tickCurrent+1]) is satisfied without needing real pool state —
// path encoding doesn't depend on price/liquidity at all.
// v3-sdk's `Pool` constructor consumes `BigintIsh` (string | number | JSBI), not a native
// bigint, so this is passed through as a string.
const DUMMY_SQRT_RATIO_X96 = '79228162514264337593543950336' // TickMath.getSqrtRatioAtTick(0)

function toLegs(route: V3Route<Token, Token>): RouteLeg[] {
  const legs: RouteLeg[] = []
  for (let i = 0; i < route.pools.length; i++) {
    const pool = route.pools[i]!
    const inputToken = route.tokenPath[i]!
    const outputToken = route.tokenPath[i + 1]!
    const poolRef: PoolRef = v3Ref(
      Pool.getAddress(pool.token0, pool.token1, pool.fee) as `0x${string}`,
      pool.token0.address as `0x${string}`,
      pool.token1.address as `0x${string}`,
      pool.fee,
    )
    legs.push({ pool: poolRef, currencyIn: inputToken.address as `0x${string}`, currencyOut: outputToken.address as `0x${string}` })
  }
  return legs
}

test('path encoding matches v3-sdk (differential)', () => {
  const usdcWethPool500 = new Pool(usdcToken, wethToken, FeeAmount.LOW, DUMMY_SQRT_RATIO_X96, 0, 0)
  const route = new V3Route([usdcWethPool500], usdcToken, wethToken)
  expect(encodeV3Path(toLegs(route), WETH).toLowerCase()).toBe(encodeRouteToPath(route, false).toLowerCase())
})

test('computeV3PoolAddress matches the real mainnet USDC/WETH 500bps pool', () => {
  // Ground truth: the deployed USDC/WETH 0.05% pool on mainnet.
  expect(computeV3PoolAddress(V3_FACTORY, USDC, WETH, 500)).toBe('0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640')
})

test('computeV3PoolAddress matches v3-sdk (differential)', () => {
  const sdkAddress = computePoolAddress({ factoryAddress: V3_FACTORY, tokenA: usdcToken, tokenB: wethToken, fee: FeeAmount.LOW })
  expect(computeV3PoolAddress(V3_FACTORY, USDC, WETH, 500).toLowerCase()).toBe(sdkAddress.toLowerCase())
})

// ---------------------------------------------------------------------------
// C4-P1: the pool init code hash is a chain FACT, defaulted rather than hardcoded.
// ---------------------------------------------------------------------------

/** A stand-in for a zkSync-class chain whose pool bytecode (and CREATE2 preimage) is its own. */
const FOREIGN_POOL_INIT_CODE_HASH = `0x${'cd'.repeat(32)}` as const

test('the canonical default is what the mainnet vectors above pin — an override is opt-in only', () => {
  expect(computeV3PoolAddress(V3_FACTORY, USDC, WETH, 500, V3_POOL_INIT_CODE_HASH)).toBe(
    '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640',
  )
  expect(MAINNET_MANIFEST.v3!.poolInitCodeHash).toBeUndefined() // mainnet IS the default; it states nothing
})

test('a manifest poolInitCodeHash override changes the computed pool address', () => {
  expect(computeV3PoolAddress(V3_FACTORY, USDC, WETH, 500, FOREIGN_POOL_INIT_CODE_HASH)).not.toBe(
    computeV3PoolAddress(V3_FACTORY, USDC, WETH, 500),
  )
})

test('speculativeDirect derives every fee tier probe from the manifest, not the module constant', () => {
  const foreign = { ...MAINNET_MANIFEST, v3: { ...MAINNET_MANIFEST.v3!, poolInitCodeHash: FOREIGN_POOL_INIT_CODE_HASH } }
  const probes = v3Module.speculativeDirect(USDC, WETH, 10n ** 6n, foreign)
  const canonical = v3Module.speculativeDirect(USDC, WETH, 10n ** 6n, MAINNET_MANIFEST)

  expect(probes).toHaveLength(canonical.length)
  for (let i = 0; i < probes.length; i++) {
    const pool = probes[i]!.candidate.legs[0]!.pool
    expect(pool.protocol === 'v3' && pool.address).toBe(
      computeV3PoolAddress(V3_FACTORY, USDC, WETH, pool.protocol === 'v3' ? pool.fee : 0, FOREIGN_POOL_INIT_CODE_HASH),
    )
    expect(pool.id).not.toBe(canonical[i]!.candidate.legs[0]!.pool.id)
  }
})

test('feeDiscovery probes honor the override too — a governance tier is not a second code path', () => {
  const foreign = { ...MAINNET_MANIFEST, v3: { ...MAINNET_MANIFEST.v3!, poolInitCodeHash: FOREIGN_POOL_INIT_CODE_HASH } }
  const [probe] = v3Module.feeDiscovery.probes(USDC, WETH, 10n ** 6n, [250], foreign)
  const pool = probe!.candidate.legs[0]!.pool
  expect(pool.protocol === 'v3' && pool.address).toBe(
    computeV3PoolAddress(V3_FACTORY, USDC, WETH, 250, FOREIGN_POOL_INIT_CODE_HASH),
  )
})

test('encodeV3Path resolves a native leg to wrappedNative even when wrappedNative sorts as token1', () => {
  // DAI < WETH lexicographically, so token0 = DAI, token1 = WETH — the wrapped-native address
  // sits on the *second* slot, the case the earlier (broken) implementation got backwards by
  // always assuming a native leg's input token was pool.token0.
  const daiWethPool3000: PoolRef = v3Ref(computeV3PoolAddress(V3_FACTORY, DAI, WETH, 3000), DAI, WETH, 3000)
  const leg: RouteLeg = { pool: daiWethPool3000, currencyIn: 'native', currencyOut: DAI }
  const path = encodeV3Path([leg], WETH)
  expect(path.toLowerCase().startsWith(WETH.toLowerCase())).toBe(true)
  expect(path.toLowerCase().endsWith(DAI.slice(2).toLowerCase())).toBe(true)
})

test('speculativeDirect emits one probe per standard fee', () => {
  const probes = v3Module.speculativeDirect(USDC, WETH, 10n ** 6n, MAINNET_MANIFEST)
  expect(probes.map((p) => (p.candidate.legs[0]!.pool as Extract<PoolRef, { protocol: 'v3' }>).fee)).toEqual([100, 500, 3000, 10000])
})

test('decode extracts amountOut from QuoterV2 return', () => {
  const legs: RouteLeg[] = [
    {
      pool: v3Ref(computeV3PoolAddress(V3_FACTORY, USDC, WETH, 500), USDC, WETH, 500),
      currencyIn: USDC,
      currencyOut: WETH,
    },
  ]
  const quoterV2Returns = [
    { type: 'uint256' },
    { type: 'uint160[]' },
    { type: 'uint32[]' },
    { type: 'uint256' },
  ] as const
  const ret = encodeAbiParameters(quoterV2Returns, [123n, [], [], 45_678n])
  // The fourth return word is QuoterV2's own `gasEstimate`; it rides along on the decode and is
  // reported, never ranked on (`RouteQuote.gasEstimate`).
  expect(v3Module.encodeQuote(legs, 1n, MAINNET_MANIFEST).decode(ret)).toEqual({ amountOut: 123n, gasEstimate: 45_678n })
})

test('mergeEnabledFees adds nonstandard fees once', () => {
  const feeEnabledLog = (fee: number) => ({
    address: V3_FACTORY,
    topics: encodeEventTopics({ abi: V3_FACTORY_ABI, eventName: 'FeeAmountEnabled', args: { fee, tickSpacing: 10 } }),
    data: '0x' as const,
  })
  expect(mergeEnabledFees([feeEnabledLog(250) as any, feeEnabledLog(100) as any, feeEnabledLog(250) as any])).toEqual([100, 250])
})

test('feeDiscovery scans the factory, ignores foreign logs, and probes the discovered tier', () => {
  const discovery = v3Module.feeDiscovery!
  const query = discovery.query(MAINNET_MANIFEST)
  expect(query.address).toBe(V3_FACTORY)
  expect(query.topics[0]).toBe(encodeEventTopics({ abi: V3_FACTORY_ABI, eventName: 'FeeAmountEnabled' })[0])

  const feeLog = (address: string, fee: number) => ({
    address,
    topics: encodeEventTopics({ abi: V3_FACTORY_ABI, eventName: 'FeeAmountEnabled', args: { fee, tickSpacing: 10 } }),
    data: '0x' as const,
  })
  // A log from some other contract that happens to share the topic shape is not this factory's.
  const impostor = '0x00000000000000000000000000000000000000ff'
  expect(discovery.feesFromLogs([feeLog(V3_FACTORY, 250) as any, feeLog(impostor, 999) as any], MAINNET_MANIFEST)).toEqual([250])

  const probes = discovery.probes(USDC, WETH, 1n, [250], MAINNET_MANIFEST)
  expect(probes).toHaveLength(1)
  expect(probes[0]!.candidate.legs[0]!.pool).toMatchObject({
    protocol: 'v3',
    fee: 250,
    address: computeV3PoolAddress(V3_FACTORY, USDC, WETH, 250),
  })
})

test('adjacency: token lands in topic1 for one query and topic2 for the other', () => {
  const [asToken0, asToken1] = adjacencyQueries([v3Module.adjacencyShape(MAINNET_MANIFEST)!], [USDC])
  const padded = pad(USDC).toLowerCase()
  expect(asToken0!.topics[1]).toEqual([padded])
  expect(asToken0!.topics[2]).toBeUndefined()
  expect(asToken1!.topics[1]).toBeNull()
  expect(asToken1!.topics[2]).toEqual([padded])
})

test('the adjacency shape pins the PoolCreated selector and the pair’s topic slot (drift guard)', () => {
  const shape = v3Module.adjacencyShape(MAINNET_MANIFEST)!
  expect(shape.topic0).toBe('0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118')
  expect(shape.emitter.toLowerCase()).toBe(V3_FACTORY.toLowerCase())
  expect(shape.slot).toBe(1)
})

test('validateHint returns null when the factory disagrees with the asserted pool', async () => {
  const realPool = computeV3PoolAddress(V3_FACTORY, USDC, WETH, 500)
  const wrongPool = '0x0000000000000000000000000000000000000001' as const
  const call = async () => encodeAbiParameters([{ type: 'address' }], [realPool])
  const result = await v3Module.validateHint({ protocol: 'v3', token0: USDC, token1: WETH, fee: 500, pool: wrongPool }, call, MAINNET_MANIFEST)
  expect(result).toBeNull()
})

test('validateHint returns null when the factory has no pool for that fee (zero address)', async () => {
  const call = async () => encodeAbiParameters([{ type: 'address' }], ['0x0000000000000000000000000000000000000000'])
  const result = await v3Module.validateHint({ protocol: 'v3', token0: USDC, token1: WETH, fee: 500 }, call, MAINNET_MANIFEST)
  expect(result).toBeNull()
})

test('validateHint returns a hint-sourced PoolRecord when the factory confirms the pool', async () => {
  const realPool = computeV3PoolAddress(V3_FACTORY, USDC, WETH, 500)
  const call = async () => encodeAbiParameters([{ type: 'address' }], [realPool])
  const result = await v3Module.validateHint({ protocol: 'v3', token0: USDC, token1: WETH, fee: 500 }, call, MAINNET_MANIFEST)
  expect(result?.source).toBe('hint')
  expect(result?.pool.protocol === 'v3' && result.pool.address.toLowerCase()).toBe(realPool.toLowerCase())
  expect(result?.pool.protocol === 'v3' && result.pool.fee).toBe(500)
})

test('decode matches a recorded mainnet QuoterV2 returndata fixture', () => {
  const legs: RouteLeg[] = [
    {
      pool: v3Ref(computeV3PoolAddress(V3_FACTORY, USDC, WETH, quoterFixture.fee), USDC, WETH, quoterFixture.fee),
      currencyIn: USDC,
      currencyOut: WETH,
    },
  ]
  const decoded = v3Module.encodeQuote(legs, BigInt(quoterFixture.amountIn), MAINNET_MANIFEST).decode(quoterFixture.returnData as `0x${string}`)
  expect(decoded.amountOut).toBe(BigInt(quoterFixture.amountOut))
  // The real quoter's own gas word, out of the same recorded bytes — a live-plausible figure for a
  // single-hop v3 swap, pinned here so a decode that read the wrong return slot cannot pass.
  expect(decoded.gasEstimate).toBe(86_439n)
})
