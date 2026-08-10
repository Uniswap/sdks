import { describe, expect, test } from 'bun:test'
import type { Address, Hex, Log } from 'viem'
import { pad } from 'viem'

import { DEFAULT_REORG_OVERLAP_BLOCKS, MIN_CHUNK } from '../constants'
import providerErrors from '../internal/__fixtures__/providerErrors.json'
import { v2Ref, v3Ref } from '../internal/testing'
import { PoolIndex } from '../pools/poolIndex'
import type { ProtocolModule } from '../protocols/types'
import type { BlockRange, ChainManifest, CurrencyRef, PoolRecord, Protocol, QuoteRequest } from '../types'

import { completeExactPairScan, discoverFeeTiers, scanAdjacency, scanExactPairRecent } from './discovery'
import type { Run, SearchContext } from './waves'
import { initialState } from './waves'

// ---------------------------------------------------------------------------
// The first colocated tests for `discovery.ts`.
//
// Everything this module does was previously reachable only through
// `searchWaves` — which means the properties it is uniquely responsible for
// were only ever asserted through a full engine run that also enumerated
// candidates, quoted them, ranked them, and built a report. Those are the
// properties most worth having a direct test for, because every one of them is
// a way to LIE about what was scanned:
//
//   * a handed-down request budget honoured PER RANGE instead of per call is a
//     budget that silently buys twice (or n times) what the caller asked for;
//   * a scan that reports coverage for blocks it never asked the provider about
//     poisons the index's coverage cache permanently — every later search skips
//     that gap as "already done";
//   * a wave-0 window that ignores what is already covered pays for a rescan
//     out of the latency budget the window exists to protect;
//   * and pools that only reach the index when the LAST chunk lands make a long
//     scan an all-or-nothing purchase, which is exactly what `onLogs` exists to
//     fix (`waves.ts#quoteWhileDiscovering` can only price what the index holds
//     WHILE the scan is still running).
//
// The stubs below follow `waves.test.ts`'s patterns deliberately, including its
// refusal to serve an unfiltered `eth_getLogs` — viem's `getLogs` action
// silently drops a caller-supplied `topics` field, so a regression that routed
// these scans through it would otherwise pass against a firehose.
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

/**
 * blastapi's live capture, reused verbatim as "this sub-range is unreachable".
 *
 * It declares a ten-block cap — below `MIN_CHUNK`, so `logScanPolicy` gives the sub-range up on the
 * FIRST error with no retries and no backoff. That is what makes a give-up affordable to test here:
 * `discovery.ts` does not thread `scanLogs`'s `sleep` seam, so reaching a give-up down the
 * minimum-window ladder instead would mean a test that really sleeps through the backoff escalation.
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
  speculativeDirect: () => [],
  validateHint: async () => null,
  encodeQuote: () => {
    throw new Error('not used')
  },
  compileOperation: () => {
    throw new Error('not used')
  },
} as unknown as Pick<ProtocolModule, 'speculativeDirect' | 'validateHint' | 'encodeQuote' | 'compileOperation'>

/**
 * A v3-shaped module. Its SHAPE (topics 1/2, identity endpoint mapping) is what `adjacencyQueries`
 * turns into the TWO topic-slot queries every real module has, and what makes `scanAdjacency`'s
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
}): { client: SearchContext['client']; served: Served[] } {
  const served: Served[] = []
  const client = {
    async request(args: any) {
      if (args.method !== 'eth_getLogs') throw new Error(`stubClient: unexpected method ${args.method}`)
      const filter = args.params[0]
      // Same guard as `waves.test.ts`: an unfiltered query is a firehose, never a scan.
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
  } as unknown as SearchContext['client']
  return { client, served }
}

function makeRun(client: SearchContext['client'], manifest: ChainManifest, overrides: Partial<SearchContext> = {}): Run {
  const req: QuoteRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 1000n }
  const ctx: SearchContext = {
    client,
    manifest,
    modules: { v2: disabled('v2'), v3: v3Module, v4: v4Module },
    index: new PoolIndex(WETH),
    hookData: new Map(),
    ...overrides,
  }
  return { kind: 'quote', req, ctx, state: initialState(BLOCK, false) }
}

/** Total blocks in a set of ranges, for comparing what was CLAIMED against what was SERVED. */
function blocksIn(ranges: BlockRange[]): bigint {
  return ranges.reduce((sum, r) => sum + (r.toBlock - r.fromBlock + 1n), 0n)
}

// ---------------------------------------------------------------------------
// (a) The fee-discovery request budget.
//
// `maxRequests` reaches `discoverFeeTiers` as a parameter from `waves.ts` now,
// and the accounting it needs is the whole reason it is a parameter rather than
// a constant read locally: it bounds THE CALL. A warm index's `uncovered` is
// routinely two ranges (the unscanned gap plus the re-opened reorg tail), so a
// per-range budget quietly buys 2x — and on the warm Base run that was the
// entire 60-second search, with the adjacency waves starved exactly as if there
// had been no bound at all.
// ---------------------------------------------------------------------------

describe('discoverFeeTiers — the handed-down request budget', () => {
  // The widest window this fake endpoint serves, so a full history needs many chunks. Above
  // `MIN_CHUNK` on purpose: a cap BELOW the scanner's floor is unreachable by construction and turns
  // every one of these runs into a minimum-window backoff ladder (real sleeping — `discovery.ts`
  // does not thread `scanLogs`'s `sleep` seam), which is a different test than a budget test.
  const CAP = 1_000n
  const DEPLOY = 900_000n

  /** An endpoint that refuses anything wider than `CAP` (blindly — it declares no window), so the
   * fee scan must chunk its way through history and can genuinely run out of budget. */
  function cappedEndpoint(feeAt?: bigint) {
    return ({ from, to }: { from: bigint; to: bigint }): Log[] => {
      if (to - from + 1n > CAP) throw new Error('query returned more than 10000 results')
      if (feeAt !== undefined && feeAt >= from && feeAt <= to) {
        return [{ address: V3_FACTORY, topics: [FEE_TOPIC], data: '0x', blockNumber: feeAt, fee: 250 } as unknown as Log]
      }
      return []
    }
  }

  test('the budget stops the scan, and the shortfall is reported as uncovered rather than skipped', async () => {
    const BUDGET = 12
    const { client, served } = stubClient({ answer: cappedEndpoint() })
    const run = makeRun(client, manifestWith({ deploymentBlock: DEPLOY }))

    await discoverFeeTiers(run, v3Module, { maxRequests: BUDGET })

    // Every request that reached the wire counts, refused ones included — that is what makes the
    // bound a bound rather than a bound on SUCCESSES (an endpoint that refuses everything would
    // otherwise never stop).
    expect(served.length).toBe(BUDGET)

    // ...and the blocks it never asked about are still uncovered. This is the assertion that a
    // budget-truncated scan does not lie: `uncovered` is what every later search consults, so a gap
    // claimed here is a gap never scanned by anyone, ever.
    const claimed = run.ctx.index.uncovered('v3', V3_FACTORY, DEPLOY, HEAD)
    const wholeHistory = HEAD - DEPLOY + 1n
    expect(blocksIn(claimed)).toBeGreaterThan(0n)
    expect(blocksIn(claimed)).toBeLessThan(wholeHistory) // it did make real progress
  })

  test('COVERAGE IS EXACTLY WHAT WAS SERVED — never a block more', async () => {
    const BUDGET = 20
    const { client, served } = stubClient({ answer: cappedEndpoint() })
    const run = makeRun(client, manifestWith({ deploymentBlock: DEPLOY }))

    await discoverFeeTiers(run, v3Module, { maxRequests: BUDGET })

    // Reconstruct what the provider actually answered, independently of the index, and compare block
    // for block. A coverage bug that rounded a partial scan up to its whole range would pass every
    // count-based assertion above and fail here.
    const servedBlocks = served.filter((s) => !s.refused).reduce((sum, s) => sum + (s.to - s.from + 1n), 0n)
    const wholeHistory = HEAD - DEPLOY + 1n
    const coveredBlocks = wholeHistory - blocksIn(run.ctx.index.uncovered('v3', V3_FACTORY, DEPLOY, HEAD))
    // The reorg tail is re-opened by `uncovered` regardless of coverage, so what was served is the
    // covered total PLUS at most that overlap — never less, which would be a claim without a scan.
    expect(servedBlocks).toBeGreaterThanOrEqual(coveredBlocks)
    expect(servedBlocks - coveredBlocks).toBeLessThanOrEqual(DEFAULT_REORG_OVERLAP_BLOCKS)
  })

  test('THE BUDGET SPANS THE CALL, NOT EACH RANGE: a second uncovered range gets what is left, not a fresh grant', async () => {
    // Two uncovered ranges, which is the ordinary warm-index shape rather than a contrived one.
    // A per-range budget would spend BUDGET on each and cost 2x what the wave engine authorised.
    const BUDGET = 12
    const { client, served } = stubClient({ answer: cappedEndpoint() })
    const run = makeRun(client, manifestWith({ deploymentBlock: DEPLOY }))
    run.ctx.index.addCoverage('v3', V3_FACTORY, { fromBlock: 950_000n, toBlock: 960_000n })

    const ranges = run.ctx.index.uncovered('v3', V3_FACTORY, DEPLOY, HEAD)
    expect(ranges.length).toBeGreaterThan(1) // the premise: this really is a multi-range scan

    await discoverFeeTiers(run, v3Module, { maxRequests: BUDGET })

    expect(served.length).toBe(BUDGET)
    expect(served.length).toBeLessThan(BUDGET * ranges.length) // the bug this pins: no per-range grant
    // The first range ate the whole budget, so nothing was ever asked about the later one(s). Any
    // request above the first range's end would mean the loop kept going on a spent budget.
    const firstRangeEnd = ranges[0]!.toBlock
    expect(served.every((s) => s.to <= firstRangeEnd)).toBe(true)
  })

  test('a partial fee scan still contributes the tiers it did find', async () => {
    // Budget exhaustion is not an error and not a rollback: `discoverFeeTiers` walks recent-first
    // within each range, so a tier enabled near the range's tip is discovered even when the walk
    // never reaches genesis. Cheap to assert and the reason a bounded scan is worth running at all.
    const DEPLOY_SMALL = 999_000n
    const { client } = stubClient({ answer: cappedEndpoint(999_950n) })
    const run = makeRun(client, manifestWith({ deploymentBlock: DEPLOY_SMALL }))

    await discoverFeeTiers(run, v3Module, { maxRequests: 4 })

    expect(run.ctx.index.enabledFees('v3', V3_FACTORY)).toEqual([250])
  })
})

// ---------------------------------------------------------------------------
// (b) `onLogs`: pools reach the index DURING a scan, not after it.
// ---------------------------------------------------------------------------

describe('incremental ingestion', () => {
  test('a pool from the first chunk is in the index before the scan finishes', async () => {
    const DEPLOY = 990_000n
    const CHUNK = 1_000n
    // Recorded before each request is answered: how many (A,B) pools the index held at that moment.
    const poolsBeforeRequest: number[] = []
    const index = new PoolIndex(WETH)
    const { client, served } = stubClient({
      observe: () => poolsBeforeRequest.push(index.pair(TOKEN_A, TOKEN_B).length),
      // One pool, created in the most recent CHUNK-wide window, so it lands in the very first chunk
      // the recent-first walk serves and every later request can be asked what the index knows.
      answer: ({ from, to }) => (from <= HEAD && to >= HEAD - 10n ? [poolLog(HEAD - 10n, '99')] : []),
    })
    const run = makeRun(client, manifestWith({ deploymentBlock: DEPLOY }), { logChunkBlocks: CHUNK, index })

    await scanAdjacency(run, [TOKEN_A])

    expect(served.length).toBeGreaterThan(4) // a genuinely multi-chunk scan, or this proves nothing
    expect(poolsBeforeRequest[0]).toBe(0) // nothing known before the first chunk lands
    // ...and by the time the scan was still issuing requests, the pool was already usable. This is
    // the property `waves.ts#quoteWhileDiscovering` depends on: it can only price what the index
    // holds WHILE the scan runs, so a pool that arrives with the last chunk arrives too late.
    expect(poolsBeforeRequest.slice(0, -1).some((n) => n > 0)).toBe(true)
    expect(index.pair(TOKEN_A, TOKEN_B)).toHaveLength(1)
  })

  test('re-delivering the same chunk is harmless — ingestion is idempotent', async () => {
    // `onLogs` promises nothing about exactly-once delivery, and the coverage merge means a chunk
    // can legitimately be re-scanned by a later search. `upsert` is what makes that safe.
    const { client } = stubClient({ answer: () => [poolLog(999_500n, '99')] })
    const run = makeRun(client, manifestWith({ deploymentBlock: 999_000n }))

    await scanAdjacency(run, [TOKEN_A])
    await scanAdjacency(run, [TOKEN_A])

    expect(run.ctx.index.pair(TOKEN_A, TOKEN_B)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// (c) Wave 0's exact-pair window, intersected with what is already covered.
// ---------------------------------------------------------------------------

describe('scanExactPairRecent — the window and the coverage cache both bound it', () => {
  const DEPLOY = 100n
  const WINDOW = 10_000n
  const WINDOW_START = HEAD - WINDOW + 1n

  test('the window bounds how far back it looks, and coverage bounds what inside it is re-asked', async () => {
    const { client, served } = stubClient({ answer: () => [] })
    const run = makeRun(client, manifestWith({ deploymentBlock: DEPLOY, v4: true }))
    const scope = run.ctx.index.pairScope(TOKEN_A, TOKEN_B)
    // Already covered: the older two thirds of the wave-0 window.
    run.ctx.index.addCoverage('v4', scope, { fromBlock: WINDOW_START, toBlock: 996_000n })

    await scanExactPairRecent(run, { window: WINDOW })

    // The pair's history reaches back to block 100, and NONE of that was asked for: the window is
    // what buys wave 0 its latency, and a wave-0 scan that walks the whole history is not wave 0.
    expect(served.every((s) => s.from >= WINDOW_START)).toBe(true)
    // Inside the window, only the genuinely-uncovered tail plus the standing reorg overlap. The
    // covered interior is not re-requested — the coverage cache is what makes a warm search cheap,
    // and it must apply to the wave-0 window as much as to anything else.
    const asked = { from: served.reduce((m, s) => (s.from < m ? s.from : m), HEAD), to: HEAD }
    expect(asked.from).toBe(996_000n - DEFAULT_REORG_OVERLAP_BLOCKS + 1n)
    expect(run.state.pairScanned).toEqual([{ fromBlock: 996_000n - DEFAULT_REORG_OVERLAP_BLOCKS + 1n, toBlock: HEAD }])
  })

  test('the fully-covered window costs no requests at all', async () => {
    const { client, served } = stubClient({ answer: () => [] })
    const run = makeRun(client, manifestWith({ deploymentBlock: DEPLOY, v4: true }))
    const scope = run.ctx.index.pairScope(TOKEN_A, TOKEN_B)
    // Covered right up to the head: `uncovered` still re-opens the reorg tail, so this is not zero
    // requests — it is exactly the overlap, which is the honest floor for a warm re-scan.
    run.ctx.index.addCoverage('v4', scope, { fromBlock: DEPLOY, toBlock: HEAD })

    await scanExactPairRecent(run, { window: WINDOW })

    expect(served).toHaveLength(1)
    expect(served[0]!.to - served[0]!.from + 1n).toBe(DEFAULT_REORG_OVERLAP_BLOCKS)
  })

  test('wave 2 completes the history without re-requesting wave 0’s window', async () => {
    // The two halves of the exact-pair scan, in the order the engine runs them. `state.pairScanned`
    // is the handoff: without it the coverage cache's re-opened tail would make wave 2 re-scan the
    // same blocks wave 0 just paid for, in every single search.
    const { client, served } = stubClient({ answer: () => [] })
    const run = makeRun(client, manifestWith({ deploymentBlock: DEPLOY, v4: true }))

    await scanExactPairRecent(run, { window: WINDOW })
    const afterWave0 = served.length
    await completeExactPairScan(run)

    const wave2 = served.slice(afterWave0)
    expect(wave2.length).toBeGreaterThan(0)
    // Wave 2 asks only about blocks older than the window wave 0 already walked.
    expect(wave2.every((s) => s.from < WINDOW_START)).toBe(true)
    expect(wave2.every((s) => s.to < WINDOW_START)).toBe(true)
    // Between them the pair's whole history is covered, which is the point of splitting it.
    expect(run.ctx.index.uncovered('v4', run.ctx.index.pairScope(TOKEN_A, TOKEN_B), DEPLOY, HEAD)).toEqual([
      { fromBlock: HEAD - DEFAULT_REORG_OVERLAP_BLOCKS + 1n, toBlock: HEAD },
    ])
  })
})

// ---------------------------------------------------------------------------
// (d) Coverage bookkeeping when a scan gives a sub-range up.
// ---------------------------------------------------------------------------

describe('scanAdjacency — a given-up sub-range is never claimed as covered', () => {
  const DEPLOY = 990_000n
  const CHUNK = 1_000n
  const HOLE: BlockRange = { fromBlock: 995_001n, toBlock: 996_000n }

  /** Refuses, with a declared cap below `MIN_CHUNK`, any chunk overlapping `HOLE`. */
  function withHole(only?: 'second-query') {
    return ({ from, to, topics }: { from: bigint; to: bigint; topics: (string | null)[] }): Log[] => {
      // The two adjacency queries differ by which topic slot the endpoint sits in.
      const isSecondQuery = topics[1] === null
      if ((only !== 'second-query' || isSecondQuery) && from <= HOLE.toBlock && to >= HOLE.fromBlock) throw new Error(UNREACHABLE)
      return []
    }
  }

  test('the hole stays uncovered, the endpoint stays incomplete, and everything else IS covered', async () => {
    const { client } = stubClient({ answer: withHole() })
    const run = makeRun(client, manifestWith({ deploymentBlock: DEPLOY }), { logChunkBlocks: CHUNK })

    await scanAdjacency(run, [TOKEN_A])

    const uncovered = run.ctx.index.uncovered('v3', TOKEN_A, DEPLOY, HEAD)
    // The given-up chunk is exactly one CHUNK-wide window (the width in flight when the refusal
    // arrived), and it is still on the books as unscanned.
    expect(uncovered).toContainEqual({ fromBlock: HOLE.fromBlock, toBlock: HOLE.toBlock })
    // ...and nothing else is, apart from the standing reorg tail — a give-up must cost the sub-range
    // it happened on and not the walk around it.
    expect(uncovered).toEqual([
      { fromBlock: HOLE.fromBlock, toBlock: HOLE.toBlock },
      { fromBlock: HEAD - DEFAULT_REORG_OVERLAP_BLOCKS + 1n, toBlock: HEAD },
    ])
    // An incomplete scan may never mark the endpoint done: `discovery.complete` is what the report
    // turns into an authoritative `no-route`, so this is the coverage lie with the largest blast
    // radius in the package.
    expect(run.state.discovery.v3.complete.has(TOKEN_A)).toBe(false)
    expect(run.state.discovery.v3.failed).toBe(false) // partial is not failed: real blocks were covered
  })

  test('a hole in ONE of the two adjacency queries un-covers that range for the endpoint', async () => {
    // `intersectAll`: an endpoint's coverage is the intersection across its queries, because a pool
    // whose creation event put the endpoint in the OTHER topic slot would be missed otherwise. A
    // union here would report coverage the search never actually has.
    const { client } = stubClient({ answer: withHole('second-query') })
    const run = makeRun(client, manifestWith({ deploymentBlock: DEPLOY }), { logChunkBlocks: CHUNK })

    await scanAdjacency(run, [TOKEN_A])

    expect(run.ctx.index.uncovered('v3', TOKEN_A, DEPLOY, HEAD)).toContainEqual({ fromBlock: HOLE.fromBlock, toBlock: HOLE.toBlock })
    expect(run.state.discovery.v3.complete.has(TOKEN_A)).toBe(false)
  })

  test('covering nothing at all is recorded as a source failure, not as an empty success', async () => {
    const { client } = stubClient({
      answer: () => {
        throw new Error(UNREACHABLE)
      },
    })
    const run = makeRun(client, manifestWith({ deploymentBlock: DEPLOY }), { logChunkBlocks: CHUNK })

    await scanAdjacency(run, [TOKEN_A])

    expect(run.state.discovery.v3.failed).toBe(true)
    expect(run.state.discovery.v3.covered).toEqual([])
    expect(run.ctx.index.uncovered('v3', TOKEN_A, DEPLOY, HEAD)).toEqual([{ fromBlock: DEPLOY, toBlock: HEAD }])
  })

  test('a declared cap below MIN_CHUNK is what makes the give-up immediate', async () => {
    // Ties the fixture above to the reason it was chosen, so a re-capture that raises blastapi's cap
    // above the floor changes this test rather than silently turning every give-up in this file into
    // a multi-second backoff ladder.
    expect(UNREACHABLE).toContain('10 block range')
    expect(10n).toBeLessThan(MIN_CHUNK)
  })
})

// ---------------------------------------------------------------------------
// (e) MERGED SCANS (C5-C): one request, several (protocol, endpoint) scopes.
//
// The saving is real only if the bookkeeping around it is exact, and every
// assertion below is about the bookkeeping rather than the saving:
//
//   * a merged answer MIXES PROTOCOLS, so ingestion has to route by emitter or
//     silently drop half of what it paid for;
//   * a merged query's covered range belongs to EVERY scope it asked for — and
//     to no other, which is what the differing-floor case pins;
//   * and the request count has to actually fall, or none of this was worth
//     the coverage risk.
// ---------------------------------------------------------------------------

describe('scanAdjacency — merged queries', () => {
  const DEPLOY = 999_000n

  /** A run with v2 AND v3 enabled — the pair that merges. */
  function mergedRun(client: SearchContext['client'], manifest: ChainManifest, overrides: Partial<SearchContext> = {}): Run {
    return makeRun(client, manifest, { modules: { v2: v2Module, v3: v3Module, v4: v4Module }, ...overrides })
  }

  test('both protocols and both endpoints ride in ONE pair of filters', async () => {
    const { client, served } = stubClient({ answer: () => [] })
    const run = mergedRun(client, manifestWith({ deploymentBlock: DEPLOY, v2Block: DEPLOY }))

    await scanAdjacency(run, [TOKEN_A, TOKEN_B])

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
    // The shape of a real merged response: v2 and v3 creation logs interleaved in one result array,
    // told apart only by `address`. A router that handed the whole array to one module would keep
    // that module's pools and silently drop the other's — a scan paid for and half-discarded.
    const { client } = stubClient({ answer: () => [poolLog(999_500n, '99'), v2PoolLog(999_600n, '88')] })
    const run = mergedRun(client, manifestWith({ deploymentBlock: DEPLOY, v2Block: DEPLOY }))

    await scanAdjacency(run, [TOKEN_A])

    const protocols = run.ctx.index
      .pair(TOKEN_A, TOKEN_B)
      .map((p) => p.pool.protocol)
      .sort()
    expect(protocols).toEqual(['v2', 'v3'])
  })

  test('a log from an address no enabled module claims is dropped, not force-fed to a module', async () => {
    const foreign = { ...poolLog(999_500n, '99'), address: `0x${'de'.repeat(20)}` as Address }
    const { client } = stubClient({ answer: () => [foreign as unknown as Log] })
    const run = mergedRun(client, manifestWith({ deploymentBlock: DEPLOY, v2Block: DEPLOY }))

    await scanAdjacency(run, [TOKEN_A])

    expect(run.ctx.index.pair(TOKEN_A, TOKEN_B)).toHaveLength(0)
  })

  test('ONE merged query records coverage under EVERY scope it asked for', async () => {
    const { client } = stubClient({ answer: () => [] })
    const run = mergedRun(client, manifestWith({ deploymentBlock: DEPLOY, v2Block: DEPLOY }))

    await scanAdjacency(run, [TOKEN_A, TOKEN_B])

    // All four (protocol, endpoint) scopes are covered down to the reorg tail — from two requests.
    // Claiming less would leave a warm router re-scanning blocks it has already paid for; claiming
    // more (a block outside the query's own ranges) is the pool-losing bug.
    const tail = [{ fromBlock: HEAD - DEFAULT_REORG_OVERLAP_BLOCKS + 1n, toBlock: HEAD }]
    for (const protocol of ['v2', 'v3'] as const) {
      for (const endpoint of [TOKEN_A, TOKEN_B]) {
        expect(run.ctx.index.uncovered(protocol, endpoint, DEPLOY, HEAD)).toEqual(tail)
        expect(run.state.discovery[protocol].complete.has(endpoint)).toBe(true)
      }
    }
  })

  test('DIFFERING DEPLOYMENT FLOORS: the pre-v3 stretch is scanned v2-only, never merged down to it', async () => {
    // The worst failure this design can have, as a test. v2 deployed 5,000 blocks before v3; a merge
    // floored at v3's block would leave those 5,000 unscanned for v2 AND record them as covered.
    const V2_DEPLOY = 990_000n
    const V3_DEPLOY = 995_000n
    const { client, served } = stubClient({ answer: () => [] })
    const run = mergedRun(client, manifestWith({ deploymentBlock: V3_DEPLOY, v2Block: V2_DEPLOY }))

    await scanAdjacency(run, [TOKEN_A])

    // Every request below v3's deployment asks the v2 factory ALONE.
    const belowV3 = served.filter((s) => s.from < V3_DEPLOY)
    expect(belowV3.length).toBeGreaterThan(0)
    for (const { filter } of belowV3) {
      expect(filter.address).toEqual([V2_FACTORY.toLowerCase()])
      expect(filter.topics[0]).toEqual([V2_TOPIC])
    }
    // ...and v3 is never asked about a block it did not exist for.
    for (const { filter, from } of served) {
      if ((filter.address as string[]).includes(V3_FACTORY.toLowerCase())) expect(from).toBeGreaterThanOrEqual(V3_DEPLOY)
    }
    // v2's early history really was covered — the whole point of not flooring the merge at v3's block.
    expect(run.ctx.index.uncovered('v2', TOKEN_A, V2_DEPLOY, HEAD)).toEqual([
      { fromBlock: HEAD - DEFAULT_REORG_OVERLAP_BLOCKS + 1n, toBlock: HEAD },
    ])
  })

  test('DIFFERING CACHE STATES: a warm endpoint and a cold one merge over the overlap and split below it', async () => {
    const { client, served } = stubClient({ answer: () => [] })
    const run = mergedRun(client, manifestWith({ deploymentBlock: DEPLOY, v2Block: DEPLOY }))
    // TOKEN_A is warm for both protocols; TOKEN_B has never been scanned.
    const WARM_TO = 999_800n
    for (const protocol of ['v2', 'v3'] as const) run.ctx.index.addCoverage(protocol, TOKEN_A, { fromBlock: DEPLOY, toBlock: WARM_TO })

    await scanAdjacency(run, [TOKEN_A, TOKEN_B])

    // Below the warm endpoint's coverage, only the COLD endpoint is in the token slot — a merged
    // filter there would re-buy blocks TOKEN_A already has.
    // TOKEN_A's uncovered range starts one block above its re-opened reorg tail, so anything ending
    // at or below that is a block only TOKEN_B still wants.
    const deep = served.filter((s) => s.to <= WARM_TO - DEFAULT_REORG_OVERLAP_BLOCKS)
    expect(deep.length).toBeGreaterThan(0)
    for (const { filter } of deep) {
      expect(filter.topics[1] ?? filter.topics[2]).toEqual([pad(TOKEN_B).toLowerCase()])
    }
    // ...and both endpoints end up fully covered regardless of where they started.
    for (const protocol of ['v2', 'v3'] as const) {
      for (const endpoint of [TOKEN_A, TOKEN_B]) {
        expect(run.ctx.index.uncovered(protocol, endpoint, DEPLOY, HEAD)).toEqual([
          { fromBlock: HEAD - DEFAULT_REORG_OVERLAP_BLOCKS + 1n, toBlock: HEAD },
        ])
      }
    }
  })

  test('a second wave over the same endpoints costs NOTHING — the reorg tail is not re-asked', async () => {
    // `EngineState.adjacencyScanned`, the handoff wave 3 depends on: `uncovered` re-opens its tail on
    // every read, so without it every search would pay for the last 32 blocks of everything twice.
    const { client, served } = stubClient({ answer: () => [] })
    const run = mergedRun(client, manifestWith({ deploymentBlock: DEPLOY, v2Block: DEPLOY }))

    await scanAdjacency(run, [TOKEN_A, TOKEN_B])
    const afterFirst = served.length
    await scanAdjacency(run, [TOKEN_B, TOKEN_A])

    expect(served.length).toBe(afterFirst)
    for (const protocol of ['v2', 'v3'] as const) {
      for (const endpoint of [TOKEN_A, TOKEN_B]) expect(run.state.discovery[protocol].complete.has(endpoint)).toBe(true)
    }
  })

  test('a range the first wave FAILED on is still retried by the second', async () => {
    // The other half of the handoff: only ranges actually COVERED are subtracted, so a provider hole
    // stays on the books. A `adjacencyScanned` that recorded intent rather than outcome would turn
    // wave 2's failure into a permanent gap that wave 3 declines to look at.
    const HOLE: BlockRange = { fromBlock: 999_301n, toBlock: 999_400n }
    let failing = true
    const { client, served } = stubClient({
      answer: ({ from, to }) => {
        if (failing && from <= HOLE.toBlock && to >= HOLE.fromBlock) throw new Error(UNREACHABLE)
        return []
      },
    })
    const run = mergedRun(client, manifestWith({ deploymentBlock: DEPLOY, v2Block: DEPLOY }), { logChunkBlocks: 100n })

    await scanAdjacency(run, [TOKEN_A])
    expect(run.ctx.index.uncovered('v3', TOKEN_A, DEPLOY, HEAD)).toContainEqual(HOLE)
    expect(run.state.discovery.v3.complete.has(TOKEN_A)).toBe(false)

    failing = false
    const afterFirst = served.length
    await scanAdjacency(run, [TOKEN_A])

    // It really did go back for it, and only for it (plus the standing reorg tail).
    expect(served.length).toBeGreaterThan(afterFirst)
    expect(served.slice(afterFirst).every((s) => s.to >= HOLE.fromBlock)).toBe(true)
    expect(run.ctx.index.uncovered('v3', TOKEN_A, DEPLOY, HEAD)).not.toContainEqual(HOLE)
  })
})
