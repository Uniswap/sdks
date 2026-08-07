import { Interface } from '@ethersproject/abi'
import { MaxAllowanceTransferAmount, permit2Address } from '@uniswap/permit2-sdk'
import { BigintIsh, MaxUint256 } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { LpGasEstimateTransaction, Permit2AllowanceInput, TokenAllowanceInput } from '../types'

const ZERO = JSBI.BigInt(0)
const ZERO_VALUE = '0x00'

const ERC20_INTERFACE = new Interface(['function approve(address spender, uint256 amount) external returns (bool)'])

const PERMIT2_INTERFACE = new Interface([
  'function approve(address token, address spender, uint160 amount, uint48 expiration) external',
])

function toJSBI(value: BigintIsh): JSBI {
  return JSBI.BigInt(value.toString())
}

function encodeErc20Approve(token: string, spender: string, amount: string): LpGasEstimateTransaction {
  return {
    to: token,
    calldata: ERC20_INTERFACE.encodeFunctionData('approve', [spender, amount]),
    value: ZERO_VALUE,
  }
}

/**
 * Returns the ERC-20 approval transactions required before `spender` can pull
 * `requiredAmount` of `token` from the wallet: an optional approve(0) reset for
 * USDT-style tokens followed by an approve(MaxUint256), or nothing when the current
 * allowance already covers the required amount. Approves the maximum to mirror the
 * transactions the Uniswap Labs liquidity service produces.
 */
export function erc20ApprovalTransactions(
  token: string,
  requiredAmount: JSBI,
  spender: string,
  input?: TokenAllowanceInput
): LpGasEstimateTransaction[] {
  const allowance = input?.allowance !== undefined ? toJSBI(input.allowance) : ZERO
  if (JSBI.greaterThanOrEqual(allowance, requiredAmount)) {
    return []
  }

  const transactions: LpGasEstimateTransaction[] = []
  if (input?.requiresReset && JSBI.greaterThan(allowance, ZERO)) {
    transactions.push(encodeErc20Approve(token, spender, '0'))
  }
  transactions.push(encodeErc20Approve(token, spender, MaxUint256.toString()))
  return transactions
}

/**
 * Returns the Permit2 approval transaction (Permit2.approve, granting `spender` an
 * allowance of `token`) required for a v4 flow, or none when the caller-provided
 * Permit2 allowance covers `requiredAmount` and does not expire before `deadline`.
 * The new approval uses Permit2's maximum amount and `deadline` as its expiration.
 */
export function permit2ApprovalTransactions(
  token: string,
  requiredAmount: JSBI,
  spender: string,
  chainId: number,
  deadline: BigintIsh,
  input?: Permit2AllowanceInput
): LpGasEstimateTransaction[] {
  const existing = input?.permit2Allowance
  if (
    existing &&
    JSBI.greaterThanOrEqual(toJSBI(existing.amount), requiredAmount) &&
    JSBI.greaterThanOrEqual(toJSBI(existing.expiration), toJSBI(deadline))
  ) {
    return []
  }

  return [
    {
      to: permit2Address(chainId),
      calldata: PERMIT2_INTERFACE.encodeFunctionData('approve', [
        token,
        spender,
        MaxAllowanceTransferAmount.toString(),
        deadline.toString(),
      ]),
      value: ZERO_VALUE,
    },
  ]
}
