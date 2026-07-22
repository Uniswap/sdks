import { describe, expect, it } from 'bun:test'
import { decodeFunctionResult, encodeFunctionResult, getAddress, type PublicClient } from 'viem'

import { CCA_ABI, TICK_DATA_LENS_ABI } from './abis'
import {
  clearingPriceCall,
  deriveTickFillRatios,
  getClearingPrice,
  getTickData,
  type InitializedTick,
  tickDataCall,
} from './reads'

const AUCTION = getAddress('0x1234567890abcdef1234567890abcdef12345678')
const LENS = getAddress('0x00cca200bf124dbfa848937c553864f4b4ce0632')

// Fixtures adapted from data-api's TickDetailsBL.test.ts / OnChainAuctionsClient.test.ts.
const TICKS: InitializedTick[] = [
  { priceQ96: 1000n, currencyDemandQ96: 500n, requiredCurrencyDemandQ96: 200n, currencyRequiredQ96: 300n },
  { priceQ96: 2000n, currencyDemandQ96: 800n, requiredCurrencyDemandQ96: 400n, currencyRequiredQ96: 600n },
]

/** Minimal PublicClient stub whose `readContract` returns a fixed value. */
function stubClient<T>(value: T): PublicClient {
  return { readContract: async () => value } as unknown as PublicClient
}

describe('clearingPriceCall', () => {
  it('builds the checkpoint() descriptor on the auction (the live clearing-price source)', () => {
    expect(clearingPriceCall(AUCTION)).toEqual({
      address: AUCTION,
      abi: CCA_ABI,
      functionName: 'checkpoint',
      args: [],
    })
  })
})

describe('getClearingPrice', () => {
  it('returns the clearingPrice field (Q96) from the checkpoint tuple', async () => {
    const checkpoint = {
      clearingPrice: 79228162514264337593543950336n, // 1 * Q96
      currencyRaisedAtClearingPriceQ96_X7: 5000n,
      cumulativeMpsPerPrice: 0n,
      cumulativeMps: 0,
      prev: 0n,
      next: 0n,
    }
    const price = await getClearingPrice(stubClient(checkpoint), AUCTION)
    expect(price).toBe(79228162514264337593543950336n)
  })

  it('decodes a real ABI-encoded checkpoint tuple (round-trip)', () => {
    const encoded = encodeFunctionResult({
      abi: CCA_ABI,
      functionName: 'checkpoint',
      result: {
        clearingPrice: 12345n,
        currencyRaisedAtClearingPriceQ96_X7: 5000n,
        cumulativeMpsPerPrice: 7n,
        cumulativeMps: 3,
        prev: 10n,
        next: 20n,
      },
    })
    const decoded = decodeFunctionResult({ abi: CCA_ABI, functionName: 'checkpoint', data: encoded })
    expect(decoded.clearingPrice).toBe(12345n)
  })
})

describe('tickDataCall', () => {
  it('builds the getInitializedTickData descriptor on the lens with the auction arg', () => {
    expect(tickDataCall(LENS, AUCTION)).toEqual({
      address: LENS,
      abi: TICK_DATA_LENS_ABI,
      functionName: 'getInitializedTickData',
      args: [AUCTION],
    })
  })
})

describe('getTickData', () => {
  it('returns the initialized ticks from the lens', async () => {
    const result = await getTickData(stubClient(TICKS), LENS, AUCTION)
    expect(result).toEqual(TICKS)
  })

  it('returns an empty array when the auction has no initialized ticks', async () => {
    const result = await getTickData(stubClient([] as InitializedTick[]), LENS, AUCTION)
    expect(result).toEqual([])
  })

  it('decodes a real ABI-encoded tuple[] (round-trip)', () => {
    const encoded = encodeFunctionResult({
      abi: TICK_DATA_LENS_ABI,
      functionName: 'getInitializedTickData',
      result: TICKS,
    })
    const decoded = decodeFunctionResult({
      abi: TICK_DATA_LENS_ABI,
      functionName: 'getInitializedTickData',
      data: encoded,
    })
    expect(decoded).toEqual(TICKS)
  })
})

describe('deriveTickFillRatios', () => {
  it('computes currencyDemand / requiredCurrencyDemand per tick, in input order', () => {
    // 500/200 = 2.5 (oversubscribed); 800/400 = 2.0
    expect(deriveTickFillRatios(TICKS)).toEqual([
      { priceQ96: 1000n, fillRatio: 2.5 },
      { priceQ96: 2000n, fillRatio: 2 },
    ])
  })

  it('marks exactly filled (=1), oversubscribed (>1), and partially filled (<1)', () => {
    const ratios = deriveTickFillRatios([
      { priceQ96: 100n, currencyDemandQ96: 300n, requiredCurrencyDemandQ96: 300n, currencyRequiredQ96: 0n },
      { priceQ96: 200n, currencyDemandQ96: 900n, requiredCurrencyDemandQ96: 300n, currencyRequiredQ96: 0n },
      { priceQ96: 300n, currencyDemandQ96: 100n, requiredCurrencyDemandQ96: 500n, currencyRequiredQ96: 0n },
    ])
    expect(ratios.map((r) => r.fillRatio)).toEqual([1, 3, 0.2])
  })

  it('returns undefined fillRatio when required demand is 0 (undefined ratio)', () => {
    const ratios = deriveTickFillRatios([
      { priceQ96: 1000n, currencyDemandQ96: 500n, requiredCurrencyDemandQ96: 0n, currencyRequiredQ96: 0n },
    ])
    expect(ratios[0]).toEqual({ priceQ96: 1000n, fillRatio: undefined })
  })

  it('truncates the ratio at 1e-4 resolution (matches the frontend integer-division formula)', () => {
    // 1/3 → (1*10000)/3 = 3333 → 0.3333
    const ratios = deriveTickFillRatios([
      { priceQ96: 1n, currencyDemandQ96: 1n, requiredCurrencyDemandQ96: 3n, currencyRequiredQ96: 0n },
    ])
    expect(ratios[0].fillRatio).toBe(0.3333)
  })

  it('returns an empty array for no ticks', () => {
    expect(deriveTickFillRatios([])).toEqual([])
  })
})
