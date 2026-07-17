import type { Address } from 'viem'

import { deriveTickFillRatios } from '../reads'
import type { TickFillRatio } from '../reads'

import { auctionCallSet, readAuctionResults } from './auctionReads'
import type { CcaAuctionState, Source, SpeculativeCall, TickData } from './types'

/** Element-wise equality of two fill-ratio arrays (price + ratio). */
function fillRatiosEqual(a: readonly TickFillRatio[], b: readonly TickFillRatio[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].priceQ96 !== b[i].priceQ96 || a[i].fillRatio !== b[i].fillRatio) return false
  }
  return true
}

/**
 * A {@link Source} tracking the live state of a Continuous Clearing Auction while it runs: the current
 * clearing price (Q96), currency raised, remaining supply, whether it has graduated, and the per-tick
 * bid-distribution fill ratios. It is a pure reducer — every field is derived from the tick's keyed
 * multicall results, nothing is held on the source object.
 *
 * Per tick it reads (all in the shared atomic multicall): `checkpoint()` (the live clearing price —
 * declared `nonpayable` but read via `eth_call`), `currencyRaised()`, `remainingSupply()`,
 * `isGraduated()`, and the version-specific TickDataLens `getInitializedTickData(auction)`.
 *
 * `derive` returns `undefined` (no emission) when any required read is missing or failed. This is the
 * auction-phase building block; the composite lifecycle (auction → graduated/failed with the
 * graduation no-gap guarantee) lives in {@link launchAssetSource}.
 */
export function ccaAuctionSource(args: { auction: Address; tickDataLens: Address }): Source<CcaAuctionState> {
  const { auction, tickDataLens } = args
  const key = `ccaAuction:${auction.toLowerCase()}`

  return {
    key,
    // Every call is `allowFailure: true` — see `tolerant` (auctionReads) for the isolation rationale.
    calls(): Record<string, SpeculativeCall> {
      return auctionCallSet(auction, tickDataLens)
    },
    derive(tick: TickData) {
      const results = readAuctionResults(tick)
      if (results === undefined) return undefined

      return {
        value: {
          priceX96: results.clearingPrice,
          currencyRaised: results.currencyRaised,
          remainingSupply: results.remainingSupply,
          isGraduated: results.isGraduated,
          tickFillRatios: deriveTickFillRatios(results.ticks),
        },
        identity: tick.identity,
      }
    },
    valueEquals(a, b) {
      return (
        a.priceX96 === b.priceX96 &&
        a.currencyRaised === b.currencyRaised &&
        a.remainingSupply === b.remainingSupply &&
        a.isGraduated === b.isGraduated &&
        fillRatiosEqual(a.tickFillRatios, b.tickFillRatios)
      )
    },
  }
}
