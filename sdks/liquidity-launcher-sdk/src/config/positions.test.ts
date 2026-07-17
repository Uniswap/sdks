import { TickMath } from '@uniswap/v3-sdk'
import { describe, expect, it } from 'bun:test'
import { zeroAddress } from 'viem'

import { MPS_TOTAL, ZERO_ADDRESS } from '../constants'

import { buildPositionDefinitions } from './positions'

// Addresses chosen purely for their sort order relative to `currency`.
// A token that sorts ABOVE any currency (so a small/native currency is currency0).
const TOKEN_HIGH = ('0x' + 'f'.repeat(40)) as `0x${string}`
// A token that sorts BELOW a high currency (so the currency is currency1).
const TOKEN_LOW = ('0x' + '0'.repeat(39) + '1') as `0x${string}`
const CURRENCY_HIGH = ('0x' + 'f'.repeat(40)) as `0x${string}`

const TICK_SPACING = 200

describe('buildPositionDefinitions currency ordering', () => {
  it('mirrors an asymmetric custom range onto the reciprocal band for a native (currency0) launch', () => {
    const range = [{ minPercentFromClearing: -10, maxPercentFromClearing: 40, liquidityPercent: 100 }]

    // currency is currency1 (currency > token): offsets are the raw currency-per-token band.
    const currency1 = buildPositionDefinitions('CUSTOM_RANGE', range, TICK_SPACING, CURRENCY_HIGH, TOKEN_LOW)
    expect(currency1[0].offsetLower).toBe(-1200)
    expect(currency1[0].offsetUpper).toBe(3400)

    // native ETH (zero address) always sorts as currency0: negate-and-swap the raw offsets.
    const currency0 = buildPositionDefinitions('CUSTOM_RANGE', range, TICK_SPACING, zeroAddress, TOKEN_HIGH)
    expect(currency0[0].offsetLower).toBe(-currency1[0].offsetUpper)
    expect(currency0[0].offsetUpper).toBe(-currency1[0].offsetLower)
    expect(currency0[0].offsetLower).toBe(-3400)
    expect(currency0[0].offsetUpper).toBe(1200)
    // weight and recipient are unaffected by the mirror.
    expect(currency0[0].weight).toBe(MPS_TOTAL)
    expect(currency0[0].overridePositionRecipient).toBe(ZERO_ADDRESS)
  })

  it('leaves custom-range offsets unchanged when the currency sorts as currency1', () => {
    const range = [{ minPercentFromClearing: -10, maxPercentFromClearing: 40, liquidityPercent: 100 }]
    const defs = buildPositionDefinitions('CUSTOM_RANGE', range, TICK_SPACING, CURRENCY_HIGH, TOKEN_LOW)
    // Raw currency-per-token offsets, no mirror.
    expect(defs[0].offsetLower).toBe(-1200)
    expect(defs[0].offsetUpper).toBe(3400)
  })

  it('is invariant under ordering for a tick-symmetric custom range', () => {
    // At this tick spacing, -20% / +25% snap to an exactly symmetric [-2400, 2400] band, so
    // negate-and-swap is a no-op and both orderings produce identical offsets.
    const range = [{ minPercentFromClearing: -20, maxPercentFromClearing: 25, liquidityPercent: 100 }]
    const currency1 = buildPositionDefinitions('CUSTOM_RANGE', range, TICK_SPACING, CURRENCY_HIGH, TOKEN_LOW)
    const currency0 = buildPositionDefinitions('CUSTOM_RANGE', range, TICK_SPACING, zeroAddress, TOKEN_HIGH)
    expect(currency1[0].offsetLower).toBe(-2400)
    expect(currency1[0].offsetUpper).toBe(2400)
    expect(currency0).toEqual(currency1)
  })

  it('leaves the full-range sentinel untouched regardless of currency ordering', () => {
    const asCurrency0 = buildPositionDefinitions('FULL_RANGE', [], TICK_SPACING, zeroAddress, TOKEN_HIGH)
    const asCurrency1 = buildPositionDefinitions('FULL_RANGE', [], TICK_SPACING, CURRENCY_HIGH, TOKEN_LOW)
    for (const defs of [asCurrency0, asCurrency1]) {
      expect(defs).toHaveLength(1)
      expect(defs[0].offsetLower).toBe(TickMath.MIN_TICK)
      expect(defs[0].offsetUpper).toBe(TickMath.MAX_TICK)
      expect(defs[0].weight).toBe(MPS_TOTAL)
    }
    // CONCENTRATED_FULL_RANGE resolves to the same mirror-invariant sentinel.
    const concentrated = buildPositionDefinitions('CONCENTRATED_FULL_RANGE', [], TICK_SPACING, zeroAddress, TOKEN_HIGH)
    expect(concentrated[0].offsetLower).toBe(TickMath.MIN_TICK)
    expect(concentrated[0].offsetUpper).toBe(TickMath.MAX_TICK)
  })
})
