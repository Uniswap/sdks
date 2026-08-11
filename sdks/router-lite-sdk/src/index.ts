// ---------------------------------------------------------------------------
// @uniswap/router-lite-sdk — public entry point.
//
// The whole public surface: `createRouter` (the facade), `manifestFor` / the built-in manifests
// (`MAINNET_MANIFEST`, `BASE_MANIFEST`, `UNICHAIN_MANIFEST`, `ARBITRUM_MANIFEST`,
// `ROBINHOOD_MANIFEST` — chain
// configuration), the domain types requests and results are built from, and the two errors the
// package ever throws.
// Everything else (discovery, quoting, planning, encoding, verifying, the
// solver loop itself) is internal — reachable only through the router, or,
// for callers building their own search policy, through the `./experimental`
// subpath.
// ---------------------------------------------------------------------------

import type { QuoteResult, SwapResult } from './types'

export { createRouter } from './router'
export type { CreateRouterOptions, Router, RouterStats } from './router'

export {
  manifestFor,
  MAINNET_MANIFEST,
  BASE_MANIFEST,
  UNICHAIN_MANIFEST,
  ARBITRUM_MANIFEST,
  ROBINHOOD_MANIFEST,
} from './manifest'

export { RouterConfigError, UnsupportedRouteError } from './errors'

// `REASON_CODES` (C4-P5) is exported as a value, not just `ReasonCode` as a type, so a caller can
// `REASON_CODES.includes(x)`/iterate it (an exhaustiveness table, a Zod/io-ts enum, ...) without
// hand-copying the closed set this package defines it from.
export { REASON_CODES } from './types'

// `PROTOCOLS` is exported as a value for the same reason as `REASON_CODES` above: the `Protocol`
// type names the closed set but cannot be walked at run time, so anything that needs one row/entry
// per protocol (a coverage table, a `Record<Protocol, …>` builder, a manifest filter) was
// hand-copying `['v2', 'v3', 'v4'] as const` — a literal that silently stops matching the day a
// protocol is added. `SearchReport.discovery` is already keyed by exactly this set.
export { PROTOCOLS } from './types'

// `EthCall`, `QuoteCall`, and `LogQuery` are internal RPC/plugin-surface primitives (only ever
// appearing in `ProtocolModule`, which itself is internal) — no public type reaches them, so they
// are deliberately not re-exported here. `Custody` is the same kind of primitive, but it (like
// `ProtocolModule` itself) is re-exported from `./experimental` for callers building their own
// execution-plan compilation on top of `compileExecutionPlan`/`ProtocolModule.compileOperation`.
// `BlockRange` and `Protocol` stay here: both are reachable from `SearchReport`
// (`discovery: Record<Protocol, { coveredRanges: BlockRange[]; ... }>`), which every
// `QuoteResult`/`SwapResult` carries as `search`.
//
// `SwapOperation`/`ConversionOperation` are exported alongside `ExecutionOperation` for the same
// reason: `ExecutionOperation` IS their union, so a caller narrowing an `ExecutionPlan.operations`
// entry (a `switch` over `kind`, a per-arm renderer) already holds one of the two halves and had no
// name for it — the union was exported while neither of its members was.
export type {
  BlockRange,
  BlockRef,
  ChainData,
  ChainManifest,
  CompiledLimits,
  ConversionOperation,
  CurrencyRef,
  EncodedTx,
  ExecutionOperation,
  ExecutionPlan,
  ExecutionRequirement,
  Permit2PermitSingle,
  PoolHint,
  PoolKey,
  PoolRecord,
  PoolRef,
  Protocol,
  QuoteRequest,
  QuoteResult,
  QuotedRoute,
  RankedRoute,
  Reason,
  ReasonCode,
  RouteCandidate,
  RouteLeg,
  RouteQuote,
  SearchEvent,
  SearchReport,
  SwapOperation,
  SwapRequest,
  SwapResult,
  UniversalRouterDeployment,
} from './types'

// Names for the three variants callers narrow to and then pass around (a `ready` swap handed to a
// send helper, a `needs-action` swap handed to a UI). `Extract` keeps them defined by the unions
// rather than duplicated from them: a field added to `ready` appears here for free, and a status
// that stops existing becomes `never` instead of quietly drifting out of date.
export type ReadySwap = Extract<SwapResult, { status: 'ready' }>
export type NeedsActionSwap = Extract<SwapResult, { status: 'needs-action' }>
export type SuccessfulQuote = Extract<QuoteResult, { status: 'quote' }>
