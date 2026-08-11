import { createRouter, MAINNET_MANIFEST, type PoolRef, type Router } from '@uniswap/router-lite-sdk'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { parseEther, type Address, type TransactionReceipt } from 'viem'

import { FORK_BLOCK, forkTestsEnabled, startAnvilFork, type AnvilClient } from './anvil'
import {
  classifyLogQueries,
  countingClient,
  executeSwap,
  forkManifest,
  minAmountOut,
  readySwap,
  routeProtocols,
} from './e2e'
import { createWorld, type World } from './worldBuilder'
import { assertResultCoherent } from '../src/internal/testing'

// ---------------------------------------------------------------------------
// Discovery, on a chain where we know every pool that exists.
//
// There are exactly four ways a pool can enter the SDK's index, and each test
// here isolates one of them by making the other three impossible:
//
//   ingestion       a pool the log stream CANNOT contain (the manifest's v4
//                   floor sits above its creation block) and whose fee tier no
//                   speculative probe guesses — so only `ingestReceipt` can
//                   know it. Zero `eth_getLogs`, and a control run without the
//                   ingestion proves the same search finds nothing.
//   exact-pair scan the same unguessable pool, now with an honest v4 floor and
//                   a cold router: wave 0's Initialize scan is the only thing
//                   that can find it.
//   adjacency scan  a two-hop whose INTERMEDIATE is a token nothing has ever
//                   heard of: the pair scan cannot reach it, so the search has
//                   to scan an endpoint's adjacency and then probe outward.
//   selection       five pools for one pair against a cap of three, where the
//                   newest is the best: it survives only via the reserved slot.
//
// Every case ends the same way — the route is executed on the fork and the
// output is exactly the quote.
// ---------------------------------------------------------------------------

const RUN = forkTestsEnabled()

/**
 * A fee/tickSpacing pair no `hypotheses` pool will ever guess: the v4 module derives only the four
 * standard no-hook configs (100/1, 500/10, 3000/60, 10000/200). A pool here is therefore invisible to
 * the module's own hypotheses and can only arrive through a log or an ingestion.
 */
const UNGUESSABLE = { fee: 4_242, tickSpacing: 42 } as const

const AMOUNT_IN = 1_000n * 10n ** 18n

const INGEST_TRADER: Address = '0x00000000000000000000000000000000000d15c1'
const COLD_TRADER: Address = '0x00000000000000000000000000000000000d15c2'
const HOP_TRADER: Address = '0x00000000000000000000000000000000000d15c3'
const CAP_TRADER: Address = '0x00000000000000000000000000000000000d15c4'

describe.skipIf(!RUN)('pool discovery (fork)', () => {
  let anvil: AnvilClient
  let world: World

  // The unguessable direct pool, shared by the ingestion and cold-discovery cases.
  let hidden: { tokenIn: Address; tokenOut: Address; ref: PoolRef; receipt: TransactionReceipt }

  beforeAll(async () => {
    anvil = await startAnvilFork({ port: 8648 })
    world = createWorld(anvil)

    const tokenIn = await world.deployToken('DiscIn')
    const tokenOut = await world.deployToken('DiscOut')
    const created = await world.createV4Pool(tokenIn, tokenOut, {
      ...UNGUESSABLE,
      liquidity: 10n ** 22n,
      priceApprox: 2,
    })
    hidden = { tokenIn, tokenOut, ref: created.ref, receipt: created.receipt }

    for (const trader of [INGEST_TRADER, COLD_TRADER]) {
      await world.fundTrader(trader, { eth: parseEther('10'), tokens: [[tokenIn, AMOUNT_IN]] })
      await world.approvePermit2(trader, tokenIn, { toRouter: true })
    }
  }, 300_000)

  afterAll(async () => {
    await anvil?.stop()
  })

  it('a pool ingested from its own receipt routes with ZERO log queries — and is unreachable without it', async () => {
    // The v4 discovery floor is pinned above the pool's own creation block, so no `eth_getLogs`
    // this router could ever issue would return it. Together with the unguessable fee tier, that
    // leaves `ingestReceipt` as the single channel through which this pool can be known — which is
    // exactly the launcher's situation: the pool is seconds old and the caller has its receipt.
    // The pin also removes the recent-window pair scan wave 0 would otherwise run, so the
    // zero-getLogs assertion proves the ingest path needs no logs — NOT that mainnet launchers
    // see zero scans (they get one bounded recent-window scan; see waves.ts "WAVE 0 IS A LATENCY BUDGET").
    const head = await anvil.publicClient.getBlockNumber()
    const manifest = forkManifest({ v4: { ...MAINNET_MANIFEST.v4!, deploymentBlock: head + 1_000n } })

    const control = countingClient(anvil.rpcUrl)
    const blind = createRouter({ client: control.client, manifest })
    const nothing = await blind.getSwap({
      tokenIn: hidden.tokenIn,
      tokenOut: hidden.tokenOut,
      amountIn: AMOUNT_IN,
      trader: INGEST_TRADER,
    })
    // The control run scans everything it is allowed to scan and still finds nothing: proof that
    // the ingestion in the next paragraph is the only reason the search below succeeds.
    assertResultCoherent(nothing)
    expect(nothing.status).toBe('no-route')

    const counting = countingClient(anvil.rpcUrl)
    const router = createRouter({ client: counting.client, manifest })
    router.ingestReceipt(hidden.receipt)

    const ready = readySwap(
      await router.getSwap({
        tokenIn: hidden.tokenIn,
        tokenOut: hidden.tokenOut,
        amountIn: AMOUNT_IN,
        trader: INGEST_TRADER,
      }),
    )
    expect(counting.count('eth_getLogs')).toBe(0)
    expect(routeProtocols(ready.best.route)).toEqual(['v4'])
    expect(ready.best.route.legs[0]!.pool).toEqual(hidden.ref)

    const { receipt, delta } = await executeSwap(anvil, {
      trader: INGEST_TRADER,
      tx: ready.tx,
      currencyOut: hidden.tokenOut,
    })
    expect(receipt.status).toBe('success')
    expect(delta).toBeGreaterThanOrEqual(minAmountOut(ready.best.quote.amountOut))
    expect(delta).toBe(ready.best.quote.amountOut)
  }, 300_000)

  it('cold, with an honest deployment floor: the wave-0 exact-pair scan finds the same pool', async () => {
    // Same world, same pool, a brand-new router that was told nothing. The fee tier is still
    // unguessable, so the Initialize scan is the only thing that can produce this route — and the
    // pair scan alone is enough: no adjacency wave has to run.
    const counting = countingClient(anvil.rpcUrl)
    const router = createRouter({ client: counting.client, manifest: forkManifest() })

    const result = await router.getSwap({
      tokenIn: hidden.tokenIn,
      tokenOut: hidden.tokenOut,
      amountIn: AMOUNT_IN,
      trader: COLD_TRADER,
    })
    const ready = readySwap(result)
    expect(ready.best.route.legs[0]!.pool).toEqual(hidden.ref)

    const queries = classifyLogQueries(counting.logQueries)
    expect(queries.exactPair).toBeGreaterThan(0)
    expect(queries.adjacency).toBe(0)
    // Everything scanned lives on the fork: the pinned floor keeps the scan off mainnet history.
    for (const q of counting.logQueries) expect(BigInt((q as { fromBlock: bigint }).fromBlock)).toBeGreaterThanOrEqual(FORK_BLOCK)

    const { receipt, delta } = await executeSwap(anvil, {
      trader: COLD_TRADER,
      tx: ready.tx,
      currencyOut: hidden.tokenOut,
    })
    expect(receipt.status).toBe('success')
    expect(delta).toBeGreaterThanOrEqual(minAmountOut(ready.best.quote.amountOut))
    expect(delta).toBe(ready.best.quote.amountOut)
  }, 300_000)

  it('a two-hop through an unknown intermediate: only an adjacency scan can reach it', async () => {
    // MID is a token no manifest lists and no probe would try. The only pools that exist are
    // GAMMA/MID (v4, unguessable tier) and MID/DELTA (v2), so the pair scan for (GAMMA, DELTA)
    // finds nothing and the core-intermediate probes find nothing: the search has to scan an
    // endpoint's adjacency, learn MID from it, and probe onward from there.
    const gamma = await world.deployToken('DiscGamma')
    const mid = await world.deployToken('DiscMid')
    const delta = await world.deployToken('DiscDelta')
    await world.createV4Pool(gamma, mid, { ...UNGUESSABLE, liquidity: 10n ** 22n, priceApprox: 1 })
    await world.createV2Pool(mid, delta, 1_000_000n * 10n ** 18n, 3_000_000n * 10n ** 18n)

    await world.fundTrader(HOP_TRADER, { eth: parseEther('10'), tokens: [[gamma, AMOUNT_IN]] })
    await world.approvePermit2(HOP_TRADER, gamma, { toRouter: true })

    const counting = countingClient(anvil.rpcUrl)
    const router = createRouter({ client: counting.client, manifest: forkManifest() })

    const ready = readySwap(
      await router.getSwap({ tokenIn: gamma, tokenOut: delta, amountIn: AMOUNT_IN, trader: HOP_TRADER }),
    )
    expect(routeProtocols(ready.best.route)).toEqual(['v4', 'v2'])
    expect(ready.best.route.legs[0]!.currencyOut).toBe(mid)
    expect(classifyLogQueries(counting.logQueries).adjacency).toBeGreaterThan(0)

    const { receipt, delta: received } = await executeSwap(anvil, {
      trader: HOP_TRADER,
      tx: ready.tx,
      currencyOut: delta,
    })
    expect(receipt.status).toBe('success')
    expect(received).toBeGreaterThanOrEqual(minAmountOut(ready.best.quote.amountOut))
    expect(received).toBe(ready.best.quote.amountOut)
  }, 300_000)

  it('seven pools for one pair, cap of six (MAX_POOLS_DIRECT): the newest survives on the reserved slot and wins the quote', async () => {
    // C4-P7: the direct-pair cap was raised from 3 to 6 (MAX_POOLS_DIRECT) specifically so the
    // COMMON major-pair shape — one v2 pool, the four standard v3 fee tiers, one v4 pool — fits with
    // nothing pruned (see the "6th direct pool" unit test in candidates.test.ts). 6 is not a ceiling
    // that covers every real pool set: a pair that ALSO carries all four standard v4 tiers (v2 + 4 v3
    // + 4 v4 = 9) still prunes 3 (see `constants.ts#MAX_POOLS_DIRECT`'s doc comment). This test is
    // about the boundary one pool past the common-shape fit: six standard pools (mixed here as four
    // v4 tiers + one v2 + one v3, rather than the doc comment's four-v3 mix — the reserved-slot
    // mechanics below don't care which protocol supplies the four) are found by wave-0 probes, which
    // also marks them recently-successful — the strongest signal in the per-pair priority order. The
    // seventh is created last, on an unguessable tier, and can only arrive via the pair scan with no
    // success history at all, so ordinary priority puts it dead last and the cap would drop it. It is
    // also, deliberately, by far the deepest pool: if the reserved newest-pool slot did not exist, the
    // search would quote a strictly worse route and never know.
    const rich = await world.deployToken('DiscRich')
    const poor = await world.deployToken('DiscPoor')
    for (const config of [
      { fee: 100, tickSpacing: 1 },
      { fee: 500, tickSpacing: 10 },
      { fee: 3000, tickSpacing: 60 },
      { fee: 10000, tickSpacing: 200 },
    ]) {
      await world.createV4Pool(rich, poor, { ...config, liquidity: 10n ** 21n, priceApprox: 1 })
    }
    // Two more standard, wave-0-guessable pools on the SAME pair — a v2 pool and a v3 pool — so the
    // direct pair holds six ordinarily-ranked pools before the newest (unguessable) one ever enters.
    // Sized the same as the four v4 pools above (NOT the newest pool's 1000x-deeper liquidity): the
    // point is six comparably-shallow candidates losing to one much deeper one, not a second deep pool
    // that would legitimately outprice "newest" on its own merits.
    await world.createV2Pool(rich, poor, 10n ** 21n, 10n ** 21n)
    await world.createV3Pool(rich, poor, 3000, { liquidity: 10n ** 21n, priceApprox: 1 })
    const newest = await world.createV4Pool(rich, poor, {
      ...UNGUESSABLE,
      liquidity: 10n ** 24n, // ~1000x the others: deep enough that its price impact is negligible
      priceApprox: 1,
    })

    await world.fundTrader(CAP_TRADER, { eth: parseEther('10'), tokens: [[rich, AMOUNT_IN]] })
    await world.approvePermit2(CAP_TRADER, rich, { toRouter: true })

    const router = createRouter({ client: anvil.publicClient, manifest: forkManifest() })
    const result = await router.getSwap({
      tokenIn: rich,
      tokenOut: poor,
      amountIn: AMOUNT_IN,
      trader: CAP_TRADER,
    })
    const ready = readySwap(result)

    expect(ready.best.route.legs[0]!.pool).toEqual(newest.ref)
    // Seven pools, six slots (MAX_POOLS_DIRECT): the one that lost is reported rather than silently
    // dropped. The report no longer counts pruned pools by name — pools left unmeasured on a pair are
    // what `pairCeilingHit` says, and it is what forfeits `exhaustiveWithinMaxHops` here.
    expect(ready.search.enumeration.pairCeilingHit).toBe(true)
    expect(ready.search.enumeration.exhaustiveWithinMaxHops).toBe(false)
    // All six standard pools quoted successfully, which is what puts every one of them AHEAD of the
    // newest pool in the per-pair priority order (a recent quote success outranks a recent creation).
    // With a cap of six, ordinary priority would therefore have dropped the newest pool outright — so
    // the fact that it is here at all, and leading, is the reserved slot doing its job.
    expect(ready.alternatives).toHaveLength(6)
    // The newest pool is 1000x deeper, so its quote must beat every alternative that was quoted.
    for (const alternative of ready.alternatives) {
      expect(ready.best.quote.amountOut).toBeGreaterThan(alternative.quote.amountOut)
    }

    const { receipt, delta } = await executeSwap(anvil, {
      trader: CAP_TRADER,
      tx: ready.tx,
      currencyOut: poor,
    })
    expect(receipt.status).toBe('success')
    expect(delta).toBeGreaterThanOrEqual(minAmountOut(ready.best.quote.amountOut))
    expect(delta).toBe(ready.best.quote.amountOut)
  }, 300_000)
})
