import { expect, test } from 'bun:test'
import fc from 'fast-check'
import type { Address, Hex, PublicClient } from 'viem'
import { zeroHash } from 'viem'

import { HINT_DISCREDIT_FAILURE_BLOCKS, MEASUREMENT_PAIR_CEILING, PUMP_ROUND_CAP } from '../constants'
import { ImplausibleQuoteError, TransportError } from '../errors'
import { toGraphNode } from '../internal/currency'
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
  PoolHint,
  PoolKey,
  PoolRecord,
  PoolRef,
  Protocol,
  QuoteRequest,
} from '../types'

import { buildHookData } from './hookData'
import type { PlannedLeg, PumpCtx } from './pump'
import { composeRoutes, inLegIntermediate, orderedIntermediates, planDueLegs, pump, pumpDry } from './pump'
import type { SearchState } from './state'
import { createState, legKey } from './state'
import type { Fate, World } from './testWorld'
import { addr, fatePrice, fromIdData, idData, newPool } from './testWorld'

// ---------------------------------------------------------------------------
// Fixtures — the scripted constant-product world of `./testWorld.ts` (shared
// with loop.test.ts and coverage.test.ts), served by THIS file's fake modules,
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

const FAKE_MANIFEST: ChainManifest = { chainId: 1, wrappedNative: WN }

/** A ProtocolModule whose quotes are local constant-product math over `world` — measurement
 * outcomes are decided by each pool's scripted fate, never by real protocol encoding. */
function fakeModule(world: World, id: Protocol = 'v2'): ProtocolModule {
  return {
    id,
    enabled: () => true,
    hypotheses: () => [],
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
          // The decode seam's plausibility rejection (`protocols/v3.ts`/`v4.ts`): the quoter
          // answered with a negative-int128 amountOut read as unsigned.
          if (fate.kind === 'implausible') throw new ImplausibleQuoteError(2n ** 128n - 5n)
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

// ---------------------------------------------------------------------------
// The role derivation, pinned against the planner that assigns roles.
//
// `inLegIntermediate` reads a leg's role off its DIRECTION, because a recorded
// outcome carries a `Measurement` and not the planner's `role` — the role says
// why a leg was dispatched, which `applyMeasurement`'s single-writer vocabulary
// deliberately has no slot for. `internal/outcomeLog.ts`'s fold depends on the
// two agreeing exactly: a leg the planner called an in-leg that the derivation
// calls anything else would drop out of the `m_X` fold, and a route composed
// against the wrong `m_X` is a wrong number in a golden nothing else would
// catch. So the equivalence is asserted here, against legs the REAL planner
// produced, rather than argued in a comment next to the fold.
// ---------------------------------------------------------------------------

test('the fold\'s role derivation agrees with the planner on every planned leg, across all three roles', () => {
  const { state, ctx, req, world, index } = fakeSetup()
  const x = X_TOKENS[0]!
  const priced: Fate = { kind: 'price', r0: 10n ** 9n, r1: 10n ** 9n }
  newPool(index, world, T_IN, T_OUT, priced) // direct
  newPool(index, world, T_IN, x, priced) // in-leg for x
  newPool(index, world, x, T_OUT, priced) // out-leg for x
  state.intermediates.selected = [x]
  state.mX.set(x, { amount: 777n, fromPoolId: 'whatever' }) // makes the out-leg due

  const planned = planDueLegs(state, ctx, req)
  const inNode = toGraphNode(req.tokenIn, WN)
  const outNode = toGraphNode(req.tokenOut, WN)

  // Without all three kinds present the equivalence below would hold vacuously.
  expect(new Set(planned.map((p) => p.role.kind))).toEqual(new Set(['direct', 'in', 'out']))

  for (const p of planned) {
    const derived = inLegIntermediate(p.leg, WN, inNode, outNode)
    expect(
      derived !== undefined,
      `${p.leg.pool.id}: planner says role '${p.role.kind}', the derivation says ${derived === undefined ? 'not an in-leg' : `in-leg for ${derived}`}`,
    ).toBe(p.role.kind === 'in')
    if (p.role.kind === 'in') expect(derived).toBe(p.role.x)
  }
})

test("the role derivation survives a native endpoint, where a leg's currency FORM is not its graph node", () => {
  // The case a comparison against `req.tokenIn` rather than against its graph node would get wrong:
  // a v4 pool on a native pair plans legs whose `currencyIn` is the string 'native', while the
  // request's in-node is the wrapped-native ADDRESS. Every leg here is direct, so every one of them
  // must derive as "not an in-leg" — the arm that would otherwise fold direct legs into `m_X`.
  const ctx = realCtx(V4_ONLY)
  const state = createState(BLOCK, false)
  const wn = V4_ONLY.wrappedNative
  const req: QuoteRequest = { tokenIn: 'native', tokenOut: USDC, amountIn: 5n }

  const planned = planDueLegs(state, ctx, req)

  expect(planned.length).toBeGreaterThan(0)
  expect(planned.every((p) => p.leg.currencyIn === 'native')).toBe(true) // the form really does differ
  for (const p of planned) {
    expect(p.role.kind).toBe('direct')
    expect(inLegIntermediate(p.leg, wn, toGraphNode(req.tokenIn, wn), toGraphNode(req.tokenOut, wn))).toBeUndefined()
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
// The intermediates-ordering memo (S1) — wrong caching here silently
// wrong-routes (a stale ordering hides a real intermediate), so growth and
// eviction each pin an invalidation, and a property pins memoized ≡ fresh
// over generated mutation interleavings.
// ---------------------------------------------------------------------------

function ctxOver(index: PoolIndex): PumpCtx {
  const fake = fakeModule(new Map())
  return { index, modules: { v2: fake, v3: fake, v4: fake }, manifest: FAKE_MANIFEST, hookData: new Map(), hints: [], client: worldClient() }
}

test('orderedIntermediates memo: a hit returns the identical list; index growth forces a fresh recompute that sees the new node', () => {
  const { ctx, req, world, index } = fakeSetup()
  const x1 = X_TOKENS[0]!
  newPool(index, world, T_IN, x1)
  newPool(index, world, x1, T_OUT)

  const first = orderedIntermediates(ctx, req)
  expect(first).toContain(x1.toLowerCase())
  // Identity, not mere equality: nothing about the index moved, so this is the memoized list.
  expect(orderedIntermediates(ctx, req)).toBe(first)

  // Growth — an upsert (any caller's) moves `index.version()` and forces a recompute.
  const x2 = X_TOKENS[1]!
  newPool(index, world, T_IN, x2)
  newPool(index, world, x2, T_OUT)
  const grown = orderedIntermediates(ctx, req)
  expect(grown).not.toBe(first)
  expect(grown).toContain(x2.toLowerCase())
})

test('orderedIntermediates memo: a maxPools eviction forces a fresh recompute that no longer offers the evicted intermediate', () => {
  const index = new PoolIndex(WN, { maxPools: 2 })
  const ctx = ctxOver(index)
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1n }
  const x = X_TOKENS[0]!
  const inPool = v2Ref(addr(0xe001), T_IN, x)
  const outPool = v2Ref(addr(0xe002), x, T_OUT)
  index.upsert({ pool: inPool, source: 'event', createdAtBlock: 1n })
  index.upsert({ pool: outPool, source: 'event', createdAtBlock: 2n })

  const before = orderedIntermediates(ctx, req)
  expect(before).toContain(x.toLowerCase())
  expect(orderedIntermediates(ctx, req)).toBe(before) // memo holds while nothing moves

  // A third pool over the cap evicts the least-recently-touched in-pool: x stops being a common
  // neighbor WITHOUT this search's `state.indexVersion` ever moving — the cross-search shrink.
  index.upsert({ pool: v2Ref(addr(0xe003), addr(0xe004), addr(0xe005)), source: 'event', createdAtBlock: 3n })
  const after = orderedIntermediates(ctx, req)
  expect(after).not.toBe(before)
  expect(after).not.toContain(x.toLowerCase())
})

test('property: memoized orderedIntermediates ≡ a fresh computation after every prefix of any index-mutation interleaving', () => {
  const xs = Array.from({ length: 8 }, (_, i) => addr(0xe100 + i))
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          x: fc.integer({ min: 0, max: 7 }),
          // THE LAST THREE ARMS ARE THE ONES THAT DO NOT MOVE `index.version()`. `markSuccess`,
          // `markNegative` and `touchAll` write quote history and LRU touches — none of which the
          // memo's key can see, and none of which the ORDERING depends on directly. What they do
          // change is which pool the NEXT over-cap upsert evicts, so they reach the memo the long
          // way round: a mutation the key ignores, silently re-aiming an eviction the key does
          // notice. Without them the interleaving only ever exercised "version moved / version did
          // not", which is the easy half of the invalidation rule.
          side: fc.constantFrom('in', 'out', 'both', 'unrelated', 'mark-success', 'mark-negative', 'touch'),
          createdAt: fc.bigInt({ min: 1n, max: 40n }),
        }),
        { maxLength: 24 },
      ),
      (ops) => {
        // A small cap so the interleaving generates real evictions, not only growth.
        const index = new PoolIndex(WN, { maxPools: 10 })
        const memoizedCtx = ctxOver(index) // ONE ctx across every prefix — this is the memo under test
        const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1n }
        let nextAddr = 0xe200
        // Every pool ever inserted, so the history/touch arms have real refs to aim at — including
        // refs the cap has since evicted, which those methods must tolerate silently.
        const created: PoolRef[] = []
        const insert = (pool: PoolRef, createdAtBlock: bigint): void => {
          created.push(pool)
          index.upsert({ pool, source: 'event', createdAtBlock })
        }
        for (const op of ops) {
          const x = xs[op.x]!
          if (op.side === 'in' || op.side === 'both') insert(v2Ref(addr(nextAddr++), T_IN, x), op.createdAt)
          if (op.side === 'out' || op.side === 'both') insert(v2Ref(addr(nextAddr++), x, T_OUT), op.createdAt)
          if (op.side === 'unrelated') insert(v2Ref(addr(nextAddr++), addr(0xeff0), addr(0xeff1)), op.createdAt)
          const target = created.length > 0 ? created[op.x % created.length]! : undefined
          if (target !== undefined) {
            if (op.side === 'mark-success') index.markSuccess(target, op.createdAt)
            if (op.side === 'mark-negative') index.markNegative(target, op.createdAt)
            if (op.side === 'touch') index.touchAll([target], op.createdAt)
          }
          // A fresh PumpCtx has no memo entry, so it always computes from the live index.
          expect(orderedIntermediates(memoizedCtx, req)).toEqual(orderedIntermediates(ctxOver(index), req))
        }
      },
    ),
  )
})

test('planDueLegs stops at its checked yield point under an abort', () => {
  const { state, ctx, req, world, index } = fakeSetup()
  // A pathological frontier: hundreds of selected intermediates, each with pools on both sides.
  const selected: string[] = []
  for (let i = 0; i < 200; i++) {
    const x = addr(0xd800 + i)
    newPool(index, world, T_IN, x, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 9n })
    newPool(index, world, x, T_OUT, { kind: 'price', r0: 10n ** 9n, r1: 10n ** 9n })
    selected.push(x.toLowerCase())
  }
  state.intermediates.selected = selected
  const controller = new AbortController()
  ctx.signal = controller.signal
  controller.abort()

  // Planning breaks before the per-intermediate loop does any work: only the direct pair (planned
  // ahead of the yield point) survives, so an abort costs at most one pair's planning.
  const planned = planDueLegs(state, ctx, req)
  expect(planned.every((p) => p.role.kind === 'direct')).toBe(true)
  // What an aborted pump then does with that partial plan (nothing — it refuses to dispatch) is the
  // subject of 'an abort mid-round reports unattempted once per key and never re-dispatches them'
  // below, which asserts it against a round that really was in flight. Restating it here would pin
  // the same guard twice and leave two places to update when it moves.
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

test('a garbage-quoting pool (negative-int128 amountOut) never enters composition while its honest sibling does', async () => {
  const { state, ctx, req, world, index } = fakeSetup()
  const liar = newPool(index, world, T_IN, T_OUT, { kind: 'implausible' })
  const honest = newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })

  await runToDry(state, ctx, req)

  // The lie is rejected at the decode seam, so it can never be a measurement — the honest sibling
  // is the ONLY composed route rather than a runner-up to an absurd 2^128-k winner.
  const routes = composeRoutes(state, ctx, req, 'quote')
  expect(routes).toHaveLength(1)
  expect(routes[0]!.route.legs[0]!.pool.id).toBe(honest.id)
  expect(state.quoting).toEqual({ attempted: 2, succeeded: 1, failed: 1, transportFailed: 0, unattempted: 0 })

  // And it is evidence about the HOOK, not the pool's existence: no negative cache (the pool would
  // otherwise vanish from the very next same-block search) and no discredit history.
  expect(index.isNegative(liar, BLOCK.number)).toBe(false)
  expect(index.pair(T_IN, T_OUT).find((r) => r.pool.id === liar.id)!.quoteFailureBlocks).toBeUndefined()
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
  expect(composeRoutes(state, ctx, req, 'quote')).toHaveLength(0) // the out-leg never priced: no route at all

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

  const composed = composeRoutes(state, ctx, req, 'quote')
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
  const composed = composeRoutes(state, ctx, req, 'quote')

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
  expect(composeRoutes(state, ctx, req, 'quote')).toHaveLength(1)

  index.markNegative(direct, BLOCK.number)
  expect(composeRoutes(state, ctx, req, 'quote')).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

const reservesArb = fc.record({
  r0: fc.bigInt({ min: 1n, max: 10n ** 12n }),
  r1: fc.bigInt({ min: 1n, max: 10n ** 12n }),
})

const pricedFateArb: fc.Arbitrary<Fate> = reservesArb.map((r) => ({ kind: 'price', ...r }))

/**
 * A pool's scripted fate in a generated world: usually a real price, sometimes a revert (C4-T14).
 *
 * WHY REVERTS BELONG IN THE DOMINANCE WORLD. A world where everything prices only ever asks "does the
 * composer pick the maximum?". The interesting claim is the one partial failure creates: when the
 * BEST in-leg to an intermediate reverts, `mX` for that intermediate falls back to the best SURVIVING
 * in-leg, every out-leg is then measured at that smaller amount, and the composed answer has to be
 * the best route through what actually priced — not the unreachable one through the pool that died.
 * The two revert shapes take different paths through the pump and both have to end up invisible: a
 * data-less revert is the pool-absent signal and gets negative-cached (excluded from composition
 * outright, and never re-planned), while a revert WITH data fails only that one leg.
 *
 * `transport` is deliberately NOT generated here. It is a fact about the provider rather than the
 * chain — a leg lost to it is retried and its accounting is what `property: conservation` pins, and
 * mixing it in would make this property's oracle depend on retry timing rather than on prices.
 *
 * Weighted heavily toward `price` so most generated worlds still HAVE a best route to be right about;
 * an all-reverts world is a valid case (the composer must return nothing) but a rare one is enough.
 */
const revertingFateArb: fc.Arbitrary<Fate> = fc.oneof(
  { weight: 8, arbitrary: pricedFateArb },
  { weight: 1, arbitrary: fc.constant<Fate>({ kind: 'revert' }) },
  { weight: 1, arbitrary: fc.constant<Fate>({ kind: 'revert-data' }) },
)

/** The same three fates plus `transport` — used by the dedup/accounting properties below, which are
 * about how many times a leg reaches the wire rather than about what it prices. */
const fateArb: fc.Arbitrary<Fate> = fc.oneof(
  { weight: 3, arbitrary: pricedFateArb },
  { weight: 1, arbitrary: fc.constant<Fate>({ kind: 'revert' }) },
  { weight: 1, arbitrary: fc.constant<Fate>({ kind: 'revert-data' }) },
  { weight: 1, arbitrary: fc.constant<Fate>({ kind: 'transport' }) },
)

/** The generated world shape, over an arbitrary per-pool fate. `priceWorldArb` below is this with
 * every fate forced to `price` — the properties about DEDUP and ACCOUNTING want every leg to reach
 * the wire, which a negative-cached pool by design does not. */
const worldArbOver = (fate: fc.Arbitrary<Fate>, directsMax = 3) =>
  fc.record({
    amountIn: fc.bigInt({ min: 1n, max: 10n ** 9n }),
    directs: fc.array(fate, { maxLength: directsMax }),
    xs: fc.array(
      fc.record({
        inPools: fc.array(fate, { minLength: 1, maxLength: 3 }),
        outPools: fc.array(fate, { minLength: 1, maxLength: 3 }),
      }),
      { maxLength: 3 },
    ),
  })

const priceWorldArb = worldArbOver(pricedFateArb)
const revertingWorldArb = worldArbOver(revertingFateArb)
const mixedWorldArb = worldArbOver(fateArb, 4)

type PriceWorldSpec = typeof priceWorldArb extends fc.Arbitrary<infer T> ? T : never

type BuiltWorld = FakeSetup & { directs: PoolRef[]; xs: { x: Address; inPools: PoolRef[]; outPools: PoolRef[] }[] }

function buildPriceWorld(spec: PriceWorldSpec): BuiltWorld {
  const setup = fakeSetup({ amountIn: spec.amountIn })
  const directs = spec.directs.map((fate) => newPool(setup.index, setup.world, T_IN, T_OUT, fate))
  const xs = spec.xs.map((xSpec, i) => {
    const x = X_TOKENS[i]!
    return {
      x,
      inPools: xSpec.inPools.map((fate) => newPool(setup.index, setup.world, T_IN, x, fate)),
      outPools: xSpec.outPools.map((fate) => newPool(setup.index, setup.world, x, T_OUT, fate)),
    }
  })
  setup.state.intermediates.selected = xs.map(({ x }) => x.toLowerCase())
  return { ...setup, directs, xs }
}

/**
 * Chained evaluation over EVERY (in, out) combination — the oracle dominance is judged against.
 *
 * A pool whose fate is not `price` contributes nothing: `fatePrice` returns undefined for it, and the
 * combination it would have carried is skipped rather than scored. That is the whole partial-failure
 * claim, computed the dumb way — an intermediate whose in-legs ALL revert drops out entirely, and one
 * that loses only its best in-leg is scored through the survivors.
 */
function bruteBest(built: BuiltWorld, amountIn: bigint): bigint | undefined {
  let best: bigint | undefined
  const consider = (v: bigint | undefined) => {
    if (v !== undefined && (best === undefined || v > best)) best = v
  }
  for (const pool of built.directs) consider(fatePrice(built.world.get(pool.id)!, pool, T_IN, amountIn))
  for (const { x, inPools, outPools } of built.xs) {
    for (const inPool of inPools) {
      const mid = fatePrice(built.world.get(inPool.id)!, inPool, T_IN, amountIn)
      if (mid === undefined) continue // this in-leg never priced, so nothing chains off it
      for (const outPool of outPools) consider(fatePrice(built.world.get(outPool.id)!, outPool, x, mid))
    }
  }
  return best
}

test('property: dominance under partial failure — the best composed route equals the brute-force best over everything that actually priced', async () => {
  /** Set on any run where SOME in-leg of a two-hop died while another survived and the world still
   * composed a route — the partial-failure interleaving this property exists for, where `mX` is a
   * survivor's amount. (Deliberately weaker than "the BEST in-leg died": a reverted leg has no
   * hypothetical price to compare against, so "the dead one would have won" is not decidable from
   * the world spec — the guard pins that partial failure was exercised at all, not which leg lost.) */
  let sawSurvivorFallback = false

  await fc.assert(
    fc.asyncProperty(revertingWorldArb, async (spec) => {
      const built = buildPriceWorld(spec)
      await runToDry(built.state, built.ctx, built.req)
      const composed = composeRoutes(built.state, built.ctx, built.req, 'quote')
      const oracle = bruteBest(built, spec.amountIn)

      for (const { inPools } of built.xs) {
        const fates = inPools.map((p) => built.world.get(p.id)!)
        // At least one in-leg died and at least one lived: `mX` is a survivor's amount, not the
        // amount the dead leg would have produced.
        if (fates.some((f) => f.kind !== 'price') && fates.some((f) => f.kind === 'price') && composed.length > 0) {
          sawSurvivorFallback = true
        }
      }

      if (oracle === undefined) {
        expect(composed).toEqual([])
        return
      }
      expect(composed.length).toBeGreaterThan(0)
      expect(composed[0]!.quote.amountOut).toBe(oracle)
    }),
    { numRuns: 200 },
  )

  // Same guard as the dedup property's `sawRetry`: a reverting world that never actually generated a
  // partial failure would let this property pass as the price-only one it replaced (C4-T14).
  expect(sawSurvivorFallback).toBe(true)
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

// ---------------------------------------------------------------------------
// The detached, envelope-granular round (PumpCtx.wake)
// ---------------------------------------------------------------------------

test('a waker detaches the round and applies outcomes per envelope — exactly once, landing the identical ledger the awaited round lands', async () => {
  // Twin worlds: 60 pools (two MULTICALL_CHUNK groups) with a sprinkle of pool-absent reverts,
  // measured once through the awaited path and once through the detached (wake-driven) path. The
  // detached path delivers every outcome TWICE — per settled envelope and again in the round's
  // final return — so equality of the counters is the exactly-once proof: a double-apply would
  // double `quoting.attempted`.
  const build = (): FakeSetup & { bestOut: bigint } => {
    const setup = fakeSetup()
    let bestOut = 0n
    for (let i = 0; i < 60; i++) {
      const fate: Fate = i % 7 === 3 ? { kind: 'revert' } : { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n + BigInt(i) * 10n ** 6n }
      const pool = newPool(setup.index, setup.world, T_IN, T_OUT, fate)
      const out = fatePrice(fate, pool, T_IN, setup.req.amountIn)
      if (out !== undefined && out > bestOut) bestOut = out
    }
    return { ...setup, bestOut }
  }

  const awaited = build()
  await runToDry(awaited.state, awaited.ctx, awaited.req)

  const detached = build()
  let pokes = 0
  detached.ctx.wake = { poke: () => pokes++, next: () => new Promise<void>(() => {}) }
  expect(await pump(detached.state, detached.ctx, detached.req)).toBe(true)
  // Dispatch returned before settlement — that IS the detachment — so drain by yielding.
  for (let i = 0; i < 200 && detached.state.inFlightKeys.size > 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  expect(detached.state.inFlightKeys.size).toBe(0)
  // One poke per settled envelope (2 groups) plus the round's own final settle.
  expect(pokes).toBeGreaterThanOrEqual(3)

  expect(detached.state.quoting).toEqual(awaited.state.quoting)
  expect(detached.state.quoting.attempted).toBe(60)
  expect(detached.state.legsMeasured).toBe(awaited.state.legsMeasured)
  expect(detached.state.measurements.size).toBe(awaited.state.measurements.size)
  expect(pumpDry(detached.state, detached.ctx)).toBe(false) // outcomes arrived — the next cycle must re-plan
  const composed = composeRoutes(detached.state, detached.ctx, detached.req, 'quote')
  expect(composed.length).toBe(composeRoutes(awaited.state, awaited.ctx, awaited.req, 'quote').length)
  expect(composed[0]!.quote.amountOut).toBe(detached.bestOut)
})

test('planning is evidence-first: most recently proven pools head the round, then newest-created, with never-proven after', () => {
  const { state, ctx, req, world, index } = fakeSetup()
  const neverOld = newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 1n, r1: 1n }, 1n)
  const neverNew = newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 1n, r1: 1n }, 5n)
  const provenOnce = newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 1n, r1: 1n }, 2n)
  const provenLatest = newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 1n, r1: 1n }, 3n)
  index.markSuccess(provenOnce, 40n)
  index.markSuccess(provenLatest, 90n)

  const planned = planDueLegs(state, ctx, req)

  // Dispatch order is envelope order (the vanguard is this list's head), so the evidence sort is
  // a latency fact, not cosmetics: last search's winner must sit in the first envelope.
  expect(planned.map((p) => p.leg.pool.id)).toEqual([provenLatest.id, provenOnce.id, neverNew.id, neverOld.id])
})
