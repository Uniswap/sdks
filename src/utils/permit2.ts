import { ethers } from 'ethers'
import { Token, BigintIsh } from '@uniswap/sdk-core'
import { CommandType, RoutePlanner } from './routerCommands'
import { NARWHAL_ADDRESS } from './constants'
import PERMIT2_COMPILE from '../../out/Permit2.sol/Permit2.json'

export interface Permit2Permit {
  v: 0 | 1 | 27 | 28
  r: string
  s: string
  nonce: BigintIsh
  amount: BigintIsh
  expiration: BigintIsh
  sigDeadline: BigintIsh
}

export interface PermitDetails {
  token: string
  amount: string
  expiration: string
  nonce: string
}

export interface PermitSingle {
  details: PermitDetails
  spender: string
  sigDeadline: string
}

const PERMIT_SIGNATURE = 'permit(address,((address,uint160,uint64,uint32),address,uint256),bytes)'

const PERMIT2_INTERFACE = new ethers.utils.Interface(PERMIT2_COMPILE.abi)

export function encodePermit(planner: RoutePlanner, permit: Permit2Permit, token: Token): void {
  const signature = ethers.utils.joinSignature({ v: permit.v, r: permit.r, s: permit.s })

  const calldata = PERMIT2_INTERFACE.encodeFunctionData(PERMIT_SIGNATURE, [
    ethers.constants.AddressZero,
    {
      details: {
        token: token.address,
        amount: permit.amount.toString(),
        expiration: permit.expiration.toString(),
        nonce: permit.nonce.toString(),
      },
      spender: NARWHAL_ADDRESS,
      sigDeadline: permit.sigDeadline,
    },
    signature,
  ])

  planner.addCommand(CommandType.PERMIT, ['0x' + calldata.slice(74)])
}
