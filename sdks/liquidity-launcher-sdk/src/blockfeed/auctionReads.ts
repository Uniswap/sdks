import type { Address } from 'viem'

import {
  type ContractCall,
  type InitializedTick,
  clearingPriceCall,
  currencyRaisedCall,
  decodeCheckpoint,
  decodeInitializedTicks,
  isGraduatedCall,
  remainingSupplyCall,
  tickDataCall,
} from '../reads'

import type { SpeculativeCall, TickData } from './types'

/**
 * Tag a descriptor as failure-tolerant — the single home for the CCA sources' isolation rationale.
 *
 * EVERY call these sources issue is `allowFailure: true` so a reverting read (a not-yet-started
 * `checkpoint()`, a stale lens address, a pool that does not exist yet) is isolated to THIS source and
 * never escalates to the engine. In the shared heartbeat a non-speculative failure throws
 * `TickFailedError` and fails the whole tick for EVERY source on the chain (backoff + stale) — a source
 * must never have the power to poison unrelated token-page feeds. `derive` already treats any
 * non-success result as "return undefined / keep prev", so per-source behavior is unchanged; failures
 * simply stop propagating.
 */
export function tolerant(call: ContractCall): SpeculativeCall {
  return { ...call, allowFailure: true }
}

/**
 * The shared auction read-set (all failure-tolerant): live `checkpoint()`, `currencyRaised()`,
 * `remainingSupply()`, `isGraduated()`, and the lens `getInitializedTickData(auction)`. When a
 * `speculativeSlot0` descriptor is supplied it is added under the `slot0` key (the composite
 * `launchAssetSource` needs the always-on pool read; `ccaAuctionSource` does not).
 */
export function auctionCallSet(
  auction: Address,
  lens: Address,
  speculativeSlot0?: SpeculativeCall
): Record<string, SpeculativeCall> {
  const calls: Record<string, SpeculativeCall> = {
    checkpoint: tolerant(clearingPriceCall(auction)),
    currencyRaised: tolerant(currencyRaisedCall(auction)),
    remainingSupply: tolerant(remainingSupplyCall(auction)),
    isGraduated: tolerant(isGraduatedCall(auction)),
    tickData: tolerant(tickDataCall(lens, auction)),
  }
  if (speculativeSlot0 !== undefined) calls.slot0 = speculativeSlot0
  return calls
}

/** The decoded auction read-set for one tick, once every required read has succeeded. */
export interface AuctionResults {
  clearingPrice: bigint
  currencyRaised: bigint
  remainingSupply: bigint
  isGraduated: boolean
  ticks: readonly InitializedTick[]
}

/**
 * Success-gate the full auction read-set for a tick: returns the decoded values only when ALL of
 * `checkpoint`/`currencyRaised`/`remainingSupply`/`isGraduated`/`tickData` succeeded, else `undefined`
 * (a source then returns undefined / keeps `prev`).
 */
export function readAuctionResults(tick: TickData): AuctionResults | undefined {
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
    clearingPrice: decodeCheckpoint(checkpoint.result).clearingPrice,
    currencyRaised: currencyRaised.result as bigint,
    remainingSupply: remainingSupply.result as bigint,
    isGraduated: isGraduated.result as boolean,
    ticks: decodeInitializedTicks(tickData.result),
  }
}
