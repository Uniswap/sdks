import { afterEach, describe, expect, test } from 'bun:test'
import { type Address } from 'viem'

import { decodeMorphoMarketData } from './market.js'
import { discoverMorphoMarkets } from './markets.js'

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const ORACLE: Address = '0xdC6fd5831277c693b1054e19E94047cB37c77615'
const IRM: Address = '0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

/** Installs a fetch stub that records every request URL and returns scripted JSON pages in order. */
function stubFetch(pages: Array<{ data: unknown[]; cursor: string | null }>): { calls: string[] } {
  const calls: string[] = []
  let page = 0
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input))
    const body = pages[Math.min(page, pages.length - 1)]
    page++
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { calls }
}

describe('discoverMorphoMarkets', () => {
  test('maps the REST response into DiscoveredMarket with encoded market.data', async () => {
    stubFetch([
      {
        data: [
          {
            loan_token: USDC,
            collateral_token: WETH,
            oracle_address: ORACLE,
            irm_address: IRM,
            lltv_wad: '860000000000000000',
          },
        ],
        cursor: null,
      },
    ])

    const markets = await discoverMorphoMarkets(1)
    expect(markets).toHaveLength(1)
    expect(markets[0].venue).toBe('morphoBlue')
    expect(markets[0].market.collateral).toBe(WETH)
    expect(markets[0].market.debt).toBe(USDC)
    expect(decodeMorphoMarketData(markets[0].market.data)).toEqual({
      oracle: ORACLE,
      irm: IRM,
      lltv: 860_000_000_000_000_000n,
    })
  })

  test('defaults to listed=true and chain_id, and omits token filters when unset', async () => {
    const { calls } = stubFetch([{ data: [], cursor: null }])
    await discoverMorphoMarkets(1)
    const url = new URL(calls[0])
    expect(url.pathname).toBe('/v1/blue/markets')
    expect(url.searchParams.get('chain_id')).toBe('1')
    expect(url.searchParams.get('listed')).toBe('true')
    expect(url.searchParams.has('collateral_token')).toBe(false)
    expect(url.searchParams.has('loan_token')).toBe(false)
  })

  test('listedOnly: false omits the listed filter', async () => {
    const { calls } = stubFetch([{ data: [], cursor: null }])
    await discoverMorphoMarkets(1, { listedOnly: false })
    expect(new URL(calls[0]).searchParams.has('listed')).toBe(false)
  })

  test('collateralToken is sent bare; debtToken is sent as the chain_id:address selector', async () => {
    const { calls } = stubFetch([{ data: [], cursor: null }])
    await discoverMorphoMarkets(1, { collateralToken: WETH, debtToken: USDC })
    const url = new URL(calls[0])
    expect(url.searchParams.get('collateral_token')).toBe(WETH)
    expect(url.searchParams.get('loan_token')).toBe(`1:${USDC}`)
  })

  test('follows the cursor across pages and stops when cursor is null', async () => {
    const { calls } = stubFetch([
      {
        data: [{ loan_token: USDC, collateral_token: WETH, oracle_address: ORACLE, irm_address: IRM, lltv_wad: '1' }],
        cursor: 'page2',
      },
      {
        data: [{ loan_token: USDC, collateral_token: WETH, oracle_address: ORACLE, irm_address: IRM, lltv_wad: '2' }],
        cursor: null,
      },
    ])
    const markets = await discoverMorphoMarkets(1)
    expect(markets).toHaveLength(2)
    expect(calls).toHaveLength(2)
    expect(new URL(calls[1]).searchParams.get('cursor')).toBe('page2')
  })

  test('respects a custom apiUrl', async () => {
    const { calls } = stubFetch([{ data: [], cursor: null }])
    await discoverMorphoMarkets(1, { apiUrl: 'https://mirror.example.com' })
    expect(calls[0].startsWith('https://mirror.example.com/v1/blue/markets')).toBe(true)
  })

  test('throws on a non-ok response', async () => {
    globalThis.fetch = (async () =>
      new Response('nope', { status: 500, statusText: 'Internal Server Error' })) as typeof fetch
    await expect(discoverMorphoMarkets(1)).rejects.toThrow(/500/)
  })
})
