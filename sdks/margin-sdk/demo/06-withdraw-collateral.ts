/**
 * Demo 06 — Collateral withdrawal without touching debt.
 * The router has no curated withdraw entry point, so this exercises the three withdrawal paths the
 * SDK exposes over `IMarginAccount.withdrawCollateral`:
 *   1. `withdrawCollateralPlan` — the curated `execute` plan (the normal path).
 *   2. A manual `MarginPlanner` plan that exits a WETH-collateral position as native ETH
 *      (withdraw to the router → `unwrap` → `sweep`).
 *   3. `accountWithdrawCollateralCall` — the owner escape hatch, bypassing the router entirely.
 * Also pins the two guards that make the curated helper safe: the mandatory `maxLtvAfter` really
 * binds, and the sentinels the account cannot resolve are rejected before a transaction is built.
 */
import { parseUnits, zeroAddress } from 'viem'

import { type Ctx, withAnvil } from './lib/env'
import {
  assert,
  balanceOf,
  deadline,
  deal,
  demoRoute,
  ensurePermit2,
  fmt,
  fmtWad,
  note,
  ok,
  quoteSwapInput,
  section,
  send,
} from './lib/helpers'
import {
  CONTRACT_BALANCE,
  MSG_SENDER,
  MarginPlanner,
  accountWithdrawCollateralCall,
  collateralToBuyForLeverage,
  executeCall,
  getMarginAccountAddress,
  getPosition,
  increasePositionCall,
  isMarginSdkError,
  parseLeverageX18,
  withdrawCollateralPlan,
} from '../src'

const SUB_ID = 7n
const NATIVE_SUB_ID = 8n

/** Opens a fresh 2x long under `subId` and returns the account address. */
async function open2xLong(ctx: Ctx, subId: bigint, equity: bigint): Promise<`0x${string}`> {
  const { addresses, deployer, longMarket: market } = ctx
  const adapter = addresses.lendingAdapters.morphoBlue!
  const account = getMarginAccountAddress(1, deployer, subId)
  const collateralToBuy = collateralToBuyForLeverage(equity, parseLeverageX18(2))
  const { capped: maxDebtIn } = await quoteSwapInput(ctx, market, market.debt, collateralToBuy, 50)
  await send(
    ctx,
    increasePositionCall({
      marginRouter: addresses.marginRouter,
      params: {
        adapter,
        market,
        equity,
        collateralToBuy,
        maxDebtIn,
        ...demoRoute(ctx, {
          input: market.debt,
          output: market.collateral,
          amountOut: collateralToBuy,
          maxIn: maxDebtIn,
          recipient: account,
        }),
        subId,
        deadline: await deadline(ctx),
      },
    })
  )
  return account
}

export async function run(ctx: Ctx): Promise<void> {
  const { addresses, deployer, longMarket: market, weth } = ctx
  const adapter = addresses.lendingAdapters.morphoBlue!
  const router = addresses.marginRouter

  section('06 · Withdraw collateral (mirrors ACCOUNT_WITHDRAW_COLLATERAL + the owner escape hatch)')

  const equity = parseUnits('1', 18)
  await deal(ctx, weth, deployer, parseUnits('10', 18))
  await ensurePermit2(ctx, weth)

  // -- 1. Curated plan: withdraw a slice of collateral straight to the owner --------------------
  const account = await open2xLong(ctx, SUB_ID, equity)
  const before = await getPosition(ctx.publicClient, { adapter, account, market })
  note(`opened 2x: collateral ${fmt(before.collateralAmount, 18, 'WETH')}, LTV ${fmtWad(before.currentLtv)}`)

  const slice = before.collateralAmount / 10n
  const wethBefore = await balanceOf(ctx, weth, deployer)
  await send(
    ctx,
    executeCall({
      marginRouter: router,
      unlockData: withdrawCollateralPlan({
        adapter,
        market,
        amount: slice,
        to: deployer, // the account's owner — a literal address, never MSG_SENDER
        maxLtvAfter: (before.maxLtv * 90n) / 100n, // 10% headroom under the liquidation LTV
        subId: SUB_ID,
      }),
      deadline: await deadline(ctx),
    })
  )

  const after = await getPosition(ctx.publicClient, { adapter, account, market })
  const received = (await balanceOf(ctx, weth, deployer)) - wethBefore
  assert(received === slice, `owner received exactly the withdrawn collateral (${fmt(received, 18, 'WETH')})`)
  assert(after.collateralAmount === before.collateralAmount - slice, 'position collateral fell by exactly that amount')
  assert(after.debtAmount >= before.debtAmount, 'debt untouched by the withdrawal (interest may accrue)')
  assert(after.currentLtv > before.currentLtv, `LTV rose as expected (${fmtWad(after.currentLtv)})`)
  ok('curated withdrawCollateralPlan: collateral out, debt untouched, health still bounded')

  // -- 2. The mandatory health bound actually binds ---------------------------------------------
  // Withdrawing nearly everything against a bound just above the current LTV must revert
  // PositionUnhealthy rather than silently walking the position to the liquidation edge.
  let reverted = false
  try {
    await send(
      ctx,
      executeCall({
        marginRouter: router,
        unlockData: withdrawCollateralPlan({
          adapter,
          market,
          amount: (after.collateralAmount * 90n) / 100n,
          to: deployer,
          maxLtvAfter: after.currentLtv + 10n ** 15n, // only 0.1% of headroom
          subId: SUB_ID,
        }),
        deadline: await deadline(ctx),
      })
    )
  } catch {
    reverted = true
  }
  assert(reverted, 'an over-large withdrawal reverts against its maxLtvAfter bound (ASSERT_HEALTH)')

  // The SDK refuses to build the unbounded version at all, so it can never reach the chain.
  let rejectedZeroBound = false
  try {
    withdrawCollateralPlan({ adapter, market, amount: slice, to: deployer, maxLtvAfter: 0n, subId: SUB_ID })
  } catch (error) {
    rejectedZeroBound = isMarginSdkError(error)
  }
  assert(rejectedZeroBound, 'a zero maxLtvAfter is rejected offchain (ASSERT_HEALTH would skip it)')

  // ...as are the recipients the account cannot resolve: ACCOUNT_* actions are never mapped
  // through _mapRecipient, so MSG_SENDER would arrive as the literal 0x…01 and revert.
  let rejectedSentinel = false
  try {
    withdrawCollateralPlan({
      adapter,
      market,
      amount: slice,
      to: MSG_SENDER,
      maxLtvAfter: before.maxLtv,
      subId: SUB_ID,
    })
  } catch (error) {
    rejectedSentinel = isMarginSdkError(error)
  }
  assert(rejectedSentinel, 'the MSG_SENDER sentinel is rejected offchain (account requires a literal recipient)')
  ok('both guards hold: the bound binds onchain, and the unsafe variants never build')

  // -- 3. Exit to native ETH: withdraw to the router, unwrap, sweep ------------------------------
  const nativeAccount = await open2xLong(ctx, NATIVE_SUB_ID, equity)
  const nativePosition = await getPosition(ctx.publicClient, { adapter, account: nativeAccount, market })
  const nativeSlice = nativePosition.collateralAmount / 10n
  const ethBefore = await ctx.publicClient.getBalance({ address: deployer })

  const nativeExit = new MarginPlanner()
    .setAccount(NATIVE_SUB_ID)
    .withdrawCollateral(adapter, market, nativeSlice, router) // stage on the router, not the owner
    .assertHealth(adapter, market, (nativePosition.maxLtv * 90n) / 100n)
    .unwrap(CONTRACT_BALANCE) // WETH → ETH on the router
    .sweep(zeroAddress, MSG_SENDER) // router-level sweep DOES resolve the sentinel
    .finalize()

  const nativeReceipt = await send(
    ctx,
    executeCall({ marginRouter: router, unlockData: nativeExit, deadline: await deadline(ctx) })
  )
  const gasSpent = nativeReceipt.gasUsed * nativeReceipt.effectiveGasPrice
  const ethReceived = (await ctx.publicClient.getBalance({ address: deployer })) - ethBefore + gasSpent
  assert(ethReceived === nativeSlice, `owner received the collateral as native ETH (${fmt(ethReceived, 18, 'ETH')})`)
  assert(
    (await balanceOf(ctx, weth, router)) === 0n && (await ctx.publicClient.getBalance({ address: router })) === 0n,
    'router netted to zero — no WETH or ETH left claimable by the next caller'
  )
  ok('native exit: withdraw → unwrap → sweep, with the router holding nothing afterwards')

  // -- 4. Owner escape hatch: withdraw directly from the account, no router involved -------------
  const escapeBefore = await getPosition(ctx.publicClient, { adapter, account, market })
  const escapeSlice = escapeBefore.collateralAmount / 20n
  const escapeWethBefore = await balanceOf(ctx, weth, deployer)
  await send(
    ctx,
    accountWithdrawCollateralCall({
      account,
      params: { adapter, market, amount: escapeSlice, to: deployer },
    })
  )
  const escapeAfter = await getPosition(ctx.publicClient, { adapter, account, market })
  assert(
    (await balanceOf(ctx, weth, deployer)) - escapeWethBefore === escapeSlice,
    'escape hatch delivered the collateral to the owner without the router'
  )
  assert(
    escapeAfter.collateralAmount === escapeBefore.collateralAmount - escapeSlice,
    'escape-hatch withdrawal reduced the position by exactly that amount'
  )
  note(`escape hatch carries no health assertion — LTV now ${fmtWad(escapeAfter.currentLtv)} (venue-checked only)`)

  ok('06 complete: curated plan, native exit, and owner escape hatch all withdraw collateral')
}

if (import.meta.main) {
  await withAnvil(run)
}
