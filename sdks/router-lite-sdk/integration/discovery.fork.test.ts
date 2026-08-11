import { createRouter, MAINNET_MANIFEST, type PoolRef, type Router } from '@uniswap/router-lite-sdk'
import { assertResultCoherent } from '@uniswap/router-lite-sdk/experimental'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { parseEther, type Address, type TransactionReceipt } from 'viem'

import { FORK_BLOCK, forkTestsEnabled, startAnvilFork, type AnvilClient } from './anvil'
import {
  classifyLogQueries,
  convergedSwap,
  countingClient,
  executeSwap,
  forkManifest,
  minAmountOut,
  readySwap,
  routeProtocols,
} from './e2e'
import { createWorld, type World } from './worldBuilder'

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
//   measurement     seven pools on one pair, the seventh reachable only via the
//                   pair scan and by far the deepest: every one of them is
//                   measured (there is no per-pair selection any more, only the
//                   128-pool abuse backstop), so the deepest wins on arithmetic.
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
const MEASURE_TRADER: Address = '0x00000000000000000000000000000000000d15c4'

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

  it('cold, with an honest deployment floor: the exact-pair Initialize scan finds the same pool', async () => {
    // Same world, same pool, a brand-new router that was told nothing. The fee tier is still
    // unguessable, so the Initialize scan is the only thing that can produce this route.
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
    // NO `adjacency === 0` CLAIM ANY MORE (C4-T14). This test used to assert it, on the wave engine's
    // ordering: wave 0 was the pair scan, and adjacency was a LATER wave that only ran if wave 0 came
    // back empty. There are no waves. `search/coverage.ts` scans an eager exact-pair slice up front
    // and then opens one gate — `search/loop.ts`'s `demandFull()`, taken when the pump goes DRY with
    // the verifier idle — after which every scope's scans go out concurrently. "Dry" means no leg is
    // left to measure, NOT "the pair scan came back empty", and on this pair none of the six
    // derivable pools exist, so the search goes dry (and opens the gate) while the exact-pair
    // `eth_getLogs` is still in flight. The adjacency and fee scans that follow are correct
    // behaviour, and an assertion that forbade them was pinning a schedule rather than a result.
    //
    // The cost guarantee that DID survive is the one about not needing scans at all when the caller
    // already knows the pool — see the ingest test above, which still asserts `eth_getLogs === 0`.
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

  it('seven pools on one pair: EVERY one is measured, the abuse ceiling stays untouched, and the deepest wins', async () => {
    // MEASUREMENT-FIRST, on the shape that used to be a selection problem.
    //
    // Until C4-T3 this pair was a contest: `MAX_POOLS_DIRECT` admitted six pools per pair, ordinary
    // priority ranked the seventh dead last (created last, on an unguessable tier, with no quote
    // success behind it), and a reserved "newest pool" slot was what kept it from being dropped
    // unmeasured. That whole mechanism is gone. There is no per-pair selection to lose any more — the
    // pump measures every pool it knows about on the pair, and the only per-pair limit left is
    // `MEASUREMENT_PAIR_CEILING` (128), an abuse backstop against pool-spam pairs rather than a cap
    // any honest pair reaches.
    //
    // So this test asserts the new contract on the OLD adversarial world, unchanged: seven pools, the
    // seventh reachable only through the pair scan and by far the deepest. Under the old cap, ordinary
    // priority would have dropped it and the search would have quoted a strictly worse route without
    // ever knowing. Under measurement-first, all seven are measured (nothing had to survive anything),
    // `pairCeilingHit` stays false at 7 << 128, and the deepest pool wins on its own numbers.
    //
    // IT CONVERGES THE SEARCH RATHER THAN CALLING `getSwap` — see `e2e.ts#convergedSwap` for why.
    // "Every pool was measured" is a claim about a FINISHED search, and `getSwap` deliberately returns
    // at the first verified lead: six of these seven pools are derivable by `hypotheses` and get
    // measured, ranked and verified while the pair scan that finds the seventh is still in flight.
    const rich = await world.deployToken('DiscRich')
    const poor = await world.deployToken('DiscPoor')
    const allPools: PoolRef[] = []
    for (const config of [
      { fee: 100, tickSpacing: 1 },
      { fee: 500, tickSpacing: 10 },
      { fee: 3000, tickSpacing: 60 },
      { fee: 10000, tickSpacing: 200 },
    ]) {
      allPools.push((await world.createV4Pool(rich, poor, { ...config, liquidity: 10n ** 21n, priceApprox: 1 })).ref)
    }
    // Two more speculatively-guessable pools on the SAME pair — a v2 pool and a v3 pool — so the pair
    // holds six pools every protocol module can hypothesise before the seventh (unguessable) one ever
    // enters. Sized the same as the four v4 pools above (NOT the deepest pool's 1000x liquidity): the
    // point is six comparably-shallow candidates losing to one much deeper one, not a second deep pool
    // that would legitimately outprice it on its own merits.
    allPools.push(await world.createV2Pool(rich, poor, 10n ** 21n, 10n ** 21n))
    // `createV3Pool`'s `liquidity` is a REQUEST, not a setting, and it overshoots. It has no liquidity
    // argument to pass on: it hands the NFPM the amounts `fullRangeAmounts` derives, which carry a
    // deliberate 2% headroom, as `amountDesired` with `amountMin: 0` — so the pool ends up with ~1.02x
    // what was asked for, where `createV4Pool` states its liquidity outright and lands on exactly it.
    // Divided back out here so this pool is genuinely the same depth as the four v4 pools above; at
    // `AMOUNT_IN` (a trade the size of the whole pool) 2% of depth is worth far more than the fee
    // difference between tiers, and an uncompensated v3 pool quietly out-prices every v4 pool it was
    // supposed to be level with.
    allPools.push(await world.createV3Pool(rich, poor, 3000, { liquidity: (10n ** 21n * 100n) / 102n, priceApprox: 1 }))
    const deepest = await world.createV4Pool(rich, poor, {
      ...UNGUESSABLE,
      liquidity: 10n ** 24n, // ~1000x the others: deep enough that its price impact is negligible
      priceApprox: 1,
    })
    allPools.push(deepest.ref)

    await world.fundTrader(MEASURE_TRADER, { eth: parseEther('10'), tokens: [[rich, AMOUNT_IN]] })
    await world.approvePermit2(MEASURE_TRADER, rich, { toRouter: true })

    const router = createRouter({ client: anvil.publicClient, manifest: forkManifest() })
    const ready = readySwap(
      await convergedSwap(router, { tokenIn: rich, tokenOut: poor, amountIn: AMOUNT_IN, trader: MEASURE_TRADER }),
    )

    // The deepest pool leads — and under measurement-first that is a statement about ARITHMETIC, not
    // about surviving a selection step: it is here because every pool on the pair was measured.
    expect(ready.best.route.legs[0]!.pool).toEqual(deepest.ref)

    // Seven pools, seven direct routes priced: `best` plus six alternatives, one per pool, and the set
    // of pools they cross is exactly the seven created above. This is the measurement-first claim
    // stated as something a cap COULD NOT satisfy — under the old six-slot cap one of these pools was
    // never measured at all, so this assertion is the one that fails if per-pair selection returns.
    const pricedPools = [ready.best, ...ready.alternatives].map((r) => JSON.stringify(r.route.legs[0]!.pool))
    expect(new Set(pricedPools).size).toBe(7)
    expect(new Set(pricedPools)).toEqual(new Set(allPools.map((ref) => JSON.stringify(ref))))

    // 7 is nowhere near `MEASUREMENT_PAIR_CEILING` (128), so the abuse backstop never fires — and with
    // nothing left unmeasured on the pair, the search does not forfeit exhaustiveness the way the
    // capped one did.
    expect(ready.search.enumeration.pairCeilingHit).toBe(false)
    // One leg per pool at one amount, deduped by (pool, direction, amount) — so the leg ledger is the
    // second, independent witness that all seven were measured rather than six-and-a-survivor.
    expect(ready.search.enumeration.legsMeasured).toBeGreaterThanOrEqual(7)
    // The deepest pool is 1000x the others, so its quote must beat every alternative that was priced.
    for (const alternative of ready.alternatives) {
      expect(ready.best.quote.amountOut).toBeGreaterThan(alternative.quote.amountOut)
    }

    const { receipt, delta } = await executeSwap(anvil, {
      trader: MEASURE_TRADER,
      tx: ready.tx,
      currencyOut: poor,
    })
    expect(receipt.status).toBe('success')
    expect(delta).toBeGreaterThanOrEqual(minAmountOut(ready.best.quote.amountOut))
    expect(delta).toBe(ready.best.quote.amountOut)
  }, 300_000)
})
