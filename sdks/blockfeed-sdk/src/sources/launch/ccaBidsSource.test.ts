import { CCA_BID_SUBMITTED_EVENT } from '@uniswap/liquidity-launcher-sdk'
import { describe, expect, it } from 'bun:test'
import { getAddress } from 'viem'

import type { DecodedFeedLog, SourceEmission, TickData, TickIdentity } from '../../types'

import { ccaBidsSource } from './ccaBidsSource'

const AUCTION = getAddress('0x1234567890abcdef1234567890abcdef12345678')

const IDENTITY: TickIdentity = {
  chainId: 130,
  blockNumber: 200n,
  parentBlockHash: '0xdef',
  timestamp: 1_700_000_500n,
}

function bidLog(logIndex: number): DecodedFeedLog {
  return {
    txHash: `0x${logIndex.toString(16).padStart(64, '0')}`,
    logIndex,
    blockNumber: 200n,
    address: AUCTION,
    eventName: 'BidSubmitted',
    args: { id: BigInt(logIndex), owner: AUCTION, price: 1000n, amount: 5n },
  }
}

/** A prior bid log (full DecodedFeedLog) that a reorg removed. */
function retractedLog(logIndex: number, blockNumber: bigint): DecodedFeedLog {
  return { txHash: '0xabc', logIndex, blockNumber, address: AUCTION, eventName: 'BidSubmitted', args: {} }
}

function tick(logs: DecodedFeedLog[], retractions: DecodedFeedLog[] = []): TickData {
  return { identity: IDENTITY, results: {}, logs, retractions }
}

const prevEmission = (bidCount: number): SourceEmission<{ bidCount: number }> => ({
  value: { bidCount },
  identity: IDENTITY,
})

describe('ccaBidsSource', () => {
  it('watches BidSubmitted logs on the auction address and reads no state', () => {
    const source = ccaBidsSource({ auction: AUCTION })
    expect(source.calls(undefined)).toEqual({})
    expect(source.logFilters?.(undefined)).toEqual([{ address: AUCTION, event: CCA_BID_SUBMITTED_EVENT }])
    expect(source.key).toBe(`ccaBids:${AUCTION.toLowerCase()}`)
  })

  it('counts cumulatively across ticks (prev.bidCount + this tick logs)', () => {
    const source = ccaBidsSource({ auction: AUCTION })
    const first = source.derive(tick([bidLog(0), bidLog(1)]), undefined)
    expect(first?.value.bidCount).toBe(2)
    const second = source.derive(tick([bidLog(2)]), prevEmission(2))
    expect(second?.value.bidCount).toBe(3)
  })

  it('is monotonic: retractions do NOT decrement the count', () => {
    const source = ccaBidsSource({ auction: AUCTION })
    // A tick that removed a prior bid (reorg) and added none: count stays flat, never decreases.
    const retractionOnly = source.derive(
      tick([], [retractedLog(0, 199n)]),
      prevEmission(5)
    )
    expect(retractionOnly?.value.bidCount).toBe(5)
    // A tick with both a retraction and a new bid only adds the new bid.
    const mixed = source.derive(tick([bidLog(9)], [retractedLog(0, 199n)]), prevEmission(5))
    expect(mixed?.value.bidCount).toBe(6)
  })

  it('starts from zero with no prev and no logs', () => {
    const source = ccaBidsSource({ auction: AUCTION })
    expect(source.derive(tick([]), undefined)?.value.bidCount).toBe(0)
  })

  it('valueEquals compares bidCount so equal counts from fresh objects suppress (A5)', () => {
    const source = ccaBidsSource({ auction: AUCTION })
    expect(source.valueEquals).toBeDefined()
    // Two distinct derivations that yield the same running count must compare equal…
    const a = source.derive(tick([]), prevEmission(3))!
    const b = source.derive(tick([]), prevEmission(3))!
    expect(a.value).not.toBe(b.value) // fresh object refs (Object.is would say false)
    expect(source.valueEquals!(a.value, b.value)).toBe(true)
    // …and differing counts must compare not-equal.
    const c = source.derive(tick([bidLog(0)]), prevEmission(3))!
    expect(source.valueEquals!(a.value, c.value)).toBe(false)
  })
})
