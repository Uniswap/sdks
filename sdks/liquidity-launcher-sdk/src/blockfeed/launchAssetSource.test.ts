import { describe, expect, it } from 'bun:test'
import { getAddress, zeroAddress } from 'viem'

import { computeLbpPoolId } from '../poolId'
import { slot0Call } from '../reads'

import { launchAssetSource } from './launchAssetSource'
import type { CallResult, LaunchAssetSourceArgs, LaunchAssetState, SourceEmission, TickData, TickIdentity } from './types'

const AUCTION = getAddress('0x1234567890abcdef1234567890abcdef12345678')
const LENS = getAddress('0x00cca200bf124dbfa848937c553864f4b4ce0632')
const STATE_VIEW = getAddress('0xabababababababababababababababababababab')
const TOKEN = getAddress('0xcccccccccccccccccccccccccccccccccccccccc')

const Q96 = 79228162514264337593543950336n // 1 * 2^96
const END_BLOCK = 1000n

const ARGS: LaunchAssetSourceArgs = {
  chainId: 130,
  auction: AUCTION,
  tickDataLens: LENS,
  // Native ETH (address(0)) sorts first → currency0 == native, currency1 == token (quick-launch shape).
  poolKey: { currency0: zeroAddress, currency1: TOKEN, fee: 2500, tickSpacing: 50, hooks: zeroAddress },
  stateView: STATE_VIEW,
  endBlock: END_BLOCK,
}

const POOL_ID = computeLbpPoolId(zeroAddress, TOKEN, 2500, 50, zeroAddress)

const ok = (result: unknown): CallResult => ({ status: 'success', result })
const fail = (): CallResult => ({ status: 'failure', error: new Error('pool does not exist yet') })

const CHECKPOINT = {
  clearingPrice: 2n * Q96,
  currencyRaisedAtClearingPriceQ96_X7: 0n,
  cumulativeMpsPerPrice: 0n,
  cumulativeMps: 0,
  prev: 0n,
  next: 0n,
}
const TICKS = [{ priceQ96: 1000n, currencyDemandQ96: 500n, requiredCurrencyDemandQ96: 200n, currencyRequiredQ96: 300n }]

const v4Slot0 = (sqrtPriceX96: bigint) => ok([sqrtPriceX96, 0, 0, 0])

function identity(blockNumber: bigint): TickIdentity {
  return { chainId: 130, blockNumber, parentBlockHash: '0xabc', timestamp: 1_700_000_000n }
}

function auctionTick(
  blockNumber: bigint,
  opts: { isGraduated?: boolean; slot0?: CallResult } = {}
): TickData {
  return {
    identity: identity(blockNumber),
    results: {
      checkpoint: ok(CHECKPOINT),
      currencyRaised: ok(5_000n),
      remainingSupply: ok(9_000n),
      isGraduated: ok(opts.isGraduated ?? false),
      tickData: ok(TICKS),
      slot0: opts.slot0 ?? fail(),
    },
    logs: [],
    retractions: [],
  }
}

const auctionEmission = (blockNumber: bigint): SourceEmission<LaunchAssetState> => ({
  value: { phase: 'auction', priceX96: 2n * Q96, currencyRaised: 5_000n, remainingSupply: 9_000n, tickFillRatios: [] },
  phase: 'auction',
  identity: identity(blockNumber),
})

const graduatedEmission = (blockNumber: bigint): SourceEmission<LaunchAssetState> => ({
  value: {
    phase: 'graduated',
    priceX96: Q96,
    poolSqrtPriceX96: Q96,
    currencyRaised: 5_000n,
    remainingSupply: 9_000n,
  },
  phase: 'graduated',
  identity: identity(blockNumber),
})

const failedEmission = (blockNumber: bigint): SourceEmission<LaunchAssetState> => ({
  value: { phase: 'failed', priceX96: 2n * Q96, currencyRaised: 5_000n, remainingSupply: 0n, tickFillRatios: [] },
  phase: 'failed',
  identity: identity(blockNumber),
})

describe('launchAssetSource — call sets', () => {
  const source = launchAssetSource(ARGS)

  it('always includes the speculative StateView getSlot0 pre-graduation (allowFailure)', () => {
    const expectedSlot0 = { ...slot0Call({ stateView: STATE_VIEW, poolId: POOL_ID }), allowFailure: true }
    // First tick (prev undefined) → full auction read-set + speculative slot0.
    const first = source.calls({ prev: undefined })
    expect(first.slot0).toEqual(expectedSlot0)
    expect(Object.keys(first).sort()).toEqual(
      ['checkpoint', 'currencyRaised', 'isGraduated', 'remainingSupply', 'slot0', 'tickData'].sort()
    )
    // Mid-auction → still the full set + speculative slot0.
    expect(source.calls({ prev: auctionEmission(500n) }).slot0).toEqual(expectedSlot0)
  })

  it('shrinks to StateView getSlot0 only after graduation', () => {
    const calls = source.calls({ prev: graduatedEmission(1001n) })
    expect(Object.keys(calls)).toEqual(['slot0'])
  })

  it('failed regime keeps watching isGraduated + speculative slot0 for a late migrate()', () => {
    const calls = source.calls({ prev: failedEmission(1001n) })
    expect(Object.keys(calls).sort()).toEqual(['isGraduated', 'slot0'].sort())
    expect(calls.slot0.allowFailure).toBe(true)
  })
})

describe('launchAssetSource — derive', () => {
  const source = launchAssetSource(ARGS)

  it('auction phase: emits clearing price + fill ratios, no pool price (slot0 fails harmlessly)', () => {
    const emission = source.derive(auctionTick(500n), { prev: undefined })
    expect(emission?.phase).toBe('auction')
    expect(emission?.value).toEqual({
      phase: 'auction',
      priceX96: 2n * Q96,
      currencyRaised: 5_000n,
      remainingSupply: 9_000n,
      tickFillRatios: [{ priceQ96: 1000n, fillRatio: 2.5 }],
    })
    expect(emission?.value.poolSqrtPriceX96).toBeUndefined()
  })

  it('NO-GAP: the graduation tick carries phase=graduated AND poolSqrtPriceX96 in the SAME emission', () => {
    // endBlock passed, isGraduated flips true, and the speculative slot0 now succeeds in the same batch.
    const tick = auctionTick(1001n, { isGraduated: true, slot0: v4Slot0(Q96) })
    const emission = source.derive(tick, { prev: auctionEmission(1000n) })
    expect(emission?.phase).toBe('graduated')
    expect(emission?.value.phase).toBe('graduated')
    expect(emission?.value.poolSqrtPriceX96).toBe(Q96)
    expect(emission?.value.priceX96).toBe(Q96) // 2^288 / (2^96)^2 == 2^96 (currency-per-token, currency0-native)
    expect(emission?.identity.blockNumber).toBe(1001n) // same block as the phase transition
    // Auction totals are carried into the graduated emission.
    expect(emission?.value.currencyRaised).toBe(5_000n)
    expect(emission?.value.remainingSupply).toBe(9_000n)
  })

  it('failed outcome: endBlock passed, not graduated → phase=failed with the final clearing price', () => {
    const emission = source.derive(auctionTick(1001n, { isGraduated: false }), { prev: undefined })
    expect(emission?.phase).toBe('failed')
    expect(emission?.value.phase).toBe('failed')
    expect(emission?.value.priceX96).toBe(2n * Q96)
    expect(emission?.value.poolSqrtPriceX96).toBeUndefined()
  })

  it('post-graduation steady state: tracks the pool price, carries auction totals from prev', () => {
    const tick: TickData = {
      identity: identity(1050n),
      results: { slot0: v4Slot0(2n * Q96) },
      logs: [],
      retractions: [],
    }
    const emission = source.derive(tick, { prev: graduatedEmission(1001n) })
    expect(emission?.phase).toBe('graduated')
    expect(emission?.value.poolSqrtPriceX96).toBe(2n * Q96)
    // 2^288 / (2*2^96)^2 = 2^288 / (4*2^192) = 2^96/4
    expect(emission?.value.priceX96).toBe(Q96 / 4n)
    expect(emission?.value.currencyRaised).toBe(5_000n)
    expect(emission?.value.remainingSupply).toBe(9_000n)
  })

  it('post-graduation: a transient slot0 read miss emits nothing (keeps prev)', () => {
    const tick: TickData = { identity: identity(1051n), results: { slot0: fail() }, logs: [], retractions: [] }
    expect(source.derive(tick, { prev: graduatedEmission(1001n) })).toBeUndefined()
  })

  it('late graduation: a migrate() landing after a failed phase transitions to graduated', () => {
    const tick: TickData = {
      identity: identity(1100n),
      results: { isGraduated: ok(true), slot0: v4Slot0(Q96) },
      logs: [],
      retractions: [],
    }
    const emission = source.derive(tick, { prev: failedEmission(1050n) })
    expect(emission?.phase).toBe('graduated')
    expect(emission?.value.poolSqrtPriceX96).toBe(Q96)
    expect(emission?.value.currencyRaised).toBe(5_000n)
  })

  it('failed steady state: re-emits the frozen final snapshot while still failed', () => {
    const tick: TickData = {
      identity: identity(1101n),
      results: { isGraduated: ok(false), slot0: fail() },
      logs: [],
      retractions: [],
    }
    const emission = source.derive(tick, { prev: failedEmission(1050n) })
    expect(emission?.phase).toBe('failed')
    expect(emission?.value.priceX96).toBe(2n * Q96)
  })

  it('emits no tick during auction when a required read failed', () => {
    const tick = auctionTick(500n)
    tick.results.checkpoint = fail()
    expect(source.derive(tick, { prev: undefined })).toBeUndefined()
  })

  it('suppresses unchanged emissions but not phase/price/pool changes (valueEquals)', () => {
    const a = auctionEmission(500n).value
    expect(source.valueEquals?.(a, { ...a })).toBe(true)
    expect(source.valueEquals?.(a, { ...a, phase: 'failed' })).toBe(false)
    expect(source.valueEquals?.(a, { ...a, priceX96: 3n * Q96 })).toBe(false)
    expect(source.valueEquals?.(a, { ...a, poolSqrtPriceX96: Q96 })).toBe(false)
  })

  it('has a chain- and auction-keyed identity', () => {
    expect(source.key).toBe(`launchAsset:130:${AUCTION.toLowerCase()}`)
  })
})
