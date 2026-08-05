import { CHAIN_TO_ADDRESSES_MAP, ChainId } from '@uniswap/sdk-core'
import { describe, expect, test } from 'bun:test'

import { ARBITRUM_MANIFEST, BASE_MANIFEST, MAINNET_MANIFEST, UNICHAIN_MANIFEST } from './manifest'

// ---------------------------------------------------------------------------
// C4-P4: `@uniswap/sdk-core` is a devDependency ONLY — this file is the one
// place in the package that imports it, and only to prove the four `v4.quoter`
// literals `manifest.ts` now hardcodes (to keep ethers out of the runtime
// dependency graph of an otherwise viem-only package) still agree with
// `sdk-core`'s own `CHAIN_TO_ADDRESSES_MAP[chainId].v4QuoterAddress`. If
// `sdk-core` ever republishes a different v4 quoter address for one of these
// chains, this test — not a silent runtime divergence — is what catches it.
//
// Each case indexes `CHAIN_TO_ADDRESSES_MAP` with the literal `ChainId` member
// directly (not a variable typed as the wider `ChainId` union) — `sdk-core`'s
// map type only has keys for the chains it actually covers, so a broadened
// index type fails exactly the way `manifest.ts`'s own `CHAIN_TO_ADDRESSES_MAP[1]`-
// style literal indexing does not.
// ---------------------------------------------------------------------------

describe('v4 quoter address parity with sdk-core (C4-P4)', () => {
  test('mainnet: the inlined literal equals CHAIN_TO_ADDRESSES_MAP[ChainId.MAINNET].v4QuoterAddress', () => {
    expect(MAINNET_MANIFEST.v4!.quoter.toLowerCase()).toBe(CHAIN_TO_ADDRESSES_MAP[ChainId.MAINNET].v4QuoterAddress!.toLowerCase())
  })

  test('Base: the inlined literal equals CHAIN_TO_ADDRESSES_MAP[ChainId.BASE].v4QuoterAddress', () => {
    expect(BASE_MANIFEST.v4!.quoter.toLowerCase()).toBe(CHAIN_TO_ADDRESSES_MAP[ChainId.BASE].v4QuoterAddress!.toLowerCase())
  })

  test('Unichain: the inlined literal equals CHAIN_TO_ADDRESSES_MAP[ChainId.UNICHAIN].v4QuoterAddress', () => {
    expect(UNICHAIN_MANIFEST.v4!.quoter.toLowerCase()).toBe(CHAIN_TO_ADDRESSES_MAP[ChainId.UNICHAIN].v4QuoterAddress!.toLowerCase())
  })

  test('Arbitrum: the inlined literal equals CHAIN_TO_ADDRESSES_MAP[ChainId.ARBITRUM_ONE].v4QuoterAddress', () => {
    expect(ARBITRUM_MANIFEST.v4!.quoter.toLowerCase()).toBe(
      CHAIN_TO_ADDRESSES_MAP[ChainId.ARBITRUM_ONE].v4QuoterAddress!.toLowerCase(),
    )
  })
})
