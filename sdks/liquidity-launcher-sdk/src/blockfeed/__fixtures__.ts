import { type Address, getAddress } from 'viem'

import type { CallResult } from './types'

/**
 * Shared constants for the CCA blockfeed source tests. Constants only — per-file tick builders stay
 * local to each test. NOT part of the build: excluded from the emitted output (see the build
 * tsconfigs' `exclude`, alongside `*.test.ts`), so `dist` never ships it.
 */

export const AUCTION: Address = getAddress('0x1234567890abcdef1234567890abcdef12345678')
export const LENS: Address = getAddress('0x00cca200bf124dbfa848937c553864f4b4ce0632')

/** 1 * 2^96. */
export const Q96 = 79228162514264337593543950336n

export const ok = (result: unknown): CallResult => ({ status: 'success', result })
export const fail = (): CallResult => ({ status: 'failure', error: new Error('reverted') })

/** A live `checkpoint()` tuple with `clearingPrice = 2 * Q96`. */
export const CHECKPOINT = {
  clearingPrice: 2n * Q96,
  currencyRaisedAtClearingPriceQ96_X7: 0n,
  cumulativeMpsPerPrice: 0n,
  cumulativeMps: 0,
  prev: 0n,
  next: 0n,
}

/** Two initialized ticks (fill ratios 2.5 and 2.0). */
export const TICKS = [
  { priceQ96: 1000n, currencyDemandQ96: 500n, requiredCurrencyDemandQ96: 200n, currencyRequiredQ96: 300n },
  { priceQ96: 2000n, currencyDemandQ96: 800n, requiredCurrencyDemandQ96: 400n, currencyRequiredQ96: 600n },
]
