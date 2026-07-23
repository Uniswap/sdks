/**
 * Demo 04 — Delta-neutral hedge across sub-accounts.
 * Mirrors v4-periphery `MarginRouterHedge.fork.t.sol` (cross-venue): a Morpho long on subId 4 and
 * an Aave v3 short on subId 5, sized to the same ETH notional. The two positions live in isolated
 * MarginAccounts derived from the same owner, net ETH delta ≈ 0, and closing one leaves the other
 * untouched.
 */
import { parseUnits } from 'viem'

import { type Ctx, withAnvil } from './lib/env'
import {
  assert,
  assertApprox,
  deadline,
  deal,
  ensurePermit2,
  fmt,
  note,
  ok,
  quoteSwapInput,
  section,
  send,
} from './lib/helpers'
import {
  closePositionCall,
  collateralToBuyForLeverage,
  getMarginAccountAddress,
  getPosition,
  increasePositionCall,
  parseLeverageX18,
} from '../src'

const LONG_SUB_ID = 4n
const SHORT_SUB_ID = 5n

export async function run(ctx: Ctx): Promise<void> {
  const { addresses, deployer, longMarket, shortMarket, poolKey, weth, usdc } = ctx
  const router = addresses.marginRouter
  const morpho = addresses.lendingAdapters.morphoBlue!
  const aaveV3 = addresses.lendingAdapters.aaveV3!

  section('04 · Cross-venue hedge on sub-accounts (mirrors MarginRouterHedge.fork.t.sol)')

  await deal(ctx, weth, deployer, parseUnits('5', 18))
  await deal(ctx, usdc, deployer, parseUnits('20000', 6))
  await ensurePermit2(ctx, weth)
  await ensurePermit2(ctx, usdc)

  // Two distinct accounts from one owner — pure functions of (owner, subId).
  const longAccount = getMarginAccountAddress(1, deployer, LONG_SUB_ID)
  const shortAccount = getMarginAccountAddress(1, deployer, SHORT_SUB_ID)
  assert(longAccount !== shortAccount, `isolated accounts: long ${longAccount}, short ${shortAccount}`)

  // Leg 1 — 2x long on Morpho: 0.5 WETH equity → 1 WETH collateral (1 WETH of long exposure).
  const longEquity = parseUnits('0.5', 18)
  const leverage = parseLeverageX18(2)
  const longBuy = collateralToBuyForLeverage(longEquity, leverage)
  const longQuote = await quoteSwapInput(ctx, longMarket, longMarket.debt, longBuy, 50)
  await send(
    ctx,
    increasePositionCall({
      marginRouter: router,
      params: {
        adapter: morpho,
        market: longMarket,
        poolKey,
        equity: longEquity,
        collateralToBuy: longBuy,
        maxDebtIn: longQuote.capped,
        subId: LONG_SUB_ID,
        deadline: await deadline(ctx),
      },
    })
  )

  // Leg 2 — 2x short on Aave v3, sized so the WETH debt matches the long's WETH collateral.
  // Size from NEAR-SPOT (a tiny probe quote scaled up): a full-size exact-out quote embeds the
  // swap's own price impact, which would systematically oversize the short's debt draw.
  const probe = parseUnits('0.01', 18)
  const { quoted: probeUsdc } = await quoteSwapInput(ctx, longMarket, longMarket.debt, probe, 0)
  const targetShortNotional = 2n * longEquity
  const shortBuyUsdc = (probeUsdc * targetShortNotional) / probe
  const shortEquity = shortBuyUsdc // (L-1)/1 of a 2x: equity equals the bought amount
  const shortQuote = await quoteSwapInput(ctx, shortMarket, shortMarket.debt, shortBuyUsdc, 50)
  await send(
    ctx,
    increasePositionCall({
      marginRouter: router,
      params: {
        adapter: aaveV3,
        market: shortMarket,
        poolKey,
        equity: shortEquity,
        collateralToBuy: shortBuyUsdc,
        maxDebtIn: shortQuote.capped,
        subId: SHORT_SUB_ID,
        deadline: await deadline(ctx),
      },
    })
  )

  // Net ETH delta: long collateral (WETH held) vs short debt (WETH owed).
  const long = await getPosition(ctx.publicClient, { adapter: morpho, account: longAccount, market: longMarket })
  const short = await getPosition(ctx.publicClient, { adapter: aaveV3, account: shortAccount, market: shortMarket })
  note(`long: +${fmt(long.collateralAmount, 18, 'WETH')} · short: -${fmt(short.debtAmount, 18, 'WETH')}`)
  // The residual delta is each leg's real price impact + fee on the live 0.05% pool.
  assertApprox(short.debtAmount, long.collateralAmount, 150, 'net ETH delta ≈ 0 (within live-pool swap impact)')

  // Close the short; the long is untouched (accounts are fully isolated).
  const closeQuote = await quoteSwapInput(ctx, shortMarket, shortMarket.collateral, short.debtAmount, 100)
  await send(
    ctx,
    closePositionCall({
      marginRouter: router,
      params: {
        adapter: aaveV3,
        market: shortMarket,
        poolKey,
        maxCollateralIn: closeQuote.capped,
        subId: SHORT_SUB_ID,
        deadline: await deadline(ctx),
      },
    })
  )
  const shortAfter = await getPosition(ctx.publicClient, {
    adapter: aaveV3,
    account: shortAccount,
    market: shortMarket,
  })
  const longAfter = await getPosition(ctx.publicClient, { adapter: morpho, account: longAccount, market: longMarket })
  assert(shortAfter.debtAmount === 0n && shortAfter.collateralAmount === 0n, 'short leg closed')
  assert(longAfter.collateralAmount === long.collateralAmount, 'long collateral untouched by closing the short')
  // interest-accrued reads: the long's debt grows by a few wei across the blocks the close took
  assertApprox(longAfter.debtAmount, long.debtAmount, 1, 'long debt unchanged (± accrued interest)')

  ok('04 complete: one owner, two isolated positions, delta-neutral, independently unwindable')
}

if (import.meta.main) {
  await withAnvil(run)
}
