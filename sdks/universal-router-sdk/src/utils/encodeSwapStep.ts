import { V4Planner, URVersion } from '@uniswap/v4-sdk'
import { RoutePlanner, CommandType } from './routerCommands'
import { SwapStep } from '../types/encodeSwaps'
import { v4ActionToParams } from './encodeV4Action'

/**
 * Encodes a single SwapStep into the RoutePlanner.
 * Maps typed SwapStep discriminated union to the correct CommandType and params.
 */
export function encodeSwapStep(
  planner: RoutePlanner,
  step: SwapStep,
  urVersion: URVersion = URVersion.V2_0
): void {
  switch (step.type) {
    case 'V2_SWAP_EXACT_IN':
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
        step.recipient,
        step.amountIn,
        step.amountOutMin,
        step.path,
        step.payerIsUser,
      ])
      break

    case 'V2_SWAP_EXACT_OUT':
      planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
        step.recipient,
        step.amountOut,
        step.amountInMax,
        step.path,
        step.payerIsUser,
      ])
      break

    case 'V3_SWAP_EXACT_IN':
      planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
        step.recipient,
        step.amountIn,
        step.amountOutMin,
        step.path,
        step.payerIsUser,
      ])
      break

    case 'V3_SWAP_EXACT_OUT':
      planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [
        step.recipient,
        step.amountOut,
        step.amountInMax,
        step.path,
        step.payerIsUser,
      ])
      break

    case 'V4_SWAP': {
      const v4Planner = new V4Planner()
      for (const v4Action of step.v4Actions) {
        const { action, params } = v4ActionToParams(v4Action, urVersion)
        v4Planner.addAction(action, params, urVersion)
      }
      planner.addCommand(CommandType.V4_SWAP, [v4Planner.finalize()])
      break
    }

    case 'WRAP_ETH':
      planner.addCommand(CommandType.WRAP_ETH, [step.recipient, step.amount])
      break

    case 'UNWRAP_WETH':
      planner.addCommand(CommandType.UNWRAP_WETH, [step.recipient, step.amountMin])
      break

    default:
      throw new Error(`Unknown swap step type: ${(step as any).type}`)
  }
}
