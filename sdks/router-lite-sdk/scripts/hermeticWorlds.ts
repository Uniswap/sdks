import { encodeAbiParameters } from 'viem'
import type { Address, Hex, Log, PublicClient } from 'viem'

import { v2Ref, v3Ref } from '../src/internal/testing'
import { PoolIndex } from '../src/pools/poolIndex'
import { PROTOCOL_MODULES } from '../src/protocols'
import type { ProtocolModule } from '../src/protocols/types'
import { computeV2PairAddress } from '../src/protocols/v2'
import type { SearchContext } from '../src/search/loop'
import type { ChainManifest, CurrencyRef, PoolRef, Protocol, QuoteRequest, SwapRequest } from '../src/types'

// ---------------------------------------------------------------------------
// THE HERMETIC CORPUS' FOUR WORLDS — deterministic, offline, and each built for
// exactly one thing the golden corpus must contain: a ready swap, a two-hop
// quote, a completed no-route, and an rpc-degraded search.
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
    parsePoolLog: () => null,
    encodeQuote: worldQuote(world),
  }
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

function manifestOf(opts: { v2?: boolean; v3?: boolean; execution?: boolean }): ChainManifest {
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

/** Every RPC one search issues, answered from the world: the pinned head, empty log scans, the
 * readiness reads (always "plenty", so a swap's leader is never gated `needs-action`), a preflight
 * that succeeds, and a quote decided by the pool's fate. */
function scriptedClient(world: World): Pick<PublicClient, 'request'> {
  return {
    async request(args: { method: string; params: unknown[] }) {
      const { method, params } = args
      if (method === 'eth_getBlockByNumber') {
        return { number: `0x${HEAD.toString(16)}`, hash: `0x${'ab'.repeat(32)}`, timestamp: `0x${TS.toString(16)}` }
      }
      if (method === 'eth_getLogs') return [] as Log[]
      if (method === 'eth_call') {
        const to = ((params[0] as { to: string }).to ?? '').toLowerCase()
        if (to === UR.toLowerCase()) return '0x' // the preflight simulates cleanly
        if (to === T_IN.toLowerCase() || to === T_OUT.toLowerCase()) {
          return encodeAbiParameters([{ type: 'uint256' }], [10n ** 30n]) // balanceOf / allowance
        }
        if (to === PERMIT2.toLowerCase()) {
          return encodeAbiParameters([{ type: 'uint160' }, { type: 'uint48' }, { type: 'uint48' }], [10n ** 30n, 2 ** 47, 0])
        }
        const identity = Buffer.from(String((params[0] as { data?: string }).data ?? '0x').slice(2), 'hex').toString()
        const poolId = identity.split('|')[0] ?? ''
        if (world.get(poolId)?.kind === 'transport') throw gatewayRefusal()
        return '0x' // decoded locally by the fake module against the world
      }
      throw new Error(`unexpected RPC method ${String(method)}`)
    },
  } as unknown as Pick<PublicClient, 'request'>
}

function contextOf(world: World, manifest: ChainManifest, index: PoolIndex): SearchContext {
  return {
    client: scriptedClient(world),
    manifest,
    modules: {
      v2: manifest.v2 ? fakeV2(world) : disabledModule('v2'),
      v3: manifest.v3 ? fakeV3(world) : disabledModule('v3'),
      v4: disabledModule('v4'),
    },
    index,
    hookData: new Map(),
  }
}

// ---------------------------------------------------------------------------
// The four scenarios
// ---------------------------------------------------------------------------

export type HermeticScenario = {
  label: string
  kind: 'quote' | 'swap'
  /** The status this world exists to produce. The recorder REFUSES to write a fixture whose golden
   * disagrees, so a world that drifts into producing something else fails loudly rather than quietly
   * leaving the corpus without the case it was supposed to cover. */
  expect: string
  notes: string
  build: () => { ctx: SearchContext; request: QuoteRequest | SwapRequest }
}

export const HERMETIC_SCENARIOS: HermeticScenario[] = [
  {
    label: 'hermetic-hinted-swap-ready',
    kind: 'swap',
    expect: 'ready',
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
    expect: 'quote',
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
    expect: 'no-route',
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
    label: 'hermetic-rpc-degraded',
    kind: 'quote',
    expect: 'inconclusive',
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
]
