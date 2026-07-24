import { parseUnits } from 'viem'

import { BPS_DENOMINATOR, MAX_UINT128, MAX_UINT256, ONE_X18, WAD } from './constants'
import { MarginSdkError } from './errors'

/**
 * Leverage, sizing, and health math for margin positions. All ratios are WAD-scaled bigints
 * (`Ltv`: 1e18 == 100%; `LeverageX18`: 1e18 == 1x). All token amounts are in each token's native
 * decimals — the sizing helpers take explicit decimals so longs (18d collateral / 6d debt) and
 * shorts (6d collateral / 18d debt) use the same code. Prices for sizing must come from a real
 * quote (a v4 quoter), not spot or the lending oracle; the lending market's oracle is for health,
 * not for sizing the swap.
 */

/**
 * Parses a human leverage multiplier (`2`, `'2.5'`) into a WAD `LeverageX18`. Mirrors the onchain
 * constructor's bound: sub-1x leverage is invalid.
 */
export function parseLeverageX18(leverage: number | string): bigint {
  const asString = typeof leverage === 'number' ? leverage.toString() : leverage
  if (typeof leverage === 'number' && !Number.isFinite(leverage)) {
    throw new MarginSdkError('INVALID_LEVERAGE', `leverage must be a finite number, got ${leverage}`)
  }
  let x18: bigint
  try {
    x18 = parseUnits(asString, 18)
  } catch {
    throw new MarginSdkError('INVALID_LEVERAGE', `cannot parse leverage value: ${asString}`)
  }
  assertLeverageX18(x18)
  return x18
}

/** Asserts a WAD leverage value is at least 1x (mirrors onchain `LeverageBelowOne`). */
export function assertLeverageX18(leverageX18: bigint): void {
  if (leverageX18 < ONE_X18) {
    throw new MarginSdkError('INVALID_LEVERAGE', `leverage must be >= 1x (1e18), got ${leverageX18}`)
  }
}

/**
 * The levered total exposure for `equity` at `leverageX18`: `equity * L / 1e18`, rounded down
 * (mirrors onchain `LeverageX18.mulEquity`). Same units as `equity`.
 */
export function totalExposure(equity: bigint, leverageX18: bigint): bigint {
  assertLeverageX18(leverageX18)
  return (equity * leverageX18) / WAD
}

/**
 * The collateral to buy on the leverage swap for `equity` at `leverageX18`:
 * `equity * (L - 1) / 1e18`. Same units as `equity` (the collateral token).
 */
export function collateralToBuyForLeverage(equity: bigint, leverageX18: bigint): bigint {
  assertLeverageX18(leverageX18)
  return (equity * (leverageX18 - ONE_X18)) / WAD
}

/**
 * The oracle-price-independent LTV a fresh position lands at for a target leverage:
 * `(L - 1) / L` in WAD. 2x ≈ 50%, 3x ≈ 67%, 4x ≈ 75%.
 */
export function impliedLtv(leverageX18: bigint): bigint {
  assertLeverageX18(leverageX18)
  return ((leverageX18 - ONE_X18) * WAD) / leverageX18
}

/**
 * The inverse of {@link impliedLtv}: the leverage implied by an LTV, `1 / (1 - ltv)` in WAD.
 * Useful for translating a market's max (liquidation) LTV into a max leverage: e.g. LLTV 86% →
 * ~7.14x (open below it — the position starts at the liquidation point otherwise).
 */
export function leverageForLtv(ltv: bigint): bigint {
  if (ltv < 0n || ltv >= WAD) {
    throw new MarginSdkError('INVALID_INPUT', `ltv must be in [0, 1e18), got ${ltv}`)
  }
  return (WAD * WAD) / (WAD - ltv)
}

/**
 * The position health factor `maxLtv / currentLtv` in WAD (1e18 == 1.0; below 1e18 is
 * liquidatable), `type(uint256).max` when there is no debt — mirroring
 * `ILendingAdapter.describePosition`.
 */
export function healthFactor(maxLtv: bigint, currentLtv: bigint): bigint {
  if (currentLtv === 0n) return MAX_UINT256
  return (maxLtv * WAD) / currentLtv
}

/**
 * A pool-price estimate of a position's LTV: `debtValue / collateralValue` in WAD, valuing debt
 * at `priceDebtPerCollateralToken` (debt-wei per one whole collateral token, i.e.
 * `parseUnits(humanPrice, debtDecimals)`). The venue's oracle LTV (`currentLtvWad`) is
 * authoritative for liquidation; this is for previews.
 */
export function estimateLtv(p: {
  collateralAmount: bigint
  debtAmount: bigint
  priceDebtPerCollateralToken: bigint
  collateralDecimals: number
}): bigint {
  const collateralValueInDebt =
    (p.collateralAmount * p.priceDebtPerCollateralToken) / 10n ** BigInt(p.collateralDecimals)
  if (collateralValueInDebt === 0n) {
    throw new MarginSdkError('INVALID_INPUT', 'collateral value is zero; LTV is undefined')
  }
  return (p.debtAmount * WAD) / collateralValueInDebt
}

/**
 * Converts a collateral amount into its debt-token cost at a quoted price:
 * `collateralAmount * price / 10^collateralDecimals`, where `price` is debt-wei per one whole
 * collateral token (`parseUnits(humanPrice, debtDecimals)`). Rounds down — apply slippage
 * headroom before using it as a swap cap.
 */
export function quoteDebtForCollateral(p: {
  collateralAmount: bigint
  priceDebtPerCollateralToken: bigint
  collateralDecimals: number
}): bigint {
  return (p.collateralAmount * p.priceDebtPerCollateralToken) / 10n ** BigInt(p.collateralDecimals)
}

/**
 * Converts a debt amount into its collateral-token cost at a quoted price:
 * `debtAmount * price / 10^debtDecimals`, where `price` is collateral-wei per one whole debt
 * token (`parseUnits(humanPrice, collateralDecimals)`).
 */
export function quoteCollateralForDebt(p: {
  debtAmount: bigint
  priceCollateralPerDebtToken: bigint
  debtDecimals: number
}): bigint {
  return (p.debtAmount * p.priceCollateralPerDebtToken) / 10n ** BigInt(p.debtDecimals)
}

/** `amount * (10_000 + slippageBps) / 10_000` — headroom for a maximum-input swap cap. */
export function withSlippageUp(amount: bigint, slippageBps: number): bigint {
  validateBps(slippageBps)
  return (amount * (BPS_DENOMINATOR + BigInt(slippageBps))) / BPS_DENOMINATOR
}

/** `amount * (10_000 - slippageBps) / 10_000` — a floor for a minimum-output expectation. */
export function withSlippageDown(amount: bigint, slippageBps: number): bigint {
  validateBps(slippageBps)
  if (BigInt(slippageBps) > BPS_DENOMINATOR) {
    throw new MarginSdkError('INVALID_SLIPPAGE', `slippage above 100% (${slippageBps} bps) floors to nothing`)
  }
  return (amount * (BPS_DENOMINATOR - BigInt(slippageBps))) / BPS_DENOMINATOR
}

function validateBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0) {
    throw new MarginSdkError('INVALID_SLIPPAGE', `slippage must be a non-negative integer bps value, got ${bps}`)
  }
}

/** Asserts an amount fits the contract's uint128 swap-amount fields. */
export function toUint128(amount: bigint, label = 'amount'): bigint {
  if (amount < 0n) throw new MarginSdkError('INVALID_AMOUNT', `${label} must be non-negative, got ${amount}`)
  if (amount > MAX_UINT128) throw new MarginSdkError('AMOUNT_OVERFLOW', `${label} exceeds uint128: ${amount}`)
  return amount
}

/**
 * Sizes an `increasePosition` swap from equity and target leverage:
 * `collateralToBuy = equity * (L - 1) / 1e18` (the exact-output side) and
 * `maxDebtIn = quote(collateralToBuy) + slippage` (the binding input cap).
 *
 * `priceDebtPerCollateralToken` is debt-wei per one whole collateral token from a real quote —
 * e.g. a 3_000 USDC/WETH quote is `parseUnits('3000', 6)`. For a short the decimals reverse
 * naturally: price in WETH-wei per whole USDC.
 */
export function sizeIncrease(p: {
  /** Equity in the collateral token's native decimals. */
  equity: bigint
  /** Target leverage as WAD (use {@link parseLeverageX18}). */
  leverageX18: bigint
  /** Quoted price: debt-wei per one whole collateral token. */
  priceDebtPerCollateralToken: bigint
  /** The collateral token's decimals (18 for WETH, 6 for USDC). */
  collateralDecimals: number
  /** Slippage headroom in bps applied to the quoted debt cost. */
  slippageBps: number
}): { collateralToBuy: bigint; maxDebtIn: bigint; totalCollateral: bigint } {
  if (p.equity <= 0n) {
    throw new MarginSdkError('INVALID_AMOUNT', 'equity must be positive to size an increase from leverage')
  }
  const collateralToBuy = toUint128(collateralToBuyForLeverage(p.equity, p.leverageX18), 'collateralToBuy')
  if (collateralToBuy === 0n) {
    throw new MarginSdkError(
      'INVALID_AMOUNT',
      'leverage sizes to zero collateral to buy; use addCollateral for a 1x (unlevered) supply'
    )
  }
  const quoted = quoteDebtForCollateral({
    collateralAmount: collateralToBuy,
    priceDebtPerCollateralToken: p.priceDebtPerCollateralToken,
    collateralDecimals: p.collateralDecimals,
  })
  const maxDebtIn = toUint128(withSlippageUp(quoted, p.slippageBps), 'maxDebtIn')
  if (maxDebtIn === 0n) {
    throw new MarginSdkError('INVALID_AMOUNT', 'quoted debt input rounds to zero; check the price scale and decimals')
  }
  return { collateralToBuy, maxDebtIn, totalCollateral: totalExposure(p.equity, p.leverageX18) }
}

/**
 * Sizes the collateral cap for a `decreasePosition` swap that must buy `debtToRepay` of debt:
 * `maxCollateralIn = quote(debtToRepay) + slippage`. For a full close pass the position's current
 * debt (read via `describePosition`) plus an interest-accrual buffer in `slippageBps` — debt
 * accrues between the read and inclusion, and the close swap is sized onchain off the live total.
 */
export function sizeDecrease(p: {
  /** The debt to repay, in the debt token's native decimals (current debt for a full close). */
  debtToRepay: bigint
  /** Quoted price: collateral-wei per one whole debt token. */
  priceCollateralPerDebtToken: bigint
  /** The debt token's decimals. */
  debtDecimals: number
  /** Slippage (and, for closes, interest-accrual) headroom in bps. */
  slippageBps: number
}): { maxCollateralIn: bigint } {
  if (p.debtToRepay <= 0n) {
    throw new MarginSdkError('INVALID_AMOUNT', 'debtToRepay must be positive')
  }
  const quoted = quoteCollateralForDebt({
    debtAmount: p.debtToRepay,
    priceCollateralPerDebtToken: p.priceCollateralPerDebtToken,
    debtDecimals: p.debtDecimals,
  })
  const maxCollateralIn = toUint128(withSlippageUp(quoted, p.slippageBps), 'maxCollateralIn')
  if (maxCollateralIn === 0n) {
    throw new MarginSdkError(
      'INVALID_AMOUNT',
      'quoted collateral input rounds to zero; check the price scale and decimals'
    )
  }
  return { maxCollateralIn }
}
