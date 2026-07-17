import type { Currency } from '@uniswap/sdk-core'
import type { Abi, AbiEvent, Address, Hex, PublicClient } from 'viem'

/**
 * The subset of a viem `PublicClient` the blockfeed engine and discovery actually use. Declaring the
 * dependency structurally (rather than as a bare `PublicClient`) lets OP-stack clients — e.g.
 * `createPublicClient({ chain: base })`, whose chain formatters make the full `PublicClient` generic
 * incompatible under strict TS — be passed without a cast. The engine needs `multicall`/`getLogs`/
 * `watchBlockNumber`; discovery additionally reads `getBlockNumber`. One shared type covers both.
 */
export type BlockfeedClient = Pick<PublicClient, 'multicall' | 'getLogs' | 'watchBlockNumber' | 'getBlockNumber'>

/** A single read against a contract, shaped for viem `multicall` / `readContract`. */
export interface ContractCall<TAbi extends Abi = Abi> {
  address: Address
  abi: TAbi
  functionName: string
  args: readonly unknown[]
}

/** allowFailure maps to aggregate3 per-call tolerance. Absent/false → a failure fails the whole tick. */
export interface SpeculativeCall extends ContractCall {
  allowFailure?: boolean
}

export interface LogFilter {
  address: Address
  event: AbiEvent
  /** Optional indexed-arg filters, viem `getLogs` style. */
  args?: Record<string, unknown>
}

export interface TickIdentity {
  chainId: number
  blockNumber: bigint
  /** Parent block hash from Multicall3.getLastBlockHash — best-effort fork discriminator. */
  parentBlockHash: Hex
  /** Block timestamp, seconds. */
  timestamp: bigint
}

export type CallResult = { status: 'success'; result: unknown } | { status: 'failure'; error: Error }

export interface FeedLogRef {
  txHash: Hex
  logIndex: number
  blockNumber: bigint
}

export interface DecodedFeedLog extends FeedLogRef {
  address: Address
  eventName: string
  args: Record<string, unknown>
}

export interface TickData {
  identity: TickIdentity
  /** Keyed by the source's call keys. */
  results: Record<string, CallResult>
  /** New logs matching this source's filters this tick (deduped). */
  logs: DecodedFeedLog[]
  /** Logs previously delivered to this source that a reorg removed. */
  retractions: FeedLogRef[]
}

export interface SourceEmission<T> {
  value: T
  phase?: string
  identity: TickIdentity
}

export interface TickContext<T> {
  prev: SourceEmission<T> | undefined
}

export interface Source<T> {
  /** Stable identity; equal keys share one evaluation and one store. */
  key: string
  calls(ctx: TickContext<T>): Record<string, SpeculativeCall>
  logFilters?(ctx: TickContext<T>): LogFilter[]
  /** PURE. Return undefined when required data is missing (no emission this tick). */
  derive(tick: TickData, ctx: TickContext<T>): SourceEmission<T> | undefined
  /** Emission suppression comparator; default is strict equality of `value`. */
  valueEquals?(a: T, b: T): boolean
}

export type FeedEvent<T> =
  | { type: 'tick'; emission: SourceEmission<T> }
  | { type: 'log'; log: DecodedFeedLog }
  | { type: 'retraction'; ref: FeedLogRef }
  | { type: 'phase'; from: string | undefined; to: string; identity: TickIdentity }
  | { type: 'gap'; fromBlock: bigint; toBlock: bigint }
  | { type: 'stale'; stale: boolean }

export interface FeedSnapshot<T> {
  current: SourceEmission<T> | undefined
  /** Oldest→newest rolling tick buffer, length ≤ bufferSize. */
  buffer: readonly SourceEmission<T>[]
  phase: string | undefined
  stale: boolean
  lastTick: TickIdentity | undefined
}

export interface FeedStore<T> {
  subscribe(listener: (e: FeedEvent<T>) => void): () => void
  getSnapshot(): FeedSnapshot<T>
}

// v4 PoolKey mirroring the on-chain struct
export interface PoolKeyStruct {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}

export type PoolRef =
  | { protocol: 'v2'; pair: Address }
  | { protocol: 'v3'; pool: Address }
  | { protocol: 'v4'; poolKey: PoolKeyStruct }

export interface PathLeg {
  pool: PoolRef
  base: Currency
  quote: Currency
}

export interface PricePath {
  base: Currency
  quote: Currency
  /** Ordered base→quote; leg[i].quote must equal leg[i+1].base (wrapped-equivalent). ≤2 legs in v1. */
  legs: PathLeg[]
}
