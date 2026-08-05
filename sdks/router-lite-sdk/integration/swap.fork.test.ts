import { createRouter, type Router } from '@uniswap/router-lite-sdk'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { parseEther, type Address } from 'viem'

import { forkTestsEnabled, startAnvilFork, type AnvilClient } from './anvil'
import { balanceOf, executeSwap, forkManifest, fundUsdc, minAmountOut, readySwap, USDC, WETH } from './e2e'
import { createWorld, type World } from './worldBuilder'

// ---------------------------------------------------------------------------
// Known mainnet pools, executed.
//
// Nothing here is synthetic: the pools are whatever Uniswap v2/v3/v4 actually
// held at FORK_BLOCK, and the SDK has to find them the way a caller would —
// no hints, no ingestion. Each test then does the thing a quote alone can
// never prove: it BROADCASTS the returned transaction from the trader and
// measures what landed.
//
// Two assertions per trade, and the second is the point:
//
//   delta >= minAmountOut       the calldata's own slippage floor held
//   delta === quote.amountOut   the quote was honest to the wei
//
// The exact form is only fair because the fork is quiet — no other transaction
// touches these pools between the pinned block the quote was taken at and the
// block the swap lands in — which makes any drift a real defect in quoting or
// encoding rather than market movement. It must never be relaxed into an
// approximation to make a run pass.
// ---------------------------------------------------------------------------

const RUN = forkTestsEnabled()

const USDC_IN = 10_000n * 10n ** 6n
const ETH_IN = parseEther('1')

const ERC20_TRADER: Address = '0x00000000000000000000000000000000000e2e01'
const NATIVE_IN_TRADER: Address = '0x00000000000000000000000000000000000e2e02'
const NATIVE_OUT_TRADER: Address = '0x00000000000000000000000000000000000e2e03'

describe.skipIf(!RUN)('swaps through known mainnet pools (fork)', () => {
  let anvil: AnvilClient
  let world: World
  let router: Router

  beforeAll(async () => {
    anvil = await startAnvilFork({ port: 8646 })
    world = createWorld(anvil)
    router = createRouter({ client: anvil.publicClient, manifest: forkManifest() })
  }, 300_000)

  afterAll(async () => {
    await anvil?.stop()
  })

  it('USDC -> WETH: ready, executed, and the WETH received is exactly the quote', async () => {
    await world.fundTrader(ERC20_TRADER, { eth: parseEther('10') })
    await fundUsdc(anvil, ERC20_TRADER, USDC_IN)
    await world.approvePermit2(ERC20_TRADER, USDC, { toRouter: true })

    const result = await router.getSwap({
      tokenIn: USDC,
      tokenOut: WETH,
      amountIn: USDC_IN,
      trader: ERC20_TRADER,
    })
    const ready = readySwap(result)
    expect(ready.best.quote.amountIn).toBe(USDC_IN)
    expect(ready.best.quote.amountOut).toBeGreaterThan(0n)
    expect(ready.tx.to).toBe(forkManifest().execution!.address)
    expect(ready.tx.value).toBe(0n) // an ERC-20 input is pulled through Permit2, never sent as value

    const usdcBefore = await balanceOf(anvil, USDC, ERC20_TRADER)
    const { receipt, delta } = await executeSwap(anvil, {
      trader: ERC20_TRADER,
      tx: ready.tx,
      currencyOut: WETH,
    })

    expect(receipt.status).toBe('success')
    expect(delta).toBeGreaterThanOrEqual(minAmountOut(ready.best.quote.amountOut))
    expect(delta).toBe(ready.best.quote.amountOut)
    // Exact-input really is exact: the trade spent the amount it was asked to spend, no more.
    expect(usdcBefore - (await balanceOf(anvil, USDC, ERC20_TRADER))).toBe(USDC_IN)
  }, 300_000)

  it('ETH -> USDC: native input is sent as value and the USDC received is exactly the quote', async () => {
    await world.fundTrader(NATIVE_IN_TRADER, { eth: parseEther('20') })

    const result = await router.getSwap({
      tokenIn: 'native',
      tokenOut: USDC,
      amountIn: ETH_IN,
      trader: NATIVE_IN_TRADER,
    })
    const ready = readySwap(result)
    // A native input needs no approval of any kind, so it goes straight to `ready` — and the
    // amount rides along as msg.value rather than through Permit2.
    expect(ready.tx.value).toBe(ETH_IN)

    const ethBefore = await balanceOf(anvil, 'native', NATIVE_IN_TRADER)
    const { receipt, delta, gasCost } = await executeSwap(anvil, {
      trader: NATIVE_IN_TRADER,
      tx: ready.tx,
      currencyOut: USDC,
    })

    expect(receipt.status).toBe('success')
    expect(delta).toBeGreaterThanOrEqual(minAmountOut(ready.best.quote.amountOut))
    expect(delta).toBe(ready.best.quote.amountOut)
    // The only ETH that left the trader is the input plus the fee — no dust stranded anywhere.
    expect(ethBefore - (await balanceOf(anvil, 'native', NATIVE_IN_TRADER))).toBe(ETH_IN + gasCost)
  }, 300_000)

  it('USDC -> ETH: the trailing unwrap delivers native, exactly the quote net of gas', async () => {
    await world.fundTrader(NATIVE_OUT_TRADER, { eth: parseEther('10') })
    await fundUsdc(anvil, NATIVE_OUT_TRADER, USDC_IN)
    await world.approvePermit2(NATIVE_OUT_TRADER, USDC, { toRouter: true })

    const result = await router.getSwap({
      tokenIn: USDC,
      tokenOut: 'native',
      amountIn: USDC_IN,
      trader: NATIVE_OUT_TRADER,
    })
    const ready = readySwap(result)
    expect(ready.tx.value).toBe(0n)

    const { receipt, delta } = await executeSwap(anvil, {
      trader: NATIVE_OUT_TRADER,
      tx: ready.tx,
      currencyOut: 'native',
    })

    expect(receipt.status).toBe('success')
    expect(delta).toBeGreaterThanOrEqual(minAmountOut(ready.best.quote.amountOut))
    expect(delta).toBe(ready.best.quote.amountOut)
    // Native out means the trader ends with no leftover WETH: the unwrap is the delivery.
    expect(await balanceOf(anvil, WETH, NATIVE_OUT_TRADER)).toBe(0n)
  }, 300_000)
})
