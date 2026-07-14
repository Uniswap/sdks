import { BigintIsh } from '@uniswap/sdk-core'

/**
 * A transaction to include in a gas-estimation batch.
 *
 * The SDK never talks to the chain: callers run `eth_estimateGas` over the returned
 * list (in order, from the position owner's address) with their own client and sum
 * the results to get the full cost of the flow.
 */
export interface LpGasEstimateTransaction {
  to: string
  calldata: string
  value: string
}

/**
 * The caller-provided allowance state for one pool token. All fields are optional:
 * when omitted the token is assumed to have zero allowance, which yields the
 * worst-case (most transactions) estimate.
 */
export interface TokenAllowanceInput {
  /**
   * Current ERC-20 allowance granted by the wallet to the relevant spender
   * (v2 router / v3 position manager / Permit2 for v4). Assumed 0 when omitted.
   */
  allowance?: BigintIsh
  /**
   * USDT-style tokens revert on approve when the current allowance is non-zero, so
   * they need an approve(0) reset transaction first. Only relevant when `allowance`
   * is non-zero but insufficient.
   */
  requiresReset?: boolean
}

/**
 * Allowance state for one pool token in a v4 flow, which pulls funds through Permit2.
 */
export interface Permit2AllowanceInput extends TokenAllowanceInput {
  /**
   * Current Permit2 allowance (token -> position manager) for the wallet. Assumed
   * absent when omitted. The allowance counts as active when `amount` covers the
   * required amount and `expiration` is at or after the flow's `deadline`.
   */
  permit2Allowance?: {
    amount: BigintIsh
    expiration: BigintIsh
  }
}
