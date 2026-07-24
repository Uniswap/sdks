import { type Address, type Hex, encodeFunctionData } from 'viem'

import { MARGIN_ROUTER_ABI, PERMIT2_ABI } from './abis'
import { FULL_CLOSE, MAX_UINT48 } from './constants'
import { MarginSdkError } from './errors'
import { poolKeyMatchesMarket, validateMarket } from './market'
import { toUint128 } from './math'
import { type AddCollateralParams, type DecreaseParams, type IncreaseParams } from './types'

/**
 * Calldata encoders and write descriptors for the MarginRouter entry points. Each entry point is
 * exposed two ways:
 *  - an `encode*` function returning raw calldata (for custom submission paths, multicall
 *    batching, or smart-wallet batching), and
 *  - a `*Call` **descriptor** — `{ address, abi, functionName, args, value }` — that drops
 *    straight into viem `simulateContract`/`writeContract` or wagmi `useWriteContract`.
 *
 * Always `simulateContract` before `writeContract` so reverts (`SlippageBoundRequired`,
 * `PositionUnhealthy`, `AdapterNotAllowed`, `DeadlinePassed`, `NativeCollateralMismatch`,
 * `IncompleteFill`) surface with a decoded message.
 */

/** A framework-agnostic contract write descriptor. */
export interface ContractWrite {
  address: Address
  abi: typeof MARGIN_ROUTER_ABI
  functionName: string
  args: readonly unknown[]
  value?: bigint
}

type IncreaseArgs = {
  adapter: Address
  market: { collateral: Address; debt: Address }
  poolKey: IncreaseParams['poolKey']
  equity: bigint
  collateralToBuy: bigint
  maxDebtIn: bigint
  minHopPriceX36: bigint
  maxLtvAfter: bigint
  subId: bigint
  deadline: bigint
}

function normalizeIncrease(params: IncreaseParams, isNative: boolean): IncreaseArgs {
  validateMarket(params.market)
  if (!poolKeyMatchesMarket(params.poolKey, params.market)) {
    throw new MarginSdkError('MARKET_MISMATCH', 'pool currencies do not match the market (collateral, debt) pair')
  }
  if (params.collateralToBuy <= 0n) {
    throw new MarginSdkError(
      'INVALID_AMOUNT',
      'collateralToBuy must be positive (use addCollateral for a swap-free supply)'
    )
  }
  if (params.maxDebtIn <= 0n) {
    throw new MarginSdkError('SLIPPAGE_BOUND_REQUIRED', 'maxDebtIn is the binding slippage cap and must be non-zero')
  }
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
    poolKey: params.poolKey,
    equity: params.equity,
    collateralToBuy: toUint128(params.collateralToBuy, 'collateralToBuy'),
    maxDebtIn: toUint128(params.maxDebtIn, 'maxDebtIn'),
    minHopPriceX36: params.minHopPriceX36 ?? 0n,
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
  poolKey: DecreaseParams['poolKey']
  debtToRepay: bigint
  maxCollateralIn: bigint
  minHopPriceX36: bigint
  maxLtvAfter: bigint
  subId: bigint
  deadline: bigint
}

function normalizeDecrease(params: DecreaseParams): DecreaseArgs {
  validateMarket(params.market)
  if (!poolKeyMatchesMarket(params.poolKey, params.market)) {
    throw new MarginSdkError('MARKET_MISMATCH', 'pool currencies do not match the market (collateral, debt) pair')
  }
  if (params.debtToRepay <= 0n) {
    throw new MarginSdkError('INVALID_AMOUNT', 'debtToRepay must be positive (or FULL_CLOSE to close the position)')
  }
  const isFullClose = params.debtToRepay === FULL_CLOSE
  if (!isFullClose) {
    // The contract requires both bounds on a partial decrease; a full close ignores maxLtvAfter,
    // and a zero-debt full close also ignores maxCollateralIn (swap-free path).
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
  }
  return {
    adapter: params.adapter,
    market: params.market,
    poolKey: params.poolKey,
    debtToRepay: params.debtToRepay,
    maxCollateralIn: toUint128(params.maxCollateralIn, 'maxCollateralIn'),
    minHopPriceX36: params.minHopPriceX36 ?? 0n,
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
  validateMarket(params.market)
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

/**
 * Encodes `execute` calldata for a finalized plan (see `MarginPlanner`). ⚠️ Only execute plans
 * your own code built — a plan has full authority over the caller's sub-accounts.
 */
export function encodeExecute(unlockData: Hex, deadline: bigint): Hex {
  return encodeFunctionData({ abi: MARGIN_ROUTER_ABI, functionName: 'execute', args: [unlockData, deadline] })
}

/** `execute` write descriptor. `value` carries native ETH for plans that `WRAP`. */
export function executeCall(p: {
  marginRouter: Address
  unlockData: Hex
  deadline: bigint
  value?: bigint
}): ContractWrite {
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
