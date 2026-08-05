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

// ---------------------------------------------------------------------------
// C4-T5: Robinhood Chain built-in manifest — the first chain this package was
// pointed at FROM SCRATCH, with no prior manifest to copy and no assumption
// that any address would look like another chain's.
//
// THE QUOTE-ONLY MANIFEST IS THE HEADLINE, AND IT IS DELIBERATE. Robinhood
// Chain has all three protocols deployed (v2, v3 AND v4 — see below) but NO
// Universal Router this package can encode for, so `execution` is omitted and
// this is the first built-in manifest to exercise C4-P3's quote-only path.
// The reasoning is in ROBINHOOD_MANIFEST's own docstring; the short version is
// that `eth_getCode` alone would have shipped a manifest pointed at a
// MAINNET-configured Universal Router, and only fingerprinting the router's
// baked-in immutables caught it.
// ---------------------------------------------------------------------------

/**
 * Robinhood Chain (`chainId: 4663`) — an Arbitrum Orbit chain, ~0.1s blocks.
 *
 * VERIFIED live on 2026-08-05 against a keyed archive endpoint (alchemy, robinhood-mainnet; head at
 * verification: block 28,169,616, chain age 96.4 days — block 1 timestamped 2026-04-30). Endpoint
 * identity stays at provider granularity here, per `canary/providers.test.ts`'s redaction rule.
 *
 *  - `eth_getCode` at `latest`: v2 factory, v3 factory, v3QuoterV2, v4 poolManager, v4 quoter,
 *    Permit2 and WETH all non-empty.
 *  - `deploymentBlock`s BINARY-SEARCHED over `eth_getCode` (present vs absent, 27 calls each — this
 *    endpoint serves full archive state, unlike Arbitrum's public RPC): v2 factory 8,928; v3 factory
 *    8,930; v3 quoter 9,063; v4 poolManager 9,070; v4 quoter 9,074 — all five inside 146 blocks of
 *    each other, which is what a single-deployer bring-up of a brand-new chain looks like. (No
 *    wall-clock figure is quoted for that span on purpose: the 0.1s block time below is the CURRENT
 *    rate, and these blocks are from the chain's first hour, when it ran several times slower.)
 *  - REAL EVENTS, not just code — the check that actually establishes each address IS the deployment
 *    rather than merely being occupied (see the Universal Router note below for why that distinction
 *    is not academic here). Over the last 2,000,000 blocks, `scanLogs` recovered, complete in one
 *    pass: 18,347 v4 `Initialize` logs at the poolManager, 12,407 v3 `PoolCreated` at the v3 factory,
 *    and 1,689 v2 `PairCreated` at the v2 factory — every sample decoding to sane currency pairs.
 *  - `v3QuoterV2` bytecode length 8,273 bytes (16,546 hex chars), matching canonical QuoterV2 exactly
 *    (the same length asserted for the other four manifests). On this chain `sdk-core`'s
 *    `quoterAddress` already IS QuoterV2 — unlike Unichain/Arbitrum, where it is a QuoterV1-shaped
 *    deployment (see UNICHAIN_MANIFEST's note); it is still verified by bytecode length here rather
 *    than trusted.
 *  - `wrappedNative` `0x0Bd7…D73`: `symbol()`/`name()` -> "WETH", `decimals()` -> 18, deployed at
 *    block 2. The OP-style predeploy `0x4200…0006` was probed and has NO code on this chain, so this
 *    is not an OP-stack-shaped deployment; the Unichain-style `0x1F984000…0004` v4 predeploy is
 *    likewise absent.
 *  - `chain.blockTimeSeconds: 0.1` — MEASURED, twice: 0.10028s/block over the last 1,000,000 blocks
 *    and 0.09s over the last 100 (too short a span to be anything but a cross-check). Also equals
 *    `sdk-core`'s registered `AVERAGE_BLOCK_TIMES_SECONDS[ChainId.ROBINHOOD]`. Note that the
 *    LIFETIME average is 0.296s/block: the chain ran much slower in its first weeks, so the lifetime
 *    figure is the wrong one to derive a recent-window from.
 *
 *  UNVERIFIED / CONVENTIONAL — `chain.reorgOverlapBlocks: 3000n`. Unlike every other value here this
 *  one was NOT measured: it is 300 seconds expressed in this chain's blocks, matching what every
 *  other L2 built-in manifest already spends (Base 150 @ 2s, Unichain 300 @ 1s, Arbitrum 1200 @
 *  0.25s — all exactly 300s). Mainnet is deliberately NOT part of that pattern: its 32 @ 12s = 384s
 *  is not a round wall-clock budget at all — it is ONE BEACON EPOCH, i.e. finality-informed rather
 *  than time-informed, because mainnet is the one chain here with an epoch-shaped finality boundary
 *  to derive it from. No observed reorg depth on THIS chain informed its 3000n, and none informed
 *  the three L2 conventions either; the number is a re-scan budget for shallow-reorg tolerance, so
 *  being generous costs bounded duplicate work at the tip while being too small would silently drop
 *  pools that a rewind moved. Flagged rather than presented as a fact because a chain-specific
 *  finality claim is exactly the kind of thing a reader would otherwise assume was checked.
 *  - `coreIntermediates`: WETH plus USDG (`0x5fc5…168`, `name()` "Global Dollar", `symbol()` "USDG",
 *    `decimals()` 6). NO USDC DEPLOYMENT WAS FOUND on this chain, and USDG is not a guess at a
 *    substitute: a census of every currency appearing in the 18,347 v4 `Initialize` + 12,407 v3
 *    `PoolCreated` logs above ranks WETH first (15,096 pools), the v4 native sentinel second (11,552),
 *    and USDG a distant but unambiguous third (1,999) — an order of magnitude ahead of the fourth
 *    (APPLE, 481). Nothing named USDC appears anywhere in the top of that census. So USDG is THE
 *    stable intermediate on this chain, established from pool population rather than assumed from
 *    other chains' address lists.
 *
 * NO `execution` BUNDLE — UNVERIFIABLE COMMAND SET, NOT MISSING DATA. This chain has exactly one
 * Universal Router, `0x8876789976dEcBfCbBbe364623C63652db8C0904`, deployed at block 18,127; that
 * block number independently corroborates `universal-router-sdk`'s own `creationBlock` for 4663
 * (18127) to the block. But `universal-router-sdk` registers it under `UniversalRouterVersion.V2_1_1`
 * and lists NO `V2_0` deployment for this chain at all, and `types.ts#COMMAND_SETS` is `['ur-2.0']` —
 * this package has no encoder for a 2.1.1 command set. Claiming `commandSet: 'ur-2.0'` for a 2.1.1
 * router would produce plausible-looking calldata with no guarantee the commands mean what the
 * encoder thinks; omitting `execution` instead makes the manifest quote-only, which is honest,
 * type-checked (C4-P3), and fails loudly (`requireExecution` throws `RouterConfigError`
 * synchronously) the moment someone calls `getSwap` on it.
 *
 * AND `eth_getCode` WOULD HAVE GOTTEN THIS WRONG. Both mainnet's UR 2.0 address
 * (`0x66a9…8Af`) and Base's (`0x6fF5…b43`) DO have code on Robinhood Chain — 19,499 bytes each,
 * byte-identical (same keccak) to those chains' own deployments. Presence alone would have read as
 * "UR 2.0 is deployed here at the familiar address". It is not: a Universal Router bakes
 * permit2/WETH9/v2Factory/v3Factory/poolManager in as RUNTIME IMMUTABLES, and searching that code
 * for known addresses shows `0x66a9…8Af` embeds MAINNET's WETH, v2 factory, v3 factory and
 * poolManager, while `0x6fF5…b43` embeds BASE's — i.e. they are foreign-configured routers sitting at
 * cross-chain-identical addresses, and a swap encoded against either would be sent to factories that
 * do not exist on this chain. The genuine `0x8876…904` fingerprints, by the same method, against
 * Robinhood Chain's OWN weth/v2Factory/v3Factory/poolManager/permit2. IMMUTABLE FINGERPRINTING, NOT
 * `eth_getCode`, IS THE ORACLE FOR "is this deployment configured for THIS chain" — the one
 * methodology note from this bring-up worth carrying to the next chain.
 */
export const ROBINHOOD_MANIFEST: ChainManifest = {
  chainId: 4663,
  // Hoisted (C4-P3) — see MAINNET_MANIFEST's comment. Unlike every other built-in manifest there is
  // no `execution.wrappedNative` for this to be cross-checked against (no execution bundle), so this
  // top-level field is the sole statement of the chain's wrapped native — which is exactly the case
  // C4-P3 hoisted it for.
  wrappedNative: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
  chain: { blockTimeSeconds: 0.1, reorgOverlapBlocks: 3000n },
  v2: {
    factory: '0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f',
    deploymentBlock: 8_928n,
  },
  v3: {
    factory: '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA',
    deploymentBlock: 8_930n,
    v3QuoterV2: '0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7',
  },
  v4: {
    poolManager: '0x8366a39CC670B4001A1121B8F6A443A643e40951',
    deploymentBlock: 9_070n,
    quoter: '0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94', // inlined from sdk-core (C4-P4) — see MAINNET_MANIFEST's comment
  },
  // execution: deliberately absent — see the docstring above.
  coreIntermediates: [
    '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', // WETH
    '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', // USDG ("Global Dollar", 6dp) — this chain's stable
  ],
}

// ---------------------------------------------------------------------------
// FIRST LIVE QUOTE PER CHAIN (C4-T5). Until this run the L2 manifests above
// were verified as DEPLOYMENT DATA (addresses, code, deployment blocks) but had
// never actually routed a trade; these rows are the first end-to-end proof that
// each one quotes. Provider granularity only, never a keyed URL.
//
//   chain              first live quote, native -> stable            date
//   Base (8453)        `quote` — 1 ETH -> 1,863.512057 USDC          2026-08-05
//                      single-leg v3 (fee 500); first quote 16.3s
//                      provider: quiknode (base-mainnet)
//   Unichain (130)     `quote` — 1 ETH -> 1,862.167431 USDC          2026-08-05
//                      single-leg v4 (fee 500, hookless); 3.1s
//                      provider: mainnet.unichain.org (keyless)
//   Arbitrum (42161)   `quote` — 1 ETH -> 1,863.271052 USDC          2026-08-05
//                      single-leg v3 (fee 500); first quote 4.6s
//                      provider: quiknode (arbitrum-mainnet)
//   Robinhood (4663)   `quote` — 0.01 ETH -> 18.665521 USDG,           2026-08-05
//                      i.e. ETH at 1,866.55 — v3 (fee 100), and
//                      quote-only (no execution bundle at all).
//                      Memecoin pools priced HINT-FREE in ~17-18s,
//                      including hook-gated ones, and the round trip
//                      back to native agreed to within the fee tier.
//                      provider: alchemy (robinhood-mainnet). Full
//                      per-pool rows and the quote-only rationale:
//                      canary/robinhood.test.ts
//
// ALL FIVE PRICES AGREE TO WITHIN 0.18% (the three L2 USDC rows to within
// 0.07%), which is the cross-check that matters most: five independently-
// assembled manifests, five different endpoints, two different stablecoins, and
// both v3 and v4 carrying the winning route on different chains — one arbitraged
// ETH price. A wrong factory or a wrong quoter does not produce a number 18 basis
// points from the other four; it produces no route at all, or a nonsense one.
//
// EVERY ROW WAS `aborted: true` WITH `discovery: partial` ON ALL THREE
// PROTOCOLS AT A 60s BUDGET, AND THAT IS THE EXPECTED SHAPE, NOT A DEFECT. The
// leading route was priced in wave 0 in every case (10, 9 and 10 candidates
// attempted; ALL succeeded; zero quote failures, zero transport failures), while
// full log-scan discovery over these chains' wave-0 windows — 302,400 blocks on
// Base, 604,800 on Unichain, 2,419,200 on Arbitrum, per `wave0PairScanBlocks` —
// does not finish in 60 seconds. This is the same "first actionable latency is
// stable, completion is not" finding the mainnet canary recorded, reproduced on
// three L2s: quote quality came from wave 0, and the caller's `AbortSignal` is
// what bounds the rest.
//
// NO MANIFEST DATA BUGS WERE FOUND BY THIS RUN. Each chain's USDC was confirmed
// live by `symbol()`/`decimals()` ("USDC"/6) at the address `coreIntermediates`
// already carried, and each chain's `chainId` matched its endpoint's.
// ---------------------------------------------------------------------------

const KNOWN_MANIFESTS: Record<number, ChainManifest> = {
  1: MAINNET_MANIFEST,
  8453: BASE_MANIFEST,
  130: UNICHAIN_MANIFEST,
  42161: ARBITRUM_MANIFEST,
  4663: ROBINHOOD_MANIFEST,
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
 * Fingerprints `m.execution`'s deployed bytecode against this manifest's OWN immutables —
 * `permit2`/`wrappedNative` always, plus `v2.factory`/`v3.factory`/`v4.poolManager` for whichever of
 * those bundles the manifest carries. A Universal Router bakes these in as constructor immutables,
 * verbatim, so the lowercased address (without its `0x` prefix) must appear as a substring somewhere
 * in the deployed code's hex whenever the router is genuinely configured for this manifest's chain.
 *
 * THIS IS WHAT `codeHash` CANNOT SEE (see {@link UniversalRouterDeployment.codeHash}'s doc). The
 * Robinhood Chain bring-up found mainnet's and Base's real Universal Router bytecode deployed,
 * byte-for-byte, at Robinhood Chain's usual UR address — `eth_getCode` and even an exact `codeHash`
 * match would have called that "the genuine deployment", when in fact it was wired to mainnet's (or
 * Base's) own factories, addresses that do not exist as pools on Robinhood Chain at all. Only reading
 * the immutables back out of the code told them apart. Called unconditionally from
 * {@link validateManifest} whenever `execution` is present, independent of whether `codeHash` was
 * also supplied.
 */
function assertImmutablesEmbedded(m: ChainManifest, code: Hex): void {
  const execution = m.execution!
  const codeHex = code.toLowerCase()
  const checks: Array<[label: string, address: Address]> = [
    ['execution.wrappedNative', execution.wrappedNative],
    ['execution.permit2', execution.permit2],
  ]
  if (m.v2) checks.push(['v2.factory', m.v2.factory])
  if (m.v3) checks.push(['v3.factory', m.v3.factory])
  if (m.v4) checks.push(['v4.poolManager', m.v4.poolManager])

  for (const [label, address] of checks) {
    const needle = address.toLowerCase().slice(2) // immutables are embedded verbatim, without '0x'
    if (!codeHex.includes(needle)) {
      throw new RouterConfigError(
        `execution address ${execution.address} does not embed ${label} (${address}) anywhere in its deployed ` +
          `bytecode — this Universal Router appears to be configured for a different chain`,
      )
    }
  }
}

/**
 * Cross-checks `m.chainId` against the connected client's actual chain before any RPC traffic
 * depends on the manifest — a mismatch means every downstream address in the manifest is for the
 * wrong network. Runs identically whether or not `execution` is present (C4-P3): a quote-only
 * manifest still gets this check, since a wrong chainId misdirects quoting's own addresses (the v2
 * factory, the v3/v4 quoters) just as much as it would the Universal Router.
 *
 * When `m.execution` IS present, ALSO fetches the deployed code at `m.execution.address` — exactly
 * once, regardless of whether `codeHash` is supplied — and runs two independent checks against it:
 *
 *  1. If `codeHash` is provided, its keccak256 must match — catching a manifest pointed at the wrong
 *     (or an un-deployed) address that the chainId check alone can't see.
 *  2. UNCONDITIONALLY, {@link assertImmutablesEmbedded} fingerprints the code for this manifest's own
 *     `permit2`/`wrappedNative`/factory immutables — catching a router whose CODE is fine (an exact
 *     `codeHash` match, even) but whose baked-in factories belong to a different chain. See that
 *     function's doc for the real-world case (Robinhood Chain) this exists to catch.
 *
 * No `execution` bundle at all skips both checks entirely: no `eth_getCode` call is made.
 *
 * NEITHER RPC CALL IS GATED BY THE ROUTER'S CONCURRENCY SEMAPHORE (C4-P6, F2) — the one deliberate
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

  if (!m.execution) return
  const { codeHash, address } = m.execution

  const code = (await client.request({ method: 'eth_getCode', params: [address, 'latest'] } as any)) as Hex
  if (!code || code === '0x') {
    throw new RouterConfigError(`no code found at execution address ${address}; expected a deployed Universal Router`)
  }

  if (codeHash) {
    const actualHash = keccak256(code)
    if (actualHash.toLowerCase() !== codeHash.toLowerCase()) {
      throw new RouterConfigError(
        `execution address ${address} codeHash mismatch: expected ${codeHash}, got ${actualHash}`,
      )
    }
  }

  assertImmutablesEmbedded(m, code)
}
