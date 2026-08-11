import type { Address, Hex, Log } from 'viem'
import { decodeEventLog, decodeFunctionResult, encodeEventTopics, encodeFunctionData, isAddressEqual, zeroAddress } from 'viem'

import { RouterConfigError, UnsupportedRouteError } from '../errors'
import { V4_POOL_MANAGER_ABI, V4_QUOTER_ABI } from '../internal/abis'
import { sortAddresses } from '../internal/currency'
import { narrowTopics } from '../internal/logScan'
import type { ChainManifest, CurrencyRef, DecodedQuote, EthCall, ExecutionOperation, LogQuery, PoolKey, QuoteCall, RouteLeg } from '../types'

import { v4PoolRef, type V4PoolRef } from './poolRef'
import type { ProtocolModule } from './types'

// ---------------------------------------------------------------------------
// v4 module — PoolManager singleton, V4Quoter speculative quoting.
//
// Unlike v2/v3, a v4 pool has no independently deployed contract — its
// identity is a `poolId` derived from the full `PoolKey` (currency0,
// currency1, fee, tickSpacing, hooks), and all state lives inside the
// singleton PoolManager. That has two consequences that shape this module:
//
//  - There is no CREATE2 address and no factory `getPool` lookup to validate
//    a hint against, so `validateHint` is purely local: recompute the poolId
//    from the (sorted) key and trust it — no RPC round-trip.
//  - `Initialize` logs carry the full key redundantly with the indexed `id`,
//    so `parsePoolLog` recomputes the id from the decoded key and rejects the
//    log outright on any mismatch, rather than trusting the indexed value.
//
// Native currency is `address(0)` on-chain (never the wrapped address) — v4
// PoolKeys, V4Quoter calls, and Initialize topics all use the zero address
// for the native leg; only `RouteLeg.currencyIn/currencyOut` keep the
// `CurrencyRef` 'native' literal.
// ---------------------------------------------------------------------------

/** The four fee tiers usable with no hooks and their canonical tick spacings, per `IPoolManager`. */
export const STANDARD_V4_CONFIGS: readonly { fee: number; tickSpacing: number }[] = [
  { fee: 100, tickSpacing: 1 },
  { fee: 500, tickSpacing: 10 },
  { fee: 3000, tickSpacing: 60 },
  { fee: 10000, tickSpacing: 200 },
]

/** The PathKey struct consumed by `V4Quoter.quoteExactInput`'s `path` array. */
type PathKeyStruct = {
  intermediateCurrency: Address
  fee: number
  tickSpacing: number
  hooks: Address
  hookData: Hex
}

function requireV4(m: ChainManifest): { poolManager: Address; deploymentBlock: bigint; quoter: Address } {
  if (!m.v4) throw new RouterConfigError('v4 module invoked against a manifest with no v4 bundle')
  return m.v4
}

/** `Initialize`'s topic0, derived from the ABI rather than written down — the drift guard in
 * `v4.test.ts` pins the value this produces. */
const INITIALIZE_TOPIC0 = encodeEventTopics({ abi: V4_POOL_MANAGER_ABI, eventName: 'Initialize' })[0]

/** The exact-pair `Initialize` filter for the sorted (currency0, currency1). */
function v4ExactPairQuery(contract: Address, a: Address, b: Address): LogQuery {
  const [currency0, currency1] = sortAddresses(a, b)
  return {
    address: contract,
    topics: narrowTopics(encodeEventTopics({ abi: V4_POOL_MANAGER_ABI, eventName: 'Initialize', args: { currency0, currency1 } })),
  }
}

/** 'native' is address(0) on-chain for v4 — never the wrapped address. */
function toV4Address(c: CurrencyRef): Address {
  return c === 'native' ? zeroAddress : c
}

/** Builds a fully-sorted PoolKey for (a, b, fee, tickSpacing) with no hooks. Sort happens
 * *after* mapping native to address(0), since address(0) always sorts first. */
function buildPoolKey(a: CurrencyRef, b: CurrencyRef, fee: number, tickSpacing: number): PoolKey {
  const [currency0, currency1] = sortAddresses(toV4Address(a), toV4Address(b))
  return { currency0, currency1, fee, tickSpacing, hooks: zeroAddress }
}

/**
 * Maps route legs to the `PathKey[]` shape `V4Quoter.quoteExactInput` expects: each entry
 * carries the *output* currency of its leg (the path is a chain of "what you arrive at, and
 * through which pool"), as a v4 address (native -> address(0)). `hookData` is request-scoped
 * (from the hint that produced the leg, not the pool index) and defaults to `0x` when absent.
 */
export function toPathKeys(legs: RouteLeg[]): PathKeyStruct[] {
  return legs.map((leg) => {
    if (leg.pool.protocol !== 'v4') throw new UnsupportedRouteError(`v4 toPathKeys received a ${leg.pool.protocol} leg`)
    const { fee, tickSpacing, hooks } = leg.pool.poolKey
    return {
      intermediateCurrency: toV4Address(leg.currencyOut),
      fee,
      tickSpacing,
      hooks,
      hookData: leg.hookData ?? '0x',
    }
  })
}

function quoterQuote(quoter: Address, legs: RouteLeg[], amountIn: bigint): QuoteCall {
  const exactCurrency = toV4Address(legs[0]!.currencyIn)
  const path = toPathKeys(legs)
  return {
    call: {
      to: quoter,
      data: encodeFunctionData({
        abi: V4_QUOTER_ABI,
        functionName: 'quoteExactInput',
        args: [{ exactCurrency, path, exactAmount: amountIn }],
      }),
    },
    decode(returnData: Hex): DecodedQuote {
      const result = decodeFunctionResult({ abi: V4_QUOTER_ABI, functionName: 'quoteExactInput', data: returnData })
      // `result[1]` is V4Quoter's own `gasEstimate` word — reported verbatim, never used to rank.
      // See `RouteQuote.gasEstimate` for what it measures and how far it moves between envelopes.
      return { amountOut: result[0], gasEstimate: result[1] }
    },
  }
}

/** v4's standard no-hook configs for (a, b): the fee/tickSpacing pairs the PoolManager singleton
 * carries at genesis. `extraFees` doesn't apply — v4's fee lives in the PoolKey the caller already
 * holds, not a factory-scanned tier like v3's. Pure — no RPC. */
function v4Hypotheses(a: CurrencyRef, b: CurrencyRef, m: ChainManifest): V4PoolRef[] {
  if (!m.v4) return []
  return STANDARD_V4_CONFIGS.map(({ fee, tickSpacing }) => v4PoolRef(buildPoolKey(a, b, fee, tickSpacing)))
}

export const v4Module = {
  id: 'v4',

  enabled(m) {
    return !!m.v4
  },

  hypotheses(a, b, m, _extraFees?) {
    return v4Hypotheses(a, b, m)
  },

  adjacencyShape(m) {
    if (!m.v4) return undefined
    const wrappedNative = m.wrappedNative
    // `Initialize(id indexed, currency0 indexed, currency1 indexed, ...)` — the pool id takes
    // topic1, so the currencies sit one slot deeper than v2/v3's pair (topics 2/3). v4 therefore
    // merges only with itself; the planner groups by exactly this number.
    //
    // The graph normalizes the native family to `wrappedNative`, but v4's topics index the raw
    // on-chain currency — address(0) for native, never the wrapped address — so a wrapped-native
    // endpoint is mapped back before it can match anything.
    return {
      emitter: m.v4.poolManager,
      topic0: INITIALIZE_TOPIC0,
      slot: 2,
      topicAddress: (endpoint) => (isAddressEqual(endpoint, wrappedNative) ? zeroAddress : endpoint),
    }
  },

  exactPair(a, b, m) {
    const { poolManager } = requireV4(m)
    return v4ExactPairQuery(poolManager, toV4Address(a), toV4Address(b))
  },

  parsePoolLog(log: Log, m) {
    // Validate that m.v4 exists and the log is from the configured PoolManager singleton. `log` is
    // caller-supplied via `router.ingestLogs`/`ingestReceipt`, so its declared shape is an
    // assertion, not a guarantee — a `null` entry or an object with no `address` must be skipped
    // like any other non-matching log, never crash the batch (C4-H4).
    // `.toLowerCase()` HERE ON PURPOSE, NOT `isAddressEqual` (R3, C4-H4): `log.address` is
    // caller-supplied through `ingestLogs`/`ingestReceipt`. `isAddressEqual` throws on a malformed
    // operand, which would let one junk entry abort the whole batch instead of being skipped.
    if (!m.v4 || typeof log?.address !== 'string' || log.address.toLowerCase() !== m.v4.poolManager.toLowerCase()) {
      return null
    }
    try {
      const decoded = decodeEventLog({ abi: V4_POOL_MANAGER_ABI, eventName: 'Initialize', topics: log.topics, data: log.data })
      const { id, currency0, currency1, fee, tickSpacing, hooks } = decoded.args
      const pool = v4PoolRef({ currency0, currency1, fee, tickSpacing, hooks })
      // Integrity check: the indexed `id` is redundant with the decoded key fields, and the ref's
      // own `poolId` is recomputed from them. A mismatch means the log doesn't actually describe the
      // pool it claims to (or was tampered with) — reject it rather than trusting either value blindly.
      // `.toLowerCase()`, not `isAddressEqual` (R3): a v4 poolId is a 32-byte hash, not an address.
      if (pool.poolId.toLowerCase() !== id.toLowerCase()) return null
      return { pool, createdAtBlock: log.blockNumber ?? undefined, source: 'event' }
    } catch {
      // Not an Initialize log (wrong topic0/shape) — not this module's event.
      return null
    }
  },

  async validateHint(hint, _call: (c: EthCall) => Promise<Hex>, m) {
    if (hint.protocol !== 'v4') return null
    // No RPC round-trip: a v4 poolId is a pure function of the (sorted) PoolKey, so hint
    // validation is a local recomputation, not a factory/manager lookup like v3's.
    requireV4(m)
    const { fee, tickSpacing, hooks } = hint.poolKey
    const [currency0, currency1] = sortAddresses(hint.poolKey.currency0, hint.poolKey.currency1)
    const pool = v4PoolRef({ currency0, currency1, fee, tickSpacing, hooks })
    return { pool, source: 'hint' }
  },

  encodeQuote(legs, amountIn, m) {
    if (legs.length === 0) throw new UnsupportedRouteError('v4 segments require at least one leg')
    for (const leg of legs) {
      if (leg.pool.protocol !== 'v4') throw new UnsupportedRouteError(`v4 encodeQuote received a ${leg.pool.protocol} leg`)
    }
    const { quoter } = requireV4(m)
    return quoterQuote(quoter, legs, amountIn)
  },

  compileOperation(legs, custody): ExecutionOperation {
    return { kind: 'v4-swap', legs, settleFrom: custody.payer, takeTo: custody.recipient }
  },
} satisfies ProtocolModule
