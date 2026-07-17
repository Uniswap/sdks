import { describe, expect, it } from 'bun:test'
import { getAddress } from 'viem'

import { clearingPriceCall, currencyRaisedCall, isGraduatedCall, remainingSupplyCall, tickDataCall } from '../reads'

import { ccaAuctionSource } from './ccaAuctionSource'
import type { CallResult, CcaAuctionState, SourceEmission, TickData, TickIdentity } from './types'

const AUCTION = getAddress('0x1234567890abcdef1234567890abcdef12345678')
const LENS = getAddress('0x00cca200bf124dbfa848937c553864f4b4ce0632')

const Q96 = 79228162514264337593543950336n // 1 * 2^96

const IDENTITY: TickIdentity = {
  chainId: 130,
  blockNumber: 100n,
  parentBlockHash: '0xabc',
  timestamp: 1_700_000_000n,
}

const ok = (result: unknown): CallResult => ({ status: 'success', result })
const fail = (): CallResult => ({ status: 'failure', error: new Error('reverted') })

const CHECKPOINT = {
  clearingPrice: 2n * Q96,
  currencyRaisedAtClearingPriceQ96_X7: 0n,
  cumulativeMpsPerPrice: 0n,
  cumulativeMps: 0,
  prev: 0n,
  next: 0n,
}
const TICKS = [
  { priceQ96: 1000n, currencyDemandQ96: 500n, requiredCurrencyDemandQ96: 200n, currencyRequiredQ96: 300n },
  { priceQ96: 2000n, currencyDemandQ96: 800n, requiredCurrencyDemandQ96: 400n, currencyRequiredQ96: 600n },
]

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
    expect(calls.checkpoint).toEqual(clearingPriceCall(AUCTION))
    expect(calls.currencyRaised).toEqual(currencyRaisedCall(AUCTION))
    expect(calls.remainingSupply).toEqual(remainingSupplyCall(AUCTION))
    expect(calls.isGraduated).toEqual(isGraduatedCall(AUCTION))
    expect(calls.tickData).toEqual(tickDataCall(LENS, AUCTION))
    expect(Object.keys(calls).sort()).toEqual(
      ['checkpoint', 'currencyRaised', 'isGraduated', 'remainingSupply', 'tickData'].sort()
    )
  })

  it('has a stable, auction-keyed identity', () => {
    expect(ccaAuctionSource({ auction: AUCTION, tickDataLens: LENS }).key).toBe(`ccaAuction:${AUCTION.toLowerCase()}`)
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
