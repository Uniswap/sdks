import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createRouter, MAINNET_MANIFEST, type BlockRange, type PoolKey, type Router, type SwapRequest } from '@uniswap/router-lite-sdk'
import {
  adjacencyQueries,
  assertResultCoherent,
  scanLogs,
  v2Module,
  v3Module,
  v4Module,
  V4_POOL_MANAGER_ABI,
  type MergedLogQuery,
} from '@uniswap/router-lite-sdk/experimental'
import { beforeAll, describe, expect, it } from 'bun:test'
import { decodeEventLog, encodeEventTopics, parseEther, type Address, type Hex, type PublicClient } from 'viem'

import { canaryEnabled, canaryLog, canaryProviders, freshClient, primaryProvider, type CanaryProvider } from './env'
import { CANARY_TRADER, simulateSwapE2E } from './simulate'

const CANARY_DIR = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// The live-RPC canary suite (Task 21).
//
// Gated on ROUTER_LITE_CANARY=1 + at least CANARY_RPC_URL_1 — see `env.ts`.
// NEVER PR-blocking: this file only ever runs from a nightly job wired up
// separately (Task 22), never from the PR pipeline. NO KEYS ARE HELD AND
// NOTHING IS EVER FUNDED BY THIS SUITE: every `getSwap` below is for the
// fixed, synthetic `CANARY_TRADER` (0x1111...1111), which this suite has no
// private key for and never sends a transaction as — the search result is the
// coherence proof, and `simulateSwapE2E` (see `simulate.ts`) is the execution
// proof, run entirely inside one `eth_simulateV1` state override.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// LIVE-RUN LOG. Every number below was measured, never projected; a row that
// did not complete is marked as such rather than filled in with a guess.
//
// --- C4-T4, first-ever live run, keyless public endpoints (2026-08-04/05) ---
//
// Live provider capability matrix (probed directly, no keys, mainnet head):
//
//   endpoint                          eth_simulateV1        eth_getLogs (historical range)
//   ethereum.publicnode.com          supported              blocked: archive access needs a paid
//                                                            personal token (HTTP 403, -32602)
//   eth-mainnet.public.blastapi.io   not supported           supported, but capped at 10 blocks/call
//                                    ("only core evm requests")
//   eth.drpc.org                     not supported (-32601)  supported, capped ~20k logs/call —
//                                                             `scanLogs` fully converged around it
//
// No free, keyless endpoint tested supports BOTH eth_simulateV1 and an
// unrestricted eth_getLogs — the two things the pair-matrix/latency rows
// below need together via `primaryProvider()`. That was the headline finding
// of that run: every row depending on both was left unmeasured, because no
// single public candidate could serve them.
//
// provider-behavior evidence (`providers.test.ts`), huge-getLogs probe
// (2,000-block unfiltered window against the live v4 PoolManager):
//   publicnode: 0/2,000 blocks covered — every request lands on the archive
//     wall above; `MIN_CHUNK` (128 blocks) never gets small enough to matter,
//     because the block range was never the problem.
//   blastapi: 0/2,000 blocks covered — the provider's real cap (10 blocks) is
//     narrower than `scanLogs`'s `MIN_CHUNK` floor (128 blocks), so no window
//     the bisector will ever try can succeed.
//   drpc: complete convergence, 40,994 logs recovered in one pass — the
//     bisector's intended case, working as designed live.
//
// --- C4-T4b, keyed run (2026-08-04) ------------------------------------------
//
// Re-run with a KEYED archive endpoint as `CANARY_RPC_URL_1` (alchemy-mainnet:
// eth_simulateV1 supported AND unrestricted archive eth_getLogs — the exact
// combination no keyless endpoint had) and `drpc` as `CANARY_RPC_URL_2`. Every
// row in this file completed. Endpoint identity stays at hostname granularity
// in this file and in `providerErrors.json`; see `redactKeyedUrl` in
// `providers.test.ts` for why the fixture can never carry a keyed URL.
//
// provider-behavior evidence, re-run against the same pair:
//
//   probe                          alchemy-mainnet            drpc
//   huge unfiltered getLogs        complete in ONE call,      complete, bisected around a
//   (2,000 blocks, v4 PoolManager) 39,929 logs, no error      20,000-result cap, 39,929 logs
//   eth_simulateV1                 supported                  not supported
//
// Both recovered the SAME 39,929 logs by different routes, which is the
// bisector's actual contract: a provider's cap changes how many requests the
// scan costs, never what it returns.
//
// So `providerErrors.json` has NO entry for the keyed endpoint, and that is the
// honest outcome rather than a gap: it never errored, and there was nothing to
// capture. The bisector's convergence was proved on both — trivially on one,
// through the cap-halving path on the other.
//
// A batched transport coalesced a wave's concurrent reads into a single 10-call
// JSON-RPC batch (`batchSizes: [1,1,10,1,1,1,1,1,1]`) — the batching claim,
// verified on the wire rather than from viem's documentation.
//
// pair matrix (mainnet head ~25,686,000, alchemy-mainnet) — every row's `tx`
// re-executed through the full acquire/approve chain in one eth_simulateV1:
//
//   row                 status         simulated   quoted out       received
//   native -> USDC      ready          ok          1,870,316,771    1,870,318,237
//   USDC -> native      needs-action   ok          2.672269e18 wei  2.672269e18 wei
//   USDC -> WBTC        needs-action   ok          7,755,077 sat    7,755,077 sat
//   recent v4 pool      ready          ok          2.554551e17      2.554551e17
//
// (Amounts move with the head between runs — 1 ETH priced 1,873.06 and then
// 1,870.32 USDC an hour apart. `received` occasionally exceeds `quoted` for the
// same reason, the block advancing between the quote and the simulation;
// `evaluateSimulateResult` checks the plan's own slippage floor, not equality.)
//
// `ready` FOR A NATIVE INPUT IS CORRECT, and the first run's assertion of
// `needs-action` for every row was the canary's bug, not the SDK's: the
// "permanently unfunded" premise behind `CANARY_TRADER` (0x1111...1111) is
// simply false on mainnet — that address is a well-known dust/burn sink and
// held ~5.72 ETH at the time of this run, so a 1 ETH native-input swap has no
// outstanding requirement and `classifySwap` rightly reports `ready`. It holds
// no USDC, so the ERC-20 rows still exercise the `needs-action` shape. See
// `checkPairIsCanary`, which now accepts either executable status.
//
// long-tail discovery (the memecoin proof) — 3,208 v4 `Initialize` logs over
// the last ~7 days (50,400 blocks) recovered by `scanLogs` in ONE pass, 7.3s,
// 105 of them with a native/WETH leg. Of the 12 most recent, 9 quoted a real
// route in 4.4-6.2s (hinted, single leg) and 3 spent the whole 20s
// per-candidate budget without pricing. Tokens routed included
// launchpad-hooked pools (hooks 0xA6f7…9440 / 0x4A80…C8c0 / 0x6C24…e8Cc /
// 0x2762…0080) and hookless ones — i.e. the fresh, hook-gated memecoin case,
// live. The row's own pool (0x8F29…2DA9, hook 0xA6f7…9440, `Initialize`d at
// block 25,678,511, ~1 day old) both quoted and simulated clean.
//
// A FRESHLY-INITIALIZED POOL IS OFTEN NOT TRADEABLE (liquidity never added, or
// a hook that gates swaps), and that is what broke the first keyed attempt:
// the single most-recent pool was un-quotable, its hint died in wave 0, and
// the search fell through into the scan-bound waves — >10 minutes without
// returning, against a full-archive endpoint. Hence `pickTradeableRecentV4Pool`
// below walks candidates under a per-candidate `AbortSignal` instead of betting
// the row on the single newest pool.
//
// latency (fresh client + fresh router per row, 60s budget per row).
//
// --- post-sprint re-measure, 2026-08-05, keyed mainnet endpoint (hostname-class only — see
// `redactKeyedUrl` for why no run in this file ever prints the URL itself) --------------------
//
// The scan engine changed underneath these rows since the numbers below the old table (adaptive
// scan windows, concurrent chunk dispatch, PoolIndex snapshot cache — b73950c7/9a4f98ca/db2f9bc1):
//
//   scenario                                    latency              eth_getLogs
//   cold, first actionable (wave 0)             ~0.3-0.9s            1 (the whole wave-0 window,
//                                                                     one request)
//   cold, full-history drain (60s budget)       completes inside     ~310-473
//                                                budget, ~60s of it
//   warm, in-process (router/index reused)      ~67ms                0
//   warm, across-process (CLI snapshot cache)   59s -> 4.8s discover -> 14 (warm)
//
// FIRST-ACTIONABLE LATENCY DROPPED FROM ~5-9s TO SUB-SECOND: wave 0's own window now resolves in
// the single `eth_getLogs` call the adaptive scanner learns to ask for, instead of the bisection
// that used to spend thousands of narrower requests finding it. Full-history drain, which used to
// blow straight through the 60s budget (43-50s and still producing waves when cut off), now
// completes inside it.
//
// HONEST CAVEATS, unchanged by the sprint: these numbers move run to run with mainnet load and
// provider mood — read them as an order-of-magnitude baseline, not an SLA. And a TIMEOUT-SHAPED
// provider (one that hangs until it times out rather than rejecting an over-wide window instantly
// — drpc's archive reads do this) still pays the scanner's full descent-to-a-conservative-window
// cost before anything comes back, no matter how fast the endpoint that eventually serves it is.
// ---------------------------------------------------------------------------

const RUN = canaryEnabled()

const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WBTC: Address = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'

const ETH_IN = parseEther('1')
const USDC_IN = 5_000n * 10n ** 6n

/** ~7 days of mainnet blocks at ~12s/block — the recent-pool discovery window the brief calls for. */
const SEVEN_DAYS_BLOCKS = 50_400n

/**
 * Native input for the long-tail row, deliberately ~100x smaller than {@link ETH_IN}.
 *
 * A pool that was `Initialize`d hours ago holds whatever liquidity its launch seeded and no more;
 * pricing 1 ETH through it is a request to eat the entire curve, which is a statement about the
 * pool's depth rather than about the SDK. 0.01 ETH is the size a real first buy of a fresh launch
 * actually is, and it is what the numbers in this file's header were measured at.
 */
const LONG_TAIL_ETH_IN = parseEther('0.01')

/** Per-candidate wall-clock budget while hunting for a tradeable fresh pool — see
 * {@link pickTradeableRecentV4Pool} for why this bound is what keeps the row finite. */
const LONG_TAIL_CANDIDATE_BUDGET_MS = 20_000

/** How many of the most recent native-leg pools to try before giving the row up. Live, 9 of the
 * first 12 quoted, so a run that exhausts this has found something categorically unusual (or a very
 * quiet week) — worth a logged skip, not a failure. */
const LONG_TAIL_MAX_CANDIDATES = 12

type DiscoveredV4Pool = { poolKey: PoolKey; other: Address; createdAtBlock: bigint | null }

/**
 * Every v4 pool created in the last ~7 days of `Initialize` logs that has a direct native/WETH leg,
 * MOST RECENT FIRST.
 *
 * Deliberately restricted to native-leg pools: a pool between two arbitrary long-tail tokens would
 * need its OWN acquisition strategy, which is out of scope here. Returns `[]` (never throws) when
 * none is found, so callers can skip that row with a note rather than fail the whole suite over "the
 * chain happened to be quiet this week" — a real, expected outcome, not a defect.
 */
async function discoverRecentV4Pools(client: PublicClient): Promise<DiscoveredV4Pool[]> {
  const head = await client.getBlockNumber()
  const poolManager = MAINNET_MANIFEST.v4!.poolManager
  const wrappedNative = MAINNET_MANIFEST.wrappedNative.toLowerCase()

  // topic0 derived from the ABI (never a hardcoded hex literal), matching the convention every
  // protocol module's adjacency/exactPair topic filter follows (see `protocols/v4.ts`).
  const topic0 = encodeEventTopics({ abi: V4_POOL_MANAGER_ABI, eventName: 'Initialize' })[0]!
  const { logs } = await scanLogs(
    client,
    { address: poolManager, topics: [topic0] },
    { fromBlock: head > SEVEN_DAYS_BLOCKS ? head - SEVEN_DAYS_BLOCKS : 0n, toBlock: head },
    {},
  )

  const pools: DiscoveredV4Pool[] = []
  // `scanLogs` walks recent-first, so this list is already newest-first.
  for (const log of logs) {
    const decoded = decodeEventLog({
      abi: V4_POOL_MANAGER_ABI,
      eventName: 'Initialize',
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data,
    })
    const { currency0, currency1, fee, tickSpacing, hooks } = decoded.args
    const c0 = currency0.toLowerCase()
    const c1 = currency1.toLowerCase()
    if (c0 !== wrappedNative && c1 !== wrappedNative) continue
    const other = (c0 === wrappedNative ? currency1 : currency0) as Address
    pools.push({ poolKey: { currency0, currency1, fee, tickSpacing, hooks }, other, createdAtBlock: log.blockNumber })
  }
  return pools
}

/**
 * Walks {@link discoverRecentV4Pools} newest-first and returns the first pool that will actually
 * PRICE a trade, or `undefined` when none of the first {@link LONG_TAIL_MAX_CANDIDATES} will.
 *
 * "Most recently created" is not the same as "tradeable", and conflating the two is what made the
 * first keyed run of this row hang: a freshly-`Initialize`d pool very often has no liquidity yet, or
 * a hook that gates swaps. When the hint cannot be priced, wave 0 has nothing to yield and the search
 * proceeds into the scan-bound waves — full-history `eth_getLogs` walks that, against an endpoint
 * with real archive access, run for TENS OF MINUTES rather than failing fast. So each candidate is
 * quoted under its own `AbortSignal`: the budget is what converts "this pool is dead" from a hang
 * into a 20s no, and the row moves on to the next candidate instead of the whole suite stalling.
 *
 * Quoting (not swapping) is the probe deliberately — it is the cheaper half and needs no trader, and
 * the caller re-runs the winner through the full `getSwap` + `eth_simulateV1` path anyway.
 */
async function pickTradeableRecentV4Pool(router: Router, client: PublicClient): Promise<DiscoveredV4Pool | undefined> {
  const pools = await discoverRecentV4Pools(client)
  canaryLog('recent v4 pools with a native leg (last ~7d)', { found: pools.length, tried: Math.min(pools.length, LONG_TAIL_MAX_CANDIDATES) })

  for (const pool of pools.slice(0, LONG_TAIL_MAX_CANDIDATES)) {
    const quote = await router.getQuote({
      tokenIn: 'native',
      tokenOut: pool.other,
      amountIn: LONG_TAIL_ETH_IN,
      hints: [{ protocol: 'v4', poolKey: pool.poolKey }],
      signal: AbortSignal.timeout(LONG_TAIL_CANDIDATE_BUDGET_MS),
    })
    if (quote.status === 'quote') {
      canaryLog('long-tail candidate priced', {
        token: pool.other,
        hooks: pool.poolKey.hooks,
        createdAtBlock: pool.createdAtBlock?.toString() ?? null,
        amountOut: quote.best.quote.amountOut.toString(),
      })
      return pool
    }
    canaryLog('long-tail candidate not tradeable — trying the next one', { token: pool.other, status: quote.status })
  }
  return undefined
}

/**
 * Runs `getSwap` for the synthetic trader, asserts it produced an EXECUTABLE result, then proves the
 * returned `tx` really executes via `eth_simulateV1`.
 *
 * Both `ready` and `needs-action` are accepted, and which one comes back is a fact about the trader's
 * real on-chain state rather than about the SDK. This used to demand `needs-action` on the premise
 * that {@link CANARY_TRADER} is permanently unfunded — false on mainnet, where 0x1111...1111 is a
 * well-known dust/burn sink holding several ETH, so native-input rows legitimately come back `ready`
 * (no approval or balance requirement is outstanding). It holds no ERC-20s, so those rows still
 * exercise the `needs-action` shape. Anything else (`no-route`, `inconclusive`) still fails the row —
 * that IS the canary firing.
 */
async function checkPairIsCanary(
  label: string,
  router: Router,
  provider: CanaryProvider,
  req: Omit<SwapRequest, 'trader'>,
): Promise<void> {
  const result = await router.getSwap({ ...req, trader: CANARY_TRADER })
  assertResultCoherent(result)
  if (result.status !== 'needs-action' && result.status !== 'ready') {
    const reason = 'reason' in result ? `: ${result.reason.code}` : ''
    throw new Error(`${label}: expected an executable result (ready | needs-action), got ${result.status}${reason}`)
  }
  const outcome = await simulateSwapE2E(provider.client, result, CANARY_TRADER)
  canaryLog(`${label}: simulated`, {
    provider: provider.label,
    status: result.status,
    ok: outcome.ok,
    amountOut: result.best.quote.amountOut.toString(),
    outputReceived: outcome.outputReceived.toString(),
  })
  expect(outcome.ok).toBe(true)
}

describe.skipIf(!RUN)('pair matrix (canary, live head)', () => {
  let provider: CanaryProvider
  let router: Router

  beforeAll(() => {
    provider = primaryProvider()
    router = createRouter({ client: provider.client, manifest: MAINNET_MANIFEST })
  })

  it('native -> USDC', async () => {
    await checkPairIsCanary('native->USDC', router, provider, { tokenIn: 'native', tokenOut: USDC, amountIn: ETH_IN })
  }, 120_000)

  it('USDC -> native', async () => {
    await checkPairIsCanary('USDC->native', router, provider, { tokenIn: USDC, tokenOut: 'native', amountIn: USDC_IN })
  }, 120_000)

  it('USDC -> WBTC (likely 2-hop)', async () => {
    await checkPairIsCanary('USDC->WBTC', router, provider, { tokenIn: USDC, tokenOut: WBTC, amountIn: USDC_IN })
  }, 120_000)

  // Generous timeout: this row does a ~7-day log scan and then prices up to
  // `LONG_TAIL_MAX_CANDIDATES` fresh pools, each of which may spend its whole
  // `LONG_TAIL_CANDIDATE_BUDGET_MS` before being ruled out. The worst case is bounded by those two
  // constants, not by luck, which is the point — see `pickTradeableRecentV4Pool`.
  it('a recently-created v4 pool (last ~7d of Initialize logs, with a native leg)', async () => {
    const pool = await pickTradeableRecentV4Pool(router, provider.client)
    if (!pool) {
      canaryLog('no tradeable recent v4 pool with a native/WETH leg found in the last ~7 days — skipping this row')
      return
    }
    await checkPairIsCanary(`native -> ${pool.other} (v4, discovered)`, router, provider, {
      tokenIn: 'native',
      tokenOut: pool.other,
      amountIn: LONG_TAIL_ETH_IN,
      hints: [{ protocol: 'v4', poolKey: pool.poolKey }],
    })
  }, 600_000)
})

describe.skipIf(!RUN || canaryProviders().length < 2)('cross-provider quote agreement (canary, live head)', () => {
  it('two providers quoting the same pair, pinned to the same block, agree exactly', async () => {
    const [a, b] = canaryProviders()
    if (!a || !b) {
      canaryLog('fewer than 2 CANARY_RPC_URL_* configured — skipping cross-provider agreement check')
      return
    }
    const routerA = createRouter({ client: a.client, manifest: MAINNET_MANIFEST })
    const routerB = createRouter({ client: b.client, manifest: MAINNET_MANIFEST })
    const req = { tokenIn: 'native' as const, tokenOut: USDC, amountIn: ETH_IN }

    async function attempt() {
      const [qa, qb] = await Promise.all([routerA.getQuote(req), routerB.getQuote(req)])
      assertResultCoherent(qa)
      assertResultCoherent(qb)
      return { qa, qb }
    }

    let { qa, qb } = await attempt()
    if (qa.status === 'quote' && qb.status === 'quote' && qa.search.block.number !== qb.search.block.number) {
      // `getQuote` always pins to each client's own latest — a block mismatch is expected when the
      // two providers' heads happen to differ at the moment of the call. One retry is usually enough
      // for them to land on the same block; if not, this is not a defect worth failing over.
      ;({ qa, qb } = await attempt())
    }

    if (qa.status !== 'quote' || qb.status !== 'quote') {
      canaryLog('one provider did not return a quote — skipping agreement check', { a: qa.status, b: qb.status })
      return
    }
    if (qa.search.block.number !== qb.search.block.number) {
      canaryLog('providers never landed on the same block after a retry — skipping agreement check', {
        blockA: qa.search.block.number.toString(),
        blockB: qb.search.block.number.toString(),
      })
      return
    }
    expect(qa.best.quote.amountOut).toBe(qb.best.quote.amountOut)
  }, 60_000)
})

// ---------------------------------------------------------------------------
// MERGED-SCAN CONFORMANCE (C5-C) — the one row that ASSERTS a provider's
// `eth_getLogs` semantics rather than the SDK's behavior.
//
// The adjacency scans ask one request what used to take six: an ADDRESS ARRAY
// (`[v2Factory, v3Factory]`) and an ARRAY WITHIN A TOPIC POSITION (`topics[0] =
// [PairCreated, PoolCreated]`, and both of the trade's endpoints OR-ed in the
// token slot). Both are core `eth_getLogs` — in the JSON-RPC spec since
// Frontier, not an extension — and the engine has NO RUNTIME FALLBACK to
// per-protocol queries, deliberately: a provider that mishandled either would
// return a SILENTLY SMALLER log set, which is indistinguishable at runtime from
// a chain that simply has fewer pools, and a heuristic guess in the hot path
// would cost every search a probe to answer a question that has one correct
// answer per provider.
//
// So the check lives here, where it can be conclusive: the merged result set
// must equal, EXACTLY, the union of the individual queries it replaces. This is
// the audit's own live check (mainnet, 2026-08: v2+v3 merged returned 29+3 = 32
// logs in one 49ms request against 134ms for the two separate ones, set-equal)
// promoted to something repeatable against every provider the repo is pointed
// at. If a provider ever fails it, the fix is a manifest/router flag that stops
// the planner merging — `search/adjacencyPlan.ts` would then emit one scan per
// scope, the same construction with one-element arrays — not a runtime probe.
// ---------------------------------------------------------------------------

/** Recent window the conformance row compares over: wide enough for both factories to have created
 * pools touching WETH/USDC, narrow enough for any provider to serve it in a request or two. */
const CONFORMANCE_WINDOW_BLOCKS = 100_000n

/** A log's identity, independent of field ordering or the provider's formatting. */
function logId(log: { blockNumber?: bigint | null; transactionHash?: Hex | null; logIndex?: number | null }): string {
  return `${log.blockNumber ?? '?'}:${log.transactionHash ?? '?'}:${log.logIndex ?? '?'}`
}

describe.skipIf(!RUN)('merged adjacency conformance (canary, live head)', () => {
  /** Every log `queries` return over `range`, by identity — `undefined` when any scan came back
   * incomplete, which makes the comparison meaningless rather than failing. */
  async function idsFor(client: PublicClient, queries: readonly MergedLogQuery[], range: BlockRange): Promise<Set<string> | undefined> {
    const ids = new Set<string>()
    for (const query of queries) {
      const scan = await scanLogs(client, query, range, {})
      if (!scan.complete) return undefined
      for (const log of scan.logs) ids.add(logId(log))
    }
    return ids
  }

  for (const provider of canaryProviders()) {
    it(`${provider.label}: a merged query returns EXACTLY the union of the queries it replaces`, async () => {
      const head = await provider.client.getBlockNumber()
      const range: BlockRange = { fromBlock: head - CONFORMANCE_WINDOW_BLOCKS, toBlock: head }
      const endpoints = [MAINNET_MANIFEST.wrappedNative, USDC]

      const v2Shape = v2Module.adjacencyShape(MAINNET_MANIFEST)!
      const v3Shape = v3Module.adjacencyShape(MAINNET_MANIFEST)!
      const v4Shape = v4Module.adjacencyShape(MAINNET_MANIFEST)!

      // Two comparisons, because they exercise different halves of the claim: v2+v3 merges ACROSS
      // protocols (address array AND OR-topic0 AND OR-token) while v4 merges only its two endpoints
      // (OR-token alone, one slot deeper behind the pool-id topic).
      for (const [label, shapes] of [
        ['v2+v3', [v2Shape, v3Shape]],
        ['v4', [v4Shape]],
      ] as const) {
        const merged = await idsFor(provider.client, adjacencyQueries(shapes, endpoints), range)
        const individual = new Set<string>()
        let individualComplete = true
        for (const shape of shapes) {
          for (const endpoint of endpoints) {
            const ids = await idsFor(provider.client, adjacencyQueries([shape], [endpoint]), range)
            if (!ids) individualComplete = false
            else for (const id of ids) individual.add(id)
          }
        }

        if (!merged || !individualComplete) {
          // A capped or flaky provider is not a conformance failure — it is a scan that did not
          // finish, and comparing partial sets would fail for the wrong reason.
          canaryLog(`${provider.label} ${label}: a scan came back incomplete — skipping the comparison`)
          continue
        }

        canaryLog(`${provider.label} ${label}: merged vs union`, {
          blocks: CONFORMANCE_WINDOW_BLOCKS.toString(),
          mergedChains: 2, // one per topic slot, always — that is the whole saving
          individualChains: shapes.length * endpoints.length * 2,
          mergedLogs: merged.size,
          unionLogs: individual.size,
        })

        // The premise: if neither side found anything, the window proved nothing and a green row
        // would be a lie about what was checked.
        expect(individual.size).toBeGreaterThan(0)
        // Set equality, both directions. A provider that ignored the address array would return MORE
        // (some third contract's logs); one that honored only the first array element would return
        // LESS — the dangerous direction, and the one a runtime check could never tell from reality.
        expect([...merged].sort()).toEqual([...individual].sort())
      }
    }, 300_000)
  }
})

// ---------------------------------------------------------------------------
// Latency benchmarks — record, never assert. Wall-clock per wave, logged as
// structured JSON to stdout AND written to `canary/latency-<timestamp>.json`
// (gitignored — these are point-in-time measurements, not fixtures). This is
// what revisits the internal wave-budget constants (see `constants.ts`), not
// something a test should pass/fail on.
//
// EVERY ROW IS RUN UNDER AN `AbortSignal.timeout`, and that is a measurement
// decision rather than a convenience. `router.swaps()` keeps yielding refined
// results until discovery is COMPLETE, and completeness on mainnet means
// walking each protocol's factory logs back to its deploy block — thousands of
// sequential `eth_getLogs` even against an endpoint that serves every one of
// them. Measured live: a cold long-tail token yielded its first executable
// result at 5.8s and was still going when a 240s budget cut it off. So the
// number worth recording is TIME TO THE FIRST ACTIONABLE RESULT (what a caller
// waiting on `getSwap` actually experiences — `getSwap` returns on exactly that
// yield), plus however many later refinements land inside the budget. A row
// that reaches the budget is reported with `finishedWithinBudget: false`, never
// silently truncated.
// ---------------------------------------------------------------------------

/** Wall-clock budget per latency row — generous enough to capture wave 0 and its first refinements,
 * far short of what a complete mainnet discovery costs. */
const LATENCY_BUDGET_MS = 60_000

type WaveTiming = { index: number; elapsedMs: number; status: string }
type LatencyRow = {
  label: string
  budgetMs: number
  waves: WaveTiming[]
  /** Elapsed at the first `ready`/`needs-action` yield — the latency a `getSwap` caller sees. */
  firstActionableMs: number | null
  /** False when the iterator was still producing waves when the budget expired. */
  finishedWithinBudget: boolean
}

/**
 * Times one scenario end to end on a router and client that have NEVER SEEN A REQUEST BEFORE.
 *
 * Reusing a router across rows quietly turns every row after the first into a warm-cache
 * measurement — see `freshClient` in `env.ts` for the run where that produced a 113ms "cold"
 * long-tail number. Each row paying its own discovery cost is the whole point of the comparison
 * between these three scenarios.
 */
async function timeWaves(label: string, provider: CanaryProvider, req: Omit<SwapRequest, 'trader'>): Promise<LatencyRow> {
  const router = createRouter({ client: freshClient(provider), manifest: MAINNET_MANIFEST })
  const start = performance.now()
  const waves: WaveTiming[] = []
  let firstActionableMs: number | null = null
  let index = 0
  for await (const r of router.swaps({ ...req, trader: CANARY_TRADER, signal: AbortSignal.timeout(LATENCY_BUDGET_MS) })) {
    const elapsedMs = performance.now() - start
    waves.push({ index: index++, elapsedMs, status: r.status })
    if (firstActionableMs === null && (r.status === 'ready' || r.status === 'needs-action')) firstActionableMs = elapsedMs
  }
  const totalMs = performance.now() - start
  return { label, budgetMs: LATENCY_BUDGET_MS, waves, firstActionableMs, finishedWithinBudget: totalMs < LATENCY_BUDGET_MS }
}

describe.skipIf(!RUN)('latency benchmarks (canary, record only)', () => {
  it('wall-clock per wave: hinted swap, direct pair, cold long-tail token', async () => {
    const provider = primaryProvider()
    const results: LatencyRow[] = []

    // Hinted: a well-known WETH/USDC v2 pair, supplied as a hint so wave 0 resolves it immediately
    // without any discovery round trip — the latency floor.
    results.push(
      await timeWaves('hinted-native-usdc', provider, {
        tokenIn: 'native',
        tokenOut: USDC,
        amountIn: ETH_IN,
        hints: [{ protocol: 'v2', token0: MAINNET_MANIFEST.wrappedNative, token1: USDC }],
      }),
    )

    // Direct pair, no hints: ordinary discovery against two well-known majors.
    results.push(await timeWaves('direct-pair-usdc-wbtc', provider, { tokenIn: USDC, tokenOut: WBTC, amountIn: USDC_IN }))

    // Cold long-tail: a freshly-launched token traded WITHOUT hints — the pool has to be DISCOVERED,
    // which is the latency ceiling a memecoin buyer actually pays. The candidate hunt runs on its own
    // throwaway router so the one `timeWaves` builds starts genuinely cold; a router shared with the
    // hunt would already hold the pool and report discovery it never did. Skipped with a note (not a
    // failure) when nothing tradeable was found.
    const scoutClient = freshClient(provider)
    const scoutRouter = createRouter({ client: scoutClient, manifest: MAINNET_MANIFEST })
    const cold = await pickTradeableRecentV4Pool(scoutRouter, scoutClient)
    if (cold) {
      results.push(await timeWaves('cold-long-tail', provider, { tokenIn: 'native', tokenOut: cold.other, amountIn: LONG_TAIL_ETH_IN }))
    } else {
      canaryLog('no cold long-tail token discovered — skipping that latency row')
    }

    const payload = { timestamp: Date.now(), provider: provider.label, results }
    canaryLog('latency benchmarks', payload)
    writeFileSync(join(CANARY_DIR, `latency-${payload.timestamp}.json`), JSON.stringify(payload, null, 2))
    // Record only — no assertions. These numbers are what a human revisits the wave-budget constants
    // (constants.ts) against, not something CI should ever gate on.
  }, 900_000)
})
