import { CHAIN_TO_ADDRESSES_MAP, ChainId, V2_FACTORY_ADDRESSES, V3_CORE_FACTORY_ADDRESSES, WETH9 } from '@uniswap/sdk-core'
import { describe, expect, test } from 'bun:test'

import {
  ARBITRUM_MANIFEST,
  BASE_MANIFEST,
  KNOWN_MANIFESTS,
  MAINNET_MANIFEST,
  ROBINHOOD_MANIFEST,
  UNICHAIN_MANIFEST,
} from './manifest'

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

// ---------------------------------------------------------------------------
// R6(c): the SAME drift guard, widened from `v4.quoter` to every address
// `sdk-core` also publishes.
//
// The four older manifests pinned exactly ONE field against `sdk-core` — the v4
// quoter, because that was the literal C4-P4 inlined. Every other address in
// them (`v2.factory`, `v3.factory`, `v4.poolManager`, `wrappedNative`) was
// verified once, live, at bring-up and then guarded by nothing: a `sdk-core`
// republish, or a typo in a future manifest edit, would show up as a search
// that finds no routes on a chain that has plenty. Robinhood already had this
// coverage (C4-T5 above); these four now do too.
//
// `v3.v3QuoterV2` is DELIBERATELY ABSENT from this block, and that absence is
// the finding it encodes: `sdk-core`'s `quoterAddress` is QuoterV1-shaped on
// Unichain and Arbitrum (see `manifest.ts`), so asserting against it would fail
// for the right reason and be silenced for the wrong one. It is verified by
// bytecode length instead, at bring-up.
//
// Each case indexes `CHAIN_TO_ADDRESSES_MAP` with a literal `ChainId` member,
// for the reason given at the top of this file.
// ---------------------------------------------------------------------------

describe('v2/v3/v4 core address parity with sdk-core (R6)', () => {
  test('v2 factory equals V2_FACTORY_ADDRESSES for every built-in chain', () => {
    expect(MAINNET_MANIFEST.v2!.factory.toLowerCase()).toBe(V2_FACTORY_ADDRESSES[ChainId.MAINNET]!.toLowerCase())
    expect(BASE_MANIFEST.v2!.factory.toLowerCase()).toBe(V2_FACTORY_ADDRESSES[ChainId.BASE]!.toLowerCase())
    expect(UNICHAIN_MANIFEST.v2!.factory.toLowerCase()).toBe(V2_FACTORY_ADDRESSES[ChainId.UNICHAIN]!.toLowerCase())
    expect(ARBITRUM_MANIFEST.v2!.factory.toLowerCase()).toBe(V2_FACTORY_ADDRESSES[ChainId.ARBITRUM_ONE]!.toLowerCase())
  })

  test('v3 factory equals V3_CORE_FACTORY_ADDRESSES for every built-in chain', () => {
    expect(MAINNET_MANIFEST.v3!.factory.toLowerCase()).toBe(V3_CORE_FACTORY_ADDRESSES[ChainId.MAINNET]!.toLowerCase())
    expect(BASE_MANIFEST.v3!.factory.toLowerCase()).toBe(V3_CORE_FACTORY_ADDRESSES[ChainId.BASE]!.toLowerCase())
    expect(UNICHAIN_MANIFEST.v3!.factory.toLowerCase()).toBe(V3_CORE_FACTORY_ADDRESSES[ChainId.UNICHAIN]!.toLowerCase())
    expect(ARBITRUM_MANIFEST.v3!.factory.toLowerCase()).toBe(V3_CORE_FACTORY_ADDRESSES[ChainId.ARBITRUM_ONE]!.toLowerCase())
  })

  test('v4 poolManager equals CHAIN_TO_ADDRESSES_MAP[...].v4PoolManagerAddress', () => {
    expect(MAINNET_MANIFEST.v4!.poolManager.toLowerCase()).toBe(CHAIN_TO_ADDRESSES_MAP[ChainId.MAINNET].v4PoolManagerAddress!.toLowerCase())
    expect(BASE_MANIFEST.v4!.poolManager.toLowerCase()).toBe(CHAIN_TO_ADDRESSES_MAP[ChainId.BASE].v4PoolManagerAddress!.toLowerCase())
    expect(UNICHAIN_MANIFEST.v4!.poolManager.toLowerCase()).toBe(CHAIN_TO_ADDRESSES_MAP[ChainId.UNICHAIN].v4PoolManagerAddress!.toLowerCase())
    expect(ARBITRUM_MANIFEST.v4!.poolManager.toLowerCase()).toBe(
      CHAIN_TO_ADDRESSES_MAP[ChainId.ARBITRUM_ONE].v4PoolManagerAddress!.toLowerCase(),
    )
  })

  test('wrappedNative equals sdk-core WETH9 for every built-in chain', () => {
    // The top-level `wrappedNative` (C4-P3), which quoting reads directly — `manifest.ts`'s own
    // `assertWrappedNativeConsistency` then ties `execution.wrappedNative` to it, so pinning one
    // pins both. A wrong wrapped-native address silently breaks every native-side route on the
    // chain while leaving erc20<->erc20 routes working, which is the hardest kind to notice.
    expect(MAINNET_MANIFEST.wrappedNative.toLowerCase()).toBe(WETH9[ChainId.MAINNET]!.address.toLowerCase())
    expect(BASE_MANIFEST.wrappedNative.toLowerCase()).toBe(WETH9[ChainId.BASE]!.address.toLowerCase())
    expect(UNICHAIN_MANIFEST.wrappedNative.toLowerCase()).toBe(WETH9[ChainId.UNICHAIN]!.address.toLowerCase())
    expect(ARBITRUM_MANIFEST.wrappedNative.toLowerCase()).toBe(WETH9[ChainId.ARBITRUM_ONE]!.address.toLowerCase())
  })
})

// ---------------------------------------------------------------------------
// The drift guard for the guards.
//
// Every block above enumerates its chains BY HAND, and it has to: `sdk-core`'s
// `CHAIN_TO_ADDRESSES_MAP` is typed per-chain, so only a literal `ChainId`
// member indexes it (see the note at the top of this file). The cost of a hand
// enumeration is that it silently stops covering a chain the moment a sixth
// built-in manifest is added — the new chain's addresses would be pinned
// against nothing, which is precisely the state R6 existed to end.
//
// So the enumeration is asserted against `KNOWN_MANIFESTS` itself: adding a
// manifest without extending these tests fails here, on the commit that adds
// it, with a message naming the chain that lost coverage.
// ---------------------------------------------------------------------------

test('every built-in manifest is covered by a parity assertion above', () => {
  const asserted = new Set([
    ChainId.MAINNET,
    ChainId.BASE,
    ChainId.UNICHAIN,
    ChainId.ARBITRUM_ONE,
    ChainId.ROBINHOOD,
  ] as number[])
  const built_in = new Set(Object.keys(KNOWN_MANIFESTS).map(Number))

  const uncovered = [...built_in].filter((id) => !asserted.has(id))
  expect(uncovered, `built-in manifests with no sdk-core parity assertion: ${uncovered.join(', ')}`).toEqual([])
  // ...and the converse, so a chain removed from the manifests does not leave a test asserting
  // against a manifest that no longer exists (which would fail confusingly, at the import).
  const stale = [...asserted].filter((id) => !built_in.has(id))
  expect(stale, `parity assertions for chains that are no longer built in: ${stale.join(', ')}`).toEqual([])
})
