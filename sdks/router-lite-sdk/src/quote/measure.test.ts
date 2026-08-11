import { afterEach, expect, test } from 'bun:test'
import type { Address, Hex, PublicClient } from 'viem'
import { encodeAbiParameters, zeroAddress } from 'viem'

import { MULTICALL3_ADDRESS, MULTICALL_CHUNK } from '../internal/multicall'
import { createSemaphore } from '../internal/rpc'
import {
  NOT_ENOUGH_LIQUIDITY_DATA,
  rateLimitHttpError,
  recordStubViolation,
  serveAggregate3,
  takeStubViolations,
  v3Ref,
  v4Ref,
} from '../internal/testing'
import { MAINNET_MANIFEST } from '../manifest'
import type { ProtocolModule } from '../protocols/types'
import { v2Module } from '../protocols/v2'
import { v3Module } from '../protocols/v3'
import { v4Module } from '../protocols/v4'
import type { ChainManifest, EthCall, PoolKey, PoolRef, Protocol, RouteLeg } from '../types'

import type { LegOutcome, LegRequest } from './measure'
import { measureLegs } from './measure'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F' as const

const manifest: ChainManifest = MAINNET_MANIFEST
const modules: Record<Protocol, ProtocolModule> = { v2: v2Module, v3: v3Module, v4: v4Module }

// ---------------------------------------------------------------------------
// Stubs — the (to, data) registry pattern from `quote.test.ts`, in both dispatch
// spellings, so a leg's outcome is decided by the calldata the executor actually
// sent rather than by call order.
// ---------------------------------------------------------------------------

type StubEntry = Hex | 'revert' | 'revert-with-data' | 'rate-limit'

function callKey(to: string, data: string): string {
  return `${to.toLowerCase()}:${data}`
}

function stubClient(returns: Record<string, StubEntry>): Pick<PublicClient, 'request'> {
  return {
    async request(args: any) {
      const [{ to, data }] = args.params
      const entry = returns[callKey(to, data)]
      if (entry === undefined) recordStubViolation(`stubClient: no stub registered for ${callKey(to, data)}`)
      if (entry === 'revert') throw new Error('execution reverted')
      if (entry === 'revert-with-data') throw Object.assign(new Error('execution reverted'), { data: NOT_ENOUGH_LIQUIDITY_DATA })
      if (entry === 'rate-limit') throw rateLimitHttpError()
      return entry
    },
  } as unknown as Pick<PublicClient, 'request'>
}

function multicallStubClient(
  returns: Record<string, StubEntry>,
  opts: { outerOutcomes?: ('serve' | Error)[] } = {},
): Pick<PublicClient, 'request'> {
  let outerIndex = 0
  return {
    async request(args: any) {
      const [{ to, data }, blockTag] = args.params
      if ((to as string).toLowerCase() !== MULTICALL3_ADDRESS.toLowerCase()) {
        recordStubViolation(`multicallStubClient: eth_call to ${to} — the round should have aggregated through Multicall3`)
      }
      const outcome = opts.outerOutcomes?.[outerIndex++] ?? 'serve'
      if (outcome instanceof Error) throw outcome
      return serveAggregate3({
        data,
        blockTag,
        expectBlockNumber: 1n,
        serve: (target, callData) => {
          const entry = returns[callKey(target, callData)]
          // Unscripted is a fixture bug, never a plausible revert — see `internal/testing.ts`.
          if (entry === undefined) recordStubViolation(`multicallStubClient: no stub registered for ${callKey(target, callData)}`)
          if (entry === 'revert') throw new Error('execution reverted')
          if (entry === 'revert-with-data') throw Object.assign(new Error('execution reverted'), { data: NOT_ENOUGH_LIQUIDITY_DATA })
          if (entry === 'rate-limit') recordStubViolation('multicallStubClient: a 429 cannot happen inside aggregate3')
          return entry
        },
      })
    },
  } as unknown as Pick<PublicClient, 'request'>
}

function entryFor(call: EthCall, value: StubEntry): Record<string, StubEntry> {
  return { [callKey(call.to, call.data)]: value }
}

afterEach(() => {
  expect(takeStubViolations(), 'a stub was asked something no test scripted').toEqual([])
})

const V4_QUOTER_RETURN_TYPES = [{ type: 'uint256' }, { type: 'uint256' }] as const

function v4Return(amountOut: bigint, gasEstimate = 0n): Hex {
  return encodeAbiParameters(V4_QUOTER_RETURN_TYPES, [amountOut, gasEstimate])
}

function v2Return(reserveIn: bigint, reserveOut: bigint, zeroForOne: boolean): Hex {
  const [reserve0, reserve1] = zeroForOne ? [reserveIn, reserveOut] : [reserveOut, reserveIn]
  return encodeAbiParameters([{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }], [reserve0, reserve1, 0])
}

// ---------------------------------------------------------------------------
// Fixture legs
// ---------------------------------------------------------------------------

const v4UsdcWethKey: PoolKey = { currency0: USDC, currency1: WETH, fee: 3000, tickSpacing: 60, hooks: zeroAddress }
const v4UsdcWeth: PoolRef = v4Ref(v4UsdcWethKey)
const v3WethDai: PoolRef = v3Ref('0x0000000000000000000000000000000000d001', DAI, WETH, 3000)

function req(key: string, pool: PoolRef, currencyIn: Address, currencyOut: Address, amountIn: bigint): LegRequest {
  return { key, pool, currencyIn, currencyOut, amountIn }
}

function encoded(pool: PoolRef, currencyIn: Address, currencyOut: Address, amountIn: bigint): EthCall {
  return modules[pool.protocol].encodeQuote([{ pool, currencyIn, currencyOut }], amountIn, manifest).call
}

/** Fixture-only stand-in for the deleted direct-probe helper: every hypothesis for (a, b), each
 * paired with its own direct-pair `encodeQuote` — the exact `{ candidate, quote }` shape the old
 * probe API returned, rebuilt from the two primitives that survive it. */
function directProbes(module: ProtocolModule, a: Address, b: Address, amountIn: bigint, m: ChainManifest) {
  return module.hypotheses(a, b, m).map((pool) => {
    const leg: RouteLeg = { pool, currencyIn: a, currencyOut: b }
    return { candidate: { legs: [leg] }, quote: module.encodeQuote([leg], amountIn, m) }
  })
}

test('per-call path: a decoded quote is a success outcome carrying amount and the quoter gas figure', async () => {
  const leg = req('k1', v4UsdcWeth, USDC, WETH, 100n)
  const client = stubClient(entryFor(encoded(v4UsdcWeth, USDC, WETH, 100n), v4Return(500n, 186_412n)))

  const outcomes = await measureLegs({ client, modules, manifest, legs: [leg], blockNumber: 1n })

  expect(outcomes).toEqual([{ key: 'k1', kind: 'success', amountOut: 500n, gasEstimate: 186_412n }])
})

test('a quoter that reports no gas figure yields a success outcome with no gasEstimate key at all', async () => {
  // v2 prices off reserves locally — there is no quoter and no gas word to report, and the absence
  // must be an ABSENT field rather than a zero a caller would sum into a total.
  const [probe] = directProbes(v2Module, USDC, WETH, 10n ** 6n, manifest)
  const legRef = probe!.candidate.legs[0]!
  const leg = req('k1', legRef.pool, legRef.currencyIn as Address, legRef.currencyOut as Address, 10n ** 6n)
  const client = stubClient(entryFor(probe!.quote.call, v2Return(2_000_000n * 10n ** 6n, 1_000n * 10n ** 18n, true)))

  const [outcome] = await measureLegs({ client, modules, manifest, legs: [leg], blockNumber: 1n })

  expect(outcome!.kind).toBe('success')
  expect(Object.keys(outcome!)).not.toContain('gasEstimate')
})

test('outcomes are one per input leg and index-aligned, whatever mix of fates the round had', async () => {
  const good = req('good', v4UsdcWeth, USDC, WETH, 1n)
  const bare = req('bare', v3WethDai, WETH, DAI, 1n)
  const withData = req('with-data', v3Ref('0x0000000000000000000000000000000000d002', USDC, WETH, 500), USDC, WETH, 1n)
  const client = stubClient({
    ...entryFor(encoded(good.pool, USDC, WETH, 1n), v4Return(42n)),
    ...entryFor(encoded(bare.pool, WETH, DAI, 1n), 'revert'),
    ...entryFor(encoded(withData.pool, USDC, WETH, 1n), 'revert-with-data'),
  })

  const outcomes = await measureLegs({ client, modules, manifest, legs: [good, bare, withData], blockNumber: 1n })

  expect(outcomes.map((o) => o.key)).toEqual(['good', 'bare', 'with-data'])
  // A revert with NO data is the pool-absent, amount-independent shape (C4-H3); a revert that names
  // a reason may depend on the amount asked for, so it is never negative-cacheable.
  expect(outcomes[1]).toEqual({ key: 'bare', kind: 'reverted', amountIndependent: true })
  expect(outcomes[2]).toEqual({ key: 'with-data', kind: 'reverted', amountIndependent: false })
})

test('a pool-absent v2 read decodes to nothing and reports as an amount-independent revert', async () => {
  // `getReserves()` at an address with no contract returns `0x` on both dispatch paths — an
  // execution-channel failure with no revert data, so the same negative-cacheable shape as a bare
  // revert even though nothing reverted.
  const [probe] = directProbes(v2Module, WETH, DAI, 10n ** 6n, manifest)
  const legRef = probe!.candidate.legs[0]!
  const leg = req('empty', legRef.pool, legRef.currencyIn as Address, legRef.currencyOut as Address, 10n ** 6n)
  const client = stubClient(entryFor(probe!.quote.call, '0x' as Hex))

  const outcomes = await measureLegs({ client, modules, manifest, legs: [leg], blockNumber: 1n })

  expect(outcomes).toEqual([{ key: 'empty', kind: 'reverted', amountIndependent: true }])
})

test('a negative-int128 amountOut (>= 2^127) settles as reverted and amount-DEPENDENT — never negative-cacheable', async () => {
  // The live Arbitrum shape: a RETURNS_DELTA hook's negative output delta, reported by the V4Quoter
  // as `2^128 - k`. The real v4 decode rejects it (`ImplausibleQuoteError`), and the classification
  // seam must read that as amount-dependent: the pool EXISTS — its hook lies — so `true` here would
  // negative-cache a real pool and feed the hint-discredit history on its hook's arithmetic.
  const leg = req('liar', v4UsdcWeth, USDC, WETH, 10n ** 16n)
  const client = stubClient(entryFor(encoded(v4UsdcWeth, USDC, WETH, 10n ** 16n), v4Return(2n ** 128n - 499_999_999_900_313n)))

  const outcomes = await measureLegs({ client, modules, manifest, legs: [leg], blockNumber: 1n })

  expect(outcomes).toEqual([{ key: 'liar', kind: 'reverted', amountIndependent: false }])
})

test('a 429 is transport, never a revert — nothing was learned about that leg', async () => {
  const leg = req('k1', v4UsdcWeth, USDC, WETH, 1n)
  const client = stubClient(entryFor(encoded(v4UsdcWeth, USDC, WETH, 1n), 'rate-limit'))

  const outcomes = await measureLegs({ client, modules, manifest, legs: [leg], blockNumber: 1n })

  expect(outcomes).toEqual([{ key: 'k1', kind: 'transport' }])
})

test('an encode failure is that leg alone — the rest of the round is measured normally', async () => {
  const throwingModules: Record<Protocol, ProtocolModule> = {
    ...modules,
    v3: {
      ...v3Module,
      encodeQuote() {
        throw new Error('encoder exploded')
      },
    },
  }
  const broken = req('broken', v3WethDai, WETH, DAI, 1n)
  const good = req('good', v4UsdcWeth, USDC, WETH, 1n)
  const client = stubClient(entryFor(encoded(v4UsdcWeth, USDC, WETH, 1n), v4Return(42n)))

  const outcomes = await measureLegs({ client, modules: throwingModules, manifest, legs: [broken, good], blockNumber: 1n })

  expect(outcomes[0]).toEqual({ key: 'broken', kind: 'reverted', amountIndependent: true })
  expect(outcomes[1]).toEqual({ key: 'good', kind: 'success', amountOut: 42n, gasEstimate: 0n })
})

test('a leg the abort caught in the semaphore queue is unattempted — not attempted, not blamed on the provider', async () => {
  const amountIn = 10n ** 6n
  const [first] = directProbes(v2Module, USDC, WETH, amountIn, manifest)
  const [second] = directProbes(v2Module, WETH, DAI, amountIn, manifest)
  const [third] = directProbes(v2Module, USDC, DAI, amountIn, manifest)
  const legs = [first!, second!, third!].map((probe, i) => {
    const leg = probe.candidate.legs[0]!
    return req(`k${i}`, leg.pool, leg.currencyIn as Address, leg.currencyOut as Address, amountIn)
  })

  const controller = new AbortController()
  const reserves = v2Return(2_000_000n * 10n ** 6n, 1_000n * 10n ** 18n, true)
  const base = stubClient({
    ...entryFor(first!.quote.call, reserves),
    ...entryFor(second!.quote.call, reserves),
    ...entryFor(third!.quote.call, reserves),
  })
  const served: string[] = []
  const client: Pick<PublicClient, 'request'> = {
    async request(args: never) {
      served.push('x')
      // The deadline expiring the instant the first call is served: everything still queued behind
      // the single permit is work nobody is waiting for any more.
      controller.abort()
      return base.request(args)
    },
  } as Pick<PublicClient, 'request'>

  const outcomes = await measureLegs({
    client,
    modules,
    manifest,
    legs,
    blockNumber: 1n,
    semaphore: createSemaphore(1),
    signal: controller.signal,
  })

  expect(served).toHaveLength(1)
  expect(outcomes[0]!.kind).toBe('success')
  expect(outcomes.slice(1)).toEqual([
    { key: 'k1', kind: 'unattempted' },
    { key: 'k2', kind: 'unattempted' },
  ])
})

test('a v4 leg carries its request-scoped hookData into the encoded quote', async () => {
  // Hooked v4 pools price differently under different hook data, so the quote MUST be encoded with
  // the request's bytes. This is the only place the leg is built, so a `LegRequest` that could not
  // carry them would silently price every hooked pool against a call the swap will never make.
  const hookData: Hex = '0xdeadbeef'
  const withHook = modules.v4.encodeQuote([{ pool: v4UsdcWeth, currencyIn: USDC, currencyOut: WETH, hookData }], 100n, manifest).call
  const withoutHook = encoded(v4UsdcWeth, USDC, WETH, 100n)
  // The fixture is only meaningful if the bytes really differ — otherwise the stub below would be
  // satisfied by an executor that dropped the field entirely.
  expect(withHook.data).not.toBe(withoutHook.data)

  // ONLY the hooked calldata is scripted: an executor that dropped `hookData` sends the other one
  // and the stub records a violation instead of quietly returning an answer.
  const client = stubClient(entryFor(withHook, v4Return(500n)))
  const outcomes = await measureLegs({
    client,
    modules,
    manifest,
    legs: [{ ...req('hooked', v4UsdcWeth, USDC, WETH, 100n), hookData }],
    blockNumber: 1n,
  })

  expect(outcomes).toEqual([{ key: 'hooked', kind: 'success', amountOut: 500n, gasEstimate: 0n }])
})

test('no legs is no round — no request goes out', async () => {
  const client = stubClient({})
  expect(await measureLegs({ client, modules, manifest, legs: [], blockNumber: 1n })).toEqual([])
})

// ---------------------------------------------------------------------------
// The multicall dispatch path — same vocabulary, different wire shape.
// ---------------------------------------------------------------------------

test('multicall path: an inner revert with no data is amount-independent, one with data is not', async () => {
  const good = req('good', v4UsdcWeth, USDC, WETH, 1n)
  const bare = req('bare', v3WethDai, WETH, DAI, 1n)
  const withData = req('with-data', v3Ref('0x0000000000000000000000000000000000d003', USDC, WETH, 500), USDC, WETH, 1n)
  const client = multicallStubClient({
    ...entryFor(encoded(good.pool, USDC, WETH, 1n), v4Return(42n)),
    ...entryFor(encoded(bare.pool, WETH, DAI, 1n), 'revert'),
    ...entryFor(encoded(withData.pool, USDC, WETH, 1n), 'revert-with-data'),
  })

  const outcomes = await measureLegs({
    client,
    modules,
    manifest,
    legs: [good, bare, withData],
    blockNumber: 1n,
    multicall3: MULTICALL3_ADDRESS,
  })

  expect(outcomes).toEqual([
    { key: 'good', kind: 'success', amountOut: 42n, gasEstimate: 0n },
    { key: 'bare', kind: 'reverted', amountIndependent: true },
    { key: 'with-data', kind: 'reverted', amountIndependent: false },
  ])
})

test('multicall path: an outer 429 coarsens the whole chunk to transport, never to reverts', async () => {
  const a = req('a', v4UsdcWeth, USDC, WETH, 1n)
  const b = req('b', v3WethDai, WETH, DAI, 1n)
  const client = multicallStubClient({}, { outerOutcomes: [rateLimitHttpError()] })

  const outcomes = await measureLegs({ client, modules, manifest, legs: [a, b], blockNumber: 1n, multicall3: MULTICALL3_ADDRESS })

  expect(outcomes).toEqual([
    { key: 'a', kind: 'transport' },
    { key: 'b', kind: 'transport' },
  ])
})

test('multicall path: an abort before the round leaves every leg unattempted', async () => {
  const controller = new AbortController()
  controller.abort()
  const client = multicallStubClient({})

  const outcomes = await measureLegs({
    client,
    modules,
    manifest,
    legs: [req('a', v4UsdcWeth, USDC, WETH, 1n), req('b', v3WethDai, WETH, DAI, 1n)],
    blockNumber: 1n,
    multicall3: MULTICALL3_ADDRESS,
    signal: controller.signal,
  })

  expect(outcomes).toEqual([
    { key: 'a', kind: 'unattempted' },
    { key: 'b', kind: 'unattempted' },
  ])
})

test('both dispatch paths report the identical outcomes for the identical world', async () => {
  const good = req('good', v4UsdcWeth, USDC, WETH, 1n)
  const bare = req('bare', v3WethDai, WETH, DAI, 1n)
  const withData = req('with-data', v3Ref('0x0000000000000000000000000000000000d004', USDC, WETH, 500), USDC, WETH, 1n)
  const [emptyCodeProbe] = directProbes(v2Module, USDC, DAI, 1n, manifest)
  const emptyLeg = emptyCodeProbe!.candidate.legs[0]!
  const empty = req('empty', emptyLeg.pool, emptyLeg.currencyIn as Address, emptyLeg.currencyOut as Address, 1n)
  const legs = [good, bare, withData, empty]
  const world: Record<string, StubEntry> = {
    ...entryFor(encoded(good.pool, USDC, WETH, 1n), v4Return(42n, 7n)),
    ...entryFor(encoded(bare.pool, WETH, DAI, 1n), 'revert'),
    ...entryFor(encoded(withData.pool, USDC, WETH, 1n), 'revert-with-data'),
    ...entryFor(emptyCodeProbe!.quote.call, '0x' as Hex),
  }

  const perCall: LegOutcome[] = await measureLegs({ client: stubClient(world), modules, manifest, legs, blockNumber: 1n })
  const aggregated: LegOutcome[] = await measureLegs({
    client: multicallStubClient(world),
    modules,
    manifest,
    legs,
    blockNumber: 1n,
    multicall3: MULTICALL3_ADDRESS,
  })

  expect(aggregated).toEqual(perCall)
  expect(perCall.map((o) => o.kind)).toEqual(['success', 'reverted', 'reverted', 'reverted'])
})

// ---------------------------------------------------------------------------
// The chunk-granular delivery seam (`onOutcomes`) — the measurement half of
// the engine's granularity principle: a round's first settled group is usable
// while the rest is still on the wire.
// ---------------------------------------------------------------------------

/** 120 legs on one v4 pool, distinguished by amount (which is the key) — enough for three
 * MULTICALL_CHUNK groups — each stubbed to price at twice its amount. */
function chunkFixture(): { legs: LegRequest[]; world: Record<string, StubEntry> } {
  const legs: LegRequest[] = []
  let world: Record<string, StubEntry> = {}
  for (let i = 1; i <= 120; i++) {
    legs.push(req(`k${i}`, v4UsdcWeth, USDC, WETH, BigInt(i)))
    world = { ...world, ...entryFor(encoded(v4UsdcWeth, USDC, WETH, BigInt(i)), v4Return(BigInt(2 * i))) }
  }
  return { legs, world }
}

test('onOutcomes delivers each MULTICALL_CHUNK-sized group of the input exactly once — disjoint batches whose union is the index-aligned return', async () => {
  const { legs, world } = chunkFixture()
  // One leg whose ENCODE throws, planted in the second group: an encode-failure slot travels inside
  // its own group's batch — settled instantly, but never delivered twice and never dropped.
  const throwingModules: Record<Protocol, ProtocolModule> = {
    ...modules,
    v3: {
      ...v3Module,
      encodeQuote() {
        throw new Error('encoder exploded')
      },
    },
  }
  legs[60] = req('broken', v3WethDai, WETH, DAI, 1n)

  const batches: LegOutcome[][] = []
  const outcomes = await measureLegs({
    client: stubClient(world),
    modules: throwingModules,
    manifest,
    legs,
    blockNumber: 1n,
    onOutcomes: (batch) => batches.push(batch),
  })

  // The return is untouched by the seam: one outcome per input leg, index-aligned.
  expect(outcomes.map((o) => o.key)).toEqual(legs.map((l) => l.key))
  expect(outcomes[0]).toEqual({ key: 'k1', kind: 'success', amountOut: 2n, gasEstimate: 0n })
  expect(outcomes[60]).toEqual({ key: 'broken', kind: 'reverted', amountIndependent: true })

  // Groups settle concurrently, so arrival ORDER is theirs to race — but each batch is exactly one
  // MULTICALL_CHUNK-sized slice of the input, every slice arrives, and no key arrives twice.
  expect(batches.map((b) => b.length).sort((a, b) => a - b)).toEqual([20, 50, 50])
  const starts = new Set<number>()
  for (const batch of batches) {
    const start = legs.findIndex((l) => l.key === batch[0]!.key)
    expect(start % MULTICALL_CHUNK).toBe(0)
    starts.add(start)
    expect(batch.map((o) => o.key)).toEqual(legs.slice(start, start + batch.length).map((l) => l.key))
  }
  expect(starts.size).toBe(3)
})

test('multicall path: ONE failed envelope of three coarsens its own 50 legs and no others — index alignment intact', async () => {
  // The granularity claim at round level, and the one a per-envelope test cannot make: a 120-leg
  // round is three envelopes, and a provider that drops the MIDDLE one must cost exactly the 50 legs
  // that rode in it. The failure modes this rules out are both silent — every leg coarsened (one
  // chunk's outage taken for the round's), or the surviving envelopes' answers shifted into the gap
  // (fifty `transport` slots written at the wrong indices, so every later leg is reported holding
  // some other leg's price).
  const { legs, world } = chunkFixture()
  const client = multicallStubClient(world, { outerOutcomes: ['serve', rateLimitHttpError(), 'serve'] })

  const outcomes = await measureLegs({
    client,
    modules,
    manifest,
    legs,
    blockNumber: 1n,
    multicall3: MULTICALL3_ADDRESS,
  })

  // Envelopes are dispatched in input order, so the coarsened window is exactly the second group.
  const coarsened = outcomes.flatMap((o, i) => (o.kind === 'transport' ? [i] : []))
  expect(coarsened).toEqual(Array.from({ length: MULTICALL_CHUNK }, (_, i) => MULTICALL_CHUNK + i))
  // Everything else answered, at its own index, with its own price: `k{i}` prices at 2i, so a shift
  // by even one slot fails here rather than passing as a plausible tally.
  expect(outcomes.map((o) => o.key)).toEqual(legs.map((l) => l.key))
  for (const [i, outcome] of outcomes.entries()) {
    if (coarsened.includes(i)) continue
    expect(outcome).toEqual({ key: `k${i + 1}`, kind: 'success', amountOut: BigInt(2 * (i + 1)), gasEstimate: 0n })
  }
})

test('multicall path: each dispatch group is exactly one aggregate3 envelope, delivered as it settles', async () => {
  const { legs, world } = chunkFixture()
  let envelopes = 0
  const inner = multicallStubClient(world)
  const client: Pick<PublicClient, 'request'> = {
    request(args: never) {
      envelopes++
      return inner.request(args)
    },
  } as unknown as Pick<PublicClient, 'request'>

  const batches: LegOutcome[][] = []
  const outcomes = await measureLegs({
    client,
    modules,
    manifest,
    legs,
    blockNumber: 1n,
    multicall3: MULTICALL3_ADDRESS,
    onOutcomes: (batch) => batches.push(batch),
  })

  // 120 legs = 3 groups = 3 envelopes on the wire — the same shape the undivided round produced —
  // and one delivery per envelope.
  expect(envelopes).toBe(3)
  expect(batches.length).toBe(3)
  expect(outcomes.map((o) => o.key)).toEqual(legs.map((l) => l.key))
  expect(new Set(batches.flat().map((o) => o.key)).size).toBe(120)
})
