import type { Currency } from '@uniswap/sdk-core'
import type { Abi, AbiEvent, Address, Hex, PublicClient } from 'viem'

/**
 * The subset of a viem `PublicClient` the blockfeed engine and discovery actually use. Declaring the
 * dependency structurally (rather than as a bare `PublicClient`) lets OP-stack clients — e.g.
 * `createPublicClient({ chain: base })`, whose chain formatters make the full `PublicClient` generic
 * incompatible under strict TS — be passed without a cast. The engine needs `multicall`/`getLogs`/
 * `watchBlockNumber`; discovery additionally reads `getBlockNumber`. One shared type covers both.
 *
 * `transport.type` is part of the declared contract so the engine's WebSocket sniff needs no cast; a
 * real viem client always carries it, and non-viem structural clients simply omit it (HTTP semantics).
 */
export type BlockfeedClient = Pick<PublicClient, 'multicall' | 'getLogs' | 'watchBlockNumber' | 'getBlockNumber'> & {
  transport?: { type?: string }
  /** viem clients carry `chain.id`; used as the default `chainId` when constructing a feed. */
  chain?: { id?: number }
}

/**
 * A single read against a contract, shaped for viem `multicall` / `readContract`. `allowFailure` maps
 * to aggregate3 per-call tolerance: absent/false → a failing call fails the whole tick; `true` →
 * the failure is isolated to this call's result (the source sees a `failure` `CallResult`).
 */
export interface ContractCall<TAbi extends Abi = Abi> {
  address: Address
  abi: TAbi
  functionName: string
  args: readonly unknown[]
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

export interface DecodedFeedLog {
  txHash: Hex
  logIndex: number
  blockNumber: bigint
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
  /** Logs previously delivered to this source that a reorg removed (the full log, not just a ref). */
  retractions: DecodedFeedLog[]
}

export interface SourceEmission<T> {
  value: T
  identity: TickIdentity
}

export interface Source<T> {
  /** Stable identity; equal keys share one evaluation and one store. */
  key: string
  calls(prev: SourceEmission<T> | undefined): Record<string, ContractCall>
  logFilters?(prev: SourceEmission<T> | undefined): LogFilter[]
  /** PURE. Return undefined when required data is missing (no emission this tick). */
  derive(tick: TickData, prev: SourceEmission<T> | undefined): SourceEmission<T> | undefined
  /** Emission suppression comparator; default is strict equality of `value`. */
  valueEquals?(a: T, b: T): boolean
}

export type FeedEvent<T> =
  | { type: 'tick'; emission: SourceEmission<T> }
  | { type: 'log'; log: DecodedFeedLog }
  | { type: 'retraction'; log: DecodedFeedLog }
  | { type: 'gap'; fromBlock: bigint; toBlock: bigint }
  | { type: 'stale'; stale: boolean }
  /**
   * A diagnostic error (fan-out-only; never enters the tick buffer). `scope: 'tick'` is a shared
   * failure (atomic read / getLogs) delivered to every active store; `scope: 'source'` is a throwing
   * `derive`, delivered only to that source's store. `identity` is the tick's identity when known.
   */
  | { type: 'error'; scope: 'tick' | 'source'; error: unknown; identity?: TickIdentity }

export interface FeedSnapshot<T> {
  current: SourceEmission<T> | undefined
  /** Oldest→newest rolling tick buffer, length ≤ bufferSize. */
  buffer: readonly SourceEmission<T>[]
  /** Delivered logs (after book dedupe), oldest→newest, length ≤ bufferSize; retractions remove. */
  logs: readonly DecodedFeedLog[]
  stale: boolean
  lastTick: TickIdentity | undefined
  /** Most recent error since the last successful emission; cleared when this store next ticks. */
  lastError: { scope: 'tick' | 'source'; error: unknown; identity?: TickIdentity } | undefined
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
