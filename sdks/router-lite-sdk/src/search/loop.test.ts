import { expect, test } from 'bun:test'
import type { Address, Hex, Log, PublicClient } from 'viem'
import { encodeAbiParameters } from 'viem'

import { MAX_INTERMEDIATES } from '../constants'
import { RpcUnavailableError } from '../errors'
import providerErrors from '../internal/__fixtures__/providerErrors.json'
import { v2Ref, v4Ref } from '../internal/testing'
import { wave0PairScanBlocks } from '../manifest'
import { PoolIndex } from '../pools/poolIndex'
import { PROTOCOL_MODULES, routeId } from '../protocols'
import type { ProtocolModule } from '../protocols/types'
import { computeV2PairAddress } from '../protocols/v2'
import type {
  ChainManifest,
  CurrencyRef,
  PoolRecord,
  PoolRef,
  Protocol,
  QuoteRequest,
  SwapRequest,
} from '../types'

import type { EngineEvent, SearchContext } from './loop'
import { search } from './loop'

// ---------------------------------------------------------------------------
// The solver loop's behavioral suite — the two tests the whole design was sold
// on sit first:
//
//   * a hinted swap resolves VERIFIED with zero unbounded `eth_getLogs`: the
//     only log scans on the wire are the eager pair-window ones, because the
//     gate (`worker.demandFull()`) never opens while the cheap path is still
//     answering;
//   * abandoning the iterator aborts the in-flight scans: the `finally` owns
//     every source's lifetime, so a consumer that walks away stops paying.
//
// Everything else pins the loop's SEQUENCING: lead-before-gate, seeded
// intermediates, frontier batches, abort between wakes, failed scopes
// terminating instead of spinning, and `final` exactly once and always last.
// The pump/coverage/verifier behaviors themselves are pinned in their own
// suites; nothing here re-tests them.
// ---------------------------------------------------------------------------

const WETH = `0x${'ee'.repeat(20)}` as Address
const T_IN = `0x${'a1'.repeat(20)}` as Address
const T_OUT = `0x${'b2'.repeat(20)}` as Address
const TRADER = `0x${'11'.repeat(20)}` as Address
const UR = `0x${'22'.repeat(20)}` as Address
const PERMIT2 = `0x${'33'.repeat(20)}` as Address
const V2_FACTORY = `0x${'66'.repeat(20)}` as Address
const V4_POOL_MANAGER = `0x${'77'.repeat(20)}` as Address
const V4_QUOTER = `0x${'88'.repeat(20)}` as Address

const V2_TOPIC: Hex = '0xf2'
const V4_TOPIC: Hex = '0xf4'

const HEAD = 1_000_000n
const TS = 1_700_000_000n

/** blastapi's live capture: declares a ten-block cap, below MIN_CHUNK, so `logScanPolicy` gives the
 * range up on the FIRST error — which is what makes a starved scope affordable to test. */
const UNREACHABLE = providerErrors['eth-mainnet.public.blastapi.io'].message

function addr(n: number): Address {
  return `0x${n.toString(16).padStart(40, '0')}` as Address
}

// ---------------------------------------------------------------------------
// A self-contained constant-product world (the same shape as pump.test.ts):
// measurement outcomes are decided by each pool's scripted fate, never by real
// protocol encoding. Compile/encode for swaps IS real (spread off the real v2
// module), so preflight simulates genuine Universal Router calldata.
// ---------------------------------------------------------------------------

type Fate = { kind: 'price'; r0: bigint; r1: bigint } | { kind: 'revert' }
type World = Map<string, Fate>

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

function idData(pool: PoolRef, currencyIn: CurrencyRef, amountIn: bigint): Hex {
  return `0x${Buffer.from(`${pool.id}|${String(currencyIn).toLowerCase()}|${amountIn}`).toString('hex')}` as Hex
}

function worldQuote(world: World, target?: Address): ProtocolModule['encodeQuote'] {
  return (legs, amountIn) => {
    const leg = legs[0]!
    const pool = leg.pool
    const to = target ?? (pool.protocol === 'v4' ? V4_QUOTER : pool.address)
    return {
      call: { to, data: idData(pool, leg.currencyIn, amountIn) },
      decode: () => {
        const fate = world.get(pool.id)
        if (!fate || fate.kind === 'revert') throw new Error('no pool here')
        return { amountOut: fatePrice(fate, pool, leg.currencyIn, amountIn)! }
      },
    }
  }
}

const unused = {
  speculativeDirect: () => [],
  hypotheses: () => [],
  validateHint: async () => null,
  encodeQuote: () => {
    throw new Error('not used')
  },
  compileOperation: () => {
    throw new Error('not used')
  },
} as unknown as Pick<ProtocolModule, 'speculativeDirect' | 'hypotheses' | 'validateHint' | 'encodeQuote' | 'compileOperation'>

const disabledModule = (id: Protocol): ProtocolModule =>
  ({ id, enabled: () => false, adjacencyShape: () => undefined, parsePoolLog: () => null, ...unused }) as ProtocolModule

/** Real v2 module (so `compileOperation` produces genuine UR calldata for preflight) with quoting,
 * discovery, and enumeration re-pointed at the scripted world. */
function fakeV2(world: World): ProtocolModule {
  return {
    ...PROTOCOL_MODULES.v2,
    enabled: (m) => !!m.v2,
    hypotheses: () => [],
    speculativeDirect: () => [],
    adjacencyShape: (m) => (m.v2 ? { emitter: m.v2.factory, topic0: V2_TOPIC, slot: 1, topicAddress: (e: Address) => e } : undefined),
    parsePoolLog: () => null,
    encodeQuote: worldQuote(world),
  }
}

function fakeV4(world: World): ProtocolModule {
  return {
    ...PROTOCOL_MODULES.v4,
    enabled: (m) => !!m.v4,
    hypotheses: () => [],
    speculativeDirect: () => [],
    adjacencyShape: () => undefined,
    exactPair: (a, b, m) => ({
      address: m.v4!.poolManager,
      topics: [V4_TOPIC, String(a).toLowerCase() as Hex, String(b).toLowerCase() as Hex],
    }),
    parsePoolLog: (log) => (log as Log & { record?: PoolRecord }).record ?? null,
    encodeQuote: worldQuote(world, V4_QUOTER),
  }
}

function manifestOf(opts: { v2?: boolean; v4?: boolean }): ChainManifest {
  return {
    chainId: 1,
    wrappedNative: WETH,
    execution: { address: UR, commandSet: 'ur-2.0', permit2: PERMIT2, wrappedNative: WETH },
    coreIntermediates: [WETH],
    ...(opts.v2 === true && { v2: { factory: V2_FACTORY, deploymentBlock: 0n } }),
    ...(opts.v4 === true && { v4: { poolManager: V4_POOL_MANAGER, deploymentBlock: 0n, quoter: V4_QUOTER } }),
  }
}

let nextPoolNumber = 0x9000

function newPool(index: PoolIndex | undefined, world: World, a: Address, b: Address, fate?: Fate, createdAtBlock = 1n): PoolRef {
  const pool = v2Ref(addr(nextPoolNumber++), a, b)
  world.set(pool.id, fate ?? { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
  index?.upsert({ pool, source: 'event', createdAtBlock })
  return pool
}

// ---------------------------------------------------------------------------
// The scripted client: every RPC a search issues, answered from the world and
// a per-test log script, with every `eth_getLogs` classified by SCOPE — the
// pair scan's topic vs the adjacency topic is exactly the distinction the
// zero-unbounded-scan promise is stated in.
// ---------------------------------------------------------------------------

type ServedLog = { scope: 'pair' | 'adjacency' | 'other'; from: bigint; to: bigint }

function makeClient(
  opts: {
    logs?: (q: { from: bigint; to: bigint }) => Log[] | Promise<Log[]>
    preflight?: () => void
  } = {},
): { client: Pick<PublicClient, 'request'>; served: ServedLog[]; preflights: () => number } {
  const served: ServedLog[] = []
  let preflights = 0
  const client = {
    async request(args: { method: string; params: unknown[] }) {
      const { method, params } = args
      if (method === 'eth_getBlockByNumber') {
        return { number: `0x${HEAD.toString(16)}`, hash: `0x${'ab'.repeat(32)}`, timestamp: `0x${TS.toString(16)}` }
      }
      if (method === 'eth_getLogs') {
        const filter = params[0] as { fromBlock: Hex; toBlock: Hex; topics?: unknown[] }
        if (!Array.isArray(filter.topics) || filter.topics.length === 0) throw new Error('eth_getLogs arrived with no topic filter')
        const from = BigInt(filter.fromBlock)
        const to = BigInt(filter.toBlock)
        const topic0 = Array.isArray(filter.topics[0]) ? (filter.topics[0] as string[]) : [filter.topics[0] as string]
        const scope = topic0.includes(V4_TOPIC) ? 'pair' : topic0.includes(V2_TOPIC) ? 'adjacency' : 'other'
        served.push({ scope, from, to })
        return (await opts.logs?.({ from, to })) ?? []
      }
      if (method === 'eth_call') {
        const to = ((params[0] as { to: string }).to ?? '').toLowerCase()
        if (to === UR.toLowerCase()) {
          preflights++
          opts.preflight?.()
          return '0x'
        }
        // The readiness reads: balanceOf/allowance on the token, allowance on Permit2 — all
        // answered "plenty", so a swap's leader is `ready` unless a test scripts otherwise.
        if (to === T_IN.toLowerCase() || to === T_OUT.toLowerCase()) {
          return encodeAbiParameters([{ type: 'uint256' }], [10n ** 30n])
        }
        if (to === PERMIT2.toLowerCase()) {
          return encodeAbiParameters(
            [{ type: 'uint160' }, { type: 'uint48' }, { type: 'uint48' }],
            [10n ** 30n, 2 ** 47, 0],
          )
        }
        return '0x' // a quote — decoded locally by the fake module against the world
      }
      throw new Error(`unexpected RPC method ${String(method)}`)
    },
  } as unknown as Pick<PublicClient, 'request'>
  return { client, served, preflights: () => preflights }
}

function ctxOf(
  client: Pick<PublicClient, 'request'>,
  manifest: ChainManifest,
  world: World,
  opts: { index?: PoolIndex; logChunkBlocks?: bigint } = {},
): SearchContext {
  return {
    client,
    manifest,
    modules: {
      v2: manifest.v2 ? fakeV2(world) : disabledModule('v2'),
      v3: disabledModule('v3'),
      v4: manifest.v4 ? fakeV4(world) : disabledModule('v4'),
    },
    index: opts.index ?? new PoolIndex(WETH),
    hookData: new Map(),
    ...(opts.logChunkBlocks !== undefined && { logChunkBlocks: opts.logChunkBlocks }),
  }
}

const tick = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 0))

async function ticks(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await tick()
}

async function collectAll(gen: AsyncGenerator<EngineEvent>): Promise<EngineEvent[]> {
  const events: EngineEvent[] = []
  for await (const e of gen) events.push(e)
  return events
}

// ---------------------------------------------------------------------------
// THE CONTRACT THE DESIGN WAS SOLD ON, part 1: a hinted swap issues zero
// unbounded log scans. Counted BY SCOPE: the eager pair-window requests are
// allowed; adjacency (and any other full-history) requests are forbidden.
// ---------------------------------------------------------------------------

test('a hinted swap resolves VERIFIED with zero unbounded eth_getLogs — only the eager pair-window scan goes out', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v2: true, v4: true })
  const hinted = v2Ref(computeV2PairAddress(V2_FACTORY, T_IN, T_OUT), T_IN, T_OUT)
  world.set(hinted.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
  const { client, served, preflights } = makeClient()
  const ctx = ctxOf(client, manifest, world)
  const req: SwapRequest = {
    tokenIn: T_IN,
    tokenOut: T_OUT,
    amountIn: 1_000_000n,
    trader: TRADER,
    hints: [{ protocol: 'v2', token0: T_IN, token1: T_OUT }],
  }

  let lead: Extract<EngineEvent, { type: 'lead' }> | undefined
  for await (const e of search(ctx, req, 'swap')) {
    if (e.type === 'final') throw new Error('the search finalized before the hinted leader verified')
    if (e.type === 'lead' && e.ranked[0]!.execution === 'verified') {
      lead = e
      // The getSwap shape: an actionable lead is where the consumer stops pulling.
      break
    }
  }

  expect(lead).toBeDefined()
  expect(lead!.ranked[0]!.route.legs[0]!.pool.id).toBe(hinted.id)
  expect(lead!.state.compiledById.has(routeId(lead!.ranked[0]!.route))).toBe(true)
  expect(preflights()).toBe(1)
  expect(lead!.state.gateOpened).toBe(false)

  // Let anything in flight settle, then judge the whole wire history by scope.
  await ticks(20)
  const window = wave0PairScanBlocks(manifest)
  expect(served.length).toBeGreaterThan(0) // the eager pair scan DID run — the guarantee is scoped, not silent
  for (const scan of served) {
    expect(scan.scope).toBe('pair')
    expect(scan.from >= HEAD - window + 1n).toBe(true)
  }
})

// ---------------------------------------------------------------------------
// THE CONTRACT, part 2: abandoning the iterator aborts the in-flight scans.
// ---------------------------------------------------------------------------

test('abandoning the iterator after the first lead aborts in-flight scans', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v4: true })
  const index = new PoolIndex(WETH)
  // A cheap answer arrives from the index while the eager pair scan (many chunks: logChunkBlocks
  // caps each request at 64 blocks over a ~50k-block window) is still walking.
  const [c0, c1] = [T_IN.toLowerCase(), T_OUT.toLowerCase()].sort() as [Address, Address]
  const pool = v4Ref({ currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: addr(0) })
  world.set(pool.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
  index.upsert({ pool, source: 'event', createdAtBlock: 1n })

  const { client, served } = makeClient({
    logs: async () => {
      await tick() // every chunk costs a macrotask, so the walk cannot outrun the abort
      return []
    },
  })
  const ctx = ctxOf(client, manifest, world, { index, logChunkBlocks: 64n })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  for await (const e of search(ctx, req, 'quote')) {
    if (e.type === 'lead') break // abandon: the for-await's break calls gen.return()
  }

  await ticks(30) // whatever was already dispatched settles
  const afterAbort = served.length
  const totalChunks = Number(wave0PairScanBlocks(manifest) / 64n)
  expect(afterAbort).toBeLessThan(totalChunks / 2) // the walk stopped far short of the window
  await ticks(30)
  expect(served.length).toBe(afterAbort) // and nothing new goes out after the abort settles
})

// ---------------------------------------------------------------------------
// Sequencing: lead before gate, seeded intermediates, frontier batches
// ---------------------------------------------------------------------------

test('a consumer that stops pulling after the first lead never opens the gate', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const index = new PoolIndex(WETH)
  newPool(index, world, T_IN, T_OUT)
  const { client, served } = makeClient()
  const ctx = ctxOf(client, manifest, world, { index })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  let sawLead = false
  for await (const e of search(ctx, req, 'quote')) {
    if (e.type === 'lead') {
      sawLead = true
      expect(e.state.gateOpened).toBe(false)
      break
    }
  }

  expect(sawLead).toBe(true)
  await ticks(20)
  expect(served.filter((s) => s.scope === 'adjacency')).toHaveLength(0)
})

test('the first lead precedes gate opening on a hinted pair, and final is exactly once and last', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v2: true, v4: true })
  const hinted = v2Ref(computeV2PairAddress(V2_FACTORY, T_IN, T_OUT), T_IN, T_OUT)
  world.set(hinted.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
  const { client } = makeClient()
  const ctx = ctxOf(client, manifest, world)
  const req: QuoteRequest = {
    tokenIn: T_IN,
    tokenOut: T_OUT,
    amountIn: 1_000_000n,
    hints: [{ protocol: 'v2', token0: T_IN, token1: T_OUT }],
  }

  // `state` is live — snapshot the gate at the moment each event is received.
  const seen: { type: EngineEvent['type']; gateOpened: boolean }[] = []
  for await (const e of search(ctx, req, 'quote')) seen.push({ type: e.type, gateOpened: e.state.gateOpened })

  const firstLead = seen.findIndex((e) => e.type === 'lead')
  expect(firstLead).toBeGreaterThanOrEqual(0)
  expect(seen[firstLead]!.gateOpened).toBe(false)

  const finals = seen.filter((e) => e.type === 'final')
  expect(finals).toHaveLength(1)
  expect(seen[seen.length - 1]!.type).toBe('final')
  expect(seen[seen.length - 1]!.gateOpened).toBe(true) // the consumer kept pulling, so the search widened
})

test('intermediates are seeded before the first pump cycle: a cold two-hop leads while the gate is still shut', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const index = new PoolIndex(WETH)
  // No direct pool: the ONLY route is T_IN -> WETH -> T_OUT, and WETH is eligible purely as a
  // manifest core. Without seeding, the frontier only grows at the first dry cycle — which also
  // opens the gate, so `gateOpened === false` at the lead is the seeding, observed.
  newPool(index, world, T_IN, WETH)
  newPool(index, world, WETH, T_OUT)
  const { client } = makeClient()
  const ctx = ctxOf(client, manifest, world, { index })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  for await (const e of search(ctx, req, 'quote')) {
    if (e.type === 'lead') {
      expect(e.ranked[0]!.route.legs).toHaveLength(2)
      expect(e.state.gateOpened).toBe(false)
      expect(e.state.intermediates.selected).toContain(WETH.toLowerCase())
      break
    }
    if (e.type === 'final') throw new Error('no lead before final')
  }
})

test('the intermediates frontier advances by MAX_INTERMEDIATES per dry cycle and reaches everything eligible', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const index = new PoolIndex(WETH)
  newPool(index, world, T_IN, T_OUT)
  // MAX_INTERMEDIATES + 3 eligible X nodes (plus WETH the core): more than one batch.
  const xs: Address[] = []
  for (let i = 0; i < MAX_INTERMEDIATES + 3; i++) {
    const x = addr(0xc100 + i)
    xs.push(x)
    newPool(index, world, T_IN, x, undefined, BigInt(i + 1))
    newPool(index, world, x, T_OUT, undefined, BigInt(i + 1))
  }
  const discovered = xs.length + 1 // + WETH, the core
  const { client } = makeClient()
  const ctx = ctxOf(client, manifest, world, { index })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  const selectedAt: number[] = []
  const events: EngineEvent[] = []
  for await (const e of search(ctx, req, 'quote')) {
    selectedAt.push(e.state.intermediates.selected.length)
    events.push(e)
  }

  expect(selectedAt[0]).toBe(MAX_INTERMEDIATES) // the seed batch, in place before anything was measured
  const final = events[events.length - 1]!
  expect(final.type).toBe('final')
  expect(final.state.intermediates.discovered).toBe(discovered)
  expect(final.state.intermediates.selected.length).toBe(discovered) // frontier reached the eligible limit
  expect(final.state.intermediates.notch).toBe(2) // one seed batch + one advance
  expect(events.filter((e) => e.type === 'final')).toHaveLength(1)
})

// ---------------------------------------------------------------------------
// Termination: converged, aborted, and settled-with-failure
// ---------------------------------------------------------------------------

test('a full pull-to-completion run converges: coverage complete, one final, sources settled', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const index = new PoolIndex(WETH)
  newPool(index, world, T_IN, T_OUT)
  const { client, served } = makeClient()
  const ctx = ctxOf(client, manifest, world, { index })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  const events = await collectAll(search(ctx, req, 'quote'))

  const final = events[events.length - 1]!
  expect(final.type).toBe('final')
  expect(events.filter((e) => e.type === 'final')).toHaveLength(1)
  if (final.type !== 'final') throw new Error('unreachable')
  expect(final.ranked.length).toBeGreaterThan(0)
  expect(final.state.gateOpened).toBe(true)
  expect(final.state.aborted).toBe(false)
  expect(final.state.discovery.v2.failed).toBe(false)
  expect(final.state.discovery.v2.complete.has(T_IN.toLowerCase())).toBe(true)
  expect(final.state.discovery.v2.complete.has(T_OUT.toLowerCase())).toBe(true)
  expect(served.filter((s) => s.scope === 'adjacency').length).toBeGreaterThan(0) // the gate really opened
})

test('a worker settled with failures terminates the search instead of spinning it', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const index = new PoolIndex(WETH)
  newPool(index, world, T_IN, T_OUT)
  const { client } = makeClient({
    logs: () => {
      throw new Error(UNREACHABLE) // every scan starved: a cap below MIN_CHUNK, no retries
    },
  })
  const ctx = ctxOf(client, manifest, world, { index })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  const events = await collectAll(search(ctx, req, 'quote'))

  const final = events[events.length - 1]!
  expect(final.type).toBe('final')
  if (final.type !== 'final') throw new Error('unreachable')
  expect(final.state.discovery.v2.failed).toBe(true) // the report's failed axis carries the honesty
  expect(final.ranked.length).toBeGreaterThan(0) // the best-so-far still rides out
  expect(events.filter((e) => e.type === 'final')).toHaveLength(1)
})

test('an abort between wakes emits a final with aborted: true and the best-so-far', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const index = new PoolIndex(WETH)
  const pool = newPool(index, world, T_IN, T_OUT)
  const { client } = makeClient()
  const ctx = ctxOf(client, manifest, world, { index })
  const controller = new AbortController()
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n, signal: controller.signal }

  const gen = search(ctx, req, 'quote')
  const first = await gen.next()
  expect(first.done).toBe(false)
  expect(first.value!.type).toBe('lead')

  controller.abort()

  const second = await gen.next()
  expect(second.done).toBe(false)
  expect(second.value!.type).toBe('final')
  if (second.value!.type !== 'final') throw new Error('unreachable')
  expect(second.value!.state.aborted).toBe(true)
  expect(second.value!.ranked[0]!.route.legs[0]!.pool.id).toBe(pool.id)

  const third = await gen.next()
  expect(third.done).toBe(true)
})

// ---------------------------------------------------------------------------
// The eager slice and the error contract
// ---------------------------------------------------------------------------

test('a pool only the eager pair scan can find still routes', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v4: true })
  const [c0, c1] = [T_IN.toLowerCase(), T_OUT.toLowerCase()].sort() as [Address, Address]
  const pool = v4Ref({ currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: addr(0) })
  world.set(pool.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
  const createdAt = HEAD - 10n
  const initializeLog = {
    address: V4_POOL_MANAGER,
    topics: [V4_TOPIC],
    data: '0x',
    blockNumber: createdAt,
    record: { pool, createdAtBlock: createdAt, source: 'event' },
  } as unknown as Log
  const { client } = makeClient({
    logs: ({ from, to }) => (from <= createdAt && createdAt <= to ? [initializeLog] : []),
  })
  const ctx = ctxOf(client, manifest, world) // an EMPTY index: only the scan can surface the pool
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  for await (const e of search(ctx, req, 'quote')) {
    if (e.type === 'lead') {
      expect(e.ranked[0]!.route.legs[0]!.pool.id).toBe(pool.id)
      break
    }
    if (e.type === 'final') throw new Error('the scanned pool never led')
  }
})

test('RpcUnavailableError from the pinned-block fetch propagates', async () => {
  const failing = {
    request: async () => {
      throw new Error('connection refused')
    },
  } as unknown as Pick<PublicClient, 'request'>
  const ctx = ctxOf(failing, manifestOf({ v2: true }), new Map())
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  expect(search(ctx, req, 'quote').next()).rejects.toThrow(RpcUnavailableError)
})
