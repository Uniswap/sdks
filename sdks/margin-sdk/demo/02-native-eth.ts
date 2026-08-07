/**
 * Demo 02 — Native-ETH equity flows.
 * Mirrors v4-periphery `MarginRouterNative.t.sol`: open a long funded with raw ETH as
 * `msg.value` (the router wraps to WETH — no ERC-20 or Permit2 approval needed for the equity),
 * top up collateral with native ETH, then close.
 */
import { parseUnits } from 'viem'

import { type Ctx, withAnvil } from './lib/env'
import {
  assert,
  assertApprox,
  balanceOf,
  deadline,
  fmt,
  note,
  ok,
  quoteSwapInput,
  routerEvent,
  section,
  send,
} from './lib/helpers'
import {
  addCollateralCall,
  closePositionCall,
  collateralToBuyForLeverage,
  getMarginAccountAddress,
  getPosition,
  increasePositionCall,
  parseLeverageX18,
} from '../src'

const SUB_ID = 1n

export async function run(ctx: Ctx): Promise<void> {
  const { addresses, deployer, longMarket: market, poolKey, weth } = ctx
  const adapter = addresses.lendingAdapters.morphoBlue!
  const router = addresses.marginRouter

  section('02 · Native-ETH equity (mirrors MarginRouterNative.t.sol)')

  const account = getMarginAccountAddress(1, deployer, SUB_ID)
  const equity = parseUnits('1', 18)
  const leverage = parseLeverageX18(2)
  const collateralToBuy = collateralToBuyForLeverage(equity, leverage)
  const { capped: maxDebtIn } = await quoteSwapInput(ctx, market, market.debt, collateralToBuy, 50)

  // Open with `nativeEquity`: the SDK sets the transaction value and requires equity == 0n.
  // The market collateral must be WETH or the router reverts NativeCollateralMismatch.
  const openReceipt = await send(
    ctx,
    increasePositionCall({
      marginRouter: router,
      params: {
        adapter,
        market,
        poolKey,
        equity: 0n,
        collateralToBuy,
        maxDebtIn,
        subId: SUB_ID,
        deadline: await deadline(ctx),
      },
      nativeEquity: equity,
    })
  )
  const increased = routerEvent<{ equity: bigint; collateralTotal: bigint }>(openReceipt, 'PositionIncreased')
  assert(increased?.equity === equity, 'msg.value became the position equity (wrapped to WETH)')
  assert(increased!.collateralTotal === 2n * equity, '2x native open holds exactly 2 WETH collateral')
  note(`opened with raw ETH: no ERC-20 approval, no Permit2 — value=${fmt(equity, 18, 'ETH')}`)

  // Top up collateral with native ETH too.
  const topUp = parseUnits('0.25', 18)
  await send(
    ctx,
    addCollateralCall({
      marginRouter: router,
      params: { adapter, market, amount: 0n, subId: SUB_ID, deadline: await deadline(ctx) },
      nativeAmount: topUp,
    })
  )
  const position = await getPosition(ctx.publicClient, { adapter, account, market })
  note(`collateral after native top-up: ${position.collateralAmount} (expected ${2n * equity + topUp})`)
  assert(position.collateralAmount === 2n * equity + topUp, 'native addCollateral credited the account in WETH')

  // Close: the residual comes back as the collateral token (WETH), not native ETH.
  const closeQuote = await quoteSwapInput(ctx, market, market.collateral, position.debtAmount, 100)
  const wethBefore = await balanceOf(ctx, weth, deployer)
  await send(
    ctx,
    closePositionCall({
      marginRouter: router,
      params: {
        adapter,
        market,
        poolKey,
        maxCollateralIn: closeQuote.capped,
        subId: SUB_ID,
        deadline: await deadline(ctx),
      },
    })
  )
  const residual = (await balanceOf(ctx, weth, deployer)) - wethBefore
  assertApprox(
    residual,
    equity + topUp,
    200,
    `close returned ≈ the ETH contributed, as WETH (${fmt(residual, 18, 'WETH')})`
  )

  ok('02 complete: native-ETH open, native top-up, close — equity never touched an approval')
}

if (import.meta.main) {
  await withAnvil(run)
}
