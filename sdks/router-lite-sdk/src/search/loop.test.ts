import { expect, test } from 'bun:test'
import fc from 'fast-check'
import type { Address, Hex, Log, PublicClient } from 'viem'
import { encodeAbiParameters } from 'viem'

import { MAX_INTERMEDIATES } from '../constants'
import { RpcUnavailableError } from '../errors'
import providerErrors from '../internal/__fixtures__/providerErrors.json'
import { v2Ref, v3Ref, v4Ref } from '../internal/testing'
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
    speculativeDirect: () => [],
    hypotheses: (a, b, _m, extraFees = []) =>
      extraFees.map((fee) => v3Ref(addr(0x3000 + fee), resolveAddress(a), resolveAddress(b), fee)),
    adjacencyShape: (m) => (m.v3 ? { emitter: m.v3.factory, topic0: V3_TOPIC, slot: 1, topicAddress: (e: Address) => e } : undefined),
    feeDiscovery: {
      query: (m) => ({ address: m.v3!.factory, topics: [FEE_TOPIC] }),
      feesFromLogs: (logs) => logs.map((l) => (l as Log & { fee?: number }).fee).filter((f): f is number => f !== undefined),
      probes: () => [],
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
        const key = Buffer.from(String((params[0] as { data?: string }).data ?? '0x').slice(2), 'hex').toString()
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
  const window = wave0PairScanBlocks(manifest)
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
  const totalChunks = Number(wave0PairScanBlocks(manifest) / 64n)
  expect(afterAbort).toBeLessThan(totalChunks / 2)
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
  const total = Number(wave0PairScanBlocks(manifest) / 64n)
  expect(served.filter((s) => s.scope === 'adjacency').length).toBeLessThan(total)
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
  const untilVerified = gen.next()
  await ticks(5) // let the loop park on wake.next()
  const noNeighbors = () => new Map<string, never>()
  ;(index as unknown as { neighbors: typeof noNeighbors }).neighbors = noNeighbors

  // Phase 4: the preflight settles. Its wake's termination check reads the STALE discovered (5 > 1)
  // and fails; the advance then refreshes discovered down and selects nothing.
  releasePreflight()
  const lead = await untilVerified
  expect(lead.done).toBe(false)
  expect(lead.value!.type).toBe('lead')
  if (lead.value!.type !== 'lead') throw new Error('unreachable')
  expect(lead.value!.ranked[0]!.execution).toBe('verified')
  expect(state.intermediates.discovered).toBe(5) // the stale value the termination check just read

  // THE REGRESSION: the next pull must reach final, not park forever.
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
  xs: fc.array(fc.record({ inPrices: fc.boolean(), outPrices: fc.boolean() }), { maxLength: MAX_INTERMEDIATES + 2 }),
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

test('property: the intermediates frontier only ever grows — a node the search has selected is never un-selected', async () => {
  await fc.assert(
    fc.asyncProperty(searchWorldArb, async (spec) => {
      const { ctx, req } = buildSearchWorld(spec)
      const snapshots: { selected: string[]; notch: number }[] = []
      for await (const e of search(ctx, req, 'quote')) {
        snapshots.push({ selected: [...e.state.intermediates.selected], notch: e.state.intermediates.notch })
      }

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
    { numRuns: 25 },
  )
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
