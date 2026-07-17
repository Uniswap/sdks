import { CHAIN_TO_ADDRESSES_MAP, V2_FACTORY_ADDRESSES, WETH9 } from '@uniswap/sdk-core'
import { describe, expect, it } from 'bun:test'
import { type Address, getAddress } from 'viem'

import { CHAIN_ADDRESSES, ChainAddresses, getChainAddresses } from './addresses'
import { BlockfeedError } from './errors'

const ADDRESS_FIELDS: (keyof ChainAddresses)[] = [
  'v2Factory',
  'v3Factory',
  'v4PoolManager',
  'v4StateView',
  'quoterV2',
  'v4Quoter',
  'weth',
]

describe('getChainAddresses', () => {
  it('returns the mainnet record for chainId 1', () => {
    const addresses = getChainAddresses(1)
    expect(addresses).toBe(CHAIN_ADDRESSES[1]!)
    expect(addresses.v3Factory).toBe(getAddress('0x1F98431c8aD98523631AE4a59f267346ea31F984'))
    expect(addresses.v4PoolManager).toBe(getAddress('0x000000000004444c5dc75cB358380D2e3dE08A90'))
    expect(addresses.quoterV2).toBe(getAddress('0x61fFE014bA17989E743c5F6cB21bF9697530B21e'))
    expect(addresses.v4PoolManagerDeployBlock).toBe(21688329n)
  })

  it('returns records for every supported chain', () => {
    for (const chainId of [1, 8453, 130]) {
      expect(getChainAddresses(chainId)).toBe(CHAIN_ADDRESSES[chainId]!)
    }
  })

  it('throws BlockfeedError mentioning the chainId for an unsupported chain', () => {
    expect(() => getChainAddresses(999999)).toThrow(BlockfeedError)
    expect(() => getChainAddresses(999999)).toThrow(/999999/)
  })
})

describe('CHAIN_ADDRESSES', () => {
  it('stores every address in checksummed form', () => {
    for (const [chainId, addresses] of Object.entries(CHAIN_ADDRESSES)) {
      for (const field of ADDRESS_FIELDS) {
        const value = addresses[field] as Address | undefined
        if (value === undefined) continue
        expect(getAddress(value), `${chainId}.${String(field)} must be checksummed`).toBe(value)
      }
    }
  })

  it('carries a positive-or-genesis v4 deploy block for every chain', () => {
    for (const addresses of Object.values(CHAIN_ADDRESSES)) {
      expect(addresses.v4PoolManagerDeployBlock >= 0n).toBe(true)
    }
  })
})

describe('CHAIN_ADDRESSES cross-check against sdk-core', () => {
  const eq = (a: string | undefined, b: string | undefined): boolean =>
    (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

  /**
   * quoterV2 is exempted on Mainnet and Unichain: sdk-core's generic `quoterAddress` field is NOT the
   * v3 QuoterV2 on those chains — on Mainnet it stores QuoterV1 (0xb273…) and on Unichain a different
   * non-V2 quoter — so it is not a valid cross-check source for our `quoterV2`. On Base sdk-core's
   * `quoterAddress` IS the QuoterV2, so it is checked there. (See the addresses.ts comments.)
   */
  const QUOTER_V2_EXEMPT = new Set<number>([1, 130])

  for (const chainId of [1, 8453, 130]) {
    it(`matches sdk-core CHAIN_TO_ADDRESSES_MAP / V2_FACTORY_ADDRESSES / WETH9 for chain ${chainId}`, () => {
      const bf = getChainAddresses(chainId)
      const sdk = CHAIN_TO_ADDRESSES_MAP[chainId as keyof typeof CHAIN_TO_ADDRESSES_MAP]

      expect(eq(bf.v3Factory, sdk.v3CoreFactoryAddress), 'v3Factory').toBe(true)
      expect(eq(bf.v4PoolManager, sdk.v4PoolManagerAddress), 'v4PoolManager').toBe(true)
      expect(eq(bf.v4StateView, sdk.v4StateView), 'v4StateView').toBe(true)
      expect(eq(bf.v4Quoter, sdk.v4QuoterAddress), 'v4Quoter').toBe(true)
      expect(eq(bf.v2Factory, V2_FACTORY_ADDRESSES[chainId]), 'v2Factory').toBe(true)
      expect(eq(bf.weth, WETH9[chainId]?.address), 'weth').toBe(true)

      if (!QUOTER_V2_EXEMPT.has(chainId)) {
        expect(eq(bf.quoterV2, sdk.quoterAddress), 'quoterV2').toBe(true)
      }
    })
  }
})
