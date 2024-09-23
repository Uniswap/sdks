import { BigintIsh } from '@uniswap/sdk-core'
import { Interface } from '@ethersproject/abi'

export interface ERC2612PermitOptions {
  v: 0 | 1 | 27 | 28
  r: string
  s: string
  owner: string
  spender: string
  amount: BigintIsh
  deadline: BigintIsh
}

const IERC2612PermitAbi = [
  'function permit(address owner, address spender, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s) external',
]

/**
 * Helper class to encode permit calls to ERC-2612 compliant tokens.
 */
export class ERC2612Permit {
  public static INTERFACE: Interface = new Interface(IERC2612PermitAbi)

  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static encodePermit(options: ERC2612PermitOptions) {
    return ERC2612Permit.INTERFACE.encodeFunctionData('permit', [
      options.owner,
      options.spender,
      options.amount,
      options.deadline,
      options.v,
      options.r,
      options.s,
    ])
  }
}
