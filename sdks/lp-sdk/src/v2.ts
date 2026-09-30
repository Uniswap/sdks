import { Interface } from '@ethersproject/abi'
import {
  BigintIsh,
  Currency,
  CurrencyAmount,
  Fraction,
  NativeCurrency,
  Percent,
  Token,
  V2_ROUTER_ADDRESSES,
} from '@uniswap/sdk-core'
import { Pair } from '@uniswap/v2-sdk'
import { toHex } from '@uniswap/v3-sdk'
import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { DEFAULT_LP_SLIPPAGE_TOLERANCE } from './constants'
import { LpGasEstimateTransaction, TokenAllowanceInput } from './types'
import { erc20ApprovalTransactions } from './utils/approvals'

const ONE = new Fraction(1, 1)
const ZERO_VALUE = '0x00'

const V2_ROUTER_INTERFACE = new Interface([
  'function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256, uint256, uint256)',
  'function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable returns (uint256, uint256, uint256)',
])

function minimumAmount(amount: CurrencyAmount<Token>, slippageTolerance: Percent): JSBI {
  return slippageTolerance.greaterThan(0) ? amount.multiply(ONE.subtract(slippageTolerance)).quotient : amount.quotient
}

export interface V2AddLiquidityGasEstimateParams {
  /**
   * The pair to add liquidity to, constructed with its current reserves.
   */
  pair: Pair
  /**
   * The side of the pair the estimate is driven by, typically the output of
   * {@link pickPreEstimateIndependentAmount}. The other side's amount is quoted from
   * the pair reserves. May be a native currency amount.
   */
  independentAmount: CurrencyAmount<Currency>
  /**
   * Overrides the reserve-derived dependent amount. Required when the pair has no
   * liquidity to quote against.
   */
  dependentAmount?: CurrencyAmount<Currency>
  /**
   * The account that receives the LP tokens.
   */
  recipient: string
  /**
   * Spend native currency via addLiquidityETH (one pair token must be its wrapped
   * form). Defaults to the independent amount's currency when that is native.
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
   * Allowance state of pair.token0 for the v2 router. Zero allowance is assumed when
   * omitted, yielding the worst-case estimate.
   */
  token0?: TokenAllowanceInput
  /**
   * Allowance state of pair.token1 for the v2 router.
   */
  token1?: TokenAllowanceInput
}

/**
 * Returns the ordered list of transactions a wallet must send to add liquidity to a
 * Uniswap v2 pair, for use with `eth_estimateGas`: any required ERC-20 approvals to
 * the v2 router, followed by the addLiquidity/addLiquidityETH transaction itself.
 *
 * v2 has no position NFT, so the same call covers both creating and increasing a
 * position. The calldata mirrors what the Uniswap Labs liquidity service produces for
 * the transaction users actually sign.
 */
export function getV2AddLiquidityGasEstimateTransactions(
  params: V2AddLiquidityGasEstimateParams
): LpGasEstimateTransaction[] {
  const { pair, independentAmount, recipient, deadline } = params

  const routerAddress: string | undefined = V2_ROUTER_ADDRESSES[pair.chainId]
  invariant(routerAddress !== undefined, 'NO_ROUTER_ON_CHAIN')

  const useNative =
    params.useNative ??
    (independentAmount.currency.isNative ? (independentAmount.currency as NativeCurrency) : undefined)

  const wrappedIndependent = independentAmount.wrapped
  const independentIsToken0 = wrappedIndependent.currency.equals(pair.token0)
  invariant(independentIsToken0 || wrappedIndependent.currency.equals(pair.token1), 'INDEPENDENT_NOT_IN_PAIR')

  const wrappedDependent =
    params.dependentAmount?.wrapped ?? pair.priceOf(wrappedIndependent.currency).quote(wrappedIndependent)
  const amount0 = independentIsToken0 ? wrappedIndependent : wrappedDependent
  const amount1 = independentIsToken0 ? wrappedDependent : wrappedIndependent

  const slippageTolerance = params.slippageTolerance ?? DEFAULT_LP_SLIPPAGE_TOLERANCE
  const amount0Min = minimumAmount(amount0, slippageTolerance)
  const amount1Min = minimumAmount(amount1, slippageTolerance)

  let calldata: string
  let value: string
  if (useNative) {
    const nativeIsToken0 = useNative.wrapped.equals(pair.token0)
    invariant(nativeIsToken0 || useNative.wrapped.equals(pair.token1), 'NATIVE_NOT_IN_PAIR')
    const tokenAmount = nativeIsToken0 ? amount1 : amount0
    const nativeAmount = nativeIsToken0 ? amount0 : amount1
    calldata = V2_ROUTER_INTERFACE.encodeFunctionData('addLiquidityETH', [
      tokenAmount.currency.address,
      tokenAmount.quotient.toString(),
      (nativeIsToken0 ? amount1Min : amount0Min).toString(),
      (nativeIsToken0 ? amount0Min : amount1Min).toString(),
      recipient,
      deadline.toString(),
    ])
    value = toHex(nativeAmount.quotient)
  } else {
    calldata = V2_ROUTER_INTERFACE.encodeFunctionData('addLiquidity', [
      pair.token0.address,
      pair.token1.address,
      amount0.quotient.toString(),
      amount1.quotient.toString(),
      amount0Min.toString(),
      amount1Min.toString(),
      recipient,
      deadline.toString(),
    ])
    value = ZERO_VALUE
  }

  const transactions: LpGasEstimateTransaction[] = []
  if (!useNative?.wrapped.equals(pair.token0)) {
    transactions.push(...erc20ApprovalTransactions(pair.token0.address, amount0.quotient, routerAddress, params.token0))
  }
  if (!useNative?.wrapped.equals(pair.token1)) {
    transactions.push(...erc20ApprovalTransactions(pair.token1.address, amount1.quotient, routerAddress, params.token1))
  }
  transactions.push({ to: routerAddress, calldata, value })
  return transactions
}
