import { decodeAbiParameters, encodeAbiParameters, pad } from 'viem'
import type { Address, Hex, Log, PublicClient } from 'viem'

import { v2Ref, v3Ref, v4Ref } from '../src/internal/testing'
import { PoolIndex } from '../src/pools/poolIndex'
import { PROTOCOL_MODULES } from '../src/protocols'
import type { ProtocolModule } from '../src/protocols/types'
import { computeV2PairAddress } from '../src/protocols/v2'
import type { SearchContext } from '../src/search/loop'
import type { ChainManifest, CurrencyRef, PoolRef, Protocol, QuoteRequest, SwapRequest } from '../src/types'

// ---------------------------------------------------------------------------
// THE HERMETIC CORPUS' WORLDS — deterministic, offline, and each built for
// exactly one thing the golden corpus must contain: a ready swap, a
// needs-action swap, a two-hop quote, a completed no-route, an rpc-degraded
// search, a simplicity-margin promotion over a hooked v4 pool, an
// unverifiable-quote partition, an m_X improvement that outdates an
// already-priced out-leg, and a caller's abort mid-search.
//
// The shape is `search/loop.test.ts`'s: a scripted constant-product world where
// each pool's fate (price, revert, or a transport loss) is decided by a map
// rather than by real protocol encoding, and a scripted client answers every
// RPC a search issues from that world. What is NOT faked is anything the fold
// re-runs — `compileOperation` and the Universal Router encoder are spread off
// the REAL protocol modules, so the ready swap's golden calldata is calldata
// this package genuinely produces, and the fold (which knows only
// `PROTOCOL_MODULES`) reaches the identical bytes.
//
// WHY THE FIXTURES ARE RECORDED RATHER THAN HAND-WRITTEN. An outcome log is the
// engine's own account of a search; writing one by hand would assert that the
// fold agrees with whatever its author imagined, which is the one thing a
// golden must not do. Every fixture here is the log of a search that actually
// ran, and `recordOutcomeFixture` refuses to emit one whose fold disagrees with
// the live result.
//
// GAS IS MODELLED, AND THAT IS LOAD-BEARING. v3/v4 quoters return a gas word
// alongside the amount and v2's local reserve math does not, so the fake decode
// reports one for v3/v4 pools only. Without it the whole hermetic corpus would
// sit on one side of `RouteQuote.gasEstimate`'s presence rule and the golden
// schema test's both-sides assertion would be vacuous.
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
/** A non-zero hooks address — the whole reason v4 appears in this corpus at all (see {@link fakeV4}).
 * The low 16 bits are 0x99C0: swap/liquidity permission flags but NEITHER swap RETURNS_DELTA bit
 * (3, 2 — `protocols/poolRef.ts#hasReturnsDeltaHook`), so a pool wearing it is "complex" (hooked)
 * yet VERIFIABLE — the simplicity-margin fixture needs a hooked pool whose quote is still pool
 * math, or the unverifiable partition would demote it before the margin ever ran. */
const HOOK = `0x${'99'.repeat(19)}c0` as Address
/** A hooks address CARRYING a swap RETURNS_DELTA bit — the live Arbitrum echo hook (…4088,
 * BEFORE_SWAP_RETURNS_DELTA), whose deployed instance answers `amountIn` back as `amountOut`.
 * The address matters only for its low bits; using the live one documents the provenance. */
const ECHO_HOOK = '0x063386E9845E5d5aC7AFfBB538fcA57F59764088' as Address

const V2_TOPIC: Hex = '0xf2'
const V3_TOPIC: Hex = '0xf3'

const HEAD = 1_000_000n
const TS = 1_700_000_000n
const AMOUNT_IN = 1_000_000n

/** The quoter's gas word, as a v3/v4 fate reports one. A constant per pool rather than a function of
 * the amount: it is a reading these fixtures carry, not a model of anything. */
const V3_GAS = 90_000n

type Fate =
  | { kind: 'price'; r0: bigint; r1: bigint }
  | { kind: 'revert' }
  /** Every quote for this pool fails in the TRANSPORT — a 4xx from the gateway, which
   * `internal/rpcErrors.ts#classifyRpcError` reads as a fact about the provider, never about the pool. */
  | { kind: 'transport' }
  /** The pool "quotes" exactly `amountIn` — the live Arbitrum echo-hook shape (a RETURNS_DELTA hook
   * whose claim the quoter reports verbatim). Numerically plausible, so nothing at decode can
   * condemn it; only the ranking partition keeps it from leading a quote. */
  | { kind: 'echo' }

type World = Map<string, Fate>

function cpOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  const withFee = amountIn * 997n
  return (withFee * reserveOut) / (reserveIn * 1000n + withFee)
}

function idData(pool: PoolRef, currencyIn: CurrencyRef, amountIn: bigint): Hex {
  return `0x${Buffer.from(`${pool.id}|${String(currencyIn).toLowerCase()}|${amountIn}`).toString('hex')}` as Hex
}

/** Quote encoding re-pointed at the scripted world: the call carries the leg's identity, and the
 * decode consults the world. `to` is the protocol's real quoter address where one exists, so the
 * scripted client can still tell a quote from a readiness read or a preflight. */
function worldQuote(world: World, target?: Address): ProtocolModule['encodeQuote'] {
  return (legs, amountIn) => {
    const leg = legs[0]!
    const { pool } = leg
    return {
      call: { to: target ?? (pool.protocol === 'v4' ? V3_QUOTER : pool.address), data: idData(pool, leg.currencyIn, amountIn) },
      decode: () => {
        const fate = world.get(pool.id)
        if (fate?.kind === 'echo') return { amountOut: amountIn, gasEstimate: V3_GAS }
        if (!fate || fate.kind !== 'price') throw new Error('no pool here')
        const zeroForOne = String(leg.currencyIn).toLowerCase() === String(pool.currencies[0]).toLowerCase()
        const [reserveIn, reserveOut] = zeroForOne ? [fate.r0, fate.r1] : [fate.r1, fate.r0]
        const amountOut = cpOut(amountIn, reserveIn, reserveOut)
        return pool.protocol === 'v2' ? { amountOut } : { amountOut, gasEstimate: V3_GAS }
      },
    }
  }
}

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

const disabledModule = (id: Protocol): ProtocolModule =>
  ({ id, enabled: () => false, adjacencyShape: () => undefined, parsePoolLog: () => null, ...unused }) as ProtocolModule

/** The REAL v2 module (so `compileOperation` produces genuine Universal Router calldata) with
 * quoting, hypotheses and discovery re-pointed at the scripted world. */
function fakeV2(world: World): ProtocolModule {
  return {
    ...PROTOCOL_MODULES.v2,
    hypotheses: () => [],
    adjacencyShape: (m) => (m.v2 ? { emitter: m.v2.factory, topic0: V2_TOPIC, slot: 1, topicAddress: (e: Address) => e } : undefined),
    // Decodes {@link creationLog}'s three-address payload. Every other fake returns `null` here
    // because its world's pools are all in the index before the search starts; a world that needs a
    // pool to APPEAR PART-WAY THROUGH has no other channel, since discovery is the only thing that
    // ever adds one to a running search.
    parsePoolLog: (log) => {
      if (log?.topics?.[0] !== V2_TOPIC) return null
      const [token0, token1, pair] = decodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'address' }], log.data)
      return { pool: v2Ref(pair as Address, token0 as Address, token1 as Address), source: 'event', createdAtBlock: log.blockNumber ?? HEAD }
    },
    encodeQuote: worldQuote(world),
  }
}

/**
 * Answers an `eth_getLogs` filter the way a node would: a log is returned when every PINNED topic
 * position matches it, where a position holds `null` (anything) or an array of accepted values (which
 * is how one adjacency request carries both of the trade's endpoints).
 *
 * Emulated rather than pattern-matched on purpose. The engine issues two adjacency queries per
 * protocol — one pinning the pair's endpoints at topic 1, one at topic 2 — and a scripted world that
 * just answered "did this filter mention T_IN?" would hand the same creation log to both, ingesting a
 * pool from a query that a real node would not have matched it against. The fixture would then record
 * a discovery that could not happen on chain.
 */
function servedBy(filter: { topics?: unknown[] }, log: Log): boolean {
  const topics = filter.topics ?? []
  return topics.every((accepted, i) => {
    if (accepted === null || accepted === undefined) return true
    const actual = String(log.topics[i] ?? '').toLowerCase()
    const values = (Array.isArray(accepted) ? accepted : [accepted]).map((v) => String(v).toLowerCase())
    return values.includes(actual)
  })
}

/** One `PairCreated`-shaped log, in the shape {@link fakeV2}'s `parsePoolLog` reads back. */
function creationLog(pool: PoolRef, a: Address, b: Address, blockNumber: bigint): Log {
  if (pool.protocol !== 'v2') throw new Error('creationLog is v2-shaped')
  return {
    address: V2_FACTORY,
    topics: [V2_TOPIC, pad(a), pad(b)],
    data: encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'address' }], [a, b, pool.address]),
    blockNumber,
  } as unknown as Log
}

/**
 * The REAL v4 module with quoting and discovery re-pointed at the world.
 *
 * Only quote-side: no hermetic world compiles a v4 swap, so `compileOperation` is inherited but never
 * reached. What v4 is here FOR is `isHooked` — a v4 pool with a non-zero `hooks` address is the one
 * shape that makes a route "complex" without crossing a protocol boundary, which is the only way to
 * reach the simplicity-margin promotion (`quote/rank.ts`) on a single-protocol corpus.
 */
function fakeV4(world: World): ProtocolModule {
  const module: ProtocolModule = {
    ...PROTOCOL_MODULES.v4,
    hypotheses: () => [],
    adjacencyShape: () => undefined,
    parsePoolLog: () => null,
    encodeQuote: worldQuote(world),
  }
  // Dropped, not stubbed — same reasoning as `fakeV3`'s `feeDiscovery`: an exact-pair Initialize scan
  // would add a scope to every fixture that enables v4, and no world here hides a pool behind one.
  delete (module as { exactPair?: unknown }).exactPair
  return module
}

function fakeV3(world: World): ProtocolModule {
  const module: ProtocolModule = {
    ...PROTOCOL_MODULES.v3,
    hypotheses: () => [],
    adjacencyShape: (m) => (m.v3 ? { emitter: m.v3.factory, topic0: V3_TOPIC, slot: 1, topicAddress: (e: Address) => e } : undefined),
    parsePoolLog: () => null,
    encodeQuote: worldQuote(world, V3_QUOTER),
  }
  // Dropped rather than stubbed: a fee-enablement scan would add a second full-history scope to every
  // fixture that enables v3, and no world here has a pool on a governance-enabled tier to reach with it.
  delete (module as { feeDiscovery?: unknown }).feeDiscovery
  return module
}

function manifestOf(opts: { v2?: boolean; v3?: boolean; v4?: boolean; execution?: boolean }): ChainManifest {
  return {
    // A chain id no built-in manifest claims, so a fixture recorded here can only ever fold against
    // its own inline manifest — `manifestFor` would throw rather than quietly substitute a real chain.
    chainId: 31_337,
    wrappedNative: WETH,
    coreIntermediates: [WETH],
    ...(opts.execution === true && {
      execution: { address: UR, commandSet: 'ur-2.0' as const, permit2: PERMIT2, wrappedNative: WETH },
    }),
    ...(opts.v2 === true && { v2: { factory: V2_FACTORY, deploymentBlock: 0n } }),
    ...(opts.v3 === true && { v3: { factory: V3_FACTORY, deploymentBlock: 0n, v3QuoterV2: V3_QUOTER } }),
    ...(opts.v4 === true && { v4: { poolManager: V4_POOL_MANAGER, deploymentBlock: 0n, quoter: V4_QUOTER } }),
  }
}

function addr(n: number): Address {
  return `0x${n.toString(16).padStart(40, '0')}` as Address
}

/** A 4xx-bearing error: `classifyRpcError` reads `status >= 400` as the transport channel, which is
 * the only failure shape that moves `quoting.transportFailed` and degrades the search. */
function gatewayRefusal(): Error {
  return Object.assign(new Error('HTTP request failed.\nStatus: 429 Too Many Requests'), {
    name: 'HttpRequestError',
    status: 429,
  })
}

/** Per-world overrides of the two things the default script always answers "plenty" to. */
type WorldOptions = {
  /** ERC-20 `allowance(owner, spender)` — small enough to gate a swap `needs-action`. Balance and the
   * Permit2 allowance stay generous, so the requirement the classifier reports names ONE cause. */
  erc20Allowance?: bigint
  /** Logs an `eth_getLogs` returns, decided per filter. The default answers every scan empty; a world
   * that wants a pool to ARRIVE MID-SEARCH serves it here, since a scan is the only channel through
   * which the engine learns about a pool it did not start with. */
  logs?: (filter: { topics?: unknown[] }) => Log[]
  /**
   * Called with a pool's id the moment its quote call is SERVED — after the world has decided the
   * answer, before the module decodes it. The one seam a world has for making something happen
   * *during* a search rather than before it, which is what an abort has to be: aborting before the
   * search starts records a search that never priced anything, and aborting after it ends records
   * nothing at all. The abort itself is observed by the loop on its NEXT cycle, so the outcome of
   * the call that triggered it is applied first — which is exactly the best-so-far an abort is
   * contractually supposed to keep.
   */
  onQuoteServed?: (poolId: string) => void
}

/** Every RPC one search issues, answered from the world: the pinned head, log scans (empty unless the
 * world scripts them), the readiness reads (generous by default, so a swap's leader is never gated
 * `needs-action`), a preflight that succeeds, and a quote decided by the pool's fate. */
function scriptedClient(world: World, options: WorldOptions = {}): Pick<PublicClient, 'request'> {
  return {
    async request(args: { method: string; params: unknown[] }) {
      const { method, params } = args
      if (method === 'eth_getBlockByNumber') {
        return { number: `0x${HEAD.toString(16)}`, hash: `0x${'ab'.repeat(32)}`, timestamp: `0x${TS.toString(16)}` }
      }
      if (method === 'eth_getLogs') return options.logs?.(params[0] as { topics?: unknown[] }) ?? ([] as Log[])
      if (method === 'eth_call') {
        const to = ((params[0] as { to: string }).to ?? '').toLowerCase()
        if (to === UR.toLowerCase()) return '0x' // the preflight simulates cleanly
        if (to === T_IN.toLowerCase() || to === T_OUT.toLowerCase()) {
          // `balanceOf(address)` has one word of arguments, `allowance(address,address)` two — the
          // only way to tell the two reads apart at this level, and the same discrimination
          // `router.test.ts`'s stub makes.
          const data = String((params[0] as { data?: string }).data ?? '0x')
          const isAllowance = data.length > 10 + 64
          if (isAllowance && options.erc20Allowance !== undefined) {
            return encodeAbiParameters([{ type: 'uint256' }], [options.erc20Allowance])
          }
          return encodeAbiParameters([{ type: 'uint256' }], [10n ** 30n]) // balanceOf / allowance
        }
        if (to === PERMIT2.toLowerCase()) {
          return encodeAbiParameters([{ type: 'uint160' }, { type: 'uint48' }, { type: 'uint48' }], [10n ** 30n, 2 ** 47, 0])
        }
        const identity = Buffer.from(String((params[0] as { data?: string }).data ?? '0x').slice(2), 'hex').toString()
        const poolId = identity.split('|')[0] ?? ''
        if (world.get(poolId)?.kind === 'transport') throw gatewayRefusal()
        options.onQuoteServed?.(poolId)
        return '0x' // decoded locally by the fake module against the world
      }
      throw new Error(`unexpected RPC method ${String(method)}`)
    },
  } as unknown as Pick<PublicClient, 'request'>
}

function contextOf(world: World, manifest: ChainManifest, index: PoolIndex, options: WorldOptions = {}): SearchContext {
  return {
    client: scriptedClient(world, options),
    manifest,
    modules: {
      v2: manifest.v2 ? fakeV2(world) : disabledModule('v2'),
      v3: manifest.v3 ? fakeV3(world) : disabledModule('v3'),
      v4: manifest.v4 ? fakeV4(world) : disabledModule('v4'),
    },
    index,
    hookData: new Map(),
  }
}

// ---------------------------------------------------------------------------
// The scenarios
// ---------------------------------------------------------------------------

export type HermeticScenario = {
  label: string
  kind: 'quote' | 'swap'
  /**
   * The verdict this world exists to produce. The recorder REFUSES to write a fixture whose golden
   * disagrees, so a world that drifts into producing something else fails loudly rather than quietly
   * leaving the corpus without the case it was supposed to cover.
   *
   * `reason` IS PART OF THE CLAIM WHERE IT DISCRIMINATES. `inconclusive` is not one verdict — a
   * rate-limited provider, an expired budget and a head regression all land there, wearing different
   * `reason.code`s, and a world built for one of them silently drifting into another would keep
   * satisfying a status-only claim. Optional because the terminal statuses (`quote`, `ready`,
   * `needs-action`, and a completed `no-route`, whose reason is a single constant) have nothing left
   * to disambiguate.
   */
  expect: { status: string; reason?: string }
  notes: string
  build: () => { ctx: SearchContext; request: QuoteRequest | SwapRequest }
}

export const HERMETIC_SCENARIOS: HermeticScenario[] = [
  {
    label: 'hermetic-hinted-swap-ready',
    kind: 'swap',
    expect: { status: 'ready' },
    notes:
      'A hinted v2 pool nothing else can reach: the caller asserts it, the pump proves it by measuring it, ' +
      'readiness finds the trader funded and approved, and the preflight simulates cleanly. The golden pins ' +
      'the compiled Universal Router calldata, which the fold recompiles rather than copies.',
    build: () => {
      const world: World = new Map()
      const manifest = manifestOf({ v2: true, execution: true })
      const hinted = v2Ref(computeV2PairAddress(V2_FACTORY, T_IN, T_OUT), T_IN, T_OUT)
      world.set(hinted.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
      const request: SwapRequest = {
        tokenIn: T_IN,
        tokenOut: T_OUT,
        amountIn: AMOUNT_IN,
        trader: TRADER,
        hints: [{ protocol: 'v2', token0: T_IN, token1: T_OUT }],
      }
      return { ctx: contextOf(world, manifest, new PoolIndex(WETH)), request }
    },
  },
  {
    label: 'hermetic-two-hop-quote',
    kind: 'quote',
    expect: { status: 'quote' },
    notes:
      'Composition and the gas rule in one fixture: a v3->v3 two-hop through the manifest core out-prices ' +
      'a v2 direct pool, so `best` carries the two legs\' summed gasEstimate and its runner-up — priced by ' +
      "v2's local reserve math, which measures no gas — carries none.",
    build: () => {
      const world: World = new Map()
      const manifest = manifestOf({ v2: true, v3: true })
      const index = new PoolIndex(WETH)
      const price = (pool: PoolRef, r0: bigint, r1: bigint, createdAtBlock: bigint): void => {
        world.set(pool.id, { kind: 'price', r0, r1 })
        index.upsert({ pool, source: 'event', createdAtBlock })
      }
      // The two-hop legs: deep reserves both sides, so the chained output beats the direct pool.
      price(v3Ref(addr(0x3001), T_IN, WETH, 500), 10n ** 12n, 10n ** 12n, 10n)
      price(v3Ref(addr(0x3002), WETH, T_OUT, 500), 10n ** 12n, 10n ** 12n, 11n)
      // The direct v2 pool: shallower on the way out, so it ranks second and stays visible.
      price(v2Ref(addr(0x2001), T_IN, T_OUT), 10n ** 12n, 5n * 10n ** 11n, 12n)
      const request: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: AMOUNT_IN }
      return { ctx: contextOf(world, manifest, index), request }
    },
  },
  {
    label: 'hermetic-no-route-complete',
    kind: 'quote',
    expect: { status: 'no-route' },
    notes:
      'The authoritative negative: every pool on the pair is known and every one of them reverts with no data ' +
      '(the pool-absent shape), discovery completes on both endpoints, and nothing was lost in the transport — ' +
      'the four conditions that entitle a search to say no rather than "could not tell".',
    build: () => {
      const world: World = new Map()
      const manifest = manifestOf({ v2: true })
      const index = new PoolIndex(WETH)
      for (let i = 0; i < 3; i++) {
        const pool = v2Ref(addr(0x2100 + i), T_IN, T_OUT)
        world.set(pool.id, { kind: 'revert' })
        index.upsert({ pool, source: 'event', createdAtBlock: BigInt(i + 1) })
      }
      const request: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: AMOUNT_IN }
      return { ctx: contextOf(world, manifest, index), request }
    },
  },
  {
    label: 'hermetic-needs-action-swap',
    kind: 'swap',
    expect: { status: 'needs-action' },
    notes:
      'The swap verdict no quote-shaped fixture can reach: the same hinted, verified route as the ready swap, ' +
      'but the trader has not approved the token to Permit2. The plan compiles, the preflight simulates ' +
      "against the router's own state and passes, and the result still carries `tx` — gated behind ONE stated " +
      'requirement rather than being downgraded to no-route, which is the distinction this fixture pins.',
    build: () => {
      const world: World = new Map()
      const manifest = manifestOf({ v2: true, execution: true })
      const hinted = v2Ref(computeV2PairAddress(V2_FACTORY, T_IN, T_OUT), T_IN, T_OUT)
      world.set(hinted.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
      const request: SwapRequest = {
        tokenIn: T_IN,
        tokenOut: T_OUT,
        amountIn: AMOUNT_IN,
        trader: TRADER,
        hints: [{ protocol: 'v2', token0: T_IN, token1: T_OUT }],
      }
      // Balance and the Permit2 allowance stay generous; only the ERC-20 -> Permit2 approval is
      // missing, so the requirement the result states has exactly one cause to name.
      return { ctx: contextOf(world, manifest, new PoolIndex(WETH), { erc20Allowance: 0n }), request }
    },
  },
  {
    label: 'hermetic-hooked-promoted',
    kind: 'quote',
    expect: { status: 'quote' },
    notes:
      'The simplicity margin, marked. A HOOKED v4 pool prices ~2bps above a plain v2 pool on the same pair — ' +
      'inside `SIMPLICITY_MARGIN_BPS` (5) — so ranking promotes the simple route to `best` and marks it ' +
      '`promotedOverComplex`. The only fixture whose `best` is deliberately outpriced by its own ' +
      '`alternatives`, which is exactly the shape `assertResultCoherent` accepts ONLY when that marker is set.',
    build: () => {
      const world: World = new Map()
      const manifest = manifestOf({ v2: true, v4: true })
      const index = new PoolIndex(WETH)
      // The plain pool: the reference price, and the route that must end up leading.
      const plain = v2Ref(addr(0x2300), T_IN, T_OUT)
      world.set(plain.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
      index.upsert({ pool: plain, source: 'event', createdAtBlock: 1n })
      // The hooked pool: 2bps deeper on the way out, so it wins on amountOut alone and loses to the
      // margin. `isHooked` is what makes it complex — no protocol boundary is crossed by either route.
      const hooked = v4Ref({ currency0: T_IN, currency1: T_OUT, fee: 3000, tickSpacing: 60, hooks: HOOK })
      world.set(hooked.id, { kind: 'price', r0: 10n ** 12n, r1: (10n ** 12n * 10_002n) / 10_000n })
      index.upsert({ pool: hooked, source: 'event', createdAtBlock: 2n })
      const request: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: AMOUNT_IN }
      return { ctx: contextOf(world, manifest, index), request }
    },
  },
  {
    label: 'hermetic-echo-hook-unverifiable',
    kind: 'quote',
    expect: { status: 'quote' },
    notes:
      'The unverifiable-quote partition, marked. A v4 pool whose hooks address carries ' +
      'BEFORE_SWAP_RETURNS_DELTA (the live Arbitrum echo hook) answers `amountIn` back as ' +
      '`amountOut` — numerically plausible, above the honest v2 price, and structurally just a ' +
      "hook's claim — so quote-mode ranking partitions it below the verifiable route: `best` is " +
      'the honest pool with NO promotion marker, and the echo route sits in `alternatives` ' +
      'outpricing it, licensed by its own `quoteUnverifiable: true`. The second legal ' +
      '`best`-outpriced-by-alternatives shape `assertResultCoherent` accepts, and the golden that ' +
      'pins the marker end-to-end.',
    build: () => {
      const world: World = new Map()
      const manifest = manifestOf({ v2: true, v4: true })
      const index = new PoolIndex(WETH)
      // The honest pool: constant-product math, ~997k out for 1M in — the route that must lead.
      const honest = v2Ref(addr(0x2500), T_IN, T_OUT)
      world.set(honest.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
      index.upsert({ pool: honest, source: 'event', createdAtBlock: 1n })
      // The echo pool: quotes exactly AMOUNT_IN (1M), which OUTPRICES the honest route on
      // amountOut alone — the exact live shape that ranked 100 ETH -> "100,000,000,000,000 USD₮0"
      // best on Arbitrum before the partition existed.
      const echo = v4Ref({ currency0: T_IN, currency1: T_OUT, fee: 0, tickSpacing: 10, hooks: ECHO_HOOK })
      world.set(echo.id, { kind: 'echo' })
      index.upsert({ pool: echo, source: 'event', createdAtBlock: 2n })
      const request: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: AMOUNT_IN }
      return { ctx: contextOf(world, manifest, index), request }
    },
  },
  {
    label: 'hermetic-mx-invalidation',
    kind: 'quote',
    expect: { status: 'quote' },
    notes:
      'The invalidation arm, pinned through a golden. A shallow (T_IN, WETH) pool sets m_X first and an ' +
      'out-leg is priced at that amount; then the adjacency scan — which only runs once the pump has gone ' +
      'dry — delivers a much deeper in-leg, m_X improves, and the out-leg measured at the old amount is ' +
      'outdated and re-measured at the new one. The log therefore contains the SAME out-leg pool at two ' +
      'different amounts, and the golden is the composition through the second.',
    build: () => {
      const world: World = new Map()
      const manifest = manifestOf({ v2: true })
      const index = new PoolIndex(WETH)
      // Known up front: a shallow way in to WETH, and the one way out of it.
      const weakIn = v2Ref(addr(0x2400), T_IN, WETH)
      world.set(weakIn.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 11n })
      index.upsert({ pool: weakIn, source: 'event', createdAtBlock: 1n })
      const out = v2Ref(addr(0x2401), WETH, T_OUT)
      world.set(out.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
      index.upsert({ pool: out, source: 'event', createdAtBlock: 2n })
      // NOT in the index: this one has to be DISCOVERED, which is what makes it arrive late. The
      // coverage worker only scans adjacency once the pump goes dry (`search/loop.ts`'s gate), so by
      // the time this pool exists the out-leg has already been priced at the shallow pool's m_X.
      const strongIn = v2Ref(addr(0x2402), T_IN, WETH)
      world.set(strongIn.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 13n })
      const log = creationLog(strongIn, T_IN, WETH, 10n)
      const request: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: AMOUNT_IN }
      return {
        ctx: contextOf(world, manifest, index, {
          // Matched honestly: this log names (T_IN, WETH), so only the adjacency query that pins
          // T_IN at topic 1 returns it — the one that pins the endpoints at topic 2 is asking about
          // pools whose token1 is T_IN or T_OUT, and this pool's is WETH.
          logs: (filter) => (servedBy(filter, log) ? [log] : []),
        }),
        request,
      }
    },
  },
  {
    label: 'hermetic-rpc-degraded',
    kind: 'quote',
    expect: { status: 'inconclusive', reason: 'rpc-degraded' },
    notes:
      'The other half of the no-route contract: the same pair, but the gateway 429s every quote instead of the ' +
      'chain answering. Discovery still completes, so only the transport-loss axis separates this from an ' +
      'authoritative no-route — and it must, or a rate-limited provider would be indistinguishable from a ' +
      'chain with no liquidity.',
    build: () => {
      const world: World = new Map()
      const manifest = manifestOf({ v2: true })
      const index = new PoolIndex(WETH)
      const pool = v2Ref(addr(0x2200), T_IN, T_OUT)
      world.set(pool.id, { kind: 'transport' })
      index.upsert({ pool, source: 'event', createdAtBlock: 1n })
      const request: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: AMOUNT_IN }
      return { ctx: contextOf(world, manifest, index), request }
    },
  },
  {
    label: 'hermetic-aborted',
    kind: 'quote',
    expect: { status: 'quote' },
    notes:
      "The abort arm, pinned through a golden. The caller's signal fires DURING the search — the moment the " +
      'first (and only) pool has been quoted — so the log carries an `abort` entry and the report says ' +
      '`aborted: true`, while the result still hands back the best route the search had already paid for. ' +
      'That combination is the whole abort contract: stopping early costs the remaining coverage, never the ' +
      'answer already in hand. It is also the only fixture whose log exercises `applyAbort`, so without it ' +
      "the fold's abort arm is code no golden ever replays.",
    build: () => {
      const world: World = new Map()
      const manifest = manifestOf({ v2: true })
      const index = new PoolIndex(WETH)
      const pool = v2Ref(addr(0x2600), T_IN, T_OUT)
      world.set(pool.id, { kind: 'price', r0: 10n ** 12n, r1: 10n ** 12n })
      index.upsert({ pool, source: 'event', createdAtBlock: 1n })
      // DETERMINISTIC BY POSITION IN THE CONVERSATION, not by a timer. The abort fires as this one
      // pool's quote is served, so the recorded log is abort-then-measurement: the abort poke wakes
      // the loop before this quote's own measurement continuation lands, so the `abort` entry is
      // written first and the `measurement` entry second. The loop still drains that in-flight quote
      // and keeps it as best-so-far — stopping early costs the remaining coverage, never the answer
      // already paid for — so the search always has exactly this one price when it stops, on every
      // machine, at any speed.
      const caller = new AbortController()
      const request: QuoteRequest = { tokenIn: T_IN, tokenOut: T_OUT, amountIn: AMOUNT_IN, signal: caller.signal }
      return {
        ctx: contextOf(world, manifest, index, {
          onQuoteServed: (poolId) => {
            if (poolId === pool.id) caller.abort()
          },
        }),
        request,
      }
    },
  },
]
