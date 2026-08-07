import { createRouter, type Router } from '@uniswap/router-lite-sdk'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { parseEther, type Address } from 'viem'

import { forkTestsEnabled, startAnvilFork, type AnvilClient } from './anvil'
import {
  balanceOf,
  executeSwap,
  forkManifest,
  minAmountOut,
  readySwap,
  routeProtocols,
  USDC,
  WETH,
} from './e2e'
import { createWorld, type World } from './worldBuilder'

// ---------------------------------------------------------------------------
// Mixed-protocol routes — the definitive test of chained quoting.
//
// A two-hop route that crosses a protocol boundary is quoted in two rounds:
// round 1 quotes segment 1, and its REALIZED output becomes round 2's input.
// Execution mirrors that with custody: segment 1 delivers into the router,
// segment 2 spends the router's balance (`CONTRACT_BALANCE`), and any
// native-family disagreement between them is bridged by a wrap/unwrap.
//
// If the two rounds and the two operations ever disagree — a chained amount
// that isn't what the first segment really produces, a conversion in the wrong
// place, a settle that takes the wrong currency — the executed output stops
// equalling the composed quote. So that is what every test here asserts, to
// the wei, against a world whose liquidity we chose.
//
// The four shapes, in the order the risk goes up:
//   v2 only            the arithmetic oracle: `expectedV2Out` from the pool's
//                      own reserves must equal the quote exactly
//   v4 -> v4           NOT mixed, and that is the point: two same-protocol legs
//                      merge into ONE whole-path segment, so there is no
//                      boundary, no chained round, and no custody hand-off
//   v4 -> v3           two protocols, one ERC-20 intermediate (WETH), the
//                      composed quote executed
//   v2 -> v4           the same, but the intermediate changes FORM: v2 hands
//                      over wrapped native, v4 wants native, so an intermediate
//                      unwrap has to appear and be funded correctly
//
// THE SEGMENT-BOUNDARY RULE, pinned by the v4->v4 case against the two mixed
// ones: a route is split into segments of CONTIGUOUS same-protocol legs (v2
// legs always solo), one segment per quoting round and per execution operation.
// `quote.intermediateAmounts` records the realized amount at each boundary, so
// its length is (segments - 1): two v4 legs are one segment and report `[]`,
// while any of the mixed pairs below is two segments and reports exactly one
// amount. If that ever inverts, quoting and custody have drifted apart.
// ---------------------------------------------------------------------------

const RUN = forkTestsEnabled()

const V2_TRADER: Address = '0x00000000000000000000000000000000000a1c01'
const MIXED_TRADER: Address = '0x00000000000000000000000000000000000a1c02'
const WRAP_TRADER: Address = '0x00000000000000000000000000000000000a1c03'
const V4_ONLY_TRADER: Address = '0x00000000000000000000000000000000000a1c04'

/** Universal Router: nothing may be left behind in it after a mixed trade settles. */
const UNIVERSAL_ROUTER = forkManifest().execution!.address

describe.skipIf(!RUN)('mixed-protocol routes, executed (fork)', () => {
  let anvil: AnvilClient
  let world: World
  let router: Router

  beforeAll(async () => {
    anvil = await startAnvilFork({ port: 8647 })
    world = createWorld(anvil)
    router = createRouter({ client: anvil.publicClient, manifest: forkManifest() })
  }, 300_000)

  afterAll(async () => {
    await anvil?.stop()
  })

  it('v2 only: the quote equals the pool reserves\' own constant-product answer, to the wei', async () => {
    const alpha = await world.deployToken('MixAlpha')
    const beta = await world.deployToken('MixBeta')
    const pool = await world.createV2Pool(alpha, beta, 1_000_000n * 10n ** 18n, 250_000n * 10n ** 18n)

    const amountIn = 5_000n * 10n ** 18n
    await world.fundTrader(V2_TRADER, { eth: parseEther('10'), tokens: [[alpha, amountIn]] })
    await world.approvePermit2(V2_TRADER, alpha, { toRouter: true })

    // Ground truth, computed by the harness from the pair's actual reserves — never from the SDK.
    const expected = await world.expectedV2Out(amountIn, pool, alpha)
    expect(expected).toBeGreaterThan(0n)

    const ready = readySwap(await router.getSwap({ tokenIn: alpha, tokenOut: beta, amountIn, trader: V2_TRADER }))
    expect(routeProtocols(ready.best.route)).toEqual(['v2'])
    expect(ready.best.quote.amountOut).toBe(expected)
    expect(ready.best.quote.intermediateAmounts).toEqual([])

    const { receipt, delta } = await executeSwap(anvil, { trader: V2_TRADER, tx: ready.tx, currencyOut: beta })
    expect(receipt.status).toBe('success')
    expect(delta).toBeGreaterThanOrEqual(minAmountOut(ready.best.quote.amountOut))
    expect(delta).toBe(expected)
  }, 300_000)

  it('v4 -> v4: two legs, ONE whole-path segment — no intermediate amount, and the executed output is the quote', async () => {
    // Three synthetic tokens and two v4 pools sharing the middle one. Nothing else on mainnet trades
    // any of them, so the only route that can exist is the two-hop, and it is same-protocol: the
    // segmenter must merge both legs into a single v4 whole-path swap that is quoted in ONE
    // `quoteExactInput` call and executed as ONE V4_SWAP command.
    const alpha = await world.deployToken('V4Alpha')
    const middle = await world.deployToken('V4Middle')
    const omega = await world.deployToken('V4Omega')
    const first = await world.createV4Pool(alpha, middle, {
      fee: 3000,
      tickSpacing: 60,
      liquidity: 10n ** 21n,
      priceApprox: 1,
    })
    const second = await world.createV4Pool(middle, omega, {
      fee: 3000,
      tickSpacing: 60,
      liquidity: 10n ** 21n,
      priceApprox: 1,
    })
    if (first.ref.protocol !== 'v4' || second.ref.protocol !== 'v4') throw new Error('unreachable')

    const amountIn = 10n ** 18n
    await world.fundTrader(V4_ONLY_TRADER, { eth: parseEther('10'), tokens: [[alpha, amountIn]] })
    await world.approvePermit2(V4_ONLY_TRADER, alpha, { toRouter: true })

    // Hinted for the same reason the mixed cases are: discovery has its own suite, and this one is
    // about segmentation and whole-path execution.
    const ready = readySwap(
      await router.getSwap({
        tokenIn: alpha,
        tokenOut: omega,
        amountIn,
        trader: V4_ONLY_TRADER,
        hints: [
          { protocol: 'v4', poolKey: first.ref.poolKey },
          { protocol: 'v4', poolKey: second.ref.poolKey },
        ],
      }),
    )
    expect(routeProtocols(ready.best.route)).toEqual(['v4', 'v4'])
    expect(ready.best.route.legs[0]!.currencyOut).toBe(middle)
    expect(ready.best.route.legs[1]!.currencyIn).toBe(middle)
    // THE CONTRAST (see the segment-boundary rule at the top of this file): two contiguous v4 legs
    // are ONE segment, so there is no boundary at which an intermediate amount could be realized.
    // The mixed tests below cross a protocol boundary and therefore report exactly one.
    expect(ready.best.quote.intermediateAmounts).toEqual([])

    const { receipt, delta } = await executeSwap(anvil, { trader: V4_ONLY_TRADER, tx: ready.tx, currencyOut: omega })
    expect(receipt.status).toBe('success')
    expect(delta).toBeGreaterThanOrEqual(minAmountOut(ready.best.quote.amountOut))
    expect(delta).toBe(ready.best.quote.amountOut)
    // The middle currency never becomes a router balance at all in a whole-path swap: it lives and
    // dies as a delta inside the PoolManager's unlock.
    expect(await balanceOf(anvil, middle, UNIVERSAL_ROUTER)).toBe(0n)
  }, 300_000)

  it('v4 -> v3 through WETH: the composed two-round quote is exactly what executes', async () => {
    // Leg 1 is synthetic (a token that exists nowhere else, on a v4 pool we shaped); leg 2 is the
    // real mainnet WETH/USDC 0.05% pool. So the route can only be found by chaining across a
    // protocol boundary, and its quote can only be right if both rounds are.
    const fresh = await world.deployToken('MixFresh')
    const { ref } = await world.createV4Pool(fresh, WETH, {
      fee: 3000,
      tickSpacing: 60,
      liquidity: 10n ** 20n,
      priceApprox: 0.001, // 1 FRESH = 0.001 WETH
    })
    if (ref.protocol !== 'v4') throw new Error('unreachable')

    const amountIn = 100n * 10n ** 18n
    await world.fundTrader(MIXED_TRADER, { eth: parseEther('10'), tokens: [[fresh, amountIn]] })
    await world.approvePermit2(MIXED_TRADER, fresh, { toRouter: true })

    // Both pools are hinted. Finding them is discovery's job and is proven in `discovery.fork.test.ts`
    // against synthetic worlds; hinting here keeps this suite on its own subject (chained quoting and
    // mixed custody) and keeps it off the speculative fan-out over real mainnet majors, which turns a
    // two-second search into a multi-minute one against a public archive endpoint.
    const ready = readySwap(
      await router.getSwap({
        tokenIn: fresh,
        tokenOut: USDC,
        amountIn,
        trader: MIXED_TRADER,
        hints: [
          { protocol: 'v4', poolKey: ref.poolKey },
          { protocol: 'v3', token0: WETH, token1: USDC, fee: 500 },
        ],
      }),
    )
    const protocols = routeProtocols(ready.best.route)
    expect(protocols).toHaveLength(2)
    expect(protocols[0]).toBe('v4')
    expect(new Set(protocols).size).toBe(2) // a genuine protocol boundary, not two v4 legs
    // Exactly one segment boundary, and the realized amount that crossed it is recorded.
    expect(ready.best.quote.intermediateAmounts).toHaveLength(1)
    expect(ready.best.quote.intermediateAmounts[0]).toBeGreaterThan(0n)

    const { receipt, delta } = await executeSwap(anvil, { trader: MIXED_TRADER, tx: ready.tx, currencyOut: USDC })
    expect(receipt.status).toBe('success')
    expect(delta).toBeGreaterThanOrEqual(minAmountOut(ready.best.quote.amountOut))
    expect(delta).toBe(ready.best.quote.amountOut)

    // The hand-off was complete: nothing of the intermediate currency stayed in the router.
    expect(await balanceOf(anvil, WETH, UNIVERSAL_ROUTER)).toBe(0n)
  }, 300_000)

  it('v2 -> v4 across the native boundary: the intermediate unwrap runs on-chain and nothing is stranded', async () => {
    // v2 can only ever hold WRAPPED native; this v4 pool is a NATIVE pool (currency0 = address(0)).
    // The route therefore needs a conversion in the middle — the one place a plan's wrap/unwrap is
    // funded by a balance rather than a known amount.
    const seed = await world.deployToken('MixSeed')
    const omega = await world.deployToken('MixOmega')
    await world.createV2Pool(seed, WETH, 1_000_000n * 10n ** 18n, 100n * 10n ** 18n)
    await world.createV4Pool('native', omega, {
      fee: 3000,
      tickSpacing: 60,
      liquidity: 10n ** 20n,
      priceApprox: 1,
    })

    const amountIn = 1_000n * 10n ** 18n
    await world.fundTrader(WRAP_TRADER, { eth: parseEther('10'), tokens: [[seed, amountIn]] })
    await world.approvePermit2(WRAP_TRADER, seed, { toRouter: true })

    const ready = readySwap(
      await router.getSwap({ tokenIn: seed, tokenOut: omega, amountIn, trader: WRAP_TRADER }),
    )
    expect(routeProtocols(ready.best.route)).toEqual(['v2', 'v4'])
    // The v4 leg speaks native: the candidate materialized address(0) as the 'native' CurrencyRef.
    expect(ready.best.route.legs[1]!.currencyIn).toBe('native')
    expect(ready.best.quote.intermediateAmounts).toHaveLength(1)

    const routerEthBefore = await balanceOf(anvil, 'native', UNIVERSAL_ROUTER)
    const { receipt, delta } = await executeSwap(anvil, { trader: WRAP_TRADER, tx: ready.tx, currencyOut: omega })

    expect(receipt.status).toBe('success')
    expect(delta).toBeGreaterThanOrEqual(minAmountOut(ready.best.quote.amountOut))
    expect(delta).toBe(ready.best.quote.amountOut)
    // Neither form of the intermediate is left behind: the unwrap consumed the WETH, the v4 settle
    // consumed the ETH it produced.
    expect(await balanceOf(anvil, WETH, UNIVERSAL_ROUTER)).toBe(0n)
    expect(await balanceOf(anvil, 'native', UNIVERSAL_ROUTER)).toBe(routerEthBefore)
  }, 300_000)
})
