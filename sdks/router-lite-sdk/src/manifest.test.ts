import { describe, expect, test } from 'bun:test'
import { keccak256 } from 'viem'

import { RouterConfigError } from './errors'
import {
  ARBITRUM_MANIFEST,
  assertChainData,
  assertWrappedNativeConsistency,
  BASE_MANIFEST,
  blockTimeSecondsOf,
  MAINNET_MANIFEST,
  manifestFor,
  reorgOverlapBlocksOf,
  requireExecution,
  UNICHAIN_MANIFEST,
  validateManifest,
  wave0PairScanBlocks,
} from './manifest'
import type { ChainManifest } from './types'

describe('chain manifest', () => {
  test('manifestFor returns mainnet defaults and replaces whole bundles', () => {
    const m = manifestFor(1)
    expect(m.v3?.v3QuoterV2).toBe('0x61fFE014bA17989E743c5F6cB21bF9697530B21e')
    const o = manifestFor(1, { v2: undefined })
    expect(o.v2).toBeUndefined() // bundle removed wholesale
    expect(o.v3).toEqual(m.v3) // others untouched
  })
  test('unknown chain without full overrides throws RouterConfigError', () => {
    expect(() => manifestFor(999999)).toThrow(RouterConfigError)
  })
  test('the unknown-chain error message lists every built-in chain id', () => {
    expect(() => manifestFor(999999)).toThrow(/Built-in manifests exist for: 1, 130, 8453, 42161/)
  })

  // -------------------------------------------------------------------------
  // C4-P3: quote-only manifests — `execution` optional, `wrappedNative` hoisted.
  // -------------------------------------------------------------------------
  describe('quote-only manifests (C4-P3)', () => {
    test('manifestFor(chainId, { execution: undefined }) removes the execution bundle wholesale, keeping wrappedNative', () => {
      const m = manifestFor(1, { execution: undefined })
      expect(m.execution).toBeUndefined()
      expect(m.wrappedNative).toBe(MAINNET_MANIFEST.wrappedNative)
      // Every other bundle is untouched — the same whole-bundle-replacement contract as any other key.
      expect(m.v3).toEqual(MAINNET_MANIFEST.v3)
    })

    test('an unknown chain can be given a quote-only manifest: wrappedNative alone is enough, no execution required', () => {
      const wrappedNative = `0x${'ab'.repeat(20)}` as const
      const m = manifestFor(999999, { wrappedNative, v2: { factory: `0x${'cd'.repeat(20)}`, deploymentBlock: 0n } })
      expect(m.execution).toBeUndefined()
      expect(m.wrappedNative).toBe(wrappedNative)
    })

    test('an unknown chain given only `execution` (no top-level wrappedNative) defaults the top-level field from it', () => {
      const execution = MAINNET_MANIFEST.execution!
      const m = manifestFor(999999, { execution })
      expect(m.wrappedNative).toBe(execution.wrappedNative)
    })

    test('an unknown chain with neither wrappedNative nor execution still throws RouterConfigError', () => {
      expect(() => manifestFor(999999, { v2: { factory: `0x${'cd'.repeat(20)}`, deploymentBlock: 0n } })).toThrow(
        RouterConfigError,
      )
      expect(() => manifestFor(999999, {})).toThrow(/at least "wrappedNative"/)
    })

    test('assertWrappedNativeConsistency accepts a manifest whose two wrappedNative fields agree (built-ins) or that has no execution at all', () => {
      expect(() => assertWrappedNativeConsistency(MAINNET_MANIFEST)).not.toThrow()
      expect(() => assertWrappedNativeConsistency({ chainId: 1, wrappedNative: MAINNET_MANIFEST.wrappedNative })).not.toThrow()
    })

    test('assertWrappedNativeConsistency (and therefore manifestFor) rejects two disagreeing wrappedNative fields', () => {
      const mismatched: ChainManifest = { ...MAINNET_MANIFEST, wrappedNative: BASE_MANIFEST.wrappedNative }
      expect(() => assertWrappedNativeConsistency(mismatched)).toThrow(RouterConfigError)
      expect(() => manifestFor(1, { wrappedNative: BASE_MANIFEST.wrappedNative })).toThrow(RouterConfigError)
      expect(() => manifestFor(1, { wrappedNative: BASE_MANIFEST.wrappedNative })).toThrow(/does not match/)
    })

    test('requireExecution returns the bundle when present, and throws RouterConfigError naming the swap requirement when absent', () => {
      expect(requireExecution(MAINNET_MANIFEST)).toBe(MAINNET_MANIFEST.execution!)
      const quoteOnly = manifestFor(1, { execution: undefined })
      expect(() => requireExecution(quoteOnly)).toThrow(RouterConfigError)
      expect(() => requireExecution(quoteOnly)).toThrow(/no execution bundle/)
    })
  })

  // -------------------------------------------------------------------------
  // C4-P2: Base, Unichain, Arbitrum built-in manifests.
  // -------------------------------------------------------------------------
  describe('L2 manifests (C4-P2)', () => {
    const cases: [label: string, chainId: number, manifest: ChainManifest, wave0Blocks: bigint][] = [
      ['Base', 8453, BASE_MANIFEST, 302_400n],
      ['Unichain', 130, UNICHAIN_MANIFEST, 604_800n],
      ['Arbitrum', 42161, ARBITRUM_MANIFEST, 2_419_200n],
    ]

    for (const [label, chainId, expected, wave0Blocks] of cases) {
      describe(label, () => {
        test('manifestFor returns the built-in manifest as a complete bundle', () => {
          const m = manifestFor(chainId)
          expect(m).toEqual(expected)
          expect(m.chainId).toBe(chainId)
          // Every protocol bundle is present — not "disabled" by omission — and each carries a
          // non-placeholder deployment block and address.
          expect(m.v2).toBeDefined()
          expect(m.v2?.factory).toMatch(/^0x[0-9a-fA-F]{40}$/)
          expect(m.v3).toBeDefined()
          expect(m.v3?.factory).toMatch(/^0x[0-9a-fA-F]{40}$/)
          expect(m.v3?.v3QuoterV2).toMatch(/^0x[0-9a-fA-F]{40}$/)
          expect(m.v4).toBeDefined()
          expect(m.v4?.poolManager).toMatch(/^0x[0-9a-fA-F]{40}$/)
          expect(m.v4?.quoter).toMatch(/^0x[0-9a-fA-F]{40}$/)
          // execution — every built-in manifest carries a Universal Router bundle (C4-P3 makes it
          // optional on the type, but every built-in still sets it).
          expect(m.execution).toBeDefined()
          expect(m.execution?.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
          expect(m.execution?.commandSet).toBe('ur-2.0')
          expect(m.execution?.permit2).toBe('0x000000000022D473030F116dDEE9F6B43aC78BA3')
          // wrappedNative — hoisted to the top level (C4-P3), and equal to execution's own copy.
          expect(m.wrappedNative).toMatch(/^0x[0-9a-fA-F]{40}$/)
          expect(m.execution?.wrappedNative).toBe(m.wrappedNative)
          // coreIntermediates: wrapped native + native USDC, both present.
          expect(m.coreIntermediates).toHaveLength(2)
          expect(m.coreIntermediates).toContain(m.wrappedNative)
        })

        test(`wave0PairScanBlocks derives ${wave0Blocks} from this chain's own block time`, () => {
          expect(wave0PairScanBlocks(manifestFor(chainId))).toBe(wave0Blocks)
        })

        test('assertChainData accepts the built-in chain bundle', () => {
          expect(() => assertChainData(manifestFor(chainId))).not.toThrow()
        })
      })
    }

    test('each chain has a distinct wrappedNative/execution address from the others', () => {
      const addrs = [MAINNET_MANIFEST, BASE_MANIFEST, UNICHAIN_MANIFEST, ARBITRUM_MANIFEST].map(
        (m) => m.execution!.address,
      )
      expect(new Set(addrs).size).toBe(addrs.length)
    })
  })
  test('validateManifest rejects chainId mismatch', async () => {
    const client = { getChainId: async () => 8453 }
    await expect(validateManifest(client as any, manifestFor(1))).rejects.toThrow(RouterConfigError)
  })

  // -------------------------------------------------------------------------
  // C4-P1: the `chain` bundle — chain FACTS, not code constants.
  // -------------------------------------------------------------------------
  describe('chain data', () => {
    test('mainnet defaults are the built-in values, stated explicitly on the manifest', () => {
      const m = manifestFor(1)
      expect(m.chain).toEqual({ blockTimeSeconds: 12, reorgOverlapBlocks: 32n })
      expect(blockTimeSecondsOf(m)).toBe(12)
      expect(reorgOverlapBlocksOf(m)).toBe(32n)
    })

    test('a manifest with no chain bundle at all falls back to the mainnet defaults', () => {
      const bare: ChainManifest = { chainId: 1, wrappedNative: MAINNET_MANIFEST.wrappedNative, execution: manifestFor(1).execution }
      expect(blockTimeSecondsOf(bare)).toBe(12)
      expect(reorgOverlapBlocksOf(bare)).toBe(32n)
      expect(wave0PairScanBlocks(bare)).toBe(50_400n)
    })

    test('the chain bundle is replaced WHOLESALE, like every other bundle', () => {
      // Overriding only blockTimeSeconds does NOT keep mainnet's reorgOverlapBlocks alongside it —
      // the whole bundle is swapped, and the omitted field falls back to the code default (which
      // here happens to equal mainnet's). That is the manifest's atomicity rule, not an accident.
      const m = manifestFor(1, { chain: { blockTimeSeconds: 2 } })
      expect(m.chain).toEqual({ blockTimeSeconds: 2 })
      expect(m.chain?.reorgOverlapBlocks).toBeUndefined()
      expect(reorgOverlapBlocksOf(m)).toBe(32n) // the code default, not a merge of mainnet's bundle
      // ...and the other bundles are untouched by a `chain` override.
      expect(m.v3).toEqual(manifestFor(1).v3)
    })

    test('an explicit `chain: undefined` removes the bundle outright', () => {
      const m = manifestFor(1, { chain: undefined })
      expect(m.chain).toBeUndefined()
      expect(blockTimeSecondsOf(m)).toBe(12)
    })

    test('the chain bundle survives onto an unknown-chain manifest built purely from overrides', () => {
      // 999999 (not 8453 — that's Base, a built-in manifest as of C4-P2) is genuinely unknown, so
      // this exercises the from-scratch branch of `manifestFor`. `wrappedNative` is left to default
      // from `execution.wrappedNative` (see `manifestFor`'s fallback) so the two stay consistent.
      const m = manifestFor(999999, {
        execution: manifestFor(1).execution,
        chain: { blockTimeSeconds: 2, reorgOverlapBlocks: 600n },
      })
      expect(m.chain).toEqual({ blockTimeSeconds: 2, reorgOverlapBlocks: 600n })
      expect(reorgOverlapBlocksOf(m)).toBe(600n)
    })

    describe('wave-0 window derivation: one week of THIS chain\'s blocks', () => {
      // The whole point of C4-P1. The policy (`WAVE0_RECENT_WINDOW_SECONDS` = 7 days) is fixed; the
      // block count is not. The old hardcoded 50_000n was a mainnet number that silently became 28
      // hours on Base and 3.5 hours on Arbitrum — i.e. shorter than the launch it exists to catch.
      const cases: [label: string, blockTimeSeconds: number, blocks: bigint][] = [
        ['mainnet 12s', 12, 50_400n], // 604800/12 — the old 50_000n constant, to within 1%
        ['Base/Optimism 2s', 2, 302_400n],
        ['Arbitrum ~0.25s', 0.25, 2_419_200n],
      ]
      for (const [label, blockTimeSeconds, blocks] of cases) {
        test(`${label} -> ${blocks} blocks`, () => {
          expect(wave0PairScanBlocks(manifestFor(1, { chain: { blockTimeSeconds } }))).toBe(blocks)
        })
      }

      test('rounds UP — a short window is the failure that matters, so never a block too few', () => {
        // 604800 / 7 = 86400 exactly; 604800 / 11 = 54981.8... -> 54982.
        expect(wave0PairScanBlocks(manifestFor(1, { chain: { blockTimeSeconds: 7 } }))).toBe(86_400n)
        expect(wave0PairScanBlocks(manifestFor(1, { chain: { blockTimeSeconds: 11 } }))).toBe(54_982n)
      })
    })

    describe('validation', () => {
      test('a non-positive or non-finite blockTimeSeconds is rejected at manifestFor', () => {
        for (const blockTimeSeconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
          expect(() => manifestFor(1, { chain: { blockTimeSeconds } })).toThrow(RouterConfigError)
        }
      })

      test('an implausibly large blockTimeSeconds is rejected as a unit confusion', () => {
        // The tripwire case: mainnet's 12s written in MILLISECONDS. Nothing throws downstream — it
        // just silently shrinks wave 0's window from 50,400 blocks to 51, and the fast path stops
        // finding anything for a reason no report names.
        expect(() => manifestFor(1, { chain: { blockTimeSeconds: 12_000 } })).toThrow(RouterConfigError)
        expect(() => manifestFor(1, { chain: { blockTimeSeconds: 12_000 } })).toThrow(/milliseconds/)
        expect(() => manifestFor(1, { chain: { blockTimeSeconds: 3601 } })).toThrow(RouterConfigError)
      })

      test('the ceiling itself is legal — the bound rejects only what is past it', () => {
        expect(blockTimeSecondsOf(manifestFor(1, { chain: { blockTimeSeconds: 3600 } }))).toBe(3600)
      })

      test('the ceiling is a backstop, not a proof: a sub-3600 millisecond value still passes', () => {
        // Documented limitation, asserted so nobody later mistakes the ceiling for full protection —
        // `2000` for a 2s chain is indistinguishable from a legitimately slow chain.
        expect(blockTimeSecondsOf(manifestFor(1, { chain: { blockTimeSeconds: 2000 } }))).toBe(2000)
      })

      test('a negative reorgOverlapBlocks is rejected at manifestFor', () => {
        expect(() => manifestFor(1, { chain: { reorgOverlapBlocks: -1n } })).toThrow(RouterConfigError)
      })

      test('a zero reorgOverlapBlocks is legal — "this chain never rewinds" is a real answer', () => {
        expect(reorgOverlapBlocksOf(manifestFor(1, { chain: { reorgOverlapBlocks: 0n } }))).toBe(0n)
      })

      test('assertChainData accepts a manifest with no chain bundle', () => {
        expect(() =>
          assertChainData({ chainId: 1, wrappedNative: MAINNET_MANIFEST.wrappedNative, execution: manifestFor(1).execution }),
        ).not.toThrow()
      })
    })
  })

  describe('execution codeHash verification', () => {
    const deployedCode = '0x600160010160005260206000f3' as const
    const correctHash = keccak256(deployedCode)

    test('matching codeHash passes', async () => {
      const manifest = manifestFor(1, { execution: { ...manifestFor(1).execution!, codeHash: correctHash } })
      const client = { getChainId: async () => 1, request: async () => deployedCode }
      await expect(validateManifest(client as any, manifest)).resolves.toBeUndefined()
    })

    test('mismatched codeHash throws RouterConfigError', async () => {
      const wrongHash = (correctHash.slice(0, -1) + (correctHash.endsWith('0') ? '1' : '0')) as `0x${string}`
      const manifest = manifestFor(1, { execution: { ...manifestFor(1).execution!, codeHash: wrongHash } })
      const client = { getChainId: async () => 1, request: async () => deployedCode }
      await expect(validateManifest(client as any, manifest)).rejects.toThrow(RouterConfigError)
    })

    test('empty code at execution address throws RouterConfigError', async () => {
      const manifest = manifestFor(1, { execution: { ...manifestFor(1).execution!, codeHash: correctHash } })
      const client = { getChainId: async () => 1, request: async () => '0x' }
      await expect(validateManifest(client as any, manifest)).rejects.toThrow(RouterConfigError)
    })

    test('absent codeHash skips the eth_getCode fetch entirely', async () => {
      const manifest = manifestFor(1) // no codeHash set
      let requestCalls = 0
      const client = {
        getChainId: async () => 1,
        request: async () => {
          requestCalls++
          return deployedCode
        },
      }
      await expect(validateManifest(client as any, manifest)).resolves.toBeUndefined()
      expect(requestCalls).toBe(0)
    })
  })
})
