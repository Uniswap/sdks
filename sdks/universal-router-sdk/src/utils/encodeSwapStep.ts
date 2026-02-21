import { V4Planner, URVersion } from '@uniswap/v4-sdk'
import { RoutePlanner, CommandType, COMMAND_DEFINITION, Parser } from './routerCommands'
import { SwapStep } from '../types/encodeSwaps'
import { v4ActionToParams } from './encodeV4Action'

// Derive step type string → CommandType mapping from enum.
// Stays in sync when new commands are added to CommandType.
const STEP_TYPE_TO_COMMAND: { [key: string]: CommandType } = Object.fromEntries(
  Object.entries(CommandType).filter(([key]) => isNaN(Number(key)))
) as { [key: string]: CommandType }

/**
 * Encodes a single SwapStep into the RoutePlanner.
 * Maps typed SwapStep discriminated union to the correct CommandType and params.
 *
 * For most commands, params are extracted automatically using COMMAND_DEFINITION
 * param names (which match SwapStep field names by convention).
 * V4_SWAP is handled specially since it requires V4Planner pre-encoding.
 */
export function encodeSwapStep(
  planner: RoutePlanner,
  step: SwapStep,
  urVersion: URVersion = URVersion.V2_0
): void {
  // V4_SWAP needs special handling: pre-encode via V4Planner
  if (step.type === 'V4_SWAP') {
    const v4Planner = new V4Planner()
    for (const v4Action of step.v4Actions) {
      const { action, params } = v4ActionToParams(v4Action, urVersion)
      v4Planner.addAction(action, params, urVersion)
    }
    planner.addCommand(CommandType.V4_SWAP, [v4Planner.finalize()])
    return
  }

  // For all other step types: derive CommandType and extract params from COMMAND_DEFINITION
  const commandType = STEP_TYPE_TO_COMMAND[step.type]
  if (commandType === undefined) throw new Error(`Unknown swap step type: ${step.type}`)

  const definition = COMMAND_DEFINITION[commandType]
  if (definition.parser !== Parser.Abi) throw new Error(`Unexpected parser for command: ${step.type}`)

  const params = definition.params.map((p) => (step as Record<string, unknown>)[p.name])
  planner.addCommand(commandType, params)
}
