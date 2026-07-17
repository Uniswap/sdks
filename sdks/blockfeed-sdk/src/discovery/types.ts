import type { Currency } from '@uniswap/sdk-core'
import type { Address } from 'viem'

import type { PoolRef, PricePath } from '../types'

/**
 * A pool discovered by enumeration that MIGHT price the requested pair, before any executable
 * evaluation. `currencyA`/`currencyB` are the exact input {@link Currency} objects the caller passed
 * (never fabricated tokens); `inRangeLiquidity` is the pool's current in-range `L` when it could be
 * read (v3 `liquidity()` / v4 `StateView.getLiquidity`), and `undefined` for v2 pools or when the
 * follow-up read failed.
 */
export interface CandidatePool {
  ref: PoolRef
  currencyA: Currency
  currencyB: Currency
  inRangeLiquidity?: bigint
  /**
   * The fee tier this v3 pool was enumerated at (v3 factory lookups are keyed by fee, but a
   * {@link PoolRef} for v3 carries only the pool address). Present only for `protocol: 'v3'`
   * candidates; the executable probe needs it to call QuoterV2. Absent for v2/v4.
   */
  v3Fee?: number
}

/** Returned by discovery when no viable price path exists for the requested pair. */
export interface NoPathFound {
  kind: 'no-path'
  reason: string
}

/** Narrowing guard: `true` when a {@link discoverPricePath} result is a {@link NoPathFound}, not a path. */
export function isNoPathFound(x: PricePath | NoPathFound): x is NoPathFound {
  return (x as NoPathFound).kind === 'no-path'
}

/** Tunable policy for discovery. Enumeration reads only `hookAllowlist` and `fromBlockOverride`. */
export interface DiscoveryOptions {
  /** Bridge assets for 2-hop paths. Default: `[native wrapped (WETH) of the chain]`. */
  intermediaries?: Currency[]
  /** Max path length. Default 2. */
  maxHops?: 1 | 2
  /** Probe size in raw units of `quote`. Default `10^quote.decimals * 1000`. */
  probeNotional?: bigint
  /** v4 hooked pools to keep despite the hookless-only default. Default `[]`. */
  hookAllowlist?: Address[]
  /** Cap on candidates probe-quoted per pair. Default 12. */
  maxProbeCandidatesPerPair?: number
  /** Override the v4 `Initialize` scan start block (tests / forks). Default: PoolManager deploy block. */
  fromBlockOverride?: bigint
}
