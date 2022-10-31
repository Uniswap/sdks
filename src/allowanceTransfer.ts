import { defaultAbiCoder } from '@ethersproject/abi'
import { keccak256 } from '@ethersproject/keccak256'

export interface Permit {
  token: string
  spender: string
  amount: string
  expiration: string
  nonce: number
  sigDeadline: string
}

export interface PermitBatch {
  tokens: string[]
  spender: string
  amounts: string[]
  expirations: string[]
  nonce: number
  sigDeadline: string
}

function isPermit(permit: Permit | PermitBatch): permit is Permit {
  return typeof (permit as Permit).token === 'string'
}

export abstract class AllowanceTransfer {
  public static readonly _PERMIT_TYPEHASH = '0xc262c81437d10e77733d4856afeb901aafea41ef8a375a833df86061f7e69bb0'

  public static readonly _PERMIT_BATCH_TYPEHASH = '0x1d00f263ce5f44712241eac8e0b65b8276dadd1536ae5679879126f4d4c2d653'

  /**
   * Cannot be constructed.
   */
  private constructor() {}

  private static encodePackedDynamicArray(values: string[], solidityType: 'address' | 'uint160' | 'uint64'): string {
    return defaultAbiCoder.encode(new Array<string>(values.length).fill(solidityType), values)
  }

  public static hash(permit: Permit | PermitBatch): string {
    if (isPermit(permit)) {
      return keccak256(
        defaultAbiCoder.encode(
          ['bytes32', 'address', 'address', 'uint160', 'uint64', 'uint32', 'uint256'],
          [
            this._PERMIT_TYPEHASH,
            permit.token,
            permit.spender,
            permit.amount,
            permit.expiration,
            permit.nonce,
            permit.sigDeadline,
          ]
        )
      )
    } else {
      return keccak256(
        defaultAbiCoder.encode(
          ['bytes32', 'bytes32', 'address', 'bytes32', 'bytes32', 'uint32', 'uint256'],
          [
            this._PERMIT_BATCH_TYPEHASH,
            keccak256(AllowanceTransfer.encodePackedDynamicArray(permit.tokens, 'address')),
            permit.spender,
            keccak256(AllowanceTransfer.encodePackedDynamicArray(permit.amounts, 'uint160')),
            keccak256(AllowanceTransfer.encodePackedDynamicArray(permit.expirations, 'uint64')),
            permit.nonce,
            permit.sigDeadline,
          ]
        )
      )
    }
  }
}
