import { describe, expect, test } from 'bun:test'
import { keccak256 } from 'viem'

import { RouterConfigError } from './errors'
import {
  ARBITRUM_MANIFEST,
  assertChainData,
  assertManifestNumerics,
  assertWrappedNativeConsistency,
  BASE_MANIFEST,
  blockTimeSecondsOf,
  MAINNET_MANIFEST,
  manifestFor,
  reorgOverlapBlocksOf,
  requireExecution,
  ROBINHOOD_MANIFEST,
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
    expect(() => manifestFor(999999)).toThrow(/Built-in manifests exist for: 1, 130, 4663, 8453, 42161/)
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

  // -------------------------------------------------------------------------
  // C4-T5: Robinhood Chain (4663) — the first BUILT-IN quote-only manifest.
  //
  // Deliberately NOT folded into the `cases` table above: every assertion in
  // that loop demands an `execution` bundle with `commandSet: 'ur-2.0'`, and the
  // whole point of this manifest is that this chain has no Universal Router this
  // package can encode for (only UR 2.1.1 — see `manifest.ts`'s docstring). So
  // these tests pin the OPPOSITE shape, and the absence of `execution` is the
  // assertion rather than an omission nobody checked.
  // -------------------------------------------------------------------------
  describe('Robinhood Chain manifest (C4-T5)', () => {
    test('manifestFor(4663) returns the built-in manifest', () => {
      const m = manifestFor(4663)
      expect(m).toEqual(ROBINHOOD_MANIFEST)
      expect(m.chainId).toBe(4663)
    })

    test('all three protocol bundles are present, each with a verified factory and deployment block', () => {
      const m = manifestFor(4663)
      // v2 IS deployed on this chain (1,689 live `PairCreated` logs) — the quote-only-ness of this
      // manifest is about execution, not about a missing protocol.
      expect(m.v2?.factory).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(m.v2?.deploymentBlock).toBe(8_928n)
      expect(m.v3?.factory).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(m.v3?.deploymentBlock).toBe(8_930n)
      expect(m.v3?.v3QuoterV2).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(m.v4?.poolManager).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(m.v4?.deploymentBlock).toBe(9_070n)
      expect(m.v4?.quoter).toMatch(/^0x[0-9a-fA-F]{40}$/)
    })

    test('carries NO execution bundle, so requireExecution throws rather than returning a wrong router', () => {
      const m = manifestFor(4663)
      expect(m.execution).toBeUndefined()
      expect(() => requireExecution(m)).toThrow(RouterConfigError)
      expect(() => requireExecution(m)).toThrow(/no execution bundle/)
    })

    test('assertWrappedNativeConsistency passes with only the hoisted wrappedNative to check', () => {
      // Nothing for it to disagree with (C4-P3): the top-level field is the sole statement here.
      expect(() => assertWrappedNativeConsistency(ROBINHOOD_MANIFEST)).not.toThrow()
      expect(ROBINHOOD_MANIFEST.wrappedNative).toMatch(/^0x[0-9a-fA-F]{40}$/)
    })

    test('coreIntermediates are WETH + USDG, the two currencies the live pool census ranks highest', () => {
      const m = manifestFor(4663)
      expect(m.coreIntermediates).toHaveLength(2)
      expect(m.coreIntermediates).toContain(m.wrappedNative)
      // USDG, not USDC — no USDC deployment exists on this chain (see manifest.ts).
      expect(m.coreIntermediates).toContain('0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168')
    })

    test("wave0PairScanBlocks derives 6,048,000 from this chain's own 0.1s block time", () => {
      // ceil(604800 / 0.1) — by far the largest wave-0 window of any built-in manifest, and the
      // honest cost of a 0.1s chain. `assertChainData` accepts 0.1 as a finite positive number well
      // under the milliseconds tripwire.
      expect(blockTimeSecondsOf(manifestFor(4663))).toBe(0.1)
      expect(wave0PairScanBlocks(manifestFor(4663))).toBe(6_048_000n)
      expect(reorgOverlapBlocksOf(manifestFor(4663))).toBe(3000n)
      expect(() => assertChainData(manifestFor(4663))).not.toThrow()
    })

    test('an execution bundle can still be supplied by a caller who has one, via overrides', () => {
      // The manifest omits `execution` because THIS package has no 2.1.1 encoder — not because the
      // chain forbids one. A caller who brings their own stays able to swap.
      const m = manifestFor(4663, {
        execution: {
          address: '0x8876789976dEcBfCbBbe364623C63652db8C0904',
          commandSet: 'ur-2.0',
          permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
          wrappedNative: ROBINHOOD_MANIFEST.wrappedNative,
        },
      })
      expect(requireExecution(m).address).toBe('0x8876789976dEcBfCbBbe364623C63652db8C0904')
    })
  })
  test('validateManifest rejects chainId mismatch', async () => {
    const client = { getChainId: async () => 8453 }
    await expect(validateManifest(client as any, manifestFor(1))).rejects.toThrow(RouterConfigError)
  })

  test('validateManifest dispatches eth_getCode alongside getChainId, in ONE round trip', async () => {
    // The two reads are independent and this runs on the critical path of the first search, so they
    // must be in flight together — not `eth_getCode` awaiting the chainId's round trip. Both stubs
    // hang until `open()`, so "getCode was already dispatched while getChainId was still pending" is
    // observable rather than inferred from a timing.
    let open!: () => void
    const gate = new Promise<void>((resolve) => {
      open = resolve
    })
    let getCodeDispatched = false
    const client = {
      getChainId: async () => {
        await gate
        return 1
      },
      request: async () => {
        getCodeDispatched = true
        await gate
        return '0x00'
      },
    }
    const done = validateManifest(client as any, manifestFor(1))
    await Promise.resolve() // let the deferred dispatch run
    expect(getCodeDispatched).toBe(true)
    open()
    // '0x00' embeds none of the manifest's immutables, so this still fails the cross-check — what is
    // being pinned here is WHEN the call went out, not what it returned.
    await expect(done).rejects.toThrow(RouterConfigError)
  })

  test('a chainId mismatch still reports the chainId, never the concurrently-dispatched read', async () => {
    // The wasted `eth_getCode` this parallelism spends on a misconfigured caller must not become the
    // error they see: its rejection is handled, and the chainId check is what throws.
    const client = {
      getChainId: async () => 8453,
      request: async () => {
        throw new Error('eth_getCode blew up')
      },
    }
    await expect(validateManifest(client as any, manifestFor(1))).rejects.toThrow(/does not match client chainId/)
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

    // -----------------------------------------------------------------------
    // Non-address manifest fields get the same shape check the addresses do.
    //
    // Every case below is a manifest assembled from JSON, a paste, or an env
    // var — the only way any of them arises — and every one of them is silent
    // otherwise: a `number` deploymentBlock throws "Cannot mix BigInt and
    // other types" from inside a log scan, a bad init-code hash derives pool
    // addresses nothing lives at and reports a confident `no-route`.
    // -----------------------------------------------------------------------
    describe('numeric and hash validation', () => {
      const V2 = MAINNET_MANIFEST.v2!
      const V3 = MAINNET_MANIFEST.v3!
      const V4 = MAINNET_MANIFEST.v4!

      test('a deploymentBlock that survived a JSON round trip as a number is rejected, per protocol', () => {
        // `JSON.parse` has no bigint. This is what every config-file manifest actually hands over.
        const asNumber = 10_000_835 as unknown as bigint
        expect(() => manifestFor(1, { v2: { ...V2, deploymentBlock: asNumber } })).toThrow(RouterConfigError)
        expect(() => manifestFor(1, { v2: { ...V2, deploymentBlock: asNumber } })).toThrow(/v2\.deploymentBlock must be a bigint/)
        expect(() => manifestFor(1, { v3: { ...V3, deploymentBlock: asNumber } })).toThrow(/v3\.deploymentBlock must be a bigint/)
        expect(() => manifestFor(1, { v4: { ...V4, deploymentBlock: asNumber } })).toThrow(/v4\.deploymentBlock must be a bigint/)
      })

      test('a deploymentBlock left as a decimal STRING is rejected too', () => {
        const asString = '10000835' as unknown as bigint
        expect(() => manifestFor(1, { v2: { ...V2, deploymentBlock: asString } })).toThrow(/v2\.deploymentBlock must be a bigint/)
      })

      test('a negative deploymentBlock is rejected — it re-opens the scan floor below genesis', () => {
        expect(() => manifestFor(1, { v3: { ...V3, deploymentBlock: -1n } })).toThrow(RouterConfigError)
        expect(() => manifestFor(1, { v3: { ...V3, deploymentBlock: -1n } })).toThrow(/v3\.deploymentBlock must be non-negative/)
      })

      test('deploymentBlock 0n is legal — it is a VERIFIED fact on chains deployed in the genesis block', () => {
        // Unichain's whole v2/v3/v4 bundle states `0n` (see the manifest's own note), so a check that
        // treated zero as a placeholder would reject a shipping manifest.
        expect(() => manifestFor(1, { v2: { ...V2, deploymentBlock: 0n } })).not.toThrow()
        expect(() => assertChainData(manifestFor(130))).not.toThrow()
      })

      test('a malformed init-code hash is rejected on every field that carries one', () => {
        const short = '0xdeadbeef' as `0x${string}`
        const unprefixed = 'a'.repeat(64) as unknown as `0x${string}`
        expect(() => manifestFor(1, { v2: { ...V2, initCodeHash: short } })).toThrow(RouterConfigError)
        expect(() => manifestFor(1, { v2: { ...V2, initCodeHash: short } })).toThrow(/v2\.initCodeHash is not a 32-byte hash/)
        expect(() => manifestFor(1, { v3: { ...V3, poolInitCodeHash: unprefixed } })).toThrow(
          /v3\.poolInitCodeHash is not a 32-byte hash/,
        )
        expect(() =>
          manifestFor(1, { execution: { ...manifestFor(1).execution!, codeHash: `0x${'g'.repeat(64)}` as `0x${string}` } }),
        ).toThrow(/execution\.codeHash is not a 32-byte hash/)
      })

      test('an ABSENT init-code hash is fine — it is what selects the canonical default', () => {
        const { initCodeHash: _drop, ...v2WithoutHash } = V2
        expect(() => manifestFor(1, { v2: v2WithoutHash })).not.toThrow()
      })

      test('every built-in manifest passes its own numeric check', () => {
        for (const chainId of [1, 8453, 130, 42161, 4663]) {
          expect(() => assertManifestNumerics(manifestFor(chainId))).not.toThrow()
        }
      })
    })
  })

  describe('execution codeHash verification', () => {
    // Real "bytecode" is not needed to exercise the hash check — but the immutable cross-check
    // (below) now runs unconditionally too, so this fixture embeds mainnet's own immutables
    // (wrappedNative, permit2, v2 factory, v3 factory, v4 poolManager) padded with filler, exactly
    // like a real Universal Router's deployed code would. Without that, every test in this block
    // would fail the immutable check before ever reaching the codeHash comparison it means to test.
    const hex = (addr: string) => addr.toLowerCase().slice(2)
    const mainnet = manifestFor(1)
    const deployedCode = `0xfe${hex(mainnet.execution!.wrappedNative)}${hex(mainnet.execution!.permit2)}${hex(
      mainnet.v2!.factory,
    )}${hex(mainnet.v3!.factory)}${hex(mainnet.v4!.poolManager)}fe` as const
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

    test('absent codeHash still fetches the code once — the immutable cross-check runs regardless', async () => {
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
      expect(requestCalls).toBe(1) // one eth_getCode call, spent on the immutable check
    })
  })

  // -------------------------------------------------------------------------
  // C4-T5f: the immutable cross-check — what catches a foreign-configured router that `codeHash`
  // provably cannot (see UniversalRouterDeployment.codeHash's doc and manifest.ts's
  // `assertImmutablesEmbedded`). Mirrors the real Robinhood Chain bug: mainnet's and Base's actual
  // Universal Router bytecode is deployed, byte-identical, at Robinhood Chain's usual UR address,
  // but wired to the wrong chain's factories — so `codeHash` alone is blind to it (the code IS the
  // genuine Universal Router code). These stubs hand-build code hex containing (or omitting) the
  // manifest's own immutables, rather than real UR bytecode, since that is exactly the surface this
  // check reads and it keeps the fixture legible.
  // -------------------------------------------------------------------------
  describe('immutable cross-check (foreign-configured router detection)', () => {
    const hex = (addr: string) => addr.toLowerCase().slice(2)

    /** Builds fake "deployed code" embedding every immutable of `m.execution`/`m.v2`/`m.v3`/`m.v4`
     * except `omit`, which is left out — simulating a router genuinely deployed, but configured for
     * a different chain's version of exactly that one contract. */
    function buildCode(m: ChainManifest, omit?: 'wrappedNative' | 'permit2' | 'v2' | 'v3' | 'v4'): `0x${string}` {
      const execution = m.execution!
      const parts: string[] = ['fe'.repeat(4)] // filler, so a real router's surrounding code is plausible
      if (omit !== 'wrappedNative') parts.push(hex(execution.wrappedNative))
      if (omit !== 'permit2') parts.push(hex(execution.permit2))
      if (m.v2 && omit !== 'v2') parts.push(hex(m.v2.factory))
      if (m.v3 && omit !== 'v3') parts.push(hex(m.v3.factory))
      if (m.v4 && omit !== 'v4') parts.push(hex(m.v4.poolManager))
      parts.push('fe'.repeat(4))
      return `0x${parts.join('')}` as `0x${string}`
    }

    test('code missing the manifest\'s v3 factory throws, naming the offending immutable', async () => {
      const manifest = manifestFor(1)
      const code = buildCode(manifest, 'v3')
      const client = { getChainId: async () => 1, request: async () => code }
      await expect(validateManifest(client as any, manifest)).rejects.toThrow(RouterConfigError)
      await expect(validateManifest(client as any, manifest)).rejects.toThrow(/v3\.factory/)
      await expect(validateManifest(client as any, manifest)).rejects.toThrow(/different chain/)
    })

    test('code embedding every immutable passes, with no codeHash supplied at all', async () => {
      const manifest = manifestFor(1)
      const code = buildCode(manifest)
      const client = { getChainId: async () => 1, request: async () => code }
      await expect(validateManifest(client as any, manifest)).resolves.toBeUndefined()
    })

    test('the Robinhood scenario reproduced: a foreign chain\'s genuine router code at the right address, wrong factories', async () => {
      // Robinhood Chain's manifest, with a caller-supplied execution bundle pointing at MAINNET's
      // real Universal Router address — but the code the client returns is mainnet's OWN deployed
      // code (i.e. it embeds mainnet's factories, not Robinhood's). Exactly the shape that made
      // `eth_getCode`/`codeHash` alone insufficient during the real bring-up.
      const manifest = manifestFor(4663, {
        execution: {
          address: '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af', // mainnet's UR address
          commandSet: 'ur-2.0',
          permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
          wrappedNative: ROBINHOOD_MANIFEST.wrappedNative, // must agree with the top-level field
        },
      })
      const mainnetLikeCode = buildCode(manifestFor(1)) // embeds MAINNET's immutables, not Robinhood's
      const client = { getChainId: async () => 4663, request: async () => mainnetLikeCode }
      await expect(validateManifest(client as any, manifest)).rejects.toThrow(RouterConfigError)
      await expect(validateManifest(client as any, manifest)).rejects.toThrow(/different chain/)
    })

    test('quote-only manifests (no execution) are unaffected — no eth_getCode call at all', async () => {
      let requestCalls = 0
      const client = {
        getChainId: async () => 4663,
        request: async () => {
          requestCalls++
          return '0x'
        },
      }
      const manifest = manifestFor(4663) // ROBINHOOD_MANIFEST — quote-only, no execution bundle
      await expect(validateManifest(client as any, manifest)).resolves.toBeUndefined()
      expect(requestCalls).toBe(0)
    })
  })
})
