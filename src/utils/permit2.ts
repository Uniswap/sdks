import { ethers } from 'ethers'
import { PermitSingle } from '@uniswap/permit2-sdk'
import { CommandType, RoutePlanner } from './routerCommands'
import PERMIT2_COMPILE from '../../out/Permit2.sol/Permit2.json'

export interface Permit2Permit extends PermitSingle {
  signature: string
}

const PERMIT_SIGNATURE = 'permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)'

const PERMIT2_INTERFACE = new ethers.utils.Interface(PERMIT2_COMPILE.abi)

export function encodePermit(planner: RoutePlanner, permit: Permit2Permit): void {
  const calldata = PERMIT2_INTERFACE.encodeFunctionData(PERMIT_SIGNATURE, [
    ethers.constants.AddressZero,
    permit,
    permit.signature,
  ])

  planner.addCommand(CommandType.PERMIT, ['0x' + calldata.slice(74)])
}
