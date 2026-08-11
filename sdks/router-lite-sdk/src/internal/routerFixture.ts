import type { Address, Hex, Log, PublicClient } from 'viem'
import { encodeAbiParameters, toHex } from 'viem'

import type { ProtocolModule } from '../protocols/types'
import type { ChainManifest, CurrencyRef, RouteLeg } from '../types'

import { headerNotFoundError, rateLimitHttpError, rateLimitRpcError } from './testing'

// ---------------------------------------------------------------------------
// THE FACADE'S WORLD: one fake chain, and one scripted `PublicClient` for it.
//
// `createRouter` hardwires the real v2/v3/v4 protocol modules, so the facade's
// suites stub nothing but the client — which makes the client the entire fixture,
// and a big one: {@link ClientScript} is a catalogue of the shapes a provider can
// fail in (a 429 on `eth_call` alone, `header not found` on the pinned reads, a
// head that moves between searches, a preflight that never settles) because
// every one of those is a distinct facade-level verdict.
//
// It lives here, rather than at the top of one suite, because the facade's tests
// are split across files by SUBJECT — classification (`router.classify.test.ts`),
// RPC degradation (`router.degraded.test.ts`), and the end-to-end body
// (`router.test.ts`) — and a fixture copied per file is a fixture that drifts:
// one file's stub would start answering a read another file's stub rejects, and
// each divergence is a class of bug one suite catches and the others wave
// through. The registry convention is the same everywhere: an `eth_call` the
// script does not answer is a pool that is not there.
//
// TEST-ONLY, and excluded from every build config — `build.surface.test.ts` pins
// that, exactly as it does for `internal/testing.ts`.
// ---------------------------------------------------------------------------

export const TOKEN_A = `0x${'aa'.repeat(20)}` as Address
export const TOKEN_B = `0x${'bb'.repeat(20)}` as Address
export const MID = `0x${'cc'.repeat(20)}` as Address
export const WRAPPED = `0x${'ee'.repeat(20)}` as Address
export const TRADER = `0x${'11'.repeat(20)}` as Address
export const UNIVERSAL_ROUTER = `0x${'22'.repeat(20)}` as Address
export const PERMIT2 = `0x${'33'.repeat(20)}` as Address
export const V2_FACTORY = `0x${'44'.repeat(20)}` as Address
export const V4_POOL_MANAGER = `0x${'55'.repeat(20)}` as Address
export const V4_QUOTER = `0x${'66'.repeat(20)}` as Address
export const V3_FACTORY = `0x${'77'.repeat(20)}` as Address
export const V3_QUOTER = `0x${'88'.repeat(20)}` as Address

export const CHAIN_ID = 1
export const BLOCK_NUMBER = 1_000_000n
export const BLOCK_TIMESTAMP = 1_700_000_000n
export const BLOCK_HASH = `0x${'ab'.repeat(32)}` as Hex
export const AMOUNT_IN = 1000n

/**
 * `v3` is OPT-IN (unlike `v4`) purely so this fixture's long-standing suites keep the wire they were
 * written against: enabling v3 adds four speculative QuoterV2 probes per pair to every search, which
 * the call-count assertions in `router.test.ts` would all have to be re-derived for. The v3 bundle
 * is otherwise ordinary — the stub embeds {@link V3_FACTORY} in its fake Universal Router bytecode
 * unconditionally, so `validateManifest`'s immutable fingerprint passes either way.
 */
export function baseManifest(opts: { v2Block?: bigint; v4?: boolean; v3?: boolean } = {}): ChainManifest {
  const m: ChainManifest = {
    chainId: CHAIN_ID,
    wrappedNative: WRAPPED,
    v2: { factory: V2_FACTORY, deploymentBlock: opts.v2Block ?? 100n },
    execution: { address: UNIVERSAL_ROUTER, commandSet: 'ur-2.0', permit2: PERMIT2, wrappedNative: WRAPPED },
    coreIntermediates: [],
  }
  if (opts.v4 ?? true) m.v4 = { poolManager: V4_POOL_MANAGER, deploymentBlock: 100n, quoter: V4_QUOTER }
  if (opts.v3 === true) m.v3 = { factory: V3_FACTORY, deploymentBlock: 100n, v3QuoterV2: V3_QUOTER }
  return m
}

/** Fixture-only stand-in for the deleted direct-probe helper: every hypothesis for (a, b), each
 * paired with its own direct-pair `encodeQuote` — the exact `{ quote }` shape the old probe API
 * returned, rebuilt from the two primitives (`hypotheses`, `encodeQuote`) that survive it. */
export function directProbes(module: ProtocolModule, a: CurrencyRef, b: CurrencyRef, amountIn: bigint, m: ChainManifest) {
  return module.hypotheses(a, b, m).map((pool) => {
    const leg: RouteLeg = { pool, currencyIn: a, currencyOut: b }
    return { quote: module.encodeQuote([leg], amountIn, m) }
  })
}

// ---------------------------------------------------------------------------
// Stub client
// ---------------------------------------------------------------------------

export type ClientScript = {
  calls?: Record<string, Hex>
  /** Logs for the given (lowercased) adjacency endpoint, pre-filtered by the caller is not
   * required — the stub itself clips to the requested [fromBlock, toBlock]. */
  logs?: (endpoint: string) => (Log & { blockNumber: bigint })[]
  /** Scripted preflight outcomes, in dispatch order; `hang` never settles — the deterministic way
   * to hold verification in flight while something else (an abort) decides the search. */
  preflight?: ('ok' | 'revert' | 'rate-limit' | 'hang')[]
  /** 429 every quote call (the quoter/pair `eth_call`s) while answering every other method — the
   * partial-outage shape a real provider produces when only `eth_call` is rate limited. */
  rateLimitQuotes?: boolean
  /** `header not found` on every quote call while `eth_getBlockByNumber` answers normally — the
   * load-balancer shape: the head came from one node, the pinned `eth_call`s go to another that is
   * behind it. Nothing here is a revert, and nothing is a 429 (C4-H1). */
  nodeStateQuotes?: boolean
  readiness?: { erc20Allowance?: bigint; permit2Allowance?: bigint; balance?: bigint }
  /** 429 the trader's `balanceOf` read while every other read lands — a throttled readiness check,
   * which must never be coerced into a stated `insufficient-balance available: 0n`. */
  rateLimitBalanceRead?: boolean
  /** Aborts this controller from *inside* the first quote call, after its answer is decided: the
   * route prices, and the loop's next cycle sees a fired signal. A deadline landing mid-search,
   * rather than between events. */
  abortOnQuote?: AbortController
  /** Fires from inside every quote call, after the answer is decided but before it is returned — the
   * same timing `abortOnQuote` uses, generalized to an arbitrary callback (C4-H5: a test's hook for
   * mutating router-level state, e.g. `clearIndex()`, at a precise point mid-search — standing in for
   * a host doing so from another task while this generator is paused on the event loop). */
  midSearch?: () => void
  chainId?: number
  /** A function rather than a value where a test needs the head to MOVE between (or within)
   * searches — the head-regression guard refetches once, so the fixture has to answer per call. */
  blockNumber?: bigint | (() => bigint)
  throwOnBlockFetch?: boolean
}

export type Counters = { scans: number; preflights: number; scannedEndpoints: Set<string>; blockFetches: number }

/** tokenIn is always {@link TOKEN_A} across these tests, so the ERC20 branch only needs to answer for it. */
export function stubClient(script: ClientScript): { client: PublicClient; counters: Counters } {
  const counters: Counters = { scans: 0, preflights: 0, scannedEndpoints: new Set(), blockFetches: 0 }
  const calls = script.calls ?? {}
  const balance = script.readiness?.balance ?? 10n ** 24n
  const erc20Allowance = script.readiness?.erc20Allowance ?? 10n ** 24n
  const permit2Allowance = script.readiness?.permit2Allowance ?? 10n ** 24n
  const headOf = (): bigint => (typeof script.blockNumber === 'function' ? script.blockNumber() : script.blockNumber ?? BLOCK_NUMBER)
  let preflightIndex = 0

  const client = {
    async getChainId() {
      return script.chainId ?? CHAIN_ID
    },
    async request(args: any) {
      if (args.method === 'eth_getBlockByNumber') {
        counters.blockFetches++
        if (script.throwOnBlockFetch) throw new Error('rpc unavailable')
        return { number: toHex(headOf()), hash: BLOCK_HASH, timestamp: toHex(BLOCK_TIMESTAMP) }
      }
      if (args.method === 'eth_getBalance') return toHex(balance)
      if (args.method === 'eth_getCode') {
        // `validateManifest`'s immutable cross-check (manifest.ts) fetches the execution address's
        // code unconditionally whenever `execution` is present, codeHash or not. This stub's fake
        // "bytecode" is just this manifest's own immutables concatenated — enough to satisfy that
        // substring check without asserting anything about real Universal Router bytecode.
        const [addr] = args.params as [string]
        if (addr.toLowerCase() !== UNIVERSAL_ROUTER.toLowerCase()) return '0x'
        const embed = [WRAPPED, PERMIT2, V2_FACTORY, V3_FACTORY, V4_POOL_MANAGER].map((a) => a.slice(2).toLowerCase()).join('')
        return `0x${embed}` as Hex
      }
      if (args.method === 'eth_getLogs') {
        const filter = args.params[0]
        counters.scans++
        // An unfiltered query would make a real provider return every log the factory ever emitted;
        // the scanner is supposed to always send its topic filter (see `internal/logScan.ts`).
        if (!Array.isArray(filter.topics) || filter.topics.length === 0)
          throw new Error('stubClient: eth_getLogs arrived with no topic filter')
        // A topic position holds `null` (anything), one value, or — since C5-C — an ARRAY of accepted
        // values, which is how one adjacency request carries BOTH of the trade's endpoints. Indexed
        // address topics are 32-byte left-padded; unpad back to plain lowercase addresses so callers
        // can key `logs`/`scannedEndpoints` by the address itself, not its topic encoding.
        const slot = (topic: unknown): string[] =>
          (topic === null || topic === undefined ? [] : Array.isArray(topic) ? topic : [topic]).filter((t): t is string => typeof t === 'string')
        const bound = [filter.topics[1], filter.topics[2]].map(slot).find((values) => values.length > 0) ?? []
        const endpoints = bound.map((t) => `0x${t.slice(-40)}`.toLowerCase() as Address)
        for (const endpoint of endpoints) counters.scannedEndpoints.add(endpoint)
        if (!script.logs || endpoints.length === 0) return []
        const from = BigInt(filter.fromBlock)
        const to = BigInt(filter.toBlock)
        // A node answers a merged filter with the union over its accepted values, so this stub does
        // too; ingestion is idempotent, so a log matching both endpoints arriving twice is harmless.
        return endpoints.flatMap((endpoint) => script.logs!(endpoint)).filter((log) => log.blockNumber >= from && log.blockNumber <= to)
      }
      if (args.method !== 'eth_call') throw new Error(`stubClient: unexpected method ${args.method}`)

      const [{ to, data }] = args.params
      const target = (to as string).toLowerCase()

      if (target === UNIVERSAL_ROUTER.toLowerCase()) {
        counters.preflights++
        const outcome = script.preflight?.[preflightIndex++] ?? 'ok'
        if (outcome === 'revert') throw Object.assign(new Error('execution reverted'), { data: '0xdeadbeef' })
        if (outcome === 'rate-limit') throw rateLimitHttpError()
        if (outcome === 'hang') return new Promise(() => {}) // never settles
        return '0x'
      }
      if (target === PERMIT2.toLowerCase()) {
        return encodeAbiParameters([{ type: 'uint160' }, { type: 'uint48' }, { type: 'uint48' }], [permit2Allowance, 2_000_000_000, 0])
      }
      if (target === TOKEN_A.toLowerCase()) {
        // balanceOf(address) has one argument; allowance(address,address) has two.
        const isBalanceOf = (data as string).length <= 10 + 64
        if (isBalanceOf && script.rateLimitBalanceRead) throw rateLimitHttpError()
        const value = isBalanceOf ? balance : erc20Allowance
        return encodeAbiParameters([{ type: 'uint256' }], [value])
      }

      // Quote calls (quoters, v2 pairs) — the only branch the partial outage touches.
      if (script.rateLimitQuotes) throw rateLimitRpcError()
      if (script.nodeStateQuotes) throw headerNotFoundError()
      const entry = calls[`${target}:${data}`]
      script.abortOnQuote?.abort() // the answer is already decided; the deadline lands on the way out
      script.midSearch?.()
      if (entry === undefined) throw new Error('execution reverted') // no pool there
      return entry
    },
  } as unknown as PublicClient

  return { client, counters }
}

export function v2Return(reserveIn: bigint, reserveOut: bigint, zeroForOne: boolean): Hex {
  const [reserve0, reserve1] = zeroForOne ? [reserveIn, reserveOut] : [reserveOut, reserveIn]
  return encodeAbiParameters([{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }], [reserve0, reserve1, 0])
}

export function v4Return(amountOut: bigint): Hex {
  return encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [amountOut, 0n])
}

export function entryFor(call: { to: Address; data: Hex }, value: Hex): Record<string, Hex> {
  return { [`${call.to.toLowerCase()}:${call.data}`]: value }
}
