import { Actions, URVersion } from '@uniswap/v4-sdk'
import { V4Action, V4SwapExactIn, V4SwapExactOut } from '../types/encodeSwaps'

const ACTION_NAME_TO_ENUM: { [key: string]: Actions } = {
  SWAP_EXACT_IN_SINGLE: Actions.SWAP_EXACT_IN_SINGLE,
  SWAP_EXACT_IN: Actions.SWAP_EXACT_IN,
  SWAP_EXACT_OUT_SINGLE: Actions.SWAP_EXACT_OUT_SINGLE,
  SWAP_EXACT_OUT: Actions.SWAP_EXACT_OUT,
  SETTLE: Actions.SETTLE,
  SETTLE_ALL: Actions.SETTLE_ALL,
  SETTLE_PAIR: Actions.SETTLE_PAIR,
  TAKE: Actions.TAKE,
  TAKE_ALL: Actions.TAKE_ALL,
  TAKE_PORTION: Actions.TAKE_PORTION,
  TAKE_PAIR: Actions.TAKE_PAIR,
  CLOSE_CURRENCY: Actions.CLOSE_CURRENCY,
  SWEEP: Actions.SWEEP,
  UNWRAP: Actions.UNWRAP,
}

/**
 * Maps a typed V4Action to the (Actions enum, params[]) pair that V4Planner.addAction expects.
 */
export function v4ActionToParams(
  v4Action: V4Action,
  urVersion: URVersion = URVersion.V2_0
): { action: Actions; params: any[] } {
  const action = ACTION_NAME_TO_ENUM[v4Action.action]
  if (action === undefined) throw new Error(`Unknown V4 action: ${v4Action.action}`)

  switch (v4Action.action) {
    case 'SWAP_EXACT_IN': {
      const a = v4Action as V4SwapExactIn
      const struct: any = {
        currencyIn: a.currencyIn,
        path: a.path,
        amountIn: a.amountIn,
        amountOutMinimum: a.amountOutMinimum,
      }
      if (urVersion === URVersion.V2_1) {
        struct.maxHopSlippage = a.maxHopSlippage ?? []
      }
      return { action, params: [struct] }
    }
    case 'SWAP_EXACT_IN_SINGLE':
      return {
        action,
        params: [
          {
            poolKey: v4Action.poolKey,
            zeroForOne: v4Action.zeroForOne,
            amountIn: v4Action.amountIn,
            amountOutMinimum: v4Action.amountOutMinimum,
            hookData: v4Action.hookData,
          },
        ],
      }
    case 'SWAP_EXACT_OUT': {
      const a = v4Action as V4SwapExactOut
      const struct: any = {
        currencyOut: a.currencyOut,
        path: a.path,
        amountOut: a.amountOut,
        amountInMaximum: a.amountInMaximum,
      }
      if (urVersion === URVersion.V2_1) {
        struct.maxHopSlippage = a.maxHopSlippage ?? []
      }
      return { action, params: [struct] }
    }
    case 'SWAP_EXACT_OUT_SINGLE':
      return {
        action,
        params: [
          {
            poolKey: v4Action.poolKey,
            zeroForOne: v4Action.zeroForOne,
            amountOut: v4Action.amountOut,
            amountInMaximum: v4Action.amountInMaximum,
            hookData: v4Action.hookData,
          },
        ],
      }
    case 'SETTLE':
      return { action, params: [v4Action.currency, v4Action.amount, v4Action.payerIsUser] }
    case 'SETTLE_ALL':
      return { action, params: [v4Action.currency, v4Action.maxAmount] }
    case 'SETTLE_PAIR':
      return { action, params: [v4Action.currency0, v4Action.currency1] }
    case 'TAKE':
      return { action, params: [v4Action.currency, v4Action.recipient, v4Action.amount] }
    case 'TAKE_ALL':
      return { action, params: [v4Action.currency, v4Action.minAmount] }
    case 'TAKE_PORTION':
      return { action, params: [v4Action.currency, v4Action.recipient, v4Action.bips] }
    case 'TAKE_PAIR':
      return { action, params: [v4Action.currency0, v4Action.currency1, v4Action.recipient] }
    case 'CLOSE_CURRENCY':
      return { action, params: [v4Action.currency] }
    case 'SWEEP':
      return { action, params: [v4Action.currency, v4Action.recipient] }
    case 'UNWRAP':
      return { action, params: [v4Action.amount] }
    default:
      throw new Error(`Unhandled V4 action: ${(v4Action as any).action}`)
  }
}
