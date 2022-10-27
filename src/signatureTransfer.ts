import { defaultAbiCoder } from '@ethersproject/abi'
import { keccak256 } from '@ethersproject/keccak256'
import { toUtf8Bytes } from '@ethersproject/strings'

export interface Witness {
  witness: string
  witnessTypeName: string
  witnessType: string
}

export interface PermitTransfer {
  token: string
  spender: string
  signedAmount: string
  nonce: string
  deadline: string
  witness?: Witness
}

export interface PermitBatchTransfer {
  tokens: string[]
  spender: string
  signedAmounts: string[]
  nonce: string
  deadline: string
  witness?: Witness
}

function isPermitTransfer(permit: PermitTransfer | PermitBatchTransfer): permit is PermitTransfer {
  return typeof (permit as PermitTransfer).token === 'string'
}

export abstract class SignatureTransfer {
  public static readonly _PERMIT_TYPEHASH = '0xc262c81437d10e77733d4856afeb901aafea41ef8a375a833df86061f7e69bb0'

  public static readonly _PERMIT_BATCH_TYPEHASH = '0x73e4ce378d8ac1888c7dc48a4acaca95db90a4623708bb440e2743b49fbd3c7a'

  public static readonly _PERMIT_TRANSFER_TYPEHASH =
    '0x15c180f14ea833a017e3afffacc6e6fbf366fd0bae34a27f66cfec970f272fa2'

  public static readonly _PERMIT_BATCH_TRANSFER_TYPEHASH =
    '0x62e35962f5e5b9a8756d8f7f39f30beb4680c353ed51ea60ab5ec7a9028e0495'

  public static readonly _PERMIT_TRANSFER_WITNESS_TYPEHASH_STUB =
    'PermitWitnessTransferFrom(address token,address spender,uint256 maxAmount,uint256 nonce,uint256 deadline,'

  public static readonly _PERMIT_BATCH_WITNESS_TRANSFER_TYPEHASH_STUB =
    'PermitBatchWitnessTransferFrom(address[] tokens,address spender,uint256[] maxAmounts,uint256 nonce,uint256 deadline,'

  /**
   * Cannot be constructed.
   */
  private constructor() {}

  private static encodePackedDynamicArray(values: string[], solidityType: 'address' | 'uint256'): string {
    return defaultAbiCoder.encode(new Array<string>(values.length).fill(solidityType), values)
  }

  public static hash(permit: PermitTransfer | PermitBatchTransfer): string {
    if (isPermitTransfer(permit)) {
      if (permit.witness) {
        const typeHash = keccak256(
          toUtf8Bytes(
            `${this._PERMIT_TRANSFER_WITNESS_TYPEHASH_STUB}${permit.witness.witnessTypeName} witness)${permit.witness.witnessType}`
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
              this._PERMIT_TRANSFER_TYPEHASH,
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
            `${this._PERMIT_BATCH_WITNESS_TRANSFER_TYPEHASH_STUB}${permit.witness.witnessTypeName} witness)${permit.witness.witnessType}`
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
              this._PERMIT_BATCH_TRANSFER_TYPEHASH,
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
