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
  demoRoute,
  note,
  ok,
  quoteSwapInput,
  section,
  send,
} from './lib/helpers'
import {
  LENDING_ADAPTER_ABI,
  MARGIN_ACCOUNT_ABI,
  MARGIN_ROUTER_ABI,
  MarginPlanner,
  OPEN_DELTA,
  buildV4ExactOutRoute,
  closePositionCall,
  collateralToBuyForLeverage,
  executeCall,
  getMarginAccountAddress,
  getPosition,
  impliedLtv,
  parseLeverageX18,
  withSlippageUp,
} from '../src'

const SUB_ID = 6n

export async function run(ctx: Ctx): Promise<void> {
  const { addresses, deployer, longMarket: market, weth, usdc } = ctx
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

  // The route the ROUTE_SWAP action runs: buy the collateral exact-output on the demo pool and
  // deliver it straight to the account (the route, not a TAKE, moves the output).
  const openRoute = buildV4ExactOutRoute({
    poolKey: ctx.poolKey,
    input: market.debt,
    output: market.collateral,
    amountOut: collateralToBuy,
    amountInMaximum: maxDebtIn,
    recipient: account,
  })
  const openPlan = new MarginPlanner()
    .setAccount(SUB_ID) // bind (and lazily deploy) the caller's sub-account
    .pullToAccount(market.collateral, equity, true) // equity via Permit2, straight to the account
    .routeSwap({
      universalRouter: ctx.universalRouter,
      input: market.debt,
      maxIn: maxDebtIn, // the binding slippage cap (the router's scoped Permit2 allowance)
      commands: openRoute.commands,
      inputs: openRoute.inputs,
    })
    .assertAccountBalance(market.collateral, equity + collateralToBuy) // all-or-nothing under-fill guard
    .supplyCollateral(adapter, market, OPEN_DELTA) // supply the account's full balance
    .borrow(adapter, market, OPEN_DELTA, router) // draw exactly the swap's debt, to the router
    .settle(market.debt, OPEN_DELTA, false) // router pays the PoolManager
    .assertHealth(adapter, market, impliedLtv(leverage) + parseUnits('0.05', 18))
    .finalize()

  const openReceipt = await send(
    ctx,
    executeCall({ marginRouter: router, unlockData: openPlan, deadline: await deadline(ctx) })
  )
  // execute plans emit account-level events plus a PositionUpdated snapshot per position mutation
  // (the curated-only Position* events do not fire) — decode with the SDK ABIs.
  const accountEvents = parseEventLogs({ abi: MARGIN_ACCOUNT_ABI, logs: openReceipt.logs })
  const eventNames = accountEvents.map((event) => event.eventName)
  assert(eventNames.includes('CollateralSupplied') && eventNames.includes('Borrowed'), 'account-level events emitted')
  const snapshots = parseEventLogs({ abi: MARGIN_ROUTER_ABI, logs: openReceipt.logs, eventName: 'PositionUpdated' })
  // one snapshot after the supply and one after the borrow; the LAST one is the resulting state
  assert(snapshots.length === 2, 'PositionUpdated snapshot emitted per mutation (indexers need no extra RPC)')

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
  const debtToBuy = withSlippageUp(afterHatch.debtAmount, 10) // accrual buffer: the route must buy >= live debt
  const closeQuote = await quoteSwapInput(ctx, market, market.collateral, debtToBuy, 100)
  await send(
    ctx,
    closePositionCall({
      marginRouter: router,
      params: {
        adapter,
        market,
        maxCollateralIn: closeQuote.capped,
        ...demoRoute(ctx, {
          input: market.collateral,
          output: market.debt,
          amountOut: debtToBuy,
          maxIn: closeQuote.capped,
          recipient: account,
        }),
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
