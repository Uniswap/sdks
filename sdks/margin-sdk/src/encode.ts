import { type Address, type Hex, encodeFunctionData, isAddressEqual, zeroAddress } from 'viem'

import { MARGIN_ACCOUNT_ABI, MARGIN_ROUTER_ABI, PERMIT2_ABI } from './abis.js'
import { validateAccountRecipient } from './account.js'
import { FULL_CLOSE, MAX_UINT48, WAD } from './constants.js'
import { MarginSdkError } from './errors.js'
import { validateAddress, validateMarket } from './market.js'
import { toUint128 } from './math.js'
import { type AddCollateralParams, type DecreaseParams, type IncreaseParams, type Market } from './types.js'

// A Unix-seconds deadline beyond this is almost certainly a milliseconds value (Date.now()),
// which would silently disable the deadline for the next ~3,000 years.
const MAX_REASONABLE_DEADLINE = 100_000_000_000n // year ~5138

/** Asserts a deadline is a plausible Unix-seconds timestamp (positive, not milliseconds). */
export function validateDeadline(deadline: bigint): void {
  if (deadline <= 0n) {
    throw new MarginSdkError(
      'INVALID_DEADLINE',
      `deadline must be a positive Unix timestamp in seconds, got ${deadline}`
    )
  }
  if (deadline > MAX_REASONABLE_DEADLINE) {
    throw new MarginSdkError(
      'INVALID_DEADLINE',
      `deadline ${deadline} looks like milliseconds — pass Unix SECONDS (e.g. BigInt(Math.floor(Date.now() / 1000)) + buffer)`
    )
  }
}

/**
 * Calldata encoders and write descriptors for the MarginRouter entry points. Each entry point is
 * exposed two ways:
 *  - an `encode*` function returning raw calldata (for custom submission paths, multicall
 *    batching, or smart-wallet batching), and
 *  - a `*Call` **descriptor** — `{ address, abi, functionName, args, value }` — that drops
 *    straight into viem `simulateContract`/`writeContract` or wagmi `useWriteContract`.
 *
 * Always `simulateContract` before `writeContract` so reverts (`SlippageBoundRequired`,
 * `ZeroAmount`, `IneffectiveLtvBound`, `UniversalRouterNotSet`, `PositionUnhealthy`,
 * `AdapterNotAllowed`, `DeadlinePassed`, `NativeCollateralMismatch`, `IncompleteFill`) surface
 * with a decoded message. The SDK validates the same inputs offchain first.
 */

/** A framework-agnostic contract write descriptor. */
export interface ContractWrite {
  address: Address
  abi: typeof MARGIN_ROUTER_ABI
  functionName: string
  args: readonly unknown[]
  value?: bigint
}

/**
 * A write descriptor targeting a MarginAccount directly rather than the router — the owner escape
 * hatch. Same shape as {@link ContractWrite} with the account ABI.
 */
export interface AccountContractWrite {
  address: Address
  abi: typeof MARGIN_ACCOUNT_ABI
  functionName: string
  args: readonly unknown[]
}

/** Mirrors onchain `IneffectiveLtvBound`: a supplied bound at or above 100% can never bind. */
function validateLtvBound(maxLtvAfter: bigint, context: string): void {
  if (maxLtvAfter !== 0n && maxLtvAfter >= WAD) {
    throw new MarginSdkError(
      'INEFFECTIVE_LTV_BOUND',
      `maxLtvAfter must sit strictly below 100% (1e18) to be able to bind${context}, got ${maxLtvAfter}`
    )
  }
}

/** Mirrors onchain `UniversalRouterNotSet` plus the SDK's route completeness checks. */
function validateRoute(p: { universalRouter: Address; routeCommands: Hex; routeInputs: Hex[] }, flow: string): void {
  validateAddress(p.universalRouter, 'universalRouter')
  if (isAddressEqual(p.universalRouter, zeroAddress)) {
    throw new MarginSdkError(
      'UNIVERSAL_ROUTER_REQUIRED',
      `${flow} routes the swap through the Universal Router; universalRouter must not be the zero address`
    )
  }
  if (p.routeCommands === '0x' || p.routeInputs.length === 0) {
    throw new MarginSdkError(
      'INVALID_INPUT',
      `${flow} requires a Universal Router route (routeCommands/routeInputs) that buys the exact output — build one with buildV4ExactOutRoute or the universal-router-sdk`
    )
  }
}

type IncreaseArgs = {
  adapter: Address
  market: { collateral: Address; debt: Address }
  equity: bigint
  collateralToBuy: bigint
  maxDebtIn: bigint
  universalRouter: Address
  routeCommands: Hex
  routeInputs: Hex[]
  maxLtvAfter: bigint
  subId: bigint
  deadline: bigint
}

function normalizeIncrease(params: IncreaseParams, isNative: boolean): IncreaseArgs {
  validateAddress(params.adapter, 'adapter')
  validateMarket(params.market)
  validateDeadline(params.deadline)
  validateRoute(params, 'increasePosition')
  if (params.collateralToBuy <= 0n) {
    throw new MarginSdkError(
      'INVALID_AMOUNT',
      'collateralToBuy must be positive (use addCollateral for a swap-free supply)'
    )
  }
  if (params.maxDebtIn <= 0n) {
    throw new MarginSdkError('SLIPPAGE_BOUND_REQUIRED', 'maxDebtIn is the binding slippage cap and must be non-zero')
  }
  validateLtvBound(params.maxLtvAfter ?? 0n, '')
  if (isNative && params.equity !== 0n) {
    throw new MarginSdkError(
      'INVALID_INPUT',
      'native-ETH equity is msg.value; pass equity 0 (a non-zero equity field would be ignored onchain)'
    )
  }
  if (params.equity < 0n) {
    throw new MarginSdkError('INVALID_AMOUNT', 'equity must be non-negative')
  }
  return {
    adapter: params.adapter,
    market: params.market,
    equity: params.equity,
    collateralToBuy: toUint128(params.collateralToBuy, 'collateralToBuy'),
    maxDebtIn: toUint128(params.maxDebtIn, 'maxDebtIn'),
    universalRouter: params.universalRouter,
    routeCommands: params.routeCommands,
    routeInputs: params.routeInputs,
    maxLtvAfter: params.maxLtvAfter ?? 0n,
    subId: params.subId ?? 0n,
    deadline: params.deadline,
  }
}

/**
 * Encodes `increasePosition` calldata: open a position (deploying the account if needed) or add
 * leverage to one. Equity is pulled via Permit2 unless the transaction carries native ETH.
 */
export function encodeIncreasePosition(params: IncreaseParams, opts?: { nativeEquity?: bigint }): Hex {
  const isNative = (opts?.nativeEquity ?? 0n) > 0n
  return encodeFunctionData({
    abi: MARGIN_ROUTER_ABI,
    functionName: 'increasePosition',
    args: [normalizeIncrease(params, isNative)],
  })
}

/**
 * `increasePosition` write descriptor. Set `nativeEquity` to fund the position with native ETH
 * (wrapped to WETH onchain; the market collateral must be WETH) — it becomes the transaction
 * value and `params.equity` must be 0.
 */
export function increasePositionCall(p: {
  marginRouter: Address
  params: IncreaseParams
  nativeEquity?: bigint
}): ContractWrite {
  const isNative = (p.nativeEquity ?? 0n) > 0n
  return {
    address: p.marginRouter,
    abi: MARGIN_ROUTER_ABI,
    functionName: 'increasePosition',
    args: [normalizeIncrease(p.params, isNative)],
    value: isNative ? p.nativeEquity : undefined,
  }
}

type DecreaseArgs = {
  adapter: Address
  market: { collateral: Address; debt: Address }
  debtToRepay: bigint
  maxCollateralIn: bigint
  universalRouter: Address
  routeCommands: Hex
  routeInputs: Hex[]
  maxLtvAfter: bigint
  subId: bigint
  deadline: bigint
}

function normalizeDecrease(params: DecreaseParams): DecreaseArgs {
  validateAddress(params.adapter, 'adapter')
  validateMarket(params.market)
  validateDeadline(params.deadline)
  if (params.debtToRepay <= 0n) {
    throw new MarginSdkError('INVALID_AMOUNT', 'debtToRepay must be positive (or FULL_CLOSE to close the position)')
  }
  const isFullClose = params.debtToRepay === FULL_CLOSE
  const route = {
    universalRouter: params.universalRouter ?? zeroAddress,
    routeCommands: params.routeCommands ?? ('0x' as Hex),
    routeInputs: params.routeInputs ?? [],
  }
  if (!isFullClose) {
    // The contract requires the route and both bounds on a partial decrease; a full close ignores
    // maxLtvAfter, and a zero-debt full close also ignores the route and maxCollateralIn
    // (swap-free path).
    validateRoute(route, 'a partial decrease')
    if (params.maxCollateralIn <= 0n) {
      throw new MarginSdkError(
        'SLIPPAGE_BOUND_REQUIRED',
        'maxCollateralIn is the binding slippage cap and must be non-zero on a partial decrease'
      )
    }
    if ((params.maxLtvAfter ?? 0n) <= 0n) {
      throw new MarginSdkError(
        'SLIPPAGE_BOUND_REQUIRED',
        'maxLtvAfter is mandatory on a partial decrease (it bounds the resulting position health)'
      )
    }
    validateLtvBound(params.maxLtvAfter ?? 0n, ' on a partial decrease')
  } else if (route.routeCommands !== '0x' || route.routeInputs.length > 0) {
    // A full close of a position with debt needs the route; only validate consistency here — the
    // SDK cannot know offchain whether the position is debt-free (the swap-free path).
    validateRoute(route, 'a full close with a route')
  }
  return {
    adapter: params.adapter,
    market: params.market,
    debtToRepay: params.debtToRepay,
    maxCollateralIn: toUint128(params.maxCollateralIn, 'maxCollateralIn'),
    universalRouter: route.universalRouter,
    routeCommands: route.routeCommands,
    routeInputs: route.routeInputs,
    maxLtvAfter: params.maxLtvAfter ?? 0n,
    subId: params.subId ?? 0n,
    deadline: params.deadline,
  }
}

/**
 * Encodes `decreasePosition` calldata: partial delever (repay `debtToRepay` by selling
 * collateral), or full close when `debtToRepay` is {@link FULL_CLOSE}. Close and decrease never
 * require an allowlisted adapter, so a position is always exitable.
 */
export function encodeDecreasePosition(params: DecreaseParams): Hex {
  return encodeFunctionData({
    abi: MARGIN_ROUTER_ABI,
    functionName: 'decreasePosition',
    args: [normalizeDecrease(params)],
  })
}

/** `decreasePosition` write descriptor. */
export function decreasePositionCall(p: { marginRouter: Address; params: DecreaseParams }): ContractWrite {
  return {
    address: p.marginRouter,
    abi: MARGIN_ROUTER_ABI,
    functionName: 'decreasePosition',
    args: [normalizeDecrease(p.params)],
  }
}

/**
 * Encodes a full close: `decreasePosition` with `debtToRepay == type(uint256).max` — repay all
 * debt, withdraw all collateral, and return the residual (realized PnL) to the caller. Size
 * `maxCollateralIn` from the position's current debt plus a quote (see `sizeDecrease`); a
 * zero-debt position closes swap-free and ignores it.
 */
export function encodeClosePosition(params: Omit<DecreaseParams, 'debtToRepay' | 'maxLtvAfter'>): Hex {
  return encodeDecreasePosition({ ...params, debtToRepay: FULL_CLOSE, maxLtvAfter: 0n })
}

/** Full-close write descriptor (see {@link encodeClosePosition}). */
export function closePositionCall(p: {
  marginRouter: Address
  params: Omit<DecreaseParams, 'debtToRepay' | 'maxLtvAfter'>
}): ContractWrite {
  return decreasePositionCall({
    marginRouter: p.marginRouter,
    params: { ...p.params, debtToRepay: FULL_CLOSE, maxLtvAfter: 0n },
  })
}

type AddCollateralArgs = {
  adapter: Address
  market: { collateral: Address; debt: Address }
  amount: bigint
  subId: bigint
  deadline: bigint
}

function normalizeAddCollateral(params: AddCollateralParams, isNative: boolean): AddCollateralArgs {
  validateAddress(params.adapter, 'adapter')
  validateMarket(params.market)
  validateDeadline(params.deadline)
  if (isNative && params.amount !== 0n) {
    throw new MarginSdkError(
      'INVALID_INPUT',
      'native-ETH collateral is msg.value; pass amount 0 (a non-zero amount field would be ignored onchain)'
    )
  }
  if (!isNative && params.amount <= 0n) {
    throw new MarginSdkError('INVALID_AMOUNT', 'amount must be positive')
  }
  return {
    adapter: params.adapter,
    market: params.market,
    amount: params.amount,
    subId: params.subId ?? 0n,
    deadline: params.deadline,
  }
}

/** Encodes `addCollateral` calldata: supply collateral without changing debt (no swap). */
export function encodeAddCollateral(params: AddCollateralParams, opts?: { nativeAmount?: bigint }): Hex {
  const isNative = (opts?.nativeAmount ?? 0n) > 0n
  return encodeFunctionData({
    abi: MARGIN_ROUTER_ABI,
    functionName: 'addCollateral',
    args: [normalizeAddCollateral(params, isNative)],
  })
}

/** `addCollateral` write descriptor. `nativeAmount` funds it with native ETH (collateral must be WETH). */
export function addCollateralCall(p: {
  marginRouter: Address
  params: AddCollateralParams
  nativeAmount?: bigint
}): ContractWrite {
  const isNative = (p.nativeAmount ?? 0n) > 0n
  return {
    address: p.marginRouter,
    abi: MARGIN_ROUTER_ABI,
    functionName: 'addCollateral',
    args: [normalizeAddCollateral(p.params, isNative)],
    value: isNative ? p.nativeAmount : undefined,
  }
}

// ---------------------------------------------------------------------------
// MarginAccount primitives (the owner escape hatch)
// ---------------------------------------------------------------------------

/**
 * Parameters for the account-direct `withdrawCollateral` primitive
 * (`IMarginAccount.withdrawCollateral`).
 */
export interface AccountWithdrawCollateralParams {
  /** The lending adapter that encodes the withdrawal call. Not allowlist-gated. */
  adapter: Address
  /** The (collateral, debt) pair identifying the lending market. */
  market: Market
  /** The exact collateral to withdraw, in the collateral token's native decimals. */
  amount: bigint
  /**
   * The recipient; must be the account's owner or its manager (the MarginRouter), or the account
   * reverts `ReceiverNotAllowed(to)`.
   */
  to: Address
}

type AccountWithdrawCollateralArgs = readonly [
  adapter: Address,
  market: { collateral: Address; debt: Address },
  amount: bigint,
  to: Address
]

function normalizeAccountWithdrawCollateral(params: AccountWithdrawCollateralParams): AccountWithdrawCollateralArgs {
  validateAddress(params.adapter, 'adapter')
  validateMarket(params.market)
  validateAccountRecipient(params.to, 'withdrawCollateral')
  if (params.amount <= 0n) {
    throw new MarginSdkError('INVALID_AMOUNT', 'amount must be positive')
  }
  return [params.adapter, params.market, params.amount, params.to]
}

/**
 * Encodes `IMarginAccount.withdrawCollateral` calldata — the owner escape hatch, called **on the
 * account** rather than through the router.
 *
 * Prefer the router path for normal operation (`withdrawCollateralPlan` + `executeCall`), which can
 * compose the withdrawal with a health assertion and other actions atomically. This direct path
 * exists for when the router is deprecated, paused, or compromised: the account's primitives are
 * callable by `{manager, owner}`, so the owner can always exit without the router. Note that it
 * carries **no** health assertion — the lending protocol's own borrow-limit check is the only
 * backstop, so a withdrawal that would leave the position unhealthy reverts inside the venue rather
 * than with `PositionUnhealthy`.
 */
export function encodeAccountWithdrawCollateral(params: AccountWithdrawCollateralParams): Hex {
  return encodeFunctionData({
    abi: MARGIN_ACCOUNT_ABI,
    functionName: 'withdrawCollateral',
    args: normalizeAccountWithdrawCollateral(params),
  })
}

/**
 * Account-direct `withdrawCollateral` write descriptor. `account` is the MarginAccount address —
 * derive it with `getMarginAccountAddress(chainId, owner, subId)`; the transaction must be sent by
 * that account's owner.
 */
export function accountWithdrawCollateralCall(p: {
  account: Address
  params: AccountWithdrawCollateralParams
}): AccountContractWrite {
  validateAddress(p.account, 'account')
  return {
    address: p.account,
    abi: MARGIN_ACCOUNT_ABI,
    functionName: 'withdrawCollateral',
    args: normalizeAccountWithdrawCollateral(p.params),
  }
}

/** Parameters for the account-direct `supplyCollateral` / `repay` primitives (no recipient). */
export interface AccountMarketAmountParams {
  /** The lending adapter that encodes the call. */
  adapter: Address
  /** The (collateral, debt) pair identifying the lending market. */
  market: Market
  /** The amount, in the relevant token's native decimals. */
  amount: bigint
}

function normalizeAccountMarketAmount(
  params: AccountMarketAmountParams,
  label: string,
  allowFullSentinel = false
): readonly [Address, { collateral: Address; debt: Address }, bigint] {
  validateAddress(params.adapter, 'adapter')
  validateMarket(params.market)
  if (params.amount <= 0n) {
    throw new MarginSdkError('INVALID_AMOUNT', `${label} amount must be positive`)
  }
  if (!allowFullSentinel && params.amount === FULL_CLOSE) {
    throw new MarginSdkError('INVALID_AMOUNT', `${label} has no max-amount sentinel; pass an explicit amount`)
  }
  return [params.adapter, params.market, params.amount]
}

/**
 * Encodes `IMarginAccount.supplyCollateral` calldata — the owner escape hatch. The collateral must
 * already sit in the account (the account approves the venue and supplies its own balance); this
 * does **not** pull from the owner's wallet. Use `addCollateralCall` on the router for the normal
 * Permit2-funded path.
 */
export function encodeAccountSupplyCollateral(params: AccountMarketAmountParams): Hex {
  return encodeFunctionData({
    abi: MARGIN_ACCOUNT_ABI,
    functionName: 'supplyCollateral',
    args: normalizeAccountMarketAmount(params, 'supplyCollateral'),
  })
}

/** Account-direct `supplyCollateral` write descriptor. */
export function accountSupplyCollateralCall(p: {
  account: Address
  params: AccountMarketAmountParams
}): AccountContractWrite {
  validateAddress(p.account, 'account')
  return {
    address: p.account,
    abi: MARGIN_ACCOUNT_ABI,
    functionName: 'supplyCollateral',
    args: normalizeAccountMarketAmount(p.params, 'supplyCollateral'),
  }
}

/**
 * Encodes `IMarginAccount.repay` calldata — the owner escape hatch. The debt token must already sit
 * in the account. Pass {@link FULL_CLOSE} (`type(uint256).max`) for a full **share-based** repay,
 * which leaves no interest dust behind — the amount-denominated path can leave rounding dust that
 * then blocks a full collateral withdrawal's health check.
 */
export function encodeAccountRepay(params: AccountMarketAmountParams): Hex {
  return encodeFunctionData({
    abi: MARGIN_ACCOUNT_ABI,
    functionName: 'repay',
    args: normalizeAccountMarketAmount(params, 'repay', true),
  })
}

/** Account-direct `repay` write descriptor. `FULL_CLOSE` repays everything by shares. */
export function accountRepayCall(p: { account: Address; params: AccountMarketAmountParams }): AccountContractWrite {
  validateAddress(p.account, 'account')
  return {
    address: p.account,
    abi: MARGIN_ACCOUNT_ABI,
    functionName: 'repay',
    args: normalizeAccountMarketAmount(p.params, 'repay', true),
  }
}

/** Parameters for the account-direct `borrow` primitive. */
export interface AccountBorrowParams extends AccountMarketAmountParams {
  /**
   * The recipient; must be the account's owner or its manager (the MarginRouter), or the account
   * reverts `ReceiverNotAllowed(to)`.
   */
  to: Address
}

/**
 * Encodes `IMarginAccount.borrow` calldata — the owner escape hatch. ⚠️ Borrowing is
 * exposure-increasing and this path bypasses both the adapter allowlist and any health assertion,
 * so the venue's own borrow limit is the only backstop. Prefer `increasePositionCall`.
 */
export function encodeAccountBorrow(params: AccountBorrowParams): Hex {
  validateAccountRecipient(params.to, 'borrow')
  return encodeFunctionData({
    abi: MARGIN_ACCOUNT_ABI,
    functionName: 'borrow',
    args: [...normalizeAccountMarketAmount(params, 'borrow'), params.to],
  })
}

/** Account-direct `borrow` write descriptor. */
export function accountBorrowCall(p: { account: Address; params: AccountBorrowParams }): AccountContractWrite {
  validateAddress(p.account, 'account')
  validateAccountRecipient(p.params.to, 'borrow')
  return {
    address: p.account,
    abi: MARGIN_ACCOUNT_ABI,
    functionName: 'borrow',
    args: [...normalizeAccountMarketAmount(p.params, 'borrow'), p.params.to],
  }
}

/** Parameters for the account-direct `sweep` primitive. */
export interface AccountSweepParams {
  /**
   * The currency to sweep out of the account. The zero address means native ETH — unlike a market
   * currency, this is valid here (the account has a `receive()` and can hold ETH).
   */
  currency: Address
  /** The amount to sweep, in the currency's native decimals. */
  amount: bigint
  /**
   * The recipient; must be the account's owner or its manager (the MarginRouter), or the account
   * reverts `ReceiverNotAllowed(to)`.
   */
  to: Address
}

function normalizeAccountSweep(params: AccountSweepParams): readonly [Address, bigint, Address] {
  validateAddress(params.currency, 'currency')
  validateAccountRecipient(params.to, 'sweep')
  if (params.amount <= 0n) {
    throw new MarginSdkError('INVALID_AMOUNT', 'sweep amount must be positive')
  }
  return [params.currency, params.amount, params.to]
}

/**
 * Encodes `IMarginAccount.sweep` calldata — the owner escape hatch for recovering a stray token (or
 * native ETH, via the zero address) sitting on the account.
 */
export function encodeAccountSweep(params: AccountSweepParams): Hex {
  return encodeFunctionData({
    abi: MARGIN_ACCOUNT_ABI,
    functionName: 'sweep',
    args: normalizeAccountSweep(params),
  })
}

/** Account-direct `sweep` write descriptor. */
export function accountSweepCall(p: { account: Address; params: AccountSweepParams }): AccountContractWrite {
  validateAddress(p.account, 'account')
  return {
    address: p.account,
    abi: MARGIN_ACCOUNT_ABI,
    functionName: 'sweep',
    args: normalizeAccountSweep(p.params),
  }
}

/**
 * Encodes `execute` calldata for a finalized plan (see `MarginPlanner`). ⚠️ Only execute plans
 * your own code built — a plan has full authority over the caller's sub-accounts.
 */
export function encodeExecute(unlockData: Hex, deadline: bigint): Hex {
  validateDeadline(deadline)
  return encodeFunctionData({ abi: MARGIN_ROUTER_ABI, functionName: 'execute', args: [unlockData, deadline] })
}

/** `execute` write descriptor. `value` carries native ETH for plans that `WRAP`. */
export function executeCall(p: {
  marginRouter: Address
  unlockData: Hex
  deadline: bigint
  value?: bigint
}): ContractWrite {
  validateDeadline(p.deadline)
  return {
    address: p.marginRouter,
    abi: MARGIN_ROUTER_ABI,
    functionName: 'execute',
    args: [p.unlockData, p.deadline],
    value: p.value,
  }
}

/**
 * Encodes a router `multicall(bytes[])`, e.g. to batch a forwarded Permit2 `permit` with an
 * `increasePosition` in one transaction. Do not batch two native-ETH position calls — `msg.value`
 * is shared across a multicall.
 */
export function encodeRouterMulticall(calls: Hex[]): Hex {
  if (calls.length === 0) throw new MarginSdkError('INVALID_INPUT', 'multicall requires at least one call')
  return encodeFunctionData({ abi: MARGIN_ROUTER_ABI, functionName: 'multicall', args: [calls] })
}

/** A Permit2 `PermitSingle` message (sign with EIP-712, then forward via {@link encodeRouterPermit}). */
export interface PermitSingle {
  details: {
    token: Address
    amount: bigint
    expiration: number
    nonce: number
  }
  spender: Address
  sigDeadline: bigint
}

/**
 * Encodes the router's forwarded Permit2 `permit(owner, permitSingle, signature)` — the gasless
 * alternative to an onchain `Permit2.approve`, batchable with a position call via
 * {@link encodeRouterMulticall}.
 */
export function encodeRouterPermit(owner: Address, permitSingle: PermitSingle, signature: Hex): Hex {
  return encodeFunctionData({
    abi: MARGIN_ROUTER_ABI,
    functionName: 'permit',
    args: [owner, permitSingle, signature],
  })
}

/**
 * Permit2 `approve(token, router, amount, expiration)` write descriptor — the second step of the
 * two-step Permit2 setup (the first is a standard ERC-20 `approve(permit2, ...)`, e.g. with
 * viem's `erc20Abi`). `expiration` defaults to the uint48 maximum (no expiry).
 */
export function permit2ApproveCall(p: {
  permit2: Address
  token: Address
  spender: Address
  amount: bigint
  expiration?: number
}): {
  address: Address
  abi: typeof PERMIT2_ABI
  functionName: 'approve'
  args: readonly [Address, Address, bigint, number]
} {
  return {
    address: p.permit2,
    abi: PERMIT2_ABI,
    functionName: 'approve',
    args: [p.token, p.spender, p.amount, p.expiration ?? Number(MAX_UINT48)],
  }
}
