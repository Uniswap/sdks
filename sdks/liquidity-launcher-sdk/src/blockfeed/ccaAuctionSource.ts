import type { Address } from 'viem'

import {
  type AuctionCheckpoint,
  type ContractCall,
  type InitializedTick,
  clearingPriceCall,
  currencyRaisedCall,
  deriveTickFillRatios,
  isGraduatedCall,
  remainingSupplyCall,
  tickDataCall,
} from '../reads'
import type { TickFillRatio } from '../reads'

import type { CcaAuctionState, Source, SpeculativeCall, TickData } from './types'

/**
 * Tag a descriptor as failure-tolerant. Every call this source issues is `allowFailure: true` so a
 * reverting read (a not-yet-started `checkpoint()`, a stale lens address) is isolated to THIS source
 * and never escalates to the engine — a non-speculative failure throws `TickFailedError` and fails
 * the whole shared tick for EVERY source on the chain. `derive` already returns `undefined` on any
 * non-success result, so per-source behavior is unchanged; failures just stop propagating.
 */
function tolerant(call: ContractCall): SpeculativeCall {
  return { ...call, allowFailure: true }
}

/** Element-wise equality of two fill-ratio arrays (price + ratio). */
function fillRatiosEqual(a: readonly TickFillRatio[], b: readonly TickFillRatio[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].priceQ96 !== b[i].priceQ96 || a[i].fillRatio !== b[i].fillRatio) return false
  }
  return true
}

/** Read the currently-clearing-price checkpoint tuple from a successful `checkpoint()` result. */
function decodeCheckpoint(result: unknown): AuctionCheckpoint {
  // viem decodes a single-tuple return as the object directly.
  return result as AuctionCheckpoint
}

/** Read the lens `getInitializedTickData` result (a `tuple[]`) from a successful call. */
function decodeTicks(result: unknown): readonly InitializedTick[] {
  return result as readonly InitializedTick[]
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
    // Every call is `allowFailure: true` — see `tolerant` for the isolation rationale.
    calls(): Record<string, SpeculativeCall> {
      return {
        checkpoint: tolerant(clearingPriceCall(auction)),
        currencyRaised: tolerant(currencyRaisedCall(auction)),
        remainingSupply: tolerant(remainingSupplyCall(auction)),
        isGraduated: tolerant(isGraduatedCall(auction)),
        tickData: tolerant(tickDataCall(tickDataLens, auction)),
      }
    },
    derive(tick: TickData) {
      const checkpoint = tick.results['checkpoint']
      const currencyRaised = tick.results['currencyRaised']
      const remainingSupply = tick.results['remainingSupply']
      const isGraduated = tick.results['isGraduated']
      const tickData = tick.results['tickData']

      if (
        checkpoint?.status !== 'success' ||
        currencyRaised?.status !== 'success' ||
        remainingSupply?.status !== 'success' ||
        isGraduated?.status !== 'success' ||
        tickData?.status !== 'success'
      ) {
        return undefined
      }

      return {
        value: {
          priceX96: decodeCheckpoint(checkpoint.result).clearingPrice,
          currencyRaised: currencyRaised.result as bigint,
          remainingSupply: remainingSupply.result as bigint,
          isGraduated: isGraduated.result as boolean,
          tickFillRatios: deriveTickFillRatios(decodeTicks(tickData.result)),
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
