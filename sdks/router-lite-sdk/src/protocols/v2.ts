import type { Address, Hex } from 'viem'
import { decodeEventLog, decodeFunctionResult, encodeEventTopics, encodeFunctionData, encodePacked, getCreate2Address, keccak256 } from 'viem'

import { RouterConfigError, UnsupportedRouteError } from '../errors'
import { V2_FACTORY_ABI, V2_PAIR_ABI } from '../internal/abis'
import { sortAddresses } from '../internal/currency'
import { narrowTopics } from '../internal/logScan'
import type { ChainManifest, CurrencyRef, ExecutionOperation, LogQuery, RouteLeg } from '../types'

import { v2PoolRef } from './poolRef'
import type { ProtocolModule, QuoteProbe } from './types'

// ---------------------------------------------------------------------------
// v2 module — speculative reserves quoting.
//
// v2 pair addresses are pure CREATE2 (no factory lookup required), so
// `speculativeDirect` never touches the factory: it computes the pair address
// locally and emits a single `getReserves` probe. A v2-v2 two-hop is two
// single-leg segments chained by the caller (`encodeQuote` never sees more
// than one leg) — reserves compose leg-by-leg, not within one call.
// ---------------------------------------------------------------------------

/**
 * keccak256 of the UniswapV2Pair creation code — the CREATE2 init code hash for the canonical v2
 * factory deployment and every ordinary EVM fork of it. The DEFAULT, not a law of nature: a chain
 * whose CREATE2 derivation or pair bytecode differs (zkSync-class chains hash a different preimage
 * entirely) overrides it via `ChainManifest.v2.initCodeHash`, without which every address computed
 * here points at empty space and the search reports a confident `no-route`.
 */
export const V2_INIT_CODE_HASH: Hex = '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f'

/**
 * Computes the deterministic UniswapV2Pair address for (a, b) via CREATE2 — matches
 * `@uniswap/v2-sdk`'s `Pair.getAddress` without importing it (this module is RPC-only,
 * no ethers dependency at runtime).
 *
 * `initCodeHash` defaults to {@link V2_INIT_CODE_HASH}; callers inside this module always pass the
 * manifest's, so the default only applies to a manifest that did not state one.
 */
export function computeV2PairAddress(
  factory: Address,
  a: Address,
  b: Address,
  initCodeHash: Hex = V2_INIT_CODE_HASH,
): Address {
  const [token0, token1] = sortAddresses(a, b)
  const salt = keccak256(encodePacked(['address', 'address'], [token0, token1]))
  return getCreate2Address({ from: factory, salt, bytecodeHash: initCodeHash })
}

/** UniswapV2Pair constant-product output, net of the 0.3% LP fee (997/1000 on the input). */
export function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  const amountInWithFee = amountIn * 997n
  return (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee)
}

function requireV2(m: ChainManifest): NonNullable<ChainManifest['v2']> {
  if (!m.v2) throw new RouterConfigError('v2 module invoked against a manifest with no v2 bundle')
  return m.v2
}

/** The two adjacency-query filters for `token` against the v2 factory's `PairCreated`, one per indexed slot. */
function v2AdjacencyQueries(contract: Address, token: Address): [LogQuery, LogQuery] {
  return [
    { address: contract, topics: narrowTopics(encodeEventTopics({ abi: V2_FACTORY_ABI, eventName: 'PairCreated', args: { token0: token } })) },
    { address: contract, topics: narrowTopics(encodeEventTopics({ abi: V2_FACTORY_ABI, eventName: 'PairCreated', args: { token1: token } })) },
  ]
}

/** 'native' normalizes to the wrapped address on-chain; concrete addresses pass through. */
function resolveAddress(c: CurrencyRef, wrappedNative: Address): Address {
  return c === 'native' ? wrappedNative : c
}

function reservesQuote(pairAddress: Address, zeroForOne: boolean, amountIn: bigint): QuoteProbe['quote'] {
  return {
    call: { to: pairAddress, data: encodeFunctionData({ abi: V2_PAIR_ABI, functionName: 'getReserves' }) },
    decode(returnData: Hex): bigint {
      // Throws on empty/short returndata (pool absent) — decodeFunctionResult rejects
      // undersized data rather than silently zero-filling it.
      const [reserve0, reserve1] = decodeFunctionResult({ abi: V2_PAIR_ABI, functionName: 'getReserves', data: returnData })
      const [reserveIn, reserveOut] = zeroForOne ? [reserve0, reserve1] : [reserve1, reserve0]
      // An initialized-but-empty pair (created, never funded) returns all-zero reserves rather
      // than reverting — decodeFunctionResult happily decodes that as valid. Treat it the same as
      // "pool absent": throw so the probe is counted failed instead of surfacing a spurious
      // amountOut of 0 as a real quote.
      if (reserveIn === 0n || reserveOut === 0n) throw new Error('v2 pair has zero reserves')
      return getAmountOut(amountIn, reserveIn, reserveOut)
    },
  }
}

export const v2Module = {
  id: 'v2',

  enabled(m) {
    return !!m.v2
  },

  speculativeDirect(a, b, amountIn, m) {
    if (!m.v2) return []
    const wrappedNative = m.wrappedNative
    const aAddr = resolveAddress(a, wrappedNative)
    const bAddr = resolveAddress(b, wrappedNative)
    const [token0, token1] = sortAddresses(aAddr, bAddr)
    const zeroForOne = aAddr.toLowerCase() === token0.toLowerCase()
    const address = computeV2PairAddress(m.v2.factory, aAddr, bAddr, m.v2.initCodeHash)
    const pool = v2PoolRef(address, token0, token1)
    const leg: RouteLeg = { pool, currencyIn: a, currencyOut: b }
    const probe: QuoteProbe = { candidate: { legs: [leg] }, quote: reservesQuote(address, zeroForOne, amountIn) }
    return [probe]
  },

  adjacency(endpoint, m) {
    if (!m.v2) return []
    return v2AdjacencyQueries(m.v2.factory, endpoint)
  },

  parsePoolLog(log, m) {
    // Validate that m.v2 exists and the log is from the configured v2 factory. `log` is
    // caller-supplied via `router.ingestLogs`/`ingestReceipt`, so its declared shape is an
    // assertion, not a guarantee — a `null` entry or an object with no `address` must be skipped
    // like any other non-matching log, never crash the batch (C4-H4).
    if (!m.v2 || typeof log?.address !== 'string' || log.address.toLowerCase() !== m.v2.factory.toLowerCase()) {
      return null
    }
    try {
      const decoded = decodeEventLog({ abi: V2_FACTORY_ABI, eventName: 'PairCreated', topics: log.topics, data: log.data })
      // The event's last param (uint256, the pair-count index) is unnamed, so viem returns
      // args as a positional tuple rather than a named object: [token0, token1, pair, _count].
      const [token0, token1, pair] = decoded.args
      const pool = v2PoolRef(pair, token0, token1)
      return { pool, createdAtBlock: log.blockNumber ?? undefined, source: 'event' }
    } catch {
      // Not a PairCreated log (wrong topic0/shape) — not this module's event.
      return null
    }
  },

  async validateHint(hint, _call, m) {
    if (hint.protocol !== 'v2') return null
    const { factory, initCodeHash } = requireV2(m)
    const address = computeV2PairAddress(factory, hint.token0, hint.token1, initCodeHash)
    // The CREATE2 address is fully determined by (factory, token0, token1) — no RPC call is
    // needed to validate a v2 hint, unlike v3 where the fee tier isn't recoverable locally.
    if (hint.pool && hint.pool.toLowerCase() !== address.toLowerCase()) return null
    const [token0, token1] = sortAddresses(hint.token0, hint.token1)
    const pool = v2PoolRef(address, token0, token1)
    return { pool, source: 'hint' }
  },

  encodeQuote(legs, amountIn, m) {
    if (legs.length !== 1) throw new UnsupportedRouteError(`v2 segments are single-leg; got ${legs.length} legs`)
    const leg = legs[0]!
    if (leg.pool.protocol !== 'v2') throw new UnsupportedRouteError(`v2 encodeQuote received a ${leg.pool.protocol} leg`)
    const wrappedNative = m.wrappedNative
    const inAddr = resolveAddress(leg.currencyIn, wrappedNative)
    const zeroForOne = inAddr.toLowerCase() === leg.pool.token0.toLowerCase()
    return reservesQuote(leg.pool.address, zeroForOne, amountIn)
  },

  compileOperation(legs, custody): ExecutionOperation {
    return { kind: 'v2-swap', legs, payer: custody.payer, recipient: custody.recipient }
  },
} satisfies ProtocolModule
