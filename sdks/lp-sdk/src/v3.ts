import {
  BigintIsh,
  Currency,
  CurrencyAmount,
  NativeCurrency,
  NONFUNGIBLE_POSITION_MANAGER_ADDRESSES,
  Percent,
} from '@uniswap/sdk-core'
import { AddLiquidityOptions, NonfungiblePositionManager, Pool, Position } from '@uniswap/v3-sdk'
import invariant from 'tiny-invariant'
import { DEFAULT_LP_SLIPPAGE_TOLERANCE } from './constants'
import { LpGasEstimateTransaction, TokenAllowanceInput } from './types'
import { erc20ApprovalTransactions } from './utils/approvals'

export interface V3AddLiquidityGasEstimateParams {
  /**
   * The pool to add liquidity to, carrying current price, liquidity, and tick.
   */
  pool: Pool
  tickLower: number
  tickUpper: number
  /**
   * The side of the pool the estimate is driven by, typically the output of
   * {@link pickPreEstimateIndependentAmount}. The other side's amount is derived
   * from the pool price and the tick range. May be a native currency amount.
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
   * Whether to prepend pool creation/initialization to the mint call.
   */
  createPool?: boolean
  /**
   * Spend native currency (one pool token must be its wrapped form). Defaults to the
   * independent amount's currency when that is native.
   */
  useNative?: NativeCurrency
  /**
   * Defaults to {@link DEFAULT_LP_SLIPPAGE_TOLERANCE}.
   */
  slippageTolerance?: Percent
  /**
   * When the transaction expires, in epoch seconds.
   */
  deadline: BigintIsh
  /**
   * Allowance state of pool.token0 for the position manager. Zero allowance is
   * assumed when omitted, yielding the worst-case estimate.
   */
  token0?: TokenAllowanceInput
  /**
   * Allowance state of pool.token1 for the position manager.
   */
  token1?: TokenAllowanceInput
}

/**
 * Returns the ordered list of transactions a wallet must send to create or increase a
 * Uniswap v3 position, for use with `eth_estimateGas`: any required ERC-20 approvals
 * to the NonfungiblePositionManager, followed by the mint/increase transaction itself.
 *
 * The position transaction is encoded with `NonfungiblePositionManager.addCallParameters`,
 * so the calldata matches what standard SDK consumers (including the Uniswap Labs
 * liquidity service) produce for the transaction users actually sign.
 */
export function getV3AddLiquidityGasEstimateTransactions(
  params: V3AddLiquidityGasEstimateParams
): LpGasEstimateTransaction[] {
  const { pool, tickLower, tickUpper, independentAmount, recipient, tokenId, createPool, deadline } = params

  const positionManagerAddress: string | undefined = NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[pool.chainId]
  invariant(positionManagerAddress !== undefined, 'NO_POSITION_MANAGER_ON_CHAIN')

  const useNative =
    params.useNative ??
    (independentAmount.currency.isNative ? (independentAmount.currency as NativeCurrency) : undefined)

  const wrappedIndependent = independentAmount.wrapped
  let position: Position
  if (wrappedIndependent.currency.equals(pool.token0)) {
    position = Position.fromAmount0({
      pool,
      tickLower,
      tickUpper,
      amount0: wrappedIndependent.quotient,
      useFullPrecision: true,
    })
  } else {
    invariant(wrappedIndependent.currency.equals(pool.token1), 'INDEPENDENT_NOT_IN_POOL')
    position = Position.fromAmount1({ pool, tickLower, tickUpper, amount1: wrappedIndependent.quotient })
  }

  const slippageTolerance = params.slippageTolerance ?? DEFAULT_LP_SLIPPAGE_TOLERANCE
  let options: AddLiquidityOptions
  if (tokenId !== undefined) {
    options = { tokenId, slippageTolerance, deadline, useNative }
  } else {
    invariant(recipient !== undefined, 'NO_RECIPIENT')
    options = { recipient, createPool, slippageTolerance, deadline, useNative }
  }
  const { calldata, value } = NonfungiblePositionManager.addCallParameters(position, options)

  // v3 pulls at most the desired amounts (mintAmounts); its mintAmountsWithSlippage
  // are lower-bound minimums, so mintAmounts is the correct approval threshold
  const { amount0, amount1 } = position.mintAmounts
  const transactions: LpGasEstimateTransaction[] = []
  if (!useNative?.wrapped.equals(pool.token0)) {
    transactions.push(...erc20ApprovalTransactions(pool.token0.address, amount0, positionManagerAddress, params.token0))
  }
  if (!useNative?.wrapped.equals(pool.token1)) {
    transactions.push(...erc20ApprovalTransactions(pool.token1.address, amount1, positionManagerAddress, params.token1))
  }
  transactions.push({ to: positionManagerAddress, calldata, value })
  return transactions
}
