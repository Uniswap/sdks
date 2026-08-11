/**
 * Demo 01 — Full long lifecycle on Morpho Blue.
 * Mirrors v4-periphery `MarginRouterIntegration.t.sol` + `MarginRouterE2E.fork.t.sol`:
 * open a 2x long WETH/USDC, verify events and health, add collateral, add leverage with no new
 * equity, partially delever, then fully close and collect the residual.
 */
import { parseUnits } from 'viem'

import { type Ctx, withAnvil } from './lib/env'
import {
  assert,
  assertApprox,
  balanceOf,
  deadline,
  deal,
  ensurePermit2,
  fmt,
  fmtWad,
  note,
  ok,
  demoRoute,
  quoteSwapInput,
  routerEvent,
  section,
  send,
} from './lib/helpers'
import {
  FULL_CLOSE,
  addCollateralCall,
  closePositionCall,
  collateralToBuyForLeverage,
  decreasePositionCall,
  getPosition,
  getAccount,
  healthFactor,
  impliedLtv,
  increasePositionCall,
  isAccountDeployed,
  getIsAdapterAllowed,
  getIsSupportedMarket,
  parseLeverageX18,
  predictMarginAccountAddress,
  withSlippageUp,
} from '../src'

const SUB_ID = 0n

export async function run(ctx: Ctx): Promise<void> {
  const { addresses, deployer, longMarket: market, weth } = ctx
  const adapter = addresses.lendingAdapters.morphoBlue!
  const router = addresses.marginRouter

  section('01 · Long lifecycle on Morpho Blue (mirrors MarginRouterIntegration + E2E fork tests)')

  // -- 0. Preconditions read through SDK descriptors --------------------------------------------
  assert(await getIsAdapterAllowed(ctx.publicClient, { marginRouter: router, adapter }), 'Morpho adapter allowlisted')
  assert(await getIsSupportedMarket(ctx.publicClient, { adapter, market }), 'WETH/USDC long market routable on Morpho')

  // -- 1. Offchain account derivation matches the router ----------------------------------------
  const predicted = predictMarginAccountAddress({
    owner: deployer,
    subId: SUB_ID,
    marginRouter: router,
    accountImplementation: addresses.marginAccountImplementation,
  })
  const onchain = await getAccount(ctx.publicClient, { marginRouter: router, owner: deployer, subId: SUB_ID })
  assert(predicted === onchain, `predictMarginAccountAddress == router.accountOf (${predicted})`)
  assert(!(await isAccountDeployed(ctx.publicClient, predicted)), 'account not deployed yet (lazy CREATE2)')

  // -- 2. Fund equity + Permit2 setup ------------------------------------------------------------
  const equity = parseUnits('1', 18)
  await deal(ctx, weth, deployer, parseUnits('10', 18))
  await ensurePermit2(ctx, weth)
  ok('dealt 10 WETH and completed the two-step Permit2 approval')

  // -- 3. Size the swap from a REAL quote (never spot), then open 2x -----------------------------
  const leverage = parseLeverageX18(2)
  const collateralToBuy = collateralToBuyForLeverage(equity, leverage)
  const { quoted, capped: maxDebtIn } = await quoteSwapInput(ctx, market, market.debt, collateralToBuy, 50)
  note(
    `quote: buying ${fmt(collateralToBuy, 18, 'WETH')} costs ${fmt(quoted, 6, 'USDC')} → cap ${fmt(
      maxDebtIn,
      6,
      'USDC'
    )}`
  )

  const openReceipt = await send(
    ctx,
    increasePositionCall({
      marginRouter: router,
      params: {
        adapter,
        market,
        equity,
        collateralToBuy,
        maxDebtIn,
        // the route buys collateralToBuy exact-output and delivers it to the account
        ...demoRoute(ctx, {
          input: market.debt,
          output: market.collateral,
          amountOut: collateralToBuy,
          maxIn: maxDebtIn,
          recipient: predicted,
        }),
        maxLtvAfter: impliedLtv(leverage) + parseUnits('0.05', 18), // bound leverage by health too
        subId: SUB_ID,
        deadline: await deadline(ctx),
      },
    })
  )

  // -- 4. Events decode through the SDK ABI ------------------------------------------------------
  const created = routerEvent<{ owner: string; account: string; subId: bigint }>(openReceipt, 'AccountCreated')
  assert(created?.account === predicted, 'AccountCreated emitted for the predicted address')
  const increased = routerEvent<{
    equity: bigint
    collateralBought: bigint
    debtDrawn: bigint
    collateralTotal: bigint
    debtTotal: bigint
    currentLtv: bigint
    maxLtv: bigint
    healthFactorWad: bigint
  }>(openReceipt, 'PositionIncreased')
  assert(increased !== undefined, 'PositionIncreased emitted')
  assert(
    increased!.equity === equity && increased!.collateralBought === collateralToBuy,
    'event amounts match the request'
  )
  assert(increased!.debtDrawn <= maxDebtIn, 'debt drawn respected the binding maxDebtIn cap')
  note(`entry: ${fmt(increased!.debtDrawn, 6, 'USDC')} drawn against ${fmt(increased!.collateralTotal, 18, 'WETH')}`)

  // -- 5. Position state matches the SDK math ----------------------------------------------------
  let position = await getPosition(ctx.publicClient, { adapter, account: predicted, market })
  assert(position.collateralAmount === 2n * equity, `2x: collateral is exactly ${fmt(2n * equity, 18, 'WETH')}`)
  assertApprox(position.currentLtv, impliedLtv(leverage), 300, 'oracle LTV ≈ impliedLtv(2x) = 50%')
  assertApprox(
    healthFactor(position.maxLtv, position.currentLtv),
    position.healthFactorWad,
    1,
    'SDK healthFactor == onchain healthFactorWad'
  )
  note(
    `health: LTV ${fmtWad(position.currentLtv)} vs max ${fmtWad(position.maxLtv)} → HF ${fmtWad(
      position.healthFactorWad
    )}`
  )

  // -- 6. addCollateral improves health without touching debt ------------------------------------
  const topUp = parseUnits('0.5', 18)
  const addReceipt = await send(
    ctx,
    addCollateralCall({
      marginRouter: router,
      params: { adapter, market, amount: topUp, subId: SUB_ID, deadline: await deadline(ctx) },
    })
  )
  const added = routerEvent<{ amount: bigint; debtTotal: bigint; currentLtv: bigint }>(addReceipt, 'CollateralAdded')
  assert(added?.amount === topUp, 'CollateralAdded: exact top-up amount')
  // debt is untouched by the add but accrues a few wei of interest across the blocks in between
  assertApprox(added!.debtTotal, position.debtAmount, 1, 'CollateralAdded: debt unchanged (± accrued interest)')
  assert(added!.currentLtv < position.currentLtv, 'LTV improved after the top-up')

  // -- 7. Pure leverage increase: equity = 0, same account ---------------------------------------
  const extraBuy = parseUnits('0.2', 18)
  const extraQuote = await quoteSwapInput(ctx, market, market.debt, extraBuy, 50)
  const increaseReceipt = await send(
    ctx,
    increasePositionCall({
      marginRouter: router,
      params: {
        adapter,
        market,
        equity: 0n,
        collateralToBuy: extraBuy,
        maxDebtIn: extraQuote.capped,
        ...demoRoute(ctx, {
          input: market.debt,
          output: market.collateral,
          amountOut: extraBuy,
          maxIn: extraQuote.capped,
          recipient: predicted,
        }),
        subId: SUB_ID,
        deadline: await deadline(ctx),
      },
    })
  )
  assert(routerEvent(increaseReceipt, 'AccountCreated') === undefined, 'no second AccountCreated (same account)')
  const before = position
  position = await getPosition(ctx.publicClient, { adapter, account: predicted, market })
  note(`releveraged: ${fmt(position.collateralAmount, 18, 'WETH')} against ${fmt(position.debtAmount, 6, 'USDC')} debt`)
  assert(
    position.debtAmount > before.debtAmount && position.collateralAmount === before.collateralAmount + topUp + extraBuy,
    'leverage-only increase drew more debt with no new equity'
  )

  // -- 8. Partial decrease with a mandatory resulting-LTV bound -----------------------------------
  const repay = parseUnits('500', 6)
  const decreaseQuote = await quoteSwapInput(ctx, market, market.collateral, repay, 50)
  await send(
    ctx,
    decreasePositionCall({
      marginRouter: router,
      params: {
        adapter,
        market,
        debtToRepay: repay,
        maxCollateralIn: decreaseQuote.capped,
        // the decrease route sells collateral to buy exactly the repay amount, to the account
        ...demoRoute(ctx, {
          input: market.collateral,
          output: market.debt,
          amountOut: repay,
          maxIn: decreaseQuote.capped,
          recipient: predicted,
        }),
        maxLtvAfter: position.currentLtv + parseUnits('0.02', 18),
        subId: SUB_ID,
        deadline: await deadline(ctx),
      },
    })
  )
  const afterDecrease = await getPosition(ctx.publicClient, { adapter, account: predicted, market })
  assertApprox(afterDecrease.debtAmount, position.debtAmount - repay, 5, 'debt reduced by exactly the repay amount')
  assert(afterDecrease.currentLtv < position.currentLtv, 'partial delever lowered the LTV')

  // -- 9. Full close: FULL_CLOSE sentinel, residual (realized PnL) returned to the caller --------
  // A full-close route must buy AT LEAST the live debt: buffer the read for accrual between the
  // quote and inclusion (over-bought debt is returned to the caller after the unlock).
  const debtToBuy = withSlippageUp(afterDecrease.debtAmount, 10)
  const closeQuote = await quoteSwapInput(ctx, market, market.collateral, debtToBuy, 100)
  const wethBefore = await balanceOf(ctx, weth, deployer)
  const closeReceipt = await send(
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
          recipient: predicted,
        }),
        subId: SUB_ID,
        deadline: await deadline(ctx),
      },
    })
  )
  const decreased = routerEvent<{ debtTotal: bigint; collateralTotal: bigint; collateralReturned: bigint }>(
    closeReceipt,
    'PositionDecreased'
  )
  assert(decreased?.debtTotal === 0n && decreased.collateralTotal === 0n, 'full close emptied the position')
  const residual = (await balanceOf(ctx, weth, deployer)) - wethBefore
  assert(
    residual === decreased!.collateralReturned && residual > 0n,
    `residual returned to caller: ${fmt(residual, 18, 'WETH')}`
  )
  const totalEquity = equity + topUp
  assertApprox(residual, totalEquity, 200, 'residual ≈ contributed equity (same-block: only swap fees lost)')

  const final = await getPosition(ctx.publicClient, { adapter, account: predicted, market })
  assert(
    final.collateralAmount === 0n && final.debtAmount === 0n && final.healthFactorWad === FULL_CLOSE,
    'position fully cleared'
  )

  ok('01 complete: open → verify → top-up → releverage → delever → close, all through SDK calls')
}

if (import.meta.main) {
  await withAnvil(run)
}
