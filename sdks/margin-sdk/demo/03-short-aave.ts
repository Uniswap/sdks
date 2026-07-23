/**
 * Demo 03 — Short ETH through Aave v3 and Aave v4.
 * Mirrors v4-periphery `AaveLendingAdapter.fork.t.sol`, `AaveV4LendingAdapter.fork.t.sol`, and
 * `MarginRouterShortInverse.t.sol`: a short is the SAME `increasePosition` call with the market
 * pairing reversed — collateral USDC (6 decimals), debt WETH (18 decimals) — and the venue chosen
 * per call by adapter. The same read code serves every venue.
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
  fmtWad,
  note,
  ok,
  quoteSwapInput,
  routerEvent,
  section,
  send,
} from './lib/helpers'
import {
  type LendingVenue,
  closePositionCall,
  collateralToBuyForLeverage,
  getIsSupportedMarket,
  getMarginAccountAddress,
  getPosition,
  impliedLtv,
  increasePositionCall,
  parseLeverageX18,
  WAD,
} from '../src'

// One Aave position per (owner, subId): Aave health is account-wide, so each venue gets its own
// sub-account (the docs' §3.2 rule the router does not enforce for you).
const SUB_IDS: Partial<Record<LendingVenue, bigint>> = { aaveV3: 2n, aaveV4: 3n }

async function shortLifecycle(ctx: Ctx, venue: LendingVenue): Promise<void> {
  const { addresses, deployer, shortMarket: market, poolKey } = ctx
  const adapter = addresses.lendingAdapters[venue]!
  const router = addresses.marginRouter
  const subId = SUB_IDS[venue]!

  note(`— venue: ${venue} (adapter ${adapter}, subId ${subId}) —`)
  assert(
    await getIsSupportedMarket(ctx.publicClient, { adapter, market }),
    `USDC/WETH short market routable on ${venue}`
  )

  // Decimals reverse on a short: equity & collateralToBuy in 6-decimal USDC, maxDebtIn in
  // 18-decimal WETH. The SDK sizing is decimal-agnostic — direction comes from the market pairing.
  const equity = parseUnits('2000', 6)
  const leverage = parseLeverageX18(2)
  const collateralToBuy = collateralToBuyForLeverage(equity, leverage)
  const { quoted, capped: maxDebtIn } = await quoteSwapInput(ctx, market, market.debt, collateralToBuy, 50)
  note(
    `quote: buying ${fmt(collateralToBuy, 6, 'USDC')} costs ${fmt(quoted, 18, 'WETH')} → cap ${fmt(
      maxDebtIn,
      18,
      'WETH'
    )}`
  )

  const openReceipt = await send(
    ctx,
    increasePositionCall({
      marginRouter: router,
      params: {
        adapter,
        market,
        poolKey,
        equity,
        collateralToBuy,
        maxDebtIn,
        maxLtvAfter: impliedLtv(leverage) + parseUnits('0.05', 18),
        subId,
        deadline: await deadline(ctx),
      },
    })
  )
  const increased = routerEvent<{ collateral: string; debt: string; debtDrawn: bigint; maxLtv: bigint }>(
    openReceipt,
    'PositionIncreased'
  )
  assert(
    increased!.collateral.toLowerCase() === market.collateral.toLowerCase() &&
      increased!.debt.toLowerCase() === market.debt.toLowerCase(),
    'short direction is just the reversed (collateral, debt) pairing — no flag'
  )

  const account = getMarginAccountAddress(1, deployer, subId)
  const position = await getPosition(ctx.publicClient, { adapter, account, market })
  // Aave positionOf reads the rebasing aToken balance: allow index-rounding wei, unlike Morpho.
  assertApprox(position.collateralAmount, 2n * equity, 1, `2x short holds ≈${fmt(2n * equity, 6, 'USDC')} collateral`)
  assertApprox(position.currentLtv, WAD / 2n, 500, 'account-level LTV ≈ 50% at 2x')
  // Both Aave adapters surface the USDC reserve's 78% liquidation threshold as maxLtv (docs §10).
  assertApprox(position.maxLtv, parseUnits('0.78', 18), 100, `${venue} maxLtv ≈ the 78% USDC liquidation threshold`)
  note(
    `short live on ${venue}: ${fmt(position.collateralAmount, 6, 'USDC')} vs ${fmt(
      position.debtAmount,
      18,
      'WETH'
    )} debt, ` + `LTV ${fmtWad(position.currentLtv)}, HF ${fmtWad(position.healthFactorWad)}`
  )

  // Close it: sell USDC collateral, buy back the WETH debt (premium-inclusive on Aave v4).
  const closeQuote = await quoteSwapInput(ctx, market, market.collateral, position.debtAmount, 100)
  const closeReceipt = await send(
    ctx,
    closePositionCall({
      marginRouter: router,
      params: { adapter, market, poolKey, maxCollateralIn: closeQuote.capped, subId, deadline: await deadline(ctx) },
    })
  )
  const decreased = routerEvent<{ debtTotal: bigint; collateralTotal: bigint; collateralReturned: bigint }>(
    closeReceipt,
    'PositionDecreased'
  )
  assert(decreased?.debtTotal === 0n && decreased.collateralTotal === 0n, `${venue} short fully closed`)
  assertApprox(
    decreased!.collateralReturned,
    equity,
    200,
    `residual ≈ USDC equity (${fmt(decreased!.collateralReturned, 6, 'USDC')})`
  )
}

export async function run(ctx: Ctx): Promise<void> {
  section('03 · Short ETH on Aave v3 + Aave v4 (mirrors the Aave adapter fork tests)')

  await deal(ctx, ctx.usdc, ctx.deployer, parseUnits('50000', 6))
  await ensurePermit2(ctx, ctx.usdc)
  ok('dealt 50,000 USDC and completed the Permit2 setup')

  await shortLifecycle(ctx, 'aaveV3')
  await shortLifecycle(ctx, 'aaveV4')

  ok('03 complete: identical SDK code shorted ETH on two venues — only the adapter address changed')
}

if (import.meta.main) {
  await withAnvil(run)
}
