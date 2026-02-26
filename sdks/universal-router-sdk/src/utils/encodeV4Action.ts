import { Actions, URVersion } from '@uniswap/v4-sdk'
import { V4Action } from '../types/encodeSwaps'

// Derive name→enum mapping from Actions enum (numeric enums have reverse mappings,
// so filter to only the string keys). Stays in sync when v4-sdk adds new actions.
const ACTION_NAME_TO_ENUM: { [key: string]: Actions } = Object.fromEntries(
  Object.entries(Actions).filter(([key]) => isNaN(Number(key)))
) as { [key: string]: Actions }

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
    case 'SWAP_EXACT_IN':
      return {
        action,
        params: [{
          currencyIn: v4Action.currencyIn,
          path: v4Action.path,
          amountIn: v4Action.amountIn,
          amountOutMinimum: v4Action.amountOutMinimum,
          ...(urVersion === URVersion.V2_1 && { maxHopSlippage: v4Action.maxHopSlippage ?? [] }),
        }],
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
    case 'SWAP_EXACT_OUT':
      return {
        action,
        params: [{
          currencyOut: v4Action.currencyOut,
          path: v4Action.path,
          amountOut: v4Action.amountOut,
          amountInMaximum: v4Action.amountInMaximum,
          ...(urVersion === URVersion.V2_1 && { maxHopSlippage: v4Action.maxHopSlippage ?? [] }),
        }],
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
      return { action, params: [v4Action.currency, v4Action.amount, false] }
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
