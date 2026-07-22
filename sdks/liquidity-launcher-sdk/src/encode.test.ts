import { describe, expect, it } from 'bun:test'
import { encodeFunctionData, getAddress } from 'viem'

import { CCA_ABI, LBP_STRATEGY_ABI } from './abis'
import { encodeAuctionSteps, encodeDepositToken, encodeMigrate, encodeSweepUnsoldTokens } from './encode'

describe('encodeDepositToken', () => {
  // Golden vector: call[0] of a real Unichain launch multicall (depositToken(token, 0.0001e18)).
  it('matches the on-chain depositToken calldata', () => {
    const data = encodeDepositToken('0x15d0e0c55a3e7ee67152ad7e89acf164253ff68d', 100000000000000n)
    expect(data).toBe(
      '0x44599bc500000000000000000000000015d0e0c55a3e7ee67152ad7e89acf164253ff68d00000000000000000000000000000000000000000000000000005af3107a4000'
    )
  })
})

describe('encodeSweepUnsoldTokens', () => {
  it('encodes the 4-byte sweepUnsoldTokens() call', () => {
    expect(encodeSweepUnsoldTokens()).toBe('0x5dd13ca7')
    expect(encodeSweepUnsoldTokens()).toBe(
      encodeFunctionData({ abi: CCA_ABI, functionName: 'sweepUnsoldTokens', args: [] })
    )
  })
})

describe('encodeMigrate', () => {
  it('encodes migrate(auction) calldata', () => {
    const auction = getAddress('0x15d0e0c55a3e7ee67152ad7e89acf164253ff68d')
    expect(encodeMigrate(auction)).toBe(
      '0xce5494bb00000000000000000000000015d0e0c55a3e7ee67152ad7e89acf164253ff68d'
    )
    expect(encodeMigrate(auction)).toBe(
      encodeFunctionData({ abi: LBP_STRATEGY_ABI, functionName: 'migrate', args: [auction] })
    )
  })
})

describe('encodeAuctionSteps', () => {
  it('packs each step as bytes3(mps) ‖ bytes5(blockDelta)', () => {
    const data = encodeAuctionSteps([{ mps: 1, startBlock: 0n, endBlock: 2n }])
    // mps=1 -> 0x000001, blockDelta=2 -> 0x0000000002
    expect(data).toBe('0x0000010000000002')
  })

  it('returns 0x for an empty schedule', () => {
    expect(encodeAuctionSteps([])).toBe('0x')
  })

  it('rejects a non-increasing step', () => {
    expect(() => encodeAuctionSteps([{ mps: 1, startBlock: 5n, endBlock: 5n }])).toThrow()
  })
})
