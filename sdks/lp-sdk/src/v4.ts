import { permit2Address } from '@uniswap/permit2-sdk'
import { BigintIsh, CHAIN_TO_ADDRESSES_MAP, Currency, CurrencyAmount, NativeCurrency, Percent } from '@uniswap/sdk-core'
import { AddLiquidityOptions, Pool, Position, V4PositionManager } from '@uniswap/v4-sdk'
import invariant from 'tiny-invariant'
import { DEFAULT_LP_SLIPPAGE_TOLERANCE, DEFAULT_NATIVE_V4_SLIPPAGE_TOLERANCE } from './constants'
import { LpGasEstimateTransaction, Permit2AllowanceInput } from './types'
import { erc20ApprovalTransactions, permit2ApprovalTransactions } from './utils/approvals'

export interface V4AddLiquidityGasEstimateParams {
  /**
   * The pool to add liquidity to, carrying current price, liquidity, and tick. Native
   * currency pools are supported directly (currency0 may be native).
   */
  pool: Pool
  tickLower: number
  tickUpper: number
  /**
   * The side of the pool the estimate is driven by, typically the output of
   * {@link pickPreEstimateIndependentAmount}. The other side's amount is derived
   * from the pool price and the tick range.
   */
  independentAmount: CurrencyAmount<Currency>
  /**
   * The account minting the position. Required when creating a new position
   * (no `tokenId`).
   */
  recipient?: string
  /**
   * When set, produces an increase of the existing position instead of a mint.
   */
  tokenId?: BigintIsh
  /**
   * Whether to prepend pool initialization to the mint call. The pool's current
   * sqrt price is used as the initialization price.
   */
  createPool?: boolean
  /**
   * Defaults to {@link DEFAULT_NATIVE_V4_SLIPPAGE_TOLERANCE} when the pool has a
   * native side, otherwise {@link DEFAULT_LP_SLIPPAGE_TOLERANCE}.
   */
  slippageTolerance?: Percent
  /**
   * When the transaction expires, in epoch seconds. Also used as the expiration for
   * any Permit2 approval produced, and as the reference time when deciding whether an
   * existing Permit2 allowance is still active.
   */
  deadline: BigintIsh
  /**
   * Allowance state of pool.currency0 (ERC-20 allowance for Permit2, Permit2
   * allowance for the position manager). Zero allowances are assumed when omitted,
   * yielding the worst-case estimate.
   */
  currency0?: Permit2AllowanceInput
  /**
   * Allowance state of pool.currency1.
   */
  currency1?: Permit2AllowanceInput
}

/**
 * Returns the ordered list of transactions a wallet must send to create or increase a
 * Uniswap v4 position, for use with `eth_estimateGas`: any required ERC-20 approvals
 * to Permit2 and Permit2 approvals to the v4 position manager, followed by the
 * mint/increase transaction itself.
 *
 * The position transaction is encoded with `V4PositionManager.addCallParameters`, so
 * the calldata matches what standard SDK consumers (including the Uniswap Labs
 * liquidity service) produce for the transaction users actually sign. Note the signing
 * flow may carry a signed Permit2 batch permit inside the position transaction instead
 * of onchain Permit2 approvals; this helper estimates the approval-transaction path.
 */
export function getV4AddLiquidityGasEstimateTransactions(
  params: V4AddLiquidityGasEstimateParams
): LpGasEstimateTransaction[] {
  const { pool, tickLower, tickUpper, independentAmount, recipient, tokenId, createPool, deadline } = params

  const positionManagerAddress = (
    CHAIN_TO_ADDRESSES_MAP as Partial<Record<number, { v4PositionManagerAddress?: string }>>
  )[pool.chainId]?.v4PositionManagerAddress
  invariant(positionManagerAddress !== undefined, 'NO_POSITION_MANAGER_ON_CHAIN')

  // v4 pools hold native currencies directly, so spending native is implied by the pool
  const useNative = pool.currency0.isNative ? (pool.currency0 as NativeCurrency) : undefined

  let position: Position
  if (independentAmount.currency.equals(pool.currency0)) {
    position = Position.fromAmount0({
      pool,
      tickLower,
      tickUpper,
      amount0: independentAmount.quotient,
      useFullPrecision: true,
    })
  } else {
    invariant(independentAmount.currency.equals(pool.currency1), 'INDEPENDENT_NOT_IN_POOL')
    position = Position.fromAmount1({ pool, tickLower, tickUpper, amount1: independentAmount.quotient })
  }

  const slippageTolerance =
    params.slippageTolerance ??
    (pool.currency0.isNative || pool.currency1.isNative
      ? DEFAULT_NATIVE_V4_SLIPPAGE_TOLERANCE
      : DEFAULT_LP_SLIPPAGE_TOLERANCE)

  let options: AddLiquidityOptions
  if (tokenId !== undefined) {
    options = { tokenId, slippageTolerance, deadline, useNative }
  } else {
    invariant(recipient !== undefined, 'NO_RECIPIENT')
    options = {
      recipient,
      createPool,
      sqrtPriceX96: createPool ? pool.sqrtRatioX96 : undefined,
      slippageTolerance,
      deadline,
      useNative,
    }
  }
  const { calldata, value } = V4PositionManager.addCallParameters(position, options)

  // v4 settles up to the slippage-inflated maximums (amount0Max/amount1Max in the
  // encoded call), so allowances must cover those — not just the desired amounts
  const { amount0, amount1 } = position.mintAmountsWithSlippage(slippageTolerance)
  const transactions: LpGasEstimateTransaction[] = []
  const sides = [
    { currency: pool.currency0, amount: amount0, input: params.currency0 },
    { currency: pool.currency1, amount: amount1, input: params.currency1 },
  ]
  for (const { currency, amount, input } of sides) {
    if (currency.isNative) continue
    const token = currency.wrapped.address
    transactions.push(...erc20ApprovalTransactions(token, amount, permit2Address(pool.chainId), input))
    transactions.push(
      ...permit2ApprovalTransactions(token, amount, positionManagerAddress, pool.chainId, deadline, input)
    )
  }
  transactions.push({ to: positionManagerAddress, calldata, value })
  return transactions
}
