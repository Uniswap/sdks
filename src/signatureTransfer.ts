import { defaultAbiCoder } from '@ethersproject/abi'
import { keccak256 } from '@ethersproject/keccak256'
import { toUtf8Bytes } from '@ethersproject/strings'

export interface Witness {
  witness: string
  witnessTypeName: string
  witnessType: string
}

export interface PermitTransferFrom {
  token: string
  spender: string
  signedAmount: string
  nonce: string
  deadline: string
  witness?: Witness
}

export interface PermitBatchTransferFrom {
  tokens: string[]
  spender: string
  signedAmounts: string[]
  nonce: string
  deadline: string
  witness?: Witness
}

function isPermitTransferFrom(permit: PermitTransferFrom | PermitBatchTransferFrom): permit is PermitTransferFrom {
  return typeof (permit as PermitTransferFrom).token === 'string'
}

export abstract class SignatureTransfer {
  public static readonly _PERMIT_TRANSFER_FROM_TYPEHASH =
    '0x10c9c9e59d752f2a5e0b80c4634ea94f13dfc2064f262172713603fd1e244d46'

  public static readonly _PERMIT_BATCH_TRANSFER_FROM_TYPEHASH =
    '0xb4e06c597d07f3cee806099cb9eef8888970e2ad5303164b6d2814f3a5362511'

  public static readonly _PERMIT_TRANSFER_FROM_WITNESS_TYPEHASH_STUB =
    'PermitWitnessTransferFrom(address token,address spender,uint256 signedAmount,uint256 nonce,uint256 deadline,'

  public static readonly _PERMIT_BATCH_WITNESS_TRANSFER_FROM_TYPEHASH_STUB =
    'PermitBatchWitnessTransferFrom(address[] tokens,address spender,uint256[] signedAmounts,uint256 nonce,uint256 deadline,'

  /**
   * Cannot be constructed.
   */
  private constructor() {}

  private static encodePackedDynamicArray(values: string[], solidityType: 'address' | 'uint256'): string {
    return defaultAbiCoder.encode(new Array<string>(values.length).fill(solidityType), values)
  }

  public static hash(permit: PermitTransferFrom | PermitBatchTransferFrom): string {
    if (isPermitTransferFrom(permit)) {
      if (permit.witness) {
        const typeHash = keccak256(
          toUtf8Bytes(
            `${this._PERMIT_TRANSFER_FROM_WITNESS_TYPEHASH_STUB}${permit.witness.witnessTypeName} witness)${permit.witness.witnessType}`
          )
        )
        return keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32'],
            [
              typeHash,
              permit.token,
              permit.spender,
              permit.signedAmount,
              permit.nonce,
              permit.deadline,
              permit.witness.witness,
            ]
          )
        )
      } else {
        return keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
            [
              this._PERMIT_TRANSFER_FROM_TYPEHASH,
              permit.token,
              permit.spender,
              permit.signedAmount,
              permit.nonce,
              permit.deadline,
            ]
          )
        )
      }
    } else {
      if (permit.witness) {
        const typeHash = keccak256(
          toUtf8Bytes(
            `${this._PERMIT_BATCH_WITNESS_TRANSFER_FROM_TYPEHASH_STUB}${permit.witness.witnessTypeName} witness)${permit.witness.witnessType}`
          )
        )
        return keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'bytes32', 'address', 'bytes32', 'uint256', 'uint256', 'bytes32'],
            [
              typeHash,
              keccak256(SignatureTransfer.encodePackedDynamicArray(permit.tokens, 'address')),
              permit.spender,
              keccak256(SignatureTransfer.encodePackedDynamicArray(permit.signedAmounts, 'uint256')),
              permit.nonce,
              permit.deadline,
              permit.witness.witness,
            ]
          )
        )
      } else {
        return keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'bytes32', 'address', 'bytes32', 'uint256', 'uint256'],
            [
              this._PERMIT_BATCH_TRANSFER_FROM_TYPEHASH,
              keccak256(SignatureTransfer.encodePackedDynamicArray(permit.tokens, 'address')),
              permit.spender,
              keccak256(SignatureTransfer.encodePackedDynamicArray(permit.signedAmounts, 'uint256')),
              permit.nonce,
              permit.deadline,
            ]
          )
        )
      }
    }
  }
}
