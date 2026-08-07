import type { Address, Hex, Log } from 'viem'

import type {
  ChainManifest,
  Custody,
  CurrencyRef,
  EthCall,
  ExecutionOperation,
  LogQuery,
  PoolHint,
  PoolRecord,
  Protocol,
  QuoteCall,
  RouteCandidate,
  RouteLeg,
} from '../types'

// ---------------------------------------------------------------------------
// ProtocolModule — the per-protocol plugin surface (v2/v3/v4), internal only.
//
// Each module owns everything protocol-specific: speculative reserve/quoter
// probing, creation-event adjacency + parsing, hint validation, quote
// encoding, and execution-operation compilation. Nothing outside a module
// branches on `Protocol`; callers dispatch to the matching module instead.
// ---------------------------------------------------------------------------

/**
 * Discovery of fee tiers that did not exist at factory genesis (v3 only — v2 has no fee parameter
 * and v4 carries the fee in the PoolKey the caller already holds). `speculativeDirect` can only
 * probe the tiers a module knows about statically, so a governance-enabled tier is invisible until
 * the factory's own `FeeAmountEnabled` history is scanned. The module owns the query, the parse,
 * and the fee-parameterized probe construction; the *scan loop and its cache* live in the wave
 * engine, which is the only layer allowed to decide when RPC happens.
 */
export type FeeDiscovery = {
  /** The factory-wide fee-enablement query — one small, topic-narrow scan per factory, ever. */
  query(m: ChainManifest): LogQuery
  /** The fee tiers these logs enable; anything unrecognized is ignored, never thrown on. */
  feesFromLogs(logs: Log[], m: ChainManifest): number[]
  /** Direct-pair probes at exactly these fee tiers (the engine dedupes against what it already quoted). */
  probes(a: CurrencyRef, b: CurrencyRef, amountIn: bigint, fees: number[], m: ChainManifest): QuoteProbe[]
}

export interface ProtocolModule {
  readonly id: Protocol
  enabled(m: ChainManifest): boolean
  speculativeDirect(a: CurrencyRef, b: CurrencyRef, amountIn: bigint, m: ChainManifest): QuoteProbe[]
  adjacency(endpoint: Address, m: ChainManifest): LogQuery[]
  exactPair?(a: CurrencyRef, b: CurrencyRef, m: ChainManifest): LogQuery
  feeDiscovery?: FeeDiscovery
  parsePoolLog(log: Log, m: ChainManifest): PoolRecord | null
  validateHint(hint: PoolHint, call: (c: EthCall) => Promise<Hex>, m: ChainManifest): Promise<PoolRecord | null>
  encodeQuote(legs: RouteLeg[], amountIn: bigint, m: ChainManifest): QuoteCall
  compileOperation(legs: RouteLeg[], custody: Custody): ExecutionOperation
}
export type QuoteProbe = { candidate: RouteCandidate; quote: QuoteCall }
