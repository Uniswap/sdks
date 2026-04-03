import { V4Planner } from '@uniswap/v4-sdk'
import { UniversalRouterVersion, isAtLeastV2_1_1 } from './constants'
import { CommandType, RoutePlanner } from './routerCommands'
import { SwapStep } from '../types/encodeSwaps'
import { encodeV4Action, toV4URVersion } from './encodeV4Action'

export function encodeSwapStep(planner: RoutePlanner, step: SwapStep, urVersion?: UniversalRouterVersion): void {
  const useV2_1_1 = isAtLeastV2_1_1(urVersion)

  switch (step.type) {
    case 'V2_SWAP_EXACT_IN': {
      const params: any[] = [step.recipient, step.amountIn, step.amountOutMin, step.path, false]
      if (useV2_1_1) params.push(step.maxHopSlippage ?? [])
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, params, false, urVersion)
      return
    }
    case 'V2_SWAP_EXACT_OUT': {
      const params: any[] = [step.recipient, step.amountOut, step.amountInMax, step.path, false]
      if (useV2_1_1) params.push(step.maxHopSlippage ?? [])
      planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, params, false, urVersion)
      return
    }
    case 'V3_SWAP_EXACT_IN': {
      const params: any[] = [step.recipient, step.amountIn, step.amountOutMin, step.path, false]
      if (useV2_1_1) params.push(step.maxHopSlippage ?? [])
      planner.addCommand(CommandType.V3_SWAP_EXACT_IN, params, false, urVersion)
      return
    }
    case 'V3_SWAP_EXACT_OUT': {
      const params: any[] = [step.recipient, step.amountOut, step.amountInMax, step.path, false]
      if (useV2_1_1) params.push(step.maxHopSlippage ?? [])
      planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, params, false, urVersion)
      return
    }
    case 'V4_SWAP': {
      const v4Planner = new V4Planner()

      for (const v4Action of step.v4Actions) {
        const encoded = encodeV4Action(v4Action, urVersion)
        v4Planner.addAction(encoded.action, encoded.params, toV4URVersion(urVersion))
      }

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.finalize()], false, urVersion)
      return
    }
    case 'WRAP_ETH':
      planner.addCommand(CommandType.WRAP_ETH, [step.recipient, step.amount], false, urVersion)
      return
    case 'UNWRAP_WETH':
      planner.addCommand(CommandType.UNWRAP_WETH, [step.recipient, step.amountMin], false, urVersion)
      return
    default:
      throw new Error(`Unknown swap step type: ${(step as { type: string }).type}`)
  }
}
