import { describe, expect, it } from 'bun:test'

import { clearingPriceCall, currencyRaisedCall, isGraduatedCall, remainingSupplyCall, tickDataCall } from '../reads'

import { AUCTION, CHECKPOINT, LENS, Q96, TICKS, fail, ok } from './__fixtures__'
import { ccaAuctionSource } from './ccaAuctionSource'
import type { CallResult, CcaAuctionState, SourceEmission, TickData, TickIdentity } from './types'

const IDENTITY: TickIdentity = {
  chainId: 130,
  blockNumber: 100n,
  parentBlockHash: '0xabc',
  timestamp: 1_700_000_000n,
}

function fullTick(overrides: Partial<Record<string, CallResult>> = {}): TickData {
  return {
    identity: IDENTITY,
    results: {
      checkpoint: ok(CHECKPOINT),
      currencyRaised: ok(5_000n),
      remainingSupply: ok(9_000n),
      isGraduated: ok(false),
      tickData: ok(TICKS),
      ...overrides,
    },
    logs: [],
    retractions: [],
  }
}

describe('ccaAuctionSource', () => {
  it('requests the five auction-state reads keyed by name', () => {
    const source = ccaAuctionSource({ auction: AUCTION, tickDataLens: LENS })
    const calls = source.calls({ prev: undefined })
    // Descriptors match reads.ts, wrapped failure-tolerant (isolation — see ccaAuctionSource).
    expect(calls.checkpoint).toEqual({ ...clearingPriceCall(AUCTION), allowFailure: true })
    expect(calls.currencyRaised).toEqual({ ...currencyRaisedCall(AUCTION), allowFailure: true })
    expect(calls.remainingSupply).toEqual({ ...remainingSupplyCall(AUCTION), allowFailure: true })
    expect(calls.isGraduated).toEqual({ ...isGraduatedCall(AUCTION), allowFailure: true })
    expect(calls.tickData).toEqual({ ...tickDataCall(LENS, AUCTION), allowFailure: true })
    expect(Object.keys(calls).sort()).toEqual(
      ['checkpoint', 'currencyRaised', 'isGraduated', 'remainingSupply', 'tickData'].sort()
    )
  })

  it('has a stable, auction-keyed identity', () => {
    expect(ccaAuctionSource({ auction: AUCTION, tickDataLens: LENS }).key).toBe(`ccaAuction:${AUCTION.toLowerCase()}`)
  })

  it('ISOLATION INVARIANT: every call is allowFailure:true (a reverting read must not poison the shared tick)', () => {
    const calls = ccaAuctionSource({ auction: AUCTION, tickDataLens: LENS }).calls({ prev: undefined })
    for (const k of Object.keys(calls)) {
      expect({ key: k, allowFailure: calls[k].allowFailure }).toEqual({ key: k, allowFailure: true })
    }
  })

  it('derives the live auction state from the fixture checkpoint + tick data', () => {
    const source = ccaAuctionSource({ auction: AUCTION, tickDataLens: LENS })
    const emission = source.derive(fullTick(), { prev: undefined })
    expect(emission).toEqual({
      value: {
        priceX96: 2n * Q96,
        currencyRaised: 5_000n,
        remainingSupply: 9_000n,
        isGraduated: false,
        tickFillRatios: [
          { priceQ96: 1000n, fillRatio: 2.5 },
          { priceQ96: 2000n, fillRatio: 2 },
        ],
      },
      identity: IDENTITY,
    })
  })

  it('emits no tick when any required read failed', () => {
    const source = ccaAuctionSource({ auction: AUCTION, tickDataLens: LENS })
    expect(source.derive(fullTick({ checkpoint: fail() }), { prev: undefined })).toBeUndefined()
    expect(source.derive(fullTick({ tickData: fail() }), { prev: undefined })).toBeUndefined()
  })

  it('suppresses identical values but not moved clearing prices or fill ratios (valueEquals)', () => {
    const source = ccaAuctionSource({ auction: AUCTION, tickDataLens: LENS })
    const base: CcaAuctionState = {
      priceX96: 2n * Q96,
      currencyRaised: 5_000n,
      remainingSupply: 9_000n,
      isGraduated: false,
      tickFillRatios: [{ priceQ96: 1000n, fillRatio: 2.5 }],
    }
    expect(source.valueEquals?.(base, { ...base })).toBe(true)
    expect(source.valueEquals?.(base, { ...base, priceX96: 3n * Q96 })).toBe(false)
    expect(source.valueEquals?.(base, { ...base, tickFillRatios: [{ priceQ96: 1000n, fillRatio: 2.6 }] })).toBe(false)
  })
})

// Type-only: emission shape is what the store threads back as prev.
const _emission: SourceEmission<CcaAuctionState> | undefined = undefined
void _emission
