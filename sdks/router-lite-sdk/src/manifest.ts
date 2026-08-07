import type { Address, Hex, PublicClient } from 'viem'
import { keccak256 } from 'viem'

import {
  DEFAULT_BLOCK_TIME_SECONDS,
  DEFAULT_REORG_OVERLAP_BLOCKS,
  WAVE0_RECENT_WINDOW_SECONDS,
} from './constants'
import { RouterConfigError } from './errors'
import type { ChainManifest, UniversalRouterDeployment } from './types'

// ---------------------------------------------------------------------------
// Chain manifest — atomic per-protocol deployment bundles.
//
// Overrides always replace a bundle wholesale (never merge individual
// fields) — that's what prevents configs where pool discovery runs against
// factory A while the Universal Router executes against factory B. A
// protocol without a bundle is simply absent from the manifest; callers
// downstream treat that as "disabled", never as a zero-address footgun.
//
// THE MANIFEST ALSO CARRIES CHAIN PHYSICS (C4-P1), not only deployments: the
// `chain` bundle's block time and reorg depth are facts a portable search has
// to be told, and the accessors at the bottom of this file are the only place
// the mainnet defaults for them are read. See `constants.ts`'s chain-shaped
// defaults section for why they cannot live as code constants.
// ---------------------------------------------------------------------------

/**
 * Mainnet defaults. Cross-checked against `sdk-core`'s `CHAIN_TO_ADDRESSES_MAP[1]`
 * and Uniswap deployment docs — notably `v3.v3QuoterV2` is the QuoterV2 deployment,
 * NOT sdk-core's `quoterAddress` (which is QuoterV1 on mainnet; never use it here).
 *
 * `v4.quoter` below (and the other three built-in manifests') is an INLINED LITERAL (C4-P4), not a
 * runtime lookup: it used to be `CHAIN_TO_ADDRESSES_MAP[chainId].v4QuoterAddress`, which pulled the
 * entire `@uniswap/sdk-core` package — and, transitively, ethers — into the runtime dependency graph
 * of a package that is otherwise viem-only, for four constant addresses. Each literal is checksummed
 * via `viem`'s `getAddress` and was captured from that exact `sdk-core` field at the time of this
 * change; `manifest.parity.test.ts` (a devDependency-only import) asserts the four literals still
 * equal `CHAIN_TO_ADDRESSES_MAP[chainId].v4QuoterAddress` so any future drift between the two is
 * caught in CI rather than silently shipped.
 */
export const MAINNET_MANIFEST: ChainManifest = {
  chainId: 1,
  // Hoisted (C4-P3): the same address as `execution.wrappedNative` below, stated once at the top
  // level so quoting never has to reach into the execution bundle for it. `assertWrappedNativeConsistency`
  // (called from `manifestFor`/`createRouter`) is what keeps the two from silently drifting apart.
  wrappedNative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  // Stated explicitly rather than left to the defaults, because these ARE the defaults: mainnet is
  // where the two numbers in `constants.ts` come from, and writing them here keeps the built-in
  // manifest a complete worked example of the bundle every other chain has to fill in.
  chain: { blockTimeSeconds: 12, reorgOverlapBlocks: 32n },
  v2: {
    factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    deploymentBlock: 10_000_835n,
  },
  v3: {
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    deploymentBlock: 12_369_621n,
    v3QuoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  },
  v4: {
    poolManager: '0x000000000004444c5dc75cB358380D2e3dE08A90',
    deploymentBlock: 21_688_329n,
    quoter: '0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203', // inlined from sdk-core (C4-P4) — see the block comment above
  },
  execution: {
    address: '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af',
    commandSet: 'ur-2.0',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    wrappedNative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  coreIntermediates: [
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
    '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
  ],
}

// ---------------------------------------------------------------------------
// C4-P2: Base, Unichain, Arbitrum built-in manifests.
//
// Verified against public RPCs (see the per-manifest block below) rather than reused from
// `sdk-core`'s `CHAIN_TO_ADDRESSES_MAP` blindly — `sdk-core`'s `quoterAddress` field is NOT always
// QuoterV2 (see the mainnet note above): on Unichain and Arbitrum it is an older QuoterV1-shaped
// deployment with different bytecode size, so `v3QuoterV2` below is independently verified by
// bytecode length against the canonical QuoterV2 (8,273 bytes / 16,546 hex chars, identical to
// mainnet's `0x61fFE014bA17989E743c5F6cB21bF9697530B21e`), not copied from `quoterAddress`.
//
// Universal Router 2.0 addresses and their `creationBlock`s are cross-referenced from
// `universal-router-sdk/src/utils/constants.ts` (`UNIVERSAL_ROUTER_ADDRESS`) as an independent
// corroboration for the v4 `deploymentBlock`s below — not imported at runtime (this package hardcodes
// literals the same way `MAINNET_MANIFEST` does; `universal-router-sdk` is a devDependency only, and
// staying that way is C4-P4).
// ---------------------------------------------------------------------------

/**
 * Base (`chainId: 8453`).
 *
 * VERIFIED against `https://mainnet.base.org` on 2026-08-04 (head at verification: block 49,545,607):
 *  - `eth_getCode` at `latest`: v2 factory, v3 factory, v3QuoterV2, v4 poolManager, v4 quoter,
 *    Universal Router, Permit2, WETH, USDC — all non-empty.
 *  - `eth_call` `symbol()`/`decimals()`: USDC -> "USDC"/6, WETH -> "WETH"/18.
 *  - `deploymentBlock`s found by binary search over `eth_getCode` (present vs absent), Base's public
 *    RPC serves full archive state: v3 factory 1,371,680; v4 poolManager 25,350,988; v2 factory
 *    6,601,915. Cross-check: `universal-router-sdk`'s Base UR 2.0 `creationBlock` is 25,350,999 — 11
 *    blocks after the poolManager binary search result, consistent with "deploy poolManager, then
 *    Universal Router" in one launch sequence.
 *  - `v3QuoterV2` bytecode length 8,273 bytes (16,546 hex chars), matching canonical QuoterV2 exactly (and matching
 *    `sdk-core`'s Base `quoterAddress`, which — unlike Unichain/Arbitrum — already IS QuoterV2 here).
 */
export const BASE_MANIFEST: ChainManifest = {
  chainId: 8453,
  // Hoisted (C4-P3) — see MAINNET_MANIFEST's comment; same address as `execution.wrappedNative` below.
  wrappedNative: '0x4200000000000000000000000000000000000006',
  chain: { blockTimeSeconds: 2, reorgOverlapBlocks: 150n },
  v2: {
    factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    deploymentBlock: 6_601_915n,
  },
  v3: {
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    deploymentBlock: 1_371_680n,
    v3QuoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
  },
  v4: {
    poolManager: '0x498581fF718922c3f8e6A244956aF099B2652b2b',
    deploymentBlock: 25_350_988n,
    quoter: '0x0d5e0F971ED27FBfF6c2837bf31316121532048D', // inlined from sdk-core (C4-P4) — see MAINNET_MANIFEST's comment
  },
  execution: {
    address: '0x6fF5693b99212Da76ad316178A184AB56D299b43',
    commandSet: 'ur-2.0',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    wrappedNative: '0x4200000000000000000000000000000000000006',
  },
  coreIntermediates: [
    '0x4200000000000000000000000000000000000006', // WETH
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC (native)
  ],
}

/**
 * Unichain (`chainId: 130`).
 *
 * VERIFIED against `https://mainnet.unichain.org` on 2026-08-04 (head at verification: block
 * 55,132,197):
 *  - `eth_getCode` at `latest`: all addresses below non-empty.
 *  - `eth_call` `symbol()`/`decimals()`: USDC -> "USDC"/6, WETH -> "WETH"/18.
 *  - `deploymentBlock: 0n` for v2/v3/v4 is a VERIFIED fact, not a placeholder: `eth_getCode` for the
 *    v2 factory, v3 factory, and v4 poolManager all return non-empty code at block 0 itself. Unichain
 *    ships these Uniswap core deployments as genesis-allocated predeploys (`eth_getBlockByNumber(0)`
 *    timestamp `0x67291fc7` = 2024-11-04, Unichain mainnet's genesis) rather than ordinary
 *    later-block deployments — confirmed by contrast with the Universal Router, which is NOT a
 *    predeploy and has an ordinary `creationBlock` of 6,819,690 per `universal-router-sdk`.
 *  - `v3QuoterV2` at `0x385A5cf5F83e99f7BB2852b6A19C3538b9FA7658` is bytecode-length-verified
 *    (8,273 bytes / 16,546 hex chars) as the true QuoterV2. `sdk-core`'s Unichain `quoterAddress`
 *    (`0x565ac8c7863d9bb16d07e809ff49fe5cd467634c`) is a DIFFERENT, larger contract (10,541 bytes /
 *    21,082 hex chars) — almost certainly QuoterV1-shaped — and must never be used here.
 */
export const UNICHAIN_MANIFEST: ChainManifest = {
  chainId: 130,
  // Hoisted (C4-P3) — see MAINNET_MANIFEST's comment; same address as `execution.wrappedNative` below.
  wrappedNative: '0x4200000000000000000000000000000000000006',
  chain: { blockTimeSeconds: 1, reorgOverlapBlocks: 300n },
  v2: {
    factory: '0x1F98400000000000000000000000000000000002',
    deploymentBlock: 0n,
  },
  v3: {
    factory: '0x1F98400000000000000000000000000000000003',
    deploymentBlock: 0n,
    v3QuoterV2: '0x385A5cf5F83e99f7BB2852b6A19C3538b9FA7658',
  },
  v4: {
    poolManager: '0x1F98400000000000000000000000000000000004',
    deploymentBlock: 0n,
    quoter: '0x333E3C607B141b18fF6de9f258db6e77fE7491E0', // inlined from sdk-core (C4-P4) — see MAINNET_MANIFEST's comment
  },
  execution: {
    address: '0xEf740bf23aCaE26f6492B10de645D6B98dC8Eaf3',
    commandSet: 'ur-2.0',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    wrappedNative: '0x4200000000000000000000000000000000000006',
  },
  coreIntermediates: [
    '0x4200000000000000000000000000000000000006', // WETH
    '0x078D782b760474a361dDA0AF3839290b0EF57AD6', // USDC (native)
  ],
}

/**
 * Arbitrum One (`chainId: 42161`).
 *
 * VERIFIED against `https://arb1.arbitrum.io/rpc` on 2026-08-04 (head at verification: block
 * 491,150,707):
 *  - `eth_getCode` at `latest`: all addresses below non-empty.
 *  - `eth_call` `symbol()`/`decimals()`: USDC -> "USDC"/6, WETH -> "WETH"/18.
 *  - `v3QuoterV2` at `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` — the SAME address as mainnet's,
 *    bytecode-length-verified (8,273 bytes / 16,546 hex chars, identical across Base/Unichain/Arbitrum/mainnet).
 *    `sdk-core`'s Arbitrum `quoterAddress` (`0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6`, 4,631 bytes /
 *    9,262 hex chars) is a different, older deployment and must never be used here.
 *
 *  UNVERIFIED / CONSERVATIVE — v2 `deploymentBlock`. This public RPC does not serve archive state:
 *  `eth_getCode` at any block below the recent tip fails with "missing trie node" / "state ... is
 *  not available" (confirmed as far back as block 22,207,817, near the Arbitrum Nitro migration),
 *  so the intended eth_getCode binary search is not possible here. `eth_getLogs` for the v2 factory's
 *  first-ever log (necessarily its first `PairCreated`, the only event a v2 factory emits) lands at
 *  block 150,778,518 (2023-11-15) — but that call's receipt has `to` equal to the factory's OWN
 *  address, i.e. this is an ordinary call to an already-deployed contract, NOT the deployment
 *  transaction, so it is only an upper bound and the true deployment could be anywhere before it
 *  (the v3 factory was already live on this chain at block 165 in June 2021, and v2 on L2s
 *  frequently sees its first pair created long after deployment). `deploymentBlock` is therefore set
 *  conservatively to the v3 factory's own VERIFIED deployment block (165) rather than guessed — safe
 *  because an early bound only costs extra (bounded, incrementally-covered) scan work, never a missed
 *  pool. Flagged as a concern for follow-up if a tighter bound is ever needed (an archive-capable
 *  Arbitrum endpoint would let this be binary-searched properly).
 *
 *  VERIFIED (high confidence, not eth_getCode-binary-search) — v4 `deploymentBlock`. Same archive
 *  limitation applies, so this is derived from `eth_getLogs` instead: the poolManager's first-ever
 *  log is at block 297,842,872, and — unlike the v2 factory case above — that log's transaction has
 *  `to` equal to `0x4e59b44847b379578588920ca78fbf26c0b4956c` (the well-known CREATE2 singleton
 *  deployer), with no `contractAddress` in the receipt (expected for a proxied CREATE2, since the
 *  top-level receipt only reports one for a direct contract-creation transaction) — the fingerprint
 *  of the deployment transaction itself, whose constructor emitted this log in the same call. Cross-
 *  check: `universal-router-sdk`'s Arbitrum UR 2.0 `creationBlock` is 297,842,906, only 34 blocks
 *  later — consistent with "deploy poolManager, then Universal Router" moments apart.
 */
export const ARBITRUM_MANIFEST: ChainManifest = {
  chainId: 42161,
  // Hoisted (C4-P3) — see MAINNET_MANIFEST's comment; same address as `execution.wrappedNative` below.
  wrappedNative: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  chain: { blockTimeSeconds: 0.25, reorgOverlapBlocks: 1200n },
  v2: {
    factory: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
    deploymentBlock: 165n, // UNVERIFIED/conservative — see block comment above
  },
  v3: {
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    deploymentBlock: 165n,
    v3QuoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  },
  v4: {
    poolManager: '0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32',
    deploymentBlock: 297_842_872n,
    quoter: '0x3972C00f7ed4885e145823eb7C655375d275A1C5', // inlined from sdk-core (C4-P4) — see MAINNET_MANIFEST's comment
  },
  execution: {
    address: '0xA51afAFe0263b40EdaEf0Df8781eA9aa03E381a3',
    commandSet: 'ur-2.0',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    wrappedNative: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
  coreIntermediates: [
    '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC (native)
  ],
}

const KNOWN_MANIFESTS: Record<number, ChainManifest> = {
  1: MAINNET_MANIFEST,
  8453: BASE_MANIFEST,
  130: UNICHAIN_MANIFEST,
  42161: ARBITRUM_MANIFEST,
}

const BUNDLE_KEYS = ['chain', 'v2', 'v3', 'v4', 'execution', 'coreIntermediates'] as const

/**
 * Cross-checks the two places a wrapped-native address can live on a manifest — the required
 * top-level `wrappedNative` (C4-P3) and the optional `execution.wrappedNative`, the Universal
 * Router deployment's own immutable — whenever BOTH are present. On every built-in manifest they
 * agree by construction; this exists for the manifests callers assemble themselves, where a typo
 * or a stale override could silently disagree. This is a STRONGER invariant than the single source
 * of truth `execution.wrappedNative` used to be alone: previously nothing could disagree with it,
 * because nothing else stated the address; now two fields can, so both are checked before either is
 * trusted downstream. A mismatch throws `RouterConfigError` synchronously, before any RPC — the
 * same posture as `assertChainData`.
 */
export function assertWrappedNativeConsistency(m: ChainManifest): void {
  if (m.execution && m.execution.wrappedNative.toLowerCase() !== m.wrappedNative.toLowerCase()) {
    throw new RouterConfigError(
      `manifest.wrappedNative (${m.wrappedNative}) does not match manifest.execution.wrappedNative (${m.execution.wrappedNative}) — both describe the same on-chain wrapped-native token and must agree; supply the same address for both, or omit one`,
    )
  }
}

/**
 * Returns `m.execution`, or throws `RouterConfigError` when the manifest carries no execution
 * bundle (C4-P3: `execution` is optional, for quote-only callers). Every swap-path seam that needs
 * a Universal Router deployment goes through this — `router.ts`'s `validateSwapRequest` (so the
 * throw happens synchronously, before any RPC), and the engine's compile/encode/readiness stages
 * that only ever run for a swap — rather than reaching into `m.execution` directly and letting
 * `exactOptionalPropertyTypes` force a `!` assertion at every call site.
 */
export function requireExecution(m: ChainManifest): UniversalRouterDeployment {
  if (!m.execution) {
    throw new RouterConfigError('manifest has no execution bundle — swaps need a Universal Router deployment')
  }
  return m.execution
}

/**
 * Returns the manifest for `chainId`, applying `overrides` as whole-bundle
 * replacement: a key present in `overrides` (even set to `undefined`) replaces
 * that entire bundle rather than merging into it — so `{ v2: undefined }`
 * removes the v2 bundle outright, leaving v3/v4/execution untouched.
 *
 * `wrappedNative` is not a bundle (it is a required scalar, like `chainId`): an override replaces
 * just that address, never removing it — a manifest with no wrapped-native token cannot quote at
 * all. `execution: undefined` DOES remove the execution bundle wholesale (C4-P3's quote-only path),
 * and does not touch `wrappedNative` — the two are independent fields, cross-checked by
 * {@link assertWrappedNativeConsistency} whenever both are present after overrides are applied.
 *
 * For an unknown chainId there is no built-in bundle to start from, so the caller must supply at
 * least `wrappedNative` via `overrides` (the one field every manifest requires); otherwise this
 * throws `RouterConfigError`. `execution` remains optional even here — a quote-only manifest for an
 * unknown chain is exactly as valid as one for a known chain.
 */
export function manifestFor(chainId: number, overrides?: Partial<ChainManifest>): ChainManifest {
  const base = KNOWN_MANIFESTS[chainId]

  if (!base) {
    // A caller who supplied `execution` but not the top-level field gets it defaulted from
    // `execution.wrappedNative` — the two must agree anyway (see `assertWrappedNativeConsistency`
    // below), so requiring both when one already implies the other would be pure friction.
    const wrappedNative = overrides?.wrappedNative ?? overrides?.execution?.wrappedNative
    if (!wrappedNative) {
      const supported = Object.keys(KNOWN_MANIFESTS)
        .map(Number)
        .sort((a, b) => a - b)
        .join(', ')
      throw new RouterConfigError(
        `no built-in manifest for chain ${chainId}; provide a complete manifest via overrides (at least "wrappedNative"). Built-in manifests exist for: ${supported}`,
      )
    }
    const manifest: ChainManifest = { chainId, wrappedNative }
    for (const key of BUNDLE_KEYS) {
      if (key in overrides!) (manifest as any)[key] = (overrides as any)[key]
    }
    assertChainData(manifest)
    assertWrappedNativeConsistency(manifest)
    return manifest
  }

  const manifest: ChainManifest = { ...base, chainId }
  if (overrides) {
    if ('wrappedNative' in overrides) manifest.wrappedNative = overrides.wrappedNative as Address
    for (const key of BUNDLE_KEYS) {
      if (key in overrides) (manifest as any)[key] = overrides[key]
    }
  }
  assertChainData(manifest)
  assertWrappedNativeConsistency(manifest)
  return manifest
}

// ---------------------------------------------------------------------------
// Chain-data accessors (C4-P1).
//
// The ONLY readers of `constants.ts`'s two mainnet defaults. Everything that
// needs a chain fact — the wave-0 scan window, the pool index's reorg overlap,
// the head watermark's plausibility bound — goes through one of these, so a
// manifest is the single place a new chain states its own answers and no
// module has to be taught about chains one at a time.
// ---------------------------------------------------------------------------

/**
 * The largest `blockTimeSeconds` this package will accept: one hour.
 *
 * Not a claim that a chain cannot be slower — it is a UNIT-CONFUSION TRIPWIRE. `blockTimeSeconds` is
 * the one field here a caller might plausibly fill in from a different unit (milliseconds, which is
 * how much chain metadata publishes block times), and the mistake is otherwise silent in the
 * safe-looking direction: `blockTimeSeconds: 12000` for mainnet yields a 51-block wave-0 window
 * instead of 50,400, which does not throw, does not degrade, and simply stops finding pools. No real
 * EVM chain produces a block less often than hourly, so anything above this is a bug in the manifest
 * rather than an unusual chain.
 *
 * IT IS A BACKSTOP, NOT A PROOF: a millisecond value below 3,600 (a 2s chain written as `2000`)
 * still passes, because no bound can separate it from a legitimately slow chain. It catches the
 * order-of-magnitude mistakes — the seconds-vs-milliseconds slip on any chain at or above ~3.6s —
 * and nothing here can catch the rest.
 */
const MAX_BLOCK_TIME_SECONDS = 3_600

/**
 * Rejects a `chain` bundle whose values cannot produce a usable window, synchronously and before any
 * RPC — the same posture as every other manifest check. Every failure here is silent otherwise: a
 * `blockTimeSeconds` of 0 makes {@link wave0PairScanBlocks} `Infinity` (and `BigInt(Infinity)` a
 * `RangeError` thrown from inside a search), an implausibly large one collapses the wave-0 window to
 * nothing while looking perfectly well-formed (see {@link MAX_BLOCK_TIME_SECONDS}), and a negative
 * `reorgOverlapBlocks` re-opens coverage *ahead* of the tip, which reads as "nothing to scan" rather
 * than as a configuration mistake.
 */
export function assertChainData(m: ChainManifest): void {
  const blockTime = m.chain?.blockTimeSeconds
  if (blockTime !== undefined && (!Number.isFinite(blockTime) || blockTime <= 0)) {
    throw new RouterConfigError(`manifest chain.blockTimeSeconds must be a finite positive number; got ${blockTime}`)
  }
  if (blockTime !== undefined && blockTime > MAX_BLOCK_TIME_SECONDS) {
    throw new RouterConfigError(
      `manifest chain.blockTimeSeconds of ${blockTime} exceeds the ${MAX_BLOCK_TIME_SECONDS}s ceiling — no EVM chain produces blocks that rarely, so this is almost certainly milliseconds: the unit is SECONDS (mainnet is \`blockTimeSeconds: 12\`, not 12000)`,
    )
  }
  const overlap = m.chain?.reorgOverlapBlocks
  if (overlap !== undefined && overlap < 0n) {
    throw new RouterConfigError(`manifest chain.reorgOverlapBlocks must be non-negative; got ${overlap}`)
  }
}

/** Seconds per block for `m`, defaulting to mainnet's 12. */
export function blockTimeSecondsOf(m: ChainManifest): number {
  return m.chain?.blockTimeSeconds ?? DEFAULT_BLOCK_TIME_SECONDS
}

/** Tip overlap re-scanned for shallow-reorg tolerance on `m`, defaulting to mainnet's 32. */
export function reorgOverlapBlocksOf(m: ChainManifest): bigint {
  return m.chain?.reorgOverlapBlocks ?? DEFAULT_REORG_OVERLAP_BLOCKS
}

/**
 * Wave 0's recent-launch scan window, in blocks: {@link WAVE0_RECENT_WINDOW_SECONDS} of wall-clock
 * converted through this chain's block time and rounded UP (a short window is the failure that
 * matters — it is what makes a just-launched pool invisible to the fast path — so the rounding error
 * is spent on scanning a block too many, never a block too few).
 *
 * Mainnet: ceil(604800 / 12) = 50,400 blocks. Base at 2s: 302,400. Arbitrum at 0.25s: 2,419,200 —
 * which is also the honest cost of the policy on a fast chain, and the reason wave 0's scan is
 * bounded by the index's coverage cache rather than re-walked from scratch each search.
 */
export function wave0PairScanBlocks(m: ChainManifest): bigint {
  return BigInt(Math.ceil(WAVE0_RECENT_WINDOW_SECONDS / blockTimeSecondsOf(m)))
}

/**
 * Cross-checks `m.chainId` against the connected client's actual chain before any RPC traffic
 * depends on the manifest — a mismatch means every downstream address in the manifest is for the
 * wrong network. Runs identically whether or not `execution` is present (C4-P3): a quote-only
 * manifest still gets this check, since a wrong chainId misdirects quoting's own addresses (the v2
 * factory, the v3/v4 quoters) just as much as it would the Universal Router. When `m.execution` IS
 * present and its `codeHash` is provided, also fetches the deployed code at `m.execution.address`
 * and verifies its keccak256 matches — catching a manifest pointed at the wrong (or an
 * un-deployed) address that the chainId check alone can't see. No `execution` bundle, or an
 * `execution` with no `codeHash`, both skip this second check entirely: no `eth_getCode` call is
 * made.
 *
 * NEITHER CALL IS GATED BY THE ROUTER'S CONCURRENCY SEMAPHORE (C4-P6, F2) — the one deliberate
 * carve-out from `internal/rpc.ts`'s "every `client.request` is gated" rule. `getChainId`(this
 * function) is deterministic per `(client, manifest)` and runs at most ONCE per router's lifetime:
 * `router.ts#ensureManifestValidated` caches the outcome (success, or a `RouterConfigError`) forever
 * after the first call, so this never contributes to a sustained concurrency peak the way a
 * per-search read would — there is nothing here for `concurrency` to usefully bound.
 */
export async function validateManifest(
  client: Pick<PublicClient, 'getChainId' | 'request'>,
  m: ChainManifest,
): Promise<void> {
  const clientChainId = await client.getChainId()
  if (clientChainId !== m.chainId) {
    throw new RouterConfigError(`manifest chainId ${m.chainId} does not match client chainId ${clientChainId}`)
  }

  if (!m.execution?.codeHash) return
  const { codeHash, address } = m.execution

  const code = (await client.request({ method: 'eth_getCode', params: [address, 'latest'] } as any)) as Hex
  if (!code || code === '0x') {
    throw new RouterConfigError(`no code found at execution address ${address}; expected codeHash ${codeHash}`)
  }
  const actualHash = keccak256(code)
  if (actualHash.toLowerCase() !== codeHash.toLowerCase()) {
    throw new RouterConfigError(
      `execution address ${address} codeHash mismatch: expected ${codeHash}, got ${actualHash}`,
    )
  }
}
