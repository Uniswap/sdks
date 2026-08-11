import { expect, test } from 'bun:test'
import fc from 'fast-check'
import type { Address, Hex, PublicClient } from 'viem'
import { zeroHash } from 'viem'

import { HINT_DISCREDIT_FAILURE_BLOCKS, MEASUREMENT_PAIR_CEILING, PUMP_ROUND_CAP } from '../constants'
import { TransportError } from '../errors'
import { createSemaphore } from '../internal/rpc'
import { NOT_ENOUGH_LIQUIDITY_DATA, v2Ref, v4Ref } from '../internal/testing'
import { MAINNET_MANIFEST } from '../manifest'
import { isDiscredited, PoolIndex } from '../pools/poolIndex'
import { PROTOCOL_MODULES } from '../protocols'
import type { ProtocolModule } from '../protocols/types'
import { computeV2PairAddress } from '../protocols/v2'
import type {
  BlockRef,
  ChainManifest,
  CurrencyRef,
  PoolHint,
  PoolKey,
  PoolRecord,
  PoolRef,
  Protocol,
  QuoteRequest,
} from '../types'

import { buildHookData } from './hookData'
import type { PlannedLeg, PumpCtx } from './pump'
import { composeRoutes, orderedIntermediates, planDueLegs, pump, pumpDry } from './pump'
import type { SearchState } from './state'
import { createState, legKey } from './state'

// ---------------------------------------------------------------------------
// Fixtures — a self-contained constant-product world served by fake modules
// whose encodeQuote/decode are deterministic local math (spec Task 5: no real
// protocol encoding needed), plus a handful of real-module planning tests
// against per-protocol manifests.
// ---------------------------------------------------------------------------

const WN = `0x${'ee'.repeat(20)}` as Address // fake chain's wrapped native
const T_IN = `0x${'a1'.repeat(20)}` as Address
const T_OUT = `0x${'b2'.repeat(20)}` as Address
const X_TOKENS = [`0x${'c1'.repeat(20)}`, `0x${'c2'.repeat(20)}`, `0x${'c3'.repeat(20)}`] as Address[]
const BLOCK: BlockRef = { number: 100n, hash: zeroHash, timestamp: 1_700_000_000n }

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F' as Address

function addr(n: number): Address {
  return `0x${n.toString(16).padStart(40, '0')}` as Address
}

const FAKE_MANIFEST: ChainManifest = { chainId: 1, wrappedNative: WN }

type Fate =
  | { kind: 'price'; r0: bigint; r1: bigint; gas?: bigint }
  | { kind: 'revert' } // data-less: the pool-absent, amount-independent shape
  | { kind: 'revert-data' }
  | { kind: 'transport' }

type World = Map<string, Fate> // pool.id -> fate

/** v2's own fee curve — any monotone function works; this one is easy to brute-force. */
function cpOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  const withFee = amountIn * 997n
  return (withFee * reserveOut) / (reserveIn * 1000n + withFee)
}

function fatePrice(fate: Fate, pool: PoolRef, currencyIn: CurrencyRef, amountIn: bigint): bigint | undefined {
  if (fate.kind !== 'price') return undefined
  const zeroForOne = String(currencyIn).toLowerCase() === String(pool.currencies[0]).toLowerCase()
  const [reserveIn, reserveOut] = zeroForOne ? [fate.r0, fate.r1] : [fate.r1, fate.r0]
  return cpOut(amountIn, reserveIn, reserveOut)
}

/** Leg identity as the scripted client sees it — what the dedup property counts. */
function idData(pool: PoolRef, currencyIn: CurrencyRef, amountIn: bigint): Hex {
  return `0x${Buffer.from(`${pool.id}|${String(currencyIn).toLowerCase()}|${amountIn}`).toString('hex')}` as Hex
}

function fromIdData(data: Hex): string {
  return Buffer.from(data.slice(2), 'hex').toString()
}

/** A ProtocolModule whose quotes are local constant-product math over `world` — measurement
 * outcomes are decided by each pool's scripted fate, never by real protocol encoding. */
function fakeModule(world: World, id: Protocol = 'v2'): ProtocolModule {
  return {
    id,
    enabled: () => true,
    hypotheses: () => [],
    speculativeDirect: () => [],
    adjacencyShape: () => undefined,
    parsePoolLog: () => null,
    validateHint: () => Promise.resolve(null),
    encodeQuote(legs, amountIn) {
      const leg = legs[0]!
      const pool = leg.pool
      return {
        call: { to: pool.protocol === 'v4' ? WN : pool.address, data: idData(pool, leg.currencyIn, amountIn) },
        decode: () => {
          const fate = world.get(pool.id)
          if (!fate || fate.kind === 'revert') throw new Error('no pool here')
          if (fate.kind === 'revert-data') throw Object.assign(new Error('reverted'), { data: NOT_ENOUGH_LIQUIDITY_DATA })
          if (fate.kind === 'transport') throw new TransportError('scripted 429')
          const amountOut = fatePrice(fate, pool, leg.currencyIn, amountIn)!
          return { amountOut, ...(fate.gas !== undefined && { gasEstimate: fate.gas }) }
        },
      }
    },
    compileOperation() {
      throw new Error('the fake module never compiles')
    },
  }
}

function worldClient(record?: string[]): Pick<PublicClient, 'request'> {
  return {
    async request(args: unknown) {
      const [{ data }] = (args as { params: [{ data: Hex }] }).params
      record?.push(fromIdData(data))
      return '0x'
    },
  } as unknown as Pick<PublicClient, 'request'>
}

let nextPoolNumber = 0x1000

function newPool(index: PoolIndex | undefined, world: World, a: Address, b: Address, fate: Fate, createdAtBlock = 1n): PoolRef {
  const pool = v2Ref(addr(nextPoolNumber++), a, b)
  world.set(pool.id, fate)
  index?.upsert({ pool, source: 'event', createdAtBlock })
  return pool
}

type FakeSetup = { state: SearchState; ctx: PumpCtx; req: QuoteRequest; world: World; index: PoolIndex; record: string[] }

function fakeSetup(options?: { amountIn?: bigint; manifest?: ChainManifest; hints?: PoolHint[] }): FakeSetup {
  const world: World = new Map()
  const index = new PoolIndex(WN)
  const record: string[] = []
  const fake = fakeModule(world)
  const ctx: PumpCtx = {
    index,
    modules: { v2: fake, v3: fakeModule(world, 'v3'), v4: fakeModule(world, 'v4') },
    manifest: options?.manifest ?? FAKE_MANIFEST,
    hookData: new Map(),
    hints: options?.hints ?? [],
    client: worldClient(record),
  }
  const state = createState(BLOCK, false)
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: options?.amountIn ?? 1_000_000n }
  return { state, ctx, req, world, index, record }
}

async function runToDry(state: SearchState, ctx: PumpCtx, req: QuoteRequest, maxCycles = 64): Promise<void> {
  for (let i = 0; i < maxCycles; i++) {
    if (!(await pump(state, ctx, req))) return
  }
  throw new Error('pump never went dry')
}

function legsFor(planned: PlannedLeg[], roleKind: PlannedLeg['role']['kind']): PlannedLeg[] {
  return planned.filter((p) => p.role.kind === roleKind)
}

// ---------------------------------------------------------------------------
// Planning — pure unit tests over planDueLegs
// ---------------------------------------------------------------------------

const V2_ONLY: ChainManifest = { chainId: 1, wrappedNative: MAINNET_MANIFEST.wrappedNative, v2: MAINNET_MANIFEST.v2 }
const V4_ONLY: ChainManifest = { chainId: 1, wrappedNative: MAINNET_MANIFEST.wrappedNative, v4: MAINNET_MANIFEST.v4 }

function realCtx(manifest: ChainManifest, options?: { index?: PoolIndex; hints?: PoolHint[]; hookData?: Map<string, Hex> }): PumpCtx {
  return {
    index: options?.index ?? new PoolIndex(manifest.wrappedNative),
    modules: PROTOCOL_MODULES,
    manifest,
    hookData: options?.hookData ?? new Map(),
    hints: options?.hints ?? [],
    client: worldClient(),
  }
}

test('the merged per-pair set is deduped by pool.id — index ∪ hypotheses ∪ hint plan ONE leg, hint provenance winning', () => {
  const hypothesis = PROTOCOL_MODULES.v2.hypotheses(USDC, DAI, V2_ONLY)[0]!
  const index = new PoolIndex(V2_ONLY.wrappedNative)
  index.upsert({ pool: hypothesis, source: 'event', createdAtBlock: 1n })
  const hint: PoolHint = { protocol: 'v2', token0: USDC, token1: DAI }
  const ctx = realCtx(V2_ONLY, { index, hints: [hint] })
  const state = createState(BLOCK, false)

  const planned = planDueLegs(state, ctx, { tokenIn: USDC, tokenOut: DAI, amountIn: 5n })

  expect(planned).toHaveLength(1)
  expect(planned[0]!.leg.pool.id).toBe(hypothesis.id)
  expect(planned[0]!.provenance).toBe('hint')
  expect(planned[0]!.leg.key).toBe(legKey(hypothesis.id, USDC.toLowerCase(), 5n))
})

test('the same pool without a hint plans with index provenance, and without the index with hypothesis provenance', () => {
  const hypothesis = PROTOCOL_MODULES.v2.hypotheses(USDC, DAI, V2_ONLY)[0]!
  const state = createState(BLOCK, false)

  const bare = planDueLegs(state, realCtx(V2_ONLY), { tokenIn: USDC, tokenOut: DAI, amountIn: 5n })
  expect(bare).toHaveLength(1)
  expect(bare[0]!.provenance).toBe('hypothesis')

  const index = new PoolIndex(V2_ONLY.wrappedNative)
  index.upsert({ pool: hypothesis, source: 'event', createdAtBlock: 1n })
  const indexed = planDueLegs(createState(BLOCK, false), realCtx(V2_ONLY, { index }), { tokenIn: USDC, tokenOut: DAI, amountIn: 5n })
  expect(indexed).toHaveLength(1)
  expect(indexed[0]!.provenance).toBe('index')
})

test('out-legs for X are deferred until an in-leg answers, then due at exactly mX.amount', () => {
  const { state, ctx, req, world, index } = fakeSetup()
  const x = X_TOKENS[0]!
  newPool(index, world, T_IN, x, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 9n })
  const outPool = newPool(index, world, x, T_OUT, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 9n })
  state.intermediates.selected = [x]

  const deferred = planDueLegs(state, ctx, req)
  expect(legsFor(deferred, 'in')).toHaveLength(1)
  expect(legsFor(deferred, 'out')).toHaveLength(0)

  state.mX.set(x, { amount: 777n, fromPoolId: 'whatever' })
  const due = planDueLegs(state, ctx, req)
  const outs = legsFor(due, 'out')
  expect(outs).toHaveLength(1)
  expect(outs[0]!.leg.amountIn).toBe(777n)
  expect(outs[0]!.leg.pool.id).toBe(outPool.id)
})

test('an out-leg measured at a stale amount re-plans at the new mX amount (a different key)', () => {
  const { state, ctx, req, world, index } = fakeSetup()
  const x = X_TOKENS[0]!
  newPool(index, world, T_IN, x, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 9n })
  const outPool = newPool(index, world, x, T_OUT, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 9n })
  state.intermediates.selected = [x]

  // Simulate an out-leg already measured at a stale amount whose ledger entry the pump invalidated
  // (measurements/measuredKeys no longer hold it): the new amount plans as a fresh key.
  const staleKey = legKey(outPool.id, x.toLowerCase(), 500n)
  state.mX.set(x, { amount: 900n, fromPoolId: 'p-in' })
  const due = planDueLegs(state, ctx, req)
  const outs = legsFor(due, 'out')
  expect(outs).toHaveLength(1)
  expect(outs[0]!.leg.key).toBe(legKey(outPool.id, x.toLowerCase(), 900n))
  expect(outs[0]!.leg.key).not.toBe(staleKey)
})

test('a pair over the measurement ceiling is capped and reported via pairCeilingHit', () => {
  const { state, ctx, req, world, index } = fakeSetup()
  for (let i = 0; i < MEASUREMENT_PAIR_CEILING + 2; i++) newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n, r1: 10n })

  const planned = planDueLegs(state, ctx, req)

  expect(planned).toHaveLength(MEASUREMENT_PAIR_CEILING)
  expect(state.pairCeilingHit).toBe(true)
})

test('a pair at exactly the ceiling does not trip pairCeilingHit', () => {
  const { state, ctx, req, world, index } = fakeSetup()
  for (let i = 0; i < MEASUREMENT_PAIR_CEILING; i++) newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n, r1: 10n })

  expect(planDueLegs(state, ctx, req)).toHaveLength(MEASUREMENT_PAIR_CEILING)
  expect(state.pairCeilingHit).toBe(false)
})

test('pools negative at the pinned block are not planned; negatives at other blocks are', () => {
  const { state, ctx, req, world, index } = fakeSetup()
  const dead = newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n, r1: 10n })
  const alive = newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n, r1: 10n })
  index.markNegative(dead, BLOCK.number)
  index.markNegative(alive, BLOCK.number - 1n)

  const planned = planDueLegs(state, ctx, req)

  expect(planned.map((p) => p.leg.pool.id)).toEqual([alive.id])
})

test('a v4 hint pool plans with the request-scoped hookData; hypothesis legs carry none', () => {
  const hooks = addr(0x5555)
  const [currency0, currency1] = [USDC.toLowerCase() as Address, MAINNET_MANIFEST.wrappedNative.toLowerCase() as Address].sort() as [Address, Address]
  const poolKey: PoolKey = { currency0, currency1, fee: 3000, tickSpacing: 60, hooks }
  const hint: PoolHint = { protocol: 'v4', poolKey, hookData: '0xdeadbeef' }
  const hinted = v4Ref(poolKey)
  const ctx = realCtx(V4_ONLY, { hints: [hint], hookData: buildHookData([hint]) })
  const state = createState(BLOCK, false)

  const planned = planDueLegs(state, ctx, { tokenIn: USDC, tokenOut: MAINNET_MANIFEST.wrappedNative, amountIn: 5n })

  const hintedLeg = planned.find((p) => p.leg.pool.id === hinted.id)
  expect(hintedLeg).toBeDefined()
  expect(hintedLeg!.provenance).toBe('hint')
  expect(hintedLeg!.leg.hookData).toBe('0xdeadbeef')
  for (const other of planned.filter((p) => p.leg.pool.id !== hinted.id)) {
    expect(other.leg.hookData).toBeUndefined()
    expect(other.provenance).toBe('hypothesis')
  }
})

test('legs keep the currency FORM of their own pool: a native v4 pool plans a native-in leg', () => {
  const ctx = realCtx(V4_ONLY)
  const state = createState(BLOCK, false)

  const planned = planDueLegs(state, ctx, { tokenIn: 'native', tokenOut: USDC, amountIn: 5n })

  expect(planned.length).toBeGreaterThan(0)
  for (const p of planned) {
    expect(p.leg.currencyIn).toBe('native')
    expect(p.leg.pool.currencies[0]).toBe('native') // v4 spells native as address(0) -> domain 'native'
    expect(p.leg.key).toBe(legKey(p.leg.pool.id, 'native', 5n))
  }
})

test('orderedIntermediates: hinted nodes, then manifest cores, then neighbor intersection newest-first', () => {
  const world: World = new Map()
  const index = new PoolIndex(WN)
  const hintToken = addr(0xd1)
  const core = addr(0xd2)
  const older = X_TOKENS[0]!
  const newer = X_TOKENS[1]!
  newPool(index, world, T_IN, older, { kind: 'price', r0: 1n, r1: 1n }, 5n)
  newPool(index, world, older, T_OUT, { kind: 'price', r0: 1n, r1: 1n }, 5n)
  newPool(index, world, T_IN, newer, { kind: 'price', r0: 1n, r1: 1n }, 9n)
  newPool(index, world, newer, T_OUT, { kind: 'price', r0: 1n, r1: 1n }, 9n)
  const factory = addr(0xf)
  const manifest: ChainManifest = { chainId: 1, wrappedNative: WN, coreIntermediates: [core], v2: { factory, deploymentBlock: 0n } }
  const fake = fakeModule(world)
  const ctx: PumpCtx = {
    index,
    modules: { v2: fake, v3: fake, v4: fake },
    manifest,
    hookData: new Map(),
    hints: [{ protocol: 'v2', token0: T_IN, token1: hintToken }],
    client: worldClient(),
  }
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 10n }

  expect(orderedIntermediates(ctx, req)).toEqual([hintToken, core, newer, older])

  const state = createState(BLOCK, false)
  planDueLegs(state, ctx, req)
  expect(state.intermediates.discovered).toBe(4)
})

// ---------------------------------------------------------------------------
// The pump — dispatch, bookkeeping, invalidation
// ---------------------------------------------------------------------------

test('a round is capped at PUMP_ROUND_CAP legs; leftover due legs go out on the next cycle', async () => {
  const { state, ctx, req, world, index, record } = fakeSetup()
  for (let i = 0; i < MEASUREMENT_PAIR_CEILING; i++) newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 9n })
  for (const x of X_TOKENS) {
    for (let i = 0; i < 100; i++) newPool(index, world, T_IN, x, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 9n })
  }
  state.intermediates.selected = X_TOKENS.map((x) => x.toLowerCase())
  const totalDue = MEASUREMENT_PAIR_CEILING + 300

  expect(planDueLegs(state, ctx, req).length).toBe(totalDue)
  expect(await pump(state, ctx, req)).toBe(true)
  expect(record).toHaveLength(PUMP_ROUND_CAP)

  expect(await pump(state, ctx, req)).toBe(true)
  expect(record).toHaveLength(totalDue)
  expect(new Set(record).size).toBe(totalDue)
  expect(state.inFlightKeys.size).toBe(0)
})

test('a transport loss is re-dispatched exactly once, then terminal', async () => {
  const { state, ctx, req, world, index, record } = fakeSetup()
  newPool(index, world, T_IN, T_OUT, { kind: 'transport' })

  await runToDry(state, ctx, req)

  expect(record).toHaveLength(2) // the one release, then never again
  expect(new Set(record).size).toBe(1)
  expect(state.quoting).toEqual({ attempted: 2, succeeded: 0, failed: 0, transportFailed: 2, unattempted: 0 })
  expect(state.legsMeasured).toBe(1)
})

test('a hint hypothesis is upserted with hint provenance ON SUCCESS, and indexVersion is bumped', async () => {
  const factory = addr(0xf)
  const manifest: ChainManifest = { chainId: 1, wrappedNative: WN, v2: { factory, deploymentBlock: 0n } }
  const { state, ctx, req, world, index } = fakeSetup({ manifest, hints: [{ protocol: 'v2', token0: T_IN, token1: T_OUT }] })
  const expected = v2Ref(computeV2PairAddress(factory, T_IN, T_OUT), T_IN, T_OUT)
  world.set(expected.id, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 9n })

  await runToDry(state, ctx, req)

  const records = index.pair(T_IN, T_OUT)
  expect(records).toHaveLength(1)
  expect(records[0]!.pool.id).toBe(expected.id)
  expect(records[0]!.source).toBe('hint')
  expect(records[0]!.lastQuoteSuccessBlock).toBe(BLOCK.number)
  expect(state.indexVersion).toBe(1)
})

test('a non-hint hypothesis proven by measurement upserts with factory provenance', async () => {
  const { state, ctx, req, world, index } = fakeSetup()
  const hypothesis = newPool(undefined, world, T_IN, T_OUT, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 9n })
  ctx.modules = { ...ctx.modules, v2: { ...ctx.modules.v2, hypotheses: () => [hypothesis] } }

  await runToDry(state, ctx, req)

  const records = index.pair(T_IN, T_OUT)
  expect(records).toHaveLength(1)
  expect(records[0]!.source).toBe('factory')
  expect(state.indexVersion).toBe(1)
})

test('a hint hypothesis that reverts data-less is negative-cached, never upserted, and not re-planned', async () => {
  const factory = addr(0xf)
  const manifest: ChainManifest = { chainId: 1, wrappedNative: WN, v2: { factory, deploymentBlock: 0n } }
  const { state, ctx, req, world, index } = fakeSetup({ manifest, hints: [{ protocol: 'v2', token0: T_IN, token1: T_OUT }] })
  const expected = v2Ref(computeV2PairAddress(factory, T_IN, T_OUT), T_IN, T_OUT)
  world.set(expected.id, { kind: 'revert' })

  await runToDry(state, ctx, req)

  expect(index.pair(T_IN, T_OUT)).toHaveLength(0)
  expect(index.isNegative(expected, BLOCK.number)).toBe(true)
  expect(state.quoting.failed).toBe(1)
  expect(planDueLegs(state, ctx, req)).toHaveLength(0)
})

test('a revert WITH data fails the leg without negative-caching the pool', async () => {
  const { state, ctx, req, world, index } = fakeSetup()
  const pool = newPool(index, world, T_IN, T_OUT, { kind: 'revert-data' })

  await runToDry(state, ctx, req)

  expect(index.isNegative(pool, BLOCK.number)).toBe(false)
  expect(state.quoting).toEqual({ attempted: 1, succeeded: 0, failed: 1, transportFailed: 0, unattempted: 0 })
})

// ---------------------------------------------------------------------------
// The index bookkeeping the pump owns beyond upsert/negative-cache: the LRU
// touch that keeps a bounded index from evicting what a search is USING, and
// the hint-discredit history that its data-less reverts feed.
//
// Ported from the deleted `waves.test.ts` (`quoteEnumerated touches every
// enumerated candidate leg`, `C4-H4: a junk hint is discredited by the engine's
// own discovery probes failing at two blocks`). The ladders themselves live in
// `poolIndex.test.ts`; what these pin is that the ENGINE actually climbs them —
// the earlier version of the discredit test called `markNegative` by hand and
// passed against an engine whose failing probes recorded nothing at all.
// ---------------------------------------------------------------------------

test('every planned leg is TOUCHED whether or not it prices: a two-hop out-leg that never quotes survives maxPools eviction over an untouched older pool', async () => {
  const world: World = new Map()
  const index = new PoolIndex(WN, { maxPools: 3 })
  const x = X_TOKENS[0]!
  // The in-leg prices (so the out-leg becomes due at mX at all); the out-leg reverts WITH data, the
  // one outcome that writes nothing to the index — no `markSuccess`, no `markNegative`. `touchAll`
  // is therefore the ONLY thing that ever touched it.
  newPool(index, world, T_IN, x, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
  const outLeg = newPool(index, world, x, T_OUT, { kind: 'revert-data' })
  // Unrelated to this trade, touched only by its own creation block — the eviction target.
  const stale = newPool(index, world, addr(0xdd01), addr(0xdd02), { kind: 'price', r0: 1n, r1: 1n })
  expect(index.stats().pools).toBe(3) // at cap, nothing evicted yet: 3 is not > 3

  const fake = fakeModule(world)
  const ctx: PumpCtx = {
    index,
    modules: { v2: fake, v3: fakeModule(world, 'v3'), v4: fakeModule(world, 'v4') },
    manifest: FAKE_MANIFEST,
    hookData: new Map(),
    hints: [],
    client: worldClient(),
  }
  const state = createState(BLOCK, false)
  state.intermediates.selected = [x.toLowerCase()]
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  await runToDry(state, ctx, req)
  expect(composeRoutes(state, ctx, req)).toHaveLength(0) // the out-leg never priced: no route at all

  // A genuinely new pool arrives — the only thing that triggers eviction. The out-leg, touched at
  // this search's pinned block by planning alone, is not the victim; the never-planned pool is.
  newPool(index, world, T_IN, addr(0xdd03), { kind: 'price', r0: 1n, r1: 1n }, BLOCK.number)

  expect(index.stats().pools).toBe(3)
  expect(index.pair(x, T_OUT).some((r) => r.pool.id === outLeg.id)).toBe(true)
  // Evicted — gone, not merely stale: its adjacency entry is cleared with it.
  expect(index.pair(addr(0xdd01), addr(0xdd02))).toEqual([])
  expect(index.pair(addr(0xdd01), addr(0xdd02)).some((r) => r.pool.id === stale.id)).toBe(false)
})

test('the engine\'s own data-less reverts feed the discredit history: two DISTINCT blocks discredit a hinted pool, repeats at one block never do', async () => {
  const factory = addr(0xf)
  const manifest: ChainManifest = { chainId: 1, wrappedNative: WN, v2: { factory, deploymentBlock: 0n } }
  const hint: PoolHint = { protocol: 'v2', token0: T_IN, token1: T_OUT }
  const hinted = v2Ref(computeV2PairAddress(factory, T_IN, T_OUT), T_IN, T_OUT)

  const world: World = new Map()
  world.set(hinted.id, { kind: 'revert' }) // the asserted pool does not exist: a data-less revert
  const index = new PoolIndex(WN)
  // The hint is in the index, at the TOP of the provenance order on nothing but the caller's word —
  // which is the whole reason the discredit ladder exists.
  index.upsert({ pool: hinted, source: 'hint' })
  const fake = fakeModule(world)
  const ctx: PumpCtx = {
    index,
    modules: { v2: fake, v3: fakeModule(world, 'v3'), v4: fakeModule(world, 'v4') },
    manifest,
    hookData: new Map(),
    hints: [hint],
    client: worldClient(),
  }
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }
  const recordOf = (): PoolRecord => index.pair(T_IN, T_OUT).find((r) => r.pool.id === hinted.id)!

  // Ten searches at ONE block — a caller retrying, or ten concurrent requests landing on the same
  // head. None of them may manufacture the evidence two genuinely different blocks must provide.
  for (let i = 0; i < 10; i++) await runToDry(createState(BLOCK, false), ctx, req)
  expect(recordOf().quoteFailureBlocks).toBe(1)
  expect(isDiscredited(recordOf())).toBe(false)

  // One block later the pool is contradicted a second time, with no successful quote to its name.
  // Nothing in this test touched the index's failure history by hand.
  await runToDry(createState({ ...BLOCK, number: BLOCK.number + 1n }, false), ctx, req)
  expect(recordOf().quoteFailureBlocks).toBe(HINT_DISCREDIT_FAILURE_BLOCKS)
  expect(isDiscredited(recordOf())).toBe(true)
  expect(recordOf().source).toBe('hint') // demoted, never rewritten or deleted
})

test('an improved mX invalidates the stale out-leg measurements and re-measures at the new amount', async () => {
  const { state, ctx, req, world, index } = fakeSetup()
  const x = X_TOKENS[0]!
  const weakIn = newPool(index, world, T_IN, x, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 8n })
  const outPool = newPool(index, world, x, T_OUT, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 9n })
  state.intermediates.selected = [x]

  await runToDry(state, ctx, req)
  const weakAmount = state.mX.get(x)!.amount
  expect(state.mX.get(x)!.fromPoolId).toBe(weakIn.id)
  const staleKey = legKey(outPool.id, x.toLowerCase(), weakAmount)
  expect(state.measurements.has(staleKey)).toBe(true)
  const settledBefore = state.legsMeasured

  // Discovery lands a strictly better in-leg pool mid-search (the coverage worker's job).
  const strongIn = newPool(index, world, T_IN, x, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 10n })
  state.indexVersion++
  await runToDry(state, ctx, req)

  const strongAmount = state.mX.get(x)!.amount
  expect(strongAmount).toBeGreaterThan(weakAmount)
  expect(state.mX.get(x)!.fromPoolId).toBe(strongIn.id)
  // The stale ledger entries are gone; the fresh ones sit at the new amount.
  expect(state.measurements.has(staleKey)).toBe(false)
  expect(state.measuredKeys.has(staleKey)).toBe(false)
  expect(state.measurements.has(legKey(outPool.id, x.toLowerCase(), strongAmount))).toBe(true)
  // Quoting counters were NOT rolled back — they count dispatches, which happened.
  expect(state.legsMeasured).toBe(settledBefore + 2) // strong in-leg + re-measured out-leg
  expect(state.quoting.attempted).toBe(state.legsMeasured)

  const composed = composeRoutes(state, ctx, req)
  const twoHop = composed.find((r) => r.route.legs.length === 2)!
  expect(twoHop.quote.intermediateAmounts).toEqual([strongAmount])
  expect(twoHop.route.legs[0]!.pool.id).toBe(strongIn.id)
})

test('an abort mid-round reports unattempted once per key and never re-dispatches them', async () => {
  const { state, ctx, req, world, index } = fakeSetup()
  for (let i = 0; i < 3; i++) newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 9n })
  const controller = new AbortController()
  ctx.semaphore = createSemaphore(1)
  ctx.signal = controller.signal
  const base = ctx.client
  ctx.client = {
    async request(args: unknown) {
      controller.abort() // the deadline fires the instant the first call is served
      return base.request(args as never)
    },
  } as unknown as Pick<PublicClient, 'request'>

  expect(await pump(state, ctx, req)).toBe(true)
  expect(state.quoting.unattempted).toBe(2)
  expect(state.quoting.attempted).toBe(1)

  // The signal is aborted: the pump refuses to dispatch again, so no key can settle 'unattempted' twice.
  expect(await pump(state, ctx, req)).toBe(false)
  expect(state.quoting.unattempted).toBe(2)
})

test('pumpDry tracks knowledge: false before the first plan, true when drained, false again on new inputs', async () => {
  const { state, ctx, req, world, index } = fakeSetup()
  newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 9n })

  expect(pumpDry(state, ctx)).toBe(false)
  await runToDry(state, ctx, req)
  expect(pumpDry(state, ctx)).toBe(true)

  state.indexVersion++ // the index gained pools
  expect(pumpDry(state, ctx)).toBe(false)
  await runToDry(state, ctx, req)
  expect(pumpDry(state, ctx)).toBe(true)

  state.intermediates.selected = [X_TOKENS[0]!] // the frontier advanced
  expect(pumpDry(state, ctx)).toBe(false)
})

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

test('composed quotes: directs verbatim, two-hops exact-chained with intermediateAmounts [mX] and gas sum-or-absent', async () => {
  const { state, ctx, req, world, index } = fakeSetup()
  const x = X_TOKENS[0]!
  const direct = newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n, gas: 7n })
  const inPool = newPool(index, world, T_IN, x, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n, gas: 10n })
  const outWithGas = newPool(index, world, x, T_OUT, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n, gas: 5n })
  const outNoGas = newPool(index, world, x, T_OUT, { kind: 'price', r0: 10n ** 12n, r1: 2n * 10n ** 12n })
  state.intermediates.selected = [x]

  await runToDry(state, ctx, req)
  const composed = composeRoutes(state, ctx, req)

  expect(composed).toHaveLength(3)
  const mx = state.mX.get(x)!
  expect(mx.fromPoolId).toBe(inPool.id)

  const directRoute = composed.find((r) => r.route.legs.length === 1)!
  expect(directRoute.route.legs[0]!.pool.id).toBe(direct.id)
  expect(directRoute.quote.intermediateAmounts).toEqual([])
  expect(directRoute.quote.gasEstimate).toBe(7n)

  const gasRoute = composed.find((r) => r.route.legs[1]?.pool.id === outWithGas.id)!
  expect(gasRoute.quote.gasEstimate).toBe(15n)
  expect(gasRoute.quote.intermediateAmounts).toEqual([mx.amount])
  expect(gasRoute.quote.amountOut).toBe(fatePrice(world.get(outWithGas.id)!, outWithGas, x, mx.amount)!)

  const noGasRoute = composed.find((r) => r.route.legs[1]?.pool.id === outNoGas.id)!
  expect(noGasRoute.quote.gasEstimate).toBeUndefined()

  // Ranked: amountOut descending (rankRoutes; same-protocol unhooked routes, no promotion in play).
  const outs = composed.map((r) => r.quote.amountOut)
  expect([...outs].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))).toEqual(outs)
})

test('a route with any leg negative at the pinned block is excluded from composition', async () => {
  const { state, ctx, req, world, index } = fakeSetup()
  const direct = newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 9n })

  await runToDry(state, ctx, req)
  expect(composeRoutes(state, ctx, req)).toHaveLength(1)

  index.markNegative(direct, BLOCK.number)
  expect(composeRoutes(state, ctx, req)).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

const reservesArb = fc.record({
  r0: fc.bigInt({ min: 1n, max: 10n ** 12n }),
  r1: fc.bigInt({ min: 1n, max: 10n ** 12n }),
})

const priceWorldArb = fc.record({
  amountIn: fc.bigInt({ min: 1n, max: 10n ** 9n }),
  directs: fc.array(reservesArb, { maxLength: 3 }),
  xs: fc.array(
    fc.record({
      inPools: fc.array(reservesArb, { minLength: 1, maxLength: 3 }),
      outPools: fc.array(reservesArb, { minLength: 1, maxLength: 3 }),
    }),
    { maxLength: 3 },
  ),
})

type PriceWorldSpec = typeof priceWorldArb extends fc.Arbitrary<infer T> ? T : never

type BuiltWorld = FakeSetup & { directs: PoolRef[]; xs: { x: Address; inPools: PoolRef[]; outPools: PoolRef[] }[] }

function buildPriceWorld(spec: PriceWorldSpec): BuiltWorld {
  const setup = fakeSetup({ amountIn: spec.amountIn })
  const directs = spec.directs.map((r) => newPool(setup.index, setup.world, T_IN, T_OUT, { kind: 'price', ...r }))
  const xs = spec.xs.map((xSpec, i) => {
    const x = X_TOKENS[i]!
    return {
      x,
      inPools: xSpec.inPools.map((r) => newPool(setup.index, setup.world, T_IN, x, { kind: 'price', ...r })),
      outPools: xSpec.outPools.map((r) => newPool(setup.index, setup.world, x, T_OUT, { kind: 'price', ...r })),
    }
  })
  setup.state.intermediates.selected = xs.map(({ x }) => x.toLowerCase())
  return { ...setup, directs, xs }
}

/** Chained evaluation over EVERY (in, out) combination — the oracle dominance is judged against. */
function bruteBest(built: BuiltWorld, amountIn: bigint): bigint | undefined {
  let best: bigint | undefined
  const consider = (v: bigint) => {
    if (best === undefined || v > best) best = v
  }
  for (const pool of built.directs) consider(fatePrice(built.world.get(pool.id)!, pool, T_IN, amountIn)!)
  for (const { x, inPools, outPools } of built.xs) {
    for (const inPool of inPools) {
      const mid = fatePrice(built.world.get(inPool.id)!, inPool, T_IN, amountIn)!
      for (const outPool of outPools) consider(fatePrice(built.world.get(outPool.id)!, outPool, x, mid)!)
    }
  }
  return best
}

test('property: dominance — the best composed route equals the brute-force best over ALL combinations', async () => {
  await fc.assert(
    fc.asyncProperty(priceWorldArb, async (spec) => {
      const built = buildPriceWorld(spec)
      await runToDry(built.state, built.ctx, built.req)
      const composed = composeRoutes(built.state, built.ctx, built.req)
      const oracle = bruteBest(built, spec.amountIn)
      if (oracle === undefined) {
        expect(composed).toEqual([])
        return
      }
      expect(composed.length).toBeGreaterThan(0)
      expect(composed[0]!.quote.amountOut).toBe(oracle)
    }),
    { numRuns: 60 },
  )
})

test('property: dedup — a full multi-cycle run never issues two identical (pool, direction, amount) calls', async () => {
  await fc.assert(
    fc.asyncProperty(priceWorldArb, async (spec) => {
      const built = buildPriceWorld(spec)
      const allSelected = built.state.intermediates.selected
      // Two frontier phases: half the intermediates first, then all of them — dedup must hold across growth.
      built.state.intermediates.selected = allSelected.slice(0, Math.ceil(allSelected.length / 2))
      await runToDry(built.state, built.ctx, built.req)
      built.state.intermediates.selected = allSelected
      await runToDry(built.state, built.ctx, built.req)
      expect(new Set(built.record).size).toBe(built.record.length)
    }),
    { numRuns: 60 },
  )
})

const fateArb: fc.Arbitrary<Fate> = fc.oneof(
  { weight: 3, arbitrary: reservesArb.map(({ r0, r1 }) => ({ kind: 'price', r0, r1 }) as Fate) },
  { weight: 1, arbitrary: fc.constant<Fate>({ kind: 'revert' }) },
  { weight: 1, arbitrary: fc.constant<Fate>({ kind: 'revert-data' }) },
  { weight: 1, arbitrary: fc.constant<Fate>({ kind: 'transport' }) },
)

const mixedWorldArb = fc.record({
  amountIn: fc.bigInt({ min: 1n, max: 10n ** 9n }),
  directs: fc.array(fateArb, { maxLength: 4 }),
  xs: fc.array(
    fc.record({
      inPools: fc.array(fateArb, { minLength: 1, maxLength: 3 }),
      outPools: fc.array(fateArb, { minLength: 1, maxLength: 3 }),
    }),
    { maxLength: 3 },
  ),
})

let sawRetry = false

test('property: dedup survives the ONE sanctioned duplicate — every leg key is on the wire at most twice, and exactly twice only for transport-fated legs', async () => {
  // The dedup property above runs a world in which nothing is lost to the transport, so it can
  // demand strict uniqueness. A transport loss is the single case the engine deliberately re-asks
  // (`state.ts#applyMeasurement`: the key is released for ONE retry, then the loss is terminal), and
  // it is exactly the case where a rule stated as "never twice" would be wrong and a rule stated as
  // "at most twice" would be too weak — a regression that released EVERY failed key for a retry
  // would satisfy the bound while doubling the call volume of every reverting pool on chain.
  await fc.assert(
    fc.asyncProperty(mixedWorldArb, async (spec) => {
      const setup = fakeSetup({ amountIn: spec.amountIn })
      const transportPools = new Set<string>()
      const add = (a: Address, b: Address, fate: Fate): void => {
        const pool = newPool(setup.index, setup.world, a, b, fate)
        if (fate.kind === 'transport') transportPools.add(pool.id)
      }
      for (const fate of spec.directs) add(T_IN, T_OUT, fate)
      spec.xs.forEach((xSpec, i) => {
        const x = X_TOKENS[i]!
        for (const fate of xSpec.inPools) add(T_IN, x, fate)
        for (const fate of xSpec.outPools) add(x, T_OUT, fate)
      })
      setup.state.intermediates.selected = spec.xs.map((_, i) => X_TOKENS[i]!.toLowerCase())

      await runToDry(setup.state, setup.ctx, setup.req)

      const counts = new Map<string, number>()
      for (const key of setup.record) counts.set(key, (counts.get(key) ?? 0) + 1)
      if ([...counts.values()].some((c) => c === 2)) sawRetry = true
      for (const [key, count] of counts) {
        const poolId = key.split('|')[0]!
        expect(count).toBeLessThanOrEqual(2)
        if (count === 2) expect(transportPools.has(poolId)).toBe(true)
      }
      // `attempted` is the WIRE count, not the settled-key count: a released-then-terminal key
      // settles once while costing two dispatches, so the retry has to show up here too.
      expect(setup.state.quoting.attempted).toBe(setup.record.length)
    }),
    { numRuns: 60 },
  )
  // The bound is only worth stating if the sanctioned duplicate actually occurred somewhere in the
  // run — otherwise a mutant that never retried at all would satisfy every assertion above.
  expect(sawRetry).toBe(true)
})

test('property: conservation — attempted === succeeded + failed + transportFailed over arbitrary outcome mixes', async () => {
  await fc.assert(
    fc.asyncProperty(mixedWorldArb, async (spec) => {
      const setup = fakeSetup({ amountIn: spec.amountIn })
      for (const fate of spec.directs) newPool(setup.index, setup.world, T_IN, T_OUT, fate)
      spec.xs.forEach((xSpec, i) => {
        const x = X_TOKENS[i]!
        for (const fate of xSpec.inPools) newPool(setup.index, setup.world, T_IN, x, fate)
        for (const fate of xSpec.outPools) newPool(setup.index, setup.world, x, T_OUT, fate)
      })
      setup.state.intermediates.selected = spec.xs.map((_, i) => X_TOKENS[i]!.toLowerCase())

      await runToDry(setup.state, setup.ctx, setup.req)

      const q = setup.state.quoting
      expect(q.attempted).toBe(q.succeeded + q.failed + q.transportFailed)
      expect(q.unattempted).toBe(0)
      expect(q.attempted).toBe(setup.record.length) // one dispatch, one call, one outcome
      expect(setup.state.legsMeasured).toBe(setup.state.measuredKeys.size)
    }),
    { numRuns: 60 },
  )
})
