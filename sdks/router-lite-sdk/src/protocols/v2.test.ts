import { Token } from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { expect, test } from 'bun:test'
import { encodeAbiParameters } from 'viem'

import { UnsupportedRouteError } from '../errors'
import { v2Ref } from '../internal/testing'
import { MAINNET_MANIFEST } from '../manifest'
import type { RouteLeg } from '../types'

import { computeV2PairAddress, getAmountOut, V2_INIT_CODE_HASH, v2Module } from './v2'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const
const V2_FACTORY = MAINNET_MANIFEST.v2!.factory

test('pair address matches v2-sdk (differential)', () => {
  const sdk = Pair.getAddress(new Token(1, USDC, 6), new Token(1, WETH, 18))
  expect(computeV2PairAddress(V2_FACTORY, USDC, WETH).toLowerCase()).toBe(sdk.toLowerCase())
})

// ---------------------------------------------------------------------------
// C4-P1: the init code hash is a chain FACT, defaulted rather than hardcoded.
// ---------------------------------------------------------------------------

/** A stand-in for a zkSync-class chain whose pair bytecode (and CREATE2 preimage) is its own. */
const FOREIGN_INIT_CODE_HASH = `0x${'ab'.repeat(32)}` as const

test('the canonical default is what the differential vector pins — an override is opt-in only', () => {
  expect(computeV2PairAddress(V2_FACTORY, USDC, WETH, V2_INIT_CODE_HASH)).toBe(
    computeV2PairAddress(V2_FACTORY, USDC, WETH),
  )
  expect(MAINNET_MANIFEST.v2!.initCodeHash).toBeUndefined() // mainnet IS the default; it states nothing
})

test('a manifest initCodeHash override changes the computed pair address', () => {
  const canonical = computeV2PairAddress(V2_FACTORY, USDC, WETH)
  const overridden = computeV2PairAddress(V2_FACTORY, USDC, WETH, FOREIGN_INIT_CODE_HASH)
  expect(overridden).not.toBe(canonical)
})

test('speculativeDirect derives its probe address from the manifest, not the module constant', () => {
  const foreign = { ...MAINNET_MANIFEST, v2: { ...MAINNET_MANIFEST.v2!, initCodeHash: FOREIGN_INIT_CODE_HASH } }
  const [probe] = v2Module.speculativeDirect(USDC, WETH, 10n ** 6n, foreign)
  const [canonicalProbe] = v2Module.speculativeDirect(USDC, WETH, 10n ** 6n, MAINNET_MANIFEST)

  const address = probe!.candidate.legs[0]!.pool
  expect(address.protocol === 'v2' && address.address).toBe(computeV2PairAddress(V2_FACTORY, USDC, WETH, FOREIGN_INIT_CODE_HASH))
  expect(probe!.candidate.legs[0]!.pool.id).not.toBe(canonicalProbe!.candidate.legs[0]!.pool.id)
  // And the probe is aimed at that address, not merely labelled with it.
  expect(probe!.quote.call.to).toBe(computeV2PairAddress(V2_FACTORY, USDC, WETH, FOREIGN_INIT_CODE_HASH))
})

test('validateHint honors the manifest override — a canonical-address hint no longer matches', async () => {
  const foreign = { ...MAINNET_MANIFEST, v2: { ...MAINNET_MANIFEST.v2!, initCodeHash: FOREIGN_INIT_CODE_HASH } }
  const canonicalAddress = computeV2PairAddress(V2_FACTORY, USDC, WETH)

  // The caller asserts the mainnet-derived address; on this chain that is simply the wrong pool.
  expect(
    await v2Module.validateHint({ protocol: 'v2', token0: USDC, token1: WETH, pool: canonicalAddress }, async () => '0x', foreign),
  ).toBeNull()

  const accepted = await v2Module.validateHint({ protocol: 'v2', token0: USDC, token1: WETH }, async () => '0x', foreign)
  expect(accepted?.pool.protocol === 'v2' && accepted.pool.address).toBe(
    computeV2PairAddress(V2_FACTORY, USDC, WETH, FOREIGN_INIT_CODE_HASH),
  )
})

test('getAmountOut applies the 0.3% fee', () => {
  expect(getAmountOut(1000n, 1_000_000n, 1_000_000n)).toBe(996n)
})

test('the adjacency shape pins the PairCreated selector, the factory, and the pair’s topic slot (drift guard)', () => {
  const shape = v2Module.adjacencyShape(MAINNET_MANIFEST)!
  expect(shape.topic0).toBe('0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9')
  expect(shape.emitter.toLowerCase()).toBe(V2_FACTORY.toLowerCase())
  // topics 1/2 — the same slots v3's PoolCreated uses, which is what makes the two mergeable.
  expect(shape.slot).toBe(1)
  // v2 has no native spelling of its own: the graph node IS the topic value.
  expect(shape.topicAddress(USDC)).toBe(USDC)
})

test('speculativeDirect probe decodes reserves into a quote', () => {
  const [probe] = v2Module.speculativeDirect(USDC, WETH, 10n ** 6n, MAINNET_MANIFEST)
  expect(probe!.candidate.legs[0]!.pool.protocol).toBe('v2')
  const reservesReturn = encodeAbiParameters(
    [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }],
    [2_000_000n * 10n ** 6n, 1_000n * 10n ** 18n, 0], // reserve0=USDC (token0), reserve1=WETH
  )
  const decoded = probe!.quote.decode(reservesReturn)
  expect(decoded.amountOut).toBeGreaterThan(0n)
  // NO gas figure on a v2 quote, ever: this is local constant-product math over `getReserves()`,
  // not an on-chain swap simulation, so there is nothing that measured gas (`RouteQuote.gasEstimate`).
  expect(decoded.gasEstimate).toBeUndefined()
})

test('speculativeDirect decode throws on an absent pool (empty returndata)', () => {
  const [probe] = v2Module.speculativeDirect(USDC, WETH, 10n ** 6n, MAINNET_MANIFEST)
  expect(() => probe!.quote.decode('0x')).toThrow()
})

test('speculativeDirect decode throws on an initialized-but-empty pair (zero reserves)', () => {
  const [probe] = v2Module.speculativeDirect(USDC, WETH, 10n ** 6n, MAINNET_MANIFEST)
  const zeroReservesReturn = encodeAbiParameters(
    [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }],
    [0n, 0n, 0],
  )
  expect(() => probe!.quote.decode(zeroReservesReturn)).toThrow()
})

test('encodeQuote rejects multi-leg v2 segments', () => {
  const [probe] = v2Module.speculativeDirect(USDC, WETH, 10n ** 6n, MAINNET_MANIFEST)
  const leg = probe!.candidate.legs[0]!
  expect(() => v2Module.encodeQuote([leg, leg], 10n ** 6n, MAINNET_MANIFEST)).toThrow(UnsupportedRouteError)
})

test('validateHint returns null when the asserted pool disagrees with the computed address', async () => {
  const wrongPool = '0x0000000000000000000000000000000000000001' as const
  const result = await v2Module.validateHint(
    { protocol: 'v2', token0: USDC, token1: WETH, pool: wrongPool },
    async () => '0x',
    MAINNET_MANIFEST,
  )
  expect(result).toBeNull()
})

test('validateHint returns a hint-sourced PoolRecord when the pool matches (or is omitted)', async () => {
  const computed = computeV2PairAddress(V2_FACTORY, USDC, WETH)
  const result = await v2Module.validateHint({ protocol: 'v2', token0: USDC, token1: WETH }, async () => '0x', MAINNET_MANIFEST)
  expect(result?.source).toBe('hint')
  expect(result?.pool.protocol === 'v2' && result.pool.address.toLowerCase()).toBe(computed.toLowerCase())
})

test('compileOperation maps custody', () => {
  const legs: RouteLeg[] = [
    {
      pool: v2Ref(computeV2PairAddress(V2_FACTORY, USDC, WETH), USDC, WETH),
      currencyIn: USDC,
      currencyOut: WETH,
    },
  ]
  const op = v2Module.compileOperation(legs, { payer: 'router', recipient: 'final' })
  expect(op).toMatchObject({ kind: 'v2-swap', payer: 'router', recipient: 'final' })
})

test('hypotheses returns exactly the one pool speculativeDirect probes today', () => {
  const [probe] = v2Module.speculativeDirect(USDC, WETH, 10n ** 6n, MAINNET_MANIFEST)
  const hypotheses = v2Module.hypotheses(USDC, WETH, MAINNET_MANIFEST)
  expect(hypotheses).toHaveLength(1)
  expect(hypotheses[0]!.id).toBe(probe!.candidate.legs[0]!.pool.id)
})

test('parsePoolLog returns null when log address does not match v2 factory', () => {
  const badAddress = '0x0000000000000000000000000000000000000bad' as const
  const pair = computeV2PairAddress(V2_FACTORY, USDC, WETH)

  const log = {
    address: badAddress,
    topics: [
      '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9' as const,
      `0x${USDC.slice(2).padStart(64, '0')}` as const,
      `0x${WETH.slice(2).padStart(64, '0')}` as const,
    ],
    data: encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [pair, 1n]),
    blockNumber: 12345n,
  }

  const result = v2Module.parsePoolLog(log as any, MAINNET_MANIFEST)
  expect(result).toBeNull()
})
