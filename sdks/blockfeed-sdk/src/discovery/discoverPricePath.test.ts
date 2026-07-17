import { Token } from '@uniswap/sdk-core'
import { describe, expect, it } from 'bun:test'
import type { Address, PublicClient } from 'viem'
import { getAddress } from 'viem'

import type { NoPathFound, PricePath } from '../types'

import { discoverPricePath, type DiscoverDeps } from './discoverPricePath'
import type { ProbeResult } from './probe'
import { pickBest } from './rank'
import type { CandidatePool } from './types'

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' // mainnet WETH = default intermediary
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const TKN = '0x' + '11'.repeat(20)

const tkn = new Token(1, TKN, 18, 'TKN')
const usdc = new Token(1, USDC, 6, 'USDC')

const D_POOL = getAddress('0x' + 'd0'.repeat(20)) as Address // direct TKN/USDC
const L1_POOL = getAddress('0x' + 'a1'.repeat(20)) as Address // TKN/WETH
const L2_POOL = getAddress('0x' + 'b2'.repeat(20)) as Address // WETH/USDC

const cand = (pool: Address): CandidatePool => ({
  ref: { protocol: 'v3', pool },
  currencyA: tkn,
  currencyB: usdc,
  v3Fee: 3000,
})

const probe = (candidate: CandidatePool, buyOut: bigint, roundTripOut: bigint): ProbeResult => ({
  candidate,
  buyOut,
  roundTripOut,
})

interface Scenario {
  enumerate(base: string, quote: string): CandidatePool[]
  probe(base: string, quote: string, cands: CandidatePool[]): ProbeResult[]
}

/** Build injectable deps from a scenario, recording every enumerate invocation for assertions. */
function makeDeps(s: Scenario) {
  const enumCalls: Array<{ pair: string; opts: unknown }> = []
  const deps: DiscoverDeps = {
    enumerateCandidates: (async (_c, _id, a: Token, b: Token, opts: unknown) => {
      enumCalls.push({ pair: `${a.symbol}/${b.symbol}`, opts })
      return s.enumerate(a.symbol!, b.symbol!)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
    probeCandidates: (async (_c, _id, cands: CandidatePool[], base: Token, quote: Token) =>
      s.probe(base.symbol!, quote.symbol!, cands)) as DiscoverDeps['probeCandidates'],
    pickBest,
  }
  return { deps, enumCalls }
}

const client = {} as PublicClient
const run = (deps: DiscoverDeps, options = {}) =>
  discoverPricePath(client, { chainId: 1, base: tkn, quote: usdc, options: { probeNotional: 1000n, ...options } }, deps)

describe('discoverPricePath', () => {
  it('picks the direct pool when it out-scores every 2-hop', async () => {
    const { deps } = makeDeps({
      enumerate: (a, b) => {
        if (a === 'TKN' && b === 'USDC') return [cand(D_POOL)]
        if (a === 'WETH' && b === 'USDC') return [cand(L2_POOL)]
        if (a === 'TKN' && b === 'WETH') return [cand(L1_POOL)]
        return []
      },
      probe: (a, b, cands) => {
        if (a === 'TKN' && b === 'USDC') return [probe(cands[0]!, 100n, 1000n)] // score 100
        if (a === 'WETH' && b === 'USDC') return [probe(cands[0]!, 50n, 500n)] // L2, buyOutI=50
        if (a === 'TKN' && b === 'WETH') return [probe(cands[0]!, 10n, 400n)] // L1 → composite 10*(500/1000)=5
        return []
      },
    })
    const path = (await run(deps)) as PricePath
    expect(path.legs.length).toBe(1)
    expect(path.legs[0]!.pool).toEqual({ protocol: 'v3', pool: D_POOL })
    expect(path.legs[0]!.base).toBe(tkn)
    expect(path.legs[0]!.quote).toBe(usdc)
  })

  it('picks the 2-hop route when the direct pool is worse', async () => {
    const { deps } = makeDeps({
      enumerate: (a, b) => {
        if (a === 'TKN' && b === 'USDC') return [cand(D_POOL)]
        if (a === 'WETH' && b === 'USDC') return [cand(L2_POOL)]
        if (a === 'TKN' && b === 'WETH') return [cand(L1_POOL)]
        return []
      },
      probe: (a, b, cands) => {
        if (a === 'TKN' && b === 'USDC') return [probe(cands[0]!, 1n, 1n)] // score 0.001
        if (a === 'WETH' && b === 'USDC') return [probe(cands[0]!, 50n, 1000n)] // L2, buyOutI=50, R2=1000
        if (a === 'TKN' && b === 'WETH') return [probe(cands[0]!, 1000n, 999n)] // L1 → composite 1000*(1000/1000)=1000
        return []
      },
    })
    const path = (await run(deps)) as PricePath
    expect(path.legs.length).toBe(2)
    expect(path.legs[0]!.pool).toEqual({ protocol: 'v3', pool: L1_POOL })
    expect(path.legs[0]!.base).toBe(tkn)
    expect(path.legs[0]!.quote.wrapped.address).toBe(getAddress(WETH))
    expect(path.legs[1]!.pool).toEqual({ protocol: 'v3', pool: L2_POOL })
    expect(path.legs[1]!.base.wrapped.address).toBe(getAddress(WETH))
    expect(path.legs[1]!.quote).toBe(usdc)
  })

  it('returns NoPathFound (naming the pair + probe count) when nothing scores', async () => {
    const { deps } = makeDeps({
      enumerate: (a, b) => {
        if (a === 'TKN' && b === 'USDC') return [cand(D_POOL)]
        if (a === 'WETH' && b === 'USDC') return [cand(L2_POOL)]
        return []
      },
      probe: (_a, _b, cands) => cands.map((c) => probe(c, 0n, 0n)), // every probe fails
    })
    const res = (await run(deps)) as NoPathFound
    expect(res.kind).toBe('no-path')
    expect(res.reason).toContain('TKN/USDC')
    expect(res.reason).toMatch(/probed \d+ candidate/)
  })

  it('forwards hookAllowlist + fromBlockOverride to enumeration', async () => {
    const HOOK = getAddress('0x' + '22'.repeat(20)) as Address
    const { deps, enumCalls } = makeDeps({
      enumerate: (a, b) => (a === 'TKN' && b === 'USDC' ? [cand(D_POOL)] : []),
      probe: (a, b, cands) => (a === 'TKN' && b === 'USDC' ? [probe(cands[0]!, 100n, 1000n)] : []),
    })
    await run(deps, { hookAllowlist: [HOOK], fromBlockOverride: 42n })
    expect(enumCalls[0]!.opts).toEqual({ hookAllowlist: [HOOK], fromBlockOverride: 42n })
  })

  it('skips intermediaries entirely when maxHops is 1', async () => {
    const { deps, enumCalls } = makeDeps({
      enumerate: (a, b) => (a === 'TKN' && b === 'USDC' ? [cand(D_POOL)] : []),
      probe: (a, b, cands) => (a === 'TKN' && b === 'USDC' ? [probe(cands[0]!, 100n, 1000n)] : []),
    })
    const path = (await run(deps, { maxHops: 1 })) as PricePath
    expect(path.legs.length).toBe(1)
    // Only the direct pair was ever enumerated — no intermediary lookups.
    expect(enumCalls.map((c) => c.pair)).toEqual(['TKN/USDC'])
  })
})
