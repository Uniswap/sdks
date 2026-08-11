import { expect, test } from 'bun:test'
import fc from 'fast-check'
import type { Address, Hex, Log, PublicClient } from 'viem'
import { encodeAbiParameters } from 'viem'

import { DEFAULT_CONCURRENCY, INTERMEDIATES_BATCH, PUMP_VANGUARD_LEGS, SCAN_CHUNK_CONCURRENCY } from '../constants'
import { RpcUnavailableError } from '../errors'
import providerErrors from '../internal/__fixtures__/providerErrors.json'
import { v2Ref, v3Ref, v4Ref } from '../internal/testing'
import { eagerPairScanBlocks } from '../manifest'
import { PoolIndex } from '../pools/poolIndex'
import { PROTOCOL_MODULES, routeId } from '../protocols'
import type { ProtocolModule } from '../protocols/types'
import { computeV2PairAddress } from '../protocols/v2'
import type {
  ChainManifest,
  CurrencyRef,
  PoolRecord,
  PoolRef,
  QuoteRequest,
  SwapRequest,
} from '../types'

import type { EngineEvent, SearchContext } from './loop'
import { search } from './loop'
import type { Fate, World } from './testWorld'
import { addr, disabledModule, fatePrice, fromIdData, idData, newPool } from './testWorld'

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
const V3_FACTORY = `0x${'55'.repeat(20)}` as Address
const V3_QUOTER = `0x${'44'.repeat(20)}` as Address
const V4_POOL_MANAGER = `0x${'77'.repeat(20)}` as Address
const V4_QUOTER = `0x${'88'.repeat(20)}` as Address

const V2_TOPIC: Hex = '0xf2'
const V3_TOPIC: Hex = '0xf3'
const FEE_TOPIC: Hex = '0xfee0'
const V4_TOPIC: Hex = '0xf4'

/** The one tier the v3 fake ever hypothesizes about UNPROMPTED — anything else has to be discovered
 * from a `FeeAmountEnabled` log, which is what makes a governance-enabled tier unguessable here. */
const DISCOVERED_FEE = 250

const HEAD = 1_000_000n
const TS = 1_700_000_000n

/** blastapi's live capture: declares a ten-block cap, below MIN_CHUNK, so `logScanPolicy` gives the
 * range up on the FIRST error — which is what makes a starved scope affordable to test. */
const UNREACHABLE = providerErrors['eth-mainnet.public.blastapi.io'].message

// ---------------------------------------------------------------------------
// The scripted constant-product world is `./testWorld.ts`, shared with
// pump.test.ts and coverage.test.ts: measurement outcomes are decided by each
// pool's scripted fate, never by real protocol encoding. The fake MODULES below
// are this file's own — compile/encode for swaps IS real here (spread off the
// real v2 module), so preflight simulates genuine Universal Router calldata.
// ---------------------------------------------------------------------------

function worldQuote(world: World, target?: Address): ProtocolModule['encodeQuote'] {
  return (legs, amountIn) => {
    const leg = legs[0]!
    const pool = leg.pool
    const to = target ?? (pool.protocol === 'v4' ? V4_QUOTER : pool.address)
    return {
      call: { to, data: idData(pool, leg.currencyIn, amountIn) },
      decode: () => {
        const fate = world.get(pool.id)
        const amountOut = fate && fatePrice(fate, pool, leg.currencyIn, amountIn)
        // Nothing here scripts a fate past `price`/`revert`, so an absent price IS the data-less
        // revert shape — the pool-absent, amount-independent one.
        if (amountOut === undefined) throw new Error('no pool here')
        return { amountOut }
      },
    }
  }
}

/** Real v2 module (so `compileOperation` produces genuine UR calldata for preflight) with quoting,
 * discovery, and enumeration re-pointed at the scripted world. */
function fakeV2(world: World): ProtocolModule {
  return {
    ...PROTOCOL_MODULES.v2,
    enabled: (m) => !!m.v2,
    hypotheses: () => [],
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
    adjacencyShape: () => undefined,
    exactPair: (a, b, m) => ({
      address: m.v4!.poolManager,
      topics: [V4_TOPIC, String(a).toLowerCase() as Hex, String(b).toLowerCase() as Hex],
    }),
    parsePoolLog: (log) => (log as Log & { record?: PoolRecord }).record ?? null,
    encodeQuote: worldQuote(world, V4_QUOTER),
  }
}

/**
 * A v3-shaped fake carrying the one thing no other module here has: a FEE-FACTORY SCOPE. Its
 * `hypotheses` derive a pool ONLY for tiers it is handed (`index.enabledFees`), so a pool on a
 * governance-enabled tier is unreachable until the fee scan finds the enabling log — which is what
 * makes both the fee-arm assertions below real: pre-gate the scope must not go out at all, and
 * post-gate it must reach a pool nothing would have guessed.
 */
function fakeV3(world: World): ProtocolModule {
  return {
    ...PROTOCOL_MODULES.v3,
    enabled: (m) => !!m.v3,
    hypotheses: (a, b, _m, extraFees = []) =>
      extraFees.map((fee) => v3Ref(addr(0x3000 + fee), resolveAddress(a), resolveAddress(b), fee)),
    adjacencyShape: (m) => (m.v3 ? { emitter: m.v3.factory, topic0: V3_TOPIC, slot: 1, topicAddress: (e: Address) => e } : undefined),
    feeDiscovery: {
      query: (m) => ({ address: m.v3!.factory, topics: [FEE_TOPIC] }),
      feesFromLogs: (logs) => logs.map((l) => (l as Log & { fee?: number }).fee).filter((f): f is number => f !== undefined),
    },
    parsePoolLog: () => null,
    encodeQuote: worldQuote(world, V3_QUOTER),
  }
}

function resolveAddress(c: CurrencyRef): Address {
  return c === 'native' ? WETH : (c as Address)
}

function manifestOf(opts: { v2?: boolean; v3?: boolean; v4?: boolean }): ChainManifest {
  return {
    chainId: 1,
    wrappedNative: WETH,
    execution: { address: UR, commandSet: 'ur-2.0', permit2: PERMIT2, wrappedNative: WETH },
    coreIntermediates: [WETH],
    ...(opts.v2 === true && { v2: { factory: V2_FACTORY, deploymentBlock: 0n } }),
    ...(opts.v3 === true && { v3: { factory: V3_FACTORY, deploymentBlock: 0n, v3QuoterV2: V3_QUOTER } }),
    ...(opts.v4 === true && { v4: { poolManager: V4_POOL_MANAGER, deploymentBlock: 0n, quoter: V4_QUOTER } }),
  }
}

// ---------------------------------------------------------------------------
// The scripted client: every RPC a search issues, answered from the world and
// a per-test log script, with every `eth_getLogs` classified by SCOPE — the
// pair scan's topic vs the adjacency topic is exactly the distinction the
// zero-unbounded-scan promise is stated in.
// ---------------------------------------------------------------------------

type ServedLog = { scope: 'pair' | 'adjacency' | 'fee' | 'other'; from: bigint; to: bigint }

type Wire = {
  client: Pick<PublicClient, 'request'>
  /** Every `eth_getLogs` PUT ON THE WIRE, recorded before the script is consulted — so a request
   * that is dispatched and never comes back is still here. */
  served: ServedLog[]
  /** Every `eth_getLogs` that ANSWERED. The difference from {@link served} is exactly what is in
   * flight and unfinished, which is the claim the eager slice's whole design rests on. */
  completed: ServedLog[]
  /** Quotes served and log queries COMPLETED, in the order they happened. Only an ordering can say
   * the first price was not sequenced behind a log query. */
  timeline: ('quote' | 'getLogs')[]
  /** One entry per quote `eth_call`, decoded back to its `pool|currencyIn|amount` identity — the
   * wire record the loop-level dedup property counts. */
  quotes: string[]
  preflights: () => number
}

function makeClient(
  opts: {
    logs?: (q: { from: bigint; to: bigint; scope: ServedLog['scope'] }) => Log[] | Promise<Log[]>
    preflight?: () => void | Promise<void>
    /** Runs while a quote is on the wire, keyed by its `pool|currencyIn|amount` identity. Awaited,
     * so a test can decide the ORDER two concurrent measurements answer in — and it is the seam a
     * deadline lands on mid-search rather than between events. */
    onQuote?: (key: string) => void | Promise<void>
  } = {},
): Wire {
  const served: ServedLog[] = []
  const completed: ServedLog[] = []
  const timeline: ('quote' | 'getLogs')[] = []
  const quotes: string[] = []
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
        const scope: ServedLog['scope'] = topic0.includes(V4_TOPIC)
          ? 'pair'
          : topic0.includes(FEE_TOPIC)
            ? 'fee'
            : topic0.includes(V2_TOPIC) || topic0.includes(V3_TOPIC)
              ? 'adjacency'
              : 'other'
        const entry: ServedLog = { scope, from, to }
        served.push(entry)
        const logs = (await opts.logs?.({ from, to, scope })) ?? []
        completed.push(entry)
        timeline.push('getLogs')
        return logs
      }
      if (method === 'eth_call') {
        const to = ((params[0] as { to: string }).to ?? '').toLowerCase()
        if (to === UR.toLowerCase()) {
          preflights++
          await opts.preflight?.()
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
        const key = fromIdData(((params[0] as { data?: Hex }).data ?? '0x') as Hex)
        await opts.onQuote?.(key)
        quotes.push(key)
        timeline.push('quote')
        return '0x' // a quote — decoded locally by the fake module against the world
      }
      throw new Error(`unexpected RPC method ${String(method)}`)
    },
  } as unknown as Pick<PublicClient, 'request'>
  return { client, served, completed, timeline, quotes, preflights: () => preflights }
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
      v3: manifest.v3 ? fakeV3(world) : disabledModule('v3'),
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
  // v3 is enabled purely for its FEE-FACTORY scope: fee-enablement history is the other full-history
  // scan `demandFull` opens, and it is the arm a "no unbounded scans" claim stated only over
  // adjacency would miss entirely. Pre-gate it must not go out either.
  const manifest = manifestOf({ v2: true, v3: true, v4: true })
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
  const window = eagerPairScanBlocks(manifest)
  expect(served.length).toBeGreaterThan(0) // the eager pair scan DID run — the guarantee is scoped, not silent
  for (const scan of served) {
    expect(scan.scope).toBe('pair')
    expect(scan.from >= HEAD - window + 1n).toBe(true)
  }
  // Named separately from the loop above so a regression that opened the fee arm alone fails with
  // the fee arm's name on it rather than as one anonymous scope mismatch.
  expect(served.filter((s) => s.scope === 'fee')).toHaveLength(0)
  expect(served.filter((s) => s.scope === 'adjacency')).toHaveLength(0)
})

test('without the hint, the same unguessable pool never leads — the fast path is the hint, not luck', async () => {
  // The control for the test above, and the only thing that makes its `verified` mean anything: the
  // hinted pool sits at an address no module here derives, so with `hints` removed the search can
  // reach it through nothing at all and must say so rather than finding it another way.
  const world: World = new Map()
  const manifest = manifestOf({ v2: true, v3: true, v4: true })
  const hinted = v2Ref(computeV2PairAddress(V2_FACTORY, T_IN, T_OUT), T_IN, T_OUT)
  world.set(hinted.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
  const { client } = makeClient()
  const ctx = ctxOf(client, manifest, world)
  const req: SwapRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n, trader: TRADER }

  const events = await collectAll(search(ctx, req, 'swap'))

  expect(events.filter((e) => e.type === 'lead')).toHaveLength(0)
  const final = events[events.length - 1]!
  expect(final.type).toBe('final')
  if (final.type !== 'final') throw new Error('unreachable')
  expect(final.ranked).toHaveLength(0)
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
  // The bound is derived from the WALK, not from the window: the abort lands within a couple of
  // macrotasks of the first lead, and the walk advances at most `SCAN_CHUNK_CONCURRENCY` chunks per
  // macrotask, so a working abort stops after a handful of rounds' worth. Half the window (787
  // chunks here) would also pass if the abort merely halved the walk instead of ending it.
  expect(afterAbort).toBeLessThan(8 * SCAN_CHUNK_CONCURRENCY)
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

test('the intermediates frontier advances by INTERMEDIATES_BATCH per dry cycle and reaches everything eligible', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const index = new PoolIndex(WETH)
  newPool(index, world, T_IN, T_OUT)
  // INTERMEDIATES_BATCH + 3 eligible X nodes (plus WETH the core): more than one batch.
  const xs: Address[] = []
  for (let i = 0; i < INTERMEDIATES_BATCH + 3; i++) {
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

  expect(selectedAt[0]).toBe(INTERMEDIATES_BATCH) // the seed batch, in place before anything was measured
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

test('an in-flight preflight holds off final even with every source settled, the pump dry and the frontier complete', async () => {
  // THE TERMINATION GATE'S THIRD CONJUNCT, ISOLATED. Every other test that verifies a swap does so
  // while the coverage worker is still walking, so `sources.settled()` carries the wait and the
  // verifier's own quietness reading is never load-bearing: drop `verifierIdle` from the check and
  // they all still pass. This world arranges the one arrangement where it is the ONLY thing left —
  // the pool arrives on the FULL adjacency scan (created far below the eager window, so nothing
  // cheap can find it), which means the gate is already open and coverage has already reported and
  // settled by the time that pool is priced and its preflight goes out. At that moment the search
  // is quiet on every axis but one, and terminating would hand the caller an `unverified` leader
  // whose verdict was one round trip away.
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const created = 1_000n // far below HEAD - eagerPairScanBlocks: unreachable until the gate opens
  expect(created < HEAD - eagerPairScanBlocks(manifest)).toBe(true)
  const pool = newPool(undefined, world, T_IN, T_OUT, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
  const poolLog = {
    address: V2_FACTORY,
    topics: [V2_TOPIC],
    data: '0x',
    blockNumber: created,
    record: { pool, createdAtBlock: created, source: 'event' },
  } as unknown as Log

  let releasePreflight!: () => void
  const held = new Promise<void>((resolve) => (releasePreflight = resolve))
  const { client, preflights } = makeClient({
    logs: ({ from, to }) => (from <= created && created <= to ? [poolLog] : []),
    // The discovered pool's price lands several macrotasks after the chunk that found it, so the
    // coverage source has genuinely finished its no-progress pass before the verifier has anything
    // to simulate — the preflight is then the last thing on the wire, not one of two.
    onQuote: () => ticks(6),
    preflight: () => held, // genuinely on the wire, and not coming back until this test says so
  })
  const ctx = ctxOf(client, manifest, world)
  ctx.modules = {
    ...ctx.modules,
    v2: { ...ctx.modules.v2, parsePoolLog: (log) => (log as Log & { record?: PoolRecord }).record ?? null },
  }
  const req: SwapRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n, trader: TRADER }

  const events: EngineEvent[] = []
  const walked = (async () => {
    for await (const e of search(ctx, req, 'swap')) events.push(e)
  })()

  await ticks(60)
  expect(preflights()).toBe(1) // the simulation really is out...
  const midway = events[events.length - 1]!
  expect(midway.state.gateOpened).toBe(true) // ...and the gate really did open, so coverage settled
  expect(midway.state.intermediates.selected.length).toBeGreaterThanOrEqual(midway.state.intermediates.discovered)
  expect(events.filter((e) => e.type === 'final')).toHaveLength(0) // nothing quiet enough to end on

  releasePreflight()
  await walked

  const final = events[events.length - 1]!
  expect(final.type).toBe('final')
  if (final.type !== 'final') throw new Error('unreachable')
  expect(events.filter((e) => e.type === 'final')).toHaveLength(1)
  // The verdict the held call bought — not the `unverified` a premature final would have shipped.
  expect(final.ranked[0]!.execution).toBe('verified')
  expect(final.ranked[0]!.route.legs[0]!.pool.id).toBe(pool.id)
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

test('a mid-search abort on a pathological world (hundreds of intermediates, thousands of pools) reaches final within bounded ticks', async () => {
  // The S1 regression shape: a warm, dense index whose frontier discovers hundreds of eligible
  // intermediates with thousands of pools behind them. Before the intermediates-ordering memo and
  // planning's checked yield point, every settled envelope re-ran an O(index) planning walk, so an
  // abort could sit behind tens of seconds of synchronous work before the loop's between-cycle
  // check ever saw it (live: 10s budgets finishing at 44-325s). The tick race below is the hang
  // detector: final must arrive within a bounded number of macrotasks of the abort, not after the
  // backlog drains at its own pace.
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const index = new PoolIndex(WETH)
  const direct = newPool(index, world, T_IN, T_OUT)
  for (let i = 0; i < 250; i++) {
    const x = addr(0xa000 + i)
    for (let j = 0; j < 4; j++) {
      newPool(index, world, T_IN, x)
      newPool(index, world, x, T_OUT)
    }
  }
  const { client } = makeClient()
  const controller = new AbortController()
  const ctx = ctxOf(client, manifest, world, { index })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n, signal: controller.signal }

  const gen = search(ctx, req, 'quote')
  const first = await gen.next()
  expect(first.done).toBe(false)
  expect(first.value!.type).toBe('lead') // the search is live and mid-frontier: 2,001 pools, 250 intermediates discovered

  controller.abort()

  // The drain may emit bounded progress events (the abort flag moves the report; unattempted
  // settlements move it again) — what is being pinned is that FINAL lands within the tick budget.
  const drained = await Promise.race([
    (async () => {
      for await (const e of gen) if (e.type === 'final') return e
      throw new Error('the iterator ended without a final')
    })(),
    ticks(100).then(() => 'hung' as const),
  ])
  expect(drained).not.toBe('hung')
  if (drained === 'hung') throw new Error('unreachable')
  expect(drained.state.aborted).toBe(true)
  // The abort kept what the wire already paid for — the direct route is still the answer.
  expect(drained.ranked[0]!.route.legs[0]!.pool.id).toBe(direct.id)
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

test('the first lead carries the RANKED leader, not whichever measurement answered first', async () => {
  // The caller is being told what the search WOULD lead with, so it must be the ranked winner.
  // Handing over the first measurement to land reports a route the very next line of the same
  // search already disagrees with — and arrival order is decided by the provider, not by the engine.
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const index = new PoolIndex(WETH)
  const worse = newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
  const better = newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n ** 12n, r1: 5n * 10n ** 12n })
  const { client, quotes } = makeClient({
    // Both legs go out in one round; the BETTER pool's answer is held a macrotask, so the worse one
    // is what a first-to-land rule would announce.
    onQuote: async (key) => {
      if (key.startsWith(better.id)) await tick()
    },
  })
  const ctx = ctxOf(client, manifest, world, { index })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  for await (const e of search(ctx, req, 'quote')) {
    if (e.type === 'lead') {
      expect(quotes[0]).toContain(worse.id) // the worse pool really did answer first
      expect(e.ranked[0]!.route.legs[0]!.pool.id).toBe(better.id)
      break
    }
    if (e.type === 'final') throw new Error('no lead before final')
  }
})

test('a search that prices nothing never emits a lead — only a final', async () => {
  // The latch is on the RANKED SET becoming non-empty, not on a quoting call returning: every pool
  // below is known, measured, and useless, so the search does plenty of work and announces none of it.
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const index = new PoolIndex(WETH)
  for (let i = 0; i < 3; i++) newPool(index, world, T_IN, T_OUT, { kind: 'revert' })
  const { client, quotes } = makeClient()
  const ctx = ctxOf(client, manifest, world, { index })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  const events = await collectAll(search(ctx, req, 'quote'))

  expect(quotes.length).toBeGreaterThan(0) // it really quoted — the silence is about the outcome
  expect(events.filter((e) => e.type === 'lead')).toHaveLength(0)
  const final = events[events.length - 1]!
  expect(final.type).toBe('final')
  if (final.type !== 'final') throw new Error('unreachable')
  expect(final.ranked).toHaveLength(0)
  expect(final.state.quoting.succeeded).toBe(0)
  expect(final.state.quoting.failed).toBeGreaterThan(0)
})

// ---------------------------------------------------------------------------
// The eager slice, in TIME: dispatched-and-unfinished, and the ordering claim.
//
// Ported from the deleted `waves.test.ts` C5-B block. The wave engine awaited
// its probes and its pair scan under one `Promise.all`, so a hinted route sat
// finished in memory for as long as a timeout-shaped endpoint took to give up.
// The event loop cannot reintroduce that by construction — but it can
// reintroduce it by ACCIDENT (a source awaited before the first pump cycle), and
// only a scan that never lands can tell the two apart.
// ---------------------------------------------------------------------------

test('a pair scan that never lands cannot gate the first lead — a hinted swap verifies with the scan still in flight', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v2: true, v4: true })
  const hinted = v2Ref(computeV2PairAddress(V2_FACTORY, T_IN, T_OUT), T_IN, T_OUT)
  world.set(hinted.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
  // Deliberately the BETTER route, reachable only through the scan: the assertion below therefore
  // distinguishes "did not wait" from "waited, and the scan had nothing to add".
  const [c0, c1] = [T_IN.toLowerCase(), T_OUT.toLowerCase()].sort() as [Address, Address]
  const scanned = v4Ref({ currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: addr(0) })
  world.set(scanned.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 18n })

  let openGate!: () => void
  const gate = new Promise<void>((resolve) => (openGate = resolve))
  const { client, served, completed } = makeClient({
    logs: async ({ scope }) => {
      if (scope !== 'pair') return []
      await gate // genuinely on the wire, genuinely not coming back
      return []
    },
  })
  const ctx = ctxOf(client, manifest, world)
  const req: SwapRequest = {
    tokenIn: T_IN,
    tokenOut: T_OUT,
    amountIn: 1_000_000n,
    trader: TRADER,
    hints: [{ protocol: 'v2', token0: T_IN, token1: T_OUT }],
  }

  let verified = false
  for await (const e of search(ctx, req, 'swap')) {
    if (e.type === 'final') throw new Error('the search finalized instead of leading on the hint')
    if (e.type === 'lead' && e.ranked[0]!.execution === 'verified') {
      expect(e.ranked[0]!.route.legs[0]!.pool.id).toBe(hinted.id)
      verified = true
      break
    }
  }

  expect(verified).toBe(true)
  expect(served.filter((s) => s.scope === 'pair').length).toBeGreaterThan(0) // dispatched...
  expect(completed.filter((s) => s.scope === 'pair')).toHaveLength(0) // ...and zero completions
  openGate() // let the abandoned scan wind down rather than leaving it wedged
  await ticks(5)
})

test('the first quote is on the wire before ANY log query comes back', async () => {
  // The latency claim itself rather than a proxy for it. A regression that awaited the eager scan
  // before the first pump cycle would still quote everything this test quotes — just after the scan,
  // which is the only thing that was ever wrong with it.
  const world: World = new Map()
  const manifest = manifestOf({ v2: true, v4: true })
  const index = new PoolIndex(WETH)
  newPool(index, world, T_IN, T_OUT)
  const { client, timeline } = makeClient({
    // Every scan costs a macrotask; every quote resolves in a microtask. An engine that orders the
    // first quote behind the scan is off by a whole macrotask, and one that does not is off by none.
    logs: async () => {
      await tick()
      return []
    },
  })
  const ctx = ctxOf(client, manifest, world, { index })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  const gen = search(ctx, req, 'quote')
  const first = await gen.next()
  const atLead = [...timeline]
  await gen.return(undefined as never)

  expect(first.value!.type).toBe('lead')
  expect(atLead[0]).toBe('quote')
  expect(atLead).not.toContain('getLogs') // the scan had not answered yet, and the lead did not care
})

test("the caller's own abort stops the eager scan, not only the iterator's abandonment", async () => {
  // The scan runs on a controller of the loop's own so the generator can cancel it, which is safe
  // only because that controller FORWARDS `req.signal`. Drop the forwarding and the caller's abort
  // stops reaching the scan: it walks on, chunk after chunk, long after the search was told to stop.
  // Stated without abandoning the iterator, so a working `finally` cannot mask a broken forward.
  const world: World = new Map()
  const manifest = manifestOf({ v2: true, v4: true })
  const index = new PoolIndex(WETH)
  newPool(index, world, T_IN, T_OUT)
  const controller = new AbortController()
  const { client, served } = makeClient({
    logs: async () => {
      await tick() // every chunk costs a macrotask, so the walk cannot outrun the abort
      return []
    },
    onQuote: () => controller.abort(), // the caller's budget expires on the first price
  })
  const ctx = ctxOf(client, manifest, world, { index, logChunkBlocks: 64n })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n, signal: controller.signal }

  const events = await collectAll(search(ctx, req, 'quote'))

  const final = events[events.length - 1]!
  expect(final.type).toBe('final')
  if (final.type !== 'final') throw new Error('unreachable')
  expect(final.state.aborted).toBe(true)
  expect(final.ranked.length).toBeGreaterThan(0) // best-so-far survives the abort

  await ticks(30)
  const afterAbort = served.length
  expect(afterAbort).toBeLessThan(8 * SCAN_CHUNK_CONCURRENCY) // concurrency-derived, as above
  await ticks(30)
  expect(served.length).toBe(afterAbort) // and nothing new goes out once the abort settles
})

test('an abort mid-scan keeps the prices the landed chunks bought', async () => {
  // THE LIVE DEFECT, PORTED (`rl quote eth usdc 1 --watch --budget 60s` on Base): the wave engine
  // enumerated its newly-discovered candidates only at the END of the scan that found them, so a
  // budget that expired inside a long scan converted a minute of real time into pools and ZERO
  // prices — `49 candidates · 10 attempted · 39 never attempted · aborted`. The pump prices what the
  // index holds WHILE the scan runs, so the chunks that landed are paid for even when the rest is not.
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const index = new PoolIndex(WETH)
  const early = newPool(undefined, world, T_IN, T_OUT, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
  const earlyLog = {
    address: V2_FACTORY,
    topics: [V2_TOPIC],
    data: '0x',
    blockNumber: HEAD - 10n,
    record: { pool: early, createdAtBlock: HEAD - 10n, source: 'event' },
  } as unknown as Log

  const controller = new AbortController()
  let adjacencyChunks = 0
  const { client, served } = makeClient({
    logs: async ({ scope }) => {
      if (scope !== 'adjacency') return []
      await tick()
      // The head-adjacent chunk carries the pool; every later one is empty and merely slow.
      return adjacencyChunks++ === 0 ? [earlyLog] : []
    },
    // The caller's clock expires the moment the scan's first find is priced.
    onQuote: (key) => {
      if (key.startsWith(early.id)) controller.abort()
    },
  })
  const ctx = ctxOf(client, manifest, world, { index, logChunkBlocks: 64n })
  ctx.modules = {
    ...ctx.modules,
    v2: { ...ctx.modules.v2, parsePoolLog: (log) => (log as Log & { record?: PoolRecord }).record ?? null },
  }
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n, signal: controller.signal }

  const events = await collectAll(search(ctx, req, 'quote'))
  const final = events[events.length - 1]!
  expect(final.type).toBe('final')
  if (final.type !== 'final') throw new Error('unreachable')

  expect(final.state.aborted).toBe(true)
  // THE REGRESSION: before interleaving this was `0 ok` and no best at all.
  expect(final.state.quoting.succeeded).toBeGreaterThan(0)
  expect(final.ranked[0]!.route.legs[0]!.pool.id).toBe(early.id)
  // …and the scan really was cut short rather than run to completion first.
  const total = Number(eagerPairScanBlocks(manifest) / 64n)
  expect(served.filter((s) => s.scope === 'adjacency').length).toBeLessThan(total)
})

test('an abort mid-detached-round cancels the queued legs — the drain waits only on the requests already in flight', async () => {
  // THE LIVE DEFECT (`--budget 60s` on a dense mainnet token overshooting by 12+ seconds): the
  // pump's dispatch signal used to be the SourceSet's, which aborts only in the loop's `finally` —
  // so the round in flight when the caller's signal fired ran to completion, envelope after
  // envelope, and the termination check's drain waited on all of it. The dispatch signal now
  // aborts WITH the caller's: every leg still queued for the wire dies unsent ('unattempted'),
  // and the drain waits only on the HTTP requests already dispatched.
  //
  // Choreography: 60 direct pools -> one 60-leg round (a 12-leg vanguard envelope answering
  // immediately, then 48 legs of which DEFAULT_CONCURRENCY dispatch and PARK on the wire while the
  // rest queue behind the concurrency bound). The abort lands with the vanguard priced and the
  // parked calls in flight. Only calls already parked at release time are ever released — a call
  // reaching the wire AFTER the abort would park forever and hang the drain, so "no new envelope
  // goes out" is enforced by the choreography, not merely counted.
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const index = new PoolIndex(WETH)
  const pools: PoolRef[] = []
  for (let i = 0; i < 60; i++) {
    pools.push(newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n + BigInt(60 - i) * 10n ** 6n }))
  }
  const vanguardIds = new Set(pools.slice(0, PUMP_VANGUARD_LEGS).map((p) => p.id))

  const controller = new AbortController()
  const parked: (() => void)[] = []
  let onWire = 0
  const { client } = makeClient({
    onQuote: async (key) => {
      onWire++
      if (vanguardIds.has(key.split('|')[0]!)) return // the vanguard answers immediately
      await new Promise<void>((resolve) => parked.push(resolve))
    },
  })
  const ctx = ctxOf(client, manifest, world, { index })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n, signal: controller.signal }

  const gen = search(ctx, req, 'quote')
  let first = await gen.next()
  while (!first.done && first.value.type !== 'lead') first = await gen.next()
  expect(first.value!.type).toBe('lead') // the vanguard's prices applied before the abort
  await ticks(2) // let the post-vanguard dispatch reach its concurrency bound and park
  expect(parked.length).toBe(DEFAULT_CONCURRENCY) // in flight; the remaining legs queue behind them

  controller.abort()
  const wireAtAbort = onWire
  for (const release of parked.splice(0)) release() // the in-flight requests answer; nothing else may follow

  // The drain must finish in bounded ticks — not after the round's remaining 28 legs. 100 macrotasks
  // is a HANG DETECTOR, not a latency budget: it is deliberately an order of magnitude above what
  // this choreography needs, so it fails only on a loop that never finishes. RAISE IT (do not delete
  // it) if the loop legitimately grows the number of event-loop turns a search takes — another hop
  // tier, another sequenced source — because then a real pass would start reading as 'hung'.
  const outcome = await Promise.race([collectAll(gen), ticks(100).then(() => 'hung' as const)])
  expect(outcome).not.toBe('hung')
  if (outcome === 'hung') throw new Error('unreachable')
  const final = outcome[outcome.length - 1]!
  expect(final.type).toBe('final')
  if (final.type !== 'final') throw new Error('unreachable')

  // (a) no NEW envelope reached the wire after the abort settled…
  expect(onWire).toBe(wireAtAbort)
  expect(parked).toHaveLength(0)
  // (b) …the queued legs died unsent, counted on the report's unattempted axis…
  expect(final.report.quoting.unattempted).toBe(60 - PUMP_VANGUARD_LEGS - DEFAULT_CONCURRENCY)
  expect(final.report.aborted).toBe(true)
  expect(final.state.aborted).toBe(true)
  // (d) …and every price the wire already paid for — the vanguard's AND the released in-flight
  // requests' — survives into the final, with the pre-abort leader still leading.
  expect(final.state.quoting.succeeded).toBe(PUMP_VANGUARD_LEGS + DEFAULT_CONCURRENCY)
  expect(final.ranked.length).toBe(PUMP_VANGUARD_LEGS + DEFAULT_CONCURRENCY)
  expect(final.ranked[0]!.route.legs[0]!.pool.id).toBe(pools[0]!.id)
})

// ---------------------------------------------------------------------------
// Fee-tier discovery, end to end: the fee arm of `demandFull` is the one full
// -history scan with no pools in it — its output is a wider HYPOTHESIS set, and
// it only pays off if the pump re-plans against it.
// ---------------------------------------------------------------------------

test('a fee tier discovered mid-search reaches a pool no module would have guessed', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v3: true })
  const onTier = v3Ref(addr(0x3000 + DISCOVERED_FEE), T_IN, T_OUT, DISCOVERED_FEE)
  world.set(onTier.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
  const feeLog = {
    address: V3_FACTORY,
    topics: [FEE_TOPIC],
    data: '0x',
    blockNumber: HEAD - 500n,
    fee: DISCOVERED_FEE,
  } as unknown as Log
  const { client, served } = makeClient({
    logs: ({ scope, from, to }) =>
      scope === 'fee' && from <= HEAD - 500n && HEAD - 500n <= to ? [feeLog] : [],
  })
  const index = new PoolIndex(WETH)
  const ctx = ctxOf(client, manifest, world, { index })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  const events = await collectAll(search(ctx, req, 'quote'))
  const final = events[events.length - 1]!

  expect(served.some((s) => s.scope === 'fee')).toBe(true)
  expect(index.enabledFees('v3', V3_FACTORY)).toEqual([DISCOVERED_FEE])
  expect(final.type).toBe('final')
  if (final.type !== 'final') throw new Error('unreachable')
  // The pool is reachable through nothing else in this world: no hint, no creation log, and the v3
  // fake hypothesizes about no tier it was not handed.
  expect(final.ranked[0]!.route.legs[0]!.pool.id).toBe(onTier.id)
})

// ---------------------------------------------------------------------------
// Regression: cross-search frontier shrink must not park the loop one
// comparison short of final.
//
// The termination check reads `state.intermediates.discovered` — last written
// by a planning pass — while a CONCURRENT search's upserts can evict this
// search's never-quoted neighbor pools under `maxPools` WITHOUT touching this
// search's `indexVersion`. The pump then stays clean (O(1) exit, no re-plan),
// the termination check reads the stale-high `discovered`, fails, and the
// advance that follows refreshes `discovered` down while selecting nothing.
// Before the fix that advance returned false without poking, and — with
// sources settled and the verifier idle — nothing ever woke the loop again:
// the iterator hung forever, no final.
//
// Reaching the stale window deterministically needs a swap (only a busy
// verifier suppresses the quiet-gate advance that would otherwise re-refresh
// `discovered` every dry cycle):
//   1. no candidates at launch -> the first quiet dry cycle opens the gate;
//   2. adjacency query #1 delivers the direct pool + X-pair pools (raising
//      `discovered` past `selected`) while query #2 is held, keeping the
//      worker unsettled; the direct pool's lead puts a HELD preflight in
//      flight, so no later cycle is quiet;
//   3. query #2 is released -> the worker converges and settles while the
//      verifier is still busy (no advance runs);
//   4. the eligible set shrinks (simulated eviction), then the preflight
//      settles -> the wake's termination check reads the stale `discovered`.
// ---------------------------------------------------------------------------

test('termination survives a cross-search frontier shrink while parked quiet (stale discovered > selected)', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const index = new PoolIndex(WETH)

  // The direct pool and 4 X-pair pools arrive ONLY via the adjacency scan.
  const direct = newPool(undefined, world, T_IN, T_OUT)
  const scanned: PoolRef[] = [direct]
  for (let i = 0; i < 4; i++) {
    const x = addr(0xd100 + i)
    scanned.push(newPool(undefined, world, T_IN, x), newPool(undefined, world, x, T_OUT))
  }
  const scanLogsPayload = scanned.map(
    (pool) =>
      ({
        address: V2_FACTORY,
        topics: [V2_TOPIC],
        data: '0x',
        blockNumber: 10n,
        record: { pool, createdAtBlock: 10n, source: 'event' },
      }) as unknown as Log,
  )

  let releaseHeldScan!: () => void
  const heldScan = new Promise<void>((resolve) => (releaseHeldScan = resolve))
  let releasePreflight!: () => void
  const heldPreflight = new Promise<void>((resolve) => (releasePreflight = resolve))

  let adjacencyCalls = 0
  const { client } = makeClient({
    logs: async ({ scope }) => {
      if (scope !== 'adjacency') return []
      adjacencyCalls++
      if (adjacencyCalls === 1) return scanLogsPayload // query #1: the pools land, discovered rises
      await heldScan // query #2: held, so the worker cannot settle yet
      return []
    },
    preflight: () => heldPreflight, // the verifier stays busy, suppressing the quiet-gate advance
  })
  const ctx = ctxOf(client, manifest, world, { index })
  // The scan-ingest channel: this test's v2 module parses pool logs (the default fake drops them).
  ctx.modules = {
    ...ctx.modules,
    v2: { ...ctx.modules.v2, parsePoolLog: (log) => (log as Log & { record?: PoolRecord }).record ?? null },
  }
  const req: SwapRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n, trader: TRADER }
  const gen = search(ctx, req, 'swap')

  // Phase 1: the scanned direct pool leads (unverified; its preflight is now held in flight), and
  // the planning pass that priced it recorded the wide frontier.
  let evt = await gen.next()
  while (!evt.done && evt.value!.type !== 'lead') evt = await gen.next()
  if (evt.done || evt.value!.type !== 'lead') throw new Error('no lead from the scanned pool')
  const state = evt.value!.state
  expect(evt.value!.ranked[0]!.route.legs[0]!.pool.id).toBe(direct.id)
  expect(state.intermediates.discovered).toBe(5) // WETH core + 4 X
  expect(state.intermediates.selected.length).toBe(1) // the seed alone — every later dry cycle was unquiet

  // Phase 2: let the worker converge and settle while the verifier is still busy.
  const untilSettled = gen.next()
  releaseHeldScan()
  let settled = await untilSettled
  while (
    !settled.done &&
    !(state.discovery.v2.complete.has(T_IN.toLowerCase()) && state.discovery.v2.complete.has(T_OUT.toLowerCase()))
  ) {
    settled = await gen.next()
  }
  expect(settled.done).toBe(false)
  expect(state.intermediates.discovered).toBe(5) // still wide, still > selected

  // Phase 3: park the loop, then shrink the eligible set out from under it — the observable effect
  // of a concurrent search's upserts evicting these never-quoted pools under `maxPools`: the
  // neighbor intersection empties and NOTHING bumps this search's indexVersion.
  //
  // SIMULATED, AND COUPLED TO ONE IMPLEMENTATION DETAIL — read this before changing `pump.ts`.
  // The shrink is staged by overwriting `index.commonNeighborNodes` (the accessor
  // `pump.ts#orderedIntermediates` derives its eligible set from), because it is the only lever that
  // empties the eligible set at a chosen instant: real eviction needs a second search interleaved to
  // the exact microtask (that version exists, at the router level — see `router.test.ts`, "two
  // concurrent searches under maxPools pressure"; it proves eviction is real but cannot park the
  // loop on a chosen await, which is what THIS test is about). If `orderedIntermediates` is ever
  // rerouted onto a different accessor, this test will keep passing while testing nothing — the
  // frontier will not shrink, phase 4's assertions will describe a search that was never disturbed,
  // and the regression it guards will be unguarded. Revisit it together with any such change.
  //
  // TWO STUBBED FACTS, BECAUSE A REAL EVICTION MOVES TWO THINGS: the adjacency answer (stubbed
  // empty) AND `index.version()` (every `evictPool` bumps it — the invalidation key of
  // `orderedIntermediates`' memo). An unrelated-pair upsert stages the version movement through the
  // real write path; without it the memo would be entitled to keep serving the pre-shrink ordering,
  // and the test would be asserting recomputation the contract does not promise.
  const untilVerified = gen.next()
  await ticks(5) // let the loop park on wake.next()
  const noCommonNeighbors = () => []
  ;(index as unknown as { commonNeighborNodes: typeof noCommonNeighbors }).commonNeighborNodes = noCommonNeighbors
  index.upsert({ pool: newPool(undefined, world, addr(0xeeee), addr(0xeeef)), source: 'event', createdAtBlock: 10n })

  // Phase 4: the preflight settles. Its wake's termination check reads the STALE discovered (5 > 1)
  // and fails; the advance then refreshes discovered down and selects nothing.
  releasePreflight()
  const lead = await untilVerified
  expect(lead.done).toBe(false)
  expect(lead.value!.type).toBe('lead')
  if (lead.value!.type !== 'lead') throw new Error('unreachable')
  expect(lead.value!.ranked[0]!.execution).toBe('verified')
  expect(state.intermediates.discovered).toBe(5) // the stale value the termination check just read

  // THE REGRESSION: the next pull must reach final, not park forever. Same hang-detector reading of
  // `ticks(100)` as the abort-drain test above — raise it if the loop legitimately grows the turns a
  // search takes; never delete it.
  const outcome = await Promise.race([
    gen.next(),
    ticks(100).then(() => 'hung' as const),
  ])
  expect(outcome).not.toBe('hung')
  if (outcome === 'hung') throw new Error('unreachable')
  expect(outcome.done).toBe(false)
  expect(outcome.value!.type).toBe('final')
  if (outcome.value!.type !== 'final') throw new Error('unreachable')
  expect(outcome.value!.state.aborted).toBe(false)
  expect(outcome.value!.state.intermediates.discovered).toBe(1) // healed by the advance
  expect((await gen.next()).done).toBe(true)
})

// ---------------------------------------------------------------------------
// Properties over a whole search (spec §8). Both are statements the per-cycle
// unit suites cannot make: they are about what holds ACROSS every cycle of one
// run, and both are the kind of invariant that decays silently — a frontier
// that shrinks costs a caller candidates it was already told about, and a
// duplicate measurement costs the provider a call for an answer already held.
// ---------------------------------------------------------------------------

/** An arbitrary two-hop neighborhood: n intermediates, each with a scripted in/out pool that either
 * prices or reverts, plus an optional direct pool. Small on purpose — the properties are about
 * sequencing across cycles, and a bigger graph buys more cycles, not more shapes. */
const searchWorldArb = fc.record({
  direct: fc.boolean(),
  xs: fc.array(fc.record({ inPrices: fc.boolean(), outPrices: fc.boolean() }), { maxLength: INTERMEDIATES_BATCH + 2 }),
})

function buildSearchWorld(spec: { direct: boolean; xs: { inPrices: boolean; outPrices: boolean }[] }): {
  ctx: SearchContext
  req: QuoteRequest
  wire: Wire
} {
  const world: World = new Map()
  const index = new PoolIndex(WETH)
  const priced: Fate = { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n }
  if (spec.direct) newPool(index, world, T_IN, T_OUT, priced)
  spec.xs.forEach((x, i) => {
    const node = addr(0xe100 + i)
    newPool(index, world, T_IN, node, x.inPrices ? priced : { kind: 'revert' }, BigInt(i + 1))
    newPool(index, world, node, T_OUT, x.outPrices ? priced : { kind: 'revert' }, BigInt(i + 1))
  })
  const wire = makeClient()
  return {
    ctx: ctxOf(wire.client, manifestOf({ v2: true }), world, { index }),
    req: { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n },
    wire,
  }
}

/** A world with more eligible intermediates than one batch holds, so at least one generated run is
 * guaranteed to exercise frontier GROWTH rather than a single seed batch (see the vacuity guard
 * below). Sized from `INTERMEDIATES_BATCH`, so it stays a multi-batch world if the constant moves. */
const multiBatchWorld = {
  direct: false,
  xs: Array.from({ length: INTERMEDIATES_BATCH + 2 }, () => ({ inPrices: true, outPrices: true })),
}

let sawSecondBatch = false

test('property: the intermediates frontier only ever grows — a node the search has selected is never un-selected', async () => {
  await fc.assert(
    fc.asyncProperty(searchWorldArb, async (spec) => {
      const { ctx, req } = buildSearchWorld(spec)
      const snapshots: { selected: string[]; notch: number }[] = []
      for await (const e of search(ctx, req, 'quote')) {
        snapshots.push({ selected: [...e.state.intermediates.selected], notch: e.state.intermediates.notch })
      }
      if (snapshots.some((s) => s.notch >= 2)) sawSecondBatch = true

      for (let i = 1; i < snapshots.length; i++) {
        const before = snapshots[i - 1]!
        const after = snapshots[i]!
        expect(after.notch).toBeGreaterThanOrEqual(before.notch)
        expect(after.selected.length).toBeGreaterThanOrEqual(before.selected.length)
        // Not merely "no smaller": every node already selected is still selected. A frontier that
        // swapped one batch for another of the same size would keep the count and still drop
        // candidates the caller had already been quoted on.
        for (const node of before.selected) expect(after.selected).toContain(node)
      }
    }),
    { numRuns: 25, examples: [[multiBatchWorld]] },
  )
  // The same guard as pump's `sawRetry`. Every generated world is free to be a single-batch one, and
  // a run in which they ALL were would assert "the frontier only grows" over searches whose frontier
  // never had a second batch to grow into — vacuously true, and exactly what a shrinking
  // `INTERMEDIATES_BATCH` (or a `maxLength` that stopped tracking it) would quietly produce. The
  // seeded example above makes the multi-batch world unconditional, so a failure here is the engine
  // refusing to advance, never a thin sample.
  expect(sawSecondBatch).toBe(true)
})

test('property: measurement dedup across a WHOLE search — the wire never repeats a (pool, direction, amount)', async () => {
  // `pump.test.ts` pins this per pump cycle against a hand-driven frontier. Only a whole search
  // exercises the two things that actually re-plan: the frontier advancing in batches, and the
  // coverage worker bumping `indexVersion` under the pump mid-round. Every world below is loss-free
  // — no transport failures — so the one sanctioned duplicate cannot be present and the rule is
  // exactly "never twice".
  await fc.assert(
    fc.asyncProperty(searchWorldArb, async (spec) => {
      const { ctx, req, wire } = buildSearchWorld(spec)
      await collectAll(search(ctx, req, 'quote'))

      expect(new Set(wire.quotes).size).toBe(wire.quotes.length)
    }),
    { numRuns: 25 },
  )
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

// ---------------------------------------------------------------------------
// Envelope-cadence leads: a round bigger than one MULTICALL_CHUNK group must
// not hold its first answers hostage to its last.
// ---------------------------------------------------------------------------

test('a multi-envelope round leads at envelope cadence — the vanguard prices and leads while every later leg is still held on the wire', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const index = new PoolIndex(WETH)
  // 60 direct pools with identical (absent) evidence, so planning keeps insertion order: legs
  // beyond the vanguard are the round's later dispatch groups. Every post-vanguard quote parks on
  // a gate that never releases until the test says so — if the first lead needed more than the
  // vanguard envelope, `gen.next()` would hang on the gate and the test would time out, which is
  // exactly the regression this pins against.
  const pools: PoolRef[] = []
  for (let i = 0; i < 60; i++) {
    pools.push(newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n + BigInt(60 - i) * 10n ** 6n }))
  }
  const lateIds = new Set(pools.slice(PUMP_VANGUARD_LEGS).map((p) => p.id))
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let held = 0
  const { client } = makeClient({
    onQuote: async (key) => {
      if (lateIds.has(key.split('|')[0]!)) {
        held++
        await gate
      }
    },
  })
  const ctx = ctxOf(client, manifest, world, { index })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  const gen = search(ctx, req, 'quote')
  let first = await gen.next()
  while (!first.done && first.value.type === 'progress') first = await gen.next()

  // The lead arrived off the vanguard envelope alone: every later quote is still parked.
  expect(first.value!.type).toBe('lead')
  if (first.value!.type !== 'lead') throw new Error('unreachable')
  // The rest really was dispatched concurrently — held on the wire, not skipped. (Not all 48 at
  // once: the per-call path's own concurrency bound queues the rest behind the gated ones.)
  expect(held).toBeGreaterThan(0)
  expect(first.value!.ranked.length).toBe(PUMP_VANGUARD_LEGS)
  for (const ranked of first.value!.ranked) {
    expect(lateIds.has(ranked.route.legs[0]!.pool.id)).toBe(false)
  }
  // …and the vanguard's own best leads (insertion order made pool 0 the strict maximum).
  expect(first.value!.ranked[0]!.route.legs[0]!.pool.id).toBe(pools[0]!.id)

  release()
  const rest = await collectAll(gen)
  const final = rest[rest.length - 1]!
  expect(final.type).toBe('final')
  if (final.type !== 'final') throw new Error('unreachable')
  expect(final.state.quoting.succeeded).toBe(60) // the held envelope's answers were harvested, not lost
  expect(final.ranked.length).toBe(60)
})

test('firstRoundComplete flips exactly when the initial round\'s last leg settles — and the flip itself emits a lead', async () => {
  const world: World = new Map()
  const manifest = manifestOf({ v2: true })
  const index = new PoolIndex(WETH)
  // Same shape as the vanguard test above: 60 direct pools, insertion order preserved, pool 0 the
  // strict maximum — so the post-vanguard legs can never change the leader, and the ONLY thing the
  // last envelope's settlement can move is the first-round axis. The lead that must follow it is
  // therefore the flip's own doing (leadSignature carries `firstRoundComplete`), not a leader change.
  const pools: PoolRef[] = []
  for (let i = 0; i < 60; i++) {
    pools.push(newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n + BigInt(60 - i) * 10n ** 6n }))
  }
  const lateIds = new Set(pools.slice(PUMP_VANGUARD_LEGS).map((p) => p.id))
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const { client } = makeClient({
    onQuote: async (key) => {
      if (lateIds.has(key.split('|')[0]!)) await gate
    },
  })
  const ctx = ctxOf(client, manifest, world, { index })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  const gen = search(ctx, req, 'quote')
  let first = await gen.next()
  while (!first.done && first.value.type === 'progress') first = await gen.next()

  // The vanguard's lead is a PARTIAL first round, and its report says so.
  expect(first.value!.type).toBe('lead')
  if (first.value!.type !== 'lead') throw new Error('unreachable')
  expect(first.value!.report.firstRoundComplete).toBe(false)
  expect(first.value!.state.firstRoundComplete).toBe(false)

  release()
  const rest = await collectAll(gen)

  // The moment the round's last leg settled, a lead fired carrying the axis — with the SAME leader,
  // because nothing in the held envelope out-priced pool 0. This is the event the facade answers on.
  const flipLead = rest.find((e) => e.type === 'lead' && e.report.firstRoundComplete)
  expect(flipLead).toBeDefined()
  if (flipLead === undefined || flipLead.type !== 'lead') throw new Error('unreachable')
  expect(flipLead.ranked[0]!.route.legs[0]!.pool.id).toBe(pools[0]!.id)
  // ...and the round really was complete at that lead: all 60 legs settled.
  expect(flipLead.report.enumeration.legsMeasured).toBe(60)

  // Later rounds (the frontier keeps advancing after the flip) never reset the axis.
  const final = rest[rest.length - 1]!
  expect(final.type).toBe('final')
  if (final.type !== 'final') throw new Error('unreachable')
  expect(final.report.firstRoundComplete).toBe(true)
})

test('an eager-scan pool that lands BEFORE dryness joins the first round — the wave is "everything due", not "the initial plan"', async () => {
  // THE RULE IS THE WHOLE RULE (`state.ts#firstRoundComplete`): the first round is everything that
  // became due before the pump first went dry, WHATEVER MADE IT DUE. The obvious reading — "the
  // round the initial planning pass dispatched, plus what its own answers woke" — is a list of the
  // usual contributors, not the definition, and a discovery is the case that separates them: the
  // eager pair scan runs concurrently with the first round and owes nothing to its answers.
  //
  // The shape: one indexed v2 pool whose quote is HELD on the wire, so the round cannot go dry;
  // meanwhile the eager v4 pair scan delivers a second, BETTER pool, which becomes due and is
  // measured while the first is still in flight. Releasing the held quote is the first moment
  // dryness is even possible — so if the scanned pool were not part of the first round, the flip
  // would arrive without it.
  const world: World = new Map()
  const manifest = manifestOf({ v2: true, v4: true })
  const index = new PoolIndex(WETH)
  const known = newPool(index, world, T_IN, T_OUT, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })

  const [c0, c1] = [T_IN.toLowerCase(), T_OUT.toLowerCase()].sort() as [Address, Address]
  const scanned = v4Ref({ currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: addr(0) })
  // Strictly deeper on the way out, so it must LEAD once it is priced — an assertion on the flip
  // lead's leader is then a claim about the scanned pool specifically, not about a set.
  world.set(scanned.id, { kind: 'price', r0: 10n ** 12n, r1: 5n * 10n ** 12n })
  const createdAt = HEAD - 10n
  const initializeLog = {
    address: V4_POOL_MANAGER,
    topics: [V4_TOPIC],
    data: '0x',
    blockNumber: createdAt,
    record: { pool: scanned, createdAtBlock: createdAt, source: 'event' },
  } as unknown as Log

  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let scannedQuoted = false
  const { client } = makeClient({
    logs: ({ from, to }) => (from <= createdAt && createdAt <= to ? [initializeLog] : []),
    onQuote: async (key) => {
      if (key.startsWith(scanned.id)) {
        scannedQuoted = true
        return
      }
      // The known pool's answer is what dryness waits on: while it sits here `inFlightKeys` is
      // non-empty, so no cycle can flip the axis however much else settles.
      await held
    },
  })
  const ctx = ctxOf(client, manifest, world, { index })
  const req: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: 1_000_000n }

  const gen = search(ctx, req, 'quote')
  // Pull until the scanned pool has been priced — with the known pool still held, this is proof the
  // discovery joined a round the initial plan had already dispatched.
  const before: EngineEvent[] = []
  while (!scannedQuoted) {
    const step = await gen.next()
    if (step.done) throw new Error('the search ended before the scanned pool was ever quoted')
    before.push(step.value)
    if (step.value.type === 'final') throw new Error('the search finalled with the known pool still on the wire')
  }
  expect(before.every((e) => e.type === 'progress' || !e.report.firstRoundComplete)).toBe(true)

  release()
  const rest = await collectAll(gen)

  const flipLead = [...before, ...rest].find((e) => e.type !== 'progress' && e.report.firstRoundComplete)
  expect(flipLead).toBeDefined()
  if (flipLead === undefined || flipLead.type === 'progress') throw new Error('unreachable')
  // THE CLAIM: the wave the flip declares settled contains BOTH legs — the one the initial plan
  // dispatched and the one a scan discovered underneath it — and the scanned pool is the leader,
  // so the first answer the facade is allowed to give is already the better route.
  expect(flipLead.report.enumeration.legsMeasured).toBe(2)
  expect(flipLead.ranked.map((r) => r.route.legs[0]!.pool.id).sort()).toEqual([known.id, scanned.id].sort())
  expect(flipLead.ranked[0]!.route.legs[0]!.pool.id).toBe(scanned.id)
})
