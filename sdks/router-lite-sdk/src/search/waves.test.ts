import { expect, test } from 'bun:test'
import type { Address, Hex, Log } from 'viem'
import { encodeAbiParameters, toHex, zeroAddress } from 'viem'

import { DEFAULT_REORG_OVERLAP_BLOCKS, MAX_INTERMEDIATES, PREFLIGHT_TOP_K } from '../constants'
import { UnsupportedRouteError } from '../errors'
import { sortAddresses } from '../internal/currency'
import { createSemaphore } from '../internal/rpc'
import { assertResultCoherent, rateLimitHttpError, v2Ref, v3Ref, v4Ref } from '../internal/testing'
import { wave0PairScanBlocks } from '../manifest'
import { isDiscredited, PoolIndex } from '../pools/poolIndex'
import type { V4PoolRef } from '../protocols/poolRef'
import type { ProtocolModule, QuoteProbe } from '../protocols/types'
import { classifySwap } from '../router'
import type {
  BlockRef,
  ChainManifest,
  CurrencyRef,
  PoolHint,
  PoolRecord,
  PoolRef,
  Protocol,
  QuoteCall,
  QuoteRequest,
  QuoteResult,
  QuotedRoute,
  Reason,
  RouteLeg,
  SearchReport,
  SwapRequest,
  SwapResult,
} from '../types'

import { generateRoutes, routeId } from './candidates'
import { node } from './discovery'
import { evaluate } from './leader'
import type { InternalResult, Run, SearchContext } from './waves'
import { initialState, searchWaves, selectFocus } from './waves'

// ---------------------------------------------------------------------------
// Everything here is scripted: stub ProtocolModules (no ABI work, no real
// protocol behavior) and a stub client whose every response is registered up
// front. Unregistered `eth_call`s revert — which is exactly what "there is no
// pool there" looks like to the engine, so a probe for a pool the script never
// created fails the same way it would on chain.
// ---------------------------------------------------------------------------

const TOKEN_A = `0x${'aa'.repeat(20)}` as Address
const TOKEN_B = `0x${'bb'.repeat(20)}` as Address
const MID = `0x${'cc'.repeat(20)}` as Address
const WETH = `0x${'ee'.repeat(20)}` as Address
const TRADER = `0x${'11'.repeat(20)}` as Address
const UNIVERSAL_ROUTER = `0x${'22'.repeat(20)}` as Address
const PERMIT2 = `0x${'33'.repeat(20)}` as Address
const V2_FACTORY = `0x${'44'.repeat(20)}` as Address
const V3_FACTORY = `0x${'55'.repeat(20)}` as Address
const V3_QUOTER = `0x${'66'.repeat(20)}` as Address
const V4_POOL_MANAGER = `0x${'77'.repeat(20)}` as Address
const V4_QUOTER = `0x${'88'.repeat(20)}` as Address

const BLOCK_NUMBER = 1_000_000n
const BLOCK_TIMESTAMP = 1_700_000_000n
const BLOCK_HASH = `0x${'ab'.repeat(32)}` as Hex

const AMOUNT_IN = 1000n

/** A `NotEnoughLiquidity(bytes32 poolId)`-shaped custom-error revert: real revert data. The exact
 * bytes don't matter to `revertDataOf` — only that `data` is non-empty. */
const NOT_ENOUGH_LIQUIDITY_DATA: Hex = '0xf29b7f9800000000000000000000000000000000000000000000000000000000000001'

/** Tag byte distinguishing pool families so a speculative pool and a scanned pool never collide. */
const V2_TAG = '22'
const SCANNED_TAG = '99'
/** The only fee tier the v3 stub speculates on; anything else must be discovered, never guessed. */
const STANDARD_FEE = 3000
const NONSTANDARD_FEE = 250

const TOPIC: Record<'v2' | 'v3', Hex> = { v2: '0xf2', v3: '0xf3' }
const FEE_TOPIC: Hex = '0xfee0'
const V4_TOPIC: Hex = '0xf4'

function resolveAddress(c: CurrencyRef): Address {
  return c === 'native' ? WETH : c
}

/** v3 pools live at a fee-derived tag, so a pool on an undiscovered tier is unreachable by guessing. */
function feeTag(fee: number): string {
  return (fee % 256).toString(16).padStart(2, '0')
}

/**
 * Deterministic synthetic pool address: tag byte + 19 nibbles of each sorted token.
 *
 * The widths are 19+19 rather than 18+18 so the result is a REAL 20-byte address (2 + 19 + 19 = 40
 * nibbles). It used to be 38 nibbles — a value no chain could ever produce, which the package's
 * lowercased string comparisons happily accepted. Now that plan invariants compare with viem's
 * `isAddressEqual` (R3), a malformed fixture throws `InvalidAddressError` instead of silently not
 * matching, which is the point: the test data has to be as well-formed as the data it stands in for.
 */
function poolAddress(tag: string, a: CurrencyRef, b: CurrencyRef): Address {
  const [t0, t1] = sortAddresses(resolveAddress(a), resolveAddress(b))
  return `0x${tag}${t0.slice(2, 21)}${t1.slice(2, 21)}` as Address
}

function stubPoolRef(id: 'v2' | 'v3', a: CurrencyRef, b: CurrencyRef, opts: { tag?: string; fee?: number } = {}): PoolRef {
  const fee = opts.fee ?? STANDARD_FEE
  const tag = opts.tag ?? (id === 'v2' ? V2_TAG : feeTag(fee))
  const [token0, token1] = sortAddresses(resolveAddress(a), resolveAddress(b))
  const address = poolAddress(tag, a, b)
  return id === 'v2' ? v2Ref(address, token0, token1) : v3Ref(address, token0, token1, fee)
}

/** v4 pools are quoted at the quoter, not at an address of their own — the poolId is their identity. */
function quoteTarget(pool: PoolRef): Address {
  return pool.protocol === 'v4' ? V4_QUOTER : pool.address
}

function stubV4PoolRef(a: CurrencyRef, b: CurrencyRef): PoolRef {
  const [currency0, currency1] = sortAddresses(resolveAddress(a), resolveAddress(b))
  return v4Ref({ currency0, currency1, fee: 3000, tickSpacing: 60, hooks: zeroAddress })
}

/** A v4 pool whose poolKey keeps v4's real on-chain address(0) spelling for native, unresolved to
 * the wrapped address — the shape `PoolRef.currencies`/`rememberPool` must normalize before graph
 * lookups. */
function stubV4NativePoolRef(other: Address): V4PoolRef {
  return v4Ref({ currency0: zeroAddress, currency1: other, fee: 3000, tickSpacing: 60, hooks: zeroAddress })
}

/** A quote call is fully identified by its legs and its input amount — that is the whole stub protocol. */
function quoteData(legs: RouteLeg[], amountIn: bigint): Hex {
  return toHex(`${legs.map((l) => l.pool.id).join('>')}@${amountIn}`)
}

function stubQuote(legs: RouteLeg[], amountIn: bigint): QuoteCall {
  return {
    call: { to: quoteTarget(legs[0]!.pool), data: quoteData(legs, amountIn) },
    decode: (returnData: Hex) => BigInt(returnData),
  }
}

/** Registers "quoting this pool path with `amountIn` returns `amountOut`" with the stub client. */
function quoteEntry(pools: PoolRef[], amountIn: bigint, amountOut: bigint): Record<string, Hex> {
  const legs = pools.map((pool) => ({ pool }) as RouteLeg)
  const { call } = stubQuote(legs, amountIn)
  return { [`${call.to.toLowerCase()}:${call.data}`]: toHex(amountOut) }
}

function stubModule(id: 'v2' | 'v3'): ProtocolModule {
  return {
    id,
    enabled: (m) => (id === 'v2' ? !!m.v2 : !!m.v3),

    speculativeDirect(a, b, amountIn): QuoteProbe[] {
      const pool = stubPoolRef(id, a, b)
      const legs: RouteLeg[] = [{ pool, currencyIn: a, currencyOut: b }]
      return [{ candidate: { legs }, quote: stubQuote(legs, amountIn) }]
    },

    adjacency(endpoint, m) {
      const contract = id === 'v2' ? m.v2!.factory : m.v3!.factory
      const topic = endpoint.toLowerCase() as Hex
      return [
        { address: contract, topics: [TOPIC[id], topic] },
        { address: contract, topics: [TOPIC[id], null, topic] },
      ]
    },

    exactPair(a, b, m) {
      const contract = id === 'v2' ? m.v2!.factory : m.v3!.factory
      const [t0, t1] = sortAddresses(resolveAddress(a), resolveAddress(b))
      return { address: contract, topics: [TOPIC[id], t0.toLowerCase() as Hex, t1.toLowerCase() as Hex] }
    },

    // v3 alone has governance-extensible fee tiers, so only the v3 stub carries fee discovery.
    ...(id === 'v3' && {
      feeDiscovery: {
        query: (m: ChainManifest) => ({ address: m.v3!.factory, topics: [FEE_TOPIC] }),
        feesFromLogs: (logs: Log[]) => logs.map((log) => (log as Log & { fee?: number }).fee).filter((f): f is number => f !== undefined),
        probes: (a: CurrencyRef, b: CurrencyRef, amountIn: bigint, fees: number[]): QuoteProbe[] =>
          fees.map((fee) => {
            const pool = stubPoolRef('v3', a, b, { fee })
            const legs: RouteLeg[] = [{ pool, currencyIn: a, currencyOut: b }]
            return { candidate: { legs }, quote: stubQuote(legs, amountIn) }
          }),
      },
    }),

    parsePoolLog(log) {
      const record = (log as Log & { record?: PoolRecord }).record
      return record && record.pool.protocol === id ? record : null
    },

    async validateHint(hint) {
      if (hint.protocol === 'v4' || hint.protocol !== id) return null
      const fee = hint.protocol === 'v3' ? hint.fee : undefined
      return { pool: stubPoolRef(id, hint.token0, hint.token1, { ...(fee !== undefined && { fee }) }), source: 'hint' }
    },

    encodeQuote(legs, amountIn) {
      return stubQuote(legs, amountIn)
    },

    compileOperation(legs, custody) {
      return id === 'v2'
        ? { kind: 'v2-swap', legs, payer: custody.payer, recipient: custody.recipient }
        : { kind: 'v3-swap', legs, payer: custody.payer, recipient: custody.recipient }
    },
  }
}

/**
 * v4 exists here only for the exact-pair scan: it never speculates (a v4 pool's existence cannot be
 * guessed from the pair alone), so every v4 pool in these tests arrives through an Initialize log.
 * Its adjacency queries put the endpoint one slot further right than v2/v3, mirroring the real
 * event, which is how the stub client tells a pair query from an adjacency query.
 */
const v4StubModule: ProtocolModule = {
  id: 'v4',
  enabled: (m) => !!m.v4,
  speculativeDirect: () => [],

  adjacency(endpoint, m) {
    const topic = endpoint.toLowerCase() as Hex
    return [
      { address: m.v4!.poolManager, topics: [V4_TOPIC, null, topic] },
      { address: m.v4!.poolManager, topics: [V4_TOPIC, null, null, topic] },
    ]
  },

  exactPair(a, b, m) {
    const [t0, t1] = sortAddresses(resolveAddress(a), resolveAddress(b))
    return { address: m.v4!.poolManager, topics: [V4_TOPIC, null, t0.toLowerCase() as Hex, t1.toLowerCase() as Hex] }
  },

  parsePoolLog(log) {
    const record = (log as Log & { record?: PoolRecord }).record
    return record && record.pool.protocol === 'v4' ? record : null
  },

  validateHint: async () => null,

  encodeQuote(legs, amountIn) {
    return stubQuote(legs, amountIn)
  },

  compileOperation(legs, custody) {
    return { kind: 'v4-swap', legs, settleFrom: custody.payer, takeTo: custody.recipient }
  },
}

const modules: Record<Protocol, ProtocolModule> = { v2: stubModule('v2'), v3: stubModule('v3'), v4: v4StubModule }

function manifestWith(
  opts: {
    v3?: boolean
    v4?: boolean
    coreIntermediates?: Address[]
    deploymentBlock?: bigint
    chain?: ChainManifest['chain']
  } = {},
): ChainManifest {
  const deploymentBlock = opts.deploymentBlock ?? 100n
  const manifest: ChainManifest = {
    chainId: 1,
    wrappedNative: WETH,
    v2: { factory: V2_FACTORY, deploymentBlock },
    execution: { address: UNIVERSAL_ROUTER, commandSet: 'ur-2.0', permit2: PERMIT2, wrappedNative: WETH },
    coreIntermediates: opts.coreIntermediates ?? [WETH],
  }
  if (opts.chain) manifest.chain = opts.chain
  if (opts.v3) manifest.v3 = { factory: V3_FACTORY, deploymentBlock, v3QuoterV2: V3_QUOTER }
  if (opts.v4) manifest.v4 = { poolManager: V4_POOL_MANAGER, deploymentBlock, quoter: V4_QUOTER }
  return manifest
}

// ---------------------------------------------------------------------------
// Stub client
// ---------------------------------------------------------------------------

type LogScript = (endpoint: string) => (Log & { record: PoolRecord })[]

type ClientScript = {
  calls?: Record<string, Hex>
  logs?: LogScript
  /** `FeeAmountEnabled` history for the v3 factory. */
  feeLogs?: (Log & { fee: number })[]
  /** v4 `Initialize` history matched by the exact-pair query. */
  pairLogs?: (Log & { record: PoolRecord })[]
  /** Endpoints (lowercased) whose adjacency scans always fail, simulating a broken log source. */
  failScansFor?: string[]
  /** Consumed in order by preflight simulations; anything past the end succeeds. */
  preflight?: ('ok' | 'revert')[]
  readiness?: { balance?: bigint; erc20Allowance?: bigint; permit2Allowance?: bigint }
  /** Aborts the controller once this many `eth_call`s have been served. */
  abortAfterCalls?: number
  /** Milliseconds each `eth_getLogs` takes to answer, so a test can give a scan a shape in TIME
   * rather than only in results — which is the only way to observe anything that happens *during*
   * one (`waves.ts#quoteWhileDiscovering`). */
  logDelayMs?: number
  /** Evaluated after every `eth_getLogs` this stub serves; aborts the controller the first time it
   * is true. The budget-expiry trigger, expressed as a fact about what the search has LEARNED
   * (`index.pair(...).length`) rather than as a request count, so it cannot drift when chunk
   * batching changes underneath it. */
  abortWhen?: () => boolean
  controller?: AbortController
  /** Call keys (`${to}:${data}`, lowercased) that must revert WITH real revert data attached —
   * simulating a `NotEnoughLiquidity`-shaped custom error — instead of the default data-less
   * "no pool there" revert. See the C4-H3 negative-cache poisoning regression tests below. */
  dataReverts?: Record<string, Hex>
  /** The head to pin, as a function where a test needs it to ADVANCE between successive
   * `searchWaves` runs over the same `PoolIndex` — which is the only way to accumulate evidence at
   * *distinct* blocks, and therefore the only way to reach a hint demotion the honest way. */
  blockNumber?: () => bigint
}

type Counters = {
  scans: number
  preflights: number
  calls: number
  scannedEndpoints: Set<string>
  feeScans: number
  pairScans: number
  pairScanRanges: { fromBlock: bigint; toBlock: bigint }[]
  /** Every `eth_call` this stub actually served (registered or reverted), keyed by `${to}:${data}` —
   * finer-grained than `calls` so a test can assert exactly one candidate's call count across
   * multiple `searchWaves` invocations sharing the same `PoolIndex`. */
  callsByKey: Map<string, number>
}

function stubClient(script: ClientScript): { client: SearchContext['client']; counters: Counters } {
  const counters: Counters = {
    scans: 0,
    preflights: 0,
    calls: 0,
    scannedEndpoints: new Set(),
    feeScans: 0,
    pairScans: 0,
    pairScanRanges: [],
    callsByKey: new Map(),
  }
  const calls = script.calls ?? {}
  const balance = script.readiness?.balance ?? 10n ** 24n
  const erc20Allowance = script.readiness?.erc20Allowance ?? 10n ** 24n
  const permit2Allowance = script.readiness?.permit2Allowance ?? 10n ** 24n
  let preflightIndex = 0

  const client = {
    async request(args: any) {
      if (args.method === 'eth_getBlockByNumber') {
        return { number: toHex(script.blockNumber?.() ?? BLOCK_NUMBER), hash: BLOCK_HASH, timestamp: toHex(BLOCK_TIMESTAMP) }
      }
      if (args.method === 'eth_getBalance') return toHex(balance)
      if (args.method === 'eth_getLogs') {
        if (script.logDelayMs !== undefined) await new Promise((r) => setTimeout(r, script.logDelayMs))
        const served = serveLogs(args.params[0])
        if (script.abortWhen?.()) script.controller?.abort()
        return served
      }
      if (args.method !== 'eth_call') throw new Error(`stubClient: unexpected method ${args.method}`)

      const [{ to, data }] = args.params
      const target = (to as string).toLowerCase()

      if (target === UNIVERSAL_ROUTER.toLowerCase()) {
        counters.preflights++
        const outcome = script.preflight?.[preflightIndex++] ?? 'ok'
        if (outcome === 'revert') throw Object.assign(new Error('execution reverted'), { data: '0xdeadbeef' })
        return '0x'
      }
      if (target === PERMIT2.toLowerCase()) {
        return encodeAbiParameters([{ type: 'uint160' }, { type: 'uint48' }, { type: 'uint48' }], [permit2Allowance, 2_000_000_000, 0])
      }
      if (target === TOKEN_A.toLowerCase() || target === TOKEN_B.toLowerCase()) {
        // balanceOf(address) has one argument; allowance(address,address) has two.
        const value = (data as string).length <= 10 + 64 ? balance : erc20Allowance
        return encodeAbiParameters([{ type: 'uint256' }], [value])
      }

      counters.calls++
      if (script.abortAfterCalls !== undefined && counters.calls >= script.abortAfterCalls) script.controller?.abort()

      const key = `${target}:${data}`
      counters.callsByKey.set(key, (counters.callsByKey.get(key) ?? 0) + 1)

      const entry = calls[key]
      if (entry === undefined) {
        const dataRevertData = script.dataReverts?.[key]
        if (dataRevertData !== undefined) throw Object.assign(new Error('execution reverted'), { data: dataRevertData })
        throw new Error('execution reverted') // no pool there
      }
      return entry
    },

  } as unknown as SearchContext['client']

  /**
   * Serves an `eth_getLogs` filter exactly as a node would — including refusing an unfiltered one.
   *
   * A provider that received `topics: []` would answer with every log the contract ever emitted,
   * which for a real PoolManager is its entire swap history. Throwing here means any regression
   * that drops the scanner's topic filter (viem's `getLogs` action silently does, which is why the
   * scanner issues a raw request) fails every scan-driven test in this file rather than quietly
   * making them pass against a firehose.
   */
  function serveLogs(filter: any): Log[] {
    if (!Array.isArray(filter.topics) || filter.topics.length === 0)
      throw new Error('stubClient: eth_getLogs arrived with no topic filter')

    const fromBlock = BigInt(filter.fromBlock)
    const toBlock = BigInt(filter.toBlock)
    const inRange = (log: Log): boolean => {
      const block = log.blockNumber ?? 0n
      return block >= fromBlock && block <= toBlock
    }

    if (filter.topics[0] === FEE_TOPIC) {
      counters.feeScans++
      return (script.feeLogs ?? []).filter(inRange)
    }

    if (filter.topics[0] === V4_TOPIC) {
      const bound = (filter.topics as (string | null)[]).slice(1).filter((t): t is string => typeof t === 'string')
      // Two bound token topics is an exact-pair query; one is an adjacency query.
      if (bound.length >= 2) {
        counters.pairScans++
        counters.pairScanRanges.push({ fromBlock, toBlock })
        return (script.pairLogs ?? []).filter(inRange)
      }
      counters.scans++
      if (bound[0] !== undefined) counters.scannedEndpoints.add(bound[0].toLowerCase())
      return []
    }

    counters.scans++
    const endpoint = [filter.topics[1], filter.topics[2]].find((t: unknown) => typeof t === 'string') as
      | string
      | undefined
    if (endpoint === undefined) return []
    counters.scannedEndpoints.add(endpoint.toLowerCase())
    if (script.failScansFor?.includes(endpoint.toLowerCase())) throw new Error('log source unavailable')
    if (!script.logs) return []
    return script.logs(endpoint.toLowerCase()).filter(inRange)
  }

  return { client, counters }
}

function scannedRecord(id: 'v2' | 'v3', a: CurrencyRef, b: CurrencyRef, createdAtBlock: bigint): Log & { record: PoolRecord } {
  const pool = stubPoolRef(id, a, b, { tag: SCANNED_TAG })
  return {
    address: V2_FACTORY,
    topics: [TOPIC[id]],
    data: '0x',
    blockNumber: createdAtBlock,
    record: { pool, createdAtBlock, source: 'event' },
  } as unknown as Log & { record: PoolRecord }
}

function makeContext(
  client: SearchContext['client'],
  manifest: ChainManifest,
  overrides: Partial<SearchContext> = {},
): SearchContext {
  return { client, manifest, modules, index: new PoolIndex(WETH), hookData: new Map(), ...overrides }
}

const quoteReq: QuoteRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: AMOUNT_IN }
const swapReq: SwapRequest = { ...quoteReq, trader: TRADER }

async function drain(gen: AsyncGenerator<InternalResult>): Promise<InternalResult[]> {
  const events: InternalResult[] = []
  for await (const e of gen) events.push(e)
  return events
}

/** How `getSwap`/`getQuote` consume the engine: stop pulling at the first actionable result. */
async function drainUntilActionable(gen: AsyncGenerator<InternalResult>): Promise<InternalResult[]> {
  const events: InternalResult[] = []
  for await (const e of gen) {
    events.push(e)
    const actionable = e.best !== undefined && (e.best.execution === 'verified' || (e.requirements?.length ?? 0) > 0)
    if (actionable || e.done) break
  }
  return events
}

/** Mirrors `router.ts#inconclusiveReason`'s precedence (rpc-degraded > aborted > discovery-incomplete
 * > quotes-unattempted) so `classify`'s hand-rolled `inconclusive` branches below always name an axis
 * that is genuinely set on `search` — `assertResultCoherent`'s C4-P5 checks enforce exactly that. */
function reasonFor(search: SearchReport): Reason {
  if (search.quoting.transportFailed > 0 || search.verificationDegraded || search.headRegressed) {
    return { code: 'rpc-degraded', detail: 'rpc-degraded' }
  }
  if (search.aborted) return { code: 'aborted', detail: 'search was aborted before completion' }
  if (Object.values(search.discovery).some((d) => d.status === 'partial' || d.status === 'failed')) {
    return { code: 'discovery-incomplete', detail: 'discovery incomplete' }
  }
  // The only remaining possibility, given every caller below only reaches this function when its own
  // local `complete` (aborted / unattempted / discovery, the same three axes checked above minus
  // rpc-degraded) is false.
  return { code: 'quotes-unattempted', detail: 'quote candidate(s) never attempted' }
}

/** The classification Task 18 performs, inlined so every test can assert honesty invariants. Kept in
 * the same shape as the real `classifyQuote`/`classifySwap`: `alternatives` on every variant, the
 * quote path stripping the engine's execution extras, and `inconclusive` carrying whatever the
 * search did manage to find. */
function classify(kind: 'quote' | 'swap', e: InternalResult): QuoteResult | SwapResult {
  const search = e.report
  const complete =
    !search.aborted &&
    search.quoting.unattempted === 0 &&
    Object.values(search.discovery).every((d) => d.status === 'complete' || d.status === 'disabled')
  const noViableRoute: Reason = { code: 'no-viable-route', detail: 'none' }

  if (kind === 'quote') {
    const toQuoted = ({ route, quote }: QuotedRoute): QuotedRoute => ({ route, quote })
    const alternatives = e.alternatives.map(toQuoted)
    if (!e.best)
      return complete
        ? { status: 'no-route', reason: noViableRoute, alternatives, search }
        : { status: 'inconclusive', reason: reasonFor(search), alternatives, search }
    return { status: 'quote', best: toQuoted(e.best), alternatives, search }
  }

  const alternatives = e.alternatives
  if (!e.best)
    return complete
      ? { status: 'no-route', reason: noViableRoute, alternatives, search }
      : { status: 'inconclusive', reason: reasonFor(search), alternatives, search }
  if ((e.requirements?.length ?? 0) > 0)
    return { status: 'needs-action', best: e.best, tx: e.tx!, requirements: e.requirements!, limits: e.limits!, alternatives, search }
  if (e.best.execution === 'verified')
    return {
      status: 'ready',
      best: e.best,
      tx: e.tx!,
      execution: { verifiedAtBlock: search.block },
      limits: e.limits!,
      alternatives,
      search,
    }
  // Mirrors the real `classifySwap`'s own `complete` check for this exact shape (a best that never
  // reached ready/needs-action): COMPLETE names it `no-route`/`no-route-verified` (folding `best`
  // into `alternatives`, since `no-route` carries no `best` field at all) — only an INCOMPLETE search
  // is entitled to `inconclusive`, and only then with an axis `reasonFor` can actually back (F5: a
  // `no-route`-only code on an `inconclusive` result fails `assertResultCoherent`'s whitelist).
  if (complete) {
    return { status: 'no-route', reason: { code: 'no-route-verified', detail: 'unverified' }, alternatives: [e.best, ...alternatives], search }
  }
  // The incomplete-search twin of the `complete` branch above: a route the chain has already
  // rejected in preflight is never offered as a lead, whatever else the search failed to finish —
  // mirrors the real `classifySwap`'s own `e.best.execution === 'failed'` branch (`router.ts`).
  if (e.best.execution === 'failed') {
    return { status: 'inconclusive', reason: reasonFor(search), alternatives: [e.best, ...alternatives], search }
  }
  return {
    status: 'inconclusive',
    reason: reasonFor(search),
    best: e.best,
    ...(e.tx !== undefined && { tx: e.tx }),
    alternatives,
    search,
  }
}

function assertCoherent(kind: 'quote' | 'swap', events: InternalResult[]): void {
  for (const e of events) assertResultCoherent(classify(kind, e))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('wave 0 hint resolves a swap without any log scan', async () => {
  // The hinted pool sits on a fee tier no module speculates on, so the only way to reach it is
  // through hint validation: with `hints` removed this search finds nothing at all.
  const hintedPool = stubPoolRef('v3', TOKEN_A, TOKEN_B, { fee: NONSTANDARD_FEE })
  const { client, counters } = stubClient({ calls: { ...quoteEntry([hintedPool], AMOUNT_IN, 100n) } })
  const ctx = makeContext(client, manifestWith({ v3: true }))

  const req: SwapRequest = { ...swapReq, hints: [{ protocol: 'v3', token0: TOKEN_A, token1: TOKEN_B, fee: NONSTANDARD_FEE }] }
  const events = await drainUntilActionable(searchWaves(ctx, req, 'swap'))

  expect(events[0]!.best?.execution).toBe('verified')
  expect(events[0]!.best?.quote.amountOut).toBe(100n)
  expect(events[0]!.best?.route.legs[0]!.pool).toMatchObject({ protocol: 'v3', fee: NONSTANDARD_FEE })
  expect(events[0]!.tx?.to).toBe(UNIVERSAL_ROUTER)
  expect(counters.scans).toBe(0) // stopped before adjacency waves ran
  assertCoherent('swap', events)
})

test('without the hint, the same unguessable pool is never found in wave 0', async () => {
  const hintedPool = stubPoolRef('v3', TOKEN_A, TOKEN_B, { fee: NONSTANDARD_FEE })
  const { client } = stubClient({ calls: { ...quoteEntry([hintedPool], AMOUNT_IN, 100n) } })
  const ctx = makeContext(client, manifestWith({ v3: true }))

  const events = await drainUntilActionable(searchWaves(ctx, swapReq, 'swap'))

  expect(events[0]!.best).toBeUndefined()
})

test('iterator yields only on improvement, final yield has done=true', async () => {
  const directPool = stubPoolRef('v2', TOKEN_A, TOKEN_B)
  const aMidPool = stubPoolRef('v2', TOKEN_A, MID, { tag: SCANNED_TAG })
  const midBPool = stubPoolRef('v2', MID, TOKEN_B, { tag: SCANNED_TAG })

  const { client, counters } = stubClient({
    calls: {
      ...quoteEntry([directPool], AMOUNT_IN, 100n),
      ...quoteEntry([aMidPool], AMOUNT_IN, 500n),
      ...quoteEntry([midBPool], 500n, 250n),
    },
    logs: (endpoint) => {
      if (endpoint === TOKEN_A.toLowerCase()) return [scannedRecord('v2', TOKEN_A, MID, 400n)]
      if (endpoint === TOKEN_B.toLowerCase()) return [scannedRecord('v2', MID, TOKEN_B, 450n)]
      return []
    },
  })
  const ctx = makeContext(client, manifestWith())

  // wave 0 quotes the direct pool (100n); the MID leg pools only become known once *both*
  // endpoints' adjacency has been scanned, so the improvement lands in the final wave.
  const events = await drain(searchWaves(ctx, quoteReq, 'quote'))

  expect(events.map((e) => e.best?.quote.amountOut)).toEqual([100n, 250n])
  expect(events.at(-1)!.done).toBe(true)
  expect(counters.scans).toBeGreaterThan(0)
  assertCoherent('quote', events)
})

test('abort between waves → aborted report, best-so-far kept', async () => {
  const controller = new AbortController()
  const directPool = stubPoolRef('v2', TOKEN_A, TOKEN_B)
  const { client, counters } = stubClient({
    calls: { ...quoteEntry([directPool], AMOUNT_IN, 100n) },
    abortAfterCalls: 1,
    controller,
    logs: () => [scannedRecord('v2', TOKEN_A, MID, 400n)],
  })
  const ctx = makeContext(client, manifestWith())

  const events = await drain(searchWaves(ctx, { ...quoteReq, signal: controller.signal }, 'quote'))

  expect(events.at(-1)!.report.aborted).toBe(true)
  expect(events.at(-1)!.done).toBe(true)
  expect(events.at(-1)!.best?.quote.amountOut).toBe(100n) // best-so-far survives the abort
  expect(counters.scans).toBe(0) // no adjacency wave ran after the abort
  assertCoherent('quote', events)
})

test('preflight failure falls through to next candidate', async () => {
  const v2Pool = stubPoolRef('v2', TOKEN_A, TOKEN_B)
  const v3Pool = stubPoolRef('v3', TOKEN_A, TOKEN_B)
  const { client, counters } = stubClient({
    calls: {
      ...quoteEntry([v2Pool], AMOUNT_IN, 100n),
      ...quoteEntry([v3Pool], AMOUNT_IN, 300n), // ranks first, and reverts in simulation
    },
    preflight: ['revert', 'ok'],
  })
  const ctx = makeContext(client, manifestWith({ v3: true }))

  const events = await drainUntilActionable(searchWaves(ctx, swapReq, 'swap'))

  expect(events.at(-1)!.best?.execution).toBe('verified')
  expect(events.at(-1)!.best?.quote.amountOut).toBe(100n)
  expect(events.at(-1)!.alternatives.some((a) => a.execution === 'failed')).toBe(true)
  expect(events.at(-1)!.alternatives.find((a) => a.execution === 'failed')?.revertData).toBe('0xdeadbeef')
  expect(counters.preflights).toBe(2)
  assertCoherent('swap', events)
})

test('preflight budget exhaustion (C4-P7): reported when PREFLIGHT_TOP_K reverts leave an untried, non-failed candidate on the table', async () => {
  // Four direct-pair candidates via hints (distinct v3 fee tiers), all of which revert in
  // simulation. `verifyLeader` bounds each wave's OWN attempts at PREFLIGHT_TOP_K (3), so wave 0
  // reverts through exactly three of them and leaves the fourth untried — exactly the shape
  // `SearchReport.verification.preflightBudgetExhausted` exists to make visible, since nothing about
  // the no-route/inconclusive verdict itself would otherwise say a budget, not a lack of candidates,
  // was what stopped this wave's search for a leader.
  const fees = [100, 500, 3000, 10000]
  const pools = fees.map((fee) => stubPoolRef('v3', TOKEN_A, TOKEN_B, { fee }))
  const calls: Record<string, Hex> = {}
  pools.forEach((pool, i) => Object.assign(calls, quoteEntry([pool], AMOUNT_IN, BigInt(400 - i * 10))))
  const { client, counters } = stubClient({ calls, preflight: ['revert', 'revert', 'revert', 'revert'] })
  const ctx = makeContext(client, manifestWith({ v3: true }))

  const hints: PoolHint[] = fees.map((fee) => ({ protocol: 'v3', token0: TOKEN_A, token1: TOKEN_B, fee }))
  const req: SwapRequest = { ...swapReq, hints }

  const events = await drain(searchWaves(ctx, req, 'swap'))
  const wave0Result = events[0]!

  expect(counters.preflights).toBeGreaterThanOrEqual(PREFLIGHT_TOP_K)
  expect(wave0Result.report.verification.preflightAttempted).toBe(PREFLIGHT_TOP_K)
  expect(wave0Result.report.verification.preflightBudgetExhausted).toBe(true)
  assertCoherent('swap', events)
})

// ---------------------------------------------------------------------------
// `evaluate()` report-ordering regressions.
//
// `evaluate` used to build `SearchReport` (and the `compileError`/`requirements` base) BEFORE calling
// `verifyLeader` — so anything `verifyLeader`/`compileAndEncode` mutate on `state` during THAT SAME
// call (`verificationDegraded`, `firstCompileError`) was captured one wave stale. For an ONGOING
// search that self-heals by the next wave (the state persists, so a later wave's report already
// reflects it), but for the search's FINAL evaluation there is no next wave to catch it up — a fact
// discovered for the first time in the last wave was silently dropped from the report that caller
// actually sees. Both regressions below reproduce that exact shape — "nothing evaluated before this
// call" — via `evaluate()` and a hand-seeded `state.quoted`, which is the simplest faithful stand-in
// for "the last wave, with nothing carried over from an earlier one": engineering a real multi-wave
// discovery timing (a candidate that only becomes quotable in wave 3) would exercise the same code
// path with far more incidental setup and no more coverage of the actual bug.
// ---------------------------------------------------------------------------

test('C4-P7 regression: a preflight transport failure first observed in the evaluated wave is inconclusive/rpc-degraded, never no-route', async () => {
  const pool = stubPoolRef('v2', TOKEN_A, TOKEN_B)
  const quoted: QuotedRoute = {
    route: { legs: [{ pool, currencyIn: TOKEN_A, currencyOut: TOKEN_B }] },
    quote: { amountIn: AMOUNT_IN, amountOut: 100n, intermediateAmounts: [] },
  }

  // `state.quoted` is seeded directly below, so the only RPC this run ever issues is the preflight
  // simulation itself — answered here with a 429-shaped transport failure, never a revert.
  const client: SearchContext['client'] = {
    request: async () => {
      throw rateLimitHttpError()
    },
  } as any

  const ctx = makeContext(client, manifestWith())
  const block: BlockRef = { number: BLOCK_NUMBER, hash: BLOCK_HASH, timestamp: BLOCK_TIMESTAMP }
  const state = initialState(block, false)
  state.quoted.set(routeId(quoted.route), quoted)

  const run: Run = { ctx, state, kind: 'swap', req: swapReq }
  // Simulates exactly the shape of a final wave's own `evaluate` call: `done: true`, `state.aborted`
  // still `false` (the natural end-of-search shape, not an abort-forced one — an abort would also set
  // `allowPreflight = false` and skip verification entirely, so it could never reproduce this).
  const result = await evaluate(run, true)

  // Under the old (buggy) ordering this would be `false`: `verifyLeader` sets it DURING this same
  // call, after the report used to already be built.
  expect(result.report.verificationDegraded).toBe(true)
  expect(result.best?.execution).toBe('unverified')

  const classified = classifySwap(result)
  expect(classified.status).toBe('inconclusive')
  expect(classified.status).not.toBe('no-route')
  if (classified.status === 'inconclusive') expect(classified.reason.code).toBe('rpc-degraded')
  assertResultCoherent(classified)
})

test('C4-P7 regression: a compile failure first observed in the evaluated wave names its cause in the no-route detail', async () => {
  const pool = stubPoolRef('v2', TOKEN_A, TOKEN_B)
  const quoted: QuotedRoute = {
    route: { legs: [{ pool, currencyIn: TOKEN_A, currencyOut: TOKEN_B }] },
    quote: { amountIn: AMOUNT_IN, amountOut: 100n, intermediateAmounts: [] },
  }

  // A compile failure never reaches RPC at all — this client throwing on any call is itself an
  // assertion that `compileAndEncode`'s throw short-circuits before `preflightTx` is ever attempted.
  const client: SearchContext['client'] = {
    request: async () => {
      throw new Error('unexpected RPC call — a compile failure must never reach preflight')
    },
  } as any

  const ctx = makeContext(client, manifestWith())
  const block: BlockRef = { number: BLOCK_NUMBER, hash: BLOCK_HASH, timestamp: BLOCK_TIMESTAMP }
  const state = initialState(block, false)
  state.quoted.set(routeId(quoted.route), quoted)
  // `isSearchComplete` requires every enabled protocol's discovery to read `complete` — v3/v4 are
  // absent from `manifestWith()`'s bare manifest (reported `disabled`), so only v2 needs both
  // endpoints marked covered for this to be a genuinely COMPLETE (not merely incomplete-and-lucky)
  // `no-route`.
  state.discovery.v2.complete.add(node(swapReq.tokenIn, ctx.manifest))
  state.discovery.v2.complete.add(node(swapReq.tokenOut, ctx.manifest))

  // The recipient is the route's own pool — `assertPlanInvariants` rejects this with a named
  // `UnsupportedRouteError`, `compileAndEncode`'s catch captures it into `state.firstCompileError`.
  const req: SwapRequest = { ...swapReq, recipient: (pool as { address: Address }).address }
  const run: Run = { ctx, state, kind: 'swap', req }
  const result = await evaluate(run, true)

  // Under the old (buggy) ordering this would be `undefined`: `compileAndEncode` sets it DURING this
  // same call, after `base` (which is where `compileError` used to be read off `state`) used to
  // already be built.
  expect(result.compileError).toBeDefined()
  expect(result.compileError).toContain('is the v2 pool this plan trades through')

  const classified = classifySwap(result)
  expect(classified.status).toBe('no-route')
  if (classified.status === 'no-route') {
    expect(classified.reason.code).toBe('no-route-verified')
    expect(classified.reason.detail).toContain(result.compileError!)
  }
  assertResultCoherent(classified)
})

test('intermediatesPruned (C4-P7): SearchReport.enumeration surfaces the same count that already drove exhaustiveWithinMaxHops', async () => {
  // One more core intermediate than MAX_INTERMEDIATES (8), each reachable from both endpoints via
  // its own v2 pool, so exactly one is eligible-but-dropped and the report must say so by name
  // rather than only folding it into the boolean `exhaustiveWithinMaxHops`.
  const cores = Array.from({ length: MAX_INTERMEDIATES + 1 }, (_, i) => `0x${(0xc0 + i).toString(16).padStart(2, '0')}${'0'.repeat(38)}` as Address)
  const calls: Record<string, Hex> = {}
  for (const core of cores) {
    Object.assign(
      calls,
      quoteEntry([stubPoolRef('v2', TOKEN_A, core)], AMOUNT_IN, 10n),
      quoteEntry([stubPoolRef('v2', core, TOKEN_B)], AMOUNT_IN, 10n),
    )
  }
  const { client } = stubClient({ calls })
  const ctx = makeContext(client, manifestWith({ coreIntermediates: cores }))

  const events = await drain(searchWaves(ctx, quoteReq, 'quote'))
  const final = events.at(-1)!

  expect(final.report.enumeration.intermediatesPruned).toBe(1)
  expect(final.report.enumeration.intermediatesSelected).toBe(MAX_INTERMEDIATES)
  // …and the denominator of the ratio the panel prints as `selected/discovered`, threaded from the
  // same `generateRoutes` call as the numerator rather than re-walked at report-assembly time. All
  // three counters must reconcile: discovered = selected + pruned, from one sample of one index.
  expect(final.report.enumeration.intermediatesDiscovered).toBe(MAX_INTERMEDIATES + 1)
  expect(final.report.enumeration.intermediatesDiscovered).toBe(
    final.report.enumeration.intermediatesSelected + final.report.enumeration.intermediatesPruned,
  )
  // The pre-existing boolean this count already drove — kept in sync, not duplicated logic.
  expect(final.report.enumeration.exhaustiveWithinMaxHops).toBe(false)
  assertCoherent('quote', events)
})

test('unmet requirements → needs-action shape, no preflight attempted', async () => {
  const directPool = stubPoolRef('v2', TOKEN_A, TOKEN_B)
  const { client, counters } = stubClient({
    calls: { ...quoteEntry([directPool], AMOUNT_IN, 100n) },
    readiness: { erc20Allowance: 0n },
  })
  const ctx = makeContext(client, manifestWith())

  const events = await drainUntilActionable(searchWaves(ctx, swapReq, 'swap'))

  expect(events.at(-1)!.requirements).not.toHaveLength(0)
  expect(events.at(-1)!.best?.execution).toBe('needs-action')
  expect(events.at(-1)!.tx).toBeDefined()
  expect(counters.preflights).toBe(0)
  assertCoherent('swap', events)
})

test('a non-endpoint focusToken never displaces an endpoint scan', async () => {
  // The reviewer's scenario: honoring focusToken=MID would make wave 2 scan MID and wave 3 scan
  // tokenIn, leaving tokenOut's adjacency untouched while the report claimed complete discovery.
  const { client, counters } = stubClient({ logs: () => [] })
  const ctx = makeContext(client, manifestWith())

  const events = await drain(searchWaves(ctx, { ...quoteReq, focusToken: MID }, 'quote'))
  const report = events.at(-1)!.report

  expect([...counters.scannedEndpoints].sort()).toEqual([TOKEN_A.toLowerCase(), TOKEN_B.toLowerCase()].sort())
  expect(counters.scannedEndpoints.has(MID.toLowerCase())).toBe(false)
  expect(report.discovery.v2.status).toBe('complete')
  assertCoherent('quote', events)
})

test('discovery is never complete while an endpoint adjacency scan is failing', async () => {
  const { client, counters } = stubClient({ failScansFor: [TOKEN_B.toLowerCase()], logs: () => [] })
  const ctx = makeContext(client, manifestWith({ deploymentBlock: BLOCK_NUMBER - 100n }))

  const events = await drain(searchWaves(ctx, quoteReq, 'quote'))
  const report = events.at(-1)!.report

  expect(counters.scannedEndpoints.has(TOKEN_A.toLowerCase())).toBe(true)
  expect(report.discovery.v2.status).toBe('failed')
  expect(classify('quote', events.at(-1)!).status).toBe('inconclusive') // never an authoritative no-route
  assertCoherent('quote', events)
})

test('v3 fee-tier discovery reaches a pool on a governance-enabled tier', async () => {
  const nonstandardPool = stubPoolRef('v3', TOKEN_A, TOKEN_B, { fee: NONSTANDARD_FEE })
  const { client, counters } = stubClient({
    calls: { ...quoteEntry([nonstandardPool], AMOUNT_IN, 700n) },
    feeLogs: [{ address: V3_FACTORY, topics: [FEE_TOPIC], data: '0x', blockNumber: 300n, fee: NONSTANDARD_FEE } as unknown as Log & { fee: number }],
    logs: () => [],
  })
  const ctx = makeContext(client, manifestWith({ v3: true }))

  const events = await drain(searchWaves(ctx, quoteReq, 'quote'))

  expect(counters.feeScans).toBeGreaterThan(0)
  expect(ctx.index.enabledFees('v3', V3_FACTORY)).toEqual([NONSTANDARD_FEE])
  expect(events.at(-1)!.best?.quote.amountOut).toBe(700n)
  expect(events.at(-1)!.best?.route.legs[0]!.pool).toMatchObject({ protocol: 'v3', fee: NONSTANDARD_FEE })
  assertCoherent('quote', events)
})

// ---------------------------------------------------------------------------
// v4 exact-pair scan: wave 0 buys latency, the scan-bound waves buy completeness
// ---------------------------------------------------------------------------

/** A v4 Initialize log for the (A,B) pair, as the exact-pair query would return it. */
function v4PairLog(createdAtBlock: bigint): Log & { record: PoolRecord } {
  const pool = stubV4PoolRef(TOKEN_A, TOKEN_B)
  return {
    address: V4_POOL_MANAGER,
    topics: [V4_TOPIC],
    data: '0x',
    blockNumber: createdAtBlock,
    record: { pool, createdAtBlock, source: 'event' },
  } as unknown as Log & { record: PoolRecord }
}

/** v4 deploys far behind the head, so a cold pair scan of the full range is the expensive case. */
const V4_DEPLOY_BLOCK = BLOCK_NUMBER - 400_000n
// Derived, never pinned to a literal: the window is one week of THIS manifest's blocks, so the test
// asks the same function the engine does rather than restating mainnet's answer (C4-P1).
const WAVE0_WINDOW_START = BLOCK_NUMBER - wave0PairScanBlocks(manifestWith()) + 1n

test('wave 0 scans only the recent window; the deep history completes in the scan-bound waves', async () => {
  const recentPool = stubV4PoolRef(TOKEN_A, TOKEN_B)
  const { client, counters } = stubClient({
    calls: { ...quoteEntry([recentPool], AMOUNT_IN, 900n) },
    pairLogs: [v4PairLog(BLOCK_NUMBER - 10n)], // created minutes ago: the case wave 0 exists for
  })
  const ctx = makeContext(client, manifestWith({ v4: true, deploymentBlock: V4_DEPLOY_BLOCK }))

  const gen = searchWaves(ctx, quoteReq, 'quote')
  const first = (await gen.next()).value as InternalResult

  // Wave 0 found the pool without reading a single pre-window block.
  expect(first.best?.quote.amountOut).toBe(900n)
  expect(counters.pairScanRanges.every((r) => r.fromBlock >= WAVE0_WINDOW_START)).toBe(true)
  // The pre-window history is still outstanding (the trailing entry is the standing reorg overlap).
  expect(ctx.index.uncovered('v4', ctx.index.pairScope(TOKEN_A, TOKEN_B), V4_DEPLOY_BLOCK, BLOCK_NUMBER)[0]).toEqual({
    fromBlock: V4_DEPLOY_BLOCK,
    toBlock: WAVE0_WINDOW_START - 1n,
  })
  // ...and a consumer that stops here is told so, rather than being handed a false "complete".
  expect(first.report.discovery.v4.status).toBe('partial')

  const rest = await drain(gen)
  const final = rest.at(-1)!

  // The deep history is completed by the scan-bound waves, and only then is discovery complete.
  expect(counters.pairScanRanges.some((r) => r.fromBlock < WAVE0_WINDOW_START)).toBe(true)
  expect(ctx.index.uncovered('v4', ctx.index.pairScope(TOKEN_A, TOKEN_B), V4_DEPLOY_BLOCK, BLOCK_NUMBER)).toEqual([
    { fromBlock: BLOCK_NUMBER - DEFAULT_REORG_OVERLAP_BLOCKS + 1n, toBlock: BLOCK_NUMBER }, // standing reorg overlap
  ])
  expect(final.report.discovery.v4.status).toBe('complete')
  assertCoherent('quote', [first, ...rest])
})

test('wave 0\'s window is the MANIFEST\'s week, not mainnet\'s — a 2s chain scans 6x further back', async () => {
  // C4-P1's whole point, end to end. Same code, same head, same request: only the manifest's block
  // time differs, and the fast path's reach follows it. Under the old fixed 50_000n block constant
  // this chain's wave 0 covered ~28 hours, so a pool launched two days ago was invisible to it.
  const pool = stubV4PoolRef(TOKEN_A, TOKEN_B)
  const launchedThreeDaysAgo = BLOCK_NUMBER - 129_600n // 3 days at 2s/block; ~18 days at 12s
  const { client, counters } = stubClient({
    calls: { ...quoteEntry([pool], AMOUNT_IN, 900n) },
    pairLogs: [v4PairLog(launchedThreeDaysAgo)],
  })
  const fastChain = manifestWith({ v4: true, deploymentBlock: V4_DEPLOY_BLOCK, chain: { blockTimeSeconds: 2 } })
  const ctx = makeContext(client, fastChain)

  const windowStart = BLOCK_NUMBER - wave0PairScanBlocks(fastChain) + 1n
  expect(wave0PairScanBlocks(fastChain)).toBe(302_400n) // 604800/2 — six times mainnet's 50_400
  expect(windowStart).toBeLessThan(launchedThreeDaysAgo) // the launch is inside the derived window

  const first = (await searchWaves(ctx, quoteReq, 'quote').next()).value as InternalResult

  // Wave 0 alone found it, and reached no further back than the derived window.
  expect(first.best?.quote.amountOut).toBe(900n)
  expect(counters.pairScanRanges.every((r) => r.fromBlock >= windowStart)).toBe(true)
  expect(counters.pairScanRanges.some((r) => r.fromBlock < WAVE0_WINDOW_START)).toBe(true) // past mainnet's reach

  // The mainnet-shaped manifest, given the identical chain, misses the same launch in wave 0.
  const { client: client2 } = stubClient({
    calls: { ...quoteEntry([pool], AMOUNT_IN, 900n) },
    pairLogs: [v4PairLog(launchedThreeDaysAgo)],
  })
  const slowCtx = makeContext(client2, manifestWith({ v4: true, deploymentBlock: V4_DEPLOY_BLOCK }))
  const slowFirst = (await searchWaves(slowCtx, quoteReq, 'quote').next()).value as InternalResult
  expect(slowFirst.best).toBeUndefined()
})

test('the head-regression bound scales with the manifest\'s reorg depth, not a mainnet constant', async () => {
  // `maxPlausibleHeadRegression` is 4x the chain's overlap. A 200-block regression is a self-healing
  // "the watermark was never real" on mainnet (4 x 32 = 128) and an ordinary reported lag on a chain
  // that rewinds 600 blocks (4 x 600 = 2400).
  async function regressBy(reorgOverlapBlocks: bigint, drop: bigint): Promise<boolean> {
    let head = BLOCK_NUMBER
    const { client } = stubClient({ calls: {}, blockNumber: () => head })
    const ctx: SearchContext = {
      ...makeContext(client, manifestWith({ chain: { reorgOverlapBlocks } })),
      index: new PoolIndex(WETH, { reorgOverlapBlocks }),
      head: {},
    }
    await drain(searchWaves(ctx, quoteReq, 'quote'))
    head = BLOCK_NUMBER - drop
    const after = await drain(searchWaves(ctx, quoteReq, 'quote'))
    return after.at(-1)!.report.headRegressed
  }

  expect(await regressBy(32n, 200n)).toBe(false) // mainnet: beyond 128, so the watermark self-heals
  expect(await regressBy(600n, 200n)).toBe(true) // deep chain: 200 is well inside 2400, an ordinary lag
})

test('a repeat search on a warm index re-scans only the reorg overlap', async () => {
  const { client, counters } = stubClient({
    calls: { ...quoteEntry([stubV4PoolRef(TOKEN_A, TOKEN_B)], AMOUNT_IN, 900n) },
    pairLogs: [v4PairLog(V4_DEPLOY_BLOCK + 5n)],
  })
  const ctx = makeContext(client, manifestWith({ v4: true, deploymentBlock: V4_DEPLOY_BLOCK }))

  await drain(searchWaves(ctx, quoteReq, 'quote'))
  const coldScans = counters.pairScans
  counters.pairScans = 0
  counters.pairScanRanges.length = 0

  // Same instance, same request, same pinned block.
  await drain(searchWaves(ctx, quoteReq, 'quote'))

  expect(coldScans).toBeGreaterThan(1) // 4M blocks cannot be one chunk
  expect(counters.pairScans).toBe(1)
  expect(counters.pairScanRanges).toEqual([{ fromBlock: BLOCK_NUMBER - DEFAULT_REORG_OVERLAP_BLOCKS + 1n, toBlock: BLOCK_NUMBER }])
})

test('a hinted native v4 pool speculatively re-quoted in wave 0 keeps its hint provenance', async () => {
  // Reviewer-demonstrated regression: rememberPool's "already known" dedup guard used to read a v4
  // pool's raw poolKey.currency0/1 (never mapping address(0) -> 'native'), so for a native v4 pool it
  // queried the wrong graph node, always found nothing, and fell through to upsert() on every
  // speculative hit — which used to downgrade a `hint` record to `factory` on any later probe. Both
  // bugs are fixed; the hint provenance must survive wave 0's concurrent speculative re-probe.
  const nativePool = stubV4NativePoolRef(TOKEN_B)

  const v4NativeModule: ProtocolModule = {
    ...v4StubModule,
    speculativeDirect(a, b, amountIn) {
      const legs: RouteLeg[] = [{ pool: nativePool, currencyIn: a, currencyOut: b }]
      return [{ candidate: { legs }, quote: stubQuote(legs, amountIn) }]
    },
    async validateHint(hint) {
      if (hint.protocol !== 'v4') return null
      return { pool: nativePool, source: 'hint' }
    },
  }

  const { client } = stubClient({ calls: { ...quoteEntry([nativePool], AMOUNT_IN, 900n) } })
  const ctx: SearchContext = {
    client,
    manifest: manifestWith({ v4: true }),
    modules: { ...modules, v4: v4NativeModule },
    index: new PoolIndex(WETH),
    hookData: new Map(),
  }

  const req: QuoteRequest = {
    tokenIn: 'native',
    tokenOut: TOKEN_B,
    amountIn: AMOUNT_IN,
    hints: [{ protocol: 'v4', poolKey: nativePool.poolKey }],
  }

  await drain(searchWaves(ctx, req, 'quote'))

  const record = ctx.index.pair('native', TOKEN_B).find((r) => r.pool.id === nativePool.id)
  expect(record?.source).toBe('hint')
})

test('selectFocus prefers the request field, then the hinted endpoint, then the smaller neighborhood', async () => {
  const index = new PoolIndex(WETH)
  expect(selectFocus({ ...quoteReq, focusToken: TOKEN_B }, index)).toBe(TOKEN_B)

  // A focus that is not an endpoint is ignored rather than scanned instead of one.
  expect(selectFocus({ ...quoteReq, focusToken: MID }, index)).toBe(TOKEN_A)

  // Nothing known about either endpoint: tokenIn wins.
  expect(selectFocus(quoteReq, index)).toBe(TOKEN_A)

  // TOKEN_B is hinted, TOKEN_A is not.
  index.upsert({ pool: stubPoolRef('v2', TOKEN_B, MID), source: 'hint' })
  expect(selectFocus(quoteReq, index)).toBe(TOKEN_B)

  // Both hinted: the endpoint with fewer cached neighbors wins.
  const index2 = new PoolIndex(WETH)
  index2.upsert({ pool: stubPoolRef('v2', TOKEN_A, MID), source: 'hint' })
  index2.upsert({ pool: stubPoolRef('v2', TOKEN_B, MID), source: 'hint' })
  index2.upsert({ pool: stubPoolRef('v2', TOKEN_B, WETH), source: 'hint' })
  expect(selectFocus(quoteReq, index2)).toBe(TOKEN_A)
})

test('UnsupportedRouteError in compileOperation is caught and route is skipped (business outcome)', async () => {
  const directPool = stubPoolRef('v2', TOKEN_A, TOKEN_B)
  const { client } = stubClient({ calls: { ...quoteEntry([directPool], AMOUNT_IN, 100n) } })
  const ctx = makeContext(client, manifestWith())

  // Replace v2 module with one that throws UnsupportedRouteError in compileOperation
  const throwingModule: ProtocolModule = {
    ...stubModule('v2'),
    compileOperation() {
      throw new UnsupportedRouteError('Unsupported route shape')
    },
  }
  ctx.modules.v2 = throwingModule

  // Verify that search completes without throwing even when UnsupportedRouteError is raised
  let searchCompleted = false
  try {
    const events = await drainUntilActionable(searchWaves(ctx, swapReq, 'swap'))
    searchCompleted = true
    // The route should exist but be marked as failed
    expect(events[0]!.best?.execution).toBe('failed')
  } catch (err) {
    if (err instanceof Error && err.message.includes('inconclusive')) {
      // This is expected - the search completes but no route could be verified
      searchCompleted = true
    } else {
      throw err
    }
  }
  expect(searchCompleted).toBe(true)
})

test('TypeError in compileOperation propagates as a bug (not swallowed)', async () => {
  const directPool = stubPoolRef('v2', TOKEN_A, TOKEN_B)
  const { client } = stubClient({ calls: { ...quoteEntry([directPool], AMOUNT_IN, 100n) } })
  const ctx = makeContext(client, manifestWith())

  // Replace v2 module with one that throws TypeError in compileOperation
  const throwingModule: ProtocolModule = {
    ...stubModule('v2'),
    compileOperation() {
      throw new TypeError('Cannot read property of undefined')
    },
  }
  ctx.modules.v2 = throwingModule

  // searchWaves should throw the TypeError, not catch it
  let threwError = false
  try {
    await drain(searchWaves(ctx, swapReq, 'swap'))
  } catch (err) {
    threwError = true
    expect(err).toBeInstanceOf(TypeError)
    expect(String(err)).toContain('Cannot read property of undefined')
  }
  expect(threwError).toBe(true)
})

// ---------------------------------------------------------------------------
// C4-H3: the negative cache is shared across every search run against the same `PoolIndex` (the
// router holds one per chain, across requests). Two properties must both hold, or the cache either
// leaks memory forever or silently poisons a healthy pool for a concurrent/later request:
//
//   - a data-less revert (the pool-absent shape) IS negative-cached, and a second search at the
//     same block skips the pool entirely — no repeat `eth_call`.
//   - a data-carrying revert (NotEnoughLiquidity, a hook rejection, a rounding revert — all
//     POTENTIALLY amount- or context-dependent) is NEVER negative-cached, so a second search (which
//     stands in for a concurrent request at a different amount) re-quotes it rather than trusting a
//     verdict that was never entitled to generalize across amounts.
// ---------------------------------------------------------------------------

test('C4-H3: a data-less revert is negative-cached and a second search at the same block skips it', async () => {
  const targetPool = stubPoolRef('v2', TOKEN_A, TOKEN_B)
  const targetLegs: RouteLeg[] = [{ pool: targetPool, currencyIn: TOKEN_A, currencyOut: TOKEN_B }]
  const targetKey = `${quoteTarget(targetPool).toLowerCase()}:${quoteData(targetLegs, AMOUNT_IN)}`
  const { client, counters } = stubClient({}) // nothing registered: every call is a data-less revert
  const ctx = makeContext(client, manifestWith())

  await drain(searchWaves(ctx, quoteReq, 'quote'))
  expect(ctx.index.isNegative(targetPool, BLOCK_NUMBER)).toBe(true)
  expect(counters.callsByKey.get(targetKey)).toBe(1)

  // Same PoolIndex, same pinned block (the stub always answers `eth_getBlockByNumber` with
  // BLOCK_NUMBER) — the shape of two concurrent requests landing on the same head.
  await drain(searchWaves(ctx, quoteReq, 'quote'))
  expect(counters.callsByKey.get(targetKey)).toBe(1) // skipped entirely — no second eth_call
})

test('C4-H3: a data-carrying revert is never negative-cached, so a second search re-quotes it', async () => {
  const targetPool = stubPoolRef('v2', TOKEN_A, TOKEN_B)
  const targetLegs: RouteLeg[] = [{ pool: targetPool, currencyIn: TOKEN_A, currencyOut: TOKEN_B }]
  const targetKey = `${quoteTarget(targetPool).toLowerCase()}:${quoteData(targetLegs, AMOUNT_IN)}`
  const { client, counters } = stubClient({ dataReverts: { [targetKey]: NOT_ENOUGH_LIQUIDITY_DATA } })
  const ctx = makeContext(client, manifestWith())

  await drain(searchWaves(ctx, quoteReq, 'quote'))
  expect(ctx.index.isNegative(targetPool, BLOCK_NUMBER)).toBe(false)
  expect(counters.callsByKey.get(targetKey)).toBe(1)

  // A request at a different amount (a different search, same shared index/block) is not told "no
  // pool here" on the strength of a verdict that was never proven amount-independent — it re-quotes.
  await drain(searchWaves(ctx, quoteReq, 'quote'))
  expect(counters.callsByKey.get(targetKey)).toBe(2)
})

// ---------------------------------------------------------------------------
// C4-H4: hint demotion, through the production path.
//
// A hint enters the index at the TOP of the provenance order on nothing but
// the caller's assertion — v2/v4 hint validation is a pure local derivation,
// so any well-formed key "validates". The demotion that keeps a fabricated
// hint from outranking real pools forever is only worth anything if the
// evidence it needs actually accumulates during a real search, so these tests
// drive it end to end: `searchWaves` runs, its own probes fail data-less
// against pools that do not exist, and the index reaches the demoted state on
// its own. Nothing here calls `markNegative` by hand — an earlier version of
// this test did, and it passed against an engine in which the failing probes
// recorded nothing at all.
// ---------------------------------------------------------------------------

/** The pool a `{ protocol: 'v2', token0: TOKEN_A, token1: MID }` hint asserts — identical to the one
 * `speculativeDirect(TOKEN_A, MID)` derives, which is exactly why the engine's own core-intermediate
 * probe is what contradicts it. */
const junkHintedPool = stubPoolRef('v2', TOKEN_A, MID)

/** The junk hint's record as the index currently holds it. */
function hintedRecord(ctx: SearchContext): PoolRecord {
  return ctx.index.pair(TOKEN_A, MID).find((r) => r.pool.id === junkHintedPool.id)!
}

/** Intermediate graph nodes, in the order candidate generation would actually try them. */
function intermediateOrder(ctx: SearchContext): string[] {
  const seen: string[] = []
  for (const c of generateRoutes({ tokenIn: TOKEN_A, tokenOut: TOKEN_B, index: ctx.index, wrappedNative: WETH }).candidates) {
    if (c.legs.length !== 2) continue
    const mid = String(c.legs[0]!.currencyOut).toLowerCase()
    if (!seen.includes(mid)) seen.push(mid)
  }
  return seen
}

/**
 * A search world where TOKEN_A -> TOKEN_B has two possible intermediates: MID, reachable only
 * because a hint asserts a (TOKEN_A, MID) pool that does not exist, and WETH, whose pools arrive
 * from real adjacency-scan creation logs (hence a `createdAtBlock` the hinted side has no answer to).
 */
function demotionWorld(opts: { provePool?: () => boolean } = {}): {
  ctx: SearchContext
  req: QuoteRequest
  advance: () => void
} {
  let head = BLOCK_NUMBER
  // The MID -> TOKEN_B side genuinely exists, so MID stays an *eligible* intermediate throughout —
  // the test is about ordering, not about MID disappearing from the graph.
  const midToB = stubPoolRef('v2', MID, TOKEN_B)
  const { client } = stubClient({
    blockNumber: () => head,
    calls: quoteEntry([midToB], AMOUNT_IN, 900n),
    logs: (endpoint) => {
      const logs: (Log & { record: PoolRecord })[] = []
      if (endpoint === TOKEN_A.toLowerCase()) logs.push(scannedRecord('v2', TOKEN_A, WETH, 500n))
      if (endpoint === TOKEN_B.toLowerCase()) logs.push(scannedRecord('v2', WETH, TOKEN_B, 500n))
      // A creation log for the hinted pool itself: direct proof the asserted pool exists after all.
      // Placed at the chain tip, where a pool that was hinted before it existed would really appear
      // — and, concretely, inside the reorg-overlap window a warm index re-scans, since the earlier
      // searches already recorded coverage over everything below it.
      if (endpoint === TOKEN_A.toLowerCase() && opts.provePool?.())
        logs.push({
          address: V2_FACTORY,
          topics: [TOPIC.v2],
          data: '0x',
          blockNumber: BLOCK_NUMBER,
          record: { pool: junkHintedPool, createdAtBlock: BLOCK_NUMBER, source: 'event' },
        } as unknown as Log & { record: PoolRecord })
      return logs
    },
  })

  const ctx = makeContext(client, manifestWith({ coreIntermediates: [MID, WETH] }))
  const req: QuoteRequest = { ...quoteReq, hints: [{ protocol: 'v2', token0: TOKEN_A, token1: MID }] }
  return { ctx, req, advance: () => void (head += 1n) }
}

test('C4-H4: a junk hint is discredited by the engine\'s own discovery probes failing at two blocks', async () => {
  const { ctx, req, advance } = demotionWorld()

  await drain(searchWaves(ctx, req, 'quote'))
  // One search, one block: the hint still leads. A pool can genuinely fail to quote at one block
  // (created but unfunded, a hook not yet open), so a single search must never be enough.
  expect(hintedRecord(ctx).source).toBe('hint')
  expect(isDiscredited(hintedRecord(ctx))).toBe(false)
  expect(intermediateOrder(ctx)[0]).toBe(MID.toLowerCase())

  // A second search, one block later. Wave 1 probes TOKEN_A -> MID again (a core intermediate), it
  // reverts data-less again, and the pool has now been contradicted at two distinct blocks with no
  // successful quote to its name. Nothing in this test touched the index directly.
  advance()
  await drain(searchWaves(ctx, req, 'quote'))
  expect(isDiscredited(hintedRecord(ctx))).toBe(true)
  expect(hintedRecord(ctx).source).toBe('hint') // demoted, never rewritten or deleted

  // And the demotion is the point: the intermediate the hint was buying a top slot now sorts behind
  // the one backed by real creation logs.
  expect(intermediateOrder(ctx)[0]).toBe(WETH.toLowerCase())
  expect(intermediateOrder(ctx)).toContain(MID.toLowerCase()) // still enumerated, just behind
})

test('C4-H4: a repeated search at the SAME block never discredits — evidence is counted per block', async () => {
  const { ctx, req } = demotionWorld()

  // Ten searches, one block. A caller retrying (or ten concurrent requests landing on the same head)
  // must not manufacture the evidence that two genuinely different blocks are required to provide.
  for (let i = 0; i < 10; i++) await drain(searchWaves(ctx, req, 'quote'))

  expect(hintedRecord(ctx).quoteFailureBlocks).toBe(1)
  expect(isDiscredited(hintedRecord(ctx))).toBe(false)
  expect(intermediateOrder(ctx)[0]).toBe(MID.toLowerCase())
})

test('C4-H4: a creation log for a discredited hint restores it — proof of existence outranks the failures', async () => {
  // The pool is proved only once the third search runs, so the first two discredit it exactly as above.
  let proved = false
  const { ctx, req, advance } = demotionWorld({ provePool: () => proved })

  await drain(searchWaves(ctx, req, 'quote'))
  advance()
  await drain(searchWaves(ctx, req, 'quote'))
  expect(isDiscredited(hintedRecord(ctx))).toBe(true)

  // Now an adjacency scan turns up the pool's own creation log. That answers the existence question
  // the failure counter was standing in for, so it clears — and it arrives through the ordinary
  // scan/parse/upsert path, the same one `ingestLogs`/`ingestReceipt` feed.
  proved = true
  advance()
  await drain(searchWaves(ctx, req, 'quote'))

  expect(isDiscredited(hintedRecord(ctx))).toBe(false)
  expect(hintedRecord(ctx).quoteFailureBlocks).toBe(0)
  expect(hintedRecord(ctx).source).toBe('hint') // provenance restored to the top tier, not downgraded
  expect(intermediateOrder(ctx)[0]).toBe(MID.toLowerCase())
})

// ---------------------------------------------------------------------------
// C4-H5 follow-up: `PoolIndex.touchAll`, wired from `quoteEnumerated` — a pool
// alive only as a two-hop leg is touched by candidate ENUMERATION itself, not
// only by a quote that goes on to succeed.
// ---------------------------------------------------------------------------

test('quoteEnumerated touches every enumerated candidate leg (C4-H5 follow-up): a two-hop pool that never quotes successfully still survives maxPools eviction over an untouched, older pool', async () => {
  const UNRELATED_X = `0x${'dd'.repeat(20)}` as Address
  const UNRELATED_Y = `0x${'ff'.repeat(20)}` as Address

  const index = new PoolIndex(WETH, { maxPools: 3 })

  // The two legs of a TOKEN_A -> MID -> TOKEN_B candidate — already known to the index (as a
  // bare `factory` record, no block info at all: never touched), so `generateRoutes` enumerates
  // them as a two-hop candidate from wave 0, before any quote has run.
  const aMidLeg = stubPoolRef('v2', TOKEN_A, MID, { tag: SCANNED_TAG })
  const midBLeg = stubPoolRef('v2', MID, TOKEN_B, { tag: SCANNED_TAG })
  index.upsert({ pool: aMidLeg, source: 'factory' })
  index.upsert({ pool: midBLeg, source: 'factory' })

  // An unrelated pool, touched at an ancient block — the eviction target once the cap bites. Not
  // reachable from this search at all (different currencies), so nothing here ever touches it again.
  const oldPool = stubPoolRef('v2', UNRELATED_X, UNRELATED_Y, { tag: SCANNED_TAG })
  index.upsert({ pool: oldPool, source: 'event', createdAtBlock: 1n })
  expect(index.stats().pools).toBe(3) // at cap, nothing evicted yet — 3 is not > 3

  // No `calls` entries registered for either leg: BOTH revert ("no pool there"). A two-hop v2
  // candidate quotes leg 1 first and only proceeds to leg 2 if it succeeds (see `quote/quote.ts`),
  // so this candidate never quotes successfully — `markSuccess` is never called on `aMidLeg` or
  // `midBLeg`. Enumeration is the ONLY thing that ever touches them.
  const { client } = stubClient({ calls: {} })
  // Built manually, not via `makeContext` — that helper always allocates its own fresh `PoolIndex`,
  // and this test needs the pre-seeded, `maxPools`-bounded one constructed above.
  const ctx: SearchContext = { client, manifest: manifestWith(), modules, index, hookData: new Map() }

  const events = await drain(searchWaves(ctx, quoteReq, 'quote'))
  expect(events.at(-1)!.best).toBeUndefined() // no route: both legs, and the direct pair, are unquoteable
  assertCoherent('quote', events)

  // Enumeration alone protected both legs (touched at the search's pinned block, BLOCK_NUMBER) —
  // they are still in the index, adjacency intact.
  expect(index.pair(TOKEN_A, MID).some((r) => r.pool.id === aMidLeg.id)).toBe(true)
  expect(index.pair(MID, TOKEN_B).some((r) => r.pool.id === midBLeg.id)).toBe(true)

  // Now push a genuinely NEW pool into the index — the only thing that ever triggers eviction.
  // `oldPool`, touched at block 1 and never touched again (it was never enumerable in the search
  // above), is the oldest remaining candidate and is evicted; the two enumerated-but-never-quoted
  // legs, touched at BLOCK_NUMBER by `touchAll`, are not.
  const freshPool = stubPoolRef('v2', TOKEN_A, WETH, { tag: SCANNED_TAG })
  index.upsert({ pool: freshPool, source: 'event', createdAtBlock: BLOCK_NUMBER })

  expect(index.stats().pools).toBe(3) // still at cap: oldPool was evicted to make room
  expect(index.pair(UNRELATED_X, UNRELATED_Y)).toEqual([]) // evicted — gone, not merely stale
  expect(index.pair(TOKEN_A, MID).some((r) => r.pool.id === aMidLeg.id)).toBe(true) // survived
  expect(index.pair(MID, TOKEN_B).some((r) => r.pool.id === midBLeg.id)).toBe(true) // survived
  expect(index.pair(TOKEN_A, WETH).some((r) => r.pool.id === freshPool.id)).toBe(true) // the new arrival
})

// ---------------------------------------------------------------------------
// Wave-2 quote starvation (the sequel to the fee-discovery starvation bug)
// ---------------------------------------------------------------------------

test('a scan-bound wave quotes what it discovers WHILE it discovers it, so an abort cannot strand a whole wave of pools unpriced', async () => {
  // THE LIVE DEFECT, REPRODUCED. `rl quote eth usdc 1 --watch --budget 60s` on Base, warm-ish index:
  // `enumeration 49 candidates · quoting 10 attempted = 10 ok · 39 never attempted · flags aborted`.
  // Wave 2 spent its entire remaining ~56s inside `scanAdjacency` against a 10k-capped `eth_getLogs`
  // endpoint, and reached its closing `quoteEnumerated` only after the budget's signal had fired —
  // at which point `quoteCandidates` correctly refuses to issue calls for an aborted search. So the
  // wave enumerated all 39 newly-discovered candidates, priced none of them, and converted a minute
  // of real time into pools and zero prices. The anytime-search contract is an improving best per
  // wave; a wave that cannot quote cannot improve anything.
  //
  // The scenario below is that shape in miniature: nothing prices in waves 0-1 (every speculative
  // probe reverts — "no pool there"), the focus-endpoint adjacency scan is the only source of
  // quoteable pools, it is paced across ten chunks, and the budget expires partway through it. Every
  // successful quote in the search is therefore one the interleaving bought.
  const controller = new AbortController()
  const deploymentBlock = BLOCK_NUMBER - 1_999n // a 2,000-block range...
  const chunk = 200n //                            ...walked in ten chunks, recent-first

  // Two direct A<->B pools on tiers `speculativeDirect` cannot guess, discoverable only by the scan:
  // one in the FIRST chunk served, one in the LAST.
  const early = scannedRecord('v3', TOKEN_A, TOKEN_B, BLOCK_NUMBER - 100n) //  chunk 1
  const late = scannedRecord('v3', TOKEN_A, TOKEN_B, deploymentBlock + 99n) // chunk 10
  // `scannedRecord` derives its pool from the pair alone, so the two would collide; re-tag the late
  // one so the index holds two distinct direct pools and `pair()` can count them.
  const latePool = stubPoolRef('v3', TOKEN_A, TOKEN_B, { tag: 'a7' })
  late.record = { pool: latePool, createdAtBlock: deploymentBlock + 99n, source: 'event' }

  const index = new PoolIndex(WETH)
  const { client } = stubClient({
    calls: {
      ...quoteEntry([early.record.pool], AMOUNT_IN, 5_000n),
      ...quoteEntry([latePool], AMOUNT_IN, 6_000n),
    },
    logs: (endpoint) => (endpoint === TOKEN_A.toLowerCase() ? [early, late] : []),
    logDelayMs: 25,
    // The budget expiring: the moment the scan has surfaced BOTH pools, the caller's clock is up.
    abortWhen: () => index.pair(TOKEN_A, TOKEN_B).length >= 2,
    controller,
  })

  const ctx = makeContext(client, manifestWith({ v3: true, deploymentBlock }), {
    index,
    logChunkBlocks: chunk,
    // The pump's interval, shortened so the test observes passes without spending
    // QUOTE_INTERLEAVE_MS of wall clock per one — the role `scanLogs`' `opts.sleep` plays for backoff.
    quoteInterleaveMs: 10,
  })
  const events = await drain(searchWaves(ctx, { ...quoteReq, signal: controller.signal }, 'quote'))

  const final = events.at(-1)!
  const { quoting } = final.report
  expect(final.report.aborted).toBe(true)

  // THE REGRESSION. Before interleaving this was `0 ok`: every candidate the scan discovered was
  // enumerated into `unattempted` by a `quoteEnumerated` that ran after the abort. The early pool is
  // priced because a pass reached it while the remaining nine chunks were still in flight.
  expect(quoting.succeeded).toBeGreaterThan(0)
  expect(final.best?.quote.amountOut).toBe(5_000n)

  // AND THE REPORT IS STILL HONEST ABOUT WHAT IT DID NOT DO. The late pool arrived WITH the abort, so
  // it is still enumerated, still counted, and still reported as never attempted — the unattempted
  // number shrinks because the work got done, not because the accounting looked away.
  expect(quoting.succeeded).toBe(1)
  expect(quoting.unattempted).toBeGreaterThan(0)
  expect(quoting.attempted).toBe(quoting.succeeded + quoting.failed + quoting.transportFailed)
  expect(final.report.enumeration.candidatesGenerated).toBeGreaterThanOrEqual(quoting.unattempted)

  const result = classify('quote', final)
  assertResultCoherent(result)
})

test('an abort mid-WAVE-0 leaves no generated candidate unaccounted for: skipped route probes are `unattempted`', async () => {
  // THE ACCOUNTING HOLE, in the one channel that had it. `runRouteProbes` counted
  // `candidatesGenerated += fresh.length` and then only `stats.attempted` — never the shortfall — so
  // an abort that skipped queued probes produced a report claiming N candidates and accounting for
  // fewer than N quoting outcomes, with no field anywhere saying where the rest went. `quoteNew` had
  // always differenced `fresh.length - stats.attempted` into `unattempted`; wave 0's probes, which
  // feed `candidatesGenerated` on exactly the same terms (`types.ts#SearchReport.quoting`, channel
  // 1), did not.
  //
  // The shortfall is REAL, not theoretical: `probeQuotes` returns `attempted < probes.length`
  // whenever `ethCall` raises `AbortedCallError` for a call that queued behind the semaphore and was
  // never sent (`quote/quote.ts`). A one-permit semaphore is what makes that deterministic here —
  // the first probe is served, the stub aborts on it, and the second finds the signal already set.
  const controller = new AbortController()
  const v2Direct = stubPoolRef('v2', TOKEN_A, TOKEN_B)
  const { client } = stubClient({
    calls: { ...quoteEntry([v2Direct], AMOUNT_IN, 100n) },
    abortAfterCalls: 1,
    controller,
  })
  const ctx = makeContext(client, manifestWith({ v3: true }), { semaphore: createSemaphore(1) })

  const events = await drain(searchWaves(ctx, { ...quoteReq, signal: controller.signal }, 'quote'))
  const final = events.at(-1)!
  const { quoting, enumeration } = final.report

  expect(final.report.aborted).toBe(true)
  // Two speculative direct probes (the v2 and v3 stub modules); exactly one was ever dispatched.
  expect(enumeration.candidatesGenerated).toBe(2)
  expect(quoting.attempted).toBe(1)
  // The point of the fix: the probe that was never sent is REPORTED as never sent.
  expect(quoting.unattempted).toBe(1)
  expect(enumeration.candidatesGenerated).toBe(quoting.attempted + quoting.unattempted)

  assertCoherent('quote', events)
})
