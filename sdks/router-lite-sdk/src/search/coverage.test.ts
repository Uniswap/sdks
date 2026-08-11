import { describe, expect, test } from 'bun:test'
import type { Address, Hex, Log } from 'viem'
import { pad } from 'viem'

import { DEFAULT_REORG_OVERLAP_BLOCKS, MIN_CHUNK, SCAN_CHUNK_CONCURRENCY } from '../constants'
import providerErrors from '../internal/__fixtures__/providerErrors.json'
import { v2Ref, v3Ref } from '../internal/testing'
import { wave0PairScanBlocks } from '../manifest'
import { PoolIndex } from '../pools/poolIndex'
import type { ProtocolModule } from '../protocols/types'
import type { BlockRange, ChainManifest, CurrencyRef, PoolRecord, Protocol, QuoteRequest } from '../types'

import { CoverageWorker } from './coverage'
import type { CoverageCtx } from './coverage'
import { createNotifier } from './notify'
import { createState } from './state'
import type { SearchState } from './state'

// ---------------------------------------------------------------------------
// The coverage worker's tests (spec §3.3).
//
// The properties worth a direct test are the ones that are ways to LIE about
// what was scanned, and they survive the refactor unchanged:
//
//   * a scan that records coverage for blocks it never asked the provider about
//     poisons the shared coverage cache permanently — every later search then
//     skips that gap as "already done";
//   * a scope marked `complete` that is not complete turns a search that never
//     looked into an authoritative `no-route`;
//   * an eager demand that walks more than its window spends the latency budget
//     the window exists to protect;
//   * pools that only reach the index when the LAST chunk lands make a long scan
//     an all-or-nothing purchase — the pump can only price what the index holds
//     WHILE the scan is still running, and it only re-plans when `indexVersion`
//     moves and `wake` is poked.
//
// Plus the ones the declarative shape adds: demand is a pure function of
// (scopes, gate state), the converge loop settles rather than spins, and
// `demandFull()` after a settle re-arms the same launched `run()`.
// ---------------------------------------------------------------------------

const WETH = `0x${'ee'.repeat(20)}` as Address
const TOKEN_A = `0x${'aa'.repeat(20)}` as Address
const TOKEN_B = `0x${'bb'.repeat(20)}` as Address
const V2_FACTORY = `0x${'66'.repeat(20)}` as Address
const V3_FACTORY = `0x${'55'.repeat(20)}` as Address
const V4_POOL_MANAGER = `0x${'77'.repeat(20)}` as Address
const V4_QUOTER = `0x${'88'.repeat(20)}` as Address

const V2_TOPIC: Hex = '0xf2'
const V3_TOPIC: Hex = '0xf3'
const FEE_TOPIC: Hex = '0xfee0'
const V4_TOPIC: Hex = '0xf4'

const HEAD = 1_000_000n
const BLOCK = { number: HEAD, hash: `0x${'ab'.repeat(32)}` as Hex, timestamp: 1_700_000_000n }
const TAIL: BlockRange = { fromBlock: HEAD - DEFAULT_REORG_OVERLAP_BLOCKS + 1n, toBlock: HEAD }

/**
 * blastapi's live capture, reused verbatim as "this sub-range is unreachable".
 *
 * It declares a ten-block cap — below `MIN_CHUNK`, so `logScanPolicy` gives the sub-range up on the
 * FIRST error with no retries and no backoff. That is what makes a give-up affordable to test here:
 * reaching one down the minimum-window ladder instead would mean really sleeping through the backoff
 * escalation (the worker threads `scanLogs`' `sleep` seam, but these tests do not inject one).
 */
const UNREACHABLE = providerErrors['eth-mainnet.public.blastapi.io'].message

function manifestWith(opts: { deploymentBlock: bigint; v4?: boolean; v2Block?: bigint }): ChainManifest {
  const manifest: ChainManifest = {
    chainId: 1,
    wrappedNative: WETH,
    v3: { factory: V3_FACTORY, deploymentBlock: opts.deploymentBlock, v3QuoterV2: V3_FACTORY },
    execution: { address: V3_FACTORY, commandSet: 'ur-2.0', permit2: V3_FACTORY, wrappedNative: WETH },
    coreIntermediates: [WETH],
  }
  if (opts.v4) manifest.v4 = { poolManager: V4_POOL_MANAGER, deploymentBlock: opts.deploymentBlock, quoter: V4_QUOTER }
  // A v2 whose deployment block can differ from v3's — mainnet's own ~2.4M-block gap, which is the
  // case a merged scan must NOT floor at the later of the two.
  if (opts.v2Block !== undefined) manifest.v2 = { factory: V2_FACTORY, deploymentBlock: opts.v2Block }
  return manifest
}

/** Nothing in this file quotes, compiles or hints — those members exist only to satisfy the interface. */
const unused = {
  hypotheses: () => [],
  validateHint: async () => null,
  encodeQuote: () => {
    throw new Error('not used')
  },
  compileOperation: () => {
    throw new Error('not used')
  },
} as unknown as Pick<ProtocolModule, 'hypotheses' | 'validateHint' | 'encodeQuote' | 'compileOperation'>

/**
 * A v3-shaped module. Its SHAPE (topics 1/2, identity endpoint mapping) is what `adjacencyQueries`
 * turns into the TWO topic-slot queries every real module has, and what makes the worker's
 * `intersectAll` load-bearing: a range is only covered for an endpoint when EVERY query for that
 * endpoint covered it.
 */
const v3Module: ProtocolModule = {
  id: 'v3',
  enabled: (m) => !!m.v3,
  adjacencyShape: (m) => (m.v3 ? { emitter: m.v3.factory, topic0: V3_TOPIC, slot: 1, topicAddress: (e: Address) => e } : undefined),
  feeDiscovery: {
    query: (m: ChainManifest) => ({ address: m.v3!.factory, topics: [FEE_TOPIC] }),
    feesFromLogs: (logs: Log[]) => logs.map((l) => (l as Log & { fee?: number }).fee).filter((f): f is number => f !== undefined),
    probes: () => [],
  },
  parsePoolLog: (log) => {
    const record = (log as Log & { record?: PoolRecord }).record
    return log.address.toLowerCase() === V3_FACTORY.toLowerCase() && record?.pool.protocol === 'v3' ? record : null
  },
  ...unused,
} as ProtocolModule

/** A v2-shaped module: the SAME topic slots as v3, which is what makes the two merge into one request. */
const v2Module: ProtocolModule = {
  id: 'v2',
  enabled: (m) => !!m.v2,
  adjacencyShape: (m) => (m.v2 ? { emitter: m.v2.factory, topic0: V2_TOPIC, slot: 1, topicAddress: (e: Address) => e } : undefined),
  parsePoolLog: (log) => {
    // Guards its own emitter exactly as every real module does — which is what makes misrouting a
    // merged response safe (and what this file's routing test asserts is not merely relied upon).
    const record = (log as Log & { record?: PoolRecord }).record
    return log.address.toLowerCase() === V2_FACTORY.toLowerCase() && record?.pool.protocol === 'v2' ? record : null
  },
  ...unused,
} as ProtocolModule

/** v4: no adjacency shape here, so its only scope in these tests is the exact-pair one. */
const v4Module: ProtocolModule = {
  id: 'v4',
  enabled: (m) => !!m.v4,
  adjacencyShape: () => undefined,
  exactPair: (a, b, m) => ({
    address: m.v4!.poolManager,
    topics: [V4_TOPIC, resolve(a).toLowerCase() as Hex, resolve(b).toLowerCase() as Hex],
  }),
  parsePoolLog: (log) => (log as Log & { record?: PoolRecord }).record ?? null,
  ...unused,
} as ProtocolModule

const disabled = (id: Protocol): ProtocolModule =>
  ({ id, enabled: () => false, adjacencyShape: () => undefined, parsePoolLog: () => null, ...unused }) as ProtocolModule

/** The same module minus its fee-factory scope — for the tests that isolate adjacency. */
function withoutFees(m: ProtocolModule): ProtocolModule {
  const { feeDiscovery: _unused, ...rest } = m
  return rest as ProtocolModule
}

function resolve(c: CurrencyRef): Address {
  return c === 'native' ? WETH : c
}

/** A v3 `PoolCreated`-shaped log the module's `parsePoolLog` will accept, at a given block. */
function poolLog(createdAtBlock: bigint, tag: string): Log & { record: PoolRecord } {
  const pool = v3Ref(`0x${tag}${TOKEN_A.slice(2, 21)}${TOKEN_B.slice(2, 21)}` as Address, TOKEN_A, TOKEN_B, 3000)
  return {
    address: V3_FACTORY,
    topics: [V3_TOPIC],
    data: '0x',
    blockNumber: createdAtBlock,
    record: { pool, createdAtBlock, source: 'event' },
  } as unknown as Log & { record: PoolRecord }
}

/** A v2 `PairCreated`-shaped log, emitted by the OTHER factory — the routing key of a merged answer. */
function v2PoolLog(createdAtBlock: bigint, tag: string): Log & { record: PoolRecord } {
  const pool = v2Ref(`0x${tag}${TOKEN_A.slice(2, 21)}${TOKEN_B.slice(2, 21)}` as Address, TOKEN_A, TOKEN_B)
  return {
    address: V2_FACTORY,
    topics: [V2_TOPIC],
    data: '0x',
    blockNumber: createdAtBlock,
    record: { pool, createdAtBlock, source: 'event' },
  } as unknown as Log & { record: PoolRecord }
}

type Served = { filter: any; from: bigint; to: bigint; refused: boolean }

/**
 * A stub client whose `eth_getLogs` is driven by one `answer` function, recording every filter it
 * was handed and whether it refused. `observe` runs BEFORE each answer, which is the only way to see
 * what the index knew part-way through a scan.
 */
function stubClient(opts: {
  answer: (ctx: { from: bigint; to: bigint; topics: (string | null)[] }) => Log[]
  observe?: () => void
}): { client: CoverageCtx['client']; served: Served[] } {
  const served: Served[] = []
  const client = {
    async request(args: any) {
      if (args.method !== 'eth_getLogs') throw new Error(`stubClient: unexpected method ${args.method}`)
      const filter = args.params[0]
      // An unfiltered query is a firehose, never a scan.
      if (!Array.isArray(filter.topics) || filter.topics.length === 0) throw new Error('stubClient: eth_getLogs arrived with no topic filter')
      const from = BigInt(filter.fromBlock)
      const to = BigInt(filter.toBlock)
      opts.observe?.()
      try {
        const logs = opts.answer({ from, to, topics: filter.topics })
        served.push({ filter, from, to, refused: false })
        return logs
      } catch (err) {
        served.push({ filter, from, to, refused: true })
        throw err
      }
    },
  } as unknown as CoverageCtx['client']
  return { client, served }
}

type Harness = {
  worker: CoverageWorker
  ctx: CoverageCtx
  state: SearchState
  index: PoolIndex
  signal: AbortSignal
  abort: () => void
  /** Every `wake.poke()` the worker made — the pump's only invitation to re-plan. */
  pokes: () => number
}

function makeWorker(
  client: CoverageCtx['client'],
  manifest: ChainManifest,
  overrides: Partial<CoverageCtx> & { index?: PoolIndex } = {},
): Harness {
  const req: QuoteRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 1000n }
  const index = overrides.index ?? new PoolIndex(WETH)
  const inner = createNotifier()
  let poked = 0
  const ctx: CoverageCtx = {
    client,
    manifest,
    modules: { v2: disabled('v2'), v3: v3Module, v4: v4Module },
    index,
    head: HEAD,
    wake: {
      poke: () => {
        poked++
        inner.poke()
      },
      next: () => inner.next(),
    },
    ...overrides,
  }
  const state = createState(BLOCK, false)
  const controller = new AbortController()
  return {
    worker: new CoverageWorker(ctx, state, req),
    ctx,
    state,
    index,
    signal: controller.signal,
    abort: () => controller.abort(),
    pokes: () => poked,
  }
}

/** Lets every pending scan/microtask settle without pinning the worker to a tick count. */
async function settleTicks(times = 20): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Total blocks in a set of ranges, for comparing what was CLAIMED against what was SERVED. */
function blocksIn(ranges: BlockRange[]): bigint {
  return ranges.reduce((sum, r) => sum + (r.toBlock - r.fromBlock + 1n), 0n)
}

// ---------------------------------------------------------------------------
// (a) DEMAND IS A PURE FUNCTION OF (SCOPES, GATE STATE).
//
// Pre-gate that means the exact-pair scope's recent week and NOTHING else — the
// bounded-latency guarantee for the new-asset case, and the reason a hinted
// search issues no unbounded scan at all.
// ---------------------------------------------------------------------------

describe('eager demand — the week window, and only it', () => {
  const DEPLOY = 100n
  const WINDOW = wave0PairScanBlocks(manifestWith({ deploymentBlock: 100n, v4: true }))
  const WINDOW_START = HEAD - WINDOW + 1n

  test('the eager gate scans the pair window alone: no adjacency, no fee history, nothing below the window', async () => {
    const { client, served } = stubClient({ answer: () => [] })
    const h = makeWorker(client, manifestWith({ deploymentBlock: DEPLOY, v4: true }))

    h.worker.demandEager()
    const done = h.worker.run(h.signal)
    await settleTicks()

    // The pair's history reaches back to block 100 and none of it was asked for; the adjacency and
    // fee-factory scopes were not asked about at all.
    expect(served.length).toBeGreaterThan(0)
    expect(served.every((s) => s.from >= WINDOW_START)).toBe(true)
    for (const { filter } of served) expect(filter.address).toBe(V4_POOL_MANAGER)

    // ...and the worker is CONVERGED against that demand while the gate is still shut.
    expect(h.worker.converged()).toBe(true)

    h.abort()
    await done
  })

  test('coverage bounds what inside the window is re-asked', async () => {
    const { client, served } = stubClient({ answer: () => [] })
    const h = makeWorker(client, manifestWith({ deploymentBlock: DEPLOY, v4: true }))
    // Already covered: the older two thirds of the window.
    h.index.addCoverage('v4', h.index.pairScope(TOKEN_A, TOKEN_B), { fromBlock: WINDOW_START, toBlock: 996_000n })

    h.worker.demandEager()
    const done = h.worker.run(h.signal)
    await settleTicks()

    const asked = served.reduce((m, s) => (s.from < m ? s.from : m), HEAD)
    expect(asked).toBe(996_000n - DEFAULT_REORG_OVERLAP_BLOCKS + 1n)

    h.abort()
    await done
  })

  test('the fully-covered window costs exactly the reorg tail — no more, and never nothing', async () => {
    const { client, served } = stubClient({ answer: () => [] })
    const h = makeWorker(client, manifestWith({ deploymentBlock: DEPLOY, v4: true }))
    h.index.addCoverage('v4', h.index.pairScope(TOKEN_A, TOKEN_B), { fromBlock: DEPLOY, toBlock: HEAD })

    h.worker.demandEager()
    const done = h.worker.run(h.signal)
    await settleTicks()

    expect(served).toHaveLength(1)
    expect(served[0]!.to - served[0]!.from + 1n).toBe(DEFAULT_REORG_OVERLAP_BLOCKS)

    h.abort()
    await done
  })
})

// ---------------------------------------------------------------------------
// (b) THE GATE: `run()` is ONE launched source whose promise settles only when
// no further demand can arrive.
// ---------------------------------------------------------------------------

describe('demandFull — re-arming a settled run', () => {
  const DEPLOY = 100n
  const WINDOW_START = HEAD - wave0PairScanBlocks(manifestWith({ deploymentBlock: 100n, v4: true })) + 1n

  test('the run stays pending after the eager demand settles, and completes the history once the gate opens', async () => {
    const { client, served } = stubClient({ answer: () => [] })
    const h = makeWorker(client, manifestWith({ deploymentBlock: DEPLOY, v4: true }))

    h.worker.demandEager()
    let settled = false
    const done = h.worker.run(h.signal).then(() => {
      settled = true
    })
    await settleTicks()

    // Converged against the eager demand — and still running, because the gate can still open.
    expect(settled).toBe(false)
    const afterEager = served.length
    expect(afterEager).toBeGreaterThan(0)

    h.worker.demandFull()
    await done

    expect(settled).toBe(true)
    // PER-SEARCH ATTEMPTED TRACKING: the post-gate pass asks only about blocks BELOW the window the
    // eager pass already walked. `uncovered` re-opens its tail on every read, so without the
    // worker's own bookkeeping the reorg tail would be bought twice in every single search.
    const post = served.slice(afterEager)
    expect(post.length).toBeGreaterThan(0)
    expect(post.filter((s) => s.filter.address === V4_POOL_MANAGER).every((s) => s.to < WINDOW_START)).toBe(true)
    // Between them, the pair's whole history is covered.
    expect(h.index.uncovered('v4', h.index.pairScope(TOKEN_A, TOKEN_B), DEPLOY, HEAD)).toEqual([TAIL])
  })

  test('a gate that opens MID-PASS is not settled against: the widened scopes are asked before any verdict', async () => {
    // THE STALE-DEMAND RACE. The eager pair scan is refused wholesale, so its pass ends with zero
    // progress — but the gate opened while that pass was in flight. Judging that pass's verdict
    // against the demand it never saw marks every adjacency scope `failed` without one request, and
    // returns on `gateOpened` having never scanned the demand it just accepted.
    const DEPLOY = 990_000n
    const box: { h?: Harness } = {}
    const { client, served } = stubClient({
      answer: ({ topics }) => {
        if (topics[0] !== V4_TOPIC) return []
        box.h!.worker.demandFull()
        throw new Error(UNREACHABLE)
      },
    })
    box.h = makeWorker(client, manifestWith({ deploymentBlock: DEPLOY, v4: true }))
    const h = box.h

    h.worker.demandEager()
    await h.worker.run(h.signal)

    // The adjacency scopes really were asked...
    expect(served.some((s) => Array.isArray(s.filter.topics[0]) && s.filter.topics[0].includes(V3_TOPIC))).toBe(true)
    for (const endpoint of [TOKEN_A, TOKEN_B]) expect(h.state.discovery.v3.complete.has(endpoint)).toBe(true)
    expect(h.state.discovery.v3.failed).toBe(false)
    // ...and only the scope that really was refused reports the source failure.
    expect(h.state.discovery.v4.failed).toBe(true)
  })

  test('the gate opens every scope, and a converged limit demand reports `complete` per (protocol, endpoint)', async () => {
    const { client } = stubClient({ answer: () => [] })
    const h = makeWorker(client, manifestWith({ deploymentBlock: DEPLOY, v4: true }))

    h.worker.demandEager()
    const done = h.worker.run(h.signal)
    h.worker.demandFull()
    await done

    expect(h.state.gateOpened).toBe(true)
    for (const endpoint of [TOKEN_A, TOKEN_B]) {
      expect(h.index.uncovered('v3', endpoint, DEPLOY, HEAD)).toEqual([TAIL])
      expect(h.state.discovery.v3.complete.has(endpoint)).toBe(true)
    }
    expect(h.state.discovery.v3.failed).toBe(false)
    // The fee-factory scope is walked too — it is a scope of the same demand, not a wave of its own.
    expect(h.index.uncovered('v3', V3_FACTORY, DEPLOY, HEAD)).toEqual([TAIL])
    expect(h.worker.converged()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// (c) HEAD-BACKWARD (spec §3): the head end is mandatory for every search, warm
// searches only ever need the head-adjacent delta, and brand-new pools — the one
// scan-discoverable class with a temporal prior — live there.
// ---------------------------------------------------------------------------

describe('head-backward walk order', () => {
  test('the first `eth_getLogs` a pass issues abuts the head, even when an older gap is uncovered', async () => {
    const DEPLOY = 900_000n
    const { client, served } = stubClient({ answer: () => [] })
    const h = makeWorker(client, manifestWith({ deploymentBlock: DEPLOY }), {
      // Adjacency only: one scope's ranges, so "first request" is unambiguous.
      modules: { v2: disabled('v2'), v3: withoutFees(v3Module), v4: disabled('v4') },
      logChunkBlocks: 1_000n,
    })
    // A warm index with a hole: uncovered is [the old gap] and [the head-adjacent delta].
    for (const endpoint of [TOKEN_A, TOKEN_B]) {
      h.index.addCoverage('v3', endpoint, { fromBlock: DEPLOY, toBlock: 920_000n })
      h.index.addCoverage('v3', endpoint, { fromBlock: 930_000n, toBlock: 950_000n })
    }
    expect(h.index.uncovered('v3', TOKEN_A, DEPLOY, HEAD).length).toBeGreaterThan(1)

    h.worker.demandFull()
    await h.worker.run(h.signal)

    // Recent first: the very first request the walk issues ends at the head, not at the old gap.
    expect(served[0]!.to).toBe(HEAD)
    expect(served[0]!.from).toBeGreaterThan(950_000n)
  })
})

// ---------------------------------------------------------------------------
// (d) CONVERGE, AND SETTLE — never spin. Reported against LIMIT demand.
// ---------------------------------------------------------------------------

describe('convergence and the report', () => {
  const DEPLOY = 990_000n
  const CHUNK = 1_000n
  const HOLE: BlockRange = { fromBlock: 995_001n, toBlock: 996_000n }

  function adjacencyOnly(client: CoverageCtx['client'], overrides: Partial<CoverageCtx> = {}): Harness {
    return makeWorker(client, manifestWith({ deploymentBlock: DEPLOY }), {
      modules: { v2: disabled('v2'), v3: withoutFees(v3Module), v4: disabled('v4') },
      logChunkBlocks: CHUNK,
      ...overrides,
    })
  }

  test('a scope failing wholesale reports `failed`, and claims no coverage at all', async () => {
    const { client } = stubClient({
      answer: () => {
        throw new Error(UNREACHABLE)
      },
    })
    const h = adjacencyOnly(client)

    h.worker.demandFull()
    await h.worker.run(h.signal)

    expect(h.state.discovery.v3.failed).toBe(true)
    expect(h.state.discovery.v3.complete.size).toBe(0)
    expect(h.index.uncovered('v3', TOKEN_A, DEPLOY, HEAD)).toEqual([{ fromBlock: DEPLOY, toBlock: HEAD }])
  })

  test('a zero-progress pass SETTLES as failed rather than spinning', async () => {
    // The whole loop-shape assertion: converge-while-progress means a pass that covers nothing it
    // asked for ends the loop. An unbounded retry against a refusing provider is a retry storm.
    const { client, served } = stubClient({
      answer: () => {
        throw new Error(UNREACHABLE)
      },
    })
    const h = adjacencyOnly(client)

    h.worker.demandFull()
    await h.worker.run(h.signal)
    const afterSettle = served.length

    await settleTicks(3)
    expect(served.length).toBe(afterSettle) // it really stopped, rather than looping forever
    expect(h.state.discovery.v3.failed).toBe(true)
  })

  test('a wholesale-refused FEE scope never fails discovery when the creation-event scopes are complete', async () => {
    // Fee tiers only widen the HYPOTHESIS set — a fee-enablement log never carries a pool, so a pool
    // on a governance-enabled tier is still surfaced by the adjacency/pair scans whenever it exists.
    // Marking `discovery.v3.failed` for a starved fee scan would demote a search whose
    // creation-event coverage is genuinely complete from an authoritative verdict to a permanent
    // `inconclusive` — the over-conservative reading this test pins the removal of.
    const { client, served } = stubClient({
      answer: ({ topics }) => {
        if (topics[0] === FEE_TOPIC) throw new Error(UNREACHABLE) // the fee-factory scope, starved wholesale
        return [] // adjacency answers cleanly
      },
    })
    const h = makeWorker(client, manifestWith({ deploymentBlock: DEPLOY }), { logChunkBlocks: CHUNK })

    h.worker.demandFull()
    await h.worker.run(h.signal)

    // The fee scan really ran, really was refused, and really left its scope uncovered...
    expect(served.some((s) => s.refused && s.filter.topics[0] === FEE_TOPIC)).toBe(true)
    expect(blocksIn(h.index.uncovered('v3', V3_FACTORY, DEPLOY, HEAD))).toBeGreaterThan(0n)
    // ...and the discovery axis is untouched: adjacency is complete for both endpoints, so the
    // search keeps its claim to exhaustiveness over every pool a creation event can surface.
    expect(h.state.discovery.v3.failed).toBe(false)
    expect(h.state.discovery.v3.complete.has(TOKEN_A)).toBe(true)
    expect(h.state.discovery.v3.complete.has(TOKEN_B)).toBe(true)
  })

  test('a full-history fee scan cannot starve the adjacency scopes: their queries are on the wire while the fee walk is still held', async () => {
    // THE STARVATION REGRESSION, ported. In the wave engine `discoverFeeTiers` was a wave of its own,
    // ahead of the adjacency waves that actually find the pair's pools — so against a narrowly-capped
    // provider it walked hundreds of chunks and (measured on Base) spent the caller's whole budget
    // before any adjacency request went out, leaving every protocol reporting "nothing covered yet".
    // A request-count bound on the fee scan was what capped it then; the shape of the worker is what
    // caps it now — the fee pass is a SIBLING of the adjacency pass, not a predecessor — and that is
    // the claim worth pinning, because it is the one a refactor can silently undo.
    let releaseFees!: () => void
    const held = new Promise<void>((resolve) => (releaseFees = resolve))
    const feeChunks: number[] = []
    let adjacencyQueries = 0
    const client = {
      async request(args: any) {
        if (args.method !== 'eth_getLogs') throw new Error(`unexpected method ${args.method}`)
        const filter = args.params[0]
        if (filter.topics[0] === FEE_TOPIC) {
          feeChunks.push(feeChunks.length)
          await held // every fee chunk hangs: the whole fee history is stuck behind one gate
          return []
        }
        adjacencyQueries++
        return []
      },
    } as unknown as CoverageCtx['client']
    const h = makeWorker(client, manifestWith({ deploymentBlock: DEPLOY }), { logChunkBlocks: CHUNK })

    h.worker.demandFull()
    const done = h.worker.run(h.signal)
    await settleTicks()

    // The fee walk is genuinely in flight and genuinely unfinished, and the adjacency queries did
    // not wait behind it — under the old ordering this number was zero.
    expect(feeChunks.length).toBeGreaterThan(0)
    expect(adjacencyQueries).toBeGreaterThan(0)

    releaseFees()
    await done

    // And once it lands, both scopes are complete: overlapping them cost the fee scan nothing.
    expect(h.state.discovery.v3.complete.has(TOKEN_A)).toBe(true)
    expect(h.state.discovery.v3.complete.has(TOKEN_B)).toBe(true)
    expect(h.state.discovery.v3.failed).toBe(false)
  })

  test('a permanent hole: everything around it IS covered, the endpoint is never marked complete', async () => {
    const { client } = stubClient({
      answer: ({ from, to }) => {
        if (from <= HOLE.toBlock && to >= HOLE.fromBlock) throw new Error(UNREACHABLE)
        return []
      },
    })
    const h = adjacencyOnly(client)

    h.worker.demandFull()
    await h.worker.run(h.signal)

    // A give-up costs the sub-range it happened on and not the walk around it.
    const uncovered = h.index.uncovered('v3', TOKEN_A, DEPLOY, HEAD)
    expect(uncovered).toEqual([{ fromBlock: HOLE.fromBlock, toBlock: HOLE.toBlock }, TAIL])
    // An incomplete scope may never be marked done: `discovery.complete` is what the report turns
    // into an authoritative `no-route`, so this is the coverage lie with the largest blast radius.
    expect(h.state.discovery.v3.complete.has(TOKEN_A)).toBe(false)
    // ...and the scope settles as `failed`, because the pass that asked for the hole alone got
    // nothing: the first pass covers everything around the hole (partial while the loop is still
    // converging), the next pass asks only for the hole, is refused, and reports the source failure.
    expect(h.state.discovery.v3.failed).toBe(true)
  })

  test('a hole in ONE of the two topic-slot queries un-covers that range for the endpoint', async () => {
    // `intersectAll`: an endpoint's coverage is the intersection across its queries, because a pool
    // whose creation event put the endpoint in the OTHER topic slot would be missed otherwise.
    const { client } = stubClient({
      answer: ({ from, to, topics }) => {
        if (topics[1] === null && from <= HOLE.toBlock && to >= HOLE.fromBlock) throw new Error(UNREACHABLE)
        return []
      },
    })
    const h = adjacencyOnly(client)

    h.worker.demandFull()
    await h.worker.run(h.signal)

    expect(h.index.uncovered('v3', TOKEN_A, DEPLOY, HEAD)).toContainEqual(HOLE)
    expect(h.state.discovery.v3.complete.has(TOKEN_A)).toBe(false)
  })

  test('a range a pass FAILED on is re-asked while any other scope is still making progress', async () => {
    // Converge-while-progress in one line: the hole heals, and the worker goes back for it inside the
    // same search rather than needing a "retry wave" to re-run the identical idempotent operation.
    let failing = true
    const { client } = stubClient({
      answer: ({ from, to }) => {
        if (failing && from <= HOLE.toBlock && to >= HOLE.fromBlock) throw new Error(UNREACHABLE)
        failing = false // the first refusal is the only one; the next pass sees a healthy provider
        return []
      },
    })
    const h = adjacencyOnly(client)

    h.worker.demandFull()
    await h.worker.run(h.signal)

    expect(h.index.uncovered('v3', TOKEN_A, DEPLOY, HEAD)).toEqual([TAIL])
    expect(h.state.discovery.v3.complete.has(TOKEN_A)).toBe(true)
  })

  test('a declared cap below MIN_CHUNK is what makes the give-up immediate', () => {
    // Ties the fixture above to the reason it was chosen, so a re-capture that raises blastapi's cap
    // above the floor changes this test rather than silently turning every give-up in this file into
    // a multi-second backoff ladder.
    expect(UNREACHABLE).toContain('10 block range')
    expect(10n).toBeLessThan(MIN_CHUNK)
  })
})

// ---------------------------------------------------------------------------
// (d2) ABORT: the signal arrives with the LAUNCH, and it has to reach the wire.
// ---------------------------------------------------------------------------

describe('abort', () => {
  test('an abort mid-walk stops the scan: no further requests, and the abort is never blamed on the provider', async () => {
    // `run(signal)`'s signal is the one the SourceSet owns — an abandoned iterator, a caller's
    // abort, a finished search. If it does not reach `scanLogs`, a search nobody is waiting on keeps
    // walking the whole history: the full walk here is 200 requests (100 chunks x two topic slots).
    const DEPLOY = 900_000n
    const box: { h?: Harness } = {}
    let requests = 0
    let abortedAt = 0
    const { client, served } = stubClient({
      answer: () => {
        requests++
        if (requests === 2) {
          abortedAt = requests
          box.h!.abort()
        }
        return []
      },
    })
    box.h = makeWorker(client, manifestWith({ deploymentBlock: DEPLOY }), {
      modules: { v2: disabled('v2'), v3: withoutFees(v3Module), v4: disabled('v4') },
      logChunkBlocks: 1_000n,
    })
    const h = box.h

    h.worker.demandFull()
    await h.worker.run(h.signal) // resolves promptly, or this test times out

    expect(abortedAt).toBe(2)
    // At most what was already in flight when the signal fired — one batch per topic-slot query.
    expect(served.length).toBeLessThanOrEqual(abortedAt + 2 * SCAN_CHUNK_CONCURRENCY)
    expect(served.length).toBeLessThan(20) // against 200 for the walk it would otherwise finish
    // An abort is reported on its own axis and must never be blamed on the provider, and nothing may
    // be claimed complete off a walk that stopped early.
    expect(h.state.discovery.v3.failed).toBe(false)
    expect(h.state.discovery.v3.complete.size).toBe(0)
    // Coverage is exactly the head chunk that was already on the wire when the signal fired — the
    // walk stopped one chunk in, and everything below it is still honestly unscanned.
    expect(h.index.uncovered('v3', TOKEN_A, DEPLOY, HEAD)[0]).toEqual({ fromBlock: DEPLOY, toBlock: HEAD - 1_000n })
  })
})

// ---------------------------------------------------------------------------
// (e) INGESTION: pools reach the index DURING a scan, and every arrival moves
// the two things the pump watches — `indexVersion` and `wake`.
// ---------------------------------------------------------------------------

describe('ingestion', () => {
  test('a pool from the first chunk is in the index — and has bumped indexVersion and poked wake — before the scan finishes', async () => {
    const DEPLOY = 990_000n
    const index = new PoolIndex(WETH)
    const seen: { pools: number; version: number; pokes: number }[] = []
    const box: { h?: Harness } = {}
    const { client, served } = stubClient({
      observe: () => seen.push({ pools: index.pair(TOKEN_A, TOKEN_B).length, version: box.h!.state.indexVersion, pokes: box.h!.pokes() }),
      answer: ({ from, to }) => (from <= HEAD && to >= HEAD - 10n ? [poolLog(HEAD - 10n, '99')] : []),
    })
    box.h = makeWorker(client, manifestWith({ deploymentBlock: DEPLOY }), {
      modules: { v2: disabled('v2'), v3: withoutFees(v3Module), v4: disabled('v4') },
      index,
      logChunkBlocks: 1_000n,
    })
    const h = box.h

    h.worker.demandFull()
    await h.worker.run(h.signal)

    expect(served.length).toBeGreaterThan(4) // a genuinely multi-chunk scan, or this proves nothing
    expect(seen[0]).toEqual({ pools: 0, version: 0, pokes: 0 })
    // THE PUMP'S TWO CURSORS, both moved mid-scan. `indexVersion` is what makes the pump re-plan
    // (it early-exits on an unchanged one), and `wake` is what gives it the chance to.
    const mid = seen.slice(0, -1)
    expect(mid.some((s) => s.pools > 0)).toBe(true)
    expect(mid.some((s) => s.version > 0)).toBe(true)
    expect(mid.some((s) => s.pokes > 0)).toBe(true)
    expect(index.pair(TOKEN_A, TOKEN_B)).toHaveLength(1)
  })

  test('re-delivering the same chunk is harmless — ingestion is idempotent', async () => {
    const { client } = stubClient({ answer: () => [poolLog(999_500n, '99')] })
    const h = makeWorker(client, manifestWith({ deploymentBlock: 999_000n }), {
      modules: { v2: disabled('v2'), v3: withoutFees(v3Module), v4: disabled('v4') },
    })

    h.worker.demandFull()
    await h.worker.run(h.signal)
    await h.worker.run(h.signal)

    expect(h.index.pair(TOKEN_A, TOKEN_B)).toHaveLength(1)
  })

  test('a discovered fee tier bumps indexVersion — the fee-tier hypothesis is invisible to the pump otherwise', async () => {
    const DEPLOY = 999_000n
    const { client } = stubClient({
      answer: ({ from, to, topics }) =>
        topics[0] === FEE_TOPIC && from <= 999_500n && to >= 999_500n
          ? [{ address: V3_FACTORY, topics: [FEE_TOPIC], data: '0x', blockNumber: 999_500n, fee: 250 } as unknown as Log]
          : [],
    })
    const h = makeWorker(client, manifestWith({ deploymentBlock: DEPLOY }), {
      modules: { v2: disabled('v2'), v3: v3Module, v4: disabled('v4') },
    })

    h.worker.demandFull()
    await h.worker.run(h.signal)

    expect(h.index.enabledFees('v3', V3_FACTORY)).toEqual([250])
    expect(h.state.indexVersion).toBeGreaterThan(0)
    expect(h.pokes()).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// (f) MERGED SCANS (C5-C): one request chain, several (protocol, endpoint)
// scopes. The saving is real only if the bookkeeping around it is exact.
// ---------------------------------------------------------------------------

describe('merged queries', () => {
  const DEPLOY = 999_000n

  function merged(client: CoverageCtx['client'], manifest: ChainManifest, overrides: Partial<CoverageCtx> = {}): Harness {
    return makeWorker(client, manifest, {
      modules: { v2: v2Module, v3: withoutFees(v3Module), v4: disabled('v4') },
      ...overrides,
    })
  }

  test('both protocols and both endpoints ride in ONE pair of filters', async () => {
    const { client, served } = stubClient({ answer: () => [] })
    const h = merged(client, manifestWith({ deploymentBlock: DEPLOY, v2Block: DEPLOY }))

    h.worker.demandFull()
    await h.worker.run(h.signal)

    // Four scopes x two topic slots would be EIGHT chains unmerged. Both factories in one `address`,
    // both selectors OR-ed in topic0, both endpoints OR-ed in the token slot leaves two.
    const filters = served.map((s) => s.filter)
    expect(new Set(filters.map((f) => JSON.stringify([f.address, f.topics]))).size).toBe(2)
    for (const filter of filters) {
      expect([...filter.address].sort()).toEqual([V2_FACTORY.toLowerCase(), V3_FACTORY.toLowerCase()].sort())
      expect([...filter.topics[0]].sort()).toEqual([V2_TOPIC, V3_TOPIC].sort())
      const tokenSlot = filter.topics[1] ?? filter.topics[2]
      expect([...tokenSlot].sort()).toEqual([pad(TOKEN_A).toLowerCase(), pad(TOKEN_B).toLowerCase()].sort())
    }
  })

  test('the merged answer is ROUTED BY EMITTER, so both protocols’ pools land in the index', async () => {
    const { client } = stubClient({ answer: () => [poolLog(999_500n, '99'), v2PoolLog(999_600n, '88')] })
    const h = merged(client, manifestWith({ deploymentBlock: DEPLOY, v2Block: DEPLOY }))

    h.worker.demandFull()
    await h.worker.run(h.signal)

    const protocols = h.index
      .pair(TOKEN_A, TOKEN_B)
      .map((p) => p.pool.protocol)
      .sort()
    expect(protocols).toEqual(['v2', 'v3'])
  })

  test('a log from an address no enabled module claims is dropped, not force-fed to a module', async () => {
    const foreign = { ...poolLog(999_500n, '99'), address: `0x${'de'.repeat(20)}` as Address }
    const { client } = stubClient({ answer: () => [foreign as unknown as Log] })
    const h = merged(client, manifestWith({ deploymentBlock: DEPLOY, v2Block: DEPLOY }))

    h.worker.demandFull()
    await h.worker.run(h.signal)

    expect(h.index.pair(TOKEN_A, TOKEN_B)).toHaveLength(0)
    expect(h.state.indexVersion).toBe(0) // nothing was learned, so the pump is not invited to re-plan
  })

  test('ONE merged query records coverage under EVERY scope it asked for', async () => {
    const { client } = stubClient({ answer: () => [] })
    const h = merged(client, manifestWith({ deploymentBlock: DEPLOY, v2Block: DEPLOY }))

    h.worker.demandFull()
    await h.worker.run(h.signal)

    for (const protocol of ['v2', 'v3'] as const) {
      for (const endpoint of [TOKEN_A, TOKEN_B]) {
        expect(h.index.uncovered(protocol, endpoint, DEPLOY, HEAD)).toEqual([TAIL])
        expect(h.state.discovery[protocol].complete.has(endpoint)).toBe(true)
      }
    }
  })

  test('DIFFERING DEPLOYMENT FLOORS: the pre-v3 stretch is scanned v2-only, never merged down to it', async () => {
    // The worst failure this design can have, as a test. v2 deployed 5,000 blocks before v3; a merge
    // floored at v3's block would leave those 5,000 unscanned for v2 AND record them as covered.
    const V2_DEPLOY = 990_000n
    const V3_DEPLOY = 995_000n
    const { client, served } = stubClient({ answer: () => [] })
    const h = merged(client, manifestWith({ deploymentBlock: V3_DEPLOY, v2Block: V2_DEPLOY }))

    h.worker.demandFull()
    await h.worker.run(h.signal)

    const belowV3 = served.filter((s) => s.from < V3_DEPLOY)
    expect(belowV3.length).toBeGreaterThan(0)
    for (const { filter } of belowV3) {
      expect(filter.address).toEqual([V2_FACTORY.toLowerCase()])
      expect(filter.topics[0]).toEqual([V2_TOPIC])
    }
    for (const { filter, from } of served) {
      if ((filter.address as string[]).includes(V3_FACTORY.toLowerCase())) expect(from).toBeGreaterThanOrEqual(V3_DEPLOY)
    }
    expect(h.index.uncovered('v2', TOKEN_A, V2_DEPLOY, HEAD)).toEqual([TAIL])
  })

  test('DIFFERING CACHE STATES: a warm endpoint and a cold one merge over the overlap and split below it', async () => {
    const { client, served } = stubClient({ answer: () => [] })
    const h = merged(client, manifestWith({ deploymentBlock: DEPLOY, v2Block: DEPLOY }))
    const WARM_TO = 999_800n
    for (const protocol of ['v2', 'v3'] as const) h.index.addCoverage(protocol, TOKEN_A, { fromBlock: DEPLOY, toBlock: WARM_TO })

    h.worker.demandFull()
    await h.worker.run(h.signal)

    // Below the warm endpoint's coverage, only the COLD endpoint is in the token slot — a merged
    // filter there would re-buy blocks TOKEN_A already has.
    const deep = served.filter((s) => s.to <= WARM_TO - DEFAULT_REORG_OVERLAP_BLOCKS)
    expect(deep.length).toBeGreaterThan(0)
    for (const { filter } of deep) expect(filter.topics[1] ?? filter.topics[2]).toEqual([pad(TOKEN_B).toLowerCase()])
    for (const protocol of ['v2', 'v3'] as const) {
      for (const endpoint of [TOKEN_A, TOKEN_B]) expect(h.index.uncovered(protocol, endpoint, DEPLOY, HEAD)).toEqual([TAIL])
    }
  })

  test('A WARM RE-SCAN BUYS ONLY THE DELTA: a second search over a covered index asks for the tail once', async () => {
    // The property the whole coverage cache exists for, end to end: a second worker (a second search
    // on the same router) over an index the first one filled walks the head-adjacent delta and the
    // standing reorg overlap, and nothing else.
    const index = new PoolIndex(WETH)
    const { client, served } = stubClient({ answer: () => [] })
    const first = merged(client, manifestWith({ deploymentBlock: DEPLOY, v2Block: DEPLOY }), { index })
    first.worker.demandFull()
    await first.worker.run(first.signal)
    const afterFirst = served.length
    expect(afterFirst).toBeGreaterThan(0)

    const second = merged(client, manifestWith({ deploymentBlock: DEPLOY, v2Block: DEPLOY }), { index })
    second.worker.demandFull()
    await second.worker.run(second.signal)

    const warm = served.slice(afterFirst)
    expect(warm.length).toBeGreaterThan(0) // never zero: the reorg tail is always re-opened
    expect(blocksIn(warm.map((s) => ({ fromBlock: s.from, toBlock: s.to })))).toBeLessThanOrEqual(
      DEFAULT_REORG_OVERLAP_BLOCKS * BigInt(warm.length),
    )
    for (const s of warm) expect(s.from).toBeGreaterThanOrEqual(HEAD - DEFAULT_REORG_OVERLAP_BLOCKS + 1n)
  })
})
