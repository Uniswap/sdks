/**
 * Demo 05 — The `execute` entry point and the owner escape hatch.
 * Mirrors v4-periphery `MarginRouterExecute.t.sol` / `MarginRouterExecute.fork.t.sol`:
 *  (a) rebuild the curated open as a raw MarginPlanner plan — the exact action sequence
 *      `MarginRouter._increase` encodes internally — and run it through `execute`;
 *  (b) repay debt straight from the wallet (a flow no curated entry point can express);
 *  (c) exit through the owner-only `MarginAccount.execute` escape hatch, bypassing the router.
 */
import { parseEventLogs, parseUnits } from 'viem'

import { type Ctx, withAnvil } from './lib/env'
import {
  assert,
  assertApprox,
  balanceOf,
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
  LENDING_ADAPTER_ABI,
  MARGIN_ACCOUNT_ABI,
  MarginPlanner,
  OPEN_DELTA,
  closePositionCall,
  collateralToBuyForLeverage,
  executeCall,
  getMarginAccountAddress,
  getPosition,
  impliedLtv,
  parseLeverageX18,
  swapZeroForOne,
} from '../src'

const SUB_ID = 6n

export async function run(ctx: Ctx): Promise<void> {
  const { addresses, deployer, longMarket: market, poolKey, weth, usdc } = ctx
  const adapter = addresses.lendingAdapters.morphoBlue!
  const router = addresses.marginRouter
  const account = getMarginAccountAddress(1, deployer, SUB_ID)

  section('05 · execute plans + owner escape hatch (mirrors the MarginRouterExecute tests)')

  await deal(ctx, weth, deployer, parseUnits('5', 18))
  await deal(ctx, usdc, deployer, parseUnits('5000', 6))
  await ensurePermit2(ctx, weth)
  await ensurePermit2(ctx, usdc)

  // -- (a) Manual open: the byte-level plan the curated increasePosition builds internally ------
  const equity = parseUnits('1', 18)
  const leverage = parseLeverageX18(2)
  const collateralToBuy = collateralToBuyForLeverage(equity, leverage)
  const { capped: maxDebtIn } = await quoteSwapInput(ctx, market, market.debt, collateralToBuy, 50)

  const openPlan = new MarginPlanner()
    .setAccount(SUB_ID) // bind (and lazily deploy) the caller's sub-account
    .pullToAccount(market.collateral, equity, true) // equity via Permit2, straight to the account
    .swapExactOutSingle({
      poolKey,
      zeroForOne: swapZeroForOne(market, market.debt, poolKey), // opens sell the debt
      amountOut: collateralToBuy,
      amountInMaximum: maxDebtIn, // the binding slippage cap, from a real quote
    })
    .assertFill(market.collateral, collateralToBuy) // all-or-nothing on thin pools
    .take(market.collateral, account, OPEN_DELTA) // bought collateral → the account
    .supplyCollateral(adapter, market, OPEN_DELTA) // supply the account's full balance
    .borrow(adapter, market, OPEN_DELTA, router) // draw exactly the swap's debt, to the router
    .settle(market.debt, OPEN_DELTA, false) // router pays the PoolManager
    .assertHealth(adapter, market, impliedLtv(leverage) + parseUnits('0.05', 18))
    .finalize()

  const openReceipt = await send(
    ctx,
    executeCall({ marginRouter: router, unlockData: openPlan, deadline: await deadline(ctx) })
  )
  // execute plans emit account-level events (not Position* snapshots) — decode with the SDK ABI.
  const accountEvents = parseEventLogs({ abi: MARGIN_ACCOUNT_ABI, logs: openReceipt.logs })
  const eventNames = accountEvents.map((event) => event.eventName)
  assert(eventNames.includes('CollateralSupplied') && eventNames.includes('Borrowed'), 'account-level events emitted')

  let position = await getPosition(ctx.publicClient, { adapter, account, market })
  assert(
    position.collateralAmount === 2n * equity,
    `manual plan opened the same 2x position: ${fmt(position.collateralAmount, 18, 'WETH')}`
  )
  assertApprox(
    position.currentLtv,
    impliedLtv(leverage),
    300,
    'manual open lands at impliedLtv(2x) like the curated flow'
  )

  // -- (b) Repay-from-wallet: inexpressible via the curated entry points ------------------------
  const repay = parseUnits('200', 6)
  const repayPlan = new MarginPlanner()
    .setAccount(SUB_ID)
    .pullToAccount(market.debt, repay, true) // USDC from the wallet into the account
    .repay(adapter, market, repay) // repay without selling any collateral
    .assertHealth(adapter, market, position.currentLtv + parseUnits('0.01', 18))
    .finalize()
  const debtBefore = position.debtAmount
  const repayReceipt = await send(
    ctx,
    executeCall({ marginRouter: router, unlockData: repayPlan, deadline: await deadline(ctx) })
  )
  const repaid = parseEventLogs({ abi: MARGIN_ACCOUNT_ABI, logs: repayReceipt.logs, eventName: 'Repaid' })
  assert(
    repaid.length === 1 && (repaid[0].args as { amount: bigint }).amount === repay,
    'Repaid event: exact wallet amount'
  )
  position = await getPosition(ctx.publicClient, { adapter, account, market })
  assertApprox(position.debtAmount, debtBefore - repay, 5, 'debt cut from the wallet; collateral untouched')

  // -- (c) Owner escape hatch: act on Morpho directly, no router involvement --------------------
  // The adapter is an encoder: read the exact (target, value, callData) the account would run.
  const withdraw = parseUnits('0.05', 18)
  const [, , callData] = await ctx.publicClient.readContract({
    address: adapter,
    abi: LENDING_ADAPTER_ABI,
    functionName: 'encodeWithdrawCollateral',
    args: [account, market, withdraw, deployer],
    account, // encode as the account would (adapters may bind the caller)
  })
  const wethBefore = await balanceOf(ctx, weth, deployer)
  await send(ctx, {
    address: account,
    abi: MARGIN_ACCOUNT_ABI,
    functionName: 'execute', // owner-only; forwards to the adapter's lendingProtocol()
    args: [adapter, callData],
  })
  assert(
    (await balanceOf(ctx, weth, deployer)) - wethBefore === withdraw,
    'escape hatch withdrew collateral to the owner, router bypassed'
  )
  const afterHatch = await getPosition(ctx.publicClient, { adapter, account, market })
  assert(
    afterHatch.collateralAmount === position.collateralAmount - withdraw,
    'position reflects the direct Morpho withdrawal'
  )
  note('the owner can always exit on the lending protocol directly — funds are never trapped behind the router')

  // Clean finish through the curated close.
  const closeQuote = await quoteSwapInput(ctx, market, market.collateral, afterHatch.debtAmount, 100)
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
  const final = await getPosition(ctx.publicClient, { adapter, account, market })
  assert(final.collateralAmount === 0n && final.debtAmount === 0n, 'position closed')

  ok('05 complete: a raw plan reproduced the curated open, repaid from the wallet, and exited via the escape hatch')
}

if (import.meta.main) {
  await withAnvil(run)
}
