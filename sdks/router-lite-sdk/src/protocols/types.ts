import type { Hex, Log } from 'viem'

import type {
  ChainManifest,
  Custody,
  CurrencyRef,
  EthCall,
  ExecutionOperation,
  LogQuery,
  PoolHint,
  PoolRecord,
  PoolRef,
  Protocol,
  QuoteCall,
  RouteLeg,
} from '../types'

import type { AdjacencyShape } from './adjacency'

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
 * and v4 carries the fee in the PoolKey the caller already holds). `hypotheses` can only derive the
 * tiers a module knows about statically, so a governance-enabled tier is invisible until the
 * factory's own `FeeAmountEnabled` history is scanned. The module owns the query and the parse; the
 * *scan loop and its cache* live in `search/coverage.ts`, the only layer allowed to decide when RPC
 * happens.
 */
export type FeeDiscovery = {
  /** The factory-wide fee-enablement query — one small, topic-narrow scan per factory, ever. */
  query(m: ChainManifest): LogQuery
  /** The fee tiers these logs enable; anything unrecognized is ignored, never thrown on. */
  feesFromLogs(logs: Log[], m: ChainManifest): number[]
}

export interface ProtocolModule {
  readonly id: Protocol
  enabled(m: ChainManifest): boolean
  /** Pool identities derivable for (a, b) without discovery: v2's pair address,
   *  v3's CREATE2 address per standard + `extraFees` tier, v4's standard configs.
   *  Pure — no RPC, no index. Existence is the pump's job to prove by measurement. */
  hypotheses(a: CurrencyRef, b: CurrencyRef, manifest: ChainManifest, extraFees?: number[]): PoolRef[]
  /**
   * Where this protocol's pool-creation events live and how they index the pool's currencies —
   * enough for `protocols/adjacency.ts` to BUILD the "every pool touching X" filters, rather than
   * the filters themselves.
   *
   * IT IS A SHAPE AND NOT A QUERY BECAUSE SHAPES COMPOSE (C5-C). Two protocols whose currencies sit
   * at the same topic slots can be asked in ONE `eth_getLogs` — address array plus OR-topics — and a
   * module that hands back finished filters can never be merged with another module's. `undefined`
   * when the manifest does not configure this protocol.
   */
  adjacencyShape(m: ChainManifest): AdjacencyShape | undefined
  exactPair?(a: CurrencyRef, b: CurrencyRef, m: ChainManifest): LogQuery
  feeDiscovery?: FeeDiscovery
  parsePoolLog(log: Log, m: ChainManifest): PoolRecord | null
  validateHint(hint: PoolHint, call: (c: EthCall) => Promise<Hex>, m: ChainManifest): Promise<PoolRecord | null>
  encodeQuote(legs: RouteLeg[], amountIn: bigint, m: ChainManifest): QuoteCall
  compileOperation(legs: RouteLeg[], custody: Custody): ExecutionOperation
}
