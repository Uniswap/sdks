import type { Address } from 'viem'

import { CCA_BID_SUBMITTED_EVENT } from '../abis'

import type { CcaBidsState, LogFilter, Source, TickData } from './types'

/**
 * A {@link Source} watching the live bid stream of a Continuous Clearing Auction. It issues no state
 * reads — the payload is the `log` events themselves (each a `BidSubmitted`), which the engine
 * delivers deduped by `(txHash, logIndex)` and reconciles for reorgs. The emitted `value.bidCount` is
 * a lightweight running total, present mostly so the store has a comparable scalar.
 *
 * **Counts are monotonic.** `bidCount` only ever increases by the number of new `BidSubmitted` logs
 * per tick. It is NOT decremented by bid retractions — neither on-chain `BidExited` exits (a distinct
 * event this source does not watch) nor engine `retraction` events from reorgs. Retractions are the
 * honest signal in their own right: the UI reconciles the displayed bid ledger from the `log` and
 * `retraction` event stream, not from this cumulative counter.
 */
export function ccaBidsSource(args: { auction: Address }): Source<CcaBidsState> {
  const { auction } = args
  const key = `ccaBids:${auction.toLowerCase()}`

  return {
    key,
    calls() {
      // No state reads: the bid stream is entirely log-driven.
      return {}
    },
    logFilters(): LogFilter[] {
      return [{ address: auction, event: CCA_BID_SUBMITTED_EVENT }]
    },
    derive(tick: TickData, ctx) {
      const prevCount = ctx.prev?.value.bidCount ?? 0
      // Monotonic: add this tick's new bids; retractions (tick.retractions) intentionally ignored.
      return {
        value: { bidCount: prevCount + tick.logs.length },
        identity: tick.identity,
      }
    },
  }
}
