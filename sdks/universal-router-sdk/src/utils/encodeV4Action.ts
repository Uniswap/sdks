import { Actions, URVersion } from '@uniswap/v4-sdk'
import { UniversalRouterVersion, isAtLeastV2_1_1 } from './constants'
import { V4Action } from '../types/encodeSwaps'

const ACTION_NAME_TO_ENUM: { [key: string]: Actions } = Object.fromEntries(
  Object.entries(Actions).filter(([key]) => isNaN(Number(key)))
) as { [key: string]: Actions }

const V4_UR_VERSION_MAP: Record<string, URVersion> = {
  [UniversalRouterVersion.V2_0]: URVersion.V2_0,
  [UniversalRouterVersion.V2_1_1]: URVersion.V2_1_1,
}

export function toV4URVersion(version?: UniversalRouterVersion): URVersion {
  if (version === undefined) return URVersion.V2_0
  const mapped = V4_UR_VERSION_MAP[version]
  if (!mapped) throw new Error(`No v4-sdk URVersion mapping for UniversalRouterVersion: ${version}`)
  return mapped
}

export function encodeV4Action(
  v4Action: V4Action,
  urVersion?: UniversalRouterVersion
): { action: Actions; params: any[] } {
  const action = ACTION_NAME_TO_ENUM[v4Action.action]
  if (action === undefined) throw new Error(`Unknown V4 action: ${v4Action.action}`)

  const useV2_1_1 = isAtLeastV2_1_1(urVersion)

  switch (v4Action.action) {
    case 'SWAP_EXACT_IN':
      return {
        action,
        params: [
          {
            currencyIn: v4Action.currencyIn,
            path: v4Action.path,
            ...(useV2_1_1 && { maxHopSlippage: v4Action.maxHopSlippage ?? [] }),
            amountIn: v4Action.amountIn,
            amountOutMinimum: v4Action.amountOutMinimum,
          },
        ],
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
            ...(useV2_1_1 && { maxHopSlippage: v4Action.maxHopSlippage ?? 0 }),
            hookData: v4Action.hookData,
          },
        ],
      }
    case 'SWAP_EXACT_OUT':
      return {
        action,
        params: [
          {
            currencyOut: v4Action.currencyOut,
            path: v4Action.path,
            ...(useV2_1_1 && { maxHopSlippage: v4Action.maxHopSlippage ?? [] }),
            amountOut: v4Action.amountOut,
            amountInMaximum: v4Action.amountInMaximum,
          },
        ],
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
            ...(useV2_1_1 && { maxHopSlippage: v4Action.maxHopSlippage ?? 0 }),
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
      throw new Error(`Unhandled V4 action: ${(v4Action as { action: string }).action}`)
  }
}
