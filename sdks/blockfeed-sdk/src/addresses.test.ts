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
