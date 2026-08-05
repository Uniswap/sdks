import { CHAIN_TO_ADDRESSES_MAP, ChainId, WETH9 } from '@uniswap/sdk-core'
import { describe, expect, test } from 'bun:test'

import { ARBITRUM_MANIFEST, BASE_MANIFEST, MAINNET_MANIFEST, ROBINHOOD_MANIFEST, UNICHAIN_MANIFEST } from './manifest'

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

  test('Robinhood: the inlined literal equals CHAIN_TO_ADDRESSES_MAP[ChainId.ROBINHOOD].v4QuoterAddress', () => {
    expect(ROBINHOOD_MANIFEST.v4!.quoter.toLowerCase()).toBe(
      CHAIN_TO_ADDRESSES_MAP[ChainId.ROBINHOOD].v4QuoterAddress!.toLowerCase(),
    )
  })
})

// ---------------------------------------------------------------------------
// C4-T5: the SAME drift guard for Robinhood Chain's other deployments.
//
// Robinhood Chain's addresses were all captured from `sdk-core` and then verified live (see
// `manifest.ts`), so — unlike the older manifests, whose v3 quoters deliberately DISAGREE with
// `sdk-core`'s `quoterAddress` field (it is QuoterV1-shaped on Unichain/Arbitrum) — every literal
// here should still match its `sdk-core` source. Pinning all four, not just the v4 quoter, is
// therefore free here and catches a `sdk-core` republish for this chain.
//
// `v3.v3QuoterV2` IS asserted against `quoterAddress` for this chain specifically, because on
// Robinhood that field genuinely is QuoterV2 (bytecode length 8,273 bytes, verified live). If a
// future `sdk-core` release repoints it at a QuoterV1-shaped deployment the way it has on other
// chains, this test failing is the correct outcome — that is exactly the drift worth being told
// about, and the fix would be to drop this one assertion with a note, not to follow `sdk-core`.
// ---------------------------------------------------------------------------

describe('Robinhood Chain address parity with sdk-core (C4-T5)', () => {
  test('v3 factory', () => {
    expect(ROBINHOOD_MANIFEST.v3!.factory.toLowerCase()).toBe(
      CHAIN_TO_ADDRESSES_MAP[ChainId.ROBINHOOD].v3CoreFactoryAddress.toLowerCase(),
    )
  })

  test('v3QuoterV2 equals quoterAddress — true on THIS chain, deliberately not on Unichain/Arbitrum', () => {
    expect(ROBINHOOD_MANIFEST.v3!.v3QuoterV2.toLowerCase()).toBe(
      CHAIN_TO_ADDRESSES_MAP[ChainId.ROBINHOOD].quoterAddress.toLowerCase(),
    )
  })

  test('v4 poolManager', () => {
    expect(ROBINHOOD_MANIFEST.v4!.poolManager.toLowerCase()).toBe(
      CHAIN_TO_ADDRESSES_MAP[ChainId.ROBINHOOD].v4PoolManagerAddress!.toLowerCase(),
    )
  })

  test('wrappedNative equals sdk-core WETH9 for this chain', () => {
    expect(ROBINHOOD_MANIFEST.wrappedNative.toLowerCase()).toBe(
      WETH9[ChainId.ROBINHOOD]!.address.toLowerCase(),
    )
  })
})
