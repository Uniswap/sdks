import type { AbiEvent, Address, Hex } from 'viem'

import type { ContractCall, TickFillRatio } from '../reads'

/**
 * Structural mirror of `@uniswap/blockfeed-sdk`'s engine contract.
 *
 * These interfaces are duplicated here (rather than imported) on purpose: the launcher SDK depends on
 * blockfeed **only as a devDependency**, so runtime code must import nothing from it. TypeScript's
 * structural typing makes the factories below assignable to the real engine's `Source` with zero
 * runtime coupling. A types-only drift guard (`sourceContract.test-d.ts`) asserts the two shapes stay
 * compatible at compile time — the single place `import type '@uniswap/blockfeed-sdk'` is allowed.
 */

/**
 * `allowFailure` maps to aggregate3 per-call tolerance. Absent/false → a failure fails the whole tick.
 * Reuses the launcher's own {@link ContractCall} descriptor shape (the house style the engine matches).
 */
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

// ---------------------------------------------------------------------------
// CCA source value shapes
// ---------------------------------------------------------------------------

export type LaunchPhase = 'auction' | 'graduated' | 'failed'

/** The composite launch lifecycle value emitted by {@link launchAssetSource}. */
export interface LaunchAssetState {
  phase: LaunchPhase
  /**
   * Q96 raw-currency-per-raw-token clearing price during the auction (from the auction's
   * `checkpoint()`); after graduation, the pool-sqrt-derived currency-per-token price (see
   * `launchAssetSource` for the orientation assumption). Absent only if never yet derivable.
   */
  priceX96?: bigint
  /** Raw v4 `getSlot0` sqrtPriceX96 of the graduated pool; present from the graduation tick onward. */
  poolSqrtPriceX96?: bigint
  currencyRaised: bigint
  remainingSupply: bigint
  /** Per-tick bid-distribution fill ratios; present while `phase !== 'graduated'`. */
  tickFillRatios?: TickFillRatio[]
}

/** The auction-only state emitted by {@link ccaAuctionSource} (no graduation lifecycle). */
export interface CcaAuctionState {
  /** Live clearing price, Q96 raw-currency-per-raw-token (from `checkpoint()`). */
  priceX96: bigint
  currencyRaised: bigint
  remainingSupply: bigint
  isGraduated: boolean
  /** Per-tick bid-distribution fill ratios from the lens. */
  tickFillRatios: TickFillRatio[]
}

/** The cumulative-bid-count value emitted by {@link ccaBidsSource}. */
export interface CcaBidsState {
  /** Monotonic count of `BidSubmitted` logs seen since first subscribe. Retractions do NOT decrement. */
  bidCount: number
}

export interface LaunchAssetSourceArgs {
  chainId: number
  auction: Address
  /** Version-specific TickDataLens address (resolve via `getTickDataLensForFactory`). */
  tickDataLens: Address
  /** Deterministic graduated pool key (from launch params / poolId.ts). */
  poolKey: { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }
  stateView: Address
  /** Auction end block, in the auction's own block domain (see `deriveAuctionOutcome`). */
  endBlock: bigint
}
