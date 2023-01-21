import { ethers } from 'ethers'
import { PermitSingle } from '@uniswap/permit2-sdk'
import { CommandType, RoutePlanner } from './routerCommands'

export interface Permit2Permit extends PermitSingle {
  signature: string
}

export function encodePermit(planner: RoutePlanner, permit: Permit2Permit): void {
  // sanitizes signature to cover edge cases like malformed EIP-2098 sigs and v used as recovery id
  const sanitizedSignature = ethers.utils.joinSignature(ethers.utils.splitSignature(permit.signature))
  planner.addCommand(CommandType.PERMIT, [permit, sanitizedSignature])
}
