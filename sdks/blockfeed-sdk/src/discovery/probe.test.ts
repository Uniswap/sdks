import { Token } from '@uniswap/sdk-core'
import { describe, expect, it } from 'bun:test'
import type { Address, PublicClient } from 'viem'
import { getAddress } from 'viem'

import type { PoolKeyStruct } from '../types'

import { probeCandidates } from './probe'
import type { CandidatePool } from './types'

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const V3_POOL = '0x' + 'a1'.repeat(20)
const V2_PAIR = '0x' + 'b2'.repeat(20)

const weth = new Token(1, WETH, 18, 'WETH')
const usdc = new Token(1, USDC, 6, 'USDC')

type RawResult = { status: 'success'; result: unknown } | { status: 'failure'; error: Error }
interface RawContract {
  address: string
  functionName: string
  args: readonly unknown[]
}
const ok = (result: unknown): RawResult => ({ status: 'success', result })
const fail = (message: string): RawResult => ({ status: 'failure', error: new Error(message) })

/** Fake client returning one canned `RawResult[]` per multicall round, capturing the contracts sent. */
function makeClient(rounds: RawResult[][]) {
  const calls: RawContract[][] = []
  let i = 0
  const client = {
    multicall: async ({ contracts }: { contracts: RawContract[] }): Promise<RawResult[]> => {
      calls.push(contracts)
      const round = rounds[i++]
      return round ?? contracts.map(() => fail('no canned result'))
    },
  }
  return { client: client as unknown as PublicClient, calls }
}

const v3Cand = (fee: number): CandidatePool => ({
  ref: { protocol: 'v3', pool: getAddress(V3_POOL) as Address },
  currencyA: weth,
  currencyB: usdc,
  v3Fee: fee,
})

const v2Cand = (): CandidatePool => ({
  ref: { protocol: 'v2', pair: getAddress(V2_PAIR) as Address },
  currencyA: weth,
  currencyB: usdc,
})

const v4Cand = (poolKey: PoolKeyStruct): CandidatePool => ({
  ref: { protocol: 'v4', poolKey },
  currencyA: weth,
  currencyB: usdc,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arg0 = (c: RawContract): any => c.args[0]

describe('probeCandidates — v3 (QuoterV2)', () => {
  it('encodes buy (quote→base) then round-trip (base→quote) with the candidate fee', async () => {
    // base=WETH, quote=USDC, notional 1000 USDC. Buy quotes 2000 WETH, sell-back quotes 900 USDC.
    const { client, calls } = makeClient([[ok([2000n, 0n, 0, 0n])], [ok([900n, 0n, 0, 0n])]])
    const res = await probeCandidates(client, 1, [v3Cand(3000)], weth, usdc, 1000n)

    const buy = arg0(calls[0]![0]!)
    expect(calls[0]![0]!.functionName).toBe('quoteExactInputSingle')
    expect(buy.tokenIn).toBe(getAddress(USDC))
    expect(buy.tokenOut).toBe(getAddress(WETH))
    expect(buy.amountIn).toBe(1000n)
    expect(buy.fee).toBe(3000)
    expect(buy.sqrtPriceLimitX96).toBe(0n)

    const sell = arg0(calls[1]![0]!)
    expect(sell.tokenIn).toBe(getAddress(WETH))
    expect(sell.tokenOut).toBe(getAddress(USDC))
    expect(sell.amountIn).toBe(2000n) // round-trip input is the buy output
    expect(sell.fee).toBe(3000)

    expect(res[0]!.buyOut).toBe(2000n)
    expect(res[0]!.roundTripOut).toBe(900n)
  })

  it('excludes a reverted buy (buyOut/roundTrip → 0, no round-trip call issued)', async () => {
    const { client, calls } = makeClient([[fail('revert')]])
    const res = await probeCandidates(client, 1, [v3Cand(3000)], weth, usdc, 1000n)
    expect(res[0]!.buyOut).toBe(0n)
    expect(res[0]!.roundTripOut).toBe(0n)
    expect(calls.length).toBe(1) // round 2 skipped: nothing to sell
  })

  it('excludes a reverted round-trip (buyOut kept, roundTrip → 0)', async () => {
    const { client } = makeClient([[ok([2000n, 0n, 0, 0n])], [fail('revert')]])
    const res = await probeCandidates(client, 1, [v3Cand(3000)], weth, usdc, 1000n)
    expect(res[0]!.buyOut).toBe(2000n)
    expect(res[0]!.roundTripOut).toBe(0n)
  })
})

describe('probeCandidates — v4 (V4Quoter)', () => {
  it('sets zeroForOne from the input token both ways (quote == currency0)', async () => {
    // currency0=USDC (lower addr), currency1=WETH. Buy spends quote=USDC=currency0 → zeroForOne true.
    const poolKey: PoolKeyStruct = {
      currency0: getAddress(USDC) as Address,
      currency1: getAddress(WETH) as Address,
      fee: 500,
      tickSpacing: 10,
      hooks: '0x0000000000000000000000000000000000000000' as Address,
    }
    const { client, calls } = makeClient([[ok([2000n, 0n])], [ok([900n, 0n])]])
    const res = await probeCandidates(client, 1, [v4Cand(poolKey)], weth, usdc, 1000n)

    const buy = arg0(calls[0]![0]!)
    expect(buy.zeroForOne).toBe(true)
    expect(buy.exactAmount).toBe(1000n)
    expect(buy.hookData).toBe('0x')
    expect(buy.poolKey).toEqual(poolKey)

    const sell = arg0(calls[1]![0]!)
    expect(sell.zeroForOne).toBe(false) // reverse direction
    expect(sell.exactAmount).toBe(2000n)

    expect(res[0]!.buyOut).toBe(2000n)
    expect(res[0]!.roundTripOut).toBe(900n)
  })

  it('sets zeroForOne false on buy when the quote token is currency1', async () => {
    // Swap base/quote: base=USDC, quote=WETH. quote=WETH=currency1 → buy zeroForOne false.
    const poolKey: PoolKeyStruct = {
      currency0: getAddress(USDC) as Address,
      currency1: getAddress(WETH) as Address,
      fee: 500,
      tickSpacing: 10,
      hooks: '0x0000000000000000000000000000000000000000' as Address,
    }
    const { client, calls } = makeClient([[ok([2000n, 0n])], [ok([900n, 0n])]])
    await probeCandidates(client, 1, [v4Cand(poolKey)], usdc, weth, 1000n)

    expect(arg0(calls[0]![0]!).zeroForOne).toBe(false)
    expect(arg0(calls[1]![0]!).zeroForOne).toBe(true)
  })

  it('(A10) scores out a candidate whose poolKey matches NEITHER quote currency (no buy call)', async () => {
    // Pathological pool over two unrelated tokens; quote=USDC is neither currency → cannot orient direction.
    const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
    const other = '0x1111111111111111111111111111111111111111'
    const poolKey: PoolKeyStruct = {
      currency0: getAddress(DAI) as Address,
      currency1: getAddress(other) as Address,
      fee: 500,
      tickSpacing: 10,
      hooks: '0x0000000000000000000000000000000000000000' as Address,
    }
    const { client, calls } = makeClient([]) // no canned rounds: none should be requested
    const res = await probeCandidates(client, 1, [v4Cand(poolKey)], weth, usdc, 1000n)

    expect(res[0]!.buyOut).toBe(0n)
    expect(res[0]!.roundTripOut).toBe(0n)
    expect(calls.length).toBe(0) // scored out with no on-chain read at all
  })
})

describe('probeCandidates — v2 (TS reserve math)', () => {
  it('computes both legs from getReserves with the 0.3% fee (golden case)', async () => {
    // quote=USDC is token0 (lower addr) → reserve0=100 is quote, reserve1=200 is base=WETH.
    // buy: getAmountOut(10, reserveIn=100, reserveOut=200) = 1994000/109970 = 18 (floor).
    // round-trip: getAmountOut(18, 200, 100) = 1794600/217946 = 8 (floor).
    const { client, calls } = makeClient([[ok([100n, 200n, 0])]])
    const res = await probeCandidates(client, 1, [v2Cand()], weth, usdc, 10n)

    expect(calls.length).toBe(1) // v2 needs no on-chain round-trip call
    expect(calls[0]![0]!.functionName).toBe('getReserves')
    expect(res[0]!.buyOut).toBe(18n)
    expect(res[0]!.roundTripOut).toBe(8n)
  })

  it('excludes a pool with a reverted getReserves', async () => {
    const { client } = makeClient([[fail('revert')]])
    const res = await probeCandidates(client, 1, [v2Cand()], weth, usdc, 10n)
    expect(res[0]!.buyOut).toBe(0n)
    expect(res[0]!.roundTripOut).toBe(0n)
  })
})

describe('probeCandidates — empty', () => {
  it('returns no results and issues no reads for an empty candidate set', async () => {
    const { client, calls } = makeClient([])
    const res = await probeCandidates(client, 1, [], weth, usdc, 1000n)
    expect(res).toEqual([])
    expect(calls.length).toBe(0)
  })
})
