import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createRouter, MAINNET_MANIFEST, type PoolKey, type Router, type SwapRequest } from '@uniswap/router-lite-sdk'
import { beforeAll, describe, expect, it } from 'bun:test'
import { decodeEventLog, encodeEventTopics, parseEther, type Address, type Hex, type PublicClient } from 'viem'

import { V4_POOL_MANAGER_ABI } from '../src/internal/abis'
import { scanLogs } from '../src/internal/logScan'
import { assertResultCoherent } from '../src/internal/testing'

import { canaryEnabled, canaryLog, canaryProviders, primaryProvider, type CanaryProvider } from './env'
import { CANARY_TRADER, simulateSwapE2E } from './simulate'

const CANARY_DIR = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// The live-RPC canary suite (Task 21).
//
// Gated on ROUTER_LITE_CANARY=1 + at least CANARY_RPC_URL_1 — see `env.ts`.
// NEVER PR-blocking: this file only ever runs from a nightly job wired up
// separately (Task 22), never from the PR pipeline. No keys, no funds: every
// `getSwap` below is for the fixed, permanently-unfunded `CANARY_TRADER`
// (0x1111...1111) — the search result is the coherence proof, and
// `simulateSwapE2E` (see `simulate.ts`) is the execution proof.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// C4-T4 — first-ever live run against real public endpoints (2026-08-04/05).
// `providerErrors.json` had never held anything but "source": "seed" before
// this; every entry there is now a real "live-capture". Numbers below are
// real, not projected — rows that did not complete are marked as such rather
// than filled in with a guess.
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
// below need together via `primaryProvider()`. That is the headline finding
// of this run, not a bug: it means every row that depends on both (this
// file's four `describe` blocks) could not be exercised end-to-end against
// any single public candidate within a live run's time budget.
//
// provider-behavior evidence (`providers.test.ts`), huge-getLogs probe
// (2,000-block unfiltered window against the live v4 PoolManager):
//   CANARY_RPC_URL_1 (publicnode): 0/2,000 blocks covered — every request
//     lands on the archive wall above; `MIN_CHUNK` (128 blocks) never gets
//     small enough to matter, because the block range was never the problem.
//   CANARY_RPC_URL_2 (blastapi): 0/2,000 blocks covered — the provider's
//     real cap (10 blocks) is narrower than `scanLogs`'s `MIN_CHUNK` floor
//     (128 blocks), so no window the bisector will ever try can succeed.
//   CANARY_RPC_URL_3 (drpc): complete convergence, 40,994 logs recovered in
//     one pass — the bisector's intended case, working as designed live.
//
// Pair matrix / cross-provider agreement / latency benchmarks (this file):
// NOT completed this run. `primaryProvider()` (publicnode, the only
// simulateV1-capable candidate tested) went into ~60s-per-call soft stalls
// immediately after the huge-getLogs probe's request burst against it in
// the same process — the very next test to reuse it (the batched-transport
// check, then this file's native->USDC row) each timed out at 60s. Real,
// reportable behavior (a public free-tier endpoint degrading under
// sustained single-IP load), but not the wave-timing data this comment was
// meant to hold — no hinted-swap/direct-pair/cold-long-tail numbers were
// obtained, and none are fabricated here. A retry should give the pair
// matrix a provider that has not just been hit by `providers.test.ts` in
// the same run (e.g. separate CI steps/providers per test file).
//
// Canary-code fixes made in response to this run (src/ untouched):
//   - `providers.test.ts`: the huge-getLogs probe asserted convergence
//     BEFORE recording the captured error, so any non-convergent provider
//     (the common, most-informative case) had its real error discarded
//     instead of persisted. Reordered, and added a graceful skip when
//     `coveredRanges === 0` (categorical incompatibility — an archive wall
//     or a per-call cap under `MIN_CHUNK` — rather than a bisector defect).
//   - `providers.test.ts`: `HUGE_WINDOW_BLOCKS` 200_000n -> 2_000n. Against
//     the actually-live, high-volume v4 PoolManager the original window
//     forced `scanLogs` into its near-worst case (every request landing at
//     `MIN_CHUNK`), timing out the test even without any archive gating
//     (confirmed directly: 200_000n against publicnode ran the full 180s
//     without finishing).
// ---------------------------------------------------------------------------

const RUN = canaryEnabled()

const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WBTC: Address = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'

const ETH_IN = parseEther('1')
const USDC_IN = 5_000n * 10n ** 6n

/** ~7 days of mainnet blocks at ~12s/block — the recent-pool discovery window the brief calls for. */
const SEVEN_DAYS_BLOCKS = 50_400n

type DiscoveredV4Pool = { poolKey: PoolKey; other: Address }

/**
 * Finds the most-recently-created v4 pool (last ~7 days of `Initialize` logs) that has a direct
 * native/WETH leg — kept deliberately simple: a pool between two arbitrary long-tail tokens would
 * need its OWN acquisition strategy, which is out of scope here, so this only looks for pools this
 * suite can trivially trade into from native. Returns `undefined` (never throws) when none is found,
 * so callers can skip that row with a note rather than fail the whole suite over "the chain happened
 * to be quiet this week" — a real, expected outcome, not a defect.
 */
async function discoverRecentV4Pool(client: PublicClient): Promise<DiscoveredV4Pool | undefined> {
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

  // Recent-first: the first qualifying log IS the most recently created pool.
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
    return { poolKey: { currency0, currency1, fee, tickSpacing, hooks }, other }
  }
  return undefined
}

/** Runs `getSwap` for the synthetic trader, asserts `needs-action` (the honest shape for a
 * permanently-unfunded trader), then proves the returned `tx` is actually executable. */
async function checkPairIsCanary(
  label: string,
  router: Router,
  provider: CanaryProvider,
  req: Omit<SwapRequest, 'trader'>,
): Promise<void> {
  const result = await router.getSwap({ ...req, trader: CANARY_TRADER })
  assertResultCoherent(result)
  if (result.status !== 'needs-action') {
    throw new Error(`${label}: expected needs-action for the unfunded synthetic trader, got ${result.status}`)
  }
  const outcome = await simulateSwapE2E(provider.client, result, CANARY_TRADER)
  canaryLog(`${label}: simulated`, { provider: provider.label, ok: outcome.ok, outputReceived: outcome.outputReceived.toString() })
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
  }, 60_000)

  it('USDC -> native', async () => {
    await checkPairIsCanary('USDC->native', router, provider, { tokenIn: USDC, tokenOut: 'native', amountIn: USDC_IN })
  }, 60_000)

  it('USDC -> WBTC (likely 2-hop)', async () => {
    await checkPairIsCanary('USDC->WBTC', router, provider, { tokenIn: USDC, tokenOut: WBTC, amountIn: USDC_IN })
  }, 60_000)

  it('a recently-created v4 pool (last ~7d of Initialize logs, with a native leg)', async () => {
    const pool = await discoverRecentV4Pool(provider.client)
    if (!pool) {
      canaryLog('no recent v4 pool with a native/WETH leg found in the last ~7 days — skipping this row')
      return
    }
    await checkPairIsCanary(`native -> ${pool.other} (v4, discovered)`, router, provider, {
      tokenIn: 'native',
      tokenOut: pool.other,
      amountIn: ETH_IN,
      hints: [{ protocol: 'v4', poolKey: pool.poolKey }],
    })
  }, 60_000)
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
// Latency benchmarks — record, never assert. Wall-clock per wave, logged as
// structured JSON to stdout AND written to `canary/latency-<timestamp>.json`
// (gitignored — these are point-in-time measurements, not fixtures). This is
// what revisits the internal wave-budget constants (see `constants.ts`), not
// something a test should pass/fail on.
// ---------------------------------------------------------------------------

type WaveTiming = { index: number; elapsedMs: number; status: string }
type LatencyRow = { label: string; waves: WaveTiming[] }

async function timeWaves(label: string, router: Router, req: Omit<SwapRequest, 'trader'>): Promise<LatencyRow> {
  const start = performance.now()
  const waves: WaveTiming[] = []
  let index = 0
  for await (const r of router.swaps({ ...req, trader: CANARY_TRADER })) {
    waves.push({ index: index++, elapsedMs: performance.now() - start, status: r.status })
  }
  return { label, waves }
}

describe.skipIf(!RUN)('latency benchmarks (canary, record only)', () => {
  it('wall-clock per wave: hinted swap, direct pair, cold long-tail token', async () => {
    const provider = primaryProvider()
    const router = createRouter({ client: provider.client, manifest: MAINNET_MANIFEST })

    const results: LatencyRow[] = []

    // Hinted: a well-known WETH/USDC v2 pair, supplied as a hint so wave 0 resolves it immediately
    // without any discovery round trip — the latency floor.
    results.push(
      await timeWaves('hinted-native-usdc', router, {
        tokenIn: 'native',
        tokenOut: USDC,
        amountIn: ETH_IN,
        hints: [{ protocol: 'v2', token0: MAINNET_MANIFEST.wrappedNative, token1: USDC }],
      }),
    )

    // Direct pair, no hints: ordinary discovery against two well-known majors.
    results.push(await timeWaves('direct-pair-usdc-wbtc', router, { tokenIn: USDC, tokenOut: WBTC, amountIn: USDC_IN }))

    // Cold long-tail: whatever `discoverRecentV4Pool` found, traded WITHOUT hints — full discovery,
    // the latency ceiling. Skipped with a note (not a failure) when nothing recent was found.
    const cold = await discoverRecentV4Pool(provider.client)
    if (cold) {
      results.push(await timeWaves('cold-long-tail', router, { tokenIn: 'native', tokenOut: cold.other, amountIn: ETH_IN }))
    } else {
      canaryLog('no cold long-tail token discovered — skipping that latency row')
    }

    const payload = { timestamp: Date.now(), provider: provider.label, results }
    canaryLog('latency benchmarks', payload)
    writeFileSync(join(CANARY_DIR, `latency-${payload.timestamp}.json`), JSON.stringify(payload, null, 2))
    // Record only — no assertions. These numbers are what a human revisits the wave-budget constants
    // (constants.ts) against, not something CI should ever gate on.
  }, 120_000)
})
