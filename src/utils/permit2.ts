import { PermitSingle } from '@uniswap/permit2-sdk'
import { CommandType, RoutePlanner } from './routerCommands'

export interface Permit2Permit extends PermitSingle {
  signature: string
}

export function encodePermit(planner: RoutePlanner, permit: Permit2Permit): void {
  planner.addCommand(CommandType.PERMIT, [permit, permit.signature])
}
